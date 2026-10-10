import { Grid3X3, List } from "lucide-react";

export type ViewMode = "list" | "grid";

export default function ViewModeToggle({ value, onChange }: { value: ViewMode; onChange: (value: ViewMode) => void }) {
  return (
    <div className="view-toggle" aria-label="د ښودلو ډول">
      <button type="button" className={`btn btn-sm ${value === "list" ? "btn-primary" : "btn-ghost"}`} title="لیست" onClick={() => onChange("list")}>
        <List size={16} />
      </button>
      <button type="button" className={`btn btn-sm ${value === "grid" ? "btn-primary" : "btn-ghost"}`} title="ګریډ" onClick={() => onChange("grid")}>
        <Grid3X3 size={16} />
      </button>
    </div>
  );
}
