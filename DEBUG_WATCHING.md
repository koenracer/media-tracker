# Debugging Watching Tab Issue

## Steps to debug:

1. **Open Browser Console (F12)**
2. **Click "Start" on a watchlist item**
3. **Check the console for logs:**
   - Look for: `🔄 Updating status:` 
   - Look for: `✅ Nieuwe lijsten:`
   - Look for: `💾 Opslaan naar database:` (if editing)
   - Look for any ❌ errors

## What to check in Firestore:

1. Go to Firebase Console > Firestore Database
2. Check the `media_items` collection
3. Look for items with `status: "watching"`
4. Verify these items have:
   - `id` field
   - `status: "watching"`
   - `user_id` matching your user
   - `time`, `season`, `episode` fields (for series)

## Possible Issues:

- [ ] Items are being saved to Firestore but with wrong status
- [ ] Firestore update is failing silently
- [ ] State update isn't triggering UI re-render
- [ ] Items exist in Firestore but aren't being fetched on page load
- [ ] Browser localStorage is interfering (if anonymous user)

## Quick Fix Attempt:

Try:
1. Refresh the page completely (Ctrl+Shift+R)
2. Add a new item and move it to watching
3. Check if it appears
4. Refresh again to see if it persists
