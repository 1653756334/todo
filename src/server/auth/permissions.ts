import type { AccountStatus, Role, User } from "@prisma/client";
import { assert } from "@/shared/errors";
export type Actor = Pick<User, "id" | "username" | "displayName" | "timezone" | "sessionVersion"> & { role: Role; status: AccountStatus };
export function requireAdmin(actor: Actor) { assert(actor.role === "ADMIN" && actor.status === "ACTIVE", 403, "需要管理员权限", "FORBIDDEN"); }
export const isAdmin = (actor: Actor) => actor.role === "ADMIN" && actor.status === "ACTIVE";
export const ownedTaskWhere = (actor: Actor) => ({ ownerId: actor.id });
export const ownedProjectWhere = (actor: Actor) => ({ ownerId: actor.id });
