import type { KmFasonGkkSatiri, KmGirisKaydi, KmGirisKarari, KmGkkTuru, KmKaynaktaMuayeneSatiri } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { YOK } from '../bicim.ts';

export const girisKaydiAnahtari = (id: number) => ['kalite-merkezi', 'giris', 'kayit', id] as const;
export const GIRIS_KAYITLARI_ANAHTARI = ['kalite-merkezi', 'giris', 'kayitlar'] as const;

export const DURUM_ADI: Record<KmGirisKaydi['durum'], string> = { gkk_bekliyor: 'GKK bekliyor', karar_bekliyor: 'Karar bekliyor', kapandi: 'Kapandı' };
export const DURUM_TONU: Record<KmGirisKaydi['durum'], RozetTonu> = { gkk_bekliyor: 'uyari', karar_bekliyor: 'hata', kapandi: 'tamam' };
export const KARAR_ADI: Record<KmGirisKarari, string> = { kabul: 'Kabul', sartli_kabul: 'Şartlı kabul', red: 'Red (iade)' };

// Sunucu miktarı "7.000" verir; ekranda "7", ondalıkta "2,5".
export const miktarMetni = (m: string | null): string => (m === null || m.trim() === '' || Number.isNaN(Number(m.replace(',', '.')))
  ? YOK : Number(m.replace(',', '.')).toLocaleString('tr-TR', { maximumFractionDigits: 3 }));

export const GKK_TURU_ADI: Record<KmGkkTuru, string> = { hammadde: 'Hammadde', yari_mamul: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf' };

// Dört sonuç ayrı tutulmaz; kabul ve hatalı miktarıyla hatalının kararından çıkar (1251 a, 1252, 1253 a).
export type GkkSonucu = 'kabul' | 'kismi' | 'sartli' | 'ret';
export const SONUC_ADI: Record<GkkSonucu, string> = { kabul: 'Kabul', kismi: 'Kısmi kabul', sartli: 'Şartlı kabul', ret: 'Ret' };
export function gkkSonucu(k: Pick<KmGirisKaydi, 'kabulMiktar' | 'hataliMiktar' | 'karar'>): GkkSonucu | null {
  if (k.hataliMiktar === null) return null;
  if (Number(k.hataliMiktar) <= 0) return 'kabul';
  if (k.karar === 'sartli_kabul') return 'sartli';
  if (k.karar === 'red') return Number(k.kabulMiktar ?? 0) > 0 ? 'kismi' : 'ret';
  if (k.karar === 'kabul') return 'kabul';
  return null;
}

export function sonucMetni(k: KmGirisKaydi): string {
  if (k.durum !== 'kapandi') return YOK;
  const s = gkkSonucu(k);
  if (s === null) return YOK;
  if (s === 'kabul' && k.karar === 'kabul') return `Kabul (${miktarMetni(k.hataliMiktar)} hatalı olduğu gibi)`;
  if (s === 'kismi') return `Kısmi kabul (${miktarMetni(k.hataliMiktar)} ret)`;
  if (s === 'sartli') return `Şartlı kabul (${miktarMetni(k.hataliMiktar)})`;
  return SONUC_ADI[s];
}

// Arama mal kabul no, malzeme, lot, tedarikçi ve siparişte; Türkçe harf duyarsız.
const sadeles = (m: string): string => m.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
export function girisAraniyor(k: KmGirisKaydi, q: string): boolean {
  const s = sadeles(q.trim());
  if (!s) return true;
  return [k.gkkNo, k.malKabulNo, k.malzemeKod, k.malzemeAd, k.partiEtiketi, k.tedarikciAdi, k.siparisNo].some((d) => d !== null && sadeles(d).includes(s));
}

// 3809: fason dönüşü kararı. Üç sonucun adedi tam sayı ve sıfırdan büyük toplamdadır, bekleyeni aşamaz; ihlal yoksa null.
export function fasonKararIhlali(a: { serbest: number; sartli: number; red: number }, bekleyen: number | null): string | null {
  if (bekleyen === null) return 'Dönüşün adet karşılığı bulunamadı; karar verilemez.';
  if ([a.serbest, a.sartli, a.red].some((x) => !Number.isInteger(x) || x < 0)) return 'Adetler sıfır ya da pozitif tam sayıdır.';
  const toplam = a.serbest + a.sartli + a.red;
  if (toplam === 0) return 'En az bir adede karar verin.';
  if (toplam > bekleyen) return `Toplam ${String(toplam)} adet, bekleyen ${String(bekleyen)} adedi aşıyor.`;
  return null;
}

// 3809: kaynağında muayene onayı. Sağlam ve red firmaya gönderilenin içindedir ve toplamı sıfır olamaz (sunucu kuralıyla aynı).
export function muayeneOnayIhlali(saglam: number, red: number, gonderilen: number): string | null {
  if (![saglam, red].every((x) => Number.isInteger(x) && x >= 0)) return 'Adetler sıfır ya da pozitif tam sayıdır.';
  if (saglam + red === 0) return 'Sağlam ya da red adedini girin.';
  if (saglam + red > gonderilen) return `Toplam ${String(saglam + red)} adet, firmaya gönderilen ${String(gonderilen)} adedi aşıyor.`;
  return null;
}

// Bekleyen sekmesi iki kaynağı tek tabloda gösterir: satın alma lotu (mal kabul satırı) ve fason dönüşü (fason adımı).
export type BekleyenSatir = { tur: 'satin_alma'; k: KmGirisKaydi } | { tur: 'fason'; f: KmFasonGkkSatiri };
export const bekleyenAnahtari = (s: BekleyenSatir): string => (s.tur === 'fason' ? `f${String(s.f.fasonIsEmriId)}` : `s${String(s.k.malKabulSatirId)}`);
export function fasonAraniyor(f: KmFasonGkkSatiri, q: string): boolean {
  const s = sadeles(q.trim());
  if (!s) return true;
  return [f.emirNo, `OP ${String(f.opNo)}`, f.parcaNo, f.parcaAd, f.firmaAdi, f.malKabulNo, f.malzemeKod].some((d) => d !== null && sadeles(d).includes(s));
}
export function muayeneAraniyor(m: KmKaynaktaMuayeneSatiri, q: string): boolean {
  const s = sadeles(q.trim());
  if (!s) return true;
  return [m.emirNo, `OP ${String(m.opNo)}`, m.parcaNo, m.parcaAd, m.firmaAdi].some((d) => d !== null && sadeles(d).includes(s));
}
