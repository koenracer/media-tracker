"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  signInAnonymously
} from "firebase/auth";
import { auth } from "../firebaseConfig";
import { LogIn, UserPlus, Loader2, User, Eye, EyeOff } from "lucide-react";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        errorMessage = "Wachtwoord moet minstens 6 karakters zijn en bevat letters en cijfers";
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
      // Provide actionable message for unauthorized-domain with hostname suggestion
      if (err.code === "auth/unauthorized-domain") {
        const projectId = "media-tracker-5ap3"; // update if your project id differs
        const currentHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
        const firebaseConsoleUrl = `https://console.firebase.google.com/project/${projectId}/authentication/providers`;
        setError(
          `Inloggen met Google geblokkeerd: je domein (${currentHost}) is niet geautoriseerd voor OAuth. ` +
          "Ga naar de Firebase console en voeg je domein toe onder Authentication → Sign-in method → Authorized domains. " +
          `Open: ${firebaseConsoleUrl}`
        );
        // Don't attempt fallback redirect if the domain itself is unauthorized
        setLoading(false);
        return;
      }

      // If the popup was closed by the user, show a simple message and don't fallback
      if (err.code === "auth/popup-closed-by-user") {
        setError("Het Google-inlogvenster is gesloten.");
        setLoading(false);
        return;
      }

      // For other popup-related failures (e.g., popup blocked), try a redirect fallback
      try {
        const provider = new GoogleAuthProvider();
        setError("Popup geweigerd of mislukt — probeer door te gaan met redirect...");
        await signInWithRedirect(auth, provider);
        // redirect will navigate away; no further UI updates necessary here
        return;
      } catch (redirectErr) {
        console.error("Redirect fallback failed:", redirectErr);
        setError("Google inloggen mislukt: " + (redirectErr.message || err.message));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymousSignIn = async () => {
    setError("");
    setLoading(true);

    try {
      const userCredential = await signInAnonymously(auth);
      console.log("Anonymous login successful, user ID:", userCredential.user.uid);
      router.push("/");
    } catch (err) {
      console.error("Anonymous auth error:", err);
      setError("Anoniem inloggen mislukt: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="inlogpagina">
        <div className="tehbljh">
          {/* Logo/Title */}
          <div className="margin-titel">
            <h1 className="titel">
              MediaTracker
            </h1>
            <p className="tekst">
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
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="tekstveld"
                placeholder="jouw@email.com"
              />
            </div>

            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="tekstveld-wachtwoord password-input"
                placeholder="Je wachtwoord"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="password-toggle"
                aria-label={showPassword ? "Verberg wachtwoord" : "Toon wachtwoord"}
              >
                {showPassword ? <EyeOff className="eye-icon" /> : <Eye className="eye-icon" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inlog-knop"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Even geduld...
                </>
              ) : isLogin ? (
                <>
                  <LogIn className="inloggen" />
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

            <button
              onClick={handleAnonymousSignIn}
              disabled={loading}
              className="anonymous-inlog-knop"
            >
              <User className="w-4 h-4" />
              Anoniem verder gaan
            </button>
          </div>

          {/* Toggle */}
          <div className="margin">
            <p className="text-slate-400 text-sm">
              {isLogin ? "Nog geen account?" : "Al een account?"}
              </p>
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError("");
                }}
                className="login-toggle"
              >
                {isLogin ? "Registreren" : "Inloggen"}
              </button>
          </div>
        </div>

        {/* Info */}
        <div className="tekst-info">
          <p>Je ontvangt een bevestigings-e-mail bij registratie</p>
        </div>
      </div>
  );
}
