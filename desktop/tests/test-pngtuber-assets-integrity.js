'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing PNGTuber Multi-Frame Asset Integrity & Signatures...');

const dir = path.join(__dirname, '..', 'assets', 'pngtuber');
const required = [
  'shing_idle.png',
  'shing_blink.png',
  'shing_talk_half.png',
  'shing_talk_half_blink.png',
  'shing_talk.png',
  'shing_talk_blink.png',
  'shing_happy.png',
  'pixelcat_idle.png',
  'pixelcat_blink.png',
  'pixelcat_talk_half.png',
  'pixelcat_talk_half_blink.png',
  'pixelcat_talk.png',
  'pixelcat_talk_blink.png',
  'pixelcat_happy.png'
];

for (const name of required) {
  const filePath = path.join(dir, name);
  assert.ok(fs.existsSync(filePath), `Asset ${name} must exist in desktop/assets/pngtuber`);
  const buf = fs.readFileSync(filePath);
  // PNG Magic bytes check: 89 50 4E 47 0D 0A 1A 0A
  assert.strictEqual(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${name} must be a valid PNG file`);
  assert.ok(buf.length > 500, `${name} must not be empty or truncated`);
  assert.ok(buf.length < 100000, `${name} must be under 100 KB for low-end PC streaming (got ${buf.length} bytes)`);

  // Verify IHDR width and height
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `${name} must have valid dimensions`);

  if (name.startsWith('shing_')) {
    assert.strictEqual(width, 520, `${name} width must match Shing portrait standard (520px)`);
    assert.strictEqual(height, 430, `${name} height must match Shing portrait standard (430px)`);
  } else if (name.startsWith('pixelcat_')) {
    assert.strictEqual(width, 496, `${name} width must match Pixel Cat standard (496px)`);
    assert.strictEqual(height, 472, `${name} height must match Pixel Cat standard (472px)`);
  }
}

console.log('All 14 PNGTuber multi-frame assets verified successfully with 100% integrity!');
