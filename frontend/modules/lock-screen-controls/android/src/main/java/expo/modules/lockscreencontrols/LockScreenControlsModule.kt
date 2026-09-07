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

    Events("onNextTrack", "onPreviousTrack")

    OnStartObserving {
      setupMediaSession()
    }

    OnStopObserving {
      teardownMediaSession()
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
