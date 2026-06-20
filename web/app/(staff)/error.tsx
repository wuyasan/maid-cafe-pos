"use client";
import { ErrorBoundaryView } from "@/components/ui/ErrorBoundaryView";

export default function StaffError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorBoundaryView reset={reset} />;
}
