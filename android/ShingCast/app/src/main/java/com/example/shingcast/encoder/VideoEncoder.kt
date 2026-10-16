package com.example.shingcast.encoder

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.os.Build
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
        val format = MediaFormat.createVideoFormat(MIME_TYPE, width, height).apply {
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
                setInteger(MediaFormat.KEY_LEVEL, MediaCodecInfo.CodecProfileLevel.AVCLevel42)
            } catch (e: Exception) {
                Log.w(TAG, "Baseline profile configuration failed, falling back to codec defaults: ${e.message}")
            }
        }

        val codec = MediaCodec.createEncoderByType(MIME_TYPE)
        codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        inputSurface = codec.createInputSurface()
        mediaCodec = codec
        Log.d(TAG, "Hardware H.264 VideoEncoder configured successfully: ${width}x${height} @ ${fps}FPS, ${bitrateBps / 1000}kbps")
    }

    fun start() {
        val codec = mediaCodec ?: throw IllegalStateException("VideoEncoder not prepared")
        codec.start()
        isRunning = true

        encodeThread = Thread({
            drainEncoder(codec)
        }, "VideoEncoderThread").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    private fun drainEncoder(codec: MediaCodec) {
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
                    val isKeyFrame = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0

                    if (isConfig) {
                        cachedConfig = data
                        client.sendBinaryPacket(CastClient.PACKET_VIDEO_CONFIG, ptsMs, data)
                    } else if (isKeyFrame) {
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
                        client.sendBinaryPacket(CastClient.PACKET_VIDEO_DELTA, ptsMs, data)
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

    private fun hasSpsPrefix(data: ByteArray): Boolean {
        if (data.size < 5) return false
        if (data[0] == 0.toByte() && data[1] == 0.toByte() && data[2] == 0.toByte() && data[3] == 1.toByte()) {
            val nalType = (data[4].toInt() and 0x1F)
            return nalType == 7
        }
        if (data[0] == 0.toByte() && data[1] == 0.toByte() && data[2] == 1.toByte()) {
            val nalType = (data[3].toInt() and 0x1F)
            return nalType == 7
        }
        return false
    }
}
