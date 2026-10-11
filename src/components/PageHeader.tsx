import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  meta,
}: {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-heading-inner min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 text-[26px] font-semibold leading-9 tracking-tight [overflow-wrap:anywhere] max-sm:text-[24px]">
            {title}
          </h1>
          {meta ? <div className="status-pill min-w-0 max-w-full flex-wrap !whitespace-normal [overflow-wrap:anywhere] [&>span]:flex-wrap">{meta}</div> : null}
        </div>
        {subtitle ? (
          <p className="mt-2 text-[13px] leading-6 text-muted [overflow-wrap:anywhere]">{subtitle}</p>
        ) : null}
      </div>
    </header>
  );
}
