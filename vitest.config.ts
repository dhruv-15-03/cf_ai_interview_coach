import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// Unit tests run in Node, so swap in lightweight base classes for the Workers runtime module.
			"cloudflare:workers": fileURLToPath(new URL("./test/stubs/cloudflare-workers.ts", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		restoreMocks: true,
	},
});
