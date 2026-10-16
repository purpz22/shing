# Design Specification: Multi-Frame Conversational Talking Animation & Natural Resting Mouth for PNGTuber Studio

## 1. Intent & Problem Statement
In Shing Live, the PNGTuber Studio and OBS overlay (`/overlays/pngtuber.html`) currently operate on a static 2-pose talking paradigm: silent (`idle` with closed lips) and talking (`talk` with wide open lips). 

When a streamer speaks continuously, the avatar's mouth stays frozen wide open without any movement until the microphone signal drops below the threshold and the hold delay expires. This creates a stiff, robotic impression. Furthermore, quiet and soft-spoken streamers find volume-scaled mouth sizing frustrating, as low-amplitude speech causes erratic flickering between tiny openings and closed lips.

### Requirements & Key Insights:
1. **Multi-Frame Conversational Mouth-Flap Cycle**:
   - The avatar must actively animate through multiple mouth shapes while speaking, cycling smoothly between partially open and fully open mouth states at a standard conversational tempo (approximately 120ms to 130ms per step).
   - The cycle runs as long as voice is detected above the sensitivity threshold, without requiring the streamer to shout or modulate voice volume.
2. **Natural Pause Settle (Resting Mouth)**:
   - When the streamer pauses to breathe or finishes a thought, the mouth must not snap shut instantly. Instead, it lingers on a soft, slightly parted resting mouth (`talk_half`) during the hold-delay buffer before gently closing to `idle`.
3. **Seamless Blinking Integration**:
   - Blinking must occur naturally at all times without interrupting speech or causing mouth desynchronization. Both the partially open and fully open mouth states must have corresponding closed-eye blink frames.
4. **Pixel-Locked Asset Quality & Alpha Integrity**:
   - All newly generated frames must be geometrically registered onto the exact same base anime portrait, pixel-locked across face, hair, ears, earrings, neck, and cardigan.
   - Clean continuous hair-ink alpha matting with white-halo color decontamination, quantized to 256-color RGBA PNGs under 60 KB.
5. **Low-End PC & Laptop Optimization**:
   - Zero-overhead timer loop, Web Audio `fftSize = 256`, 25Hz audio polling, zero CSS `filter: drop-shadow(...)` on animated containers, and upfront asynchronous texture decoding (`img.decode()`).
6. **Strict Formatting**:
   - Strictly 0 emojis in code, styles, templates, comments, or schemas.

---

## 2. Animation State Machine & Timing

### A. State Taxonomy
| State Name | Eyes | Mouth | Purpose | Asset Key (`images.*`) |
|---|---|---|---|---|
| `idle` | Open | Closed smile | Silent resting state | `idle` |
| `blink` | Closed | Closed smile | Natural idle blink | `blink` |
| `talk_half` | Open | Slightly parted lips | In-between talking & breath pause | `talkHalf` |
| `talk_half_blink`| Closed | Slightly parted lips | Talking blink in half-open state | `talkHalfBlink` |
| `talk_open` | Open | Wide open | Full vocalization frame | `talk` |
| `talk_blink` | Closed | Wide open | Talking blink in full-open state | `talkBlink` |
| `happy` | Joyful | Beaming smile + blush | TikTok stream gift reaction | `happy` |

### B. Conversational Mouth Flap Sequence
When microphone audio level exceeds `threshold`:
1. **Speech Onset**:
   - Immediate transition: `idle` -> `talk_half`.
   - Starts active flap interval timer (`talkFlapInterval = 120ms`).
2. **Flap Cadence**:
   - The flap index cycles through: `[talk_half, talk_open, talk_half, talk_open, ...]`.
   - Each step takes ~120ms (standard conversational cadence).
3. **Blink Concurrency**:
   - If the independent blink timer fires while talking:
     - If current mouth is `talk_half` -> render `talkHalfBlink`.
     - If current mouth is `talk_open` -> render `talkBlink`.
     - Once blink duration (~140ms) ends, eyes restore to open while mouth flap sequence continues smoothly.
4. **Speech Release & Natural Pause Settle**:
   - When volume drops below threshold, the avatar transitions to `talk_half` (softly parted resting lips) and holds this position throughout the `holdDelay` window (default 180ms, adjustable 50-1000ms).
   - Only after `holdDelay` has fully elapsed does the mouth smoothly return to `idle` (closed).
   - If speech resumes before `holdDelay` expires, the flap cycle immediately continues from `talk_half` without an awkward closed-mouth jump.

### C. Happy Gift Reaction Priority
- When a TikTok Live `gift` event is received (or `pngtuber:happy` event triggered):
  - Highest priority: displays `happy` frame for 3500ms alongside the celebration jump.
  - Mouth flapping is paused during the gift reaction and resumes seamlessly once the reaction window completes.

---

## 3. Asset Specifications & Generation

### A. Asset Files
1. **Shing Anime Portrait (Default Preset)**:
   - `desktop/assets/pngtuber/shing_idle.png` (Existing, 56 KB)
   - `desktop/assets/pngtuber/shing_blink.png` (Existing, 55 KB)
   - `desktop/assets/pngtuber/shing_talk_half.png` (New: slightly parted lips, open eyes, ~55 KB)
   - `desktop/assets/pngtuber/shing_talk_half_blink.png` (New: slightly parted lips, closed eyes, ~55 KB)
   - `desktop/assets/pngtuber/shing_talk.png` (Existing, 56 KB)
   - `desktop/assets/pngtuber/shing_talk_blink.png` (Existing, 55 KB)
   - `desktop/assets/pngtuber/shing_happy.png` (Existing, 57 KB)
2. **Cozy Pixel Cat (Pixel Art Preset)**:
   - `desktop/assets/pngtuber/pixelcat_idle.png` (Existing, 5 KB)
   - `desktop/assets/pngtuber/pixelcat_blink.png` (Existing, 5 KB)
   - `desktop/assets/pngtuber/pixelcat_talk_half.png` (New: half-open mouth, ~5 KB)
   - `desktop/assets/pngtuber/pixelcat_talk_half_blink.png` (New: half-open mouth + blink, ~5 KB)
   - `desktop/assets/pngtuber/pixelcat_talk.png` (Existing, 5 KB)
   - `desktop/assets/pngtuber/pixelcat_talk_blink.png` (Existing, 5 KB)
   - `desktop/assets/pngtuber/pixelcat_happy.png` (Existing, 5 KB)

### B. Geometric Pixel-Locking Matrix
- Source resolution: 1024 x 846, target display: 520 x 430.
- Mouth bounding box: center X = 496, center Y = 490 (tilted 11 degrees clockwise).
- Pixel replacement applies strictly to the inner mouth and lips region.
- Solid character interior:
  - Face core, ears, earrings, neck, and cardigan remain 100% frozen between frames.
  - White hair-fringe alpha decontamination ensures zero dark fringing or halo ringing against dark stream backgrounds.

---

## 4. Software Architecture & Implementation Details

### A. Settings Schema (`desktop/settings.json` & `overlayServer.js`)
Extend `pngtuber.images` and add optional cadence configuration:
```json
{
  "pngtuber": {
    "enabled": true,
    "preset": "shing",
    "mode": "multi-frame",
    "images": {
      "idle": "/assets/pngtuber/shing_idle.png",
      "blink": "/assets/pngtuber/shing_blink.png",
      "talkHalf": "/assets/pngtuber/shing_talk_half.png",
      "talkHalfBlink": "/assets/pngtuber/shing_talk_half_blink.png",
      "talk": "/assets/pngtuber/shing_talk.png",
      "talkBlink": "/assets/pngtuber/shing_talk_blink.png",
      "happy": "/assets/pngtuber/shing_happy.png"
    },
    "talkCadence": 120,
    "threshold": 22,
    "holdDelay": 180,
    "bounceStyle": "veadotube",
    "bounceHeight": 16,
    "scale": 1.0,
    "positionX": 50,
    "positionY": 85,
    "blinkInterval": 3.5,
    "blinkDuration": 140,
    "sensitivity": 1.2,
    "reactToGifts": true,
    "inputDeviceId": "default"
  }
}
```

### B. Standalone OBS Overlay (`desktop/overlays/pngtuber.html` & `pngtuber.html`)
1. **Preloading**:
   - `preloadedImages` map extended to include `talkHalf` and `talkHalfBlink`.
   - Asynchronous pre-decoding via `img.decode()` ensures zero render latency on state changes.
2. **Talking Flap Engine**:
   - `isTalking` triggers a lightweight `setInterval` or timestamp delta updating `mouthPhase` (`0 = half, 1 = open`).
   - `isPaused` flag activates when volume drops below threshold, pinning `mouthPhase` to `0` (`talkHalf`) until `holdDelay` expires.
3. **State Resolution Function**:
   ```javascript
   function resolveFrame() {
     if (isHappy && config.images.happy) return config.images.happy;
     if (isTalking || isPaused) {
       const isHalf = (isPaused || mouthPhase === 0);
       if (isHalf) {
         if (isBlinking && config.images.talkHalfBlink) return config.images.talkHalfBlink;
         return config.images.talkHalf || config.images.talk || config.images.idle;
       } else {
         if (isBlinking && config.images.talkBlink) return config.images.talkBlink;
         return config.images.talk || config.images.idle;
       }
     }
     if (isBlinking && config.images.blink) return config.images.blink;
     return config.images.idle;
   }
   ```

### C. Desktop Dashboard Studio (`desktop/renderer/index.html` & `app.js`)
1. **Live Stage Preview**:
   - Synchronizes with the exact same multi-frame conversational mouth-flap cycle.
   - Stage status badge updates dynamically (`IDLE`, `TALKING`, `BLINKING`, `PAUSED / REST`, `HAPPY GIFT`).
2. **Studio Avatar Slots**:
   - Expand slot grid or provide slots for:
     - 1. Idle (Neutral)
     - 2. Idle Blink
     - 3. Talking Parted (Half-Open)
     - 4. Talking Full (Open)
     - 5. Talking Blink
     - 6. Happy Gift
   - Drag-and-drop and file browser bindings for all slots.
3. **Backward Compatibility**:
   - If custom avatar sets omit `talkHalf` or `talkHalfBlink`, gracefully fallback to standard 2-frame or 4-frame behavior without errors.

### D. Builder Architecture Decisions & Protocol Contracts
1. **Asset Pipeline & Zero External Runtime Dependencies**:
   - Pre-generate and check in static PNG assets (`shing_talk_half.png`, `shing_talk_half_blink.png`, `pixelcat_talk_half.png`, `pixelcat_talk_half_blink.png`) into `desktop/assets/pngtuber/`.
   - The desktop app and OBS overlay consume static PNG files directly; no native image processing C++ bindings (Sharp, node-canvas) are added to production dependencies.
2. **Dashboard UI 6-Slot Grid**:
   - The Studio Avatar Slots UI features 6 visible upload dropzones:
     - 1. Idle (Closed Mouth)
     - 2. Blink Idle (Closed Eyes)
     - 3. Talking Parted (Half-Open Mouth)
     - 4. Talking Full (Open Mouth)
     - 5. Talking Blink (Open Mouth Blink)
     - 6. Happy Gift (Reaction)
   - For custom user uploads, `talkHalfBlink` automatically falls back to `talkBlink` (or `talkHalf`) if not provided, avoiding UI clutter while supporting full 7-frame capabilities for built-in presets.
3. **WebSocket State Protocol (`pngtuber:state`)**:
   - Speech Active: `{ talking: true, paused: false, state: 'talk' }`
   - Speech Pause / Hold Delay: `{ talking: true, paused: true, state: 'paused' }`
   - Silence / Return to Idle: `{ talking: false, paused: false, state: 'idle' }`
   - The overlay server validates and broadcasts `paused` (boolean). OBS browser sources listen to `paused` to settle on `talk_half` during phrase pauses without dropping the speaking bounce.
4. **Dashboard Mode Toggle (3 Options)**:
   - Expand the mode pill toggle to 3 options: `[ 2-Frame ] [ 4-Frame ] [ Multi-Frame ]`.
   - `2-frame`: Forces 2 poses (idle, talk).
   - `4-frame`: Traditional 4 poses (idle, blink, talk, talkBlink).
   - `multi-frame`: Active conversational mouth-flap cycle (`talk_half` <-> `talk`) + resting mouth pause settle. Default is `multi-frame`.

---

## 5. Non-Goals
- Full 3D face tracking or webcam facial recognition (this is a lightweight 2D PNGTuber suited for low-end hardware).
- Phoneme-level viseme speech recognition (e.g. A, I, U, E, O vowel shape classification), which requires heavy ML neural models that would overheat low-end dual-core laptops.
- Cloud hosting dependencies (everything runs locally and offline).

---

## 6. Verification & Testing Plan
1. **Asset Integrity Test**:
   - Verify all newly added PNG assets exist, pass PNG magic byte checks, remain under 100 KB, and are visually distinct from existing frames.
2. **Animation Engine Unit Tests**:
   - Test mouth phase transitions across onset, steady speaking, brief speech pauses (resting half-open hold), hold expiration (closed return), and blink superposition.
3. **Server & Settings Sync Tests**:
   - Verify `getDefaultSettings()` and `loadSettings()` default schema includes `talkHalf` and `talkHalfBlink`.
   - Verify settings persistence and WebSocket broadcast.
4. **Dashboard UI Tests**:
   - Verify all DOM elements, slot dropzones, test buttons, and status badges exist and handle drag-and-drop.
5. **Zero Emojis Verification**:
   - Regex scan across all touched code, styles, templates, comments, and schemas.
