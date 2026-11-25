import type {
  CellData,
  ColumnDef,
  RowData,
  TableFeatures,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface TableMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
  > {
    queryKeys?: QueryKeys;
  }

  interface ColumnMeta<
    in out TFeatures extends TableFeatures,
    in out TData extends RowData,
    TValue extends CellData = CellData,
  > {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  }
}

export interface QueryKeys {
  searchText: string | undefined;
}

export interface Option {
  label: string;
  value: string;
  count?: number;
}

export type FilterVariant =
  | "text"
  | "number"
  | "range"
  | "date"
  | "dateRange"
  | "boolean"
  | "select"
  | "multiSelect";

export type ColumnType<T extends RowData> = Array<ColumnDef<TableFeatures, T>>;

export type FiltersType = Partial<{
  page: number;
  limit: number;
  search: string | null;
  order: "asc" | "desc" | null;
  orderField: string | null;
  filter: Record<string, string | string[] | null>;
}>;
