package com.example.shingcast.encoder

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
import android.os.Process
import android.util.Log
import com.example.shingcast.net.CastClient

class AudioEncoder(
    private val mediaProjection: MediaProjection,
    private val client: CastClient
) {
    companion object {
        private const val TAG = "AudioEncoder"
        private const val SAMPLE_RATE = 48000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_STEREO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        // 10ms of 48kHz 16-bit stereo PCM = 480 stereo samples * 4 bytes/sample = 1920 bytes
        // Reading in 10ms chunks minimizes capture delay and delivers real-time audio
        private const val CHUNK_SIZE_BYTES = 1920
    }

    private var audioRecord: AudioRecord? = null

    @Volatile
    private var isRecording = false
    private var recordingThread: Thread? = null

    @SuppressLint("MissingPermission")
    fun start() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            Log.w(TAG, "AudioPlaybackCapture requires Android 10 (API 29) or higher")
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
                .setChannelMask(CHANNEL_CONFIG)
                .build()

            val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            // OS circular ring buffer kept generous (16KB+) to avoid underflow
            val hardwareBufferSize = (minBufferSize * 4).coerceAtLeast(16384)

            audioRecord = AudioRecord.Builder()
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(hardwareBufferSize)
                .setAudioPlaybackCaptureConfig(config)
                .build()

            audioRecord?.startRecording()
            isRecording = true

            recordingThread = Thread({
                readAudioLoop()
            }, "AudioRecordThread").apply {
                start()
            }
            Log.d(TAG, "Internal game audio capture started successfully at 48kHz stereo (10ms low-latency chunks)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start internal audio capture: ${e.message}", e)
        }
    }

    private fun readAudioLoop() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
        } catch (ignored: Exception) {}

        val record = audioRecord ?: return
        val buffer = ByteArray(CHUNK_SIZE_BYTES)
        val startTimeNs = System.nanoTime()

        while (isRecording) {
            val readBytes = record.read(buffer, 0, buffer.size)
            if (readBytes > 0) {
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, buffer, 0, readBytes)
            } else if (readBytes < 0) {
                Log.w(TAG, "AudioRecord read error code: $readBytes")
                try { Thread.sleep(10) } catch (ignored: Exception) {}
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
            audioRecord?.stop()
        } catch (ignored: Exception) {}
        try {
            audioRecord?.release()
        } catch (ignored: Exception) {}
        audioRecord = null
        Log.d(TAG, "Internal game audio capture stopped")
    }
}
