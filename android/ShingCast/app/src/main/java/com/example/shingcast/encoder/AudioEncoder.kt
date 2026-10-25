package com.example.shingcast.encoder

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.MediaRecorder
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
    private val noiseFilterEnabled: Boolean = false
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
        private const val MAX_QUEUE_CHUNKS = 6
    }

    private var internalAudioRecord: AudioRecord? = null
    private var micAudioRecord: AudioRecord? = null

    @Volatile
    private var isRecording = false

    private var micThread: Thread? = null
    private var internalThread: Thread? = null

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

            Log.d(TAG, "AudioEncoder started: mode=$audioMode, mic=${micAudioRecord != null}, internal=${internalAudioRecord != null}, boost=${micBoost}x")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start audio capture: ${e.message}", e)
            stop()
        }
    }

    @SuppressLint("MissingPermission")
    private fun setupMicAudioRecord() {
        // Universal clean mono microphone capture in standard media mode (48kHz clean capture, zero VoIP ducking)
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
                    Log.d(TAG, "Microphone initialized in clean raw MIC mode at 48kHz (hardware buffer: $bufSize bytes)")
                    return
                }
                record.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Standard MIC init error: ${e.message}")
        }

        // Clean default fallback (never use VOICE_COMMUNICATION to avoid telephony DSP ducking)
        try {
            val minBuf = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_MONO, AUDIO_FORMAT)
            if (minBuf > 0) {
                val bufSize = (minBuf * 4).coerceAtLeast(16384)
                val record = AudioRecord(
                    MediaRecorder.AudioSource.DEFAULT,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG_MONO,
                    AUDIO_FORMAT,
                    bufSize
                )
                if (record.state == AudioRecord.STATE_INITIALIZED) {
                    micAudioRecord = record
                    Log.d(TAG, "Microphone initialized with clean DEFAULT at 48kHz")
                    return
                }
                record.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Default mic init failed: ${e.message}")
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

        // Adaptive acoustic speaker-bleed gate envelope to prevent loud game audio from bleeding into mic
        var micGateGain = 1.0f

        while (isRecording) {
            // Fill exact 10ms mono chunk from mic (480 samples = 960 bytes)
            var bytesReadTotal = 0
            while (bytesReadTotal < MONO_CHUNK_SIZE_BYTES && isRecording) {
                val read = record.read(rawMonoBuf, bytesReadTotal, MONO_CHUNK_SIZE_BYTES - bytesReadTotal)
                if (read > 0) {
                    bytesReadTotal += read
                } else if (read == 0) {
                    try { Thread.sleep(1) } catch (ignored: Exception) {}
                } else {
                    Log.w(TAG, "Mic read error: $read")
                    try { Thread.sleep(5) } catch (ignored: Exception) {}
                    break
                }
            }

            if (bytesReadTotal < MONO_CHUNK_SIZE_BYTES) continue

            val boost = micBoost
            val numSamples = bytesReadTotal / 2

            // Calculate microphone RMS level for intelligent speaker-bleed suppression
            var sumSq = 0.0
            for (i in 0 until numSamples) {
                val s = (rawMonoBuf[i * 2 + 1].toInt() shl 8) or (rawMonoBuf[i * 2].toInt() and 0xFF)
                sumSq += s.toDouble() * s.toDouble()
            }
            val rms = kotlin.math.sqrt(sumSq / numSamples) / 32768.0

            // In MODE_MIXED: Poll internal queue to detect active game sound playback for acoustic bleed suppression
            var gameEnergy = 0.0
            if (audioMode == MODE_MIXED && internalAudioRecord != null) {
                val gameChunk = internalQueue.poll()
                if (gameChunk != null) {
                    var gameSumSq = 0.0
                    for (i in 0 until SAMPLES_PER_CHUNK * 2) {
                        val idx = i * 2
                        val gs = (gameChunk[idx + 1].toInt() shl 8) or (gameChunk[idx].toInt() and 0xFF)
                        gameSumSq += gs.toDouble() * gs.toDouble()
                    }
                    gameEnergy = kotlin.math.sqrt(gameSumSq / (SAMPLES_PER_CHUNK * 2)) / 32768.0
                }
            }

            // In MODE_MIXED, if game sound is playing loud through phone speakers and user is not speaking,
            // attenuate acoustic speaker bleed so loud game audio is not picked up by the mic
            if (audioMode == MODE_MIXED) {
                val isSpeaking = rms >= (0.012 + (gameEnergy * 0.25).coerceAtMost(0.040))
                if (isSpeaking) {
                    micGateGain = kotlin.math.min(1.0f, micGateGain + 0.35f)
                } else {
                    micGateGain = kotlin.math.max(0.12f, micGateGain - 0.12f)
                }
            } else {
                micGateGain = 1.0f
            }

            for (i in 0 until numSamples) {
                val sampleMono = (rawMonoBuf[i * 2 + 1].toInt() shl 8) or (rawMonoBuf[i * 2].toInt() and 0xFF)
                val effectiveBoost = boost * micGateGain
                val boosted = if (effectiveBoost != 1.0f) {
                    (sampleMono * effectiveBoost).roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                } else {
                    sampleMono
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

            val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
            if (audioMode == MODE_MIC) {
                // In mic-only mode, stream on PACKET_MIC and PACKET_AUDIO for universal compatibility
                client.sendBinaryPacket(CastClient.PACKET_MIC, ptsMs, stereoBuf, 0, CHUNK_SIZE_BYTES)
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, stereoBuf, 0, CHUNK_SIZE_BYTES)
            } else {
                // In mixed mode, send dedicated microphone stream on PACKET_MIC (0x05)
                client.sendBinaryPacket(CastClient.PACKET_MIC, ptsMs, stereoBuf, 0, CHUNK_SIZE_BYTES)
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
                } else if (read == 0) {
                    try { Thread.sleep(1) } catch (ignored: Exception) {}
                } else {
                    try { Thread.sleep(5) } catch (ignored: Exception) {}
                    break
                }
            }

            if (bytesReadTotal < CHUNK_SIZE_BYTES) continue

            // Direct internal audio streaming for Game Audio (clean, full-fidelity 48kHz stereo, zero queue drop)
            val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
            client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, internalBuf, 0, CHUNK_SIZE_BYTES)

            // Maintain reference queue for real-time acoustic speaker-bleed reference
            if (audioMode == MODE_MIXED && micAudioRecord != null) {
                if (internalQueue.remainingCapacity() == 0) {
                    internalQueue.poll()
                }
                internalQueue.offer(internalBuf.clone())
            }
        }
    }

    fun stop() {
        isRecording = false

        try { micThread?.join(500) } catch (ignored: Exception) {}
        micThread = null

        try { internalThread?.join(500) } catch (ignored: Exception) {}
        internalThread = null

        internalQueue.clear()

        try { micAudioRecord?.stop() } catch (ignored: Exception) {}
        try { micAudioRecord?.release() } catch (ignored: Exception) {}
        micAudioRecord = null

        try { internalAudioRecord?.stop() } catch (ignored: Exception) {}
        try { internalAudioRecord?.release() } catch (ignored: Exception) {}
        internalAudioRecord = null

        Log.d(TAG, "AudioEncoder stopped cleanly")
    }
}
