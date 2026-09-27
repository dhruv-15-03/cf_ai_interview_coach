import { MODEL } from "./prompt";
import type { LlmMessage } from "./types";

export class AiResponseError extends Error {
	override name = "AiResponseError";
}

/** Workers AI text models return `{ response: string }`; anything else is treated as a failure. */
export function extractText(result: unknown): string {
	if (typeof result === "string" && result.trim() !== "") {
		return result.trim();
	}
	if (typeof result === "object" && result !== null && "response" in result) {
		const { response } = result;
		if (typeof response === "string" && response.trim() !== "") {
			return response.trim();
		}
	}
	throw new AiResponseError("Workers AI returned an empty or unexpected response");
}

export async function runChat(ai: Ai, messages: LlmMessage[], maxTokens: number): Promise<string> {
	const result: unknown = await ai.run(MODEL, { messages, max_tokens: maxTokens });
	return extractText(result);
}
