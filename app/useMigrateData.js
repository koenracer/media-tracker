"use client";
import { useEffect } from "react";
import { db } from "./firebaseConfig";
import { collection, addDoc } from "firebase/firestore";
import { loadFromLocalStorage, clearLocalStorage } from "./storageUtils";

// Hook om data te migreren van localStorage naar Firestore
export function useMigrateAnonymousData(user, isAnonymous, previousAnonymous) {
  useEffect(() => {
    // Controleer of gebruiker net van anoniem naar ingelogd is gegaan
    if (user && previousAnonymous && !isAnonymous && user.email) {
      console.log("Migreren van anonieme data naar Firestore voor:", user.email);
      migrateData();
    }
  }, [user?.uid, isAnonymous]);

  const migrateData = async () => {
    try {
      const localData = loadFromLocalStorage();
      const allItems = [...localData.watchlist, ...localData.watching, ...localData.watched];

      if (allItems.length === 0) {
        console.log("Geen anonieme data om te migreren");
        return;
      }

      console.log("Migreren van", allItems.length, "items");

      // Voeg elk item toe aan Firestore
      for (const item of allItems) {
        try {
          await addDoc(collection(db, "media_items"), {
            ...item,
            user_id: user.uid,
            created_at: item.created_at || new Date(),
          });
        } catch (error) {
          console.error("Error migreren item:", error);
        }
      }

      // Wis localStorage na succesvolle migratie
      clearLocalStorage();
      console.log("Migratie voltooid!");

      // Herlaad de pagina zodat de data uit Firestore wordt geladen
      window.location.reload();
    } catch (error) {
      console.error("Migratie fout:", error);
    }
  };
}
