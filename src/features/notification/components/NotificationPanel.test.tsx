import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `orpc` reaches the server router, which pulls in worker-mailer and needs
// `cloudflare:sockets` — unavailable outside workerd.
vi.mock("worker-mailer", () => ({
  WorkerMailer: { connect: vi.fn() },
}));

const markAsRead = vi.hoisted(() => vi.fn());
const markAllAsRead = vi.hoisted(() => vi.fn());

vi.mock("../api/notification.api.hook", () => ({
  useUnreadNotificationCount: () => ({ data: { data: { count: 2 } } }),
  useNotificationMarkAsRead: () => ({
    markAsRead,
    mutate: vi.fn(),
    isPending: false,
  }),
  useNotificationMarkAllAsRead: () => ({
    mutate: markAllAsRead,
    isPending: false,
  }),
}));

vi.mock("./providers/NotificationRealtimeProvider", () => ({
  useNotificationRealtime: () => ({ status: "open" }),
}));

// The "Read All" button uses TanStack Router's `Link`, which needs a router
// context. It is irrelevant to mark-as-read behaviour, so stub it.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => (
    <a href="/dashboard/notifications">{children}</a>
  ),
}));

type ListMode = "success" | "loading" | "error" | "empty";

const listState = vi.hoisted(() => ({
  /** Set per test to drive one boundary state. */
  mode: "success",
  refetch: vi.fn(),
})) as { mode: ListMode; refetch: ReturnType<typeof vi.fn> };

const ROWS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    category: "SYSTEM",
    level: "INFO",
    title: "Unread one",
    message: "First message",
    data: null,
    isRead: false,
    readAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    category: "SYSTEM",
    level: "INFO",
    title: "Already read",
    message: "Second message",
    data: null,
    isRead: true,
    readAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

vi.mock("#/oRPC/orpc", () => ({
  orpcTQClient: {
    notification: {
      list: {
        queryOptions: () => ({
          queryKey: ["notification", "list"],
          queryFn: async () => ({ data: { data: [], meta: {} } }),
        }),
      },
    },
  },
}));

// The query is mocked at the hook level so each boundary state is explicit,
// instead of being inferred from a fake network round trip.
vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...(actual as object),
    useQuery: () => {
      if (listState.mode === "loading") {
        return {
          data: undefined,
          isLoading: true,
          isError: false,
          error: null,
          refetch: listState.refetch,
        };
      }

      if (listState.mode === "error") {
        return {
          data: undefined,
          isLoading: false,
          isError: true,
          error: new Error("list unavailable"),
          refetch: listState.refetch,
        };
      }

      return {
        data: {
          data: {
            data: listState.mode === "empty" ? [] : ROWS,
            meta: {},
          },
        },
        isLoading: false,
        isError: false,
        error: null,
        refetch: listState.refetch,
      };
    },
  };
});

/** An IntersectionObserver that reports everything as visible immediately. */
class VisibleObserver {
  static instances: VisibleObserver[] = [];
  private readonly nodes: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    VisibleObserver.instances.push(this);
  }

  observe(node: Element) {
    this.nodes.push(node);
  }

  unobserve() {}

  disconnect() {}

  takeRecords() {
    return [];
  }

  /** Report the given nodes as intersecting. */
  static reportVisible() {
    for (const instance of VisibleObserver.instances) {
      instance.callback(
        instance.nodes.map(
          (target) =>
            ({ isIntersecting: true, target }) as IntersectionObserverEntry
        ),
        instance as unknown as IntersectionObserver
      );
    }
  }

  static reset() {
    VisibleObserver.instances = [];
  }
}

const { NotificationPanel } = await import("./NotificationPanel");

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <NotificationPanel />
    </QueryClientProvider>
  );
}

/** Open the popover by clicking its trigger. */
async function openPanel() {
  const trigger = screen.getByRole("button", { name: /notifications/i });

  await act(async () => {
    trigger.click();
  });

  await screen.findByText("Unread one");
}

describe("NotificationPanel auto mark-as-read", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    listState.mode = "success";
    listState.refetch.mockClear();
    VisibleObserver.reset();
    markAsRead.mockClear();
    markAllAsRead.mockClear();
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("marks a notification read only after it stays visible", async () => {
    renderPanel();
    await openPanel();

    // Nothing is marked until the row reports as visible.
    expect(markAsRead).not.toHaveBeenCalled();

    act(() => VisibleObserver.reportVisible());

    // Still waiting on the dwell timer: a row that merely scrolls past must
    // not be marked.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(markAsRead).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    await waitFor(() => expect(markAsRead).toHaveBeenCalled());
  });

  it("sends one batched request for the visible unread rows", async () => {
    renderPanel();
    await openPanel();

    act(() => VisibleObserver.reportVisible());
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });

    await waitFor(() => expect(markAsRead).toHaveBeenCalledTimes(1));

    // Only the unread row is included; the already-read one is skipped.
    expect(markAsRead).toHaveBeenCalledWith({
      ids: ["11111111-1111-4111-8111-111111111111"],
    });
  });

  it("does not mark anything while the panel is closed", async () => {
    renderPanel();

    // The list query is disabled until the popover opens, so no rows exist.
    act(() => VisibleObserver.reportVisible());
    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(markAsRead).not.toHaveBeenCalled();
  });
});

describe("NotificationPanel query state boundary", () => {
  beforeEach(() => {
    listState.mode = "success";
    listState.refetch.mockClear();
    VisibleObserver.reset();
    vi.stubGlobal("IntersectionObserver", VisibleObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the panel skeleton while the list loads", async () => {
    listState.mode = "loading";
    renderPanel();
    await act(async () => {
      screen.getByRole("button", { name: /notifications/i }).click();
    });

    // The compact panel skeleton, not the full-page default.
    await waitFor(() =>
      expect(
        document.querySelectorAll('[data-slot="skeleton"]').length
      ).toBeGreaterThan(0)
    );
    expect(screen.queryByText("Unread one")).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no notifications", async () => {
    listState.mode = "empty";
    renderPanel();
    await act(async () => {
      screen.getByRole("button", { name: /notifications/i }).click();
    });

    expect(
      await screen.findByText("You have no notifications yet.")
    ).toBeInTheDocument();
  });

  it("renders a compact error state with a retry that refetches", async () => {
    listState.mode = "error";
    renderPanel();
    await act(async () => {
      screen.getByRole("button", { name: /notifications/i }).click();
    });

    expect(
      await screen.findByText("Could not load notifications")
    ).toBeInTheDocument();
    expect(screen.getByText("list unavailable")).toBeInTheDocument();

    // The panel must not surface the full-page error component.
    expect(screen.queryByText("Something Went Wrong")).not.toBeInTheDocument();

    await act(async () => {
      screen.getByRole("button", { name: /try again/i }).click();
    });

    expect(listState.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the rows through the boundary on success", async () => {
    renderPanel();
    await openPanel();

    expect(screen.getByText("Unread one")).toBeInTheDocument();
    expect(screen.getByText("Already read")).toBeInTheDocument();
  });
});
