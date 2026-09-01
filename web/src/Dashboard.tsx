import type { AppData } from "./App";
import { DayDot, Tape, fmtQty } from "./components";

export default function Dashboard({
  data,
  onOpenRecipe,
}: {
  data: AppData;
  onOpenRecipe: (id: number) => void;
}) {
  const urgent = data.inventory.filter(
    (i) => i.status === "critical" || i.status === "soon",
  );
  const expired = data.inventory.filter((i) => i.status === "expired");
  const flips = data.recommendations.filter((r) => r.score > 0).slice(0, 6);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="dashboard">
      <div className="page-head">
        <p className="eyebrow">{today}</p>
        <h1>Tonight's flips</h1>
        <p className="lede">
          Recipes ranked by how much expiring food they rescue. Cook from the top.
        </p>
      </div>

      <div className="dash-grid">
        <section className="rail" aria-label="Use first">
          <div className="rail-head">
            <Tape>use first</Tape>
          </div>
          {urgent.length === 0 && (
            <p className="rail-empty">
              Nothing on the edge. Add inventory as you shop and freshflip will
              watch the dates.
            </p>
          )}
          <ul className="rail-list">
            {urgent.map((item) => (
              <li key={item.id} className="rail-item">
                <DayDot daysLeft={item.daysLeft} status={item.status} />
                <span className="rail-name">{item.ingredientName}</span>
                <span className="rail-qty">{fmtQty(item.quantity, item.unit)}</span>
              </li>
            ))}
          </ul>
          {expired.length > 0 && (
            <div className="rail-expired">
              <p className="rail-expired-head">Past date — check &amp; toss</p>
              <ul className="rail-list">
                {expired.map((item) => (
                  <li key={item.id} className="rail-item is-expired">
                    <DayDot daysLeft={item.daysLeft} status={item.status} />
                    <span className="rail-name">{item.ingredientName}</span>
                    <span className="rail-qty">{fmtQty(item.quantity, item.unit)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="flips" aria-label="Recommended recipes">
          {flips.length === 0 && (
            <div className="empty-card">
              <p>
                No flips yet — nothing in your inventory is close to its date, or
                the inventory is empty. Add items in the Inventory tab.
              </p>
            </div>
          )}
          <ol className="flip-list">
            {flips.map((rec, idx) => (
              <li key={rec.recipe.id}>
                <button
                  type="button"
                  className="flip-card"
                  onClick={() => onOpenRecipe(rec.recipe.id)}
                >
                  <span className="flip-rank">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="flip-body">
                    <span className="flip-title-row">
                      <span className="flip-name">{rec.recipe.name}</span>
                      <span className="flip-meta">
                        {rec.recipe.minutes} min · serves {rec.recipe.servings}
                      </span>
                    </span>
                    <span className="flip-desc">{rec.recipe.description}</span>
                    <span className="flip-rescues">
                      {rec.rescues.slice(0, 4).map((m) => (
                        <span className="rescue-chip" key={m.ingredientId}>
                          <DayDot daysLeft={m.daysLeft} status={m.status ?? "fresh"} size="sm" />
                          {m.ingredientName}
                        </span>
                      ))}
                      {rec.rescues.length > 4 && (
                        <span className="rescue-more">+{rec.rescues.length - 4} more</span>
                      )}
                    </span>
                  </span>
                  <span className="flip-side">
                    {rec.readyToCook ? (
                      <span className="ready">ready to cook</span>
                    ) : (
                      <span className="shortfall">
                        missing {rec.missing.length}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="stats" aria-label="Kitchen stats">
        <div className="stat">
          <span className="stat-n">{data.stats.itemCount}</span>
          <span className="stat-l">items on hand</span>
        </div>
        <div className="stat">
          <span className="stat-n">{data.stats.expiringCount}</span>
          <span className="stat-l">to use this week</span>
        </div>
        <div className="stat">
          <span className="stat-n">{data.stats.expiredCount}</span>
          <span className="stat-l">past date</span>
        </div>
        <div className="stat">
          <span className="stat-n">{data.stats.mealsCooked}</span>
          <span className="stat-l">meals cooked</span>
        </div>
        <div className="stat">
          <span className="stat-n">{data.stats.itemsRescued}</span>
          <span className="stat-l">items rescued</span>
        </div>
      </section>
    </div>
  );
}
