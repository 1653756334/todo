import { AuthForm } from "@/components/AuthForm";
import { authConfigState } from "@/lib/env";
import { readGroup } from "@/server/settings/service";

export const metadata = { title: "登录", robots: { index: false, follow: false } };

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const state = authConfigState();
  const policy = state.ready ? await readGroup("policy") : null;
  const rawNext = params.next ?? "";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/today";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-4 py-8 sm:px-6 sm:py-12">
      <AuthForm
        next={next}
        registrationEnabled={policy?.value.registrationEnabled ?? false}
        notice={params.reason === "password-changed" ? "密码已更新，请使用新密码重新登录。" : undefined}
        configError={
          state.ready
            ? undefined
            : "登录服务暂不可用，请稍后重试或联系管理员。"
        }
      />
    </main>
  );
}
