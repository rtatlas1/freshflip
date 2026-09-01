import { useEffect, useMemo, useRef, useState } from "react";
import type { AppData } from "./App";
import { DayDot, Tape } from "./components";

export default function RecipeDetail({
  data,
  recipeId,
  onClose,
  onCook,
}: {
  data: AppData;
  recipeId: number;
  onClose: () => void;
  onCook: (recipeId: number, multiplier: number) => Promise<unknown>;
}) {
  const rec = useMemo(
    () => data.recommendations.find((r) => r.recipe.id === recipeId) ?? null,
    [data.recommendations, recipeId],
  );
  const [multiplier, setMultiplier] = useState(1);
  const [cooking, setCooking] = useState(false);
  const [cookError, setCookError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!rec) return null;
  const r = rec.recipe;

  async function cookNow() {
    setCooking(true);
    setCookError(null);
    try {
      await onCook(r.id, multiplier);
    } catch (e) {
      setCookError((e as Error).message);
      setCooking(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={r.name}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div>
            <p className="eyebrow">
              {r.minutes} min · serves {r.servings} · {r.tags.join(" · ")}
            </p>
            <h2>{r.name}</h2>
            <p className="sheet-desc">{r.description}</p>
          </div>
          <button ref={closeRef} type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {rec.rescues.length > 0 && (
          <div className="sheet-rescue">
            <Tape>
              rescues {rec.rescues.length} item{rec.rescues.length === 1 ? "" : "s"}
            </Tape>
          </div>
        )}

        <div className="sheet-cols">
          <section aria-label="Ingredients">
            <h3>Ingredients</h3>
            <ul className="ing-list">
              {rec.matches.map((m) => (
                <li
                  key={m.ingredientId}
                  className={`ing-row${m.have ? "" : m.optional ? " ing-skip" : " ing-missing"}`}
                >
                  {m.have ? (
                    <DayDot daysLeft={m.daysLeft} status={m.status ?? "fresh"} size="sm" />
                  ) : (
                    <span className="ing-mark" aria-hidden="true">
                      {m.optional ? "·" : "✕"}
                    </span>
                  )}
                  <span className="ing-name">
                    {m.ingredientName}
                    {m.optional && <span className="ing-opt"> optional</span>}
                  </span>
                  <span className="ing-need">
                    {m.needed}
                    {m.have && m.enough === false && (
                      <span className="ing-short"> — running short</span>
                    )}
                    {!m.have && !m.optional && <span className="ing-short"> — not on hand</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Method">
            <h3>Method</h3>
            <ol className="steps">
              {r.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </section>
        </div>

        <div className="sheet-foot">
          <label className="mult">
            Batch
            <select
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
            >
              <option value={0.5}>×½</option>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
              <option value={3}>×3</option>
            </select>
          </label>
          <div className="sheet-foot-right">
            {!rec.readyToCook && (
              <span className="shortfall">
                missing {rec.missing.length}: {rec.missing.map((m) => m.ingredientName).join(", ")}
              </span>
            )}
            <button type="button" className="btn-primary" onClick={cookNow} disabled={cooking}>
              {cooking ? "Cooking…" : "Cook this — update inventory"}
            </button>
          </div>
        </div>
        {cookError && (
          <p className="form-error" role="alert">
            {cookError}
          </p>
        )}
      </div>
    </div>
  );
}
