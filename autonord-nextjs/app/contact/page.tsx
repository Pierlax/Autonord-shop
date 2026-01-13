import { Metadata } from 'next';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contatti | Autonord Service',
  description: 'Contatta Autonord Service per preventivi, assistenza tecnica o informazioni commerciali. Siamo a Genova in Lungobisagno d\'Istria 34.',
};

export default function ContactPage() {
  return (
    <div className="container px-4 md:px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold font-heading mb-8 text-center">CONTATTACI</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
          {/* Contact Info */}
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <MapPin className="h-6 w-6 text-primary" /> Sede Operativa
              </h3>
              <p className="text-muted-foreground ml-8">
                Lungobisagno d'Istria 34<br />
                16141 Genova (GE)<br />
                Italia
              </p>
            </div>
            
            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Phone className="h-6 w-6 text-primary" /> Telefono
              </h3>
              <p className="text-muted-foreground ml-8">
                <a href="tel:0107456076" className="hover:text-primary transition-colors">010 7456076</a>
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Mail className="h-6 w-6 text-primary" /> Email
              </h3>
              <p className="text-muted-foreground ml-8">
                <a href="mailto:info@autonordservice.com" className="hover:text-primary transition-colors">info@autonordservice.com</a>
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" /> Orari di Apertura
              </h3>
              <ul className="text-muted-foreground ml-8 space-y-1">
                <li className="flex justify-between max-w-[200px]"><span>Lun - Ven:</span> <span>08:00 - 12:30</span></li>
                <li className="flex justify-between max-w-[200px] pl-[70px]"><span>14:00 - 18:00</span></li>
                <li className="flex justify-between max-w-[200px]"><span>Sab - Dom:</span> <span>Chiuso</span></li>
              </ul>
            </div>
          </div>

          {/* Map Placeholder */}
          <div className="h-full min-h-[300px] bg-muted rounded-lg overflow-hidden relative">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2880.867376766346!2d8.9545!3d44.4395!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDTCsDI2JzIyLjIiTiA4wrA1NywxNi4yIkU!5e0!3m2!1sit!2sit!4v1620000000000!5m2!1sit!2sit" 
              width="100%" 
              height="100%" 
              style={{ border: 0 }} 
              allowFullScreen 
              loading="lazy"
              className="absolute inset-0"
            ></iframe>
          </div>
        </div>
      </div>
    </div>
  );
}
