import type {
  CookResult,
  Ingredient,
  InventoryItem,
  Recipe,
  Recommendation,
  Stats,
  Storage,
} from "../../shared/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  ingredients: () => request<Ingredient[]>("/api/ingredients"),
  units: () => request<string[]>("/api/units"),
  inventory: () => request<InventoryItem[]>("/api/inventory"),
  addItem: (body: {
    ingredientName: string;
    quantity: number;
    unit: string;
    storage: Storage;
    expiresOn?: string;
  }) => request<InventoryItem>("/api/inventory", { method: "POST", body: JSON.stringify(body) }),
  updateItem: (id: number, body: Partial<Pick<InventoryItem, "quantity" | "expiresOn" | "storage" | "notes">>) =>
    request<InventoryItem | { deleted: true }>(`/api/inventory/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteItem: (id: number) => request<{ deleted: true }>(`/api/inventory/${id}`, { method: "DELETE" }),
  recipes: () => request<Recipe[]>("/api/recipes"),
  recommendations: () => request<Recommendation[]>("/api/recommendations"),
  cook: (recipeId: number, multiplier = 1) =>
    request<CookResult>("/api/cook", { method: "POST", body: JSON.stringify({ recipeId, multiplier }) }),
  stats: () => request<Stats>("/api/stats"),
};
