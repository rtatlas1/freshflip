import { beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { openDb, listInventory, getIngredientByName, listRecipes } from "./db";
import { seedCatalog, seedRecipes } from "./seed";
import { addDays, daysUntil, statusFor, todayIso, urgencyFor } from "./freshness";
import { convert, covers } from "./units";
import { recommend } from "./recommend";
import { cook } from "./consume";

// ---------- units ----------

describe("units", () => {
  test("converts within mass and volume", () => {
    expect(convert(1, "kg", "g")).toBe(1000);
    expect(convert(500, "ml", "l")).toBe(0.5);
    expect(convert(3, "tsp", "tbsp")).toBeCloseTo(1, 1);
  });

  test("refuses cross-dimension and cross-count conversions", () => {
    expect(convert(1, "kg", "ml")).toBeNull();
    expect(convert(1, "loaf", "slice")).toBeNull();
    expect(convert(2, "each", "each")).toBe(2);
    expect(convert(1, "nonsense", "g")).toBeNull();
  });

  test("covers answers honestly", () => {
    expect(covers(500, "g", 0.4, "kg")).toBe(true);
    expect(covers(300, "g", 0.4, "kg")).toBe(false);
    expect(covers(1, "loaf", 4, "slice")).toBeNull();
  });
});

// ---------- freshness ----------

describe("freshness", () => {
  test("status boundaries", () => {
    expect(statusFor(-1)).toBe("expired");
    expect(statusFor(0)).toBe("critical");
    expect(statusFor(1)).toBe("critical");
    expect(statusFor(2)).toBe("soon");
    expect(statusFor(3)).toBe("soon");
    expect(statusFor(4)).toBe("watch");
    expect(statusFor(7)).toBe("watch");
    expect(statusFor(8)).toBe("fresh");
    expect(statusFor(null)).toBe("fresh");
  });

  test("urgency: 1.0 today, 0 beyond window, 0 when expired", () => {
    expect(urgencyFor(0)).toBe(1);
    expect(urgencyFor(5)).toBeCloseTo(0.5);
    expect(urgencyFor(10)).toBe(0);
    expect(urgencyFor(-1)).toBe(0);
    expect(urgencyFor(null)).toBe(0);
  });

  test("date math is date-only", () => {
    const today = new Date(2026, 7, 31); // Aug 31 2026
    expect(daysUntil("2026-09-01", today)).toBe(1);
    expect(daysUntil("2026-08-31", today)).toBe(0);
    expect(daysUntil("2026-08-30", today)).toBe(-1);
    expect(addDays("2026-08-31", 3)).toBe("2026-09-03");
  });
});

// ---------- integration fixtures ----------

function freshDb(): Database {
  const db = openDb(":memory:");
  seedCatalog(db);
  seedRecipes(db);
  return db;
}

function addLot(
  db: Database,
  name: string,
  qty: number,
  unit: string,
  daysToExpiry: number | null,
  storage = "fridge",
) {
  const ing = getIngredientByName(db, name);
  if (!ing) throw new Error(`unknown ingredient ${name}`);
  const today = todayIso();
  db.prepare(
    `INSERT INTO inventory (ingredient_id, quantity, unit, storage, acquired_on, expires_on)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    ing.id,
    qty,
    unit,
    storage,
    today,
    daysToExpiry === null ? null : addDays(today, daysToExpiry),
  );
}

describe("seed integrity", () => {
  test("every recipe ingredient resolves against the catalog", () => {
    const db = freshDb(); // seedRecipes throws on a dangling reference
    const recipes = listRecipes(db);
    expect(recipes.length).toBeGreaterThanOrEqual(20);
    for (const r of recipes) {
      expect(r.ingredients.length).toBeGreaterThan(0);
      expect(r.instructions.length).toBeGreaterThan(0);
    }
  });
});

// ---------- recommendations ----------

describe("recommend", () => {
  test("recipes rescuing urgent items outrank pantry-only recipes", () => {
    const db = freshDb();
    // Everything for Creamy Mushroom Pasta, mushrooms + cream expiring NOW:
    addLot(db, "mushrooms", 300, "g", 0);
    addLot(db, "heavy cream", 200, "ml", 1);
    addLot(db, "dried pasta", 500, "g", null, "pantry");
    addLot(db, "garlic", 2, "each", null, "pantry");
    addLot(db, "parmesan", 100, "g", 30);
    addLot(db, "butter", 200, "g", 30);
    // Everything for Berry Yogurt Parfait, all comfortably fresh:
    addLot(db, "greek yogurt", 400, "g", 12);
    addLot(db, "strawberries", 200, "g", 12);
    addLot(db, "blueberries", 200, "g", 12);
    addLot(db, "rolled oats", 500, "g", null, "pantry");
    addLot(db, "honey", 300, "g", null, "pantry");

    const recs = recommend(db);
    const pasta = recs.find((r) => r.recipe.name === "Creamy Mushroom Pasta")!;
    const parfait = recs.find((r) => r.recipe.name === "Berry Yogurt Parfait")!;

    expect(pasta.readyToCook).toBe(true);
    expect(parfait.readyToCook).toBe(true);
    expect(pasta.score).toBeGreaterThan(parfait.score);
    expect(recs[0]!.recipe.name).toBe("Creamy Mushroom Pasta");
    // The urgent lots are surfaced as rescues, most urgent first:
    expect(pasta.rescues[0]!.ingredientName).toBe("mushrooms");
    expect(pasta.rescues[0]!.daysLeft).toBe(0);
  });

  test("missing required ingredients damp the score and set readyToCook=false", () => {
    const db = freshDb();
    // Mushroom pasta but WITHOUT cream or pasta:
    addLot(db, "mushrooms", 300, "g", 0);
    addLot(db, "garlic", 2, "each", null, "pantry");
    addLot(db, "parmesan", 100, "g", 30);
    addLot(db, "butter", 200, "g", 30);

    const recs = recommend(db);
    const pasta = recs.find((r) => r.recipe.name === "Creamy Mushroom Pasta")!;
    expect(pasta.readyToCook).toBe(false);
    expect(pasta.missing.map((m) => m.ingredientName).sort()).toEqual([
      "dried pasta",
      "heavy cream",
    ]);
    expect(pasta.coverage).toBeCloseTo(4 / 6);
  });

  test("expired lots are never counted as available", () => {
    const db = freshDb();
    addLot(db, "mushrooms", 300, "g", -2); // gone
    addLot(db, "heavy cream", 200, "ml", 5);
    addLot(db, "dried pasta", 500, "g", null, "pantry");
    addLot(db, "garlic", 2, "each", null, "pantry");
    addLot(db, "parmesan", 100, "g", 30);
    addLot(db, "butter", 200, "g", 30);

    const pasta = recommend(db).find((r) => r.recipe.name === "Creamy Mushroom Pasta")!;
    expect(pasta.readyToCook).toBe(false);
    expect(pasta.missing.map((m) => m.ingredientName)).toContain("mushrooms");
  });

  test("optional staples never block readyToCook", () => {
    const db = freshDb();
    // Avocado toast without lemons/chili/salt (all optional):
    addLot(db, "bread", 1, "loaf", 2, "pantry");
    addLot(db, "avocado", 2, "each", 1, "pantry");
    addLot(db, "eggs", 6, "each", 20);

    const toast = recommend(db).find((r) => r.recipe.name === "Avocado Toast with Jammy Eggs")!;
    expect(toast.readyToCook).toBe(true);
    expect(toast.coverage).toBe(1);
  });

  test("insufficient quantity is flagged but does not mark missing", () => {
    const db = freshDb();
    addLot(db, "mushrooms", 100, "g", 1); // recipe wants 300 g
    addLot(db, "heavy cream", 200, "ml", 5);
    addLot(db, "dried pasta", 500, "g", null, "pantry");
    addLot(db, "garlic", 2, "each", null, "pantry");
    addLot(db, "parmesan", 100, "g", 30);
    addLot(db, "butter", 200, "g", 30);

    const pasta = recommend(db).find((r) => r.recipe.name === "Creamy Mushroom Pasta")!;
    const mushrooms = pasta.matches.find((m) => m.ingredientName === "mushrooms")!;
    expect(mushrooms.have).toBe(true);
    expect(mushrooms.enough).toBe(false);
    expect(pasta.readyToCook).toBe(true); // you can stretch a recipe; we don't block
  });
});

// ---------- cooking / FEFO ----------

describe("cook", () => {
  test("decrements FEFO across lots and deletes emptied lots", () => {
    const db = freshDb();
    // Two mushroom lots: newer big lot + older small lot. Recipe needs 300 g.
    addLot(db, "mushrooms", 250, "g", 6); // fresher
    addLot(db, "mushrooms", 100, "g", 1); // most urgent — consumed first
    addLot(db, "heavy cream", 500, "ml", 5);
    addLot(db, "dried pasta", 500, "g", null, "pantry");
    addLot(db, "garlic", 5, "each", null, "pantry");
    addLot(db, "parmesan", 100, "g", 30);
    addLot(db, "butter", 200, "g", 30);

    const recipes = listRecipes(db);
    const pasta = recipes.find((r) => r.name === "Creamy Mushroom Pasta")!;
    const result = cook(db, pasta.id);

    const inv = listInventory(db);
    const mushroomLots = inv.filter((i) => i.ingredientName === "mushrooms");
    // Urgent 100 g lot fully consumed (deleted); fresher lot reduced 250 → 50.
    expect(mushroomLots.length).toBe(1);
    expect(mushroomLots[0]!.quantity).toBeCloseTo(50);
    expect(mushroomLots[0]!.daysLeft).toBe(6);

    const cream = inv.find((i) => i.ingredientName === "heavy cream")!;
    expect(cream.quantity).toBeCloseTo(300); // 500 - 200

    expect(result.rescuedCount).toBeGreaterThanOrEqual(1); // the 1-day mushroom lot
    expect(result.consumed.find((c) => c.ingredientName === "mushrooms")!.amount).toBe("300 g");
  });

  test("multiplier scales consumption", () => {
    const db = freshDb();
    addLot(db, "bread", 1, "loaf", 2, "pantry");
    addLot(db, "avocado", 4, "each", 1, "pantry");
    addLot(db, "eggs", 10, "each", 20);

    const toast = listRecipes(db).find((r) => r.name === "Avocado Toast with Jammy Eggs")!;
    cook(db, toast.id, 2); // recipe uses 2 avocados, 4 eggs

    const inv = listInventory(db);
    expect(inv.find((i) => i.ingredientName === "avocado")).toBeUndefined(); // 4 - 4
    expect(inv.find((i) => i.ingredientName === "eggs")!.quantity).toBe(2); // 10 - 8
  });

  test("unit-incompatible lots are reported, not guessed", () => {
    const db = freshDb();
    addLot(db, "bread", 1, "loaf", 2, "pantry"); // recipe wants slices
    addLot(db, "avocado", 2, "each", 1, "pantry");
    addLot(db, "eggs", 6, "each", 20);

    const toast = listRecipes(db).find((r) => r.name === "Avocado Toast with Jammy Eggs")!;
    const result = cook(db, toast.id);

    expect(result.notAdjusted).toContain("bread");
    expect(listInventory(db).find((i) => i.ingredientName === "bread")!.quantity).toBe(1);
  });

  test("expired lots are never consumed", () => {
    const db = freshDb();
    addLot(db, "avocado", 2, "each", -1, "pantry"); // expired
    addLot(db, "avocado", 2, "each", 3, "pantry"); // fine
    addLot(db, "bread", 1, "loaf", 2, "pantry");
    addLot(db, "eggs", 6, "each", 20);

    const toast = listRecipes(db).find((r) => r.name === "Avocado Toast with Jammy Eggs")!;
    cook(db, toast.id);

    const avocados = listInventory(db).filter((i) => i.ingredientName === "avocado");
    // Expired lot untouched; fresh lot fully used.
    expect(avocados.length).toBe(1);
    expect(avocados[0]!.status).toBe("expired");
    expect(avocados[0]!.quantity).toBe(2);
  });
});
