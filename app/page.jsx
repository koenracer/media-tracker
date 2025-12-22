"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Trash2, Check, Search, Tv, Film, ArrowRight, Loader2, LogIn } from "lucide-react";
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

// sleutel voor TMDB API
const TMDB_API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w200";

const formatRuntime = (minutes) => {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
};

const sortOptionsData = [
  { id: 1, name: 'Standaard', value: 'default' },
  { id: 2, name: 'A - Z', value: 'az' },
  { id: 3, name: 'Nieuw → Oud', value: 'new-old' },
  { id: 4, name: 'Oud → Nieuw', value: 'old-new' },
  { id: 5, name: 'Best beoordeeld', value: 'best' },
  { id: 6, name: 'Films eerst', value: 'movie' },
  { id: 7, name: 'Series eerst', value: 'series' },
];



export default function MediaTracker() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const [hasSearched, setHasSearched] = useState(false);

  // Refs voor tracking
  const hasMigrated = useRef(false);
  const isMounting = useRef(true);

  // UI States
  const [activeTab, setActiveTab] = useState("watchlist");
  const [previousTab, setPreviousTab] = useState("watchlist");
  const [loading, setLoading] = useState(true);
  const [wasPreviouslyAnonymous, setWasPreviouslyAnonymous] = useState(false);
  
  // Data lijsten
  const [watchlist, setWatchlist] = useState([]);
  const [watching, setWatching] = useState([]);
  const [watched, setWatched] = useState([]);

  // Zoek & Sorteer states
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSortOption, setSelectedSortOption] = useState(sortOptionsData[0]);
  
  // Modal states
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailsOverview, setDetailsOverview] = useState(null);
  const [detailsData, setDetailsData] = useState(null);
  const [openedFromSearch, setOpenedFromSearch] = useState(false);

  // Functie om duplicaten te checken
  const isDuplicate = useCallback((tmdbId) => {
    const allItems = [...watchlist, ...watching, ...watched];
    return allItems.some(i => i.tmdb_id === tmdbId);
  }, [watchlist, watching, watched]);

  // Sorteer functie voor zoekresultaten
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

  // --- DATA MIGRATIE ---
  const migrateDataToFirestore = useCallback(async (localData) => {
    if (hasMigrated.current) {
      console.log("Migratie al uitgevoerd, skip");
      return;
    }

    hasMigrated.current = true;
    setLoading(true);

    try {
      const allItems = [...(localData.watchlist || []), ...(localData.watching || []), ...(localData.watched || [])];
      console.log("Migreren van", allItems.length, "items naar Firestore");

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

      console.log(`Migratie voltooid: ${successful} geslaagd, ${failed} mislukt`);
      
      if (successful > 0) {
        clearLocalStorage();
        setWasPreviouslyAnonymous(false);
        await fetchData();
      }
    } catch (error) {
      console.error("Migratie fout:", error);
      hasMigrated.current = false; 
    } finally {
      setLoading(false);
    }
  }, [user]);

  // --- DATA OPHALEN ---
  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      if (isAnonymousUser(user)) {
        console.log("Anonieme gebruiker - laad van localStorage");
        const localData = loadFromLocalStorage();
        setWatchlist(localData.watchlist || []);
        setWatching(localData.watching || []);
        setWatched(localData.watched || []);
      } else {
        console.log("Authenticated user - laad van Firestore");
        const q = query(
          collection(db, "media_items"),
          where("user_id", "==", user.uid)
        );

        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setWatchlist(data.filter(item => item.status === 'watchlist'));
        setWatching(data.filter(item => item.status === 'watching'));
        setWatched(data.filter(item => item.status === 'watched'));
      }
    } catch (err) {
      console.error("Exception in fetchData:", err);
      // Fallback
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

  // --- MOUNT & AUTH EFFECT ---
  useEffect(() => {
    if (authLoading) return;
    
    if (!user) {
      router.push("/auth");
      return;
    }

    if (wasPreviouslyAnonymous && !isAnonymousUser(user) && !hasMigrated.current) {
      console.log("Migreren van anoniem naar ingelogd");
      const localData = loadFromLocalStorage();
      const hasData = (localData.watchlist?.length || 0) + 
                      (localData.watching?.length || 0) + 
                      (localData.watched?.length || 0) > 0;
      
      if (hasData) {
        migrateDataToFirestore(localData);
      } else {
        fetchData();
      }
    } else {
      if (isAnonymousUser(user) && isMounting.current) {
        setWasPreviouslyAnonymous(true);
        isMounting.current = false;
      }
      fetchData();
    }
  }, [user, authLoading, router, wasPreviouslyAnonymous, migrateDataToFirestore, fetchData]);

  // --- ZOEKEN ---
useEffect(() => {
  const performSearch = async () => {
    if (!debouncedSearchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
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
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  performSearch();
}, [debouncedSearchQuery]);

const searchMedia = (e) => {
  e.preventDefault();
  // Search gebeurt nu automatisch via useEffect
};

  // --- TOEVOEGEN ---
  const addSearchResultToWatchlist = async (result) => {
    if (!user) return;
    if (isDuplicate(result.id)) {
      alert("Deze staat al in een van je lijsten!");
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
      console.error("Error adding item:", error);
      alert("Fout bij toevoegen: " + error.message);
    }
  };

  // --- STATUS UPDATE ---
  const updateStatus = async (item, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === 'watching') {
      updates.time = item.type === 'film' ? "00:00" : null;
      updates.season = item.type === 'serie' ? 1 : null;
      updates.episode = item.type === 'serie' ? 1 : null;
    }

    const updatedItem = { ...item, ...updates };
    try {
      // Optimistic UI update logic
      if (item.status === 'watchlist') setWatchlist(prev => prev.filter(i => i.id !== item.id));
      if (item.status === 'watching') setWatching(prev => prev.filter(i => i.id !== item.id));
      
      if (newStatus === 'watching') setWatching(prev => [updatedItem, ...prev]);
      else if (newStatus === 'watched') setWatched(prev => [updatedItem, ...prev]);

      // Persisteer
      if (isAnonymousUser(user)) {
        // Bereken nieuwe lijsten voor local storage
        const newWatchlist = newStatus === 'watchlist' ? [updatedItem, ...watchlist] : watchlist.filter(i => i.id !== item.id);
        const newWatching = newStatus === 'watching' ? [updatedItem, ...watching.filter(i => i.id !== item.id)] : watching.filter(i => i.id !== item.id);
        const newWatched = newStatus === 'watched' ? [updatedItem, ...watched] : watched;
        
        saveToLocalStorage(newWatchlist, newWatching, newWatched);
      } else {
        if (item.id.toString().startsWith('temp_')) {
          // Nieuw document maken voor temp items
          const docRef = await addDoc(collection(db, "media_items"), {
            ...updatedItem,
            user_id: user.uid,
            created_at: new Date(),
          });
          const realItem = { ...updatedItem, id: docRef.id };
          
          if (newStatus === 'watching') {
            setWatching(prev => prev.map(i => i.id === item.id ? realItem : i));
          } else if (newStatus === 'watched') {
            setWatched(prev => prev.map(i => i.id === item.id ? realItem : i));
          }
        } else {
          // Bestaand document updaten
          const itemRef = doc(db, "media_items", item.id);
          await updateDoc(itemRef, updates);
        }
      }
      
      setActiveTab(newStatus === 'watching' ? 'watching' : 'watched');
    } catch (error) {
      console.error("Error updating status:", error);
      fetchData(); // Rollback bij error
    }
  };

  // --- PROGRESS UPDATE ---
  const updateProgress = async (id, field, value) => {
    const normalizedValue = (field === 'season' || field === 'episode') 
      ? Math.max(1, Number(value) || 1)
      : value;

    try {
      if (isAnonymousUser(user)) {
        setWatching(prev => {
          const updated = prev.map(item => 
            item.id === id ? { ...item, [field]: normalizedValue } : item
          );
          saveToLocalStorage(watchlist, updated, watched);
          return updated;
        });
      } else {
        setWatching(prev => prev.map(item => 
          item.id === id ? { ...item, [field]: normalizedValue } : item
        ));
        const itemRef = doc(db, "media_items", id);
        await updateDoc(itemRef, { [field]: normalizedValue });
      }
      
      setSelectedItem(prev => 
        prev && prev.id === id ? { ...prev, [field]: normalizedValue } : prev
      );
    } catch (err) {
      console.error('Fout bij updaten voortgang:', err);
      fetchData();
    }
  };

  // --- MODAL HANDLERS ---
  const openEditModal = (item) => {
    setPreviousTab(activeTab);
    setSelectedItem(item);
    setActiveTab("edit");
  };

  const handleModalSave = async (formData) => {
    if (!selectedItem) return;
    
    const updates = {};
    if (selectedItem.type === 'film') {
      updates.time = formData.time; // Let op: formData komt nu uit selectedItem direct in UI
    } else {
      updates.season = formData.season;
      updates.episode = formData.episode;
    }

    // Omdat we 'updateProgress' al gebruiken in de modal (live updates),
    // hoeven we hier eigenlijk alleen te sluiten, of nog een 'last modified' timestamp te zetten.
    // De UI update is al gebeurd via updateProgress buttons. 
    // Maar voor consistentie met je oude code:
    
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
      console.error('Fout bij ophalen TMDB details:', err);
    }
  };

  const closeDetailsModal = () => {
    setSelectedItem(null);
    setActiveTab(previousTab);
    setDetailsOverview(null);
    setDetailsData(null);
    setOpenedFromSearch(false);
    
    if (selectedItem && !openedFromSearch) {
      setTimeout(() => {
        const element = document.getElementById(`item-${selectedItem.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  };

  const closeEditModal = () => {
    setSelectedItem(null);
    setActiveTab(previousTab);
  };

  const openActorModal = (castMember, e) => {
    if (e) e.stopPropagation();
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(castMember.name)}`;
    window.open(searchUrl, '_blank');
  };

  // --- VERWIJDEREN ---
  const deleteItem = async (id, currentListStatus) => {
    try {
      const removeFromList = (prev) => {
        const updated = prev.filter(i => i.id !== id);
        return updated;
      };

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

      if (!isAnonymousUser(user)) {
        const itemRef = doc(db, "media_items", id);
        await deleteDoc(itemRef);
      }
    } catch (error) {
      console.error("Error deleting item:", error);
      fetchData(); // Rollback
    }
  };

  // --- LOADING STATES ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2"/> Laden...
      </div>
    );
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <Loader2 className="animate-spin mr-2"/> Je lijst laden...
      </div>
    );
  }

  // --- RENDER ---
  return (
    <div className="background-image">
      <div className="max-w-4xl mx-auto">
        <h1 className="titel">Media Tracker</h1>

        {activeTab !== "edit" && activeTab !== "details" && (
          <div className="tab-background">
            {[
              { key: "watchlist", label: "Watchlist" },
              { key: "watching", label: "Verder Kijken" },
              { key: "watched", label: "Klaar" },
            ].map((tab) => (
              <motion.button
              whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`tab ${activeTab === tab.key ? 'active' : ''}`} // Assuming you want an active class
              >
                {tab.label}
              </motion.button>
            ))}
          </div>
        )}

        <div className="container-watchlist">
          <AnimatePresence mode="wait">
    
        {/* WATCHLIST TAB */}
        {activeTab === "watchlist" && (
          <motion.div
            key="watchlist"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
          {activeTab === "watchlist" && (
            <div>
              <form onSubmit={searchMedia} className="form search-bar-wrapper" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "18px" }}>
                <input
                  type="text"
                  placeholder="Zoek een film of serie..."
                  value={searchQuery}
                  onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHasSearched(false);
                  }}
                  className="zoekbalk"
                />
                
                {searchResults.length > 0 && (
                  <div className="optionselect2">
                    <Listbox value={selectedSortOption} onChange={setSelectedSortOption}>
                      <div className="custom-listbox">
                        <Listbox.Button className="listbox-button">
                          {selectedSortOption ? selectedSortOption.name : 'Sorteer'}
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

              {isSearching && (
                <div className="search-results-container">
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="animate-spin mr-2 text-purple-400" size={32} />
                    <span className="text-slate-300 text-lg">Zoeken...</span>
                  </div>
                </div>
              )}

              {!isSearching && hasSearched && searchResults.length === 0 && (
                <div className="search-results-container">
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Search className="text-slate-600 mb-4" size={48} />
                    <h3 className="text-xl font-semibold text-slate-300 mb-2">Geen resultaten gevonden</h3>
                    <p className="text-slate-500">Probeer een andere zoekterm voor "{searchQuery}"</p>
                  </div>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="search-results-container">
                  <h3 className="results-title">Resultaten</h3>
                  <div className="results-grid">
                    {sortedSearchResults.map((result) => (
                      <div 
                        key={result.id} 
                        onClick={() => openDetailsModal(result, true)}
                        className="media-card"
                      >
                        <div className="poster-wrapper">
                          {result.poster_path ? (
                            <img loading="lazy"
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
                            <span>{(result.release_date || result.first_air_date || "").substring(0,4)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="watchlist-titel">Watchlist</h3>
              {watchlist.length === 0 ? (
                <p className="tekst-leeg">Je lijst is nog leeg.</p>
              ) : (
                <motion.div className="results-grid">
                  {watchlist.map((item) => (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                      key={item.id} 
                      id={`item-${item.id}`}
                      className="media-card watchlist-item"
                      onClick={() => openDetailsModal(item)}
                      whileTap={{ scale: 0.98 }}
                    >
                    <div 
                      key={item.id} 
                      id={`item-${item.id}`}
                      className="media-card watchlist-item"
                      onClick={() => openDetailsModal(item)}
                    >
                      <div className="poster-wrapper">
                        {item.poster ? (
                          <img loading="lazy" src={`${IMAGE_BASE_URL}${item.poster}`} alt={`Poster van ${item.name}`} />
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
                          whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                            onClick={(e) => { e.stopPropagation(); updateStatus(item, 'watching'); }} 
                            className="start-button"
                          >
                            Start
                          </motion.button>
                          <motion.button 
                            whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watchlist'); }} 
                            className="delete-button"
                          >
                            Verwijder
                          </motion.button>
                        </div>
                      </div>
                    </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          </motion.div>
        )}

          {/* WATCHING TAB */}
          {activeTab === "watching" && (
            <motion.div
              key="watching"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
          {activeTab === "watching" && (
            <div>
              <h2 className="nuaanhetkijken">
                <span className="watchlist-titel">Nu aan het kijken</span>
              </h2>
              
              {watching.length === 0 ? (
                <p className="tekst-leeg">Je kijkt momenteel niks.</p>
              ) : (
                <motion.div className="results-grid">
                  {watching.map((item) => (
                    <motion.div 
                      layout // Zorgt voor de schuif-animatie bij verwijderen
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }} // Animatie bij verwijderen
                      transition={{ duration: 0.2 }}
                      key={item.id} 
                      id={`item-${item.id}`}
                      className="media-card watchlist-item"
                      onClick={() => openEditModal(item)}
                      whileTap={{ scale: 0.98 }} // Fijn effect op iPhone bij aantikken
                    >
                    <div 
                      key={item.id} 
                      id={`item-${item.id}`}
                      className="media-card watching-card cursor-pointer"
                      onClick={() => openEditModal(item)}
                    >
                      <div className="poster-wrapper">
                        {item.poster ? (
                          <img loading="lazy" src={`${IMAGE_BASE_URL}${item.poster}`} alt={`Poster van ${item.name}`} />
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
                          <span>{item.year}</span>
                        </div>
                        <div className="card-progress mt-3 pt-3 border-t border-slate-700/50">
                          <p className="text-xs text-slate-400 mb-3 text-center">
                            {item.type === "film" 
                              ? `Tijd: ${item.time || "00:00"}` 
                              : `S${item.season || 1}-E${item.episode || 1}`}
                          </p>
                            <div className="voltooid-delete-buttons">
                              <motion.button 
                                onClick={(e) => { e.stopPropagation(); updateStatus(item, 'watched'); }}
                                className="voltooid-button"
                                whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                              >
                                Klaar
                              </motion.button>
                              <motion.button 
                                onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watching'); }}
                                className="delete-button-2"
                                whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                              >
                                Verwijder
                              </motion.button>
                            </div>
                        </div>
                      </div>
                    </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          </motion.div>
          )}

          {/* WATCHED TAB */}
          {activeTab === "watched" && (
            <motion.div
              key="watched"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
          {activeTab === "watched" && (
            <div>
              <h2 className="watchlist-titel">Geschiedenis</h2>
              {watched.length === 0 ? (
                <p className="tekst-leeg">Nog niks bekeken.</p>
              ) : (
                <motion.div className="results-grid">
                  {watched.map((item) => (
                    <motion.div 
                        layout // Zorgt voor de schuif-animatie bij verwijderen
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }} // Animatie bij verwijderen
                        transition={{ duration: 0.2 }}
                        key={item.id} 
                        id={`item-${item.id}`}
                        className="media-card watchlist-item"
                        onClick={() => openDetailsModal(item)}
                        whileTap={{ scale: 0.98 }} // Fijn effect op iPhone bij aantikken
                      >
                    <div 
                      key={item.id} 
                      id={`item-${item.id}`}
                      className="media-card watched-item"
                      onClick={() => openDetailsModal(item)}
                    >
                      <div className="poster-wrapper">
                        {item.poster ? (
                          <img loading="lazy" src={`${IMAGE_BASE_URL}${item.poster}`} alt={`Poster van ${item.name}`} />
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
                        <div className="watchhistorie-actions">
                          <motion.button
                            whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                            onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watched'); }}
                            className="delete-button"
                          >
                            Verwijder
                          </motion.button>
                        </div>
                      </div>
                    </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </div>
          )}
          </motion.div>
          )}
          </AnimatePresence>

          {/* DETAILS MODAL */}
          {activeTab === "details" && selectedItem && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 ... (jouw classes) ... z-50 p-4 ..."
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="max-w-4xl mx-auto"
              >
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 p-4 md:p-8 overflow-auto flex items-center justify-center">
              <div className="max-w-4xl mx-auto">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden max-w-2xl mx-auto">
                  <div className="p-6 border-b border-slate-700/50 flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900">
                    <div className="poster-container">
                      {selectedItem.poster && (
                        <img loading="lazy"
                          src={`${IMAGE_BASE_URL}${selectedItem.poster}`} 
                          alt={selectedItem.name}
                          className="poster"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="title-overlay">{selectedItem.name}</h2>
                      <p className="text-sm text-slate-400">{selectedItem.type === 'film' ? 'Film' : 'Serie'} • {selectedItem.year || ''}</p>
                    </div>
                  </div>

                  <div className="p-8 space-y-6">
                    {detailsData?.tagline && (
                      <p className="italic text-slate-400">{detailsData.tagline}</p>
                    )}

                    <p className="text-slate-200 leading-relaxed">
                      {detailsData?.overview || detailsOverview || selectedItem.description || 'Geen beschrijving beschikbaar.'}
                    </p>

                    <div className="text-sm text-slate-300 space-y-2">
                      <div>
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
                          <p><strong>Website:</strong> <a href={detailsData.homepage} target="_blank" rel="noreferrer" className="website-link">{detailsData.homepage}</a></p>
                        )}
                      </div>

                      {detailsData?.credits?.cast && detailsData.credits.cast.length > 0 && (
                        <div>
                          <p className="font-medium"><strong>Cast:</strong></p>
                          <div className="overflow-x-auto">
                            <div className="carrousel">
                              {detailsData.credits.cast.slice(0, 12).map((c, i) => (
                                <div key={i} className="text-center min-w-[120px] cursor-pointer" onClick={(e) => openActorModal(c, e)}>
                                  {c.profile_path ? (
                                    <img loading="lazy"
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
                    
                    <div className="flex gap-3">
                      <motion.button onClick={closeDetailsModal} className="annuleren-knop" whileTap={{ scale: 0.9 }}>Sluit</motion.button>
                      {openedFromSearch && (
                        <motion.button 
                          className="annuleren-knop"
                          onClick={() => { addSearchResultToWatchlist(selectedItem); closeDetailsModal(); }}
                          whileTap={{ scale: 0.9 }}
                        >
                          + Voeg toe aan watchlist
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

          {/* EDIT MODAL */}
          {activeTab === "edit" && selectedItem && (
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 p-4 md:p-8 overflow-auto flex items-center justify-center">
              <div className="max-w-4xl mx-auto">
                <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden max-w-md mx-auto">
                  <div className="p-6 border-b border-slate-700/50 flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900">
                    <div className="poster-container">
                      {selectedItem.poster && (
                        <img loading="lazy"
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

                  <div className="p-8 space-y-8">
                    {selectedItem.type === "film" ? (
                      <div className="space-y-4">
                        <div className="huidige-tijd-controls">
                          <motion.button
                          whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                            onClick={() => {
                              const currentTime = selectedItem.time || "00:00";
                              const [hours, minutes] = currentTime.split(":").map(Number);
                              const totalMinutes = Math.max(0, hours * 60 + minutes - 5);
                              const newHours = Math.floor(totalMinutes / 60);
                              const newMins = totalMinutes % 60;
                              const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;
                              updateProgress(selectedItem.id, "time", newTime);
                            }}
                            className="min-knop"
                            title="5 minuten terug"
                          >
                            −
                          </motion.button>
                          <div className="tijd-2 control-value">
                            {selectedItem.time || "00:00"}
                          </div>
                          <motion.button
                          whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
                            onClick={() => {
                              const currentTime = selectedItem.time || "00:00";
                              const [hours, minutes] = currentTime.split(":").map(Number);
                              const totalMinutes = hours * 60 + minutes + 5;
                              const newHours = Math.floor(totalMinutes / 60);
                              const newMins = totalMinutes % 60;
                              const newTime = `${newHours.toString().padStart(2, "0")}:${newMins.toString().padStart(2, "0")}`;
                              updateProgress(selectedItem.id, "time", newTime);
                            }}
                            className="plus-knop"
                            title="5 minuten vooruit"
                          >
                            +
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        <div className="seizoen-blok">
                          <label className="tijd">Seizoen</label>
                          <div className="seizoenblok">
                            <motion.button
                              onClick={() => updateProgress(selectedItem.id, "season", Math.max(1, (selectedItem.season || 1) - 1))}
                              className="min-knop"
                              whileTap={{ scale: 0.9 }}
                            >
                              −
                            </motion.button>
                            <div className="tijd-2">
                              {selectedItem.season || 1}
                            </div>
                            <motion.button
                              onClick={() => updateProgress(selectedItem.id, "season", (selectedItem.season || 1) + 1)}
                              className="plus-knop"
                              whileTap={{ scale: 0.9 }}
                            >
                              +
                            </motion.button>
                          </div>
                        </div>

                        <div className="aflevering-blok">
                          <label className="tijd">Aflevering</label>
                          <div className="afleveringblok">
                            <motion.button
                              onClick={() => updateProgress(selectedItem.id, "episode", Math.max(1, (selectedItem.episode || 1) - 1))}
                              className="min-knop"
                              whileTap={{ scale: 0.9 }}
                            >
                              −
                            </motion.button>
                            <div className="tijd-2">
                              {selectedItem.episode || 1}
                            </div>
                            <motion.button
                              onClick={() => updateProgress(selectedItem.id, "episode", (selectedItem.episode || 1) + 1)}
                              className="plus-knop"
                              whileTap={{ scale: 0.9 }}
                            >
                              +
                            </motion.button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="footer">
                    <motion.button onClick={closeEditModal} className="annuleren-knop" whileTap={{ scale: 0.9 }}>
                      Annuleren
                    </motion.button>
                    <motion.button onClick={() => handleModalSave(selectedItem)} className="opslaan-knop" whileTap={{ scale: 0.9 }}>
                      Opslaan
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer met upgrade knop voor anonieme gebruikers */}
      <div className="max-w-4xl mx-auto px-4">
        {isAnonymousUser(user) && (
          <div className="mb-8 p-4 bg-gradient-to-r from-purple-900 to-slate-800 border border-purple-500/50 rounded-lg">
            <p className="center-footer-text">
              Je gebruikt momenteel een anoniem account. Je films worden opgeslagen op je computer, niet in de cloud.
            </p>
            <motion.button
            whileTap={{ scale: 0.9 }} // Knop wordt iets kleiner als je drukt
              onClick={() => router.push("/auth")}
              className="anoniem-naar-account-button"
            >
              <LogIn className="w-4 h-4" />
              Maak account aan & behoud je films
            </motion.button>
          </div>
        )}
      </div>
      
      <p className="footer-text">KD  •  2025</p>
    </div>
  );
}
