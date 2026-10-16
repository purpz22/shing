package com.example.shingcast.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Log
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

        if (resultData == null) {
            Log.e(TAG, "Missing MediaProjection resultData intent")
            stopSelf()
            return
        }

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

        // 4. Start Hardware Video Encoder
        val encoder = VideoEncoder(width, height, fps, 6_000_000, client)
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

        // 6. Start Internal Game Audio Capture
        if (enableAudio) {
            val aEncoder = AudioEncoder(mp, client)
            audioEncoder = aEncoder
            aEncoder.start()
        }

        isStreaming = true
        Log.d(TAG, "Shing Cast stream started successfully to $host:$port (${width}x${height} @ ${fps}FPS)")
    }

    private fun stopStreaming() {
        if (!isStreaming && mediaProjection == null) return
        Log.d(TAG, "Stopping Shing Cast stream")

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
