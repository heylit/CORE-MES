import type { GeriBildirimKonusu, GeriBildirimTuru } from '#paylasilan/sozlesme/profil.ts';

// Ekran metinleri: tarih ve zaman Türkiye biçiminde; değer yoksa tire.
export const BOS = '—';

export function tarihMetni(tarih: string | null): string {
  if (tarih === null) return BOS;
  const [y, a, g] = tarih.split('-');
  return y && a && g ? `${g}.${a}.${y}` : tarih;
}

export function zamanMetni(iso: string): string {
  const an = new Date(iso);
  return Number.isNaN(an.getTime()) ? iso : an.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function basHarfler(ad: string): string {
  const parcalar = ad.trim().split(/\s+/).filter(Boolean);
  const ilk = parcalar[0]?.[0] ?? '';
  const son = parcalar.length > 1 ? parcalar[parcalar.length - 1]?.[0] ?? '' : '';
  return `${ilk}${son}`.toLocaleUpperCase('tr-TR') || '?';
}

// İşe girişten bugüne tam yıl ve ay; giriş yoksa ya da gelecekteyse null.
export function kidemMetni(iseGiris: string | null, bugun: string): string | null {
  if (iseGiris === null) return null;
  const [gy, ga, gg] = iseGiris.split('-').map(Number) as [number, number, number];
  const [by, ba, bg] = bugun.split('-').map(Number) as [number, number, number];
  let ay = (by - gy) * 12 + (ba - ga) - (bg < gg ? 1 : 0);
  if (!Number.isFinite(ay) || ay < 0) return null;
  const yil = Math.floor(ay / 12);
  ay %= 12;
  if (yil === 0 && ay === 0) return 'Bu ay başladı';
  return `${[yil > 0 ? `${yil} yıl` : '', ay > 0 ? `${ay} ay` : ''].filter(Boolean).join(' ')} kıdem`;
}

export const sayiMetni = (n: number | null): string => (n === null ? BOS : n.toLocaleString('tr-TR', { maximumFractionDigits: 2 }));

// Sözleşmedeki adların ekran karşılığı (istemci paylasilan sözleşmesini yalnız tip olarak alır); tip eksik anahtarı yakalar.
export const KONU_ADI = { sirket: 'Şirket', uygulama: 'Uygulama' } as const satisfies Record<GeriBildirimKonusu, string>;
export const TUR_ADI = { sikayet: 'Şikayet', istek: 'İstek', oneri: 'Öneri' } as const satisfies Record<GeriBildirimTuru, string>;
export const KONULAR = Object.keys(KONU_ADI) as GeriBildirimKonusu[];
export const TURLER = Object.keys(TUR_ADI) as GeriBildirimTuru[];
// Sunucu şemasıyla aynı sınırlar (paylasilan/sozlesme/profil.ts); aşan metni sunucu da reddeder.
export const METIN_EN_AZ = 3;
export const METIN_EN_COK = 2000;
