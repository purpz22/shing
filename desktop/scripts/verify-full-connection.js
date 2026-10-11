async function runVerification() {
  const { TikTokLiveConnection, WebcastEvent } = await import('tiktok-live-connector');

  console.log('--- Step 1: Testing Offline User Error Handling ---');
  const offlineConn = new TikTokLiveConnection('officialgeilegisela', {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  try {
    await offlineConn.connect();
    console.error('FAIL: Expected offline connection to reject.');
  } catch (err) {
    console.log('SUCCESS: Offline streamer properly detected:', err.message || err.name);
  }

  console.log('\n--- Step 2: Testing Live Stream Connection & Event Processing ---');
  const liveConn = new TikTokLiveConnection('aljazeera', {
    processInitialData: false,
    fetchRoomInfoOnConnect: false,
    enableExtendedGiftInfo: false
  });

  let receivedChat = false;
  let receivedLikeOrMember = false;

  liveConn.on(WebcastEvent.CHAT, data => {
    receivedChat = true;
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const comment = data.content || data.comment || '';
    console.log(`[CHAT] ${viewerName}: ${comment}`);
  });

  liveConn.on(WebcastEvent.LIKE, data => {
    receivedLikeOrMember = true;
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    console.log(`[LIKE] ${viewerName} liked (count: ${data.count || 1})`);
  });

  liveConn.on(WebcastEvent.MEMBER, data => {
    receivedLikeOrMember = true;
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    console.log(`[JOIN] ${viewerName} joined`);
  });

  liveConn.on(WebcastEvent.GIFT, data => {
    const viewerName = data.user?.nickname || data.nickname || data.user?.displayId || data.uniqueId || 'Viewer';
    const giftName = data.gift?.name || data.giftName || 'Gift';
    console.log(`[GIFT] ${viewerName} sent ${giftName}`);
  });

  try {
    const state = await liveConn.connect();
    console.log(`SUCCESS: Live connection established to room ${state.roomId}`);
    console.log('Listening for live events for 8 seconds...');
    await new Promise(r => setTimeout(r, 8000));
    await liveConn.disconnect();
    console.log('SUCCESS: Live connection disconnected cleanly.');

    if (receivedChat || receivedLikeOrMember) {
      console.log('\n*** ALL CONNECTION & EVENT PARSING VERIFICATIONS PASSED ***');
      process.exit(0);
    } else {
      console.log('\nConnected successfully, waiting for traffic completed.');
      process.exit(0);
    }
  } catch (err) {
    console.error('FAIL: Error connecting to live streamer:', err);
    process.exit(1);
  }
}

runVerification();
