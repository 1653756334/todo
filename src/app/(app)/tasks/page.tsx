import { PageHeader } from "@/components/PageHeader";
import { TaskFilters } from "@/components/TaskFilters";
import { TaskWorkspace } from "@/components/TaskWorkspace";
import { loadWorkspacePage } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    priority?: string;
    tag?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const { tasks, nextCursor, projects, timeZone, notify } = await loadWorkspacePage(
    "all",
    {
      query: params.q ?? null,
      status: params.status ?? null,
      priority: params.priority ?? null,
      tag: params.tag ?? null,
      sort: params.sort ?? null,
    },
  );
  return (
    <TaskWorkspace
      initialTasks={tasks}
      initialNextCursor={nextCursor}
      projects={projects}
      timeZone={timeZone}
      view="all"
      notify={notify}
      header={
        <PageHeader
          title={params.q ? "搜索结果" : "全部任务"}
          subtitle={
            params.q
              ? `与「${params.q}」相关${params.status === "done" ? "的已完成任务" : "的任务"}。可调整状态和优先级筛选。`
              : "集中查看和安排所有未完成的任务。"
          }
          meta={<span>{tasks.length}{nextCursor ? "+" : ""} 条</span>}
        />
      }
      filters={<TaskFilters />}
    />
  );
}
