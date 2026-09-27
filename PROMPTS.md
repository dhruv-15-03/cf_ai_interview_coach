# PROMPTS.md

The assignment says: "AI-assisted coding is encouraged, but you have to submit prompt history." This file is that
history. It has three parts:

1. the prompt that produced the first version of this code;
2. the prompts the app itself sends to Llama 3.3 at runtime;
3. prompts added during my own review and changes.

## 1. Build prompt (AI coding assistant)

- **Tool:** GitHub Copilot app, agent mode.
- **Model:** Claude Opus 5.5.
- **Date:** 27 September 2026.

The agent received the instruction below, quoted verbatim. It was running inside a job-search assistant session, and
that session's standing instructions (unrelated to the code) are omitted. The instruction refers to the job form's
"Optional Assignment" text, which the agent had saved earlier. That text is quoted after it.

> R-27SEP-19 (coordinator, 13:55 IST). This lifts your idle state for a BUILD task: the Cloudflare take-home you identified (reqs 8212060 and 8168623, the "Optional Assignment").
>
> 0. First re-read your saved Cloudflare JD/form evidence (S\.firecrawl\assessment-*). Extract, verbatim:
>    - the exact assignment requirements;
>    - the repo-naming rule;
>    - the AI-use policy.
>    If the policy forbids AI-generated code, STOP and report.
> 1. If AI assistance is permitted (for example, a PROMPTS.md is required), build a complete app in a NEW folder E:\cf_ai_<name>\ that meets EVERY stated requirement: an LLM via Workers AI, coordination via Workflows or Durable Objects, chat input, and memory/state. It must include:
>    - TypeScript in strict mode;
>    - tests (vitest, bindings mocked), with npm test passing;
>    - README.md with local-run and deploy steps;
>    - an honest PROMPTS.md listing the prompts actually used, including this coordinator instruction.
> 2. PROHIBITED: Cloudflare account actions, deploys, GitHub repo creation or pushes, and applications. Dhruv reviews it, deploys with his own account, and pushes as dhruv-15-03.
> 3. Deliver by 18:30 IST and report ONCE:
>    - path and file list;
>    - test output;
>    - Dhruv's exact next steps (wrangler login, deploy, repo creation);
>    - a 5-minute code walkthrough so he can explain every part in an interview.

The assignment text from the Cloudflare application form, as the agent extracted it:

> Optional Assignment: Please share GitHub repo URL for the project here
>
> We plan to fast track candidates who complete an assignment to build a type of AI-powered application on Cloudflare. An AI-powered application should include the following components:
>
> - LLM (recommend using Llama 3.3 on Workers AI), or an external LLM of your choice
> - Workflow / coordination (recommend using Workflows, Workers or Durable Objects)
> - User input via chat or voice (recommend using Pages or Realtime)
> - Memory or state
>
> Find additional documentation here.
>
> Note: AI-assisted coding is encouraged, but you have to submit prompt history.

No other human prompts were given during the build. Everything else the agent did was driven by tool output:

- `tsc` errors, for example adding `override` to `SummarizeWorkflow.run` and a cast of the incoming `Request` type in
  the tests;
- `vitest` results;
- `wrangler types` and `wrangler deploy --dry-run`, which bundles the code without deploying.

The agent chose the app idea (an interview coach), the architecture (one Durable Object per session and a
summarisation Workflow), the prompts in section 2, and the tests.

## 2. Runtime prompts (sent to Llama 3.3 by the app)

These are copied from `src/prompt.ts`; that file is the source of truth.

### Coach system prompt

This is sent on every chat turn. When coach notes exist, it is followed by
`Coach notes from earlier in this session (long-term memory):` and the notes.

```text
You are "Interview Coach", a friendly but rigorous mock interviewer for software engineering roles.

How you work:
- If the candidate has not said which role, level or topic they are preparing for, ask once, briefly.
- Run the interview one question at a time and wait for the candidate's answer before moving on.
- After each answer, give concise feedback: what was good, what was missing, and an outline of a stronger answer. Then ask the next question, adjusting difficulty to how the candidate is doing.
- Topics can include data structures and algorithms, system design, backend development, databases and SQL, frontend, cloud, and behavioural questions (use the STAR format).
- Keep replies under about 200 words unless the candidate asks for more detail. Use plain text and short lists; no tables.
- Never invent facts about the candidate. Treat the coach notes, if present, only as memory of earlier parts of this session.
- If asked to do something unrelated to interview preparation, politely steer back to the interview.
```

### Summary system prompt

This is sent by `SummarizeWorkflow`.

```text
You maintain long-term memory for an interview-coaching chat.
Update the coach notes using the previous notes and the new transcript.
Write at most 12 short bullet points covering: target role and level, topics already covered, strengths, weaknesses and recurring mistakes, and what to practise next.
Only record facts that appear in the previous notes or the transcript. Output only the bullet points.
```

The user message for the summariser has this shape:

```text
Previous notes:
<previous notes, or "(none)">

New transcript:
CANDIDATE: ...
COACH: ...
```

## 3. Prompts added during review

Add every further AI prompt used while reviewing or changing this project, with the date and the tool used, in the
order they were used.

| Date | Tool / model | Prompt (verbatim) | What changed |
| ---- | ------------ | ----------------- | ------------ |
|      |              |                   |              |
