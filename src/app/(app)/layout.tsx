import { AppShell } from "@/components/AppShell";
import {
  requirePageSession,
  projectOptions,
  integrationState,
} from "@/lib/workspace";
import { navCounts } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requirePageSession();
  const [projects, counts, integrations] = await Promise.all([
    projectOptions(),
    navCounts(user.timezone),
    integrationState(),
  ]);

  return (
    <AppShell
      projects={projects}
      counts={counts}
      timeZone={user.timezone}
      aiConfigured={integrations.aiConfigured}
      isAdmin={user.role === "ADMIN"}
      displayName={user.displayName}
      username={user.username}
    >
      {children}
    </AppShell>
  );
}
