import type { Metadata } from "next";
import { Inter, Oswald, Roboto_Condensed } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-heading" });
const robotoCondensed = Roboto_Condensed({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL('https://autonord-service.it'),
  title: {
    default: "Autonord Service | Elettroutensili Professionali e Macchine Edili",
    template: "%s | Autonord Service"
  },
  description: "Dal 1980 il punto di riferimento a Genova per l'edilizia professionale. Vendita, noleggio e assistenza ufficiale Milwaukee, Yanmar, Makita.",
  keywords: ["elettroutensili", "macchine edili", "genova", "milwaukee", "yanmar", "noleggio", "assistenza"],
  authors: [{ name: "Autonord Service" }],
  creator: "Autonord Service",
  openGraph: {
    type: "website",
    locale: "it_IT",
    url: "https://autonord-service.it",
    title: "Autonord Service | Partner per l'Edilizia Professionale",
    description: "Vendita, noleggio e assistenza di attrezzature professionali. Scopri il catalogo online.",
    siteName: "Autonord Service",
  },
  robots: {
    index: true,
    follow: true,
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${inter.variable} ${oswald.variable} ${robotoCondensed.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
