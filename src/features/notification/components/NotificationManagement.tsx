import { useCallback, useState } from "react";

import { MetaPagination } from "#/components/MetaPagination";
import { QueryStateBoundary } from "#/components/tanstack-query/query-state-boundary";
import { Button } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import {
  NotificationCategoryEnumSchema,
  type NotificationCategoryEnumType,
} from "#/db/schemas/enums/zod-db-enums";
import { useDebouncedCallback } from "#/hooks/use-debounced-callback";
import { useSearchFilter } from "#/hooks/use-search-filter";
import { orpcTQClient } from "#/oRPC/orpc";
import { formatEnumValue } from "#/utils/formatEnum";
import { useQuery } from "@tanstack/react-query";
import { CheckCheck, CircleQuestionMark } from "lucide-react";

import { useNotificationMarkAllAsRead } from "../api/notification.api.hook";
import { NotificationItem } from "./NotificationItem";

export function NotificationManagement({
  search,
  searchFields,
}: {
  search: string | null | undefined;
  searchFields?: string[] | null | undefined;
}) {
  "use no memo";
  const { filters, setFilters } = useSearchFilter(
    "/dashboard/_dashboardLayout/notifications"
  );
  const [inputValue, setInputValue] = useState<string>(search ?? "");

  const { data, isLoading, isError, error } = useQuery(
    orpcTQClient.notification.list.queryOptions({
      input: {
        page: filters.page,
        limit: filters.limit,
        search: filters.search,
        searchFields,
        order: filters.order,
        orderField: filters.orderField,
        filter: {
          category: filters.category,
          level: filters.level,
        },
      },
    })
  );

  const handleCategoryChange = useCallback(
    (category: NotificationCategoryEnumType | undefined) => {
      // A narrower filter can leave the current page empty, so reset to the
      // first page whenever the result set changes.
      setFilters({ category, page: 1 });
    },
    [setFilters]
  );

  const { mutate: markAllAsRead, isPending } = useNotificationMarkAllAsRead();

  // The button promises "all", and the endpoint marks every unread row for the
  // user — the visible page is not the whole story.
  const handleMarkAllAsRead = useCallback(() => {
    markAllAsRead();
  }, [markAllAsRead]);

  const globalSearch = useDebouncedCallback(
    (searchValue: string | undefined) => {
      setFilters({ search: searchValue, page: 1 });
    },
    500
  );

  const handleOnChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    globalSearch(value);
    setInputValue(value);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between">
        <Input
          name="search"
          placeholder="Search...."
          className="w-37 lg:w-62"
          value={inputValue}
          onChange={handleOnChange}
        />
        <Button
          variant="secondary"
          onClick={handleMarkAllAsRead}
          disabled={isPending}
          aria-disabled={isPending}
        >
          <CheckCheck />
          <span>Mark all read</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={filters.category === undefined ? "default" : "outline"}
          onClick={() => handleCategoryChange(undefined)}
        >
          All
        </Button>
        {NotificationCategoryEnumSchema.options.map((category) => (
          <Button
            key={category}
            variant={filters.category === category ? "default" : "outline"}
            onClick={() => handleCategoryChange(category)}
          >
            {formatEnumValue(category)}
          </Button>
        ))}
      </div>
      <QueryStateBoundary
        isLoading={isLoading}
        isError={isError}
        error={error}
        data={data?.data}
        isEmpty={(d) => d.data.length === 0}
        emptyFallback={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleQuestionMark />
              </EmptyMedia>
              <EmptyTitle>No data</EmptyTitle>
              <EmptyDescription>No Notification found</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      >
        {({ data: notificationData, meta }) => (
          <>
            <div className="flex flex-col gap-3">
              {notificationData.map((notification) => (
                <div
                  className="overflow-hidden rounded-md border bg-card shadow"
                  key={notification.id}
                >
                  <NotificationItem
                    notification={notification}
                    className="px-3 py-3"
                  />
                </div>
              ))}
            </div>
            <MetaPagination
              meta={meta}
              onPageChange={(page) => setFilters({ page })}
            />
          </>
        )}
      </QueryStateBoundary>
    </div>
  );
}
