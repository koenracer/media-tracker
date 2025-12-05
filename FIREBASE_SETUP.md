# 🎬 Firebase Setup voor MovieTracker

Je app is nu omgezet naar **Google Firebase**! Hier's wat je moet doen:

## 1️⃣ Firebase Project Aanmaken

1. Ga naar https://console.firebase.google.com
2. Klik **"Maak een project"**
3. Geef het een naam (bijv. "MovieTracker")
4. Vink alle opties aan en voltooi de setup
5. Je bent nu in je Firebase Dashboard

## 2️⃣ Web App Toevoegen

1. Klik op het web-icoon `</>` in je project
2. Geef de app een naam (bijv. "MovieTracker Web")
3. Klik **"App registreren"**
4. Kopieer de Firebase config - die zie je in het volgende scherm

## 3️⃣ Firebase Config Invoeren

De config ziet er zo uit:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "movietracker-xxx.firebaseapp.com",
  projectId: "movietracker-xxx",
  storageBucket: "movietracker-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456",
};
```

Voer deze gegevens in je `.env.local` bestand in:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=movietracker-xxx.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=movietracker-xxx
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=movietracker-xxx.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123def456
```

## 4️⃣ Authentication Inschakelen

1. Ga in Firebase naar **Authentication**
2. Klik **"Get started"** (als je dit nog niet gedaan hebt)
3. Klik op **"Email/Password"**
4. Zet beide toggles aan:
   - ✅ Email/Password
   - ✅ Allow account creation
5. Klik **"Save"**

Voor Google Sign-In:

1. Ga terug naar **Authentication** → **Sign-in method**
2. Klik **"Google"**
3. Zet aan en vul je project details in
4. Klik **"Save"**

## 5️⃣ Firestore Database Instellen

1. Ga naar **Firestore Database**
2. Klik **"Create database"**
3. Kies **"Start in test mode"** (voor development)
4. Klik **"Create"**

## 6️⃣ Firestore Security Rules

Zorg dat je data veilig is. Ga naar **Firestore** → **Rules** en vervang alles met:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Iedereen mag media_items lezen/schrijven van zichzelf
    match /media_items/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.user_id;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.user_id;
    }
  }
}
```

Klik **"Publish"**

## 7️⃣ NPM Packages Installeren

```bash
npm install firebase
```

## 8️⃣ App Starten

```bash
npm run dev
```

Open http://localhost:3000

## 🎉 Klaar!

Je kunt nu:

- ✅ Inloggen met email/wachtwoord
- ✅ Inloggen met Google
- ✅ Films/series toevoegen
- ✅ Je lijst behouden per gebruiker
- ✅ Afmelden

## ❓ Troubleshooting

**Error: "apiKey is undefined"**
→ Check je `.env.local` bestand - kopieer de config opnieuw

**Google Sign-In werkt niet**
→ Zorg dat Google provider ingeschakeld is in Authentication

**Kan geen items opslaan**
→ Check dat Firestore database aangemaakt is en rules gepubliceerd

**Zie items van andere gebruikers**
→ Check Firestore rules - zorg dat `user_id` field ingesteld is

Veel plezier! 🚀
