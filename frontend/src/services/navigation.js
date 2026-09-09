// Centralized LIFO Back-Navigation Manager for Android hardware back button, web popstate, and gestures
const backActionStack = [];

/**
 * Register a back-action callback (e.g., closing a modal).
 * The callback should return true if it handled the event, or false to pass to the next handler.
 * Returns an unregister function.
 */
export function registerBackAction(handler) {
  if (typeof handler !== "function") return () => {};
  backActionStack.push(handler);
  return () => {
    const idx = backActionStack.lastIndexOf(handler);
    if (idx >= 0) {
      backActionStack.splice(idx, 1);
    }
  };
}

/**
 * Handle a global back press.
 * Executes the topmost registered handler. If handled, returns true.
 */
export function handleGlobalBack() {
  for (let i = backActionStack.length - 1; i >= 0; i--) {
    const handler = backActionStack[i];
    try {
      if (handler && handler() === true) {
        return true;
      }
    } catch (err) {
      console.warn("[Navigation] Back handler error:", err);
    }
  }
  return false;
}

/**
 * Check if any modal or back action is currently active in the stack
 */
export function hasActiveBackActions() {
  return backActionStack.length > 0;
}
