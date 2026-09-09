package expo.modules.lockscreencontrols

import android.app.Application
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LockScreenControlsModule : Module() {
  private var mediaSession: MediaSessionCompat? = null

  override fun definition() = ModuleDefinition {
    Name("LockScreenControls")

    Events("onNextTrack", "onPreviousTrack", "onPlay", "onPause")

    OnStartObserving {
      setupMediaSession()
    }

    OnStopObserving {
      teardownMediaSession()
    }

    Function("updateNowPlaying") { info: Map<String, Any?> ->
      val title = info["title"] as? String ?: "Staytup Music"
      val artist = info["artist"] as? String ?: "Unknown Artist"
      val duration = (info["duration"] as? Number)?.toLong() ?: 0L
      val position = (info["position"] as? Number)?.toLong() ?: 0L
      val isPlaying = info["isPlaying"] as? Boolean ?: true

      val session = mediaSession ?: return@Function

      // Update metadata
      val metadata = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, "Staytup Music")

      if (duration > 0) {
        metadata.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, duration * 1000)
      }

      session.setMetadata(metadata.build())

      // Update playback state
      val stateInt = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
      val state = PlaybackStateCompat.Builder()
        .setActions(
          PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_PLAY_PAUSE or
          PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
          PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
          PlaybackStateCompat.ACTION_SEEK_TO
        )
        .setState(stateInt, position * 1000, if (isPlaying) 1.0f else 0.0f)
        .build()
      session.setPlaybackState(state)
    }
  }

  private fun setupMediaSession() {
    val app = appContext.reactContext?.applicationContext as? Application ?: return
    val session = MediaSessionCompat(app, "StaytupLockScreen")

    val state = PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_PLAY_PAUSE or
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
        PlaybackStateCompat.ACTION_SEEK_TO
      )
      .setState(PlaybackStateCompat.STATE_PLAYING, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
      .build()
    session.setPlaybackState(state)

    session.setCallback(object : MediaSessionCompat.Callback() {
      override fun onSkipToNext() {
        sendEvent("onNextTrack", emptyMap())
      }

      override fun onSkipToPrevious() {
        sendEvent("onPreviousTrack", emptyMap())
      }

      override fun onPlay() {
        sendEvent("onPlay", emptyMap())
      }

      override fun onPause() {
        sendEvent("onPause", emptyMap())
      }
    })

    session.isActive = true
    mediaSession = session
  }

  private fun teardownMediaSession() {
    mediaSession?.isActive = false
    mediaSession?.release()
    mediaSession = null
  }
}
