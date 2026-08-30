import { spawn } from "node:child_process";
import {
	access,
	lstat,
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	writeFile,
} from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

async function runCli(
	args: string[],
	options: { env?: Record<string, string>; input?: string } = {},
) {
	return new Promise<{ code: number; stdout: string; stderr: string }>(
		(resolve, reject) => {
			const child = spawn(
				process.execPath,
				["bin/repzo.mjs", ...args],
				{
					cwd: process.cwd(),
					env: {
						...process.env,
						REPZO_DISABLE_SKILL_REFRESH: "1",
						...options.env,
					},
					stdio: "pipe",
				},
			);
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
			if (options.input !== undefined) child.stdin.end(options.input);
			else child.stdin.end();
		},
	);
}

describe("Repzo CLI v2", () => {
	it("ships a private standalone-only build manifest", async () => {
		const packageJson = JSON.parse(await readFile("package.json", "utf8"));
		expect(packageJson).toMatchObject({
			name: "repzo-cli",
			private: true,
		});
		expect(packageJson).not.toHaveProperty("bin");
		expect(packageJson).not.toHaveProperty("publishConfig");
		expect(packageJson.dependencies).toBeUndefined();
		expect(packageJson.files).not.toEqual(
			expect.arrayContaining([expect.stringMatching(/mcp/i)]),
		);
		expect(packageJson.scripts).not.toHaveProperty("mcp");
		expect(packageJson.scripts).not.toHaveProperty("build:mcp");
		await expect(access("bin/repzo-mcp.mjs")).rejects.toMatchObject({
			code: "ENOENT",
		});
	});

	it("publishes domain commands and focused agent help from one catalog", async () => {
		const catalog = await runCli(["commands", "--json"]);
		expect(catalog.code).toBe(0);
		const catalogOutput = JSON.parse(catalog.stdout);
		expect(catalogOutput).toMatchObject({
			ok: true,
			summary: expect.stringContaining("commands"),
			meta: { command: "repzo commands" },
		});
		const commands = catalogOutput.data.commands;
		expect(commands.length).toBeGreaterThan(175);
		expect(
			commands.some((entry: any) => entry.command.startsWith("leads ")),
		).toBe(false);
		expect(commands).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ command: "contacts list", method: "GET" }),
				expect.objectContaining({
					command: "chat send",
					path: "/chat/channels/{channelId}/messages",
				}),
				expect.objectContaining({
					command: "exports create",
					path: "/data/exports",
				}),
			]),
		);
		expect(
			commands.some((entry: any) => entry.command === "imports create"),
		).toBe(false);

		const focused = await runCli([
			"inbox",
			"conversations",
			"--agent",
			"--help",
		]);
		expect(
			JSON.parse(focused.stdout).commands.map((entry: any) => entry.command),
		).toContain("inbox conversations reply");
		expect(JSON.parse(focused.stdout)).toMatchObject({
			exitCodes: { "3": "auth", "5": "rate_limit", "7": "api" },
			output: { success: "raw data in --agent mode" },
		});
	});

	it("supports token-free mutation dry runs and rejects tokens in argv", async () => {
		const dryRun = await runCli([
			"contacts",
			"create",
			"--data",
			'{"firstName":"Maya"}',
			"--dry-run",
		]);
		expect(dryRun.code).toBe(0);
		expect(JSON.parse(dryRun.stdout)).toMatchObject({
			ok: true,
			data: {
				dryRun: true,
				method: "POST",
				body: { firstName: "Maya" },
			},
			summary: expect.stringContaining("nothing was sent"),
			breadcrumbs: expect.arrayContaining([
				expect.objectContaining({ cmd: "repzo contacts list" }),
			]),
		});
		const unsafe = await runCli(["auth", "login", "--token", "foxa-secret"]);
		expect(unsafe.code).toBe(1);
		expect(JSON.parse(unsafe.stderr)).toMatchObject({
			ok: false,
			error: {
				code: "usage",
				message: expect.stringContaining(
					"cannot be passed on the command line",
				),
				retryable: false,
			},
		});
		expect(unsafe.stderr).not.toContain("foxa-secret");
	});

	it("reads a mutation body from stdin", async () => {
		const result = await runCli(
			["contacts", "create", "--data", "@-", "--dry-run"],
			{ input: '{"firstName":"Maya","country":"JO"}\n' },
		);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			data: {
				dryRun: true,
				method: "POST",
				url: expect.stringMatching(/\/api\/v1\/contacts$/),
				body: { firstName: "Maya", country: "JO" },
			},
		});
	});

	it("rejects unknown flags with a structured usage error", async () => {
		const result = await runCli(["contacts", "list", "--unknown", "value"]);
		expect(result.code).toBe(1);
		expect(JSON.parse(result.stderr)).toMatchObject({
			ok: false,
			error: {
				code: "usage",
				message: "Unknown option: --unknown",
				hint: expect.stringContaining("--agent --help"),
				retryable: false,
			},
		});
	});

	it("stores named profile credentials outside argv and never returns the token", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "repzo-cli-profile-"));
		const env = {
			REPZO_CONFIG_DIR: configDir,
			REPZO_CREDENTIAL_BACKEND: "file",
		};
		const login = await runCli(
			[
				"auth",
				"login",
				"--profile",
				"work",
				"--base-url",
				"https://work.example",
				"--token-stdin",
			],
			{ env, input: "foxa-test-secret\n" },
		);
		expect(login.code).toBe(0);
		expect(login.stdout).not.toContain("foxa-test-secret");
		expect(JSON.parse(login.stdout)).toMatchObject({
			ok: true,
			data: {
				profile: "work",
				baseUrl: "https://work.example",
			},
		});
		expect(
			JSON.parse(await readFile(join(configDir, "credentials.json"), "utf8")),
		).toEqual({ work: "foxa-test-secret" });
		const status = await runCli(["auth", "status", "--profile", "work"], {
			env,
		});
		expect(JSON.parse(status.stdout)).toMatchObject({
			ok: true,
			data: {
				authenticated: true,
				profile: "work",
			},
		});
		expect(status.stdout).not.toContain("foxa-test-secret");
	});

	it("completes browser login through a PKCE loopback callback without exposing tokens", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "repzo-cli-oauth-"));
		const app = express();
		app.use(express.urlencoded({ extended: false }));
		let tokenRequest: Record<string, string> = {};
		app.post("/api/v1/oauth/token", (req, res) => {
			tokenRequest = req.body;
			res.json({
				access_token: "foxu-browser-access-secret",
				token_type: "Bearer",
				expires_in: 3600,
				refresh_token: "foxr-browser-refresh-secret",
				scope: "contacts:read reports:read",
			});
		});
		const authServer = await new Promise<Server>((resolve) => {
			const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
		});
		const address = authServer.address();
		if (!address || typeof address === "string")
			throw new Error("Expected test address");
		const origin = `http://127.0.0.1:${address.port}`;

		const result = await new Promise<{
			code: number;
			stdout: string;
			stderr: string;
		}>((resolve, reject) => {
			const child = spawn(
				process.execPath,
				[
					"bin/repzo.mjs",
					"auth",
					"login",
					"--no-browser",
					"--base-url",
					origin,
				],
				{
					cwd: process.cwd(),
					env: {
						...process.env,
						REPZO_CONFIG_DIR: configDir,
						REPZO_CREDENTIAL_BACKEND: "file",
						REPZO_DISABLE_SKILL_REFRESH: "1",
					},
					stdio: "pipe",
				},
			);
			let stdout = "";
			let stderr = "";
			let callbackSent = false;
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", async (chunk) => {
				stderr += chunk;
				if (callbackSent) return;
				const match = stderr.match(
					/Open this URL in your browser:\n(https?:\/\/[^\s]+)/,
				);
				if (!match) return;
				callbackSent = true;
				const authorizeUrl = new URL(match[1]);
				expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
					"S256",
				);
				expect(authorizeUrl.searchParams.get("code_challenge")).toMatch(
					/^[A-Za-z0-9_-]{43}$/,
				);
				const callback = new URL(
					authorizeUrl.searchParams.get("redirect_uri")!,
				);
				callback.searchParams.set("code", "foxc-one-time-code");
				callback.searchParams.set(
					"state",
					authorizeUrl.searchParams.get("state")!,
				);
				await fetch(callback);
			});
			child.on("error", reject);
			child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
		});
		await new Promise<void>((resolve) => authServer.close(() => resolve()));

		expect(result.code).toBe(0);
		expect(result.stdout).not.toContain("browser-access-secret");
		expect(result.stdout).not.toContain("browser-refresh-secret");
		expect(tokenRequest).toMatchObject({
			grant_type: "authorization_code",
			client_id: "repzo-cli",
			code: "foxc-one-time-code",
		});
		expect(tokenRequest.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const stored = JSON.parse(
			await readFile(join(configDir, "credentials.json"), "utf8"),
		);
		const credential = JSON.parse(stored.default);
		expect(credential).toMatchObject({
			version: 1,
			type: "oauth",
			accessToken: "foxu-browser-access-secret",
			refreshToken: "foxr-browser-refresh-secret",
			scopes: ["contacts:read", "reports:read"],
		});
	});

	it("normalizes an API-root base URL during browser OAuth", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "repzo-cli-oauth-root-"));
		const app = express();
		app.use(express.urlencoded({ extended: false }));
		app.post("/api/v1/oauth/token", (_req, res) =>
			res.json({
				access_token: "foxu-api-root-access",
				token_type: "Bearer",
				expires_in: 3600,
				refresh_token: "foxr-api-root-refresh",
				scope: "contacts:read",
			}),
		);
		const authServer = await new Promise<Server>((resolve) => {
			const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
		});
		const address = authServer.address();
		if (!address || typeof address === "string")
			throw new Error("Expected test address");
		const apiRoot = `http://127.0.0.1:${address.port}/api/v1`;

		const result = await new Promise<{
			code: number;
			stdout: string;
			stderr: string;
		}>((resolve, reject) => {
			const child = spawn(
				process.execPath,
				[
					"bin/repzo.mjs",
					"auth",
					"login",
					"--no-browser",
					"--base-url",
					apiRoot,
				],
				{
					cwd: process.cwd(),
					env: {
						...process.env,
						REPZO_CONFIG_DIR: configDir,
						REPZO_CREDENTIAL_BACKEND: "file",
						REPZO_DISABLE_SKILL_REFRESH: "1",
					},
					stdio: "pipe",
				},
			);
			let stdout = "";
			let stderr = "";
			let callbackSent = false;
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", async (chunk) => {
				stderr += chunk;
				if (callbackSent) return;
				const match = stderr.match(
					/Open this URL in your browser:\n(https?:\/\/[^\s]+)/,
				);
				if (!match) return;
				callbackSent = true;
				const authorizeUrl = new URL(match[1]);
				const callback = new URL(
					authorizeUrl.searchParams.get("redirect_uri")!,
				);
				callback.searchParams.set("code", "foxc-api-root-code");
				callback.searchParams.set(
					"state",
					authorizeUrl.searchParams.get("state")!,
				);
				await fetch(callback);
			});
			child.on("error", reject);
			child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
		});
		await new Promise<void>((resolve) => authServer.close(() => resolve()));

		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout).data.baseUrl).toBe(apiRoot);
	});

	it("installs one shared skill and links Codex and Claude to it", async () => {
		for (const target of ["codex", "claude"] as const) {
			const targetHome = await mkdtemp(join(tmpdir(), `repzo-${target}-`));
			const agentsHome = await mkdtemp(join(tmpdir(), "repzo-agents-"));
			const variable = target === "codex" ? "CODEX_HOME" : "CLAUDE_HOME";
			const result = await runCli(["setup", target], {
				env: { [variable]: targetHome, REPZO_AGENTS_HOME: agentsHome },
			});
			expect(result.code).toBe(0);
			const agentSkill = join(targetHome, "skills", "repzo-workstation");
			const sharedSkill = join(agentsHome, "skills", "repzo-workstation");
			expect((await lstat(agentSkill)).isSymbolicLink()).toBe(true);
			expect(await realpath(agentSkill)).toBe(await realpath(sharedSkill));
			expect(await readFile(join(agentSkill, "SKILL.md"), "utf8")).toContain(
				"name: repzo-workstation",
			);
			await expect(
				access(join(agentSkill, "references", "api.md")),
			).resolves.toBeUndefined();
			expect(
				await readFile(join(sharedSkill, ".installed-version"), "utf8"),
			).toBe("1.0.2\n");
		}
	});

	it("detects and connects every configured agent", async () => {
		const agentsHome = await mkdtemp(join(tmpdir(), "repzo-agents-"));
		const codexHome = await mkdtemp(join(tmpdir(), "repzo-codex-"));
		const claudeHome = await mkdtemp(join(tmpdir(), "repzo-claude-"));
		const result = await runCli(["setup", "agents"], {
			env: {
				REPZO_AGENTS_HOME: agentsHome,
				CODEX_HOME: codexHome,
				CLAUDE_HOME: claudeHome,
			},
		});
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout).data).toMatchObject({
			detected: ["codex", "claude"],
			restartRequired: true,
		});
		for (const agentHome of [codexHome, claudeHome])
			await expect(
				access(join(agentHome, "skills", "repzo-workstation", "SKILL.md")),
			).resolves.toBeUndefined();
	});

	it("refreshes installed skills when the CLI version changes", async () => {
		const agentsHome = await mkdtemp(join(tmpdir(), "repzo-agents-"));
		const codexHome = await mkdtemp(join(tmpdir(), "repzo-codex-"));
		const environment = {
			REPZO_AGENTS_HOME: agentsHome,
			CODEX_HOME: codexHome,
		};
		expect((await runCli(["setup", "codex"], { env: environment })).code).toBe(
			0,
		);
		const sharedSkill = join(agentsHome, "skills", "repzo-workstation");
		await writeFile(join(sharedSkill, ".installed-version"), "0.9.0\n");
		await writeFile(
			join(sharedSkill, "SKILL.md"),
			"---\nname: repzo-workstation\ndescription: stale\n---\nstale\n",
		);
		const refreshed = await runCli(["commands", "--json"], {
			env: { ...environment, REPZO_DISABLE_SKILL_REFRESH: "0" },
		});
		expect(refreshed.code).toBe(0);
		expect(
			await readFile(join(sharedSkill, ".installed-version"), "utf8"),
		).toBe("1.0.2\n");
		expect(await readFile(join(sharedSkill, "SKILL.md"), "utf8")).toContain(
			"Operate Workstation through the `repzo` CLI",
		);
	});

	it("reports skill installation health through doctor", async () => {
		const agentsHome = await mkdtemp(join(tmpdir(), "repzo-agents-"));
		const codexHome = await mkdtemp(join(tmpdir(), "repzo-codex-"));
		const environment = {
			REPZO_AGENTS_HOME: agentsHome,
			CODEX_HOME: codexHome,
			REPZO_BASE_URL: "http://127.0.0.1:1",
		};
		await runCli(["setup", "codex"], { env: environment });
		const result = await runCli(["doctor", "--no-retry"], {
			env: environment,
		});
		const checks = JSON.parse(result.stdout).data.checks;
		expect(checks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: "Agent skill (shared)", ok: true }),
				expect.objectContaining({ name: "Agent skill (codex)", ok: true }),
			]),
		);
	});

	it("does not replace a foreign agent skill without --force", async () => {
		const agentsHome = await mkdtemp(join(tmpdir(), "repzo-agents-"));
		const codexHome = await mkdtemp(join(tmpdir(), "repzo-codex-"));
		const destination = join(codexHome, "skills", "repzo-workstation");
		await mkdir(destination, { recursive: true });
		await writeFile(
			join(destination, "SKILL.md"),
			"---\nname: another-skill\ndescription: keep me\n---\n",
		);
		const environment = {
			REPZO_AGENTS_HOME: agentsHome,
			CODEX_HOME: codexHome,
		};
		const refused = await runCli(["setup", "codex"], { env: environment });
		expect(refused.code).toBe(1);
		expect(await readFile(join(destination, "SKILL.md"), "utf8")).toContain(
			"another-skill",
		);
		const forced = await runCli(["setup", "codex", "--force"], {
			env: environment,
		});
		expect(forced.code).toBe(0);
		expect(await readFile(join(destination, "SKILL.md"), "utf8")).toContain(
			"name: repzo-workstation",
		);
	});

	describe("API pagination", () => {
		let server: Server;
		let baseUrl = "";
		let calls = 0;
		let mutationCalls = 0;
		beforeAll(async () => {
			const app = express();
			app.get("/api/v1/contacts", (req, res) => {
				calls += 1;
				const page = Number(req.query.page || 1);
				res.json({
					data: [{ id: `contact-${page}` }],
					meta: {
						page,
						limit: 1,
						total: 2,
						totalPages: 2,
						hasNextPage: page < 2,
						hasPrevPage: page > 1,
					},
				});
			});
			app.get("/api/v1/contacts/:id", (req, res) => {
				const statuses: Record<string, number> = {
					unauthorized: 401,
					forbidden: 403,
					missing: 404,
					limited: 429,
					broken: 500,
				};
				const status = statuses[req.params.id];
				if (status) {
					res.status(status).json({
						error: {
							code: `http_${status}`,
							message: `HTTP ${status} test error`,
							details: { id: req.params.id },
						},
					});
					return;
				}
				res.json({ data: { id: req.params.id, name: "Maya" } });
			});
			app.post("/api/v1/contacts", (_req, res) => {
				mutationCalls += 1;
				res
					.status(503)
					.json({ error: { code: "unavailable", message: "Try later" } });
			});
			await new Promise<void>((resolve) => {
				server = app.listen(0, "127.0.0.1", () => {
					const address = server.address();
					if (!address || typeof address === "string")
						throw new Error("Expected address");
					baseUrl = `http://127.0.0.1:${address.port}`;
					resolve();
				});
			});
		});
		afterAll(async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		});
		it("fetches all offset pages", async () => {
			const result = await runCli(
				["contacts", "list", "--all", "--limit", "1"],
				{ env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } },
			);
			expect(result.code).toBe(0);
			const output = JSON.parse(result.stdout);
			expect(output.data.map((row: any) => row.id)).toEqual([
				"contact-1",
				"contact-2",
			]);
			expect(output).toMatchObject({
				ok: true,
				summary: "2 results",
				meta: { fetched: 2, command: "repzo contacts list" },
			});
			expect(output.breadcrumbs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						action: "get",
						cmd: "repzo contacts get contact-1",
					}),
				]),
			);
			expect(calls).toBe(2);
		});

		it("preserves list filters in next-page breadcrumbs", async () => {
			const result = await runCli(
				["contacts", "list", "--limit", "1", "--query", "status=open"],
				{ env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } },
			);
			expect(JSON.parse(result.stdout).breadcrumbs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						action: "next_page",
						cmd: "repzo contacts list --query 'status=open' --limit 1 --page 2",
					}),
				]),
			);
		});

		it("supports raw data output for scripts and agents", async () => {
			for (const flag of ["--quiet", "--agent"]) {
				const result = await runCli(["contacts", "get", "contact-1", flag], {
					env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" },
				});
				expect(result.code).toBe(0);
				expect(JSON.parse(result.stdout)).toEqual({
					id: "contact-1",
					name: "Maya",
				});
			}
		});

		it("uses the network exit code when the API cannot be reached", async () => {
			const result = await runCli(["contacts", "list", "--no-retry"], {
				env: {
					REPZO_BASE_URL: "http://127.0.0.1:1",
					REPZO_TOKEN: "foxa-test",
				},
			});
			expect(result.code).toBe(6);
			expect(JSON.parse(result.stderr)).toMatchObject({
				ok: false,
				error: { code: "network", retryable: true },
			});
		});

		it("does not automatically retry mutations", async () => {
			mutationCalls = 0;
			const result = await runCli(
				["contacts", "create", "--data", '{"firstName":"Maya"}', "--yes"],
				{ env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } },
			);
			expect(result.code).toBe(7);
			expect(mutationCalls).toBe(1);
		});

		it.each([
			["unauthorized", 3, "auth", 401, false],
			["forbidden", 4, "forbidden", 403, false],
			["missing", 2, "not_found", 404, false],
			["limited", 5, "rate_limit", 429, true],
			["broken", 7, "api", 500, true],
		])("maps HTTP errors for %s to a stable exit contract", async (id, exitCode, errorCode, status, retryable) => {
			const result = await runCli(
				["contacts", "get", String(id), "--no-retry"],
				{ env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } },
			);
			expect(result.code).toBe(exitCode);
			expect(result.stdout).toBe("");
			expect(JSON.parse(result.stderr)).toMatchObject({
				ok: false,
				error: {
					code: errorCode,
					message: `HTTP ${status} test error`,
					status,
					retryable,
					details: { id },
				},
			});
		});
	});
});
