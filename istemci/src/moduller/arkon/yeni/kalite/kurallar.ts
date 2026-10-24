import { nedenToplamlariniBirlestir, paretoSatirlari, type ParetoSatiri } from '../../../../../../arkon/web/src/data/durus-nedeni.ts';
import { gunAraliklari } from '../../../../../../arkon/web/src/data/vardiya-gunu.ts';
import type {
  Gauge, LogCall, LogCount, LogEvent, LogMeas, Maint, Meas, Pkg, PlanItem, SampleRequest,
} from '../../../../../../arkon/shared/model.ts';
import { durusNedeni, hurdaNedeni, planliNedenMi, type ArkonAyarlari } from '../cekirdek/ayarlar.ts';
import { oeeHesapla, type OeeSonucu } from '../cekirdek/oee.ts';
import { CAGRI_EKIPLERI } from '../cekirdek/sabitler.ts';
import { aktif, istasyonBul, istasyonListesi, makineBul, type IstasyonSatiri } from '../cekirdek/tesis.ts';
import { vardiyaPencereleri } from '../cekirdek/vardiya.ts';
import { cagrilariTopla, oeeOrtami, type Renk } from '../pano/index.tsx';

// Kalite, Bakım ve Raporlar hesapları (kalite.ts, bakim-raporlar.ts, giris-ayarlar-spc.ts SPC bölümü, kurallar.ts rulesOf ve nearEdge,
// teknik-resim.ts methOf, pdf-okuma.ts fold). Ekran yalnız bunları çağırır; eski işlevlerle eşitliği esitlik.test.ts sınar.

const GUN = 864e5;

// ---- Numune ----------------------------------------------------------------------------------------------------------
export type NumuneDurumu = SampleRequest['status'];
export const NUMUNE_DURUMLARI: Readonly<Record<NumuneDurumu, { etiket: string; renk: Renk }>> = {
  waiting: { etiket: 'Bekliyor', renk: 'hold' }, measuring: { etiket: 'Ölçülüyor', renk: 'done' }, approved: { etiket: 'Onaylandı', renk: 'run' },
  deviation: { etiket: 'Sapma ile onay', renk: 'hazard' }, rejected: { etiket: 'Red', renk: 'stop' },
};
export const acikNumuneMi = (r: Pick<SampleRequest, 'status'>): boolean => r.status === 'waiting' || r.status === 'measuring';
export const bekleyenNumuneSayisi = (liste: readonly Pick<SampleRequest, 'status'>[]): number => liste.filter(acikNumuneMi).length;

export type Yontem = 'cmm' | 'man';
export const yontem = (b: Pick<PlanItem, 'm' | 'tool'>): Yontem => b.m || (b.tool === 'CMM' ? 'cmm' : 'man');
export const YONTEM_ADI: Readonly<Record<Yontem, string>> = { cmm: 'CMM', man: 'Elle' };

// Hazırlık kuralları (kurallar.ts RULES0, rulesOf): numune kuralının yalnız kalite ekranının kullandığı kısmı.
export interface KaliteKurali { band: number; critTwice: boolean }
export function kaliteKurali(p: Pick<Pkg, 'rules'> | null | undefined): KaliteKurali {
  const q = (p?.rules as { q?: Partial<KaliteKurali> } | undefined)?.q ?? {};
  return { band: 80, critTwice: false, ...q };
}
/** Toleransın kenarına yakınlık: band=80 iken orta noktadan uzaklık yarı aralığın %80'ini geçerse yüzdesi, değilse 0 (nearEdge). */
export function kenaraYakin(b: Pick<PlanItem, 'min' | 'max' | 'gauge'> | null | undefined, v: unknown, band: number): number {
  if (!band || !b || b.gauge || typeof v !== 'number' || !(b.max > b.min) || b.max > b.min + 500) return 0;
  const orta = (b.min + b.max) / 2;
  const yari = (b.max - b.min) / 2;
  const r = Math.abs(v - orta) / yari;
  return r >= band / 100 && r <= 1 + 1e-9 ? Math.round(r * 100) : 0;
}
export const toleransta = (b: Pick<PlanItem, 'min' | 'max'>, v: number): boolean => v >= b.min - 1e-9 && v <= b.max + 1e-9;

export type OlcumSonucu = { tur: 'oneri'; v: number; alt: number } | { tur: 'kayit'; v: number | string; ok: boolean } | { tur: 'yok' };
// Girilen değer (save): mastar geçer/geçmez; sayı toleransta değilse 10'un katlarıyla toleransa giren ilk değer önerilir (virgül unutuldu).
export function olcumDegerlendir(b: Pick<PlanItem, 'min' | 'max' | 'gauge'>, girilen: string | undefined, secim?: number | 'ok' | 'nok'): OlcumSonucu {
  if (b.gauge) { const ok = secim === 'ok'; return { tur: 'kayit', v: ok ? 'Geçer' : 'Geçmez', ok }; }
  const v = secim != null && typeof secim === 'number' ? secim : parseFloat(String(girilen || '').replace(',', '.'));
  if (Number.isNaN(v)) return { tur: 'yok' };
  const ok = toleransta(b, v);
  if (!ok && secim == null) {
    const alt = [10, 0.1, 100, 0.01, 1000, 0.001].map((f) => +(v * f).toFixed(4)).find((x) => toleransta(b, x));
    if (alt !== undefined) return { tur: 'oneri', v, alt };
  }
  return { tur: 'kayit', v, ok };
}

// ---- CMM sonuç dosyası -----------------------------------------------------------------------------------------------
export const katla = (s: string): string =>
  s.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

/** Bir satırı ayraçla böler; tırnaklı alan ve çift tırnak kaçışı desteklenir (splitCsv). */
export function satirBol(l: string, d: string): string[] {
  const o: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (q) {
      if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === d) { o.push(cur); cur = ''; } else cur += ch;
  }
  o.push(cur);
  return o.map((c) => c.trim());
}

export interface CmmSatiri { key: string; act: number; nom: number | null; b: PlanItem | null; how: '' | 'no' | 'anma' | 'ad' }
export interface CmmSonucu { dl: string; header: boolean; rows: CmmSatiri[]; matched: number; file?: string }
// Ayraç, başlık ve sütunlar kendiliğinden bulunur; eşleştirme sırası balon no, anma değeri, ad (parseCmm).
export function cmmOku(metin: string, olculer: readonly PlanItem[]): CmmSonucu {
  const satirlar = metin.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  const puan = (d: string) => satirlar.slice(0, 30).reduce((a, l) => { const n = satirBol(l, d).length; return a + (n > 1 ? n : 0); }, 0);
  const dl = [';', '\t', ','].sort((a, b) => puan(b) - puan(a))[0]!;
  const rows = satirlar.map((l) => satirBol(l, dl));
  const sayi = (c: unknown): number | null => {
    let t = String(c == null ? '' : c).trim().replace(/\s/g, '');
    if (dl !== ',') t = t.replace(',', '.');
    const m = t.match(/[-+]?\d*\.?\d+(e[-+]?\d+)?/i);
    return m ? parseFloat(m[0]) : null;
  };
  let hi = -1, cId = -1, cAct = -1, cNom = -1, cName = -1;
  for (let k = 0; k < Math.min(rows.length, 30) && hi < 0; k++) {
    const h = rows[k]!.map((c) => katla(c));
    const a = h.findIndex((c) => /^(actual|measured|meas\.?|ist|olculen|olculen deger|gercek|gerceklesen|deger|value|sonuc deger)/.test(c));
    if (a < 0) continue;
    hi = k; cAct = a;
    cNom = h.findIndex((c) => /^(nominal|nom\.?|soll|anma|hedef)/.test(c));
    cId = h.findIndex((c) => /^(no\.?|id|#|balon|balloon|char\.? ?(no|id)?|karakteristik( no)?|kar\.? ?no|item|sira)$/.test(c));
    cName = h.findIndex((c, i) => i !== cId && /^(name|ad|adi|feature|ozellik|label|etiket|aciklama|description|desc|olcu)/.test(c));
  }
  const veri = hi >= 0 ? rows.slice(hi + 1) : rows;
  const out: CmmSatiri[] = [];
  const kullanilan = new Set<number>();
  const havuz = olculer.filter((b) => !b.gauge);
  const cmmOnce = [...havuz].sort((p, q) => Number(yontem(q) === 'cmm') - Number(yontem(p) === 'cmm'));
  const anma = (b: PlanItem) => (b.min + b.max) / 2;
  for (const r of veri) {
    let act: number | null;
    if (cAct >= 0) act = sayi(r[cAct]);
    else { act = null; for (let i = r.length - 1; i > 0; i--) { const v = sayi(r[i]); if (v != null) { act = v; break; } } }
    if (act == null || Number.isNaN(act)) continue;
    const idTxt = cId >= 0 ? r[cId] ?? '' : hi < 0 ? r[0] ?? '' : '';
    const nameTxt = cName >= 0 ? r[cName] ?? '' : '';
    let b: PlanItem | null = null;
    let how: CmmSatiri['how'] = '';
    const im = String(idTxt).match(/^\s*(?:B|#|K|balon|balloon|char\.?)?\s*-?\s*(\d{1,3})\s*$/i) || String(nameTxt).match(/^\s*(?:B|#|balon|balloon)\s*-?\s*(\d{1,3})\s*$/i);
    if (im) { b = havuz.find((x) => x.id === +im[1]! && !kullanilan.has(x.id)) ?? null; if (b) how = 'no'; }
    const nom = cNom >= 0 ? sayi(r[cNom]) : null;
    if (!b && nom != null) {
      let bd = 1e9;
      for (const x of cmmOnce) {
        if (kullanilan.has(x.id)) continue;
        const w = Math.max(0.02, x.max - x.min), d = Math.abs(anma(x) - nom);
        if (d <= w && d < bd) { bd = d; b = x; }
      }
      if (b) how = 'anma';
    }
    if (!b && nameTxt) {
      const t = katla(nameTxt);
      b = havuz.find((x) => !kullanilan.has(x.id) && (katla(x.nom).replace(/\s/g, '') === t.replace(/\s/g, '') || (!!x.l && katla(String(x.l)) === t))) ?? null;
      if (b) how = 'ad';
    }
    out.push({ key: [idTxt, nameTxt].filter(Boolean).join(' · ') || '—', act, nom, b, how });
    if (b) kullanilan.add(b.id);
  }
  return { dl: dl === '\t' ? 'sekme' : dl, header: hi >= 0, rows: out, matched: out.filter((x) => x.b).length };
}

// ---- SPC -------------------------------------------------------------------------------------------------------------
export interface SpcOzeti { n: number; mean?: number; sd?: number; cp?: number | null; cpk?: number | null; min?: number; max?: number; out?: number }
/** Ölçü başına ortalama, standart sapma, Cp ve Cpk (spcStats). */
export function spcOzeti(vals: readonly number[], lsl: number, usl: number): SpcOzeti {
  const n = vals.length;
  if (!n) return { n: 0 };
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : 0;
  const cp = sd > 0 && Number.isFinite(usl) && Number.isFinite(lsl) ? (usl - lsl) / (6 * sd) : null;
  const cpk = sd > 0 ? Math.min(Number.isFinite(usl) ? (usl - mean) / (3 * sd) : Infinity, Number.isFinite(lsl) ? (mean - lsl) / (3 * sd) : Infinity) : null;
  return { n, mean, sd, cp, cpk: cpk === Infinity ? null : cpk, min: Math.min(...vals), max: Math.max(...vals), out: vals.filter((v) => v < lsl - 1e-9 || v > usl + 1e-9).length };
}
export const cpkRengi = (c: number | null | undefined): Renk | null => (c == null ? null : c >= 1.33 ? 'run' : c >= 1 ? 'hold' : 'stop');
export const dortHane = (v: number | null | undefined): string => (v == null || !Number.isFinite(v) ? '—' : (+v.toFixed(4)).toString());
export const KAYNAK_ADI: Readonly<Record<string, string>> = { op: 'Operatör', quality: 'Kalite', cmm: 'CMM' };

export interface SpcCizimi {
  bos: boolean; W: number; H: number; pad: number; ucl: number | null; lcl: number | null; ort: number | null; y: (v: number) => number; x: (i: number) => number;
  noktalar: { x: number; y: number; r: LogMeas }[];
}
// Değer grafiğinin ölçeği (SpcChart): tolerans bandı ve ±3σ görünür kalacak biçimde.
export function spcCizimi(rows: readonly LogMeas[], b: Pick<PlanItem, 'min' | 'max'>): SpcCizimi {
  const W = 760, H = 260, pad = 34;
  const vals = rows.filter((r) => r.value != null);
  const S = spcOzeti(vals.map((r) => r.value!), b.min, b.max);
  const span = b.max - b.min || 1;
  const ucl = S.sd ? S.mean! + 3 * S.sd : null;
  const lcl = S.sd ? S.mean! - 3 * S.sd : null;
  const lo = Math.min(b.min - span * 0.25, S.min ?? Infinity, lcl ?? Infinity);
  const hi = Math.max(b.max + span * 0.25, S.max ?? -Infinity, ucl ?? -Infinity);
  const y = (v: number) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const x = (i: number) => pad + 30 + i * ((W - 2 * pad - 30) / Math.max(1, vals.length - 1));
  return { bos: !vals.length, W, H, pad, ucl, lcl, ort: S.mean ?? null, y, x, noktalar: vals.map((r, i) => ({ x: x(i), y: y(r.value!), r })) };
}

const kacis = (s: unknown): string => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const RQS: Readonly<Record<string, string>> = { approved: 'Onaylandı', rejected: 'RED', deviation: 'Sapma ile onay', waiting: 'Bekliyor', measuring: 'Ölçülüyor' };
/** Ölçüm raporu (reportHtml): yazdırılınca PDF olan tek sayfalık belge. Yazdırma penceresinin kendi stili vardır (ekran stili değil). */
export function olcumRaporu(p: Pkg, rows: readonly LogMeas[], reqs: readonly SampleRequest[], hazirlayan: string, simdi: number): string {
  const dt = (t: number) => new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ats = rows.map((r) => r.at);
  const from = ats.length ? Math.min(...ats) : null, to = ats.length ? Math.max(...ats) : null;
  const orders = [...new Set(rows.map((r) => r.orderNo).filter(Boolean))];
  const ozet = (p.plan || []).map((b) => { const rs = rows.filter((r) => r.itemId === b.id); const S = spcOzeti(rs.filter((r) => r.value != null).map((r) => r.value!), b.min, b.max); return { b, rs, S, bad: rs.filter((r) => !r.ok).length }; });
  return '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ölçüm raporu ' + kacis(p.no) + '</title><style>' +
    '@page{size:A4;margin:12mm}body{font:10.5px/1.4 Arial,Helvetica,sans-serif;color:#111;margin:0}h1{font-size:18px;margin:0}h2{font-size:12.5px;margin:16px 0 6px;border-bottom:2px solid #111;padding-bottom:3px}' +
    'table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}th{background:#eee;font-size:9.5px;text-transform:uppercase}td.n{text-align:right;font-family:Consolas,monospace}.nok{color:#b00;font-weight:700}.ok{color:#060}' +
    '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111;padding-bottom:8px;margin-bottom:8px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:4px 14px;margin:6px 0}.meta div span{display:block;color:#666;font-size:9px;text-transform:uppercase}.meta div b{font-size:11.5px}' +
    '.sig{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:22px}.sig div{border-top:1px solid #111;padding-top:4px;height:46px}.small{color:#666;font-size:9px}tr{page-break-inside:avoid}</style></head><body>' +
    '<div class="hd"><div><div class="small">ÜRETİM HAZIRLIK</div><h1>Ölçüm raporu</h1></div><div style="text-align:right"><b>' + kacis(p.no) + '</b><br>Rev ' + kacis(p.rev) + '<br><span class="small">Oluşturma: ' + dt(simdi) + ' · ' + kacis(hazirlayan) + '</span></div></div>' +
    '<div class="meta">' + [['Parça', p.part], ['Parça no', p.partNo], ['Operasyon', p.op], ['Makine', p.machine], ['Malzeme', p.material], ['Hedef', p.target + ' adet'], ['İş emirleri', orders.join(', ') || p.no], ['Dönem', from ? dt(from) + ' – ' + dt(to!) : '—']].map(([l, v]) => '<div><span>' + l + '</span><b>' + kacis(v || '—') + '</b></div>').join('') + '</div>' +
    '<h2>Karakteristik özeti</h2><table><tr><th>No</th><th>Ölçü</th><th>Tolerans</th><th>Alt · Üst</th><th>Yöntem / alet</th><th>n</th><th>Min</th><th>Maks</th><th>Ort.</th><th>σ</th><th>Cpk</th><th>Red</th><th>Sonuç</th></tr>' +
    ozet.map(({ b, rs, S, bad }) => '<tr><td>' + b.id + (b.crit ? ' KK' : '') + '</td><td><b>' + kacis(b.nom) + '</b></td><td>' + kacis(b.tol) + '</td><td class="n">' + dortHane(b.min) + ' · ' + dortHane(b.max) + '</td><td>' + kacis(YONTEM_ADI[yontem(b)] + ' · ' + b.tool) + '</td><td class="n">' + rs.length + '</td><td class="n">' + dortHane(S.min) + '</td><td class="n">' + dortHane(S.max) + '</td><td class="n">' + dortHane(S.mean) + '</td><td class="n">' + dortHane(S.sd) + '</td><td class="n">' + (S.cpk == null ? '—' : S.cpk.toFixed(2)) + '</td><td class="n' + (bad ? ' nok' : '') + '">' + bad + '</td><td class="' + (!rs.length ? '' : bad ? 'nok' : 'ok') + '">' + (!rs.length ? 'Ölçülmedi' : bad ? 'Red var' : 'Uygun') + '</td></tr>').join('') + '</table>' +
    (reqs.length ? '<h2>Kalite kararları</h2><table><tr><th>Tarih</th><th>İş emri</th><th>Neden</th><th>Makine</th><th>Gönderen</th><th>Karar</th><th>Karar veren</th><th>Not</th></tr>' + [...reqs].sort((a, b) => a.at - b.at).map((r) => '<tr><td>' + dt(r.at) + '</td><td>' + kacis(r.no) + '</td><td>' + kacis(r.reason) + '</td><td>' + kacis(r.machine) + '</td><td>' + kacis(r.by) + '</td><td class="' + (r.status === 'rejected' ? 'nok' : r.status === 'approved' ? 'ok' : '') + '">' + (RQS[r.status] || r.status) + '</td><td>' + kacis(r.decidedBy || '') + (r.decidedAt ? '<br><span class="small">' + dt(r.decidedAt) + '</span>' : '') + '</td><td>' + kacis(r.note || '') + '</td></tr>').join('') + '</table>' : '') +
    '<h2>Ölçüm kayıtları</h2><table><tr><th>Tarih</th><th>No</th><th>Ölçü</th><th>Değer</th><th>Sonuç</th><th>Kaynak</th><th>Ölçen</th><th>İş emri · parça</th></tr>' +
    rows.slice(0, 2000).map((r) => '<tr><td>' + dt(r.at) + '</td><td>' + r.itemId + '</td><td>' + kacis(r.nom) + '</td><td class="n">' + kacis(r.value != null ? r.value : r.attr) + '</td><td class="' + (r.ok ? 'ok' : 'nok') + '">' + (r.ok ? 'Uygun' : 'RED') + '</td><td>' + (KAYNAK_ADI[r.src ?? ''] || kacis(r.src)) + '</td><td>' + kacis(r.userName) + '</td><td>' + kacis((r.orderNo || '') + (r.partCnt != null ? ' #' + r.partCnt : '')) + '</td></tr>').join('') + '</table>' +
    (rows.length > 2000 ? '<p class="small">İlk 2000 kayıt gösterildi (toplam ' + rows.length + ').</p>' : '') +
    '<div class="sig"><div>Hazırlayan</div><div>Kontrol eden</div><div>Onaylayan</div></div></body></html>';
}

// Ölçüm geçmişi satırı (logMeas): SPC, Cpk ve ölçüm raporu bundan okunur.
export function olcumKaydi(pkg: Pkg, b: PlanItem, m: Pick<Meas, 'v' | 'ok' | 'cnt'>, istasyonWc: string | null, ek: Record<string, unknown>): Record<string, unknown> {
  const sayisal = typeof m.v === 'number' && Number.isFinite(m.v);
  return {
    machine: pkg.machine || null, wc: istasyonWc || null, pkgId: pkg.id, itemId: b.id, nom: b.nom, lsl: b.min, usl: b.max,
    value: sayisal ? m.v : null, attr: sayisal ? null : String(m.v), ok: !!m.ok, partCnt: m.cnt ?? null, ...ek,
  };
}

// ---- Ölçü aletleri ---------------------------------------------------------------------------------------------------
export const aletVadesi = (g: Pick<Gauge, 'last' | 'interval'>): number => (g.last || 0) + (g.interval || 365) * GUN;
export function aletDurumu(g: Pick<Gauge, 'status' | 'last' | 'interval'>, simdi: number): { renk: Renk; etiket: string } {
  if (g.status === 'out') return { renk: 'idle', etiket: 'Kullanım dışı' };
  const v = aletVadesi(g);
  if (v < simdi) return { renk: 'stop', etiket: 'Kalibrasyonu geçmiş' };
  if (v < simdi + 30 * GUN) return { renk: 'hold', etiket: `${Math.ceil((v - simdi) / GUN)} gün kaldı` };
  return { renk: 'run', etiket: 'Geçerli' };
}

// ---- Bakım -----------------------------------------------------------------------------------------------------------
export const ARIZA_SEBEPLERI = ['Mekanik', 'Elektrik', 'Hidrolik / pnömatik', 'Elektronik / kontrol', 'Yazılım / program', 'Takım / aparat', 'Operatör hatası', 'Diğer'] as const;
export type Ariza = Extract<Maint, { type: 'ariza' }>;
export type BakimPlani = Extract<Maint, { type: 'plan' }>;
export type YapilanBakim = Extract<Maint, { type: 'pm' }>;
export const arizaMi = (m: Maint): m is Ariza => m.type === 'ariza';
export const planMi = (m: Maint): m is BakimPlani => m.type === 'plan';
export const planVadesi = (p: Pick<BakimPlani, 'lastAt' | 'everyDays'>): number => (p.lastAt || 0) + (p.everyDays || 30) * GUN;
// Sekme sayısı: yedi gün içinde vadesi gelen etkin plan.
export const yaklasanBakimSayisi = (liste: readonly Maint[], simdi: number): number =>
  liste.filter(planMi).filter((p) => p.active !== false && planVadesi(p) <= simdi + 7 * GUN).length;
export function planKalanGun(p: BakimPlani, simdi: number): { kalan: number; renk: Renk; etiket: string } {
  const kalan = Math.round((planVadesi(p) - simdi) / GUN);
  return { kalan, renk: kalan < 0 ? 'stop' : kalan <= 7 ? 'hold' : 'run', etiket: kalan < 0 ? `${-kalan} gün gecikti` : kalan === 0 ? 'Bugün' : `${kalan} gün kaldı` };
}

export interface GuvenilirlikSatiri {
  m: { id: string; name: string; st: string }; n: number; open: number; mttr: number | null; mtbf: number | null; run: number | null; cause: [string, number] | null; down: number;
}
// Makine güvenilirliği (RelView): MTBF = çalışma ÷ arıza, MTTR = ortalama onarım (açılıştan kapanışa).
export function guvenilirlik(liste: readonly Maint[], olaylar: readonly LogEvent[] | null, gun: number, simdi: number, a: Pick<ArkonAyarlari, 'tesis' | 'vardiyalar' | 'tatiller' | 'planliDuruslar' | 'durusNedenleri'>): GuvenilirlikSatiri[] {
  const from = simdi - gun * GUN;
  return a.tesis.mcs.filter(aktif).map((m): GuvenilirlikSatiri => {
    const f = liste.filter(arizaMi).filter((x) => (x.mc === m.id || (!x.mc && x.st === m.st && istasyonBul(a.tesis, m.st).mcs.length === 1)) && x.openedAt >= from);
    const kapanan = f.filter((x) => (x.repairMs ?? 0) > 0);
    const mttr = kapanan.length ? kapanan.reduce((t, x) => t + (x.repairMs ?? 0), 0) / kapanan.length : null;
    const c = olaylar && m.st
      ? oeeHesapla({ ev: olaylar.filter((e) => e.machine === m.st), cn: [], from, to: simdi, windows: vardiyaPencereleri(from, simdi, a.vardiyalar, a.tatiller) }, oeeOrtami(a, m.st))
      : null;
    const run = c ? c.run : null;
    const sebepler: Record<string, number> = {};
    for (const x of kapanan) sebepler[x.cause || '—'] = (sebepler[x.cause || '—'] ?? 0) + 1;
    return {
      m: { id: m.id, name: m.name, st: m.st }, n: f.length, open: f.filter((x) => x.status !== 'done').length, mttr,
      mtbf: run != null && f.length ? run / f.length : null, run, cause: Object.entries(sebepler).sort((x, y) => y[1] - x[1])[0] ?? null,
      down: kapanan.reduce((t, x) => t + (x.repairMs ?? 0), 0),
    };
  }).sort((x, y) => y.n - x.n);
}

// ---- Raporlar --------------------------------------------------------------------------------------------------------
export const ARALIKLAR = [['today', 'Bugün'], ['yday', 'Dün'], ['week', 'Bu hafta'], ['d7', 'Son 7 gün'], ['d30', 'Son 30 gün']] as const;
export type AralikAnahtari = typeof ARALIKLAR[number][0];
export function aralik(k: string, simdi: number): [number, number] {
  const d0 = new Date(simdi).setHours(0, 0, 0, 0);
  if (k === 'today') return [d0, simdi];
  if (k === 'yday') return [d0 - GUN, d0];
  if (k === 'week') { const wd = (new Date(simdi).getDay() + 6) % 7; return [d0 - wd * GUN, simdi]; }
  if (k === 'd30') return [d0 - 29 * GUN, simdi];
  return [d0 - 6 * GUN, simdi];
}

export interface RaporVerisi { ev: LogEvent[]; cn: LogCount[]; calls: LogCall[]; pk: Pkg[]; mt: Maint[]; from: number; to: number; now: number }
export interface RaporSuzgeci { wc: string; st: string; shf: string }
export interface Toplam {
  run: number; planned: number; ideal: number; good: number; scrap: number; stopMs: number; stopPMs: number; downMs: number; setupMs: number; stops: number;
  A: number | null; P: number | null; Q: number | null; oee: number | null;
}
export interface Rapor {
  per: { s: IstasyonSatiri; c: OeeSonucu }[]; tot: Toplam; days: (Toplam & { d: number })[]; pareto: ParetoSatiri[];
  scrap: { k: string; l: string; n: number }[]; scrapP: { l: string; n: number }[];
  calls: { k: string; l: string; n: number; ack: number | null; fix: number | null; esc: number }[];
  faults: { n: number; open: number; mttr: number | null; mtbf: number | null }; from: number; to: number;
}
type RaporAyarlari = Pick<ArkonAyarlari, 'tesis' | 'vardiyalar' | 'tatiller' | 'planliDuruslar' | 'durusNedenleri' | 'hurdaNedenleri'>;

const topla = (cs: readonly OeeSonucu[]): Toplam => {
  const a = cs.reduce((o, c) => ({
    run: o.run + c.run, planned: o.planned + c.planned, ideal: o.ideal + c.ideal, good: o.good + c.good, scrap: o.scrap + c.scrap, stopMs: o.stopMs + c.stopMs,
    stopPMs: o.stopPMs + c.stopPMs, downMs: o.downMs + c.downMs, setupMs: o.setupMs + c.setupMs, stops: o.stops + c.stops,
  }), { run: 0, planned: 0, ideal: 0, good: 0, scrap: 0, stopMs: 0, stopPMs: 0, downMs: 0, setupMs: 0, stops: 0 });
  const A = a.planned > 1 ? Math.min(1, a.run / a.planned) : null;
  const P = a.run && a.ideal ? Math.min(1, a.ideal / a.run) : null;
  const Q = a.good + a.scrap ? a.good / (a.good + a.scrap) : null;
  return { ...a, A, P, Q, oee: A != null && P != null && Q != null ? A * P * Q : null };
};
const ort = (l: readonly number[]): number | null => (l.length ? l.reduce((x, y) => x + y, 0) / l.length : null);

// Rapor hesabı (reportCalc): istasyon, gün, duruş Pareto'su, hurda, çağrı ve arıza; süzgeç iş merkezi, istasyon ve vardiya.
export function raporHesapla(D: RaporVerisi, f: RaporSuzgeci, a: RaporAyarlari): Rapor {
  const sts = istasyonListesi(a.tesis, true).filter((s) => (!f.wc || s.wc === f.wc) && (!f.st || s.id === f.st));
  const to = Math.min(D.to, D.now);
  const wins = vardiyaPencereleri(D.from, to, a.vardiyalar, a.tatiller).filter((w) => !f.shf || w.name === f.shf);
  const evBy: Record<string, LogEvent[]> = {};
  const cnBy: Record<string, LogCount[]> = {};
  for (const e of D.ev) (evBy[e.machine ?? ''] ??= []).push(e);
  for (const c of D.cn) (cnBy[c.machine ?? ''] ??= []).push(c);
  const icinde = (t: number) => !f.shf || wins.some((w) => t >= w.s && t < w.e);
  const per = sts.map((s) => ({ s, c: oeeHesapla({ ev: evBy[s.id] ?? [], cn: (cnBy[s.id] ?? []).filter((c) => icinde(c.at)), from: D.from, to, windows: wins }, oeeOrtami(a, s.id)) }));
  const tot = topla(per.map((x) => x.c));
  const days = gunAraliklari(D.from, to, wins).map((r) => ({
    d: r.d,
    ...topla(sts.map((s) => oeeHesapla({ ev: evBy[s.id] ?? [], cn: (cnBy[s.id] ?? []).filter((c) => c.at >= r.from && c.at < r.to && icinde(c.at)), from: r.from, to: r.to, windows: r.pencereler }, oeeOrtami(a, s.id)))),
  }));
  const pareto = paretoSatirlari(nedenToplamlariniBirlestir(per.map(({ c }) => c.byR)), (k) => durusNedeni(a, k)?.l ?? null, (k) => planliNedenMi(a, k));
  const scrapBy: Record<string, number> = {};
  const scrapPart: Record<string, number> = {};
  const pkById = Object.fromEntries(D.pk.map((p) => [p.id, p]));
  for (const { s } of per) {
    for (const c of (cnBy[s.id] ?? []).filter((x) => x.kind === 'scrap' && icinde(x.at) && x.at >= D.from)) {
      const k = c.reason || '—';
      scrapBy[k] = (scrapBy[k] ?? 0) + c.delta;
      const pn = pkById[c.pkgId ?? '']?.part || c.orderNo || '—';
      scrapPart[pn] = (scrapPart[pn] ?? 0) + c.delta;
    }
  }
  const scrap = Object.entries(scrapBy).map(([k, n]) => ({ k, l: k === '—' ? 'Nedeni girilmemiş' : hurdaNedeni(a, k)?.l ?? k, n })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n);
  const scrapP = Object.entries(scrapPart).map(([l, n]) => ({ l, n })).filter((x) => x.n > 0).sort((x, y) => y.n - x.n).slice(0, 10);
  const stSet = new Set(sts.map((s) => s.id));
  const calls = cagrilariTopla(D.calls).filter((c) => stSet.has(c.machine));
  const callBy: Record<string, { n: number; ack: number[]; fix: number[]; esc: number }> = {};
  for (const c of calls) {
    const t = (callBy[c.team] ??= { n: 0, ack: [], fix: [], esc: 0 });
    t.n++;
    if (c.ack) t.ack.push(c.ack - (c.open ?? 0));
    if (c.done) t.fix.push(c.done - (c.open ?? 0));
    if (c.esc) t.esc++;
  }
  const faults = D.mt.filter(arizaMi).filter((m) => m.openedAt >= D.from && m.openedAt < to && stSet.has(m.st));
  const kapanan = faults.filter((m) => (m.repairMs ?? 0) > 0);
  return {
    per, tot, days, pareto, scrap, scrapP,
    calls: Object.entries(callBy).map(([k, v]) => ({ k, l: CAGRI_EKIPLERI.find((c) => c.k === k)?.l ?? k, n: v.n, ack: ort(v.ack), fix: ort(v.fix), esc: v.esc })),
    faults: { n: faults.length, open: faults.filter((m) => m.status !== 'done').length, mttr: ort(kapanan.map((m) => m.repairMs ?? 0)), mtbf: faults.length ? tot.run / faults.length : null },
    from: D.from, to,
  };
}

export const makineAdi = (a: Pick<ArkonAyarlari, 'tesis'>, id: string | null | undefined): string => makineBul(a.tesis, id)?.name ?? '';
// Pareto notu: toplam duruşun %80'ine ulaşan ilk neden sayısı.
export function paretoYuzde80(p: readonly Pick<ParetoSatiri, 'ms'>[]): number {
  const toplam = p.reduce((a, x) => a + x.ms, 0);
  let birikim = 0;
  return p.findIndex((x) => (birikim += x.ms) >= toplam * 0.8) + 1;
}
