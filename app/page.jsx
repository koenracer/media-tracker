"use client";
import React, { useState, useEffect } from "react";
import { Trash2, Check, Search, Tv, Film, ArrowRight, Loader2 } from "lucide-react";
// Importeer de supabase client die je net hebt gemaakt in stap 3
import { supabase } from "./supabaseClient"; 

export default function MediaTracker() {
  const TMDB_API_KEY = "c60432138621b30259eb888814e361ca"; 
  const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w200";

  const [activeTab, setActiveTab] = useState("watchlist");
  const [loading, setLoading] = useState(true);
  
  // Data lijsten
  const [watchlist, setWatchlist] = useState([]);
  const [watching, setWatching] = useState([]);
  const [watched, setWatched] = useState([]);

  // Zoek states
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // --- 1. DATA OPHALEN UIT SUPABASE ---
  const fetchData = async () => {
    setLoading(true);
    // Haal alles op uit de tabel 'media_items'
    const { data, error } = await supabase
      .from('media_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Fout bij ophalen:", error);
    } else {
      // Verdeel de data over de 3 lijsten op basis van de 'status' kolom
      setWatchlist(data.filter(item => item.status === 'watchlist'));
      setWatching(data.filter(item => item.status === 'watching'));
      setWatched(data.filter(item => item.status === 'watched'));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

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
    // Check lokaal of hij al bestaat om API calls te besparen
    const allItems = [...watchlist, ...watching, ...watched];
    if (allItems.some(i => i.tmdb_id === result.id)) {
      alert("Deze staat al in een van je lijsten!");
      return;
    }

    const newItem = {
      tmdb_id: result.id,
      name: result.title || result.name,
      type: result.media_type === 'movie' ? 'film' : 'serie',
      poster: result.poster_path, // We slaan alleen het pad op!
      year: (result.release_date || result.first_air_date || "").substring(0, 4),
      status: 'watchlist', // Standaard status
    };

    // Stuur naar Supabase
    const { data, error } = await supabase
      .from('media_items')
      .insert([newItem])
      .select();

    if (error) {
      console.error("Error inserting:", error);
    } else {
      // Voeg toe aan lokale state (zodat we niet hoeven te herladen)
      setWatchlist([data[0], ...watchlist]);
      setSearchResults([]);
      setSearchQuery("");
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

    // Update in Database
    const { data, error } = await supabase
      .from('media_items')
      .update(updates)
      .eq('id', item.id)
      .select();

    if (!error && data) {
      // Voeg toe aan nieuwe lijst in state
      const updatedItem = data[0];
      if (newStatus === 'watching') {
        setWatching(prev => [updatedItem, ...prev]);
        setActiveTab("watching");
      } else if (newStatus === 'watched') {
        setWatched(prev => [updatedItem, ...prev]);
      }
    }
  };

  // Update voortgang (tijd/seizoen/aflevering)
  const updateProgress = async (id, field, value) => {
    // Update lokale state direct (voor soepel typen)
    setWatching(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));

    // Update database (met debounce zou beter zijn, maar dit werkt voor nu)
    await supabase
      .from('media_items')
      .update({ [field]: value })
      .eq('id', id);
  };

  // Verwijderen
  const deleteItem = async (id, currentListStatus) => {
    // Verwijder uit UI
    if (currentListStatus === 'watchlist') setWatchlist(l => l.filter(i => i.id !== id));
    if (currentListStatus === 'watching') setWatching(l => l.filter(i => i.id !== id));
    if (currentListStatus === 'watched') setWatched(l => l.filter(i => i.id !== id));

    // Verwijder uit DB
    await supabase.from('media_items').delete().eq('id', id);
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> Je lijst laden...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8 font-sans text-slate-100">
      <div className="max-w-4xl mx-auto">
        <h1 className="titel">
          Media Tracker
        </h1>

        {/* TABS */}
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
                        className="media-card watchlist-item" // 'watchlist-item' kan worden gebruikt voor specifieke styling
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
                            <button onClick={() => updateStatus(item, 'watching')} className="start-button">
                              Start
                            </button>
                            <button onClick={() => deleteItem(item.id, 'watchlist')} className="delete-button">
                              {/* U moet de Trash2 component importeren of vervangen door een icon */}
                              {/* Bijv. 'X' of een SVG-icon */}
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
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  {/* <Tv className="text-purple-400"/> is waarschijnlijk een icoon component */}
                  <span className="text-purple-400">📺</span> Nu aan het kijken
                </h2>
                
                {watching.length === 0 ? (
                  <p className="text-slate-500 text-center py-10">Je kijkt momenteel niks.</p>
                ) : (
                  // Gebruik de gemeenschappelijke klasse voor de grid lay-out
                  <div className="results-grid"> 
                    {watching.map((item) => (
                      // Gebruik de gemeenschappelijke klasse voor de kaart
                      <div key={item.id} className="media-card watching-card"> 
                        
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
                            
                            {item.type === "film" && (
                              <div className="flex-1 mb-2">
                                <label className="text-xs text-slate-400 block mb-1 uppercase tracking-wider">Huidige Tijd</label>
                                <input
                                  type="time"
                                  value={item.time || ""}
                                  onChange={(e) => updateProgress(item.id, "time", e.target.value)}
                                  className="bg-slate-800 text-white w-full p-2 rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none text-center text-sm font-mono"
                                  placeholder="0:00"
                                />
                              </div>
                            )}

                            {item.type === "serie" && (
                              <div className="flex gap-2 mb-2">
                                <div className="flex-1">
                                  <label className="text-xs text-slate-400 block mb-1 uppercase tracking-wider">Seizoen</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.season || 1}
                                    onChange={(e) => updateProgress(item.id, "season", e.target.value)}
                                    className="bg-slate-800 text-white w-full p-2 rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none text-center text-sm font-mono font-bold"
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="text-xs text-slate-400 block mb-1 uppercase tracking-wider">Aflevering</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.episode || 1}
                                    onChange={(e) => updateProgress(item.id, "episode", e.target.value)}
                                    className="bg-slate-800 text-white w-full p-2 rounded-lg border border-slate-600 focus:border-purple-500 focus:outline-none text-center text-sm font-mono font-bold"
                                  />
                                </div>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2 mt-3">
                              <button 
                                onClick={() => updateStatus(item, 'watched')}
                                className="flex-1 flex items-center justify-center gap-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-bold shadow-lg shadow-green-900/20 transition-all"
                              >
                                {/* <Check size={16} /> */}
                                ✅ Voltooid
                              </button>
                              <button 
                                onClick={() => deleteItem(item.id, 'watching')}
                                className="p-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                              >
                                {/* <Trash2 size={20} /> */}
                                🗑️
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
              <h2 className="text-2xl font-bold text-white mb-6">Bekeken Historie</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {watched.map((item) => (
                  <div key={item.id} className="bg-slate-800/60 p-3 rounded-xl flex items-center gap-3 border border-white/5 opacity-75 hover:opacity-100 transition-opacity">
                    <div className="w-10 h-14 bg-slate-700 rounded overflow-hidden shrink-0">
                       {item.poster && <img src={`${IMAGE_BASE_URL}${item.poster}`} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.type}</p>
                    </div>
                    <button onClick={() => deleteItem(item.id, 'watched')} className="text-slate-500 hover:text-red-400 p-2">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              {watched.length === 0 && <p className="text-slate-500 text-center">Nog niks bekeken.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Klein hulpcomponentje voor de plus icon
function PlusIcon() {
    return <div className="bg-white/10 p-1 rounded-full"><ArrowRight size={16}/></div>
}