import "server-only";

export function perfLogsEnabled() {
  return process.env.PERF_LOGS === "true";
}

export function startPerf(label: string) {
  if (!perfLogsEnabled()) return () => {};

  const startedAt = Date.now();
  return () => {
    console.log(`[perf] ${label}: ${Date.now() - startedAt}ms`);
  };
}

export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const end = startPerf(label);
  try {
    return await work();
  } finally {
    end();
  }
}
