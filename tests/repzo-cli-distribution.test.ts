import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const installSh = resolve(root, "scripts/install-repzo-cli.sh");
const installPs1 = resolve(root, "scripts/install-repzo-cli.ps1");
const releaseWorkflow = resolve(root, ".github/workflows/release.yml");

describe("Repzo CLI standalone distribution", () => {
	it("keeps the Bash installer valid and sourceable", () => {
		execFileSync("bash", ["-n", installSh]);
		const output = execFileSync(
			"bash",
			["-c", 'source "$1"; printf sourced', "repzo-installer-test", installSh],
			{ encoding: "utf8" },
		);
		expect(output).toBe("sourced");
	});

	it("parses the public repository's latest stable tag", () => {
		const output = execFileSync(
			"bash",
			[
				"-c",
				'source "$1"; curl_run() { if [[ "$*" == *"releases/latest"* && "$*" == *"api.github.com"* ]]; then printf \'%s\' "$MOCK_RELEASE"; else return 1; fi; }; latest_version',
				"repzo-installer-test",
				installSh,
			],
			{
				encoding: "utf8",
				env: {
					...process.env,
					MOCK_RELEASE: '{"tag_name":"v2.7.3","draft":false}',
				},
			},
		);
		expect(output.trim()).toBe("2.7.3");
	});

	it("pins release verification to this public repository's workflow", () => {
		const bash = readFileSync(installSh, "utf8");
		const powershell = readFileSync(installPs1, "utf8");
		for (const installer of [bash, powershell]) {
			expect(installer).toContain("Repzo/repzo-cli");
			expect(installer).toContain(
				"Repzo/repzo-cli/.github/workflows/release.yml@refs/tags/v",
			);
			expect(installer).toContain("checksums.txt.bundle");
		}
	});

	it("publishes from the public repository and verifies native binaries", () => {
		const workflow = readFileSync(releaseWorkflow, "utf8");
		expect(workflow).toContain('tags:\n      - "v*"');
		expect(workflow).toContain("contents: write");
		expect(workflow).not.toContain("CLI_RELEASE_TOKEN");
		expect(workflow).not.toContain("bun-windows-arm64");
		expect(workflow).toContain("Attest build provenance");
		expect(workflow).toContain("Verify released binary");
	});

	it("keeps npm publishing out of the CLI distribution", () => {
		const cliPackage = readFileSync(resolve(root, "package.json"), "utf8");
		const cliReadme = readFileSync(resolve(root, "README.md"), "utf8");
		expect(JSON.parse(cliPackage).private).toBe(true);
		expect(cliPackage).not.toContain("publishConfig");
		expect(cliReadme).not.toContain("npm install");
	});

	it.skipIf(process.platform !== "win32")(
		"parses the PowerShell installer",
		() => {
			const result = spawnSync(
				"pwsh",
				[
					"-NoProfile",
					"-Command",
					'$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$tokens, [ref]$errors) > $null; if ($errors.Count) { exit 1 }',
					installPs1,
				],
				{ encoding: "utf8" },
			);
			expect(result.status, result.stderr).toBe(0);
		},
	);
});
