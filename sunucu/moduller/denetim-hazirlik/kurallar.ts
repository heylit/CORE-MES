import { AZAMI_SINIR } from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import type { Filtre, OlcuAletleriCevabi, Sira } from '#paylasilan/sozlesme/denetim-hazirlik.ts';

// Belge deposunun kuralları: yol, kişiye özel alan, birleştirme, sorgu, kilit, oda. Saf; veritabanı ve saat yok.

export type Veri = Record<string, unknown>;
export interface DepoBelgesi { yol: string; kimlik: string; veri: Veri; surum: number }

export const parcalar = (yol: string): string[] => yol.split('/');
export const ustYolu = (yol: string): string => parcalar(yol).slice(0, -1).join('/');
export const sonParca = (yol: string): string => parcalar(yol).at(-1) ?? '';

// Kişiye özel alan: `data/users/<kişi>/...` yalnız o kişiye açıktır (prototiplerin sözleşmesi). `data/users`un kendisi
// kimseye açık değildir: kişiler birbirinin kimliğini oradan listeleyemez.
export function erisebilirMi(yol: string, kisiId: number): boolean {
  const p = parcalar(yol);
  if (p[0] !== 'data' || p.length < 2 || p[1] !== 'users') return true;
  return p.length >= 3 && p[2] === String(kisiId);
}

// Genel depo ucu yalnız prototipin kalıcı yerel depo anahtarlarına açıktır (istemcideki `YEREL.onekler` ile aynı): prototip
// başka koleksiyon kullanmaz, uç başka yola yazma ve okuma kapısı olmasın. Kök ortak (`yerel`) ya da kişisel
// (`data/users/<kişi>/yerel/anahtarlar`); anahtar köprüde kodlanır, öneklerde kodlanan karakter yoktur.
export const YEREL_ONEKLERI: readonly string[] = ['kalite-denetim'];
const KISISEL_KOK_UZUNLUGU = 5;

export function izinliKoleksiyonMu(koleksiyon: string): boolean {
  const p = parcalar(koleksiyon);
  if (p.length === 1) return p[0] === 'yerel';
  return p.length === KISISEL_KOK_UZUNLUGU && p[0] === 'data' && p[1] === 'users' && p[3] === 'yerel' && p[4] === 'anahtarlar';
}

export function izinliBelgeMi(yol: string): boolean {
  const anahtar = sonParca(yol);
  return izinliKoleksiyonMu(ustYolu(yol)) && YEREL_ONEKLERI.some((o) => anahtar.startsWith(o));
}

// Ortak kayıt: prototipin yerel deposu (`yerel/<anahtar>`) bütün yazarların birlikte düzenlediği tek durumdur; aynı anda
// yazmayı sürüm denetimi korur. Öteki her var olan belgeyi yalnız oluşturan kişi değiştirir ya da siler (kişiye özel alan
// zaten yalnız sahibine açıktır).
export const ORTAK_KOK = 'yerel';
export function degistirebilirMi(yol: string, kisiId: number, olusturanKisiId: number | null): boolean {
  if (parcalar(yol)[0] === ORTAK_KOK) return true;
  return olusturanKisiId === kisiId;
}

const duzNesneMi = (d: unknown): d is Veri => d !== null && typeof d === 'object' && !Array.isArray(d);

// İç içe nesneler birleşir; dizi ve öteki her değer alanı olduğu gibi değiştirir. Girdiler değişmez.
export function derinBirlestir(hedef: Veri, yama: Veri): Veri {
  const sonuc: Veri = { ...hedef };
  for (const [anahtar, deger] of Object.entries(yama)) {
    const eski = sonuc[anahtar];
    sonuc[anahtar] = duzNesneMi(deger) && duzNesneMi(eski) ? derinBirlestir(eski, deger) : deger;
  }
  return sonuc;
}

// Tür sırası: null < mantıksal < sayı < metin < dizi < nesne. Aynı türde doğal sıra; dizi ve nesne metniyle.
function turSirasi(d: unknown): number {
  if (d === null) return 0;
  if (typeof d === 'boolean') return 1;
  if (typeof d === 'number') return 2;
  if (typeof d === 'string') return 3;
  if (Array.isArray(d)) return 4;
  return 5;
}

export function karsilastir(a: unknown, b: unknown): number {
  const ta = turSirasi(a);
  const tb = turSirasi(b);
  if (ta !== tb) return ta - tb;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  const ja = JSON.stringify(a);
  const jb = JSON.stringify(b);
  return ja < jb ? -1 : ja > jb ? 1 : 0;
}

const esitMi = (a: unknown, b: unknown): boolean => turSirasi(a) === turSirasi(b) && karsilastir(a, b) === 0;

// Alanı olmayan belge hiçbir koşula uymaz (eşit değil koşulu dahil).
export function uyarMi(veri: Veri, f: Filtre): boolean {
  if (!Object.hasOwn(veri, f.alan)) return false;
  const d = veri[f.alan];
  switch (f.islec) {
    case '==': return esitMi(d, f.deger);
    case '!=': return !esitMi(d, f.deger);
    case '<': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) < 0;
    case '<=': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) <= 0;
    case '>': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) > 0;
    case '>=': return turSirasi(d) === turSirasi(f.deger) && karsilastir(d, f.deger) >= 0;
    case 'in': return Array.isArray(f.deger) && f.deger.some((x) => esitMi(d, x));
    case 'not-in': return Array.isArray(f.deger) && !f.deger.some((x) => esitMi(d, x));
    case 'array-contains': return Array.isArray(d) && d.some((x) => esitMi(x, f.deger));
  }
}

export interface SorguKosulu { filtreler?: readonly Filtre[]; sira?: Sira; sinir?: number }

// Sırasız sorgu kimliğe göre artan döner. Sıralama alanı olmayan belge sona düşer; eşitlikte kimlik belirler.
export function sorgula<T extends DepoBelgesi>(belgeler: readonly T[], kosul: SorguKosulu): T[] {
  const uyan = belgeler.filter((b) => (kosul.filtreler ?? []).every((f) => uyarMi(b.veri, f)));
  const kimlikle = (a: T, b: T): number => (a.kimlik < b.kimlik ? -1 : a.kimlik > b.kimlik ? 1 : 0);
  const sira = kosul.sira;
  const sirali = [...uyan].sort((a, b) => {
    if (sira === undefined) return kimlikle(a, b);
    const varA = Object.hasOwn(a.veri, sira.alan);
    const varB = Object.hasOwn(b.veri, sira.alan);
    if (varA !== varB) return varA ? -1 : 1;
    const fark = varA ? karsilastir(a.veri[sira.alan], b.veri[sira.alan]) : 0;
    return (sira.yon === 'desc' ? -fark : fark) || kimlikle(a, b);
  });
  return sirali.slice(0, Math.min(kosul.sinir ?? AZAMI_SINIR, AZAMI_SINIR));
}

// Kilit kısa süreli ve işbirliğine dayalıdır: süresi geçmiş ya da aynı sahibin kilidi yeniden alınır.
export function kilitAlinirMi(mevcut: { sahip: string | null; bitis: number | null }, sahip: string, simdi: number): boolean {
  return mevcut.sahip === null || mevcut.bitis === null || mevcut.bitis <= simdi || mevcut.sahip === sahip;
}

// Oda: sayfası o an açık olanlar. Durum yaması birleşir; null değer alanı siler. Son görülmeden bu yana süre geçen düşer.
export const ODA_SURESI_MS = 45_000;
export interface OdaKaydi { durum: Veri; guncellendi: number }

export function durumYamala(eski: Veri, yama: Veri): Veri {
  const yeni: Veri = { ...eski };
  for (const [anahtar, deger] of Object.entries(yama)) {
    if (deger === null) delete yeni[anahtar];
    else yeni[anahtar] = deger;
  }
  return yeni;
}

export function canliEsler(oda: ReadonlyMap<number, OdaKaydi>, simdi: number): { kisiId: number; durum: Veri; guncellendi: number }[] {
  return [...oda.entries()]
    .filter(([, k]) => simdi - k.guncellendi < ODA_SURESI_MS)
    .map(([kisiId, k]) => ({ kisiId, durum: k.durum, guncellendi: k.guncellendi }))
    .sort((a, b) => a.kisiId - b.kisiId);
}

// Boş depoda prototipin açılabilmesi için gereken yapısal belgeler (gerçek veri değil, prototipin varsayılanları).
export interface BaslangicBelgesi { yol: string; veri: Veri }
export interface KurucuKisi { id: number; ad: string }
export const KURULUM_ISARETI: string | null = null;

// Prototip yalnız yerel deposunu kullanır; başlangıç belgesi gerekmez.
export function baslangicBelgeleri(kisi: KurucuKisi, simdiMs: number): BaslangicBelgesi[] {
  void kisi;
  void simdiMs;
  return [];
}

// 329 a: ölçü aletlerinin tek kaynağı Kalibrasyon modülüdür; prototipin kalibrasyon sekmesindeki cihaz listesi ondan salt okunur
// gelir. Kalibrasyonda karşılığı olmayan alanlar (marka, seri, çözünürlük, sorumlu, laboratuvar, kabul, kalibrasyon türü) hiç
// gönderilmez. Vade, prototipin "elle girilen sonraki tarih" alanına yazılır: durum Kalibrasyonun hesabıyla aynı çıkar.
export interface OlcuAleti {
  id: number; no: string; tur: string; ad: string | null; olcmeAraligi: string | null; yer: string | null; periyotGun: number;
  kullanimDisi: boolean; sonKalibrasyon: string | null; vade: string | null;
  kayitlar: readonly { tarih: string; sonuc: 'uygun' | 'uygunsuz'; sertifikaNo: string | null; aciklama: string | null }[];
}
export const OLCU_ALETI_KAYIT_ADEDI = 20;

export function olcuAletleriKaydi(aletler: readonly OlcuAleti[]): OlcuAletleriCevabi['aletler'] {
  return aletler.map((a) => {
    // Kayıtlar eskiden yeniye gelir; prototipin geçmişi yeniden eskiye tutulur.
    const hist = [...a.kayitlar].reverse().map((k) => ({
      date: k.tarih, res: k.sonuc === 'uygun' ? 'uygun' as const : 'red' as const, lab: '', cert: k.sertifikaNo ?? '', note: k.aciklama ?? '',
    }));
    return {
      id: `kal-${String(a.id)}`,
      no: a.no,
      ad: a.ad ?? a.tur,
      yer: a.yer ?? '',
      aralik: a.olcmeAraligi ?? '',
      periyotGun: a.periyotGun,
      per: a.periyotGun / 30,
      last: a.sonKalibrasyon ?? '',
      nx: a.vade ?? '',
      st: a.kullanimDisi ? 'disi' as const : 'aktif' as const,
      res: hist[0]?.res ?? '',
      cert: hist[0]?.cert ?? '',
      hist,
    };
  });
}
