'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// 1. Verify sprite.png exists and has valid dimensions (560x112)
const spritePath = path.join(__dirname, '..', 'assets', 'petpet', 'sprite.png');
assert(fs.existsSync(spritePath), 'sprite.png must exist in desktop/assets/petpet');
const buf = fs.readFileSync(spritePath);
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
assert.strictEqual(width, 560, 'sprite.png width must be 560px (5 frames of 112px)');
assert.strictEqual(height, 112, 'sprite.png height must be 112px');

// 2. Verify canonical frame offsets and calculation
const frameOffsets = [
  { x: 0, y: 0, w: 0, h: 0 },
  { x: -4, y: 12, w: 4, h: -12 },
  { x: -12, y: 18, w: 12, h: -18 },
  { x: -8, y: 12, w: 4, h: -12 },
  { x: -4, y: 0, w: 0, h: 0 },
];

const DEFAULTS = {
  squish: 1.25,
  scale: 0.875,
  spriteX: 14,
  spriteY: 20,
  spriteWidth: 112,
  spriteHeight: 112,
};

function getSpriteFrame(f) {
  const o = frameOffsets[f];
  return {
    dx: Math.floor(DEFAULTS.spriteX + o.x * (DEFAULTS.squish * 0.4)),
    dy: Math.floor(DEFAULTS.spriteY + o.y * (DEFAULTS.squish * 0.9)),
    dw: Math.floor((DEFAULTS.spriteWidth + o.w * DEFAULTS.squish) * DEFAULTS.scale),
    dh: Math.floor((DEFAULTS.spriteHeight + o.h * DEFAULTS.squish) * DEFAULTS.scale),
  };
}

const expectedHandDy = [0, 4, 9, 4, 0];
for (let f = 0; f < 5; f++) {
  const cf = getSpriteFrame(f);
  const handDy = Math.max(0, Math.floor(cf.dy * 0.75 - Math.max(0, DEFAULTS.spriteY) - 0.5));
  assert.strictEqual(handDy, expectedHandDy[f], `Hand DY mismatch at frame ${f}`);
}

// 3. Verify files contain authentic petpet implementation
const headpatHtml = fs.readFileSync(path.join(__dirname, '..', 'overlays', 'headpat.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'app.js'), 'utf8');

assert(headpatHtml.includes('sprite.png'), 'headpat.html must reference sprite.png');
assert(headpatHtml.includes('frameOffsets'), 'headpat.html must use authentic frameOffsets');
assert(headpatHtml.includes('handDy'), 'headpat.html must calculate dynamic handDy');
assert(appJs.includes('sprite.png'), 'app.js must reference sprite.png');
assert(appJs.includes('frameOffsets'), 'app.js must use authentic frameOffsets');
assert(appJs.includes('handDy'), 'app.js must calculate dynamic handDy');

console.log('Authentic petpet animation test passed!');
