import { describe, expect, it, vi } from "vitest";
import worker, { MAX_BODY_BYTES } from "../src/index";
import { makeEnv } from "./helpers";

const ID = "session-0003";
const BASE = "https://coach.example.com";

type IncomingRequest = Parameters<typeof worker.fetch>[0];

function post(path: string, body: unknown, init: RequestInit = {}): Request {
	return new Request(`${BASE}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
		...init,
	});
}

async function call(env: Env, request: Request) {
	const response = await worker.fetch(request as IncomingRequest, env);
	return { response, body: (await response.json()) as Record<string, unknown> };
}

describe("POST /api/chat", () => {
	it("returns the coach reply", async () => {
		const t = makeEnv();
		const { response, body } = await call(t.env, post("/api/chat", { sessionId: ID, message: " Hi " }));

		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(body).toEqual({ reply: "Coach reply 1", turns: 1, summaryScheduled: false });
		expect(t.ai.calls[0]?.messages.at(-1)).toEqual({ role: "user", content: "Hi" });
	});

	it.each([
		["invalid JSON", "{not json", "Request body must be valid JSON"],
		["a bad session id", { sessionId: "nope", message: "hi" }, "sessionId must be 8-64 characters of letters, digits, '-' or '_'"],
		["an empty message", { sessionId: ID, message: "" }, "message must be a non-empty string"],
	])("rejects %s with 400", async (_label, payload, error) => {
		const t = makeEnv();
		const { response, body } = await call(t.env, post("/api/chat", payload));
		expect(response.status).toBe(400);
		expect(body).toEqual({ error });
		expect(t.ai.run).not.toHaveBeenCalled();
	});

	it("rejects oversized bodies with 413", async () => {
		const t = makeEnv();
		const big = JSON.stringify({ sessionId: ID, message: "é".repeat(MAX_BODY_BYTES / 2) });
		const { response } = await call(t.env, post("/api/chat", big));
		expect(response.status).toBe(413);
	});

	it("rejects other methods with 405", async () => {
		const t = makeEnv();
		const { response } = await call(t.env, new Request(`${BASE}/api/chat`));
		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("POST");
	});

	it("maps model failures to 502", async () => {
		const t = makeEnv(() => {
			throw new Error("model down");
		});
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const { response, body } = await call(t.env, post("/api/chat", { sessionId: ID, message: "hi" }));

		expect(response.status).toBe(502);
		expect(body).toEqual({ error: "The AI model call failed. Please try again." });
		expect(log).toHaveBeenCalled();
		log.mockRestore();
	});
});

describe("session routes", () => {
	it("returns stored state and resets it", async () => {
		const t = makeEnv();
		await call(t.env, post("/api/chat", { sessionId: ID, message: "hello" }));

		const state = await call(t.env, new Request(`${BASE}/api/session?sessionId=${ID}`));
		expect(state.response.status).toBe(200);
		expect(state.body).toMatchObject({ sessionId: ID, turns: 1, summaryPending: false });

		const reset = await call(t.env, post("/api/reset", { sessionId: ID }));
		expect(reset.body).toEqual({ ok: true });

		const after = await call(t.env, new Request(`${BASE}/api/session?sessionId=${ID}`));
		expect(after.body).toMatchObject({ turns: 0, messages: [] });
	});

	it("validates the session id", async () => {
		const t = makeEnv();
		expect((await call(t.env, new Request(`${BASE}/api/session`))).response.status).toBe(400);
		expect((await call(t.env, post("/api/reset", {}))).response.status).toBe(400);
		expect((await call(t.env, post("/api/reset", "null"))).response.status).toBe(400);
	});

	it("enforces methods", async () => {
		const t = makeEnv();
		expect((await call(t.env, post("/api/session", {}))).response.headers.get("allow")).toBe("GET");
		expect((await call(t.env, new Request(`${BASE}/api/reset`))).response.status).toBe(405);
	});
});

describe("routing", () => {
	it("returns 404 for unknown API paths", async () => {
		const t = makeEnv();
		const { response, body } = await call(t.env, new Request(`${BASE}/api/unknown`));
		expect(response.status).toBe(404);
		expect(body).toEqual({ error: "Not found" });
	});

	it("serves everything else from static assets", async () => {
		const t = makeEnv();
		const response = await worker.fetch(new Request(`${BASE}/`) as IncomingRequest, t.env);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("<h1>static asset</h1>");
		expect(t.assets.fetch).toHaveBeenCalledOnce();
	});

	it("turns unexpected errors into 500", async () => {
		const t = makeEnv();
		const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
		vi.spyOn(t.session(ID), "getState").mockRejectedValue(new Error("storage exploded"));

		const { response, body } = await call(t.env, new Request(`${BASE}/api/session?sessionId=${ID}`));
		expect(response.status).toBe(500);
		expect(body).toEqual({ error: "Internal error" });
		log.mockRestore();
	});
});
