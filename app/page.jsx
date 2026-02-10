"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Trash2, Check, Search, Tv, Film, ArrowRight, Loader2, LogIn, Star, X } from "lucide-react";
import { db } from "./firebaseConfig";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { useRouter } from "next/navigation";
import {
  isAnonymousUser,
  saveToLocalStorage,
  loadFromLocalStorage,
  clearLocalStorage,
} from "./storageUtils";
import { Listbox } from '@headlessui/react';

// ============================================================================
// CUSTOM HOOKS
// ============================================================================

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Hook voor keyboard shortcuts
function useKeyPress(targetKey, callback) {
  useEffect(() => {
    const handler = (e) => {
      if (e.key === targetKey) {
        callback(e);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [targetKey, callback]);
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "c60432138621b30259eb888814e361ca";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w200";

const sortOptionsData = [
  { id: 1, name: 'Standaard', value: 'default' },
  { id: 2, name: 'A - Z', value: 'az' },
  { id: 3, name: 'Nieuw → Oud', value: 'new-old' },
  { id: 4, name: 'Oud → Nieuw', value: 'old-new' },
  { id: 5, name: 'Best beoordeeld', value: 'best' },
  { id: 6, name: 'Films eerst', value: 'movie' },
  { id: 7, name: 'Series eerst', value: 'series' },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatRuntime = (minutes) => {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MediaTracker() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();

  // ============================================================================
  // REFS
  // ============================================================================
  const hasMigrated = useRef(false);
  const isMounting = useRef(true);
  const saveTimeoutRef = useRef(null);
  const hasCheckedMigration = useRef(false);

  // ============================================================================
  // UI STATE
  // ============================================================================
  const [activeTab, setActiveTab] = useState("watchlist");
  const [previousTab, setPreviousTab] = useState("watchlist");
  const [loading, setLoading] = useState(true);
  const [wasPreviouslyAnonymous, setWasPreviouslyAnonymous] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState(null);

  // ============================================================================
  // DATA STATE
  // ============================================================================
  const [watchlist, setWatchlist] = useState([]);
  const [watching, setWatching] = useState([]);
  const [watched, setWatched] = useState([]);

  // ============================================================================
  // SEARCH & SORT STATE
  // ============================================================================
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSortOption, setSelectedSortOption] = useState(sortOptionsData[0]);

  // ============================================================================
  // MODAL STATE
  // ============================================================================
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailsOverview, setDetailsOverview] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [openedFromSearch, setOpenedFromSearch] = useState(false);

  // ============================================================================
  // WATCHED SORT STATE
  // ============================================================================
  const [watchedSort, setWatchedSort] = useState('recent');

  // ============================================================================
  // MEMOIZED VALUES
  // ============================================================================

  // Check duplicaten met geoptimaliseerde lookup
  const allItemsMap = useMemo(() => {
    const map = new Map();
    [...watchlist, ...watching, ...watched].forEach(item => {
      map.set(item.tmdb_id, item);
    });
    return map;
  }, [watchlist, watching, watched]);

  const isDuplicate = useCallback((tmdbId) => {
    return allItemsMap.has(tmdbId);
  }, [allItemsMap]);

  // Gesorteerde zoekresultaten
  const sortedSearchResults = useMemo(() => {
    if (!searchResults || searchResults.length === 0) return [];
    const sorted = [...searchResults];
    const option = selectedSortOption.value;

    switch (option) {
      case 'az':
        return sorted.sort((a, b) => (a.title || a.name || "").localeCompare(b.title || b.name || ""));
      case 'new-old':
        return sorted.sort((a, b) => new Date(b.release_date || b.first_air_date || 0) - new Date(a.release_date || a.first_air_date || 0));
      case 'old-new':
        return sorted.sort((a, b) => new Date(a.release_date || a.first_air_date || 0) - new Date(b.release_date || b.first_air_date || 0));
      case 'best':
        return sorted.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
      case 'movie':
        return sorted.filter(i => i.media_type === 'movie').concat(sorted.filter(i => i.media_type !== 'movie'));
      case 'series':
        return sorted.filter(i => i.media_type === 'tv').concat(sorted.filter(i => i.media_type !== 'tv'));
      default:
        return sorted;
    }
  }, [searchResults, selectedSortOption]);

  // Gesorteerde watched lijst
  const sortedWatched = useMemo(() => {
    const list = [...watched];

    if (watchedSort === 'recent') {
      return list;
    }

    if (watchedSort === 'rating') {
      return list.sort((a, b) => {
        const ratingA = a.user_rating;
        const ratingB = b.user_rating;

        if (ratingA != null && ratingB != null) {
          return ratingB - ratingA;
        }
        if (ratingA != null) return -1;
        if (ratingB != null) return 1;
        return 0;
      });
    }

    return list;
  }, [watched, watchedSort]);

  // ============================================================================
  // DATA MIGRATION
  // ============================================================================

  const migrateDataToFirestore = useCallback(async (localData) => {
    if (hasMigrated.current || !user || isAnonymousUser(user)) {
      return;
    }

    hasMigrated.current = true;
    setLoading(true);

    try {
      const allItems = [
        ...(localData.watchlist || []),
        ...(localData.watching || []),
        ...(localData.watched || [])
      ];

      console.log("🔄 Migreren van", allItems.length, "items naar Firestore");

      if (allItems.length === 0) {
        setLoading(false);
        return;
      }

      const results = await Promise.allSettled(
        allItems.map(item =>
          addDoc(collection(db, "media_items"), {
            ...item,
            user_id: user.uid,
            created_at: item.created_at || new Date(),
          })
        )
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Migratie voltooid: ${successful} geslaagd, ${failed} mislukt`);

      if (successful > 0) {
        clearLocalStorage();
        setWasPreviouslyAnonymous(false);
        await fetchData();
      }
    } catch (error) {
      console.error("❌ Migratie fout:", error);
      setError("Er ging iets mis bij het migreren van je data. Probeer opnieuw.");
      hasMigrated.current = false;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isAnonymousUser(user)) {
        console.log("👤 Anonieme gebruiker - laden van localStorage");
        const localData = loadFromLocalStorage();
        console.log("📦 Geladen data:", {
          watchlist: localData.watchlist?.length || 0,
          watching: localData.watching?.length || 0,
          watched: localData.watched?.length || 0
        });
        setWatchlist(localData.watchlist || []);
        setWatching(localData.watching || []);
        setWatched(localData.watched || []);
      } else {
        console.log("🔐 Authenticated user - laden van Firestore");
        const q = query(
          collection(db, "media_items"),
          where("user_id", "==", user.uid)
        );

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        console.log("📦 All Firestore data retrieved:", data);
        console.log("📊 Firestore data breakdown:", {
          total: data.length,
          watchlist: data.filter(item => item.status === 'watchlist').length,
          watching: data.filter(item => item.status === 'watching').length,
          watched: data.filter(item => item.status === 'watched').length,
          noStatus: data.filter(item => !item.status).length
        });

        setWatchlist(data.filter(item => item.status === 'watchlist'));
        setWatching(data.filter(item => item.status === 'watching'));
        setWatched(data.filter(item => item.status === 'watched'));
      }
    } catch (err) {
      console.error("❌ Exception in fetchData:", err);
      setError("Fout bij het laden van je data. Probeer de pagina te vernieuwen.");

      // Fallback naar localStorage
      if (!isAnonymousUser(user)) {
        const localData = loadFromLocalStorage();
        setWatchlist(localData.watchlist || []);
        setWatching(localData.watching || []);
        setWatched(localData.watched || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Auth & Migration Effect
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push("/auth");
      return;
    }

    // Check voor migratie bij elke mount (niet alleen bij transitie)
    const checkAndMigrate = async () => {
      if (hasCheckedMigration.current) return;
      hasCheckedMigration.current = true;

      const localData = loadFromLocalStorage();
      const hasLocalData = (localData.watchlist?.length || 0) +
        (localData.watching?.length || 0) +
        (localData.watched?.length || 0) > 0;

      // Als we een authenticated user hebben EN er is local data, migreer
      if (!isAnonymousUser(user) && hasLocalData && !hasMigrated.current) {
        console.log("🔄 Detectie van local data bij authenticated user - starten migratie");
        await migrateDataToFirestore(localData);
      } else {
        await fetchData();
      }

      // Track anonieme status
      if (isAnonymousUser(user) && isMounting.current) {
        setWasPreviouslyAnonymous(true);
        isMounting.current = false;
      }
    };

    checkAndMigrate();
  }, [user, authLoading, router, migrateDataToFirestore, fetchData]);

  // Search Effect
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedSearchQuery.trim()) {
        setSearchResults([]);
        setHasSearched(false);
        return;
      }

      setIsSearching(true);

      try {
        const response = await fetch(
          `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(debouncedSearchQuery)}&language=nl-NL`
        );

        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();
        const filtered = (data.results || []).filter(
          item => item.media_type === 'movie' || item.media_type === 'tv'
        );
        setSearchResults(filtered);
        setHasSearched(true);
      } catch (error) {
        console.error("❌ Search error:", error);
        setSearchResults([]);
        setError("Fout bij zoeken. Probeer het opnieuw.");
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchQuery]);

  // Cleanup effect voor timeouts
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Keyboard shortcut: ESC om modals te sluiten
  useKeyPress('Escape', () => {
    if (activeTab === 'details') {
      closeDetailsModal();
    } else if (activeTab === 'edit') {
      closeEditModal();
    }
  });

  // ============================================================================
  // UPDATE HANDLERS (OPTIMISTIC)
  // ============================================================================

  const handleOptimisticUpdate = useCallback((id, field, value, status = 'watching') => {
    const normalizedValue = (field === 'season' || field === 'episode')
      ? Math.max(1, Number(value) || 1)
      : value;

    // 1. Update selected item direct
    setSelectedItem(prev =>
      prev && prev.id === id ? { ...prev, [field]: normalizedValue } : prev
    );

    // 2. Update de juiste lijst op basis van status
    const updateList = (prev) => prev.filter(item => item && item.id).map(item =>
      item.id === id ? { ...item, [field]: normalizedValue } : item
    );

    if (status === 'watching') {
      setWatching(updateList);
    } else if (status === 'watched') {
      setWatched(updateList);
    } else if (status === 'watchlist') {
      setWatchlist(updateList);
    }

    // 3. Debounced database update
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      console.log("💾 Opslaan naar database:", field, normalizedValue);

      try {
        if (isAnonymousUser(user)) {
          // Gebruik de HUIDIGE state, niet localStorage
          const currentWatchlist = status === 'watchlist' ?
            watchlist.map(item => item.id === id ? { ...item, [field]: normalizedValue } : item) :
            watchlist;

          const currentWatching = status === 'watching' ?
            watching.map(item => item.id === id ? { ...item, [field]: normalizedValue } : item) :
            watching;

          const currentWatched = status === 'watched' ?
            watched.map(item => item.id === id ? { ...item, [field]: normalizedValue } : item) :
            watched;

          saveToLocalStorage(currentWatchlist, currentWatching, currentWatched);
        } else {
          const itemRef = doc(db, "media_items", id);
          await updateDoc(itemRef, { [field]: normalizedValue });
        }
      } catch (err) {
        console.error('❌ Fout bij vertraagd opslaan:', err);
        setError("Wijziging kon niet worden opgeslagen");
      }
    }, 1000);
  }, [user, watchlist, watching, watched]);

  // Rating handler
  const handleRateItem = useCallback((ratingValue) => {
    if (!selectedItem) return;

    const newRating = parseFloat(ratingValue);

    // 1. Update selected item
    setSelectedItem(prev => ({ ...prev, user_rating: newRating }));

    // 2. Update alleen de lijst waar het item in zit
    const updateList = (list) => list.filter(item => item && item.id).map(item =>
      item.id === selectedItem.id ? { ...item, user_rating: newRating } : item
    );

    if (selectedItem.status === 'watched') {
      setWatched(updateList);
    } else if (selectedItem.status === 'watching') {
      setWatching(updateList);
    } else if (selectedItem.status === 'watchlist') {
      setWatchlist(updateList);
    }

    // 3. Debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      console.log("💾 Rating opslaan:", newRating);

      try {
        if (isAnonymousUser(user)) {
          const localData = loadFromLocalStorage();
          const updateLocalList = (list) => (list || []).map(item =>
            item.id === selectedItem.id ? { ...item, user_rating: newRating } : item
          );

          saveToLocalStorage(
            updateLocalList(localData.watchlist),
            updateLocalList(localData.watching),
            updateLocalList(localData.watched)
          );
        } else {
          const itemRef = doc(db, "media_items", selectedItem.id);
          await updateDoc(itemRef, { user_rating: newRating });
        }
      } catch (err) {
        console.error('❌ Fout bij opslaan rating:', err);
        setError("Rating kon niet worden opgeslagen");
      }
    }, 1000);
  }, [selectedItem, user]);

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  const addSearchResultToWatchlist = async (result) => {
    if (!user) return;

    if (isDuplicate(result.id)) {
      setError("Deze staat al in een van je lijsten!");
      setTimeout(() => setError(null), 3000);
      return;
    }

    const newItem = {
      tmdb_id: result.id,
      name: result.title || result.name,
      type: result.media_type === 'movie' ? 'film' : 'serie',
      poster: result.poster_path,
      year: (result.release_date || result.first_air_date || "").substring(0, 4),
      status: 'watchlist',
      created_at: new Date(),
    };

    try {
      if (isAnonymousUser(user)) {
        const tempId = `temp_${Date.now()}`;
        const itemWithId = { ...newItem, id: tempId, user_id: user.uid };
        setWatchlist(prev => {
          const updated = [itemWithId, ...prev];
          saveToLocalStorage(updated, watching, watched);
          return updated;
        });
      } else {
        const docRef = await addDoc(collection(db, "media_items"), {
          ...newItem,
          user_id: user.uid,
        });
        setWatchlist(prev => [{ id: docRef.id, ...newItem, user_id: user.uid }, ...prev]);
      }

      setSearchResults([]);
      setSearchQuery("");
    } catch (error) {
      console.error("❌ Error adding item:", error);
      setError("Fout bij toevoegen: " + error.message);
    }
  };

  const updateStatus = async (item, newStatus) => {
    console.log("🔄 Updating status:", item.name, "van", item.status, "naar", newStatus);

    const updates = { status: newStatus };

    if (newStatus === 'watching') {
      updates.time = "00:00";
      updates.season = item.type === 'serie' ? 1 : null;
      updates.episode = item.type === 'serie' ? 1 : null;
    }

    const updatedItem = { ...item, ...updates };

    try {
      // Bereken nieuwe lijsten EERST
      const currentWatchlist = watchlist.filter(i => i.id !== item.id);
      const currentWatching = watching.filter(i => i.id !== item.id);
      const currentWatched = watched.filter(i => i.id !== item.id);

      const newWatchlist = newStatus === 'watchlist' ? [updatedItem, ...currentWatchlist] : currentWatchlist;
      const newWatching = newStatus === 'watching' ? [updatedItem, ...currentWatching] : currentWatching;
      const newWatched = newStatus === 'watched' ? [updatedItem, ...currentWatched] : currentWatched;

      console.log("✅ Nieuwe lijsten:", {
        watchlist: newWatchlist.length,
        watching: newWatching.length,
        watched: newWatched.length
      });

      // Update UI
      setWatchlist(newWatchlist);
      setWatching(newWatching);
      setWatched(newWatched);

      // Persist
      if (isAnonymousUser(user)) {
        console.log("💾 Saving to localStorage (anonymous user):", { newWatchlist: newWatchlist.length, newWatching: newWatching.length, newWatched: newWatched.length });
        saveToLocalStorage(newWatchlist, newWatching, newWatched);
      } else {
        if (!item.id) {
          console.error("❌ Item ID is missing:", item);
          throw new Error("Item ID is required for Firestore update");
        }

        if (item.id.toString().startsWith('temp_')) {
          console.log("📝 Creating new Firestore doc (temp item):", item.id);
          const docRef = await addDoc(collection(db, "media_items"), {
            ...updatedItem,
            user_id: user.uid,
            created_at: new Date(),
          });
          console.log("✅ Firestore doc created with ID:", docRef.id);
          const realItem = { ...updatedItem, id: docRef.id };

          if (newStatus === 'watching') setWatching(prev => prev.filter(i => i?.id !== item.id).concat([realItem]));
          if (newStatus === 'watched') setWatched(prev => prev.filter(i => i?.id !== item.id).concat([realItem]));
          if (newStatus === 'watchlist') setWatchlist(prev => prev.filter(i => i?.id !== item.id).concat([realItem]));
        } else {
          console.log("🔄 Updating Firestore doc:", item.id, "with", updates);
          const itemRef = doc(db, "media_items", item.id);
          await updateDoc(itemRef, updates);
          console.log("✅ Firestore doc updated successfully");
        }
      }

      console.log("🎯 Switching to tab:", newStatus);
      setActiveTab(newStatus);
    } catch (error) {
      console.error("❌ Error updating status:", error);
      setError("Status kon niet worden gewijzigd");
      fetchData();
    }
  };

  const deleteItem = async (id, currentListStatus) => {
    try {
      const removeFromList = (prev) => prev.filter(i => i.id !== id);

      if (currentListStatus === 'watchlist') {
        setWatchlist(prev => {
          const updated = removeFromList(prev);
          if (isAnonymousUser(user)) saveToLocalStorage(updated, watching, watched);
          return updated;
        });
      } else if (currentListStatus === 'watching') {
        setWatching(prev => {
          const updated = removeFromList(prev);
          if (isAnonymousUser(user)) saveToLocalStorage(watchlist, updated, watched);
          return updated;
        });
      } else if (currentListStatus === 'watched') {
        setWatched(prev => {
          const updated = removeFromList(prev);
          if (isAnonymousUser(user)) saveToLocalStorage(watchlist, watching, updated);
          return updated;
        });
      }

      if (!isAnonymousUser(user) && id && !id.toString().startsWith('temp_')) {
        const itemRef = doc(db, "media_items", id);
        await deleteDoc(itemRef);
      }
    } catch (error) {
      console.error("❌ Error deleting item:", error);
      setError("Item kon niet worden verwijderd");
      fetchData();
    }
  };

  // ============================================================================
  // MODAL HANDLERS
  // ============================================================================

  const openEditModal = (item) => {
    setPreviousTab(activeTab);
    setSelectedItem(item);
    setActiveTab("edit");
  };

  const closeEditModal = () => {
    setSelectedItem(null);
    setActiveTab(previousTab);
  };

  const openDetailsModal = async (item, fromSearch = false) => {
    setOpenedFromSearch(fromSearch);
    setPreviousTab(activeTab);

    const normalizedItem = fromSearch ? {
      ...item,
      name: item.title || item.name,
      poster: item.poster_path,
      year: (item.release_date || item.first_air_date || "").substring(0, 4),
      type: item.media_type === 'movie' ? 'film' : 'serie',
      tmdb_id: item.id
    } : item;

    setSelectedItem(normalizedItem);
    setActiveTab("details");
    setDetailsOverview(null);
    setDetailsData(null);
    setDetailsLoading(true);

    try {
      const mediaType = fromSearch
        ? (item.media_type === 'movie' ? 'movie' : 'tv')
        : (item.type === 'film' ? 'movie' : 'tv');
      const tmdbId = fromSearch ? item.id : item.tmdb_id;

      if (tmdbId) {
        const res = await fetch(
          `https://api.themoviedb.org/3/${mediaType}/${tmdbId}?api_key=${TMDB_API_KEY}&language=nl-NL&append_to_response=credits,videos,images,external_ids`
        );

        if (res.ok) {
          const data = await res.json();
          setDetailsData(data);
          setDetailsOverview(data.overview || null);
        }
      }
    } catch (err) {
      console.error('❌ Fout bij ophalen TMDB details:', err);
      setError("Details konden niet worden geladen");
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetailsModal = () => {
    setSelectedItem(null);
    setActiveTab(previousTab);
    setDetailsOverview(null);
    setDetailsData(null);
    setOpenedFromSearch(false);
    setDetailsLoading(false);

    if (selectedItem && !openedFromSearch) {
      setTimeout(() => {
        const element = document.getElementById(`item-${selectedItem.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  };

  const openActorModal = (castMember, e) => {
    if (e) e.stopPropagation();
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(castMember.name)}`;
    window.open(searchUrl, '_blank');
  };

  // ============================================================================
  // LOADING STATES
  // ============================================================================

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" size={32} />
        <span className="text-lg">Laden...</span>
      </div>
    );
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2" size={32} />
        <span className="text-lg">Je lijst laden...</span>
      </div>
    );
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="background-image">
      <div className="max-w-4xl mx-auto">
        <h1 className="titel">Media Tracker</h1>

        {/* Error Toast */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-4 right-4 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2"
            >
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-2">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs */}
        {activeTab !== "edit" && activeTab !== "details" && (
          <div className="tab-background">
            {[
              { key: "watchlist", label: "Watchlist" },
              { key: "watching", label: "Verder Kijken" },
              { key: "watched", label: "Klaar" },
            ].map((tab) => (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                {tab.label}
              </motion.button>
            ))}
          </div>
        )}

        <div className="container-watchlist">
          <AnimatePresence mode="wait">

            {/* ================================================================ */}
            {/* WATCHLIST TAB */}
            {/* ================================================================ */}
            {activeTab === "watchlist" && (
              <motion.div
                key="watchlist"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* Search Bar */}
                <form onSubmit={(e) => e.preventDefault()} className="form search-bar-wrapper" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "18px" }}>
                  <input
                    type="text"
                    placeholder="Zoek een film of serie..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="zoekbalk"
                    aria-label="Zoek films en series"
                  />

                  {searchResults.length > 0 && (
                    <div className="optionselect2">
                      <Listbox value={selectedSortOption} onChange={setSelectedSortOption}>
                        <div className="custom-listbox">
                          <Listbox.Button className="listbox-button">
                            {selectedSortOption.name}
                          </Listbox.Button>
                          <Listbox.Options className="listbox-options">
                            {sortOptionsData.map((option) => (
                              <Listbox.Option key={option.id} value={option}>
                                {({ selected }) => (
                                  <li className="listbox-option">
                                    {option.name}
                                    {selected && <span style={{ float: 'right' }}>✓</span>}
                                  </li>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </div>
                      </Listbox>
                    </div>
                  )}
                </form>

                {/* Search Loading */}
                {isSearching && (
                  <div className="search-results-container">
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="animate-spin mr-2 text-purple-400" size={32} />
                      <span className="text-slate-300 text-lg">Zoeken...</span>
                    </div>
                  </div>
                )}

                {/* No Results */}
                {!isSearching && hasSearched && searchResults.length === 0 && searchQuery.trim() && (
                  <div className="search-results-container">
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Search className="text-slate-600 mb-4" size={48} />
                      <h3 className="text-xl font-semibold text-slate-300 mb-2">Geen resultaten gevonden</h3>
                      <p className="text-slate-500">Probeer een andere zoekterm voor "{searchQuery}"</p>
                    </div>
                  </div>
                )}

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="search-results-container">
                    <h3 className="results-title">Resultaten</h3>
                    <div className="results-grid">
                      {sortedSearchResults.map((result) => (
                        <motion.div
                          key={result.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => openDetailsModal(result, true)}
                          className="media-card"
                        >
                          <div className="poster-wrapper">
                            {result.poster_path ? (
                              <img
                                loading="lazy"
                                src={`${IMAGE_BASE_URL}${result.poster_path}`}
                                alt={`Poster van ${result.title || result.name}`}
                              />
                            ) : (
                              <div className="no-image-placeholder">Geen Afbeelding</div>
                            )}
                          </div>
                          <div className="card-content">
                            <p className="card-title">{result.title || result.name}</p>
                            <div className="metadata">
                              <span className={`media-badge ${result.media_type === 'movie' ? 'badge-movie' : 'badge-series'}`}>
                                {result.media_type === 'movie' ? 'Film' : 'Serie'}
                              </span>
                              <span>{(result.release_date || result.first_air_date || "").substring(0, 4)}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Watchlist Items */}
                <h3 className="watchlist-titel">Watchlist</h3>
                {watchlist.length === 0 ? (
                  <p className="tekst-leeg">Je lijst is nog leeg.</p>
                ) : (
                  <div className="results-grid">
                    {watchlist.map((item) => (
                      <motion.div
                        layout
                        key={item.id}
                        id={`item-${item.id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="media-card watchlist-item"
                        onClick={() => openDetailsModal(item)}
                      >
                        <div className="poster-wrapper">
                          {item.poster ? (
                            <img
                              loading="lazy"
                              src={`${IMAGE_BASE_URL}${item.poster}`}
                              alt={`Poster van ${item.name}`}
                            />
                          ) : (
                            <div className="no-image-placeholder">Geen Afbeelding</div>
                          )}
                        </div>
                        <div className="card-content">
                          <p className="card-title">{item.name}</p>
                          <div className="metadata">
                            <span className={`media-badge ${item.type === 'film' ? 'badge-movie' : 'badge-series'}`}>
                              {item.type === 'film' ? 'Film' : 'Serie'}
                            </span>
                            <span>{item.year || ""}</span>
                          </div>
                          <div className="watchlist-actions">
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); updateStatus(item, 'watching'); }}
                              className="start-button"
                              aria-label={`Start ${item.name}`}
                            >
                              Start
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watchlist'); }}
                              className="delete-button"
                              aria-label={`Verwijder ${item.name}`}
                            >
                              Verwijder
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ================================================================ */}
            {/* WATCHING TAB */}
            {/* ================================================================ */}
            {activeTab === "watching" && (
              <motion.div
                key="watching"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="watchlist-titel">Verder Kijken</h2>
                {watching.length === 0 ? (
                  <p className="tekst-leeg">Je bent momenteel niks aan het kijken.</p>
                ) : (
                  <div className="results-grid">
                    {watching.map((item) => (
                      <motion.div
                        layout
                        key={item.id}
                        id={`item-${item.id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="media-card watchlist-item"
                        onClick={() => openDetailsModal(item)}
                      >
                        <div className="poster-wrapper">
                          {item.poster ? (
                            <img
                              loading="lazy"
                              src={`${IMAGE_BASE_URL}${item.poster}`}
                              alt={`Poster van ${item.name}`}
                            />
                          ) : (
                            <div className="no-image-placeholder">Geen Afbeelding</div>
                          )}
                        </div>
                        <div className="card-content">
                          <p className="card-title">{item.name}</p>
                          <div className="metadata">
                            <span className={`media-badge ${item.type === 'film' ? 'badge-movie' : 'badge-series'}`}>
                              {item.type === 'film' ? 'Film' : 'Serie'}
                            </span>
                            <span>{item.year || ""}</span>
                          </div>

                          {/* Progress Info */}
                          <div className="text-xs text-slate-400 mt-2">
                            {item.type === 'serie' ? (
                              <span>S{item.season || 1} E{item.episode || 1} • {item.time || "00:00"}</span>
                            ) : (
                              <span>{item.time || "00:00"}</span>
                            )}
                          </div>

                          <div className="watchlist-actions">
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); openEditModal(item); }}
                              className="start-button"
                              aria-label={`Bewerk voortgang van ${item.name}`}
                            >
                              Bewerk
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); updateStatus(item, 'watched'); }}
                              className="start-button"
                              aria-label={`Markeer ${item.name} als gezien`}
                            >
                              <Check size={16} />
                            </motion.button>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watching'); }}
                              className="delete-button"
                              aria-label={`Verwijder ${item.name}`}
                            >
                              <Trash2 size={16} />
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ================================================================ */}
            {/* WATCHED TAB */}
            {/* ================================================================ */}
            {activeTab === "watched" && (
              <motion.div
                key="watched"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h2 className="watchlist-titel" style={{ margin: 0 }}>Geschiedenis</h2>

                  {watched.length > 0 && (
                    <div className="optionselect2">
                      <Listbox value={watchedSort} onChange={setWatchedSort}>
                        <div className="custom-listbox">
                          <Listbox.Button className="listbox-button">
                            {watchedSort === 'recent' ? '📅 Recent gekeken' : '⭐ Rating (Hoog-Laag)'}
                          </Listbox.Button>
                          <Listbox.Options className="listbox-options">
                            {[
                              { id: 1, name: '📅 Recent gekeken', value: 'recent' },
                              { id: 2, name: '⭐ Rating (Hoog-Laag)', value: 'rating' }
                            ].map((option) => (
                              <Listbox.Option key={option.id} value={option.value}>
                                {({ selected }) => (
                                  <li className="listbox-option">
                                    {option.name}
                                    {watchedSort === option.value && <span style={{ float: 'right' }}>✓</span>}
                                  </li>
                                )}
                              </Listbox.Option>
                            ))}
                          </Listbox.Options>
                        </div>
                      </Listbox>
                    </div>
                  )}
                </div>

                {sortedWatched.length === 0 ? (
                  <p className="tekst-leeg">Nog niks bekeken.</p>
                ) : (
                  <div className="results-grid">
                    {sortedWatched.map((item) => (
                      <motion.div
                        layout
                        key={item.id}
                        id={`item-${item.id}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="media-card watchlist-item"
                        onClick={() => openDetailsModal(item)}
                      >
                        <div className="poster-wrapper" style={{ position: 'relative' }}>
                          {item.poster ? (
                            <img
                              loading="lazy"
                              src={`${IMAGE_BASE_URL}${item.poster}`}
                              alt={`Poster van ${item.name}`}
                            />
                          ) : (
                            <div className="no-image-placeholder">Geen Afbeelding</div>
                          )}

                          {/* Rating Badge */}
                          {item.user_rating && (
                            <div
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                                color: '#fbbf24',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                zIndex: 10,
                                backdropFilter: 'blur(2px)',
                                border: '1px solid rgba(251, 191, 36, 0.3)'
                              }}
                            >
                              <Star size={12} fill="#fbbf24" strokeWidth={0} />
                              {item.user_rating}
                            </div>
                          )}
                        </div>

                        <div className="card-content">
                          <p className="card-title">{item.name}</p>
                          <div className="metadata">
                            <span className={`media-badge ${item.type === 'film' ? 'badge-movie' : 'badge-series'}`}>
                              {item.type === 'film' ? 'Film' : 'Serie'}
                            </span>
                            <span>{item.year || ""}</span>
                          </div>
                          <div className="watchhistorie-actions">
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watched'); }}
                              className="delete-button"
                              aria-label={`Verwijder ${item.name}`}
                            >
                              Verwijder
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ================================================================ */}
          {/* DETAILS MODAL */}
          {/* ================================================================ */}
          {activeTab === "details" && selectedItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 p-4 md:p-8 overflow-auto flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-4xl mx-auto w-full"
              >
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden max-w-2xl mx-auto">
                  {/* Header */}
                  <div className="p-6 border-b border-slate-700/50 flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900">
                    <div className="poster-container">
                      {selectedItem.poster && (
                        <img
                          loading="lazy"
                          src={`${IMAGE_BASE_URL}${selectedItem.poster}`}
                          alt={selectedItem.name}
                          className="poster"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="title-overlay">{selectedItem.name}</h2>
                      <p className="text-sm text-slate-400">
                        {selectedItem.type === 'film' ? 'Film' : 'Serie'} • {selectedItem.year || ''}
                      </p>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-8 space-y-6">
                    {detailsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="animate-spin mr-2 text-purple-400" size={24} />
                        <span className="text-slate-300">Details laden...</span>
                      </div>
                    ) : (
                      <>
                        {detailsData?.tagline && (
                          <p className="italic text-slate-400">{detailsData.tagline}</p>
                        )}

                        <p className="text-slate-200 leading-relaxed">
                          {detailsData?.overview || detailsOverview || selectedItem.description || 'Geen beschrijving beschikbaar.'}
                        </p>

                        <div className="text-sm text-slate-300 space-y-2">
                          {detailsData?.genres && detailsData.genres.length > 0 && (
                            <p><strong>Genre:</strong> {detailsData.genres.map(g => g.name).join(', ')}</p>
                          )}
                          {detailsData?.runtime != null && (
                            <p><strong>Duur:</strong> {formatRuntime(detailsData.runtime)}</p>
                          )}
                          {detailsData?.episode_run_time && detailsData.episode_run_time.length > 0 && (
                            <p><strong>Duur per afl.:</strong> {detailsData.episode_run_time.join(', ')} min</p>
                          )}
                          {(detailsData?.release_date || detailsData?.first_air_date) && (
                            <p><strong>Datum:</strong> {detailsData.release_date || detailsData.first_air_date}</p>
                          )}
                          {detailsData?.vote_average != null && (
                            <p><strong>Beoordeling:</strong> ⭐ {detailsData.vote_average.toFixed(1)} ({detailsData.vote_count || 0} stemmen)</p>
                          )}

                          {/* Rating Slider */}
                          {!openedFromSearch && selectedItem.status !== 'watchlist' && (
                            <div className="rating-container my-6 p-5 bg-slate-700/30 rounded-xl border border-slate-700/50 flex flex-col items-center justify-center">
                              <p><strong>Jouw beoordeling:</strong></p>
                              <div className="spacing">
                                <span className="higher">⭐</span>
                                <span>
                                  {selectedItem.user_rating || "-"}
                                  <span>/10</span>
                                </span>
                              </div>

                              <div className="w-full px-4">
                                <input
                                  type="range"
                                  min="1"
                                  max="10"
                                  step="0.1"
                                  value={selectedItem.user_rating || 5}
                                  onChange={(e) => handleRateItem(e.target.value)}
                                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                  aria-label="Beoordeling van 1 tot 10"
                                />
                              </div>
                            </div>
                          )}

                          {detailsData?.production_countries && detailsData.production_countries.length > 0 && (
                            <p><strong>Land:</strong> {detailsData.production_countries.map(c => c.name).join(', ')}</p>
                          )}
                          {detailsData?.spoken_languages && detailsData.spoken_languages.length > 0 && (
                            <p><strong>Talen:</strong> {detailsData.spoken_languages.map(l => l.english_name || l.name).join(', ')}</p>
                          )}
                          {detailsData?.networks && detailsData.networks.length > 0 && (
                            <p><strong>Netwerk:</strong> {detailsData.networks.map(n => n.name).join(', ')}</p>
                          )}
                          {detailsData?.number_of_seasons != null && (
                            <p><strong>Seizoenen:</strong> {detailsData.number_of_seasons}</p>
                          )}
                          {detailsData?.number_of_episodes != null && (
                            <p><strong>Afleveringen:</strong> {detailsData.number_of_episodes}</p>
                          )}
                          {detailsData?.homepage && (
                            <p>
                              <strong>Website:</strong>{' '}
                              <a
                                href={detailsData.homepage}
                                target="_blank"
                                rel="noreferrer"
                                className="website-link"
                              >
                                {detailsData.homepage}
                              </a>
                            </p>
                          )}

                          {/* Cast */}
                          {detailsData?.credits?.cast && detailsData.credits.cast.length > 0 && (
                            <div>
                              <p className="font-medium"><strong>Cast:</strong></p>
                              <div className="overflow-x-auto">
                                <div className="carrousel">
                                  {detailsData.credits.cast.slice(0, 12).map((c, i) => (
                                    <div
                                      key={i}
                                      className="text-center min-w-[120px] cursor-pointer"
                                      onClick={(e) => openActorModal(c, e)}
                                    >
                                      {c.profile_path ? (
                                        <img
                                          loading="lazy"
                                          src={`${IMAGE_BASE_URL}${c.profile_path}`}
                                          alt={c.name}
                                          className="rounded-lg w-full h-auto object-cover mb-2 hover:opacity-80 transition-opacity"
                                        />
                                      ) : (
                                        <div className="w-full aspect-square bg-slate-700 rounded-lg mb-2 flex items-center justify-center text-slate-500 text-xs">
                                          Geen foto
                                        </div>
                                      )}
                                      <p className="text-xs font-medium text-slate-200 truncate">{c.name}</p>
                                      {c.character && (
                                        <p className="text-xs text-slate-400 truncate">{c.character}</p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
                      <motion.button
                        onClick={closeDetailsModal}
                        className="annuleren-knop"
                        whileTap={{ scale: 0.9 }}
                        aria-label="Sluit details"
                      >
                        Sluit
                      </motion.button>
                      {openedFromSearch && (
                        <motion.button
                          className="opslaan-knop"
                          onClick={() => {
                            addSearchResultToWatchlist(selectedItem);
                            closeDetailsModal();
                          }}
                          whileTap={{ scale: 0.9 }}
                          aria-label="Voeg toe aan watchlist"
                        >
                          + Voeg toe
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* ================================================================ */}
          {/* EDIT MODAL */}
          {/* ================================================================ */}
          {activeTab === "edit" && selectedItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 p-4 md:p-8 overflow-auto flex items-center justify-center"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-4xl mx-auto w-full"
              >
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden max-w-md mx-auto">
                  {/* Header */}
                  <div className="p-6 border-b border-slate-700/50 flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900">
                    <div className="poster-container">
                      {selectedItem.poster && (
                        <img
                          loading="lazy"
                          src={`${IMAGE_BASE_URL}${selectedItem.poster}`}
                          alt={selectedItem.name}
                          className="poster"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="title-overlay">{selectedItem.name}</h2>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="p-6 space-y-6">
                    {selectedItem.type === 'serie' ? (
                      <>
                        {/* Season & Episode */}
                        <div className="flex gap-4 justify-between">
                          <div className="seizoen-blok flex-1">
                            <label className="tijd block mb-2 text-center">Seizoen</label>
                            <div className="seizoenblok flex items-center justify-center bg-slate-700/50 rounded-lg p-3">
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleOptimisticUpdate(
                                  selectedItem.id,
                                  "season",
                                  Math.max(1, (selectedItem.season || 1) - 1),
                                  'watching'
                                )}
                                className="min-knop"
                                aria-label="Verlaag seizoen"
                              >
                                −
                              </motion.button>
                              <span className="text-2xl font-bold mx-4 min-w-[40px] text-center">
                                {selectedItem.season || 1}
                              </span>
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                  const nextSeason = (selectedItem.season || 1) + 1;
                                  handleOptimisticUpdate(selectedItem.id, "season", nextSeason, 'watching');
                                  handleOptimisticUpdate(selectedItem.id, "episode", 1, 'watching');
                                  handleOptimisticUpdate(selectedItem.id, "time", "00:00", 'watching');
                                }}
                                className="plus-knop"
                                aria-label="Verhoog seizoen"
                              >
                                +
                              </motion.button>
                            </div>
                          </div>

                          <div className="aflevering-blok flex-1">
                            <label className="tijd block mb-2 text-center">Aflevering</label>
                            <div className="afleveringblok flex items-center justify-center bg-slate-700/50 rounded-lg p-3">
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => handleOptimisticUpdate(
                                  selectedItem.id,
                                  "episode",
                                  Math.max(1, (selectedItem.episode || 1) - 1),
                                  'watching'
                                )}
                                className="min-knop"
                                aria-label="Verlaag aflevering"
                              >
                                −
                              </motion.button>
                              <span className="text-2xl font-bold mx-4 min-w-[40px] text-center">
                                {selectedItem.episode || 1}
                              </span>
                              <motion.button
                                whileTap={{ scale: 0.9 }}
                                onClick={() => {
                                  const nextEpisode = (selectedItem.episode || 1) + 1;
                                  handleOptimisticUpdate(selectedItem.id, "episode", nextEpisode, 'watching');
                                  handleOptimisticUpdate(selectedItem.id, "time", "00:00", 'watching');
                                }}
                                className="plus-knop"
                                aria-label="Verhoog aflevering"
                              >
                                +
                              </motion.button>
                            </div>
                          </div>
                        </div>

                        {/* Time */}
                        <div className="tijd-blok-serie pt-4 border-t border-slate-700/50">
                          <label className="tijd block mb-2 text-center">Tijdstip in aflevering</label>
                          <div className="huidige-tijd-controls flex justify-center items-center gap-4">
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                const currentTime = selectedItem.time || "00:00";
                                const [hours, minutes] = currentTime.split(":").map(Number);
                                const totalMinutes = Math.max(0, hours * 60 + minutes - 5);
                                const newHours = Math.floor(totalMinutes / 60);
                                const newMins = totalMinutes % 60;
                                const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;
                                handleOptimisticUpdate(selectedItem.id, "time", newTime, 'watching');
                              }}
                              className="min-knop"
                              aria-label="Verlaag tijd met 5 minuten"
                            >
                              −
                            </motion.button>
                            <div className="tijd-2 control-value text-xl font-mono">
                              {selectedItem.time || "00:00"}
                            </div>
                            <motion.button
                              whileTap={{ scale: 0.9 }}
                              onClick={() => {
                                const currentTime = selectedItem.time || "00:00";
                                const [hours, minutes] = currentTime.split(":").map(Number);
                                const totalMinutes = hours * 60 + minutes + 5;
                                const newHours = Math.floor(totalMinutes / 60);
                                const newMins = totalMinutes % 60;
                                const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;
                                handleOptimisticUpdate(selectedItem.id, "time", newTime, 'watching');
                              }}
                              className="plus-knop"
                              aria-label="Verhoog tijd met 5 minuten"
                            >
                              +
                            </motion.button>
                          </div>
                        </div>
                      </>
                    ) : (
                      /* Film - alleen tijd */
                      <div className="tijd-blok-serie">
                        <label className="tijd block mb-2 text-center">Tijdstip in film</label>
                        <div className="huidige-tijd-controls flex justify-center items-center gap-4">
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              const currentTime = selectedItem.time || "00:00";
                              const [hours, minutes] = currentTime.split(":").map(Number);
                              const totalMinutes = Math.max(0, hours * 60 + minutes - 5);
                              const newHours = Math.floor(totalMinutes / 60);
                              const newMins = totalMinutes % 60;
                              const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;
                              handleOptimisticUpdate(selectedItem.id, "time", newTime, 'watching');
                            }}
                            className="min-knop"
                            aria-label="Verlaag tijd met 5 minuten"
                          >
                            −
                          </motion.button>
                          <div className="tijd-2 control-value text-xl font-mono">
                            {selectedItem.time || "00:00"}
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.9 }}
                            onClick={() => {
                              const currentTime = selectedItem.time || "00:00";
                              const [hours, minutes] = currentTime.split(":").map(Number);
                              const totalMinutes = hours * 60 + minutes + 5;
                              const newHours = Math.floor(totalMinutes / 60);
                              const newMins = totalMinutes % 60;
                              const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;
                              handleOptimisticUpdate(selectedItem.id, "time", newTime, 'watching');
                            }}
                            className="plus-knop"
                            aria-label="Verhoog tijd met 5 minuten"
                          >
                            +
                          </motion.button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="footer p-6 border-t border-slate-700/50 flex gap-3">
                    <motion.button
                      onClick={closeEditModal}
                      className="annuleren-knop flex-1"
                      whileTap={{ scale: 0.9 }}
                      aria-label="Annuleer en sluit"
                    >
                      Sluit
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Footer - Anonymous User Prompt */}
      <div className="max-w-4xl mx-auto px-4">
        {isAnonymousUser(user) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-gradient-to-r from-purple-900 to-slate-800 border border-purple-500/50 rounded-lg"
          >
            <p className="center-footer-text">
              Je gebruikt momenteel een anoniem account. Je films worden opgeslagen op je computer, niet in de cloud.
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push("/auth")}
              className="anoniem-naar-account-button"
              aria-label="Maak een account aan"
            >
              <LogIn className="w-4 h-4" />
              Maak account aan & behoud je films
            </motion.button>
          </motion.div>
        )}
      </div>

      <p className="footer-text">KD • 2025</p>
    </div>
  );
}