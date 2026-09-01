import { useMemo, useState } from "react";
import type { Storage } from "../../shared/types";
import type { AppData } from "./App";
import { api } from "./api";
import { DayDot, fmtDate } from "./components";

const STORAGES: Storage[] = ["fridge", "freezer", "pantry"];

export default function Inventory({
  data,
  refresh,
  showToast,
}: {
  data: AppData;
  refresh: () => Promise<void>;
  showToast: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [storageFilter, setStorageFilter] = useState<Storage | "all">("all");
  const [busyId, setBusyId] = useState<number | null>(null);

  // add form
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("g");
  const [storage, setStorage] = useState<Storage>("fridge");
  const [expiresOn, setExpiresOn] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const catalogMatch = useMemo(
    () => data.ingredients.find((i) => i.name.toLowerCase() === name.trim().toLowerCase()),
    [data.ingredients, name],
  );

  const shelfHint = useMemo(() => {
    if (expiresOn) return null;
    const days = catalogMatch?.shelfLife[storage];
    if (days == null) return catalogMatch ? "no typical shelf life for this storage — set a date if it spoils" : null;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `auto-expires ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} (${days}-day ${storage} shelf life)`;
  }, [catalogMatch, storage, expiresOn]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.inventory.filter(
      (i) =>
        (storageFilter === "all" || i.storage === storageFilter) &&
        (!q || i.ingredientName.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)),
    );
  }, [data.inventory, query, storageFilter]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const quantity = Number(qty);
    if (!name.trim()) return setFormError("Name the ingredient.");
    if (!(quantity > 0)) return setFormError("Quantity must be a positive number.");
    setAdding(true);
    try {
      await api.addItem({
        ingredientName: name.trim(),
        quantity,
        unit,
        storage,
        ...(expiresOn ? { expiresOn } : {}),
      });
      setName("");
      setQty("");
      setExpiresOn("");
      showToast(`Added ${name.trim()}`);
      await refresh();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function nudgeQty(id: number, current: number, delta: number) {
    setBusyId(id);
    try {
      const next = Math.max(0, Math.round((current + delta) * 100) / 100);
      await api.updateItem(id, { quantity: next });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number, itemName: string) {
    setBusyId(id);
    try {
      await api.deleteItem(id);
      showToast(`Removed ${itemName}`);
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="inventory">
      <div className="page-head">
        <h1>Inventory</h1>
        <p className="lede">
          Everything on hand, first-to-expire first. Dots count the days.
        </p>
      </div>

      <form className="add-form" onSubmit={addItem}>
        <div className="add-fields">
          <label className="field grow">
            <span>Ingredient</span>
            <input
              list="catalog"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="start typing — spinach, salmon fillet…"
            />
            <datalist id="catalog">
              {data.ingredients.map((i) => (
                <option key={i.id} value={i.name} />
              ))}
            </datalist>
          </label>
          <label className="field w-qty">
            <span>Qty</span>
            <input
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="500"
            />
          </label>
          <label className="field w-unit">
            <span>Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {data.units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="field w-unit">
            <span>Storage</span>
            <select value={storage} onChange={(e) => setStorage(e.target.value as Storage)}>
              {STORAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="field w-date">
            <span>Expires (optional)</span>
            <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
          </label>
          <button className="btn-primary" type="submit" disabled={adding}>
            {adding ? "Adding…" : "Add item"}
          </button>
        </div>
        {shelfHint && <p className="hint">{shelfHint}</p>}
        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
      </form>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inventory"
          aria-label="Search inventory"
        />
        <div className="seg" role="group" aria-label="Filter by storage">
          {(["all", ...STORAGES] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={storageFilter === s ? "seg-btn active" : "seg-btn"}
              onClick={() => setStorageFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="count">{filtered.length} items</span>
      </div>

      <div className="table-wrap">
        <table className="inv-table">
          <thead>
            <tr>
              <th className="th-dot" aria-label="Days left" />
              <th>Ingredient</th>
              <th className="th-num">Quantity</th>
              <th>Storage</th>
              <th>Expires</th>
              <th className="th-actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className={item.status === "expired" ? "row-expired" : undefined}>
                <td className="td-dot">
                  <DayDot daysLeft={item.daysLeft} status={item.status} />
                </td>
                <td>
                  <span className="inv-name">{item.ingredientName}</span>
                  <span className="inv-cat">{item.category}</span>
                </td>
                <td className="td-num">
                  <span className="qty-ctrl">
                    <button
                      type="button"
                      className="nudge"
                      aria-label={`Reduce ${item.ingredientName}`}
                      disabled={busyId === item.id}
                      onClick={() => nudgeQty(item.id, item.quantity, -stepFor(item.unit))}
                    >
                      −
                    </button>
                    <span className="qty-val">
                      {Math.round(item.quantity * 100) / 100} {item.unit}
                    </span>
                    <button
                      type="button"
                      className="nudge"
                      aria-label={`Increase ${item.ingredientName}`}
                      disabled={busyId === item.id}
                      onClick={() => nudgeQty(item.id, item.quantity, stepFor(item.unit))}
                    >
                      +
                    </button>
                  </span>
                </td>
                <td className="td-storage">{item.storage}</td>
                <td className="td-date">
                  <span className="date-main">{fmtDate(item.expiresOn)}</span>
                  {item.daysLeft !== null && (
                    <span className="date-sub">
                      {item.daysLeft < 0
                        ? `${-item.daysLeft}d ago`
                        : item.daysLeft === 0
                          ? "today"
                          : `in ${item.daysLeft}d`}
                    </span>
                  )}
                </td>
                <td className="td-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busyId === item.id}
                    onClick={() => remove(item.id, item.ingredientName)}
                  >
                    {item.status === "expired" ? "Toss" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="empty-row">
                  {data.inventory.length === 0
                    ? "Inventory is empty — add your first item above."
                    : "No items match this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function stepFor(unit: string): number {
  if (unit === "g" || unit === "ml") return 50;
  if (unit === "kg" || unit === "l" || unit === "lb") return 0.5;
  return 1;
}
