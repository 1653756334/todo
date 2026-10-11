import { createHash } from "node:crypto";
import { AccountForm } from "@/components/AccountForm";
import { prisma } from "@/lib/db";
import { readGroup } from "@/server/settings/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "账号帮助", robots: { index: false, follow: false } };

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<{ token?: string; purpose?: string; mode?: string }>;
}) {
  const [params, policy] = await Promise.all([searchParams, readGroup("policy")]);
  let purpose: string | undefined;
  let tokenError: string | undefined;
  if (params.token !== undefined) {
    const token = params.token;
    const record = token.length >= 32 && token.length <= 256
      ? await prisma.accountToken.findUnique({ where: { hash: createHash("sha256").update(token).digest("hex") }, select: { purpose: true, usedAt: true, expiresAt: true } })
      : null;
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      tokenError = "此链接已使用或已过期。请重新申请邮件；邀请链接请联系管理员重新生成。";
    } else {
      purpose = record.purpose;
      if (!["INVITE", "RESET", "VERIFY_EMAIL", "VERIFY_CHANNEL"].includes(purpose)) tokenError = "此链接无法用于账号操作，请联系管理员。";
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <AccountForm token={params.token !== undefined ? params.token || "invalid" : undefined} purpose={purpose} tokenError={tokenError} registrationEnabled={policy.value.registrationEnabled} emailRequired={policy.value.verification === "on_signup"} initialMode={params.mode === "register" ? "register" : "forgot"} />
    </main>
  );
}
