package com.example.shingcast.ui.main

import android.content.Context
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.shingcast.net.UdpDiscovery
import kotlinx.coroutines.launch

@Composable
fun MainCastScreen(
    isStreaming: Boolean,
    initialHost: String,
    initialPort: Int,
    initialOrientationMode: String = "auto",
    onStartCast: (host: String, port: Int, is1080p: Boolean, enableAudio: Boolean, orientationMode: String) -> Unit,
    onStopCast: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var host by remember { mutableStateOf(initialHost) }
    var portText by remember { mutableStateOf(initialPort.toString()) }
    var is1080p by remember { mutableStateOf(true) }
    var enableAudio by remember { mutableStateOf(true) }
    var orientationMode by remember { mutableStateOf(initialOrientationMode) }
    var isDiscovering by remember { mutableStateOf(false) }
    var discoveryStatus by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF0F0E17))
            .padding(16.dp)
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Spacer(modifier = Modifier.height(16.dp))

        // 1. Branding Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Shing Cast",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC)
                )
                Text(
                    text = "Wireless Screen Mirror for OBS",
                    fontSize = 13.sp,
                    color = Color(0xFF94A3B8)
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(Color(0xFF2E1065))
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    text = "Zero Dev Mode",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color(0xFFC084FC)
                )
            }
        }

        // 2. Connection Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B2E))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Desktop Server Connection",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC)
                )

                // UDP Auto-Discovery Button
                OutlinedButton(
                    onClick = {
                        if (isDiscovering) return@OutlinedButton
                        isDiscovering = true
                        discoveryStatus = "Scanning local Wi-Fi for Shing Live..."
                        coroutineScope.launch {
                            val server = UdpDiscovery.discover(context, 3500)
                            isDiscovering = false
                            if (server != null) {
                                host = server.ip
                                portText = server.port.toString()
                                discoveryStatus = "Found ${server.serverName} at ${server.ip}:${server.port}"
                            } else {
                                discoveryStatus = "No desktop server responded. Enter IP manually below."
                            }
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    enabled = !isStreaming
                ) {
                    if (isDiscovering) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .width(18.dp)
                                .height(18.dp),
                            color = Color(0xFFA855F7),
                            strokeWidth = 2.dp
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text(
                        text = if (isDiscovering) "Searching Wi-Fi..." else "Auto-Detect Shing Live PC",
                        color = Color(0xFFA855F7),
                        fontWeight = FontWeight.SemiBold
                    )
                }

                discoveryStatus?.let { status ->
                    Text(
                        text = status,
                        fontSize = 12.sp,
                        color = if (status.startsWith("Found")) Color(0xFF10B981) else Color(0xFFCBD5E1)
                    )
                }

                // IP & Port inputs
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    OutlinedTextField(
                        value = host,
                        onValueChange = { host = it.trim() },
                        label = { Text("PC IP Address") },
                        modifier = Modifier.weight(2.5f),
                        singleLine = true,
                        enabled = !isStreaming,
                        shape = RoundedCornerShape(10.dp)
                    )
                    OutlinedTextField(
                        value = portText,
                        onValueChange = { portText = it.trim() },
                        label = { Text("Port") },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        enabled = !isStreaming,
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            }
        }

        // 3. Quality & Audio Settings Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF1E1B2E))
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Stream Settings",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFFF8FAFC)
                )

                // Resolution Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = if (is1080p) "1080p Full HD (60 FPS)" else "720p HD (60 FPS)",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFF8FAFC)
                        )
                        Text(
                            text = if (is1080p) "Crisp gaming visuals (6 Mbps)" else "Lower battery usage (3.5 Mbps)",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                    Switch(
                        checked = is1080p,
                        onCheckedChange = { is1080p = it },
                        enabled = !isStreaming
                    )
                }

                // Audio Capture Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Internal Game Audio",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFF8FAFC)
                        )
                        Text(
                            text = "Direct game sound without room microphone noise",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                    Switch(
                        checked = enableAudio,
                        onCheckedChange = { enableAudio = it },
                        enabled = !isStreaming
                    )
                }

                // Orientation Mode Selector
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Column {
                        Text(
                            text = "Orientation Mode",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFF8FAFC)
                        )
                        Text(
                            text = when (orientationMode) {
                                "landscape" -> "Locked to Landscape 16:9 (Mobile Legends, Wild Rift, COD Mobile)"
                                "portrait" -> "Locked to Portrait 9:16 (TikTok, Reels, vertical apps)"
                                else -> "Auto Sensor (adapts dynamically when phone rotates)"
                            },
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        listOf(
                            "auto" to "Auto Sensor",
                            "landscape" to "Landscape 16:9",
                            "portrait" to "Portrait 9:16"
                        ).forEach { (mode, label) ->
                            val isSelected = orientationMode == mode
                            Box(
                                modifier = Modifier
                                    .weight(1f)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(if (isSelected) Color(0xFFA855F7) else Color(0xFF262338))
                                    .clickable(enabled = !isStreaming) { orientationMode = mode }
                                    .padding(vertical = 10.dp, horizontal = 4.dp),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = label,
                                    fontSize = 11.5.sp,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    color = if (isSelected) Color.White else Color(0xFFCBD5E1),
                                    maxLines = 1
                                )
                            }
                        }
                    }
                }
            }
        }

        // 4. Big Action Button (Start / Stop)
        Button(
            onClick = {
                if (isStreaming) {
                    onStopCast()
                } else {
                    val port = portText.toIntOrNull() ?: 3333
                    onStartCast(host, port, is1080p, enableAudio, orientationMode)
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isStreaming) Color(0xFFEF4444) else Color(0xFFA855F7)
            )
        ) {
            Text(
                text = if (isStreaming) "Stop Screen Cast" else "Start Wireless Cast",
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White
            )
        }

        // 5. Status Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xFF161424))
        ) {
            Column(
                modifier = Modifier.padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .width(8.dp)
                            .height(8.dp)
                            .clip(RoundedCornerShape(999.dp))
                            .background(if (isStreaming) Color(0xFF10B981) else Color(0xFF64748B))
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = if (isStreaming) "Broadcasting to OBS" else "Ready to Stream",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = if (isStreaming) Color(0xFF10B981) else Color(0xFF94A3B8)
                    )
                }
                Text(
                    text = if (isStreaming) {
                        val modeLabel = when (orientationMode) {
                            "landscape" -> "Landscape 16:9"
                            "portrait" -> "Portrait 9:16"
                            else -> "Auto Sensor"
                        }
                        "Target: ws://$host:${portText}/ws/cast (${if (is1080p) "1080p" else "720p"} @ 60 FPS, $modeLabel)"
                    } else {
                        "Tap Start Wireless Cast and select Start now on the Android system prompt to begin mirroring."
                    },
                    fontSize = 11.5.sp,
                    color = Color(0xFF94A3B8)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}
