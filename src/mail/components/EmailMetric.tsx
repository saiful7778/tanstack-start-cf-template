/** @jsxRuntime automatic */
import { Column, Text } from "react-email";

export function EmailMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Column className="w-1/2 rounded-md border border-border bg-card p-3">
      <Text className="m-0 mb-1 text-xs text-muted-foreground">{label}</Text>
      <Text className="m-0 text-base font-bold text-foreground">{value}</Text>
    </Column>
  );
}
