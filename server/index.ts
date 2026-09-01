import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Storage } from "../shared/types";
import {
  getIngredientByName,
  getInventoryItem,
  getRecipe,
  listIngredients,
  listInventory,
  listRecipes,
  openDb,
} from "./db";
import { addDays, todayIso } from "./freshness";
import { recommend, scoreRecipe } from "./recommend";
import { cook } from "./consume";
import { seedAll } from "./seed";
import { KNOWN_UNITS } from "./units";

const db = openDb();
seedAll(db);

const app = new Hono();
const STORAGES: Storage[] = ["pantry", "fridge", "freezer"];

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/ingredients", (c) => c.json(listIngredients(db)));

app.get("/api/units", (c) => c.json(KNOWN_UNITS));

app.get("/api/inventory", (c) => c.json(listInventory(db)));

app.post("/api/inventory", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const name = typeof body.ingredientName === "string" ? body.ingredientName.trim() : "";
  const quantity = Number(body.quantity);
  const unit = typeof body.unit === "string" ? body.unit.trim().toLowerCase() : "";
  const storage = body.storage as Storage;

  if (!name) return c.json({ error: "ingredientName is required" }, 400);
  if (!(quantity > 0)) return c.json({ error: "quantity must be a positive number" }, 400);
  if (!unit) return c.json({ error: "unit is required" }, 400);
  if (!STORAGES.includes(storage)) return c.json({ error: "storage must be pantry, fridge, or freezer" }, 400);

  let ingredient = getIngredientByName(db, name);
  if (!ingredient) {
    // Unknown ingredient: add it to the catalog so the kitchen can track anything.
    db.prepare(
      "INSERT INTO ingredients (name, category, default_unit) VALUES (?, 'other', ?)",
    ).run(name, unit);
    ingredient = getIngredientByName(db, name)!;
  }

  const acquiredOn =
    typeof body.acquiredOn === "string" && body.acquiredOn ? body.acquiredOn : todayIso();
  let expiresOn: string | null =
    typeof body.expiresOn === "string" && body.expiresOn ? body.expiresOn : null;
  if (!expiresOn) {
    const shelf = ingredient.shelfLife[storage];
    expiresOn = shelf != null ? addDays(acquiredOn, shelf) : null;
  }

  const res = db
    .prepare(
      `INSERT INTO inventory (ingredient_id, quantity, unit, storage, acquired_on, expires_on, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      ingredient.id,
      quantity,
      unit,
      storage,
      acquiredOn,
      expiresOn,
      typeof body.notes === "string" && body.notes ? body.notes : null,
    );

  return c.json(getInventoryItem(db, Number(res.lastInsertRowid)), 201);
});

app.patch("/api/inventory/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const item = getInventoryItem(db, id);
  if (!item) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const quantity = body.quantity !== undefined ? Number(body.quantity) : item.quantity;
  if (!(quantity >= 0)) return c.json({ error: "quantity must be >= 0" }, 400);
  const storage = body.storage !== undefined ? body.storage : item.storage;
  if (!STORAGES.includes(storage)) return c.json({ error: "invalid storage" }, 400);
  const expiresOn = body.expiresOn !== undefined ? body.expiresOn || null : item.expiresOn;
  const notes = body.notes !== undefined ? body.notes || null : item.notes;

  if (quantity === 0) {
    db.prepare("DELETE FROM inventory WHERE id = ?").run(id);
    return c.json({ deleted: true });
  }
  db.prepare(
    "UPDATE inventory SET quantity = ?, storage = ?, expires_on = ?, notes = ? WHERE id = ?",
  ).run(quantity, storage, expiresOn, notes, id);
  return c.json(getInventoryItem(db, id));
});

app.delete("/api/inventory/:id", (c) => {
  const id = Number(c.req.param("id"));
  const res = db.prepare("DELETE FROM inventory WHERE id = ?").run(id);
  return res.changes > 0 ? c.json({ deleted: true }) : c.json({ error: "Not found" }, 404);
});

app.get("/api/recipes", (c) => c.json(listRecipes(db)));

app.get("/api/recipes/:id", (c) => {
  const recipe = getRecipe(db, Number(c.req.param("id")));
  return recipe ? c.json(recipe) : c.json({ error: "Not found" }, 404);
});

app.get("/api/recommendations", (c) => c.json(recommend(db)));

app.post("/api/cook", async (c) => {
  const body = await c.req.json().catch(() => null);
  const recipeId = Number(body?.recipeId);
  const multiplier = body?.multiplier !== undefined ? Number(body.multiplier) : 1;
  if (!recipeId) return c.json({ error: "recipeId is required" }, 400);
  try {
    return c.json(cook(db, recipeId, multiplier));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

app.get("/api/stats", (c) => {
  const inventory = listInventory(db);
  const cooks = db
    .query("SELECT COUNT(*) AS meals, COALESCE(SUM(rescued_count), 0) AS rescued FROM cook_log")
    .get() as { meals: number; rescued: number };
  return c.json({
    itemCount: inventory.length,
    expiringCount: inventory.filter((i) => i.status === "critical" || i.status === "soon").length,
    expiredCount: inventory.filter((i) => i.status === "expired").length,
    mealsCooked: cooks.meals,
    itemsRescued: cooks.rescued,
  });
});

// Production: serve the built web app from dist/web (SPA fallback to index.html).
const distDir = join(import.meta.dir, "..", "dist", "web");
if (existsSync(distDir)) {
  app.use("/assets/*", serveStatic({ root: "./dist/web" }));
  app.get("*", serveStatic({ root: "./dist/web", path: "index.html" }));
}

const port = Number(process.env.PORT ?? 8790);
console.log(`freshflip API listening on http://localhost:${port}`);

export default { port, fetch: app.fetch };
