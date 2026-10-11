import Link from "next/link";
import { requirePageSession } from "@/lib/workspace";
import { formatFullDateTime } from "@/lib/time";
import { prisma } from "@/server/infra/db";
import { readGroup, aiConfig } from "@/server/settings/service";

export const dynamic = "force-dynamic";

export default async function AiSettingsPage() {
  const actor = await requirePageSession();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const [config, settings, user, budget] = await Promise.all([
    aiConfig(actor).catch(() => null),
    readGroup("ai"),
    prisma.user.findUniqueOrThrow({ where: { id: actor.id } }),
    prisma.aiDailyBudget.findUnique({ where: { userId_dayUtc: { userId: actor.id, dayUtc: today } } }),
  ]);
  const quota = user.aiDailyQuotaOverride ?? settings.value.dailyQuota;
  const used = budget?.used ?? 0;
  const reserved = budget?.reserved ?? 0;
  const remaining = Math.max(0, quota - used - reserved);
  const available = !!config && remaining > 0;
  const status = !config ? "暂未开放" : quota === 0 ? "暂无额度" : remaining === 0 ? "今日额度已用完" : "可以使用";
  const tone = available ? "is-ok" : status === "暂未开放" || status === "暂无额度" ? "" : "is-warn";
  const explanation = !settings.value.enabled
    ? "站点尚未启用 AI 提取。开放后即可在导入任务时使用，无需个人配置接口或密钥。"
    : actor.role !== "ADMIN" && !settings.value.publicEnabled
      ? "站点暂未向普通用户开放 AI 提取。需要使用时，请联系管理员。"
      : !config ? "AI 服务配置暂不可用，请联系管理员检查。"
        : quota === 0 ? "你的每日 AI 额度为 0。需要使用时，请联系管理员调整额度。"
          : remaining === 0 && reserved > 0 ? "剩余额度已被正在处理的请求占用，请等待处理完成后再查看。"
            : remaining === 0 ? "今日 AI 提取额度已用完，额度重置后可以继续使用。"
              : "在导入任务时使用 AI 提取，将文本或图片整理成待确认的任务。保存前可检查和修改提取结果。";
  const resetAt = new Date(today.getTime() + 86400000);

  return (
    <section className="settings-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title">AI 使用情况</h2>
        <span className={`status-pill ${tone}`}>{status}</span>
      </div>
      <p className="hint mt-3">{explanation}</p>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "每日额度", value: quota },
          { label: "今日已使用", value: used },
          { label: "处理中", value: reserved },
          { label: "今日剩余", value: remaining },
        ].map(item => (
          <div key={item.label} className="rounded-lg border border-line bg-sunken/50 p-4">
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="mt-2 text-2xl font-semibold tabular-nums">{item.value}<span className="ml-1 text-xs font-normal text-muted">次</span></dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 grid gap-x-8 gap-y-2 border-t border-line pt-4 sm:grid-cols-2">
        <p className="hint">每次 AI 提取占用 1 次额度，一次可提取多个任务；处理中的请求会临时占用额度。</p>
        <p className="hint">额度每天在 UTC 00:00 重置。下次重置：{formatFullDateTime(resetAt, actor.timezone)}（{actor.timezone}）。</p>
        <p className="hint sm:col-span-2">AI 服务和使用额度由站点管理员统一管理。{user.aiDailyQuotaOverride !== null ? "当前额度为管理员为你单独设置的额度。" : "当前使用站点默认额度。"}</p>
      </div>
      {actor.role === "ADMIN" && <div className="mt-5 flex flex-wrap gap-2"><Link href="/admin?tab=ai" className="btn btn-secondary">配置 AI 服务</Link><Link href="/admin?tab=users" className="btn btn-secondary">管理用户额度</Link></div>}
    </section>
  );
}
