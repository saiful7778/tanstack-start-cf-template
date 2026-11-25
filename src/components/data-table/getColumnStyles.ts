import type { DataTableColumn } from "#/components/data-table/table-features";
import type { RowData } from "@tanstack/react-table";

export function getColumnStyles<TData extends RowData>({
  column,
  withBorder = false,
}: {
  column: DataTableColumn<TData>;
  withBorder?: boolean;
}): React.CSSProperties {
  const isPinned = column.getIsPinned();
  const isLastStartPinnedColumn =
    isPinned === "start" && column.getIsLastColumn("start");
  const isFirstEndPinnedColumn =
    isPinned === "end" && column.getIsFirstColumn("end");

  return {
    backgroundColor: isPinned ? "inherit" : undefined,
    boxShadow: withBorder
      ? isLastStartPinnedColumn
        ? "-4px 0 4px -4px var(--border) inset"
        : isFirstEndPinnedColumn
          ? "4px 0 4px -4px var(--border) inset"
          : undefined
      : undefined,
    insetInlineStart:
      isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    insetInlineEnd:
      isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? "sticky" : "relative",
    zIndex: isPinned ? 1 : undefined,
  };
}
