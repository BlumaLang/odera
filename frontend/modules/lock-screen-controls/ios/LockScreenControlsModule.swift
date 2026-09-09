import ExpoModulesCore
import MediaPlayer
import AVFoundation

public class LockScreenControlsModule: Module {
  private var commandCenter: MPRemoteCommandCenter?
  private var lastArtworkUrl: String = ""
  private var cachedArtwork: MPMediaItemArtwork?

  public func definition() -> Definition {
    Name("LockScreenControls")

    Events("onNextTrack", "onPreviousTrack", "onPlay", "onPause", "onTogglePlayPause")

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
      let artworkUrl = info["artworkUrl"] as? String ?? ""

      if self.commandCenter == nil {
        self.setupRemoteCommands()
      }

      var nowPlayingInfo: [String: Any] = [
        MPMediaItemPropertyTitle: title,
        MPMediaItemPropertyArtist: artist,
        MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
        MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? 1.0 : 0.0,
        MPNowPlayingInfoPropertyDefaultPlaybackRate: 1.0,
      ]

      if duration > 0 {
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
      }

      // If artwork is already cached for this URL, reuse it instantly
      if !artworkUrl.isEmpty && artworkUrl == self.lastArtworkUrl, let cached = self.cachedArtwork {
        nowPlayingInfo[MPMediaItemPropertyArtwork] = cached
      } else if let currentInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo,
                let existingArtwork = currentInfo[MPMediaItemPropertyArtwork] {
        nowPlayingInfo[MPMediaItemPropertyArtwork] = existingArtwork
      }

      if #available(iOS 13.0, *) {
        MPNowPlayingInfoCenter.default().playbackState = isPlaying ? .playing : .paused
      }

      MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo

      DispatchQueue.main.async {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true
        center.previousTrackCommand.isEnabled = true
      }

      // Asynchronously fetch artwork only if URL is new
      if !artworkUrl.isEmpty && artworkUrl != self.lastArtworkUrl, let url = URL(string: artworkUrl) {
        self.lastArtworkUrl = artworkUrl
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
          guard let data = data, let image = UIImage(data: data) else { return }
          DispatchQueue.main.async {
            guard let self = self, self.lastArtworkUrl == artworkUrl else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            self.cachedArtwork = artwork
            var updatedInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            updatedInfo[MPMediaItemPropertyArtwork] = artwork
            MPNowPlayingInfoCenter.default().nowPlayingInfo = updatedInfo
          }
        }.resume()
      }
    }
  }

  private func setupRemoteCommands() {
    DispatchQueue.main.async {
      UIApplication.shared.beginReceivingRemoteControlEvents()
      do {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.playback, mode: .default, options: [])
        try audioSession.setActive(true)
      } catch {
        print("[LockScreenControls] AVAudioSession activation notice: \(error)")
      }
    }

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
      self?.sendEvent("onTogglePlayPause", [:])
      return .success
    }

    commandCenter = center
  }

  private func teardownRemoteCommands() {
    DispatchQueue.main.async {
      UIApplication.shared.endReceivingRemoteControlEvents()
    }

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
