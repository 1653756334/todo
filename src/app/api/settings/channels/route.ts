import { handler, requireUser, readJson } from "@/server/adapters/http";
import { listChannels, saveChannel, removeChannel } from "@/server/settings/service";
import { assert } from "@/shared/errors";
export const GET = handler(async () => ({ channels: await listChannels(await requireUser()) }));
export const PUT = handler(async request => ({ channel: await saveChannel(await requireUser(), await readJson(request)) }));
export const DELETE = handler(async request => { const u = await requireUser(); const b = await readJson(request); assert(typeof b.id === "string", 400, "渠道 ID 无效"); await removeChannel(u, b.id); return { ok: true }; });
