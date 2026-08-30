#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const casesDirectory = join(root, "skill-evals", "cases");
const skillDirectory = join(root, "skills", "repzo-workstation");
const maxTurns = 12;

function parseArgs(argv) {
	const options = {
		validate: false,
		verbose: false,
		json: false,
		samples: 1,
		model: process.env.SKILL_EVAL_MODEL || "openai/gpt-5-mini",
		caseNames: [],
		tags: [],
	};
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (value === "--validate") options.validate = true;
		else if (value === "--verbose") options.verbose = true;
		else if (value === "--json") options.json = true;
		else if (value === "--samples") options.samples = Number(argv[++index]);
		else if (value === "--model") options.model = argv[++index];
		else if (value === "--case") options.caseNames.push(argv[++index]);
		else if (value === "--tag") options.tags.push(argv[++index]);
		else throw new Error(`Unknown option: ${value}`);
	}
	if (!Number.isInteger(options.samples) || options.samples < 1)
		throw new Error("--samples must be a positive integer");
	return options;
}

async function loadCases() {
	const names = (await readdir(casesDirectory))
		.filter((name) => name.endsWith(".json"))
		.sort();
	const cases = [];
	for (const name of names) {
		const parsed = JSON.parse(
			await readFile(join(casesDirectory, name), "utf8"),
		);
		const entries = Array.isArray(parsed) ? parsed : [parsed];
		for (const entry of entries) cases.push({ ...entry, file: name });
	}
	return cases;
}

function validateCases(cases) {
	const problems = [];
	const names = new Set();
	if (cases.length < 25)
		problems.push(`expected at least 25 cases, found ${cases.length}`);
	for (const testCase of cases) {
		const label = testCase.name || `${testCase.file}: unnamed case`;
		if (!testCase.name || typeof testCase.name !== "string")
			problems.push(`${label}: name is required`);
		else if (names.has(testCase.name))
			problems.push(`${label}: duplicate name`);
		else names.add(testCase.name);
		if (!testCase.task || typeof testCase.task !== "string")
			problems.push(`${label}: task is required`);
		if (!Array.isArray(testCase.tags) || testCase.tags.length === 0)
			problems.push(`${label}: at least one tag is required`);
		if (
			!testCase.accept?.length &&
			!testCase.reject?.length &&
			!testCase.expectSequence?.length
		)
			problems.push(
				`${label}: add an acceptance, rejection, or sequence assertion`,
			);
		for (const pattern of [
			...(testCase.accept || []),
			...(testCase.reject || []),
			...(testCase.expectSequence || []),
		]) {
			try {
				new RegExp(pattern);
			} catch (error) {
				problems.push(`${label}: invalid regex ${pattern}: ${error.message}`);
			}
		}
		for (const mock of testCase.mocks || []) {
			if (!mock.match || typeof mock.output !== "string")
				problems.push(`${label}: every mock requires match and string output`);
			else {
				try {
					new RegExp(mock.match);
				} catch (error) {
					problems.push(
						`${label}: invalid mock regex ${mock.match}: ${error.message}`,
					);
				}
				try {
					JSON.parse(mock.output);
				} catch {
					problems.push(`${label}: mock output must be JSON`);
				}
			}
		}
	}
	return problems;
}

async function loadSkill() {
	const chunks = [
		`# SKILL.md\n${await readFile(join(skillDirectory, "SKILL.md"), "utf8")}`,
	];
	for (const name of (
		await readdir(join(skillDirectory, "references"))
	).sort()) {
		if (name.endsWith(".md"))
			chunks.push(
				`# references/${name}\n${await readFile(join(skillDirectory, "references", name), "utf8")}`,
			);
	}
	return chunks.join("\n\n");
}

const repzoTool = {
	type: "function",
	function: {
		name: "repzo",
		description:
			"Call a mocked Repzo CLI. Use `cli ARGUMENTS` for one repzo CLI invocation. This test tool never contacts a real workspace.",
		parameters: {
			type: "object",
			properties: {
				args: {
					type: "string",
					description:
						"Example: `cli contacts list --limit 20`.",
				},
			},
			required: ["args"],
			additionalProperties: false,
		},
	},
};

function mockOutput(testCase, trace) {
	for (const mock of testCase.mocks || []) {
		if (new RegExp(mock.match).test(trace)) return mock.output;
	}
	return '{"ok":true,"data":{},"summary":"Mocked success"}';
}

async function callModel(options, messages) {
	const apiKey = process.env.SKILL_EVAL_API_KEY;
	if (!apiKey)
		throw new Error(
			"SKILL_EVAL_API_KEY is required to run model evals; use --validate for offline validation",
		);
	const baseUrl = (
		process.env.SKILL_EVAL_BASE_URL || "https://openrouter.ai/api/v1"
	).replace(/\/$/, "");
	const response = await fetch(`${baseUrl}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: options.model,
			messages,
			tools: [repzoTool],
			tool_choice: "auto",
			max_tokens: 2500,
		}),
	});
	if (!response.ok)
		throw new Error(`Eval API ${response.status}: ${await response.text()}`);
	const payload = await response.json();
	const message = payload.choices?.[0]?.message;
	if (!message) throw new Error("Eval API returned no assistant message");
	return message;
}

async function runCase(testCase, options, skill) {
	const system = `${skill}\n\nComplete the user's task using the mocked repzo CLI tool. Calls never touch a real workspace. Follow the skill's authorization and verification rules. When the task is complete, respond without another tool call.`;
	const context = testCase.context ? `\n\nContext: ${testCase.context}` : "";
	const messages = [
		{ role: "system", content: system },
		{ role: "user", content: `${testCase.task}${context}` },
	];
	const trace = [];
	for (let turn = 0; turn < maxTurns; turn += 1) {
		const message = await callModel(options, messages);
		messages.push(message);
		const calls = message.tool_calls || [];
		if (calls.length === 0) return { trace, exhausted: false };
		for (const call of calls) {
			let args = "";
			try {
				args = JSON.parse(call.function.arguments).args || "";
			} catch {
				args = call.function.arguments || "";
			}
			trace.push(args);
			if (options.verbose) console.error(`  repzo ${args}`);
			messages.push({
				role: "tool",
				tool_call_id: call.id,
				content: mockOutput(testCase, args),
			});
		}
	}
	return { trace, exhausted: true };
}

function grade(testCase, result) {
	const failures = [];
	for (const pattern of testCase.accept || []) {
		if (!result.trace.some((entry) => new RegExp(pattern).test(entry)))
			failures.push(`accept /${pattern}/ not matched`);
	}
	for (const pattern of testCase.reject || []) {
		const hit = result.trace.find((entry) => new RegExp(pattern).test(entry));
		if (hit)
			failures.push(`reject /${pattern}/ matched ${JSON.stringify(hit)}`);
	}
	let position = -1;
	for (const pattern of testCase.expectSequence || []) {
		const next = result.trace.findIndex(
			(entry, index) => index > position && new RegExp(pattern).test(entry),
		);
		if (next === -1)
			failures.push(`sequence /${pattern}/ missing after ${position}`);
		else position = next;
	}
	if (testCase.maxCommands && result.trace.length > testCase.maxCommands)
		failures.push(
			`maxCommands ${result.trace.length} > ${testCase.maxCommands}`,
		);
	if (result.exhausted) failures.push(`exhausted ${maxTurns} tool rounds`);
	return failures;
}

const options = parseArgs(process.argv.slice(2));
let cases = await loadCases();
const validationProblems = validateCases(cases);
if (validationProblems.length) {
	for (const problem of validationProblems) console.error(`- ${problem}`);
	process.exit(1);
}
if (options.validate) {
	console.log(`Validated ${cases.length} Repzo skill eval cases.`);
	process.exit(0);
}
if (options.caseNames.length)
	cases = cases.filter((testCase) => options.caseNames.includes(testCase.name));
if (options.tags.length)
	cases = cases.filter((testCase) =>
		testCase.tags.some((tag) => options.tags.includes(tag)),
	);
if (!cases.length) throw new Error("No eval cases matched the selection");

const skill = await loadSkill();
const results = [];
for (const testCase of cases) {
	const samples = [];
	for (let index = 0; index < options.samples; index += 1) {
		const result = await runCase(testCase, options, skill);
		const failures = grade(testCase, result);
		samples.push({ ...result, failures, passed: failures.length === 0 });
	}
	const passed =
		samples.filter((sample) => sample.passed).length > options.samples / 2;
	results.push({ name: testCase.name, passed, samples });
	if (!options.json) {
		console.log(`${passed ? "PASS" : "FAIL"} ${testCase.name}`);
		if (!passed) {
			const failed = samples.find((sample) => !sample.passed);
			for (const failure of failed.failures) console.log(`  ${failure}`);
			if (options.verbose)
				console.log(`  trace: ${JSON.stringify(failed.trace)}`);
		}
	}
}

const passedCount = results.filter((result) => result.passed).length;
if (options.json)
	console.log(JSON.stringify({ model: options.model, results }, null, 2));
else
	console.log(
		`${passedCount}/${results.length} cases passed with ${options.model}.`,
	);
if (passedCount !== results.length) process.exit(1);
