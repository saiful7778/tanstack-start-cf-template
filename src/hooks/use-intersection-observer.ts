import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useCallbackRef } from "./use-callback-ref";

export interface UseIntersectionObserverOptions {
  /**
   * Scroll container to measure against.
   *
   * Defaults to the browser viewport, which still accounts for clipping by any
   * ancestor scroll container. Pass an element when you need a narrower root
   * (e.g. a virtualised list's viewport).
   */
  root?: Element | Document | null;
  /** Margin around the root, e.g. `"0px 0px -10% 0px"`. */
  rootMargin?: string;
  /** Visible fraction that counts as intersecting. */
  threshold?: number | number[];
  /**
   * Stop observing after the first intersection.
   *
   * Use for "seen once" side effects (marking read, lazy-loading, analytics) so
   * scrolling back and forth does not fire repeatedly.
   */
  once?: boolean;
  /** Skip observing entirely, e.g. while the item is not rendered yet. */
  enabled?: boolean;
  /** Called on every reported intersection change. */
  onChange?: (entry: IntersectionObserverEntry) => void;
}

export interface UseIntersectionObserverResult<T extends Element> {
  /** Attach to the element to observe. */
  ref: (node: T | null) => void;
  /** Latest entry, or `null` before the first report. */
  entry: IntersectionObserverEntry | null;
  /** Convenience view of `entry?.isIntersecting`. */
  isIntersecting: boolean;
}

/**
 * Observe one element's visibility.
 *
 * The observed node is held in state behind a stable ref callback, so the
 * observer is created exactly once per (node, options) pair and torn down when
 * the node unmounts — no leaks, and no double-observe on mount.
 *
 * Safe to use during SSR: without `IntersectionObserver` it reports
 * "not intersecting" and never throws.
 */
export function useIntersectionObserver<T extends Element = HTMLDivElement>({
  root = null,
  rootMargin,
  threshold = 0,
  once = false,
  enabled = true,
  onChange,
}: UseIntersectionObserverOptions = {}): UseIntersectionObserverResult<T> {
  const [node, setNode] = useState<T | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  const handleChange = useCallbackRef(onChange);
  // Latched so nothing fires again once `once` has matched.
  const hasIntersectedRef = useRef(false);

  // Stable identity: safe as a ref callback and as an effect dependency.
  const ref = useCallback((next: T | null) => setNode(next), []);

  // A stable key for the array form of `threshold`, so a caller passing an
  // inline array does not recreate the observer on every render.
  const thresholdKey = Array.isArray(threshold)
    ? threshold.join(",")
    : String(threshold);

  // Rebuild from the key so the effect depends on a primitive, not on the
  // caller's (possibly inline) array identity.
  const resolvedThreshold = useMemo(
    () => thresholdKey.split(",").map(Number),
    [thresholdKey]
  );

  useEffect(() => {
    if (!node || !enabled) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (once && hasIntersectedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const next = entries[entries.length - 1];

        if (!next) return;

        // The observer is disconnected, but a report already queued can still
        // arrive. Ignore it so a `once` observer fires exactly one callback.
        if (once && hasIntersectedRef.current) return;

        setEntry(next);
        handleChange(next);

        if (once && next.isIntersecting) {
          hasIntersectedRef.current = true;
          observer.disconnect();
        }
      },
      { root, rootMargin, threshold: resolvedThreshold }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [node, enabled, once, root, rootMargin, resolvedThreshold, handleChange]);

  return { ref, entry, isIntersecting: entry?.isIntersecting ?? false };
}
