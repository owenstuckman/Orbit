// All (app) routes are auth-gated client-side pages.
// Disabling SSR eliminates the server round-trip on every navigation,
// making page transitions instant once the JS bundle is loaded.
export const ssr = false;
