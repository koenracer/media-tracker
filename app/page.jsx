"use client";
import React, { useState, useEffect } from "react";
import { Trash2, Check, Search, Tv, Film, ArrowRight, Loader2 } from "lucide-react";
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
  orderBy,
} from "firebase/firestore";
import { useAuth } from "./AuthContext";
import { useRouter } from "next/navigation";

export default function MediaTracker() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  
  const TMDB_API_KEY = "c60432138621b30259eb888814e361ca"; 
  const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w200";

  const [activeTab, setActiveTab] = useState("watchlist");
  const [previousTab, setPreviousTab] = useState("watchlist");
  const [loading, setLoading] = useState(true);
  
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

  const formatRuntime = (minutes) => {
    if (minutes == null) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}u ${m}m` : `${m}m`;
  };


  // --- 1. DATA OPHALEN UIT FIRESTORE ---
  const fetchData = async () => {
    if (!user) {
      console.log("No user, skipping fetchData");
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      console.log("Fetching data for user:", user.uid);
      
      // Query voor gebruikers items (zonder orderBy eerst)
      const q = query(
        collection(db, "media_items"),
        where("user_id", "==", user.uid)
      );

      const querySnapshot = await getDocs(q);
      console.log("Query succeeded, documents found:", querySnapshot.size);
      
      const data = querySnapshot.docs.map(doc => {
        console.log("Document:", doc.id, doc.data());
        return {
          id: doc.id,
          ...doc.data()
        };
      });

      console.log("Data fetched successfully:", data?.length || 0, "items");
      
      // Verdeel de data over de 3 lijsten op basis van de 'status' kolom
      setWatchlist(data.filter(item => item.status === 'watchlist'));
      setWatching(data.filter(item => item.status === 'watching'));
      setWatched(data.filter(item => item.status === 'watched'));
    } catch (err) {
      console.error("Exception in fetchData - Full error:", err);
      console.error("Error code:", err.code);
      console.error("Error message:", err.message);
      // Bij permission denied, toon warning
      if (err.message.includes("permission denied")) {
        console.warn("Permission denied - zorg dat Firestore rules correct zijn ingesteld");
      }
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
      console.log("User found, fetching data");
      fetchData();
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
      // Voeg toe aan Firestore
      const docRef = await addDoc(collection(db, "media_items"), newItem);
      
      // Voeg toe aan lokale state (zodat we niet hoeven te herladen)
      setWatchlist([{ id: docRef.id, ...newItem }, ...watchlist]);
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
    // Optimistic UI update (update scherm direct, database volgt)
    // Verwijder uit huidige lijst
    if (item.status === 'watchlist') setWatchlist(l => l.filter(i => i.id !== item.id));
    if (item.status === 'watching') setWatching(l => l.filter(i => i.id !== item.id));
    
    // Bereid update data voor
    const updates = { status: newStatus };
    
    // Als we gaan kijken, zet defaults
    if (newStatus === 'watching') {
      updates.time = item.type === 'film' ? "0:00" : null;
      updates.season = item.type === 'serie' ? 1 : null;
      updates.episode = item.type === 'serie' ? 1 : null;
    }

    try {
      // Update in Firestore
      const itemRef = doc(db, "media_items", item.id);
      await updateDoc(itemRef, updates);

      // Voeg toe aan nieuwe lijst in state
      const updatedItem = { ...item, ...updates };
      if (newStatus === 'watching') {
        setWatching(prev => [updatedItem, ...prev]);
        setActiveTab("watching");
      } else if (newStatus === 'watched') {
        setWatched(prev => [updatedItem, ...prev]);
      }
    } catch (error) {
      console.error("Error updating status:", error);
      // Reload data bij error
      fetchData();
    }
  };

  // Update voortgang (tijd/seizoen/aflevering)
  const updateProgress = async (id, field, value) => {
    // Zorg dat seizoen/episode als nummer behandeld worden
    const normalizedValue = (field === 'season' || field === 'episode') ? Number(value) : value;

    // Update lokale state direct (voor soepel typen)
    setWatching(prev => prev.map(item => item.id === id ? { ...item, [field]: normalizedValue } : item));

    // Update geselecteerd item in de edit view als het overeenkomt
    setSelectedItem(prev => prev && prev.id === id ? { ...prev, [field]: normalizedValue } : prev);

    // Update database
    try {
      const itemRef = doc(db, "media_items", id);
      await updateDoc(itemRef, { [field]: normalizedValue });
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
      // Update Firestore
      const itemRef = doc(db, "media_items", selectedItem.id);
      await updateDoc(itemRef, updates);
    } catch (error) {
      console.error("Error saving:", error);
      fetchData();
    }

    // Close modal en ga terug naar vorige tab
    setSelectedItem(null);
    setActiveTab(previousTab);
  };

  // Open modal en onthoud huidige tab
  const openEditModal = (item) => {
    setPreviousTab(activeTab);
    setSelectedItem(item);
    setActiveTab("edit");
  };

  // Open details modal (read-only) voor tabs anders dan 'watching'
  const openDetailsModal = async (item) => {
    setPreviousTab(activeTab);
    setSelectedItem(item);
    setActiveTab("details");
    setDetailsOverview(null);
    setDetailsData(null);

    // Haal uitgebreide details op van TMDB (met credits, videos, images)
    try {
      const mediaType = item.type === 'film' ? 'movie' : 'tv';
      if (item.tmdb_id) {
        const res = await fetch(
          `https://api.themoviedb.org/3/${mediaType}/${item.tmdb_id}?api_key=${TMDB_API_KEY}&language=nl-NL&append_to_response=credits,videos,images,external_ids`
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
      // Verwijder uit Firestore
      const itemRef = doc(db, "media_items", id);
      await deleteDoc(itemRef);
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
                        onClick={() => addSearchResultToWatchlist(result)}
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
    <p className="footer-text">Koen Donkers  •  2025</p>
    </div>
  );
}




// Klein hulpcomponentje voor de plus icon
function PlusIcon() {
    return <div className="bg-white/10 p-1 rounded-full"><ArrowRight size={16}/></div>
}