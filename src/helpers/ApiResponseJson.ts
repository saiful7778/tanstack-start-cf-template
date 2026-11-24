export function ApiResponseJson<T>(
  success: boolean = true,
  message: string,
  data: T | undefined = undefined,
  status: number = 200
) {
  return Response.json({ success, message, data }, { status });
}
