import { PageHeader } from "@/components/PageHeader";
import { TaskWorkspace } from "@/components/TaskWorkspace";
import { loadWorkspacePage } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function InboxPage({searchParams}: {searchParams: Promise<{sort?: string}>}) {
  const params = await searchParams;
  const { tasks, nextCursor, projects, timeZone, notify } =
    await loadWorkspacePage("inbox", {sort: params.sort});
  return (
    <TaskWorkspace
      initialTasks={tasks}
      initialNextCursor={nextCursor}
      projects={projects}
      timeZone={timeZone}
      view="inbox"
      notify={notify}
      header={
        <PageHeader
          title="收件箱"
          subtitle="先记录，再整理。未分配项目的任务都在这里。"
          meta={<span>{tasks.length}{nextCursor ? "+" : ""} 条</span>}
        />
      }
    />
  );
}
