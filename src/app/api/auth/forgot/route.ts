import { handler, readJson } from "@/server/adapters/http";
import { forgot } from "@/server/auth/account-mail";
import { clientIp } from "@/server/adapters/next-session";
export const POST = handler(async request => forgot(await readJson(request), clientIp(request)));
