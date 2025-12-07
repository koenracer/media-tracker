"use client";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { auth } from "./firebaseConfig";
import { 
  onAuthStateChanged, 
  signOut
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { db } from "./firebaseConfig";
import { collection, addDoc } from "firebase/firestore";
import { loadFromLocalStorage, clearLocalStorage } from "./storageUtils";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const prevIsAnonymousRef = useRef(false);

  useEffect(() => {
    // Setup Firebase auth listener
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        console.log("Auth state changed:", currentUser?.email || (currentUser?.isAnonymous ? 'anonymous user' : 'no user'));

        // Detect anonymous -> authenticated transition and migrate localStorage
        const wasAnonymous = prevIsAnonymousRef.current;
        const isAnonymous = !!currentUser?.isAnonymous;

        // If previous state was anonymous and now user is authenticated (not anonymous)
        if (wasAnonymous && currentUser && !isAnonymous && currentUser.uid) {
          console.log("Detected anonymous -> authenticated transition. Starting migration...");
          try {
            const localData = loadFromLocalStorage();
            const allItems = [
              ...(localData.watchlist || []),
              ...(localData.watching || []),
              ...(localData.watched || []),
            ];

            if (allItems.length > 0) {
              console.log(`Migrating ${allItems.length} items to Firestore for user ${currentUser.uid}`);
              for (const item of allItems) {
                try {
                  await addDoc(collection(db, "media_items"), {
                    ...item,
                    user_id: currentUser.uid,
                    // Ensure created_at is a Date if it was stored as string
                    created_at: item.created_at ? (item.created_at instanceof Date ? item.created_at : new Date(item.created_at)) : new Date(),
                  });
                } catch (err) {
                  console.error("Error migrating item:", err);
                }
              }
              // clear after migrating
              clearLocalStorage();
              console.log("Migration complete, cleared localStorage.");
            } else {
              console.log("No anonymous local data to migrate.");
            }
          } catch (err) {
            console.error("Migration failed:", err);
          }
        }

        // Update refs and state
        prevIsAnonymousRef.current = !!currentUser?.isAnonymous;
        setUser(currentUser);
        setLoading(false);
      } catch (err) {
        console.error("Error in auth listener:", err);
        setLoading(false);
      }
    });

    // Cleanup
    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      router.push("/auth");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth moet gebruikt worden binnen AuthProvider");
  }
  return context;
}
