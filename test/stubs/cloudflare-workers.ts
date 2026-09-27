// Runtime stand-ins for the `cloudflare:workers` base classes so the Durable Object and the
// Workflow can be unit-tested in Node. Vitest aliases the module here (see vitest.config.ts);
// type-checking still uses the real declarations from worker-configuration.d.ts.

export class DurableObject<E = unknown> {
	protected readonly ctx: unknown;
	protected readonly env: E;

	constructor(ctx: unknown, env: E) {
		this.ctx = ctx;
		this.env = env;
	}
}

export class WorkflowEntrypoint<E = unknown, _Params = unknown> {
	protected readonly ctx: unknown;
	protected readonly env: E;

	constructor(ctx: unknown, env: E) {
		this.ctx = ctx;
		this.env = env;
	}
}
