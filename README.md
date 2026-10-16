# T3 Code Nightly with Claude prompt suggestions

> **Unofficial build.** This fork republishes every [T3 Code](https://github.com/pingdotgg/t3code) nightly with one extra feature added. It is not made or supported by the T3 team. Report problems with it here, not upstream.

**[Download the latest patched nightly](https://github.com/danielyc/t3code/releases)**

## What it adds

After a Claude turn, the composer shows Claude's suggested next prompt as ghost text, like the Claude Code CLI does. **→** (Right Arrow) or **Tab** puts it in your draft without sending it, and **Esc** hides it. The suggestion comes from the Claude Agent SDK's own `promptSuggestions` option, so it costs no extra model call.

This is [pingdotgg/t3code#17618](https://github.com/pingdotgg/t3code/pull/17618), which was closed because upstream is not taking feature PRs right now. Background: [discussion #6839](https://github.com/pingdotgg/t3code/discussions/6839).

## How it stays current

Every hour a scheduled job checks for a new upstream nightly and starts a [workflow](.github/workflows/patched-nightly.yml) that applies the patch and builds macOS, Windows and Linux (x64 and arm64). A new patched nightly usually follows the official one within an hour or two, with the same version number. A release is only published when every platform built.

The app updates itself from this fork's releases, so once installed it stays on the patched nightly.

## Install

1. Download the file for your system from the [latest release](https://github.com/danielyc/t3code/releases):
   - macOS: `…-arm64.dmg` (Apple Silicon) or `…-x64.dmg` (Intel)
   - Windows: `…-x64.exe` or `…-arm64.exe`
   - Linux: `…-x86_64.AppImage` or `…-arm64.AppImage`
2. Install it over your existing T3 Code (Nightly). It keeps your threads and settings.
3. Turn it on: **Settings → Providers → Claude → Prompt suggestions**. It is off by default.

## Going back to the official nightly

You can switch back at any time. Your threads, projects and settings stay where they are.

1. Open [pingdotgg/t3code releases](https://github.com/pingdotgg/t3code/releases) and pick the newest release whose name contains `nightly` (not `preview`). Download the same kind of file as above.
2. Quit T3 Code.
3. Install the official build over the patched one:
   - macOS: open the DMG and drag T3 Code (Nightly) to Applications, choosing **Replace**.
   - Windows: run the installer.
   - Linux: use the official AppImage and delete the patched one.
4. Start it. From then on it updates from upstream again, never from this fork.

On macOS the official app may ask for keychain access once, as when you switched. The official build ignores the Prompt suggestions setting, so if you ever come back here you may need to turn it on again. The `~/.claude/settings.json` change below can stay or go: the Claude Code CLI uses the same setting.

## Getting suggestions as often as possible

Claude Code decides when to offer a suggestion. It never offers one on the first turn of a new session, in plan mode, after an API error, or when your plan's usage limit is reached. Close to the usage limit it also holds them back unless you opt in.

To keep them on as much as Claude allows, add this to `~/.claude/settings.json`:

```json
{
  "promptSuggestionEnabled": true,
  "env": {
    "CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION": "true"
  }
}
```

Merge the keys into your existing file rather than replacing it. New Claude sessions pick it up; running ones keep their old setting.

## Limitations

- **Claude only.** Other providers show no suggestions.
- **Desktop app only.** The web app, `npx t3`, the CLI and the mobile app are the official versions. Suggestions appear only for environments served by the patched desktop app itself, not for remote environments running an official server.
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

A T3 Code scheduled task checks these runs every six hours. When one fails, it fixes the cause (for example by merging upstream `main` into a patch branch and adapting the patch), pushes only when the patch's tests and typechecks pass, and runs the workflow again. To do it by hand: merge upstream `main` into the patch branch, resolve, push, and run the workflow from the Actions tab.

Patch branches:

- `feat/claude-prompt-ghost-text`: the prompt suggestions feature.
- `fork/mac-signing-without-passkey-profile`: lets a Developer ID without T3's passkey profile sign the macOS app.

Repository secrets for macOS signing: `CSC_LINK` (base64 Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (contents of the App Store Connect `.p8`), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.
