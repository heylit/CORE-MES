import { useEffect, useSyncExternalStore } from 'react';
import { vekilCevabiMi } from './vekil.ts';

// Sunucuya ulaşılabiliyor mu ve kopukken giden yazmalardan hangilerinin sonucu bilinmiyor. İstek katmanı (api.ts)
// her cevapta ve her ulaşılamamada buraya bildirir; kabuk şeridi buradan okur. Tarayıcının çevrim içi bilgisi VPN ve
// kurum ağında yanıltıcıdır (ağ var, sunucu yok): asıl ölçü sunucudan cevap gelip gelmediğidir.

export interface BaglantiDurumu {
  kopuk: boolean;
  // Kopukken gönderilmiş, sunucuya ulaşıp ulaşmadığı bilinmeyen yazma sayısı. Aynı istek kimliğiyle yeniden gönderilip
  // cevap alan yazma sayıdan düşer; kimliksiz yazma kullanıcı kapatana kadar sayılır (sunucuda olup olmadığı bilinmez).
  bilinmeyenYazma: number;
  // Kopukluk bitti ve henüz kapatılmadı.
  geriGeldi: boolean;
}

const BASLANGIC: BaglantiDurumu = { kopuk: false, bilinmeyenYazma: 0, geriGeldi: false };

let durum: BaglantiDurumu = BASLANGIC;
const bilinmeyenler = new Set<string>();
const dinleyiciler = new Set<() => void>();
let kimliksizSayac = 0;

function yaz(yeni: Partial<BaglantiDurumu>): void {
  const sonraki = { ...durum, ...yeni, bilinmeyenYazma: bilinmeyenler.size };
  if (sonraki.kopuk === durum.kopuk && sonraki.bilinmeyenYazma === durum.bilinmeyenYazma && sonraki.geriGeldi === durum.geriGeldi) return;
  durum = sonraki;
  for (const d of dinleyiciler) d();
}

// Sunucu bir cevap verdi (hata cevabı da olur): bağlantı var. Kimlikli yazmanın cevabı onun belirsizliğini kapatır.
export function cevapGeldi(istekKimligi?: string): void {
  if (istekKimligi !== undefined) bilinmeyenler.delete(istekKimligi);
  yaz(durum.kopuk ? { kopuk: false, geriGeldi: true } : {});
}

// Sunucuya ulaşılamadı. Yazma ise sonucu bilinmeyenlere eklenir: istek sunucuya varıp işlenmiş olabilir.
export function ulasilamadi(yazma: { istekKimligi?: string } | null): void {
  if (yazma !== null) bilinmeyenler.add(yazma.istekKimligi ?? `kimliksiz-${++kimliksizSayac}`);
  yaz({ kopuk: true, geriGeldi: false });
}

// Kopuk değilken süresi dolan yazma da belirsizdir; bağlantı durumunu değiştirmez (sunucu yavaş olabilir).
export function yazmaBelirsiz(istekKimligi?: string): void {
  bilinmeyenler.add(istekKimligi ?? `kimliksiz-${++kimliksizSayac}`);
  yaz({});
}

// Kullanıcı şeridi kapattı: bilinmeyenleri kendisi denetleyecek.
export function bildirimiKapat(): void {
  bilinmeyenler.clear();
  yaz({ geriGeldi: false });
}

// Bağlantı dönünce çağrılır: kopukken ekranda kalan veri bayattır, uygulama açık sorguları yeniden okutur.
export function baglantiDonusunuDinle(donunce: () => void): () => void {
  let kopuktu = durum.kopuk;
  return abone(() => {
    if (kopuktu && !durum.kopuk) donunce();
    kopuktu = durum.kopuk;
  });
}

export function baglantiDurumu(): BaglantiDurumu {
  return durum;
}

// Yalnız testler içindir.
export function baglantiSifirla(): void {
  bilinmeyenler.clear();
  durum = BASLANGIC;
  for (const d of dinleyiciler) d();
}

function abone(d: () => void): () => void {
  dinleyiciler.add(d);
  return () => { dinleyiciler.delete(d); };
}

export const YOKLAMA_ARALIGI_MS = 5000;
const YOKLAMA_SURESI_MS = 4000;

// Kopukken sunucu aralıkla yoklanır: ekranlar istek atmasa da bağlantının döndüğü görülür. Sağlık ucu açık ve hafiftir;
// sunucunun kendi cevabı (503 dahil) bağlantının döndüğünü gösterir, aradaki vekilin cevabı (sunucu kapalı) göstermez.
async function yokla(): Promise<void> {
  const kesici = new AbortController();
  const sayac = setTimeout(() => { kesici.abort(); }, YOKLAMA_SURESI_MS);
  try {
    const cevap = await fetch('/api/saglik', { cache: 'no-store', signal: kesici.signal });
    if (vekilCevabiMi(cevap.status, await cevap.text())) return;
    cevapGeldi();
  } catch {
    // Hâlâ ulaşılamıyor; durum zaten kopuk.
  } finally {
    clearTimeout(sayac);
  }
}

export function useBaglanti(): BaglantiDurumu {
  const anlik = useSyncExternalStore(abone, baglantiDurumu, baglantiDurumu);
  useEffect(() => {
    // Tarayıcı ağın gittiğini kesin bildirir; geldiğini bildirmesi sunucunun döndüğü demek değildir, yoklanır.
    const gitti = (): void => { ulasilamadi(null); };
    const geldi = (): void => { void yokla(); };
    window.addEventListener('offline', gitti);
    window.addEventListener('online', geldi);
    return () => {
      window.removeEventListener('offline', gitti);
      window.removeEventListener('online', geldi);
    };
  }, []);
  useEffect(() => {
    if (!anlik.kopuk) return undefined;
    const zamanlayici = setInterval(() => { void yokla(); }, YOKLAMA_ARALIGI_MS);
    return () => { clearInterval(zamanlayici); };
  }, [anlik.kopuk]);
  return anlik;
}
