import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIntersectionObserver } from "./use-intersection-observer";

/** A controllable stand-in for the browser's IntersectionObserver. */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  readonly observed: Element[] = [];
  readonly options: IntersectionObserverInit | undefined;
  disconnected = false;

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options?: IntersectionObserverInit
  ) {
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(node: Element) {
    this.observed.push(node);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  takeRecords() {
    return [];
  }

  /** Drive an intersection report, as the browser would. */
  emit(isIntersecting: boolean, target?: Element) {
    const node = target ?? this.observed[0];

    if (!node) throw new Error("Nothing is being observed");

    this.callback(
      [{ isIntersecting, target: node } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }

  static get last() {
    const instance = FakeIntersectionObserver.instances.at(-1);

    if (!instance) throw new Error("No observer was created");

    return instance;
  }

  static reset() {
    FakeIntersectionObserver.instances = [];
  }
}

function Probe(props: Parameters<typeof useIntersectionObserver>[0]) {
  const { ref, isIntersecting } =
    useIntersectionObserver<HTMLDivElement>(props);

  return (
    <div ref={ref} data-testid="target">
      {isIntersecting ? "visible" : "hidden"}
    </div>
  );
}

describe("useIntersectionObserver", () => {
  beforeEach(() => {
    FakeIntersectionObserver.reset();
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("observes the rendered element and reports intersection", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(<Probe onChange={onChange} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.last.observed[0]).toBe(
      getByTestId("target")
    );

    act(() => FakeIntersectionObserver.last.emit(true));

    expect(getByTestId("target")).toHaveTextContent("visible");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({ isIntersecting: true });
  });

  it("passes the configured threshold and margin through", () => {
    render(<Probe threshold={0.6} rootMargin="0px 0px -10% 0px" />);

    expect(FakeIntersectionObserver.last.options).toMatchObject({
      rootMargin: "0px 0px -10% 0px",
      threshold: [0.6],
    });
  });

  it("stops observing after the first intersection when `once`", () => {
    const onChange = vi.fn();
    render(<Probe once onChange={onChange} />);

    act(() => FakeIntersectionObserver.last.emit(true));

    expect(FakeIntersectionObserver.last.disconnected).toBe(true);

    // A late report must not fire the callback again.
    act(() => FakeIntersectionObserver.last.emit(false));

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps observing when `once` is false", () => {
    const onChange = vi.fn();
    render(<Probe onChange={onChange} />);

    act(() => FakeIntersectionObserver.last.emit(true));
    act(() => FakeIntersectionObserver.last.emit(false));

    expect(FakeIntersectionObserver.last.disconnected).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not observe while disabled", () => {
    render(<Probe enabled={false} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
  });

  it("disconnects on unmount", () => {
    const { unmount } = render(<Probe />);

    unmount();

    expect(FakeIntersectionObserver.last.disconnected).toBe(true);
  });

  it("does not recreate the observer when given an inline threshold array", () => {
    const { rerender } = render(<Probe threshold={[0, 0.5, 1]} />);
    const first = FakeIntersectionObserver.last;

    // A new array identity with the same contents must not churn the observer.
    rerender(<Probe threshold={[0, 0.5, 1]} />);

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    expect(FakeIntersectionObserver.last).toBe(first);
  });

  it("reports hidden when IntersectionObserver is unavailable", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("IntersectionObserver", undefined);

    const { getByTestId } = render(<Probe />);

    // SSR / old browsers: render succeeds and reports not-intersecting.
    expect(getByTestId("target")).toHaveTextContent("hidden");
  });
});
