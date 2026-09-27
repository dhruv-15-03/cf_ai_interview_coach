import type { ChatMessage, LlmMessage } from "./types";

export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/** Recent messages sent to the model on every turn (short-term memory). */
export const CONTEXT_MESSAGES = 12;
/** Per-message cap when building the summarisation transcript. */
export const TRANSCRIPT_CHARS_PER_MESSAGE = 1000;

export const COACH_SYSTEM_PROMPT = `You are "Interview Coach", a friendly but rigorous mock interviewer for software engineering roles.

How you work:
- If the candidate has not said which role, level or topic they are preparing for, ask once, briefly.
- Run the interview one question at a time and wait for the candidate's answer before moving on.
- After each answer, give concise feedback: what was good, what was missing, and an outline of a stronger answer. Then ask the next question, adjusting difficulty to how the candidate is doing.
- Topics can include data structures and algorithms, system design, backend development, databases and SQL, frontend, cloud, and behavioural questions (use the STAR format).
- Keep replies under about 200 words unless the candidate asks for more detail. Use plain text and short lists; no tables.
- Never invent facts about the candidate. Treat the coach notes, if present, only as memory of earlier parts of this session.
- If asked to do something unrelated to interview preparation, politely steer back to the interview.`;

export const SUMMARY_SYSTEM_PROMPT = `You maintain long-term memory for an interview-coaching chat.
Update the coach notes using the previous notes and the new transcript.
Write at most 12 short bullet points covering: target role and level, topics already covered, strengths, weaknesses and recurring mistakes, and what to practise next.
Only record facts that appear in the previous notes or the transcript. Output only the bullet points.`;

export function buildChatMessages(
	summary: string,
	history: readonly ChatMessage[],
	userMessage: string,
): LlmMessage[] {
	const notes = summary.trim();
	const system =
		notes === ""
			? COACH_SYSTEM_PROMPT
			: `${COACH_SYSTEM_PROMPT}\n\nCoach notes from earlier in this session (long-term memory):\n${notes}`;

	return [
		{ role: "system", content: system },
		...history.slice(-CONTEXT_MESSAGES).map((m) => ({ role: m.role, content: m.content })),
		{ role: "user", content: userMessage },
	];
}

export function buildSummaryMessages(
	previousSummary: string,
	messages: readonly ChatMessage[],
): LlmMessage[] {
	const transcript = messages
		.map((m) => {
			const speaker = m.role === "user" ? "CANDIDATE" : "COACH";
			return `${speaker}: ${m.content.slice(0, TRANSCRIPT_CHARS_PER_MESSAGE)}`;
		})
		.join("\n");

	return [
		{ role: "system", content: SUMMARY_SYSTEM_PROMPT },
		{
			role: "user",
			content: `Previous notes:\n${previousSummary.trim() || "(none)"}\n\nNew transcript:\n${transcript}`,
		},
	];
}
