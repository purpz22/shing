package com.example.shingcast.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.OrientationEventListener
import android.view.Surface
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import com.example.shingcast.MainActivity
import com.example.shingcast.encoder.AudioEncoder
import com.example.shingcast.encoder.VideoEncoder
import com.example.shingcast.net.CastClient

class ScreenCaptureService : Service() {

    companion object {
        private const val TAG = "ScreenCaptureService"
        const val ACTION_START = "com.example.shingcast.ACTION_START"
        const val ACTION_STOP = "com.example.shingcast.ACTION_STOP"
        const val EXTRA_RESULT_CODE = "EXTRA_RESULT_CODE"
        const val EXTRA_RESULT_DATA = "EXTRA_RESULT_DATA"
        const val EXTRA_HOST = "EXTRA_HOST"
        const val EXTRA_PORT = "EXTRA_PORT"
        const val EXTRA_WIDTH = "EXTRA_WIDTH"
        const val EXTRA_HEIGHT = "EXTRA_HEIGHT"
        const val EXTRA_DENSITY = "EXTRA_DENSITY"
        const val EXTRA_FPS = "EXTRA_FPS"
        const val EXTRA_AUDIO = "EXTRA_AUDIO"
        const val EXTRA_ORIENTATION_MODE = "EXTRA_ORIENTATION_MODE"

        private const val NOTIFICATION_CHANNEL_ID = "shing_cast_streaming_channel"
        private const val NOTIFICATION_ID = 40401

        @Volatile
        var isStreaming = false
            private set
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var videoEncoder: VideoEncoder? = null
    private var audioEncoder: AudioEncoder? = null
    private var castClient: CastClient? = null

    private var orientationMode = "auto"
    private var currentWidth = 1080
    private var currentHeight = 1920
    private var currentDensity = 420
    private var currentFps = 60
    private var isFullHd = true
    private var displayListener: DisplayManager.DisplayListener? = null
    private var orientationEventListener: OrientationEventListener? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        when (intent.action) {
            ACTION_START -> startStreaming(intent)
            ACTION_STOP -> stopStreaming()
        }

        return START_NOT_STICKY
    }

    private fun startStreaming(intent: Intent) {
        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val resultData = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
        val host = intent.getStringExtra(EXTRA_HOST) ?: "192.168.1.100"
        val port = intent.getIntExtra(EXTRA_PORT, 3333)
        val width = intent.getIntExtra(EXTRA_WIDTH, 1080)
        val height = intent.getIntExtra(EXTRA_HEIGHT, 1920)
        val density = intent.getIntExtra(EXTRA_DENSITY, 420)
        val fps = intent.getIntExtra(EXTRA_FPS, 60)
        val enableAudio = intent.getBooleanExtra(EXTRA_AUDIO, true)
        val mode = intent.getStringExtra(EXTRA_ORIENTATION_MODE) ?: "auto"

        if (resultData == null) {
            Log.e(TAG, "Missing MediaProjection resultData intent")
            stopSelf()
            return
        }

        orientationMode = mode
        currentWidth = width
        currentHeight = height
        currentDensity = density
        currentFps = fps
        isFullHd = width >= 1080 || height >= 1080

        // 1. Promote to Foreground Service before MediaProjection capture
        val notification = buildOngoingNotification(host, port)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            if (enableAudio && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                serviceType = serviceType or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
            }
            startForeground(NOTIFICATION_ID, notification, serviceType)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // 2. Obtain MediaProjection
        val mpManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = mpManager.getMediaProjection(resultCode, resultData)
        if (mp == null) {
            Log.e(TAG, "Failed to obtain MediaProjection instance")
            stopSelf()
            return
        }
        mediaProjection = mp

        // Register callback for system projection stop (e.g. user revoked from status bar)
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                Log.d(TAG, "MediaProjection callback onStop triggered")
                stopStreaming()
            }
        }, null)

        // 3. Connect WebSocket CastClient
        val client = CastClient(host, port, width, height, fps) { connected, error ->
            Log.d(TAG, "CastClient connection state: connected=$connected, error=$error")
            if (!connected && isStreaming) {
                // Keep trying or notify UI
            }
        }
        castClient = client
        client.connect()

        // 4. Start Hardware Video Encoder (Optimized bitrates for cool device thermals)
        val bitrate = if (isFullHd) 4_500_000 else 3_000_000
        val encoder = VideoEncoder(width, height, fps, bitrate, client)
        encoder.prepare()
        videoEncoder = encoder
        encoder.start()

        // 5. Create VirtualDisplay attached to encoder Surface
        val vd = mp.createVirtualDisplay(
            "ShingCastVirtualDisplay",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            encoder.inputSurface,
            null,
            null
        )
        virtualDisplay = vd

        // 6. Dynamic Display Rotation Tracking
        if (orientationMode == "auto") {
            startOrientationTracking()
        }

        // 7. Start Internal Game Audio Capture
        if (enableAudio) {
            val aEncoder = AudioEncoder(mp, client)
            audioEncoder = aEncoder
            aEncoder.start()
        }

        isStreaming = true
        Log.d(TAG, "Shing Cast stream started successfully to $host:$port (${width}x${height} @ ${fps}FPS, mode=$orientationMode)")
    }

    private fun startOrientationTracking() {
        try {
            orientationEventListener = object : OrientationEventListener(this, SensorManager.SENSOR_DELAY_NORMAL) {
                override fun onOrientationChanged(orientation: Int) {
                    if (orientation == ORIENTATION_UNKNOWN) return

                    // Check landscape angles (60..120 is right, 240..300 is left)
                    val isLandscapeAngle = (orientation in 60..120) || (orientation in 240..300)
                    val isPortraitAngle = (orientation in 330..360) || (orientation in 0..30) || (orientation in 150..210)

                    if (isLandscapeAngle && currentWidth < currentHeight) {
                        handleOrientationFlip(true)
                    } else if (isPortraitAngle && currentWidth > currentHeight) {
                        handleOrientationFlip(false)
                    }
                }
            }
            if (orientationEventListener?.canDetectOrientation() == true) {
                orientationEventListener?.enable()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start OrientationEventListener: ${e.message}")
        }

        // Secondary trigger: DisplayManager DisplayListener + WindowManager rotation
        val displayManager = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
        if (displayManager != null) {
            displayListener = object : DisplayManager.DisplayListener {
                override fun onDisplayAdded(displayId: Int) {}
                override fun onDisplayRemoved(displayId: Int) {}
                override fun onDisplayChanged(displayId: Int) {
                    if (displayId == Display.DEFAULT_DISPLAY) {
                        checkDisplayRotation()
                    }
                }
            }
            displayManager.registerDisplayListener(
                displayListener,
                Handler(Looper.getMainLooper())
            )
        }
    }

    private fun checkDisplayRotation() {
        if (!isStreaming || mediaProjection == null) return
        val windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        @Suppress("DEPRECATION")
        val display = windowManager.defaultDisplay ?: return
        val rotation = display.rotation
        val isLandscapeRot = (rotation == Surface.ROTATION_90 || rotation == Surface.ROTATION_270)
        if (isLandscapeRot && currentWidth < currentHeight) {
            handleOrientationFlip(true)
        } else if (!isLandscapeRot && currentWidth > currentHeight && orientationMode == "auto") {
            handleOrientationFlip(false)
        }
    }

    @Synchronized
    private fun handleOrientationFlip(toLandscape: Boolean) {
        if (!isStreaming || mediaProjection == null) return
        val activeIsLandscape = currentWidth > currentHeight
        if (toLandscape == activeIsLandscape) return

        val metrics = DisplayMetrics()
        val windowManager = getSystemService(Context.WINDOW_SERVICE) as? WindowManager
        @Suppress("DEPRECATION")
        windowManager?.defaultDisplay?.getRealMetrics(metrics)

        val maxDim = maxOf(metrics.widthPixels, metrics.heightPixels).coerceAtLeast(1920)
        val minDim = minOf(metrics.widthPixels, metrics.heightPixels).coerceAtLeast(1080)

        val newWidth: Int
        val newHeight: Int

        // Use native phone aspect ratio to eliminate letterbox/pillarbox borders completely!
        if (toLandscape) {
            if (isFullHd) {
                newWidth = ((maxDim) / 16) * 16
                newHeight = ((minDim) / 16) * 16
            } else {
                newHeight = 720
                newWidth = (((maxDim.toDouble() / minDim) * 720).toInt() / 16) * 16
            }
        } else {
            if (isFullHd) {
                newWidth = ((minDim) / 16) * 16
                newHeight = ((maxDim) / 16) * 16
            } else {
                newWidth = 720
                newHeight = (((maxDim.toDouble() / minDim) * 720).toInt() / 16) * 16
            }
        }

        Log.d(TAG, "Orientation flipped: toLandscape=$toLandscape -> ${newWidth}x${newHeight}")
        currentWidth = newWidth
        currentHeight = newHeight

        // Stop previous video encoder
        try { videoEncoder?.stop() } catch (ignored: Exception) {}

        // Notify desktop server and overlays of new resolution
        castClient?.updateResolution(newWidth, newHeight)

        // Spin up new video encoder with rotated dimensions
        val client = castClient ?: return
        val rotBitrate = if (isFullHd) 4_500_000 else 3_000_000
        val newEncoder = VideoEncoder(newWidth, newHeight, currentFps, rotBitrate, client)
        try {
            newEncoder.prepare()
            videoEncoder = newEncoder
            newEncoder.start()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start new encoder on rotation: ${e.message}", e)
            return
        }

        // Resize VirtualDisplay to match new dimensions
        try {
            virtualDisplay?.resize(newWidth, newHeight, currentDensity)
            virtualDisplay?.surface = newEncoder.inputSurface
            Log.d(TAG, "VirtualDisplay successfully resized to ${newWidth}x${newHeight}")
        } catch (e: Exception) {
            Log.w(TAG, "VirtualDisplay resize failed, recreating: ${e.message}")
            try { virtualDisplay?.release() } catch (ignored: Exception) {}
            virtualDisplay = mediaProjection?.createVirtualDisplay(
                "ShingCastVirtualDisplay",
                newWidth,
                newHeight,
                currentDensity,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                newEncoder.inputSurface,
                null,
                null
            )
        }
    }

    private fun stopStreaming() {
        if (!isStreaming && mediaProjection == null) return
        Log.d(TAG, "Stopping Shing Cast stream")

        if (orientationEventListener != null) {
            try { orientationEventListener?.disable() } catch (ignored: Exception) {}
            orientationEventListener = null
        }
        if (displayListener != null) {
            try {
                val displayManager = getSystemService(Context.DISPLAY_SERVICE) as? DisplayManager
                displayManager?.unregisterDisplayListener(displayListener)
            } catch (ignored: Exception) {}
            displayListener = null
        }

        try { audioEncoder?.stop() } catch (ignored: Exception) {}
        audioEncoder = null

        try { virtualDisplay?.release() } catch (ignored: Exception) {}
        virtualDisplay = null

        try { videoEncoder?.stop() } catch (ignored: Exception) {}
        videoEncoder = null

        try { castClient?.disconnect() } catch (ignored: Exception) {}
        castClient = null

        try { mediaProjection?.stop() } catch (ignored: Exception) {}
        mediaProjection = null

        isStreaming = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopStreaming()
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Shing Cast Screen Mirror",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Ongoing notification for screen and game audio mirroring to Shing Live"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildOngoingNotification(host: String, port: Int): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val contentPendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val stopIntent = Intent(this, ScreenCaptureService::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getService(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Shing Cast Active")
            .setContentText("Broadcasting screen and internal audio to $host:$port")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .setContentIntent(contentPendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop Cast", stopPendingIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }
}
