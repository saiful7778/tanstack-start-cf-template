import { useEffect } from "react";

/**
 * Registers the Serwist service worker in the browser.
 *
 * Registration is idempotent (`Serwist.register` reuses the existing
 * registration), so mounting this provider once per document is enough.
 */
export function SerwistProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const state = { cancelled: false };

    (async () => {
      try {
        const { getSerwist } = await import("virtual:serwist");
        const serwist = await getSerwist();

        if (state.cancelled) return;

        await serwist?.register();
      } catch (error) {
        // A failed registration must never break the app; the page simply
        // runs without offline support and push.
        console.error("Service worker registration failed:", error);
      }
    })();

    return () => {
      state.cancelled = true;
    };
  }, []);

  return children;
}
