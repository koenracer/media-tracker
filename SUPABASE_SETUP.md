# ⚠️ SUPABASE SETUP - BELANGRIJK!

## Database Migratie Nodig

Je moet je Supabase-database bijwerken om ondersteuning voor meerdere gebruikers toe te voegen. Voer deze SQL-commando's uit in de Supabase SQL Editor:

### 1. Update media_items tabel om user_id toe te voegen

```sql
-- Voeg user_id kolom toe aan media_items tabel
ALTER TABLE media_items ADD COLUMN user_id UUID NOT NULL DEFAULT auth.uid();

-- Voeg foreign key constraint toe
ALTER TABLE media_items ADD CONSTRAINT media_items_user_id_fkey
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Maak een index voor betere query performance
CREATE INDEX idx_media_items_user_id ON media_items(user_id);

-- Voeg RLS policy toe zodat gebruikers alleen hun eigen items kunnen zien
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

-- Policy: Gebruikers kunnen hun eigen items selecteren
CREATE POLICY "Users can select their own items" ON media_items
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Gebruikers kunnen hun eigen items invoegen
CREATE POLICY "Users can insert their own items" ON media_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Gebruikers kunnen hun eigen items updaten
CREATE POLICY "Users can update their own items" ON media_items
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy: Gebruikers kunnen hun eigen items verwijderen
CREATE POLICY "Users can delete their own items" ON media_items
  FOR DELETE USING (auth.uid() = user_id);
```

### 2. Stappen om dit uit te voeren:

1. **Log in op je Supabase dashboard:** https://supabase.com/
2. **Ga naar je project:** MovieTracker
3. **Klik op "SQL Editor"** in het zijmenu
4. **Klik op "New Query"**
5. **Plak de bovenstaande SQL-code**
6. **Klik op "Run"**

### 3. Controleer of het werkt:

- Ga naar je **Authentication** -> **Users** om je testaccounts te zien
- Maak een testaccount aan en check dat je items kan toevoegen
- Maak een ander account aan en controleer dat je ALLEEN je eigen items ziet

## Authenticatie Inschakelen

Je moet ook authenticatie inschakelen in Supabase:

1. **Ga naar Authentication** in je project
2. **Klik op "Providers"**
3. **Enable "Email"** (als deze nog niet is ingeschakeld)
4. **Zorg dat "Confirm email"** is ingesteld op je voorkeur:
   - "Confirm email" (gebruikers moeten email bevestigen) - AANBEVOLEN
   - "Double confirm email" (extra bevestiging)

## Gebruikers aanmaken

Nu kun je gebruikers aanmaken via de app op `/auth`:

1. Ga naar http://localhost:3000/auth
2. Klik op "Registreren"
3. Voer email en wachtwoord in
4. Controleer je email voor bevestigingslink
5. Klik de bevestigingslink
6. Log in met je gegevens
7. Start met het toevoegen van films/series!

## Problemen?

- **Fout: "relation 'auth.users' does not exist"** → Je moet eerst een gebruiker aanmaken in Supabase
- **"Column 'user_id' already exists"** → De kolom bestaat al, voer alleen de RLS-policies uit
- **Can't login** → Controleer dat Email provider is ingeschakeld in Authentication settings

## Lokaal Development Server

```bash
# Terminal in project folder
npm run dev

# Open http://localhost:3000
```
