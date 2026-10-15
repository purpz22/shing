'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 Table
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) {
    c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(8 + len + 4);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.subarray(4, 8 + len));
  buf.writeUInt32BE(crc, 8 + len);
  return buf;
}

function encodePng(width, height, getPixel) {
  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(width, 0);
  IHDR.writeUInt32BE(height, 4);
  IHDR.writeUInt8(8, 8);
  IHDR.writeUInt8(6, 9);
  IHDR.writeUInt8(0, 10);
  IHDR.writeUInt8(0, 11);
  IHDR.writeUInt8(0, 12);

  const raw = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const deflated = zlib.deflateSync(raw);
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    header,
    chunk('IHDR', IHDR),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hexToRgba(hex, alpha = 255) {
  const h = hex.replace('#', '');
  const num = parseInt(h, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
}

// -------------------------------------------------------------
// 1. SHING CHIBI GIRL GENERATOR
// -------------------------------------------------------------
const SW = 34, SH = 42, CX = 15.5;

function createGrid(w, h, fillVal = '.') {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
}

function buildShingSprite(eyes, mouth) {
  const g = createGrid(SW, SH, '.');
  const set = (x, y, k) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < SW && y >= 0 && y < SH) g[y][x] = k;
  };
  const setS = (x, y, k) => {
    set(x, y, k);
    set(Math.round(2 * CX - x), y, k);
  };
  const ellipse = (cx, cy, rx, ry, k, test) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!test || test(x, y))) set(x, y, k);
      }
    }
  };

  // Back twintails hair layer
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = 8 + t * 21;
    const r = 2.8 - t * 1.3;
    const k = y > 22 ? 'd' : 'H';
    ellipse(3.5 - t, y, r, r, k);
    ellipse(27.5 + t, y, r, r, k);
  }

  // Head outline & skin fill
  for (let dy = -7; dy <= 6; dy++) {
    const py = 12 + dy;
    const rx = Math.sqrt(Math.max(0, 1 - (dy / 8) * (dy / 8))) * 7.5;
    for (let px = Math.round(CX - rx); px <= Math.round(CX + rx); px++) {
      set(px, py, 's');
    }
  }

  // Hair Base (Forehead & Bangs)
  for (let dy = -7; dy <= 0; dy++) {
    const py = 12 + dy;
    const rx = Math.sqrt(Math.max(0, 1 - (dy / 8) * (dy / 8))) * 7.5;
    for (let px = Math.round(CX - rx); px <= Math.round(CX + rx); px++) {
      set(px, py, 'H');
    }
  }

  // Cute zigzag bangs / fringe
  const fringe = [0, 1, 2, 1];
  for (let x = 8; x <= 23; x++) {
    const bottom = 9 + fringe[x % 4];
    for (let y = 4; y <= bottom; y++) {
      set(x, y, 'H');
    }
  }

  // Hair shine highlight
  for (let x = 11; x <= 20; x++) {
    if (x >= 12 && x <= 15) set(x, 5, 'h');
    if (x >= 17 && x <= 19) set(x, 5, 'h');
  }

  // Twintails side tufts
  setS(7, 7, 'H');
  setS(8, 8, 'H');
  setS(7, 9, 'd');
  setS(6, 11, 'H');
  setS(5, 13, 'H');
  setS(4, 15, 'd');

  // Hair Ribbons
  for (const x0 of [2, 27]) {
    for (let dy = 0; dy <= 2; dy++) {
      for (let dx = 0; dx <= 2; dx++) set(x0 + dx, 6 + dy, 'r');
    }
    set(x0 + 1, 7, 'c');
  }

  // Eyes
  if (eyes === 'open') {
    setS(11, 12, 'o');
    setS(12, 12, 'E');
    setS(13, 12, 'e');
    setS(11, 13, 'o');
    setS(12, 13, 'L');
    setS(13, 13, 'E');
    setS(12, 14, 'o');
  } else {
    // Closed smiling arc eyes
    setS(10, 13, 'o');
    setS(11, 12, 'o');
    setS(12, 12, 'o');
    setS(13, 13, 'o');
  }

  // Cheeks blush
  setS(9, 14, 'b');
  setS(10, 14, 'b');

  // Mouth
  if (mouth === 'open') {
    // Joyful talking open mouth with pink tongue
    set(CX - 1, 16, 'o');
    set(CX, 16, 'o');
    set(CX + 1, 16, 'o');
    set(CX - 1, 17, 't');
    set(CX, 17, 't');
    set(CX + 1, 17, 't');
    set(CX, 18, 'o');
  } else {
    // Closed sweet smile
    set(CX - 1, 16, 'o');
    set(CX, 17, 'o');
    set(CX + 1, 16, 'o');
  }

  // Body Hoodie
  for (let dy = 0; dy <= 12; dy++) {
    const py = 19 + dy;
    for (let px = Math.round(CX - 5.5); px <= Math.round(CX + 5.5); px++) {
      set(px, py, 'C');
    }
  }
  // Zipper & collar
  for (let dx = -2; dx <= 2; dx++) set(CX + dx, 19, 'c');
  set(CX, 21, 'k');
  set(CX, 22, 'k');
  set(CX, 23, 'k');
  set(CX, 24, 'k');

  // Arms & Sleeve Cuffs
  for (let dy = 0; dy <= 5; dy++) {
    setS(9, 23 + dy, 'C');
    setS(8, 24 + dy, 'C');
  }
  setS(8, 29, 'c');
  setS(9, 29, 'c');

  // Skirt / legs
  for (let dy = 0; dy <= 5; dy++) {
    setS(13, 32 + dy, 's');
    setS(14, 32 + dy, 's');
  }
  // Cute Shoes
  setS(13, 37, 'c');
  setS(14, 37, 'c');
  setS(13, 38, 'o');
  setS(14, 38, 'o');

  // Add 1px crisp outline around everything
  const withOutline = createGrid(SW, SH, '.');
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      withOutline[y][x] = g[y][x];
    }
  }
  for (let y = 0; y < SH; y++) {
    for (let x = 0; x < SW; x++) {
      if (g[y][x] === '.') {
        const hasNeighbor = (y > 0 && g[y - 1][x] !== '.') ||
                            (y < SH - 1 && g[y + 1][x] !== '.') ||
                            (x > 0 && g[y][x - 1] !== '.') ||
                            (x < SW - 1 && g[y][x + 1] !== '.');
        if (hasNeighbor) withOutline[y][x] = 'o';
      }
    }
  }
  return withOutline;
}

const SHING_PALETTE = {
  '.': [0, 0, 0, 0],
  'o': hexToRgba('#1a0f2e'), // Dark Plum Outline
  's': hexToRgba('#ffe3d6'), // Soft Peach Skin
  'b': hexToRgba('#ff9fbf'), // Sweet Blush
  'e': hexToRgba('#ffffff'), // Sparkle Eye Highlight
  'E': hexToRgba('#4a148c'), // Deep Purple Iris
  'L': hexToRgba('#9c6bff'), // Lavender Lower Iris Glow
  'H': hexToRgba('#7b3fe4'), // Amethyst Base Hair
  'h': hexToRgba('#b48cff'), // Hair Highlight
  'd': hexToRgba('#4b1fa0'), // Hair Shadow
  'C': hexToRgba('#9b5cf0'), // Pastel Violet Hoodie
  'c': hexToRgba('#d9c2ff'), // Soft Lavender Cuff & Trim
  'k': hexToRgba('#6a35c2'), // Darker Zipper Accent
  'r': hexToRgba('#ff7eb9'), // Rose Ribbon
  't': hexToRgba('#ff4d6d')  // Tongue Pink
};

// -------------------------------------------------------------
// 2. COZY PIXEL CAT GENERATOR (CALICO NEKO)
// -------------------------------------------------------------
const CW = 36, CH = 34;

function buildCatSprite(eyes, mouth) {
  const g = createGrid(CW, CH, '.');
  const set = (x, y, k) => {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && x < CW && y >= 0 && y < CH) g[y][x] = k;
  };
  const ellipse = (cx, cy, rx, ry, k, test) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1 && (!test || test(x, y))) set(x, y, k);
      }
    }
  };

  const cx = 17.5;

  // Tail on the left (curling up)
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const tx = 6.0 - t * 3.5;
    const ty = 25.0 - t * 11.0;
    ellipse(tx, ty, 2.0, 2.0, t > 0.6 ? 'w' : 'p2');
  }

  // Torso / Body (Chubby Calico)
  ellipse(cx, 24, 11, 7, 'w');
  // Body Shadow
  for (let x = 7; x <= 28; x++) {
    if (g[29] && g[29][x] === 'w') set(x, 29, 'fs');
    if (g[30] && g[30][x] === 'w') set(x, 30, 'fs');
  }
  // Calico Body Patches
  ellipse(cx - 7, 24, 4, 4, 'p1'); // Peach patch left
  ellipse(cx + 6, 23, 4, 4, 'p2'); // Violet patch right

  // Front Paws
  ellipse(cx - 5, 29, 3, 2, 'w');
  ellipse(cx + 5, 29, 3, 2, 'w');
  set(cx - 5, 30, 'fs');
  set(cx + 5, 30, 'fs');

  // Bell Collar
  for (let x = cx - 7; x <= cx + 7; x++) set(x, 19, 'r');
  ellipse(cx, 21, 2, 2, 'gold');
  set(cx, 21, 'o');

  // Cat Head
  // Left Ear (Peach patch)
  for (let dy = -8; dy <= 0; dy++) {
    const wE = (dy + 8) * 0.9;
    for (let dx = -wE; dx <= wE; dx++) {
      set(cx - 7 + dx, 11 + dy, 'p1');
    }
  }
  // Left Inner Ear Pink
  for (let dy = -5; dy <= -1; dy++) {
    const wE = (dy + 5) * 0.5;
    for (let dx = -wE; dx <= wE; dx++) set(cx - 7 + dx, 11 + dy, 'pk');
  }

  // Right Ear (Violet patch)
  for (let dy = -8; dy <= 0; dy++) {
    const wE = (dy + 8) * 0.9;
    for (let dx = -wE; dx <= wE; dx++) {
      set(cx + 7 + dx, 11 + dy, 'p2');
    }
  }
  // Right Inner Ear Pink
  for (let dy = -5; dy <= -1; dy++) {
    const wE = (dy + 5) * 0.5;
    for (let dx = -wE; dx <= wE; dx++) set(cx + 7 + dx, 11 + dy, 'pk');
  }

  // Cranium (Big round cute head)
  ellipse(cx, 11, 12, 9, 'w');
  // Forehead Patches
  ellipse(cx - 6, 8, 5, 4, 'p1');
  ellipse(cx + 6, 8, 5, 4, 'p2');

  // Strawberry Beret on head
  for (let dy = -3; dy <= 0; dy++) {
    for (let dx = -7; dx <= 5; dx++) set(cx - 2 + dx, 3 + dy, 'rb');
  }
  set(cx - 2, 0, 'gr'); // Leaf stem
  set(cx - 1, 0, 'gr');
  set(cx - 3, 1, 'gr');

  // Cheeks Blush
  ellipse(cx - 7, 14, 2, 1, 'bl');
  ellipse(cx + 7, 14, 2, 1, 'bl');

  // Whiskers
  set(cx - 13, 13, 'o'); set(cx - 14, 12, 'o');
  set(cx - 13, 15, 'o'); set(cx - 14, 16, 'o');
  set(cx + 13, 13, 'o'); set(cx + 14, 12, 'o');
  set(cx + 13, 15, 'o'); set(cx + 14, 16, 'o');

  // Eyes
  if (eyes === 'open') {
    // Mint Emerald Eyes with White Sparkle
    for (const ex of [cx - 5, cx + 5]) {
      ellipse(ex, 11, 2.5, 3, 'o');
      ellipse(ex, 11, 2, 2.5, 'eye');
      set(ex - 1, 10, 'e'); // Top glint
      set(ex, 10, 'e');
      set(ex + 1, 12, 'e'); // Bottom glint
    }
  } else {
    // Happy Closed Eye Arcs (^ ^)
    for (const ex of [cx - 5, cx + 5]) {
      set(ex - 2, 12, 'o');
      set(ex - 1, 11, 'o');
      set(ex, 11, 'o');
      set(ex + 1, 11, 'o');
      set(ex + 2, 12, 'o');
    }
  }

  // Nose
  set(cx, 13, 'pk');

  // Mouth
  if (mouth === 'open') {
    // Open happy triangular cat mouth
    set(cx - 2, 14, 'o');
    set(cx - 1, 14, 't');
    set(cx, 14, 't');
    set(cx + 1, 14, 't');
    set(cx + 2, 14, 'o');

    set(cx - 2, 15, 'o');
    set(cx - 1, 15, 't');
    set(cx, 15, 't');
    set(cx + 1, 15, 't');
    set(cx + 2, 15, 'o');

    set(cx - 1, 16, 'o');
    set(cx, 16, 't');
    set(cx + 1, 16, 'o');

    set(cx, 17, 'o');
  } else {
    // Cute closed 'w' cat mouth
    set(cx - 2, 15, 'o');
    set(cx - 1, 14, 'o');
    set(cx, 15, 'o');
    set(cx + 1, 14, 'o');
    set(cx + 2, 15, 'o');
  }

  // 1px Outline pass
  const withOutline = createGrid(CW, CH, '.');
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) withOutline[y][x] = g[y][x];
  }
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      if (g[y][x] === '.') {
        const hasNeighbor = (y > 0 && g[y - 1][x] !== '.') ||
                            (y < CH - 1 && g[y + 1][x] !== '.') ||
                            (x > 0 && g[y][x - 1] !== '.') ||
                            (x < CW - 1 && g[y][x + 1] !== '.');
        if (hasNeighbor) withOutline[y][x] = 'o';
      }
    }
  }
  return withOutline;
}

const CAT_PALETTE = {
  '.': [0, 0, 0, 0],
  'o': hexToRgba('#1e162b'), // Dark Plum Outline
  'w': hexToRgba('#ffffff'), // Pure White Fur
  'fs': hexToRgba('#d8cee8'), // Lavender Fur Shade
  'p1': hexToRgba('#ffae8a'), // Sunset Peach Patch
  'p2': hexToRgba('#9d8df1'), // Nebula Violet Patch
  'pk': hexToRgba('#ffb3c6'), // Soft Rose Pink Nose/Ears
  'bl': hexToRgba('#ff8fa3'), // Cheek Blush
  'eye': hexToRgba('#00e5a3'), // Mint Emerald Iris
  'e': hexToRgba('#ffffff'), // Eye Glint White
  't': hexToRgba('#ff4d6d'), // Tongue Pink
  'r': hexToRgba('#ff3366'), // Collar Red Ribbon
  'rb': hexToRgba('#ff4d6d'), // Strawberry Beret
  'gr': hexToRgba('#38b000'), // Beret Green Leaf
  'gold': hexToRgba('#ffdc33') // Gold Bell
};

// -------------------------------------------------------------
// BAKE PNG FILES
// -------------------------------------------------------------
function bakeSpriteToPng(grid, palette, scale, padX = 20, padY = 20) {
  const gh = grid.length;
  const gw = grid[0].length;
  const targetW = gw * scale + padX * 2;
  const targetH = gh * scale + padY * 2;

  return encodePng(targetW, targetH, (px, py) => {
    const gx = Math.floor((px - padX) / scale);
    const gy = Math.floor((py - padY) / scale);
    if (gx < 0 || gx >= gw || gy < 0 || gy >= gh) return [0, 0, 0, 0];
    const key = grid[gy][gx];
    return palette[key] || [0, 0, 0, 0];
  });
}

function main() {
  const outDir = path.join(__dirname, '..', 'assets', 'pngtuber');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log('Generating Shing Chibi & Cozy Pixel Cat PNGTuber assets in:', outDir);

  // 1. Shing Chibi (Preset: shing)
  const shingIdle = buildShingSprite('open', 'neutral');
  const shingBlink = buildShingSprite('closed', 'neutral');
  const shingTalk = buildShingSprite('open', 'open');
  const shingTalkBlink = buildShingSprite('closed', 'open');

  fs.writeFileSync(path.join(outDir, 'shing_idle.png'), bakeSpriteToPng(shingIdle, SHING_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(outDir, 'shing_blink.png'), bakeSpriteToPng(shingBlink, SHING_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(outDir, 'shing_talk.png'), bakeSpriteToPng(shingTalk, SHING_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(outDir, 'shing_talk_blink.png'), bakeSpriteToPng(shingTalkBlink, SHING_PALETTE, 12, 32, 32));
  console.log('Baked Shing Chibi frames (shing_*.png)');

  // 2. Cozy Pixel Cat (Preset: pixelcat)
  const catIdle = buildCatSprite('open', 'closed');
  const catBlink = buildCatSprite('closed', 'closed');
  const catTalk = buildCatSprite('open', 'open');
  const catTalkBlink = buildCatSprite('closed', 'open');

  fs.writeFileSync(path.join(outDir, 'pixelcat_idle.png'), bakeSpriteToPng(catIdle, CAT_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(outDir, 'pixelcat_blink.png'), bakeSpriteToPng(catBlink, CAT_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(outDir, 'pixelcat_talk.png'), bakeSpriteToPng(catTalk, CAT_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(outDir, 'pixelcat_talk_blink.png'), bakeSpriteToPng(catTalkBlink, CAT_PALETTE, 12, 32, 32));
  console.log('Baked Cozy Pixel Cat frames (pixelcat_*.png)');

  // Remove old popcat files if present
  const popClosed = path.join(outDir, 'popcat_closed.png');
  const popOpen = path.join(outDir, 'popcat_open.png');
  if (fs.existsSync(popClosed)) fs.unlinkSync(popClosed);
  if (fs.existsSync(popOpen)) fs.unlinkSync(popOpen);
  console.log('Removed popcat files!');
}

main();
