export interface BotTickResult {
  moveX: number;
  moveY: number;
}

export function idleBot(): BotTickResult {
  return { moveX: 0, moveY: 0 };
}
