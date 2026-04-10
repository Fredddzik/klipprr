// Skip automatically on preview deployments and local dev.
// Set INDEXNOW_FORCE=1 to override (e.g. for manual one-off runs).
const env = process.env.VERCEL_ENV; // "production" | "preview" | "development" | undefined
if (env && env !== "production" && !process.env.INDEXNOW_FORCE) {
  console.log(`[IndexNow] Skipping — VERCEL_ENV is "${env}" (production only)`);
  process.exit(0);
}

const KEY = process.env.INDEXNOW_KEY || "8b3f1f8c9a2149a0b5a73d5f2a9c6e41";
const HOST = process.env.INDEXNOW_HOST || "klipprr.com";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const cliUrls = process.argv.slice(2);
const defaultUrls = [
  `https://${HOST}/`,
  `https://${HOST}/download`,
  `https://${HOST}/privacy`,
  `https://${HOST}/terms`,
  `https://${HOST}/cookies`,
  `https://${HOST}/refunds`,
];
const urlList = cliUrls.length > 0 ? cliUrls : defaultUrls;

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

const endpoint = "https://api.indexnow.org/indexnow";

async function submit() {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[IndexNow] Failed (${res.status}): ${body || res.statusText}`);
    process.exit(1);
  }
  console.log(`[IndexNow] Submitted ${urlList.length} URL(s) for ${HOST}`);
  if (body) console.log(body);
}

submit().catch((err) => {
  console.error("[IndexNow] Unexpected error:", err);
  process.exit(1);
});
