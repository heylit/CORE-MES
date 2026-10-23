import type { ReactNode } from 'react';
import { Dugme, Pencere } from '../../../../ortak/arayuz/index.ts';

// Yazdırılan belgeler (izin formu, çalışma belgesi, bordro pusulası, tazminat dökümü): içerik ve imza alanları çerçevedekiyle
// aynıdır; belge pencerede gösterilir, yazdırmada yalnız belge çıkar (ik-yeni.css @media print).
export function BelgeYazdir({ baslik, kapat, children }: { baslik: string; kapat: () => void; children: ReactNode }) {
  return (
    <Pencere acik baslik={baslik} kapat={kapat} tur="tam">
      <div className="tc-ik-belge-arac">
        <Dugme tur="birincil" simge="printer" onClick={() => { window.print(); }}>Yazdır</Dugme>
      </div>
      <article className="tc-ik-belge">{children}</article>
    </Pencere>
  );
}

// İmza alanları: sol taraf çalışan, sağ taraf işveren ya da yetkili.
export function ImzaAlanlari({ sol, sag }: { sol: string; sag: string }) {
  return (
    <div className="tc-ik-imza">
      <div><span>{sol}</span><i /></div>
      <div><span>{sag}</span><i /></div>
    </div>
  );
}
