import { PageHeader } from "@/components/PageHeader";
import { TaskWorkspace } from "@/components/TaskWorkspace";
import { loadWorkspacePage } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function CompletedPage({searchParams}: {searchParams: Promise<{sort?: string}>}) {
  const params = await searchParams;
  const { tasks, nextCursor, projects, timeZone, notify } =
    await loadWorkspacePage("completed", {sort: params.sort});
  return (
    <TaskWorkspace
      initialTasks={tasks}
      initialNextCursor={nextCursor}
      projects={projects}
      timeZone={timeZone}
      view="completed"
      notify={notify}
      header={
        <PageHeader
          title="已完成"
          subtitle="回顾已经完成的工作，或恢复需要继续处理的任务。"
          meta={<span>{tasks.length}{nextCursor ? "+" : ""} 条</span>}
        />
      }
    />
  );
}
