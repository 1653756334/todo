import { handler, requireUser } from "@/server/adapters/http";
import { requireAdmin } from "@/server/auth/permissions";
import { aiConfig } from "@/server/settings/service";
import { testAiConnection } from "@/server/ai/provider";
import { assert } from "@/shared/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * 站点 AI 配置连通性测试。只允许管理员调用：普通用户既不应看到 API Key，
 * 也不应能借站点凭据发起模型调用（那会绕过每日额度）。
 */
export const POST = handler(async () => {
  const actor = await requireUser();
  requireAdmin(actor);
  const config = await aiConfig(actor);
  assert(config, 400, "请先填写接口地址、模型并启用 AI 服务");
  const result = await testAiConnection({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model, allowPrivateEndpoint: config.allowPrivateEndpoint });
  return { ok: true, model: result.model, elapsedMs: result.elapsedMs };
});
