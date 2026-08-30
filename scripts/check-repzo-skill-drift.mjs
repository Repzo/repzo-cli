#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = join(root, "skills", "repzo-workstation");
const requiredReferences = [
	"api.md",
	"chat-messages.md",
	"communications.md",
	"crm-records.md",
	"marketing-content.md",
	"reporting-data.md",
	"sales-commerce.md",
	"service-operations.md",
];

async function markdownFiles() {
	const references = await readdir(join(skillRoot, "references"));
	return [
		join(skillRoot, "SKILL.md"),
		...references
			.filter((name) => name.endsWith(".md"))
			.sort()
			.map((name) => join(skillRoot, "references", name)),
	];
}

function addProblem(problems, file, message) {
	problems.push(`${relative(root, file)}: ${message}`);
}

const files = await markdownFiles();
const documents = await Promise.all(
	files.map(async (file) => ({ file, text: await readFile(file, "utf8") })),
);
const { stdout } = await execFileAsync(process.execPath, [
	join(root, "bin", "repzo.mjs"),
	"commands",
	"--json",
]);
const catalog = JSON.parse(stdout).data;
const leafCommands = new Set(catalog.commands.map((entry) => entry.command));
const globalFlags = new Set(catalog.globalFlags.map((entry) => entry.name));
const utilityCommands = [
	"auth login",
	"auth status",
	"auth logout",
	"profiles list",
	"profiles show",
	"profiles use",
	"profiles delete",
	"commands",
	"openapi",
	"request",
	"setup codex",
	"setup claude",
	"setup agents",
	"doctor",
	"completion bash",
	"completion zsh",
	"completion fish",
	"upgrade",
];
const utilityFlags = new Set([
	"--base-url",
	"--token-stdin",
	"--force",
	"--help",
	"--version",
]);

const problems = [];
const checkedCommands = new Set();
const checkedFlags = new Set();

for (const name of requiredReferences) {
	if (
		!documents.some(({ file }) => file === join(skillRoot, "references", name))
	)
		problems.push(`missing required reference: references/${name}`);
}

for (const { file, text } of documents) {
	if (/\bmcp\b/i.test(text))
		addProblem(problems, file, "MCP reference remains in the CLI-only skill");

	for (const match of text.matchAll(
		/\brepzo[ \t]+([a-z][a-z0-9-]*(?:[ \t]+[a-z][a-z0-9-]*)*)/g,
	)) {
		const candidate = match[1].trim();
		checkedCommands.add(candidate);
		const matchesLeaf =
			leafCommands.has(candidate) ||
			[...leafCommands].some(
				(command) =>
					command.startsWith(`${candidate} `) ||
					candidate.startsWith(`${command} `),
			);
		const matchesUtility = utilityCommands.some(
			(command) =>
				command === candidate ||
				command.startsWith(`${candidate} `) ||
				candidate.startsWith(`${command} `),
		);
		if (!matchesLeaf && !matchesUtility)
			addProblem(
				problems,
				file,
				`unknown CLI command reference: repzo ${candidate}`,
			);
	}

	for (const match of text.matchAll(/--[a-z][a-z0-9-]*/g)) {
		const flag = match[0];
		checkedFlags.add(flag);
		if (!globalFlags.has(flag) && !utilityFlags.has(flag))
			addProblem(problems, file, `unknown CLI flag reference: ${flag}`);
	}

	for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g)) {
		const target = resolve(dirname(file), match[1]);
		if (!documents.some((document) => document.file === target))
			addProblem(problems, file, `broken Markdown reference: ${match[1]}`);
	}
}

const combinedText = documents.map(({ text }) => text).join("\n");
const roots = [
	...new Set(catalog.commands.map((entry) => entry.command.split(" ")[0])),
];
for (const commandRoot of roots) {
	const pattern = new RegExp(
		`(?:repzo\\s+|\\x60)${commandRoot.replace("-", "\\-")}\\b`,
	);
	if (!pattern.test(combinedText))
		problems.push(`CLI command family is undocumented: ${commandRoot}`);
}

if (problems.length) {
	console.error("Repzo skill drift check failed:");
	for (const problem of problems) console.error(`- ${problem}`);
	process.exit(1);
}

console.log(
	`Repzo skill drift check passed (${checkedCommands.size} command references, ${checkedFlags.size} flags, ${roots.length} CLI families).`,
);
