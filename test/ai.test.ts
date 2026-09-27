import { describe, expect, it } from "vitest";
import { AiResponseError, extractText, runChat } from "../src/ai";
import { MODEL } from "../src/prompt";
import { makeAi } from "./helpers";

describe("extractText", () => {
	it("reads and trims the response field", () => {
		expect(extractText({ response: "  Tell me about a hash map. " })).toBe("Tell me about a hash map.");
	});

	it("accepts a plain string", () => {
		expect(extractText(" ok ")).toBe("ok");
	});

	it.each([null, undefined, {}, { response: "" }, { response: "   " }, { response: 5 }, ""])(
		"throws on an unusable result (%s)",
		(result) => {
			expect(() => extractText(result)).toThrow(AiResponseError);
		},
	);
});

describe("runChat", () => {
	it("calls Llama 3.3 with the messages and token limit", async () => {
		const ai = makeAi(() => "answer");
		const messages = [{ role: "user" as const, content: "hi" }];

		await expect(runChat(ai as unknown as Ai, messages, 123)).resolves.toBe("answer");
		expect(ai.calls).toEqual([{ model: MODEL, messages, maxTokens: 123 }]);
	});

	it("propagates model failures", async () => {
		const ai = makeAi(() => {
			throw new Error("model overloaded");
		});
		await expect(runChat(ai as unknown as Ai, [], 10)).rejects.toThrow("model overloaded");
	});
});
