import type { SiparisDurumu, TeklifDurumu } from '#paylasilan/sozlesme/siparisler.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import type { RozetTonu, Sekme } from '../../ortak/arayuz/index.ts';

export const SIPARIS_DURUMU: Record<SiparisDurumu, { etiket: string; ton: RozetTonu }> = {
  taslak: { etiket: 'Taslak', ton: 'uyari' },
  onayli: { etiket: 'Onaylı', ton: 'bilgi' },
  kapandi: { etiket: 'Kapandı', ton: 'tamam' },
  iptal: { etiket: 'İptal', ton: 'hata' },
};

// 291 a: sözleşmedeki ISKONTO_ONAY_ESIGI (istemci sözleşmeden değer ithal etmez); sınırı sunucu uygular, ekran yalnız haber verir.
export const ISKONTO_ONAY_ESIGI = 10;

export const TEKLIF_DURUMU: Record<TeklifDurumu, { etiket: string; ton: RozetTonu }> = {
  yeni: { etiket: 'Fiyat bekliyor', ton: 'uyari' },
  'onay-bekliyor': { etiket: 'İskonto onayı bekliyor', ton: 'uyari' },
  verildi: { etiket: 'Müşteride', ton: 'bilgi' },
  revizyon: { etiket: 'Revizyon istendi', ton: 'uyari' },
  kabul: { etiket: 'Kabul edildi', ton: 'tamam' },
  red: { etiket: 'Reddedildi', ton: 'hata' },
  siparis: { etiket: 'Siparişe döndü', ton: 'tamam' },
};

export type SiparisSekmesi = SiparisDurumu | 'tumu';
export type TeklifSekmesi = TeklifDurumu | 'tumu';

export const SIPARIS_SEKMELERI: readonly Sekme<SiparisSekmesi>[] = [
  { anahtar: 'tumu', baslik: 'Tümü' },
  { anahtar: 'taslak', baslik: SIPARIS_DURUMU.taslak.etiket },
  { anahtar: 'onayli', baslik: SIPARIS_DURUMU.onayli.etiket },
  { anahtar: 'kapandi', baslik: SIPARIS_DURUMU.kapandi.etiket },
  { anahtar: 'iptal', baslik: SIPARIS_DURUMU.iptal.etiket },
];

export const TEKLIF_SEKMELERI: readonly Sekme<TeklifSekmesi>[] = [
  { anahtar: 'tumu', baslik: 'Tümü' },
  { anahtar: 'yeni', baslik: TEKLIF_DURUMU.yeni.etiket },
  { anahtar: 'onay-bekliyor', baslik: TEKLIF_DURUMU['onay-bekliyor'].etiket },
  { anahtar: 'verildi', baslik: TEKLIF_DURUMU.verildi.etiket },
  { anahtar: 'revizyon', baslik: TEKLIF_DURUMU.revizyon.etiket },
  { anahtar: 'kabul', baslik: TEKLIF_DURUMU.kabul.etiket },
  { anahtar: 'red', baslik: TEKLIF_DURUMU.red.etiket },
  { anahtar: 'siparis', baslik: TEKLIF_DURUMU.siparis.etiket },
];

const binlik = (s: string): string => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Miktar ve tutar metin (numeric) taşınır; ekranda Türkçe ondalıkla yazılır, sayıya çevrilmez. Veri yoksa tire.
export function miktarMetni(m: string | null | undefined): string {
  if (m === null || m === undefined) return '—';
  const [tam = '0', ondalik = ''] = m.split('.');
  const kalan = ondalik.replace(/0+$/, '');
  return `${binlik(tam)}${kalan ? `,${kalan}` : ''}`;
}

export function paraMetni(t: string | null | undefined, paraBirimi: string): string {
  if (t === null || t === undefined) return '—';
  const [tam = '0', ondalik = ''] = t.split('.');
  return `${binlik(tam)},${ondalik.padEnd(2, '0').slice(0, 2)} ${paraBirimi}`;
}

// Birim fiyat dört ondalığa kadar gider: kuruş altı kesilmez.
export function fiyatMetni(t: string | null | undefined, paraBirimi: string): string {
  if (t === null || t === undefined) return '—';
  const [tam = '0', ondalik = ''] = t.split('.');
  return `${binlik(tam)},${ondalik.replace(/0+$/, '').padEnd(2, '0')} ${paraBirimi}`;
}

export function tarihMetni(t: string | null | undefined): string {
  if (t === null || t === undefined) return '—';
  const [y, a, g] = t.slice(0, 10).split('-');
  return `${g}.${a}.${y}`;
}

const ZAMAN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
export const zamanMetni = (iso: string | null): string => (iso === null ? '—' : ZAMAN.format(new Date(iso)));

export const bugun = (): string => tesisGunu(Date.now());

const gunNo = (t: string): number => {
  const [y = 0, a = 1, g = 1] = t.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, a - 1, g) / 86_400_000;
};

// Kalan gün yalnız açık kayıt için anlamlıdır; kapanmış ya da iptal kayda yazılmaz.
export function kalanGun(tarih: string): { metin: string; gecikti: boolean } {
  const fark = gunNo(tarih) - gunNo(bugun());
  if (fark === 0) return { metin: 'bugün', gecikti: false };
  return fark > 0 ? { metin: `${fark} gün kaldı`, gecikti: false } : { metin: `${-fark} gün gecikti`, gecikti: true };
}

// "12,5" ve "12.5" sunucuya "12.5" gider; virgül varsa noktalar binliktir ("1.250,5"). Virgülsüz "1.250" binlik de
// üç ondalık da okunabilir: sessizce yorumlanmaz, kullanıcıya sorulur.
const BELIRSIZ = /^\d{1,3}(\.\d{3})+$/;
export const BELIRSIZ_SAYI = 'Noktanın binlik mi ondalık mı olduğu belli değil. Bin iki yüz elli için 1250, bir virgül yirmi beş için 1,25 yazın.';
export function sayiGirdisi(v: string): string {
  const t = v.trim();
  return t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
}
export const belirsizSayi = (v: string): boolean => !v.includes(',') && BELIRSIZ.test(v.trim());
// Sunucunun "1.000" gibi ondalık metni forma virgüllü döner; yoksa belirsiz sayı sayılıp kayıt düzenlenemez.
export const girdiMetni = (m: string): string => miktarMetni(m).replace(/\./g, '');

export const bosYap = (m: string): string | null => (m.trim() === '' ? null : m.trim());
