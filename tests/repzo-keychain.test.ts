import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import {
	buildMacOSKeychainWriteScript,
	setMacOSKeychainCredential,
} from "../lib/macos-keychain.mjs";

function fakeChild(onInput: (input: string) => void, exitCode = 0) {
	const child = new EventEmitter() as EventEmitter & {
		stdin: EventEmitter & { end(input: string): void };
	};
	const stdin = new EventEmitter() as EventEmitter & {
		end(input: string): void;
	};
	stdin.end = (input) => {
		onInput(input);
		queueMicrotask(() => child.emit("close", exitCode));
	};
	child.stdin = stdin;
	return child;
}

describe("Repzo CLI macOS Keychain storage", () => {
	it("writes credentials through stdin without putting secrets in process arguments", async () => {
		const credential = "foxu-access-and-foxr-refresh-secret";
		let script = "";
		let invocation: unknown[] = [];
		const spawnProcess = (
			command: string,
			args: string[],
			options: unknown,
		) => {
			invocation = [command, args, options];
			return fakeChild((input) => {
				script = input;
			});
		};

		await setMacOSKeychainCredential(
			"com.repzo.workstation.cli",
			"work",
			credential,
			spawnProcess,
		);

		expect(invocation).toEqual([
			"/usr/bin/osascript",
			["-l", "JavaScript", "-"],
			{ stdio: ["pipe", "ignore", "ignore"] },
		]);
		expect(JSON.stringify(invocation)).not.toContain(credential);
		expect(script).not.toContain(credential);
		expect(script).toContain(Buffer.from(credential).toString("base64"));
		expect(script).toContain("SecItemUpdate");
		expect(script).toContain("SecItemAdd");
	});

	it("rejects an empty credential instead of creating an empty Keychain item", async () => {
		await expect(
			setMacOSKeychainCredential("com.repzo.workstation.cli", "work", ""),
		).rejects.toThrow("Credential cannot be empty");
	});

	it("reports a failed Security framework write", async () => {
		const spawnProcess = () => fakeChild(() => {}, 1);
		await expect(
			setMacOSKeychainCredential(
				"com.repzo.workstation.cli",
				"work",
				"foxa-test",
				spawnProcess,
			),
		).rejects.toThrow("Keychain writer exited with status 1");
	});

	it("encodes service and profile values before embedding the JXA program", () => {
		const script = buildMacOSKeychainWriteScript(
			"service-with-sensitive-name",
			"profile-with-sensitive-name",
			"foxa-sensitive-value",
		);
		expect(script).not.toContain("service-with-sensitive-name");
		expect(script).not.toContain("profile-with-sensitive-name");
		expect(script).not.toContain("foxa-sensitive-value");
	});
});
