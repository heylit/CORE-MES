import * as K from '../kurallar/index.ts';
import { Foy } from '../ortak/Foy.tsx';
import { useKgFiyatlari } from '../veri.ts';
import { useSihirbaz } from './baglam.ts';
import type { Taslak } from './durum.ts';

// Föy çizimi ortaktır (katalogdaki kart penceresiyle aynı); sihirbaz yalnız veriyi ve kg fiyatını verir. Kısa hali sağdaki canlı
// önizlemedir (prototipte `specHTML(d, true)`); fiyat yalnız son adımdaki tam föyde ve kayıtlı kartta sorulur.
export function FoyGorunumu({ d, kisa = false }: { d: Taslak; kisa?: boolean }) {
  const { b, kartlar, yetki } = useSihirbaz();
  const fiyatlar = useKgFiyatlari(kartlar, yetki.kgFiyatiOkur && !kisa && !!d.id);
  const veri = K.foyVerisi(d, b, kisa);
  if (!fiyatlar || !d.id) return <Foy veri={veri} />;
  return <Foy veri={veri} kgFiyati={fiyatlar.get(d.id) ?? null} />;
}
