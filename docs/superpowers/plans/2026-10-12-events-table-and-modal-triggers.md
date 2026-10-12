# Events Table & Modal Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Shing Live Triggers tab into a clean TikFinity-style Events table with active toggles, inline test buttons, and an Edit popup modal for custom messages, sounds, and media, while disabling join popup alerts on stream.

**Architecture:** Update `triggers.html` to eliminate join popup spam and respect per-event active flags; rebuild `#tab-triggers` in `index.html` and `styles.css` with a 5-row Events table (`Follow`, `Gift 1+ Coins`, `Big Gift 1,000+ Coins`, `Likes Milestone`, `Share`) and an `#modal-event-editor` modal; wire state management, media uploads, and tests in `app.js` and `main.js`.

**Tech Stack:** Electron 31, Vanilla JavaScript (ES6+), HTML5, CSS3, WebSocket, Node.js.

**Spec:** `docs/superpowers/specs/2026-10-12-events-table-and-modal-triggers-design.md`

## Global Constraints
- No emojis in source code, option labels, HTML templates, comments, or data schemas; use vector SVG icons and descriptive text.
- Never modify files in `C:\Program Files (x86)\Shing Live` directly.
- Maintain 100% backward compatibility with existing `settings.json` keys (`triggers.followMessage`, `triggers.followMedia`, `triggers.sounds`, etc.).
- The join event must not trigger any visual or auditory popup alert in `desktop/overlays/triggers.html`.

## Review Focus
1. **Join Event Suppression**: A `join` WebSocket message arrives during live stream; `triggers.html` must drop it with zero UI change and zero audio playback.
2. **Active Toggle State**: An event toggle is unchecked (`active: false`); incoming events of that type must be ignored by `triggers.html`.
3. **Modal Data Synchronization**: Opening the modal for an event, modifying the message or media, and saving must update `appSettings.triggers`, refresh the table's Action(s) column, and persist to `settings.json`.
4. **Custom Media Upload Inside Modal**: Streamer uploads a video or image inside the modal; preview and badge must update immediately and save with correct media type.
5. **Inline Test Execution**: Clicking the inline play icon or modal Test button must trigger `window.api.simulateEvent` with the configured message, avatar, and media without throwing an error.

---

### Task 1: Update Popup Alerts Overlay to Drop Join Events & Respect Active Flags

**Files:**
- Modify: `desktop/overlays/triggers.html:500-735`
- Test: `desktop/tests/test-triggers-overlay-logic.js`

**Interfaces:**
- Consumes: WebSocket messages `{ type: 'join' | 'follow' | 'gift' | 'like' | 'share', ... }` and `triggerSettings.events`
- Produces: Sanitized alert queue that ignores `join` and honors `active: false` toggles

- [ ] **Step 1: Write the failing test for triggers overlay message processing**

Create `desktop/tests/test-triggers-overlay-logic.js` to test:
- `join` events do not invoke `showAlert`
- `follow`, `gift`, `gift_big`, `like`, `share` check their respective `events[type].active !== false` flag
- `share` event generates a valid alert payload

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-triggers-overlay-logic.js`
Expected: FAIL (handlers not yet updated)

- [ ] **Step 3: Modify `desktop/overlays/triggers.html`**

- Remove the `data.type === 'join'` block from `ws.onmessage`.
- Add active check for `follow`:
  ```javascript
  if (triggerSettings.events && triggerSettings.events.follow && triggerSettings.events.follow.active === false) return;
  ```
- Add active check for `gift` and `gift_big`:
  ```javascript
  const isBig = coins >= 1000;
  const eventKey = isBig ? 'gift_big' : 'gift';
  if (triggerSettings.events && triggerSettings.events[eventKey] && triggerSettings.events[eventKey].active === false) return;
  ```
- Add active check for `like`:
  ```javascript
  if (triggerSettings.events && triggerSettings.events.like && triggerSettings.events.like.active === false) return;
  ```
- Add handler and active check for `share`:
  ```javascript
  else if (data.type === 'share') {
    if (triggerSettings.events && triggerSettings.events.share && triggerSettings.events.share.active === false) return;
    const user = data.nickname || data.user || data.uniqueId || 'Viewer';
    const msgTemplate = triggerSettings.shareMessage || 'Thank you {user} for sharing the stream!';
    const msg = msgTemplate.replace('{user}', user);
    showAlert({
      type: 'share',
      title: 'STREAM SHARED',
      message: msg,
      avatarUrl: data.avatar || '/assets/avatar.png',
      giftIconUrl: null,
      tierClass: 'tier-follow',
      duration: 4.5
    });
  }
  ```
- In `playAlertSound`, add case for `share`:
  ```javascript
  else if (type === 'share') {
    soundUrl = triggerSettings.sounds?.share || '/assets/sounds/chime.wav';
  }
  ```
- In `applyCustomMedia`, support `share`:
  ```javascript
  else if (item.type === 'share' && triggerSettings.shareMedia) {
    mediaUrl = triggerSettings.shareMedia;
    mediaType = triggerSettings.shareMediaType || (/\.(mp4|webm|mov)$/i.test(mediaUrl) ? 'video' : 'image');
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-triggers-overlay-logic.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/overlays/triggers.html desktop/tests/test-triggers-overlay-logic.js
git commit -m "feat: drop join alerts and enforce active event flags in triggers overlay"
```

---

### Task 2: Build Events Table & Modal Markup and Styles

**Files:**
- Modify: `desktop/renderer/index.html:376-581`
- Modify: `desktop/renderer/styles.css`
- Test: `desktop/tests/test-events-table-markup.js`

**Interfaces:**
- Consumes: None
- Produces: `#tab-triggers` table DOM elements (`#events-table-body`, `#modal-event-editor`, etc.)

- [ ] **Step 1: Write test for markup structure**

Create `desktop/tests/test-events-table-markup.js` checking:
- `#tab-triggers` contains `.events-table-card` and table `#events-table`
- `#modal-event-editor` modal exists with input elements (`#event-modal-msg`, `#event-modal-sound`, `#event-modal-media-btn`, `#event-modal-save-btn`, etc.)
- All 5 event rows (`follow`, `gift`, `gift_big`, `like`, `share`) are accounted for

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-events-table-markup.js`
Expected: FAIL

- [ ] **Step 3: Update `desktop/renderer/index.html` and `desktop/renderer/styles.css`**

- In `desktop/renderer/index.html`, replace the form grid in `#tab-triggers` with:
  1. Section Header (`Events`, description: `Define what will trigger your alerts on stream.`)
  2. Quick Toolbar with Active count pill and `Search MyInstants Online` / `Add Local Sound` shortcuts.
  3. Events Table:
     - Headers: `Actions`, `Active`, `User`, `Trigger`, `Action(s)`
     - Body `#events-table-body`
  4. General Settings Card:
     - `Alert Display Duration (seconds)` (`#trig-duration`)
     - `Likes Milestone Threshold` (`#trig-likes-thresh`)
     - `Alert Sound Volume` (`#trig-volume` + `#trig-volume-val`)
     - `Enable Sound Effects on Stream` (`#trig-sound-enabled`)
     - `Save General Settings` button (`#save-triggers-btn`)
  5. Add `#modal-event-editor` modal:
     - Modal header: title `#event-modal-title`, subtitle `#event-modal-desc`, close button `#event-modal-close`
     - Alert Message label + input `#event-modal-msg` + hint `#event-modal-hint`
     - Alert Sound label + select `#event-modal-sound` + preview button `#event-modal-sound-test` + search button `#event-modal-sound-search` + upload button `#event-modal-sound-upload`
     - Video / Photo / GIF label + status badge `#event-modal-media-status` + preview container `#event-modal-media-preview` + upload button `#event-modal-upload-media` + remove button `#event-modal-clear-media`
     - Extra option for likes threshold `#event-modal-likes-row` (conditionally shown for likes)
     - Footer with `#event-modal-test-btn` and `#event-modal-save-btn`
- In `desktop/renderer/styles.css`, add styles for:
  - `.events-table`: clean borders, header styles, padding, hover highlights
  - `.event-row`: flex alignment, transitions
  - `.event-trigger-badge`: icon + text chip
  - `.event-action-badge`: pastel highlight pills for message, sound, media
  - `.btn-icon-table`: compact 28x28 icon buttons for edit and test
  - `#modal-event-editor`: backdrop, centered card, responsive max-width 560px

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-events-table-markup.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/index.html desktop/renderer/styles.css desktop/tests/test-events-table-markup.js
git commit -m "feat: add Events table and Event Editor modal markup and styling"
```

---

### Task 3: Wire Controller Logic, Dynamic Rendering & Modal Workflow

**Files:**
- Modify: `desktop/renderer/app.js`
- Test: `desktop/tests/test-events-controller-logic.js`

**Interfaces:**
- Consumes: `appSettings.triggers` from main process
- Produces: `renderEventsTable()`, `openEventEditorModal(type)`, `saveEventModal()`, active checkbox toggling

- [ ] **Step 1: Write unit test for events table controller logic**

Create `desktop/tests/test-events-controller-logic.js` to verify:
- Default config generates 5 valid event definitions (`follow`, `gift`, `gift_big`, `like`, `share`)
- Summaries format correctly (e.g., sound name, media badge, message preview)
- Toggling active updates `events[key].active`
- Saving modal updates message, sound, and media

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-events-controller-logic.js`
Expected: FAIL

- [ ] **Step 3: Implement controller functions in `desktop/renderer/app.js`**

- Define `EVENT_DEFINITIONS`:
  - `follow`: Name "Follow", icon SVG, default message "Thank you {user} for following!", default sound "/assets/sounds/chime.wav", mediaKey "followMedia"
  - `gift`: Name "Gift (1+ Coins)", icon SVG, default message "{user} sent {gift} x{count}!", default sound "/assets/sounds/coin.wav", mediaKey "giftMedia"
  - `gift_big`: Name "Big Gift (1,000+ Coins)", icon SVG, default message "LEGENDARY: {user} sent {gift} x{count}!", default sound "/assets/sounds/fanfare.wav", mediaKey "giftBigMedia"
  - `like`: Name "Likes Milestone", icon SVG, default message "{user} tapped {count} likes!", default sound "/assets/sounds/pop.wav", mediaKey null
  - `share`: Name "Share", icon SVG, default message "Thank you {user} for sharing the stream!", default sound "/assets/sounds/chime.wav", mediaKey "shareMedia"
- Implement `renderEventsTable()`:
  - Iterates over definitions and builds table rows
  - Checks `appSettings.triggers.events[key].active !== false`
  - Formats action summary chips (Message preview, Sound basename, Media indicator)
  - Binds Edit button to `openEventEditorModal(key)`
  - Binds Test button to fire `window.api.simulateEvent(type, payload)`
  - Binds Active checkbox change to update settings directly and call `saveCurrentSettings()`
- Implement `openEventEditorModal(key)`:
  - Sets active modal key
  - Populates title, icon, message input with tag hint
  - Populates sound select, binds test sound button
  - Populates media preview and status badge
  - Toggles visibility of likes threshold row if `key === 'like'`
  - Shows modal (`#modal-event-editor.classList.add('active')`)
- Implement modal sound and media actions:
  - MyInstants search button in modal sets target to modal sound select and opens search
  - Local sound upload button imports local file and updates modal sound select
  - Media upload button invokes `window.api.selectLocalMedia()` and updates modal preview
  - Media remove button clears modal media
- Implement `saveEventModal()`:
  - Copies values into `appSettings.triggers`
  - Updates `saveCurrentSettings()`
  - Calls `renderEventsTable()`
  - Closes modal and shows toast notification

- [ ] **Step 4: Run test to verify it passes**

Run: `node desktop/tests/test-events-controller-logic.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/renderer/app.js desktop/tests/test-events-controller-logic.js
git commit -m "feat: wire dynamic Events table rendering, active toggles, and Event Editor modal"
```

---

### Task 4: Integrate Share Event in Backend & Verify End-to-End

**Files:**
- Modify: `desktop/main.js`
- Test: `desktop/tests/test-share-event-integration.js`

**Interfaces:**
- Consumes: TikTok connection events and simulated events
- Produces: Broadcast of `share` event and default settings schema update

- [ ] **Step 1: Write integration test for settings schema and share broadcast**

Create `desktop/tests/test-share-event-integration.js` checking:
- Default settings include `triggers.events` with all 5 keys set to `active: true`
- `share` event broadcast format matches overlay expectations

- [ ] **Step 2: Run test to verify it fails**

Run: `node desktop/tests/test-share-event-integration.js`
Expected: FAIL

- [ ] **Step 3: Update `desktop/main.js`**

- In `loadSettings()`, ensure default triggers includes:
  ```javascript
  events: {
    follow: { active: true },
    gift: { active: true },
    gift_big: { active: true },
    like: { active: true },
    share: { active: true }
  },
  shareMessage: 'Thank you {user} for sharing the stream!',
  shareMedia: '',
  shareMediaType: '',
  sounds: {
    ...existing,
    share: '/assets/sounds/chime.wav'
  }
  ```
- In `attachTikTokListeners()`, add listener for `WebcastEvent.SHARE`:
  ```javascript
  conn.on(WebcastEvent.SHARE, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const avatar = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || '../assets/avatar.png';
    const payload = {
      type: 'share',
      user: viewerName,
      nickname: viewerName,
      username: data.user?.displayId || data.uniqueId || '',
      avatar: avatar
    };
    overlayServer.broadcast(payload);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('tiktok:event', payload);
  });
  ```
- In `ipcMain.handle('events:simulate')`, ensure case for `'share'` exists.

- [ ] **Step 4: Run all test suites and syntax check**

Run:
```bash
node --check desktop/main.js
node --check desktop/renderer/app.js
node --check desktop/services/updater.js
node desktop/tests/test-triggers-overlay-logic.js
node desktop/tests/test-events-table-markup.js
node desktop/tests/test-events-controller-logic.js
node desktop/tests/test-share-event-integration.js
```
Expected: All exit code 0.

- [ ] **Step 5: Commit**

```bash
git add desktop/main.js desktop/tests/test-share-event-integration.js
git commit -m "feat: add share event support and default schema in main process"
```

---

### Task 5: Version Bump (v1.3.4), Package Update & GitHub Push

**Files:**
- Modify: `desktop/package.json`
- Modify: `desktop/releases.json`
- Modify: `desktop/renderer/app.js`
- Generate: `desktop/updates/shing-live-v1.3.4.zip`

- [ ] **Step 1: Bump version to 1.3.4**

- Update `package.json` version to `1.3.4`.
- Add `1.3.4` release entry in `desktop/releases.json` and `desktop/renderer/app.js` changelog modal.

- [ ] **Step 2: Run `package-update.ps1` to build update zip**

Run: `powershell -ExecutionPolicy Bypass -File ./desktop/package-update.ps1 -Version "1.3.4"`
Expected: Created `shing-live-v1.3.4.zip`, updated `releases.json` with hash and size.

- [ ] **Step 3: Commit and Push to origin/main**

```bash
git add desktop/package.json desktop/releases.json desktop/renderer/app.js desktop/updates/shing-live-v1.3.4.zip
git commit -m "Release v1.3.4: Events Table UI with Edit Modal and Disable Join Popup Alerts"
git push origin main
```

- [ ] **Step 4: Verify remote manifest availability**

Verify via HTTP that `releases.json` returns `1.3.4` and zip download URL returns HTTP 200.
