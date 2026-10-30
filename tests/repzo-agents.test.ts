import { spawn } from "node:child_process";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function runCli(args: string[], env: Record<string, string> = {}) {
	return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
		const child = spawn(process.execPath, ["bin/repzo.mjs", ...args], {
			cwd: process.cwd(),
			env: {
				...process.env,
				REPZO_DISABLE_SKILL_REFRESH: "1",
				REPZO_CREDENTIAL_BACKEND: "file",
				...env,
			},
			stdio: "pipe",
		});
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
		child.stdin.end();
	});
}

type Case = {
	args: string[];
	method: string;
	path: string;
	mutation: boolean;
	body?: Record<string, unknown>;
};

// Every AI-agent command added for the v2 public agents API.
const CASES: Case[] = [
	{ args: ["agents", "templates"], method: "GET", path: "/agents/templates", mutation: false },
	{ args: ["agents", "create"], method: "POST", path: "/agents", mutation: true, body: { name: "Clinic bookings", templateKey: "appointment" } },
	{ args: ["agents", "delete", "agent-1"], method: "DELETE", path: "/agents/agent-1", mutation: true },
	{ args: ["agents", "unpublish", "agent-1"], method: "DELETE", path: "/agents/agent-1/publish", mutation: true },
	{ args: ["agents", "functions", "list", "agent-1"], method: "GET", path: "/agents/agent-1/functions", mutation: false },
	{ args: ["agents", "functions", "get", "agent-1", "create_order"], method: "GET", path: "/agents/agent-1/functions/create_order", mutation: false },
	{
		args: ["agents", "functions", "update", "agent-1", "send_whatsapp_flow"],
		method: "PATCH",
		path: "/agents/agent-1/functions/send_whatsapp_flow",
		mutation: true,
		body: {
			enabled: true,
			config: {
				instructions: "Send the booking Flow when the customer wants an appointment.",
				bindings: { serviceId: { source: "agent", instructions: "Match the service" }, phone: { source: "variable", variable: "contact.phone" } },
				whatsappFlows: [{ flowId: "flow-1" }],
			},
		},
	},
	{ args: ["agents", "tools", "agent-1"], method: "GET", path: "/agents/agent-1/tools", mutation: false },
	{ args: ["agents", "whatsapp-flows", "agent-1"], method: "GET", path: "/agents/agent-1/whatsapp-flows", mutation: false },
	{ args: ["agents", "playbook", "validate", "agent-1"], method: "POST", path: "/agents/agent-1/playbook/validate", mutation: false, body: { playbook: "# Role\nBe kind." } },
	{ args: ["agents", "versions", "list", "agent-1"], method: "GET", path: "/agents/agent-1/versions", mutation: false },
	{ args: ["agents", "versions", "get", "agent-1", "version-3"], method: "GET", path: "/agents/agent-1/versions/version-3", mutation: false },
	{ args: ["agents", "versions", "restore", "agent-1", "version-3"], method: "POST", path: "/agents/agent-1/versions/version-3/restore", mutation: true },
	{ args: ["agents", "runs", "list", "agent-1"], method: "GET", path: "/agents/agent-1/runs", mutation: false },
	{ args: ["agents", "runs", "get", "agent-1", "run-9"], method: "GET", path: "/agents/agent-1/runs/run-9", mutation: false },
	{ args: ["agents", "unresolved", "list", "agent-1"], method: "GET", path: "/agents/agent-1/unresolved-questions", mutation: false },
	{ args: ["agents", "unresolved", "update", "agent-1", "group-2"], method: "PATCH", path: "/agents/agent-1/unresolved-questions/group-2", mutation: true, body: { status: "resolved" } },
	{ args: ["agents", "feedback", "agent-1"], method: "GET", path: "/agents/agent-1/answer-feedback", mutation: false },
	{ args: ["agents", "deployments", "list", "agent-1"], method: "GET", path: "/agents/agent-1/deployments", mutation: false },
	{ args: ["agents", "deployments", "targets", "agent-1"], method: "GET", path: "/agents/agent-1/deployment-targets", mutation: false },
	{ args: ["agents", "deployments", "create", "agent-1"], method: "POST", path: "/agents/agent-1/deployments", mutation: true, body: { targetType: "ticket", targetId: null, mode: "suggest_reply" } },
	{ args: ["agents", "deployments", "update", "agent-1", "dep-1"], method: "PATCH", path: "/agents/agent-1/deployments/dep-1", mutation: true, body: { enabled: false } },
	{ args: ["agents", "deployments", "delete", "agent-1", "dep-1"], method: "DELETE", path: "/agents/agent-1/deployments/dep-1", mutation: true },
	{ args: ["agents", "guidance", "list", "agent-1"], method: "GET", path: "/agents/agent-1/guidance", mutation: false },
	{ args: ["agents", "guidance", "create", "agent-1"], method: "POST", path: "/agents/agent-1/guidance", mutation: true, body: { category: "escalation", title: "Refunds", instruction: "Hand off refund disputes." } },
	{ args: ["agents", "guidance", "update", "agent-1", "guide-1"], method: "PATCH", path: "/agents/agent-1/guidance/guide-1", mutation: true, body: { enabled: false } },
	{ args: ["agents", "guidance", "delete", "agent-1", "guide-1"], method: "DELETE", path: "/agents/agent-1/guidance/guide-1", mutation: true },
	{ args: ["agents", "procedures", "list", "agent-1"], method: "GET", path: "/agents/agent-1/procedures", mutation: false },
	{ args: ["agents", "procedures", "get", "agent-1", "proc-1"], method: "GET", path: "/agents/agent-1/procedures/proc-1", mutation: false },
	{
		args: ["agents", "procedures", "create", "agent-1"],
		method: "POST",
		path: "/agents/agent-1/procedures",
		mutation: true,
		body: { name: "Order", steps: [{ type: "collect_fields", fields: ["name"] }, { type: "tool", name: "create_order" }] },
	},
	{ args: ["agents", "procedures", "update", "agent-1", "proc-1"], method: "PATCH", path: "/agents/agent-1/procedures/proc-1", mutation: true, body: { status: "inactive" } },
	{ args: ["agents", "procedures", "delete", "agent-1", "proc-1"], method: "DELETE", path: "/agents/agent-1/procedures/proc-1", mutation: true },
];

function catalogPath(path: string) {
	return path
		.replace(/^\/agents\/agent-1/, "/agents/{id}")
		.replace(/\/functions\/[^/]+$/, "/functions/{name}")
		.replace(/\/versions\/version-3/, "/versions/{versionId}")
		.replace(/\/runs\/run-9$/, "/runs/{runId}")
		.replace(/\/unresolved-questions\/group-2$/, "/unresolved-questions/{groupId}")
		.replace(/\/deployments\/dep-1$/, "/deployments/{deploymentId}")
		.replace(/\/guidance\/guide-1$/, "/guidance/{guidanceId}")
		.replace(/\/procedures\/proc-1$/, "/procedures/{procedureId}");
}

function withoutIds(args: string[]) {
	return args.filter((arg) => !/-\d$|^create_order$|^send_whatsapp_flow$/.test(arg)).join(" ");
}

describe("AI-agent commands", () => {
	it("lists every agent command with its method, path, and mutation flag", async () => {
		const result = await runCli(["commands", "--json"]);
		expect(result.code).toBe(0);
		const commands = JSON.parse(result.stdout).data.commands;
		for (const testCase of CASES) {
			expect(commands).toContainEqual(expect.objectContaining({
				command: withoutIds(testCase.args),
				method: testCase.method,
				path: catalogPath(testCase.path),
				mutation: testCase.mutation,
				requiresBody: testCase.body !== undefined,
			}));
		}
		// The legacy leaf form stays callable but is hidden from the catalog.
		expect(commands.filter((entry: any) => entry.command === "agents deployments")).toHaveLength(0);
	});

	it("puts the non-obvious rules on the commands in agent help", async () => {
		const result = await runCli(["agents", "--agent", "--help"]);
		expect(result.code).toBe(0);
		const commands = JSON.parse(result.stdout).commands as Array<{ command: string; gotchas: string[] }>;
		const gotchas = (name: string) => commands.find((entry) => entry.command === name)?.gotchas.join("\n") ?? "";
		expect(gotchas("agents functions update")).toMatch(/409/);
		expect(gotchas("agents functions update")).toContain("whatsappFlows");
		expect(gotchas("agents functions update")).toContain("agents whatsapp-flows");
		expect(gotchas("agents functions update")).toContain("allowBackward");
		expect(gotchas("agents tools")).toContain("allowed: true");
		expect(gotchas("agents tools")).toMatch(/Helper tools .* cannot be enabled on their own/);
		expect(gotchas("agents playbook validate")).toContain("Saving also allows the agent to use X");
		expect(gotchas("agents procedures update")).toMatch(/source: playbook return 409/);
		expect(gotchas("agents versions restore")).toMatch(/ai_agents\.update and ai_agents\.manage_knowledge/);
		expect(gotchas("agents versions restore")).toMatch(/Only changes the draft/);
		expect(gotchas("agents unpublish")).toMatch(/current, possibly untested draft immediately/);
		expect(gotchas("agents unresolved list")).toContain("--query status=");
		expect(gotchas("agents feedback")).toContain("--query days=");
		expect(gotchas("agents update")).toContain("--if-match");
		expect(gotchas("agents deployments create")).toContain("Preview with --dry-run; sending requires --yes.");
		expect(gotchas("agents playbook validate")).not.toContain("Preview with --dry-run; sending requires --yes.");
	});

	describe("against a mock API", () => {
		let server: Server;
		let baseUrl = "";
		const calls: Array<{ method: string; path: string; body: unknown; query: Record<string, unknown> }> = [];
		beforeAll(async () => {
			const app = express();
			app.use(express.json());
			app.use((req, res) => {
				calls.push({
					method: req.method,
					path: req.path,
					body: req.body && Object.keys(req.body).length ? req.body : undefined,
					query: { ...req.query },
				});
				if (req.method === "DELETE") {
					res.status(204).end();
					return;
				}
				if (req.method === "GET" && /\/(deployments|runs|tools|functions)$/.test(req.path)) {
					res.json({
						data: [{ id: "item-1", name: "Item" }],
						meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
					});
					return;
				}
				res.status(req.method === "POST" ? 201 : 200).json({ id: "item-1", method: req.method, path: req.path });
			});
			await new Promise<void>((resolve) => {
				server = app.listen(0, "127.0.0.1", () => {
					const address = server.address();
					if (!address || typeof address === "string") throw new Error("Expected address");
					baseUrl = `http://127.0.0.1:${address.port}`;
					resolve();
				});
			});
		});
		afterAll(async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		});

		const env = () => ({ REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxu-test" });

		it.each(CASES.map((testCase) => [testCase.args.join(" "), testCase] as const))(
			"%s sends the right request",
			async (_label, testCase) => {
				const data = testCase.body ? ["--data", JSON.stringify(testCase.body)] : [];
				if (testCase.mutation) {
					const before = calls.length;
					const refused = await runCli([...testCase.args, ...data], env());
					expect(refused.code).toBe(1);
					expect(JSON.parse(refused.stderr).error.message).toContain("without --yes");
					const preview = await runCli([...testCase.args, ...data, "--dry-run"], env());
					expect(preview.code).toBe(0);
					expect(JSON.parse(preview.stdout).data).toMatchObject({
						dryRun: true,
						method: testCase.method,
						url: `${baseUrl}/api/v1${testCase.path}`,
					});
					expect(calls).toHaveLength(before);
				}
				const result = await runCli([...testCase.args, ...data, ...(testCase.mutation ? ["--yes"] : [])], env());
				expect(result.code).toBe(0);
				expect(calls.at(-1)).toMatchObject({ method: testCase.method, path: `/api/v1${testCase.path}`, body: testCase.body });
			},
		);

		it("keeps the old agents deployments ID form working", async () => {
			const result = await runCli(["agents", "deployments", "agent-7", "--json"], env());
			expect(result.code).toBe(0);
			expect(calls.at(-1)).toMatchObject({ method: "GET", path: "/api/v1/agents/agent-7/deployments" });
			const output = JSON.parse(result.stdout);
			expect(output.summary).toBe("1 result");
			expect(JSON.stringify(output.breadcrumbs)).not.toContain("repzo agents get item-1");

			const usage = await runCli(["agents", "deployments"], env());
			expect(usage.code).not.toBe(0);
			expect(JSON.parse(usage.stderr).error.message).toContain("repzo agents deployments list <id>");
		});

		it("passes status, days, and limit filters through", async () => {
			expect((await runCli(["agents", "unresolved", "list", "agent-1", "--query", "status=new"], env())).code).toBe(0);
			expect(calls.at(-1)?.query).toMatchObject({ status: "new" });
			expect((await runCli(["agents", "feedback", "agent-1", "--query", "days=90", "--limit", "5"], env())).code).toBe(0);
			expect(calls.at(-1)).toMatchObject({ path: "/api/v1/agents/agent-1/answer-feedback", query: { days: "90", limit: "5" } });
		});

		it("links listed runs to their detail command", async () => {
			const result = await runCli(["agents", "runs", "list", "agent-1", "--json"], env());
			expect(result.code).toBe(0);
			expect(JSON.parse(result.stdout).breadcrumbs).toContainEqual(
				expect.objectContaining({ cmd: "repzo agents runs get agent-1 item-1" }),
			);
		});
	});
});
