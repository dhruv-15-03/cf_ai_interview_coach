export type ChatRole = "user" | "assistant";

export interface ChatMessage {
	role: ChatRole;
	content: string;
	at: number;
}

export interface LlmMessage {
	role: "system" | ChatRole;
	content: string;
}

export interface SessionMeta {
	sessionId: string | null;
	turns: number;
	summary: string;
	summarizedAtTurn: number;
	summaryPendingSince: number | null;
	epoch: number;
}

export interface SessionState {
	sessionId: string | null;
	turns: number;
	summary: string;
	summaryPending: boolean;
	messages: ChatMessage[];
}

export interface ChatResult {
	reply: string;
	turns: number;
	summaryScheduled: boolean;
}

export interface Transcript {
	epoch: number;
	turns: number;
	summary: string;
	messages: ChatMessage[];
}

export interface SummarizeParams {
	sessionId: string;
	epoch: number;
}

export interface SummarizeOutcome {
	saved: boolean;
	upToTurn: number;
}
