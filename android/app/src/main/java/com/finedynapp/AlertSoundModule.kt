package com.finedynapp

import android.media.SoundPool
import android.media.AudioAttributes
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AlertSoundModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var soundPool: SoundPool? = null
    private var soundId: Int = 0
    private var loaded: Boolean = false

    override fun getName(): String = "AlertSoundModule"

    override fun initialize() {
        super.initialize()
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        soundPool = SoundPool.Builder()
            .setMaxStreams(1)
            .setAudioAttributes(audioAttributes)
            .build()
        soundPool?.setOnLoadCompleteListener { _, _, status ->
            loaded = (status == 0)
        }
        val resId = reactApplicationContext.resources.getIdentifier("order_alert", "raw", reactApplicationContext.packageName)
        if (resId != 0) {
            soundId = soundPool?.load(reactApplicationContext, resId, 1) ?: 0
        }
    }

    @ReactMethod
    fun play() {
        if (loaded && soundId != 0) {
            soundPool?.play(soundId, 1.0f, 1.0f, 1, 0, 1.0f)
        }
    }

    @ReactMethod
    fun release() {
        soundPool?.release()
        soundPool = null
        loaded = false
    }
}
