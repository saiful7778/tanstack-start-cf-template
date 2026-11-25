import { UserAvatar } from "#/components/UserAvatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { DEFAULT_UNAUTH_PATH } from "#/constants";
import { authClient } from "#/features/auth/auth.client";
import { useAuthStore } from "#/zustand/auth/AuthStoreContext";
import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import {
  KeyRound,
  LogOut,
  MonitorSmartphone,
  Plug,
  Settings,
  UserRound,
  UserRoundPen,
} from "lucide-react";
import toast from "react-hot-toast";

export function TopbarUser() {
  const navigate = useNavigate();
  const router = useRouter();
  const { pathname } = useLocation();

  const user = useAuthStore((state) => state.user);

  const handleLogout = createClientOnlyFn(async () => {
    const toastId = "sign_out_toast_message";

    await authClient.signOut({
      fetchOptions: {
        onRequest: () => {
          toast.loading("Logging out...", { id: toastId });
        },
        onSuccess: () => {
          toast.success("Logged out successfully", {
            id: toastId,
          });
          router.invalidate();
          navigate({
            href: `${DEFAULT_UNAUTH_PATH}?redirect=${pathname}`,
          });
        },
        onError: () => {
          toast.error("Failed to log out. Please try again", {
            id: toastId,
          });
        },
      },
    });
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="size-8">
        <UserAvatar
          userEmail={user.email}
          imageUrl={user.image}
          userName={user.name}
          isActive
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
        side="bottom"
        align="end"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <UserAvatar
              userEmail={user.email}
              imageUrl={user.image}
              userName={user.name}
              showDetails
              isActive
            />
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link to="/dashboard/profile" />}>
            <UserRound />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Settings />
              <span>Settings</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                render={<Link to="/dashboard/settings/profile" />}
              >
                <UserRoundPen />
                <span>Edit profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link to="/dashboard/settings/update-password" />}
              >
                <KeyRound />
                <span>Update password</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link to="/dashboard/settings/sessions" />}
              >
                <MonitorSmartphone />
                <span>Sessions</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link to="/dashboard/settings/connected-apps" />}
              >
                <Plug />
                <span>Connected apps</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
