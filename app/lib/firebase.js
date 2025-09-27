// ../lib/firebase.ts

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ✅ Use the exact values from your Firebase console.
// Note: storageBucket is usually "<projectId>.appspot.com".
// If your console shows "creative-connect-v1.appspot.com", use that.
const firebaseConfig = {
  apiKey: "AIzaSyCG586cD7CfforAK-0FnpBx5XskQARbjXM",
  authDomain: "creative-connect-v1.firebaseapp.com",
  projectId: "creative-connect-v1",
  storageBucket: "creative-connect-v1.appspot.com", // <-- change if your console shows a different bucket
  messagingSenderId: "167622620621",
  appId: "1:167622620621:web:3b9f397f48a75cd5bfc084",
};

// 🔒 Singleton app init (prevents duplicate init during Next.js HMR)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Services
const auth = getAuth(app);
const db = getFirestore(app);

// Optional: persist auth in the browser (no-op on server)
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch(() => {
    // Ignore persistence errors (e.g., in private mode)
  });
}

// Google provider with account picker
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export { app, auth, db, googleProvider };
