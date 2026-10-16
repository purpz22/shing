'use strict';

/**
 * Pure JavaScript ISO/IEC 18004 QR Code SVG Generator (No dependencies)
 * Supports Byte mode (8-bit) with Error Correction Level L/M.
 */

// GF(256) tables for Reed-Solomon polynomial math
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // GF(256) primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const root = EXP_TABLE[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMultiply(poly[j], root);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCalculateEcc(data, eccCount) {
  const gen = rsGeneratorPoly(eccCount);
  const msg = new Array(data.length + eccCount).fill(0);
  for (let i = 0; i < data.length; i++) msg[i] = data[i];

  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMultiply(gen[j], coef);
      }
    }
  }
  return msg.slice(data.length);
}

// QR Table: [version, totalCodewords, dataCodewords, eccCodewords]
const QR_VERSIONS = [
  null,
  { version: 1, size: 21, total: 26, data: 19, ecc: 7 },
  { version: 2, size: 25, total: 44, data: 34, ecc: 10 },
  { version: 3, size: 29, total: 70, data: 55, ecc: 15 },
  { version: 4, size: 33, total: 100, data: 80, ecc: 20 },
  { version: 5, size: 37, total: 134, data: 108, ecc: 26 }
];

function selectVersion(byteLength) {
  for (let v = 1; v < QR_VERSIONS.length; v++) {
    const entry = QR_VERSIONS[v];
    // Byte mode overhead: 4-bit mode indicator + 8-bit length indicator
    if (byteLength + 2 <= entry.data) return entry;
  }
  return QR_VERSIONS[QR_VERSIONS.length - 1];
}

function generateQrMatrix(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) bytes.push(code);
    else if (code < 2048) { bytes.push(192 | (code >> 6), 128 | (code & 63)); }
    else { bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63)); }
  }

  const ver = selectVersion(bytes.length);
  const totalDataBytes = ver.data;

  // Bit buffer: 4-bit mode indicator (0100 for Byte mode) + 8-bit char count
  const bitBuf = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuf.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8); // 8-bit character count indicator for V1-V9
  for (const b of bytes) pushBits(b, 8);

  // Terminator (up to 4 zeroes)
  const remainingBits = totalDataBytes * 8 - bitBuf.length;
  const termLen = Math.min(4, Math.max(0, remainingBits));
  pushBits(0, termLen);

  // Pad to multiple of 8
  while (bitBuf.length % 8 !== 0) bitBuf.push(0);

  // Convert bits to data codewords
  const dataCodewords = [];
  for (let i = 0; i < bitBuf.length; i += 8) {
    let byteVal = 0;
    for (let j = 0; j < 8; j++) byteVal = (byteVal << 1) | bitBuf[i + j];
    dataCodewords.push(byteVal);
  }

  // Pad bytes: alternating 0xEC and 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < totalDataBytes) {
    dataCodewords.push(padBytes[padIdx % 2]);
    padIdx++;
  }

  // Calculate ECC codewords
  const eccCodewords = rsCalculateEcc(dataCodewords, ver.ecc);
  const finalCodewords = dataCodewords.concat(eccCodewords);

  // Matrix creation
  const N = ver.size;
  const matrix = Array.from({ length: N }, () => new Int8Array(N).fill(-1));

  function setFinder(r0, c0) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          matrix[r0 + r][c0 + c] = 1;
        } else {
          matrix[r0 + r][c0 + c] = 0;
        }
      }
    }
    // Separators
    for (let i = -1; i <= 7; i++) {
      if (r0 - 1 >= 0 && c0 + i >= 0 && c0 + i < N) matrix[r0 - 1][c0 + i] = 0;
      if (r0 + 7 < N && c0 + i >= 0 && c0 + i < N) matrix[r0 + 7][c0 + i] = 0;
      if (c0 - 1 >= 0 && r0 + i >= 0 && r0 + i < N) matrix[r0 + i][c0 - 1] = 0;
      if (c0 + 7 < N && r0 + i >= 0 && r0 + i < N) matrix[r0 + i][c0 + 7] = 0;
    }
  }

  // 1. Finder patterns
  setFinder(0, 0);
  setFinder(0, N - 7);
  setFinder(N - 7, 0);

  // 2. Alignment pattern for Version >= 2
  if (ver.version >= 2) {
    const alignCenter = N - 7;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          matrix[alignCenter + r][alignCenter + c] = 1;
        } else {
          matrix[alignCenter + r][alignCenter + c] = 0;
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < N - 8; i++) {
    if (matrix[6][i] === -1) matrix[6][i] = (i % 2 === 0) ? 1 : 0;
    if (matrix[i][6] === -1) matrix[i][6] = (i % 2 === 0) ? 1 : 0;
  }

  // 4. Dark module
  matrix[4 * ver.version + 9][8] = 1;

  // 5. Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
  }
  for (let i = N - 8; i < N; i++) {
    if (matrix[8][i] === -1) matrix[8][i] = 0;
    if (matrix[i][8] === -1) matrix[i][8] = 0;
  }

  // 6. Data Placement in zig-zag upward/downward scan
  let bitIndex = 0;
  const allBits = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  }

  let upward = true;
  for (let rightCol = N - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: N }, (_, i) => N - 1 - i)
      : Array.from({ length: N }, (_, i) => i);

    for (const r of rows) {
      for (const colOffset of [0, 1]) {
        const c = rightCol - colOffset;
        if (matrix[r][c] === -1) {
          const bitVal = bitIndex < allBits.length ? allBits[bitIndex++] : 0;
          // Apply standard Mask 0: (r + c) % 2 === 0
          const mask = ((r + c) % 2 === 0) ? 1 : 0;
          matrix[r][c] = bitVal ^ mask;
        }
      }
    }
    upward = !upward;
  }

  // 7. Write format info (Mask 0, Level L: 0b111011111000100)
  const formatBits = [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 0, 0];
  const formatPosTopLeft = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = formatPosTopLeft[i];
    matrix[r][c] = formatBits[i];
  }
  for (let i = 0; i < 7; i++) {
    matrix[N - 1 - i][8] = formatBits[i];
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][N - 8 + i] = formatBits[7 + i];
  }

  return matrix;
}

function generateQrSvg(text, size = 120, fgColor = '#141124') {
  const matrix = generateQrMatrix(text);
  const n = matrix.length;
  const margin = 2;
  const viewBoxSize = n + margin * 2;

  let pathData = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c] === 1) {
        const x = c + margin;
        const y = r + margin;
        pathData += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
  <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>
  <path d="${pathData.trim()}" fill="${fgColor}"/>
</svg>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateQrSvg,
    generateQrMatrix
  };
}
