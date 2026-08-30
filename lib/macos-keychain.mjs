import { spawn } from "node:child_process";

const ERR_SEC_ITEM_NOT_FOUND = -25300;

function encode(value) {
	return Buffer.from(value, "utf8").toString("base64");
}

export function buildMacOSKeychainWriteScript(service, account, credential) {
	const serviceBase64 = encode(service);
	const accountBase64 = encode(account);
	const credentialBase64 = encode(credential);

	return `ObjC.import("Foundation");
ObjC.import("Security");

const decodeText = (value) => $.NSString.alloc.initWithDataEncoding(
  $.NSData.alloc.initWithBase64EncodedStringOptions($(value), 0),
  $.NSUTF8StringEncoding,
);
const service = decodeText(${JSON.stringify(serviceBase64)});
const account = decodeText(${JSON.stringify(accountBase64)});
const credential = $.NSData.alloc.initWithBase64EncodedStringOptions($(${JSON.stringify(credentialBase64)}), 0);

const query = $.NSMutableDictionary.alloc.init;
query.setObjectForKey($("genp"), $("class"));
query.setObjectForKey(service, $("svce"));
query.setObjectForKey(account, $("acct"));

const changes = $.NSMutableDictionary.alloc.init;
changes.setObjectForKey(credential, $("v_Data"));

let status = Number($.SecItemUpdate(query, changes));
if (status === ${ERR_SEC_ITEM_NOT_FOUND}) {
  query.setObjectForKey(credential, $("v_Data"));
  const result = Ref();
  status = Number($.SecItemAdd(query, result));
}
if (status !== 0) {
  throw new Error("Could not save the Keychain item (status " + status + ").");
}
`;
}

export function setMacOSKeychainCredential(
	service,
	account,
	credential,
	spawnProcess = spawn,
) {
	if (!credential)
		return Promise.reject(new Error("Credential cannot be empty."));
	const script = buildMacOSKeychainWriteScript(service, account, credential);

	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			if (error) reject(error);
			else resolve(true);
		};
		const child = spawnProcess(
			"/usr/bin/osascript",
			["-l", "JavaScript", "-"],
			{ stdio: ["pipe", "ignore", "ignore"] },
		);
		child.once("error", finish);
		child.once("close", (code) =>
			finish(
				code === 0
					? undefined
					: new Error(`Keychain writer exited with status ${code}.`),
			),
		);
		child.stdin.once("error", finish);
		child.stdin.end(script);
	});
}
