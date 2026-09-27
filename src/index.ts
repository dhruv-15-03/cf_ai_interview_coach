import { parseChatRequest, parseSessionId } from "./validation";

export { ChatSession } from "./session";
export { SummarizeWorkflow } from "./workflow";

export const MAX_BODY_BYTES = 16 * 1024;

type JsonBody = { ok: true; value: unknown } | { ok: false; response: Response };

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return Response.json(data, { status, headers: { "cache-control": "no-store", ...headers } });
}

function methodNotAllowed(allowed: string): Response {
	return json({ error: `Method not allowed; use ${allowed}` }, 405, { allow: allowed });
}

function sessionStub(env: Env, sessionId: string) {
	return env.CHAT_SESSION.get(env.CHAT_SESSION.idFromName(sessionId));
}

async function readJson(request: Request): Promise<JsonBody> {
	const declared = Number(request.headers.get("content-length") ?? "0");
	if (declared > MAX_BODY_BYTES) {
		return { ok: false, response: json({ error: "Request body too large" }, 413) };
	}
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
		return { ok: false, response: json({ error: "Request body too large" }, 413) };
	}
	try {
		return { ok: true, value: JSON.parse(text) as unknown };
	} catch {
		return { ok: false, response: json({ error: "Request body must be valid JSON" }, 400) };
	}
}

export async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
	switch (pathname) {
		case "/api/chat": {
			if (request.method !== "POST") {
				return methodNotAllowed("POST");
			}
			const body = await readJson(request);
			if (!body.ok) {
				return body.response;
			}
			const parsed = parseChatRequest(body.value);
			if (!parsed.ok) {
				return json({ error: parsed.error }, 400);
			}
			const { sessionId, message } = parsed.value;
			try {
				return json(await sessionStub(env, sessionId).chat(sessionId, message));
			} catch (err) {
				console.error("chat turn failed", err);
				return json({ error: "The AI model call failed. Please try again." }, 502);
			}
		}

		case "/api/session": {
			if (request.method !== "GET") {
				return methodNotAllowed("GET");
			}
			const id = parseSessionId(new URL(request.url).searchParams.get("sessionId"));
			if (!id.ok) {
				return json({ error: id.error }, 400);
			}
			return json(await sessionStub(env, id.value).getState());
		}

		case "/api/reset": {
			if (request.method !== "POST") {
				return methodNotAllowed("POST");
			}
			const body = await readJson(request);
			if (!body.ok) {
				return body.response;
			}
			const raw = typeof body.value === "object" && body.value !== null ? body.value : {};
			const id = parseSessionId((raw as Record<string, unknown>)["sessionId"]);
			if (!id.ok) {
				return json({ error: id.error }, 400);
			}
			await sessionStub(env, id.value).reset();
			return json({ ok: true });
		}

		default:
			return json({ error: "Not found" }, 404);
	}
}

export default {
	async fetch(request, env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname.startsWith("/api/")) {
			try {
				return await handleApi(request, env, pathname);
			} catch (err) {
				console.error("unhandled API error", err);
				return json({ error: "Internal error" }, 500);
			}
		}
		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
