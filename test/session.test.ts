import { afterEach, describe, expect, it, vi } from "vitest";
import {
	MAX_STORED_MESSAGES,
	PENDING_SUMMARY_TTL_MS,
	SUMMARIZE_EVERY_TURNS,
	emptyMeta,
	shouldSummarize,
} from "../src/session";
import { deferred, makeEnv } from "./helpers";

const ID = "session-0001";

afterEach(() => {
	vi.restoreAllMocks();
});

async function chatTurns(session: ReturnType<ReturnType<typeof makeEnv>["session"]>, count: number) {
	const results = [];
	for (let i = 1; i <= count; i++) {
		results.push(await session.chat(ID, `answer ${i}`));
	}
	return results;
}

describe("shouldSummarize", () => {
	it("waits for enough new turns", () => {
		expect(shouldSummarize({ ...emptyMeta(), turns: SUMMARIZE_EVERY_TURNS - 1 }, 0)).toBe(false);
		expect(shouldSummarize({ ...emptyMeta(), turns: SUMMARIZE_EVERY_TURNS }, 0)).toBe(true);
		expect(shouldSummarize({ ...emptyMeta(), turns: 8, summarizedAtTurn: 6 }, 0)).toBe(false);
	});

	it("does not double-schedule unless the pending job is stale", () => {
		const meta = { ...emptyMeta(), turns: 7, summaryPendingSince: 1_000 };
		expect(shouldSummarize(meta, 1_000 + PENDING_SUMMARY_TTL_MS)).toBe(false);
		expect(shouldSummarize(meta, 1_001 + PENDING_SUMMARY_TTL_MS)).toBe(true);
	});
});

describe("ChatSession", () => {
	it("answers and stores the turn", async () => {
		const t = makeEnv();
		const result = await t.session(ID).chat(ID, "I want to prepare for a backend role");

		expect(result).toEqual({ reply: "Coach reply 1", turns: 1, summaryScheduled: false });
		const state = await t.session(ID).getState();
		expect(state).toMatchObject({ sessionId: ID, turns: 1, summary: "", summaryPending: false });
		expect(state.messages.map((m) => [m.role, m.content])).toEqual([
			["user", "I want to prepare for a backend role"],
			["assistant", "Coach reply 1"],
		]);
	});

	it("keeps memory across Durable Object restarts and sends history to the model", async () => {
		const t = makeEnv();
		await t.session(ID).chat(ID, "first");
		t.evict(ID);
		await t.session(ID).chat(ID, "second");

		const secondCall = t.ai.calls[1]?.messages ?? [];
		expect(secondCall.map((m) => m.content).slice(1)).toEqual(["first", "Coach reply 1", "second"]);
		expect((await t.session(ID).getState()).turns).toBe(2);
	});

	it("injects saved coach notes into later prompts", async () => {
		const t = makeEnv();
		await t.session(ID).chat(ID, "hello");
		await expect(t.session(ID).saveSummary("- Weak on SQL joins", 1, 0)).resolves.toBe(true);
		await t.session(ID).chat(ID, "next");

		expect(t.ai.calls[1]?.messages[0]?.content).toContain("- Weak on SQL joins");
	});

	it("schedules the summary Workflow every few turns, once at a time", async () => {
		const t = makeEnv();
		const results = await chatTurns(t.session(ID), SUMMARIZE_EVERY_TURNS + 1);

		expect(results.map((r) => r.summaryScheduled)).toEqual([false, false, false, false, false, true, false]);
		expect(t.summarizer.create).toHaveBeenCalledTimes(1);
		expect(t.summarizer.create).toHaveBeenCalledWith({ params: { sessionId: ID, epoch: 0 } });
		expect((await t.session(ID).getState()).summaryPending).toBe(true);
	});

	it("re-schedules when a pending summary is stale", async () => {
		const t = makeEnv();
		const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
		await chatTurns(t.session(ID), SUMMARIZE_EVERY_TURNS);
		expect(t.summarizer.create).toHaveBeenCalledTimes(1);

		now.mockReturnValue(1_000_000 + PENDING_SUMMARY_TTL_MS + 1);
		const result = await t.session(ID).chat(ID, "later");
		expect(result.summaryScheduled).toBe(true);
		expect(t.summarizer.create).toHaveBeenCalledTimes(2);
	});

	it("still replies when the Workflow cannot be started", async () => {
		const t = makeEnv();
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		t.summarizer.create.mockRejectedValue(new Error("workflows unavailable"));

		const results = await chatTurns(t.session(ID), SUMMARIZE_EVERY_TURNS);
		expect(results.at(-1)).toEqual({ reply: "Coach reply 6", turns: 6, summaryScheduled: false });
		expect((await t.session(ID).getState()).summaryPending).toBe(false);
		expect(log).toHaveBeenCalledOnce();
	});

	it("stores nothing when the model call fails", async () => {
		const t = makeEnv(() => {
			throw new Error("model down");
		});
		await expect(t.session(ID).chat(ID, "hello")).rejects.toThrow("model down");
		expect(await t.session(ID).getState()).toMatchObject({ turns: 0, messages: [] });
	});

	it("serialises concurrent turns so none are lost", async () => {
		const gate = deferred<string>();
		const t = makeEnv((_messages, call) => (call === 1 ? gate.promise : `Coach reply ${call}`));
		const session = t.session(ID);

		const first = session.chat(ID, "one");
		const second = session.chat(ID, "two");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(t.ai.run).toHaveBeenCalledTimes(1);

		gate.resolve("Coach reply 1");
		await Promise.all([first, second]);

		const state = await session.getState();
		expect(state.turns).toBe(2);
		expect(state.messages.map((m) => m.content)).toEqual(["one", "Coach reply 1", "two", "Coach reply 2"]);
		expect(t.ai.calls[1]?.messages.map((m) => m.content)).toContain("Coach reply 1");
	});

	it("keeps a failed turn from blocking the next one", async () => {
		const t = makeEnv((_messages, call) => {
			if (call === 1) {
				throw new Error("transient");
			}
			return "recovered";
		});
		const session = t.session(ID);
		const failed = session.chat(ID, "one");
		const ok = session.chat(ID, "two");

		await expect(failed).rejects.toThrow("transient");
		await expect(ok).resolves.toMatchObject({ reply: "recovered", turns: 1 });
	});

	it("caps the stored transcript", async () => {
		const t = makeEnv();
		await chatTurns(t.session(ID), MAX_STORED_MESSAGES / 2 + 5);

		const state = await t.session(ID).getState();
		expect(state.turns).toBe(MAX_STORED_MESSAGES / 2 + 5);
		expect(state.messages).toHaveLength(MAX_STORED_MESSAGES);
		expect(state.messages[0]?.content).toBe("answer 6");
	});

	it("saveSummary truncates, clears the pending flag and never moves backwards", async () => {
		const t = makeEnv();
		await chatTurns(t.session(ID), SUMMARIZE_EVERY_TURNS);

		await t.session(ID).saveSummary(`  ${"n".repeat(3000)}  `, 6, 0);
		expect((await t.session(ID).getTranscript()).summary).toBe("n".repeat(2000));

		await t.session(ID).saveSummary("older", 3, 0);
		const transcript = await t.session(ID).getTranscript();
		const state = await t.session(ID).getState();

		expect(transcript.summary).toBe("older");
		expect(state.summaryPending).toBe(false);
		// summarizedAtTurn stayed at 6, so turn 7 does not trigger a new summary yet.
		expect((await t.session(ID).chat(ID, "more")).summaryScheduled).toBe(false);
	});

	it("reset clears the session and ignores summaries from before the reset", async () => {
		const t = makeEnv();
		await chatTurns(t.session(ID), 3);
		await t.session(ID).reset();

		await expect(t.session(ID).saveSummary("stale notes", 3, 0)).resolves.toBe(false);
		const transcript = await t.session(ID).getTranscript();
		expect(transcript).toEqual({ epoch: 1, turns: 0, summary: "", messages: [] });
	});
});
