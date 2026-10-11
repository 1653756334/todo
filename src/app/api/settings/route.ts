import { handler, requireUser, readJson } from "@/server/adapters/http";
import { preference, savePreference, capabilities, publicGroup, saveGroup, type Group } from "@/server/settings/service";
import { assert, AppError } from "@/shared/errors";
export const GET = handler(async request => {
  const actor = await requireUser(); const group = new URL(request.url).searchParams.get("group");
  if (group) { assert(["smtp", "ai", "policy"].includes(group), 400, "配置组无效"); return publicGroup(actor, group as Group); }
  return { preference: await preference(actor), capabilities: await capabilities(actor) };
});
export const PUT = handler(async request => {
  const actor = await requireUser(); const body = await readJson(request);
  if (body.group) { assert(["smtp", "ai", "policy"].includes(String(body.group)), 400, "配置组无效"); assert(Number.isInteger(body.expectedRevision), 400, "请提供配置版本"); await saveGroup(actor, body.group as Group, body.value, body.expectedRevision as number); }
  else if (body.preference) await savePreference(actor, body.preference);
  else throw new AppError(400, "请使用指定配置组");
  return { ok: true };
});
