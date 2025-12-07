import "./globals.css";
import { AuthProvider } from "./AuthContext";
import { Analytics } from "@vercel/analytics/next"

export const metadata = {
  title: "MediaTracker",
  description: "Track je films & series",
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
