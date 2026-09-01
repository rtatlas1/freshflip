import { useCallback, useEffect, useState } from "react";
import type {
  Ingredient,
  InventoryItem,
  Recipe,
  Recommendation,
  Stats,
} from "../../shared/types";
import { api } from "./api";
import Dashboard from "./Dashboard";
import Inventory from "./Inventory";
import Recipes from "./Recipes";
import RecipeDetail from "./RecipeDetail";
import { Tape } from "./components";

type Tab = "tonight" | "inventory" | "recipes";

function tabFromHash(): Tab {
  const h = window.location.hash.replace("#/", "");
  return h === "inventory" || h === "recipes" ? h : "tonight";
}

export interface AppData {
  inventory: InventoryItem[];
  recipes: Recipe[];
  recommendations: Recommendation[];
  stats: Stats;
  ingredients: Ingredient[];
  units: string[];
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash());
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRecipeId, setOpenRecipeId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [inventory, recipes, recommendations, stats, ingredients, units] =
        await Promise.all([
          api.inventory(),
          api.recipes(),
          api.recommendations(),
          api.stats(),
          api.ingredients(),
          api.units(),
        ]);
      setData({ inventory, recipes, recommendations, stats, ingredients, units });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  const cook = useCallback(
    async (recipeId: number, multiplier = 1) => {
      const result = await api.cook(recipeId, multiplier);
      const rescued =
        result.rescuedCount > 0
          ? ` — ${result.rescuedCount} expiring item${result.rescuedCount === 1 ? "" : "s"} rescued`
          : "";
      showToast(`Cooked ${result.recipeName}${rescued}`);
      setOpenRecipeId(null);
      await refresh();
      return result;
    },
    [refresh, showToast],
  );

  const expiringCount = data?.stats.expiringCount ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <a className="wordmark" href="#/" onClick={() => setTab("tonight")}>
          fresh<span className="wordmark-flip">flip</span>
        </a>
        <nav className="tabs" aria-label="Main">
          <a className={tab === "tonight" ? "tab active" : "tab"} href="#/">
            Tonight
          </a>
          <a className={tab === "inventory" ? "tab active" : "tab"} href="#/inventory">
            Inventory
            {expiringCount > 0 && <span className="tab-badge">{expiringCount}</span>}
          </a>
          <a className={tab === "recipes" ? "tab active" : "tab"} href="#/recipes">
            Recipes
          </a>
        </nav>
      </header>

      <main className="page">
        {error && (
          <div className="error-banner" role="alert">
            Couldn't reach the freshflip API: {error}. Is the server running on port 8790?
          </div>
        )}
        {!data && !error && <p className="loading">Opening the walk-in…</p>}
        {data && tab === "tonight" && (
          <Dashboard data={data} onOpenRecipe={setOpenRecipeId} />
        )}
        {data && tab === "inventory" && (
          <Inventory data={data} refresh={refresh} showToast={showToast} />
        )}
        {data && tab === "recipes" && (
          <Recipes data={data} onOpenRecipe={setOpenRecipeId} />
        )}
      </main>

      {data && openRecipeId !== null && (
        <RecipeDetail
          data={data}
          recipeId={openRecipeId}
          onClose={() => setOpenRecipeId(null)}
          onCook={cook}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <Tape>{toast}</Tape>
        </div>
      )}
    </div>
  );
}
