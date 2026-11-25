import { useCallback, useMemo, useState } from "react";

import {
  dataTableFeatures,
  type DataTableFeatures,
} from "#/components/data-table/table-features";
import type { FiltersType } from "#/types/data-table";
import type {
  ColumnFiltersState,
  ColumnVisibilityState,
  PaginationState,
  RowData,
  RowSelectionState,
  SortingState,
  TableOptions,
  Updater,
} from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";

import { useDebouncedCallback } from "./use-debounced-callback";

export type { FiltersType } from "#/types/data-table";

interface UseDataTableProps<TData extends RowData>
  extends
    Omit<
      TableOptions<DataTableFeatures, TData>,
      | "state"
      | "features"
      | "pageCount"
      | "manualFiltering"
      | "manualPagination"
      | "manualSorting"
    >,
    Required<Pick<TableOptions<DataTableFeatures, TData>, "pageCount">> {
  enableAdvancedFilter?: boolean;
  filters: Omit<FiltersType, "search">;
  setFilters: (filters: Omit<FiltersType, "search">) => void;
}

const DEFAULT_PAGE_INDEX = 1;
const DEFAULT_PAGE_SIZE = 20;

export function useDataTable<TData extends RowData>({
  columns,
  filters,
  setFilters,
  pageCount = -1,
  enableAdvancedFilter = false,
  ...props
}: UseDataTableProps<TData>) {
  "use no memo";
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const {
    page = DEFAULT_PAGE_INDEX,
    limit = DEFAULT_PAGE_SIZE,
    order,
    orderField,
    filter,
  } = filters;

  const pagination: PaginationState = useMemo(() => {
    return {
      pageIndex: page - 1, // zero-based index -> one-based index
      pageSize: limit,
    };
  }, [page, limit]);

  const onPaginationChange = useCallback(
    (updaterOrValue: Updater<PaginationState>) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(pagination)
          : updaterOrValue;

      void setFilters({
        page: next.pageIndex + 1,
        limit: next.pageSize,
      });
    },
    [pagination, setFilters]
  );

  const sorting: SortingState = useMemo(() => {
    if (!orderField || !order) return [];
    return [{ id: orderField, desc: order === "desc" }];
  }, [orderField, order]);

  const onSortingChange = useCallback(
    (updaterOrValue: Updater<SortingState>) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(sorting)
          : updaterOrValue;

      if (next.length > 0) {
        void setFilters({
          orderField: next[0]!.id,
          order: next[0]!.desc ? "desc" : "asc",
        });
      } else {
        void setFilters({
          orderField: undefined,
          order: undefined,
        });
      }
    },
    [sorting, setFilters]
  );

  const [columnVisibility, setColumnVisibility] =
    useState<ColumnVisibilityState>({});

  const filterableColumnIds = useMemo(() => {
    if (enableAdvancedFilter) return new Set<string>();

    return new Set(
      columns
        .filter((column) => column.enableColumnFilter)
        .map((column) => {
          if (typeof column === "string") return column;
          if ("accessorKey" in column && column.accessorKey) {
            return String(column.accessorKey);
          }
          return column.id;
        })
        .filter((id): id is string => Boolean(id))
    );
  }, [columns, enableAdvancedFilter]);

  const initialColumnFilters: ColumnFiltersState = useMemo(() => {
    if (enableAdvancedFilter) return [];

    return Object.entries(filter ?? {}).reduce<ColumnFiltersState>(
      (columnFilters, [key, value]) => {
        if (value !== null) {
          const processedValue = Array.isArray(value) ? value : [value];

          columnFilters.push({
            id: key,
            value: processedValue,
          });
        }
        return columnFilters;
      },
      []
    );
  }, [filter, enableAdvancedFilter]);

  const [columnFilters, setColumnFilters] =
    useState<ColumnFiltersState>(initialColumnFilters);

  const debouncedSetFilterValues = useDebouncedCallback(
    (values: typeof filter) => {
      void setFilters({
        page: DEFAULT_PAGE_INDEX,
        filter: values,
      });
    },
    300
  );

  const onColumnFiltersChange = useCallback(
    (updaterOrValue: Updater<ColumnFiltersState>) => {
      if (enableAdvancedFilter) return;

      setColumnFilters((prev) => {
        const next =
          typeof updaterOrValue === "function"
            ? updaterOrValue(prev)
            : updaterOrValue;

        const filterUpdates = next.reduce<Record<string, string[] | null>>(
          (acc, columnFilter) => {
            if (filterableColumnIds.has(columnFilter.id)) {
              acc[columnFilter.id] = columnFilter.value as string[];
            }
            return acc;
          },
          {}
        );

        for (const prevFilter of prev) {
          if (!next.some((nextFilter) => nextFilter.id === prevFilter.id)) {
            filterUpdates[prevFilter.id] = null;
          }
        }

        debouncedSetFilterValues(filterUpdates);
        return next;
      });
    },
    [debouncedSetFilterValues, filterableColumnIds, enableAdvancedFilter]
  );

  return useTable({
    ...props,
    features: dataTableFeatures,
    pageCount,
    columns,
    state: {
      pagination,
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
    },
    defaultColumn: {
      ...props.defaultColumn,
      enableColumnFilter: false,
    },
    onRowSelectionChange: setRowSelection,
    onPaginationChange,
    onSortingChange,
    onColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });
}
