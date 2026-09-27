# PROMPTS.md

The assignment says: "AI-assisted coding is encouraged, but you have to submit prompt history." This file is that
history. It has four parts:

1. the prompt that produced the first version of this code;
2. the prompts the app itself sends to Llama 3.3 at runtime;
3. prompts added during my own review and changes;
4. the coordinator prompts that deployed and published the app.

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

## 4. Deployment and publishing prompts (coordinator)

After the build, the same AI coding agent (GitHub Copilot app, agent mode, Claude Opus 5.5) deployed the app to
Dhruv's Cloudflare account and published this repository, on 27 September 2026. Dhruv logged in to Cloudflare himself
through `npx wrangler login`. The agent received the instructions below, quoted verbatim in the order it received them.

### R-27SEP-40

> R-27SEP-40 (coordinator, 19:20 IST). PRINCIPAL-DIRECTED. Dhruv explicitly asks us to DEPLOY and PUBLISH E:\cf_ai_interview_coach. This lifts the R-27SEP-19 prohibitions for exactly these steps, in order. Stop at the first failure and report.
>
> 1. In E:\cf_ai_interview_coach, run `npm install`, `npm test` and `npm run typecheck`. All must pass.
>
> 2. Run `npx wrangler login`. It opens Dhruv's browser for Cloudflare OAuth.
>    - Dhruv himself must log in, or create a free account, and click Allow. Never type credentials, create accounts, or automate the browser.
>    - Wait up to 15 minutes. If it's not authorized by then, STOP and report "waiting for Dhruv's Cloudflare login".
>
> 3. Run `npx wrangler deploy`.
>    - Then smoke-test the deployed URL with curl: GET / returns 200, and POST /api/chat with a fresh sessionId returns 200 JSON with a reply.
>    - Keep AI usage minimal: at most 3 test messages.
>    - If the plan limits block Workflows or Durable Objects, STOP and report the exact error. Do not upgrade the plan, add billing, or change the architecture.
>
> 4. Update README.md: replace the "Live demo" placeholder with the deployed URL. Change nothing else.
>
> 5. GitHub, as dhruv-15-03 ONLY. Run the identity gate in the same invocation as every gh/git network call:
>    - Clear GH_TOKEN, GITHUB_TOKEN and GIT_CONFIG_PARAMETERS.
>    - Run `gh auth switch --user dhruv-15-03`.
>    - Verify that `gh api user --jq .login` prints dhruv-15-03; otherwise STOP.
>    - Run `git init -b main`, set user.name "Dhruv Rastogi" and user.email dhruvrastogi2004@gmail.com.
>    - Run `git status`. node_modules, .wrangler, .dev.vars and any secrets must NOT appear.
>    - Make one commit: "AI interview coach on Cloudflare: Workers AI, Durable Objects, Workflows".
>    - Run `gh repo create cf_ai_interview_coach --public --source . --remote origin --push`.
>    - Verify server-side that the repo owner and the commit author are dhruv-15-03. Never v-dhruv.
>
> 6. Do NOT apply to Cloudflare or touch any application form. Dhruv submits the repo URL himself.
>
> REPORT ONCE with:
> - test results;
> - the deployed URL and smoke-test output;
> - the repo URL, commit SHA, and identity-gate evidence;
> - any costs or limits observed.

### Coordinator note (19:19 IST)

> Coordinator note for R-27SEP-40: Dhruv reports at 19:19 IST that his Cloudflare step is DONE. Confirm with `npx wrangler whoami` and continue with steps 3–6. If whoami does not show his account, report that; do not start a new login loop.

### R-27SEP-41

The first `npx wrangler deploy` stopped because the account had no workers.dev subdomain yet, and the agent reported
that. This ruling followed:

> R-27SEP-41 (coordinator, 19:23 IST). Ruling (b). Register the workers.dev subdomain **dhruv-15-03**, matching his GitHub handle. If that name is unavailable, use **dhruvrastogi**. If both are taken, STOP and report.
>
> Register it by answering wrangler's own prompt, or through the equivalent official Cloudflare account API call using the existing OAuth session. No other account or plan changes.
>
> Then resume R-27SEP-40 steps 3 to 6 exactly as written:
> - deploy;
> - run the smoke test (at most 3 AI messages);
> - set the README Live demo URL;
> - publish the GitHub repo as dhruv-15-03, with the identity gate in the same invocation as each push;
> - apply to nothing.
>
> Report ONCE.

The agent registered `dhruv-15-03` through the Cloudflare API (`PUT /accounts/{account_id}/workers/subdomain`),
deployed, sent one test chat message, set the README "Live demo" line and published the repository.

### R-27SEP-42

This section itself was added under the following instruction:

> R-27SEP-42 (coordinator). R-27SEP-40/41 accepted. I verified the repo owner and commit author (dhruv-15-03), and the site returns 200 via DoH. One honesty follow-up, because the assignment requires the prompt history:
>
> - In PROMPTS.md, ADD a new section after section 3, titled "4. Deployment and publishing prompts (coordinator)".
> - Paste R-27SEP-40, R-27SEP-41 and the 19:19 coordinator note verbatim.
> - Leave section 3 empty; it is for Dhruv's own prompts.
> - Run npm test.
> - Make ONE commit, "Add deployment prompt history to PROMPTS.md", and push to origin/main.
> - Run the full identity gate in the same invocation as the push, then verify author and committer are dhruv-15-03 server-side.
> - No force-push and no other file changes.
>
> Report the new commit SHA in one line, then go IDLE.
