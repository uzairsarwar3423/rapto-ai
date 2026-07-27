/**
 * Lightweight client-side logger.
 * - In development: logs to console at the appropriate level.
 * - In production: silences debug/info logs to reduce noise; only warns and errors are shown.
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (...args: any[]) => {
    if (isDev) console.debug('[debug]', ...args);
  },
  info: (...args: any[]) => {
    if (isDev) console.info('[info]', ...args);
  },
  warn: (...args: any[]) => {
    console.warn('[warn]', ...args);
  },
  error: (...args: any[]) => {
    console.error('[error]', ...args);
  },
};
