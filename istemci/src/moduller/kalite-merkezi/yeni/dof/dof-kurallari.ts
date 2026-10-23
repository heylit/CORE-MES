import { gunKaldi, type KmTon } from '../kurallar.ts';
import { KAPALI } from '../sabitler.ts';

// DÖF / 8D ekranının saf kuralları; uygulamadaki karşılığı adıyla yazılı.

// Ekranın okuduğu DÖF alanları (tipler.ts Dof ile uyumlu); eski kayıtta adım metin olabilir, okurken sayıya çevrilir.
export interface DofAlanlari {
  _id?: string; no?: string; ncrRef?: string; acilis?: string; termin?: string; baslik?: string; sorumlu?: string; tur?: string; yontem?: string;
  adim?: number | string; durum?: string; kokNeden?: string; aksiyon?: string; etkinlik?: string; etkinlikKanit?: string; kapanis?: string; arsiv?: boolean;
}

export const DOF_TURLERI = ['Düzeltici', 'Önleyici', 'Müşteri talepli 8D', 'Tedarikçi 8D'] as const;
export const KOK_NEDEN_YONTEMLERI = ['5 Neden', 'Ishikawa', 'Hata ağacı', 'Hata modu (FMEA) güncellemesi', 'Diğer'] as const;
export const ETKINLIKLER = ['Doğrulanmadı', 'Etkin', 'Etkin değil, yeniden aç'] as const;
export const DOF_DURUMLARI = ['Açık', KAPALI];

export const adimSayisi = (d: DofAlanlari) => Number(d.adim ?? 0) || 0;

export interface KayitSorunu { metin: string; agirlik: number }

// Kapanış için 8 adım, "Etkin" doğrulama ve kök neden (uygulamanın üç iletisi, kaydı durdurur).
export function kapanisHatasi(d: DofAlanlari): string | null {
  if (d.durum !== KAPALI) return null;
  if (adimSayisi(d) < 8) return 'Kapatmak için 8 adımın tamamı işaretlenmeli.';
  if (d.etkinlik !== 'Etkin') return 'Etkinlik doğrulanmadan DÖF kapatılamaz.';
  if (!d.kokNeden) return 'Kök neden girilmeden DÖF kapatılamaz.';
  return null;
}

// Kontrol adımında gösterilenler.
export function dofSorunlari(d: DofAlanlari): KayitSorunu[] {
  if (d.durum !== KAPALI) return [];
  const s: KayitSorunu[] = [];
  if (adimSayisi(d) < 8) s.push({ metin: 'Kapatmak için 8D adımlarının tamamı işaretlenmeli', agirlik: 2 });
  if (d.etkinlik !== 'Etkin') s.push({ metin: 'Etkinlik doğrulanmadan kapatılamaz', agirlik: 2 });
  if (!d.kokNeden) s.push({ metin: 'Kök neden boş', agirlik: 1 });
  return s;
}

export const kapamaYetkisiGerekir = (d: DofAlanlari, onceki: DofAlanlari | null) => d.durum === KAPALI && onceki?.durum !== KAPALI;

// Kaydedilecek gövde: adım sayıya çevrilir, kapanışta kapanış günü yazılır.
export function kayitGovdesi<T extends DofAlanlari>(d: T, bugun: string): T & { adim: number; kapanis?: string } {
  const g: T & { adim: number; kapanis?: string } = { ...d, adim: adimSayisi(d) };
  if (g.durum === KAPALI && !g.kapanis) g.kapanis = bugun;
  return g;
}

// setStep: işaretli son adıma basmak onu geri alır; kapalı DÖF değişmez.
export function adimDegistir(d: DofAlanlari, adim: number): number | null {
  if (d.durum === KAPALI) return null;
  return adimSayisi(d) === adim ? adim - 1 : adim;
}

export const ILK_SUZGEC = 'Açık';

export function dofSuz<T extends DofAlanlari>(liste: readonly T[], durum: string, arsivliGoster: boolean): T[] {
  const l = liste.filter((x) => arsivliGoster || !x.arsiv).sort((a, b) => (a.termin ?? '').localeCompare(b.termin ?? ''));
  return durum ? l.filter((c) => c.durum === durum) : l;
}

const gunFarki = (iso: string | undefined, simdi: string): number | null => gunKaldi(iso, simdi);

// capaOverdue
export const gecikti = (c: DofAlanlari, bugun: string) => {
  const k = gunFarki(c.termin, bugun);
  return c.durum !== KAPALI && k !== null && k < 0;
};

// Termin sütununun ikinci satırı.
export function terminMetni(c: DofAlanlari, bugun: string, tarih: (iso: string | undefined) => string): string {
  if (c.durum === KAPALI) return `kapandı ${tarih(c.kapanis)}`;
  const k = gunFarki(c.termin, bugun);
  if (k === null) return '';
  return k < 0 ? `${-k} gün gecikme` : `${k} gün kaldı`;
}

export function dofSayisi(liste: readonly DofAlanlari[], bugun: string): { n: number; kotu: boolean } {
  return { n: liste.filter((x) => x.durum !== KAPALI).length, kotu: liste.some((c) => gecikti(c, bugun)) };
}

export const YAS_ARALIKLARI = ['0–30', '31–60', '61–90', '90+'] as const;

// Açık DÖF yaşlandırma: açılıştan bu yana geçen gün.
export function yaslandirma(liste: readonly DofAlanlari[], bugun: string): { etiket: string; deger: number; ton?: 'uyari' | 'hata' }[] {
  const acik = liste.filter((c) => c.durum !== KAPALI);
  const sinir: [number, number][] = [[0, 30], [31, 60], [61, 90], [91, Infinity]];
  return sinir.map(([a, z], i) => {
    const deger = acik.filter((c) => { const g = gunFarki(c.acilis, bugun); const k = g === null ? null : -g; return k !== null && k >= a && k <= z; }).length;
    const etiket = YAS_ARALIKLARI[i] ?? '';
    return i === 2 ? { etiket, deger, ton: 'uyari' as const } : i === 3 ? { etiket, deger, ton: 'hata' as const } : { etiket, deger };
  });
}

// Açık DÖF'lerin bulunduğu 8D adımı.
export function adimDagilimi(liste: readonly DofAlanlari[]): { etiket: string; deger: number }[] {
  const acik = liste.filter((c) => c.durum !== KAPALI);
  return Array.from({ length: 9 }, (_, i) => ({ etiket: i ? `D${i}` : 'Başlamadı', deger: acik.filter((c) => adimSayisi(c) === i).length }));
}

export const etkinlikTonu = (e: string | undefined): KmTon => (e === 'Etkin' ? 'iyi' : e?.startsWith('Etkin değil') ? 'kotu' : '');
export const durumTonu = (c: DofAlanlari, bugun: string): KmTon => (c.durum === KAPALI ? 'iyi' : gecikti(c, bugun) ? 'kotu' : 'uyari');
