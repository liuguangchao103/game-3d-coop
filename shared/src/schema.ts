import { z } from "zod";

import type { C2SMessage, S2CMessage } from "./protocol";

const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,8}$/);

const playerNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[\p{L}\p{N}_\- ]+$/u);

const inputStateSchema = z.object({
  t: z.literal("input.state"),
  seq: z.number().int().nonnegative(),
  dt: z.number().min(0).max(0.2),
  moveX: z.number().min(-1).max(1),
  moveY: z.number().min(-1).max(1),
  lookYaw: z.number().min(-Math.PI * 4).max(Math.PI * 4),
  lookPitch: z.number().min(-Math.PI * 0.5).max(Math.PI * 0.5),
  fire: z.boolean(),
  dash: z.boolean(),
  interact: z.boolean()
});

export const c2sSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("room.create"), name: playerNameSchema }),
  z.object({ t: z.literal("room.join"), code: roomCodeSchema, name: playerNameSchema }),
  z.object({ t: z.literal("room.ready"), ready: z.boolean() }),
  inputStateSchema,
  z.object({ t: z.literal("ability.linkBurst") }),
  z.object({ t: z.literal("player.revive"), targetId: z.string().min(1).max(64) }),
  z.object({ t: z.literal("ping"), ts: z.number() })
]);

export function parseC2SMessage(raw: unknown): C2SMessage {
  return c2sSchema.parse(raw) as C2SMessage;
}

export function safeParseC2SMessage(raw: unknown): { success: true; data: C2SMessage } | { success: false; error: string } {
  const result = c2sSchema.safeParse(raw);
  if (result.success) {
    return { success: true, data: result.data as C2SMessage };
  }
  return { success: false, error: result.error.issues.map((issue) => issue.message).join("; ") };
}

export function serializeS2CMessage(message: S2CMessage): string {
  return JSON.stringify(message);
}
