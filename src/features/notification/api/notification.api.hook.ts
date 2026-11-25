import { useCallback, useRef } from "react";

import { formatOrpcError } from "#/oRPC/formatOrpcError";
import { orpcTQClient } from "#/oRPC/orpc";
import type { IApiHookInput } from "#/types/orpc.types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

/** Shared key prefix so every notification query is invalidated together. */
const notificationQueryKey = orpcTQClient.notification.list.queryKey({
  input: {},
});

function useInvalidateNotifications() {
  const queryClient = useQueryClient();

  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpcTQClient.notification.list.queryKey({ input: {} }),
        exact: false,
      }),
      queryClient.invalidateQueries({
        queryKey: orpcTQClient.notification.unreadCount.queryKey(),
      }),
    ]);
  };
}

export function useNotificationList(
  input: Parameters<
    typeof orpcTQClient.notification.list.queryOptions
  >[0]["input"]
) {
  return useQuery(
    orpcTQClient.notification.list.queryOptions({
      input,
    })
  );
}

export function useUnreadNotificationCount() {
  return useQuery({
    ...orpcTQClient.notification.unreadCount.queryOptions(),
    staleTime: 30_000,
  });
}

export function useNotificationSettings() {
  return useQuery(orpcTQClient.notification.settings.queryOptions());
}

export function useNotificationSettingsUpdate<TFieldNames>({
  onSuccess,
  onError,
  onRequestStart,
  onRequestEnd,
  onValidationErrors,
}: IApiHookInput<TFieldNames> = {}) {
  const toastId = "update_notification_setting_toast";
  const invalidate = useInvalidateNotifications();

  return useMutation(
    orpcTQClient.notification.updateSettings.mutationOptions({
      onMutate: () => {
        toast.loading("Updating...", { id: toastId });
        onRequestStart?.();
      },
      onSuccess: async ({ message }) => {
        toast.success(message, { id: toastId });
        await invalidate();
        onSuccess?.(message);
      },
      onError: (error) => {
        const { message, type, fieldErrors } =
          formatOrpcError<TFieldNames>(error);

        if (type === "validation" && fieldErrors) {
          onValidationErrors?.(fieldErrors);
        }

        toast.error(message, { id: toastId });
        onError?.(message);
      },
      onSettled: () => {
        onRequestEnd?.();
      },
    })
  );
}

export function useNotificationMarkAsRead<TFieldNames>({
  onSuccess,
  onError,
  onRequestStart,
  onRequestEnd,
}: Omit<IApiHookInput<TFieldNames>, "onValidationErrors"> = {}) {
  const invalidate = useInvalidateNotifications();
  const inFlightRef = useRef(new Set<string>());

  const mutation = useMutation(
    orpcTQClient.notification.markAsRead.mutationOptions({
      onMutate: () => {
        onRequestStart?.();
      },
      onSuccess: async ({ message }) => {
        await invalidate();
        onSuccess?.(message);
      },
      onError: (error) => {
        const { message } = formatOrpcError(error);
        onError?.(message);
      },
      onSettled: () => {
        onRequestEnd?.();
      },
    })
  );

  const { mutate } = mutation;

  /**
   * Mark notifications read, skipping ids already being marked.
   *
   * Batch surfaces call this repeatedly as rows scroll into view, and the same
   * row can be reported more than once (observer re-attach, rapid scroll). The
   * guard keeps that from firing duplicate requests for one id.
   */
  const markAsRead = useCallback(
    (input: { ids: string[] }) => {
      const ids = input.ids.filter((id) => !inFlightRef.current.has(id));

      if (ids.length === 0) return;

      for (const id of ids) inFlightRef.current.add(id);

      mutate(
        { ids },
        {
          onSettled: () => {
            for (const id of ids) inFlightRef.current.delete(id);
          },
        }
      );
    },
    [mutate]
  );

  return { ...mutation, mutate, markAsRead };
}

export function useNotificationMarkAllAsRead<TFieldNames>({
  onSuccess,
  onError,
  onRequestStart,
  onRequestEnd,
}: Omit<IApiHookInput<TFieldNames>, "onValidationErrors"> = {}) {
  const toastId = "mark_all_notifications_read_toast";
  const invalidate = useInvalidateNotifications();

  return useMutation(
    orpcTQClient.notification.markAllAsRead.mutationOptions({
      onMutate: () => {
        toast.loading("Updating...", { id: toastId });
        onRequestStart?.();
      },
      onSuccess: async ({ message }) => {
        toast.success(message, { id: toastId });
        await invalidate();
        onSuccess?.(message);
      },
      onError: (error) => {
        const { message } = formatOrpcError(error);
        toast.error(message, { id: toastId });
        onError?.(message);
      },
      onSettled: () => {
        onRequestEnd?.();
      },
    })
  );
}

export function usePushSubscription<TFieldNames>({
  onSuccess,
  onError,
  onRequestStart,
  onRequestEnd,
}: Omit<IApiHookInput<TFieldNames>, "onValidationErrors"> = {}) {
  const toastId = "notification_push_subscription_toast";
  const queryClient = useQueryClient();

  const invalidateSettings = async () => {
    await queryClient.invalidateQueries({
      queryKey: orpcTQClient.notification.settings.queryKey(),
    });
  };

  const subscribe = useMutation(
    orpcTQClient.notification.subscribe.mutationOptions({
      onMutate: () => {
        toast.loading("Updating...", { id: toastId });
        onRequestStart?.();
      },
      onSuccess: async ({ message }) => {
        toast.success(message, { id: toastId });
        await invalidateSettings();
        onSuccess?.(message);
      },
      onError: (error) => {
        const { message } = formatOrpcError(error);
        toast.error(message, { id: toastId });
        onError?.(message);
      },
      onSettled: () => {
        onRequestEnd?.();
      },
    })
  );

  const unsubscribe = useMutation(
    orpcTQClient.notification.unsubscribe.mutationOptions({
      onMutate: () => {
        toast.loading("Updating...", { id: toastId });
        onRequestStart?.();
      },
      onSuccess: async ({ message }) => {
        toast.success(message, { id: toastId });
        await invalidateSettings();
        onSuccess?.(message);
      },
      onError: (error) => {
        const { message } = formatOrpcError(error);
        toast.error(message, { id: toastId });
        onError?.(message);
      },
      onSettled: () => {
        onRequestEnd?.();
      },
    })
  );

  return { subscribe, unsubscribe };
}

export { notificationQueryKey };
