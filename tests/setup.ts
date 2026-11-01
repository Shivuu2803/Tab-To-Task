/**
 * Minimal `chrome` stub for the Node test environment.
 *
 * Only the surface the task service actually touches is provided — anything
 * else should fail loudly rather than silently return undefined, so a test
 * cannot accidentally pass against a mock that is more permissive than Chrome.
 */
const EXTENSION_ORIGIN = 'chrome-extension://testextensionid';

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    runtime: {
      getURL: (path: string) => `${EXTENSION_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`,
    },
  },
});
