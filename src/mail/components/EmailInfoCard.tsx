/** @jsxRuntime automatic */
import { Section } from "react-email";

export function EmailInfoCard({ children }: { children: React.ReactNode }) {
  return (
    <Section className="my-4 rounded-md border border-border bg-card p-4">
      {children}
    </Section>
  );
}
