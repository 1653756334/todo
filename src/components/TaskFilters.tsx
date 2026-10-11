"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import { PRIORITY_LABELS, STATUS_LABELS } from "@/lib/types";

export function TaskFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const priority = params.get("priority") ?? "";
  const query = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const hasFilters = Boolean(status || priority || query || tag);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    startTransition(() => router.push(next.size ? `${pathname}?${next}` : pathname));
  }
  function resetFilters() {
    const next = new URLSearchParams(params.toString());
    for (const key of ["status", "priority", "q", "tag", "cursor"]) next.delete(key);
    startTransition(() => router.push(next.size ? `${pathname}?${next}` : pathname));
  }

  return (
    <div className="task-filters" aria-busy={pending}>
      <div className="workspace-inner flex flex-wrap items-center gap-3">
        <span className="mr-1 hidden items-center gap-2 text-[12px] text-muted sm:inline-flex">
          <SlidersHorizontal size={15} />
          筛选
        </span>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <span className="shrink-0 whitespace-nowrap">状态</span>
          <select
            className="field !min-h-9 !w-[126px] !py-1.5 !text-[13px]"
            value={status}
            disabled={pending}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="">全部未完成</option>
            {Object.entries(STATUS_LABELS)
              .map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          <span className="shrink-0 whitespace-nowrap">优先级</span>
          <select
            className="field !min-h-9 !w-[100px] !py-1.5 !text-[13px]"
            value={priority}
            disabled={pending}
            onChange={(event) => update("priority", event.target.value)}
          >
            <option value="">全部</option>
            {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {query ? (
          <span className="status-pill min-w-0 max-w-full" title={`搜索：${query}`}>
            <span className="truncate">搜索：{query}</span>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-sunken"
              disabled={pending}
              aria-label="清除搜索条件"
              onClick={() => update("q", "")}
            >
              <X size={13} />
            </button>
          </span>
        ) : null}
        {tag ? (
          <span className="status-pill min-w-0 max-w-full" title={`标签：${tag}`}>
            <span className="truncate">标签：{tag}</span>
            <button type="button" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded hover:bg-sunken" aria-label="清除标签筛选" disabled={pending} onClick={() => update("tag", "")}><X size={13} /></button>
          </span>
        ) : null}
        {hasFilters ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={resetFilters}
          >
            <X size={13} />
            清除筛选
          </button>
        ) : null}
        {pending ? (
          <span
            className="navigation-pending inline-flex items-center gap-1.5 text-[12px] text-muted"
            role="status"
          >
            <LoaderCircle size={13} className="animate-spin" />
            更新筛选…
          </span>
        ) : null}
      </div>
    </div>
  );
}
