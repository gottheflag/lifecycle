import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const tscOverride = process.env.LIFECYCLE_TSC;
const tscScript = path.join(
	root,
	"node_modules",
	"typescript",
	"bin",
	"tsc",
);

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: root,
		encoding: "utf8",
		stdio: "pipe",
		shell: process.platform === "win32" && command.endsWith(".cmd"),
		...options,
	});

	if (result.status !== 0) {
		throw new Error([
			`Command failed: ${command} ${args.join(" ")}`,
			result.stdout,
			result.stderr,
		].filter(Boolean).join("\n"));
	}

	return result.stdout.trim();
}

async function writeFixture(directory, type) {
	const isEsm = type === "module";

	await writeFile(
		path.join(directory, "package.json"),
		`${JSON.stringify({ private: true, ...(isEsm ? { type: "module" } : {}) }, null, 2)}\n`,
	);

	await writeFile(
		path.join(directory, "tsconfig.json"),
		`${JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "Node16",
				moduleResolution: "Node16",
				strict: true,
				skipLibCheck: false,
				lib: ["ES2022"],
			},
			include: ["index.ts"],
		}, null, 2)}\n`,
	);

	await writeFile(
		path.join(directory, "index.ts"),
		`import {\n\tAsyncLifecycle,\n\tLifecycle,\n\ttype LifecycleSignal,\n\ttype NoEvents,\n} from "@gottheflag/lifecycle";\n\nconst signal: LifecycleSignal = {\n\taborted: false,\n\taddEventListener(): void {},\n\tremoveEventListener(): void {},\n};\n\nconst typed = new Lifecycle<NoEvents>({ signal });\ntyped.destroy();\n\nexport function syncUsing(): void {\n\tusing scope = new Lifecycle();\n\tscope.defer(() => {});\n}\n\nexport async function asyncUsing(): Promise<void> {\n\tawait using scope = new AsyncLifecycle();\n\tscope.defer(async () => {\n\t\tawait Promise.resolve();\n\t});\n}\n`,
	);

	await writeFile(
		path.join(directory, isEsm ? "runtime.mjs" : "runtime.cjs"),
		isEsm
			? `import { AsyncLifecycle, Lifecycle } from "@gottheflag/lifecycle";\nconst lifecycle = new Lifecycle();\nlet calls = 0;\nlifecycle.defer(() => { calls++; });\nlifecycle.destroy();\nif (calls !== 1 || typeof AsyncLifecycle !== "function" || typeof lifecycle[Symbol.dispose] !== "function") {\n\tthrow new Error("ESM package smoke test failed.");\n}\n`
			: `const { AsyncLifecycle, Lifecycle } = require("@gottheflag/lifecycle");\nconst lifecycle = new Lifecycle();\nlet calls = 0;\nlifecycle.defer(() => { calls++; });\nlifecycle.destroy();\nif (calls !== 1 || typeof AsyncLifecycle !== "function" || typeof lifecycle[Symbol.dispose] !== "function") {\n\tthrow new Error("CJS package smoke test failed.");\n}\n`,
	);
}

const tempRoot = await mkdtemp(path.join(tmpdir(), "gtf-lifecycle-package-"));

try {
	const esm = path.join(tempRoot, "esm");
	const cjs = path.join(tempRoot, "cjs");

	await Promise.all([
		mkdir(esm, { recursive: true }),
		mkdir(cjs, { recursive: true }),
	]);

	const packOutput = run(npm, [
		"pack",
		"--json",
		"--ignore-scripts",
		"--pack-destination",
		tempRoot,
	]);
	const packed = JSON.parse(packOutput);
	const tarball = path.join(tempRoot, packed[0].filename);

	await Promise.all([
		writeFixture(esm, "module"),
		writeFixture(cjs, "commonjs"),
	]);

	for (const fixture of [esm, cjs]) {
		run(npm, [
			"install",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			tarball,
		], { cwd: fixture });

		const tscArgs = [
			"--noEmit",
			"-p",
			path.join(fixture, "tsconfig.json"),
		];

		if (tscOverride) {
			run(tscOverride, tscArgs);
		} else {
			run(process.execPath, [tscScript, ...tscArgs]);
		}
	}

	run(process.execPath, [path.join(esm, "runtime.mjs")]);
	run(process.execPath, [path.join(cjs, "runtime.cjs")]);

	const installedRoot = path.join(
		esm,
		"node_modules",
		"@gottheflag",
		"lifecycle",
	);

	const [
		sourcePackageText,
		installedPackageText,
		installedDocs,
		esmDeclarations,
		cjsDeclarations,
		cjsPackageText,
	] = await Promise.all([
		readFile(path.join(root, "package.json"), "utf8"),
		readFile(path.join(installedRoot, "package.json"), "utf8"),
		readFile(path.join(installedRoot, "docs", "index.html"), "utf8"),
		readFile(path.join(installedRoot, "dist", "index.d.ts"), "utf8"),
		readFile(path.join(installedRoot, "dist", "cjs", "index.d.ts"), "utf8"),
		readFile(path.join(installedRoot, "dist", "cjs", "package.json"), "utf8"),
	]);

	const sourcePackage = JSON.parse(sourcePackageText);
	const installedPackage = JSON.parse(installedPackageText);
	const cjsPackage = JSON.parse(cjsPackageText);
	const disposableReference = "/// <reference lib=\"esnext.disposable\" preserve=\"true\" />";

	if (installedPackage.version !== sourcePackage.version) {
		throw new Error("Packed package version does not match the source package version.");
	}

	if (!installedDocs.includes("<html")) {
		throw new Error("Published package is missing docs/index.html.");
	}

	if (
		!installedDocs.includes(`API Reference · ${installedPackage.version}`)
		|| !installedDocs.includes(`<span>Version</span><strong>${installedPackage.version}</strong>`)
	) {
		throw new Error("Published documentation version does not match package.json.");
	}

	if (!esmDeclarations.startsWith(disposableReference)) {
		throw new Error("ESM declarations lost the esnext.disposable reference directive.");
	}

	if (!cjsDeclarations.startsWith(disposableReference)) {
		throw new Error("CJS declarations lost the esnext.disposable reference directive.");
	}

	if (cjsPackage.type !== "commonjs") {
		throw new Error("Published dist/cjs/package.json does not mark CJS declarations as CommonJS.");
	}

	console.log("Package smoke test passed for ESM and strict CommonJS consumers.");
} finally {
	await rm(tempRoot, {
		recursive: true,
		force: true,
	});
}
