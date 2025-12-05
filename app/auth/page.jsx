"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider
} from "firebase/auth";
import { auth } from "../firebaseConfig";
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
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        console.log("Login successful, user:", userCredential.user.email);
        router.push("/");
      } else {
        // Registreren
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        console.log("Signup successful, user:", userCredential.user.email);
        router.push("/");
      }
    } catch (err) {
      console.error("Auth error:", err);
      // Vertaal Firebase errors naar Nederlands
      let errorMessage = err.message;
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "Dit email adres is al in gebruik";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "Wachtwoord moet minstens 6 karakters zijn";
      } else if (err.code === "auth/user-not-found") {
        errorMessage = "Geen account gevonden met dit email";
      } else if (err.code === "auth/wrong-password") {
        errorMessage = "Onjuist wachtwoord";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      console.log("Google login successful, user:", userCredential.user.email);
      router.push("/");
    } catch (err) {
      console.error("Google auth error:", err);
      if (err.code !== "auth/popup-closed-by-user") {
        setError("Google inloggen mislukt: " + err.message);
      }
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

          {/* Google Sign-In */}
          <div className="mt-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-800 text-slate-400">Of</span>
            </div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full mt-6 bg-white hover:bg-gray-100 disabled:bg-gray-300 text-gray-900 font-semibold py-2 rounded transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Met Google inloggen
          </button>

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
