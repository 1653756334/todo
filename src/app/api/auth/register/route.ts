import { handler, readJson } from "@/server/adapters/http";
import { register } from "@/server/auth/account-mail";
import { clientIp } from "@/server/adapters/next-session";
export const POST = handler(async request => register(await readJson(request), clientIp(request)));
