// Sağlık izlemesi (3668-1): süren istekler, tekrar eden yazma denemeleri ve ana hattın takılma anları. Yalnız bellekte tutulur;
// kalıcı kayıt sağlık modülündedir (çekirdek modül ithal etmez): modül buradan okur ve tamponları boşaltır.
// Sorgu dizgesi hiçbir kayda girmez: adres sorgusuzdur.

export interface IzlemeAyari {
  // Aynı kişi + yöntem + adres bu pencerede en az `tekrarEsik` kez gelirse seri sayılır.
  tekrarPencereMs: number;
  tekrarEsik: number;
  takilmaEsikMs: number;
}

export const VARSAYILAN_IZLEME_AYARI: Readonly<IzlemeAyari> = { tekrarPencereMs: 120_000, tekrarEsik: 3, takilmaEsikMs: 200 };

let ayar: IzlemeAyari = { ...VARSAYILAN_IZLEME_AYARI };

// Ekrandan değiştirilen eşikleri sağlık modülü yükler; verilmeyen alan değişmez.
export function izlemeAyariniKur(yeni: Partial<IzlemeAyari>): void {
  ayar = { ...ayar, ...yeni };
}

export const izlemeAyari = (): Readonly<IzlemeAyari> => ayar;

// Yalnız yazma yöntemleri tekrar sayılır: GET'in otomatik yenilemesi tekrar denemesi değildir.
const YAZMA_YONTEMLERI = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const AZAMI_SUREN_YAS_MS = 600_000;
const AZAMI_SERI = 200;
const AZAMI_ANAHTAR = 5000;
const AZAMI_TAKILMA = 50;
export const HATA_ILETISI_AZAMI = 200;

export interface SurenIstek {
  yontem: string;
  adres: string;
  kisiId: number | null;
  sureMs: number;
}

interface Suren { yontem: string; adres: string; kisi: () => number | null; basla: number }

const suren = new Map<number, Suren>();
let sonKimlik = 0;

export function istekBasladi(yontem: string, adres: string, kisi: () => number | null, simdi: number = Date.now()): number {
  sonKimlik += 1;
  suren.set(sonKimlik, { yontem, adres, kisi, basla: simdi });
  return sonKimlik;
}

export interface BitenIstek {
  yontem: string;
  adres: string;
  kisiId: number | null;
  durum: number;
  sureMs: number;
  hata: string | null;
}

let sonBiten: (BitenIstek & { an: number }) | null = null;

export function istekBitti(kimlik: number, biten: BitenIstek, simdi: number = Date.now()): void {
  suren.delete(kimlik);
  sonBiten = { ...biten, an: simdi };
  if (biten.kisiId !== null && YAZMA_YONTEMLERI.has(biten.yontem)) tekrarKaydet(biten, simdi);
}

// Yaşı sınırı aşan kayıt (kapanmamış, bırakılmış bağlantı) listeden düşer: harita sızmasın.
export function surenIstekler(simdi: number = Date.now()): SurenIstek[] {
  const liste: SurenIstek[] = [];
  for (const [k, s] of suren) {
    if (simdi - s.basla > AZAMI_SUREN_YAS_MS) { suren.delete(k); continue; }
    liste.push({ yontem: s.yontem, adres: s.adres, kisiId: s.kisi(), sureMs: Math.max(0, simdi - s.basla) });
  }
  return liste.sort((a, b) => b.sureMs - a.sureMs);
}

export interface TekrarSerisi {
  kisiId: number;
  yontem: string;
  adres: string;
  sayi: number;
  hatali: number;
  // 409 (çakışma) yanıtı sayısı; çakışma serileri bununla süzülür.
  cakisma: number;
  sonDurum: number;
  sonHata: string | null;
  ilkAn: number;
  sonAn: number;
}

interface Deneme { an: number; durum: number }
const denemeler = new Map<string, Deneme[]>();
const seriler = new Map<string, TekrarSerisi>();

function tekrarKaydet(b: BitenIstek, an: number): void {
  if (b.kisiId === null) return;
  const anahtar = `${String(b.kisiId)}|${b.yontem}|${b.adres}`;
  const liste = (denemeler.get(anahtar) ?? []).filter((d) => an - d.an <= ayar.tekrarPencereMs);
  liste.push({ an, durum: b.durum });
  denemeler.set(anahtar, liste);
  if (denemeler.size > AZAMI_ANAHTAR) {
    for (const [k, l] of denemeler) if (an - (l[l.length - 1]?.an ?? 0) > ayar.tekrarPencereMs) denemeler.delete(k);
  }
  if (liste.length < ayar.tekrarEsik) return;
  const ilk = liste[0];
  if (ilk === undefined) return;
  const seri: TekrarSerisi = {
    kisiId: b.kisiId, yontem: b.yontem, adres: b.adres, sayi: liste.length,
    hatali: liste.filter((d) => d.durum >= 400).length, cakisma: liste.filter((d) => d.durum === 409).length,
    sonDurum: b.durum, sonHata: b.hata, ilkAn: ilk.an, sonAn: an,
  };
  // Aynı pencere tek kayıttır: seri büyüdükçe yeni satır açılmaz, mevcut güncellenir.
  seriler.set(anahtar, seri);
  if (seriler.size > AZAMI_SERI) {
    const en = seriler.keys().next();
    if (en.done !== true) seriler.delete(en.value);
  }
}

// Serileri verir ve tamponu boşaltır: modül kalıcı kaydı yazar. Yeniden başlatmada boşaltılmamış seriler kaybolur.
export function tekrarSerileriniAl(): TekrarSerisi[] {
  const liste = [...seriler.values()];
  seriler.clear();
  return liste;
}

export interface TakilmaAni {
  an: number;
  takilmaMs: number;
  // Takılma anında süren istekler ve en son biten istek: takılmanın suçlusu bunlardan biridir.
  suren: SurenIstek[];
  sonBiten: (BitenIstek & { an: number }) | null;
}

const takilmalar: TakilmaAni[] = [];

export function takilmaAnlariniAl(): TakilmaAni[] {
  return takilmalar.splice(0, takilmalar.length);
}

export const TAKILMA_OLCUM_ARALIGI_MS = 50;

// Zamanlayıcı beklenenden geç çalışırsa ana hat o kadar bloklanmıştır. Süreç kapanırken zamanlayıcı tutulmaz.
export function takilmaIzleyiciBaslat(): () => void {
  let beklenen = Date.now() + TAKILMA_OLCUM_ARALIGI_MS;
  const zamanlayici = setInterval(() => {
    const simdi = Date.now();
    const gecikme = simdi - beklenen;
    beklenen = simdi + TAKILMA_OLCUM_ARALIGI_MS;
    if (gecikme < ayar.takilmaEsikMs) return;
    takilmalar.push({ an: simdi, takilmaMs: gecikme, suren: surenIstekler(simdi), sonBiten });
    if (takilmalar.length > AZAMI_TAKILMA) takilmalar.shift();
  }, TAKILMA_OLCUM_ARALIGI_MS);
  zamanlayici.unref();
  return () => { clearInterval(zamanlayici); };
}

export function izlemeyiSifirla(): void {
  suren.clear();
  denemeler.clear();
  seriler.clear();
  takilmalar.length = 0;
  sonBiten = null;
  ayar = { ...VARSAYILAN_IZLEME_AYARI };
}
