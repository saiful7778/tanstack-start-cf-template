import { useState } from "react";

import { InputField } from "#/components/form-fields/InputField";
import { ButtonSpinner } from "#/components/ui/button-spinner";
import { FieldGroup } from "#/components/ui/field";
import { useAuthStore } from "#/zustand/auth/AuthStoreContext";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { authClient } from "../auth.client";
import { profileUpdateSchema, type ProfileUpdateType } from "../auth.schema";
import { updateUserProfile } from "../profileUpdate";

export function ProfileUpdateForm() {
  "use no memo";
  const user = useAuthStore((state) => state.user);
  const addUserData = useAuthStore((state) => state.addUserData);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<ProfileUpdateType>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      name: user.name,
      email: user.email,
    },
  });

  const handleSubmit = form.handleSubmit(
    createClientOnlyFn(async (values: ProfileUpdateType) => {
      setIsPending(true);

      try {
        await updateUserProfile(authClient, values.name);
        addUserData({ ...user, name: values.name });
        form.reset(values);
        toast.success("Profile updated");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update profile"
        );
      } finally {
        setIsPending(false);
      }
    })
  );

  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup>
        <InputField
          control={form.control}
          name="name"
          type="text"
          label="Name"
          placeholder="Name"
          disabled={isPending}
        />
        <InputField
          control={form.control}
          name="email"
          type="email"
          label="Email address"
          placeholder="Email Address"
          description="you can't update your email address."
          disabled
        />
        <ButtonSpinner className="w-fit" type="submit" isLoading={isPending}>
          Submit
        </ButtonSpinner>
      </FieldGroup>
    </form>
  );
}
