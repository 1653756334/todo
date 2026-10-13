import { PageHeader } from "@/components/PageHeader";
import { TaskWorkspace } from "@/components/TaskWorkspace";
import { loadWorkspacePage } from "@/lib/workspace";
import { formatDateLong } from "@/lib/time";
import { taskDueTime } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TodayPage({searchParams}: {searchParams: Promise<{sort?: string}>}) {
  const params = await searchParams;
  const { tasks, nextCursor, projects, timeZone, notify } =
    await loadWorkspacePage("today", {sort: params.sort});
  const overdue = tasks.filter(
    (task) => taskDueTime(task) < Date.now(),
  ).length;
  return (
    <TaskWorkspace
      initialTasks={tasks}
      initialNextCursor={nextCursor}
      projects={projects}
      timeZone={timeZone}
      view="today"
      notify={notify}
      groupOverdue
      header={
        <PageHeader
          title="今天"
          subtitle={formatDateLong(new Date(), timeZone)}
          meta={
            overdue > 0 ? (
              <span className="text-danger">逾期 {nextCursor ? "至少 " : ""}{overdue} 条</span>
            ) : (
              <span>{tasks.length}{nextCursor ? "+" : ""} 条待处理</span>
            )
          }
        />
      }
    />
  );
}
