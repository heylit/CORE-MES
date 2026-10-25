import type { Malzeme, PlanlamaCalismasi, PlanVerisi, Siparis, Urun } from '../tipler.ts';
import { hucreKoy, type IsiHucresi, type IsiSatiri, type IsiSutunu, type IsiUstDurumu } from '../ortak/isi/index.ts';

// Malzeme satın alma planının hesabı (224 a: MRP Planlama'nındır; 205 a: saf işlev). Eski ekranın zt-malzeme-plan.betik'i ve motorun
// matAlloc ile satinalmaListe'si (sunucu/moduller/recete-rota/motor/engine.betik), satın alma planı zv-termin.betik'i aynı kuralla
// yazıldı. Hesabın girdisi motorunkidir (motor/durum.betik stTamKur): havuz ve biten sipariş girmez, fire miktarı büyütür, termini olmayan
// satın almaya tahmini geliş verilir. Zaman planın başlangıç günü 00:00'dan (UTC) saattir (girdi.betik parseT).

const SAAT_MS = 3_600_000;
const ESIK = 1e-9;
// Gerekenden bu kadar önce gelen sipariş "ertelenebilir" sayılır (engine.betik satinalmaListe ERT).
const ERTELEME_SAAT = 10 * 24;
// Kova sayısının üst sınırı (zt mpVeri): uzak tarihli bir satır grafiği binlerce sütuna bölmesin.
const AZAMI_KOVA = 400;

export type Kirilim = 'gun' | 'hafta' | 'ay' | 'yil';
export const KIRILIMLAR: readonly { anahtar: Kirilim; baslik: string }[] = [
  { anahtar: 'gun', baslik: 'Günlük' }, { anahtar: 'hafta', baslik: 'Haftalık' }, { anahtar: 'ay', baslik: 'Aylık' }, { anahtar: 'yil', baslik: 'Yıllık' },
];
export type Kaynak = 'stok' | 'acik' | 'yeni';
export const KAYNAKLAR: readonly { anahtar: Kaynak; baslik: string }[] = [
  { anahtar: 'stok', baslik: 'Stoktan' }, { anahtar: 'acik', baslik: 'Açık siparişten' }, { anahtar: 'yeni', baslik: 'Yeni alım' },
];
export type GrafikTuru = 'butce' | 'ihtiyac';
export type DagilimTuru = 'malzeme' | 'siparis' | 'tedarikci';

// ---- Zaman ------------------------------------------------------------------------------------------------------
export function tabanMs(baslangic: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(baslangic.trim());
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// "YYYY-AA-GG" ya da "YYYY-AA-GG SS:DD" -> saat; sayı olduğu gibi kalır; okunamayan null.
export function saatOku(taban: number, deger: unknown): number | null {
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : null;
  if (typeof deger !== 'string' || deger.trim() === '') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(deger.trim());
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0) - taban) / SAAT_MS;
}

const tarihOf = (taban: number, t: number): Date => new Date(taban + t * SAAT_MS);
const saatOf = (taban: number, d: number): number => (d - taban) / SAAT_MS;
const iki = (n: number): string => String(n).padStart(2, '0');

const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

// Eski ekranın gün biçimi (engine.betik fmtDT ilk dokuz harf): "24.10 Cmt".
export function gunYaz(taban: number, t: number | null): string {
  if (t === null || !Number.isFinite(t)) return '—';
  const d = tarihOf(taban, t);
  return `${iki(d.getUTCDate())}.${iki(d.getUTCMonth() + 1)} ${GUN_ADLARI[(d.getUTCDay() + 6) % 7] ?? ''}`;
}

// Eski ekranın sayı ve para biçimleri (00-baslangic sayi, zr-agirlik agTL ve agKisa).
export function sayiYaz(x: number | null, k = 1): string {
  return x === null || !Number.isFinite(x) ? '—' : x.toLocaleString('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 });
}
export const tlYaz = (x: number | null): string => (x === null || !Number.isFinite(x) ? '—' : `${sayiYaz(Math.round(x), 0)} TL`);
export function tlKisa(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return '—';
  if (x >= 1e6) return `${sayiYaz(x / 1e6, 1)} mn ₺`;
  if (x >= 1e5) return `${sayiYaz(x / 1e3, 0)} bin ₺`;
  return `${sayiYaz(Math.round(x), 0)} ₺`;
}

export function kovaBasi(taban: number, kirilim: Kirilim, t: number): number {
  const d = tarihOf(taban, t);
  const y = d.getUTCFullYear(), a = d.getUTCMonth(), g = d.getUTCDate();
  if (kirilim === 'yil') return saatOf(taban, Date.UTC(y, 0, 1));
  if (kirilim === 'ay') return saatOf(taban, Date.UTC(y, a, 1));
  if (kirilim === 'hafta') return saatOf(taban, Date.UTC(y, a, g - ((d.getUTCDay() + 6) % 7)));
  return saatOf(taban, Date.UTC(y, a, g));
}

export function sonrakiKova(taban: number, kirilim: Kirilim, k: number): number {
  const d = tarihOf(taban, k);
  const y = d.getUTCFullYear(), a = d.getUTCMonth(), g = d.getUTCDate();
  if (kirilim === 'yil') return saatOf(taban, Date.UTC(y + 1, 0, 1));
  if (kirilim === 'ay') return saatOf(taban, Date.UTC(y, a + 1, 1));
  return saatOf(taban, Date.UTC(y, a, g + (kirilim === 'hafta' ? 7 : 1)));
}

const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

export function kovaAdi(taban: number, kirilim: Kirilim, k: number, uzun: boolean): string {
  const d = tarihOf(taban, k);
  const kisa = (t: number): string => gunYaz(taban, t).slice(0, 5);
  if (kirilim === 'yil') return String(d.getUTCFullYear());
  if (kirilim === 'ay') return `${AYLAR[d.getUTCMonth()] ?? ''}${uzun ? ` ${d.getUTCFullYear()}` : ''}`;
  if (kirilim === 'hafta') return uzun ? `${kisa(k)}–${kisa(sonrakiKova(taban, kirilim, k) - 24)}` : kisa(k);
  return uzun ? gunYaz(taban, k) : kisa(k);
}

// ---- Girdi ------------------------------------------------------------------------------------------------------
// Terminin kaynağı (zv-termin `tm`): girilmiş termin; termin yokken tedarik süresinden tahmin; ihtiyacına eşik kadar gün kalmış ve termini
// yok (sipariş yok sayılır); tedarik süresi yok; siparişi hiç verilmemiş eksik için tahmini satır.
export type TerminTuru = 'termin' | 'tahmini' | 'yok' | 'sure-yok' | 'siparis-yok';

// Açık satın alma satırı: kalan miktar, söz verilen geliş (saat), tedarikçi ve onun ortalama gecikmesi (saat); sipariş no, verildiği an
// ve referans termin biliniyorsa. Motorun girdisinde `soz` planın gördüğü geliştir (tahmin dahil), `src` asıl satırın sırasıdır
// (tahmini eksik satırında null), `tm` terminin kaynağı; ikisi yoksa satır asıldır ve termini girilmiştir.
export interface AcikAlim {
  kod: string; miktar: number; soz: number | null; tedarikci: string | null; gecikme: number;
  no?: string | null; verildi?: number | null; ref?: number | null; src?: number | null; tm?: TerminTuru;
}
const asilSira = (a: AcikAlim, i: number): number | null => (a.src === undefined ? i : a.src);
// Asıl satırın girilmiş termini (eski sayfa bunu çalışmanın kendi verisinden okur: tahmin orada yoktur).
const girilenTermin = (a: AcikAlim): number | null => (a.tm === undefined || a.tm === 'termin' ? a.soz : null);

// Çözülmüş planın işlemi (c-masa.betik opKaydi): kimlik ("iş.adım"), iş, başlangıç, bitiş, bitmiş mi.
export interface PlanIslemi { id?: string; job: string; S: number; C: number; done: boolean }

export interface MrpGirdisi {
  siparisler: readonly Siparis[];
  urunler: readonly Urun[];
  malzemeler: readonly Malzeme[];
  alimlar: readonly AcikAlim[];
  islemler: readonly PlanIslemi[];
  simdi: number;
  // İşin öncülü olmayan (ilk) işlemleri (engine.betik compile `pr`); işin rotası bilinmiyorsa iş yoktur ve her işlemi ilk sayılır.
  kokler?: ReadonlyMap<string, ReadonlySet<string>>;
}

const nesneMi = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sonlu = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sayiOku = (v: unknown): number => sonlu(typeof v === 'string' ? Number(v) : v) ?? 0;

// Kaydedilmiş planın işlemleri; biçimi bozuk işlem atlanır.
export function planIslemleri(plan: unknown): PlanIslemi[] {
  if (!nesneMi(plan) || !nesneMi(plan.ops)) return [];
  const l: PlanIslemi[] = [];
  for (const [id, r] of Object.entries(plan.ops)) {
    if (!nesneMi(r) || typeof r.job !== 'string') continue;
    const S = sonlu(r.S), C = sonlu(r.C);
    if (S === null) continue;
    l.push({ id, job: r.job, S, C: C ?? S, done: Boolean(r.done) });
  }
  return l;
}

// ---- Tahsis (engine.betik matAlloc) -----------------------------------------------------------------------------
export interface Kullanim { k: 'stok' | 'sa'; i: number | null; q: number }
export interface MalzemeTahsisi { kod: string; gerekli: number; eksik: number; kullanim: Kullanim[] }
export interface AlimTahsisi { i: number; varis: number; soz: number | null; gecikme: number; muayene: number; isler: { j: string; q: number }[] }
export interface Tahsis { isler: Map<string, MalzemeTahsisi[]>; alimlar: AlimTahsisi[] }

interface Arz { t: number; kalan: number; k: 'stok' | 'sa'; i: number | null; alim: AlimTahsisi | null }

// Stok önce, sonra açık siparişler varış sırasıyla; işler önceliğe, sonra termine göre sırayla alır. Varış = söz + tedarikçi gecikmesi
// (geç gelmeyen erken de sayılmaz) + giriş muayenesi; sözü olmayan sipariş en sona düşer.
export function tahsisEt(g: Pick<MrpGirdisi, 'siparisler' | 'urunler' | 'malzemeler' | 'alimlar'>, taban: number): Tahsis {
  const mats = new Map(g.malzemeler.map((m) => [m.kod, m]));
  const arz = new Map<string, Arz[]>();
  for (const m of g.malzemeler) arz.set(m.kod, [{ t: -1e9, kalan: sayiOku(m.stok), k: 'stok', i: null, alim: null }]);
  const alimlar = g.alimlar.map((a, i): AlimTahsisi => {
    const mu = sayiOku(mats.get(a.kod)?.muayeneGun) * 24;
    const varis = a.soz === null ? 1e9 : Math.max(a.soz + a.gecikme, a.soz) + mu;
    const x: AlimTahsisi = { i, varis, soz: a.soz, gecikme: a.gecikme, muayene: mu, isler: [] };
    const l = arz.get(a.kod) ?? [];
    l.push({ t: varis, kalan: a.miktar, k: 'sa', i, alim: x });
    arz.set(a.kod, l);
    return x;
  });
  for (const l of arz.values()) l.sort((a, b) => a.t - b.t);
  const urunler = new Set(g.urunler.map((u) => u.id));
  const termin = (s: Siparis): number => (s.termin === null ? 1e9 : saatOku(taban, s.termin) ?? 1e9);
  const sira = g.siparisler.filter((s) => urunler.has(s.urun))
    .map((s, n) => ({ s, n }))
    // Önceliği olmayan sipariş öncelikte eşit sayılır ve termine bakılır (motorda undefined - n = NaN, karşılaştırma termine düşer).
    .sort((a, b) => ((a.s.oncelik !== undefined && b.s.oncelik !== undefined ? a.s.oncelik - b.s.oncelik : 0) || (termin(a.s) - termin(b.s)) || (a.n - b.n)));
  const isler = new Map<string, MalzemeTahsisi[]>();
  for (const { s } of sira) {
    const det: MalzemeTahsisi[] = [];
    for (const r of s.malzeme ?? []) {
      const gerekli = sayiOku(r.miktar) * sayiOku(s.adet);
      let kalan = gerekli;
      const kullanim: Kullanim[] = [];
      for (const x of arz.get(r.kod) ?? []) {
        if (kalan <= ESIK) break;
        if (x.kalan <= ESIK) continue;
        const q = Math.min(x.kalan, kalan);
        x.kalan -= q; kalan -= q;
        kullanim.push({ k: x.k, i: x.i, q });
        x.alim?.isler.push({ j: s.id, q });
      }
      det.push({ kod: r.kod, gerekli, eksik: kalan > ESIK ? kalan : 0, kullanim });
    }
    isler.set(s.id, det);
  }
  return { isler, alimlar };
}

// ---- Plan satırları (zt mpVeri) ---------------------------------------------------------------------------------
export interface PlanSatiri {
  kod: string;
  j: string | null;
  q: number;
  tur: Kaynak;
  alimNo: number | null;
  ihtiyac: number;
  alim: number;
  tedarikci: string | null;
  fiyat: number | null;
  tutar: number | null;
  gecikti: boolean;
}

export interface MalzemePlaniHesabi {
  satirlar: PlanSatiri[];
  // Planda işi olmayan (havuzdaki ya da plana girmemiş) sipariş sayısı.
  plansiz: number;
  fiyatsiz: string[];
}

// Bir siparişin malzemesi rotasının ilk adımında gerekir (engine.betik satinalmaListe `first`, 486/4): öncülü olmayan, bitmemiş ve
// `simdi`den önce başlamamış işlem; ilk adım başlamış ya da bitmişse malzeme artık gerekmez. Grafik ve dağılım da aynı kuralı kullanır
// (453/7). `simdi` verilmezse her bitmemiş işlem sayılır (planda işi var mı ve motorun ihtiyaç günü sorusu için).
export function ilkBaslangiclar(islemler: readonly PlanIslemi[], simdi?: number, kokler?: ReadonlyMap<string, ReadonlySet<string>>): Map<string, number> {
  const ilk = new Map<string, number>();
  for (const r of islemler) {
    if (r.done || (simdi !== undefined && r.S < simdi - ESIK)) continue;
    const k = kokler?.get(r.job);
    if (k && (r.id === undefined || !k.has(r.id))) continue;
    const o = ilk.get(r.job);
    if (o === undefined || r.S < o) ilk.set(r.job, r.S);
  }
  return ilk;
}

export function malzemePlani(g: MrpGirdisi, taban: number, tahsis: Tahsis = tahsisEt(g, taban)): MalzemePlaniHesabi {
  const mats = new Map(g.malzemeler.map((m) => [m.kod, m]));
  const ilk = ilkBaslangiclar(g.islemler, g.simdi, g.kokler);
  const planda = ilkBaslangiclar(g.islemler);
  const sat: Omit<PlanSatiri, 'fiyat' | 'tutar' | 'gecikti'>[] = [];
  for (const [j, det] of tahsis.isler) {
    const ih = ilk.get(j);
    if (ih === undefined) continue;
    for (const d of det) {
      const m = mats.get(d.kod);
      const once = (sayiOku(m?.muayeneGun) + sayiOku(m?.tedarikGun)) * 24;
      for (const u of d.kullanim) {
        // Tahmini eksik satırından alınan miktar yeni alımdır (eski sayfa satırı çalışmanın verisinde bulamaz).
        const x = u.k === 'sa' && u.i !== null ? g.alimlar[u.i] : undefined;
        const a = x && u.i !== null && asilSira(x, u.i) !== null ? x : undefined;
        const tur: Kaynak = u.k === 'stok' ? 'stok' : a ? 'acik' : 'yeni';
        sat.push({
          kod: d.kod, j, q: u.q, tur, alimNo: a ? u.i : null, ihtiyac: ih,
          alim: tur === 'acik' ? (a ? girilenTermin(a) ?? ih : ih) : tur === 'yeni' ? ih - once : ih, tedarikci: a?.tedarikci ?? null,
        });
      }
      if (d.eksik > 0) sat.push({ kod: d.kod, j, q: d.eksik, tur: 'yeni', alimNo: null, ihtiyac: ih, alim: ih - once, tedarikci: null });
    }
  }
  // Açık siparişin işe bağlanmayan kısmı da ödenecek paradır: stoğa girer.
  g.alimlar.forEach((a, i) => {
    const t = asilSira(a, i) === null ? null : girilenTermin(a);
    const kullanilan = sat.filter((s) => s.alimNo === i).reduce((x, s) => x + s.q, 0);
    const kalan = a.miktar - kullanilan;
    if (kalan > 1e-6 && t !== null) sat.push({ kod: a.kod, j: null, q: kalan, tur: 'acik', alimNo: i, ihtiyac: t, alim: t, tedarikci: a.tedarikci });
  });
  const satirlar = sat.map((s): PlanSatiri => {
    const bf = mats.get(s.kod)?.birimFiyat;
    const fiyat = typeof bf === 'number' && Number.isFinite(bf) ? bf : null;
    return { ...s, fiyat, tutar: fiyat === null ? null : fiyat * s.q, gecikti: s.tur === 'yeni' && s.alim < g.simdi };
  });
  const plansiz = g.siparisler.filter((s) => s.havuz === true || !planda.has(s.id)).length;
  return { satirlar, plansiz, fiyatsiz: [...new Set(satirlar.filter((s) => s.fiyat === null).map((s) => s.kod))] };
}

// ---- Kovalar ----------------------------------------------------------------------------------------------------
export interface Kovalar { basi: number[]; alimKovasi: number[]; ihtiyacKovasi: number[] }

// Kovalar bugünden en son tarihe kadardır; geçmiş tarihli satır ilk ("Hemen") kovaya düşer.
export function kovala(satirlar: readonly PlanSatiri[], taban: number, kirilim: Kirilim, simdi: number): Kovalar {
  const t0 = kovaBasi(taban, kirilim, simdi);
  const son = Math.max(simdi, ...satirlar.map((s) => Math.max(s.ihtiyac, s.alim)));
  const basi: number[] = [];
  for (let k = t0; k <= son && basi.length < AZAMI_KOVA; k = sonrakiKova(taban, kirilim, k)) basi.push(k);
  const no = (t: number): number => {
    if (t < t0) return 0;
    let i = basi.length - 1;
    while (i > 0 && (basi[i] ?? 0) > t) i--;
    return i;
  };
  return { basi, alimKovasi: satirlar.map((s) => no(s.alim)), ihtiyacKovasi: satirlar.map((s) => no(s.ihtiyac)) };
}

// Grafiğin satırları: bütçe parayı çıkış gününe koyar ve stoğu saymaz (alım değildir); ihtiyaç malzemenin gerektiği güne konur.
export function grafikKaynaklari(tur: GrafikTuru): readonly Kaynak[] {
  return tur === 'butce' ? ['acik', 'yeni'] : ['stok', 'acik', 'yeni'];
}

export interface GrafikSutunu { kova: number; degerler: Record<Kaynak, number>; toplam: number; hemen: boolean }

export function grafikSutunlari(h: MalzemePlaniHesabi, k: Kovalar, tur: GrafikTuru, tutarla: boolean): GrafikSutunu[] {
  const kayn = grafikKaynaklari(tur);
  const alan = tur === 'butce' ? k.alimKovasi : k.ihtiyacKovasi;
  return k.basi.map((kova, i) => {
    const degerler: Record<Kaynak, number> = { stok: 0, acik: 0, yeni: 0 };
    h.satirlar.forEach((s, n) => {
      if (alan[n] !== i || !kayn.includes(s.tur)) return;
      degerler[s.tur] += tutarla ? s.tutar ?? 0 : s.q;
    });
    const toplam = kayn.reduce((a, x) => a + degerler[x], 0);
    return { kova, degerler, toplam, hemen: i === 0 && h.satirlar.some((s, n) => s.gecikti && alan[n] === 0) };
  });
}

// ---- Dağılım ----------------------------------------------------------------------------------------------------
export const BAGSIZ = 'Stoğa (bağlı iş yok)';
export const TEDARIKCISIZ = 'Tedarikçi seçilmedi';
// Dağılım tablosunun toplam satırının anahtarı; satır anahtarlarıyla (malzeme kodu, sipariş no, tedarikçi) çakışmaz.
export const TOPLAM = '#toplam';

export interface DagilimHucresi { miktar: number; tutar: number | null; adet: number }
export interface DagilimSatiri { anahtar: string; kod: string | null; hucreler: Map<number, DagilimHucresi>; toplam: DagilimHucresi }
export interface Dagilim { kovalar: number[]; satirlar: DagilimSatiri[]; toplamlar: Map<number, DagilimHucresi>; genel: DagilimHucresi; hemen: boolean }

function hucre(l: readonly PlanSatiri[]): DagilimHucresi {
  return { miktar: l.reduce((a, s) => a + s.q, 0), tutar: l.some((s) => s.tutar === null) ? null : l.reduce((a, s) => a + (s.tutar ?? 0), 0), adet: l.length };
}

export function dagilim(h: MalzemePlaniHesabi, k: Kovalar, gor: GrafikTuru, tur: DagilimTuru, tutarla: boolean): Dagilim {
  const alan = gor === 'butce' ? k.alimKovasi : k.ihtiyacKovasi;
  const l = h.satirlar.map((s, n) => ({ s, i: alan[n] ?? 0 })).filter(({ s }) => gor !== 'butce' || s.tur !== 'stok');
  const anahtar = (s: PlanSatiri): string => (tur === 'siparis' ? s.j ?? BAGSIZ : tur === 'tedarikci' ? s.tedarikci ?? (s.tur === 'yeni' ? TEDARIKCISIZ : 'Stok') : s.kod);
  const gruplar = new Map<string, { s: PlanSatiri; i: number }[]>();
  for (const x of l) { const a = anahtar(x.s); gruplar.set(a, [...(gruplar.get(a) ?? []), x]); }
  const kovalar = k.basi.map((_, i) => i).filter((i) => l.some((x) => x.i === i));
  const olcu = (ls: readonly { s: PlanSatiri }[]): number => ls.reduce((a, x) => a + (tutarla ? x.s.tutar ?? 0 : x.s.q), 0);
  const satirlar = [...gruplar.entries()].sort((a, b) => olcu(b[1]) - olcu(a[1])).map(([a, ls]): DagilimSatiri => ({
    anahtar: a,
    kod: tur === 'malzeme' ? a : null,
    hucreler: new Map(kovalar.map((i) => [i, hucre(ls.filter((x) => x.i === i).map((x) => x.s))])),
    toplam: hucre(ls.map((x) => x.s)),
  }));
  return {
    kovalar, satirlar,
    toplamlar: new Map(kovalar.map((i) => [i, hucre(l.filter((x) => x.i === i).map((x) => x.s))])),
    genel: hucre(l.map((x) => x.s)),
    hemen: l.some((x) => x.s.gecikti && x.i === 0),
  };
}

// ---- Özet -------------------------------------------------------------------------------------------------------
export interface OzetKutusu { kalem: number; tutar: number | null }
export interface MalzemeOzeti { toplam: OzetKutusu; stok: OzetKutusu; acik: OzetKutusu; yeni: OzetKutusu; gecikenMalzeme: number }

export function ozet(h: MalzemePlaniHesabi): MalzemeOzeti {
  const kutu = (f: (s: PlanSatiri) => boolean): OzetKutusu => {
    const l = h.satirlar.filter(f);
    // Kalem: farklı malzeme x sipariş çifti (453/6); stoktan, açık siparişten ve yeni alımdan bölünen satır tek kalemdir.
    return { kalem: new Set(l.map((s) => `${s.kod}\u0000${s.j ?? ''}`)).size, tutar: l.some((s) => s.tutar === null) ? null : l.reduce((a, s) => a + (s.tutar ?? 0), 0) };
  };
  return {
    toplam: kutu((s) => s.j !== null), stok: kutu((s) => s.tur === 'stok'), acik: kutu((s) => s.tur === 'acik'), yeni: kutu((s) => s.tur === 'yeni'),
    gecikenMalzeme: new Set(h.satirlar.filter((s) => s.gecikti).map((s) => s.kod)).size,
  };
}

// ---- Satın alma planı (engine.betik satinalmaListe, zv-termin tmMalzeme ve tmDurum, zt mpDurum) ---------------
export type AlimDurumu =
  | 'gec-kaldi' | 'verilmedi' | 'verilmeli' | 'yok-sayildi' | 'bekleniyor' | 'referanstan-gec'
  | 'termin-yok' | 'bagsiz' | 'geciktirir' | 'plandan-gec' | 'erken' | 'karsiliyor';
export interface AlimPlaniSatiri {
  // sa: motorun satın alma satırı (asıl ya da tahmini); eksik: tedarik süresi olmadığı için tahmini satırı da kurulamayan eksik.
  tur: 'sa' | 'eksik';
  alimNo: number | null;
  // Asıl satın alma satırının sırası; verilecek siparişte (tahmini ya da eksik) null.
  src: number | null;
  tm: TerminTuru;
  kod: string;
  miktar: number;
  tedarikci: string | null;
  no: string | null;
  verildi: number | null;
  ref: number | null;
  isler: string[];
  // Gerekli geliş: malzemeyi kullanan ilk işin planlanan başlangıcı eksi giriş muayenesi.
  gerekli: number | null;
  // En geç: siparişin bolluğu kadar geç (tezgâh sırası yok sayılır; yaklaşık).
  enGec: number | null;
  // Söz verilen geliş (girilmiş termin; tahmini satırda tahmin) ve etkin geliş: söz + tedarikçinin ortalama gecikmesi.
  soz: number | null;
  etkin: number | null;
  // En geç sipariş verme anı (en geç - tedarik süresi x katsayı); tedarik süresi yoksa null.
  siparisGun: number | null;
  // İhtiyacına termin eşiği kadar gün kalmış mı.
  yakin: boolean;
  durum: AlimDurumu;
}

interface Ilk { s: number; l: number }

function isIlkleri(g: MrpGirdisi, taban: number): Map<string, Ilk> {
  const sip = new Map(g.siparisler.map((s) => [s.id, s]));
  const bit = new Map<string, number>();
  for (const r of g.islemler) bit.set(r.job, Math.max(bit.get(r.job) ?? -Infinity, r.C));
  const bas = ilkBaslangiclar(g.islemler, g.simdi, g.kokler);
  const ilk = new Map<string, Ilk>();
  for (const [j, s] of bas) {
    const C = bit.get(j) ?? -Infinity;
    const t = sip.get(j)?.termin;
    const due = t === undefined || t === null ? null : saatOku(taban, t);
    const bolluk = due === null || !Number.isFinite(C) ? 0 : Math.max(0, due - C);
    ilk.set(j, { s, l: s + bolluk });
  }
  return ilk;
}

// Girilmiş terminli satırın durumu (zt mpDurum).
export function alimDurumu(r: Pick<AlimPlaniSatiri, 'etkin' | 'gerekli' | 'enGec'>): AlimDurumu {
  if (r.etkin === null) return 'termin-yok';
  if (r.gerekli === null) return 'bagsiz';
  if (r.enGec !== null && r.etkin > r.enGec + 1e-6) return 'geciktirir';
  if (r.etkin > r.gerekli + 1e-6) return 'plandan-gec';
  if (r.etkin < r.gerekli - ERTELEME_SAAT) return 'erken';
  return 'karsiliyor';
}

// zv-termin tmDurum: verilmemiş siparişte en geç sipariş günü ve ihtiyacın yakınlığı; terminsizde tahmin; girilmiş terminde plan ve
// referans termin.
export function terminDurumu(r: Pick<AlimPlaniSatiri, 'tm' | 'siparisGun' | 'yakin' | 'etkin' | 'gerekli' | 'enGec' | 'ref' | 'soz'>, simdi: number): AlimDurumu {
  if (r.tm === 'siparis-yok' || r.tm === 'sure-yok') return r.siparisGun !== null && r.siparisGun < simdi ? 'gec-kaldi' : r.yakin ? 'verilmedi' : 'verilmeli';
  if (r.tm === 'yok') return 'yok-sayildi';
  if (r.tm === 'tahmini') return 'bekleniyor';
  const d = alimDurumu(r);
  if (DURUM_TONU[d] === 'tamam' && r.ref !== null && r.soz !== null && r.soz > r.ref + 1e-6) return 'referanstan-gec';
  return d;
}

export function alimPlani(g: MrpGirdisi, taban: number, tahsis: Tahsis = tahsisEt(g, taban), A: TerminAyari = TERMIN_AYARI): AlimPlaniSatiri[] {
  const mats = new Map(g.malzemeler.map((m) => [m.kod, m]));
  const ilk = isIlkleri(g, taban);
  const out: Omit<AlimPlaniSatiri, 'siparisGun' | 'yakin' | 'durum'>[] = [];
  for (const x of tahsis.alimlar) {
    const a = g.alimlar[x.i];
    if (!a) continue;
    const js = x.isler.flatMap((u) => { const f = ilk.get(u.j); return f ? [{ j: u.j, ...f }] : []; });
    out.push({
      tur: 'sa', alimNo: x.i, src: asilSira(a, x.i), tm: a.tm ?? 'termin', kod: a.kod, miktar: a.miktar, tedarikci: a.tedarikci,
      no: a.no ?? null, verildi: a.verildi ?? null, ref: a.ref ?? null, isler: js.map((u) => u.j),
      gerekli: js.length ? Math.min(...js.map((u) => u.s)) - x.muayene : null, enGec: js.length ? Math.min(...js.map((u) => u.l)) - x.muayene : null,
      soz: x.soz, etkin: x.soz === null ? null : x.soz + x.gecikme,
    });
  }
  for (const [j, det] of tahsis.isler) {
    for (const d of det) {
      if (d.eksik <= 0) continue;
      const f = ilk.get(j);
      const mu = sayiOku(mats.get(d.kod)?.muayeneGun) * 24;
      out.push({
        tur: 'eksik', alimNo: null, src: null, tm: 'sure-yok', kod: d.kod, miktar: d.eksik, tedarikci: null, no: null, verildi: null, ref: null,
        isler: [j], gerekli: f ? f.s - mu : null, enGec: f ? f.l - mu : null, soz: null, etkin: null,
      });
    }
  }
  return out.map((r): AlimPlaniSatiri => {
    const m = mats.get(r.kod);
    const tg = sonlu(m?.tedarikGun);
    const kat = terminKatsayisi(m, 'terminKat', A.katMal);
    const siparisGun = r.enGec !== null && tg !== null ? r.enGec - tg * kat * 24 : null;
    const yakin = r.gerekli !== null && r.gerekli <= g.simdi + A.esik * 24;
    return { ...r, siparisGun, yakin, durum: terminDurumu({ ...r, siparisGun, yakin }, g.simdi) };
  });
}

// Verilecek siparişler en geç sipariş gününe, açık siparişler gerekli gelişe göre (zv-termin mpSatinalmaPlani).
export function alimTablolari(l: readonly AlimPlaniSatiri[]): { yeni: AlimPlaniSatiri[]; acik: AlimPlaniSatiri[] } {
  return {
    yeni: l.filter((r) => r.src === null).sort((a, b) => (a.siparisGun ?? 1e9) - (b.siparisGun ?? 1e9)),
    acik: l.filter((r) => r.src !== null).sort((a, b) => (a.gerekli ?? 1e9) - (b.gerekli ?? 1e9)),
  };
}

export type DurumTonu = 'tamam' | 'uyari' | 'hata' | 'pasif';
export const DURUM_TONU: Record<AlimDurumu, DurumTonu> = {
  'gec-kaldi': 'hata', verilmedi: 'hata', verilmeli: 'uyari', 'yok-sayildi': 'hata', bekleniyor: 'uyari', 'referanstan-gec': 'uyari',
  'termin-yok': 'pasif', bagsiz: 'pasif', geciktirir: 'hata', 'plandan-gec': 'uyari', erken: 'tamam', karsiliyor: 'tamam',
};
export const DURUM_ADI: Record<AlimDurumu, string> = {
  'gec-kaldi': 'Sipariş geç kaldı', verilmedi: 'Sipariş verilmedi', verilmeli: 'Sipariş verilmeli', 'yok-sayildi': 'Termin yok, sipariş yok sayıldı',
  bekleniyor: 'Termin bekleniyor', 'referanstan-gec': 'Referanstan geç, plan güncellenmeli',
  'termin-yok': 'Termin yok', bagsiz: 'Bağlı iş yok', geciktirir: 'Siparişi geciktirir', 'plandan-gec': 'Plandan geç',
  erken: 'Karşılıyor, erken', karsiliyor: 'Karşılıyor',
};

// Satın alma planının dört sayacı (zv-termin): verilecek sipariş ve günü geçenler; termini beklenen ve yok sayılanlar; geciktiren; karşılayan.
export interface AlimSayaclari { verilmeli: number; gunuGecti: number; bekleniyor: number; yokSayildi: number; geciktirir: number; karsiliyor: number }
export function alimSayaclari(l: readonly AlimPlaniSatiri[], simdi: number): AlimSayaclari {
  const { yeni, acik } = alimTablolari(l);
  return {
    verilmeli: yeni.length,
    gunuGecti: yeni.filter((r) => r.siparisGun !== null && r.siparisGun < simdi).length,
    bekleniyor: acik.filter((r) => r.tm === 'tahmini' || r.tm === 'yok').length,
    yokSayildi: acik.filter((r) => r.tm === 'yok').length,
    geciktirir: acik.filter((r) => r.durum === 'geciktirir').length,
    karsiliyor: acik.filter((r) => DURUM_TONU[r.durum] === 'tamam').length,
  };
}

// ---- Motorun girdisi (motor/durum.betik stTamKur: ymUygula, tmUygula; girdi.betik stKur, tmiBitenler, simdiUygula) --------------
// Termin ayarı (durum.betik TM0, çalışmanın `D.terminAyar`'ı): tedarik süresi katsayısı ve 100 birim başına ek gün; termin zorunlu eşiği (gün).
export interface TerminAyari { katMal: number; ekMal: number; esik: number }
export const TERMIN_AYARI: TerminAyari = { katMal: 1, ekMal: 0, esik: 7 };
// Takvimi olmayan çalışmada sayfanın şimdisi başlangıç günü 07:00'dir (girdi.betik stKur now: 7).
const MOTOR_ILK_SIMDI = 7;
const GUNLER = ['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'];
const saatDakika = (s: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s));
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
};

// Tahmini gelişin başladığı an (483/2): planın ilk çalışma gününün ilk vardiyasının başlangıcı (engine.betik compile takvimi: çalışma
// günleri, vardiyalar, tatiller). Malzemenin tezgâhı yoktur; fabrika takvimi alınır. Takvim boşsa 07:00.
export function ilkVardiyaBasi(D: PlanVerisi, taban: number): number {
  const vardiya = new Map((Array.isArray(D.vardiyalar) ? D.vardiyalar : []).filter(nesneMi).map((v) => [String(v.id), saatDakika(v.bas)]));
  const tatil = new Set((D.tatiller ?? []).map((s) => saatOku(taban, s)).filter((x): x is number => x !== null).map((x) => Math.floor(x / 24)));
  const gunler = nesneMi(D.calismaGunleri) ? D.calismaGunleri : {};
  for (let d = 0; d < 14; d++) {
    if (tatil.has(d)) continue;
    const wd = GUNLER[(new Date(taban + d * 86_400_000).getUTCDay() + 6) % 7] ?? 'pzt';
    const l = (Array.isArray(gunler[wd]) ? gunler[wd] : []).map((id) => vardiya.get(String(id))).filter((x): x is number => x !== null && x !== undefined);
    if (l.length) return d * 24 + Math.min(...l);
  }
  return MOTOR_ILK_SIMDI;
}

export function terminAyari(D: PlanVerisi): TerminAyari {
  const x = nesneMi(D.terminAyar) ? D.terminAyar : {};
  const al = (k: keyof TerminAyari): number => sonlu(typeof x[k] === 'string' ? Number(x[k]) : x[k]) ?? TERMIN_AYARI[k];
  return { katMal: al('katMal'), ekMal: al('ekMal'), esik: al('esik') };
}

// Malzeme kendi katsayısını taşırsa genelin yerine o kullanılır (zv-termin tmKat).
function terminKatsayisi(m: Malzeme | undefined, k: 'terminKat' | 'terminEk', genel: number): number {
  const v = m?.[k];
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : genel;
}

// Sayfanın şimdisi (girdi.betik simdiUygula): çalışmanın kaydettiği şimdi başlangıç günü 07:00'den ilerideyse o, değilse 07:00. Bütün
// planlama görünümleri aynı şimdiyi kullanır; ortak yeri iskelettir (oraya taşınacak).
export function calismaSimdisi(c: PlanlamaCalismasi): number {
  const s = Number(c.simdi);
  return Number.isFinite(s) && s > MOTOR_ILK_SIMDI ? s : MOTOR_ILK_SIMDI;
}

// Biten iş (girdi.betik tmiBitenler): iş emri tamam ya da iptal, ya da rotasının bütün adımları tamam olan sipariş; yalnız bazı adımları
// tamamsa o adımlar ("iş.adım"). Kaynak sunucunun iş emri durumudur, okunamadıysa Reçete ve Rota kaydındaki kopyası (zz31-tmi bitenler).
export interface Bitenler { siparis: Set<string>; adim: Set<string> }
export function bitenler(emirler: unknown, D: PlanVerisi): Bitenler {
  const y: Bitenler = { siparis: new Set(), adim: new Set() };
  if (!nesneMi(emirler)) return y;
  for (const o of Array.isArray(emirler.orders) ? (emirler.orders as unknown[]) : []) {
    if (nesneMi(o) && (o.status === 'tamam' || o.status === 'iptal')) y.siparis.add(String(o.id));
  }
  const durum = nesneMi(emirler.opStatus) ? emirler.opStatus : {};
  const urun = new Map(D.urunler.map((u) => [u.id, u]));
  for (const s of D.siparisler) {
    const rota = urun.get(s.urun)?.rota ?? [];
    if (y.siparis.has(s.id) || rota.length === 0) continue;
    const biten = rota.filter((_, i) => durum[`${s.id}|root|${i + 1}`] === 'tamam');
    if (biten.length === rota.length) y.siparis.add(s.id); else for (const a of biten) y.adim.add(`${s.id}.${a.k}`);
  }
  return y;
}

// İşin ilk işlemleri (engine.betik compile): rota adımının bağları (`bag`) biten adımlar düşüldükten sonra boşsa öncülü yoktur.
export function ilkIslemler(D: PlanVerisi, siparisler: readonly Siparis[], bitenAdim: ReadonlySet<string>): Map<string, Set<string>> {
  const urun = new Map(D.urunler.map((u) => [u.id, u]));
  const y = new Map<string, Set<string>>();
  for (const s of siparisler) {
    const rota = urun.get(s.urun)?.rota;
    if (!rota?.length) continue;
    const k = new Set<string>();
    for (const a of rota) {
      const id = `${s.id}.${a.k}`;
      if (bitenAdim.has(id)) continue;
      const bag = Array.isArray(a.bag) ? (a.bag as unknown[]) : [];
      if (!bag.some((b) => Array.isArray(b) && !bitenAdim.has(`${s.id}.${String(b[0])}`))) k.add(id);
    }
    y.set(s.id, k);
  }
  return y;
}

// "GGGG-AA-GG SS:DD" yazılıp yeniden okunur (durum.betik tmTarihYaz): dakikaya kesilir.
const dakika = (t: number): number => Math.floor(t * 60 + 1e-6) / 60;

export interface MotorGirdisiKaynagi {
  D: PlanVerisi;
  malzemeler: readonly Malzeme[];
  alimlar: readonly AcikAlim[];
  islemler: readonly PlanIslemi[];
  biten: Bitenler;
  simdi: number;
  taban: number;
}

// Planın gördüğü girdi: havuz ve biten sipariş düşer (eksik tahmini de biten siparişi saymaz, 483/1), fire uygulanır, terminsiz satın
// almaya ve eksik malzemeye tahmini geliş yazılır (ilk vardiyanın başından, 483/2). 483/1 ve 483/2 motorda da aynı tanımla değişir.
export function motorGirdisi(k: MotorGirdisiKaynagi): MrpGirdisi {
  const A = terminAyari(k.D);
  const mats = new Map(k.malzemeler.map((m) => [m.kod, m]));
  const ted = tedarikciGecikmeleri(k.D);
  const siparisler = k.D.siparisler.filter((s) => s.havuz !== true && !k.biten.siparis.has(s.id)).map((s): Siparis => {
    if (!s.malzeme) return s;
    return { ...s, malzeme: s.malzeme.map((r) => { const f = sayiOku(mats.get(r.kod)?.fire); return f > 0 ? { ...r, miktar: sayiOku(r.miktar) * (1 + f / 100) } : r; }) };
  });
  const now = ilkVardiyaBasi(k.D, k.taban), sinir = now + A.esik * 24;
  const sure = (kod: string, q: number): number | null => {
    const m = mats.get(kod);
    const tg = sonlu(m?.tedarikGun);
    return m === undefined || tg === null ? null : (tg * terminKatsayisi(m, 'terminKat', A.katMal) + terminKatsayisi(m, 'terminEk', A.ekMal) * q / 100) * 24;
  };
  // Malzemenin ihtiyaç günü kayıtlı plandan: onu kullanan ilk işin başlangıcı (durum.betik tmIhtiyac).
  const ilk = ilkBaslangiclar(k.islemler);
  const gerekGunu = new Map<string, number>();
  for (const s of siparisler) {
    const t = ilk.get(s.id);
    if (t === undefined) continue;
    for (const r of s.malzeme ?? []) gerekGunu.set(r.kod, Math.min(gerekGunu.get(r.kod) ?? Infinity, t));
  }
  const alimlar = k.alimlar.map((a, i): AcikAlim => {
    const x: AcikAlim = { ...a, src: asilSira(a, i), tm: a.tm ?? 'termin' };
    if (x.soz !== null) return x;
    const su = sure(a.kod, a.miktar);
    if (su === null) return { ...x, tm: 'sure-yok' };
    const h = gerekGunu.get(a.kod);
    if (h !== undefined && h <= sinir) return { ...x, soz: dakika(now + su), tm: 'yok' };
    return { ...x, soz: dakika(Math.max(now, (a.verildi ?? now) + su)), tm: 'tahmini' };
  });
  const ihtiyac = new Map<string, number>();
  for (const s of siparisler) for (const r of s.malzeme ?? []) ihtiyac.set(r.kod, (ihtiyac.get(r.kod) ?? 0) + sayiOku(r.miktar) * sayiOku(s.adet));
  for (const [kod, q] of ihtiyac) {
    const m = mats.get(kod);
    const eks = q - (sayiOku(m?.stok) + k.alimlar.filter((a) => a.kod === kod).reduce((x, a) => x + a.miktar, 0));
    if (eks <= 1e-6) continue;
    const su = sure(kod, eks);
    if (su === null) continue;
    const t = typeof m?.tedarikci === 'string' && m.tedarikci !== '' ? m.tedarikci : null;
    alimlar.push({ kod, miktar: eks, soz: dakika(now + su), tedarikci: t, gecikme: t === null ? 0 : ted(t), src: null, tm: 'siparis-yok' });
  }
  return {
    siparisler, urunler: k.D.urunler, malzemeler: k.malzemeler, alimlar, islemler: k.islemler, simdi: k.simdi, kokler: ilkIslemler(k.D, siparisler, k.biten.adim),
  };
}

// ---- Planın verisinden girdi ------------------------------------------------------------------------------------
// Belgedeki açık satın almalar (sayfanın elle girilen `D.satinalma`'sı) ve tedarikçi gecikmesi (`D.tedarikciler[].ortGecikmeGun`).
export function belgedekiAlimlar(D: PlanVerisi, taban: number): AcikAlim[] {
  const ted = tedarikciGecikmeleri(D);
  const l = Array.isArray(D.satinalma) ? (D.satinalma as unknown[]) : [];
  return l.flatMap((p) => {
    if (!nesneMi(p) || typeof p.kod !== 'string') return [];
    const tedarikci = typeof p.tedarikci === 'string' && p.tedarikci !== '' ? p.tedarikci : null;
    return [{
      kod: p.kod, miktar: sayiOku(p.miktar), soz: saatOku(taban, p.gelis), tedarikci, gecikme: tedarikci === null ? 0 : ted(tedarikci),
      no: typeof p.no === 'string' && p.no !== '' ? p.no : null, verildi: saatOku(taban, p.verildi), ref: saatOku(taban, p.ref),
    }];
  });
}

// Tedarikçi kimliği ya da adıyla ortalama gecikme (saat); bilinmeyen tedarikçide 0 (motor da öyle sayar).
export function tedarikciGecikmeleri(D: PlanVerisi): (tedarikci: string) => number {
  const l = Array.isArray(D.tedarikciler) ? (D.tedarikciler as unknown[]).filter(nesneMi) : [];
  return (t) => {
    const x = l.find((y) => y.id === t) ?? l.find((y) => typeof y.ad === 'string' && y.ad.toLocaleLowerCase('tr-TR') === t.toLocaleLowerCase('tr-TR'));
    return x ? sayiOku(x.ortGecikmeGun) * 24 : 0;
  };
}

export function tedarikciAdi(D: PlanVerisi, t: string): string {
  const l = Array.isArray(D.tedarikciler) ? (D.tedarikciler as unknown[]).filter(nesneMi) : [];
  const x = l.find((y) => y.id === t);
  return x && typeof x.ad === 'string' ? x.ad : t;
}

// ---- Isı haritası (zz30-isi ISI.malzplan): malzeme x gün, stok yetiyor mu ---------------------------------------
const ISI_GUN = 21;
export const isiGunu = (t: number): number => Math.floor(t / 24);

export interface MalzemeIsiSatiri extends IsiSatiri { r: AlimPlaniSatiri; d: string }
export interface MalzemeIsisi { sutunlar: IsiSutunu[]; satirlar: MalzemeIsiSatiri[]; ust: IsiUstDurumu }

const ISI_SIRA: Record<'hata' | 'uyari' | 'tamam', number> = { hata: 0, uyari: 1, tamam: 2 };

// Satırlar satın alma planının satırlarıdır (asıl, tahmini ve eksik); bugünden 21 gün. Yolda, eksik, son sipariş günü, geliş ve planın
// istediği gün hücrelere işlenir; karşılanan satırlar gizlidir. `fiyat` verilirse (maliyet gören) durum satırı açık siparişlerin tutar
// toplamını yazar (483/3); fiyatı olmayan satır varsa toplam bilinmez.
export function malzemeIsisi(l: readonly AlimPlaniSatiri[], taban: number, simdi: number, miktar: (q: number, kod: string) => string,
  malzemeAdi: (kod: string) => string, fiyat?: (kod: string, q: number) => number | null): MalzemeIsisi {
  const g0 = isiGunu(simdi);
  const sutunlar: IsiSutunu[] = [];
  for (let g = g0; g < g0 + ISI_GUN; g++) { const s = gunYaz(taban, g * 24); sutunlar.push({ k: `g${g}`, ad: s.slice(0, 5), alt: s.slice(6, 9), bugun: g === g0 }); }
  const kis = (g: number): string => `g${Math.min(Math.max(g, g0), g0 + ISI_GUN - 1)}`;
  const son = g0 + ISI_GUN - 1;
  const anahtarlar = new Map<string, number>();
  const satirlar = l.map((r): MalzemeIsiSatiri => {
    const h: Record<string, IsiHucresi> = {};
    const d = DURUM_ADI[r.durum];
    const ton = DURUM_TONU[r.durum];
    const tah = r.tm !== 'termin' ? (r.src === null ? 'sipariş verilmedi, tedarik süresine göre' : 'tedarikçi tarih vermedi') : undefined;
    const gel = r.etkin, plan = r.gerekli;
    const gec = gel !== null && plan !== null && gel > plan + 0.05;
    const kd = ton === 'hata' ? 4 : 2;
    const q = miktar(Math.ceil(r.miktar), r.kod);
    if (r.src !== null && gel !== null) for (let g = g0; g <= Math.min(isiGunu(gec && plan !== null ? plan : gel) - (gec ? 0 : 1), son); g++) hucreKoy(h, `g${g}`, { is: true, etiket: 'yolda' });
    if (gec && plan !== null && gel !== null) for (let g = Math.max(isiGunu(plan), g0); g <= Math.min(isiGunu(gel), son); g++) hucreKoy(h, `g${g}`, { kd, tahmin: tah, etiket: 'eksik' });
    if (r.src === null && r.siparisGun !== null) {
      const gc = r.siparisGun < simdi;
      hucreKoy(h, kis(isiGunu(r.siparisGun)), { kd: gc ? 4 : 1, sm: gc ? 'alert' : 'clock', v: gc ? 'geçti' : 'son', etiket: `en geç sipariş günü ${gunYaz(taban, r.siparisGun)}${gc ? ' (geçti)' : ''}` });
    }
    if (gel !== null) {
      hucreKoy(h, kis(isiGunu(gel)), { sm: 'box', iyi: gec ? undefined : true, kd: gec ? kd : undefined, tahmin: tah, v: gec ? `+${Math.ceil((gel - (plan ?? gel)) / 24)}g` : '', etiket: `geliş ${gunYaz(taban, gel)}` });
    }
    if (plan !== null) hucreKoy(h, kis(isiGunu(plan)), { bayrak: true, v: gec || r.src === null ? q : undefined, etiket: `plan ${gunYaz(taban, plan)} istiyor, ${q}` });
    // Eski anahtar malzeme kodu (asıl satırda sırasıyla); aynı malzemenin ikinci eksiği ayrı satırdır.
    const k0 = r.kod + (r.src !== null ? `-${r.src}` : '');
    const n = anahtarlar.get(k0) ?? 0;
    anahtarlar.set(k0, n + 1);
    return {
      k: n ? `${k0}#${n}` : k0, ad: r.kod, alt: `${malzemeAdi(r.kod)} · ${d}`, simge: 'box', ton, gizli: ton === 'tamam', h, r, d,
    };
  });
  const sira = (x: MalzemeIsiSatiri): number => ISI_SIRA[x.ton === 'tamam' ? 'tamam' : x.ton === 'hata' ? 'hata' : 'uyari'];
  satirlar.sort((a, b) => sira(a) - sira(b));
  const sor = satirlar.filter((x) => x.ton === 'hata');
  const en = sor[0];
  const yeni = l.filter((r) => r.src === null).length;
  const tutarlar = fiyat ? l.filter((r) => r.src !== null).map((r) => fiyat(r.kod, r.miktar)) : [];
  const acikTutar = tutarlar.some((x) => x === null) ? null : tutarlar.reduce<number>((a, x) => a + (x ?? 0), 0);
  const metin = `${en ? `En sıcak satır ${en.ad}: ${en.d.toLocaleLowerCase('tr-TR')}, plan ${gunYaz(taban, en.r.gerekli)} istiyor${en.r.etkin !== null ? `, geliş ${gunYaz(taban, en.r.etkin)}` : ''}. ` : ''}`
    + `${yeni} malzeme için sipariş verilmedi, ${sor.length} malzeme işi geciktirebilir${fiyat ? `; açık alım ${tlYaz(acikTutar)}` : ''}.`;
  return { sutunlar, satirlar, ust: { ton: sor.length ? 'hata' : yeni ? 'uyari' : 'tamam', simge: 'box', metin } };
}
