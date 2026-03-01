# Auto-updates for ClipAgent

The app uses Tauri’s built-in updater. Users see **Check for updates** in the top bar; when an update is available they can click **Install** and the app will restart on the new version.

What’s already done in the repo:

- **Backend:** `tauri-plugin-updater` is registered and `createUpdaterArtifacts: true` is set so builds produce signed updater bundles and `.sig` files.
- **Frontend:** “Check for updates” and “Install” are wired in the top bar (desktop only).
- **Config:** `tauri.conf.json` has an `updater` section with placeholders you must replace.

You need to do the following yourself.

---

## 1. Generate signing keys (one-time)

Updates are verified with a signature. You need a **private** key (secret) and a **public** key (in the app config).

From the **clipagent/src-tauri** directory (where `Cargo.toml` and `tauri.conf.json` live). Use **cargo** so `-w` is passed to the Tauri CLI, not to npm:

```bash
cd clipagent/src-tauri
cargo tauri signer generate -w ~/.tauri/clipagent.key
```

(If you prefer npm from **cliptool**, use `--` so npm doesn’t treat `-w` as its own flag:  
`npm run tauri signer generate -- -w ~/.tauri/clipagent.key` — only if you have a `tauri` script in cliptool’s package.json.)

This creates:

- **Private key:** `~/.tauri/clipagent.key` — keep this secret and back it up. If you lose it, you cannot publish new updates for existing installs.
- **Public key:** printed in the terminal or in a `.pub` file — you’ll put this in config in the next step.

Copy the **entire** public key string (starts with something like `dW50cnVzdGVk...`).

---

## 2. Put the public key and endpoint in the app

1. Open **clipagent/src-tauri/tauri.conf.json**.
2. In `plugins.updater`:
   - Replace `REPLACE_WITH_PUBLIC_KEY_FROM_TAURI_SIGNER_GENERATE` with the **exact** public key string from step 1 (one line, no path, no file reference).
   - Replace the `endpoints` URL with your real GitHub release URL:
     - If your repo is `https://github.com/your-org/klipprr`, use:
       - `https://github.com/your-org/klipprr/releases/latest/download/latest.json`
     - Use your actual org/user and repo name.

Example (with a fake key and repo):

```json
"updater": {
  "pubkey": "dW50cnVzdGVk...your-full-public-key...",
  "endpoints": [
    "https://github.com/your-org/klipprr/releases/latest/download/latest.json"
  ]
}
```

---

## 3. Build with the private key (local or CI)

For the build to produce **signed** updater artifacts (and correct `.sig` files), the private key must be available when you run the build.

**Local build (for testing):**

```bash
# Mac/Linux
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/clipagent.key)"
# Then from repo root, build frontend and Tauri:
cd cliptool && npm run build && cd ../clipagent && npm run tauri build
```

(On Windows use `set TAURI_SIGNING_PRIVATE_KEY=...` and the path to your key file or its content.)

**Important:** `.env` files are not used for the signer; the key must be in the environment (or passed another way your build uses).

---

## 4. GitHub Actions: secret and workflow

So that **GitHub** can build and release signed updates:

1. **Add the private key as a secret**
   - Repo → **Settings** → **Secrets and variables** → **Actions**.
   - **New repository secret**
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: **entire contents** of `~/.tauri/clipagent.key` (paste the whole string).

2. **Add a workflow that builds and publishes a release**

Create **.github/workflows/release.yml** (or similar) in the **repo root** so that on a version tag (e.g. `v0.2.0`) it:

- Checks out the repo.
- Sets up Node and Rust (and any Rust targets you need for macOS, e.g. `aarch64-apple-darwin`, `x86_64-apple-darwin`).
- Installs frontend deps and builds the frontend (e.g. from **cliptool**).
- Runs the Tauri build from the **clipagent** directory with `TAURI_SIGNING_PRIVATE_KEY` set.
- Uses **tauri-apps/tauri-action** to create/update a GitHub Release and upload the built artifacts and the updater JSON.

Minimal pattern (adjust paths and Node/Rust setup to match your repo):

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    runs-on: macos-latest  # or matrix for macos/ubuntu/windows
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install frontend deps and build
        run: |
          cd cliptool && npm ci && npm run build

      - name: Tauri build and release
        uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          projectPath: clipagent
          tagName: v__VERSION__
          releaseName: 'ClipAgent v__VERSION__'
          releaseBody: 'See the assets to download.'
          releaseDraft: true
          args: '--target aarch64-apple-darwin'  # or matrix
```

- **tagName: v__VERSION__** — the action replaces `__VERSION__` with the version from `tauri.conf.json` (e.g. `0.1.0`). So when you push tag `v0.1.0`, the release and assets are for that version.
- **releaseDraft: true** — release is created as a draft; you can publish it after checking.
- **uploadUpdaterJson** is `true` by default, so the action will generate and upload **latest.json** for the updater.

After the workflow runs, the release’s **latest** download URL for `latest.json` will be:

`https://github.com/YOUR_ORG/klipprr/releases/latest/download/latest.json`

That must match the `endpoints` URL you put in **tauri.conf.json** in step 2.

---

## 5. Releasing a new version

1. Bump **version** in:
   - **clipagent/src-tauri/tauri.conf.json** (`version`)
   - **clipagent/src-tauri/Cargo.toml** (`version`).
2. Commit and push.
3. Create and push a **tag** matching the version, e.g. `v0.2.0`:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. The workflow runs, builds the app with the private key, creates/updates the release, and uploads artifacts + **latest.json**.
5. Optionally open the release, check the draft, then publish it.

Installed apps that have **Check for updates** and the correct `endpoints`/`pubkey` will see the new version and can install it.

---

## Troubleshooting

- **“Update check failed”**  
  - Endpoint URL in `tauri.conf.json` must be exactly the GitHub `latest.json` URL (see step 2).  
  - For **releases/latest**, the release must be **published** (not draft) so that “latest” points to it.

- **No updater artifacts / missing latest.json**  
  - Build must run with `TAURI_SIGNING_PRIVATE_KEY` set (local or `TAURI_SIGNING_PRIVATE_KEY` secret in GitHub).  
  - `createUpdaterArtifacts: true` must be set in `tauri.conf.json` (already done).

- **Signature verification failed**  
  - The **public** key in `tauri.conf.json` must match the key pair of the **private** key used when building.  
  - Replacing the private key (e.g. new secret) requires updating the public key in config and shipping a new app version that uses it.

- **Bump version**  
  - After changing the public key or the endpoint, bump the app version and release a new build so all users get the new updater config.
