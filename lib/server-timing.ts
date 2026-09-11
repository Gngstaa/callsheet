/**
 * Opt-in timing for the Today path. With CALLSHEET_TIMING=1 each step logs
 * its duration and the wall-clock time it finished; otherwise these are
 * pass-throughs. Labels only: nothing about the data or the connection.
 */

function enabled(): boolean {
  return process.env.CALLSHEET_TIMING === "1";
}

function clock(): string {
  return new Date().toISOString().slice(11, 23);
}

export function timingNote(label: string): void {
  if (enabled()) console.log(`[timing] ${label} at ${clock()}`);
}

export async function timed<T>(label: string, work: () => T | Promise<T>): Promise<T> {
  if (!enabled()) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    console.log(`[timing] ${label}: ${Math.round(performance.now() - start)}ms, done at ${clock()}`);
  }
}

export function timedSync<T>(label: string, work: () => T): T {
  if (!enabled()) return work();
  const start = performance.now();
  try {
    return work();
  } finally {
    console.log(`[timing] ${label}: ${Math.round(performance.now() - start)}ms, done at ${clock()}`);
  }
}
