/**
 * Service worker script URL. Production builds enable offline caching of the
 * app shell (`?cache=1`); dev keeps it off so hot reload never serves stale chunks.
 * Every registration must use this URL — a different URL replaces the worker.
 */
export const SW_URL = process.env.NODE_ENV === "production" ? "/sw.js?cache=1" : "/sw.js";
