#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
	access,
	chmod,
	cp,
	lstat,
	mkdir,
	readFile,
	readdir,
	realpath,
	rename,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import http from "node:http";
import { homedir, hostname } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { EMBEDDED_SKILL_FILES } from "../lib/embedded-skill.generated.mjs";
import { setMacOSKeychainCredential } from "../lib/macos-keychain.mjs";

const execFileAsync = promisify(execFile);
const CLI_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RELEASE_REPOSITORY = "Repzo/repzo-cli";
const RELEASE_TAG_PREFIX = "v";
const RELEASE_SIGNING_REPOSITORY = "Repzo/repzo-cli";
const RELEASE_SIGNING_WORKFLOW = "release.yml";
const RELEASE_SIGNING_TAG_PREFIX = "v";
const SKILL_NAME = "repzo-workstation";
const SKILL_VERSION_FILE = ".installed-version";
const SKILL_MANAGED_FILE = ".repzo-managed";
const COMPILED_VERSION =
	typeof REPZO_CLI_VERSION === "string" ? REPZO_CLI_VERSION : null;
const STANDALONE_BUILD =
	typeof REPZO_STANDALONE === "boolean" && REPZO_STANDALONE;
const DEFAULT_ORIGIN = "https://workstation.repzo.com";
const CONFIG_DIR =
	process.env.REPZO_CONFIG_DIR ||
	join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "repzo");
const PROFILE_FILE = join(CONFIG_DIR, "profiles.json");
const SECRET_FILE = join(CONFIG_DIR, "credentials.json");
const KEYCHAIN_SERVICE = "com.repzo.workstation.cli";
const CLI_OAUTH_CLIENT_ID = "repzo-cli";
const CLI_OAUTH_CALLBACK_PATH = "/oauth/callback";
const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const EXIT_CODES = Object.freeze({
	usage: 1,
	not_found: 2,
	auth: 3,
	forbidden: 4,
	rate_limit: 5,
	network: 6,
	api: 7,
	ambiguous: 8,
});
const EXIT_CODE_HELP = Object.freeze({
	0: "success",
	1: "usage",
	2: "not_found",
	3: "auth",
	4: "forbidden",
	5: "rate_limit",
	6: "network",
	7: "api",
	8: "ambiguous",
});
const GLOBAL_FLAGS = Object.freeze([
	{ name: "--profile", type: "string", description: "Use a named profile." },
	{
		name: "--no-browser",
		type: "boolean",
		description: "Print the login URL instead of opening it.",
	},
	{
		name: "--query",
		type: "key=value",
		repeatable: true,
		description: "Add a query parameter.",
	},
	{ name: "--page", type: "number", description: "Fetch one offset page." },
	{
		name: "--limit",
		type: "number",
		description: "Limit the response page size.",
	},
	{ name: "--all", type: "boolean", description: "Fetch all available pages." },
	{
		name: "--data",
		type: "json|@file|@-",
		description: "Supply a JSON request body.",
	},
	{
		name: "--dry-run",
		type: "boolean",
		description: "Preview a mutation without sending it.",
	},
	{
		name: "--yes",
		type: "boolean",
		description: "Confirm and send a mutation.",
	},
	{
		name: "--json",
		type: "boolean",
		description: "Return the full JSON envelope.",
	},
	{
		name: "--quiet",
		type: "boolean",
		description: "Return only response data.",
	},
	{
		name: "--agent",
		type: "boolean",
		description: "Return raw non-interactive agent output.",
	},
	{
		name: "--compact",
		type: "boolean",
		description: "Print JSON without indentation.",
	},
	{
		name: "--no-retry",
		type: "boolean",
		description: "Disable transient request retries.",
	},
]);

const AGENT_TARGETS = Object.freeze({
	codex: {
		binary: "codex",
		home: () => process.env.CODEX_HOME || join(homedir(), ".codex"),
	},
	claude: {
		binary: "claude",
		home: () => process.env.CLAUDE_HOME || join(homedir(), ".claude"),
	},
});

let SKILL_REFRESH_RESULT = null;

let OUTPUT_OPTIONS = {
	agent: process.argv.includes("--agent"),
	compact: process.argv.includes("--compact"),
	json: process.argv.includes("--json"),
	quiet: process.argv.includes("--quiet"),
};
let OUTPUT_POSITIONALS = [];
let OUTPUT_CONTEXT = null;

const CRUD_RESOURCES = [
	["accounts", "/accounts"],
	["activities", "/activities"],
	["appointments", "/appointments"],
	["campaigns", "/campaigns"],
	["carts", "/carts"],
	["contacts", "/contacts"],
	["deals", "/deals"],
	["forms", "/forms"],
	["invoices", "/invoices"],
	["line-items", "/line-items"],
	["orders", "/orders"],
	["price-offers", "/price-offers"],
	["products", "/products"],
	["projects", "/projects"],
	["request-types", "/request-types"],
	["requests", "/requests"],
	["segments", "/segments"],
	["tags", "/tags"],
	["tickets", "/tickets"],
	["collections", "/content/collections"],
	["articles", "/content/articles"],
];

const COMMANDS = [];
function command(tokens, method, path, description, options = {}) {
	COMMANDS.push({ tokens, method, path, description, ...options });
}
for (const [resource, path] of CRUD_RESOURCES) {
	command([resource, "list"], "GET", path, `List ${resource}.`, {
		pagination: "offset",
	});
	command(
		[resource, "get"],
		"GET",
		`${path}/{id}`,
		`Get one ${resource} record.`,
		{ args: ["id"] },
	);
	command([resource, "create"], "POST", path, `Create a ${resource} record.`, {
		body: true,
	});
	command(
		[resource, "update"],
		"PATCH",
		`${path}/{id}`,
		`Update a ${resource} record.`,
		{ args: ["id"], body: true },
	);
	command(
		[resource, "delete"],
		"DELETE",
		`${path}/{id}`,
		`Delete a ${resource} record.`,
		{ args: ["id"] },
	);
}

command(["pipelines", "list"], "GET", "/pipelines", "List pipelines.", {
	pagination: "offset",
});
command(["pipelines", "get"], "GET", "/pipelines/{id}", "Get a pipeline.", {
	args: ["id"],
});
command(["pipelines", "create"], "POST", "/pipelines", "Create a pipeline.", {
	body: true,
});
command(
	["pipelines", "update"],
	"PATCH",
	"/pipelines/{id}",
	"Update a pipeline.",
	{ args: ["id"], body: true },
);
command(
	["pipelines", "delete"],
	"DELETE",
	"/pipelines/{id}",
	"Delete a pipeline.",
	{ args: ["id"] },
);
for (const [verb, method] of [
	["list", "GET"],
	["create", "POST"],
])
	command(
		["pipelines", "stages", verb],
		method,
		"/pipelines/{pipelineId}/stages",
		`${verb === "list" ? "List" : "Create"} pipeline stages.`,
		{ args: ["pipelineId"], body: method === "POST" },
	);
for (const [verb, method] of [
	["get", "GET"],
	["update", "PATCH"],
	["delete", "DELETE"],
])
	command(
		["pipelines", "stages", verb],
		method,
		"/pipelines/{pipelineId}/stages/{stageId}",
		`${verb[0].toUpperCase()}${verb.slice(1)} a pipeline stage.`,
		{ args: ["pipelineId", "stageId"], body: method === "PATCH" },
	);

for (const [verb, method] of [
	["list", "GET"],
	["create", "POST"],
])
	command(
		["reports", verb],
		method,
		"/reports",
		`${verb === "list" ? "List" : "Create"} saved reports.`,
		{
			body: method === "POST",
			pagination: method === "GET" ? "offset" : undefined,
		},
	);
for (const [verb, method] of [
	["get", "GET"],
	["update", "PATCH"],
	["delete", "DELETE"],
])
	command(
		["reports", verb],
		method,
		"/reports/{id}",
		`${verb[0].toUpperCase()}${verb.slice(1)} a saved report.`,
		{ args: ["id"], body: method === "PATCH" },
	);
command(
	["reports", "execute"],
	"POST",
	"/reports/execute",
	"Execute a validated aggregate report.",
	{ body: true },
);
command(
	["reports", "categories"],
	"GET",
	"/reports/categories",
	"List report categories.",
);
command(
	["reports", "filter-values"],
	"GET",
	"/reports/filter-values",
	"List values for a report filter.",
);

for (const [verb, method] of [
	["list", "GET"],
	["create", "POST"],
])
	command(
		["inbox", "inboxes", verb],
		method,
		"/inbox/inboxes",
		`${verb === "list" ? "List" : "Create"} inboxes.`,
		{
			body: method === "POST",
			pagination: method === "GET" ? "offset" : undefined,
		},
	);
for (const [verb, method] of [
	["get", "GET"],
	["update", "PATCH"],
	["delete", "DELETE"],
])
	command(
		["inbox", "inboxes", verb],
		method,
		"/inbox/inboxes/{id}",
		`${verb[0].toUpperCase()}${verb.slice(1)} an inbox.`,
		{ args: ["id"], body: method === "PATCH" },
	);
for (const [verb, method] of [
	["list", "GET"],
	["create", "POST"],
])
	command(
		["inbox", "conversations", verb],
		method,
		"/inbox/conversations",
		`${verb === "list" ? "List" : "Create"} conversations.`,
		{
			body: method === "POST",
			pagination: method === "GET" ? "offset" : undefined,
		},
	);
for (const [verb, method] of [
	["get", "GET"],
	["update", "PATCH"],
])
	command(
		["inbox", "conversations", verb],
		method,
		"/inbox/conversations/{id}",
		`${verb[0].toUpperCase()}${verb.slice(1)} a conversation.`,
		{ args: ["id"], body: method === "PATCH" },
	);
for (const action of ["assign", "snooze", "reply", "note"])
	command(
		["inbox", "conversations", action],
		"POST",
		`/inbox/conversations/{id}/${action === "note" ? "notes" : action}`,
		`${action[0].toUpperCase()}${action.slice(1)} on a conversation.`,
		{ args: ["id"], body: true },
	);
for (const action of ["close", "reopen"])
	command(
		["inbox", "conversations", action],
		"POST",
		`/inbox/conversations/{id}/${action}`,
		`${action[0].toUpperCase()}${action.slice(1)} a conversation.`,
		{ args: ["id"] },
	);
command(
	["inbox", "conversations", "messages"],
	"GET",
	"/inbox/conversations/{id}/messages",
	"List conversation messages.",
	{ args: ["id"], pagination: "cursor" },
);

command(
	["chat", "channels", "list"],
	"GET",
	"/chat/channels",
	"List visible chat channels.",
	{ pagination: "offset" },
);
command(
	["chat", "channels", "get"],
	"GET",
	"/chat/channels/{id}",
	"Get a chat channel.",
	{ args: ["id"] },
);
command(
	["chat", "messages", "list"],
	"GET",
	"/chat/channels/{channelId}/messages",
	"List channel messages.",
	{ args: ["channelId"], pagination: "cursor" },
);
command(
	["chat", "send"],
	"POST",
	"/chat/channels/{channelId}/messages",
	"Send a channel message.",
	{ args: ["channelId"], body: true },
);
command(
	["chat", "messages", "update"],
	"PATCH",
	"/chat/messages/{id}",
	"Edit a chat message.",
	{ args: ["id"], body: true },
);
command(
	["chat", "messages", "delete"],
	"DELETE",
	"/chat/messages/{id}",
	"Delete a chat message.",
	{ args: ["id"] },
);

for (const [verb, method] of [
	["list", "GET"],
	["place", "POST"],
])
	command(
		["voice", "calls", verb],
		method,
		"/voice/calls",
		`${verb === "list" ? "List" : "Place"} voice calls.`,
		{
			body: method === "POST",
			pagination: method === "GET" ? "offset" : undefined,
		},
	);
command(
	["voice", "calls", "get"],
	"GET",
	"/voice/calls/{id}",
	"Get a voice call.",
	{ args: ["id"] },
);
command(
	["voice", "channels"],
	"GET",
	"/voice/channels",
	"List voice channels.",
);
command(
	["voice", "analytics"],
	"GET",
	"/voice/analytics",
	"Get voice analytics.",
);

for (const [verb, method] of [
	["list", "GET"],
	["create", "POST"],
])
	command(
		["events", "subscriptions", verb],
		method,
		"/events/subscriptions",
		`${verb === "list" ? "List" : "Create"} event subscriptions.`,
		{
			body: method === "POST",
			pagination: method === "GET" ? "offset" : undefined,
		},
	);
for (const [verb, method] of [
	["get", "GET"],
	["update", "PATCH"],
	["delete", "DELETE"],
])
	command(
		["events", "subscriptions", verb],
		method,
		"/events/subscriptions/{id}",
		`${verb[0].toUpperCase()}${verb.slice(1)} an event subscription.`,
		{ args: ["id"], body: method === "PATCH" },
	);
command(
	["events", "types"],
	"GET",
	"/events/types",
	"List subscribable event types.",
);

command(
	["send", "campaigns", "list"],
	"GET",
	"/send/campaigns",
	"List Send campaigns.",
	{ pagination: "offset" },
);
command(
	["send", "campaigns", "get"],
	"GET",
	"/send/campaigns/{id}",
	"Get a Send campaign.",
	{ args: ["id"] },
);
command(
	["send", "transactional"],
	"POST",
	"/send/transactional",
	"Send a transactional message.",
	{ body: true },
);
command(["send", "system"], "POST", "/send/system", "Send a system message.", {
	body: true,
});
command(["send", "event"], "POST", "/send/events", "Record a Send event.", {
	body: true,
});
command(
	["send", "opt-out"],
	"POST",
	"/send/subscriptions/opt-out",
	"Opt a contact out of a subscription type.",
	{ body: true },
);

command(
	["associations", "list"],
	"GET",
	"/associations",
	"List associations for an activity or email.",
);
command(
	["associations", "by-entity"],
	"GET",
	"/associations/by-entity",
	"List records associated with a CRM entity.",
);
command(
	["associations", "replace"],
	"POST",
	"/associations",
	"Replace all associations for an activity or email.",
	{ body: true },
);
command(
	["tags", "entity", "list"],
	"GET",
	"/tags/entities/{entityType}/{entityId}",
	"List tags on an entity.",
	{ args: ["entityType", "entityId"] },
);
command(
	["tags", "entity", "replace"],
	"PUT",
	"/tags/entities/{entityType}/{entityId}",
	"Replace tags on an entity.",
	{ args: ["entityType", "entityId"], body: true },
);
command(
	["segments", "evaluate"],
	"POST",
	"/segments/{id}/evaluate",
	"Evaluate a segment and refresh its count.",
	{ args: ["id"] },
);
command(
	["forms", "publish"],
	"POST",
	"/forms/{id}/publish",
	"Publish a form.",
	{ args: ["id"] },
);
command(
	["forms", "archive"],
	"POST",
	"/forms/{id}/archive",
	"Archive a form.",
	{ args: ["id"] },
);
for (const action of ["submit", "approve"])
	command(
		["requests", action],
		"POST",
		`/requests/{id}/${action}`,
		`${action[0].toUpperCase()}${action.slice(1)} a request.`,
		{ args: ["id"] },
	);
command(
	["requests", "reject"],
	"POST",
	"/requests/{id}/reject",
	"Reject a request with a reason.",
	{ args: ["id"], body: true },
);
for (const action of ["publish", "unpublish", "archive"])
	command(
		["articles", action],
		"POST",
		`/content/articles/{id}/${action}`,
		`${action[0].toUpperCase()}${action.slice(1)} an article.`,
		{ args: ["id"] },
	);
command(["imports", "list"], "GET", "/data/imports", "List import jobs.", {
	pagination: "offset",
});
command(["imports", "get"], "GET", "/data/imports/{id}", "Get an import job.", {
	args: ["id"],
});
command(
	["exports", "create"],
	"POST",
	"/data/exports",
	"Create an export job.",
	{ body: true },
);
command(["exports", "list"], "GET", "/data/exports", "List export jobs.", {
	pagination: "offset",
});
command(["exports", "get"], "GET", "/data/exports/{id}", "Get an export job.", {
	args: ["id"],
});

const HELP = `repzo — agent-friendly CLI for the Repzo Workstation public API

Usage:
  repzo <resource> <action> [ids...] [options]
  repzo inbox conversations reply CONVERSATION_ID --data @reply.json --dry-run
  repzo chat send CHANNEL_ID --data '{"body":"Hello","bodyFormat":"plain"}' --dry-run
  repzo reports execute --data @report.json --yes
  repzo commands --json
  repzo auth login [--profile NAME]
  repzo auth login --token-stdin [--profile NAME]
  repzo setup agents|codex|claude [--force]
  repzo doctor | completion <bash|zsh|fish> | upgrade [--yes]

Common options:
  --profile NAME          Use a named profile
  --no-browser            Print the browser-login URL instead of opening it
  --query key=value       Repeatable query parameter
  --page N --limit N      Page controls (API maximum is 200)
  --all                   Fetch every offset/cursor page
  --data JSON|@file|@-    Request body
  --dry-run               Print a mutation without sending it
  --yes                   Confirm a mutation
  --quiet                 Print only the response data
  --agent                 Print raw data and disable human-oriented envelopes
  --compact               Print compact JSON
  --agent --help          Return machine-readable help

REPZO_TOKEN and REPZO_BASE_URL override the selected profile. Browser login is the default; use --token-stdin for a Developer App key or CI. Tokens are never accepted as argv values.`;

function writeJson(stream, value, compact = OUTPUT_OPTIONS.compact) {
	stream.write(`${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
}

class CliFailure extends Error {
	constructor(payload, exitCode) {
		super(payload.error.message);
		this.payload = payload;
		this.exitCode = exitCode;
	}
}

function fail(message, options = {}) {
	const normalized =
		typeof options === "number" ? { exitCode: options } : options;
	const exitCode = normalized.exitCode || EXIT_CODES.usage;
	const code =
		normalized.code ||
		Object.entries(EXIT_CODES).find(([, value]) => value === exitCode)?.[0] ||
		"usage";
	throw new CliFailure(
		{
			ok: false,
			error: {
				code,
				message,
				...(normalized.hint ? { hint: normalized.hint } : {}),
				retryable: Boolean(normalized.retryable),
				...(normalized.status ? { status: normalized.status } : {}),
				...(normalized.details !== undefined
					? { details: normalized.details }
					: {}),
			},
		},
		exitCode,
	);
}

function withoutSuccessFlag(value) {
	if (
		value &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		value.ok === true
	) {
		const { ok: _ok, ...rest } = value;
		return rest;
	}
	return value;
}

function normalizeSuccess(value) {
	const clean = withoutSuccessFlag(value);
	if (
		clean &&
		typeof clean === "object" &&
		!Array.isArray(clean) &&
		Object.hasOwn(clean, "data")
	) {
		const { data, meta, ...rest } = clean;
		return {
			data,
			meta: {
				...(meta && typeof meta === "object" ? meta : {}),
				...(Object.keys(rest).length ? { response: rest } : {}),
			},
		};
	}
	return { data: clean, meta: {} };
}

function quoteArgument(value) {
	const text = String(value);
	return /^[A-Za-z0-9._:@/-]+$/.test(text)
		? text
		: `'${text.replaceAll("'", `'\\''`)}'`;
}

function renderCommand(item, record) {
	if (!item) return null;
	const args = (item.args || []).map((name) => {
		const known = OUTPUT_CONTEXT?.args?.[name];
		if (known !== undefined) return quoteArgument(known);
		if (record?.id !== undefined) return quoteArgument(record.id);
		return `<${name}>`;
	});
	return `repzo ${item.tokens.join(" ")}${args.length ? ` ${args.join(" ")}` : ""}`;
}

function siblingCommand(action) {
	const current = OUTPUT_CONTEXT?.item;
	if (!current) return null;
	const prefix = current.tokens.slice(0, -1);
	return COMMANDS.find(
		(item) =>
			item.tokens.length === prefix.length + 1 &&
			prefix.every((token, index) => item.tokens[index] === token) &&
			item.tokens.at(-1) === action,
	);
}

function breadcrumb(action, cmd, description) {
	return cmd ? { action, cmd, description } : null;
}

function renderNextPageCommand(item, page) {
	const parts = [renderCommand(item)];
	for (const query of OUTPUT_OPTIONS.query || [])
		parts.push("--query", quoteArgument(query));
	for (const name of ["q", "limit", "profile"])
		if (OUTPUT_OPTIONS[name] !== undefined)
			parts.push(`--${name}`, quoteArgument(OUTPUT_OPTIONS[name]));
	parts.push("--page", String(page));
	return parts.join(" ");
}

function inferBreadcrumbs(data, meta) {
	const current = OUTPUT_CONTEXT?.item;
	if (!current) {
		const first = OUTPUT_POSITIONALS[0];
		if (first === "auth")
			return [
				breadcrumb("diagnose", "repzo doctor", "Verify the active profile"),
				breadcrumb("list_profiles", "repzo profiles list", "List profiles"),
			].filter(Boolean);
		if (first === "commands")
			return [
				breadcrumb(
					"inspect_api",
					"repzo openapi --quiet",
					"Inspect the live API contract",
				),
			].filter(Boolean);
		if (first === "setup" || first === "doctor")
			return [
				breadcrumb("auth_status", "repzo auth status", "Check authentication"),
			].filter(Boolean);
		return [];
	}

	const action = current.tokens.at(-1);
	const records = Array.isArray(data) ? data : [data];
	const get = siblingCommand("get");
	const list = siblingCommand("list");
	const breadcrumbs = [];
	if (action === "list" && get) {
		for (const record of records.slice(0, 3)) {
			if (!record || typeof record !== "object" || !record.id) continue;
			breadcrumbs.push(
				breadcrumb(
					"get",
					renderCommand(get, record),
					`Get ${record.name || record.title || record.id}`,
				),
			);
		}
	}
	const record =
		!Array.isArray(data) && data && typeof data === "object" ? data : null;
	if (!["delete", "get"].includes(action) && record?.id && get)
		breadcrumbs.push(
			breadcrumb(
				"get",
				renderCommand(get, record),
				"Read the resulting record",
			),
		);
	if (action !== "list" && list)
		breadcrumbs.push(
			breadcrumb("list", renderCommand(list), "Return to the resource list"),
		);
	if (meta?.hasNextPage && meta.page)
		breadcrumbs.push(
			breadcrumb(
				"next_page",
				renderNextPageCommand(current, Number(meta.page) + 1),
				"Fetch the next page",
			),
		);
	return breadcrumbs.filter(Boolean);
}

function inferSummary(data) {
	if (Array.isArray(data))
		return `${data.length} result${data.length === 1 ? "" : "s"}`;
	if (data?.commands && Array.isArray(data.commands))
		return `${data.commands.length} commands`;
	if (data?.profiles && Array.isArray(data.profiles))
		return `${data.profiles.length} profiles`;
	if (data?.checks && Array.isArray(data.checks)) {
		const passed = data.checks.filter((check) => check.ok).length;
		return `${passed}/${data.checks.length} checks passed`;
	}
	if (data?.dryRun) return `${data.method} request previewed; nothing was sent`;
	return (
		OUTPUT_CONTEXT?.item?.description?.replace(/\.$/, "") || "Command completed"
	);
}

function json(value, compact = OUTPUT_OPTIONS.compact, presentation = {}) {
	const { data, meta } = normalizeSuccess(value);
	if (
		OUTPUT_OPTIONS.quiet ||
		(OUTPUT_OPTIONS.agent && !presentation.envelope)
	) {
		writeJson(process.stdout, data, compact);
		return;
	}
	const command = OUTPUT_POSITIONALS.length
		? `repzo ${OUTPUT_POSITIONALS.map(quoteArgument).join(" ")}`
		: "repzo";
	writeJson(
		process.stdout,
		{
			ok: presentation.ok ?? true,
			data,
			summary: presentation.summary || inferSummary(data),
			breadcrumbs: presentation.breadcrumbs || inferBreadcrumbs(data, meta),
			meta: { ...meta, command },
		},
		compact,
	);
}
function sleep(ms) {
	return new Promise((done) => setTimeout(done, ms));
}
function exists(path) {
	return access(path, fsConstants.F_OK).then(
		() => true,
		() => false,
	);
}

function parseArgs(argv) {
	const positionals = [];
	const options = { query: [] };
	const flags = new Set([
		"yes",
		"dry-run",
		"compact",
		"quiet",
		"help",
		"agent",
		"json",
		"all",
		"force",
		"token-stdin",
		"no-retry",
		"no-browser",
		"version",
	]);
	const values = new Set([
		"base-url",
		"cursor",
		"data",
		"limit",
		"page",
		"profile",
		"q",
		"query",
	]);
	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (!value.startsWith("--")) {
			positionals.push(value);
			continue;
		}
		const equalsAt = value.indexOf("=");
		const name = value.slice(2, equalsAt < 0 ? undefined : equalsAt);
		if (name === "token")
			fail(
				"For safety, tokens cannot be passed on the command line. Use auth login interactively or --token-stdin.",
			);
		if (flags.has(name)) {
			options[name] = true;
			continue;
		}
		if (!values.has(name))
			fail(`Unknown option: --${name}`, {
				hint: "Run repzo --help or use --agent --help for machine-readable discovery.",
			});
		const next = equalsAt < 0 ? argv[index + 1] : value.slice(equalsAt + 1);
		if (next === undefined || (equalsAt < 0 && next.startsWith("--")))
			fail(`Missing value for --${name}`);
		if (equalsAt < 0) index += 1;
		if (name === "query") options.query.push(next);
		else options[name] = next;
	}
	return { positionals, options };
}

async function readJson(path, fallback) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return fallback;
		fail(`Could not read ${path}: ${error.message}`);
	}
}
async function writePrivateJson(path, value) {
	await mkdir(dirname(path), { recursive: true, mode: 0o700 });
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
		mode: 0o600,
	});
	await chmod(temporary, 0o600);
	await rename(temporary, path);
}
async function loadProfiles() {
	return readJson(PROFILE_FILE, { defaultProfile: "default", profiles: {} });
}
async function saveProfiles(config) {
	await writePrivateJson(PROFILE_FILE, config);
}

async function keychain(action, profile, token) {
	if (
		process.platform !== "darwin" ||
		process.env.REPZO_CREDENTIAL_BACKEND === "file"
	)
		return null;
	try {
		if (action === "get")
			return (
				await execFileAsync("security", [
					"find-generic-password",
					"-s",
					KEYCHAIN_SERVICE,
					"-a",
					profile,
					"-w",
				])
			).stdout.trim();
		if (action === "set") {
			await setMacOSKeychainCredential(KEYCHAIN_SERVICE, profile, token);
			return true;
		}
		if (action === "delete") {
			await execFileAsync("security", [
				"delete-generic-password",
				"-s",
				KEYCHAIN_SERVICE,
				"-a",
				profile,
			]);
			return true;
		}
	} catch {
		return null;
	}
	return null;
}
async function getCredential(profile) {
	const stored = await keychain("get", profile);
	if (stored) return stored;
	return (await readJson(SECRET_FILE, {}))[profile];
}
async function setCredential(profile, token) {
	if (await keychain("set", profile, token)) {
		const secrets = await readJson(SECRET_FILE, {});
		if (profile in secrets) {
			delete secrets[profile];
			await writePrivateJson(SECRET_FILE, secrets);
		}
		return "macOS Keychain";
	}
	const secrets = await readJson(SECRET_FILE, {});
	secrets[profile] = token;
	await writePrivateJson(SECRET_FILE, secrets);
	return `a mode-0600 credential file at ${SECRET_FILE}`;
}
async function deleteCredential(profile) {
	await keychain("delete", profile);
	const secrets = await readJson(SECRET_FILE, {});
	if (profile in secrets) {
		delete secrets[profile];
		await writePrivateJson(SECRET_FILE, secrets);
	}
}

async function readStdin() {
	let value = "";
	process.stdin.setEncoding("utf8");
	for await (const chunk of process.stdin) value += chunk;
	return value;
}
async function readBody(source) {
	if (!source) return undefined;
	let raw;
	try {
		raw =
			source === "@-"
				? await readStdin()
				: source.startsWith("@")
					? await readFile(source.slice(1), "utf8")
					: source;
	} catch (error) {
		fail(`Could not read request body: ${error.message}`, {
			hint: "Check the @file path or pass @- to read JSON from stdin.",
		});
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		fail(`Invalid JSON body: ${error.message}`);
	}
}

function publicCommand(item) {
	const args = item.args || [];
	return {
		command: item.tokens.join(" "),
		description: item.description,
		method: item.method,
		path: item.path,
		arguments: args,
		requiresBody: Boolean(item.body),
		mutation: !["GET", "HEAD", "OPTIONS"].includes(item.method),
		pagination: item.pagination || null,
		gotchas: [
			...(!["GET", "HEAD", "OPTIONS"].includes(item.method)
				? ["Preview with --dry-run; sending requires --yes."]
				: []),
			...(item.body ? ["The request body is strict JSON."] : []),
			...(item.pagination
				? ["Use --all only when the complete set is required."]
				: []),
		],
		usage: `repzo ${item.tokens.join(" ")}${args.map((arg) => ` <${arg}>`).join("")}${item.body ? " --data <json|@file|@->" : ""}`,
	};
}
function catalog(prefix = []) {
	return COMMANDS.filter((item) =>
		prefix.every((token, index) => item.tokens[index] === token),
	).map(publicCommand);
}

function parseStoredCredential(value) {
	if (!value) return null;
	if (value.startsWith("foxa-") || value.startsWith("foxu-")) {
		return {
			type: value.startsWith("foxa-") ? "api_key" : "access_token",
			accessToken: value,
		};
	}
	try {
		const parsed = JSON.parse(value);
		if (parsed?.version === 1 && parsed?.type === "oauth" && parsed.accessToken)
			return parsed;
	} catch {
		// Legacy or corrupted credentials are reported by the normal auth checks.
	}
	return { type: "unknown", accessToken: value };
}

function serializeOAuthCredential(payload) {
	return JSON.stringify({
		version: 1,
		type: "oauth",
		accessToken: payload.access_token,
		refreshToken: payload.refresh_token,
		expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
		scopes: String(payload.scope || "")
			.split(/\s+/)
			.filter(Boolean),
	});
}

async function postOAuth(origin, path, values) {
	const oauthOrigin = origin.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
	const response = await fetch(`${oauthOrigin}${path}`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams(values),
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		fail(
			body.error_description ||
				body.error ||
				`OAuth request failed with HTTP ${response.status}.`,
			{
				code: "auth",
				exitCode: EXIT_CODES.auth,
				hint: "Run repzo auth login again.",
			},
		);
	}
	return body;
}

async function refreshOAuthCredential(profile, origin, credential) {
	if (!credential.refreshToken) return credential.accessToken;
	const payload = await postOAuth(origin, "/api/v1/oauth/token", {
		grant_type: "refresh_token",
		refresh_token: credential.refreshToken,
		client_id: CLI_OAUTH_CLIENT_ID,
	});
	await setCredential(profile, serializeOAuthCredential(payload));
	return payload.access_token;
}

async function openExternalBrowser(url) {
	const command =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "cmd"
				: "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	return new Promise((resolveOpen) => {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.once("error", () => resolveOpen(false));
		child.once("spawn", () => {
			child.unref();
			resolveOpen(true);
		});
	});
}

async function waitForOAuthCallback() {
	const state = crypto.randomBytes(24).toString("base64url");
	const verifier = crypto.randomBytes(32).toString("base64url");
	const challenge = crypto
		.createHash("sha256")
		.update(verifier)
		.digest("base64url");
	let settle;
	const callback = new Promise((resolveCallback, rejectCallback) => {
		settle = { resolve: resolveCallback, reject: rejectCallback };
	});
	const server = http.createServer((req, res) => {
		const url = new URL(req.url || "/", "http://127.0.0.1");
		if (url.pathname !== CLI_OAUTH_CALLBACK_PATH) {
			res.writeHead(404).end("Not found");
			return;
		}
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.setHeader("Cache-Control", "no-store");
		if (url.searchParams.get("state") !== state) {
			res
				.writeHead(400)
				.end(
					"<!doctype html><title>Repzo CLI</title><p>Authorization state did not match. Return to the terminal and try again.</p>",
				);
			settle.reject(new Error("Authorization state did not match."));
			return;
		}
		const error = url.searchParams.get("error");
		if (error) {
			res
				.writeHead(400)
				.end(
					"<!doctype html><title>Repzo CLI</title><p>Authorization was not completed. You can close this window.</p>",
				);
			settle.reject(
				new Error(url.searchParams.get("error_description") || error),
			);
			return;
		}
		const code = url.searchParams.get("code");
		if (!code) {
			res
				.writeHead(400)
				.end(
					"<!doctype html><title>Repzo CLI</title><p>The authorization code is missing.</p>",
				);
			settle.reject(new Error("The authorization code is missing."));
			return;
		}
		res
			.writeHead(200)
			.end(
				'<!doctype html><meta name=viewport content="width=device-width"><title>Repzo CLI authorized</title><style>body{font:16px system-ui;max-width:36rem;margin:15vh auto;padding:2rem;color:#18181b}h1{font-size:1.4rem}</style><h1>Repzo CLI is connected</h1><p>You can close this window and return to the terminal.</p>',
			);
		settle.resolve(code);
	});
	await new Promise((resolveListen, rejectListen) => {
		server.once("error", rejectListen);
		server.listen(0, "127.0.0.1", resolveListen);
	});
	const address = server.address();
	const redirectUri = `http://127.0.0.1:${address.port}${CLI_OAUTH_CALLBACK_PATH}`;
	const timeout = setTimeout(
		() => settle.reject(new Error("Authorization timed out.")),
		5 * 60 * 1000,
	);
	return {
		state,
		verifier,
		challenge,
		redirectUri,
		wait: async () => {
			try {
				return await callback;
			} finally {
				clearTimeout(timeout);
				server.close();
			}
		},
	};
}

async function browserLogin(origin, options = {}) {
	const flow = await waitForOAuthCallback();
	const authorize = new URL("/oauth/cli/authorize", origin);
	authorize.searchParams.set("response_type", "code");
	authorize.searchParams.set("client_id", CLI_OAUTH_CLIENT_ID);
	authorize.searchParams.set("redirect_uri", flow.redirectUri);
	authorize.searchParams.set("code_challenge", flow.challenge);
	authorize.searchParams.set("code_challenge_method", "S256");
	authorize.searchParams.set("state", flow.state);
	authorize.searchParams.set(
		"device_name",
		`${hostname()} (${process.platform})`,
	);
	process.stderr.write(
		`Opening ${authorize.origin} to authorize Repzo CLI...\n`,
	);
	if (
		options.open === false ||
		!(await openExternalBrowser(authorize.toString()))
	) {
		process.stderr.write(
			`Open this URL in your browser:\n${authorize.toString()}\n`,
		);
	}
	let code;
	try {
		code = await flow.wait();
	} catch (error) {
		fail(error.message, {
			code: "auth",
			exitCode: EXIT_CODES.auth,
			hint: "Run repzo auth login again.",
		});
	}
	return postOAuth(origin, "/api/v1/oauth/token", {
		grant_type: "authorization_code",
		code,
		redirect_uri: flow.redirectUri,
		client_id: CLI_OAUTH_CLIENT_ID,
		code_verifier: flow.verifier,
	});
}

async function packageVersion() {
	if (COMPILED_VERSION) return COMPILED_VERSION;
	try {
		return JSON.parse(await readFile(join(CLI_ROOT, "package.json"), "utf8"))
			.version;
	} catch {
		return "unknown";
	}
}

async function handleAuth(positionals, options) {
	const action = positionals[1] || "status";
	const config = await loadProfiles();
	const profile = String(options.profile || config.defaultProfile || "default");
	if (action === "login") {
		const baseUrl = String(
			options["base-url"] ||
				config.profiles[profile]?.baseUrl ||
				process.env.REPZO_BASE_URL ||
				DEFAULT_ORIGIN,
		).replace(/\/+$/, "");
		let storedCredential;
		let authType;
		let scopes;
		if (options["token-stdin"]) {
			const token = (await readStdin()).trim();
			if (!token.startsWith("foxa-"))
				fail("Token must be a foxa-* Developer API key.", {
					code: "auth",
					exitCode: EXIT_CODES.auth,
					hint: "Create a Developer App key in Workstation settings.",
				});
			storedCredential = token;
			authType = "developer_app";
		} else {
			const payload = await browserLogin(baseUrl, {
				open: !options["no-browser"],
			});
			storedCredential = serializeOAuthCredential(payload);
			authType = "browser";
			scopes = String(payload.scope || "")
				.split(/\s+/)
				.filter(Boolean);
		}
		const backend = await setCredential(profile, storedCredential);
		config.profiles[profile] = {
			baseUrl,
			credential: backend === "macOS Keychain" ? "keychain" : "file",
			authType,
		};
		if (!config.defaultProfile) config.defaultProfile = profile;
		await saveProfiles(config);
		json({
			ok: true,
			profile,
			baseUrl,
			authType,
			credentialStore: backend,
			...(scopes ? { scopes } : {}),
		});
		return;
	}
	if (action === "logout") {
		const baseUrl = String(
			config.profiles[profile]?.baseUrl ||
				process.env.REPZO_BASE_URL ||
				DEFAULT_ORIGIN,
		).replace(/\/+$/, "");
		const credential = parseStoredCredential(await getCredential(profile));
		if (credential?.type === "oauth") {
			await postOAuth(baseUrl, "/api/v1/oauth/revoke", {
				token: credential.refreshToken || credential.accessToken,
				client_id: CLI_OAUTH_CLIENT_ID,
			}).catch(() => {});
		}
		await deleteCredential(profile);
		json({ ok: true, profile });
		return;
	}
	if (action === "status") {
		const stored = process.env.REPZO_TOKEN || (await getCredential(profile));
		const credential = parseStoredCredential(stored);
		const configured = Boolean(stored);
		json({
			profile,
			baseUrl:
				process.env.REPZO_BASE_URL ||
				config.profiles[profile]?.baseUrl ||
				DEFAULT_ORIGIN,
			authenticated: configured,
			authType: process.env.REPZO_TOKEN
				? "environment"
				: credential?.type || null,
			...(credential?.type === "oauth"
				? {
						expiresAt: Number.isFinite(Number(credential.expiresAt))
							? new Date(Number(credential.expiresAt)).toISOString()
							: null,
						scopes: credential.scopes || [],
					}
				: {}),
			source: process.env.REPZO_TOKEN
				? "environment"
				: configured
					? config.profiles[profile]?.credential || "file"
					: null,
		});
		return;
	}
	fail(`Unknown auth action: ${action}. Use login, status, or logout.`);
}

async function handleProfiles(positionals, options) {
	const action = positionals[1] || "list";
	const config = await loadProfiles();
	if (action === "list") {
		json({
			defaultProfile: config.defaultProfile,
			profiles: Object.entries(config.profiles).map(([name, value]) => ({
				name,
				baseUrl: value.baseUrl,
				credential: value.credential,
				active: name === config.defaultProfile,
			})),
		});
		return;
	}
	const name = positionals[2] || options.profile;
	if (!name) fail(`Usage: repzo profiles ${action} <name>`);
	if (action === "use") {
		if (!config.profiles[name])
			fail(`Unknown profile: ${name}`, {
				code: "not_found",
				exitCode: EXIT_CODES.not_found,
				hint: "Run repzo profiles list to see configured profiles.",
			});
		config.defaultProfile = name;
		await saveProfiles(config);
		json({ ok: true, defaultProfile: name });
		return;
	}
	if (action === "delete") {
		if (!config.profiles[name])
			fail(`Unknown profile: ${name}`, {
				code: "not_found",
				exitCode: EXIT_CODES.not_found,
				hint: "Run repzo profiles list to see configured profiles.",
			});
		delete config.profiles[name];
		await deleteCredential(name);
		if (config.defaultProfile === name)
			config.defaultProfile = Object.keys(config.profiles)[0] || "default";
		await saveProfiles(config);
		json({ ok: true, deleted: name, defaultProfile: config.defaultProfile });
		return;
	}
	if (action === "show") {
		const value = config.profiles[name];
		if (!value)
			fail(`Unknown profile: ${name}`, {
				code: "not_found",
				exitCode: EXIT_CODES.not_found,
				hint: "Run repzo profiles list to see configured profiles.",
			});
		json({
			name,
			...value,
			active: name === config.defaultProfile,
			authenticated: Boolean(await getCredential(name)),
		});
		return;
	}
	fail(`Unknown profiles action: ${action}. Use list, show, use, or delete.`);
}

function sharedSkillDirectory() {
	const agentsHome =
		process.env.REPZO_AGENTS_HOME || join(homedir(), ".agents");
	return join(agentsHome, "skills", SKILL_NAME);
}

function agentSkillDirectory(target) {
	return join(AGENT_TARGETS[target].home(), "skills", SKILL_NAME);
}

async function pathInfo(targetPath) {
	try {
		return await lstat(targetPath);
	} catch (error) {
		if (error.code === "ENOENT") return null;
		throw error;
	}
}

async function installedSkillVersion(skillDirectory) {
	try {
		return (
			await readFile(join(skillDirectory, SKILL_VERSION_FILE), "utf8")
		).trim();
	} catch {
		return null;
	}
}

async function isRepzoSkill(skillDirectory) {
	try {
		const contents = await readFile(join(skillDirectory, "SKILL.md"), "utf8");
		return /^---\s*[\s\S]*?^name:\s*repzo-workstation\s*$/m.test(contents);
	} catch {
		return false;
	}
}

async function removeReplaceableSkill(destination, force) {
	const info = await pathInfo(destination);
	if (!info) return;
	const replaceable =
		(await exists(join(destination, SKILL_MANAGED_FILE))) ||
		(await isRepzoSkill(destination));
	if (!force && !replaceable)
		fail(
			`${destination} already exists and is not managed by Repzo. Re-run with --force to replace it.`,
		);
	await rm(destination, { recursive: true, force: true });
}

async function installSharedSkill(force = false) {
	const destination = sharedSkillDirectory();
	await removeReplaceableSkill(destination, force);
	await mkdir(destination, { recursive: true });
	for (const [name, contents] of Object.entries(EMBEDDED_SKILL_FILES)) {
		const path = join(destination, name);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, contents);
	}
	const version = await packageVersion();
	await writeFile(
		join(destination, SKILL_MANAGED_FILE),
		"Managed by the Repzo CLI. Re-run `repzo setup agents` to repair this installation.\n",
	);
	await writeFile(join(destination, SKILL_VERSION_FILE), `${version}\n`);
	return { destination, version };
}

async function connectAgentSkill(target, force = false) {
	const destination = agentSkillDirectory(target);
	const canonical = sharedSkillDirectory();
	const info = await pathInfo(destination);
	if (info?.isSymbolicLink()) {
		try {
			if ((await realpath(destination)) === (await realpath(canonical)))
				return { target, destination, mode: "linked", unchanged: true };
		} catch {}
	}
	await removeReplaceableSkill(destination, force);
	await mkdir(dirname(destination), { recursive: true });
	try {
		const linkTarget =
			process.platform === "win32"
				? canonical
				: relative(dirname(destination), canonical);
		await symlink(
			linkTarget,
			destination,
			process.platform === "win32" ? "junction" : "dir",
		);
		return { target, destination, mode: "linked", unchanged: false };
	} catch (error) {
		await cp(canonical, destination, { recursive: true });
		return {
			target,
			destination,
			mode: "copied",
			unchanged: false,
			notice: `Could not create a skill link (${error.code || error.message}); copied the skill instead.`,
		};
	}
}

async function binaryAvailable(binary) {
	try {
		await execFileAsync(process.platform === "win32" ? "where" : "which", [
			binary,
		]);
		return true;
	} catch {
		return false;
	}
}

async function detectAgentTargets() {
	const detected = [];
	for (const [target, definition] of Object.entries(AGENT_TARGETS)) {
		const explicitHome =
			target === "codex" ? process.env.CODEX_HOME : process.env.CLAUDE_HOME;
		if (
			explicitHome ||
			(await exists(definition.home())) ||
			(await binaryAvailable(definition.binary))
		)
			detected.push(target);
	}
	return detected;
}

async function handleSetup(target, options) {
	if (!["agents", ...Object.keys(AGENT_TARGETS)].includes(target))
		fail("Usage: repzo setup agents|codex|claude [--force]");
	const targets = target === "agents" ? await detectAgentTargets() : [target];
	const shared = await installSharedSkill(options.force);
	const agents = [];
	for (const agentTarget of targets)
		agents.push(await connectAgentSkill(agentTarget, options.force));
	json({
		shared: shared.destination,
		version: shared.version,
		detected: targets,
		agents,
		invokeWith: "$repzo-workstation",
		restartRequired: agents.length > 0,
		...(agents.length === 0
			? {
					notice:
						"Shared skill installed, but no supported agent was detected. Run repzo setup codex or repzo setup claude after installing one.",
				}
			: {}),
	});
}

async function refreshInstalledSkillsIfNeeded() {
	if (process.env.REPZO_DISABLE_SKILL_REFRESH === "1") return null;
	const canonical = sharedSkillDirectory();
	if (!(await isRepzoSkill(canonical))) return null;
	const currentVersion = await packageVersion();
	const installedVersion = await installedSkillVersion(canonical);
	if (currentVersion === "unknown" || installedVersion === currentVersion)
		return null;
	const existingTargets = [];
	for (const target of Object.keys(AGENT_TARGETS)) {
		if (await pathInfo(agentSkillDirectory(target)))
			existingTargets.push(target);
	}
	await installSharedSkill(true);
	const agents = [];
	for (const target of existingTargets)
		agents.push(await connectAgentSkill(target, true));
	return {
		from: installedVersion,
		to: currentVersion,
		agents: agents.map((entry) => entry.target),
	};
}

function completion(shell) {
	const roots = [...new Set(COMMANDS.map((item) => item.tokens[0]))]
		.sort()
		.join(" ");
	const utility =
		"auth profiles commands openapi request setup doctor completion upgrade";
	if (shell === "zsh")
		return `#compdef repzo\n_repzo() { local -a commands; commands=(${roots} ${utility}); _describe 'command' commands; }\ncompdef _repzo repzo`;
	if (shell === "bash")
		return `_repzo_complete() { local commands='${roots} ${utility}'; COMPREPLY=( $(compgen -W "$commands" -- "\${COMP_WORDS[COMP_CWORD]}") ); }\ncomplete -F _repzo_complete repzo`;
	if (shell === "fish")
		return `complete -c repzo -f\ncomplete -c repzo -n '__fish_use_subcommand' -a '${roots} ${utility}'`;
	fail("Usage: repzo completion <bash|zsh|fish>");
}

async function resolveProfile(options) {
	const config = await loadProfiles();
	const profile = String(options.profile || config.defaultProfile || "default");
	const origin = String(
		options["base-url"] ||
			process.env.REPZO_BASE_URL ||
			config.profiles[profile]?.baseUrl ||
			DEFAULT_ORIGIN,
	).replace(/\/+$/, "");
	const rawCredential =
		process.env.REPZO_TOKEN || (await getCredential(profile));
	const credential = parseStoredCredential(rawCredential);
	let token = credential?.accessToken;
	if (
		!process.env.REPZO_TOKEN &&
		credential?.type === "oauth" &&
		Number(credential.expiresAt || 0) <= Date.now() + 60_000
	) {
		token = await refreshOAuthCredential(profile, origin, credential);
	}
	return {
		profile,
		origin,
		apiRoot: origin.endsWith("/api/v1") ? origin : `${origin}/api/v1`,
		token,
	};
}

async function fetchWithRetry(url, init, options = {}) {
	const method = String(init.method || "GET").toUpperCase();
	const retrySafe = ["GET", "HEAD", "OPTIONS"].includes(method);
	const maxAttempts = options.retry === false || !retrySafe ? 1 : 4;
	let response;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			response = await fetch(url, init);
		} catch (error) {
			if (attempt === maxAttempts) throw error;
			await sleep(250 * 2 ** (attempt - 1));
			continue;
		}
		if (!RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts)
			return response;
		const retryAfter = Number(response.headers.get("retry-after"));
		const delay =
			Number.isFinite(retryAfter) && retryAfter > 0
				? retryAfter * 1000
				: 250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
		await response.text();
		await sleep(Math.min(delay, 10_000));
	}
	return response;
}

async function requestJson(url, init, options) {
	let response;
	try {
		response = await fetchWithRetry(url, init, { retry: !options["no-retry"] });
	} catch (error) {
		fail(`Could not reach ${url.origin}: ${error.message}`, {
			code: "network",
			exitCode: EXIT_CODES.network,
			hint: "Check connectivity and run repzo doctor.",
			retryable: true,
		});
	}
	const raw = await response.text();
	let result = null;
	if (raw) {
		try {
			result = JSON.parse(raw);
		} catch {
			result = { text: raw };
		}
	}
	if (!response.ok) {
		const status = response.status;
		const error =
			result && typeof result === "object" && result.error
				? result.error
				: null;
		const classification =
			status === 401
				? ["auth", EXIT_CODES.auth]
				: status === 403
					? ["forbidden", EXIT_CODES.forbidden]
					: status === 404
						? ["not_found", EXIT_CODES.not_found]
						: status === 429
							? ["rate_limit", EXIT_CODES.rate_limit]
							: ["api", EXIT_CODES.api];
		const hint =
			status === 401
				? "Run repzo auth login and verify the active profile."
				: status === 403
					? "Review the profile's scopes and the user's current workspace permissions."
					: status === 404
						? "Verify the record ID and workspace."
						: status === 422
							? "Inspect error.details and the resource metadata before retrying."
							: status === 429
								? "Wait for the retry window or reduce request frequency."
								: status >= 500
									? "Retry later or run repzo doctor if the problem persists."
									: "Review the API error and request payload.";
		fail(error?.message || `API request failed with HTTP ${status}.`, {
			code: classification[0],
			exitCode: classification[1],
			hint,
			retryable: status === 429 || status >= 500,
			status,
			details: error?.details ?? (error ? { code: error.code } : result),
		});
	}
	return result ?? { ok: true, status: response.status };
}

async function runApi(method, path, body, options, pagination) {
	const profile = await resolveProfile(options);
	const publicDocs = path === "/openapi.json";
	const url = new URL(
		`${profile.apiRoot}${path.startsWith("/") ? path : `/${path}`}`,
	);
	for (const item of options.query) {
		const split = item.indexOf("=");
		if (split < 1) fail(`Invalid --query value: ${item}. Use key=value.`);
		url.searchParams.append(item.slice(0, split), item.slice(split + 1));
	}
	for (const name of ["page", "limit", "cursor", "q"])
		if (options[name] !== undefined)
			url.searchParams.set(name, String(options[name]));
	const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
	if (mutating && options["dry-run"]) {
		json(
			{
				dryRun: true,
				profile: profile.profile,
				method,
				url: url.toString(),
				body,
			},
			options.compact,
		);
		return;
	}
	if (!publicDocs && !profile.token)
		fail(
			`No API token for profile '${profile.profile}'. Run repzo auth login --profile ${profile.profile} or set REPZO_TOKEN.`,
			{
				code: "auth",
				exitCode: EXIT_CODES.auth,
				hint: `Run repzo auth login --profile ${profile.profile}.`,
			},
		);
	if (
		profile.token &&
		!profile.token.startsWith("foxa-") &&
		!profile.token.startsWith("foxu-")
	)
		fail(
			"API token must be a foxa-* Developer API key or foxu-* user access token.",
			{
				code: "auth",
				exitCode: EXIT_CODES.auth,
				hint: "Run repzo auth login.",
			},
		);
	if (mutating && !options.yes)
		fail(
			`Refusing ${method} without --yes. Use --dry-run to inspect the request first.`,
		);
	const init = {
		method,
		headers: {
			Accept: "application/json",
			...(profile.token ? { Authorization: `Bearer ${profile.token}` } : {}),
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
		},
		...(body !== undefined ? { body: JSON.stringify(body) } : {}),
	};
	if (!options.all || method !== "GET" || !pagination) {
		json(await requestJson(url, init, options), options.compact);
		return;
	}
	const data = [];
	let page = Number(url.searchParams.get("page") || 1);
	let cursor = url.searchParams.get("cursor");
	for (let guard = 0; guard < 10_000; guard += 1) {
		if (pagination === "offset") url.searchParams.set("page", String(page));
		else if (cursor) url.searchParams.set("cursor", cursor);
		else url.searchParams.delete("cursor");
		const result = await requestJson(url, init, options);
		if (!result || !Array.isArray(result.data))
			fail("Cannot auto-paginate: response does not contain a data array.");
		data.push(...result.data);
		if (pagination === "offset") {
			if (!result.meta?.hasNextPage) {
				json(
					{
						data,
						meta: {
							...result.meta,
							page: 1,
							total: result.meta?.total ?? data.length,
							fetched: data.length,
						},
					},
					options.compact,
				);
				return;
			}
			page += 1;
		} else {
			cursor = result.meta?.nextCursor;
			if (!result.meta?.hasMore || !cursor) {
				json(
					{
						data,
						meta: {
							...result.meta,
							nextCursor: null,
							hasMore: false,
							fetched: data.length,
						},
					},
					options.compact,
				);
				return;
			}
		}
	}
	fail("Auto-pagination stopped after 10,000 pages.");
}

async function skillInstallationChecks() {
	const checks = [];
	const currentVersion = await packageVersion();
	const canonical = sharedSkillDirectory();
	const canonicalVersion = await installedSkillVersion(canonical);
	const canonicalValid =
		(await isRepzoSkill(canonical)) && canonicalVersion === currentVersion;
	checks.push({
		name: "Agent skill (shared)",
		ok: canonicalValid,
		detail: canonicalValid
			? `${canonical} (${currentVersion})`
			: canonicalVersion
				? `${canonical} has version ${canonicalVersion}; CLI has ${currentVersion}`
				: `${canonical} is not installed`,
		...(canonicalValid ? {} : { hint: "Run repzo setup agents." }),
	});

	const detected = await detectAgentTargets();
	for (const target of Object.keys(AGENT_TARGETS)) {
		const destination = agentSkillDirectory(target);
		const info = await pathInfo(destination);
		if (!detected.includes(target) && !info) continue;
		const version = await installedSkillVersion(destination);
		const valid =
			(await isRepzoSkill(destination)) && version === currentVersion;
		let mode = "missing";
		if (info?.isSymbolicLink()) mode = "linked";
		else if (info) mode = "copied";
		checks.push({
			name: `Agent skill (${target})`,
			ok: valid,
			detail: valid
				? `${destination} (${mode}, ${currentVersion})`
				: `${destination} is ${mode}${version ? ` at version ${version}` : ""}`,
			...(valid ? {} : { hint: `Run repzo setup ${target}.` }),
		});
	}
	if (SKILL_REFRESH_RESULT?.error)
		checks.push({
			name: "Agent skill refresh",
			ok: false,
			detail: SKILL_REFRESH_RESULT.error,
			hint: "Run repzo setup agents to repair the installed skill.",
		});
	return checks;
}

async function doctor(options) {
	const profile = await resolveProfile(options);
	const checks = [];
	checks.push({
		name: "Runtime",
		ok: STANDALONE_BUILD || Number(process.versions.node.split(".")[0]) >= 20,
		detail: STANDALONE_BUILD
			? `standalone ${process.platform}/${process.arch}`
			: `Node.js ${process.version}`,
	});
	checks.push(...(await skillInstallationChecks()));
	checks.push({ name: "Profile", ok: true, detail: profile.profile });
	checks.push({
		name: "Credential",
		ok: Boolean(profile.token),
		detail: profile.token ? "configured (redacted)" : "missing",
	});
	checks.push({
		name: "API URL",
		ok: /^https?:\/\//.test(profile.apiRoot),
		detail: profile.apiRoot,
	});
	try {
		const response = await fetchWithRetry(
			`${profile.apiRoot}/openapi.json`,
			{ headers: { Accept: "application/json" } },
			{ retry: !options["no-retry"] },
		);
		checks.push({
			name: "API discovery",
			ok: response.ok,
			detail: `HTTP ${response.status}`,
		});
		await response.text();
	} catch (error) {
		checks.push({ name: "API discovery", ok: false, detail: error.message });
	}
	if (profile.token) {
		try {
			const response = await fetchWithRetry(
				`${profile.apiRoot}/metadata/countries?limit=1`,
				{
					headers: {
						Accept: "application/json",
						Authorization: `Bearer ${profile.token}`,
					},
				},
				{ retry: !options["no-retry"] },
			);
			checks.push({
				name: "API authentication",
				ok: response.ok,
				detail: `HTTP ${response.status}`,
			});
			await response.text();
		} catch (error) {
			checks.push({
				name: "API authentication",
				ok: false,
				detail: error.message,
			});
		}
	}
	const healthy = checks.every((check) => check.ok);
	json({ healthy, checks }, options.compact, {
		ok: healthy,
		summary: `${checks.filter((check) => check.ok).length}/${checks.length} checks passed`,
	});
	if (!healthy) process.exitCode = EXIT_CODES.api;
}

function releaseVersion(tagName) {
	if (typeof tagName !== "string" || !tagName.startsWith(RELEASE_TAG_PREFIX))
		return null;
	const version = tagName.slice(RELEASE_TAG_PREFIX.length);
	return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
		? version
		: null;
}

function standalonePlatform() {
	const os =
		process.platform === "darwin"
			? "darwin"
			: process.platform === "linux"
				? "linux"
				: process.platform === "win32"
					? "windows"
					: null;
	const arch =
		process.arch === "x64"
			? "x64"
			: process.arch === "arm64"
				? "arm64"
				: null;
	if (os === "windows" && arch === "arm64") return null;
	if (!os || !arch) return null;
	return `${os}_${arch}`;
}

function standaloneAssetName(version) {
	const platform = standalonePlatform();
	if (!platform) return null;
	return `repzo_${version}_${platform}${process.platform === "win32" ? ".exe" : ""}`;
}

async function latestStandaloneRelease() {
	const endpoint =
		process.env.REPZO_RELEASES_API_URL ||
		`https://api.github.com/repos/${RELEASE_REPOSITORY}/releases/latest`;
	const response = await fetchWithRetry(endpoint, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "repzo-cli",
			...(process.env.GITHUB_TOKEN
				? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
				: {}),
		},
	});
	if (!response.ok)
		throw new Error(`Could not check Repzo CLI releases (HTTP ${response.status}).`);
	const payload = await response.json();
	const releases = Array.isArray(payload) ? payload : [payload];
	const release = releases.find(
		(entry) => !entry?.draft && releaseVersion(entry?.tag_name),
	);
	if (!release) throw new Error("No Repzo CLI release was found.");
	return { ...release, version: releaseVersion(release.tag_name) };
}

function releaseAsset(release, name) {
	return release.assets?.find((asset) => asset?.name === name) || null;
}

async function downloadReleaseAsset(asset, maxBytes = 200 * 1024 * 1024) {
	if (!asset?.browser_download_url)
		throw new Error(`Release asset ${asset?.name || "unknown"} has no download URL.`);
	const response = await fetchWithRetry(asset.browser_download_url, {
		headers: { Accept: "application/octet-stream" },
	});
	if (!response.ok)
		throw new Error(`Could not download ${asset.name} (HTTP ${response.status}).`);
	const declaredLength = Number(response.headers.get("content-length") || 0);
	if (declaredLength > maxBytes)
		throw new Error(`${asset.name} exceeds the maximum download size.`);
	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length > maxBytes)
		throw new Error(`${asset.name} exceeds the maximum download size.`);
	return buffer;
}

function expectedChecksum(checksums, assetName) {
	for (const line of checksums.split(/\r?\n/)) {
		const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
		if (match && match[2] === assetName) return match[1].toLowerCase();
	}
	return null;
}

async function verifyReleaseSignature(release, checksumsPath, bundlePath) {
	if (!(await binaryAvailable("cosign"))) return "checksum";
	await execFileAsync("cosign", [
		"verify-blob",
		"--bundle",
		bundlePath,
		"--certificate-identity",
		`https://github.com/${RELEASE_SIGNING_REPOSITORY}/.github/workflows/${RELEASE_SIGNING_WORKFLOW}@refs/tags/${RELEASE_SIGNING_TAG_PREFIX}${release.version}`,
		"--certificate-oidc-issuer",
		"https://token.actions.githubusercontent.com",
		checksumsPath,
	]);
	return "checksum+sigstore";
}

async function installStandaloneRelease(release, current) {
	const assetName = standaloneAssetName(release.version);
	if (!assetName)
		fail(`No standalone Repzo build supports ${process.platform}/${process.arch}.`, {
			code: "upgrade_required",
		});
	const binaryAsset = releaseAsset(release, assetName);
	const checksumsAsset = releaseAsset(release, "checksums.txt");
	const bundleAsset = releaseAsset(release, "checksums.txt.bundle");
	if (!binaryAsset || !checksumsAsset)
		throw new Error(`Release ${release.tag_name} is missing required assets.`);

	const target = await realpath(process.execPath).catch(() => resolve(process.execPath));
	const homeRelative = relative(homedir(), target);
	if (
		!homeRelative ||
		homeRelative === ".." ||
		homeRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
		isAbsolute(homeRelative)
	)
		fail("The standalone executable is outside your home directory.", {
			code: "upgrade_required",
			hint: "Upgrade it with the package manager that installed it.",
		});

	const [binary, checksumsBuffer] = await Promise.all([
		downloadReleaseAsset(binaryAsset),
		downloadReleaseAsset(checksumsAsset, 1024 * 1024),
	]);
	const checksums = checksumsBuffer.toString("utf8");
	const expected = expectedChecksum(checksums, assetName);
	const actual = crypto.createHash("sha256").update(binary).digest("hex");
	if (!expected || expected !== actual)
		throw new Error(`Checksum verification failed for ${assetName}.`);

	const directory = dirname(target);
	const executableSuffix = process.platform === "win32" ? ".exe" : "";
	const staged = join(
		directory,
		`.repzo-upgrade-${process.pid}${executableSuffix}`,
	);
	const backup = join(
		directory,
		`.repzo-backup-${process.pid}${executableSuffix}`,
	);
	const checksumsPath = join(directory, `.repzo-checksums-${process.pid}.txt`);
	const bundlePath = join(directory, `.repzo-checksums-${process.pid}.bundle`);
	let verification = "checksum";
	try {
		await writeFile(staged, binary, { mode: 0o755 });
		await chmod(staged, 0o755);
		const probe = await execFileAsync(staged, ["--version"], {
			env: { ...process.env, REPZO_DISABLE_SKILL_REFRESH: "1" },
		});
		if (probe.stdout.trim() !== release.version)
			throw new Error(
				`Downloaded executable reports ${probe.stdout.trim() || "no version"}.`,
			);
		if (bundleAsset) {
			await writeFile(checksumsPath, checksumsBuffer);
			await writeFile(
				bundlePath,
				await downloadReleaseAsset(bundleAsset, 1024 * 1024),
			);
			verification = await verifyReleaseSignature(
				release,
				checksumsPath,
				bundlePath,
			);
		}
		await rename(target, backup);
		try {
			await rename(staged, target);
			const installed = await execFileAsync(target, ["--version"], {
				env: { ...process.env, REPZO_DISABLE_SKILL_REFRESH: "1" },
			});
			if (installed.stdout.trim() !== release.version)
				throw new Error("The installed executable failed its version check.");
			try {
				await rm(backup, { force: true });
			} catch (error) {
				if (process.platform !== "win32") throw error;
				await rename(
					backup,
					join(
						directory,
						`.repzo-upgrade-reap-${Date.now()}-${process.pid}.exe`,
					),
				);
			}
		} catch (error) {
			await rm(target, { force: true });
			await rename(backup, target);
			throw error;
		}
	} finally {
		await Promise.all([
			rm(staged, { force: true }),
			rm(checksumsPath, { force: true }),
			rm(bundlePath, { force: true }),
		]);
	}
	return {
		previousVersion: current,
		installed: release.version,
		method: "standalone",
		verification,
		skills: "Installed skills refresh on the next repzo command.",
	};
}

async function cleanupStandaloneUpgradeSidecars() {
	if (!STANDALONE_BUILD) return;
	const target = await realpath(process.execPath).catch(() =>
		resolve(process.execPath),
	);
	const directory = dirname(target);
	let names = [];
	try {
		names = await readdir(directory);
	} catch {
		return;
	}
	await Promise.all(
		names
			.filter((name) => name.startsWith(".repzo-upgrade-reap-"))
			.map((name) => rm(join(directory, name), { force: true }).catch(() => {})),
	);
}

async function upgrade(options) {
	const current = await packageVersion();
	if (!STANDALONE_BUILD) {
		json({
			current,
			status: "development",
			upgradeApplicable: false,
			installCommand:
				"curl -fsSL https://raw.githubusercontent.com/Repzo/repzo-cli/main/scripts/install-repzo-cli.sh | bash",
		});
		return;
	}
	const release = await latestStandaloneRelease();
	const latest = release.version;
	if (!options.yes) {
		json({
			current,
			latest,
			updateAvailable: Boolean(latest && latest !== current),
			method: "standalone",
			command: "repzo upgrade --yes",
		});
		return;
	}
	if (latest === current) {
		json({ current, installed: current, updateAvailable: false });
		return;
	}
	json(await installStandaloneRelease(release, current));
}

async function main() {
	await cleanupStandaloneUpgradeSidecars();
	const { positionals, options } = parseArgs(process.argv.slice(2));
	OUTPUT_OPTIONS = { ...OUTPUT_OPTIONS, ...options };
	OUTPUT_POSITIONALS = positionals;
	if (options.quiet && options.json)
		fail("--quiet and --json cannot be used together.", {
			hint: "Use --quiet for raw data or --json for the full response envelope.",
		});
	const first = positionals[0];
	if (first !== "setup") {
		try {
			SKILL_REFRESH_RESULT = await refreshInstalledSkillsIfNeeded();
		} catch (error) {
			SKILL_REFRESH_RESULT = { error: error.message };
		}
	}
	if (options.version) {
		process.stdout.write(`${await packageVersion()}\n`);
		return;
	}
	if (options.agent && options.help) {
		json(
			{
				version: await packageVersion(),
				prefix: positionals,
				commands: catalog(positionals),
				globalFlags: GLOBAL_FLAGS,
				exitCodes: EXIT_CODE_HELP,
				output: {
					success: "raw data in --agent mode",
					error: {
						ok: false,
						error: { code: "string", message: "string", retryable: "boolean" },
					},
				},
			},
			options.compact,
		);
		return;
	}
	if (options.help || !first) {
		process.stdout.write(`${HELP}\n`);
		return;
	}
	if (first === "commands") {
		json(
			{
				version: await packageVersion(),
				commands: catalog(),
				globalFlags: GLOBAL_FLAGS,
				exitCodes: EXIT_CODE_HELP,
			},
			options.compact,
		);
		return;
	}
	if (first === "auth") {
		await handleAuth(positionals, options);
		return;
	}
	if (first === "profiles") {
		await handleProfiles(positionals, options);
		return;
	}
	if (first === "setup") {
		await handleSetup(positionals[1], options);
		return;
	}
	if (first === "completion") {
		process.stdout.write(`${completion(positionals[1])}\n`);
		return;
	}
	if (first === "doctor") {
		await doctor(options);
		return;
	}
	if (first === "upgrade") {
		await upgrade(options);
		return;
	}
	if (first === "openapi") {
		await runApi("GET", "/openapi.json", undefined, options);
		return;
	}
	if (first === "request") {
		if (positionals.length < 3) fail("Usage: repzo request <method> <path>");
		const method = positionals[1].toUpperCase();
		const body = await readBody(options.data);
		if (
			!["GET", "HEAD", "OPTIONS", "DELETE"].includes(method) &&
			body === undefined
		)
			fail(`${method} requires --data JSON, @file, or @-.`);
		await runApi(
			method,
			positionals[2],
			body,
			options,
			method === "GET" ? "offset" : undefined,
		);
		return;
	}

	// Backward-compatible generic verbs: repzo list contacts, repzo get contacts ID, etc.
	if (["list", "get", "create", "update", "delete"].includes(first)) {
		const [verb, resource, id] = positionals;
		if (!resource)
			fail(
				`Usage: repzo ${verb} <resource>${["get", "update", "delete"].includes(verb) ? " <id>" : ""}`,
			);
		const method = {
			list: "GET",
			get: "GET",
			create: "POST",
			update: "PATCH",
			delete: "DELETE",
		}[verb];
		const path = `/${resource}${id ? `/${encodeURIComponent(id)}` : ""}`;
		const domainItem = COMMANDS.find(
			(item) =>
				item.tokens.length === 2 &&
				item.tokens[0] === resource &&
				item.tokens[1] === verb,
		);
		OUTPUT_CONTEXT = domainItem
			? { item: domainItem, args: id ? { id } : {} }
			: null;
		const body = await readBody(options.data);
		if (["POST", "PATCH"].includes(method) && body === undefined)
			fail(`${method} requires --data JSON, @file, or @-.`);
		await runApi(
			method,
			path,
			body,
			options,
			verb === "list" ? "offset" : undefined,
		);
		return;
	}

	const matches = COMMANDS.filter((item) =>
		item.tokens.every((token, index) => positionals[index] === token),
	);
	const selected = matches.sort((a, b) => b.tokens.length - a.tokens.length)[0];
	if (!selected) {
		const candidates = catalog([first]);
		if (candidates.length)
			fail(
				`Incomplete or unknown command. Try: ${candidates
					.slice(0, 8)
					.map((item) => item.command)
					.join(", ")}`,
			);
		fail(
			`Unknown command: ${first}. Run repzo --help or repzo commands --json.`,
		);
	}
	const values = positionals.slice(selected.tokens.length);
	const expected = selected.args || [];
	if (values.length < expected.length)
		fail(`Usage: ${publicCommand(selected).usage}`);
	let path = selected.path;
	const commandArgs = {};
	expected.forEach((name, index) => {
		commandArgs[name] = values[index];
		path = path.replace(`{${name}}`, encodeURIComponent(values[index]));
	});
	OUTPUT_CONTEXT = { item: selected, args: commandArgs };
	const body = await readBody(options.data);
	if (selected.body && body === undefined)
		fail(`${selected.method} requires --data JSON, @file, or @-.`);
	await runApi(selected.method, path, body, options, selected.pagination);
}

try {
	await main();
} catch (reason) {
	if (reason?.code === "EPIPE") {
		process.exitCode = 0;
	} else {
		const failure =
			reason instanceof CliFailure
				? reason
				: new CliFailure(
						{
							ok: false,
							error: {
								code: "api",
								message:
									reason instanceof Error
										? reason.message
										: "Unexpected CLI failure.",
								hint: "Run repzo doctor and retry. Report the failure if it persists.",
								retryable: false,
							},
						},
						EXIT_CODES.api,
					);
		writeJson(process.stderr, failure.payload);
		process.exitCode = failure.exitCode;
	}
}
