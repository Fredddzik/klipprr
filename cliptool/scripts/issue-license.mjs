// scripts/issue-license.mjs
// Mint Ed25519-signed license tokens for ClipTool
// Usage examples:
//   node scripts/issue-license.mjs gen-keys
//   node scripts/issue-license.mjs issue --email you@example.com --plan pro --days 14
//   node scripts/issue-license.mjs issue --email you@example.com --plan pro --exp 1767225600

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function base64urlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (!a.startsWith("--")) continue;

    // --key=value
    if (a.includes("=")) {
      const [k, v] = a.slice(2).split("=");
      args[k] = v;
      continue;
    }

    // --key value
    const key = a.slice(2);
    const val = argv[i + 1];
    args[key] = val;
    i++;
  }
  return args;
}

const ROOT = process.cwd();
const KEY_DIR = path.join(ROOT, "keys");
const PRIV_PATH = path.join(KEY_DIR, "license_ed25519_private.pem");
const PUB_PATH = path.join(KEY_DIR, "license_ed25519_public.pem");
const PUB_RAW_B64URL_PATH = path.join(KEY_DIR, "license_ed25519_public_raw.base64url.txt");

function ensureKeyDir() {
  if (!fs.existsSync(KEY_DIR)) fs.mkdirSync(KEY_DIR, { recursive: true });
}

function genKeys() {
  ensureKeyDir();

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");

  // Save PEM keys for signing (private) + reference (public)
  fs.writeFileSync(
    PRIV_PATH,
    privateKey.export({ format: "pem", type: "pkcs8" })
  );
  fs.writeFileSync(
    PUB_PATH,
    publicKey.export({ format: "pem", type: "spki" })
  );

  // Export SPKI DER and extract last 32 bytes (Ed25519 public key)
  const spkiDer = publicKey.export({ format: "der", type: "spki" });

  // Ed25519 SPKI structure ends with the 32-byte public key
  const raw32 = spkiDer.slice(-32);

  const rawB64url = base64urlEncode(raw32);
  fs.writeFileSync(PUB_RAW_B64URL_PATH, rawB64url);

  console.log("✅ Keys generated:");
  console.log("  Private PEM:", PRIV_PATH);
  console.log("  Public  PEM:", PUB_PATH);
  console.log("  Public RAW (base64url):", PUB_RAW_B64URL_PATH);
  console.log("\nPaste this into src/lib/license.ts as PUBLIC_KEY_BASE64:");
  console.log(rawB64url);
}

function loadPrivateKey() {
  if (!fs.existsSync(PRIV_PATH)) {
    console.error("Missing private key:", PRIV_PATH);
    console.error("Run: node scripts/issue-license.mjs gen-keys");
    process.exit(1);
  }
  return fs.readFileSync(PRIV_PATH, "utf8");
}

function issueLicense({ email, plan, exp, days }) {
  if (!email) throw new Error("--email is required");
  if (!plan) throw new Error("--plan is required (free|pro)");
  if (!["free", "pro"].includes(plan)) throw new Error("plan must be free|pro");

  const iat = nowUnix();
  let expTs = undefined;

  if (exp) {
    expTs = Number(exp);
    if (!Number.isFinite(expTs)) throw new Error("--exp must be unix seconds");
  } else if (days) {
    const d = Number(days);
    if (!Number.isFinite(d)) throw new Error("--days must be a number");
    expTs = iat + d * 24 * 60 * 60;
  }

  const claims = {
    email,
    plan,
    iat,
    ...(expTs ? { exp: expTs } : {}),
    lic: crypto.randomUUID(),
    aud: "cliptool",
  };

  const json = JSON.stringify(claims);
  const payloadBytes = Buffer.from(json, "utf8");
  const payload = base64urlEncode(payloadBytes);

  const privateKeyPem = loadPrivateKey();
  const sig = crypto.sign(null, payloadBytes, privateKeyPem);
  const signature = base64urlEncode(sig);

  const token = { payload, signature };

  console.log("✅ License issued\n");
  console.log("CLAIMS:");
  console.log(claims);
  console.log("\nTOKEN (paste/save as JSON):");
  console.log(JSON.stringify(token, null, 2));

  console.log("\nSHAREABLE (single-line):");
  console.log(JSON.stringify(token));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  // Allow: node scripts/issue-license.mjs gen-keys
  if (cmd === "gen-keys") return genKeys();

  // Allow: node scripts/issue-license.mjs issue --email ... --plan ... --days ... / --exp ...
  if (cmd === "issue") {
    const args = parseArgs(rest);
    return issueLicense({
      email: args.email,
      plan: args.plan,
      exp: args.exp,
      days: args.days,
    });
  }

  console.log("Commands:");
  console.log("  node scripts/issue-license.mjs gen-keys");
  console.log("  node scripts/issue-license.mjs issue --email you@x.com --plan pro --days 14");
  console.log("  node scripts/issue-license.mjs issue --email you@x.com --plan pro --exp 1767225600");
  process.exit(1);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});