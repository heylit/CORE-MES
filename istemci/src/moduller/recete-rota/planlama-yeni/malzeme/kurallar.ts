import type { Malzeme, PlanVerisi, Siparis, Urun } from '../tipler.ts';

// Malzeme satın alma planının hesabı (224 a: MRP Planlama'nındır; 205 a: saf işlev). Eski ekranın zt-malzeme-plan.betik'i ve motorun
// matAlloc ile satinalmaListe'si (sunucu/moduller/recete-rota/motor/engine.betik) aynı kuralla yazıldı. Zaman planın başlangıç günü
// 00:00'dan (UTC) saattir (girdi.betik parseT).

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
// Açık satın alma satırı: kalan miktar, söz verilen geliş (saat), tedarikçi ve onun ortalama gecikmesi (saat).
export interface AcikAlim { kod: string; miktar: number; soz: number | null; tedarikci: string | null; gecikme: number }

// Çözülmüş planın işlemi (c-masa.betik opKaydi): iş, başlangıç, bitiş, bitmiş mi.
export interface PlanIslemi { job: string; S: number; C: number; done: boolean }

export interface MrpGirdisi {
  siparisler: readonly Siparis[];
  urunler: readonly Urun[];
  malzemeler: readonly Malzeme[];
  alimlar: readonly AcikAlim[];
  islemler: readonly PlanIslemi[];
  simdi: number;
}

const nesneMi = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sonlu = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sayiOku = (v: unknown): number => sonlu(typeof v === 'string' ? Number(v) : v) ?? 0;

// Kaydedilmiş planın işlemleri; biçimi bozuk işlem atlanır.
export function planIslemleri(plan: unknown): PlanIslemi[] {
  if (!nesneMi(plan) || !nesneMi(plan.ops)) return [];
  const l: PlanIslemi[] = [];
  for (const r of Object.values(plan.ops)) {
    if (!nesneMi(r) || typeof r.job !== 'string') continue;
    const S = sonlu(r.S), C = sonlu(r.C);
    if (S === null) continue;
    l.push({ job: r.job, S, C: C ?? S, done: Boolean(r.done) });
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

// Bir siparişin malzemesi ilk işleminin planlanan başlangıcında gerekir (bitmemiş işlemlerin en erkeni).
export function ilkBaslangiclar(islemler: readonly PlanIslemi[]): Map<string, number> {
  const ilk = new Map<string, number>();
  for (const r of islemler) {
    if (r.done) continue;
    const o = ilk.get(r.job);
    if (o === undefined || r.S < o) ilk.set(r.job, r.S);
  }
  return ilk;
}

export function malzemePlani(g: MrpGirdisi, taban: number, tahsis: Tahsis = tahsisEt(g, taban)): MalzemePlaniHesabi {
  const mats = new Map(g.malzemeler.map((m) => [m.kod, m]));
  const ilk = ilkBaslangiclar(g.islemler);
  const sat: Omit<PlanSatiri, 'fiyat' | 'tutar' | 'gecikti'>[] = [];
  for (const [j, det] of tahsis.isler) {
    const ih = ilk.get(j);
    if (ih === undefined) continue;
    for (const d of det) {
      const m = mats.get(d.kod);
      const once = (sayiOku(m?.muayeneGun) + sayiOku(m?.tedarikGun)) * 24;
      for (const u of d.kullanim) {
        const a = u.k === 'sa' && u.i !== null ? g.alimlar[u.i] : undefined;
        const tur: Kaynak = u.k === 'stok' ? 'stok' : a ? 'acik' : 'yeni';
        sat.push({
          kod: d.kod, j, q: u.q, tur, alimNo: a ? u.i : null, ihtiyac: ih,
          alim: tur === 'acik' ? (a?.soz ?? ih) : tur === 'yeni' ? ih - once : ih, tedarikci: a?.tedarikci ?? null,
        });
      }
      if (d.eksik > 0) sat.push({ kod: d.kod, j, q: d.eksik, tur: 'yeni', alimNo: null, ihtiyac: ih, alim: ih - once, tedarikci: null });
    }
  }
  // Açık siparişin işe bağlanmayan kısmı da ödenecek paradır: stoğa girer.
  g.alimlar.forEach((a, i) => {
    const kullanilan = sat.filter((s) => s.alimNo === i).reduce((x, s) => x + s.q, 0);
    const kalan = a.miktar - kullanilan;
    if (kalan > 1e-6 && a.soz !== null) sat.push({ kod: a.kod, j: null, q: kalan, tur: 'acik', alimNo: i, ihtiyac: a.soz, alim: a.soz, tedarikci: a.tedarikci });
  });
  const satirlar = sat.map((s): PlanSatiri => {
    const bf = mats.get(s.kod)?.birimFiyat;
    const fiyat = typeof bf === 'number' && Number.isFinite(bf) ? bf : null;
    return { ...s, fiyat, tutar: fiyat === null ? null : fiyat * s.q, gecikti: s.tur === 'yeni' && s.alim < g.simdi };
  });
  const plansiz = g.siparisler.filter((s) => s.havuz === true || !ilk.has(s.id)).length;
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
    return { kalem: l.length, tutar: l.some((s) => s.tutar === null) ? null : l.reduce((a, s) => a + (s.tutar ?? 0), 0) };
  };
  return {
    toplam: kutu((s) => s.j !== null), stok: kutu((s) => s.tur === 'stok'), acik: kutu((s) => s.tur === 'acik'), yeni: kutu((s) => s.tur === 'yeni'),
    gecikenMalzeme: new Set(h.satirlar.filter((s) => s.gecikti).map((s) => s.kod)).size,
  };
}

// ---- Satın alma planı (engine.betik satinalmaListe, zt mpDurum) -------------------------------------------------
export type AlimDurumu = 'termin-yok' | 'bagsiz' | 'geciktirir' | 'plandan-gec' | 'erken' | 'karsiliyor' | 'siparis-yok';
export interface AlimPlaniSatiri {
  tur: 'acik' | 'eksik';
  alimNo: number | null;
  kod: string;
  miktar: number;
  tedarikci: string | null;
  isler: string[];
  // Gerekli geliş: malzemeyi kullanan ilk işin planlanan başlangıcı eksi giriş muayenesi.
  gerekli: number | null;
  // En geç: siparişin bolluğu kadar geç (tezgâh sırası yok sayılır; yaklaşık).
  enGec: number | null;
  // Söz verilen geliş (satın almanın termini) ve etkin geliş: söz + tedarikçinin ortalama gecikmesi.
  soz: number | null;
  etkin: number | null;
  // Eksik malzemede en geç sipariş verme anı (en geç - tedarik süresi); tedarik süresi yoksa null.
  siparisEnGec: number | null;
  durum: AlimDurumu;
  // Saat cinsinden fark (durum açıklaması için); yoksa null.
  fark: number | null;
}

interface Ilk { s: number; l: number }

function isIlkleri(g: MrpGirdisi, taban: number): Map<string, Ilk> {
  const sip = new Map(g.siparisler.map((s) => [s.id, s]));
  const bas = new Map<string, number>(), bit = new Map<string, number>();
  for (const r of g.islemler) {
    bit.set(r.job, Math.max(bit.get(r.job) ?? -Infinity, r.C));
    if (!r.done && r.S >= g.simdi - ESIK) bas.set(r.job, Math.min(bas.get(r.job) ?? Infinity, r.S));
  }
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

export function alimDurumu(r: Pick<AlimPlaniSatiri, 'etkin' | 'gerekli' | 'enGec'>): { durum: AlimDurumu; fark: number | null } {
  if (r.etkin === null) return { durum: 'termin-yok', fark: null };
  if (r.gerekli === null) return { durum: 'bagsiz', fark: null };
  if (r.enGec !== null && r.etkin > r.enGec + 1e-6) return { durum: 'geciktirir', fark: r.etkin - r.enGec };
  if (r.etkin > r.gerekli + 1e-6) return { durum: 'plandan-gec', fark: r.etkin - r.gerekli };
  if (r.etkin < r.gerekli - ERTELEME_SAAT) return { durum: 'erken', fark: r.gerekli - r.etkin };
  return { durum: 'karsiliyor', fark: r.gerekli - r.etkin };
}

export function alimPlani(g: MrpGirdisi, taban: number, tahsis: Tahsis = tahsisEt(g, taban)): AlimPlaniSatiri[] {
  const mats = new Map(g.malzemeler.map((m) => [m.kod, m]));
  const ilk = isIlkleri(g, taban);
  const out: AlimPlaniSatiri[] = [];
  for (const x of tahsis.alimlar) {
    const a = g.alimlar[x.i];
    if (!a) continue;
    const js = x.isler.flatMap((u) => { const f = ilk.get(u.j); return f ? [{ j: u.j, ...f }] : []; });
    const gerekli = js.length ? Math.min(...js.map((u) => u.s)) - x.muayene : null;
    const enGec = js.length ? Math.min(...js.map((u) => u.l)) - x.muayene : null;
    const etkin = x.soz === null ? null : x.soz + x.gecikme;
    const d = alimDurumu({ etkin, gerekli, enGec });
    out.push({
      tur: 'acik', alimNo: x.i, kod: a.kod, miktar: a.miktar, tedarikci: a.tedarikci, isler: [...new Set(js.map((u) => u.j))],
      gerekli, enGec, soz: x.soz, etkin, siparisEnGec: null, ...d,
    });
  }
  for (const [j, det] of tahsis.isler) {
    for (const d of det) {
      if (d.eksik <= 0) continue;
      const f = ilk.get(j);
      const m = mats.get(d.kod);
      const mu = sayiOku(m?.muayeneGun) * 24;
      const enGec = f ? f.l - mu : null;
      const tg = typeof m?.tedarikGun === 'number' && Number.isFinite(m.tedarikGun) ? m.tedarikGun : null;
      out.push({
        tur: 'eksik', alimNo: null, kod: d.kod, miktar: d.eksik, tedarikci: null, isler: [j], gerekli: f ? f.s - mu : null, enGec, soz: null, etkin: null,
        siparisEnGec: enGec !== null && tg !== null ? enGec - tg * 24 : null, durum: 'siparis-yok', fark: null,
      });
    }
  }
  return out.sort((a, b) => (a.gerekli ?? 1e9) - (b.gerekli ?? 1e9));
}

export type DurumTonu = 'tamam' | 'uyari' | 'hata' | 'pasif';
export const DURUM_TONU: Record<AlimDurumu, DurumTonu> = {
  'termin-yok': 'pasif', bagsiz: 'pasif', geciktirir: 'hata', 'plandan-gec': 'uyari', erken: 'tamam', karsiliyor: 'tamam', 'siparis-yok': 'hata',
};
export const DURUM_ADI: Record<AlimDurumu, string> = {
  'termin-yok': 'Termin yok', bagsiz: 'Bağlı iş yok', geciktirir: 'Siparişi geciktirir', 'plandan-gec': 'Plandan geç',
  erken: 'Karşılıyor, erken', karsiliyor: 'Karşılıyor', 'siparis-yok': 'Sipariş yok',
};

export function durumSayilari(l: readonly AlimPlaniSatiri[]): Record<'tamam' | 'uyari' | 'hata', number> {
  const say = { tamam: 0, uyari: 0, hata: 0 };
  for (const r of l) { const t = DURUM_TONU[r.durum]; if (t !== 'pasif') say[t]++; }
  return say;
}

// ---- Planın verisinden girdi ------------------------------------------------------------------------------------
// Belgedeki açık satın almalar (sayfanın elle girilen `D.satinalma`'sı) ve tedarikçi gecikmesi (`D.tedarikciler[].ortGecikmeGun`).
export function belgedekiAlimlar(D: PlanVerisi, taban: number): AcikAlim[] {
  const ted = tedarikciGecikmeleri(D);
  const l = Array.isArray(D.satinalma) ? (D.satinalma as unknown[]) : [];
  return l.flatMap((p) => {
    if (!nesneMi(p) || typeof p.kod !== 'string') return [];
    const tedarikci = typeof p.tedarikci === 'string' && p.tedarikci !== '' ? p.tedarikci : null;
    return [{ kod: p.kod, miktar: sayiOku(p.miktar), soz: saatOku(taban, p.gelis), tedarikci, gecikme: tedarikci === null ? 0 : ted(tedarikci) }];
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
