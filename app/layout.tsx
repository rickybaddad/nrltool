import "./globals.css";

export const metadata = {
  title: "NRL Model",
  description: "Elo-based NRL model vs bookmaker markets"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
