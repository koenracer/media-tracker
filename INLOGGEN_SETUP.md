# 🎬 MovieTracker - Inlogsysteem Setup

Je MovieTracker app is nu voorzien van volledige authenticatie! Hier zijn de stappen om alles in werking te stellen:

## ✅ Wat is er gewijzigd?

### Nieuwe Bestanden:

- **`app/auth/page.jsx`** - Login/Registratie pagina met mooie UI
- **`app/AuthContext.jsx`** - Authentication state management
- **`SUPABASE_SETUP.md`** - SQL migratie instructies
- **`.env.local`** - Environment variabelen (BEVEILIGD)

### Aangepaste Bestanden:

- **`app/layout.jsx`** - AuthProvider toegevoegd
- **`app/page.jsx`** - User authentication checks, user_id in queries
- **`app/supabaseClient.js`** - Environment variables
- **`supabaseClient.js`** - Environment variables

## 🚀 Stappenplan

### Stap 1: Supabase Database Configureren

1. Open je Supabase project: https://supabase.com
2. Ga naar **SQL Editor**
3. Maak een **New Query**
4. Plak de volgende SQL-code:

```sql
ALTER TABLE media_items ADD COLUMN user_id UUID NOT NULL DEFAULT auth.uid();
ALTER TABLE media_items ADD CONSTRAINT media_items_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_media_items_user_id ON media_items(user_id);
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select their own items" ON media_items
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own items" ON media_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own items" ON media_items
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own items" ON media_items
  FOR DELETE USING (auth.uid() = user_id);
```

5. Klik **"Run"** en wacht tot het klaar is ✓

### Stap 2: Email Authentication Inschakelen

1. Ga naar **Authentication** → **Providers**
2. Zorg dat **"Email"** is ingeschakeld
3. Instellingen controleren (default is prima)

### Stap 3: App Starten

Open een terminal in je project folder:

```powershell
npm run dev
```

De app draait nu op `http://localhost:3000`

### Stap 4: Account Aanmaken

1. Je wordt automatisch doorgestuurd naar `/auth`
2. Klik op **"Registreren"**
3. Voer een email en wachtwoord in
4. Controleer je **spam/junk folder** voor bevestigings-email
5. Klik de bevestigingslink in de email
6. Ga terug naar `http://localhost:3000`
7. Log in met je gegevens
8. Voeg films/series toe! 🎬

### Stap 5: Test Meerdere Gebruikers (Optioneel)

1. Log uit (knop rechtsboven)
2. Maak een ander account aan
3. Check dat je GEEN items van de ander gebruiker kunt zien
4. Voeg eigen items toe
5. Wissel van account en test opnieuw

## 🔐 Beveiliging

✅ Alle gegevens zijn beveiligd met:

- **Row Level Security (RLS)** - Gebruikers zien alleen hun eigen data
- **Foreign Key Constraints** - Items kunnen niet los van gebruiker bestaan
- **Environment Variables** - Gevoelige gegevens niet in code

## 🐛 Troubleshooting

### Error: "relation 'auth.users' does not exist"

→ Dit kan gebeuren bij eerste run. Reload de pagina en probeer opnieuw.

### Email bevestiging kommer niet aan

→ Check je spam/junk folder
→ Probeer een ander email adres
→ In Supabase dashboard kun je ook handmatig users aanmaken

### Kan niet inloggen

→ Zorg dat je email is bevestigd
→ Controleer dat Email provider in Supabase is ingeschakeld
→ Check de browser console voor errors (F12)

### Items verdwijnen na login

→ Dit is normaal! Je ziet nu alleen JE eigen items
→ Log in met de account waarmee je ze toevoegde

## 📝 De App in Productie (Later)

Als je dit later live wilt zetten:

1. **Deploy naar Vercel/Netlify**
2. **Zet environment variables in Vercel settings:**
   - `NEXT_PUBLIC_SUPABASE_URL=...`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
3. **Email verification instellen** (optioneel)
4. **Custom domain configureren** in Supabase

## ❓ Vragen?

Alle nieuwe code heeft comments in het Nederlands - check de bestanden als je iets wilt begrijpen!

Veel plezier met je app! 🚀
