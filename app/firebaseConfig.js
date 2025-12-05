import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCaF2i7QM6nPE3VZ-ojTCM4zvg-HVJV7ek",
  authDomain: "media-tracker-5ap3.firebaseapp.com",
  projectId: "media-tracker-5ap3",
  storageBucket: "media-tracker-5ap3.firebasestorage.app",
  messagingSenderId: "787852531090",
  appId: "1:787852531090:web:4b70fdf2953646b4465d4b",
  measurementId: "G-EB84WP085F"
};

// Controleer of config compleet is
if (!firebaseConfig.apiKey) {
  console.warn('Firebase config is niet ingesteld. Check je .env.local bestand.')
}

// Initialize Firebase
const app = initializeApp(firebaseConfig)

// Initialize Firebase Authentication
export const auth = getAuth(app)

// Initialize Firestore
export const db = getFirestore(app)

export default app
