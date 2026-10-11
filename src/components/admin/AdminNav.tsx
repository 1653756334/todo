import Link from "next/link";
import { Bot, Mail, ShieldCheck, UsersRound } from "lucide-react";

export const ADMIN_TABS = [
  { value: "users", label: "用户管理", icon: UsersRound },
  { value: "policy", label: "注册与通知", icon: ShieldCheck },
  { value: "smtp", label: "邮件服务", icon: Mail },
  { value: "ai", label: "AI 服务", icon: Bot },
] as const;

/** 与设置区同一套分类导航样式：桌面竖排、窄屏横滑 */
export function AdminNav({ active }: { active: string }) {
  return (
    <nav
      aria-label="站点管理分类"
      className="lg:sticky lg:top-8 lg:self-start max-lg:-mx-4 max-lg:px-4 sm:max-lg:-mx-6 sm:max-lg:px-6"
    >
      <ul className="SectionNavList">
        {ADMIN_TABS.map(({ value, label, icon: Icon }) => (
          <li key={value} className="max-lg:shrink-0 lg:min-w-0">
            <Link
              href={`/admin?tab=${value}`}
              aria-current={active === value ? "page" : undefined}
              className="SectionNavItem"
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
