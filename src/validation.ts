export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_MESSAGE_CHARS = 4000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ChatRequest {
	sessionId: string;
	message: string;
}

export function parseSessionId(value: unknown): Parsed<string> {
	if (typeof value !== "string" || !SESSION_ID_PATTERN.test(value)) {
		return { ok: false, error: "sessionId must be 8-64 characters of letters, digits, '-' or '_'" };
	}
	return { ok: true, value };
}

export function parseChatRequest(body: unknown): Parsed<ChatRequest> {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return { ok: false, error: "Request body must be a JSON object" };
	}
	const { sessionId, message } = body as Record<string, unknown>;

	const id = parseSessionId(sessionId);
	if (!id.ok) {
		return id;
	}
	if (typeof message !== "string" || message.trim() === "") {
		return { ok: false, error: "message must be a non-empty string" };
	}
	const trimmed = message.trim();
	if (trimmed.length > MAX_MESSAGE_CHARS) {
		return { ok: false, error: `message must be at most ${MAX_MESSAGE_CHARS} characters` };
	}
	return { ok: true, value: { sessionId: id.value, message: trimmed } };
}
