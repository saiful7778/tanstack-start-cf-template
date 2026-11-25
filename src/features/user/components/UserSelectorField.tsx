import { useEffect, useState } from "react";

import { UserAvatar } from "#/components/UserAvatar";
import { SearchableSelectorField } from "#/components/form-fields/SearchableSelectorField";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import {
  SearchableSelectorEmpty,
  SearchableSelectorLoadingSkeleton,
} from "#/components/ui/searchable-selector";
import { Skeleton } from "#/components/ui/skeleton";
import { orpcTQClient } from "#/oRPC/orpc";
import { resolveUserImage } from "#/utils/resolveUserImage";
import { strInitials } from "#/utils/strInitials";
import { useQuery } from "@tanstack/react-query";
import { UserSearch, X } from "lucide-react";
import type { Control, FieldValues, Path } from "react-hook-form";

interface UserSelectorFieldProps<TFieldValues extends FieldValues> {
  name: Path<TFieldValues>;
  control: Control<TFieldValues>;
  label?: string;
  description?: string;
  isDescriptionInfoIconShow?: boolean;
  requiredField?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  fetchApi?: boolean;
}

export function UserSelectorField<TFieldValues extends FieldValues>({
  name,
  control,
  label,
  description,
  isDescriptionInfoIconShow,
  requiredField,
  disabled = false,
  multiple = false,
  fetchApi = false,
}: UserSelectorFieldProps<TFieldValues>) {
  const [search, setSearch] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, error } = useQuery(
    orpcTQClient.user.listForSearch.queryOptions({
      input: {
        search,
        searchFields: ["name", "email"],
        page: 1,
        limit: 5,
      },
      enabled: fetchApi,
      select: (result) => result.data,
    })
  );

  type UserItem = NonNullable<typeof data>[number];

  const [knownUsers, setKnownUsers] = useState<Map<string, UserItem>>(
    () => new Map()
  );

  useEffect(() => {
    if (!data) return;
    queueMicrotask(() => {
      setKnownUsers((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const user of data) {
          if (!next.has(user.id)) {
            next.set(user.id, user);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
  }, [data]);

  const placeholder = multiple ? "Select Users" : "Select User";

  return (
    <SearchableSelectorField<TFieldValues, UserItem>
      name={name}
      control={control}
      label={label}
      description={description}
      isDescriptionInfoIconShow={isDescriptionInfoIconShow}
      requiredField={requiredField}
      disabled={disabled}
      multiple={multiple}
      placeholder={placeholder}
      onSearch={setSearch}
      data={data}
      isLoading={isLoading}
      isError={isError}
      error={error}
      title={placeholder}
      contentDescription={multiple ? "Select users" : "Select a user"}
      loadingFallback={
        <SearchableSelectorLoadingSkeleton>
          <Skeleton className="h-8" />
        </SearchableSelectorLoadingSkeleton>
      }
      emptyFallback={
        <SearchableSelectorEmpty
          message="No users found"
          icon={<UserSearch className="size-8 opacity-20" />}
        />
      }
      getItemId={(user) => user.id}
      renderBeforeTrigger={({ selectedIds, onChange }) => {
        const selectedUsers = selectedIds
          .map((userId) => knownUsers.get(userId))
          .filter((user): user is UserItem => Boolean(user));

        if (!multiple || selectedUsers.length === 0) return null;

        return (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedUsers.map((user) => (
              <span
                key={user.id}
                className="flex items-center gap-1.5 rounded-md border bg-muted/50 px-1 py-1 text-xs"
              >
                <Avatar className="size-5">
                  <AvatarImage
                    src={resolveUserImage(user.image)}
                    alt={user.name}
                  />
                  <AvatarFallback className="text-xs font-semibold uppercase">
                    {strInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="max-w-32 truncate">{user.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    onChange(selectedIds.filter((id) => id !== user.id))
                  }
                  disabled={disabled}
                  aria-label={`Remove ${user.name}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        );
      }}
      renderTrigger={({ selectedIds }) => (
        <>
          <UserSearch className="size-4" />
          {multiple ? (
            selectedIds.length > 0 ? (
              <span className="truncate">{`${selectedIds.length} selected`}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )
          ) : selectedIds[0] ? (
            <span className="truncate">
              {knownUsers.get(selectedIds[0])?.name}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </>
      )}
      renderItem={(item) => (
        <UserAvatar
          userName={item.name}
          userEmail={item.email}
          imageUrl={item.image}
          userRoles={item.roles}
          showDetails
          showRoleDetails
        />
      )}
    />
  );
}
