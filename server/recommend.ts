import type { Database } from "bun:sqlite";
import type {
  IngredientMatch,
  InventoryItem,
  Recipe,
  Recommendation,
} from "../shared/types";
import { listInventory, listRecipes } from "./db";
import { convert, formatQty } from "./units";

/**
 * The heart of freshflip: rank recipes by how much expiring food they rescue.
 *
 * Each matched ingredient contributes the urgency of its most-at-risk usable
 * lot (1.0 = expires today, fading to 0 over the flip window). The sum is then
 * damped by squared coverage, so a recipe you can actually cook tonight beats
 * one that rescues slightly more but needs a shopping trip.
 */
export function recommend(db: Database, today: Date = new Date()): Recommendation[] {
  const usable = listInventory(db, today).filter(
    (it) => it.status !== "expired" && it.quantity > 0,
  );
  const lotsByIngredient = new Map<number, InventoryItem[]>();
  for (const it of usable) {
    const list = lotsByIngredient.get(it.ingredientId) ?? [];
    list.push(it);
    lotsByIngredient.set(it.ingredientId, list);
  }

  return listRecipes(db)
    .map((r) => scoreRecipe(r, lotsByIngredient))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.readyToCook) - Number(a.readyToCook) ||
        b.coverage - a.coverage ||
        a.recipe.minutes - b.recipe.minutes,
    );
}

export function scoreRecipe(
  recipe: Recipe,
  lotsByIngredient: Map<number, InventoryItem[]>,
): Recommendation {
  const matches: IngredientMatch[] = recipe.ingredients.map((ri) => {
    const lots = lotsByIngredient.get(ri.ingredientId) ?? [];
    const have = lots.length > 0;

    let enough: boolean | null = have ? true : false;
    if (have && ri.quantity != null && ri.unit) {
      let total = 0;
      let comparable = true;
      for (const lot of lots) {
        const inNeedUnit = convert(lot.quantity, lot.unit, ri.unit);
        if (inNeedUnit === null) {
          comparable = false;
          break;
        }
        total += inNeedUnit;
      }
      enough = comparable ? total >= ri.quantity * 0.999 : null;
    }

    // The most urgent lot drives this ingredient's contribution — FEFO says
    // that's the lot the cook will actually reach for.
    let best: InventoryItem | null = null;
    for (const lot of lots) {
      if (!best || lot.urgency > best.urgency) best = lot;
    }

    return {
      ingredientId: ri.ingredientId,
      ingredientName: ri.ingredientName,
      optional: ri.optional,
      needed:
        ri.quantity != null && ri.unit ? formatQty(ri.quantity, ri.unit) : "to taste",
      have,
      enough,
      daysLeft: best?.daysLeft ?? null,
      status: best?.status ?? null,
      urgency: best?.urgency ?? 0,
    };
  });

  const required = matches.filter((m) => !m.optional);
  const matchedRequired = required.filter((m) => m.have);
  const coverage = required.length > 0 ? matchedRequired.length / required.length : 1;
  const missing = required.filter((m) => !m.have);

  const rescueScore = matches.reduce(
    (sum, m) => sum + (m.have ? m.urgency * (m.optional ? 0.5 : 1) : 0),
    0,
  );
  const score = rescueScore * coverage * coverage;

  const rescues = matches
    .filter((m) => m.have && m.urgency > 0)
    .sort((a, b) => b.urgency - a.urgency);

  return {
    recipe,
    score: Math.round(score * 1000) / 1000,
    coverage: Math.round(coverage * 1000) / 1000,
    readyToCook: missing.length === 0,
    missing,
    rescues,
    matches,
  };
}
