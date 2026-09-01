import { useMemo, useState } from "react";
import type { AppData } from "./App";
import { DayDot } from "./components";

export default function Recipes({
  data,
  onOpenRecipe,
}: {
  data: AppData;
  onOpenRecipe: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [onlyReady, setOnlyReady] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.recommendations.filter((rec) => {
      if (onlyReady && !rec.readyToCook) return false;
      if (!q) return true;
      return (
        rec.recipe.name.toLowerCase().includes(q) ||
        rec.recipe.tags.some((t) => t.toLowerCase().includes(q)) ||
        rec.recipe.ingredients.some((i) => i.ingredientName.toLowerCase().includes(q))
      );
    });
  }, [data.recommendations, query, onlyReady]);

  return (
    <div className="recipes">
      <div className="page-head">
        <h1>Recipes</h1>
        <p className="lede">
          The whole book, still sorted by what needs rescuing first.
        </p>
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, tag, or ingredient"
          aria-label="Search recipes"
        />
        <label className="check">
          <input
            type="checkbox"
            checked={onlyReady}
            onChange={(e) => setOnlyReady(e.target.checked)}
          />
          ready to cook only
        </label>
        <span className="count">{rows.length} recipes</span>
      </div>

      <ul className="recipe-grid">
        {rows.map((rec) => {
          const required = rec.matches.filter((m) => !m.optional);
          const haveCount = required.filter((m) => m.have).length;
          return (
            <li key={rec.recipe.id}>
              <button
                type="button"
                className="recipe-card"
                onClick={() => onOpenRecipe(rec.recipe.id)}
              >
                <span className="recipe-top">
                  <span className="recipe-name">{rec.recipe.name}</span>
                  <span className="recipe-meta">
                    {rec.recipe.minutes} min · serves {rec.recipe.servings}
                  </span>
                </span>
                <span className="recipe-desc">{rec.recipe.description}</span>
                <span className="recipe-foot">
                  <span className={rec.readyToCook ? "have-count ready" : "have-count"}>
                    have {haveCount}/{required.length}
                  </span>
                  <span className="recipe-rescues">
                    {rec.rescues.slice(0, 3).map((m) => (
                      <DayDot
                        key={m.ingredientId}
                        daysLeft={m.daysLeft}
                        status={m.status ?? "fresh"}
                        size="sm"
                      />
                    ))}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && (
        <div className="empty-card">
          <p>No recipes match. Clear the search or uncheck "ready to cook only".</p>
        </div>
      )}
    </div>
  );
}
