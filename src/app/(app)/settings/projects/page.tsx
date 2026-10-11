import { ContentTransition } from "@/components/Motion";
import { ProjectsManager } from "@/components/settings/ProjectsManager";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "项目管理" };

export default async function ProjectsSettingsPage() {
  const user = await requirePageSession();
  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: [{ archivedAt: "asc" }, { createdAt: "asc" }],
    include: {
      _count: { select: { tasks: { where: { status: { not: "done" } } } } },
    },
  }).catch(() => null);

  return (
    <ContentTransition stateKey="project-settings">
      <ProjectsManager
        loadError={projects === null ? "项目加载失败，请重新加载。" : undefined}
        initial={(projects ?? []).map((project) => ({
          id: project.id,
          name: project.name,
          repoUrl: project.repoUrl,
          color: project.color,
          revision: project.revision,
          archived: project.archivedAt !== null,
          openCount: project._count.tasks,
        }))}
      />
    </ContentTransition>
  );
}
