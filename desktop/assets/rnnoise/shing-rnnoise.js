// shing-rnnoise.js - Client helper for RNNoise AI Noise Cancellation
(function(window) {
  'use strict';

  let cachedWasmBinary = null;
  const workletModuleRegistered = new WeakSet();

  const isSimdSupported = async () => {
    try {
      return await WebAssembly.validate(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
      ]));
    } catch (e) {
      return false;
    }
  };

  async function getWasmBinary(basePath) {
    if (cachedWasmBinary) return cachedWasmBinary;
    const simd = await isSimdSupported();
    const fileName = simd ? 'rnnoise_simd.wasm' : 'rnnoise.wasm';
    const root = basePath || '/assets/rnnoise/';
    const url = root.endsWith('/') ? (root + fileName) : (root + '/' + fileName);

    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + url);
    cachedWasmBinary = await res.arrayBuffer();
    return cachedWasmBinary;
  }

  async function createRnnoiseNode(audioCtx, options = {}) {
    if (!audioCtx || !audioCtx.audioWorklet) {
      throw new Error('AudioContext or AudioWorklet not supported');
    }

    const maxChannels = options.maxChannels || 2;
    const basePath = options.basePath || '/assets/rnnoise/';
    const processorUrl = basePath.endsWith('/') ? (basePath + 'workletProcessor.js') : (basePath + '/workletProcessor.js');

    // Register worklet module once per AudioContext
    if (!workletModuleRegistered.has(audioCtx)) {
      await audioCtx.audioWorklet.addModule(processorUrl);
      workletModuleRegistered.add(audioCtx);
    }

    // Obtain WASM binary
    const wasmBinary = await getWasmBinary(basePath);

    // AudioWorkletNode clones or transfers ArrayBuffer
    const binaryCopy = wasmBinary.slice(0);

    const workletNode = new AudioWorkletNode(audioCtx, '@sapphi-red/web-noise-suppressor/rnnoise', {
      processorOptions: {
        maxChannels,
        wasmBinary: binaryCopy
      }
    });

    return workletNode;
  }

  window.ShingRnnoise = {
    isSimdSupported,
    getWasmBinary,
    createRnnoiseNode
  };
})(typeof window !== 'undefined' ? window : globalThis);
