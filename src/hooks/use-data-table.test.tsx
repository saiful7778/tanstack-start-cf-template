import { useState } from "react";

import { getColumnStyles } from "#/components/data-table/getColumnStyles";
import type { DataTableFeatures } from "#/components/data-table/table-features";
import type { FiltersType } from "#/types/data-table";
import { createColumnHelper } from "@tanstack/react-table";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDataTable } from "./use-data-table";

type Row = { name: string; amount: number };

const helper = createColumnHelper<DataTableFeatures, Row>();
const columns = helper.columns([
  helper.accessor("name", { header: "Name", enableColumnFilter: true }),
  helper.accessor("amount", { header: "Amount" }),
]);

const data: Row[] = [
  { name: "a", amount: 10 },
  { name: "b", amount: 20 },
];

describe("useDataTable with TanStack Table v9", () => {
  it("exposes v9 state and feature APIs", async () => {
    const updates: Array<Omit<FiltersType, "search">> = [];

    function Harness() {
      const [filters, setFilters] = useState<Omit<FiltersType, "search">>({
        page: 1,
        limit: 10,
      });
      const table = useDataTable({
        data,
        columns,
        filters,
        setFilters: (next) => {
          updates.push(next);
          setFilters(next);
        },
        pageCount: 1,
      });

      return (
        <div>
          <span data-testid="page-index">
            {table.state.pagination.pageIndex}
          </span>
          <span data-testid="row-count">{table.getRowModel().rows.length}</span>
          <span data-testid="facet">
            {JSON.stringify(
              table.getColumn("amount")?.getFacetedMinMaxValues()
            )}
          </span>
          <button
            type="button"
            onClick={() => table.getColumn("name")?.toggleSorting()}
          >
            sort
          </button>
          <button
            type="button"
            onClick={() => table.getColumn("name")?.setFilterValue(["a"])}
          >
            filter
          </button>
        </div>
      );
    }

    render(<Harness />);

    expect(screen.getByTestId("page-index").textContent).toBe("0");
    expect(screen.getByTestId("row-count").textContent).toBe("2");
    expect(screen.getByTestId("facet").textContent).toBe("[10,20]");

    act(() => screen.getByText("sort").click());
    expect(updates.at(-1)).toMatchObject({ order: "asc", orderField: "name" });

    act(() => screen.getByText("filter").click());
    await waitFor(() => {
      expect(updates.at(-1)).toMatchObject({
        page: 1,
        filter: { name: ["a"] },
      });
    });
  });

  it("pins columns with v9 start/end state and sticky styles", () => {
    function Harness() {
      const table = useDataTable({
        data,
        columns,
        filters: { page: 1, limit: 10 },
        setFilters: () => {},
        pageCount: 1,
        initialState: { columnPinning: { start: ["amount"], end: [] } },
      });

      const name = table.getColumn("name")!;
      const amount = table.getColumn("amount")!;

      return (
        <div>
          <span data-testid="order">
            {table
              .getHeaderGroups()[0]!
              .headers.map((header) => header.column.id)
              .join(",")}
          </span>
          <span data-testid="pinned">
            {`${name.getIsPinned()}/${amount.getIsPinned()}`}
          </span>
          <span data-testid="can-pin">{String(name.getCanPin())}</span>
          <span data-testid="styles">
            {JSON.stringify(
              getColumnStyles({ column: amount, withBorder: true })
            )}
          </span>
          <button type="button" onClick={() => name.pin("end")}>
            pin name end
          </button>
          <button type="button" onClick={() => amount.pin(false)}>
            unpin amount
          </button>
        </div>
      );
    }

    render(<Harness />);

    expect(screen.getByTestId("can-pin").textContent).toBe("true");
    expect(screen.getByTestId("pinned").textContent).toBe("false/start");
    expect(screen.getByTestId("order").textContent).toBe("amount,name");
    expect(
      JSON.parse(String(screen.getByTestId("styles").textContent))
    ).toMatchObject({
      position: "sticky",
      insetInlineStart: "0px",
      backgroundColor: "inherit",
    });

    act(() => screen.getByText("pin name end").click());
    expect(screen.getByTestId("pinned").textContent).toBe("end/start");

    act(() => screen.getByText("unpin amount").click());
    expect(screen.getByTestId("pinned").textContent).toBe("end/false");
    expect(screen.getByTestId("order").textContent).toBe("amount,name");
  });
});
