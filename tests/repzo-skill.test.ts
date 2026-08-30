import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

async function runScript(path: string, args: string[] = []) {
	return execFileAsync(process.execPath, [path, ...args], {
		cwd: process.cwd(),
	});
}

describe("Repzo Workstation skill package", () => {
	it("keeps the embedded skill identical to its public source", async () => {
		const result = await runScript("scripts/generate-embedded-skill.mjs", [
			"--check",
		]);
		expect(result.stdout).toContain("Embedded Repzo skill matches");
	});

	it("documents only live CLI commands and flags", async () => {
		const result = await runScript("scripts/check-repzo-skill-drift.mjs");
		expect(result.stdout).toContain("skill drift check passed");
	});

	it("ships valid deterministic behavior-eval cases", async () => {
		const result = await runScript("skill-evals/run.mjs", ["--validate"]);
		expect(result.stdout).toMatch(/Validated \d+ Repzo skill eval cases/);
	});

	it("documents the live chat message body schema", async () => {
		const paths = [
			"skills/repzo-workstation/references/chat-messages.md",
			"bin/repzo.mjs",
		];
		const documents = await Promise.all(
			paths.map((path) => readFile(path, "utf8")),
		);

		for (const document of documents) {
			expect(document).toContain(
				`repzo chat send CHANNEL_ID --data '{"body":"Hello","bodyFormat":"plain"}' --dry-run`,
			);
			expect(document).not.toContain(
				`repzo chat send CHANNEL_ID --data '{"content":"Hello"}' --dry-run`,
			);
		}

		const chatMessages = documents[0];
		expect(chatMessages).toMatch(/"bodyFormat"\s*:\s*"md"/);
		expect(chatMessages).toContain(`"blocksJson"`);
		expect(chatMessages).toContain(`"poll"`);
		expect(chatMessages).toContain(`"snippets"`);
		expect(chatMessages).toContain(`"parentMessageId"`);
		expect(chatMessages).toContain(`"clientMessageId"`);
		expect(chatMessages).toContain("bot-button bot-button-primary");
		expect(chatMessages).toContain(
			"Do not pass a top-level Slack `blocks` array",
		);
	});
});
