"use client";

import { NavigationLink } from "@/components/NavigationLink";
import { useIsAdmin } from "@/components/auth-role";
import { usePathname } from "next/navigation";
import {
  Folder,
  Mail,
  Sparkles,
  Settings2,
  Shield,
  ShieldCheck,
  Webhook,
} from "lucide-react";

type Section = {
  href: string;
  label: string;
  icon: typeof Settings2;
  adminOnly?: boolean;
};

const SECTIONS: Section[] = [
  { href: "/settings/general", label: "通用", icon: Settings2 },
  { href: "/settings/email", label: "邮件通知", icon: Mail },
  { href: "/settings/push", label: "Webhook 通知", icon: Webhook },
  { href: "/settings/ai", label: "AI 使用", icon: Sparkles },
  { href: "/settings/projects", label: "项目", icon: Folder },
  { href: "/settings", label: "账号与数据", icon: Shield },
  { href: "/admin", label: "站点管理", icon: ShieldCheck, adminOnly: true },
];

export function SettingsNav() {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <nav
      aria-label="设置分类"
      className="lg:sticky lg:top-8 lg:self-start max-lg:-mx-4 max-lg:px-4 sm:max-lg:-mx-6 sm:max-lg:px-6"
    >
      <ul className="SectionNavList">
        {sections.map(({ href, label, icon: Icon, adminOnly }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex max-lg:shrink-0 lg:min-w-0 lg:flex-col lg:items-stretch">
              {adminOnly && <span aria-hidden="true" className="mx-1.5 w-px shrink-0 self-stretch bg-line lg:mx-0 lg:my-2 lg:h-px lg:w-auto lg:self-auto" />}
              <NavigationLink
                href={href}
                aria-current={active ? "page" : undefined}
                className="SectionNavItem"
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                {label}
              </NavigationLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
