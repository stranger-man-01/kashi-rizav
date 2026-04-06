// ============================================================
// FIREBASE CONFIGURATION — Kashi Rivaz Admin System
// ============================================================
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or use existing)
// 3. Go to Project Settings > General > Your apps > Add app > Web
// 4. Copy your config values below (replace the placeholder values)
// 5. Go to Firestore Database > Create database (start in test mode)
// 6. Go to Storage > Get started (start in test mode)
// 7. Go to Authentication > Sign-in method > Enable Email/Password
// ============================================================

// ⚠️  REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIG:
const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// ============================================================
// SECRET ADMIN CREDENTIALS (change these before deploying)
// ============================================================
// Username for admin login form (display only)
const ADMIN_USERNAME = 'admin';
// Password for admin login form
const ADMIN_PASSWORD = 'KashiRivaz@Admin2024!';

// ============================================================
// SECRET URL KEYWORD (change to whatever you want)
// ============================================================
// The admin portal is accessed at:  yourwebsite.com/adminaccess
// To change: update the server.js route AND this value
const ADMIN_SECRET_KEYWORD = 'adminaccess';

// Export config for use in other files
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.ADMIN_USERNAME = ADMIN_USERNAME;
window.ADMIN_PASSWORD = ADMIN_PASSWORD;
