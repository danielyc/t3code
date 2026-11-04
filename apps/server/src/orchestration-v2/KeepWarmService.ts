import {
  CommandId,
  isListedThreadLineage,
  KEEP_WARM_TEXT,
  MessageId,
  ProviderInstanceId,
  resolveKeepContextWarm,
  resolveProjectProviderInstanceEnabled,
  type OrchestrationV2DomainEvent,
  type RunId,
  type ServerSettings,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FiberMap from "effect/FiberMap";
import * as Stream from "effect/Stream";

import { forkParked } from "../serverActivation.ts";
import * as ServerSettingsService from "../serverSettings.ts";
import { keepWarmPingAt } from "./KeepWarm.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

// Events after which an idle thread may need its timer: a finished turn, or a change that can turn
// pinging back on.
const rearmsThread = (event: OrchestrationV2DomainEvent) =>
  (event.type === "run.updated" && event.payload.status === "completed") ||
  event.type === "thread.metadata-updated" ||
  event.type === "thread.unsnoozed" ||
  event.type === "thread.unarchived" ||
  event.type === "thread.unsettled";

// Claude instances whose default is on; a change rescans the active threads.
const keepWarmDefaults = (settings: ServerSettings) =>
  Object.entries(settings.providerInstances)
    .filter(([, instance]) => instance.driver === "claudeAgent")
    .map(([id]) => `${id}:${resolveKeepContextWarm(settings, ProviderInstanceId.make(id), null)}`)
    .toSorted()
    .join(",");

/**
 * Sends a short T3 Code turn just before an idle Claude thread's prompt cache expires, while the
 * thread or its Claude instance keeps context warm. Each ping's completed run arms the next one.
 */
export const make = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const settings = yield* ServerSettingsService.ServerSettingsService;

  const pingWhenDue = Effect.fn("KeepWarmService.pingWhenDue")(
    function* (threadId: ThreadId) {
      // Loops after each wait: the thread may have moved on.
      while (true) {
        const current = yield* settings.getSettings;
        const thread = yield* projections.getThread(threadId);
        const claudeInstance = Object.hasOwn(current.providerInstances, thread.providerInstanceId)
          ? current.providerInstances[thread.providerInstanceId]?.driver === "claudeAgent"
          : thread.providerInstanceId === "claudeAgent";
        if (
          !claudeInstance ||
          !resolveKeepContextWarm(current, thread.providerInstanceId, thread.keepContextWarm) ||
          !resolveProjectProviderInstanceEnabled(
            current,
            thread.projectId,
            thread.providerInstanceId,
          )
        )
          return;
        const activeProviderThreadIds =
          thread.activeProviderThreadId === null ? [] : [thread.activeProviderThreadId];
        const records = yield* projections.getThreadRecords(
          threadId,
          [
            "runs",
            "providerThreads",
            "providerTurns",
            "runtimeRequests",
            "turnItems",
            "contextTransfers",
          ],
          {
            turnItemStatuses: ["pending", "running", "waiting"],
            runStatuses: ["preparing", "starting", "running", "rolled_back"],
            includeLatestRun: true,
            providerThreadIds: activeProviderThreadIds,
            providerTurnThreadIds: activeProviderThreadIds,
            latestProviderTurnUsageOnly: true,
            runtimeRequestStatuses: ["pending"],
            contextTransferStatuses: ["pending"],
          },
        );
        const nowMs = DateTime.toEpochMillis(yield* DateTime.now);
        const due = keepWarmPingAt(records, nowMs);
        if (due === null) return;
        if (nowMs < due.pingAtMs) {
          yield* Effect.sleep(Duration.millis(due.pingAtMs - nowMs));
          continue;
        }
        yield* ping(threadId, due.runId);
        return;
      }
    },
    (effect, threadId) =>
      effect.pipe(
        Effect.catch((cause) => Effect.logWarning("keep-warm ping skipped", { threadId, cause })),
      ),
  );

  const ping = (threadId: ThreadId, runId: RunId) =>
    orchestrator.dispatch({
      type: "message.dispatch",
      // One ping per completed run, even across duplicate events and restarts.
      commandId: CommandId.make(`server:keep-warm:${threadId}:${runId}`),
      messageId: MessageId.make(`keep-warm:${threadId}:${runId}`),
      threadId,
      text: KEEP_WARM_TEXT,
      attachments: [],
      createdBy: "agent",
      creationSource: "server",
      dispatchMode: { type: "start_immediately" },
    });

  const start = Effect.fn("KeepWarmService.start")(function* () {
    // Keyed by thread: a newer event replaces the waiting timer.
    const timers = yield* FiberMap.make<ThreadId>();
    const rescan = Effect.gen(function* () {
      for (const entry of yield* projections.listActiveShellIndex()) {
        if (
          entry.settledAt !== null ||
          entry.settledOverride === "settled" ||
          !isListedThreadLineage(entry.lineage)
        )
          continue;
        yield* FiberMap.run(timers, entry.id, pingWhenDue(entry.id), { onlyIfMissing: true });
      }
    }).pipe(Effect.catch((cause) => Effect.logWarning("keep-warm rescan failed", { cause })));
    yield* forkParked(
      Stream.runForEach(orchestrator.streamDomainEvents, (event) =>
        rearmsThread(event)
          ? FiberMap.run(timers, event.threadId, pingWhenDue(event.threadId))
          : Effect.void,
      ),
    );
    // Timers live in memory, so startup and a changed default arm the threads already idle.
    yield* forkParked(
      Stream.concat(Stream.fromEffect(settings.getSettings), settings.streamChanges).pipe(
        Stream.map(keepWarmDefaults),
        Stream.changes,
        Stream.runForEach(() => rescan),
      ),
    );
  });
  return { start };
});
