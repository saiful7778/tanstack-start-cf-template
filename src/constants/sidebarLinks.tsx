import type {
  PermissionType,
  RoutePathType,
  SidebarGroupMenuLinkType,
  SidebarMenuLinkType,
} from "#/types";
import { House, Settings, User } from "lucide-react";

export function manageOrList(
  resource: PermissionType["resource"]
): Array<PermissionType> {
  return [
    { level: "system", resource, action: "manage" },
    { level: "system", resource, action: "list" },
  ];
}

export const sidebarMenuLinks: Array<SidebarGroupMenuLinkType> = [
  {
    groupName: "Overview",
    items: [
      {
        title: "Dashboard",
        path: "/dashboard",
        pathRegex: /^\/dashboard\/?$/,
        icon: <House />,
      },
    ],
  },
];

export const footerMenuLinks: Array<SidebarMenuLinkType> = [
  {
    title: "My Profile",
    icon: <User />,
    path: "/dashboard/profile",
    pathRegex: /^\/dashboard\/profile$/,
  },
  {
    title: "Settings",
    icon: <Settings />,
    path: "/dashboard/settings",
    pathRegex: /^\/dashboard\/settings$/,
  },
];

export const settingsMenuLinks: Array<{ title: string; path: RoutePathType }> =
  [
    {
      title: "Profile",
      path: "/dashboard/settings/profile",
    },
    {
      title: "Update Password",
      path: "/dashboard/settings/update-password",
    },
    {
      title: "Sessions",
      path: "/dashboard/settings/sessions",
    },
    {
      title: "Connected Apps",
      path: "/dashboard/settings/connected-apps",
    },
  ];
