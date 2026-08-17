import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm", "cjs"],
	sourcemap: true,
	minify: true,
	clean: true,
	treeshake: true,
	dts: false,
});
