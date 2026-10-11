import { ContentTransition } from "@/components/Motion";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { DataSettings } from "@/components/settings/DataSettings";
import { prisma } from "@/lib/db";
import { requirePageSession } from "@/lib/workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "账号与数据" };

export default async function SettingsIndex() {
  const actor = await requirePageSession();
  const [profile, attempts] = await Promise.allSettled([
    prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { username: true, displayName: true, accountEmail: true, accountEmailVerifiedAt: true, role: true } }),
    prisma.loginAttempt.findMany({ where: { username: actor.username }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, ip: true, succeeded: true, createdAt: true } }),
  ]);

  return (
    <ContentTransition stateKey="account-settings">
      <p className="hint mb-1">管理登录资料、密码、登录状态与数据备份。</p>
      {profile.status === "fulfilled" ? <ProfileForm profile={{ ...profile.value, accountEmailVerifiedAt: profile.value.accountEmailVerifiedAt?.toISOString() ?? null }} /> : <section className="settings-card"><h2 className="section-title">账号资料</h2><p className="error-text mt-3" role="alert">账号资料加载失败，请重新加载页面。</p><a href="/settings" className="btn btn-secondary mt-4">重新加载</a></section>}
      <DataSettings timeZone={actor.timezone} attempts={attempts.status === "fulfilled" ? attempts.value.map(attempt => ({ ...attempt, createdAt: attempt.createdAt.toISOString() })) : []} attemptsError={attempts.status === "rejected" ? "登录记录加载失败，请重试。" : undefined} />
    </ContentTransition>
  );
}
