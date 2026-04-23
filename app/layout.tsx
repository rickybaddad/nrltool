import "./globals.css";
import { Nav } from "@/components/nav";

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "NRL Model";

export const metadata = {
  title: APP_NAME,
  description: "Elo-based NRL win probability model vs bookmaker markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  );
}
