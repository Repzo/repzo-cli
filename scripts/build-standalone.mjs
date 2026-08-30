#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const options = Object.fromEntries(
	process.argv.slice(2).map((entry) => {
		const [name, ...value] = entry.replace(/^--/, "").split("=");
		return [name, value.join("=") || true];
	}),
);
const packageJson = JSON.parse(
	await readFile(join(packageRoot, "package.json"), "utf8"),
);
const version = String(options.version || packageJson.version);
const target = String(options.target || "bun-darwin-arm64");
const platform = target.replace(/^bun-/, "").replaceAll("-", "_");
const extension = platform.startsWith("windows_") ? ".exe" : "";
const outDir = resolve(String(options.outdir || join(packageRoot, "dist")));
const outfile = join(outDir, `repzo_${version}_${platform}${extension}`);

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
	throw new Error(`Invalid CLI version: ${version}`);
}

await mkdir(outDir, { recursive: true });

await new Promise((resolveBuild, rejectBuild) => {
	const child = spawn(
		"bun",
		[
			"build",
			join(packageRoot, "bin", "repzo.mjs"),
			"--compile",
			`--target=${target}`,
			`--outfile=${outfile}`,
			`--define=REPZO_CLI_VERSION=${JSON.stringify(version)}`,
			"--define=REPZO_STANDALONE=true",
		],
		{ stdio: "inherit" },
	);
	child.on("error", rejectBuild);
	child.on("exit", (code) =>
		code === 0
			? resolveBuild()
			: rejectBuild(new Error(`bun build exited with ${code}`)),
	);
});

console.log(outfile);
