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
		expect(result.stdout).toContain("Embedded Repzo skills match");
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
		expect(chatMessages).toContain(`"blocks"`);
		expect(chatMessages).toContain(`"actions"`);
		expect(chatMessages).toContain(`"button"`);
		expect(chatMessages).toContain(`"parentMessageId"`);
		expect(chatMessages).toContain(`"clientMessageId"`);
		expect(chatMessages).toContain(`"style": "primary"`);
		expect(chatMessages).toContain("Raw HTML is rejected");
		expect(chatMessages).toContain("do not send internal `blocksJson`");
	});

	it("documents full Block Kit, interactivity, ephemeral messages, and views", async () => {
		const chatMessages = await readFile(
			"skills/repzo-workstation/references/chat-messages.md",
			"utf8",
		);
		for (const outdated of [
			"Do not send interactive action IDs",
			"buttons are links, not callbacks",
			"renders these Block Kit-compatible types",
		])
			expect(chatMessages).not.toContain(outdated);
		expect(chatMessages).toContain("Blocks are never rejected");
		expect(chatMessages).toContain("`warnings`");
		expect(chatMessages).toContain("`block_actions`");
		expect(chatMessages).toContain("interactivity URL");
		expect(chatMessages).toContain("--dry-run");
		for (const command of [
			"repzo chat messages delete MESSAGE_ID",
			"repzo chat ephemeral send CHANNEL_ID",
			"repzo chat views open",
			"repzo chat views push",
			"repzo chat views update",
			"repzo chat views publish",
		])
			expect(chatMessages).toContain(command);
		expect(chatMessages).toContain("hash_conflict");
		expect(chatMessages).toContain("60 seconds");
		for (const url of [
			"https://workstation.repzo.com/docs/developers/chat-apps",
			"https://workstation.repzo.com/docs/developers/block-kit",
			"https://workstation.repzo.com/docs/llms.txt",
		])
			expect(chatMessages).toContain(url);
	});
});
