import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  EventId,
  MessageId,
  type OrchestrationV2ThreadProjection,
  NodeId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSettings from "../serverSettings.ts";
import { keepWarmPingAt } from "./KeepWarm.ts";
import * as KeepWarmService from "./KeepWarmService.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";

const NOW_MS = Date.parse("2026-11-05T12:00:00.000Z");
const MINUTE_MS = 60_000;
const at = (offset = 0) => DateTime.makeUnsafe(NOW_MS + offset);
const threadId = ThreadId.make("warm-thread");
const runId = RunId.make("run-1");
const instanceId = ProviderInstanceId.make("claudeAgent");
const providerThreadId = ProviderThreadId.make("provider-thread");
const modelSelection = { instanceId, model: "claude-opus-5-5" };

function projection(
  cache: { readonly ttlMs?: number; readonly expiresInMs?: number } = {
    ttlMs: 5 * MINUTE_MS,
    expiresInMs: 5 * MINUTE_MS,
  },
): {
  -readonly [Key in keyof OrchestrationV2ThreadProjection]: OrchestrationV2ThreadProjection[Key];
} {
  const messageId = MessageId.make("message-1");
  const nodeId = NodeId.make("root-node");
  return {
    thread: {
      id: threadId,
      projectId: ProjectId.make("project"),
      title: "Warm thread",
      createdBy: "user",
      creationSource: "web",
      providerInstanceId: instanceId,
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: providerThreadId,
      lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
      forkedFrom: null,
      createdAt: at(-MINUTE_MS),
      updatedAt: at(),
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: at(),
      deletedAt: null,
    },
    runs: [
      {
        id: runId,
        threadId,
        ordinal: 1,
        providerInstanceId: instanceId,
        modelSelection,
        providerThreadId,
        userMessageId: messageId,
        rootNodeId: nodeId,
        activeAttemptId: null,
        status: "completed",
        requestedAt: at(-MINUTE_MS),
        startedAt: at(-MINUTE_MS),
        completedAt: at(),
        checkpointId: null,
        contextHandoffId: null,
      },
    ],
    messages: [],
    providerThreads: [
      {
        id: providerThreadId,
        driver: ProviderDriverKind.make("claudeAgent"),
        providerInstanceId: instanceId,
        providerSessionId: null,
        appThreadId: threadId,
        ownerNodeId: nodeId,
        nativeThreadRef: null,
        nativeConversationHeadRef: null,
        status: "idle",
        firstRunOrdinal: 1,
        lastRunOrdinal: 1,
        handoffIds: [],
        forkedFrom: null,
        pendingBackgroundTasks: [],
        createdAt: at(-MINUTE_MS),
        updatedAt: at(),
      },
    ],
    providerTurns: [
      {
        id: ProviderTurnId.make("provider-turn-1"),
        providerThreadId,
        nodeId,
        runAttemptId: null,
        nativeTurnRef: null,
        ordinal: 1,
        status: "completed",
        startedAt: at(-MINUTE_MS),
        completedAt: at(),
        tokenUsage: {
          usedTokens: 20_000,
          ...(cache.ttlMs === undefined ? {} : { promptCacheTtlMs: cache.ttlMs }),
          ...(cache.expiresInMs === undefined
            ? {}
            : { promptCacheExpiresAt: DateTime.formatIso(at(cache.expiresInMs)) }),
          updatedAt: DateTime.formatIso(at()),
        },
      },
    ],
    runtimeRequests: [],
    turnItems: [],
    contextTransfers: [],
    attempts: [],
    nodes: [],
    subagents: [],
    providerSessions: [],
    plans: [],
    checkpointScopes: [],
    checkpoints: [],
    contextHandoffs: [],
    visibleTurnItems: [],
    updatedAt: at(),
  };
}

describe("keepWarmPingAt", () => {
  it("pings a minute before a 5m cache expires and three minutes before a 1h one", () => {
    expect(keepWarmPingAt(projection(), NOW_MS)).toEqual({
      runId,
      pingAtMs: NOW_MS + 4 * MINUTE_MS,
    });
    expect(
      keepWarmPingAt(projection({ ttlMs: 60 * MINUTE_MS, expiresInMs: 60 * MINUTE_MS }), NOW_MS),
    ).toEqual({ runId, pingAtMs: NOW_MS + 57 * MINUTE_MS });
  });

  it("waits out a snooze that ends before the cache expires", () => {
    const snoozed = (untilMs: number) => {
      const data = projection();
      data.thread = { ...data.thread, snoozedUntil: at(untilMs) };
      return keepWarmPingAt(data, NOW_MS)?.pingAtMs ?? null;
    };
    expect(snoozed(2 * MINUTE_MS)).toBe(NOW_MS + 4 * MINUTE_MS);
    expect(snoozed(4.5 * MINUTE_MS)).toBe(NOW_MS + 4.5 * MINUTE_MS);
    expect(snoozed(5 * MINUTE_MS)).toBeNull();
  });

  it("skips cold or unknown caches, other providers, goals, failures, and archived or settled threads", () => {
    expect(keepWarmPingAt(projection({ ttlMs: 5 * MINUTE_MS, expiresInMs: 0 }), NOW_MS)).toBeNull();
    expect(keepWarmPingAt(projection({}), NOW_MS)).toBeNull();
    const codex = projection();
    codex.providerThreads = [
      { ...codex.providerThreads[0]!, driver: ProviderDriverKind.make("codex") },
    ];
    expect(keepWarmPingAt(codex, NOW_MS)).toBeNull();
    const goal = projection();
    goal.providerThreads = [
      { ...goal.providerThreads[0]!, goal: { objective: "Ship it", status: "active" } },
    ];
    expect(keepWarmPingAt(goal, NOW_MS)).toBeNull();
    const failed = projection();
    failed.runs = [{ ...failed.runs[0]!, status: "failed" }];
    expect(keepWarmPingAt(failed, NOW_MS)).toBeNull();
    for (const paused of [{ archivedAt: at() }, { settledAt: at() }]) {
      const data = projection();
      data.thread = { ...data.thread, ...paused };
      expect(keepWarmPingAt(data, NOW_MS)).toBeNull();
    }
  });
});

describe("KeepWarmService", () => {
  it.effect.each([
    { name: "a thread turned on", override: true, instanceDefault: false, pings: 1 },
    { name: "a thread turned off", override: false, instanceDefault: true, pings: 0 },
    { name: "the instance default", override: null, instanceDefault: true, pings: 1 },
    { name: "the off default", override: null, instanceDefault: false, pings: 0 },
  ] as const)("pings for $name", (test) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW_MS);
        let data = projection();
        data = { ...data, thread: { ...data.thread, keepContextWarm: test.override } };
        const dispatched: Array<string> = [];
        const streamDone = yield* Deferred.make<void>();
        const completed = (id: RunId) => ({
          id: EventId.make(`completed-${id}`),
          type: "run.updated" as const,
          threadId,
          runId: id,
          occurredAt: at(),
          payload: { ...data.runs[0]!, id },
        });
        const dependencies = Layer.mergeAll(
          Layer.mock(Orchestrator.OrchestratorV2)({
            streamDomainEvents: Stream.make(completed(runId)).pipe(
              Stream.ensuring(Deferred.succeed(streamDone, undefined)),
            ),
            dispatch: (command) =>
              Effect.sync(() => {
                dispatched.push(command.commandId);
                return { sequence: 1, storedEvents: [] };
              }),
          }),
          Layer.mock(ProjectionStore.ProjectionStoreV2)({
            getThread: () => Effect.succeed(data.thread),
            getThreadRecords: () => Effect.succeed(data),
            listActiveShellIndex: () => Effect.succeed([]),
          }),
          Layer.mock(ServerSettings.ServerSettingsService)({
            getSettings: Effect.succeed({
              ...DEFAULT_SERVER_SETTINGS,
              providerInstances: {
                [instanceId]: {
                  driver: ProviderDriverKind.make("claudeAgent"),
                  enabled: true,
                  config: { keepContextWarm: test.instanceDefault },
                },
              },
            }),
            streamChanges: Stream.empty,
          }),
        );
        yield* Effect.gen(function* () {
          const service = yield* KeepWarmService.make;
          yield* service.start();
          yield* Deferred.await(streamDone);
          yield* TestClock.adjust(3 * MINUTE_MS);
          expect(dispatched).toEqual([]);
          yield* TestClock.adjust(MINUTE_MS);
        }).pipe(Effect.provide(dependencies));
        expect(dispatched).toEqual(test.pings === 1 ? ["server:keep-warm:warm-thread:run-1"] : []);
      }),
    ),
  );

  it.effect("arms threads that were already idle when the server starts", () =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* TestClock.setTime(NOW_MS);
        const base = projection();
        const data = { ...base, thread: { ...base.thread, keepContextWarm: true } };
        const dispatched: Array<string> = [];
        const scanned = yield* Deferred.make<void>();
        const dependencies = Layer.mergeAll(
          Layer.mock(Orchestrator.OrchestratorV2)({
            streamDomainEvents: Stream.never,
            dispatch: (command) =>
              Effect.sync(() => {
                dispatched.push(command.commandId);
                return { sequence: 1, storedEvents: [] };
              }),
          }),
          Layer.mock(ProjectionStore.ProjectionStoreV2)({
            getThread: () => Effect.succeed(data.thread),
            getThreadRecords: () => Effect.succeed(data),
            listActiveShellIndex: () =>
              Deferred.succeed(scanned, undefined).pipe(
                Effect.as([
                  {
                    id: threadId,
                    projectId: data.thread.projectId,
                    lineage: data.thread.lineage,
                    settledOverride: null,
                    settledAt: null,
                    pinnedAt: null,
                    snoozedUntil: null,
                    mayBeLive: false,
                  },
                ]),
              ),
          }),
          Layer.mock(ServerSettings.ServerSettingsService)({
            getSettings: Effect.succeed(DEFAULT_SERVER_SETTINGS),
            streamChanges: Stream.empty,
          }),
        );
        yield* Effect.gen(function* () {
          const service = yield* KeepWarmService.make;
          yield* service.start();
          yield* Deferred.await(scanned);
          yield* TestClock.adjust(4 * MINUTE_MS);
        }).pipe(Effect.provide(dependencies));
        expect(dispatched).toEqual(["server:keep-warm:warm-thread:run-1"]);
      }),
    ),
  );
});
