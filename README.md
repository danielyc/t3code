# T3 Code nightly, patched

This branch only holds the [Patched nightly](.github/workflows/patched-nightly.yml) workflow. Every hour it checks [pingdotgg/t3code](https://github.com/pingdotgg/t3code) for a new nightly, applies the branches in `PATCH_BRANCHES`, and publishes builds for macOS, Windows and Linux (x64 and arm64 each) as a prerelease of this fork. macOS builds are signed and notarized; Windows and Linux builds are unsigned, so Windows shows a SmartScreen warning on first install.

Patches:

- `feat/claude-prompt-ghost-text`: Claude's suggested next prompt as ghost text in the composer ([#17618](https://github.com/pingdotgg/t3code/pull/17618)).
- `fork/mac-signing-without-passkey-profile`: lets a Developer ID without T3's passkey profile sign the app. Passkeys in the in-app browser are left out on macOS.

An installed build updates itself from this fork's releases, so it stays on the patched nightly. A release is only published when every platform built.

When a patch stops applying, the run fails and names the conflicting files. Merge upstream `main` into that branch, resolve, push, and run the workflow again from the Actions tab.

Repository secrets: `CSC_LINK` (base64 Developer ID Application `.p12`), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (contents of the App Store Connect `.p8`), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER`.
