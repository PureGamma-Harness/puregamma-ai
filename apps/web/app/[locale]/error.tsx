"use client";

import { WorkspaceRecovery } from "@/components/workspace-feedback";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <WorkspaceRecovery retry={reset} />;
}
