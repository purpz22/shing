'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing /pet Command Parser & Logic Engine...');

// Test 1: Regex matches command patterns
const PET_CMD_REGEX = /^\/pet(?:\s+@?([\w.-]+))?$/i;

// Match with target username with @
const m1 = '/pet @gojo'.match(PET_CMD_REGEX);
assert.ok(m1, 'Must match /pet @gojo');
assert.strictEqual(m1[1], 'gojo');

// Match with target username without @
const m2 = '/pet shimmy_ming'.match(PET_CMD_REGEX);
assert.ok(m2, 'Must match /pet shimmy_ming');
assert.strictEqual(m2[1], 'shimmy_ming');

// Match case-insensitively
const m3 = '/PET @CatLover99'.match(PET_CMD_REGEX);
assert.ok(m3, 'Must match /PET @CatLover99');
assert.strictEqual(m3[1], 'CatLover99');

// Match /pet alone (target omitted -> pet streamer)
const m4 = '/pet'.match(PET_CMD_REGEX);
assert.ok(m4, 'Must match /pet alone');
assert.strictEqual(m4[1], undefined);

// Do not match random text containing /pet
const m5 = 'hello /pet'.match(PET_CMD_REGEX);
assert.strictEqual(m5, null, 'Must not match when /pet is not at start');

// Test 2: Verify desktop/main.js has /pet command handling
const mainJsPath = path.join(__dirname, '..', 'main.js');
const mainJs = fs.readFileSync(mainJsPath, 'utf8');

assert.ok(mainJs.includes('/pet'), 'main.js must reference /pet command');
assert.ok(mainJs.includes('headpat:trigger'), 'main.js must trigger headpat:trigger event');
assert.ok(mainJs.includes('Patted by'), 'main.js must format Patted by caption');

console.log('All /pet Command Parser tests passed successfully!');
