package com.example.shingcast.net

import android.os.Build
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit

class CastClient(
    private val host: String,
    private val port: Int,
    private val width: Int,
    private val height: Int,
    private val fps: Int,
    private val onConnectionStateChanged: (Boolean, String?) -> Unit
) {
    companion object {
        private const val TAG = "CastClient"
        const val PACKET_VIDEO_CONFIG: Byte = 0x01
        const val PACKET_VIDEO_KEYFRAME: Byte = 0x02
        const val PACKET_VIDEO_DELTA: Byte = 0x03
        const val PACKET_AUDIO: Byte = 0x04
    }

    private var webSocket: WebSocket? = null
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .writeTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(10, TimeUnit.SECONDS)
        .build()

    @Volatile
    var isConnected = false
        private set

    fun connect() {
        val url = "ws://$host:$port/ws/cast"
        Log.d(TAG, "Connecting to Shing Cast server at: $url")
        val request = Request.Builder().url(url).build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connected successfully to $url")
                isConnected = true

                // Send sender registration packet
                val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
                val registerMsg = JSONObject().apply {
                    put("type", "cast:register")
                    put("role", "sender")
                    put("deviceName", deviceName)
                    put("width", width)
                    put("height", height)
                    put("fps", fps)
                }
                ws.send(registerMsg.toString())
                onConnectionStateChanged(true, null)
            }

            override fun onMessage(ws: WebSocket, text: String) {
                Log.d(TAG, "Server text message: $text")
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code / $reason")
                isConnected = false
                onConnectionStateChanged(false, reason)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closed: $code / $reason")
                isConnected = false
                onConnectionStateChanged(false, reason)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket connection failed: ${t.message}", t)
                isConnected = false
                onConnectionStateChanged(false, t.message ?: "Connection failed")
            }
        })
    }

    fun sendBinaryPacket(type: Byte, ptsMs: Long, data: ByteArray, offset: Int = 0, length: Int = data.size) {
        val ws = webSocket ?: return
        if (!isConnected) return

        try {
            val totalSize = 5 + length
            val buffer = ByteBuffer.allocate(totalSize).order(ByteOrder.BIG_ENDIAN)
            buffer.put(type)
            buffer.putInt((ptsMs and 0xFFFFFFFFL).toInt())
            buffer.put(data, offset, length)
            buffer.flip()

            val byteString = buffer.array().toByteString(0, totalSize)
            ws.send(byteString)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to send binary packet: ${e.message}")
        }
    }

    fun disconnect() {
        try {
            webSocket?.close(1000, "User stopped stream")
        } catch (ignored: Exception) {}
        isConnected = false
        webSocket = null
    }
}
