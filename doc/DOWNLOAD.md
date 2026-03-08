# Making the app available for download (macOS)

Step-by-step for what **you** need to do so the app is downloadable from the site (macOS only for now).

---

## 1. One-time: Signing and GitHub secrets

So that builds are signed and notarized (macOS won’t block them):

- **Tauri updater key**  
  - Generate: from `clipagent/src-tauri` run  
    `cargo tauri signer generate -w ~/.tauri/clipagent.key`  
  - Put the **public** key in `clipagent/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.  
  - Add the **private** key as a GitHub Actions secret:  
    **Settings → Secrets and variables → Actions → New repository secret**  
    Name: `TAURI_SIGNING_PRIVATE_KEY`, Value: contents of `~/.tauri/clipagent.key`.

- **Apple signing + notarization** (optional but recommended)  
  Add these repository secrets (see **doc/UPDATES.md** for details):  
  `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

- **Supabase (for frontend build)**  
  The release workflow builds the cliptool frontend; it needs your Supabase URL and anon key so the app can talk to Supabase at runtime.  
  In GitHub: **Settings → Secrets and variables → Actions → Variables** → **New repository variable**  
  Add:  
  - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL (e.g. `https://xxx.supabase.co`)  
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase anon (public) key  

  (Same values you use for the website or in cliptool `.env`.)

---

## 2. One-time: Updater endpoint

In **clipagent/src-tauri/tauri.conf.json**, under `plugins.updater.endpoints`, use your repo’s latest updater manifest, e.g.:

```json
"endpoints": [
  "https://github.com/Fredddzik/klipprr/releases/latest/download/latest.json"
]
```

(Replace org/repo if different.)

---

## 3. Create a release (every time you want a new build)

1. **Bump version** (if you want a new version number)  
   - **clipagent/src-tauri/tauri.conf.json** → `"version": "0.1.0"` (or next, e.g. `0.1.1`).  
   - Optionally keep **clipagent/ui/package.json** in sync.

2. **Commit and push**  
   - Commit the version bump (and any other changes).

3. **Tag and push the tag**  
   Use the same version as in tauri.conf (e.g. `v0.1.0`, `v0.1.1`).  
   **Important:** The release workflow builds **the commit the tag points to**. If you fixed something on `main` and your tag was created earlier, delete and re-push the tag so it points to the latest commit:
   ```bash
   git tag -d v0.1.0
   git push origin :refs/tags/v0.1.0
   git tag v0.1.0
   git push origin v0.1.0
   ```
   Otherwise just: `git tag v0.1.0 && git push origin v0.1.0`

4. **Wait for the workflow**  
   - **Actions** tab → “Release” workflow runs on the tag.  
   - It builds the macOS app (Apple Silicon), creates a **GitHub Release**, and uploads the `.dmg` (and updater artifacts).  
   - When it’s green, the app is available at:  
     **https://github.com/Fredddzik/klipprr/releases/latest**

---

## 4. Site (download page and deployment)

- The **website-klipprr** app already has a **/download** page that points to the latest release (and, if available, a direct “Download .dmg” button).
- **Deploy the site** (e.g. Vercel) so **klipprr.com** (or your domain) is live.  
  - Ensure the homepage “Download for Mac” and the **/download** route are deployed.
- No extra config is needed for “macOS only”: the download page and release workflow are macOS-only for now.

---

## Summary

| Step | What you do |
|------|------------------|
| 1 | Add Tauri signer key (public in config, private in GitHub secret). Optionally add Apple secrets. |
| 2 | Set `plugins.updater.endpoints` in tauri.conf.json to your repo’s `latest.json` URL. |
| 3 | Bump version → commit → `git tag vX.Y.Z` → `git push origin vX.Y.Z`. Wait for Release workflow. |
| 4 | Deploy website-klipprr so the site (and /download) is live. |

After that, **releases/latest** and the site’s download page will offer the latest macOS build. For later releases, repeat step 3 (and 4 only if you change the site).
