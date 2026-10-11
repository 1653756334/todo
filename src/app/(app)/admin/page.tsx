import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/workspace";
import { isAdmin as hasAdminRole } from "@/server/auth/permissions";
import { publicGroup, smtpConfig } from "@/server/settings/service";
import { adminUsers } from "@/server/auth/accounts";
import { SystemSettingsForm } from "@/components/admin/SystemSettingsForm";
import { UsersPanel } from "@/components/admin/UsersPanel";
import { AdminNav, ADMIN_TABS } from "@/components/admin/AdminNav";
import { SettingsShell } from "@/components/settings/SettingsShell";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requirePageSession();
  if (!hasAdminRole(user)) redirect("/settings/general");
  const params = await searchParams;
  const active = ADMIN_TABS.some(tab => tab.value === params.tab) ? params.tab! : "users";
  const [smtp, ai, policy, users, mail] = await Promise.all([
    publicGroup(user, "smtp"), publicGroup(user, "ai"), publicGroup(user, "policy"), adminUsers(user), smtpConfig().catch(() => null),
  ]);
  return (
    <SettingsShell
      title="站点管理"
      description="管理用户、注册方式和公共服务。选择一个分类开始配置。"
      badge={<span className="status-pill"><ShieldCheck size={13} aria-hidden="true" />管理员</span>}
      back={<Link href="/settings/general" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-accent"><ArrowLeft size={14} aria-hidden="true" />个人设置</Link>}
      nav={<AdminNav active={active} />}
      resetKey={active}
    >
      {active === "users" && <UsersPanel initial={JSON.parse(JSON.stringify(users))} currentUserId={user.id} verificationRequired={policy.value.verification === "on_signup"} smtpReady={!!mail} defaultQuota={Number(ai.value.dailyQuota ?? 50)} />}
      {active === "policy" && <SystemSettingsForm key="policy" group="policy" title="注册与通知" initial={policy.value as never} initialRevision={policy.revision} />}
      {active === "smtp" && <SystemSettingsForm key="smtp" group="smtp" title="邮件服务" initial={smtp.value as never} initialRevision={smtp.revision} />}
      {active === "ai" && <SystemSettingsForm key="ai" group="ai" title="AI 服务" initial={ai.value as never} initialRevision={ai.revision} />}
    </SettingsShell>
  );
}
