"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../supabaseClient";
import { LogIn, UserPlus, Loader2 } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isLogin) {
        // Inloggen
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          router.push("/");
        }
      } else {
        // Registreren
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) {
          setError(error.message);
        } else {
          setError("Controleer je e-mail om je account te bevestigen!");
          // Email bevestiging vereist, toon feedback
          setTimeout(() => {
            setIsLogin(true);
          }, 3000);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
          {/* Logo/Title */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-cyan-400 mb-2">
              🎬 MediaTracker
            </h1>
            <p className="text-slate-400">
              {isLogin ? "Welkom terug!" : "Begin je avontuur"}
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className={`mb-4 p-3 rounded text-sm ${
              error.includes("Controleer") 
                ? "bg-green-900 text-green-200" 
                : "bg-red-900 text-red-200"
            }`}>
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition"
                placeholder="jouw@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Wachtwoord
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-600 text-white font-semibold py-2 rounded transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Even geduld...
                </>
              ) : isLogin ? (
                <>
                  <LogIn className="w-4 h-4" />
                  Inloggen
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Registreren
                </>
              )}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              {isLogin ? "Nog geen account?" : "Al een account?"}
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                }}
                className="ml-2 text-cyan-400 hover:text-cyan-300 font-semibold transition"
              >
                {isLogin ? "Registreren" : "Inloggen"}
              </button>
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="mt-6 text-center text-slate-400 text-xs">
          <p>📧 Je ontvangt een bevestigings-e-mail bij registratie</p>
          <p className="mt-1">🔒 Je gegevens zijn veilig en versleuteld</p>
        </div>
      </div>
    </div>
  );
}
