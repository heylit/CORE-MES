import { KAPALI, MRB_KARAR_BEKLIYOR } from '../sabitler.ts';
import type { Ncr } from '../tipler.ts';

// Uygunsuzluk (NCR) ekranının saf kuralları; uygulamadaki karşılığı adıyla yazılı.

type NcrAlanlari = Partial<Ncr>;

// Kapanmış NCR ve DÖF sunucuda kilitlidir (258 a): düzeltme yeni kayıtla yapılır.
export const KILIT_ILETISI = 'Kapanmış uygunsuzluk ve DÖF, sonuçlanmış muayene ve lot kabul kaydı değiştirilemez; düzeltme yeni kayıtla yapılır.';

export interface KayitSorunu {
  metin: string;
  // 3: kaydı durdurur; kontrol adımında da gösterilir.
  agirlik: number;
}

// Kontrol adımındaki uyarılar ve kaydı durduran kurallar (uygulamadaki iki ileti).
export function ncrSorunlari(d: NcrAlanlari): KayitSorunu[] {
  const sorun: KayitSorunu[] = [];
  if (d.durum === KAPALI && (d.mrb ?? MRB_KARAR_BEKLIYOR) === MRB_KARAR_BEKLIYOR) sorun.push({ metin: 'MRB kararı verilmeden NCR kapatılamaz', agirlik: 3 });
  if ((d.mrb ?? '').includes('müşteri onaylı') && !d.mrbGerekce) sorun.push({ metin: 'Müşteri onaylı kararda onay referansı gerekli', agirlik: 3 });
  return sorun;
}

// Kapama ve MRB kararı kalite mühendisinindir (sunucu da `onayla` ister). Yetkisi olmayan kişi bu iki değeri değiştiremez;
// ekran seçenekleri gizler, bu denetim gizlenmiş seçeneğin elle gelmesine karşıdır.
export function yetkiGereken(d: NcrAlanlari, onceki: NcrAlanlari | null): boolean {
  const kapaniyor = d.durum === KAPALI && onceki?.durum !== KAPALI;
  const kararDegisti = !!d.mrb && d.mrb !== MRB_KARAR_BEKLIYOR && onceki?.mrb !== d.mrb;
  return kapaniyor || kararDegisti;
}

export interface NcrSuzgeci {
  q: string;
  // 'açık': kapalı olmayanlar; '': hepsi; öteki: o durum.
  d: string;
  s: string;
}

export const ILK_SUZGEC: NcrSuzgeci = { q: '', d: 'açık', s: '' };

export function ncrSuz<T extends NcrAlanlari>(liste: readonly T[], f: NcrSuzgeci, arsivliGoster: boolean): T[] {
  let l = liste.filter((x) => arsivliGoster || !x.arsiv).sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? ''));
  if (f.d === 'açık') l = l.filter((x) => x.durum !== KAPALI);
  else if (f.d) l = l.filter((x) => x.durum === f.d);
  if (f.s) l = l.filter((x) => x.ciddiyet === f.s);
  if (f.q) {
    const q = f.q.toLocaleLowerCase('tr');
    l = l.filter((x) => [x.no, x.parcaNo, x.parcaAdi, x.lot, x.proje, x.tanim, x.hataTipi].join(' ').toLocaleLowerCase('tr').includes(q));
  }
  return l;
}

// navCounts.ncr: kapalı olmayanlar; kritik açık varsa kötü.
export function ncrSayisi(liste: readonly NcrAlanlari[]): { n: number; kotu: boolean } {
  const acik = liste.filter((x) => x.durum !== KAPALI);
  return { n: acik.length, kotu: acik.some((x) => x.ciddiyet === 'Kritik') };
}

export interface ParetoSatiri { etiket: string; deger: number; kumulatif: number }

// paretoChart: hata tipine göre adet ve kümülatif yüzde; parantezli açıklama etikette kısalır.
export function hataParetosu(liste: readonly NcrAlanlari[]): ParetoSatiri[] {
  const sayi = new Map<string, number>();
  for (const n of liste) { const k = n.hataTipi || 'Diğer'; sayi.set(k, (sayi.get(k) ?? 0) + 1); }
  const sirali = [...sayi.entries()].sort((a, b) => b[1] - a[1]);
  const toplam = sirali.reduce((t, a) => t + a[1], 0) || 1;
  let birikim = 0;
  return sirali.map(([k, v]) => { birikim += v; return { etiket: k.split(' (')[0] ?? k, deger: v, kumulatif: Math.round((100 * birikim) / toplam) }; });
}

// Tespit yerine göre adet; müşteride ya da sahada bulunan kötü tonla.
export function tespitYerleri(liste: readonly NcrAlanlari[]): { etiket: string; deger: number; ton?: 'hata' }[] {
  const sayi = new Map<string, number>();
  for (const n of liste) { const k = n.kaynak || '—'; sayi.set(k, (sayi.get(k) ?? 0) + 1); }
  return [...sayi.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (/Müşteri/.test(k) ? { etiket: k, deger: v, ton: 'hata' as const } : { etiket: k, deger: v }));
}

// DÖF açarken öndeğerler (capaFromNcr).
export const dofOnDegerleri = (n: Ncr) => ({ ncrRef: n._id, baslik: `${n.parcaNo ?? ''}: ${n.hataTipi ?? ''}`, sorumlu: n.sorumlu ?? '' });

// Olduğu gibi kullan ya da Tamir kararıyla kapanış karantinadaki partileri bırakabilir (320 a).
export const birakanKapanis = (d: NcrAlanlari) => d.durum === KAPALI && ['Olduğu gibi kullan', 'Tamir'].some((k) => (d.mrb ?? '').startsWith(k));

const MIKTAR = /^\d{1,11}(\.\d{1,3})?$/;

// Serbest bırakılan miktar: sıfırdan büyük, red miktarından büyük olmayan, en çok üç ondalık.
export function serbestMiktarHatasi(girilen: string, red: number | string): string | null {
  const v = girilen.trim().replace(',', '.');
  if (!MIKTAR.test(v) || !(Number(v) > 0) || Number(v) > Number(red)) return 'Miktar sıfırdan büyük ve red miktarından az ya da eşit olmalı.';
  return null;
}
