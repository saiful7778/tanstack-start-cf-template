import { useState } from "react";

import { ThemeChanger } from "#/components/theme-changer";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { APP_NAME } from "#/constants";
import { head } from "#/lib/head";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Cloud,
  Copy,
  Database,
  Route as RouteIcon,
  Server,
  ShieldCheck,
  Terminal,
  Wind,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: ({ match }) =>
    head({ pathname: match.pathname, titleByTemplate: "Home" }),
  component: Home,
});

const stack = [
  {
    title: "TanStack Start",
    description:
      "Full-stack React with SSR and server functions, rendered at the edge.",
    icon: Server,
  },
  {
    title: "File-based routing",
    description:
      "Type-safe routes generated from src/routes — no manual route config.",
    icon: RouteIcon,
  },
  {
    title: "Cloudflare Workers",
    description:
      "Ships to the edge with nodejs_compat and the Cloudflare Vite plugin.",
    icon: Cloud,
  },
  {
    title: "Tailwind v4 + shadcn",
    description:
      "Token-driven theming with light and dark mode and a full UI kit.",
    icon: Wind,
  },
  {
    title: "Drizzle + D1",
    description:
      "Typed SQL schema, migrations and queries backed by Cloudflare D1.",
    icon: Database,
  },
  {
    title: "Auth + typed RPC",
    description:
      "Sessions with better-auth and end-to-end typed oRPC endpoints.",
    icon: ShieldCheck,
  },
] as const;

const commands = [
  { command: "pnpm dev", description: "Start the dev server on port 3000" },
  { command: "pnpm build", description: "Build the Worker bundle" },
  { command: "pnpm deploy", description: "Ship it to production" },
] as const;

function Home() {
  const { user } = Route.useRouteContext();
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(
        () => setCopied((current) => (current === value ? null : current)),
        1600
      );
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-48 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />

      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 font-heading font-semibold"
        >
          <img src="/sitelogo.png" alt="" className="size-7 rounded-md" />
          <span className="hidden text-sm sm:inline">{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden cursor-pointer sm:inline-flex"
            render={<Link to="/about" />}
          >
            About
          </Button>
          {user ? (
            <Button
              size="sm"
              className="cursor-pointer"
              render={<Link to="/dashboard" />}
            >
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                render={<Link to="/sign-in" />}
              >
                Sign in
              </Button>
              <Button
                size="sm"
                className="cursor-pointer"
                render={<Link to="/sign-up" />}
              >
                Sign up
              </Button>
            </>
          )}
          <ThemeChanger />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-6">
        <section className="py-20 text-center sm:py-28">
          <Badge variant="outline" className="h-6 gap-1.5 px-2.5">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
            />
            Cloudflare Workers ready
          </Badge>

          <h1 className="mx-auto mt-6 max-w-3xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            A production-ready{" "}
            <span className="text-primary">TanStack Start</span> template
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
            Router, SSR, Tailwind, Drizzle, auth and typed RPC — already wired
            up and running on Cloudflare&apos;s edge. Delete what you don&apos;t
            need and start building.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              className="cursor-pointer"
              render={<Link to="/dashboard" />}
            >
              Open the dashboard
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="cursor-pointer"
              render={<a href="#stack" />}
            >
              See what&apos;s included
            </Button>
          </div>
        </section>

        <section id="stack" className="scroll-mt-24 pb-20">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-xl font-semibold tracking-tight">
                What&apos;s already wired up
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Six pieces of infrastructure you don&apos;t have to set up
                again.
              </p>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Ready to ship
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stack.map((item) => (
              <Card
                key={item.title}
                className="h-full transition-colors duration-200 hover:bg-muted/40"
              >
                <CardHeader>
                  <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="size-4.5" aria-hidden="true" />
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {item.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        <section className="pb-20">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Quick commands
              </CardTitle>
              <CardDescription>From zero to deployed.</CardDescription>
            </CardHeader>
            <div className="px-4">
              <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                {commands.map((item) => (
                  <li
                    key={item.command}
                    className="flex items-center gap-3 bg-muted/30 px-3 py-2.5"
                  >
                    <code className="flex-1 font-mono text-xs text-foreground sm:text-sm">
                      {item.command}
                    </code>
                    <span className="hidden text-xs text-muted-foreground sm:block">
                      {item.description}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="cursor-pointer"
                      onClick={() => copy(item.command)}
                      aria-label={`Copy ${item.command}`}
                    >
                      {copied === item.command ? (
                        <Check className="text-primary" aria-hidden="true" />
                      ) : (
                        <Copy aria-hidden="true" />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
              <span role="status" aria-live="polite" className="sr-only">
                {copied ? `${copied} copied to clipboard` : ""}
              </span>
            </div>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <p>Built with TanStack Start, Tailwind CSS and Cloudflare Workers.</p>
          <p>
            Edit{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground">
              src/routes/index.tsx
            </code>{" "}
            to make it yours.
          </p>
        </div>
      </footer>
    </div>
  );
}
