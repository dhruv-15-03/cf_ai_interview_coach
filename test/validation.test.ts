import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_CHARS, parseChatRequest, parseSessionId } from "../src/validation";

const ID = "a1b2c3d4-e5f6";

describe("parseSessionId", () => {
	it.each(["abcdefgh", "A_b-9".repeat(4), "x".repeat(64), crypto.randomUUID()])("accepts %s", (id) => {
		expect(parseSessionId(id)).toEqual({ ok: true, value: id });
	});

	it.each([undefined, null, 42, "short", "x".repeat(65), "has space!", "../../etc"])("rejects %s", (id) => {
		expect(parseSessionId(id).ok).toBe(false);
	});
});

describe("parseChatRequest", () => {
	it("trims the message", () => {
		expect(parseChatRequest({ sessionId: ID, message: "  hello \n" })).toEqual({
			ok: true,
			value: { sessionId: ID, message: "hello" },
		});
	});

	it.each([null, "text", [], 5])("rejects a non-object body (%s)", (body) => {
		expect(parseChatRequest(body)).toEqual({ ok: false, error: "Request body must be a JSON object" });
	});

	it("rejects a bad session id", () => {
		expect(parseChatRequest({ sessionId: "bad", message: "hi" }).ok).toBe(false);
	});

	it.each([undefined, 7, "", "   "])("rejects an empty or non-string message (%s)", (message) => {
		expect(parseChatRequest({ sessionId: ID, message })).toEqual({
			ok: false,
			error: "message must be a non-empty string",
		});
	});

	it("enforces the length limit after trimming", () => {
		expect(parseChatRequest({ sessionId: ID, message: ` ${"a".repeat(MAX_MESSAGE_CHARS)} ` }).ok).toBe(true);
		expect(parseChatRequest({ sessionId: ID, message: "a".repeat(MAX_MESSAGE_CHARS + 1) }).ok).toBe(false);
	});
});
