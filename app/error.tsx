"use client";

// Error boundaries must be client components. This catches anything the
// page's own database-error state does not.

import { ErrorState } from "@/components/error-state";

export default function TodayError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-180 px-4 pb-16">
      <ErrorState message="Couldn't show today's list." reset={reset} />
    </main>
  );
}
