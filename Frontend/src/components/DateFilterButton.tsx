import { Search } from "lucide-react";

interface DateFilterButtonProps {
  onClick: () => void;
}

export default function DateFilterButton({ onClick }: DateFilterButtonProps) {
  return (
    <button type="button" className="btn btn-primary date-filter-button" onClick={onClick}>
      <Search size={16} />
      پیدا کول
    </button>
  );
}
