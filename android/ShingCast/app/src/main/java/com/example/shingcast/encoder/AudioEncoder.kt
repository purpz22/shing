package com.example.shingcast.encoder

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.os.Build
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
            val bufferSize = (minBufferSize * 2).coerceAtLeast(4096)

            audioRecord = AudioRecord.Builder()
                .setAudioFormat(audioFormat)
                .setBufferSizeInBytes(bufferSize)
                .setAudioPlaybackCaptureConfig(config)
                .build()

            audioRecord?.startRecording()
            isRecording = true

            recordingThread = Thread({
                readAudioLoop(bufferSize)
            }, "AudioRecordThread").apply {
                priority = Thread.NORM_PRIORITY + 2
                start()
            }
            Log.d(TAG, "Internal game audio capture started successfully at 48kHz stereo")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start internal audio capture: ${e.message}", e)
        }
    }

    private fun readAudioLoop(bufferSize: Int) {
        val record = audioRecord ?: return
        val buffer = ByteArray(bufferSize)
        val startTimeNs = System.nanoTime()

        while (isRecording) {
            val readBytes = record.read(buffer, 0, buffer.size)
            if (readBytes > 0) {
                val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                client.sendBinaryPacket(CastClient.PACKET_AUDIO, ptsMs, buffer, 0, readBytes)
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
