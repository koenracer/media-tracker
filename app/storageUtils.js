// Helper functies voor localStorage en Firestore opslag

// Check of gebruiker anoniem is
export const isAnonymousUser = (user) => {
  return user && user.isAnonymous;
};

// Sla items op in localStorage voor anonieme gebruikers
export const saveToLocalStorage = (watchlist, watching, watched) => {
  try {
    const data = {
      watchlist,
      watching,
      watched,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("movietracker_anonymous_data", JSON.stringify(data));
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
};

// Haal items op uit localStorage
export const loadFromLocalStorage = () => {
  try {
    const data = localStorage.getItem("movietracker_anonymous_data");
    if (data) {
      return JSON.parse(data);
    }
    return { watchlist: [], watching: [], watched: [] };
  } catch (error) {
    console.error("Error loading from localStorage:", error);
    return { watchlist: [], watching: [], watched: [] };
  }
};

// Wis localStorage data
export const clearLocalStorage = () => {
  try {
    localStorage.removeItem("movietracker_anonymous_data");
  } catch (error) {
    console.error("Error clearing localStorage:", error);
  }
};

// Migreer data van localStorage naar Firestore
export const migrateToFirestore = async (firebaseAddDoc, watchlist, watching, watched, userId) => {
  const allItems = [...watchlist, ...watching, ...watched];
  const migratedCount = allItems.length;

  for (const item of allItems) {
    try {
      await firebaseAddDoc(
        {
          ...item,
          user_id: userId,
          created_at: item.created_at || new Date(),
        }
      );
    } catch (error) {
      console.error("Error migrating item:", error);
    }
  }

  if (migratedCount > 0) {
    clearLocalStorage();
    console.log(`Gemigreerd: ${migratedCount} items naar Firestore`);
  }

  return migratedCount;
};
