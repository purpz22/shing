# Stream Events Table & Edit Modal Triggers Design Specification

## Summary
Redesign the Triggers & Alerts tab (`#tab-triggers`) in the Shing Live desktop application to provide a clean, compact, TikFinity-style Events table with pre-configured streaming events (`Follow`, `Gift 1+ Coins`, `Big Gift 1,000+ Coins`, `Likes Milestone`, and `Share`), an active/inactive toggle per event, an Edit modal for customized messages, sounds, and video/photo/GIF media, and disable join popup alerts completely so stream overlays are never spammed when viewers join the stream.

---

## 1. Intent & Problem Statement
Streamers managing TikTok Live streams currently face two usability problems:
1. **Cluttered Triggers Tab**: The existing `#tab-triggers` layout stacks large form cards (`Follow Event`, `Gift Event`, `Alert Audio & Timing`, `Sound Library`) all on one page, creating visual friction and requiring excessive scrolling to adjust simple alerts.
2. **Join Alert Spam on Live**: When streaming on TikTok Live, dozens or hundreds of viewers join the room every minute. In `triggers.html`, `data.type === 'join'` triggers on-screen alert cards (`WELCOME TO STREAM: Viewer joined the chat!`), which spams and obstructs the streamer's video feed. Streamers explicitly require that popup alerts do not trigger when viewers join.

---

## 2. Goals & Non-Goals

### Goals
- **Clean Events Table**: Display a compact table on `#tab-triggers` listing all primary streaming events with action buttons (Edit, Test), an Active toggle checkbox, user scope (`Any`), trigger description with vector icon, and action summary.
- **Pre-Configured Core Events**:
  - `Follow`: Alert message, sound, custom video/photo/GIF.
  - `Gift (1+ Coins)`: Alert message with `{user}`, `{gift}`, `{count}`, sound, custom video/photo/GIF.
  - `Big Gift (1,000+ Coins)`: Alert message, sound, custom video/photo/GIF.
  - `Likes Milestone`: Alert message with `{user}`, `{count}`, milestone sound, custom milestone count.
  - `Share`: Alert message with `{user}`, sound, custom video/photo/GIF.
- **Dedicated Edit Modal (`#modal-event-editor`)**: Clicking the Edit icon (pencil) on any row opens a focused, distraction-free modal to customize:
  - Event title badge
  - Alert message template
  - Alert sound selector + Play preview, Search MyInstants, and Local File upload
  - Alert video / photo / GIF upload + live thumbnail status + remove button
  - Quick Test button (fires simulated event to overlay)
  - Save button + Close button
- **Quick Test Buttons**: Each table row includes an inline Test (play icon) button to test alerts directly without opening the modal.
- **Disable Join in Popup Alerts**: Remove `data.type === 'join'` alert display from `desktop/overlays/triggers.html` entirely.
- **Preserve Existing User Settings**: Map all event configurations directly to the existing `settings.json` triggers structure (`triggers.events`, `triggers.followMessage`, `triggers.giftMessage`, `triggers.sounds`, `triggers.followMedia`, `triggers.giftMedia`, etc.) so existing streamer settings are preserved with clean fallbacks.

### Non-Goals
- Complex visual flow-chart node graph editors or custom regex script execution.
- Removing or altering other overlays (Companion, Glass Jar, Chat, Subathon Timer, Lower Third, Top Likers, and Viewer Ranking remain untouched).

---

## 3. UI/UX Architecture

### 3.1 Main View: `#tab-triggers`
The tab replaces multiple scattered cards with two streamlined sections:
1. **Events Table Section (`.events-table-card`)**:
   - Section header: `Events` — `Define what will trigger your alerts on stream.`
   - Quick action bar: Active event count indicator (`5 Active Events`) and `Search MyInstants Online` / `Add Local Sound` shortcuts.
   - Table columns:
     - **Actions**: Edit icon button (opens edit modal), Test icon button (simulates event).
     - **Active**: Checkbox toggle (enables or disables the event; stored in settings).
     - **User**: `Any` (indicates triggers apply to all viewers).
     - **Trigger**: Vector icon + event name (e.g., Follow, Gift 1+ Coins, Big Gift 1000+ Coins, Likes Milestone, Share).
     - **Action(s)**: Formatted badge and summary list of configured actions (e.g. `Follow Alert, Chime, Custom Media` or `Gift Alert, Coin`).
2. **General Settings Card (`.trigger-general-card`)**:
   - Compact bottom card for global parameters:
     - `Alert Display Duration (seconds)` (default 5s, range 2-15s).
     - `Likes Milestone Threshold` (default 50 likes, range 10-1000).
     - `Sound Volume` slider + `Enable Sound Effects` checkbox toggle.

### 3.2 Event Edit Modal (`#modal-event-editor`)
A clean centered modal styled consistent with Shing Live's theme system:
- **Header**: Icon, Event Name (e.g. `Follow Event`), and Close (X) button.
- **Body**:
  - `Alert Message` text input with tag hint (e.g. `Use {user} to display the follower's username.`).
  - `Alert Sound` section:
    - Dropdown with built-in sounds (Chime, Coin, Pop, Level Up, Fanfare, Anime Wow, No Sound).
    - Inline action buttons: Preview (play), Search MyInstants (magnifying glass), Local file upload (tray icon).
  - `Alert Video / Photo / GIF` section:
    - Current media status badge (`None (Default Avatar)` or `Custom Media Attached`).
    - Mini preview box (thumbnail image or video tag when custom media exists).
    - `Choose Video / Photo / GIF` button and `Remove Media` button.
  - Row for event-specific thresholds (if editing `Likes Milestone`, allow adjusting threshold).
- **Footer**:
  - `Test Alert` button (secondary styling, triggers live test event).
  - `Save Changes` button (primary styling, updates state, saves settings, updates table summary, closes modal).

---

## 4. Overlay & Backend Specifications

### 4.1 Popup Alerts Overlay (`desktop/overlays/triggers.html`)
- Remove the `data.type === 'join'` branch in `ws.onmessage`. If a `join` message arrives from the server, it will be ignored by `triggers.html`.
- For `data.type === 'follow'`, check `triggerSettings.events?.follow?.active !== false`. If inactive, suppress alert.
- For `data.type === 'gift'`, check if gift is active (`triggerSettings.events?.gift?.active !== false` or `triggerSettings.events?.gift_big?.active !== false`). If inactive, suppress alert.
- For `data.type === 'like'`, check `triggerSettings.events?.like?.active !== false`. If inactive, suppress alert.
- For `data.type === 'share'`, support `data.type === 'share'` when active (`triggerSettings.events?.share?.active !== false`).

### 4.2 Settings Data Schema
```json
{
  "triggers": {
    "alertDuration": 5,
    "likeThreshold": 50,
    "soundEnabled": true,
    "soundVolume": 0.85,
    "followMessage": "Thank you {user} for following!",
    "giftMessage": "{user} sent {gift} x{count}!",
    "giftBigMessage": "LEGENDARY: {user} sent {gift} x{count}!",
    "likeMessage": "{user} tapped {count} likes!",
    "shareMessage": "Thank you {user} for sharing the stream!",
    "followMedia": "",
    "followMediaType": "",
    "giftMedia": "",
    "giftMediaType": "",
    "giftBigMedia": "",
    "giftBigMediaType": "",
    "shareMedia": "",
    "shareMediaType": "",
    "sounds": {
      "follow": "/assets/sounds/chime.wav",
      "gift": "/assets/sounds/coin.wav",
      "gift_big": "/assets/sounds/fanfare.wav",
      "like": "/assets/sounds/pop.wav",
      "share": "/assets/sounds/chime.wav"
    },
    "events": {
      "follow": { "active": true },
      "gift": { "active": true },
      "gift_big": { "active": true },
      "like": { "active": true },
      "share": { "active": true }
    }
  }
}
```

---

## 5. Backward Compatibility & Migration
- Existing streamer settings (`triggers.followMessage`, `triggers.followMedia`, `triggers.sounds`, etc.) map 1:1 into the new schema.
- If `triggers.events` is missing in an older `settings.json`, it defaults to all events `active: true`.
- Existing alert media and custom audio paths remain 100% functional.
- Zero breaking changes to companion, chat, jar, timer, toplikers, or viewerranking overlays.

---

## 6. Verification Criteria
1. On `#tab-triggers`, the Events table renders 5 distinct rows (`Follow`, `Gift 1+ Coins`, `Big Gift 1,000+ Coins`, `Likes Milestone`, `Share`) with clean icons, active checkboxes, and action summaries.
2. Clicking the pencil icon on any row opens the modal populated with that event's exact message, sound, and media settings.
3. Editing a value in the modal and clicking `Save Changes` updates the settings, reflects the change in the table's Action(s) column, and saves to `settings.json`.
4. Clicking the inline Test button or modal Test button fires the alert in `desktop/overlays/triggers.html`.
5. Toggling an Active checkbox disables the event in settings and prevents alerts for that event in `triggers.html`.
6. Simulated or live `join` events do NOT produce any alert card in `triggers.html`.
7. Syntax checks (`node --check`) pass with 0 errors.
