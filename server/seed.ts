import type { Database } from "bun:sqlite";
import { CATALOG } from "./catalog";
import { RECIPES } from "./recipes";
import { addDays, todayIso } from "./freshness";
import { openDb } from "./db";
import type { Storage } from "../shared/types";

export function seedCatalog(db: Database) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ingredients (name, category, default_unit, shelf_pantry, shelf_fridge, shelf_freezer)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const [name, category, unit, pantry, fridge, freezer] of CATALOG) {
      insert.run(name, category, unit, pantry, fridge, freezer);
    }
  });
  tx();
}

export function seedRecipes(db: Database) {
  const findIng = db.prepare("SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE");
  const insertRecipe = db.prepare(
    `INSERT OR IGNORE INTO recipes (name, description, minutes, servings, tags, instructions)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const findRecipe = db.prepare("SELECT id FROM recipes WHERE name = ?");
  const insertRI = db.prepare(
    `INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit, optional, prep)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const r of RECIPES) {
      insertRecipe.run(
        r.name,
        r.description,
        r.minutes,
        r.servings,
        JSON.stringify(r.tags),
        JSON.stringify(r.steps),
      );
      const recipeRow = findRecipe.get(r.name) as { id: number };
      for (const ing of r.ings) {
        const ingRow = findIng.get(ing.name) as { id: number } | null;
        if (!ingRow) {
          throw new Error(`Recipe "${r.name}" references unknown ingredient "${ing.name}"`);
        }
        insertRI.run(recipeRow.id, ingRow.id, ing.qty, ing.unit, ing.opt ? 1 : 0, ing.prep ?? null);
      }
    }
  });
  tx();
}

// Demo inventory: [ingredient, qty, unit, storage, daysUntilExpiry (null = far-off pantry)]
type DemoItem = [string, number, string, Storage, number | null];

const DEMO_INVENTORY: DemoItem[] = [
  // urgent — these drive tonight's flips
  ["salmon fillet", 300, "g", "fridge", 0],
  ["chicken breast", 500, "g", "fridge", 1],
  ["ground beef", 450, "g", "fridge", 1],
  ["spinach", 200, "g", "fridge", 1],
  ["asparagus", 1, "bunch", "fridge", 1],
  ["strawberries", 250, "g", "fridge", 1],
  ["fresh basil", 1, "bunch", "fridge", 1],
  ["heavy cream", 300, "ml", "fridge", 2],
  ["mushrooms", 350, "g", "fridge", 2],
  ["avocado", 2, "each", "pantry", 2],
  ["banana", 4, "each", "pantry", 2],
  ["pizza dough", 1, "each", "fridge", 2],
  ["bread", 1, "loaf", "pantry", 2],
  // this week
  ["romaine lettuce", 1, "each", "fridge", 3],
  ["tomatoes", 5, "each", "pantry", 3],
  ["cilantro", 1, "bunch", "fridge", 3],
  ["fresh mozzarella", 125, "g", "fridge", 4],
  ["milk", 1000, "ml", "fridge", 4],
  ["broccoli", 2, "each", "fridge", 4],
  ["scallions", 1, "bunch", "fridge", 4],
  ["zucchini", 2, "each", "fridge", 5],
  ["parsley", 1, "bunch", "fridge", 5],
  ["greek yogurt", 500, "g", "fridge", 5],
  ["bell pepper", 3, "each", "fridge", 6],
  ["tortillas", 8, "each", "fridge", 6],
  ["cucumber", 1, "each", "fridge", 7],
  // comfortable
  ["sour cream", 200, "g", "fridge", 8],
  ["blueberries", 125, "g", "fridge", 7],
  ["limes", 2, "each", "fridge", 12],
  ["feta", 150, "g", "fridge", 12],
  ["lemons", 3, "each", "fridge", 15],
  ["ginger", 1, "each", "fridge", 15],
  ["eggs", 10, "each", "fridge", 20],
  ["cheddar", 200, "g", "fridge", 20],
  ["carrots", 400, "g", "fridge", 18],
  ["celery", 1, "each", "fridge", 12],
  ["onion", 4, "each", "pantry", 25],
  ["potatoes", 6, "each", "pantry", 28],
  ["parmesan", 200, "g", "fridge", 45],
  ["butter", 250, "g", "fridge", 40],
  ["garlic", 2, "each", "pantry", 50],
  // freezer & pantry staples (no meaningful expiry pressure)
  ["shrimp", 300, "g", "freezer", 120],
  ["frozen peas", 400, "g", "freezer", 200],
  ["rice", 2000, "g", "pantry", null],
  ["arborio rice", 300, "g", "pantry", null],
  ["dried pasta", 1000, "g", "pantry", null],
  ["quinoa", 400, "g", "pantry", null],
  ["rolled oats", 500, "g", "pantry", null],
  ["flour", 1000, "g", "pantry", null],
  ["canned tomatoes", 3, "can", "pantry", null],
  ["coconut milk", 1, "can", "pantry", null],
  ["chickpeas", 2, "can", "pantry", null],
  ["chicken stock", 2000, "ml", "pantry", null],
  ["kalamata olives", 150, "g", "fridge", 60],
  ["soy sauce", 250, "ml", "pantry", null],
  ["olive oil", 750, "ml", "pantry", null],
  ["sesame oil", 100, "ml", "pantry", null],
  ["sriracha", 200, "ml", "fridge", null],
  ["mayonnaise", 300, "g", "fridge", 60],
  ["dijon mustard", 150, "g", "fridge", 90],
  ["honey", 250, "g", "pantry", null],
  // a couple already gone — exercises the "expired" path
  ["fresh dill", 1, "bunch", "fridge", -1],
  ["deli ham", 150, "g", "fridge", -2],
];

export function seedDemoInventory(db: Database, today: string = todayIso()) {
  const findIng = db.prepare("SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE");
  const insert = db.prepare(
    `INSERT INTO inventory (ingredient_id, quantity, unit, storage, acquired_on, expires_on)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction(() => {
    for (const [name, qty, unit, storage, days] of DEMO_INVENTORY) {
      const ing = findIng.get(name) as { id: number } | null;
      if (!ing) throw new Error(`Demo inventory references unknown ingredient "${name}"`);
      const expiresOn = days === null ? null : addDays(today, days);
      const acquiredOn = addDays(today, -2); // plausible shopping trip
      insert.run(ing.id, qty, unit, storage, acquiredOn, expiresOn);
    }
  });
  tx();
}

/** Seed catalog + recipes always; demo inventory only when inventory is empty. */
export function seedAll(db: Database, opts: { demo?: boolean } = {}) {
  seedCatalog(db);
  seedRecipes(db);
  const count = (db.query("SELECT COUNT(*) AS c FROM inventory").get() as { c: number }).c;
  if ((opts.demo ?? true) && count === 0) seedDemoInventory(db);
}

// CLI: `bun server/seed.ts --reset` wipes inventory + cook log and reseeds fresh demo data.
if (import.meta.main) {
  const db = openDb();
  if (process.argv.includes("--reset")) {
    db.exec("DELETE FROM cook_log; DELETE FROM inventory;");
    console.log("Cleared inventory and cook log.");
  }
  seedAll(db);
  const items = (db.query("SELECT COUNT(*) AS c FROM inventory").get() as { c: number }).c;
  const recipes = (db.query("SELECT COUNT(*) AS c FROM recipes").get() as { c: number }).c;
  console.log(`Seeded: ${recipes} recipes, ${items} inventory items.`);
}
