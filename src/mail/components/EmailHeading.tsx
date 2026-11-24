/** @jsxRuntime automatic */
import { Text } from "react-email";

export function EmailHeading({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mt-0 mb-2 text-lg font-bold text-foreground">
      {children}
    </Text>
  );
}
