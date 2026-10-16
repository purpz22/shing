'use strict';

const assert = require('assert');
const path = require('path');
const http = require('http');
const dgram = require('dgram');
const WebSocket = require('ws');
const OverlayServer = require('../server/overlayServer');

console.log('Testing Shing Cast Server Protocol, WebSocket Relay & UDP Discovery...');

(async () => {
  const TEST_PORT = 3360;
  const server = new OverlayServer(TEST_PORT);

  // 1. Verify Default Settings Schema
  const settings = server.settings;
  assert.ok(settings.phone, 'Server settings must include phone configuration');
  assert.strictEqual(settings.phone.enabled, true, 'phone.enabled must default to true');
  assert.strictEqual(settings.phone.fps, 60, 'phone.fps must default to 60');
  assert.strictEqual(settings.phone.quality, '1080p', 'phone.quality must default to 1080p');
  assert.strictEqual(settings.phone.frameStyle, 'rounded', 'phone.frameStyle must default to rounded');

  // Start Server
  await server.start();

  try {
    // 2. Test HTTP Status Endpoint
    const status = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/api/cast/status`, res => {
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => resolve(JSON.parse(raw)));
      }).on('error', reject);
    });

    assert.strictEqual(status.active, false, 'Initial cast status must be inactive');
    assert.strictEqual(typeof status.receiversCount, 'number', 'Must report receivers count');

    // 3. Test WebSocket /ws/cast Connection & Protocol
    const wsUrl = `ws://localhost:${TEST_PORT}/ws/cast`;

    // Connect Receiver Client (OBS Overlay / Dashboard)
    const receiverWs = new WebSocket(wsUrl);
    let receiverReceivedBinary = null;
    let receiverReceivedState = null;

    await new Promise((resolve, reject) => {
      receiverWs.on('open', () => {
        receiverWs.send(JSON.stringify({ type: 'cast:register', role: 'receiver' }));
        resolve();
      });
      receiverWs.on('error', reject);
    });

    receiverWs.on('message', (data, isBinary) => {
      if (isBinary) {
        receiverReceivedBinary = Buffer.from(data);
      } else {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'cast:state') {
            receiverReceivedState = msg;
          }
        } catch (e) {}
      }
    });

    // Connect Sender Client (Android Phone App)
    const senderWs = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      senderWs.on('open', () => {
        senderWs.send(JSON.stringify({
          type: 'cast:register',
          role: 'sender',
          deviceName: 'Android Test Phone',
          width: 1080,
          height: 1920,
          fps: 60
        }));
        resolve();
      });
      senderWs.on('error', reject);
    });

    // Allow registration to process
    await new Promise(r => setTimeout(r, 100));

    assert.ok(receiverReceivedState, 'Receiver must receive cast:state update when sender connects');
    assert.strictEqual(receiverReceivedState.active, true, 'State must indicate active streaming');
    assert.strictEqual(receiverReceivedState.deviceName, 'Android Test Phone', 'Must broadcast deviceName');
    assert.strictEqual(receiverReceivedState.width, 1080, 'Must broadcast width');
    assert.strictEqual(receiverReceivedState.height, 1920, 'Must broadcast height');

    // 4. Test Binary H.264 Video Packet Relay
    // Packet structure:
    // Byte 0: Type (0x01 = Video)
    // Byte 1: Flags (0x01 = Keyframe)
    // Bytes 2-9: Timestamp
    // Bytes 10+: NAL Unit payload
    const testPayload = Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x23, 0x45, 0x65, 0x88, 0x99]);
    senderWs.send(testPayload);

    await new Promise(r => setTimeout(r, 100));

    assert.ok(receiverReceivedBinary, 'Receiver must receive binary stream packet');
    assert.strictEqual(receiverReceivedBinary.length, testPayload.length, 'Payload length must match exactly');
    assert.strictEqual(receiverReceivedBinary[0], 0x01, 'Must preserve video packet header');
    assert.strictEqual(receiverReceivedBinary[1], 0x01, 'Must preserve keyframe flag');

    // 5. Test Late-Joining Receiver (SPS/PPS Config Frame Caching)
    const lateReceiverWs = new WebSocket(wsUrl);
    let lateReceiverGotConfig = false;

    lateReceiverWs.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(data);
        if (buf[0] === 0x01 && buf[1] === 0x01) {
          lateReceiverGotConfig = true;
        }
      }
    });

    await new Promise((resolve, reject) => {
      lateReceiverWs.on('open', () => {
        lateReceiverWs.send(JSON.stringify({ type: 'cast:register', role: 'receiver' }));
        resolve();
      });
      lateReceiverWs.on('error', reject);
    });

    await new Promise(r => setTimeout(r, 100));
    assert.strictEqual(lateReceiverGotConfig, true, 'Late-joining receiver must receive cached keyframe/config packet');

    // 6. Test UDP Discovery Beacon
    const udpClient = dgram.createSocket('udp4');
    let beaconResponse = null;

    udpClient.on('message', msg => {
      try {
        beaconResponse = JSON.parse(msg.toString());
      } catch (e) {}
    });

    const ping = Buffer.from('SHING_CAST_DISCOVERY');
    udpClient.send(ping, 0, ping.length, 33334, '127.0.0.1');

    await new Promise(r => setTimeout(r, 150));
    udpClient.close();

    assert.ok(beaconResponse, 'UDP Discovery must receive beacon response');
    assert.strictEqual(beaconResponse.type, 'SHING_CAST_BEACON', 'Beacon type must match');
    assert.strictEqual(beaconResponse.server, 'Shing Live', 'Beacon server name must match');
    assert.strictEqual(beaconResponse.port, TEST_PORT, 'Beacon port must match');

    // Close connections
    senderWs.close();
    receiverWs.close();
    lateReceiverWs.close();

    console.log('All Shing Cast server protocol, WebSocket relay and caching tests passed successfully!');
  } finally {
    server.stop();
  }
})().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
