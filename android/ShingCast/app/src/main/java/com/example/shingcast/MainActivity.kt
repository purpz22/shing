package com.example.shingcast

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import com.example.shingcast.service.ScreenCaptureService
import com.example.shingcast.theme.ShingCastTheme
import com.example.shingcast.ui.main.MainCastScreen

class MainActivity : ComponentActivity() {

    private lateinit var mediaProjectionManager: MediaProjectionManager

    private var targetHost by mutableStateOf("192.168.1.100")
    private var targetPort by mutableStateOf(3333)
    private var targetIs1080p by mutableStateOf(true)
    private var targetEnableAudio by mutableStateOf(true)
    private var isCurrentlyStreaming by mutableStateOf(false)

    private val screenCaptureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            launchCaptureService(result.resultCode, result.data!!)
        } else {
            Toast.makeText(this, "Screen capture permission was cancelled", Toast.LENGTH_SHORT).show()
        }
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val recordAudioGranted = permissions[Manifest.permission.RECORD_AUDIO] ?: true
        if (!recordAudioGranted && targetEnableAudio) {
            Toast.makeText(this, "Audio permission denied, streaming video only", Toast.LENGTH_SHORT).show()
            targetEnableAudio = false
        }
        requestMediaProjection()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        mediaProjectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager

        // Load saved preferences
        val prefs = getSharedPreferences("ShingCastPrefs", Context.MODE_PRIVATE)
        targetHost = prefs.getString("last_host", "192.168.1.100") ?: "192.168.1.100"
        targetPort = prefs.getInt("last_port", 3333)

        // Parse pairing URI if launched from QR code: shingcast://connect?ip=<IP>&port=<PORT>
        handleIncomingIntent(intent)

        enableEdgeToEdge()
        setContent {
            ShingCastTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainCastScreen(
                        isStreaming = isCurrentlyStreaming || ScreenCaptureService.isStreaming,
                        initialHost = targetHost,
                        initialPort = targetPort,
                        onStartCast = { host, port, is1080p, audio ->
                            targetHost = host
                            targetPort = port
                            targetIs1080p = is1080p
                            targetEnableAudio = audio

                            prefs.edit()
                                .putString("last_host", host)
                                .putInt("last_port", port)
                                .apply()

                            checkPermissionsAndStart()
                        },
                        onStopCast = {
                            stopCaptureService()
                        }
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIncomingIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        isCurrentlyStreaming = ScreenCaptureService.isStreaming
    }

    private fun handleIncomingIntent(intent: Intent?) {
        val data: Uri? = intent?.data
        if (data != null && data.scheme == "shingcast") {
            val ipParam = data.getQueryParameter("ip")
            val portParam = data.getQueryParameter("port")
            if (!ipParam.isNullOrBlank()) targetHost = ipParam
            if (!portParam.isNullOrBlank()) targetPort = portParam.toIntOrNull() ?: 3333
            Toast.makeText(this, "Paired via QR Code to $targetHost:$targetPort", Toast.LENGTH_SHORT).show()
        }
    }

    private fun checkPermissionsAndStart() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (targetEnableAudio) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.RECORD_AUDIO)
            }
        }

        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        } else {
            requestMediaProjection()
        }
    }

    private fun requestMediaProjection() {
        val captureIntent = mediaProjectionManager.createScreenCaptureIntent()
        screenCaptureLauncher.launch(captureIntent)
    }

    private fun launchCaptureService(resultCode: Int, data: Intent) {
        val metrics = DisplayMetrics()
        val windowManager = windowManager
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)

        val screenWidth = metrics.widthPixels
        val screenHeight = metrics.heightPixels
        val density = metrics.densityDpi

        // Calculate aspect-ratio aligned dimensions (1080p or 720p base)
        val targetWidth: Int
        val targetHeight: Int
        val isPortrait = screenHeight >= screenWidth

        if (targetIs1080p) {
            if (isPortrait) {
                targetWidth = 1080
                targetHeight = ((1080.0 * screenHeight / screenWidth).toInt() / 16) * 16
            } else {
                targetHeight = 1080
                targetWidth = ((1080.0 * screenWidth / screenHeight).toInt() / 16) * 16
            }
        } else {
            if (isPortrait) {
                targetWidth = 720
                targetHeight = ((720.0 * screenHeight / screenWidth).toInt() / 16) * 16
            } else {
                targetHeight = 720
                targetWidth = ((720.0 * screenWidth / screenHeight).toInt() / 16) * 16
            }
        }

        val serviceIntent = Intent(this, ScreenCaptureService::class.java).apply {
            action = ScreenCaptureService.ACTION_START
            putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, resultCode)
            putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, data)
            putExtra(ScreenCaptureService.EXTRA_HOST, targetHost)
            putExtra(ScreenCaptureService.EXTRA_PORT, targetPort)
            putExtra(ScreenCaptureService.EXTRA_WIDTH, targetWidth)
            putExtra(ScreenCaptureService.EXTRA_HEIGHT, targetHeight)
            putExtra(ScreenCaptureService.EXTRA_DENSITY, density)
            putExtra(ScreenCaptureService.EXTRA_FPS, 60)
            putExtra(ScreenCaptureService.EXTRA_AUDIO, targetEnableAudio)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        isCurrentlyStreaming = true
        Toast.makeText(this, "Broadcasting screen to $targetHost:$targetPort", Toast.LENGTH_SHORT).show()
    }

    private fun stopCaptureService() {
        val stopIntent = Intent(this, ScreenCaptureService::class.java).apply {
            action = ScreenCaptureService.ACTION_STOP
        }
        startService(stopIntent)
        isCurrentlyStreaming = false
        Toast.makeText(this, "Screen cast stopped", Toast.LENGTH_SHORT).show()
    }
}
