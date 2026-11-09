// Excel ile toplu giriş (2627): sayfa tanımı, hücre çözümü ve önizleme planı. Saf; dosya okuma ve yazma kitap.ts'tedir.
// Satır, sayfanın kendi formundaki alanlarla okunur; sunucu aynı kuralları yeniden denetler (tek transaction, 1/2 b).
import { formulKoru } from '../veri/csv.ts';
import { TOPLU_EN_COK_SATIR } from '#paylasilan/toplu.ts';

export type Hucre = string | number | boolean | Date | null;
// Çözülmüş değer: tarih 'YYYY-AA-GG', liste seçeneği kodu.
export type Deger = string | number | boolean;
export type SutunTuru = 'metin' | 'kod' | 'sayi' | 'tarih' | 'evet-hayir' | 'liste';

export interface ListeSecenegi { kod: string; ad: string }

export interface ExcelSutunu {
  anahtar: string;
  baslik: string;
  tur: SutunTuru;
  // Yeni kayıtta zorunlu; güncellemede boş hücre "değiştirme" demektir.
  zorunlu?: boolean;
  liste?: readonly ListeSecenegi[];
  // Liste aynı dosyadaki sayfanın yeni satırlarını da tanır (ör. yeni iş merkezine istasyon): o sayfanın adı.
  dosyadakiSayfa?: string;
  not?: string;
  // Bilgi sütunu: kayıtlı değer şablonda gelir ama bu sayfada değişmez; değiştirilen hücre satırı hatalı yapar (örnek: emrin miktarı).
  salt?: true;
  enUzun?: number;
  genislik?: number;
}

export interface ExcelSayfasi<K = unknown> {
  ad: string;
  kayitTuru: string;
  sutunlar: readonly ExcelSutunu[];
  // Eşleşme anahtarı sütunu (kod); kayıt bu değerle bulunursa satır güncellemedir. Boş metin: eşleşme yok, her satır yeni kayıttır (emir gibi).
  anahtarSutun: string;
  kayitlar: readonly K[];
  anahtar: (k: K) => string;
  // Kaydın ekranda gösterilen alanları, sütun anahtarlarıyla (dolu şablon ve fark için).
  satir: (k: K) => Record<string, Deger | null>;
  // false: sayfa yalnız var olan kaydı değiştirir (yetkinlik matrisi gibi); eşleşmeyen satır hatadır.
  ekleme?: false;
  // Sayfada düzenlenemeyen kayıt (örnek: özlüğü İK'dan gelen kişi): nedeni döner; o kayda fark getiren satır önizlemede hatadır. Sunucu ayrıca denetler.
  kilitli?: (k: K) => string | null;
  // Yazımı durdurmayan uyarı (örnek: aynı ürün, miktar ve teslimle açık emir var); önizlemede satırın açıklamasında görünür.
  // eslesen: satırın güncellediği kayıt, yeni kayıtta null.
  uyari?: (degerler: Readonly<Record<string, Deger>>, eslesen: K | null) => string | null;
  // Satırı hatalı yapan sayfa kuralı (örnek: planlı emir taslağa dönmez); önizlemede görünür, sunucu ayrıca denetler.
  denetle?: (degerler: Readonly<Record<string, Deger>>, eslesen: K | null) => string | null;
}

// Kayıt türü sayfa tanımında kalır; tanım listesi türü silinmiş sayfaları taşır.
export const sayfaTanimi = <K>(s: ExcelSayfasi<K>): ExcelSayfasi => s as unknown as ExcelSayfasi;

export interface ExcelTanimi {
  // Dosya ve damga adı ('tesis', 'yetkinlik').
  ad: string;
  baslik: string;
  sayfalar: readonly ExcelSayfasi[];
  kilavuz: readonly string[];
  // Önizlemede yazılacak satırların özeti (örnek: "3 emir stok ayıracak"); yoksa null.
  ozet?: (gidecek: readonly PlanSatiri[]) => string | null;
}

export type Islem = 'ekle' | 'guncelle' | 'ayni' | 'hata';
export interface Fark { alan: string; baslik: string; eski: string; yeni: string }
export interface PlanSatiri {
  sayfa: string;
  kayitTuru: string;
  satir: number;
  // Eşleşme anahtarının (kod) okunan değeri; boşsa null.
  kod: string | null;
  islem: Islem;
  degerler: Record<string, Deger>;
  eslesen: unknown;
  farklar: Fark[];
  hatalar: string[];
  // Yazımı durdurmayan uyarılar (`ExcelSayfasi.uyari`); hatalı satırda yoktur.
  uyarilar?: string[];
  // Okunan ham hücreler (hata dosyası için), sütun sırasıyla.
  ham: Hucre[];
}

// Sayfanın yazma işlevinin kullanıcıya gösterilecek reddi (sunucuya gitmeden önce).
export class YazimReddi extends Error {}

// Sunucunun toplu sözleşmeleriyle aynı sınır.
export const TOPLU_EN_COK = TOPLU_EN_COK_SATIR;
export const DOSYA_EN_BUYUK_BAYT = 5 * 1024 * 1024;
export const DAMGA_ONEKI = 'core-mes-excel';
const AYRAC = ' — ';
export const EVET = 'Evet';
export const HAYIR = 'Hayır';

export const secenekEtiketi = (s: ListeSecenegi): string => (s.ad && s.ad !== s.kod ? `${s.kod}${AYRAC}${s.ad}` : s.kod);
export const damga = (t: Pick<ExcelTanimi, 'ad'>): string => `${DAMGA_ONEKI}:${t.ad}:1`;
export const basligiSadele = (b: string): string => b.replace(/\s*\*$/, '').trim();
export const sutunBasligi = (s: ExcelSutunu): string => (s.zorunlu ? `${s.baslik} *` : s.baslik);

const kucuk = (m: string) => m.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I');
const bosMu = (h: Hucre): boolean => h === null || (typeof h === 'string' && h.trim() === '');

// Dışa yazılan metin formül sayılmaz (ortak CSV kuralı); okurken bu kesme işareti geri alınır.
export const metinYaz = (m: string): string => formulKoru(m);
const metinOku = (m: string): string => (/^'[=+\-@\t\r]/.test(m) ? m.slice(1) : m);

// Excel tarihi tesisin duvar saatidir; exceljs onu aynı rakamlarla UTC Date olarak verir: kaydırılmaz.
const ikiHane = (n: number) => String(n).padStart(2, '0');
export const tarihMetni = (d: Date): string => `${d.getUTCFullYear()}-${ikiHane(d.getUTCMonth() + 1)}-${ikiHane(d.getUTCDate())}`;
const gecerliTarih = (y: number, a: number, g: number): string | null => {
  const d = new Date(Date.UTC(y, a - 1, g));
  return d.getUTCFullYear() === y && d.getUTCMonth() === a - 1 && d.getUTCDate() === g ? tarihMetni(d) : null;
};

// Hücre sütun türüne çevrilir. undefined: boş hücre (yeni kayıtta alan yok, güncellemede değişmez).
export function hucreCoz(s: ExcelSutunu, h: Hucre, dosyadaki: ReadonlySet<string> = new Set()): { deger?: Deger; hata?: string } {
  if (bosMu(h)) return {};
  const metin = typeof h === 'string' ? metinOku(h.trim()) : h instanceof Date ? tarihMetni(h) : String(h);
  const hata = (ileti: string) => ({ hata: `${s.baslik}: ${ileti}` });
  switch (s.tur) {
    case 'metin':
      if (s.enUzun !== undefined && metin.length > s.enUzun) return hata(`en çok ${s.enUzun} karakter.`);
      return { deger: metin };
    case 'kod':
      return { deger: kucuk(metin) };
    case 'sayi': {
      const n = typeof h === 'number' ? h : Number(metin.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
      return Number.isFinite(n) ? { deger: n } : hata('sayı olmalı.');
    }
    case 'tarih': {
      if (h instanceof Date) return { deger: tarihMetni(h) };
      const e = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(metin) ?? null;
      const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(metin);
      const t = e ? gecerliTarih(Number(e[3]), Number(e[2]), Number(e[1])) : iso ? gecerliTarih(Number(iso[1]), Number(iso[2]), Number(iso[3])) : null;
      return t === null ? hata('tarih gg.aa.yyyy olmalı.') : { deger: t };
    }
    case 'evet-hayir': {
      const k = kucuk(metin);
      if (h === true || ['EVET', 'E', 'TRUE', '1', 'X'].includes(k)) return { deger: true };
      if (h === false || ['HAYIR', 'H', 'FALSE', '0'].includes(k)) return { deger: false };
      return hata(`${EVET} ya da ${HAYIR} olmalı.`);
    }
    case 'liste': {
      const liste = s.liste ?? [];
      const bulunan = liste.find((x) => secenekEtiketi(x) === metin)
        ?? liste.find((x) => kucuk(x.kod) === kucuk(metin))
        ?? liste.find((x) => kucuk(x.ad) === kucuk(metin));
      if (bulunan) return { deger: bulunan.kod };
      const kod = kucuk(metin.split(AYRAC)[0] ?? metin);
      if (dosyadaki.has(kod)) return { deger: kod };
      return hata('listede yok; listeden seçin.');
    }
  }
}

const gorunen = (s: ExcelSutunu, d: Deger | null | undefined): string => {
  if (d === null || d === undefined || d === '') return '';
  if (typeof d === 'boolean') return d ? EVET : HAYIR;
  if (s.tur === 'liste') { const x = s.liste?.find((y) => y.kod === d); return x ? secenekEtiketi(x) : String(d); }
  if (s.tur === 'tarih' && typeof d === 'string') return `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
  if (typeof d === 'number') return String(d).replace('.', ',');
  return d;
};
export const degerMetni = gorunen;

export interface OkunanSatir { no: number; hucreler: Hucre[] }
// Sayfa adı -> satırlar; ilki başlıktır, boş satırlar yoktur, `no` Excel'deki satır numarasıdır.
export type SayfaSatirlari = Record<string, OkunanSatir[]>;

// Okunan sayfalardan önizleme planı. Başlıklar şablondaki gibi olmalı (sona eklenen * yok sayılır); tanımda olmayan sayfa ve sütun okunmaz.
export function planKur(t: ExcelTanimi, sayfalar: SayfaSatirlari): { plan: PlanSatiri[]; uyari: string | null } {
  const plan: PlanSatiri[] = [];
  let toplam = 0;
  const yeniKodlar = new Map<string, Set<string>>();
  // Aynı dosyadaki yeni kayıtların kodları önce toplanır (iş merkezi sayfası istasyondan sonra da gelse tanınsın).
  for (const s of t.sayfalar) {
    const satirlar = sayfalar[s.ad];
    const kodlar = new Set<string>();
    if (satirlar && satirlar.length > 1) {
      const i = (satirlar[0]?.hucreler ?? []).findIndex((b) => typeof b === 'string' && basligiSadele(b) === s.sutunlar.find((c) => c.anahtar === s.anahtarSutun)?.baslik);
      if (i >= 0) for (const r of satirlar.slice(1)) { const h = r.hucreler[i] ?? null; if (!bosMu(h)) kodlar.add(kucuk(String(h).trim())); }
    }
    yeniKodlar.set(s.ad, kodlar);
  }
  for (const s of t.sayfalar) {
    const satirlar = sayfalar[s.ad];
    if (!satirlar || satirlar.length === 0) continue;
    const basliklar = (satirlar[0]?.hucreler ?? []).map((b) => (typeof b === 'string' ? basligiSadele(b) : ''));
    const yer = s.sutunlar.map((c) => basliklar.indexOf(c.baslik));
    const anahtarYeri = s.sutunlar.findIndex((c) => c.anahtar === s.anahtarSutun);
    if (yer[anahtarYeri] === -1) return { plan: [], uyari: `"${s.ad}" sayfasında "${s.sutunlar[anahtarYeri]?.baslik ?? ''}" başlığı yok. Şablonu yeniden indirin.` };
    const kayitlar = new Map(s.kayitlar.map((k) => [kucuk(s.anahtar(k)), k]));
    const gorulen = new Map<string, number>();
    satirlar.slice(1).forEach(({ no: satir, hucreler: r }) => {
      if (r.every(bosMu)) return;
      toplam += 1;
      const hatalar: string[] = [];
      const degerler: Record<string, Deger> = {};
      const hataliSutun = new Set<string>();
      s.sutunlar.forEach((c, k) => {
        const yerk = yer[k] ?? -1;
        const h = yerk < 0 ? null : r[yerk] ?? null;
        const dosyadaki = c.dosyadakiSayfa ? yeniKodlar.get(c.dosyadakiSayfa) : undefined;
        const { deger, hata } = hucreCoz(c, h, dosyadaki);
        if (hata) { hatalar.push(hata); hataliSutun.add(c.anahtar); }
        else if (deger !== undefined) degerler[c.anahtar] = deger;
      });
      const anahtar = degerler[s.anahtarSutun];
      const eslesen = typeof anahtar === 'string' ? kayitlar.get(kucuk(anahtar)) ?? null : null;
      if (typeof anahtar === 'string') {
        const once = gorulen.get(kucuk(anahtar));
        if (once !== undefined) hatalar.push(`Aynı kod ${once}. satırda da var.`);
        else gorulen.set(kucuk(anahtar), satir);
      }
      const farklar: Fark[] = [];
      if (eslesen === null && s.ekleme === false) {
        hatalar.push(`${s.sutunlar[anahtarYeri]?.baslik ?? 'Kayıt'} listeden seçilmeli; bu sayfada yeni kayıt açılmaz.`);
      } else if (eslesen === null) {
        for (const c of s.sutunlar) if (c.zorunlu && degerler[c.anahtar] === undefined && !hataliSutun.has(c.anahtar)) hatalar.push(`${c.baslik} zorunlu.`);
      } else {
        const mevcut = s.satir(eslesen);
        for (const c of s.sutunlar) {
          const yeni = degerler[c.anahtar];
          if (yeni === undefined || c.anahtar === s.anahtarSutun) continue;
          const eski = mevcut[c.anahtar] ?? null;
          if (eski === yeni) continue;
          if (c.salt) hatalar.push(`${c.baslik} bu sayfada değişmez.`);
          else farklar.push({ alan: c.anahtar, baslik: c.baslik, eski: gorunen(c, eski), yeni: gorunen(c, yeni) });
        }
        const kilit = farklar.length ? s.kilitli?.(eslesen) ?? null : null;
        if (kilit !== null) hatalar.push(kilit);
      }
      const kural = hatalar.length ? null : s.denetle?.(degerler, eslesen) ?? null;
      if (kural !== null) hatalar.push(kural);
      const islem: Islem = hatalar.length ? 'hata' : eslesen === null ? 'ekle' : farklar.length ? 'guncelle' : 'ayni';
      const uyari = islem === 'hata' ? null : s.uyari?.(degerler, eslesen) ?? null;
      plan.push({
        sayfa: s.ad, kayitTuru: s.kayitTuru, satir, kod: typeof anahtar === 'string' ? anahtar : null, islem, degerler, eslesen, farklar, hatalar,
        ...(uyari === null ? {} : { uyarilar: [uyari] }), ham: yer.map((y) => (y < 0 ? null : r[y] ?? null)),
      });
    });
  }
  if (toplam > TOPLU_EN_COK) return { plan: [], uyari: `Dosyada ${toplam} satır var; bir seferde en çok ${TOPLU_EN_COK} satır yüklenir.` };
  if (plan.length === 0) return { plan: [], uyari: 'Dosyada okunacak satır bulunamadı. Sayfa adları ve başlıklar şablondaki gibi olmalı.' };
  return { plan, uyari: null };
}

export interface PlanSayilari { ekle: number; guncelle: number; ayni: number; hata: number }
export const planSayilari = (plan: readonly PlanSatiri[]): PlanSayilari => {
  const s: PlanSayilari = { ekle: 0, guncelle: 0, ayni: 0, hata: 0 };
  for (const p of plan) s[p.islem] += 1;
  return s;
};

// Sunucu reddinde satır numarası ayrıntıdadır (Mimar K2); plan satırı sayfa ve satırla bulunur.
// Sunucuya giden satır numarası. Gönderilen satırlar tek sayfadansa Excel satırıdır: sunucunun "Satır N" iletisi dosyadaki
// satırla aynı olur. Birden çok sayfadansa Excel satırı tekil olmadığı için gönderim sırasıdır (1'den). Pencere reddi aynı işlevle
// satırına geri bağlar.
export const gonderimNumaralari = (satirlar: readonly PlanSatiri[]): number[] => {
  const tekSayfa = new Set(satirlar.map((p) => p.sayfa)).size <= 1;
  return satirlar.map((p, i) => (tekSayfa ? p.satir : i + 1));
};

export const reddedilenSatir = (ayrinti: unknown): number | null => {
  const s = typeof ayrinti === 'object' && ayrinti !== null ? (ayrinti as { satir?: unknown }).satir : undefined;
  return typeof s === 'number' && Number.isInteger(s) ? s : null;
};
