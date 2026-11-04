import { isListedThreadLineage } from "@t3tools/contracts";
import { derivePendingBackgroundWork } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import * as DateTime from "effect/DateTime";

import type { IdleCompactionRecords } from "./IdleCompaction.ts";

const FIVE_MINUTES_MS = 5 * 60_000;

// Ping this long before the cache expires. A 1h cache usually outlives the 30 minute session idle
// release, so its ping also waits for Claude to resume the session.
const leadMs = (ttlMs: number) => (ttlMs > FIVE_MINUTES_MS ? 3 * 60_000 : 60_000);

/**
 * When an idle Claude thread should send its next keep-warm ping, or null when it should not.
 * Uses the same idle checks as `idleCompactionWindow`, without its context-size floor.
 */
export function keepWarmPingAt(
  {
    thread,
    runs,
    providerThreads,
    providerTurns,
    runtimeRequests,
    turnItems,
    contextTransfers,
  }: Omit<IdleCompactionRecords, "messages">,
  nowMs: number,
): { readonly runId: (typeof runs)[number]["id"]; readonly pingAtMs: number } | null {
  if (thread.deletedAt !== null || thread.archivedAt !== null) return null;
  if (thread.settledAt !== null || thread.settledOverride === "settled") return null;
  if (thread.snoozedUntil != null && DateTime.toEpochMillis(thread.snoozedUntil) > nowMs)
    return null;
  if (!isListedThreadLineage(thread.lineage)) return null;
  const latestRun = runs
    .filter((run) => run.status !== "cancelled" || run.startedAt !== null)
    .reduce<(typeof runs)[number] | null>(
      (latest, run) => (latest === null || run.ordinal > latest.ordinal ? run : latest),
      null,
    );
  // A failed or interrupted turn, including a failed ping, stops pinging until the next turn.
  if (latestRun?.status !== "completed" || latestRun.completedAt === null) return null;
  if (
    runtimeRequests.some((request) => request.status === "pending") ||
    contextTransfers.some(
      (transfer) =>
        transfer.type === "merge_back" &&
        transfer.targetThreadId === thread.id &&
        transfer.status === "pending",
    ) ||
    derivePendingBackgroundWork({
      latestRun,
      runs,
      providerThreads,
      turnItems,
      activeProviderThreadId: thread.activeProviderThreadId,
    }).length > 0
  )
    return null;
  const providerThread = providerThreads.find(
    (candidate) => candidate.id === thread.activeProviderThreadId,
  );
  if (
    providerThread?.driver !== "claudeAgent" ||
    providerThread.id !== latestRun.providerThreadId ||
    providerThread.providerInstanceId !== thread.providerInstanceId ||
    latestRun.providerInstanceId !== thread.providerInstanceId ||
    // An active goal's stop hook would turn the ping into more work on the goal.
    providerThread.goal?.status === "active"
  )
    return null;
  const usage = providerTurns
    .filter((turn) => turn.providerThreadId === providerThread.id && turn.tokenUsage !== undefined)
    .map((turn) => turn.tokenUsage!)
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  // A request served fully from cache reports no TTL. Pings always add new tokens, so this is rare.
  if (usage?.promptCacheTtlMs === undefined || usage.promptCacheExpiresAt === undefined)
    return null;
  const endMs = Date.parse(usage.promptCacheExpiresAt);
  // Once the cache is cold, a ping would pay the full write it exists to avoid.
  if (!Number.isFinite(endMs) || nowMs >= endMs) return null;
  return { runId: latestRun.id, pingAtMs: endMs - leadMs(usage.promptCacheTtlMs) };
}
