import { useCallback, useState } from "react";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import type {
  NotificationCategoryEnumType,
  NotificationLevelEnumType,
} from "#/db/schemas/enums/zod-db-enums";
import { cn } from "cn";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Headphones,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useNotificationMarkAsRead } from "../api/notification.api.hook";
import type { ListNotificationContractType } from "../api/notification.contract";

interface CategoryConfig {
  label: string;
  Icon: LucideIcon;
}

/**
 * Keyed by the database enum, so a category without an icon is a type error
 * rather than a render crash.
 */
const CATEGORY_CONFIG: Record<NotificationCategoryEnumType, CategoryConfig> = {
  SYSTEM: { label: "System", Icon: Settings2 },
  AUTH: { label: "Auth", Icon: ShieldAlert },
  SUPPORT: { label: "Support", Icon: Headphones },
};

/** Rows are validated server-side, but an unknown value must still render. */
const FALLBACK_CATEGORY: CategoryConfig = { label: "Other", Icon: Building2 };

/** Widened view used for lookups so unknown runtime values fall back. */
const categoryConfigByKey: Record<string, CategoryConfig> = CATEGORY_CONFIG;

interface LevelConfig {
  iconClass: string;
  bgClass: string;
}

const LEVEL_CONFIG: Record<NotificationLevelEnumType, LevelConfig> = {
  INFO: {
    iconClass: "text-blue-400",
    bgClass: "bg-blue-500/10",
  },
  SUCCESS: {
    iconClass: "text-emerald-400",
    bgClass: "bg-emerald-500/10",
  },
  WARNING: {
    iconClass: "text-amber-400",
    bgClass: "bg-amber-500/10",
  },
  ERROR: {
    iconClass: "text-red-400",
    bgClass: "bg-red-500/10",
  },
};

const FALLBACK_LEVEL: LevelConfig = LEVEL_CONFIG.INFO;

/** Widened view used for lookups so unknown runtime values fall back. */
const levelConfigByKey: Record<string, LevelConfig> = LEVEL_CONFIG;

function timeAgo(date: string | Date) {
  const time = new Date(date).getTime();

  if (Number.isNaN(time)) return "unknown";

  const diff = Date.now() - time;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface NotificationItemProps extends React.ComponentProps<"div"> {
  notification: ListNotificationContractType["output"]["data"]["data"][number];
  /**
   * Mark read imperatively instead of mutating per row.
   *
   * Batch contexts (the popover list) pass a shared handler so rows scrolling
   * into view during one scroll commit into a single request, and so a row is
   * observed only once. When omitted, the item mutates on its own.
   */
  onMarkAsRead?: (id: string) => void;
  /** Disable the manual button when the caller owns the mutation. */
  isMarkingAsRead?: boolean;
}

export function NotificationItem({
  notification,
  className,
  onMarkAsRead,
  isMarkingAsRead,
  ...props
}: NotificationItemProps) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const level = levelConfigByKey[notification.level] ?? FALLBACK_LEVEL;
  const { Icon, label } =
    categoryConfigByKey[notification.category] ?? FALLBACK_CATEGORY;

  const { mutate: markAsReadSelf, isPending: isPendingSelf } =
    useNotificationMarkAsRead();

  const handleToggleExpanded = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      setExpanded((p) => !p);
    },
    []
  );

  const handleMarkAsRead = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();

      if (onMarkAsRead) {
        onMarkAsRead(notification.id);
        return;
      }

      markAsReadSelf({ ids: [notification.id] });
    },
    [notification.id, onMarkAsRead, markAsReadSelf]
  );

  const isPending = isMarkingAsRead ?? isPendingSelf;

  return (
    <div
      className={cn(
        "group relative flex gap-3 py-3 pr-3 pl-2 transition-colors duration-150 select-none",
        notification.isRead
          ? "hover:bg-secondary/50"
          : "bg-accent/10 hover:bg-accent/20",
        className
      )}
      {...props}
    >
      {/* Category Icon */}
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          level.bgClass
        )}
      >
        <Icon className={cn("size-4", level.iconClass)} />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        {/* Meta row */}
        <div className="flex w-full flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-4 rounded px-1.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
          >
            {label}
          </Badge>
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {timeAgo(notification.createdAt)}
          </span>
        </div>

        {/* Title */}
        <p className="text-sm leading-snug font-medium">{notification.title}</p>

        {/* Message */}
        <p
          className={cn(
            "text-xs leading-relaxed text-muted-foreground",
            !expanded && "line-clamp-1"
          )}
        >
          {notification.message}
        </p>

        {/* Expand toggle */}
        <button
          type="button"
          className="inline-flex w-fit cursor-pointer items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? "Show less" : "Show more"}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" />
              <span>less</span>
            </>
          ) : (
            <>
              <ChevronDown className="size-4" />
              <span>more</span>
            </>
          )}
        </button>

        {!notification.isRead && (
          <Button
            size="xs"
            variant="outline"
            className="cursor-pointer"
            onClick={handleMarkAsRead}
            disabled={isPending}
            aria-disabled={isPending}
          >
            <Check />
            <span>Mark read</span>
          </Button>
        )}
      </div>
    </div>
  );
}
