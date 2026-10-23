import { ALAN_AD, KAPALI, MRB_KARAR_BEKLIYOR } from './sabitler.ts';
import type {
  Cihaz, Dof, IzDegisikligi, KmGecis, KmGorunum, KmKayit, KmKoleksiyonu, Lot, Muayene, Ncr, Karakteristik, OlcumSerisi, ParcaKarti, Resim, Tedarikci,
} from './tipler.ts';

// Tarihler uygulamadaki gibi yerel gün (yyyy-aa-gg) olarak hesaplanır: saat dilimi kayması gün sayısını değiştirmesin.
const iki = (n: number): string => String(n).padStart(2, '0');
export const isoGun = (d: Date): string => `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`;
export const bugun = (): string => isoGun(new Date());

function gunOku(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined || [y, m, d].some(Number.isNaN)) return null;
  return new Date(y, m - 1, d);
}

// Ayın son gününü aşan gün o ayın son gününe iner (31 Ocak + 1 ay = 28/29 Şubat).
export function ayEkle(iso: string | null | undefined, ay: number | string | null | undefined): string {
  const d = gunOku(iso);
  if (!d) return '';
  const gun = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(ay || 0));
  const son = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(gun, son));
  return isoGun(d);
}

export function gunKaldi(iso: string | null | undefined, simdi: string = bugun()): number | null {
  const d = gunOku(iso);
  const t = gunOku(simdi);
  if (!d || !t) return null;
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

// Son `gun` gün içinde (bugün dahil, gelecek hariç).
export function icinde(iso: string | null | undefined, gun: number, simdi: string = bugun()): boolean {
  const k = gunKaldi(iso, simdi);
  return k !== null && k <= 0 && k >= -gun;
}

export type KmTon = 'iyi' | 'uyari' | 'kotu' | 'bilgi' | '';

export interface CihazDurumu { metin: string; ton: KmTon; sonraki?: string; kalan?: number; kullanilir: boolean }

export function devDurumu(d: Cihaz | null | undefined, simdi: string = bugun()): CihazDurumu {
  if (!d) return { metin: '—', ton: '', kullanilir: false };
  if (d.kullanimDisi) return { metin: 'Kullanım dışı', ton: '', kullanilir: false };
  if (!d.sonKal) return { metin: 'Kayıt yok', ton: 'kotu', kullanilir: false };
  const sonraki = ayEkle(d.sonKal, d.periyot || 12);
  const kalan = gunKaldi(sonraki, simdi) ?? 0;
  if (kalan < 0) return { metin: 'Süresi doldu', ton: 'kotu', sonraki, kalan, kullanilir: false };
  if (kalan <= 30) return { metin: 'Yaklaşıyor', ton: 'uyari', sonraki, kalan, kullanilir: true };
  return { metin: 'Geçerli', ton: 'iyi', sonraki, kalan, kullanilir: true };
}

export const tedarikciNcr = (s: Tedarikci, ncr: readonly Ncr[], simdi: string = bugun()): number =>
  ncr.filter((x) => x.tedarikci === s._id && icinde(x.tarih, 365, simdi)).length;

export function tedarikciRiski(s: Tedarikci, ncr: readonly Ncr[], simdi: string = bugun()): string[] {
  const r: string[] = [];
  if (s.sertBitis) {
    const k = gunKaldi(s.sertBitis, simdi);
    if (k !== null && k < 0) r.push('Sertifika süresi dolmuş');
    else if (k !== null && k <= 60) r.push(`Sertifika ${k} gün içinde bitiyor`);
  }
  if ((s.kategori === 'Elektronik komponent' || s.kategori === 'Distribütör') && s.yetkili === 'Hayır') r.push('Sahte parça riski: yetkisiz kaynak');
  if (s.onay === 'Askıda') r.push('Onay askıda');
  const n = tedarikciNcr(s, ncr, simdi);
  if (n >= 3) r.push(`Son 12 ayda ${n} uygunsuzluk`);
  if (s.kaliteSkor !== null && s.kaliteSkor !== undefined && s.kaliteSkor < 70) r.push('Kalite skoru 70 altında');
  return r;
}

// Sınıf: 0,6 kalite + 0,4 teslimat; A ≥ 85, B ≥ 70.
export function tedarikciNotu(s: Pick<Tedarikci, 'kaliteSkor' | 'teslimatSkor'>): { metin: 'A' | 'B' | 'C'; ton: KmTon; puan: number } {
  const puan = 0.6 * Number(s.kaliteSkor ?? 0) + 0.4 * Number(s.teslimatSkor ?? 0);
  if (puan >= 85) return { metin: 'A', ton: 'iyi', puan };
  if (puan >= 70) return { metin: 'B', ton: 'uyari', puan };
  return { metin: 'C', ton: 'kotu', puan };
}

export const dofGecikti = (c: Dof, simdi: string = bugun()): boolean => c.durum !== KAPALI && !!c.termin && (gunKaldi(c.termin, simdi) ?? 0) < 0;
export const ncrTonu = (durum: string | undefined): KmTon => (durum === KAPALI ? 'iyi' : durum === 'Açık' ? 'kotu' : 'uyari');
export const ciddiyetTonu = (c: string | undefined): KmTon => (c === 'Kritik' ? 'kotu' : c === 'Majör' ? 'uyari' : 'bilgi');
export const sonucTonu = (s: string | undefined): KmTon => (s === 'Kabul' ? 'iyi' : s === 'Ret' ? 'kotu' : 'uyari');

const sayi = (v: unknown): number => parseFloat(String(v ?? '').replace(',', '.'));

// Nitel karakteristik seçimle, nicel olan nominal ± tolerans içinde mi diye karar verir; değer yoksa boş.
export function karakteristikSonucu(c: Karakteristik): 'OK' | 'NOK' | '' {
  if (c.tip === 'Nitel') return c.olcum === 'Uygun' ? 'OK' : c.olcum === 'Uygun değil' ? 'NOK' : '';
  const m = sayi(c.olcum);
  const n = sayi(c.nominal);
  const alt = Math.abs(sayi(c.alt || 0) || 0);
  const ust = Math.abs(sayi(c.ust || 0) || 0);
  if (Number.isNaN(m) || Number.isNaN(n)) return '';
  return m >= n - alt - 1e-9 && m <= n + ust + 1e-9 ? 'OK' : 'NOK';
}

// Tamamlanmış kayıt kilitlidir: değiştirmek kilit açma (gerekçe, onay işlemi) ister; sunucu da ayrıca reddeder.
export function kilitliMi(kol: KmKoleksiyonu, r: KmKayit | null | undefined): boolean {
  if (!r) return false;
  if (kol === 'insp') return ['Kabul', 'Ret'].includes(String(r.sonuc ?? ''));
  if (kol === 'ncr' || kol === 'capa') return r.durum === KAPALI;
  if (kol === 'lot') return !!r.karar && r.tip !== 'reset';
  if (kol === 'frm') return r.durum === 'Onaylandı';
  return false;
}

export interface KarantinaKalemi {
  baslik: string; ref: string; parcaNo: string; lot: string; miktar: number; yas: number; ton: 'kotu' | 'uyari'; eylem: string;
  hedef: KmGorunum; gecis: KmGecis;
}

// Karar bekleyen ürün: MRB kararı bekleyen NCR, beklemedeki muayene, NCR'si açılmamış reddedilen lot. Kötü olan önce, sonra eski olan.
export function karantina(v: { ncr: readonly Ncr[]; insp: readonly Muayene[]; lot: readonly Lot[] }, simdi: string = bugun()): KarantinaKalemi[] {
  const yas = (t: string | undefined) => -(gunKaldi(t, simdi) ?? 0);
  const q: KarantinaKalemi[] = [];
  v.ncr.filter((n) => n.durum !== KAPALI && (n.mrb || MRB_KARAR_BEKLIYOR) === MRB_KARAR_BEKLIYOR).forEach((n) => q.push({
    baslik: 'MRB kararı bekliyor', ref: n.no ?? '', parcaNo: n.parcaNo ?? '', lot: n.lot ?? '', miktar: Number(n.miktar || 0), yas: yas(n.tarih),
    ton: n.ciddiyet === 'Kritik' ? 'kotu' : 'uyari', eylem: 'Karar ver', hedef: 'uygunsuzluklar', gecis: { ac: n._id },
  }));
  v.insp.filter((i) => i.sonuc === 'Beklemede').forEach((i) => q.push({
    baslik: i.tur === 'FAI' ? 'FAI belgeleri eksik' : 'Belge / kaynak doğrulaması bekliyor', ref: i.no ?? '', parcaNo: i.parcaNo ?? '', lot: i.lot ?? '',
    miktar: Number(i.miktar || 0), yas: yas(i.tarih), ton: 'uyari', eylem: 'Tamamla', hedef: 'muayeneler', gecis: { ac: i._id },
  }));
  v.lot.filter((l) => l.tip !== 'reset' && l.karar === 'Ret' && !v.ncr.some((n) => n.lot && n.lot === l.lotNo && n.parcaNo === l.parcaNo)).forEach((l) => q.push({
    baslik: 'Reddedilen lot, NCR açılmamış', ref: l.no ?? '', parcaNo: l.parcaNo ?? '', lot: l.lotNo ?? '', miktar: Number(l.N || 0), yas: yas(l.tarih), ton: 'kotu',
    eylem: 'NCR aç', hedef: 'uygunsuzluklar', gecis: { ac: 'yeni', on: lottanNcr(l) },
  }));
  return q.sort((a, b) => (a.ton === 'kotu' ? 0 : 1) - (b.ton === 'kotu' ? 0 : 1) || b.yas - a.yas);
}

// Reddedilen lottan açılan NCR'nin ön değerleri (uygulamadaki ncrFromLot).
export function lottanNcr(l: Lot): Partial<Ncr> {
  return {
    kaynak: l.tedarikci ? 'Giriş muayene' : 'Final muayene', ciddiyet: Number(l.bKr) > 0 ? 'Kritik' : 'Majör', parcaNo: l.parcaNo, parcaAdi: l.parcaAdi,
    lot: l.lotNo, miktar: l.N ?? null, tedarikci: l.tedarikci,
    tanim: `${l.no ?? ''} AQL lot muayenesinde ret. Bulunan kritik / majör / minör: ${l.bKr ?? 0} / ${l.bMj ?? 0} / ${l.bMn ?? 0}.`,
  };
}

export const parcaAnahtari = (pn: unknown): string => String(pn ?? '').trim().toLocaleUpperCase('tr');

export interface ParcaOzeti {
  k: string; no: string; ad: string; son: string; meta: ParcaKarti | null;
  cizim: Resim[]; insp: Muayene[]; ncr: Ncr[]; lot: Lot[]; spc: OlcumSerisi[]; capa: Dof[];
  acikNcr: Ncr[]; sonMuayene: { t?: string; s?: string; no?: string } | null; yarim: Muayene[]; balonlu: Resim[]; rev: string; tedarikci: string;
}

interface DizinGirdisi {
  cizim: readonly Resim[]; insp: readonly Muayene[]; ncr: readonly Ncr[]; lot: readonly Lot[]; spc: readonly OlcumSerisi[]; capa: readonly Dof[];
  parca: readonly ParcaKarti[];
}

// Parça dizini kayıtlardan türetilir (parça kartı olmasa da); en son hareket gören önce.
export function parcaDizini(v: DizinGirdisi): ParcaOzeti[] {
  const m = new Map<string, ParcaOzeti>();
  const dokun = (pn: unknown, ad: unknown, tarih: unknown): ParcaOzeti | null => {
    if (!pn || !String(pn).trim()) return null;
    const k = parcaAnahtari(pn);
    let p = m.get(k);
    if (!p) {
      p = { k, no: String(pn).trim(), ad: '', son: '', meta: null, cizim: [], insp: [], ncr: [], lot: [], spc: [], capa: [], acikNcr: [], sonMuayene: null, yarim: [], balonlu: [], rev: '', tedarikci: '' };
      m.set(k, p);
    }
    if (ad && !p.ad) p.ad = String(ad);
    if (typeof tarih === 'string' && tarih > p.son) p.son = tarih;
    return p;
  };
  v.cizim.forEach((d) => dokun(d.parcaNo, d.parcaAdi, d.tarih)?.cizim.push(d));
  v.insp.forEach((d) => dokun(d.parcaNo, d.parcaAdi, d.tarih)?.insp.push(d));
  v.ncr.forEach((d) => dokun(d.parcaNo, d.parcaAdi, d.tarih)?.ncr.push(d));
  v.lot.filter((l) => l.tip !== 'reset').forEach((d) => dokun(d.parcaNo, d.parcaAdi, d.tarih)?.lot.push(d));
  v.spc.forEach((d) => dokun(d.parcaNo, d.parcaAdi, d.tarih)?.spc.push(d));
  v.capa.forEach((c) => {
    const n = c.ncrRef ? v.ncr.find((x) => x._id === c.ncrRef) : undefined;
    if (n) m.get(parcaAnahtari(n.parcaNo))?.capa.push(c);
  });
  v.parca.forEach((x) => {
    const p = dokun(x.parcaNo, x.ad, x.guncelleme ? x.guncelleme.slice(0, 10) : '');
    if (p) {
      p.meta = x;
      if (x.ad) p.ad = x.ad;
    }
  });
  for (const p of m.values()) {
    p.acikNcr = p.ncr.filter((n) => n.durum !== KAPALI);
    const hepsi = [...p.insp.map((i) => ({ t: i.tarih, s: i.sonuc, no: i.no })), ...p.lot.map((l) => ({ t: l.tarih, s: l.karar, no: l.no }))]
      .sort((a, b) => (b.t || '').localeCompare(a.t || ''));
    p.sonMuayene = hepsi[0] ?? null;
    p.yarim = p.insp.filter((i) => i.adimli && i.sonuc === 'Devam ediyor');
    p.balonlu = p.cizim.filter((d) => (d.balonlar || []).length);
    p.rev = [...p.cizim].sort((a, b) => (b.tarih || '').localeCompare(a.tarih || ''))[0]?.rev || '';
    p.tedarikci = p.meta?.tedarikci || (p.lot.find((l) => l.tedarikci) ?? p.insp.find((i) => i.tedarikci))?.tedarikci || '';
  }
  return [...m.values()].sort((a, b) => (b.son || '').localeCompare(a.son || '') || a.no.localeCompare(b.no));
}

export function parcaDurumu(p: ParcaOzeti): { metin: string; ton: KmTon } {
  if (p.acikNcr.some((n) => n.ciddiyet === 'Kritik')) return { metin: 'Kritik NCR', ton: 'kotu' };
  if (p.acikNcr.length) return { metin: 'Açık NCR', ton: 'uyari' };
  if (p.yarim.length) return { metin: 'Ölçüm sürüyor', ton: 'bilgi' };
  if (p.sonMuayene) return { metin: p.sonMuayene.s || '—', ton: sonucTonu(p.sonMuayene.s) };
  return { metin: 'Muayene yok', ton: '' };
}

// Tedarikçi ppm'i: dönemde teslim alınan (lot ve giriş muayenesi) miktara karşı NCR'deki etkilenen miktar. Teslim yoksa null.
export function tedarikciPpm(v: { lot: readonly Lot[]; insp: readonly Muayene[]; ncr: readonly Ncr[] }, gun: number, simdi: string = bugun()) {
  const by: Record<string, { r: number; b: number }> = {};
  const ekle = (id: string, k: 'r' | 'b', n: number) => { (by[id] ??= { r: 0, b: 0 })[k] += n; };
  v.lot.filter((l) => l.tip !== 'reset' && !l.yenidenSunum && l.tedarikci && icinde(l.tarih, gun, simdi)).forEach((l) => ekle(l.tedarikci!, 'r', Number(l.N || 0)));
  v.insp.filter((i) => i.tur === 'Giriş' && i.tedarikci && icinde(i.tarih, gun, simdi)).forEach((i) => ekle(i.tedarikci!, 'r', Number(i.miktar || 0)));
  v.ncr.filter((n) => n.tedarikci && icinde(n.tarih, gun, simdi)).forEach((n) => ekle(n.tedarikci!, 'b', Number(n.miktar || 0)));
  const r = Object.values(by).reduce((a, x) => a + x.r, 0);
  const b = Object.values(by).reduce((a, x) => a + x.b, 0);
  return { toplam: r ? Math.round((b / r) * 1e6) : null, r, b, by };
}

const izKisa = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return `${v.length} öğe`;
  if (typeof v === 'object') return '{…}';
  const s = String(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
};

// Değişiklik izinin alan farkı; damga ve kimlik sayılmaz, PIN gösterilmez, en çok 30 alan.
export function izFarki(once: Record<string, unknown> | null, sonra: Record<string, unknown>): IzDegisikligi[] {
  if (!once) return [];
  const out: IzDegisikligi[] = [];
  for (const k of new Set([...Object.keys(once), ...Object.keys(sonra)])) {
    if (k === 'guncelleme' || k === '_id') continue;
    if (JSON.stringify(once[k] ?? null) === JSON.stringify(sonra[k] ?? null)) continue;
    out.push({ alan: ALAN_AD[k] ?? k, eski: k === 'pin' ? '***' : izKisa(once[k]), yeni: k === 'pin' ? '***' : izKisa(sonra[k]) });
  }
  return out.slice(0, 30);
}

export const izNo = (r: Record<string, unknown> | null | undefined): string =>
  r ? String(r.no || r.kod || r.ad || r.parcaNo || '') : '';
