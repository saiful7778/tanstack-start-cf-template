import { DateTimePickerField } from "#/components/form-fields/DateTimePickerField";
import { InputField } from "#/components/form-fields/InputField";
import { Button } from "#/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Spinner } from "#/components/ui/spinner";
import { Switch } from "#/components/ui/switch";
import { useAuthStore } from "#/zustand/auth/AuthStoreContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";

import { useUserBan } from "../../api/user.api.hook";
import type { UserBannedType } from "../../user.schema";
import { userBannedSchema } from "../../user.schema";

interface UserBannedFormProps {
  initialData: UserBannedType;
  onSuccess?: () => void;
}

const now = Date.now();

export function UserBannedForm({
  initialData,
  onSuccess,
}: UserBannedFormProps) {
  "use no memo";

  const user = useAuthStore((state) => state.user);
  const form = useForm<UserBannedType>({
    resolver: zodResolver(userBannedSchema),
    defaultValues: initialData,
  });

  const { mutate, isPending } = useUserBan<keyof UserBannedType>({
    onSuccess: () => {
      onSuccess?.();
    },
    onValidationErrors: (fields) => {
      fields.forEach(({ fieldName, message }) => {
        form.setError(fieldName, {
          message,
        });
      });
    },
  });

  const handleSubmit = (e: UserBannedType) => {
    mutate(e);
  };

  const isBanned = useWatch({
    control: form.control,
    name: "banned",
  });

  return (
    <div className="rounded-md border p-3 pt-0 shadow">
      <h5 className="-mt-3 w-fit bg-background px-2 text-sm font-medium">
        Banned Settings
      </h5>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="mt-2">
        <FieldGroup>
          <Controller
            control={form.control}
            name="banned"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState}>
                <div className="flex h-10 flex-row items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-base selection:bg-primary dark:bg-input/30">
                  <FieldLabel htmlFor="banned" aria-disabled={isPending}>
                    Banned
                  </FieldLabel>
                  <div className="flex w-auto items-center justify-end">
                    <Switch
                      id="banned"
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (!checked) {
                          form.setValue("banReason", undefined);
                          form.setValue("banExpires", undefined);
                        }
                      }}
                      disabled={isPending}
                      aria-disabled={isPending}
                    />
                  </div>
                </div>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          {isBanned && (
            <>
              <InputField
                control={form.control}
                name="banReason"
                placeholder="Banned Reason"
                disabled={isPending}
              />
              <DateTimePickerField
                control={form.control}
                name="banExpires"
                placeholder="Banned Expires"
                timezone={user.timezone}
                disabled={isPending}
                showTimeSelection={false}
                calendarProps={{
                  disabled: {
                    before: new Date(now),
                  },
                }}
              />
            </>
          )}
          <div className="text-right">
            <Button
              disabled={!form.formState.isDirty || isPending}
              aria-disabled={!form.formState.isDirty || isPending}
              type="submit"
            >
              {isPending ? <Spinner /> : "Update"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
