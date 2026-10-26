import { KucukResimKutusu, ResimPaneli, type useKucukResimler } from '../../../cizimler/disari.ts';
import { KatalogSimgesi } from './KatalogSimgesi.tsx';

// Resmin sahibi çizim merkezidir (688 a); kart kopya tutmaz. Eşleşme kartın "Teknik resim no" ve "Revizyon"u ile yalnız yarı
// mamul ve mamulde yapılır; panel kart no olmadan (kaydedilmemiş kart) açılamaz.
export const resimliTur = (tur: string | null | undefined): boolean => tur === 'yarimamul' || tur === 'mamul';

export function ResimAlani({ tur, no }: { tur: string | null | undefined; no: number | null | undefined }) {
  if (!resimliTur(tur) || !no) return null;
  return (
    <section aria-label="Resim, PDF ve 3B model">
      <ResimPaneli malzemeNo={no} />
    </section>
  );
}

export type KucukResimler = ReturnType<typeof useKucukResimler>;

// Liste satırı: resmi olan yarı mamul ve mamulde küçük resim (revizyon uyuşmazlığı kutunun içinde), diğerlerinde türün simgesi.
export function SatirResmi({ tur, no, ad, simge, resimler }: {
  tur: string | null | undefined; no: number; ad: string; simge: string | null | undefined; resimler: KucukResimler;
}) {
  const resim = resimliTur(tur) ? resimler.get(no) : undefined;
  return resim ? <KucukResimKutusu resim={resim} ad={ad} boy="kucuk" /> : <KatalogSimgesi yol={simge} />;
}
