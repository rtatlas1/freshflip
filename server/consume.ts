import type { Database } from "bun:sqlite";
import type { CookResult, InventoryItem } from "../shared/types";
import { getRecipe, listInventory } from "./db";
import { convert, formatQty } from "./units";

/**
 * Cook a recipe: decrement inventory FEFO (first-expire-first-out), so the
 * lots closest to going bad are the ones consumed. Lots whose units can't be
 * honestly converted to the recipe's unit are reported in `notAdjusted`
 * rather than guessed at.
 */
export function cook(
  db: Database,
  recipeId: number,
  multiplier = 1,
  today: Date = new Date(),
): CookResult {
  const recipe = getRecipe(db, recipeId);
  if (!recipe) throw new Error(`Recipe ${recipeId} not found`);
  if (!(multiplier > 0)) throw new Error("Multiplier must be positive");

  const usable = listInventory(db, today).filter(
    (it) => it.status !== "expired" && it.quantity > 0,
  );
  // FEFO: earliest expiry first; undated lots last.
  const lotsByIngredient = new Map<number, InventoryItem[]>();
  for (const it of usable) {
    const list = lotsByIngredient.get(it.ingredientId) ?? [];
    list.push(it);
    lotsByIngredient.set(it.ingredientId, list);
  }
  for (const lots of lotsByIngredient.values()) {
    lots.sort((a, b) => {
      if (a.expiresOn === null && b.expiresOn === null) return 0;
      if (a.expiresOn === null) return 1;
      if (b.expiresOn === null) return -1;
      return a.expiresOn.localeCompare(b.expiresOn);
    });
  }

  const consumed: { ingredientName: string; amount: string }[] = [];
  const notAdjusted: string[] = [];
  const updates: { id: number; newQty: number }[] = [];
  let rescuedCount = 0;

  for (const ri of recipe.ingredients) {
    const lots = lotsByIngredient.get(ri.ingredientId) ?? [];
    if (lots.length === 0) continue; // nothing to decrement (maybe missing, maybe staple)
    if (ri.quantity == null || ri.unit == null) continue; // "to taste" — no bookkeeping

    let remaining = ri.quantity * multiplier;
    let consumedHere = 0;
    let sawIncompatibleLot = false;

    for (const lot of lots) {
      if (remaining <= 0) break;
      const lotInNeedUnit = convert(lot.quantity, lot.unit, ri.unit);
      if (lotInNeedUnit === null) {
        sawIncompatibleLot = true;
        continue;
      }
      const take = Math.min(lotInNeedUnit, remaining);
      const takeInLotUnit = convert(take, ri.unit, lot.unit)!;
      updates.push({ id: lot.id, newQty: lot.quantity - takeInLotUnit });
      remaining -= take;
      consumedHere += take;
      if (lot.status === "critical" || lot.status === "soon") rescuedCount++;
    }

    if (consumedHere > 0) {
      consumed.push({ ingredientName: ri.ingredientName, amount: formatQty(consumedHere, ri.unit) });
    }
    if (consumedHere === 0 && sawIncompatibleLot) {
      notAdjusted.push(ri.ingredientName);
    }
  }

  const update = db.prepare("UPDATE inventory SET quantity = ? WHERE id = ?");
  const remove = db.prepare("DELETE FROM inventory WHERE id = ?");
  const insertLog = db.prepare(
    `INSERT INTO cook_log (recipe_id, servings, consumed, rescued_count) VALUES (?, ?, ?, ?)`,
  );

  let cookId = 0;
  const tx = db.transaction(() => {
    for (const u of updates) {
      if (u.newQty <= 0.001) remove.run(u.id);
      else update.run(u.newQty, u.id);
    }
    insertLog.run(recipeId, recipe.servings * multiplier, JSON.stringify(consumed), rescuedCount);
    cookId = Number(
      (db.query("SELECT last_insert_rowid() AS id").get() as { id: number }).id,
    );
  });
  tx();

  return { cookId, recipeName: recipe.name, consumed, notAdjusted, rescuedCount };
}
