# /pet @username Chat Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow TikTok Live stream viewers to type `/pet @username` (or `/pet`) in chat to trigger the Pet-Pet Headpat animation on the mentioned user's profile avatar, or on the streamer if no user is specified.

**Architecture:** In `desktop/main.js`, parse incoming chat comments for the `/pet` command pattern. If a target is provided (`/pet @username`), fetch or resolve the target user's TikTok profile avatar and dispatch a `headpat:trigger` event with caption `Patted by @sender! *pat pat*`. If no username is provided (`/pet`), default to patting the streamer. In `desktop/server/overlayServer.js`, add `triggerOnCommand: true` to default settings. In `desktop/renderer/index.html` and `app.js`, add an "On /pet Command" toggle and test button to the Pet-Pet Headpat card.

**Tech Stack:** Node.js, Electron IPC, WebSocket, Vanilla JS, HTML5 Canvas/CSS3, PowerShell packaging.

**Spec:**
- Chat command: `/pet @username`, `/pet username`, or `/pet` (case-insensitive).
- Target: Mentioned user's profile picture; if `/pet` alone, target the streamer.
- Caption: `Patted by @sender! *pat pat*`.
- Cooldown: 3-second cooldown to avoid chat spam flooding.
- Toggle: `triggerOnCommand` in `appSettings.headpat` (default `true`).
- No emojis in code or templates.

---

### Task 1: /pet Command Parser & Logic Engine

**Files:**
- Modify: `desktop/main.js`
- Test: `desktop/tests/test-pet-command-parser.js`

- [ ] **Step 1: Write unit test for /pet command parser**

Create `desktop/tests/test-pet-command-parser.js` verifying:
- Regex matches `/pet`, `/pet @username`, `/PET @User`, `/pet   user123`.
- Correctly parses target username when present, and identifies when target is omitted.
- Generates caption `Patted by ${sender}! *pat pat*`.
- Cooldown helper prevents repeated command executions within 3 seconds.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-pet-command-parser.js`
Expected: FAIL

- [ ] **Step 3: Implement /pet parsing in `desktop/main.js`**

- In `desktop/main.js` inside `attachTikTokListeners` under `conn.on(WebcastEvent.CHAT)`:
  - Check if `commentText` matches `/^\/pet(?:\s+@?([\w.-]+))?/i`.
  - Check if `overlayServer.settings.headpat?.triggerOnCommand !== false`.
  - Check cooldown timestamp.
  - If target specified, resolve avatar via `fetchTikTokProfile` with fallback.
  - If no target specified, target streamer with streamer's avatar and username.
  - Broadcast `headpat:trigger` payload to `overlayServer` and `mainWindow`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-pet-command-parser.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/test-pet-command-parser.js
git commit -m "feat: implement /pet @username chat command parsing and avatar resolution"
```

---

### Task 2: Dashboard UI & Server Defaults

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/app.js`
- Modify: `desktop/server/overlayServer.js`
- Test: `desktop/tests/test-pet-command-ui.js`

- [ ] **Step 1: Write unit test for UI elements and server defaults**

Create `desktop/tests/test-pet-command-ui.js` verifying:
- `#headpat-on-command` checkbox exists in `desktop/renderer/index.html`.
- `#test-headpat-cmd-btn` exists in `desktop/renderer/index.html`.
- `overlayServer.getDefaultSettings().headpat.triggerOnCommand === true`.
- `overlayServer` constructor initializes `triggerOnCommand` fallback.

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-pet-command-ui.js`
Expected: FAIL

- [ ] **Step 3: Update `index.html`, `app.js`, and `overlayServer.js`**

- In `desktop/renderer/index.html`:
  - Add `<label class="checkbox-label inline-chk"><input type="checkbox" id="headpat-on-command" checked> On /pet Command</label>`.
  - Add `<button class="btn btn-secondary btn-xs" id="test-headpat-cmd-btn">Test /pet @user</button>`.
- In `desktop/renderer/app.js`:
  - In `initSettings()`, set `$('headpat-on-command').checked = appSettings.headpat?.triggerOnCommand !== false`.
  - Wire change event on `headpat-on-command` to update `appSettings.headpat.triggerOnCommand` and save.
  - Wire click on `test-headpat-cmd-btn` to simulate `/pet @Gojo` chat event.
- In `desktop/server/overlayServer.js`:
  - Add `triggerOnCommand: true` to `getDefaultSettings().headpat`.
  - Add fallback in constructor for `triggerOnCommand`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-pet-command-ui.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/index.html desktop/renderer/app.js desktop/server/overlayServer.js desktop/tests/test-pet-command-ui.js
git commit -m "feat: add /pet command toggle and test button in dashboard"
```

---

### Task 3: Full Verification Suite, Version Bump (v1.4.9) & Release

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/releases.json`
- Modify: `desktop/renderer/app.js`
- Generate: `desktop/updates/shing-live-v1.4.9.zip`

- [ ] **Step 1: Bump version to 1.4.9**

- Update `package.json` version to `1.4.9`.
- Add `1.4.9` release entry to `desktop/releases.json` and `openChangelogModal()` in `desktop/renderer/app.js`.

- [ ] **Step 2: Run all test suites and syntax check**

Run:
```bash
node --check desktop/main.js
node --check desktop/renderer/app.js
node --check desktop/server/overlayServer.js
node desktop/tests/test-pet-command-parser.js
node desktop/tests/test-pet-command-ui.js
```
Expected: All exit 0.

- [ ] **Step 3: Run `package-update.ps1` to build update package**

Run: `powershell -ExecutionPolicy Bypass -File ./desktop/package-update.ps1 -Version "1.4.9"`
Expected: Created `shing-live-v1.4.9.zip`, updated `releases.json` with hash and size.

- [ ] **Step 4: Commit and Push to origin/main**

```bash
git add desktop/package.json desktop/releases.json desktop/renderer/app.js desktop/updates/shing-live-v1.4.9.zip docs/superpowers/plans/2026-10-12-pet-chat-command.md
git commit -m "Release v1.4.9: /pet @username TikTok Live Chat Command"
git push origin main
```

- [ ] **Step 5: Verify remote availability**

Verify via HTTP that `releases.json` returns `latest: 1.4.9` and zip download URL returns HTTP 200/206.
