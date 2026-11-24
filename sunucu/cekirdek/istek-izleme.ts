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
// Açılışta modüller yüklenir, göç ve ilk işler koşar: ana hat o sırada normal olarak uzun meşguldür. Bu süre içindeki gecikme
// takılma sayılmaz (her yeniden başlatmada sahte "sunucu takıldı" olayı düşmesin).
export const TAKILMA_ISINMA_MS = 30_000;

export function takilmaIzleyiciBaslat(isinmaMs: number = TAKILMA_ISINMA_MS): () => void {
  const baslangic = Date.now();
  let beklenen = baslangic + TAKILMA_OLCUM_ARALIGI_MS;
  const zamanlayici = setInterval(() => {
    const simdi = Date.now();
    const gecikme = simdi - beklenen;
    beklenen = simdi + TAKILMA_OLCUM_ARALIGI_MS;
    if (gecikme < ayar.takilmaEsikMs || simdi - baslangic < isinmaMs) return;
    takilmalar.push({ an: simdi, takilmaMs: gecikme, suren: surenIstekler(simdi), sonBiten });
    if (takilmalar.length > AZAMI_TAKILMA) takilmalar.shift();
  }, TAKILMA_OLCUM_ARALIGI_MS);
  zamanlayici.unref();
  return () => { clearInterval(zamanlayici); };
}

export function izlemeyiSifirla(): void {
  suren.clear();
  ekranIstekleri.clear();
  denemeler.clear();
  seriler.clear();
  takilmalar.length = 0;
  sonBiten = null;
  ayar = { ...VARSAYILAN_IZLEME_AYARI };
}

// Ekran başına otomatik yenileme yükü (3668 B): istemci hangi ekranda olduğunu `x-tc-ekran` başlığıyla bildirirse sayılır; başlıksız
// istek "bilinmiyor"dur. Son bir dakikanın sayımı bellekte; sorgu dizgesi ve kimlik taşımaz (yalnız ilk yol parçası).
export const EKRAN_BILINMIYOR = 'bilinmiyor';
const EKRAN_PENCERESI_MS = 60_000;
const AZAMI_EKRAN = 100;
interface EkranIstegi { an: number; kisiId: number | null }
const ekranIstekleri = new Map<string, EkranIstegi[]>();

// Başlık değeri güvenilmez: yalnız küçük harf, rakam ve tire içeren, en çok 40 karakterlik tek yol parçası kabul edilir.
export function ekranAdiTemizle(deger: unknown): string {
  if (typeof deger !== 'string') return EKRAN_BILINMIYOR;
  const parca = deger.trim().replace(/^\/+/, '').split(/[/?#]/, 1)[0] ?? '';
  return /^[a-z0-9-]{1,40}$/.test(parca) ? parca : EKRAN_BILINMIYOR;
}

export function ekranIstegiSay(ekran: string, kisiId: number | null, simdi: number = Date.now()): void {
  let liste = ekranIstekleri.get(ekran);
  if (liste === undefined) {
    if (ekranIstekleri.size >= AZAMI_EKRAN) return;
    liste = [];
    ekranIstekleri.set(ekran, liste);
  }
  liste.push({ an: simdi, kisiId });
  // Pencerenin dışına düşenler, listeyi büyütmeden atılır.
  if (liste.length > 1 && simdi - (liste[0]?.an ?? simdi) > EKRAN_PENCERESI_MS) {
    const ilk = liste.findIndex((i) => simdi - i.an <= EKRAN_PENCERESI_MS);
    liste.splice(0, ilk === -1 ? liste.length : ilk);
  }
}

export interface EkranYuku { ekran: string; istekDk: number; kisiSayisi: number }

export function ekranYukunuAl(simdi: number = Date.now()): EkranYuku[] {
  const cikti: EkranYuku[] = [];
  for (const [ekran, liste] of ekranIstekleri) {
    const son = liste.filter((i) => simdi - i.an <= EKRAN_PENCERESI_MS);
    if (son.length === 0) { ekranIstekleri.delete(ekran); continue; }
    cikti.push({ ekran, istekDk: son.length, kisiSayisi: new Set(son.map((i) => i.kisiId).filter((k) => k !== null)).size });
  }
  return cikti.sort((a, b) => b.istekDk - a.istekDk);
}
