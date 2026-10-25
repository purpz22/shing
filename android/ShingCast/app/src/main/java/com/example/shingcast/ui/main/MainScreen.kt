package com.example.shingcast.ui.main

import android.content.Context
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
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
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.shingcast.R
import com.example.shingcast.net.UdpDiscovery
import kotlinx.coroutines.launch

@Composable
fun MainCastScreen(
    isStreaming: Boolean,
    initialHost: String,
    initialPort: Int,
    initialOrientationMode: String = "landscape",
    initialAudioMode: String = "mixed",
    initialMicBoost: Float = 1.25f,
    initialNoiseFilter: Boolean = false,
    onStartCast: (host: String, port: Int, is1080p: Boolean, audioMode: String, micBoost: Float, noiseFilter: Boolean, orientationMode: String) -> Unit,
    onStopCast: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    var host by remember { mutableStateOf(initialHost) }
    var portText by remember { mutableStateOf(initialPort.toString()) }
    var is1080p by remember { mutableStateOf(false) }
    var audioEnabled by remember { mutableStateOf(initialAudioMode != "off") }
    var audioMode by remember { mutableStateOf(if (initialAudioMode == "off") "mixed" else initialAudioMode) }
    var micBoost by remember { mutableStateOf(initialMicBoost) }
    var noiseFilter by remember { mutableStateOf(initialNoiseFilter) }
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
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Image(
                    painter = painterResource(id = R.drawable.ic_logo),
                    contentDescription = "Shing Cast Logo",
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                )
                Column {
                    Text(
                        text = "Shing Cast",
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFF8FAFC)
                    )
                    Text(
                        text = "Ultra Low-Latency Wireless Streamer",
                        fontSize = 11.5.sp,
                        color = Color(0xFF94A3B8)
                    )
                }
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFF262338))
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
                verticalArrangement = Arrangement.spacedBy(14.dp)
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
                            text = if (is1080p) "1080p Full HD (60 FPS)" else "720p HD (60 FPS - Cool & Smooth)",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFF8FAFC)
                        )
                        Text(
                            text = if (is1080p) "Maximum sharpness (4.5 Mbps - uses more battery/heat)" else "Recommended for gaming (3.0 Mbps - low CPU & cool)",
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

                // Audio Streaming Master Toggle
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "Audio Streaming",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = Color(0xFFF8FAFC)
                        )
                        Text(
                            text = "Transmit high-fidelity 48kHz stereo sound to software",
                            fontSize = 12.sp,
                            color = Color(0xFF94A3B8)
                        )
                    }
                    Switch(
                        checked = audioEnabled,
                        onCheckedChange = { audioEnabled = it },
                        enabled = !isStreaming
                    )
                }

                // Audio Source Selector (Mic, Mixed, Game)
                if (audioEnabled) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Audio Source",
                                fontSize = 13.5.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = Color(0xFFF8FAFC)
                            )
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Color(0xFF262338))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = when (audioMode) {
                                        "mic" -> "Phone Mic Only"
                                        "mixed" -> "Game + Mic Mixed"
                                        else -> "Game Audio Only"
                                    },
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFA855F7)
                                )
                            }
                        }

                        Text(
                            text = when (audioMode) {
                                "mic" -> "Phone Microphone: Use phone as a wireless streaming mic for OBS and PNGTuber"
                                "mixed" -> "Mixed Sound: Mixes internal game sound effects with your voice from the microphone"
                                else -> "Game Audio: Clean internal game sound without background room noise"
                            },
                            fontSize = 11.5.sp,
                            color = Color(0xFF94A3B8)
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            listOf(
                                "mic" to "Phone Mic",
                                "mixed" to "Game + Mic",
                                "internal" to "Game Audio"
                            ).forEach { (mode, label) ->
                                val isSelected = audioMode == mode
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isSelected) Color(0xFFA855F7) else Color(0xFF262338))
                                        .clickable(enabled = !isStreaming) { audioMode = mode }
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

                        // Microphone Volume Boost Slider (when Mic or Mixed is selected)
                        if (audioMode == "mic" || audioMode == "mixed") {
                            Spacer(modifier = Modifier.height(4.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Microphone Gain / Boost",
                                    fontSize = 12.5.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = Color(0xFFF8FAFC)
                                )
                                Text(
                                    text = "${(micBoost * 100).toInt()}%",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color(0xFFC084FC)
                                )
                            }
                            Slider(
                                value = micBoost,
                                onValueChange = { micBoost = it },
                                valueRange = 1.0f..2.5f,
                                steps = 5,
                                enabled = !isStreaming,
                                colors = SliderDefaults.colors(
                                    thumbColor = Color(0xFFA855F7),
                                    activeTrackColor = Color(0xFFA855F7),
                                    inactiveTrackColor = Color(0xFF262338)
                                )
                            )
                            Text(
                                text = "Boosts voice clarity so your commentary sounds loud and crisp over game sound effects",
                                fontSize = 11.sp,
                                color = Color(0xFF64748B)
                            )

                            Spacer(modifier = Modifier.height(10.dp))
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .background(Color(0xFF1E1B2E), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 12.dp, vertical = 9.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "Clean Raw Capture (48kHz)",
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Color(0xFFC084FC)
                                    )
                                    Text(
                                        text = "Pure uncompressed PCM. AI voice isolation runs on PC with zero lag and zero cutoff.",
                                        fontSize = 10.5.sp,
                                        color = Color(0xFF94A3B8)
                                    )
                                }
                            }
                        }
                    }
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
                                "landscape" -> "Locked to Landscape Gaming (Mobile Legends, Wild Rift, COD Mobile with zero black borders)"
                                "portrait" -> "Locked to Portrait (TikTok, Reels, vertical feeds)"
                                else -> "Auto Sensor (automatically tracks phone rotation)"
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
                            "landscape" to "Landscape (Gaming)",
                            "auto" to "Auto Sensor",
                            "portrait" to "Portrait (Feed)"
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
                    val effectiveAudioMode = if (audioEnabled) audioMode else "off"
                    onStartCast(host, port, is1080p, effectiveAudioMode, micBoost, noiseFilter, orientationMode)
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
                        text = if (isStreaming) "Broadcasting to OBS / PC" else "Ready to Stream",
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
                        val audioSummary = when (if (audioEnabled) audioMode else "off") {
                            "mic" -> "Phone Mic Active (${(micBoost * 100).toInt()}%)"
                            "mixed" -> "Game + Mic Mixed (${(micBoost * 100).toInt()}%)"
                            "internal" -> "Internal Game Audio"
                            else -> "Audio Muted"
                        }
                        "Target: ws://$host:${portText}/ws/cast\nVideo: ${if (is1080p) "1080p" else "720p"} @ 60 FPS ($modeLabel)\nAudio: $audioSummary"
                    } else {
                        "Tap Start Wireless Cast and grant screen capture to mirror your screen and stream your phone microphone to Shing Live & OBS."
                    },
                    fontSize = 11.5.sp,
                    color = Color(0xFF94A3B8)
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}
