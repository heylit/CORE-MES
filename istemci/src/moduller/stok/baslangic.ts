// Başlangıç stoğu (3129, 3134 a): dosyadan okunan satırların düzenleme modeli. Saf. Denetimi sunucu yapar (her değişiklikte son satırlarla);
// burada yalnız eşleme, hücre düzeltmesi, hariç tutma ve düzeltme listesi vardır. Hiçbir kural istemcide karar vermez.
import type { BaslangicDuzeltmesi, BaslangicSatirDenetimi, BaslangicSatirGirdisi } from '#paylasilan/sozlesme/stok.ts';
import { alanSutunu, hucreMetni, type EslemeAlani, type SutunEslemesi } from '../../ortak/excel/esleme.ts';
import { hucreCoz, type Hucre } from '../../ortak/excel/kurallar.ts';

export const BASLANGIC_ALAN_ANAHTARLARI = ['malzemeKodu', 'miktar', 'konumKodu', 'lotNo', 'tedarikciPartiNo', 'dokumNo', 'sertifikaNo', 'tedarikci', 'sonKullanma', 'not'] as const;
export type BaslangicAlani = (typeof BASLANGIC_ALAN_ANAHTARLARI)[number];

// Şablon başlıkları da bu adlardır; zorunlu üç alan eşlenmeden ilerlenmez.
export const BASLANGIC_ALANLARI: readonly (EslemeAlani & { anahtar: BaslangicAlani })[] = [
  { anahtar: 'malzemeKodu', baslik: 'Malzeme kodu', zorunlu: true, esanlamlar: ['stok kodu', 'malzeme', 'malzeme no', 'kart kodu', 'urun kodu', 'kod', 'stok no'] },
  { anahtar: 'miktar', baslik: 'Miktar', zorunlu: true, esanlamlar: ['mevcut', 'stok miktari', 'sayilan', 'sayim', 'bakiye', 'adet', 'stok'] },
  { anahtar: 'konumKodu', baslik: 'Konum kodu', zorunlu: true, esanlamlar: ['konum', 'raf', 'raf goz', 'goz', 'raf kodu', 'yer', 'lokasyon', 'adres'] },
  { anahtar: 'lotNo', baslik: 'Lot no', esanlamlar: ['lot', 'lot numarasi'] },
  { anahtar: 'tedarikciPartiNo', baslik: 'Tedarikçi parti no', esanlamlar: ['tedarikci partisi', 'parti no', 'parti'] },
  { anahtar: 'dokumNo', baslik: 'Döküm no', esanlamlar: ['dokum', 'sarj no', 'heat no'] },
  { anahtar: 'sertifikaNo', baslik: 'Sertifika no', esanlamlar: ['sertifika'] },
  { anahtar: 'tedarikci', baslik: 'Tedarikçi', esanlamlar: ['firma', 'satici'] },
  { anahtar: 'sonKullanma', baslik: 'Son kullanma', esanlamlar: ['skt', 'son kullanma tarihi', 'miad'] },
  { anahtar: 'not', baslik: 'Not', esanlamlar: ['aciklama', 'notlar'] },
];

export const BASLANGIC_EN_UZUN: Record<BaslangicAlani, number> = {
  malzemeKodu: 60, miktar: 30, konumKodu: 60, lotNo: 40, tedarikciPartiNo: 40, dokumNo: 40, sertifikaNo: 40, tedarikci: 60, sonKullanma: 20, not: 120,
};

export type AlanDegerleri = Record<BaslangicAlani, string>;
export interface Secim { id: number; kod: string; toplu: boolean }

export interface BaslangicSatiri {
  sira: number;
  // Dosyada okunan (biçimi düzeltilmiş: virgüllü ondalık, gg.aa.yyyy tarih) ve şimdiki değer.
  dosya: AlanDegerleri;
  deger: AlanDegerleri;
  // Bulunamayan koda seçilen kart ya da konum; kod hücresi o zaman yok sayılır.
  malzeme: Secim | null;
  konum: Secim | null;
  haric: boolean;
}

const bosDegerler = (): AlanDegerleri => Object.fromEntries(BASLANGIC_ALAN_ANAHTARLARI.map((a) => [a, ''])) as AlanDegerleri;

// Dosyadaki değer sunucunun okuduğu biçime çevrilir: miktar "12,5" ya da 12.5 → "12.5"; tarih gg.aa.yyyy ya da Excel tarihi → YYYY-AA-GG.
// Çevrilemeyen değer olduğu gibi kalır; sunucu satırda hatasını söyler.
export function alanDegeri(alan: BaslangicAlani, h: Hucre): string {
  if (alan === 'miktar') {
    if (typeof h === 'number') return hucreMetni(h);
    const m = hucreMetni(h).replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(m)) return m.replace(/\./g, '').replace(',', '.');
    return /^\d+,\d+$/.test(m) ? m.replace(',', '.') : m;
  }
  if (alan === 'sonKullanma') {
    const c = hucreCoz({ anahtar: 'sonKullanma', baslik: 'Son kullanma', tur: 'tarih' }, h);
    return typeof c.deger === 'string' ? c.deger : hucreMetni(h);
  }
  return hucreMetni(h).slice(0, BASLANGIC_EN_UZUN[alan]);
}

export interface HamSatir { no: number; hucreler: readonly Hucre[] }

export function satirlariKur(satirlar: readonly HamSatir[], esleme: SutunEslemesi): BaslangicSatiri[] {
  return satirlar.map((s) => {
    const d = bosDegerler();
    for (const a of BASLANGIC_ALAN_ANAHTARLARI) {
      const i = alanSutunu(esleme, a);
      if (i !== null) d[a] = alanDegeri(a, s.hucreler[i] ?? null);
    }
    return { sira: s.no, dosya: d, deger: { ...d }, malzeme: null, konum: null, haric: false };
  });
}

// Sunucuya giden satır: boş alan gitmez (gövde 2000 satırda küçük kalsın), seçilen kart ve konum kimlikle gider.
export function govdeSatiri(s: BaslangicSatiri): BaslangicSatirGirdisi {
  const g: BaslangicSatirGirdisi = { sira: s.sira, miktar: s.deger.miktar };
  for (const a of BASLANGIC_ALAN_ANAHTARLARI) {
    if (a === 'miktar' || s.deger[a].trim() === '') continue;
    if (a === 'malzemeKodu' && s.malzeme) continue;
    if (a === 'konumKodu' && s.konum) continue;
    g[a] = s.deger[a];
  }
  if (s.malzeme) g.malzemeId = s.malzeme.id;
  if (s.konum) g.konumId = s.konum.id;
  return g;
}

export const gidenSatirlar = (satirlar: readonly BaslangicSatiri[]): BaslangicSatirGirdisi[] => satirlar.filter((s) => !s.haric).map(govdeSatiri);

const kisalt = (m: string): string | null => (m === '' ? null : m.slice(0, 120));

// Belgeyle saklanan iz (yükleyenin bildirdiği): satır, alan, dosyadaki ve girilen değer, toplu eşleme mi.
export function duzeltmeler(satirlar: readonly BaslangicSatiri[]): BaslangicDuzeltmesi[] {
  const l: BaslangicDuzeltmesi[] = [];
  for (const s of satirlar) {
    if (s.haric) { l.push({ sira: s.sira, alan: 'haric', dosyada: null, girilen: null, toplu: false }); continue; }
    if (s.malzeme) l.push({ sira: s.sira, alan: 'malzeme', dosyada: kisalt(s.dosya.malzemeKodu), girilen: kisalt(s.malzeme.kod), toplu: s.malzeme.toplu });
    else if (s.deger.malzemeKodu !== s.dosya.malzemeKodu) l.push({ sira: s.sira, alan: 'malzeme', dosyada: kisalt(s.dosya.malzemeKodu), girilen: kisalt(s.deger.malzemeKodu), toplu: false });
    if (s.konum) l.push({ sira: s.sira, alan: 'konum', dosyada: kisalt(s.dosya.konumKodu), girilen: kisalt(s.konum.kod), toplu: s.konum.toplu });
    else if (s.deger.konumKodu !== s.dosya.konumKodu) l.push({ sira: s.sira, alan: 'konum', dosyada: kisalt(s.dosya.konumKodu), girilen: kisalt(s.deger.konumKodu), toplu: false });
    for (const a of BASLANGIC_ALAN_ANAHTARLARI) {
      if (a === 'malzemeKodu' || a === 'konumKodu' || s.deger[a] === s.dosya[a]) continue;
      l.push({ sira: s.sira, alan: a, dosyada: kisalt(s.dosya[a]), girilen: kisalt(s.deger[a]), toplu: false });
    }
  }
  return l;
}

export const hucreDuzeltmeSayisi = (satirlar: readonly BaslangicSatiri[]): number => duzeltmeler(satirlar).filter((d) => d.alan !== 'haric').length;

// Bulunamayan kod bir kez seçilir, aynı koddaki bütün (hariç tutulmamış, seçimsiz) satırlara uygulanır.
const kodAnahtari = (k: string): string => k.trim().toLocaleUpperCase('tr-TR');
export function kodaUygula(satirlar: readonly BaslangicSatiri[], tur: 'malzeme' | 'konum', kod: string, secim: { id: number; kod: string }, sira?: number): BaslangicSatiri[] {
  const alan = tur === 'malzeme' ? 'malzemeKodu' : 'konumKodu';
  const k = kodAnahtari(kod);
  return satirlar.map((s) => {
    const uyar = sira === undefined ? kodAnahtari(s.deger[alan]) === k && s[tur] === null : s.sira === sira;
    return uyar ? { ...s, [tur]: { ...secim, toplu: sira === undefined } } : s;
  });
}

export function secimiBirak(satirlar: readonly BaslangicSatiri[], tur: 'malzeme' | 'konum', sira: number): BaslangicSatiri[] {
  return satirlar.map((s) => (s.sira === sira ? { ...s, [tur]: null } : s));
}

export function hucreDegistir(satirlar: readonly BaslangicSatiri[], sira: number, alan: BaslangicAlani, deger: string): BaslangicSatiri[] {
  const v = alan === 'miktar' ? alanDegeri('miktar', deger) : alan === 'sonKullanma' ? alanDegeri('sonKullanma', deger) : deger.trim().slice(0, BASLANGIC_EN_UZUN[alan]);
  return satirlar.map((s) => (s.sira === sira ? { ...s, deger: { ...s.deger, [alan]: v }, ...(alan === 'malzemeKodu' ? { malzeme: null } : alan === 'konumKodu' ? { konum: null } : {}) } : s));
}

export const haricDegistir = (satirlar: readonly BaslangicSatiri[], sira: number): BaslangicSatiri[] =>
  satirlar.map((s) => (s.sira === sira ? { ...s, haric: !s.haric } : s));

export type SatirDurumu = 'eklenecek' | 'uyarili' | 'hatali' | 'haric' | 'bekliyor';
export const satirDurumu = (s: BaslangicSatiri, d: BaslangicSatirDenetimi | undefined): SatirDurumu => (s.haric ? 'haric' : d?.durum ?? 'bekliyor');

export interface Sayilar { eklenecek: number; uyarili: number; hatali: number; haric: number; bekliyor: number }
export function sayilar(satirlar: readonly BaslangicSatiri[], denetim: ReadonlyMap<number, BaslangicSatirDenetimi>): Sayilar {
  const say: Sayilar = { eklenecek: 0, uyarili: 0, hatali: 0, haric: 0, bekliyor: 0 };
  for (const s of satirlar) say[satirDurumu(s, denetim.get(s.sira))] += 1;
  return say;
}

export interface EslenecekKod { tur: 'malzeme' | 'konum'; kod: string; satir: number }
// Üst panel: kartı ya da konumu bulunamayan kodlar, kod başına bir kez (boş kod panelde değil, satırda düzeltilir).
export function eslenecekKodlar(satirlar: readonly BaslangicSatiri[], denetim: ReadonlyMap<number, BaslangicSatirDenetimi>): EslenecekKod[] {
  const sayac = new Map<string, EslenecekKod>();
  for (const s of satirlar) {
    const d = denetim.get(s.sira);
    if (s.haric || !d) continue;
    const ekle = (tur: 'malzeme' | 'konum', kod: string) => {
      if (kod.trim() === '') return;
      const a = `${tur}\n${kodAnahtari(kod)}`;
      const x = sayac.get(a);
      if (x) x.satir += 1; else sayac.set(a, { tur, kod: kod.trim(), satir: 1 });
    };
    if (d.malzeme === null && s.malzeme === null) ekle('malzeme', s.deger.malzemeKodu);
    if (d.konum === null && s.konum === null) ekle('konum', s.deger.konumKodu);
  }
  return [...sayac.values()];
}

export const yuklenebilir = (say: Sayilar): boolean => say.hatali === 0 && say.bekliyor === 0 && say.eklenecek + say.uyarili > 0;
