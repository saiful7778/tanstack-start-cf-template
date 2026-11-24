import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { ProfileUpdateForm } from "#/features/auth/components/ProfileUpdateForm";
import { head } from "#/lib/head";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/dashboard/_dashboardLayout/settings/_settingsLayout/profile"
)({
  head: ({ match }) =>
    head({
      pathname: match.pathname,
      titleByTemplate: "Profile Settings",
    }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Update Profile</CardTitle>
      </CardHeader>
      <CardContent>
        <ProfileUpdateForm />
      </CardContent>
    </Card>
  );
}
