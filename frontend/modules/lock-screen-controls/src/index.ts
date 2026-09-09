import { requireNativeModule } from "expo-modules-core";

interface NowPlayingInfo {
  title: string;
  artist: string;
  duration?: number;
  position?: number;
  isPlaying?: boolean;
}

interface LockScreenControlsType {
  updateNowPlaying(info: NowPlayingInfo): void;
  addListener(eventName: string, listener: (event: any) => void): { remove(): void };
}

export default requireNativeModule("LockScreenControls") as LockScreenControlsType;
