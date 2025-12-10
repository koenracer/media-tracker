"use client";
import React, { useState, useEffect } from "react";
import { Trash2, Check, Search, Tv, Film, ArrowRight, Loader2, LogIn } from "lucide-react";
import { db } from "./firebaseConfig";
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
  migrateToFirestore 
} from "./storageUtils";
import { useMigrateAnonymousData } from "./useMigrateData";

export default function MediaTracker() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  
  const TMDB_API_KEY = "c60432138621b30259eb888814e361ca"; 
  const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w200";

  const [activeTab, setActiveTab] = useState("watchlist");
  const [previousTab, setPreviousTab] = useState("watchlist");
  const [loading, setLoading] = useState(true);
  const [wasPreviouslyAnonymous, setWasPreviouslyAnonymous] = useState(false);
  
  // Data lijsten
  const [watchlist, setWatchlist] = useState([]);
  const [watching, setWatching] = useState([]);
  const [watched, setWatched] = useState([]);

  // Zoek states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailsOverview, setDetailsOverview] = useState(null);
  const [detailsData, setDetailsData] = useState(null);

  const openEditModal = (item) => {
  setPreviousTab(activeTab);
  setSelectedItem(item);
  setActiveTab("edit");
  };

  const formatRuntime = (minutes) => {
    if (minutes == null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}u ${m}m` : `${m}m`;
  };


  // --- 1. DATA OPHALEN ---
  const migrateDataToFirestore = async (localData) => {
    setLoading(true);
    try {
      const allItems = [...localData.watchlist, ...localData.watching, ...localData.watched];
      console.log("Migreren van", allItems.length, "items naar Firestore");

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

      clearLocalStorage();
      console.log("Migratie voltooid!");
      setWasPreviouslyAnonymous(false);
      
      // Nu laad de nieuwe data
      fetchData();
    } catch (error) {
      console.error("Migratie fout:", error);
      setLoading(false);
    }
  };

  // --- 1. DATA OPHALEN ---
  const fetchData = async () => {
    if (!user) {
      console.log("No user, skipping fetchData");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // Check of het een anonieme gebruiker is
      if (isAnonymousUser(user)) {
        console.log("Anonieme gebruiker - laad van localStorage");
        const localData = loadFromLocalStorage();
        setWatchlist(localData.watchlist);
        setWatching(localData.watching);
        setWatched(localData.watched);
      } else {
        // Authenticated user - laad van Firestore
        console.log("Authenticated user - laad van Firestore:", user.uid);
        
        const q = query(
          collection(db, "media_items"),
          where("user_id", "==", user.uid)
        );

        const querySnapshot = await getDocs(q);
        console.log("Query succeeded, documents found:", querySnapshot.size);
        
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        console.log("Data fetched successfully:", data?.length || 0, "items");
        
        setWatchlist(data.filter(item => item.status === 'watchlist'));
        setWatching(data.filter(item => item.status === 'watching'));
        setWatched(data.filter(item => item.status === 'watched'));
      }
    } catch (err) {
      console.error("Exception in fetchData - Full error:", err);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Controleer of gebruiker ingelogd is
    console.log("Auth state:", { user, authLoading });
    
    if (authLoading) {
      return; // Wacht nog op auth check
    }
    
    if (!user) {
      console.log("No user, redirecting to /auth");
      router.push("/auth");
    } else {
      // Check of we moeten migreren van anoniem naar ingelogd
      if (wasPreviouslyAnonymous && !isAnonymousUser(user)) {
        console.log("Migreren van anoniem naar ingelogd");
        const localData = loadFromLocalStorage();
        if (localData.watchlist.length > 0 || localData.watching.length > 0 || localData.watched.length > 0) {
          // Migreer data
          migrateDataToFirestore(localData);
        } else {
          fetchData();
        }
      } else {
        // Normale load
        if (isAnonymousUser(user)) {
          setWasPreviouslyAnonymous(true);
        }
        fetchData();
      }
    }
  }, [user, authLoading, router]);

  // --- 2. ZOEKEN VIA TMDB ---
  const searchMedia = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${searchQuery}&language=nl-NL`
      );
      const data = await response.json();
      const filtered = data.results.filter(
        item => item.media_type === 'movie' || item.media_type === 'tv'
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error(error);
    }
    setIsSearching(false);
  };

  // --- 3. TOEVOEGEN AAN DATABASE ---
  const addSearchResultToWatchlist = async (result) => {
    if (!user) return;
    
    // Check lokaal of hij al bestaat om API calls te besparen
    const allItems = [...watchlist, ...watching, ...watched];
    if (allItems.some(i => i.tmdb_id === result.id)) {
      alert("Deze staat al in een van je lijsten!");
      return;
    }

    const newItem = {
      id: Date.now().toString(), // Temp ID voor localStorage
      user_id: user.uid,
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
        // Voeg toe aan localStorage
        console.log("Adding to localStorage");
        const updatedWatchlist = [newItem, ...watchlist];
        setWatchlist(updatedWatchlist);
        saveToLocalStorage(updatedWatchlist, watching, watched);
      } else {
        // Voeg toe aan Firestore
        console.log("Adding to Firestore");
        const docRef = await addDoc(collection(db, "media_items"), newItem);
        setWatchlist([{ id: docRef.id, ...newItem }, ...watchlist]);
      }
      
      setSearchResults([]);
      setSearchQuery("");
    } catch (error) {
      console.error("Error adding item:", error);
      alert("Fout bij toevoegen: " + error.message);
    }
  };

  // --- 4. VERPLAATSEN & UPDATEN ---
  
  // Update status (bijv. van watchlist -> watching)
  const updateStatus = async (item, newStatus) => {
    // Optimistic UI update
    if (item.status === 'watchlist') setWatchlist(l => l.filter(i => i.id !== item.id));
    if (item.status === 'watching') setWatching(l => l.filter(i => i.id !== item.id));
    
    const updates = { status: newStatus };
    
    if (newStatus === 'watching') {
      updates.time = item.type === 'film' ? "0:00" : null;
      updates.season = item.type === 'serie' ? 1 : null;
      updates.episode = item.type === 'serie' ? 1 : null;
    }

    try {
      const updatedItem = { ...item, ...updates };
      
      if (isAnonymousUser(user)) {
        // Update in localStorage
        if (newStatus === 'watching') {
          const updatedWatching = [updatedItem, ...watching];
          setWatching(updatedWatching);
          saveToLocalStorage(watchlist, updatedWatching, watched);
        } else if (newStatus === 'watched') {
          const updatedWatched = [updatedItem, ...watched];
          setWatched(updatedWatched);
          saveToLocalStorage(watchlist, watching, updatedWatched);
        }
      } else {
        // Update in Firestore
        const itemRef = doc(db, "media_items", item.id);
        await updateDoc(itemRef, updates);
        
        if (newStatus === 'watching') {
          setWatching(prev => [updatedItem, ...prev]);
        } else if (newStatus === 'watched') {
          setWatched(prev => [updatedItem, ...prev]);
        }
      }
      
      setActiveTab("watching");
    } catch (error) {
      console.error("Error updating status:", error);
      fetchData();
    }
  };

  // Update voortgang (tijd/seizoen/aflevering)
  const updateProgress = async (id, field, value) => {
    const normalizedValue = (field === 'season' || field === 'episode') ? Number(value) : value;

    // Update lokale state direct
    setWatching(prev => prev.map(item => item.id === id ? { ...item, [field]: normalizedValue } : item));
    setSelectedItem(prev => prev && prev.id === id ? { ...prev, [field]: normalizedValue } : prev);

    try {
      if (isAnonymousUser(user)) {
        // Update in localStorage
        const updatedWatching = watching.map(item => 
          item.id === id ? { ...item, [field]: normalizedValue } : item
        );
        saveToLocalStorage(watchlist, updatedWatching, watched);
      } else {
        // Update in Firestore
        const itemRef = doc(db, "media_items", id);
        await updateDoc(itemRef, { [field]: normalizedValue });
      }
    } catch (err) {
      console.error('Fout bij updaten voortgang:', err);
    }
  };

  // Modal handler voor meerdere velden tegelijk
  const handleModalSave = async (formData) => {
    if (!selectedItem) return;
    
    const updates = {};
    if (selectedItem.type === 'film') {
      updates.time = formData.time;
    } else {
      updates.season = formData.season;
      updates.episode = formData.episode;
    }

    // Update lokale state
    setWatching(prev => prev.map(item => 
      item.id === selectedItem.id ? { ...item, ...updates } : item
    ));

    try {
      if (isAnonymousUser(user)) {
        // Update in localStorage
        const updatedWatching = watching.map(item => 
          item.id === selectedItem.id ? { ...item, ...updates } : item
        );
        saveToLocalStorage(watchlist, updatedWatching, watched);
      } else {
        // Update in Firestore
        const itemRef = doc(db, "media_items", selectedItem.id);
        await updateDoc(itemRef, updates);
      }
    } catch (error) {
      console.error("Error saving:", error);
      fetchData();
    }

    setSelectedItem(null);
    setActiveTab(previousTab);
  };

  // Open details modal (read-only) voor tabs anders dan 'watching'
  const openDetailsModal = async (item, fromSearch = false) =>{
    setOpenedFromSearch(fromSearch);
    setPreviousTab(activeTab);
    
    // Normaliseer het item formaat voor zoekresultaten
    const normalizedItem = fromSearch ? {
      ...item,
      name: item.title || item.name,
      poster: item.poster_path,
      year: (item.release_date || item.first_air_date || "").substring(0, 4),
      type: item.media_type === 'movie' ? 'film' : 'serie'
    } : item;
    
    setSelectedItem(normalizedItem);
    setActiveTab("details");
    setDetailsOverview(null);
    setDetailsData(null);

    // Haal uitgebreide details op van TMDB (met credits, videos, images)
    try {
      // Voor zoekresultaten: gebruik media_type, anders gebruik type
      let mediaType;
      if (fromSearch) {
        mediaType = item.media_type === 'movie' ? 'movie' : 'tv';
      } else {
        mediaType = item.type === 'film' ? 'movie' : 'tv';
      }
      
      // Voor zoekresultaten: gebruik item.id, anders gebruik item.tmdb_id
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
    
    // Scroll naar de item na modal sluiten
    if (selectedItem) {
      setTimeout(() => {
        const element = document.getElementById(`item-${selectedItem.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  };
  
  const [openedFromSearch, setOpenedFromSearch] = useState(false);


  // Open Google Search in new tab for actor
  const openActorModal = (castMember, e) => {
    if (e) e.stopPropagation();
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(castMember.name)}`;
    window.open(searchUrl, '_blank');
  };

  // Sluit modal en ga terug
  const closeEditModal = () => {
    setSelectedItem(null);
    setActiveTab(previousTab);
  };

  // Verwijderen
  const deleteItem = async (id, currentListStatus) => {
    // Verwijder uit UI
    if (currentListStatus === 'watchlist') setWatchlist(l => l.filter(i => i.id !== id));
    if (currentListStatus === 'watching') setWatching(l => l.filter(i => i.id !== id));
    if (currentListStatus === 'watched') setWatched(l => l.filter(i => i.id !== id));

    try {
      if (isAnonymousUser(user)) {
        // Update localStorage
        const updatedWatchlist = watchlist.filter(i => i.id !== id);
        const updatedWatching = watching.filter(i => i.id !== id);
        const updatedWatched = watched.filter(i => i.id !== id);
        saveToLocalStorage(updatedWatchlist, updatedWatching, updatedWatched);
      } else {
        // Verwijder uit Firestore
        const itemRef = doc(db, "media_items", id);
        await deleteDoc(itemRef);
      }
    } catch (error) {
      console.error("Error deleting item:", error);
    }
  };

  if (authLoading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> Laden...</div>
  }

  if (!user) {
    return null; // Router leidt door naar /auth
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> Je lijst laden...</div>
  }

  
  return (
    <div className="background-image">
      <div className="max-w-4xl mx-auto">
        <h1 className="titel">
          Media Tracker
        </h1>

        {/* TABS */}
        {activeTab !== "edit" && (
          <div className="tab-background">
            {[
              { key: "watchlist", label: "Watchlist" },
              { key: "watching", label: "Verder Kijken" },
              { key: "watched", label: "Klaar" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={"tab"}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}



        {/* CONTENT CONTAINER */}
        <div className="container-watchlist">
          
          {/* --- TAB: WATCHLIST & ZOEKEN --- */}
          {activeTab === "watchlist" && (
            <div>
              {/* Zoekbalk */}
              <form onSubmit={searchMedia} className="form">
                <input
                  type="text"
                  placeholder="Zoek een film of serie..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="zoekbalk"
                />
              </form>

              {/* Zoekresultaten */}
              {searchResults.length > 0 && (
                <div className="search-results-container">
                  <h3 className="results-title">Resultaten</h3>
                  <div className="results-grid">
                    {searchResults.map((result) => (
                      <div 
                        key={result.id} 
                        onClick={() => openDetailsModal(result, true)}
                        className="media-card"
                      >
                        
                        {/* Afbeelding of Placeholder */}
                        <div className="poster-wrapper">
                          {result.poster_path ? (
                            <img 
                              src={`${IMAGE_BASE_URL}${result.poster_path}`} 
                              alt={`Poster van ${result.title || result.name}`} 
                            />
                          ) : (
                            <div className="no-image-placeholder">
                              Geen Afbeelding
                            </div>
                          )}
                        </div>

                        {/* Card Content */}
                        <div className="card-content">
                          <p className="card-title">
                            {result.title || result.name}
                          </p>
                          <div className="metadata">
                            <span className={`media-badge ${result.media_type === 'movie' ? 'badge-movie' : 'badge-series'}`}>
                              {result.media_type === 'movie' ? 'Film' : 'Serie'}
                            </span>
                            <span>
                              {(result.release_date || result.first_air_date || "").substring(0,4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Watchlist Items */}
                <h3 className="watchlist-titel">Watchlist</h3>
                {watchlist.length === 0 ? (
                  <p className="text-slate-500 italic text-center py-8">Je lijst is nog leeg.</p>
                ) : (
                  <div className="results-grid">
                    {watchlist.map((item) => (
                      <div 
                        key={item.id} 
                        id={`item-${item.id}`}
                        className="media-card watchlist-item"
                        onClick={() => openDetailsModal(item)}
                      >
                        
                        {/* Afbeelding of Placeholder (Gebruikt dezelfde structuur) */}
                        <div className="poster-wrapper">
                          {item.poster ? (
                            <img 
                              src={`${IMAGE_BASE_URL}${item.poster}`} 
                              alt={`Poster van ${item.name}`} 
                            />
                          ) : (
                            <div className="no-image-placeholder">
                              Geen Afbeelding
                            </div>
                          )}
                        </div>

                        {/* Card Content (Gebruikt dezelfde structuur) */}
                        <div className="card-content">
                          <p className="card-title">
                            {/* Watchlist item heeft alleen 'name', dus 'item.name' gebruiken */}
                            {item.name}
                          </p>
                          <div className="metadata">
                            {/* Let op: 'item.type' is 'film'/'serie', de zoekresultaten gebruiken 'movie'/'series' */}
                            <span className={`media-badge ${item.type === 'film' ? 'badge-movie' : 'badge-series'}`}>
                              {item.type === 'film' ? 'Film' : 'Serie'}
                            </span>
                            {/* Jaar is niet beschikbaar in uw huidige item-object in de watchlist, 
                                maar we laten de span hier voor consistentie */}
                            <span>
                              {/* Eventueel jaar toevoegen als het beschikbaar is */}
                            </span>
                          </div>
                          
                          {/* Acties toevoegen voor de watchlist items, bijvoorbeeld onder de metadata */}
                          <div className="watchlist-actions">
                            <button onClick={(e) => { e.stopPropagation(); updateStatus(item, 'watching'); }} className="start-button">
                              Start
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watchlist'); }} className="delete-button">
                              Verwijder
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
              )}
            </div>
          )}

          {/* --- TAB: WATCHING --- */}
            {activeTab === "watching" && (
              <div>
                <h2 className="nuaanhetkijken">
                  {/* <Tv className="text-purple-400"/> is waarschijnlijk een icoon component */}
                  <span className="watchlist-titel">Nu aan het kijken</span>
                </h2>
                
                {watching.length === 0 ? (
                  <p className="text-slate-500 text-center py-10">Je kijkt momenteel niks.</p>
                ) : (
                  // Gebruik de gemeenschappelijke klasse voor de grid lay-out
                  <div className="results-grid"> 
                    {watching.map((item) => (
                      // Gebruik de gemeenschappelijke klasse voor de kaart
                        <div 
                          key={item.id} 
                          id={`item-${item.id}`}
                          className="media-card watching-card cursor-pointer"
                          onClick={() => openEditModal(item)}
                        >                        
                        {/* Afbeelding (Gebruikt dezelfde structuur) */}
                        <div className="poster-wrapper">
                          {item.poster ? (
                            <img 
                              src={`${IMAGE_BASE_URL}${item.poster}`} 
                              alt={`Poster van ${item.name}`} 
                            />
                          ) : (
                            <div className="no-image-placeholder">
                              Geen Afbeelding
                            </div>
                          )}
                        </div>

                        {/* Card Content (Gebruikt dezelfde structuur) */}
                        <div className="card-content">
                          <p className="card-title">
                            {item.name}
                          </p>
                          
                          <div className="metadata">
                            {/* Media Badge */}
                            <span className={`media-badge ${item.type === 'film' ? 'badge-movie' : 'badge-series'}`}>
                              {item.type === 'film' ? 'Film' : 'Serie'}
                            </span>
                            {/* Jaar (gebruikt de item.year indien beschikbaar) */}
                            <span>
                              {item.year}
                            </span>
                          </div>
                          
                          {/* Progressie en Acties (Specifiek voor 'Watching') */}
                          <div className="card-progress mt-3 pt-3 border-t border-slate-700/50">
                            <p className="text-xs text-slate-400 mb-3 text-center">
                              {item.type === "film" 
                                ? `Tijd: ${item.time || "0:00"}` 
                                : `S${item.season || 1}-E${item.episode || 1}`}
                            </p>
                            
                            <div className="voltooid-delete-buttons">
                              <button 
                                onClick={(e) => { e.stopPropagation(); updateStatus(item, 'watched'); }}
                                className="voltooid-button"
                              >
                                Klaar
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watching'); }}
                                className="delete-button-2"
                              >
                                Verwijder
                              </button>
                            </div>

                          </div>
                          
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

              {/* --- TAB: WATCHED --- */}
              {activeTab === "watched" && (
                <div>
                  <h2 className="watchlist-titel">Geschiedenis</h2>

                  {watched.length === 0 ? (
                    <p className="text-slate-500 italic text-center py-8">Nog niks bekeken.</p>
                  ) : (
                    <div className="results-grid">
                      {watched.map((item) => (
                        <div 
                          key={item.id} 
                          id={`item-${item.id}`}
                          className="media-card watched-item"
                          onClick={() => openDetailsModal(item)}
                        >
                          
                          {/* Poster */}
                          <div className="poster-wrapper">
                            {item.poster ? (
                              <img 
                                src={`${IMAGE_BASE_URL}${item.poster}`} 
                                alt={`Poster van ${item.name}`} 
                              />
                            ) : (
                              <div className="no-image-placeholder">
                                Geen Afbeelding
                              </div>
                            )}
                          </div>

                          {/* Card Content */}
                          <div className="card-content">

                            {/* Titel */}
                            <p className="card-title">{item.name}</p>

                            {/* Metadata */}
                            <div className="metadata">
                              <span className={`media-badge ${item.type === 'film' ? 'badge-movie' : 'badge-series'}`}>
                                {item.type === 'film' ? 'Film' : 'Serie'}
                              </span>
                              <span>{item.year || ""}</span>
                            </div>

                            {/* Knoppen specifiek voor WATCHED */}
                            <div className="watchhistorie-actions">
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteItem(item.id, 'watched'); }}
                                className="delete-button"
                              >
                                Verwijder
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}


        {/* --- TAB: DETAILS MODAL --- */}
        {activeTab === "details" && selectedItem && (
          <>
          <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 p-4 md:p-8 overflow-auto flex items-center justify-center">
            <div className="max-w-4xl mx-auto">

              {/* Details Card */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden max-w-2xl mx-auto">
                <div className="p-6 border-b border-slate-700/50 flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900">
                  <div className="poster-container">
                    {selectedItem.poster && (
                      <img 
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
                                  <img 
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
                    <button onClick={closeDetailsModal} className="annuleren-knop">Sluit</button>
                    {openedFromSearch && (
                    <button 
                      className="toevoegen-watchlist"
                      onClick={() => addSearchResultToWatchlist(selectedItem)}
                    >
                      + Voeg toe aan watchlist
                    </button>
                  )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </>
        )}

        {/* --- TAB: EDIT MODAL --- */}
        {activeTab === "edit" && selectedItem && (
          <>
          <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50 p-4 md:p-8 overflow-auto flex items-center justify-center">
            <div className="max-w-4xl mx-auto">

              {/* Edit Card */}
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl overflow-hidden max-w-md mx-auto">
                {/* Header */}
                <div className="p-6 border-b border-slate-700/50 flex items-center gap-4 bg-gradient-to-r from-slate-800 to-slate-900">
                  <div className="w-24 h-36 bg-slate-700 rounded-lg overflow-hidden shrink-0">
                    {selectedItem.poster && (
                      <img 
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

                {/* Content */}
                <div className="p-8 space-y-8">
                  {selectedItem.type === "film" ? (
                    // FILM: Tijd aanpassen
                    <div className="space-y-4">
                      <div className="huidige-tijd-controls">
                        <button
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
                        </button>
                        <div
                          className="tijd-2 control-value"
                        >
                          {selectedItem.time || "00:00"}
                        </div>
                        <button
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
                        </button>
                      </div>
                    </div>
                  ) : (
                    // SERIE: Seizoen en Aflevering aanpassen
                    <div className="space-y-8">
                      <div className="seizoen-blok">
                        <label className="tijd">
                          Seizoen
                        </label>
                        <div className="seizoenblok">
                          <button
                            onClick={() => updateProgress(selectedItem.id, "season", Math.max(1, (selectedItem.season || 1) - 1))}
                            className="min-knop"
                          >
                            −
                          </button>
                          <div
                            className="tijd-2"
                          >
                            {selectedItem.season || 1}
                          </div>
                          <button
                            onClick={() => updateProgress(selectedItem.id, "season", (selectedItem.season || 1) + 1)}
                            className="plus-knop"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="aflevering-blok">
                        <label className="tijd">
                          Aflevering
                        </label>
                        <div className="afleveringblok">
                          <button
                            onClick={() => updateProgress(selectedItem.id, "episode", Math.max(1, (selectedItem.episode || 1) - 1))}
                            className="min-knop"
                          >
                            −
                          </button>
                          <div
                            className="tijd-2"
                          >
                            {selectedItem.episode || 1}
                          </div>
                          <button
                            onClick={() => updateProgress(selectedItem.id, "episode", (selectedItem.episode || 1) + 1)}
                            className="plus-knop"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="footer">
                  <button
                    onClick={closeEditModal}
                    className="annuleren-knop"
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={() => handleModalSave(selectedItem)}
                    className="opslaan-knop"
                  >
                    Opslaan
                  </button>
                </div>
              </div>
            </div>
          </div>
          </>
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
          <button
            onClick={() => router.push("/auth")}
            className="anoniem-naar-account-button"
          >
            <LogIn className="w-4 h-4" />
            Maak account aan & behoud je films
          </button>
        </div>
      )}
    </div>
    
    <p className="footer-text">Koen Donkers  •  2025</p>
    </div>
  );
}




// Klein hulpcomponentje voor de plus icon
function PlusIcon() {
    return <div className="bg-white/10 p-1 rounded-full"><ArrowRight size={16}/></div>
}