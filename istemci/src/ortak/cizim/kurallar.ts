import { AKTol } from './cekirdek.ts';
import { olcuTuruAdi, type Ayiklama, type GuvenSeviyesi, type OlcuOnerisi, type YaziKutusu } from './okuma.ts';

// Çizim stüdyosu ve teknik resim görüntüleyicisinin saf kuralları (pdf.ts okuma ayarları, balon-yerlesimi.ts, model-3b.ts, cizim-studyosu.ts,
// teknik-resim.ts). Eşliği kurallar.test.ts eski modüllerle sınar.

/* ── Okuma ayarları: Çizim stüdyosunda denenir; sistemde geçerli olan cihazda 'readCfg', pakette readCfg ── */
export type Gorunus = 'net' | 'blue' | 'orig';
export type OcrKipi = 'auto' | 'always' | 'off';
export type AgKalitesi = 'coarse' | 'normal' | 'fine';
export type OnEksen = 'auto' | 'X' | 'Y' | 'Z';
export interface OkumaAyari {
  res: number; bold: number; look: Gorunus; ocr: OcrKipi; dpi: number; minDims: number; ex: Required<Ayiklama>; auto: GuvenSeviyesi; balS: number;
  mesh: AgKalitesi; hidden: boolean; fa: OnEksen; autoDim: boolean;
}
export type AyarAnahtari = keyof OkumaAyari;
export const OKUMA_VARSAYILANI: Readonly<OkumaAyari> = {
  res: 4200, bold: 1, look: 'net', ocr: 'auto', dpi: 3.2, minDims: 3, ex: { table: true, border: true, notes: true, prose: true }, auto: 'mid', balS: 1,
  mesh: 'normal', hidden: true, fa: 'auto', autoDim: true,
};
// Eksik alan varsayılanla dolar; 'tint' eski varsayılandı, net olur.
export function ayarDuzelt(c: unknown): OkumaAyari {
  const g = (c && typeof c === 'object' ? c : {}) as Partial<OkumaAyari> & { look?: string; ex?: Partial<Ayiklama> };
  const o = { ...OKUMA_VARSAYILANI, ...g, ex: { ...OKUMA_VARSAYILANI.ex, ...(g.ex || {}) } } as OkumaAyari & { look: string };
  if ((o.look as string) === 'tint') o.look = 'net';
  return o;
}
export const PDF_ANAHTARLARI: readonly AyarAnahtari[] = ['res', 'ocr', 'dpi', 'minDims', 'ex', 'auto'];
export const GORUNUS_ANAHTARLARI: readonly AyarAnahtari[] = ['bold', 'look'];
export const MODEL_ANAHTARLARI: readonly AyarAnahtari[] = ['mesh', 'hidden', 'fa', 'autoDim'];
// Önbellek anahtarına giren ayar imzası: varsayılanda boştur, eski önbellek geçerli kalır.
export function ayarImzasi(c: OkumaAyari, keys: readonly AyarAnahtari[]): string {
  const o: Record<string, unknown> = {}; let diff = false;
  keys.forEach((k) => { o[k] = c[k]; if (JSON.stringify(c[k]) !== JSON.stringify(OKUMA_VARSAYILANI[k])) diff = true; });
  if (!diff) return '';
  let h = 0; const t = JSON.stringify(o);
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
  return '~' + (h >>> 0).toString(36);
}
// Metin katmanı yoksa ya da ölçüler çizgiye dönüşmüşse (karışık PDF: antet yazı, ölçüler çizgi) görüntüden tamamlanır.
export const ocrGerekir = (cf: Pick<OkumaAyari, 'ocr' | 'minDims'>, metinsiz: boolean, olcuSayisi: number): boolean =>
  cf.ocr === 'always' || (cf.ocr !== 'off' && (metinsiz || olcuSayisi < (cf.minDims || 3)));

/* ── 3B model ── */
export const AG_SAPMASI: Readonly<Record<AgKalitesi, number>> = { coarse: 0.003, normal: 0.0012, fine: 0.0005 };
export const modelAdiMi = (n: string): boolean => /\.(step|stp|p21|igs|iges|stl)$/i.test(n);
export type DosyaBicimi = 'pdf' | 'step' | 'iges' | 'stl' | null;
// Dosya türü adından ya da ilk baytlarından (openBytes).
export function dosyaBicimi(ad: string, bas: string): DosyaBicimi {
  const low = ad.toLowerCase();
  if (low.endsWith('.pdf') || bas.startsWith('%PDF')) return 'pdf';
  if (/\.(step|stp|p21)$/.test(low) || bas.indexOf('ISO-10303-21') >= 0) return 'step';
  if (/\.(igs|iges)$/.test(low)) return 'iges';
  if (/\.stl$/.test(low)) return 'stl';
  return null;
}

/* ── Balon yerleşimi: üst üste binmeyi önler, boş yere kaydırır, ölçüye kılavuz çizgi çeker ── */
export interface Balon {
  id: number; x: number; y: number; ar?: YaziKutusu; l?: string; nom: string; tol?: string; min: number; max: number; tool?: string; gauge?: boolean;
  m?: 'cmm' | 'man'; freq?: string; crit?: boolean; [k: string]: unknown;
}
export interface BalonKonumu { x: number; y: number; lead: [number, number, number, number] | null }
export interface Yerlesim { s: number; pos: Record<number, BalonKonumu> }

// Yazı kutusunun (döndürülmüş) balona en yakın noktası.
export function kutuNoktasi(ar: YaziKutusu, px: number, py: number): [number, number] {
  const c = Math.cos(ar[4]), s = Math.sin(ar[4]), dx = px - ar[0], dy = py - ar[1];
  const lu = Math.max(-ar[2], Math.min(ar[2], dx * c + dy * s)), lv = Math.max(-ar[3], Math.min(ar[3], -dx * s + dy * c));
  return [ar[0] + lu * c - lv * s, ar[1] + lu * s + lv * c];
}
export function balonYerlesimi(bal: readonly Pick<Balon, 'id' | 'x' | 'y' | 'ar'>[] | null | undefined, U: number, W: number, H: number,
  ink: Uint8Array | null | undefined): Yerlesim {
  const out: Yerlesim = { s: 1, pos: {} };
  if (!bal || !bal.length) return out;
  const R0 = 16 * U;
  const anc = bal.map((b): [number, number] => (b.ar ? [b.ar[0], b.ar[1]] : [b.x, b.y]));
  // Yoğun resimde balonlar küçülür (en yakın komşu mesafesinin ortancasına göre).
  if (bal.length > 2) {
    const nn = anc.map((a, i) => {
      let m = 1e9; anc.forEach((b, j) => { if (i !== j) m = Math.min(m, Math.hypot(a[0] - b[0], a[1] - b[1])); }); return m;
    }).sort((a, b) => a - b);
    const med = nn[nn.length >> 1]!;
    out.s = Math.max(0.62, Math.min(1, med / (R0 * 3.2)));
  }
  const R = R0 * out.s, gap = R * 0.22;
  const placed: [number, number][] = [];
  const boxes = bal.filter((b) => b.ar).map((b) => b.ar!);
  const inkCost = (x: number, y: number) => {
    if (!ink) return 0;
    let n = 0; const r = R * 0.95;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      for (const f of [0.45, 0.95]) {
        const px = Math.round(x + Math.cos(a) * r * f), py = Math.round(y + Math.sin(a) * r * f);
        if (px > 0 && py > 0 && px < W && py < H && ink[py * W + px]) n++;
      }
    }
    return n / 32;
  };
  const hitsText = (x: number, y: number) => boxes.some((ar) => { const p = kutuNoktasi(ar, x, y); return Math.hypot(p[0] - x, p[1] - y) < R * 0.95; });
  const overlap = (x: number, y: number) => {
    let o = 0; for (const p of placed) { const d = Math.hypot(p[0] - x, p[1] - y); if (d < 2 * R + gap) o += (2 * R + gap - d); } return o;
  };
  const inside = (x: number, y: number) => x > R && y > R && x < W - R && y < H - R;
  bal.forEach((b, i) => {
    const a = anc[i]!, own = b.ar || null;
    let best: [number, number];
    // Yazısı bilinen balon: yazının hemen üstü (sağa yakın), yazıyı örtmeden.
    let pref: [number, number] = [b.x, b.y];
    if (own) {
      const c = Math.cos(own[4]), sn = Math.sin(own[4]), lu = own[2] * 0.55, lv = -(own[3] + R * 1.2);
      pref = [own[0] + lu * c - lv * sn, own[1] + lu * sn + lv * c];
    }
    const ok0 = inside(pref[0], pref[1]) && overlap(pref[0], pref[1]) === 0 && !hitsText(pref[0], pref[1]) && inkCost(pref[0], pref[1]) < 0.35;
    if (ok0) best = pref;
    else {
      const base = own ? Math.max(own[2], own[3]) : 0, cands: [number, number, number][] = [];
      for (const k of [1.25, 1.75, 2.4, 3.2, 4.3, 5.6]) {
        for (let t = 0; t < 16; t++) {
          const ang = -Math.PI / 4 + t * Math.PI / 8, rr = base + R * k * (own ? 1 : 1.1);
          const x = a[0] + Math.cos(ang) * rr, y = a[1] + Math.sin(ang) * rr;
          if (!inside(x, y)) continue;
          const cost = overlap(x, y) * 50 + (hitsText(x, y) ? R * 6 : 0) + inkCost(x, y) * R * 5 + Math.hypot(x - pref[0], y - pref[1]) * 0.35 + rr * 0.5;
          cands.push([cost, x, y]);
        }
      }
      cands.sort((p, q) => p[0] - q[0]);
      best = cands.length ? [cands[0]![1], cands[0]![2]] : pref;
    }
    placed.push(best);
    let lead: BalonKonumu['lead'] = null;
    if (own) {
      const p = kutuNoktasi(own, best[0], best[1]), d = Math.hypot(p[0] - best[0], p[1] - best[1]);
      if (d > R * 1.02) { const k = R / d; lead = [best[0] + (p[0] - best[0]) * k, best[1] + (p[1] - best[1]) * k, p[0], p[1]]; }
    } else {
      const d = Math.hypot(a[0] - best[0], a[1] - best[1]);
      if (d > R * 0.6) { const k = R / d; lead = [best[0] + (a[0] - best[0]) * k, best[1] + (a[1] - best[1]) * k, a[0], a[1]]; }
    }
    out.pos[b.id] = { x: best[0], y: best[1], lead };
  });
  return out;
}
// Eski paketler: balonun ait olduğu yazı bulunur (kılavuz çizgi ve yazıyı örtmeme için).
export function balonYazisi<B extends Balon>(b: B, olculer: readonly Pick<OlcuOnerisi, 'nom' | 'x' | 'y' | 'ar'>[] | null | undefined, W: number): B {
  if (b.ar || !olculer || !olculer.length) return b;
  let best: Pick<OlcuOnerisi, 'ar'> | null = null, bd = W * 0.05;
  for (const d of olculer) { if (d.nom !== b.nom) continue; const q = Math.hypot(d.x - b.x, d.y - b.y); if (q < bd) { bd = q; best = d; } }
  return best ? { ...b, ar: best.ar } : b;
}

/* ── Kontrol noktaları ── */
export type OlcumYontemi = 'cmm' | 'man';
// Ölçüm yöntemi: CMM (koordinat ölçme makinesi) ya da Elle (el aleti).
export const yontem = (b: Pick<Balon, 'm' | 'tool'>): OlcumYontemi => b.m || (b.tool === 'CMM' ? 'cmm' : 'man');
export const YONTEM_ADI: Readonly<Record<OlcumYontemi, string>> = { cmm: 'CMM', man: 'Elle' };

export interface Olcum { v: number | string; ok: boolean; at: number; edge?: boolean; gid?: string; gno?: string }
export type OlcumKarari =
  | { tur: 'kaydet'; v: number | string; ok: boolean }
  | { tur: 'oneri'; v: number; alt: number }
  | { tur: 'yok' };
// Ölçülen değer: mastarda Geçer/Geçmez; sayıda sınırla karşılaştırma. Tolerans dışı değer virgül kaymasıyla uyuyorsa önce önerilir.
export function olcumDegerlendir(b: Pick<Balon, 'gauge' | 'min' | 'max'>, girdi: string, zorla?: 'ok' | 'nok' | null, deger?: number | null): OlcumKarari {
  if (b.gauge) { const ok = zorla === 'ok'; return { tur: 'kaydet', v: ok ? 'Geçer' : 'Geçmez', ok }; }
  const v = deger != null ? deger : parseFloat(String(girdi).replace(',', '.'));
  if (isNaN(v)) return { tur: 'yok' };
  const ok = v >= b.min - 1e-9 && v <= b.max + 1e-9;
  if (!ok && deger == null) {
    const alts = [10, 0.1, 100, 0.01, 1000, 0.001].map((f) => +(v * f).toFixed(4)).filter((x) => x >= b.min - 1e-9 && x <= b.max + 1e-9);
    if (alts.length) return { tur: 'oneri', v, alt: alts[0]! };
  }
  return { tur: 'kaydet', v, ok };
}
// 3B resmin önerileri yazı kutusu taşımaz (yazı katmanı yoktur).
export type Oneri = Omit<OlcuOnerisi, 'ar'> & { ar?: YaziKutusu | undefined };
// Seçilen öneriler kontrol noktası olur; numaralar sonuncudan devam eder.
export function onerileriEkle(bal: readonly Balon[], oneriler: readonly Oneri[]): Balon[] {
  const base = bal.reduce((a, x) => Math.max(a, x.id), 0);
  return [...bal, ...oneriler.filter((p) => p.on).map((p, i): Balon => ({
    id: base + i + 1, x: p.x, y: p.y, ar: p.ar, l: p.l, nom: p.nom, tol: p.tol, min: p.min, max: p.max, tool: p.tool, gauge: p.gauge, m: p.tool === 'CMM' ? 'cmm' : 'man',
  }))];
}
// Nokta silinince kalanlar 1'den yeniden numaralanır, ölçümler yeni numarasıyla kalır.
export function balonCikar<O>(bal: readonly Balon[], olcum: Readonly<Record<number, O>>, id: number): { bal: Balon[]; olcum: Record<number, O> } {
  const kalan = bal.filter((x) => x.id !== id);
  const yeni: Record<number, O> = {};
  kalan.forEach((x, i) => { const m = olcum[x.id]; if (m) yeni[i + 1] = m; });
  return { bal: kalan.map((x, i) => ({ ...x, id: i + 1 })), olcum: yeni };
}
// Elle girilen ölçü metni ayrıştırılır; anlaşılmazsa null.
export function noktaAlanlari(metin: string, etiket: string, cls: string) {
  const p = AKTol.parse(metin, { cls });
  if (!p) return null;
  return { nom: p.nomText, tol: p.tolText, min: p.min, max: p.max, tool: p.tool, gauge: p.gauge, l: etiket || p.label || olcuTuruAdi(p) };
}
// Düzenlemede ölçünün resimdeki yazımı (adet "3× " biçiminden "3x "e; açık tolerans eklenir).
export function duzenlemeMetni(b: Pick<Balon, 'nom' | 'tol'>): string {
  const tol = b.tol ?? '';
  return b.nom.replace(/^(\d+)× /, '$1x ') + (/^[±+−-]/.test(tol) && !/2768/.test(tol) && !/ [A-Za-z]{1,2}\d/.test(b.nom) ? ' ' + tol.replace(/−/g, '-').replace(' / ', '/') : '');
}
// Yeni öneriler, listede ya da resimde aynı yerde aynı ölçü yoksa eklenir.
export function yeniOneriler<O extends Oneri>(oneriler: readonly O[], mevcut: readonly Oneri[], bal: readonly Balon[], W: number): O[] {
  return oneriler.filter((p) => !mevcut.some((q) => q.nom === p.nom && Math.hypot(q.tx - p.tx, q.ty - p.ty) < W * 0.01)
    && !bal.some((q) => q.ar && q.nom === p.nom && Math.hypot(q.ar[0] - p.tx, q.ar[1] - p.ty) < W * 0.01));
}
export const OLCUM_RAPORU_BASLIKLARI = ['No', 'Etiket', 'Ölçü', 'Tolerans', 'Min', 'Max', 'Ölçü aleti', 'Yöntem', 'Ölçülen', 'Sonuç', 'Zaman'];
export function olcumRaporu(bal: readonly Balon[], olcum: Readonly<Record<number, Olcum>>, zaman: (t: number) => string): string {
  const rows: unknown[][] = [OLCUM_RAPORU_BASLIKLARI, ...bal.map((x) => {
    const r = olcum[x.id];
    return [x.id, x.l, x.nom, x.tol, x.min, x.max, x.tool, YONTEM_ADI[yontem(x)], r ? r.v : '', r ? (r.ok ? 'UYGUN' : 'RED') : 'ÖLÇÜLMEDİ', r ? zaman(r.at) : ''];
  })];
  return String.fromCharCode(0xfeff) + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
}
// Tolerans çubuğu: sınırlar çubuğun yüzde 15 ve 85'inde, işaret ölçülen değerde.
export function toleransKonumu(b: Pick<Balon, 'gauge' | 'min' | 'max'>, v: number): number {
  const span = !b.gauge ? (b.max - b.min || 1e-6) : 1, lo = b.min - span * 0.2 / 0.7, hi = b.max + span * 0.2 / 0.7;
  return Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
}

/* ── Çizim stüdyosu çalışması: PDF ve 3B model birlikte (iş paketindeki gibi), ayarlar ve balonlar ── */
// Arkon paketinin dosya kaydıyla (arkon/shared/model.ts PkgFile) aynı biçim; ortak parça Arkon'u ithal etmediği için burada yazılır.
export interface PaketDosyasi { kind: 'pdf' | 'model' | 'img' | string; name: string; bytes?: Uint8Array; size?: number; key?: string; page?: number; merkez?: number; merkezOzet?: string; [k: string]: unknown }
export type CalismaDosyasi = PaketDosyasi & { bytes: Uint8Array };
export interface Calisma {
  id: string; name: string; files: CalismaDosyasi[]; primary: string | null; bal: Balon[]; rev: number; saved: boolean; from?: string;
}
export interface KayitliCizim { id: string; name: string; files: CalismaDosyasi[]; primary: string | null; bal: Balon[]; cfg?: unknown; updatedAt: number }
export const yeniCalisma = (simdi: number, rastgele: string): Calisma =>
  ({ id: 'dr-' + simdi.toString(36) + rastgele, name: '', files: [], primary: null, bal: [], rev: simdi, saved: false });
export const dosyaTuru = (n: string): 'pdf' | 'model' => (/\.pdf$/i.test(n) ? 'pdf' : 'model');
export const dosyaEtiketi = (f: Pick<PaketDosyasi, 'kind' | 'name'>): string => (f.kind === 'pdf' ? 'PDF' : (f.name.split('.').pop() ?? '').toUpperCase().slice(0, 4));
const adsiz = (ad: string) => ad.replace(/\.[^.]+$/, '');
// Dosya çalışmaya girer: aynı türden olanın yerine geçer; PDF varsa ana resim PDF'tir. Ana resim değişince balonlar sıfırlanır.
export function calismayaEkle(w: Calisma, f: CalismaDosyasi, simdi: number): Calisma {
  const files = w.files.filter((x) => x.kind !== f.kind).concat([f]);
  const primary = f.kind === 'pdf' ? f.name : (w.primary && files.some((x) => x.name === w.primary) ? w.primary : f.name);
  return { ...w, files, primary, bal: primary !== w.primary ? [] : w.bal, rev: simdi, saved: false, name: w.name || adsiz(f.name) };
}
export function calismadanCikar(w: Calisma, tur: string, simdi: number): Calisma {
  const files = w.files.filter((x) => x.kind !== tur);
  const primary = files.some((x) => x.name === w.primary) ? w.primary : files[0]?.name ?? null;
  return { ...w, files, primary, bal: primary !== w.primary ? [] : w.bal, rev: simdi, saved: false };
}
export const anaResimSec = (w: Calisma, ad: string, simdi: number): Calisma =>
  (w.primary === ad ? w : { ...w, primary: ad, bal: [], rev: simdi, saved: false });
// Kaydedilen çizim (draws): ad boşsa ana resmin adı, o da yoksa "Çizim".
export const cizimKaydi = (w: Calisma, cfg: OkumaAyari, simdi: number): KayitliCizim =>
  ({ id: w.id, name: (w.name || w.primary || 'Çizim').trim(), files: w.files, primary: w.primary, bal: w.bal, cfg, updatedAt: simdi });

export interface PaketAktarimi { files: boolean; plan: boolean; cfg: boolean }
export interface PaketOzeti {
  id: string; no: string; part?: string; partNo?: string; primary?: string | null; files?: CalismaDosyasi[];
  plan?: Balon[]; readCfg?: unknown; updatedAt?: number;
}
// İş paketine aktarım: dosyalar, kontrol planı (balonlar; paketteki aynı satırın sıklık ve kritiklik bilgisi korunur) ve okuma ayarı.
export function paketDegisikligi(p: PaketOzeti, w: Calisma, secim: PaketAktarimi, cfg: OkumaAyari, simdi: number): Record<string, unknown> {
  const ch: Record<string, unknown> = { dirty: true, updatedAt: simdi };
  if (secim.files && w.files.length) {
    ch['files'] = w.files.map((f) => ({ ...f })); ch['primary'] = w.primary;
    if (!secim.plan && p.primary !== w.primary) ch['plan'] = [];
    ch['partNo'] = p.partNo || (w.name || '').trim();
  }
  if (secim.cfg) ch['readCfg'] = cfg;
  if (secim.plan) {
    ch['plan'] = w.bal.map((b) => ({ freq: 'İlk parça', crit: false, ...((p.plan || []).find((x) => x.nom === b.nom && x.id === b.id) || {}), ...b }));
  }
  return ch;
}
// Paket çalışma olarak açılır (paketin balonları ve ayarı ile).
export const paketCalismasi = (p: PaketOzeti, bos: Calisma): Calisma => ({
  ...bos, name: p.partNo || p.part || p.no, files: (p.files || []).map((f) => ({ ...f })), primary: p.primary ?? null,
  bal: (p.plan || []).map((b) => ({ ...b })), from: p.id,
});

// Tanı katmanının bölge sınıfları: ad ve renk sınıfı (tc-ay5-z-<anahtar>).
export const BOLGE_SINIFLARI = {
  dim: 'Ölçü', table: 'Antet / tablo', border: 'Pafta kenarı', notes: 'Not', prose: 'Açıklama', stack: 'Üst üste', none: 'Ölçü değil',
} as const;
export type BolgeSinifi = keyof typeof BOLGE_SINIFLARI;
export const bolgeSinifi = (z: string): BolgeSinifi => (Object.hasOwn(BOLGE_SINIFLARI, z) ? z as BolgeSinifi : 'none');
