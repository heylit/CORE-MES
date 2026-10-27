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
  // Kendi gönderim kuyruğu olan modülün (Arkon) bu cihazda bekleyen kaydı: sonucu bilinmeyen değildir, kuyruk bağlantı
  // gelince aynı kimlikle gönderir. Bu kayıtlar yazma isteğinde sayılmaz (`arkaPlan`), modül sayıyı buraya bildirir.
  kuyrukta: number;
  // Kuyruktan çıkıp sunucuya ulaşan kayıt; şerit kapanınca sıfırlanır.
  ulasan: number;
  // Kopukluk bitti ve henüz kapatılmadı.
  geriGeldi: boolean;
}

const BASLANGIC: BaglantiDurumu = { kopuk: false, bilinmeyenYazma: 0, kuyrukta: 0, ulasan: 0, geriGeldi: false };

let durum: BaglantiDurumu = BASLANGIC;
const bilinmeyenler = new Set<string>();
const dinleyiciler = new Set<() => void>();
let kimliksizSayac = 0;
// Kaynak adı -> o kaynağı bildiren her bağlantının sayısı. Aynı modülün kuyruğunu ekranda birden çok parça bildirebilir;
// kuyruk tektir, kaynak başına en büyüğü alınır.
const kuyruklar = new Map<string, Map<number, number>>();
let kuyrukSayac = 0;

function kuyruktaSay(): number {
  let toplam = 0;
  for (const bildirenler of kuyruklar.values()) toplam += Math.max(0, ...bildirenler.values());
  return toplam;
}

function yaz(yeni: Partial<BaglantiDurumu>): void {
  const sonraki = { ...durum, ...yeni, bilinmeyenYazma: bilinmeyenler.size, kuyrukta: kuyruktaSay() };
  if ((Object.keys(sonraki) as (keyof BaglantiDurumu)[]).every((k) => sonraki[k] === durum[k])) return;
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

// Modülün gönderim kuyruğu. `bildir` bekleyen sayısını verir; sayı düşerse düşen kayıt sunucuya ulaşmıştır (kuyruk
// kaydı ancak sunucu cevap verince bırakır; reddedileni modül ayrıca bildirir). `birak` ekran kapanınca çağrılır.
export function kuyrukKaynagi(kaynak: string): { bildir(bekleyen: number): void; birak(): void } {
  const anahtar = ++kuyrukSayac;
  return {
    bildir(bekleyen) {
      const onceki = durum.kuyrukta;
      const bildirenler = kuyruklar.get(kaynak) ?? new Map<number, number>();
      bildirenler.set(anahtar, Math.max(0, bekleyen));
      kuyruklar.set(kaynak, bildirenler);
      const simdi = kuyruktaSay();
      yaz(simdi < onceki ? { ulasan: durum.ulasan + onceki - simdi } : {});
    },
    birak() {
      const bildirenler = kuyruklar.get(kaynak);
      bildirenler?.delete(anahtar);
      if (bildirenler?.size === 0) kuyruklar.delete(kaynak);
      yaz({});
    },
  };
}

// Kullanıcı şeridi kapattı: bilinmeyenleri kendisi denetleyecek.
export function bildirimiKapat(): void {
  bilinmeyenler.clear();
  yaz({ geriGeldi: false, ulasan: 0 });
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
  kuyruklar.clear();
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
