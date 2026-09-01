import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  Ingredient,
  InventoryItem,
  Recipe,
  RecipeIngredient,
  Storage,
} from "../shared/types";
import { daysUntil, statusFor, urgencyFor } from "./freshness";

const DB_PATH =
  process.env.FRESHFLIP_DB ?? join(import.meta.dir, "..", "data", "freshflip.sqlite");

export function openDb(path: string = DB_PATH): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      category TEXT NOT NULL,
      default_unit TEXT NOT NULL,
      shelf_pantry INTEGER,
      shelf_fridge INTEGER,
      shelf_freezer INTEGER
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      storage TEXT NOT NULL CHECK (storage IN ('pantry','fridge','freezer')),
      acquired_on TEXT NOT NULL,
      expires_on TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_ingredient ON inventory(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_expires ON inventory(expires_on);

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      servings INTEGER NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      instructions TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      quantity REAL,
      unit TEXT,
      optional INTEGER NOT NULL DEFAULT 0,
      prep TEXT,
      PRIMARY KEY (recipe_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS cook_log (
      id INTEGER PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES recipes(id),
      cooked_at TEXT NOT NULL DEFAULT (datetime('now')),
      servings REAL NOT NULL DEFAULT 1,
      consumed TEXT NOT NULL DEFAULT '[]',
      rescued_count INTEGER NOT NULL DEFAULT 0
    );
  `);
}

// ---------- row mappers ----------

interface IngredientRow {
  id: number;
  name: string;
  category: string;
  default_unit: string;
  shelf_pantry: number | null;
  shelf_fridge: number | null;
  shelf_freezer: number | null;
}

function mapIngredient(r: IngredientRow): Ingredient {
  const shelfLife: Ingredient["shelfLife"] = {};
  if (r.shelf_pantry != null) shelfLife.pantry = r.shelf_pantry;
  if (r.shelf_fridge != null) shelfLife.fridge = r.shelf_fridge;
  if (r.shelf_freezer != null) shelfLife.freezer = r.shelf_freezer;
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    defaultUnit: r.default_unit,
    shelfLife,
  };
}

interface InventoryRow {
  id: number;
  ingredient_id: number;
  ingredient_name: string;
  category: string;
  quantity: number;
  unit: string;
  storage: Storage;
  acquired_on: string;
  expires_on: string | null;
  notes: string | null;
}

function mapInventory(r: InventoryRow, today: Date): InventoryItem {
  const daysLeft = r.expires_on ? daysUntil(r.expires_on, today) : null;
  return {
    id: r.id,
    ingredientId: r.ingredient_id,
    ingredientName: r.ingredient_name,
    category: r.category,
    quantity: r.quantity,
    unit: r.unit,
    storage: r.storage,
    acquiredOn: r.acquired_on,
    expiresOn: r.expires_on,
    notes: r.notes,
    daysLeft,
    status: statusFor(daysLeft),
    urgency: urgencyFor(daysLeft),
  };
}

// ---------- queries ----------

export function listIngredients(db: Database): Ingredient[] {
  const rows = db.query("SELECT * FROM ingredients ORDER BY name").all() as IngredientRow[];
  return rows.map(mapIngredient);
}

export function getIngredientByName(db: Database, name: string): Ingredient | null {
  const row = db
    .query("SELECT * FROM ingredients WHERE name = ? COLLATE NOCASE")
    .get(name.trim()) as IngredientRow | null;
  return row ? mapIngredient(row) : null;
}

const INVENTORY_SELECT = `
  SELECT inv.id, inv.ingredient_id, ing.name AS ingredient_name, ing.category,
         inv.quantity, inv.unit, inv.storage, inv.acquired_on, inv.expires_on, inv.notes
  FROM inventory inv JOIN ingredients ing ON ing.id = inv.ingredient_id
`;

export function listInventory(db: Database, today: Date = new Date()): InventoryItem[] {
  const rows = db
    .query(`${INVENTORY_SELECT} ORDER BY inv.expires_on IS NULL, inv.expires_on, ing.name`)
    .all() as InventoryRow[];
  return rows.map((r) => mapInventory(r, today));
}

export function getInventoryItem(
  db: Database,
  id: number,
  today: Date = new Date(),
): InventoryItem | null {
  const row = db.query(`${INVENTORY_SELECT} WHERE inv.id = ?`).get(id) as InventoryRow | null;
  return row ? mapInventory(row, today) : null;
}

interface RecipeRow {
  id: number;
  name: string;
  description: string;
  minutes: number;
  servings: number;
  tags: string;
  instructions: string;
}

interface RecipeIngredientRow {
  recipe_id: number;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number | null;
  unit: string | null;
  optional: number;
  prep: string | null;
}

export function listRecipes(db: Database): Recipe[] {
  const recipeRows = db.query("SELECT * FROM recipes ORDER BY name").all() as RecipeRow[];
  const ingRows = db
    .query(
      `SELECT ri.recipe_id, ri.ingredient_id, ing.name AS ingredient_name,
              ri.quantity, ri.unit, ri.optional, ri.prep
       FROM recipe_ingredients ri JOIN ingredients ing ON ing.id = ri.ingredient_id
       ORDER BY ri.optional, ing.name`,
    )
    .all() as RecipeIngredientRow[];

  const byRecipe = new Map<number, RecipeIngredient[]>();
  for (const r of ingRows) {
    const list = byRecipe.get(r.recipe_id) ?? [];
    list.push({
      ingredientId: r.ingredient_id,
      ingredientName: r.ingredient_name,
      quantity: r.quantity,
      unit: r.unit,
      optional: r.optional === 1,
      prep: r.prep,
    });
    byRecipe.set(r.recipe_id, list);
  }

  return recipeRows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    minutes: r.minutes,
    servings: r.servings,
    tags: JSON.parse(r.tags),
    instructions: JSON.parse(r.instructions),
    ingredients: byRecipe.get(r.id) ?? [],
  }));
}

export function getRecipe(db: Database, id: number): Recipe | null {
  return listRecipes(db).find((r) => r.id === id) ?? null;
}
