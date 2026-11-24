interface UpdateUserClient {
  updateUser: (input: { name: string }) => Promise<unknown>;
}

export async function updateUserProfile(
  client: UpdateUserClient,
  name: string
) {
  await client.updateUser({ name });
}
