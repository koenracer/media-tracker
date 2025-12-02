import "./globals.css";

export const metadata = {
  title: "MediaTracker",
  description: "Track je films & series",
};

export default function RootLayout({ children }) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
