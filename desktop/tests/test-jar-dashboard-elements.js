'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const htmlPath = fs.existsSync(path.resolve(__dirname, '../renderer/index.html'))
  ? path.resolve(__dirname, '../renderer/index.html')
  : path.resolve('desktop/renderer/index.html');

const cssPath = fs.existsSync(path.resolve(__dirname, '../renderer/styles.css'))
  ? path.resolve(__dirname, '../renderer/styles.css')
  : path.resolve('desktop/renderer/styles.css');

const html = fs.readFileSync(htmlPath, 'utf8');

assert(html.includes('id="jar-preview-stage"'), 'Missing jar-preview-stage');
assert(html.includes('id="jar-drag-target"'), 'Missing jar-drag-target');
assert(html.includes('id="jar-scale-slider"'), 'Missing jar-scale-slider');
assert(html.includes('id="jar-scale-badge"'), 'Missing jar-scale-badge');
assert(html.includes('id="jar-reset-transform-btn"'), 'Missing jar-reset-transform-btn');

const css = fs.readFileSync(cssPath, 'utf8');
assert(css.includes('.jar-stage-preview-16-9'), 'Missing .jar-stage-preview-16-9 CSS rule');
assert(css.includes('.jar-drag-target'), 'Missing .jar-drag-target CSS rule');
assert(css.includes('.jar-drag-overlay'), 'Missing .jar-drag-overlay CSS rule');

console.log('Task 3 dashboard elements test passed!');
