import ReactGA from "react-ga4";

// GA4 wrapper. All functions no-op unless a Measurement ID is configured AND either
// this is a production build or the local debug override is set, so ordinary dev/test
// navigation never pollutes analytics.
const GA_ID = process.env.REACT_APP_GA_MEASUREMENT_ID;
// Set REACT_APP_GA_DEBUG=true in .env to fire GA from `npm start` for local testing.
const debug = process.env.REACT_APP_GA_DEBUG === "true";
const enabled = Boolean(GA_ID) && (process.env.NODE_ENV === "production" || debug);

export function initAnalytics() {
    if (!enabled) return;
    // send_page_view:false — this is an SPA, so we fire page_view manually on every
    // route change (including the first) to avoid the auto page_view double-counting.
    // debug_mode surfaces local hits in GA4 → DebugView immediately.
    ReactGA.initialize(GA_ID, { gaOptions: { send_page_view: false, debug_mode: debug } });
}

// Attach the Cognito user pool `sub` as the GA4 User-ID once a user is logged in.
// Never pass email or other PII here — GA4 forbids it.
export function setAnalyticsUser(sub) {
    if (!enabled || !sub) return;
    ReactGA.set({ user_id: sub });
}

export function trackPageView(path) {
    if (!enabled) return;
    ReactGA.send({ hitType: "pageview", page: path });
}

export function trackEvent(name, params = {}) {
    if (!enabled) return;
    ReactGA.event(name, params);
}
