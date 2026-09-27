import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { runChat } from "./ai";
import { buildSummaryMessages } from "./prompt";
import { MAX_SUMMARY_CHARS } from "./session";
import type { SummarizeOutcome, SummarizeParams, Transcript } from "./types";

export const SUMMARY_MAX_TOKENS = 500;

/**
 * Durable background job: load the transcript from the session's Durable Object, ask Llama 3.3
 * to condense it into "coach notes", and write them back. Each step's result is persisted, so a
 * retry of the AI step never re-reads the transcript or double-writes the summary.
 */
export class SummarizeWorkflow extends WorkflowEntrypoint<Env, SummarizeParams> {
	override async run(
		event: Readonly<WorkflowEvent<SummarizeParams>>,
		step: WorkflowStep,
	): Promise<SummarizeOutcome> {
		const { sessionId, epoch } = event.payload;
		const session = this.env.CHAT_SESSION.get(this.env.CHAT_SESSION.idFromName(sessionId));

		const transcript = await step.do("load transcript", async (): Promise<Transcript> => {
			const t = await session.getTranscript();
			return {
				epoch: t.epoch,
				turns: t.turns,
				summary: t.summary,
				messages: t.messages.map((m) => ({ role: m.role, content: m.content, at: m.at })),
			};
		});

		if (transcript.epoch !== epoch || transcript.messages.length === 0) {
			return { saved: false, upToTurn: transcript.turns };
		}

		const summary = await step.do(
			"summarize with Llama 3.3",
			{ retries: { limit: 3, delay: "5 seconds", backoff: "exponential" }, timeout: "2 minutes" },
			async (): Promise<string> => {
				const text = await runChat(
					this.env.AI,
					buildSummaryMessages(transcript.summary, transcript.messages),
					SUMMARY_MAX_TOKENS,
				);
				return text.slice(0, MAX_SUMMARY_CHARS);
			},
		);

		const saved = await step.do("save summary", async (): Promise<boolean> =>
			session.saveSummary(summary, transcript.turns, epoch),
		);

		return { saved, upToTurn: transcript.turns };
	}
}
