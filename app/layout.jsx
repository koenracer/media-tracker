import "./globals.css";
import { AuthProvider } from "./AuthContext";
import { Analytics } from "@vercel/analytics/next"

export const metadata = {
  title: "Media Tracker",
  description: "Houdt bij welke films en series je kijkt",
  manifest: "/manifest.json", // Verwijzing naar stap 2
  icons: {
    icon: "/icon-512.png",
  },
  appleWebApp: {
    title: "MT",
    statusBarStyle: "black-translucent",
    capable: true,
  },
  link: { rel: "apple-touch-icon", href: "/icon-512.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
