import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Popover, PopoverTrigger } from "#/components/ui/popover";
import { Bell } from "lucide-react";

import { useUnreadNotificationCount } from "../api/notification.api.hook";
import { NotificationPanelContent } from "./NotificationPanelContent";

/**
 * The topbar notification bell.
 *
 * Deliberately thin: it owns the popover open state and the unread badge, and
 * renders {@link NotificationPanelContent} only while open. The list query and
 * every delivery-side effect live in the content component, so mounting the
 * bell on each dashboard page costs one cached unread count and nothing else.
 */
export function NotificationPanel() {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // The badge must count every unread row, not the rows on the first page.
  const { data: unread } = useUnreadNotificationCount();
  const unreadCount = unread?.data.count ?? 0;

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger
        render={
          <Button
            size="icon-lg"
            variant="secondary"
            className="relative cursor-pointer"
            aria-label={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          />
        }
      >
        <Bell />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 z-10 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <NotificationPanelContent enabled={isPopoverOpen} />
    </Popover>
  );
}
