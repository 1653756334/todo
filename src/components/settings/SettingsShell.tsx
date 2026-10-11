import type { ReactNode } from "react";
import { SettingsScrollArea } from "@/components/settings/SettingsScrollArea";

/**
 * 设置区与站点管理共用的外壳。
 *
 * 这里改成「左侧分类 + 右侧内容」的两栏：以前分类是一整行胶囊、内容居中在
 * 928px 里，1440 宽的窗口下每张卡片左右各空 138px、表单里每个输入框右边还
 * 空 300px 以上，一屏只能看两三行。两栏之后内容列变窄、表单可以并排，
 * 分类也不用跟着页面一起滚走。
 */
export function SettingsShell({
  title,
  description,
  badge,
  back,
  nav,
  resetKey,
  children,
}: {
  title: string;
  description: string;
  badge?: ReactNode;
  back?: ReactNode;
  nav: ReactNode;
  resetKey?: string;
  children: ReactNode;
}) {
  return (
    <SettingsScrollArea resetKey={resetKey}>
      <div className="mx-auto w-full max-w-[1120px] px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-5">
          {back}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {badge}
          </div>
          <p className="mt-1.5 text-[13px] text-muted">{description}</p>
        </header>
        <div className="lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start lg:gap-8 xl:gap-10">
          {nav}
          <div className="mt-5 min-w-0 space-y-5 lg:mt-0">{children}</div>
        </div>
      </div>
    </SettingsScrollArea>
  );
}
