// ============================================================
// FIREBASE CONFIGURATION — Kashi Rivaz
// ============================================================
// Firebase credentials are intentionally NOT stored here.
// The server fetches them from .env and exposes ONLY the public
// client config via a safe API endpoint.
//
// TO CONFIGURE FIREBASE:
// 1. Go to https://console.firebase.google.com/
// 2. Create / open your project → Project Settings → General
// 3. Copy config values into your .env file:
//    FIREBASE_API_KEY=...
//    FIREBASE_AUTH_DOMAIN=...
//    FIREBASE_PROJECT_ID=...
//    FIREBASE_STORAGE_BUCKET=...
//    FIREBASE_MESSAGING_SENDER_ID=...
//    FIREBASE_APP_ID=...
// 4. Restart the server — this file will fetch config automatically
// ============================================================

(async function loadFirebaseConfig() {
    try {
        const res = await fetch('/api/firebase-config', { signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        if (data && data.apiKey && data.apiKey !== 'YOUR_API_KEY') {
            window.FIREBASE_CONFIG = data;
            document.dispatchEvent(new Event('firebaseConfigReady'));
        } else {
            console.info('[Firebase] Config not set — using static product catalog only.');
            window.FIREBASE_CONFIG = null;
        }
    } catch (e) {
        console.info('[Firebase] Could not fetch config (server offline?) — using static catalog.');
        window.FIREBASE_CONFIG = null;
    }
})();
