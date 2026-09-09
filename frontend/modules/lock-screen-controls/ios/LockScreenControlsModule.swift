import ExpoModulesCore
import MediaPlayer

public class LockScreenControlsModule: Module {
  private var commandCenter: MPRemoteCommandCenter?

  public func definition() -> Definition {
    Name("LockScreenControls")

    Events("onNextTrack", "onPreviousTrack", "onPlay", "onPause")

    OnStartObserving {
      self.setupRemoteCommands()
    }

    OnStopObserving {
      self.teardownRemoteCommands()
    }

    Function("updateNowPlaying") { (info: [String: Any]) in
      let title = info["title"] as? String ?? "Staytup Music"
      let artist = info["artist"] as? String ?? "Unknown Artist"
      let duration = info["duration"] as? Double ?? 0
      let position = info["position"] as? Double ?? 0
      let isPlaying = info["isPlaying"] as? Bool ?? true

      var nowPlayingInfo: [String: Any] = [
        MPMediaItemPropertyTitle: title,
        MPMediaItemPropertyArtist: artist,
        MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
        MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
      ]

      if duration > 0 {
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
      }

      MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }
  }

  private func setupRemoteCommands() {
    let center = MPRemoteCommandCenter.shared()

    // Explicitly disable 10/15s skip buttons so iOS displays Next/Previous track buttons
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false

    center.nextTrackCommand.isEnabled = true
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent("onNextTrack", [:])
      return .success
    }

    center.previousTrackCommand.isEnabled = true
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPreviousTrack", [:])
      return .success
    }

    center.playCommand.isEnabled = true
    center.playCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPlay", [:])
      return .success
    }

    center.pauseCommand.isEnabled = true
    center.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPause", [:])
      return .success
    }

    center.togglePlayPauseCommand.isEnabled = true
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.sendEvent("onPlay", [:])
      return .success
    }

    commandCenter = center
  }

  private func teardownRemoteCommands() {
    guard let center = commandCenter else { return }
    center.nextTrackCommand.removeTarget(self)
    center.previousTrackCommand.removeTarget(self)
    center.playCommand.removeTarget(self)
    center.pauseCommand.removeTarget(self)
    center.togglePlayPauseCommand.removeTarget(self)
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
    center.playCommand.isEnabled = false
    center.pauseCommand.isEnabled = false
    center.togglePlayPauseCommand.isEnabled = false
    commandCenter = nil
  }
}
