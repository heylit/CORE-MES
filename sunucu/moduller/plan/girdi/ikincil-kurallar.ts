import type { AparatKapasitesi } from '#paylasilan/sozlesme/istasyonlar.ts';

// 3199 (A + D): ikincil kaynağın motor girdisi (saf). Kimlik kapasite satırınındır; aynı kart başka istasyonda ayrı kaynaktır, istasyonsuz
// satır ortaktır. Motor adımın tezgâhının istasyonundaki satırı, yoksa ortak satırı kullanır (engine ikincilSec).
export interface MotorKesintisi { neden: 'bakim' | 'kalibrasyon' | 'odunc'; bas: string; bit: string; adet: number }
export interface MotorIkincilKaynagi {
  id: string;
  kart: string;
  kod: string | null;
  ad: string | null;
  istasyon: string | null;
  adet: number;
  tur: 'aparat' | 'ozel_takim';
  kisit: 'sert' | 'izle';
  kesintiler: MotorKesintisi[];
  omur: number | null;
  omurBirimi: 'dk' | 'adet' | null;
  degisimDk: number | null;
  // Başlangıçta kalan ömrün payı (0..1); CNC Kurulum'da yük kaydı yoksa null: motor tam ömür sayar ve "başlangıç ömrü bilinmiyor" yazar (V13).
  kalanPay: number | null;
}
export interface MotorKaynakIstegi { kart: string; adet: number; asama: 'ayar_isleme' | 'isleme' }
export interface IkincilEki {
  kaynaklar: MotorIkincilKaynagi[] | null;
  // Anahtar "emir no|OP no" (girdi.betik tmiIslemler ile planın işlem kimliğine çevrilir).
  istekler: Record<string, MotorKaynakIstegi[]> | null;
}
export interface IkincilOkuma {
  kaynaklar: AparatKapasitesi[] | null;
  kartlar: Map<number, { kod: string | null; ad: string | null }>;
  istekler: { anahtar: string; istekler: { malzemeId: number; adet: number; asama: 'ayar_isleme' | 'isleme' }[] }[] | null;
  takimlar: { kartId: number; istasyonId: number; kalanPay: number | null }[] | null;
}

// Ortak takımın başlangıç ömrü yüklü olduğu ceplerin en azıdır; istasyonlu satırda yalnız o istasyonun cebi sayılır.
function kalanPayi(k: AparatKapasitesi, takimlar: IkincilOkuma['takimlar']): number | null {
  if (k.tur !== 'ozel_takim' || k.omur === null || takimlar === null) return null;
  const paylar = takimlar.filter((t) => t.kartId === k.aparatKartiId && (k.istasyonId === null || t.istasyonId === k.istasyonId))
    .flatMap((t) => (t.kalanPay === null ? [] : [t.kalanPay]));
  return paylar.length === 0 ? null : Math.min(1, Math.max(0, Math.min(...paylar)));
}

export function ikincilKaynakKur(o: IkincilOkuma): IkincilEki {
  const kaynaklar = o.kaynaklar === null ? null : o.kaynaklar.map((k): MotorIkincilKaynagi => ({
    id: String(k.id), kart: String(k.aparatKartiId), kod: o.kartlar.get(k.aparatKartiId)?.kod ?? null, ad: o.kartlar.get(k.aparatKartiId)?.ad ?? null,
    istasyon: k.istasyonId === null ? null : String(k.istasyonId), adet: k.adet, tur: k.tur, kisit: k.kisit,
    kesintiler: k.kesintiler.map((x) => ({ neden: x.neden, bas: x.baslangic, bit: x.bitis, adet: x.adet })),
    omur: k.omur, omurBirimi: k.omurBirimi, degisimDk: k.degisimDk, kalanPay: kalanPayi(k, o.takimlar),
  }));
  const istekler = o.istekler === null ? null
    : Object.fromEntries(o.istekler.map((i) => [i.anahtar, i.istekler.map((x) => ({ kart: String(x.malzemeId), adet: x.adet, asama: x.asama }))]));
  return { kaynaklar, istekler };
}
