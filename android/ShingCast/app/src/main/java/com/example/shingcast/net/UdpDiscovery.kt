package com.example.shingcast.net

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

data class DiscoveredServer(
    val ip: String,
    val port: Int,
    val serverName: String
)

object UdpDiscovery {
    private const val TAG = "UdpDiscovery"
    private const val UDP_PORT = 33334
    private const val DISCOVERY_PAYLOAD = "SHING_CAST_DISCOVERY"

    suspend fun discover(context: Context, timeoutMs: Int = 3000): DiscoveredServer? = withContext(Dispatchers.IO) {
        var socket: DatagramSocket? = null
        var multicastLock: WifiManager.MulticastLock? = null
        try {
            val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifi?.createMulticastLock("ShingCastUdpLock")?.apply {
                setReferenceCounted(true)
                acquire()
            }

            socket = DatagramSocket().apply {
                broadcast = true
                soTimeout = timeoutMs
            }

            val sendData = DISCOVERY_PAYLOAD.toByteArray(Charsets.UTF_8)
            val broadcastAddr = InetAddress.getByName("255.255.255.255")
            val sendPacket = DatagramPacket(sendData, sendData.size, broadcastAddr, UDP_PORT)
            socket.send(sendPacket)
            Log.d(TAG, "Sent discovery broadcast packet to 255.255.255.255:$UDP_PORT")

            val buf = ByteArray(1024)
            val recvPacket = DatagramPacket(buf, buf.size)
            socket.receive(recvPacket)

            val hostAddress = recvPacket.address.hostAddress ?: "127.0.0.1"
            val text = String(recvPacket.data, 0, recvPacket.length, Charsets.UTF_8).trim()
            Log.d(TAG, "Received UDP response from $hostAddress: $text")

            val json = JSONObject(text)
            val serverName = json.optString("server", "Shing Live")
            val port = json.optInt("port", 3333)

            DiscoveredServer(
                ip = hostAddress,
                port = port,
                serverName = serverName
            )
        } catch (e: Exception) {
            Log.w(TAG, "UDP discovery completed without response: ${e.message}")
            null
        } finally {
            try { socket?.close() } catch (ignored: Exception) {}
            try {
                if (multicastLock?.isHeld == true) {
                    multicastLock.release()
                }
            } catch (ignored: Exception) {}
        }
    }
}
