"use client";
import React, { useState, useEffect } from "react";
import { Trash2, Check, Search, Tv, Film, ArrowRight, Loader2 } from "lucide-react";
// Importeer de supabase client die je net hebt gemaakt in stap 3
import { supabase } from "./supabaseClient"; 

export default function MediaTracker() {
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
    // Zorg dat seizoen/episode als nummer behandeld worden
    const normalizedValue = (field === 'season' || field === 'episode') ? Number(value) : value;

    // Update lokale state direct (voor soepel typen)
    setWatching(prev => prev.map(item => item.id === id ? { ...item, [field]: normalizedValue } : item));

    // Update geselecteerd item in de edit view als het overeenkomt
    setSelectedItem(prev => prev && prev.id === id ? { ...prev, [field]: normalizedValue } : prev);

    // Update database (met debounce zou beter zijn, maar dit werkt voor nu)
    try {
      await supabase
        .from('media_items')
        .update({ [field]: normalizedValue })
        .eq('id', id);
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

    // Update database
    await supabase
      .from('media_items')
      .update(updates)
      .eq('id', selectedItem.id);

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
                                onClick={() => updateStatus(item, 'watched')}
                                className="voltooid-button"
                              >
                                Klaar
                              </button>
                              <button 
                                onClick={() => deleteItem(item.id, 'watching')}
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
                          className="media-card watched-item"
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
                                onClick={() => deleteItem(item.id, 'watched')}
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
    </div>
  );
}




// Klein hulpcomponentje voor de plus icon
function PlusIcon() {
    return <div className="bg-white/10 p-1 rounded-full"><ArrowRight size={16}/></div>
}