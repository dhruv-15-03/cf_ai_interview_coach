import { DurableObject } from "cloudflare:workers";
import { runChat } from "./ai";
import { buildChatMessages } from "./prompt";
import type { ChatMessage, ChatResult, SessionMeta, SessionState, Transcript } from "./types";

export const MAX_STORED_MESSAGES = 60;
export const TRANSCRIPT_MESSAGES = 20;
export const SUMMARIZE_EVERY_TURNS = 6;
export const PENDING_SUMMARY_TTL_MS = 10 * 60 * 1000;
export const CHAT_MAX_TOKENS = 700;
export const MAX_SUMMARY_CHARS = 2000;

const META_KEY = "meta";
const MESSAGES_KEY = "messages";

export function emptyMeta(epoch = 0): SessionMeta {
	return {
		sessionId: null,
		turns: 0,
		summary: "",
		summarizedAtTurn: 0,
		summaryPendingSince: null,
		epoch,
	};
}

/** Summarise every N turns, unless a summary job is already running (a stale job is retried after a TTL). */
export function shouldSummarize(meta: SessionMeta, now: number): boolean {
	if (meta.turns - meta.summarizedAtTurn < SUMMARIZE_EVERY_TURNS) {
		return false;
	}
	return meta.summaryPendingSince === null || now - meta.summaryPendingSince > PENDING_SUMMARY_TTL_MS;
}

/**
 * One instance per chat session (addressed by name = sessionId).
 * Holds the transcript, turn counter and long-term "coach notes" in SQLite-backed storage.
 */
export class ChatSession extends DurableObject<Env> {
	#queue: Promise<unknown> = Promise.resolve();

	async chat(sessionId: string, message: string): Promise<ChatResult> {
		return this.#exclusive(async () => {
			const { meta, messages } = await this.#load();

			// If the model call throws, nothing below runs, so no half-written turn is stored.
			const reply = await runChat(
				this.env.AI,
				buildChatMessages(meta.summary, messages, message),
				CHAT_MAX_TOKENS,
			);

			const now = Date.now();
			const nextMessages: ChatMessage[] = [
				...messages,
				{ role: "user" as const, content: message, at: now },
				{ role: "assistant" as const, content: reply, at: now },
			].slice(-MAX_STORED_MESSAGES);
			const nextMeta: SessionMeta = { ...meta, sessionId, turns: meta.turns + 1 };

			await this.ctx.storage.put<unknown>({ [META_KEY]: nextMeta, [MESSAGES_KEY]: nextMessages });
			const summaryScheduled = await this.#maybeScheduleSummary(nextMeta, sessionId, now);

			return { reply, turns: nextMeta.turns, summaryScheduled };
		});
	}

	async getState(): Promise<SessionState> {
		const { meta, messages } = await this.#load();
		return {
			sessionId: meta.sessionId,
			turns: meta.turns,
			summary: meta.summary,
			summaryPending: meta.summaryPendingSince !== null,
			messages,
		};
	}

	/** Called by SummarizeWorkflow. */
	async getTranscript(): Promise<Transcript> {
		const { meta, messages } = await this.#load();
		return {
			epoch: meta.epoch,
			turns: meta.turns,
			summary: meta.summary,
			messages: messages.slice(-TRANSCRIPT_MESSAGES),
		};
	}

	/** Called by SummarizeWorkflow. Returns false if the session was reset after the job started. */
	async saveSummary(summary: string, upToTurn: number, epoch: number): Promise<boolean> {
		return this.#exclusive(async () => {
			const { meta } = await this.#load();
			if (meta.epoch !== epoch) {
				return false;
			}
			const next: SessionMeta = {
				...meta,
				summary: summary.trim().slice(0, MAX_SUMMARY_CHARS),
				summarizedAtTurn: Math.max(meta.summarizedAtTurn, upToTurn),
				summaryPendingSince: null,
			};
			await this.ctx.storage.put(META_KEY, next);
			return true;
		});
	}

	async reset(): Promise<void> {
		return this.#exclusive(async () => {
			const { meta } = await this.#load();
			await this.ctx.storage.put<unknown>({ [META_KEY]: emptyMeta(meta.epoch + 1), [MESSAGES_KEY]: [] });
		});
	}

	async #maybeScheduleSummary(meta: SessionMeta, sessionId: string, now: number): Promise<boolean> {
		if (!shouldSummarize(meta, now)) {
			return false;
		}
		try {
			await this.env.SUMMARIZER.create({ params: { sessionId, epoch: meta.epoch } });
		} catch (err) {
			// Memory compaction is best-effort: the chat reply must still succeed.
			console.error("Failed to start SummarizeWorkflow", err);
			return false;
		}
		await this.ctx.storage.put(META_KEY, { ...meta, summaryPendingSince: now });
		return true;
	}

	/**
	 * Awaiting Workers AI releases the Durable Object's input gate, so a second request could
	 * interleave mid-turn. Chaining mutations on one promise keeps turns strictly ordered.
	 */
	#exclusive<T>(task: () => Promise<T>): Promise<T> {
		const run = this.#queue.then(task);
		this.#queue = run.catch(() => undefined);
		return run;
	}

	async #load(): Promise<{ meta: SessionMeta; messages: ChatMessage[] }> {
		const values = await this.ctx.storage.get<unknown>([META_KEY, MESSAGES_KEY]);
		const meta = values.get(META_KEY) as Partial<SessionMeta> | undefined;
		const messages = values.get(MESSAGES_KEY) as ChatMessage[] | undefined;
		return { meta: { ...emptyMeta(), ...meta }, messages: messages ?? [] };
	}
}
