import { head } from "#/lib/head";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  head: ({ match }) =>
    head({ pathname: match.pathname, titleByTemplate: "About" }),
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/about"!</div>;
}
