import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"dist",
			"playground/dist",
			"docs",
			"scripts",
		],
	},
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.eslint.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					prefer: "type-imports",
				},
			],
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/no-misused-promises": "error",
		},
	},
	{
		files: ["tests/types.ts"],
		rules: {
			// This file intentionally exercises rejected async API usages with
			// @ts-expect-error; promise lint rules would duplicate those failures.
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-misused-promises": "off",
		},
	},
	{
		files: ["tests/type-limitations.ts"],
		rules: {
			// This fixture deliberately documents the `any` escape hatch that
			// TypeScript conditional types cannot make sound.
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-floating-promises": "off",
			"@typescript-eslint/no-misused-promises": "off",
		},
	},
);
