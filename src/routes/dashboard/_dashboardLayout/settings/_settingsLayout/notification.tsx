import { Spinner } from "#/components/ui/spinner";
import { UpdateNotificationForm } from "#/features/notification/components/forms/UpdateNotificationForm";
import { head } from "#/lib/head";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/dashboard/_dashboardLayout/settings/_settingsLayout/notification"
)({
  head: ({ match }) =>
    head({ pathname: match.pathname, titleByTemplate: "Notifications" }),
  pendingComponent: LoadingComponent,
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Notification Settings</h1>
        <p className="text-muted-foreground">
          Configure notification settings for your account
        </p>
      </div>
      <UpdateNotificationForm />
    </div>
  );
}

function LoadingComponent() {
  return (
    <div className="flex w-full items-center justify-center p-4">
      <Spinner className="size-14 text-primary" strokeWidth={1} />
    </div>
  );
}
