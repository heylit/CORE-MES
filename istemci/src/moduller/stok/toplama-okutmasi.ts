import type { KodCozCevabi, ToplamaAdimi } from '#paylasilan/sozlesme/stok.ts';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import type { OkutmaTonu } from '../../ortak/arayuz/index.ts';

// Hazırlıkta toplama adımının okutarak denetimi (1907 a): okutmak isteğe bağlıdır; okutulan göz ve lot adımınkiyle karşılaştırılır.
// Göz ve malzeme etiketi yerinde karşılaştırılır. Lot etiketi lot numarası taşır, adım partinin kimliğini; lot stok çözümüyle
// partiye çevrilir (`lotSonucu`). Aynı malzemenin başka lotu yanlıştır: listedeki lot izlenebilirlik içindir.
export type Denetim = { ton: OkutmaTonu; metin: string } | null;
export interface ToplamaDenetimi { goz: Denetim; lot: Denetim }
export const DENETIM_BASI: ToplamaDenetimi = { goz: null, lot: null };

export type ToplamaOkutmasi =
  | { tur: 'goz' | 'lot'; denetim: NonNullable<Denetim> }
  | { tur: 'lot-coz'; kod: string }
  | { tur: 'yabanci'; denetim: NonNullable<Denetim> };

type Adim = Pick<ToplamaAdimi, 'konumKod' | 'malzemeId' | 'malzemeAd' | 'partiId' | 'partiEtiketi'>;
const malzemeAdi = (a: Adim) => a.malzemeAd ?? `Kart ${a.malzemeId}`;

export function toplamaOkutmasi(a: Adim, ham: string): ToplamaOkutmasi {
  const k = kodTuru(ham);
  if (k.tur === 'konum') {
    return k.deger === a.konumKod.toUpperCase()
      ? { tur: 'goz', denetim: { ton: 'tamam', metin: `${a.konumKod} doğru` } }
      : { tur: 'goz', denetim: { ton: 'hata', metin: `${k.deger} okutuldu, beklenen ${a.konumKod}` } };
  }
  if (k.tur === 'malzeme') {
    if (Number(k.deger) !== a.malzemeId) return { tur: 'lot', denetim: { ton: 'hata', metin: `Yanlış malzeme; beklenen ${malzemeAdi(a)}` } };
    return a.partiId === null
      ? { tur: 'lot', denetim: { ton: 'tamam', metin: 'Malzeme doğru' } }
      : { tur: 'lot', denetim: { ton: 'uyari', metin: 'Malzeme doğru, lot denetlenmedi' } };
  }
  if (k.tur === 'lot') return { tur: 'lot-coz', kod: `LOT:${k.deger}` };
  // Elle yazılan göz kodu öneksiz gelir.
  if (k.tur === 'bilinmiyor' && k.deger.replace(/\s+/g, '').toUpperCase() === a.konumKod.toUpperCase()) return { tur: 'goz', denetim: { ton: 'tamam', metin: `${a.konumKod} doğru` } };
  return { tur: 'yabanci', denetim: { ton: 'hata', metin: 'Bu adımda geçmeyen kod; göz, lot ya da malzeme etiketi okut' } };
}

export function lotSonucu(a: Adim, c: KodCozCevabi): NonNullable<Denetim> {
  if (c.tur !== 'lot') return { ton: 'hata', metin: 'Lot bulunamadı' };
  if (c.ozet.id !== a.malzemeId) return { ton: 'hata', metin: `${c.parti.lotNo} başka malzemenin; beklenen ${malzemeAdi(a)}` };
  if (a.partiId === null) return { ton: 'tamam', metin: `Malzeme doğru · ${c.parti.lotNo}` };
  return c.parti.id === a.partiId
    ? { ton: 'tamam', metin: `${c.parti.lotNo} doğru` }
    : { ton: 'hata', metin: `Aynı malzeme, başka lot: ${c.parti.lotNo}` };
}

export const okutmaEngeli = (d: ToplamaDenetimi): boolean => d.goz?.ton === 'hata' || d.lot?.ton === 'hata';
