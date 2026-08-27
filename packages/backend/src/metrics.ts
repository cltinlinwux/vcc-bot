/**
 * In-memory operational counters exposed via GET /metrics. Counters reset on
 * process restart, which is acceptable for the current single-instance
 * deployment; swap the store for a real metrics backend if that changes.
 */
export interface MetricCounters {
  matchesStarted: number;
  matchesCompleted: number;
  commandsProcessed: number;
}

function zeroCounters(): MetricCounters {
  return { matchesStarted: 0, matchesCompleted: 0, commandsProcessed: 0 };
}

let counters: MetricCounters = zeroCounters();

export function incrementMetric(name: keyof MetricCounters): void {
  counters[name] += 1;
}

/** Returns a snapshot copy so callers cannot mutate the live counters. */
export function getMetrics(): MetricCounters {
  return { ...counters };
}

/** Test-only helper to start each test from a known state. */
export function resetMetrics(): void {
  counters = zeroCounters();
}
