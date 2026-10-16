'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG CRC32 Table
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

function crc32(b) {
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
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
  IHDR.writeUInt8(6, 9); // RGBA color type
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
  const def = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', IHDR),
    chunk('IDAT', def),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function unfilterPngRgba(buf) {
  let offset = 8;
  let idatList = [];
  let width, height, bitDepth, colorType, plte, trns;
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idatList.push(data);
    offset += 8 + len + 4;
  }
  const uncompressed = zlib.inflateSync(Buffer.concat(idatList));
  const bpp = 1;
  const stride = width * bpp;
  const rawIndices = Buffer.alloc(width * height);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
  }
  for (let y = 0; y < height; y++) {
    const filter = uncompressed[y * (stride + 1)];
    const rawStart = y * (stride + 1) + 1;
    const destStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = uncompressed[rawStart + x];
      const left = x >= bpp ? rawIndices[destStart + x - bpp] : 0;
      const up = y > 0 ? rawIndices[(y - 1) * stride + x] : 0;
      const upLeft = (y > 0 && x >= bpp) ? rawIndices[(y - 1) * stride + x - bpp] : 0;
      let val = filter === 0 ? raw :
                filter === 1 ? (raw + left) & 0xff :
                filter === 2 ? (raw + up) & 0xff :
                filter === 3 ? (raw + Math.floor((left + up)/2)) & 0xff :
                (raw + paeth(left, up, upLeft)) & 0xff;
      rawIndices[destStart + x] = val;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = rawIndices[i];
    rgba[i * 4] = plte[idx * 3];
    rgba[i * 4 + 1] = plte[idx * 3 + 1];
    rgba[i * 4 + 2] = plte[idx * 3 + 2];
    rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
  }
  return { width, height, rgba };
}

// Pixel Cat generation helpers
function hexToRgba(hex, alpha = 255) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b, alpha];
}

const CAT_PALETTE = {
  '.': [0, 0, 0, 0],
  'o': hexToRgba('#1e162b'),
  'w': hexToRgba('#ffffff'),
  'fs': hexToRgba('#d8cee8'),
  'p1': hexToRgba('#ffae8a'),
  'p2': hexToRgba('#9d8df1'),
  'pk': hexToRgba('#ffb3c6'),
  'bl': hexToRgba('#ff8fa3'),
  'eye': hexToRgba('#00e5a3'),
  'e': hexToRgba('#ffffff'),
  't': hexToRgba('#ff4d6d'),
  'r': hexToRgba('#ff3366'),
  'rb': hexToRgba('#ff4d6d'),
  'gr': hexToRgba('#38b000'),
  'gold': hexToRgba('#ffdc33')
};

function buildCatSprite(eyes = 'open', mouth = 'half') {
  const CW = 36;
  const CH = 34;
  const g = Array.from({ length: CH }, () => Array(CW).fill('.'));

  function set(x, y, colorKey) {
    if (x >= 0 && x < CW && y >= 0 && y < CH) g[y][x] = colorKey;
  }

  function rect(x, y, w, h, colorKey) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, colorKey);
    }
  }

  function ellipse(cx, cy, rx, ry, colorKey) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1.0) set(x, y, colorKey);
      }
    }
  }

  const cx = 17;

  // Body
  ellipse(cx, 24, 11, 7, 'w');
  ellipse(cx, 26, 11, 5, 'fs');
  ellipse(cx, 23, 10, 6, 'w');

  // Calico Patch on Body
  ellipse(cx + 6, 23, 4, 4, 'p1');

  // Tail
  ellipse(cx + 12, 21, 2.5, 4, 'p1');
  ellipse(cx + 13, 19, 2, 3, 'w');

  // Paws
  ellipse(cx - 5, 30, 2.5, 2, 'w');
  ellipse(cx + 5, 30, 2.5, 2, 'w');

  // Collar Ribbon
  rect(cx - 7, 18, 14, 2, 'r');
  ellipse(cx, 20, 2, 2, 'gold');

  // Head Base
  ellipse(cx, 10, 13, 9, 'w');
  ellipse(cx, 13, 13, 6, 'fs');
  ellipse(cx, 9, 12, 8, 'w');

  // Cheek Fluff
  ellipse(cx - 12, 12, 2.5, 2.5, 'w');
  ellipse(cx + 12, 12, 2.5, 2.5, 'w');

  // Ears
  ellipse(cx - 9, 3, 3.5, 4, 'p2');
  ellipse(cx - 9, 4, 2, 2.5, 'pk');
  ellipse(cx + 9, 3, 3.5, 4, 'p1');
  ellipse(cx + 9, 4, 2, 2.5, 'pk');

  // Cheek Blush
  rect(cx - 9, 13, 3, 2, 'bl');
  rect(cx + 7, 13, 3, 2, 'bl');

  // Strawberry Beret
  ellipse(cx - 3, 1, 7, 4, 'rb');
  set(cx - 3, -1, 'gr');
  set(cx - 2, -1, 'gr');
  set(cx - 4, -1, 'gr');
  set(cx - 5, 2, 'e');
  set(cx - 1, 2, 'e');
  set(cx - 3, 3, 'e');

  // Eyes
  if (eyes === 'open') {
    for (const ex of [cx - 5, cx + 5]) {
      ellipse(ex, 11, 2, 2.5, 'eye');
      set(ex - 1, 10, 'e');
      set(ex, 10, 'e');
      set(ex + 1, 12, 'e');
    }
  } else {
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
  } else if (mouth === 'half') {
    // Cute parted cat mouth (smaller opening showing tongue pink)
    set(cx - 2, 14, 'o');
    set(cx - 1, 14, 't');
    set(cx, 14, 't');
    set(cx + 1, 14, 't');
    set(cx + 2, 14, 'o');

    set(cx - 1, 15, 'o');
    set(cx, 15, 't');
    set(cx + 1, 15, 'o');

    set(cx, 16, 'o');
  } else {
    // Cute closed 'w' cat mouth
    set(cx - 2, 15, 'o');
    set(cx - 1, 14, 'o');
    set(cx, 15, 'o');
    set(cx + 1, 14, 'o');
    set(cx + 2, 15, 'o');
  }

  // 1px Outline pass
  const withOutline = Array.from({ length: CH }, () => Array(CW).fill('.'));
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

function bakeSpriteToPng(grid, palette, scale = 12, padX = 32, padY = 32) {
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

function composeShingTalkHalf(baseRgba, talkRgba, width, height) {
  const out = Buffer.from(baseRgba);

  for (let y = 265; y <= 282; y++) {
    for (let x = 254; x <= 290; x++) {
      const idx = (y * width + x) * 4;
      const relY = (y - 265) / 15;
      if (relY <= 0.65) {
        const srcY = Math.round(265 + (relY / 0.65) * 12);
        const srcIdx = (srcY * width + x) * 4;
        const dx = (x - 272) / 16;
        const dy = (y - 271) / 6;
        const d2 = dx * dx + dy * dy;
        if (d2 <= 1.0) {
          const blend = Math.min(1.0, Math.max(0.0, (1.0 - d2) * 2.5));
          out[idx] = Math.round(talkRgba[srcIdx] * blend + baseRgba[idx] * (1 - blend));
          out[idx + 1] = Math.round(talkRgba[srcIdx + 1] * blend + baseRgba[idx + 1] * (1 - blend));
          out[idx + 2] = Math.round(talkRgba[srcIdx + 2] * blend + baseRgba[idx + 2] * (1 - blend));
          out[idx + 3] = 255;
        }
      }
    }
  }

  return encodePng(width, height, (x, y) => {
    const i = (y * width + x) * 4;
    return [out[i], out[i + 1], out[i + 2], out[i + 3]];
  });
}

function main() {
  const assetsDir = path.join(__dirname, '..', 'assets', 'pngtuber');
  console.log('Generating talk_half and talk_half_blink assets in:', assetsDir);

  // 1. Cozy Pixel Cat talk_half and talk_half_blink
  const catTalkHalf = buildCatSprite('open', 'half');
  const catTalkHalfBlink = buildCatSprite('closed', 'half');

  fs.writeFileSync(path.join(assetsDir, 'pixelcat_talk_half.png'), bakeSpriteToPng(catTalkHalf, CAT_PALETTE, 12, 32, 32));
  fs.writeFileSync(path.join(assetsDir, 'pixelcat_talk_half_blink.png'), bakeSpriteToPng(catTalkHalfBlink, CAT_PALETTE, 12, 32, 32));
  console.log('Baked Cozy Pixel Cat talk_half frames.');

  // 2. Shing anime portrait talk_half and talk_half_blink
  const idle = unfilterPngRgba(fs.readFileSync(path.join(assetsDir, 'shing_idle.png')));
  const blink = unfilterPngRgba(fs.readFileSync(path.join(assetsDir, 'shing_blink.png')));
  const talk = unfilterPngRgba(fs.readFileSync(path.join(assetsDir, 'shing_talk.png')));

  const shingTalkHalf = composeShingTalkHalf(idle.rgba, talk.rgba, idle.width, idle.height);
  const shingTalkHalfBlink = composeShingTalkHalf(blink.rgba, talk.rgba, blink.width, blink.height);

  fs.writeFileSync(path.join(assetsDir, 'shing_talk_half.png'), shingTalkHalf);
  fs.writeFileSync(path.join(assetsDir, 'shing_talk_half_blink.png'), shingTalkHalfBlink);
  console.log('Baked Shing anime portrait talk_half frames.');
}

main();
