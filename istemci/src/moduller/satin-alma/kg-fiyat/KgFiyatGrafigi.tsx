import type { KgFiyatiSatiri } from '#paylasilan/sozlesme/satin-alma.ts';
import { GrafikKarti, type GrafikNoktasi } from '../../../ortak/arayuz/index.ts';

export interface FiyatSerisi { paraBirimi: string; noktalar: GrafikNoktasi[]; disarida: number }

// Geçmiş, girişin kendi para biriminde çizilir: TL karşılığı bugünün kuruyla hesaplanır, eski girişi bugünün kuruna çevirmek
// geçmişi yanıltır. Seri en son girişin para birimindedir; başka para birimindeki giriş çizilmez, sayısı yazılır.
// Aynı geçerlilik gününde sonra girilen geçerlidir (güncel fiyat kuralı); gün başına tek nokta, eskiden yeniye.
export function fiyatSerisi(girisler: readonly KgFiyatiSatiri[]): FiyatSerisi | null {
  const son = girisler[0];
  if (son === undefined) return null;
  const gunler = new Map<string, number>();
  let disarida = 0;
  for (const g of girisler) {
    if (g.paraBirimi !== son.paraBirimi) disarida += 1;
    else if (!gunler.has(g.gecerlilik)) gunler.set(g.gecerlilik, Number(g.kgFiyati));
  }
  const noktalar = [...gunler].sort(([a], [b]) => a.localeCompare(b))
    .map(([t, deger]) => ({ etiket: `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`, deger }));
  return { paraBirimi: son.paraBirimi, noktalar, disarida };
}

// Girişler sunucudan geçerlilik ve giriş sırasına göre yeniden eskiye gelir (kgFiyatiGecmisi).
export function KgFiyatGrafigi({ girisler, hata }: { girisler: readonly KgFiyatiSatiri[] | undefined; hata: boolean }) {
  const seri = girisler === undefined ? undefined : fiyatSerisi(girisler);
  const birim = seri ? (seri.paraBirimi === 'TRY' ? 'TL' : seri.paraBirimi) : '';
  return (
    <GrafikKarti baslik="Kg fiyatı, geçerlilik gününe göre" simge="chart" tur="egri" birim={birim} hata={hata}
      noktalar={seri === undefined ? undefined : seri?.noktalar ?? null}
      altMetin={seri && seri.disarida > 0 ? `${seri.disarida} giriş başka para biriminde, grafikte yok.` : undefined} />
  );
}
