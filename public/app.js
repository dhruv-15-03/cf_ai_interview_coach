// @ts-check

/**
 * @typedef {{ role: "user" | "assistant", content: string, at?: number }} ChatMessage
 * @typedef {{ sessionId: string | null, turns: number, summary: string, summaryPending: boolean, messages: ChatMessage[] }} SessionState
 * @typedef {{ reply: string, turns: number, summaryScheduled: boolean }} ChatResult
 */

const STORAGE_KEY = "cf-ai-interview-coach:sessionId";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const NOTES_POLL_MS = 3000;
const NOTES_POLL_LIMIT = 10;
const WELCOME =
	"Hi! I'm your mock interview coach. Tell me the role you're preparing for (for example, SDE-1 backend in Java) " +
	"and I'll ask one question at a time, then give feedback on each answer.";
const EMPTY_NOTES = "No notes yet. They appear after a few turns.";

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function byId(id, type) {
	const el = document.getElementById(id);
	if (!(el instanceof type)) throw new Error(`Missing #${id}`);
	return el;
}

const messagesEl = byId("messages", HTMLOListElement);
const form = byId("composer", HTMLFormElement);
const input = byId("input", HTMLTextAreaElement);
const sendButton = byId("send", HTMLButtonElement);
const newSessionButton = byId("new-session", HTMLButtonElement);
const turnsEl = byId("turns", HTMLSpanElement);
const notesEl = byId("notes", HTMLPreElement);
const notesStatusEl = byId("notes-status", HTMLParagraphElement);
const errorEl = byId("error", HTMLParagraphElement);
const suggestionsEl = byId("suggestions", HTMLDivElement);

let sessionId = loadSessionId();
let busy = false;
let pollTimer = 0;

/** @returns {string} */
function loadSessionId() {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored !== null && SESSION_ID_PATTERN.test(stored)) return stored;
	return rotateSessionId();
}

/** @returns {string} */
function rotateSessionId() {
	const id = crypto.randomUUID();
	localStorage.setItem(STORAGE_KEY, id);
	return id;
}

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function api(path, init) {
	const response = await fetch(path, init);
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(typeof body.error === "string" ? body.error : `Request failed (${response.status})`);
	}
	return body;
}

/**
 * @param {string} path
 * @param {unknown} payload
 */
function postJson(path, payload) {
	return api(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
}

/**
 * @param {"user" | "assistant"} role
 * @param {string} text
 * @param {boolean} [pending]
 * @returns {HTMLLIElement}
 */
function addMessage(role, text, pending = false) {
	const item = document.createElement("li");
	item.className = `message ${role}${pending ? " pending" : ""}`;
	const who = document.createElement("span");
	who.className = "who";
	who.textContent = role === "user" ? "You" : "Coach";
	const bubble = document.createElement("div");
	bubble.className = "bubble";
	bubble.textContent = text;
	item.append(who, bubble);
	messagesEl.append(item);
	item.scrollIntoView({ block: "end", behavior: "smooth" });
	return item;
}

/** @param {number} turns */
function renderTurns(turns) {
	turnsEl.textContent = `${turns} ${turns === 1 ? "turn" : "turns"}`;
}

/**
 * @param {string} summary
 * @param {boolean} pending
 */
function renderNotes(summary, pending) {
	notesEl.textContent = summary.trim() === "" ? EMPTY_NOTES : summary;
	notesStatusEl.hidden = !pending;
}

/** @param {string} message */
function showError(message) {
	errorEl.textContent = message;
	errorEl.hidden = message === "";
}

/** @param {boolean} value */
function setBusy(value) {
	busy = value;
	sendButton.disabled = value;
	input.setAttribute("aria-busy", String(value));
}

/** @param {SessionState} state */
function renderState(state) {
	messagesEl.replaceChildren();
	addMessage("assistant", WELCOME);
	for (const message of state.messages) addMessage(message.role, message.content);
	suggestionsEl.hidden = state.messages.length > 0;
	renderTurns(state.turns);
	renderNotes(state.summary, state.summaryPending);
}

async function loadSession() {
	try {
		/** @type {SessionState} */
		const state = await api(`/api/session?sessionId=${encodeURIComponent(sessionId)}`);
		renderState(state);
		if (state.summaryPending) pollNotes();
	} catch (error) {
		renderState({ sessionId, turns: 0, summary: "", summaryPending: false, messages: [] });
		showError(error instanceof Error ? error.message : String(error));
	}
}

function pollNotes() {
	window.clearTimeout(pollTimer);
	const id = sessionId;
	let attempts = 0;
	notesStatusEl.hidden = false;

	const tick = async () => {
		attempts += 1;
		try {
			/** @type {SessionState} */
			const state = await api(`/api/session?sessionId=${encodeURIComponent(id)}`);
			if (id !== sessionId) return;
			if (!state.summaryPending || attempts >= NOTES_POLL_LIMIT) {
				renderNotes(state.summary, false);
				return;
			}
		} catch {
			if (attempts >= NOTES_POLL_LIMIT) {
				notesStatusEl.hidden = true;
				return;
			}
		}
		pollTimer = window.setTimeout(tick, NOTES_POLL_MS);
	};
	pollTimer = window.setTimeout(tick, NOTES_POLL_MS);
}

/** @param {string} text */
async function send(text) {
	const message = text.trim();
	if (message === "" || busy) return;
	showError("");
	setBusy(true);
	suggestionsEl.hidden = true;
	addMessage("user", message);
	input.value = "";
	const placeholder = addMessage("assistant", "Thinking…", true);

	try {
		/** @type {ChatResult} */
		const result = await postJson("/api/chat", { sessionId, message });
		placeholder.remove();
		addMessage("assistant", result.reply);
		renderTurns(result.turns);
		if (result.summaryScheduled) pollNotes();
	} catch (error) {
		placeholder.remove();
		input.value = message;
		showError(error instanceof Error ? error.message : String(error));
	} finally {
		setBusy(false);
		input.focus();
	}
}

async function startNewSession() {
	if (busy) return;
	window.clearTimeout(pollTimer);
	showError("");
	const previous = sessionId;
	sessionId = rotateSessionId();
	renderState({ sessionId, turns: 0, summary: "", summaryPending: false, messages: [] });
	try {
		await postJson("/api/reset", { sessionId: previous });
	} catch {
		// The old session is abandoned either way; a failed reset only leaves its data in place.
	}
	input.focus();
}

form.addEventListener("submit", (event) => {
	event.preventDefault();
	void send(input.value);
});

input.addEventListener("keydown", (event) => {
	if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
		event.preventDefault();
		void send(input.value);
	}
});

suggestionsEl.addEventListener("click", (event) => {
	const target = event.target;
	if (target instanceof HTMLButtonElement && target.textContent !== null) void send(target.textContent);
});

newSessionButton.addEventListener("click", () => {
	void startNewSession();
});

void loadSession();

export {};
