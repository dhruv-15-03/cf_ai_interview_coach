import { vi } from "vitest";
import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from "cloudflare:workers";
import { ChatSession } from "../src/session";
import type { LlmMessage, SummarizeParams } from "../src/types";

/** In-memory stand-in for the Durable Object KV storage API (get/put with single keys or batches). */
export class MemoryStorage {
	readonly #data = new Map<string, unknown>();

	async get(keys: string | string[]): Promise<unknown> {
		if (Array.isArray(keys)) {
			const found = new Map<string, unknown>();
			for (const key of keys) {
				if (this.#data.has(key)) {
					found.set(key, structuredClone(this.#data.get(key)));
				}
			}
			return found;
		}
		const value = this.#data.get(keys);
		return value === undefined ? undefined : structuredClone(value);
	}

	async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
		if (typeof keyOrEntries === "string") {
			this.#data.set(keyOrEntries, structuredClone(value));
			return;
		}
		for (const [key, entry] of Object.entries(keyOrEntries)) {
			this.#data.set(key, structuredClone(entry));
		}
	}

	async delete(key: string): Promise<boolean> {
		return this.#data.delete(key);
	}

	async deleteAll(): Promise<void> {
		this.#data.clear();
	}
}

export interface AiCall {
	model: string;
	messages: LlmMessage[];
	maxTokens: number;
}

export type ReplyFn = (messages: LlmMessage[], call: number) => string | Promise<string>;

export function makeAi(reply: ReplyFn = (_messages, call) => `Coach reply ${call}`) {
	const calls: AiCall[] = [];
	const run = vi.fn(async (model: string, input: { messages: LlmMessage[]; max_tokens: number }) => {
		calls.push({ model, messages: input.messages, maxTokens: input.max_tokens });
		return { response: await reply(input.messages, calls.length) };
	});
	return { run, calls };
}

export function makeEnv(reply?: ReplyFn) {
	const ai = makeAi(reply);
	const summarizer = {
		create: vi.fn(async (_options: { params: SummarizeParams }) => ({ id: "workflow-instance-1" })),
	};
	const assets = {
		fetch: vi.fn(async (_request: Request) => new Response("<h1>static asset</h1>", { status: 200 })),
	};
	const storages = new Map<string, MemoryStorage>();
	const instances = new Map<string, ChatSession>();

	const env = {} as Record<string, unknown>;
	const namespace = {
		idFromName: (name: string) => name,
		get: (id: string) => {
			let instance = instances.get(id);
			if (instance === undefined) {
				let storage = storages.get(id);
				if (storage === undefined) {
					storage = new MemoryStorage();
					storages.set(id, storage);
				}
				instance = new ChatSession({ storage } as unknown as DurableObjectState, env as unknown as Env);
				instances.set(id, instance);
			}
			return instance;
		},
	};
	Object.assign(env, { AI: ai, SUMMARIZER: summarizer, CHAT_SESSION: namespace, ASSETS: assets });

	return {
		env: env as unknown as Env,
		ai,
		summarizer,
		assets,
		session: (id: string) => namespace.get(id),
		/** Drop the in-memory object but keep its storage, like an eviction or restart. */
		evict: (id: string) => instances.delete(id),
	};
}

export interface StepCall {
	name: string;
	config: WorkflowStepConfig | undefined;
}

/** Minimal WorkflowStep: runs each callback once and round-trips results like the real engine persists them. */
export function makeStep() {
	const calls: StepCall[] = [];
	const step = {
		do: async (name: string, configOrCallback: unknown, maybeCallback?: unknown) => {
			const callback = (typeof configOrCallback === "function" ? configOrCallback : maybeCallback) as () => Promise<unknown>;
			const config = typeof configOrCallback === "function" ? undefined : (configOrCallback as WorkflowStepConfig);
			calls.push({ name, config });
			return structuredClone(await callback());
		},
	};
	return { step: step as unknown as WorkflowStep, calls };
}

export function makeEvent(payload: SummarizeParams): WorkflowEvent<SummarizeParams> {
	return {
		payload,
		timestamp: new Date(0),
		instanceId: "workflow-instance-1",
		workflowName: "cf-ai-interview-coach-summarizer",
	};
}

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}
