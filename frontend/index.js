import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// Suppress all LogBox toasts (native)
LogBox.ignoreAllLogs(true);

// ⚠️ Load the console filter via require() — NOT import — so it runs
// synchronously RIGHT HERE before App (and expo-av / other framework
// modules) are loaded. ES6 imports are hoisted, so any `import App`
// would fire expo-av's deprecation warning before our filter is active.
require('./src/utils/consoleFilter');

// Global safety net: catch any unhandled error that would cause a black screen
if (typeof window !== 'undefined') {
  var SUPPRESSED_ERRORS = [
    'startTime', 'reportAllChanges', 'beforeinstallprompt', 'Banner not shown',
    'powerPreference', 'requestAdapter', '369219127', 'doubleclick', 'googleads',
    'postMessage', 'DOMWindow', 'target origin', 'www-widgetapi'
  ];
  function isSuppressed(val) {
    try {
      var s = String((val && val.message) || val || '');
      return SUPPRESSED_ERRORS.some(function(term) { return s.indexOf(term) !== -1; });
    } catch (_) { return false; }
  }
  window.addEventListener('error', function(e) {
    if (isSuppressed(e)) {
      e.preventDefault();
      return;
    }
    console.warn('[GlobalError]', e?.message || e);
  });
  window.addEventListener('unhandledrejection', function(e) {
    if (isSuppressed(e && e.reason)) {
      e.preventDefault();
      return;
    }
    console.warn('[GlobalUnhandled]', e?.reason?.message || e?.reason);
  });
}

// Now it is safe to load App; all console noise is already suppressed.
const App = require('./App').default;
const { warmupBackend } = require('./src/api/client');

// Ping the backend immediately so Render's free-tier cold start
// completes before the user navigates to Search or Home.
warmupBackend();

registerRootComponent(App);
