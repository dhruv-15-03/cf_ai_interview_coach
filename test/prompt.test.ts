import { describe, expect, it } from "vitest";
import {
	buildChatMessages,
	buildSummaryMessages,
	COACH_SYSTEM_PROMPT,
	CONTEXT_MESSAGES,
	SUMMARY_SYSTEM_PROMPT,
	TRANSCRIPT_CHARS_PER_MESSAGE,
} from "../src/prompt";
import type { ChatMessage } from "../src/types";

function history(count: number): ChatMessage[] {
	return Array.from({ length: count }, (_, i) => ({
		role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
		content: `message ${i}`,
		at: i,
	}));
}

describe("buildChatMessages", () => {
	it("uses the coach prompt alone when there are no notes", () => {
		const messages = buildChatMessages("  ", [], "Hi");
		expect(messages).toEqual([
			{ role: "system", content: COACH_SYSTEM_PROMPT },
			{ role: "user", content: "Hi" },
		]);
	});

	it("appends long-term notes to the system prompt", () => {
		const [system] = buildChatMessages("- Target: backend SDE-1", [], "Next question");
		expect(system?.content).toContain(COACH_SYSTEM_PROMPT);
		expect(system?.content).toContain("Coach notes from earlier in this session");
		expect(system?.content).toContain("- Target: backend SDE-1");
	});

	it("keeps only the most recent history and drops timestamps", () => {
		const messages = buildChatMessages("", history(20), "latest");
		expect(messages).toHaveLength(CONTEXT_MESSAGES + 2);
		expect(messages[1]).toEqual({ role: "user", content: "message 8" });
		expect(messages.at(-2)).toEqual({ role: "assistant", content: "message 19" });
		expect(messages.at(-1)).toEqual({ role: "user", content: "latest" });
	});
});

describe("buildSummaryMessages", () => {
	it("labels speakers and marks missing previous notes", () => {
		const [system, user] = buildSummaryMessages("", history(2));
		expect(system).toEqual({ role: "system", content: SUMMARY_SYSTEM_PROMPT });
		expect(user?.content).toBe("Previous notes:\n(none)\n\nNew transcript:\nCANDIDATE: message 0\nCOACH: message 1");
	});

	it("includes previous notes and truncates very long messages", () => {
		const long: ChatMessage = { role: "user", content: "x".repeat(TRANSCRIPT_CHARS_PER_MESSAGE + 500), at: 0 };
		const [, user] = buildSummaryMessages("- old note", [long]);
		expect(user?.content).toContain("Previous notes:\n- old note");
		expect(user?.content).toContain(`CANDIDATE: ${"x".repeat(TRANSCRIPT_CHARS_PER_MESSAGE)}`);
		expect(user?.content).not.toContain("x".repeat(TRANSCRIPT_CHARS_PER_MESSAGE + 1));
	});
});
