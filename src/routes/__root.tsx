import { ThemeProvider } from "#/components/providers/theme-provider";
import { TooltipProvider } from "#/components/ui/tooltip";
import { requireSessions } from "#/features/auth/auth.functions";
import { globalHead } from "#/lib/head";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "react-hot-toast";

export const Route = createRootRoute({
  beforeLoad: async () => {
    const result = await requireSessions();

    return {
      user: result?.user,
      session: result?.session,
      roles: result?.roles,
      permissions: result?.permissions,
    };
  },
  head: () => globalHead(),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider defaultTheme="system" storageKey="theme">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster
            position="top-center"
            reverseOrder={true}
            gutter={6}
            toastOptions={{
              duration: 3000,
              removeDelay: 2000,
              className: "__react-hot-toast",
            }}
          />
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
