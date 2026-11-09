# T3 Code Nightly with keep context warm

> **Prompt suggestions are now in official T3 Code.** Upstream added a suggested next prompt for Claude and Codex in [pingdotgg/t3code#28047](https://github.com/pingdotgg/t3code/pull/28047), first shipped in nightly `v0.1.8-nightly.20261109.4399`. Turn it on in **Settings → Labs → Suggest next prompt**. This fork no longer maintains its own prompt suggestions patch; patched nightlies from that version on use upstream's feature. To keep using keep context warm, stay on this build. If you only came for prompt suggestions, install the official nightly from [pingdotgg/t3code releases](https://github.com/pingdotgg/t3code/releases) (see [Going back to the official nightly](#going-back-to-the-official-nightly)). On macOS you must install it manually: the official build is signed by a different developer, so the patched app cannot update to it on its own.

> **Unofficial build.** This fork republishes every [T3 Code](https://github.com/pingdotgg/t3code) nightly with an extra feature added. It is not made or supported by the T3 team. Report problems with it here, not upstream.

**[Download the latest patched nightly](https://github.com/danielyc/t3code/releases)**

## What it adds

**Keep context warm.** Claude's prompt cache lasts about an hour on a subscription and 5 minutes with an API key. While a Claude thread is idle, T3 Code can send it a short message just before the cache expires, so your next message reads the conversation from cache instead of paying for it again. Each message is a short turn that counts toward your usage, shown as a collapsed **Kept context warm** row. Turn it on per Claude provider (**Settings → Providers → Claude → Keep context warm**, off by default), or per thread with the **Keep context warm** switch in the thread details card.

## How it stays current

Every hour a scheduled job checks for a new upstream nightly and starts a [workflow](.github/workflows/patched-nightly.yml) that applies the patch and builds macOS, Windows and Linux (x64 and arm64). A new patched nightly usually follows the official one within an hour or two, with the same version number. A release is only published when every platform built.

The app updates itself from this fork's releases, so once installed it stays on the patched nightly.

## Install

1. Download the file for your system from the [latest release](https://github.com/danielyc/t3code/releases):
   - macOS: `…-arm64.dmg` (Apple Silicon) or `…-x64.dmg` (Intel)
   - Windows: `…-x64.exe` or `…-arm64.exe`
   - Linux: `…-x86_64.AppImage` or `…-arm64.AppImage`
2. Install it over your existing T3 Code (Nightly). It keeps your threads and settings.
3. Turn it on: **Settings → Providers → Claude → Keep context warm**. It is off by default.

## Going back to the official nightly

You can switch back at any time. Your threads, projects and settings stay where they are.

1. Open [pingdotgg/t3code releases](https://github.com/pingdotgg/t3code/releases) and pick the newest release whose name contains `nightly` (not `preview`). Download the same kind of file as above.
2. Quit T3 Code.
3. Install the official build over the patched one:
   - macOS: open the DMG and drag T3 Code (Nightly) to Applications, choosing **Replace**.
   - Windows: run the installer.
   - Linux: use the official AppImage and delete the patched one.
4. Start it. From then on it updates from upstream again, never from this fork.

On macOS the official app may ask for keychain access once, as when you switched. The official build ignores the Keep context warm setting, so if you ever come back here you may need to turn it on again.

## Limitations

- **Claude only.** Other providers never keep their context warm.
- **Desktop app only.** The web app, `npx t3`, the CLI and the mobile app are the official versions. Keep context warm works only for environments served by the patched desktop app itself, not for remote environments running an official server.
- **Replaces the official Nightly.** It uses the same app name, settings and data, so the two cannot be installed side by side.
- **Can lag behind.** When an upstream change conflicts with the patch, no patched build appears until the conflict is fixed, and your app stays on the last patched version.
- **Nightly channel only.** Switching the update channel to stable in the app's settings finds no updates here.
- **macOS** builds are signed and notarized with my own Developer ID, not T3's.
  - The first launch after switching from the official app may ask for keychain access once. Choose Always Allow.
  - Permissions such as screen recording may need to be granted again.
  - Passkey sign-in inside T3 Code's built-in browser is not available, because it needs T3's own signing profile.
- **Windows** builds are unsigned, so SmartScreen warns on first install (More info → Run anyway). The WSL backend is not included.
- **Linux** builds are AppImages only.

## Maintenance

Patch branches:

- `fork/mac-signing-without-passkey-profile`: lets a Developer ID without T3's passkey profile sign the macOS app.
- `feat/keep-context-warm`: the keep context warm feature.

Repository secrets for macOS signing: `CSC_LINK` (base64 Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (contents of the App Store Connect `.p8`), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.
