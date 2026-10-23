import { GrupluSecim, type SecimGrubu } from '../../../ortak/arayuz/index.ts';
import { OLAY_GRUPLARI, type OlayTuru } from './akislar.ts';

const GRUPLAR: readonly SecimGrubu<OlayTuru>[] = OLAY_GRUPLARI.map((g) => ({
  anahtar: g.baslik,
  baslik: g.baslik,
  secenekler: g.olaylar.map((o) => ({ deger: o.tur, baslik: o.baslik, alt: o.aciklama, simge: o.simge })),
}));

// "Ne oldu?": olay seçilir, sistem doğru yere kaydeder. Toplu kayıt Ayarlar > Veri aktarımı'ndaki CSV ile yapılır.
export function OlaySecici({ sec }: { sec: (tur: OlayTuru) => void }) {
  return (
    <div className="tc-fy-olaylar">
      <p className="tc-fy-not">Olayı seçin; sistem doğru yere kaydeder.</p>
      <GrupluSecim etiket="Ne oldu?" gruplar={GRUPLAR} sec={sec} />
      <p className="tc-fy-not">Toplu kayıt için Ayarlar &gt; Veri aktarımı'ndaki CSV aktarımını kullanın.</p>
    </div>
  );
}
