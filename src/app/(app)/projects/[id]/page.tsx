import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { TaskWorkspace } from "@/components/TaskWorkspace";
import { prisma } from "@/lib/db";
import { loadWorkspacePage, requirePageSession } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{sort?: string}>;
}) {
  const { id } = await params;
  const user = await requirePageSession();
  const project = await prisma.project.findFirst({ where: { id, ownerId: user.id } });
  if (!project) notFound();
  const { tasks, nextCursor, projects, timeZone, notify } = await loadWorkspacePage(
    "project",
    { projectId: id, sort: (await searchParams).sort },
  );
  return (
    <TaskWorkspace
      initialTasks={tasks}
      initialNextCursor={nextCursor}
      projects={projects}
      timeZone={timeZone}
      view="project"
      projectId={id}
      notify={notify}
      header={
        <PageHeader
          title={project.name}
          subtitle={project.repoUrl ?? "安排这个项目接下来的工作。"}
          meta={
            <span className="flex items-center gap-3">
              <span>{tasks.length}{nextCursor ? "+" : ""} 条未完成</span>
              <Link
                href="/settings/projects"
                className="text-accent hover:underline"
              >
                编辑项目
              </Link>
            </span>
          }
        />
      }
    />
  );
}
