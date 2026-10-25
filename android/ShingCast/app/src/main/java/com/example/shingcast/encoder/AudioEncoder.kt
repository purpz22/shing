package com.example.shingcast.encoder

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.NoiseSuppressor
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Process
import android.util.Log
import com.example.shingcast.net.CastClient
import java.util.concurrent.ArrayBlockingQueue
import kotlin.math.roundToInt

class AudioEncoder(
    private val mediaProjection: MediaProjection?,
    private val client: CastClient,
    private val audioMode: String = MODE_MIXED,
    private val micBoost: Float = 1.25f,
    private val noiseFilterEnabled: Boolean = true
) {
    companion object {
        private const val TAG = "AudioEncoder"
        const val MODE_MIC = "mic"
        const val MODE_INTERNAL = "internal"
        const val MODE_MIXED = "mixed"

        const val SAMPLE_RATE = 48000
        const val CHANNEL_CONFIG_STEREO = AudioFormat.CHANNEL_IN_STEREO
        const val CHANNEL_CONFIG_MONO = AudioFormat.CHANNEL_IN_MONO
        const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT

        // 10ms of 48kHz 16-bit stereo PCM = 480 samples * 4 bytes = 1920 bytes
        const val CHUNK_SIZE_BYTES = 1920
        // 10ms of 48kHz 16-bit mono PCM = 480 samples * 2 bytes = 960 bytes
        const val MONO_CHUNK_SIZE_BYTES = 960
        const val SAMPLES_PER_CHUNK = 480

        private const val MAX_QUEUE_CHUNKS = 4
    }

    private var internalAudioRecord: AudioRecord? = null
    private var micAudioRecord: AudioRecord? = null
    private var noiseSuppressor: NoiseSuppressor? = null
    private var echoCanceler: AcousticEchoCanceler? = null

    // 85Hz High-Pass Filter state for mic handling noise & AC rumble cut
    private var hpPrevX = 0f
    private var hpPrevY = 0f

    @Volatile
    private var isRecording = false

    private var micThread: Thread? = null
    private var internalThread: Thread? = null
    private var mixThread: Thread? = null

    private val micQueue = ArrayBlockingQueue<ByteArray>(MAX_QUEUE_CHUNKS)
    private val internalQueue = ArrayBlockingQueue<ByteArray>(MAX_QUEUE_CHUNKS)

    @SuppressLint("MissingPermission")
    fun start() {
        val wantsInternal = (audioMode == MODE_INTERNAL || audioMode == MODE_MIXED) && mediaProjection != null
        val wantsMic = (audioMode == MODE_MIC || audioMode == MODE_MIXED)

        if (wantsMic) {
            setupMicAudioRecord()
        }

        if (wantsInternal) {
            setupInternalAudioRecord()
        }

        if (internalAudioRecord == null && micAudioRecord == null) {
            Log.e(TAG, "No valid audio record source available for mode=$audioMode")
            return
        }

        try {
            isRecording = true

            if (micAudioRecord != null) {
                micAudioRecord?.startRecording()
                micThread = Thread({
                    readMicLoop()
                }, "ShingMicRecordThread").apply { start() }
            }

            if (internalAudioRecord != null) {
                internalAudioRecord?.startRecording()
                internalThread = Thread({
                    readInternalLoop()
                }, "ShingInternalAudioThread").apply { start() }
            }

            if (audioMode == MODE_MIXED && micAudioRecord != null && internalAudioRecord != null) {
                mixThread = Thread({
                    mixingLoop()
                }, "ShingAudioMixerThread").apply { start() }
            }

            Log.d(TAG, "AudioEncoder started: mode=$audioMode, mic=${micAudioRecord != null}, internal=${internalAudioRecord != null}, boost=${micBoost}x")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start audio capture: ${e.message}", e)
            stop()
        }
    }

    @SuppressLint("MissingPermission")
    private fun setupMicAudioRecord() {
        // 1. Try Voice Communication first (activates Android OS dual-mic beamforming and hardware noise cancellation)
        try {
            val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_MONO, AUDIO_FORMAT)
            if (minBuf > 0) {
                val bufSize = (minBuf * 4).coerceAtLeast(16384)
                val record = AudioRecord(
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG_MONO,
                    AUDIO_FORMAT,
                    bufSize
                )
                if (record.state == AudioRecord.STATE_INITIALIZED) {
                    micAudioRecord = record
                    attachHardwareAudioEffects(record)
                    Log.d(TAG, "Microphone initialized with VOICE_COMMUNICATION at 48kHz (noiseFilter=$noiseFilterEnabled, dual-mic beamforming active)")
                    return
                }
                record.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Voice communication mic init failed, falling back to standard MIC: ${e.message}")
        }

        // 2. Standard mono microphone fallback
        try {
            val minBufMono = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_MONO, AUDIO_FORMAT)
            if (minBufMono > 0) {
                val bufSize = (minBufMono * 4).coerceAtLeast(16384)
                val record = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG_MONO,
                    AUDIO_FORMAT,
                    bufSize
                )
                if (record.state == AudioRecord.STATE_INITIALIZED) {
                    micAudioRecord = record
                    attachHardwareAudioEffects(record)
                    Log.d(TAG, "Microphone initialized in standard MIC mode at 48kHz (hardware buffer: $bufSize bytes, noiseFilter=$noiseFilterEnabled)")
                    return
                }
                record.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize microphone in standard MIC mode: ${e.message}")
        }
    }

    private fun attachHardwareAudioEffects(record: AudioRecord) {
        if (!noiseFilterEnabled) return
        try {
            if (NoiseSuppressor.isAvailable()) {
                noiseSuppressor = NoiseSuppressor.create(record.audioSessionId)?.apply {
                    enabled = true
                }
                Log.d(TAG, "Hardware NoiseSuppressor active on session ${record.audioSessionId}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Hardware NoiseSuppressor error: ${e.message}")
        }

        try {
            if (AcousticEchoCanceler.isAvailable()) {
                echoCanceler = AcousticEchoCanceler.create(record.audioSessionId)?.apply {
                    enabled = true
                }
                Log.d(TAG, "Hardware AcousticEchoCanceler active on session ${record.audioSessionId}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Hardware AcousticEchoCanceler error: ${e.message}")
        }
    }

    @SuppressLint("MissingPermission")
    private fun setupInternalAudioRecord() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || mediaProjection == null) {
            Log.w(TAG, "AudioPlaybackCapture requires Android 10 (API 29) or higher with MediaProjection")
            return
        }

        try {
            val config = AudioPlaybackCaptureConfiguration.Builder(mediaProjection)
                .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
                .addMatchingUsage(AudioAttributes.USAGE_GAME)
                .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
                .build()

            val audioFormat = AudioFormat.Builder()
                .setEncoding(AUDIO_FORMAT)
                .setSampleRate(SAMPLE_RATE)
                .setChannelMask(CHANNEL_CONFIG_STEREO)
                .build()

            val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_STEREO, AUDIO_FORMAT)
            val hardwareBufferSize = (minBufferSize * 4).coerceAtLeast(16384)

            val record = AudioRecord.Builder()
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(hardwareBufferSize)
                .setAudioPlaybackCaptureConfig(config)
                .build()

            if (record.state == AudioRecord.STATE_INITIALIZED) {
                internalAudioRecord = record
                Log.d(TAG, "Internal game audio record initialized successfully at 48kHz stereo")
            } else {
                Log.w(TAG, "Internal game audio record failed initialization")
                record.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to setup internal audio capture: ${e.message}")
        }
    }

    private fun readMicLoop() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        } catch (ignored: Exception) {}

        val record = micAudioRecord ?: return
        val rawMonoBuf = ByteArray(MONO_CHUNK_SIZE_BYTES)
        val stereoBuf = ByteArray(CHUNK_SIZE_BYTES)
        val startTimeNs = System.nanoTime()
        var micGateEnvelope = 0.0f

        while (isRecording) {
            // Fill exact 10ms mono chunk (480 samples = 960 bytes)
            var bytesReadTotal = 0
            while (bytesReadTotal < MONO_CHUNK_SIZE_BYTES && isRecording) {
                val read = record.read(rawMonoBuf, bytesReadTotal, MONO_CHUNK_SIZE_BYTES - bytesReadTotal)
                if (read > 0) {
                    bytesReadTotal += read
                } else if (read < 0) {
                    Log.w(TAG, "Mic read error: $read")
                    try { Thread.sleep(5) } catch (ignored: Exception) {}
                    break
                }
            }

            if (bytesReadTotal < MONO_CHUNK_SIZE_BYTES) continue

            // Convert 16-bit Mono PCM to 16-bit Stereo PCM (L = R = Mono * boost)
            val boost = micBoost
            val numSamples = bytesReadTotal / 2
            val useFilter = noiseFilterEnabled

            if (useFilter) {
                // Measure energy and zero-crossing rate of current 10ms frame
                var sumSq = 0L
                var zcr = 0
                var prevVal = 0
                for (i in 0 until numSamples) {
                    val s = (rawMonoBuf[i * 2 + 1].toInt() shl 8) or (rawMonoBuf[i * 2].toInt() and 0xFF)
                    sumSq += (s.toLong() * s.toLong())
                    if ((s > 0 && prevVal <= 0) || (s < 0 && prevVal >= 0)) zcr++
                    prevVal = s
                }
                val frameRms = kotlin.math.sqrt(sumSq.toDouble() / numSamples).toFloat()

                // Human speech has RMS >= 420 and ZCR in vocal range (4 to 120 crossings)
                // Fan hiss has ZCR > 140; silence/AC hum has ZCR < 3
                val isSpeechActive = (frameRms >= 420f) && (zcr in 4..120)

                if (isSpeechActive) {
                    micGateEnvelope = (micGateEnvelope + 0.35f).coerceAtMost(1.0f)
                } else {
                    micGateEnvelope = (micGateEnvelope - 0.12f).coerceAtLeast(0.0f)
                }
            } else {
                micGateEnvelope = 1.0f
            }

            for (i in 0 until numSamples) {
                val sampleMono = (rawMonoBuf[i * 2 + 1].toInt() shl 8) or (rawMonoBuf[i * 2].toInt() and 0xFF)

                // 85Hz High-pass IIR filter (alpha = 0.9890f at 48kHz): removes phone vibrations and AC hum
                val filteredSample = if (useFilter) {
                    val x = sampleMono.toFloat()
                    val y = 0.9890f * (hpPrevY + x - hpPrevX)
                    hpPrevX = x
                    hpPrevY = y
                    val clean = y.roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                    // Apply voice gate envelope so non-voice background noise is silenced to 0
                    (clean * micGateEnvelope).roundToInt()
                } else {
                    sampleMono
                }

                val boosted = if (boost != 1.0f) {
                    (filteredSample * boost).roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                } else {
                    filteredSample
                }
                val low = (boosted and 0xFF).toByte()
                val high = ((boosted shr 8) and 0xFF).toByte()

                // Left Channel
                stereoBuf[i * 4] = low
                stereoBuf[i * 4 + 1] = high
                // Right Channel
                stereoBuf[i * 4 + 2] = low
                stereoBuf[i * 4 + 3] = high
            }

            if (audioMode == MODE_MIC || internalAudioRecord == null) {
                // Direct mic streaming: zero latency, zero queue overhead
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, stereoBuf, 0, CHUNK_SIZE_BYTES)
            } else {
                // Push to mix queue, dropping oldest if full to maintain real-time sync
                if (micQueue.remainingCapacity() == 0) {
                    micQueue.poll()
                }
                micQueue.offer(stereoBuf.clone())
            }
        }
    }

    private fun readInternalLoop() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        } catch (ignored: Exception) {}

        val record = internalAudioRecord ?: return
        val internalBuf = ByteArray(CHUNK_SIZE_BYTES)
        val startTimeNs = System.nanoTime()

        while (isRecording) {
            var bytesReadTotal = 0
            while (bytesReadTotal < CHUNK_SIZE_BYTES && isRecording) {
                val read = record.read(internalBuf, bytesReadTotal, CHUNK_SIZE_BYTES - bytesReadTotal)
                if (read > 0) {
                    bytesReadTotal += read
                } else if (read < 0) {
                    try { Thread.sleep(5) } catch (ignored: Exception) {}
                    break
                }
            }

            if (bytesReadTotal < CHUNK_SIZE_BYTES) continue

            if (audioMode == MODE_INTERNAL || micAudioRecord == null) {
                // Direct internal audio streaming
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, internalBuf, 0, CHUNK_SIZE_BYTES)
            } else {
                // Push to internal mix queue, dropping oldest if full
                if (internalQueue.remainingCapacity() == 0) {
                    internalQueue.poll()
                }
                internalQueue.offer(internalBuf.clone())
            }
        }
    }

    private fun mixingLoop() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        } catch (ignored: Exception) {}

        val mixedBuf = ByteArray(CHUNK_SIZE_BYTES)
        val startTimeNs = System.nanoTime()

        while (isRecording) {
            val micChunk = micQueue.poll()
            val internalChunk = internalQueue.poll()

            if (micChunk != null && internalChunk != null) {
                // Both mic voice and game sound available: mix with soft saturation
                for (i in 0 until SAMPLES_PER_CHUNK * 2) {
                    val idx = i * 2
                    val gameSample = (internalChunk[idx + 1].toInt() shl 8) or (internalChunk[idx].toInt() and 0xFF)
                    val micSample = (micChunk[idx + 1].toInt() shl 8) or (micChunk[idx].toInt() and 0xFF)

                    val sum = (gameSample + micSample).coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                    mixedBuf[idx] = (sum and 0xFF).toByte()
                    mixedBuf[idx + 1] = ((sum shr 8) and 0xFF).toByte()
                }
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, mixedBuf, 0, CHUNK_SIZE_BYTES)
            } else if (micChunk != null) {
                // Mic voice only (e.g. game is quiet or loading): transmit mic immediately!
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, micChunk, 0, CHUNK_SIZE_BYTES)
            } else if (internalChunk != null) {
                // Game sound only
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, internalChunk, 0, CHUNK_SIZE_BYTES)
            } else {
                try { Thread.sleep(5) } catch (ignored: Exception) {}
            }
        }
    }

    fun stop() {
        isRecording = false

        try { micThread?.join(500) } catch (ignored: Exception) {}
        micThread = null

        try { internalThread?.join(500) } catch (ignored: Exception) {}
        internalThread = null

        try { mixThread?.join(500) } catch (ignored: Exception) {}
        mixThread = null

        micQueue.clear()
        internalQueue.clear()

        try { noiseSuppressor?.release() } catch (ignored: Exception) {}
        noiseSuppressor = null
        try { echoCanceler?.release() } catch (ignored: Exception) {}
        echoCanceler = null

        try { micAudioRecord?.stop() } catch (ignored: Exception) {}
        try { micAudioRecord?.release() } catch (ignored: Exception) {}
        micAudioRecord = null

        try { internalAudioRecord?.stop() } catch (ignored: Exception) {}
        try { internalAudioRecord?.release() } catch (ignored: Exception) {}
        internalAudioRecord = null

        Log.d(TAG, "AudioEncoder stopped cleanly")
    }
}
