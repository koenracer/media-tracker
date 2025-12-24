import "./globals.css";
import { AuthProvider } from "./AuthContext";
import { Analytics } from "@vercel/analytics/next"
import { icons } from "lucide-react";


export const metadata = {
  "name": "Media Tracker",
  "short_name": "MT",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icon-512.png",
      "sizes": "180x180",
      "type": "image/png"
    }
  ]
}

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
