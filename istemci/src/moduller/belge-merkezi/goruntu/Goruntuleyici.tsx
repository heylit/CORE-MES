import { useEffect, useState } from 'react';
import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { DurumKutusu } from '../../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../../ortak/veri/api.ts';
import { ikiliOku } from '../dosya-aktarimi.ts';
import { gorunumTuru, modelBicimi } from '../gosterim.ts';
import { Model3B } from './Model3B.tsx';
import { PdfGoruntu } from './PdfGoruntu.tsx';

const RESIM_TURU: Partial<Record<DosyaTuru, string>> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };

function Resim({ veri, tur, ad }: { veri: Uint8Array; tur: DosyaTuru; ad: string }) {
  const [adres, adresYaz] = useState<string | null>(null);
  useEffect(() => {
    const a = URL.createObjectURL(new Blob([new Uint8Array(veri)], { type: RESIM_TURU[tur] ?? 'application/octet-stream' }));
    adresYaz(a);
    return () => { URL.revokeObjectURL(a); };
  }, [veri, tur]);
  return <div className="tc-cz-resim">{adres && <img src={adres} alt={ad} />}</div>;
}

// Revizyon dosyası merkezin okuma ucundan iner ve bu cihazda açılır (PDF, resim, STEP, IGES, STL, GLB, glTF). Ağır okuyucular
// (pdf.js, three, occt) yalnız bu bileşen açılınca iner.
export default function Goruntuleyici({ belgeId, revizyonId, tur, ad }: { belgeId: number; revizyonId: number; tur: DosyaTuru; ad: string }) {
  const [veri, veriYaz] = useState<Uint8Array | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    const kesici = new AbortController();
    veriYaz(null);
    hataYaz(null);
    ikiliOku(`/cizimler/${belgeId}/revizyonlar/${revizyonId}/dosya`, kesici.signal).then(
      veriYaz,
      (e: unknown) => { if (!kesici.signal.aborted) hataYaz(hataIletisi(e, 'Dosya alınamadı')); },
    );
    return () => { kesici.abort(); };
  }, [belgeId, revizyonId]);

  if (hata) return <DurumKutusu durum="hata" mesaj={hata} />;
  if (!veri) return <DurumKutusu durum="yukleniyor" mesaj="Dosya iniyor" />;
  if (gorunumTuru(tur) === 'pdf') return <PdfGoruntu veri={veri} />;
  const bicim = modelBicimi(tur);
  if (bicim) return <Model3B veri={veri} bicim={bicim} />;
  return <Resim veri={veri} tur={tur} ad={ad} />;
}
