package com.example.shingcast.encoder

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
import android.os.Process
import android.util.Log
import android.view.Surface
import com.example.shingcast.net.CastClient
import java.nio.ByteBuffer

class VideoEncoder(
    val width: Int,
    val height: Int,
    val fps: Int = 60,
    val bitrateBps: Int = 6_000_000,
    private val client: CastClient
) {
    companion object {
        private const val TAG = "VideoEncoder"
        private const val MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC // H.264
        private const val I_FRAME_INTERVAL_SEC = 1 // 1-second keyframe interval for low-latency sync
        private const val TIMEOUT_USEC = 10_000L
    }

    private var mediaCodec: MediaCodec? = null
    var inputSurface: Surface? = null
        private set

    @Volatile
    private var isRunning = false
    private var encodeThread: Thread? = null

    private var cachedConfig: ByteArray? = null

    fun prepare() {
        val codec = MediaCodec.createEncoderByType(MIME_TYPE)
        var actualWidth = width
        var actualHeight = height

        try {
            val caps = codec.codecInfo.getCapabilitiesForType(MIME_TYPE)
            val videoCaps = caps?.videoCapabilities
            if (videoCaps != null && !videoCaps.isSizeSupported(actualWidth, actualHeight)) {
                val maxW = videoCaps.supportedWidths?.upper ?: actualWidth
                val maxH = videoCaps.supportedHeights?.upper ?: actualHeight
                val scale = minOf(maxW.toDouble() / actualWidth, maxH.toDouble() / actualHeight, 1.0)
                actualWidth = ((actualWidth * scale).toInt() / 16) * 16
                actualHeight = ((actualHeight * scale).toInt() / 16) * 16
                Log.w(TAG, "Hardware encoder does not support native ${width}x${height}, scaling to ${actualWidth}x${actualHeight}")
            }
        } catch (ignored: Exception) {}

        val format = MediaFormat.createVideoFormat(MIME_TYPE, actualWidth, actualHeight).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, bitrateBps)
            setInteger(MediaFormat.KEY_FRAME_RATE, fps)
            setInteger(MediaFormat.KEY_CAPTURE_RATE, fps)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL_SEC)
            setInteger(MediaFormat.KEY_BITRATE_MODE, MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_VBR)

            // Ultra-low latency tuning
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                setInteger(MediaFormat.KEY_LATENCY, 0)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                setInteger(MediaFormat.KEY_PRIORITY, 0) // Realtime priority
            }
            try {
                setInteger(MediaFormat.KEY_PROFILE, MediaCodecInfo.CodecProfileLevel.AVCProfileBaseline)
                if (actualWidth > 1920 || actualHeight > 1920) {
                    setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel5)
                } else {
                    setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel42)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Baseline profile configuration failed, falling back to codec defaults: ${e.message}")
            }
        }

        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = codec.createInputSurface()
        mediaCodec = codec
        Log.d(TAG, "Hardware H.264 VideoEncoder configured successfully: ${actualWidth}x${actualHeight} @ ${fps}FPS, ${bitrateBps / 1000}kbps")
    }

    fun start() {
        val codec = mediaCodec ?: throw IllegalStateException("VideoEncoder not prepared")
        codec.start()
        isRunning = true

        encodeThread = Thread({
            drainEncoder(codec)
        }, "VideoEncoderThread").apply {
            priority = Thread.NORM_PRIORITY + 1
            start()
        }
    }

    private fun drainEncoder(codec: MediaCodec) {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY)
        } catch (ignored: Exception) {}

        val bufferInfo = MediaCodec.BufferInfo()
        val startTimeNs = System.nanoTime()

        while (isRunning) {
            val outputBufferIndex = try {
                codec.dequeueOutputBuffer(bufferInfo, TIMEOUT_USEC)
            } catch (e: Exception) {
                Log.w(TAG, "Exception during dequeueOutputBuffer: ${e.message}")
                break
            }

            if (outputBufferIndex == MediaCodec.INFO_TRY_AGAIN_LATER) {
                // Sleep 2ms when idle to allow CPU core to cool down and prevent thermal throttling
                try { Thread.sleep(2) } catch (ignored: Exception) {}
                continue
            } else if (outputBufferIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val newFormat = codec.outputFormat
                Log.d(TAG, "VideoEncoder output format changed: $newFormat")
                // Extract SPS / PPS if available in format buffers
                val sps = newFormat.getByteBuffer("csd-0")
                val pps = newFormat.getByteBuffer("csd-1")
                if (sps != null && pps != null) {
                    val spsRem = sps.remaining()
                    val ppsRem = pps.remaining()
                    val configBytes = ByteArray(spsRem + ppsRem)
                    sps.get(configBytes, 0, spsRem)
                    pps.get(configBytes, spsRem, ppsRem)
                    cachedConfig = configBytes
                    client.sendBinaryPacket(CastClient.PACKET_VIDEO_CONFIG, 0L, configBytes)
                }
            } else if (outputBufferIndex >= 0) {
                val outputBuffer: ByteBuffer? = codec.getOutputBuffer(outputBufferIndex)
                if (outputBuffer != null && bufferInfo.size > 0) {
                    outputBuffer.position(bufferInfo.offset)
                    outputBuffer.limit(bufferInfo.offset + bufferInfo.size)

                    val ptsMs = (System.nanoTime() - startTimeNs) / 1_000_000L
                    val data = ByteArray(bufferInfo.size)
                    outputBuffer.get(data)

                    val isConfig = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
                    val isKeyFrameFlag = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0

                    if (isConfig) {
                        cachedConfig = data
                        client.sendBinaryPacket(CastClient.PACKET_VIDEO_CONFIG, ptsMs, data)
                    } else if (isKeyFrameFlag || (cachedConfig == null && hasIdrSlice(data))) {
                        // Only perform heavy CPU NAL parsing for keyframes / config
                        val extractedConfig = if (cachedConfig == null) extractConfigBytes(data) else null
                        if (extractedConfig != null) {
                            cachedConfig = extractedConfig
                            client.sendBinaryPacket(CastClient.PACKET_VIDEO_CONFIG, ptsMs, extractedConfig)
                        }

                        val packet = if (cachedConfig != null && !hasSpsPrefix(data)) {
                            val combined = ByteArray(cachedConfig!!.size + data.size)
                            System.arraycopy(cachedConfig!!, 0, combined, 0, cachedConfig!!.size)
                            System.arraycopy(data, 0, combined, cachedConfig!!.size, data.size)
                            combined
                        } else {
                            data
                        }
                        client.sendBinaryPacket(CastClient.PACKET_VIDEO_KEYFRAME, ptsMs, packet)
                    } else {
                        // Keep outgoing TCP queue shallow (max 64KB) so audio packets are never delayed behind video
                        if (client.getQueueSize() < 64 * 1024L) {
                            client.sendBinaryPacket(CastClient.PACKET_VIDEO_DELTA, ptsMs, data)
                        }
                    }
                }

                codec.releaseOutputBuffer(outputBufferIndex, false)

                if ((bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    Log.d(TAG, "End of stream reached in VideoEncoder")
                    break
                }
            }
        }
    }

    fun stop() {
        isRunning = false
        try {
            encodeThread?.join(1000)
        } catch (ignored: Exception) {}
        encodeThread = null

        try {
            mediaCodec?.stop()
        } catch (ignored: Exception) {}
        try {
            mediaCodec?.release()
        } catch (ignored: Exception) {}
        mediaCodec = null

        try {
            inputSurface?.release()
        } catch (ignored: Exception) {}
        inputSurface = null
        Log.d(TAG, "VideoEncoder stopped and released")
    }

    private fun getStartCodeLen(data: ByteArray, index: Int): Int {
        val len = data.size
        if (index + 2 < len && data[index] == 0.toByte() && data[index + 1] == 0.toByte() && data[index + 2] == 1.toByte()) {
            return 3
        }
        if (index + 3 < len && data[index] == 0.toByte() && data[index + 1] == 0.toByte() && data[index + 2] == 0.toByte() && data[index + 3] == 1.toByte()) {
            return 4
        }
        return 0
    }

    private fun extractConfigBytes(data: ByteArray): ByteArray? {
        var spsStart = -1
        var nextSliceStart = -1
        var i = 0
        val len = data.size

        while (i < len - 3) {
            val codeLen = getStartCodeLen(data, i)
            if (codeLen > 0) {
                if (i + codeLen < len) {
                    val nalType = data[i + codeLen].toInt() and 0x1F
                    if (nalType == 7 && spsStart == -1) {
                        spsStart = i
                    } else if ((nalType == 1 || nalType == 5) && spsStart != -1) {
                        nextSliceStart = i
                        break
                    }
                }
                i += codeLen
            } else {
                i++
            }
        }

        if (spsStart != -1) {
            val end = if (nextSliceStart != -1) nextSliceStart else len
            val config = ByteArray(end - spsStart)
            System.arraycopy(data, spsStart, config, 0, config.size)
            return config
        }
        return null
    }

    private fun hasIdrSlice(data: ByteArray): Boolean {
        var i = 0
        val len = data.size
        while (i < len - 3) {
            val codeLen = getStartCodeLen(data, i)
            if (codeLen > 0) {
                if (i + codeLen < len) {
                    val nalType = data[i + codeLen].toInt() and 0x1F
                    if (nalType == 5) return true
                }
                i += codeLen
            } else {
                i++
            }
        }
        return false
    }

    private fun hasSpsPrefix(data: ByteArray): Boolean {
        if (data.size < 4) return false
        val codeLen = getStartCodeLen(data, 0)
        if (codeLen > 0 && codeLen < data.size) {
            val nalType = data[codeLen].toInt() and 0x1F
            return nalType == 7
        }
        return false
    }
}
