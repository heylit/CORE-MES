// Başka modül ekranlarının ithal edebildiği tek dosya.
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useFabrika } from './veri.ts';

// Fabrika haritasına yerleşmiş istasyonlar (Çizim Merkezi eşleştirme uyarısı, kart #1258). Haritayı göremeyen ya da
// liste alınamayan kullanıcıda `null`: yerleşim bilinmiyor, "yok" denmez.
export function useHaritadakiIstasyonlar(): ReadonlySet<number> | null {
  const islemler = useOturum().data?.islemler ?? [];
  const gorur = islemler.includes('sayfa.atolye') || islemler.includes('atolye.yaz');
  const fabrika = useFabrika(gorur);
  if (!gorur || !fabrika.data) return null;
  return new Set(fabrika.data.bolumler.flatMap((b) => b.istasyonYerleri.map((i) => i.istasyonId)));
}

// Haritanın depo görünümü (raf, bölme, göz) başka sayfaya gömülür; aynı veri ve aynı düzenleyici (kart #1304).
export { DepoPaneli } from './DepoPaneli.tsx';
export type { DepoYazimi } from './depo-yazimi.ts';

// Zemin ızgarasındaki öğenin plan simgesi (kart #1304): Stok Merkezi karede haritadaki aynı simgeyi çizer.
export { ALAN_TURU_ADI } from './kurallar.ts';
export { ZeminSimgesi } from './ZeminSimgesi.tsx';

// Bütün bölümler tek zeminde, salt okunur (kart #114): Stok Merkezi konum görünümü bunu çizer; veriyi çağıran verir.
export { FabrikaZemini } from './FabrikaZemini.tsx';
export type { FabrikaZeminiOzellikleri } from './FabrikaZemini.tsx';
