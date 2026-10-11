/** 页面级数据加载，供各任务视图复用。 */

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { capabilities } from "@/server/settings/service";
import { queryTasks } from "@/server/tasks/queries";
import type { TaskView } from "@/server/tasks/queries";
import type { ProjectOption } from "@/lib/types";

export async function requirePageSession() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function projectOptions(): Promise<ProjectOption[]> {
  const user = await requirePageSession();
  const projects = await prisma.project.findMany({
    where: { ownerId: user.id, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true, repoUrl: true },
  });
  return projects;
}

export async function integrationState() {
  return capabilities(await requirePageSession());
}

export async function loadWorkspacePage(
  view: TaskView,
  options: {
    projectId?: string;
    query?: string | null;
    status?: string | null;
    priority?: string | null;
    tag?: string | null;
    sort?: string | null;
  } = {},
) {
  const user = await requirePageSession();
  const [tasks, projects, integrations] = await Promise.all([
    queryTasks(user, {
      view,
      timeZone: user.timezone,
      projectId: options.projectId ?? null,
      query: options.query ?? null,
      status: options.status ?? null,
      priority: options.priority ?? null,
      tag: options.tag ?? null,
      sort: options.sort ?? null,
    }),
    projectOptions(),
    integrationState(),
  ]);

  return { user, timeZone: user.timezone, tasks: tasks.tasks, nextCursor: tasks.nextCursor, projects, ...integrations };
}
