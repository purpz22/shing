# Shing Studio

Pastel purple streaming companion and OBS overlays for TikTok Live streamers.

## Features
- **TikTok Live Connection**: Real-time webcast push connection with avatar verification.
- **Glass Gift Jar**: Matter.js 2D physics transparent jar where gifts drop, bounce, and stack.
- **Cute Chat Overlay**: Speech bubble chat with animated avatar shapes and configurable message count caps.
- **Interactive Chibi Companion**: Pixel art chibi girl with 6 hairstyles and cats that react to gifts, follows, and chats.
- **Triggers & Alerts**: Multi-tier alert banners with accurate TikTok coins currency badges.
- **Lower Third**: Animated banner displaying streamer social media handles.
- **In-App Auto-Updater**: One-click update checking, in-app installation, and release notes history.

## Development & Running
```bash
cd desktop
npm install
npm start
```

## Packaging Updates
To package a new release for streamers:
```bash
cd desktop
npm run package-update
```
The update archive will be created in `desktop/dist/shing-studio-v{version}.zip`.
