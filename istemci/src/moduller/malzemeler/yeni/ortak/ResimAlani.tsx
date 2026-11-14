import { useContext } from 'react';
import { KucukResimKutusu, ResimPaneli, type useKucukResimler } from '../../../cizimler/disari.ts';
import { SihirbazBaglami } from '../sihirbaz/baglam.ts';
import { KatalogSimgesi } from './KatalogSimgesi.tsx';

// Resmin sahibi çizim merkezidir (688 a); kart kopya tutmaz. Resim her türde karta eklenir (2872-1 a: mal kabul hammadde ve sarfta
// da resmi gösterir). Teknik resim no ve revizyonla eşleşme önerisi yine yalnız yarı mamul ve mamuldedir; onu sunucu kurar.
// Panel kart no olmadan (kaydedilmemiş kart) açılamaz.
export const resimliTur = (tur: string | null | undefined): boolean => tur != null && tur !== '';

export function ResimAlani({ tur, no }: { tur: string | null | undefined; no: number | null | undefined }) {
  // Sihirbazda föydeki raftan yüklenen çizimler bitince panel yeniden okunur (3242 d); kart penceresinde bağlam yoktur.
  const tazele = useContext(SihirbazBaglami)?.cizimTazele ?? 0;
  if (!resimliTur(tur) || !no) return null;
  return (
    <section aria-label="Resim, PDF ve 3B model">
      <ResimPaneli malzemeNo={no} tazele={tazele} />
    </section>
  );
}

export type KucukResimler = ReturnType<typeof useKucukResimler>;

// Liste satırı: resmi olan kartta küçük resim (revizyon uyuşmazlığı kutunun içinde), resmi olmayanda türün simgesi.
export function SatirResmi({ tur, no, ad, simge, resimler }: {
  tur: string | null | undefined; no: number; ad: string; simge: string | null | undefined; resimler: KucukResimler;
}) {
  const resim = resimliTur(tur) ? resimler.get(no) : undefined;
  return resim ? <KucukResimKutusu resim={resim} ad={ad} boy="kucuk" /> : <KatalogSimgesi yol={simge} />;
}
