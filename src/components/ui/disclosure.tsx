"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { AnimatedCollapse } from "@/components/Motion";

/**
 * 可折叠区块。
 *
 * 以前这两处用的是原生 <details>/<summary>：展开时内容会瞬间出现，箭头也不会转，
 * 而同一个项目里其它折叠（新建任务的「更多选项」、导入详情）都是有高度动画的。
 * 这里统一成同一套：受控或非受控都可以用。
 */
export function Disclosure({
  title,
  description,
  hint,
  defaultOpen = false,
  open,
  onOpenChange,
  className = "",
  children,
}: {
  title: ReactNode;
  description?: string;
  hint?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const [inner, setInner] = useState(defaultOpen);
  const expanded = open ?? inner;
  const id = useId();
  const regionId = `${id}-region`;
  return (
    <section className={className}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left"
        aria-expanded={expanded}
        aria-controls={expanded ? regionId : undefined}
        onClick={() => (onOpenChange ? onOpenChange(!expanded) : setInner(!expanded))}
      >
        <span className="min-w-0 text-sm font-medium">{title}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          data-open={expanded}
          className="disclosure-chevron shrink-0 text-muted"
        />
      </button>
      {description && <p className="hint mt-1">{description}</p>}
      {hint}
      <AnimatedCollapse open={expanded} id={regionId} className="min-w-0">
        {children}
      </AnimatedCollapse>
    </section>
  );
}
