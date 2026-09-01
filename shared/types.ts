// Types shared between the API server and the web client.

export type Storage = "pantry" | "fridge" | "freezer";

export type FreshnessStatus = "expired" | "critical" | "soon" | "watch" | "fresh";

export interface Ingredient {
  id: number;
  name: string;
  category: string;
  defaultUnit: string;
  /** Shelf life in days per storage location; null = not typically stored there. */
  shelfLife: Partial<Record<Storage, number>>;
}

export interface InventoryItem {
  id: number;
  ingredientId: number;
  ingredientName: string;
  category: string;
  quantity: number;
  unit: string;
  storage: Storage;
  acquiredOn: string; // YYYY-MM-DD
  expiresOn: string | null; // YYYY-MM-DD; null = non-perishable / unknown
  notes: string | null;
  // Computed:
  daysLeft: number | null;
  status: FreshnessStatus;
  urgency: number; // 0..1
}

export interface RecipeIngredient {
  ingredientId: number;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  optional: boolean; // pantry staples & garnishes — never block "ready to cook"
  prep: string | null; // "diced", "juiced", ...
}

export interface Recipe {
  id: number;
  name: string;
  description: string;
  minutes: number;
  servings: number;
  tags: string[];
  instructions: string[];
  ingredients: RecipeIngredient[];
}

/** Per-ingredient match of a recipe against current inventory. */
export interface IngredientMatch {
  ingredientId: number;
  ingredientName: string;
  optional: boolean;
  needed: string; // display string, e.g. "200 g"
  have: boolean;
  enough: boolean | null; // null = units not comparable, quantity unverified
  daysLeft: number | null; // most urgent usable lot
  status: FreshnessStatus | null;
  urgency: number;
}

export interface Recommendation {
  recipe: Recipe;
  score: number;
  coverage: number; // matched required / total required
  readyToCook: boolean;
  missing: IngredientMatch[];
  rescues: IngredientMatch[]; // matched ingredients that are expiring (urgency > 0), most urgent first
  matches: IngredientMatch[]; // all ingredient matches
}

export interface Stats {
  itemCount: number;
  expiringCount: number; // status critical or soon
  expiredCount: number;
  mealsCooked: number;
  itemsRescued: number; // expiring items consumed via cooking
}

export interface CookResult {
  cookId: number;
  recipeName: string;
  consumed: { ingredientName: string; amount: string }[];
  notAdjusted: string[]; // ingredients we couldn't auto-decrement (unit mismatch)
  rescuedCount: number;
}
