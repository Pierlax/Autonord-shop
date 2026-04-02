import type { Metadata } from "next";
import { Inter, Oswald, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ToasterProvider } from "@/components/ui/toaster-provider";
import { WhatsAppButton } from "@/components/ui/whatsapp-button";
import { NewsletterPopup } from "@/components/ui/newsletter-popup";
import { CartProvider } from "@/lib/cart-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const oswald = Oswald({ subsets: ["latin"], variable: "--font-heading" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: {
    template: "%s | Autonord Service",
    default: "Autonord Service | Leader Attrezzature Edili",
  },
  description: "Vendita e noleggio di elettroutensili professionali, macchine movimento terra e attrezzature per l'edilizia. Partner ufficiale Milwaukee, Yanmar, Makita.",
  metadataBase: new URL('https://autonordservice.com'),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${inter.variable} ${oswald.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans antialiased flex flex-col">
        <CartProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Salta al contenuto
          </a>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
          <WhatsAppButton />
          <NewsletterPopup />
          <ToasterProvider />
        </CartProvider>
      </body>
    </html>
  );
}
