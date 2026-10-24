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
import kotlin.math.roundToInt

class AudioEncoder(
    private val mediaProjection: MediaProjection?,
    private val client: CastClient,
    private val audioMode: String = MODE_MIXED,
    private val micBoost: Float = 1.25f
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
        const val SAMPLES_PER_CHUNK = 480
    }

    private var internalAudioRecord: AudioRecord? = null
    private var micAudioRecord: AudioRecord? = null
    private var isMicMono = false

    @Volatile
    private var isRecording = false
    private var recordingThread: Thread? = null

    @SuppressLint("MissingPermission")
    fun start() {
        val wantsInternal = (audioMode == MODE_INTERNAL || audioMode == MODE_MIXED) && mediaProjection != null
        val wantsMic = (audioMode == MODE_MIC || audioMode == MODE_MIXED)

        if (wantsInternal) {
            setupInternalAudioRecord()
        }

        if (wantsMic) {
            setupMicAudioRecord()
        }

        if (internalAudioRecord == null && micAudioRecord == null) {
            Log.e(TAG, "No valid audio record source available for mode=$audioMode")
            return
        }

        try {
            internalAudioRecord?.startRecording()
            micAudioRecord?.startRecording()
            isRecording = true

            recordingThread = Thread({
                readAudioLoop()
            }, "ShingAudioRecordThread").apply {
                start()
            }
            Log.d(TAG, "Audio capture started successfully in mode=$audioMode (internal=${internalAudioRecord != null}, mic=${micAudioRecord != null}, boost=${micBoost}x)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start audio capture: ${e.message}", e)
            stop()
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

    @SuppressLint("MissingPermission")
    private fun setupMicAudioRecord() {
        // Try stereo mic first for highest fidelity
        try {
            val minBufStereo = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG_STEREO, AUDIO_FORMAT)
            if (minBufStereo > 0) {
                val bufSize = (minBufStereo * 4).coerceAtLeast(16384)
                val record = AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG_STEREO,
                    AUDIO_FORMAT,
                    bufSize
                )
                if (record.state == AudioRecord.STATE_INITIALIZED) {
                    micAudioRecord = record
                    isMicMono = false
                    Log.d(TAG, "Microphone initialized in STEREO mode at 48kHz")
                    return
                }
                record.release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Stereo mic init failed, falling back to mono: ${e.message}")
        }

        // Fallback to universal mono mic and expand to stereo
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
                    isMicMono = true
                    Log.d(TAG, "Microphone initialized in MONO mode (auto-expanded to stereo) at 48kHz")
                    return
                }
                record.release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize microphone in mono: ${e.message}")
        }
    }

    private fun readAudioLoop() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        } catch (ignored: Exception) {}

        val internal = internalAudioRecord
        val mic = micAudioRecord

        val outBuffer = ByteArray(CHUNK_SIZE_BYTES)
        val internalBuffer = if (internal != null) ByteArray(CHUNK_SIZE_BYTES) else null
        val micRawBuffer = if (mic != null) ByteArray(if (isMicMono) CHUNK_SIZE_BYTES / 2 else CHUNK_SIZE_BYTES) else null
        val micStereoBuffer = if (mic != null) ByteArray(CHUNK_SIZE_BYTES) else null

        val startTimeNs = System.nanoTime()

        while (isRecording) {
            var hasInternal = false
            var hasMic = false

            if (internal != null && internalBuffer != null) {
                val readInternal = internal.read(internalBuffer, 0, internalBuffer.size)
                if (readInternal > 0) {
                    hasInternal = true
                }
            }

            if (mic != null && micRawBuffer != null && micStereoBuffer != null) {
                val readMic = mic.read(micRawBuffer, 0, micRawBuffer.size)
                if (readMic > 0) {
                    hasMic = true
                    if (isMicMono) {
                        // Expand 16-bit mono PCM into 16-bit stereo PCM (L = R = Mono)
                        val numMonoSamples = readMic / 2
                        for (i in 0 until numMonoSamples) {
                            val byteLow = micRawBuffer[i * 2]
                            val byteHigh = micRawBuffer[i * 2 + 1]

                            // Left channel
                            micStereoBuffer[i * 4] = byteLow
                            micStereoBuffer[i * 4 + 1] = byteHigh
                            // Right channel
                            micStereoBuffer[i * 4 + 2] = byteLow
                            micStereoBuffer[i * 4 + 3] = byteHigh
                        }
                    } else {
                        System.arraycopy(micRawBuffer, 0, micStereoBuffer, 0, readMic)
                    }
                }
            }

            // Route audio according to available data and active mode
            if (hasInternal && hasMic && internalBuffer != null && micStereoBuffer != null) {
                // MIXED MODE: combine game audio and streamer voice with soft-clipping saturation
                val boost = micBoost
                for (i in 0 until SAMPLES_PER_CHUNK * 2) {
                    val idx = i * 2
                    val gameSample = (internalBuffer[idx + 1].toInt() shl 8) or (internalBuffer[idx].toInt() and 0xFF)
                    val micSample = (micStereoBuffer[idx + 1].toInt() shl 8) or (micStereoBuffer[idx].toInt() and 0xFF)

                    val boostedMic = (micSample * boost).roundToInt()
                    val mixed = (gameSample + boostedMic).coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())

                    outBuffer[idx] = (mixed and 0xFF).toByte()
                    outBuffer[idx + 1] = ((mixed shr 8) and 0xFF).toByte()
                }
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, outBuffer, 0, CHUNK_SIZE_BYTES)
            } else if (hasMic && micStereoBuffer != null) {
                // MIC ONLY or fallback when game audio is silent/unavailable
                if (micBoost != 1.0f) {
                    val boost = micBoost
                    for (i in 0 until SAMPLES_PER_CHUNK * 2) {
                        val idx = i * 2
                        val micSample = (micStereoBuffer[idx + 1].toInt() shl 8) or (micStereoBuffer[idx].toInt() and 0xFF)
                        val boosted = (micSample * boost).roundToInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                        outBuffer[idx] = (boosted and 0xFF).toByte()
                        outBuffer[idx + 1] = ((boosted shr 8) and 0xFF).toByte()
                    }
                    val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                    client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, outBuffer, 0, CHUNK_SIZE_BYTES)
                } else {
                    val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                    client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, micStereoBuffer, 0, CHUNK_SIZE_BYTES)
                }
            } else if (hasInternal && internalBuffer != null) {
                // INTERNAL ONLY
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, internalBuffer, 0, CHUNK_SIZE_BYTES)
            } else {
                try { Thread.sleep(5) } catch (ignored: Exception) {}
            }
        }
    }

    fun stop() {
        isRecording = false
        try {
            recordingThread?.join(1000)
        } catch (ignored: Exception) {}
        recordingThread = null

        try {
            internalAudioRecord?.stop()
        } catch (ignored: Exception) {}
        try {
            internalAudioRecord?.release()
        } catch (ignored: Exception) {}
        internalAudioRecord = null

        try {
            micAudioRecord?.stop()
        } catch (ignored: Exception) {}
        try {
            micAudioRecord?.release()
        } catch (ignored: Exception) {}
        micAudioRecord = null

        Log.d(TAG, "Audio capture stopped cleanly")
    }
}
