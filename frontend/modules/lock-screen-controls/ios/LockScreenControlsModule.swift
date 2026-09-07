import ExpoModulesCore
import MediaPlayer

public class LockScreenControlsModule: Module {
  private var commandCenter: MPRemoteCommandCenter?

  public func definition() -> Definition {
    Name("LockScreenControls")

    Events("onNextTrack", "onPreviousTrack")

    OnStartObserving {
      self.setupRemoteCommands()
    }

    OnStopObserving {
      self.teardownRemoteCommands()
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

    commandCenter = center
  }

  private func teardownRemoteCommands() {
    guard let center = commandCenter else { return }
    center.nextTrackCommand.removeTarget(self)
    center.previousTrackCommand.removeTarget(self)
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
    commandCenter = nil
  }
}
