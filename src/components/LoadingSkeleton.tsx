import type { ReactNode } from "react";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />;
}

function LoadingRegion({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <div
      className={`loading-region ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
      aria-busy="true"
      data-loading-skeleton
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

export function TaskPageSkeleton({
  withFilters = false,
}: {
  withFilters?: boolean;
}) {
  return (
    <LoadingRegion
      className="flex min-h-0 flex-1 flex-col"
      label="正在加载任务"
    >
      <div className="page-heading">
        <div className="page-heading-inner">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="mt-3 h-4 w-56 max-w-full" />
        </div>
      </div>
      {withFilters ? (
        <div className="task-filters">
          <div className="workspace-inner flex gap-3">
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      ) : null}
      <div className="workspace-list flex min-h-0 flex-1 flex-col">
        <div className="workspace-inner flex items-center justify-between pb-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="workspace-inner task-list">
          <div className="task-list-heading">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
          {["w-3/5", "w-2/5", "w-4/5", "w-1/2", "w-2/3"].map((width, index) => (
            <div
              key={index}
              className="flex items-start gap-3 border-b border-line px-[18px] py-4 last:border-0"
            >
              <Skeleton className="mt-1 h-5 w-5 shrink-0 !rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className={`h-5 ${width}`} />
                <div className="mt-2 flex gap-3">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
              </div>
              <Skeleton className="mt-1 hidden h-4 w-20 shrink-0 md:block" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

export function SettingsFormSkeleton() {
  return (
    <LoadingRegion label="正在加载设置">
      <div className="settings-card">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="mt-7">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="mt-2 h-3 w-48 max-w-full" />
          </div>
        ))}
        <div className="form-actions">
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    </LoadingRegion>
  );
}

export function ReminderRecordsSkeleton() {
  return (
    <LoadingRegion label="正在加载提醒记录" className="mt-5">
      <div className="divide-y divide-line border-t border-line">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="flex items-start justify-between gap-4 py-4"
          >
            <div className="flex-1">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-3 h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function ImportPreviewSkeleton() {
  return (
    <LoadingRegion label="正在解析文本，生成待办预览">
      <div className="space-y-4">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-xl border border-line p-4">
            <div className="flex gap-3">
              <Skeleton className="h-5 w-5 shrink-0" />
              <Skeleton className="h-5 w-2/3" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
            <Skeleton className="mt-3 h-4 w-1/2" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}
