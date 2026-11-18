// Time limits for the steps that run before the site starts (see package.json start:render).
// A slow or hung database or network call must never keep `next start` from running.

export type DeadlineResult<T> = { timedOut: false; value: T } | { timedOut: true };

/**
 * Runs `task` but gives up waiting after `ms` milliseconds.
 * Errors from the task are passed through; a timeout is reported as { timedOut: true }.
 * The task itself is not cancelled: callers that time out should exit the process.
 */
export async function runWithDeadline<T>(task: () => Promise<T>, ms: number): Promise<DeadlineResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DeadlineResult<T>>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([task().then((value) => ({ timedOut: false as const, value })), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Limit for each start-up step (seed import, thumbnail check): 60 s, or STARTUP_STEP_LIMIT_MS if set. */
export const STARTUP_STEP_LIMIT_MS = Number(process.env.STARTUP_STEP_LIMIT_MS) || 60_000;
