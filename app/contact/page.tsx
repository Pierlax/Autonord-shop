import { Metadata } from 'next';
import Link from 'next/link';
import { MapPin, Phone, Mail, Clock, ChevronRight, MessageSquare, Send } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contatti | Autonord Service',
  description: 'Contatta Autonord Service per preventivi, assistenza tecnica o informazioni commerciali. Siamo a Genova in Lungobisagno d\'Istria 34.',
};

export default function ContactPage() {
  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative w-full py-16 md:py-20 bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-900/90 to-slate-900/70"></div>
        
        <div className="container relative z-10 px-4 md:px-8">
          {/* Breadcrumbs */}
          <nav className="flex items-center text-sm text-slate-400 mb-6">
            <Link href="/" className="hover:text-primary transition-colors">Home</Link>
            <ChevronRight className="h-4 w-4 mx-2" />
            <span className="text-white">Contatti</span>
          </nav>
          
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Parliamo del Tuo <span className="text-primary">Progetto</span>
            </h1>
            <p className="text-lg text-slate-300">
              Siamo qui per aiutarti. Contattaci per preventivi, assistenza tecnica o informazioni commerciali.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-16 md:py-20">
        <div className="container px-4 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Contact Info */}
            <div>
              <h2 className="text-2xl font-bold mb-8">Informazioni di Contatto</h2>
              
              <div className="space-y-8">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Sede Operativa</h3>
                    <p className="text-muted-foreground">
                      Lungobisagno d'Istria 34<br />
                      16141 Genova (GE)<br />
                      Italia
                    </p>
                    <a 
                      href="https://maps.google.com/?q=Lungobisagno+d'Istria+34+Genova" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline mt-2 inline-block"
                    >
                      Apri in Google Maps →
                    </a>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Telefono</h3>
                    <a href="tel:0107456076" className="text-muted-foreground hover:text-primary transition-colors text-lg">
                      010 7456076
                    </a>
                    <p className="text-sm text-muted-foreground mt-1">
                      Assistenza tecnica e commerciale
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Email</h3>
                    <a href="mailto:info@autonordservice.com" className="text-muted-foreground hover:text-primary transition-colors">
                      info@autonordservice.com
                    </a>
                    <p className="text-sm text-muted-foreground mt-1">
                      Rispondiamo entro 24 ore lavorative
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Orari di Apertura</h3>
                    <div className="space-y-1 text-muted-foreground">
                      <div className="flex justify-between max-w-[240px]">
                        <span>Lunedì - Venerdì</span>
                        <span className="font-medium text-foreground">08:00 - 18:00</span>
                      </div>
                      <div className="flex justify-between max-w-[240px] text-sm">
                        <span></span>
                        <span className="text-muted-foreground">(pausa 12:30 - 14:00)</span>
                      </div>
                      <div className="flex justify-between max-w-[240px]">
                        <span>Sabato - Domenica</span>
                        <span>Chiuso</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Contact Buttons */}
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <a 
                  href="tel:0107456076"
                  className="inline-flex items-center justify-center h-12 px-6 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Chiama Ora
                </a>
                <a 
                  href="mailto:info@autonordservice.com"
                  className="inline-flex items-center justify-center h-12 px-6 rounded-lg border border-border hover:bg-accent transition-colors font-semibold"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Invia Email
                </a>
              </div>
            </div>

            {/* Contact Form */}
            <div className="bg-card border border-border rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Inviaci un Messaggio</h2>
                  <p className="text-sm text-muted-foreground">Compila il form e ti ricontatteremo</p>
                </div>
              </div>

              <form className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium mb-2">Nome *</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      required
                      className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Il tuo nome"
                    />
                  </div>
                  <div>
                    <label htmlFor="company" className="block text-sm font-medium mb-2">Azienda</label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="Nome azienda"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-2">Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      required
                      className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="email@esempio.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium mb-2">Telefono</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="+39 000 000 0000"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="subject" className="block text-sm font-medium mb-2">Oggetto *</label>
                  <select
                    id="subject"
                    name="subject"
                    required
                    className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">Seleziona un argomento</option>
                    <option value="preventivo">Richiesta Preventivo</option>
                    <option value="assistenza">Assistenza Tecnica</option>
                    <option value="noleggio">Informazioni Noleggio</option>
                    <option value="b2b">Programma B2B</option>
                    <option value="altro">Altro</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="message" className="block text-sm font-medium mb-2">Messaggio *</label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={5}
                    className="w-full px-4 py-3 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    placeholder="Descrivi la tua richiesta..."
                  ></textarea>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="privacy"
                    name="privacy"
                    required
                    className="mt-1 h-4 w-4 rounded border-input"
                  />
                  <label htmlFor="privacy" className="text-sm text-muted-foreground">
                    Ho letto e accetto la <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> *
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors inline-flex items-center justify-center"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Invia Messaggio
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* Map Section */}
      <section className="h-[400px] relative">
        <iframe 
          src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2880.867376766346!2d8.9545!3d44.4395!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDTCsDI2JzIyLjIiTiA4wrA1NywxNi4yIkU!5e0!3m2!1sit!2sit!4v1620000000000!5m2!1sit!2sit" 
          width="100%" 
          height="100%" 
          style={{ border: 0 }} 
          allowFullScreen 
          loading="lazy"
          className="absolute inset-0 grayscale"
        ></iframe>
        <div className="absolute bottom-6 left-6 bg-card border border-border rounded-lg p-4 shadow-lg max-w-xs">
          <h3 className="font-bold mb-1">Autonord Service</h3>
          <p className="text-sm text-muted-foreground">Lungobisagno d'Istria 34, Genova</p>
        </div>
      </section>
    </div>
  );
}
