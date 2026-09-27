import { describe, expect, it } from "vitest";
import { SUMMARIZE_EVERY_TURNS } from "../src/session";
import { SUMMARY_SYSTEM_PROMPT } from "../src/prompt";
import { SUMMARY_MAX_TOKENS, SummarizeWorkflow } from "../src/workflow";
import { makeEnv, makeEvent, makeStep } from "./helpers";

const ID = "session-0002";

function summaryFor(messages: { role: string; content: string }[]): string | undefined {
	return messages[0]?.content === SUMMARY_SYSTEM_PROMPT ? "- Target: SDE-1 backend\n- Weak on indexing" : undefined;
}

function workflow(env: Env) {
	return new SummarizeWorkflow({} as ExecutionContext, env);
}

describe("SummarizeWorkflow", () => {
	it("summarises the transcript into long-term notes used by later turns", async () => {
		const t = makeEnv((messages, call) => summaryFor(messages) ?? `Coach reply ${call}`);
		for (let i = 1; i <= SUMMARIZE_EVERY_TURNS; i++) {
			await t.session(ID).chat(ID, `answer ${i}`);
		}
		const params = t.summarizer.create.mock.calls[0]?.[0].params;
		expect(params).toEqual({ sessionId: ID, epoch: 0 });

		const { step, calls } = makeStep();
		const outcome = await workflow(t.env).run(makeEvent({ sessionId: ID, epoch: 0 }), step);

		expect(outcome).toEqual({ saved: true, upToTurn: SUMMARIZE_EVERY_TURNS });
		expect(calls.map((c) => c.name)).toEqual(["load transcript", "summarize with Llama 3.3", "save summary"]);
		expect(calls[1]?.config).toEqual({
			retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
			timeout: "2 minutes",
		});
		const summaryCall = t.ai.calls.at(-1);
		expect(summaryCall?.maxTokens).toBe(SUMMARY_MAX_TOKENS);
		expect(summaryCall?.messages[1]?.content).toContain("CANDIDATE: answer 6");

		const state = await t.session(ID).getState();
		expect(state.summary).toBe("- Target: SDE-1 backend\n- Weak on indexing");
		expect(state.summaryPending).toBe(false);

		await t.session(ID).chat(ID, "next question please");
		expect(t.ai.calls.at(-1)?.messages[0]?.content).toContain("- Weak on indexing");
	});

	it("skips the model when the session was reset after scheduling", async () => {
		const t = makeEnv();
		await t.session(ID).chat(ID, "hello");
		await t.session(ID).reset();
		const callsBefore = t.ai.calls.length;

		const { step, calls } = makeStep();
		const outcome = await workflow(t.env).run(makeEvent({ sessionId: ID, epoch: 0 }), step);

		expect(outcome).toEqual({ saved: false, upToTurn: 0 });
		expect(calls.map((c) => c.name)).toEqual(["load transcript"]);
		expect(t.ai.calls).toHaveLength(callsBefore);
	});

	it("does not overwrite notes if a reset happens while the model is running", async () => {
		const t = makeEnv((messages, call) => {
			if (summaryFor(messages) !== undefined) {
				return t.session(ID).reset().then(() => "- stale notes");
			}
			return `Coach reply ${call}`;
		});
		await t.session(ID).chat(ID, "hello");

		const { step } = makeStep();
		const outcome = await workflow(t.env).run(makeEvent({ sessionId: ID, epoch: 0 }), step);

		expect(outcome).toEqual({ saved: false, upToTurn: 1 });
		expect((await t.session(ID).getState()).summary).toBe("");
	});
});
