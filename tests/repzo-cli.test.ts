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

const packageVersion = JSON.parse(await readFile("package.json", "utf8")).version;
// Never read the developer's own logins: a live support login there changes
// what the CLI allows.
const isolatedConfigDir = await mkdtemp(join(tmpdir(), "repzo-cli-config-"));

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
						REPZO_CREDENTIAL_BACKEND: "file",
						REPZO_CONFIG_DIR: isolatedConfigDir,
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
					command: "chat users list",
					path: "/chat/users",
					pagination: "offset",
				}),
				expect.objectContaining({
					command: "chat channels direct",
					path: "/chat/channels/direct",
					mutation: true,
				}),
			expect.objectContaining({
					command: "chat members list",
					path: "/chat/channels/{channelId}/members",
				}),
				expect.objectContaining({
					command: "reports execute",
					method: "POST",
					mutation: false,
				}),
				expect.objectContaining({
					command: "metadata tax-rates",
					path: "/metadata/tax-rates",
				}),
				expect.objectContaining({
					command: "metadata properties",
					path: "/metadata/properties/{entityType}",
				}),
				expect.objectContaining({
					command: "search records",
					path: "/search",
				}),
				expect.objectContaining({
					command: "timeline list",
					path: "/timeline",
				}),
				expect.objectContaining({
					command: "comments list",
					pagination: "offset",
				}),
				expect.objectContaining({
					command: "comments create",
					path: "/comments/{entityType}/{entityId}",
					mutation: true,
				}),
				expect.objectContaining({
					command: "notifications list",
					pagination: "offset",
				}),
				expect.objectContaining({
					command: "notifications unread-count",
					path: "/notifications/unread-count",
				}),
				expect.objectContaining({
					command: "approvals pending",
					path: "/approvals/pending",
					pagination: "offset",
				}),
				expect.objectContaining({
					command: "media list",
					pagination: "offset",
				}),
				expect.objectContaining({
					command: "media upload",
					path: "/media/{entityType}/{entityId}",
					requiresFile: true,
				}),
				expect.objectContaining({
					command: "price-offers items replace",
					path: "/price-offers/{id}/items",
					mutation: true,
				}),
				expect.objectContaining({
					command: "invoices void",
					path: "/invoices/{id}/void",
					mutation: true,
				}),
				expect.objectContaining({
					command: "exports create",
					path: "/data/exports",
				}),
				expect.objectContaining({
					command: "agents get",
					path: "/agents/{id}",
				}),
				expect.objectContaining({
					command: "agents publish",
					path: "/agents/{id}/publish",
					mutation: true,
				}),
				expect.objectContaining({
					command: "agents test messages",
					pagination: "cursor",
				}),
			]),
		);
		expect(
			commands.some((entry: any) => entry.command === "imports create"),
		).toBe(true);
		expect(commands.some((entry: any) => entry.command === "events types")).toBe(false);
		expect(commands).toEqual(expect.arrayContaining([
			expect.objectContaining({ command: "imports upload", requiresFile: true }),
			expect.objectContaining({ command: "imports validate", mutation: false }),
			expect.objectContaining({ command: "imports start", mutation: true }),
		]));

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

	it("discovers and previews bulk updates for all supported resources", async () => {
		const resources = ["contacts", "accounts", "deals", "activities", "projects", "tickets", "invoices", "price-offers", "campaigns", "products"];
		const body = { ids: ["11111111-1111-4111-8111-111111111111"], updates: { customProperties: { tier: "gold" } } };
		const catalog = JSON.parse((await runCli(["commands", "--json"])).stdout).data.commands;
		for (const resource of resources) {
			expect(catalog).toContainEqual(expect.objectContaining({
				command: `${resource} bulk-update`, method: "POST", path: `/${resource}/bulk-update`, mutation: true, requiresBody: true,
			}));
			const preview = await runCli([resource, "bulk-update", "--data", JSON.stringify(body), "--dry-run", "--idempotency-key", `${resource}-batch-1`]);
			expect(preview.code).toBe(0);
			expect(JSON.parse(preview.stdout).data).toMatchObject({
				dryRun: true, method: "POST", body, idempotencyKey: `${resource}-batch-1`,
				url: expect.stringContaining(`/api/v1/${resource}/bulk-update`),
			});
		}
	});

	it("discovers duplicate and merge commands for accounts and contacts", async () => {
		const catalog = JSON.parse((await runCli(["commands", "--json"])).stdout).data.commands;
		for (const resource of ["accounts", "contacts"]) {
			for (const [command, method, path, args, mutation, requiresBody] of [
				["duplicates list", "GET", "/duplicates", [], false, false],
				["duplicates scan", "POST", "/duplicates/scan", [], true, false],
				["duplicates reject", "POST", "/duplicates/{id}/reject", ["id"], true, false],
				["merge preview", "POST", "/merge/preview", [], false, true],
				["merge", "POST", "/merge", [], true, true],
			] as const) {
				expect(catalog).toContainEqual(expect.objectContaining({
					command: `${resource} ${command}`, method, path: `/${resource}${path}`, arguments: args, mutation, requiresBody,
				}));
			}
		}
		const body = { primaryId: "acct-1", mergeIds: ["acct-2"] };
		const preview = await runCli(["accounts", "merge", "--data", JSON.stringify(body), "--dry-run"]);
		expect(preview.code).toBe(0);
		expect(JSON.parse(preview.stdout).data).toMatchObject({
			dryRun: true, method: "POST", body, url: expect.stringContaining("/api/v1/accounts/merge"),
		});
	});

	it("sends transactional and system messages through /send/dispatch with their category", async () => {
		const body = { contactId: "c-1", deliveryChannel: "email", payload: { subject: "Hi" } };
		for (const [command, sendCategory] of [["transactional", "transactional"], ["system", "system"]] as const) {
			const preview = await runCli(["send", command, "--data", JSON.stringify({ ...body, sendCategory: "marketing" }), "--dry-run"]);
			expect(preview.code).toBe(0);
			expect(JSON.parse(preview.stdout).data).toMatchObject({
				dryRun: true, method: "POST", url: expect.stringContaining("/api/v1/send/dispatch"), body: { ...body, sendCategory },
			});
		}
	});

	it("discovers email template commands and previews design and HTML bodies", async () => {
		const catalog = JSON.parse((await runCli(["commands", "--json"])).stdout).data.commands;
		for (const [command, method, path, args, mutation, requiresBody] of [
			["list", "GET", "", [], false, false],
			["get", "GET", "/{id}", ["id"], false, false],
			["create", "POST", "", [], true, true],
			["update", "PATCH", "/{id}", ["id"], true, true],
			["delete", "DELETE", "/{id}", ["id"], true, false],
			["clone", "POST", "/{id}/clone", ["id"], true, false],
		] as const) {
			expect(catalog).toContainEqual(expect.objectContaining({
				command: `email-templates ${command}`, method, path: `/email-templates${path}`, arguments: args, mutation, requiresBody,
			}));
		}
		const create = catalog.find((entry: { command: string }) => entry.command === "email-templates create");
		expect(create.gotchas.join(" ")).toContain("designJson");
		expect(create.gotchas.join(" ")).toContain("bodyHtml");

		for (const body of [
			{ name: "Welcome", designJson: { body: { rows: [] } } },
			{ name: "Shipped", bodyHtml: "<p>Hi {{contact.firstName}}</p>" },
		]) {
			const preview = await runCli(["email-templates", "create", "--data", JSON.stringify(body), "--dry-run"]);
			expect(preview.code).toBe(0);
			expect(JSON.parse(preview.stdout).data).toMatchObject({
				dryRun: true, method: "POST", body, url: expect.stringContaining("/api/v1/email-templates"),
			});
		}
		const clone = await runCli(["email-templates", "clone", "tpl-1", "--dry-run"]);
		expect(clone.code).toBe(0);
		expect(JSON.parse(clone.stdout).data).toMatchObject({
			dryRun: true, method: "POST", url: expect.stringContaining("/api/v1/email-templates/tpl-1/clone"),
		});
	});

	it("discovers WhatsApp Flow commands and previews edits, syncs, and test sends", async () => {
		const catalog = JSON.parse((await runCli(["commands", "--json"])).stdout).data.commands;
		for (const [command, method, path, args, mutation, requiresBody] of [
			["whatsapp-channels list", "GET", "/inbox/whatsapp-channels", [], false, false],
			["whatsapp-flows list", "GET", "/inbox/whatsapp-flows", [], false, false],
			["whatsapp-flows get", "GET", "/inbox/whatsapp-flows/{id}", ["id"], false, false],
			["whatsapp-flows create", "POST", "/inbox/whatsapp-flows", [], true, true],
			["whatsapp-flows update", "PATCH", "/inbox/whatsapp-flows/{id}", ["id"], true, true],
			["whatsapp-flows delete", "DELETE", "/inbox/whatsapp-flows/{id}", ["id"], true, false],
			["whatsapp-flows duplicate", "POST", "/inbox/whatsapp-flows/{id}/duplicate", ["id"], true, false],
			["whatsapp-flows sync", "POST", "/inbox/whatsapp-flows/{id}/sync", ["id"], true, false],
			["whatsapp-flows send-test", "POST", "/inbox/whatsapp-flows/{id}/send-test", ["id"], true, true],
			["whatsapp-flows flow-json", "GET", "/inbox/whatsapp-flows/{id}/flow-json", ["id"], false, false],
			["whatsapp-flows starters", "GET", "/inbox/whatsapp-flows/starters", [], false, false],
			["whatsapp-flows objects", "GET", "/inbox/whatsapp-flows/objects", [], false, false],
			["whatsapp-flows properties", "GET", "/inbox/whatsapp-flows/objects/{entityType}/properties", ["entityType"], false, false],
		] as const) {
			expect(catalog).toContainEqual(expect.objectContaining({
				command: `inbox ${command}`, method, path, arguments: args, mutation, requiresBody,
			}));
		}
		const update = catalog.find((entry: { command: string }) => entry.command === "inbox whatsapp-flows update");
		expect(update.gotchas.join(" ")).toContain("revision");

		const body = { revision: 3, name: "Lead form" };
		const preview = await runCli(["inbox", "whatsapp-flows", "update", "flow-1", "--data", JSON.stringify(body), "--dry-run"]);
		expect(preview.code).toBe(0);
		expect(JSON.parse(preview.stdout).data).toMatchObject({
			dryRun: true, method: "PATCH", body, url: expect.stringContaining("/api/v1/inbox/whatsapp-flows/flow-1"),
		});
		const publish = await runCli(["inbox", "whatsapp-flows", "sync", "flow-1", "--data", '{"publish":true}', "--dry-run"]);
		expect(publish.code).toBe(0);
		expect(JSON.parse(publish.stdout).data).toMatchObject({
			dryRun: true, method: "POST", body: { publish: true }, url: expect.stringContaining("/api/v1/inbox/whatsapp-flows/flow-1/sync"),
		});
		const send = await runCli(["inbox", "whatsapp-flows", "send-test", "flow-1"]);
		expect(send.code).not.toBe(0);
	});

	it("discovers Send event and event type commands and previews their mutations", async () => {
		const catalog = JSON.parse((await runCli(["commands", "--json"])).stdout).data.commands;
		for (const [command, method, path, args, mutation, requiresBody, pagination] of [
			["event", "POST", "/send/events", [], true, true, null],
			["events batch", "POST", "/send/events/batch", [], true, true, null],
			["events list", "GET", "/send/events", [], false, false, "offset"],
			["events get", "GET", "/send/events/{id}", ["id"], false, false, null],
			["event-types list", "GET", "/send/event-types", [], false, false, "offset"],
			["event-types get", "GET", "/send/event-types/{name}", ["name"], false, false, null],
			["event-types create", "POST", "/send/event-types", [], true, true, null],
			["event-types update", "PATCH", "/send/event-types/{name}", ["name"], true, true, null],
		] as const) {
			expect(catalog).toContainEqual(expect.objectContaining({
				command: `send ${command}`, method, path, arguments: args, mutation, requiresBody, pagination,
			}));
		}
		// The alias runs the canonical command but stays out of the catalog.
		expect(catalog.some((entry: { command: string }) => entry.command === "send events record")).toBe(false);
		// Outbound webhook subscriptions are a separate family and stay untouched.
		expect(catalog).toContainEqual(expect.objectContaining({ command: "events subscriptions list", path: "/events/subscriptions" }));

		const gotchas = (command: string) => catalog.find((entry: { command: string }) => entry.command === command).gotchas.join(" ");
		expect(gotchas("send event")).toContain("dedupeKey");
		expect(gotchas("send event")).toContain("createContact");
		expect(gotchas("send event")).toContain("120/min");
		expect(gotchas("send events batch")).toContain("results[]");
		expect(gotchas("send event-types update")).toContain("archived");

		const event = { name: "plan_upgraded", email: "maya@example.com", properties: { plan: "pro" }, dedupeKey: "inv-1042" };
		for (const tokens of [["send", "event"], ["send", "events", "record"]]) {
			const preview = await runCli([...tokens, "--data", JSON.stringify(event), "--dry-run", "--idempotency-key", "plan-upgraded-1"]);
			expect(preview.code).toBe(0);
			expect(JSON.parse(preview.stdout).data).toMatchObject({
				dryRun: true, method: "POST", body: event, idempotencyKey: "plan-upgraded-1",
				url: expect.stringMatching(/\/api\/v1\/send\/events$/),
			});
		}
		const batch = { events: [event, { ...event, email: "omar@example.com", dedupeKey: "inv-1043" }] };
		const batchPreview = await runCli(["send", "events", "batch", "--data", JSON.stringify(batch), "--dry-run"]);
		expect(batchPreview.code).toBe(0);
		expect(JSON.parse(batchPreview.stdout).data).toMatchObject({
			dryRun: true, method: "POST", body: batch, url: expect.stringContaining("/api/v1/send/events/batch"),
		});
		const typeBody = { name: "plan_upgraded", primaryObject: "contact", properties: [{ name: "plan", type: "select", options: [{ value: "pro" }] }] };
		const create = await runCli(["send", "event-types", "create", "--data", JSON.stringify(typeBody), "--dry-run"]);
		expect(create.code).toBe(0);
		expect(JSON.parse(create.stdout).data).toMatchObject({
			dryRun: true, method: "POST", body: typeBody, url: expect.stringMatching(/\/api\/v1\/send\/event-types$/),
		});
		const archive = await runCli(["send", "event-types", "update", "plan_upgraded", "--data", '{"archived":true}', "--dry-run"]);
		expect(archive.code).toBe(0);
		expect(JSON.parse(archive.stdout).data).toMatchObject({
			dryRun: true, method: "PATCH", body: { archived: true }, url: expect.stringContaining("/api/v1/send/event-types/plan_upgraded"),
		});
		expect((await runCli(["send", "events", "batch", "--dry-run"])).code).toBe(1);
		expect((await runCli(["send", "event-types", "update", "--data", "{}", "--dry-run"])).code).toBe(1);
	});

	it("discovers and previews Chat Block Kit, ephemeral, and view commands", async () => {
		const catalog = JSON.parse((await runCli(["commands", "--json"])).stdout).data.commands;
		const expected = [
			["chat messages delete", "DELETE", "/chat/messages/{id}", ["id"], false],
			["chat ephemeral send", "POST", "/chat/channels/{channelId}/ephemeral", ["channelId"], true],
			["chat views open", "POST", "/chat/views/open", [], true],
			["chat views push", "POST", "/chat/views/push", [], true],
			["chat views update", "POST", "/chat/views/update", [], true],
			["chat views publish", "POST", "/chat/views/publish", [], true],
		] as const;
		for (const [command, method, path, args, requiresBody] of expected) {
			expect(catalog).toContainEqual(expect.objectContaining({
				command, method, path, arguments: args, requiresBody, mutation: true,
			}));
		}
		const gotchas = (command: string) =>
			catalog.find((entry: any) => entry.command === command).gotchas.join("\n");
		expect(gotchas("chat send")).toContain("warnings");
		expect(gotchas("chat ephemeral send")).toContain("Developer App token");
		expect(gotchas("chat views open")).toContain("60 seconds");
		expect(gotchas("chat views push")).toContain("push_limit_reached");
		expect(gotchas("chat views update")).toContain("hash_conflict");
		expect(gotchas("chat views publish")).toContain("slackError");

		const blocks = [
			{ type: "section", text: { type: "mrkdwn", text: "*Refund* request" } },
			{ type: "actions", elements: [{ type: "button", action_id: "approve", text: { type: "plain_text", text: "Approve" }, value: "refund-42" }] },
		];
		const view = { type: "modal", title: { type: "plain_text", text: "Refund" }, blocks };
		const previews: Array<[string[], unknown, string, string]> = [
			[["chat", "send", "channel-1"], { body: "Refund request", blocks }, "POST", "/api/v1/chat/channels/channel-1/messages"],
			[["chat", "ephemeral", "send", "channel-1"], { userId: "user-1", blocks }, "POST", "/api/v1/chat/channels/channel-1/ephemeral"],
			[["chat", "views", "open"], { trigger_id: "trigger-1", view }, "POST", "/api/v1/chat/views/open"],
			[["chat", "views", "push"], { trigger_id: "trigger-2", view }, "POST", "/api/v1/chat/views/push"],
			[["chat", "views", "update"], { view_id: "view-1", hash: "hash-1", view }, "POST", "/api/v1/chat/views/update"],
			[["chat", "views", "publish"], { user_id: "user-1", view: { type: "home", blocks } }, "POST", "/api/v1/chat/views/publish"],
			[["chat", "messages", "delete", "message-1"], undefined, "DELETE", "/api/v1/chat/messages/message-1"],
		];
		for (const [args, body, method, path] of previews) {
			const result = await runCli([
				...args,
				...(body === undefined ? [] : ["--data", JSON.stringify(body)]),
				"--dry-run",
			]);
			expect(result.code).toBe(0);
			const data = JSON.parse(result.stdout).data;
			expect(data).toMatchObject({ dryRun: true, method });
			expect(new URL(data.url).pathname).toBe(path);
			expect(data.body).toEqual(body);
		}

		const missingBody = await runCli(["chat", "views", "open", "--dry-run"]);
		expect(missingBody.code).toBe(1);
		expect(JSON.parse(missingBody.stderr).error.message).toContain("requires --data");
		const missingChannel = await runCli(["chat", "ephemeral", "send", "--data", "{}", "--dry-run"]);
		expect(missingChannel.code).toBe(1);
		expect(JSON.parse(missingChannel.stderr).error.message).toContain(
			"repzo chat ephemeral send <channelId> --data",
		);
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

	it("includes a stable idempotency key in mutation previews", async () => {
		const result = await runCli([
			"contacts", "create", "--data", '{"firstName":"Maya"}', "--dry-run",
			"--idempotency-key", "contact-create-maya-1",
		]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({ data: { idempotencyKey: "contact-create-maya-1" } });
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

	it("previews import uploads without reading credentials or sending bytes", async () => {
		const directory = await mkdtemp(join(tmpdir(), "repzo-import-"));
		const file = join(directory, "contacts.csv");
		await writeFile(file, "firstName,lastName\nMaya,Ali\n");
		const result = await runCli(["imports", "upload", file, "--dry-run"]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			data: {
				dryRun: true,
				method: "POST",
				file: { path: file, name: "contacts.csv", type: "text/csv" },
			},
		});
	});

	it("previews record attachment uploads with the file argument after record IDs", async () => {
		const directory = await mkdtemp(join(tmpdir(), "repzo-media-"));
		const file = join(directory, "proposal.pdf");
		await writeFile(file, "%PDF-1.4\n");
		const result = await runCli(["media", "upload", "deal", "11111111-1111-4111-8111-111111111111", file, "--dry-run"]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			data: {
				dryRun: true,
				url: expect.stringMatching(/\/media\/deal\/11111111-1111-4111-8111-111111111111$/),
				file: { path: file, name: "proposal.pdf", type: "application/pdf" },
			},
		});
	});

	it("uses the production Workstation origin by default", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "repzo-cli-default-origin-"));
		const result = await runCli(
			[
				"contacts",
				"create",
				"--data",
				'{"firstName":"Maya"}',
				"--dry-run",
			],
			{
				env: {
					REPZO_CONFIG_DIR: configDir,
					REPZO_BASE_URL: "",
				},
			},
		);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout).data.url).toBe(
			"https://workstation.repzo.com/api/v1/contacts",
		);
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

	it("signs a separate profile in for support and never mixes it up with the agent's own login", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "repzo-cli-support-"));
		const env = {
			...process.env,
			REPZO_CONFIG_DIR: configDir,
			REPZO_CREDENTIAL_BACKEND: "file",
			REPZO_DISABLE_SKILL_REFRESH: "1",
		};
		const noProfile = await runCli(["auth", "login", "--support", "--no-browser"], { env });
		expect(noProfile.code).toBe(1);
		expect(JSON.parse(noProfile.stderr || noProfile.stdout).error.hint).toContain("--profile support-");

		const app = express();
		app.use(express.urlencoded({ extended: false }));
		const supportEndsAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
		app.post("/api/v1/oauth/token", (_req, res) =>
			res.json({
				access_token: "foxu-support-access",
				token_type: "Bearer",
				expires_in: 3600,
				refresh_token: "foxr-support-refresh",
				scope: "contacts:read contacts:write",
				workspace: { id: "org-acme", name: "Acme Trading", slug: "acme" },
				user: { id: "user-sara", email: "sara@acme.test", name: "Sara Haddad" },
				support: { expires_at: supportEndsAt },
			}),
		);
		app.post("/api/v1/oauth/revoke", (_req, res) => res.status(200).end());
		const requests: string[] = [];
		app.use(express.json());
		app.all("/api/v1/contacts", (req, res) => {
			requests.push(`${req.method} ${req.headers.authorization}`);
			res.status(req.method === "POST" ? 201 : 200).json(
				req.method === "POST" ? { id: "contact-1" } : { data: [], meta: { page: 1, limit: 20, total: 0 } },
			);
		});
		const authServer = await new Promise<Server>((resolve) => {
			const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
		});
		const address = authServer.address();
		if (!address || typeof address === "string")
			throw new Error("Expected test address");
		const origin = `http://127.0.0.1:${address.port}`;
		let supportParam: string | null = null;

		const result = await new Promise<{ code: number; stdout: string }>((resolve, reject) => {
			const child = spawn(
				process.execPath,
				["bin/repzo.mjs", "auth", "login", "--support", "--profile", "support-acme", "--no-browser", "--base-url", origin],
				{ cwd: process.cwd(), env, stdio: "pipe" },
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
				const match = stderr.match(/Open this URL in your browser:\n(https?:\/\/[^\s]+)/);
				if (!match) return;
				callbackSent = true;
				const authorizeUrl = new URL(match[1]);
				supportParam = authorizeUrl.searchParams.get("support");
				const callback = new URL(authorizeUrl.searchParams.get("redirect_uri")!);
				callback.searchParams.set("code", "foxc-support-code");
				callback.searchParams.set("state", authorizeUrl.searchParams.get("state")!);
				await fetch(callback);
			});
			child.on("error", reject);
			child.on("close", (code) => resolve({ code: code ?? 1, stdout }));
		});

		expect(result.code).toBe(0);
		expect(supportParam).toBe("1");
		expect(JSON.parse(result.stdout).data).toMatchObject({
			profile: "support-acme",
			authType: "support",
			workspace: "Acme Trading",
			actingAs: "sara@acme.test",
		});
		const status = await runCli(["auth", "status", "--profile", "support-acme"], { env });
		expect(JSON.parse(status.stdout).data).toMatchObject({
			profile: "support-acme",
			support: true,
			workspace: "Acme Trading",
			actingAs: "sara@acme.test",
			supportEndsAt,
		});

		// The agent's own login stays the default.
		const profiles = JSON.parse(await readFile(join(configDir, "profiles.json"), "utf8"));
		expect(profiles.defaultProfile).toBe("default");
		profiles.profiles.default = { baseUrl: origin, credential: "file", authType: "developer_app" };
		await writeFile(join(configDir, "profiles.json"), JSON.stringify(profiles));
		const secrets = JSON.parse(await readFile(join(configDir, "credentials.json"), "utf8"));
		await writeFile(join(configDir, "credentials.json"), JSON.stringify({ ...secrets, default: "foxa-own-key" }));

		const makeDefault = await runCli(["profiles", "use", "support-acme"], { env });
		expect(makeDefault.code).toBe(1);
		expect(JSON.parse(makeDefault.stderr).error.message).toContain("can't be the default");

		// A change without --profile is refused while the support login is live.
		const create = ["contacts", "create", "--data", '{"firstName":"Maya"}', "--yes"];
		const unnamed = await runCli(create, { env });
		expect(unnamed.code).toBe(1);
		expect(unnamed.stderr).toContain("live support login: support-acme (Acme Trading, acting as sara@acme.test)");
		expect(unnamed.stderr).toContain("--profile support-acme");
		expect(requests).toEqual([]);

		const asSupport = await runCli([...create, "--profile", "support-acme"], { env });
		expect(asSupport.code, asSupport.stderr).toBe(0);
		expect(asSupport.stderr).toContain("→ Acme Trading · SUPPORT · acting as sara@acme.test · profile support-acme");
		expect(JSON.parse(asSupport.stdout).meta.target).toMatchObject({ profile: "support-acme", workspace: "Acme Trading", support: true });

		const asSelf = await runCli([...create, "--profile", "default"], { env });
		expect(asSelf.code).toBe(0);
		expect(asSelf.stderr).toContain("→ profile default · you");

		// Reads still run on the default, labelled so the agent sees where.
		const read = await runCli(["contacts", "list"], { env });
		expect(read.code).toBe(0);
		expect(read.stderr).toContain("→ profile default · you");
		expect(requests).toEqual([
			"POST Bearer foxu-support-access",
			"POST Bearer foxa-own-key",
			"GET Bearer foxa-own-key",
		]);

		// Signing out removes the support login, and the guard goes with it.
		expect((await runCli(["auth", "logout", "--profile", "support-acme"], { env })).code).toBe(0);
		const afterLogout = await runCli(create, { env });
		expect(afterLogout.code).toBe(0);
		expect(afterLogout.stderr).toBe("");
		expect(JSON.parse(await readFile(join(configDir, "profiles.json"), "utf8")).profiles["support-acme"]).toBeUndefined();
		await new Promise<void>((resolve) => authServer.close(() => resolve()));
	});

	it("removes a support login that has ended so it stops guarding changes", async () => {
		const configDir = await mkdtemp(join(tmpdir(), "repzo-cli-support-ended-"));
		const app = express();
		app.use(express.urlencoded({ extended: false }));
		app.post("/api/v1/oauth/token", (_req, res) =>
			res.status(400).json({ error: "invalid_grant", error_description: "This support login has ended." }),
		);
		const server = await new Promise<Server>((resolve) => {
			const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
		});
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("Expected test address");
		const origin = `http://127.0.0.1:${address.port}`;
		await writeFile(join(configDir, "profiles.json"), JSON.stringify({
			defaultProfile: "default",
			profiles: {
				default: { baseUrl: origin, credential: "file", authType: "developer_app" },
				"support-acme": { baseUrl: origin, credential: "file", authType: "support" },
			},
		}));
		await writeFile(join(configDir, "credentials.json"), JSON.stringify({
			default: "foxa-own-key",
			"support-acme": JSON.stringify({ version: 1, type: "oauth", accessToken: "foxu-old", refreshToken: "foxr-old", expiresAt: 0, scopes: [] }),
		}));
		const env = { REPZO_CONFIG_DIR: configDir };

		const blocked = await runCli(["contacts", "create", "--data", "{}", "--dry-run"], { env });
		expect(blocked.code).toBe(1);
		expect(blocked.stderr).toContain("repzo auth logout --profile support-acme");

		const ended = await runCli(["contacts", "list", "--profile", "support-acme"], { env });
		await new Promise<void>((resolve) => server.close(() => resolve()));
		expect(ended.code).toBe(3);
		expect(ended.stderr).toContain("This support login has ended.");
		expect(ended.stderr).toContain("ended and was removed");
		const profiles = JSON.parse(await readFile(join(configDir, "profiles.json"), "utf8"));
		expect(profiles.profiles["support-acme"]).toBeUndefined();

		const allowed = await runCli(["contacts", "create", "--data", "{}", "--dry-run"], { env });
		expect(allowed.code).toBe(0);
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

	it("installs both shared skills and links Codex and Claude to them", async () => {
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
			const aiAgentSkill = join(targetHome, "skills", "repzo-ai-agents");
			const sharedAiAgentSkill = join(agentsHome, "skills", "repzo-ai-agents");
			expect((await lstat(agentSkill)).isSymbolicLink()).toBe(true);
			expect(await realpath(agentSkill)).toBe(await realpath(sharedSkill));
			expect((await lstat(aiAgentSkill)).isSymbolicLink()).toBe(true);
			expect(await realpath(aiAgentSkill)).toBe(await realpath(sharedAiAgentSkill));
			expect(await readFile(join(aiAgentSkill, "SKILL.md"), "utf8")).toContain("name: repzo-ai-agents");
			expect(await readFile(join(agentSkill, "SKILL.md"), "utf8")).toContain(
				"name: repzo-workstation",
			);
			await expect(
				access(join(agentSkill, "references", "api.md")),
			).resolves.toBeUndefined();
			expect(
				await readFile(join(sharedSkill, ".installed-version"), "utf8"),
			).toBe(`${packageVersion}\n`);
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
		for (const agentHome of [codexHome, claudeHome])
			await expect(
				access(join(agentHome, "skills", "repzo-ai-agents", "SKILL.md")),
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
		).toBe(`${packageVersion}\n`);
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
				expect.objectContaining({ name: "Agent skill (repzo-ai-agents shared)", ok: true }),
				expect.objectContaining({ name: "Agent skill (repzo-ai-agents codex)", ok: true }),
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
		let mutationIdempotencyKey: string | undefined;
		let mutationIfMatch: string | undefined;
		let bulkCalls: Array<{ body: unknown; key: string | undefined }> = [];
		const chatCalls: Array<{ path: string; body: unknown }> = [];
		const mergeCalls: Array<{ path: string; body: unknown }> = [];
		const sendEventCalls: Array<{ path: string; body: unknown; key: string | undefined; query: unknown }> = [];
		beforeAll(async () => {
			const app = express();
			app.use(express.json());
			app.post(["/api/v1/accounts/merge", "/api/v1/accounts/merge/preview"], (req, res) => {
				mergeCalls.push({ path: req.path, body: req.body });
				res.json({
					preview: req.path.endsWith("/preview"), primaryId: "acct-1", mergedIds: ["acct-2"],
					record: { id: "acct-1", name: "Acme" }, sources: { properties: {}, customProperties: {} },
					movedRecords: { contacts: 2 }, versions: { "acct-1": "v1", "acct-2": "v2" },
				});
			});
			app.post("/api/v1/contacts/bulk-update", (req, res) => {
				bulkCalls.push({ body: req.body, key: req.get("Idempotency-Key") });
				res.json({ total: 2, succeeded: 1, failed: 1, results: [
					{ id: "contact-1", success: true },
					{ id: "contact-2", success: false, error: "Permission denied" },
				] });
			});
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
				res.setHeader("ETag", req.params.id === "weak-etag" ? 'W/"contact-version-1"' : '"contact-version-1"');
				res.json({ data: { id: req.params.id, name: "Maya" } });
			});
			app.patch("/api/v1/contacts/:id", (req, res) => {
				mutationIfMatch = req.get("If-Match");
				res.json({ id: req.params.id, name: "Updated" });
			});
			app.post("/api/v1/contacts", (req, res) => {
				mutationCalls += 1;
				mutationIdempotencyKey = req.get("Idempotency-Key");
				res
					.status(503)
					.json({ error: { code: "unavailable", message: "Try later" } });
			});
			app.post("/api/v1/chat/channels/:id/ephemeral", (req, res) => {
				chatCalls.push({ path: req.path, body: req.body });
				res.status(201).json({
					id: "ephemeral-1", channelId: req.params.id, userId: req.body.userId,
					parentMessageId: null, createdAt: "2026-10-12T00:00:00.000Z",
					warnings: ["blocks[1]: unsupported element skipped"],
				});
			});
			app.post("/api/v1/chat/views/update", (req, res) => {
				chatCalls.push({ path: req.path, body: req.body });
				res.status(409).json({
					error: { code: "conflict", message: "The view changed since this hash.", details: { slackError: "hash_conflict" } },
				});
			});
			app.delete("/api/v1/chat/messages/:id", (req, res) => {
				chatCalls.push({ path: req.path, body: undefined });
				res.status(204).end();
			});
			app.post("/api/v1/send/events/batch", (req, res) => {
				sendEventCalls.push({ path: req.path, body: req.body, key: req.get("Idempotency-Key"), query: {} });
				res.json({
					recorded: 1, duplicates: 1, rejected: 1,
					results: [
						{ index: 0, status: "recorded", id: "event-1" },
						{ index: 1, status: "duplicate" },
						{ index: 2, status: "rejected", code: "no_match", message: "No contact matches." },
					],
				});
			});
			app.post("/api/v1/send/events", (req, res) => {
				sendEventCalls.push({ path: req.path, body: req.body, key: req.get("Idempotency-Key"), query: {} });
				if (req.body.dedupeKey === "seen") {
					res.json({ id: null, ok: true, duplicate: true });
					return;
				}
				if (!req.body.email) {
					res.status(422).json({ error: { code: "no_match", message: "No contact matches this event." } });
					return;
				}
				res.status(201).json({ id: "event-2", ok: true, duplicate: false });
			});
			app.get("/api/v1/send/events", (req, res) => {
				sendEventCalls.push({ path: req.path, body: undefined, key: undefined, query: req.query });
				res.json({
					data: [{ id: "event-1", name: "plan_upgraded", objectType: "contact" }],
					meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
				});
			});
			app.get("/api/v1/send/event-types", (_req, res) => {
				res.json({
					data: [{ id: "type-uuid-1", name: "plan_upgraded", origin: "manual", primaryObject: "contact" }],
					meta: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
				});
			});
			app.post("/api/v1/reports/execute", (_req, res) => {
				res.json({ data: [{ total: 3 }] });
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
		it("previews merges without confirmation and requires --yes to merge", async () => {
			const env = { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" };
			const body = { primaryId: "acct-1", mergeIds: ["acct-2"] };
			const preview = await runCli(["accounts", "merge", "preview", "--data", JSON.stringify(body)], { env });
			expect(preview.code).toBe(0);
			expect(mergeCalls.at(-1)).toEqual({ path: "/api/v1/accounts/merge/preview", body });
			expect(JSON.parse(preview.stdout)).toMatchObject({
				ok: true,
				summary: "Merge preview: 1 record(s) into acct-1; nothing was saved",
				data: { preview: true, versions: { "acct-1": "v1", "acct-2": "v2" } },
			});

			const calls = mergeCalls.length;
			const merge = ["accounts", "merge", "--data", JSON.stringify({ ...body, versions: { "acct-1": "v1", "acct-2": "v2" } })];
			expect((await runCli(merge, { env })).code).toBe(1);
			expect(mergeCalls).toHaveLength(calls);
			const merged = await runCli([...merge, "--yes"], { env });
			expect(merged.code).toBe(0);
			expect(mergeCalls.at(-1)?.path).toBe("/api/v1/accounts/merge");
			const output = JSON.parse(merged.stdout);
			expect(output.summary).toBe("Merged 1 record(s) into acct-1");
			expect(output.breadcrumbs).toContainEqual(expect.objectContaining({ cmd: "repzo accounts get acct-1" }));
		});

		it("requires confirmation and preserves bulk partial failures and verification breadcrumbs", async () => {
			const body = { ids: ["contact-1", "contact-2"], updates: { rating: "warm" } };
			const args = ["contacts", "bulk-update", "--data", JSON.stringify(body), "--idempotency-key", "bulk-batch-1"];
			const env = { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" };
			const before = bulkCalls.length;
			expect((await runCli(args, { env })).code).toBe(1);
			expect((await runCli([...args, "--dry-run"], { env })).code).toBe(0);
			expect(bulkCalls).toHaveLength(before);
			const result = await runCli([...args, "--yes"], { env });
			expect(result.code).toBe(0);
			expect(bulkCalls.at(-1)).toEqual({ body, key: "bulk-batch-1" });
			expect(JSON.parse(result.stdout)).toMatchObject({
				ok: true, summary: "1/2 records updated; 1 failed",
				data: { total: 2, succeeded: 1, failed: 1, results: expect.arrayContaining([
					{ id: "contact-2", success: false, error: "Permission denied" },
				]) },
				breadcrumbs: expect.arrayContaining([expect.objectContaining({ cmd: "repzo contacts get contact-1" })]),
			});
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

		it.each(["contact-1", "weak-etag"])("surfaces strong meta.etag and reuses it on guarded writes (%s)", async (id) => {
			const read = await runCli(["contacts", "get", id], {
				env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" },
			});
			expect(JSON.parse(read.stdout)).toMatchObject({ meta: { etag: '"contact-version-1"' } });
			mutationIfMatch = undefined;
			const write = await runCli([
				"contacts", "update", id, "--data", '{"firstName":"Updated"}', "--yes", "--if-match", JSON.parse(read.stdout).meta.etag,
			], { env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } });
			expect(write.code).toBe(0);
			expect(mutationIfMatch).toBe('"contact-version-1"');
		});

		it.each([
			['W/"contact-version-1"', '"contact-version-1"'],
			[' "stale", W/"older",  W/"contact-version-1" ', '"stale", "older", "contact-version-1"'],
			['*', '*'],
		])("normalizes If-Match %s in both previews and requests", async (ifMatch, expected) => {
			const env = { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" };
			const args = ["contacts", "update", "contact-1", "--data", '{"firstName":"Updated"}', "--if-match", ifMatch];
			const preview = await runCli([...args, "--dry-run"], { env });
			expect(preview.code).toBe(0);
			expect(JSON.parse(preview.stdout)).toMatchObject({ data: { ifMatch: expected } });
			mutationIfMatch = undefined;
			const write = await runCli([...args, "--yes"], { env });
			expect(write.code).toBe(0);
			expect(mutationIfMatch).toBe(expected);
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
			mutationIdempotencyKey = undefined;
			const result = await runCli(
				["contacts", "create", "--data", '{"firstName":"Maya"}', "--yes", "--idempotency-key", "contact-create-maya-1"],
				{ env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } },
			);
			expect(result.code).toBe(7);
			expect(mutationCalls).toBe(1);
			expect(mutationIdempotencyKey).toBe("contact-create-maya-1");
		});

		it("sends Chat ephemeral, view, and delete mutations with structured results", async () => {
			const env = { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" };
			const before = chatCalls.length;
			const ephemeralBody = { userId: "user-1", body: "Only you", blocks: [{ type: "section", text: { type: "mrkdwn", text: "Only *you*" } }] };
			const unconfirmed = await runCli(["chat", "ephemeral", "send", "channel-1", "--data", JSON.stringify(ephemeralBody)], { env });
			expect(unconfirmed.code).toBe(1);
			expect(chatCalls).toHaveLength(before);

			const ephemeral = await runCli(["chat", "ephemeral", "send", "channel-1", "--data", JSON.stringify(ephemeralBody), "--yes"], { env });
			expect(ephemeral.code).toBe(0);
			expect(chatCalls.at(-1)).toEqual({ path: "/api/v1/chat/channels/channel-1/ephemeral", body: ephemeralBody });
			expect(JSON.parse(ephemeral.stdout).data).toMatchObject({
				id: "ephemeral-1", userId: "user-1", warnings: ["blocks[1]: unsupported element skipped"],
			});

			const stale = await runCli([
				"chat", "views", "update", "--data", JSON.stringify({ view_id: "view-1", hash: "old", view: { type: "modal", blocks: [] } }), "--yes", "--no-retry",
			], { env });
			expect(stale.code).toBe(7);
			expect(JSON.parse(stale.stderr)).toMatchObject({
				ok: false,
				error: { status: 409, details: { slackError: "hash_conflict" } },
			});

			const deleted = await runCli(["chat", "messages", "delete", "message-1", "--yes"], { env });
			expect(deleted.code).toBe(0);
			expect(chatCalls.at(-1)).toEqual({ path: "/api/v1/chat/messages/message-1", body: undefined });
			expect(JSON.parse(deleted.stdout)).toMatchObject({ ok: true, data: { status: 204 } });
		});

		it("records Send events and reports per-event batch results", async () => {
			const env = { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" };
			const batch = { events: [
				{ name: "signup_completed", email: "maya@example.com", dedupeKey: "signup-1" },
				{ name: "signup_completed", email: "omar@example.com", dedupeKey: "signup-2" },
				{ name: "signup_completed", email: "nobody@example.com", dedupeKey: "signup-3" },
			] };
			const args = ["send", "events", "batch", "--data", JSON.stringify(batch), "--idempotency-key", "signup-batch-1"];
			const before = sendEventCalls.length;
			expect((await runCli(args, { env })).code).toBe(1);
			expect(sendEventCalls).toHaveLength(before);

			const result = await runCli([...args, "--yes"], { env });
			expect(result.code).toBe(0);
			expect(sendEventCalls.at(-1)).toMatchObject({ path: "/api/v1/send/events/batch", body: batch, key: "signup-batch-1" });
			expect(JSON.parse(result.stdout)).toMatchObject({
				ok: true,
				summary: "1 recorded, 1 duplicate, 1 rejected of 3 events",
				data: { rejected: 1, results: expect.arrayContaining([
					{ index: 2, status: "rejected", code: "no_match", message: "No contact matches." },
				]) },
				breadcrumbs: expect.arrayContaining([
					expect.objectContaining({ cmd: "repzo send events get event-1" }),
					expect.objectContaining({ cmd: "repzo send events list" }),
				]),
			});

			const recorded = await runCli(["send", "event", "--data", '{"name":"plan_upgraded","email":"maya@example.com"}', "--yes"], { env });
			expect(recorded.code).toBe(0);
			expect(JSON.parse(recorded.stdout)).toMatchObject({
				summary: "Event recorded",
				data: { id: "event-2", duplicate: false },
				breadcrumbs: [expect.objectContaining({ cmd: "repzo send events get event-2" })],
			});

			const duplicate = await runCli(["send", "events", "record", "--data", '{"name":"plan_upgraded","email":"maya@example.com","dedupeKey":"seen"}', "--yes"], { env });
			expect(duplicate.code).toBe(0);
			expect(JSON.parse(duplicate.stdout)).toMatchObject({
				summary: expect.stringContaining("Duplicate"),
				data: { id: null, duplicate: true },
				meta: { command: "repzo send events record" },
			});

			const rejected = await runCli(["send", "event", "--data", '{"name":"plan_upgraded"}', "--yes"], { env });
			expect(rejected.code).toBe(7);
			expect(JSON.parse(rejected.stderr)).toMatchObject({
				ok: false, error: { status: 422, message: "No contact matches this event." },
			});
		});

		it("lists Send events with filters and links event types by name", async () => {
			const env = { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" };
			const events = await runCli(["send", "events", "list", "--query", "name=plan_upgraded", "--query", "occurredAfter=2026-10-01T00:00:00Z"], { env });
			expect(events.code).toBe(0);
			expect(sendEventCalls.at(-1)?.query).toMatchObject({ name: "plan_upgraded", occurredAfter: "2026-10-01T00:00:00Z" });
			expect(JSON.parse(events.stdout).breadcrumbs).toContainEqual(expect.objectContaining({ cmd: "repzo send events get event-1" }));

			const types = await runCli(["send", "event-types", "list"], { env });
			expect(types.code).toBe(0);
			expect(JSON.parse(types.stdout).breadcrumbs).toContainEqual(expect.objectContaining({ cmd: "repzo send event-types get plan_upgraded" }));
		});

		it("executes read-only POST commands without mutation confirmation", async () => {
			const result = await runCli(
				["reports", "execute", "--data", '{"entity":"deals"}'],
				{ env: { REPZO_BASE_URL: baseUrl, REPZO_TOKEN: "foxa-test" } },
			);
			expect(result.code).toBe(0);
			expect(JSON.parse(result.stdout)).toMatchObject({ data: [{ total: 3 }] });
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
