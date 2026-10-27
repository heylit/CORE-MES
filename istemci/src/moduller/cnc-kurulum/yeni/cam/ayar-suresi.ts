import { clamp, fmtN, num } from '../bicim.ts';
import { PS } from '../hesap/hazirlik.ts';
import { matBeh } from '../hesap/malzeme-davranisi.ts';
import { toolsOf } from '../hesap/omur.ts';
import { allMachines, machine, material } from '../secici.ts';
import type { Tezgah } from '../veri/tipler.ts';
import { camKaydi, SC, suProfKaydi, type AtolyeKosullari } from './durum.ts';
import { camFAI } from './fai.ts';
import { camCaps } from '../hesap/sinirlar.ts';
import type { FaiSonucu, FrezeIs, MtIs, NcProgram } from './tipler.ts';

/* Tezgah ayar suresi: olculmus saha verisine dayali eleman modeli. Eleman sureleri kaynaklardan (SU_SRC), adetleri plandan
   (takim, taraf, baglama yonu, olcu sayisi) gelir; kullanici birim sureyi ezebilir (`state.cam.su`). */
export const SU_SRC: Record<string, [string, string]> = {
  IEOM: ['IEOM 2012 · CNC torna SMED kronometrajı', 'https://ieomsociety.org/ieom2012/pdfs/557.pdf'],
  IRJET: ['IRJET 2021 · işleme merkezi SMED', 'https://www.irjet.net/archives/V8/i11/IRJET-V8I11166.pdf'],
  FAB: ['Fabrico · takım ön ayarı', 'https://www.fabrico.io/blog/offline-tool-presetting/'],
  MTA: ['Machinery · hızlı değişen ayna çeneleri', 'https://www.machinery.co.uk/machinery-products/quick-change-chucks-save-on-time-and-costs'],
  LYN: ['Lyndex-Nikken · sıfır noktası bağlama', 'https://www.lyndexnikken.com/content-library/reduce-cnc-setup-time-by-90-with-zero-point-clamping'],
  JIT: ['JITbase · standart süreler ve ilk parça', 'https://www.jitbase.com/blog/cnc-machining-quote-standard-times'],
  MAT: ['Malzeme davranışı (Tanımlar → Malzemeler) · tahmini, değiştirilebilir', 'https://machiningdoctor.com/mds?matId=3030'],
  PROF: ['Tezgâh profili (Tanımlar → Hazırlık süreleri) · katalog + varsayım, değiştirilebilir', 'https://www.practicalmachinist.com/forum/threads/setup-time.183866/page-2'],
  PM: ['Practical Machinist · torna ayar süresi', 'https://www.practicalmachinist.com/forum/threads/cnc-lathe-setup-time.118471/'],
  FAI: ['FAI karakteristik listesi (bu plandan) · 1factory / Quality Magazine', 'https://www.1factory.com/quality-academy/guide-first-article.html'],
};
export const SC_OPT: Record<keyof AtolyeKosullari & string, [string, [string, string][]]> = {
  meas: ['Takım ölçme', [['manual', 'Elle (kağıt / mastar)'], ['probe', 'Tezgâh probu / lazer'], ['preset', 'Ön ayar cihazı (dışarıda)']]],
  jaw: ['Ayna çeneleri', [['std', 'Klasik (cıvatalı)'], ['quick', 'Hızlı değişen']]],
  fix: ['Freze bağlama', [['vise', 'Mengene / aparat, komparatörle hizala'], ['zp', 'Sıfır noktası sistemi']]],
  kit: ['Takım ve malzeme', [['yes', 'Hazırlıktan önce toplanmış (kit)'], ['no', 'Hazırlık sırasında toplanıyor']]],
  job: ['İş', [['repeat', 'Tekrar iş · program denenmiş'], ['new', 'İlk kez · program denenecek']]],
  op: ['Operatör', [['exp', 'Bu tezgâhta her gün çalışan'], ['mid', 'Ara sıra çalışan (+%30)'], ['rare', 'Seyrek kullanan (×2)']]],
  qc: ['İlk parça onayı', [['op', 'Operatör ölçer'], ['qa', 'Kalite birimi onaylar (bekleme)']]],
  tol: ['Tolerans', [['gen', 'Genel (±0,1)'], ['fine', 'Hassas (±0,02–0,05)'], ['tight', 'Çok hassas · CMM']]],
  faiw: ['İlk üretimde FAI sırasında tezgâh', [['wait', 'FAI ölçümleri bitene kadar bekler'], ['run', 'Riskle üretime devam eder']]],
};
export function scEtiketi(k: string, v: string): string { return SC_OPT[k]![1].filter((o) => o[0] === v)[0]![1]; }

export function camCal(): number { const c = camKaydi().cal[machine().id]; return c && c.f ? c.f : 1; }
export function camQty(): number { let q = num(camKaydi().qty, NaN); if (!(q > 0)) q = Math.max(1, num(PS().qty, 1)); return Math.max(1, Math.round(q)); }
export function suToolSplit(ids: string[], mach: Tezgah | null | undefined): { have: number; nw: number } { const mag = mach ? toolsOf(mach) : []; let have = 0, nw = 0; ids.forEach((id) => { if (mag.indexOf(id) >= 0) have++; else nw++; }); return { have, nw }; }

// Eleman: anahtar, baslik, adet, birim dk, formul notu, kaynak.
export interface AyarElemani { k: string; lbl: string; n: number; u: number; min: number; note: string; src: string; own: boolean }
export function suEl(k: string, lbl: string, n: number, u: number, note?: string, src?: string): AyarElemani {
  const ov = camKaydi().su[k], own = ov != null && ov !== '' && isFinite(+ov); if (own) u = +ov;
  return { k, lbl, n, u, min: n * u, note: note || '', src: src || '', own };
}
export function suMeasU(): number { return ({ manual: 2.5, probe: 0.75, preset: 0.5 } as Record<string, number>)[SC().meas]!; }
export function suMeasSrc(): string { return SC().meas === 'probe' ? 'IEOM' : 'FAB'; }
/* tekrar iste ilk parca kontrolu: kritik olculer (yaklasik %60); tam FAI yalniz ilk uretimde */
export function suFAI(F: number): number { const b = ({ gen: [3, 0.25], fine: [5, 0.6], tight: [10, 1.2] } as Record<string, [number, number]>)[SC().tol]!; return b[0] + b[1] * F; }
export function suOpF(): number { return ({ exp: 1, mid: 1.3, rare: 2 } as Record<string, number>)[SC().op]!; }

/* torna tarafi (cubuk, ana is mili + karsi is mili ya da ters baglama) */
export function suTurn(J: MtIs, tIds: string[], tc: number): AyarElemani[] {
  const sc = SC(), cfg = J.cfg, L: AyarElemani[] = [], ts = suToolSplit(tIds, cfg.lathM), sides = J.L2 && J.L2.ops.length ? 2 : 1, sub = cfg.lathM.type === 'millturn', kit = sc.kit === 'yes';
  const seen: Record<number, 1> = {}; let rMax = 0; J.P.prof.forEach((p) => { seen[Math.round(p.r * 2)] = 1; rMax = Math.max(rMax, p.r); });
  const F = Math.min(14, Object.keys(seen).length) + (J.L1.bore > 0 ? 2 : 0) + J.L1.grooves.length;
  const P = suProf(cfg.lathM), LD = J.Lp / Math.max(1, 2 * rMax), heavy = (J._mass || 0) > 20;
  if (P.cls === 'manual') {
    if (!kit) L.push(suEl('t_find', 'Kalem / malzeme arama', ts.nw + 1, 1.25, (ts.nw + 1) + ' kalem × 1,25 dk', 'IEOM'));
    L.push(suEl('t_swap', 'Kalemliğe kalem bağlama + punta yüksekliği', ts.nw + ts.have, P.swap, (ts.nw + ts.have) + ' kalem × ' + fmtN(P.swap, 1) + ' dk · ' + P.hold, 'PROF'));
    L.push(suEl('t_meas', 'Kalem sıfırı (deneme talaşı)', ts.nw + ts.have, suMeasP(P), 'tezgâhta prob yok', 'FAB'));
    L.push(suEl('t_jaw', 'Ayna çenesi', 1, suJawP(P), '', 'MTA'));
    if (!kit) L.push(suEl('t_stock', 'Malzeme kontrolü', 1, 6, '', 'IEOM'));
    L.push(suEl('t_blank', 'Ham parçayı bağlama + salgı ayarı', sides, 4, sides + ' taraf × 4 dk', 'PROF'));
    if (P.tail && LD > 4) L.push(suEl('t_tail', 'Punta ayarı', 1, 5, 'boy / çap ' + fmtN(LD, 1), 'PROF'));
    if (heavy) L.push(suEl('t_crane', 'Vinçle ham parça yükleme', 1, 8, fmtN(J._mass, 0) + ' kg ham parça', 'PROF'));
    L.push(suEl('t_first', 'İlk parçayı deneme talaşıyla ölçüye getirme', F, 1.5, F + ' ölçü × 1,5 dk · programsız tezgâh', 'PROF'));
    if (sc.job === 'new' && J._fai && !cfg.sep) L.push(suEl('t_fai', 'İlk ürün muayenesi (FAI)', 1, +J._fai.wait.toFixed(1), J._fai.chars.length + ' karakteristik', 'FAI'));
    else L.push(suEl('t_fai', 'İlk parça ölçümü', 1, +suFAI(F).toFixed(1), F + ' ölçü', sc.tol === 'gen' ? 'IEOM' : 'JIT'));
    if (sc.qc === 'qa') L.push(suEl('t_qa', 'Kalite onayı bekleme', 1, 15, 'ölçüm kuyruğu, CMM', 'JIT'));
    return L;
  }
  L.push(suEl('t_prog', 'Program yükleme', sides, 1.0, sides + ' program × 1 dk', 'IEOM'));
  if (!kit) L.push(suEl('t_find', 'Takım / malzeme arama, kaldırma', ts.nw + 1, 1.25, (ts.nw + 1) + ' kalem × 1,25 dk', 'IEOM'));
  const mag = cfg.lathM.type === 'millturn', su = P.swap, mU = suMeasP(P);
  L.push(suEl('t_swap', mag ? 'Magazine takım bağlama' : 'Tarete takım sökme + takma', ts.nw, su, ts.nw + ' yeni takım × ' + fmtN(su, 1) + ' dk · ' + P.hold + (ts.have ? ' (' + ts.have + ' takım zaten ' + (mag ? 'magazinde' : 'tarette') + ')' : ''), 'PROF'));
  L.push(suEl('t_meas', 'Takım ölçme (ofset)', ts.nw, mU, ts.nw + ' takım × ' + fmtN(mU, 2) + ' dk · ' + (P.meas === 'manual' ? 'tezgâhta prob yok, elle' : scEtiketi('meas', sc.meas).toLowerCase()), P.meas === 'manual' ? 'FAB' : suMeasSrc()));
  L.push(suEl('t_jaw', 'Ana iş mili çene değişimi', 1, suJawP(P), (sc.jaw === 'quick' ? 'hızlı değişen çene' : 'klasik çene') + (P.jaw !== 20 ? ' · ' + (cfg.lathM.baseName || cfg.lathM.name) + ' aynası' : ''), 'MTA'));
  if (!kit) L.push(suEl('t_stock', 'Malzeme kontrolü', 1, 6, 'çubuk çapı / boyu', 'IEOM'));
  L.push(suEl('t_bar', 'Çubuk yükleme + besleyici ayarı', 1, 5.5, '', 'IEOM'));
  L.push(suEl('t_zero', 'İş parçası sıfırı', sides, 1.9, sides + ' taraf × 1,9 dk', 'IEOM'));
  if (J.L1.bore > 0 || sc.tol !== 'gen') L.push(suEl('t_gauge', 'Ölçü aleti / delik mastarı ayarı', 1, 2.4, '', 'IEOM'));
  if (sides > 1) {
    if (sub) { L.push(suEl('t_subjaw', 'Karşı iş mili çene değişimi', 1, sc.jaw === 'quick' ? 2 : 8.5, '', 'IEOM'), suEl('t_skim', 'Yumuşak çene tornalama', 1, 4.2, '', 'IEOM'), suEl('t_cutl', 'Kesme / aktarma boyu ayarı', 1, 3.5, '', 'IEOM'), suEl('t_subz', 'Karşı iş mili takım sıfırları', 1, 4.4, '', 'IEOM')); }
    else { L.push(suEl('t_flipjaw', 'Ters bağlama için çene değişimi', 1, suJawP(P), 'OP20 partisinden önce', 'MTA'), suEl('t_skim', 'Yumuşak çene tornalama', 1, 4.2, '', 'IEOM')); }
  }
  if (P.tail && LD > 4) L.push(suEl('t_tail', 'Punta ayarı', 1, 5, 'boy / çap ' + fmtN(LD, 1) + ' > 4', 'PROF'));
  if (P.steady && LD > 10) L.push(suEl('t_steady', 'Yatak (lünet) ayarı', 1, 20, 'boy / çap ' + fmtN(LD, 1) + ' > 10', 'PROF'));
  if (heavy && !J._barFed) L.push(suEl('t_crane', 'Vinçle ham parça yükleme', 1, 8, fmtN(J._mass, 0) + ' kg ham parça', 'PROF'));
  const mb = matBeh(J.c.mat); if (sc.job === 'new' && mb.tune > 0) L.push(suEl('t_mat', 'Zor malzeme: talaş kırma / kesme verisi denemesi', 1, mb.tune, J.c.mat.name + ' · ilk iş', 'MAT'));
  const nOps = J.rows.filter((r) => r.proc === 'turn').length;
  if (sc.job === 'new') L.push(suEl('t_prove', 'Program denemesi (tek blok, düşük ilerleme)', 1, +((1.5 * tc + nOps) * P.prove).toFixed(1), '(1,5 × torna çevrimi ' + fmtN(tc, 1) + ' dk + ' + nOps + ' işlem × 1 dk)' + (P.prove !== 1 ? ' × ' + fmtN(P.prove, 1) + ' tezgâh' : ''), 'PM'));
  else L.push(suEl('t_dry', 'Kuru çalışma + parça ayarı', sides, 5.0, sides + ' taraf × 5 dk', 'IEOM'));
  if (sc.job === 'new' && J._fai && !cfg.sep) L.push(suEl('t_fai', 'İlk ürün muayenesi (FAI) — ' + (sc.faiw === 'run' ? 'operatör kontrolü, üretim sürüyor' : 'tezgâh bekler'), 1, +J._fai.wait.toFixed(1), J._fai.chars.length + ' karakteristik ölçümü', 'FAI'));
  else L.push(suEl('t_fai', 'İlk parça ölçümü', 1, +suFAI(F).toFixed(1), F + ' ölçü · ' + scEtiketi('tol', sc.tol).toLowerCase(), sc.tol === 'gen' ? 'IEOM' : 'JIT'));
  if (sc.qc === 'qa') L.push(suEl('t_qa', 'Kalite onayı bekleme', 1, 15, 'ölçüm kuyruğu, CMM', 'JIT'));
  return L;
}
/* freze tarafi: ayni tezgahta canli takim / C ekseni ya da ayri isleme merkezi */
export function suMill(J: MtIs | FrezeIs, mIds: string[], mc: number, mach: Tezgah, sep: boolean, nOrient: number, nProg: number, F: number): AyarElemani[] {
  const sc = SC(), L: AyarElemani[] = [], ms = suToolSplit(mIds, mach), kit = sc.kit === 'yes', P = suProf(mach), zU = sc.meas === 'manual' || P.meas === 'manual' ? 4 : 1.5, nf = P.nfix || 1;
  if (!mIds.length) return L;
  const cfg = 'cfg' in J ? J.cfg : undefined;
  if (sep) {
    if (P.apc && kit) L.push(suEl('m_pal', 'Palet değişimi — aparat diğer palet işlerken dışarıda hazırlandı', 1, 1, P.hold, 'PROF'));
    else {
      L.push(suEl('m_clean', 'Tabla temizliği', 1, 0.8, '', 'IRJET'), suEl('m_mount', 'Aparat bağlama', nf, 1.2, nf > 1 ? nf + ' aparat' : '', 'IRJET'));
      L.push(suEl('m_true', sc.fix === 'zp' ? 'Aparat yerleştirme (sıfır noktası)' : 'Aparatı komparatörle hizalama', nf, suFixP(P), (sc.fix === 'zp' ? 'klasiğin ≈%10\'u' : '') + (P.fix !== 8 ? ' · ' + (mach.baseName || mach.name) + ' tablası' : ''), sc.fix === 'zp' ? 'LYN' : 'IRJET'));
    }
    if ((J._mass || 0) > 20) L.push(suEl('m_crane', 'Vinçle parça / aparat yükleme', 1, 8, fmtN(J._mass, 0) + ' kg', 'PROF'));
    L.push(suEl('m_zero', 'Sıfır noktası alma', nOrient, zU, nOrient + ' bağlama × ' + fmtN(zU, 1) + ' dk' + (sc.meas === 'manual' ? ' (kenar bulucu)' : ' (prob)'), 'IRJET'));
    L.push(suEl('m_prog', 'Program yükleme', nProg, 1.0, nProg + ' program × 1 dk', 'IEOM'));
  } else {
    L.push(suEl('m_cax', 'C ekseni / canlı takım referansı', 1, 2, '', 'IEOM'), suEl('m_idx', 'C açısı / indeks kontrolü', nOrient, 1, nOrient + ' yön × 1 dk', 'IEOM'));
  }
  if (!kit) L.push(suEl('m_find', 'Takım arama, kaldırma', ms.nw, 1.25, ms.nw + ' takım × 1,25 dk', 'IEOM'));
  const magM = sep || mach.type === 'millturn', swU = P.swap, mU = suMeasP(P);
  L.push(suEl('m_swap', magM ? 'Magazine takım bağlama' : 'Tarete canlı takım bağlama', ms.nw, swU, ms.nw + ' yeni takım × ' + fmtN(swU, 1) + ' dk' + (ms.have ? ' (' + ms.have + ' takım hazır)' : ''), 'PROF'));
  L.push(suEl('m_meas', 'Takım boy / çap ölçme', ms.nw, mU, ms.nw + ' takım × ' + fmtN(mU, 2) + ' dk', P.meas === 'manual' ? 'FAB' : suMeasSrc()));
  const mmat = 'c' in J && J.c ? J.c.mat : (J as FrezeIs).mat, mbm = mmat ? matBeh(mmat) : null;
  if (sc.job === 'new' && mbm && mbm.tune > 0) L.push(suEl('m_mat', 'Zor malzeme: freze kesme verisi denemesi', 1, +(mbm.tune / 2).toFixed(1), mmat.name + ' · ilk iş (tornanın yarısı)', 'MAT'));
  const rows = 'rows' in J ? J.rows : undefined;
  const nOps = rows ? rows.filter((r) => r.proc === 'mill').length : (J.res || []).reduce((a, r) => a + r!.ops.length, 0);
  if (sc.job === 'new') L.push(suEl('m_prove', 'Program denemesi (tek blok, düşük ilerleme)', 1, +((1.5 * mc + nOps) * P.prove).toFixed(1), '(1,5 × freze çevrimi ' + fmtN(mc, 1) + ' dk + ' + nOps + ' işlem × 1 dk)' + (P.prove !== 1 ? ' × ' + fmtN(P.prove, 1) + ' tezgâh' : ''), 'PM'));
  else L.push(suEl('m_dry', 'Kuru çalışma / ilk parça izleme', nOrient, 2, nOrient + ' yön × 2 dk', 'IRJET'));
  if (sc.job === 'new' && J._fai && (sep || !cfg)) L.push(suEl('m_fai', 'İlk ürün muayenesi (FAI) — ' + (sc.faiw === 'run' ? 'operatör kontrolü, üretim sürüyor' : 'tezgâh bekler'), 1, +J._fai.wait.toFixed(1), J._fai.chars.length + ' karakteristik ölçümü', 'FAI'));
  else if (!(sc.job === 'new' && J._fai)) L.push(suEl('m_fai', 'İlk parça freze ölçümü', 1, +suFAI(F).toFixed(1), F + ' ölçü', sc.tol === 'gen' ? 'IEOM' : 'JIT'));
  if (sc.qc === 'qa' && sep) L.push(suEl('m_qa', 'Kalite onayı bekleme', 1, 15, '', 'JIT'));
  return L;
}
export function suHandle(J: MtIs | FrezeIs, sep: boolean, nOrient: number, lathe: 'bar' | 'flip' | null): AyarElemani[] {
  const H: AyarElemani[] = [], sc = SC();
  if (lathe) { H.push(suEl('h_bar', 'Çubuk ilerletme / parça alma', 1, 0.25, 'parça başı', 'IEOM')); if (lathe === 'flip') H.push(suEl('h_flip', 'Parçayı ters çevirip bağlama', 1, 1.0, 'parça başı', 'JIT')); }
  if (sep) H.push(suEl('h_load', 'Yükleme / boşaltma / talaş temizliği', nOrient, 1.5, nOrient + ' bağlama × 1,5 dk', 'JIT'));
  const barFed = '_barFed' in J ? J._barFed : undefined;
  if ((J._mass || 0) > 20 && (sep || !barFed)) H.push(suEl('h_crane', 'Vinçle yükleme / boşaltma', 1, 4, 'parça başı · ' + fmtN(J._mass, 0) + ' kg', 'PROF'));
  H.push(suEl('h_chk', 'Ara kontrol', 1, sc.tol === 'gen' ? 0.15 : 0.3, '10 parçada bir 3 dk', 'JIT'));
  return H;
}
export function suFeatMill(J: MtIs | FrezeIs): number { let F = 0; (J.res || []).forEach((r) => { if (!r) return; F += (r.holes || []).length; F += r.ops.filter((o) => o.kind === 'finish' || o.kind === 'ball').length * 2; }); return Math.max(2, Math.min(30, F)); }

export interface AyarToplami {
  T: AyarElemani[]; M: AyarElemani[]; H: AyarElemani[];
  cycT: number; cycM: number; hT: number; hM: number; sep: boolean;
  lath?: Tezgah; mill: Tezgah | null; fai: FaiSonucu; J: MtIs | FrezeIs; kind: 'mt' | 'mill';
  q: number; of: number; rawT: number; rawM: number; setT: number; setM: number; hand: number; cyc: number; part: number;
  prod: number; setup: number; total: number; eff: number; machT: number; machM: number; beq: number;
}
type AyarGirdisi = Omit<AyarToplami, 'q' | 'of' | 'rawT' | 'rawM' | 'setT' | 'setM' | 'hand' | 'cyc' | 'part' | 'prod' | 'setup' | 'total' | 'eff' | 'machT' | 'machM' | 'beq'>;

/* torna-freze plani */
export function camSetupMT(J: MtIs): AyarToplami {
  const cfg = J.cfg, tIds: string[] = [], mIds: string[] = [], cal = camCal(); let tc = 0, mc = 0;
  J.rows.forEach((r) => { const a = r.proc === 'turn' ? tIds : mIds; if (a.indexOf(r.tool.id) < 0) a.push(r.tool.id); if (r.proc === 'turn') tc += r.time!; else mc += r.time!; });
  const orient = J.AS.setups.filter((_s, i) => J.res[i] && J.res[i]!.ops.length).length, sides = J.L2 && J.L2.ops.length ? 2 : 1;
  J._fai = camFAI(J, 'mt'); J._mass = suMass(J, 'mt'); J._barFed = J.D0 <= (camCaps(cfg.lathM).bar || 0);
  const T = suTurn(J, tIds, tc * cal), M = suMill(J, mIds, mc * cal, cfg.sep ? cfg.millSel : cfg.lathM, cfg.sep, orient, orient, suFeatMill(J));
  const H = suHandle(J, cfg.sep && mIds.length > 0, orient, sides > 1 && cfg.lathM.type !== 'millturn' ? 'flip' : 'bar');
  const hM = H.filter((x) => x.k === 'h_load' || (x.k === 'h_crane' && cfg.sep)).reduce((a, x) => a + x.min, 0), hT = H.reduce((a, x) => a + x.min, 0) - hM;
  return suTotals({ T, M, H, cycT: tc * cal, cycM: mc * cal, hT, hM, sep: cfg.sep, lath: cfg.lathM, mill: cfg.sep ? cfg.millSel : null, fai: J._fai, J, kind: 'mt' });
}
/* yalniz freze isi (blok); `progs` Oto-CAM'in yazdigi programlardir (prototipte CS.progs) */
export function camSetupMill(J: FrezeIs, progs: Record<string, NcProgram>): AyarToplami {
  const ids: string[] = [], cal = camCal(), clampN = J.five ? Math.max(1, J.setups.filter((s) => s.mode !== '32').length) : J.setups.length; let raw = 0;
  J.res.forEach((r) => { r.ops.forEach((o) => { if (ids.indexOf(o.tool.id) < 0) ids.push(o.tool.id); }); });
  Object.keys(progs).forEach((k) => { const t = progs[k]!.time; raw += t ? t.total : 0; });
  J._fai = camFAI(J, 'mill'); J._mass = suMass(J, 'mill');
  const M = suMill(J, ids, raw * cal, J.mach, true, clampN, J.setups.length, suFeatMill(J)), H = suHandle(J, true, clampN, null);
  return suTotals({ T: [], M, H, cycT: 0, cycM: raw * cal, hT: 0, hM: H.reduce((a, x) => a + x.min, 0), sep: false, mill: J.mach, fai: J._fai, J, kind: 'mill' });
}
export function suTotals(G: AyarGirdisi): AyarToplami {
  const q = camQty(), sum = (a: AyarElemani[]): number => a.reduce((s, x) => s + x.min, 0), of = suOpF();
  const E = G as AyarToplami;
  E.q = q; E.of = of; E.rawT = sum(E.T); E.rawM = sum(E.M); E.setT = E.rawT * of; E.setM = E.rawM * of; E.hand = E.hT + E.hM; E.cyc = E.cycT + E.cycM; E.part = E.cyc + E.hand;
  E.prod = q * E.part; E.setup = E.setT + E.setM; E.total = E.setup + E.prod; E.eff = E.total / q;
  E.machT = E.setT + q * (E.cycT + E.hT); E.machM = E.setM + q * (E.cycM + E.hM);
  E.beq = E.part > 0 ? Math.ceil(E.setup / E.part) : 0;
  return E;
}
export function fmtHM(min: number): string { const m = Math.round(min); if (m < 60) return m + ' dk'; const h = Math.floor(m / 60), r = m % 60; return h + ' sa ' + (r < 10 ? '0' : '') + r + ' dk'; }
export function fmtHC(min: number): string { const m = Math.round(min), h = Math.floor(m / 60), r = m % 60; return h + ':' + (r < 10 ? '0' : '') + r; }
export function suWith<T>(over: Partial<AtolyeKosullari>, fn: () => T): T { const c = camKaydi(), old = c.sc; c.sc = Object.assign({}, old, over); try { return fn(); } finally { c.sc = old; } }

export interface Senaryo { n: string; o: Partial<AtolyeKosullari>; R: AyarToplami; cur: boolean }
export const SENARYOLAR: [string, Partial<AtolyeKosullari>][] = [['Seçili koşullar', {}], ['Tekrar iş', { job: 'repeat' }], ['İlk üretim (FAI dahil)', { job: 'new' }], ['+ Ön ayar cihazı ve kit', { meas: 'preset', kit: 'yes' }], ['+ Hızlı çene / sıfır noktası', { jaw: 'quick', fix: 'zp' }], ['En iyi pratik (SMED)', { meas: 'preset', kit: 'yes', jaw: 'quick', fix: 'zp', op: 'exp', qc: 'op' }], ['Seyrek kullanan operatör', { op: 'rare' }]];
export function suScenarios(f: () => AyarToplami): Senaryo[] {
  const sc = SC();
  return SENARYOLAR.map((x) => { const R = suWith(x[1], f); const same = Object.keys(x[1]).every((k) => sc[k] === x[1][k]); return { n: x[0], o: x[1], R, cur: same }; });
}
export function camSetupCSV(E: AyarToplami): string[][] {
  const rows: string[][] = [['', '', '', 'AYAR VE TOPLAM SÜRE (parti ' + E.q + ')', '', '', '', '', '']];
  E.T.concat(E.M).forEach((x) => { if (x.n) rows.push(['', 'AYAR', E.T.indexOf(x) >= 0 ? 'Torna' : 'Freze', x.lbl, x.note, '', x.src, '', fmtN(x.min * E.of, 2)]); });
  rows.push(['', '', '', 'Torna hazırlığı', '', '', '', '', fmtN(E.setT, 2)], ['', '', '', 'Freze hazırlığı', '', '', '', '', fmtN(E.setM, 2)], ['', '', '', 'Parça başı çevrim + yükleme', '', '', '', '', fmtN(E.part, 2)], ['', '', '', 'Toplam iş süresi (dk)', '', '', '', '', fmtN(E.total, 2)], ['', '', '', 'Parça başı (ayar dahil)', '', '', '', '', fmtN(E.eff, 2)]);
  return rows;
}

/* Teorik yaklasim
   1) Tezgah profili: ayari degistiren fiziksel ozellikler (takim baglama, olcme donanimi, ayna / aparat, karsi is mili, punta / yatak,
      tipik parca agirligi, program deneme zorlugu).
   2) Uc nokta (PERT): her adim icin a, m, b; beklenen = (a + 4m + b) / 6. a ve b adimin turune gore m'nin kati.
   3) Monte Carlo: adimlar Beta-PERT dagilimindan cekilir + ortak "gun katsayisi" (ayni operator, ayni gun) -> P10 / P50 / P90.
   En iyi = en iyi kosullar + her adim en kisa (Σa); ortalama = secili kosullar, beklenen; en kotu = kotu kosullar, P90 (Σb ayrica). */
export const SU_SPREAD: Record<string, [number, number, string, string]> = {
  fix: [0.7, 1.5, 'Sabit iş', 'program yükleme'],
  mech: [0.7, 1.8, 'Mekanik iş', 'söküp takma, bağlama, taşıma'],
  meas: [0.6, 2.5, 'Ölçme / ayarlama', 'sıfır, ofset, hizalama — sahada en çok saçılan adım (ORS: hazırlık süresinin %49\'u)'],
  srch: [0.3, 3, 'Arama', 'takım, aparat, mastar arama — kit hazırsa sıfır'],
  prove: [0.5, 3, 'Program denemesi', 'tek blok deneme, düzeltme — ustalar "2 dk ile 2 saat arası" diyor'],
  insp: [0.7, 2, 'Muayene', 'ilk parça / FAI ölçümü'],
  wait: [0.2, 4, 'Bekleme', 'kalite biriminin ölçüm kuyruğu'],
};
export function suCls(k: string): string {
  if (/_qa$/.test(k)) return 'wait'; if (/fai/.test(k)) return 'insp'; if (/prove|_mat$|first/.test(k)) return 'prove'; if (/find/.test(k)) return 'srch'; if (/prog/.test(k)) return 'fix';
  if (/meas|zero|true|gauge|dry|cutl|subz|idx|cax|tail|steady|tset/.test(k)) return 'meas'; return 'mech';
}
/* tezgah profilleri; m: dk, kg: tipik parca, ld: tipik boy / cap */
export interface TezgahProfili {
  cls: string; hold: string; swap: number; meas: string; prove: number; kg: number; why: string;
  jaw?: number; jawQ?: number; sub?: number; tail?: number; steady?: number; ld?: number; fix?: number; fixQ?: number; nfix?: number; apc?: number;
  ready?: number;
  [alan: string]: string | number | undefined;
}
export const SU_PDEF: Record<string, TezgahProfili> = {
  tfm: { cls: 'mt', hold: 'Capto C6 · 38 cep magazin', swap: 1.2, meas: 'probe', jaw: 20, jawQ: 2, sub: 1, prove: 1.5, kg: 8, ld: 3, why: 'B ekseni + karşı iş mili: program denemesi uzun, ama tek bağlamada biter' },
  tcy: { cls: 'lathe', hold: 'BMT taret · 12 istasyon', swap: 2.5, meas: 'probe', jaw: 20, jawQ: 2, tail: 1, prove: 1.0, kg: 6, ld: 3, why: '12 istasyonlu taret: her iş için takım söküp takmak gerekir' },
  tby: { cls: 'lathe', hold: 'Ağır taret · 12 istasyon', swap: 3.5, meas: 'probe', jaw: 35, jawQ: 5, tail: 1, steady: 1, prove: 1.2, kg: 60, ld: 10, why: 'Büyük ayna, punta, yatak ve vinç: en uzun torna hazırlığı' },
  ulathe: { cls: 'manual', hold: '4\'lü kalemlik', swap: 3, meas: 'manual', jaw: 15, jawQ: 15, tail: 1, prove: 0, kg: 5, ld: 3, why: 'Program yok; her ölçü deneme talaşıyla tutturulur' },
  f5a: { cls: 'mill5', hold: 'HSK-A63 · 30 cep', swap: 1.2, meas: 'probe', fix: 8, fixQ: 0.8, prove: 1.3, kg: 5, why: '5 eksen: çarpışma kontrolü için deneme yavaş' },
  f5b: { cls: 'mill5', hold: 'HSK-A63 · 30 cep', swap: 1.2, meas: 'probe', fix: 8, fixQ: 0.8, prove: 1.3, kg: 10, why: '5 eksen döner kafa' },
  f5c: { cls: 'mill5', hold: 'HSK-A63 · 30 cep', swap: 1.2, meas: 'probe', fix: 10, fixQ: 0.8, prove: 1.3, kg: 18, why: '5 eksen döner kafa, büyük tabla' },
  f5d: { cls: 'mill5', hold: 'HSK-A63 · 30 cep', swap: 1.2, meas: 'probe', fix: 12, fixQ: 1, prove: 1.3, kg: 35, why: 'Büyük parça: vinçle bağlama' },
  fgk: { cls: 'mill5', hold: 'HSK-A63 · 30 cep', swap: 1.2, meas: 'probe', fix: 15, fixQ: 2, nfix: 2, prove: 1.3, kg: 60, why: 'Uzun tabla: birden çok aparatı aynı eksene hizalamak' },
  yim: { cls: 'hmc', hold: 'BT40 · 60 cep', swap: 1.2, meas: 'probe', fix: 8, fixQ: 0.8, apc: 1, prove: 1.1, kg: 15, why: 'Palet değiştirici: aparat diğer palet işlerken dışarıda hazırlanır' },
};
export const SU_PF: [string, string, string][] = [['swap', 'Takım bağlama', 'dk / takım'], ['hold2', 'Ayna / aparat', 'dk'], ['meas', 'Takım ölçme', ''], ['prove', 'Deneme ×', ''], ['kg', 'Tipik parça', 'kg']];
export function suProfBase(m: Pick<Tezgah, 'id' | 'manual' | 'type'>): TezgahProfili {
  const id = String(m.id); let b = SU_PDEF[id] || SU_PDEF[id.replace(/_\d+$/, '')];
  if (!b) b = m.manual ? SU_PDEF['ulathe']! : m.type === 'millturn' ? SU_PDEF['tfm']! : m.type === 'lathe' ? SU_PDEF['tcy']! : SU_PDEF['f5a']!;
  return b;
}
export function suProf(m: Pick<Tezgah, 'id' | 'manual' | 'type' | 'pockets'>): TezgahProfili & { ready: number } {
  const p = Object.assign({}, suProfBase(m)) as TezgahProfili & { ready: number }, o = suProfKaydi()[m.id] || {};
  Object.keys(o).forEach((k) => { const v = o[k]; if (v !== '' && v != null) p[k] = k === 'meas' ? v : +v; });
  if (m.manual) { p.cls = 'manual'; p.meas = 'manual'; }
  p.ready = clamp(((m.pockets || 12) - 10) / 60, 0, 0.6); if (p.cls === 'manual') p.ready = 0;
  return p;
}
export function suMeasP(P: TezgahProfili): number { return P.meas === 'manual' ? (P.cls === 'manual' ? 3 : 2.5) : suMeasU(); }
export function suJawP(P: TezgahProfili): number { return (SC().jaw === 'quick' ? P.jawQ : P.jaw)!; }
export function suFixP(P: TezgahProfili): number { return (SC().fix === 'zp' ? P.fixQ : P.fix)!; }
export function suMass(J: MtIs | FrezeIs, kind: 'mt' | 'mill'): number {
  if (kind === 'mt') { const M = J as MtIs, rho = M.c.mat.rho || 7.85, L0 = (M.G as { L0?: number }).L0 || M.Lp; return Math.PI * (Math.pow(M.D0 / 2, 2) - Math.pow((M.ID || 0) / 2, 2)) * L0 * rho / 1e6; }
  const F = J as FrezeIs, rho = (F.mat || material()).rho || 7.85, s = F.G && F.G.stock; return s ? s.Lx * s.Ly * s.Lz * rho / 1e6 : 0;
}

/* Monte Carlo */
export function suRng(seed: number): () => number { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 1000003) / 1000003; }; }
export function suGamma(k: number, R: () => number): number {
  if (k < 1) return suGamma(k + 1, R) * Math.pow(R() || 1e-9, 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (; ;) {
    let x: number, v: number;
    do { const u1 = R() || 1e-9, u2 = R(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0);
    v = v * v * v; const u = R() || 1e-9; if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}
export function suAbm(x: AyarElemani): { a: number; m: number; b: number } { const s = SU_SPREAD[suCls(x.k)] || SU_SPREAD['mech']!; return { a: x.min * s[0], m: x.min, b: x.min * s[1] }; }
export interface MonteCarloSonucu { lo: number; hi: number; pert: number; mean: number; p10: number; p50: number; p90: number }
export function suMC(els: AyarElemani[], of: number, N?: number): MonteCarloSonucu {
  N = N || 1500; const R = suRng(20261012), P = els.filter((x) => x.min > 0).map((x) => { const t = suAbm(x), w = t.b - t.a; return { a: t.a, b: t.b, w, al: 1 + 4 * (t.m - t.a) / w, be: 1 + 4 * (t.b - t.m) / w, mean: (t.a + 4 * t.m + t.b) / 6 }; });
  let lo = 0, hi = 0, mean = 0; const S = new Float64Array(N); P.forEach((p) => { lo += p.a; hi += p.b; mean += p.mean; });
  for (let i = 0; i < N; i++) {
    const u = R(), day = u < 0.1 / 0.35 ? 0.9 + Math.sqrt(u * 0.35 * 0.1) : 1.25 - Math.sqrt((1 - u) * 0.35 * 0.25); let t = 0; /* ucgen(0,9 · 1 · 1,25) */
    for (let j = 0; j < P.length; j++) { const p = P[j]!, g1 = suGamma(p.al, R), g2 = suGamma(p.be, R); t += p.a + p.w * g1 / (g1 + g2); }
    S[i] = t * day * of;
  }
  S.sort(); const n = N, q = (f: number): number => S[Math.min(n - 1, Math.floor(f * n))]!; let avg = 0; for (let k = 0; k < N; k++) avg += S[k]!; avg /= N;
  return { lo: lo * of, hi: hi * of * 1.25, pert: mean * of, mean: avg, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
}
export const SU_BEST: Partial<AtolyeKosullari> = { meas: 'preset', kit: 'yes', jaw: 'quick', fix: 'zp', op: 'exp', qc: 'op' }, SU_WORST: Partial<AtolyeKosullari> = { meas: 'manual', kit: 'no', jaw: 'std', fix: 'vise', op: 'rare', qc: 'qa' };
export interface AyarAraligi { best: number; mean: number; p10: number; p50: number; p90: number; pert: number; worst: number; abs: number }
export function suRangeOf(build: () => { els: AyarElemani[]; of: number }): AyarAraligi {
  const b = suWith(SU_BEST, () => { const E = build(); return { lo: suMC(E.els, E.of, 300).lo }; });
  const c = suMC(build().els, suOpF(), 1500);
  const w = suWith(SU_WORST, () => { const E = build(); return suMC(E.els, E.of, 1200); });
  return { best: b.lo, mean: c.mean, p10: c.p10, p50: c.p50, p90: c.p90, pert: c.pert, worst: w.p90, abs: w.hi };
}
export function camSetupRange(E: AyarToplami, progs: Record<string, NcProgram>): AyarAraligi {
  const K = E.kind, JJ = E.J;
  return suRangeOf(() => { const X = K === 'mt' ? camSetupMT(JJ as MtIs) : camSetupMill(JJ as FrezeIs, progs); return { els: X.T.concat(X.M), of: X.of }; });
}

/* tezgah karsilastirmasi: standart referans is */
export const SU_REF = { tools: 10, F: 12, sides: 2, cycT: 10, cycM: 15, ops: 8 };
export function suRefEls(m: Pick<Tezgah, 'id' | 'manual' | 'type' | 'pockets'>): AyarElemani[] {
  const sc = SC(), P = suProf(m), L: AyarElemani[] = [], kit = sc.kit === 'yes', nw = Math.round(SU_REF.tools * (1 - P.ready)), F = SU_REF.F, S2 = SU_REF.sides, nu = sc.job === 'new';
  const mU = suMeasP(P), faiW = (): number => { const u = ({ gen: 0.6, fine: 1.1, tight: 1.3 } as Record<string, number>)[sc.tol]! * F + (sc.tol === 'tight' ? 30 + F : 0); return sc.faiw === 'run' ? 5 : u; };
  if (P.cls === 'manual') {
    const nt = 4; if (!kit) L.push(suEl('t_find', 'Kalem / malzeme arama', nt + 1, 1.25, '', 'IEOM'));
    L.push(suEl('t_swap', 'Kalem bağlama + punta yüksekliği', nt, P.swap, '', ''), suEl('t_meas', 'Kalem sıfırı (deneme talaşı)', nt, mU, '', ''), suEl('t_jaw', 'Ayna çenesi', 1, suJawP(P), '', 'MTA'));
    if (!kit) L.push(suEl('t_stock', 'Malzeme kontrolü', 1, 6, '', 'IEOM'));
    L.push(suEl('t_blank', 'Ham parçayı bağlama + salgı', S2, 4, '', ''));
    if (P.tail && P.ld! > 4) L.push(suEl('t_tail', 'Punta ayarı', 1, 5, '', ''));
    L.push(suEl('t_first', 'İlk parçayı deneme talaşıyla ölçüye getirme', F, 1.5, '', ''));
    L.push(nu ? suEl('t_fai', 'FAI', 1, faiW(), '', 'FAI') : suEl('t_fai', 'İlk parça ölçümü', 1, suFAI(F), '', 'JIT'));
    if (sc.qc === 'qa') L.push(suEl('t_qa', 'Kalite onayı bekleme', 1, 15, '', 'JIT'));
    return L;
  }
  if (P.cls === 'lathe' || P.cls === 'mt') {
    L.push(suEl('t_prog', 'Program yükleme', S2, 1, '', 'IEOM')); if (!kit) L.push(suEl('t_find', 'Takım / malzeme arama', nw + 1, 1.25, '', 'IEOM'));
    L.push(suEl('t_swap', 'Takım bağlama', nw, P.swap, '', ''), suEl('t_meas', 'Takım ölçme', nw, mU, '', ''), suEl('t_jaw', 'Ayna çenesi', 1, suJawP(P), '', 'MTA'));
    if (!kit) L.push(suEl('t_stock', 'Malzeme kontrolü', 1, 6, '', 'IEOM'));
    L.push(suEl('t_bar', 'Çubuk / ham parça yükleme', 1, 5.5, '', 'IEOM'), suEl('t_zero', 'İş parçası sıfırı', S2, 1.9, '', 'IEOM'));
    if (sc.tol !== 'gen') L.push(suEl('t_gauge', 'Mastar ayarı', 1, 2.4, '', 'IEOM'));
    if (P.sub) L.push(suEl('t_subjaw', 'Karşı iş mili çenesi', 1, sc.jaw === 'quick' ? 2 : 8.5, '', 'IEOM'), suEl('t_skim', 'Yumuşak çene', 1, 4.2, '', 'IEOM'), suEl('t_cutl', 'Aktarma boyu', 1, 3.5, '', 'IEOM'), suEl('t_subz', 'Karşı iş mili sıfırları', 1, 4.4, '', 'IEOM'));
    else L.push(suEl('t_flipjaw', 'Ters bağlama çenesi', 1, suJawP(P), '', 'MTA'), suEl('t_skim', 'Yumuşak çene', 1, 4.2, '', 'IEOM'));
    if (P.cls === 'mt') L.push(suEl('m_cax', 'C ekseni / canlı takım referansı', 1, 2, '', 'IEOM'));
    if (P.tail && P.ld! > 4) L.push(suEl('t_tail', 'Punta ayarı', 1, 5, '', ''));
    if (P.steady && P.ld! > 10) L.push(suEl('t_steady', 'Yatak (lünet) ayarı', 1, 20, '', ''));
    if (P.kg > 20) L.push(suEl('t_crane', 'Vinçle yükleme', 1, 8, '', ''));
    if (nu) L.push(suEl('t_prove', 'Program denemesi', 1, (1.5 * SU_REF.cycT + SU_REF.ops) * P.prove, '', 'PM'), suEl('t_fai', 'FAI', 1, faiW(), '', 'FAI'));
    else L.push(suEl('t_dry', 'Kuru çalışma', S2, 5, '', 'IEOM'), suEl('t_fai', 'İlk parça ölçümü', 1, suFAI(F), '', 'JIT'));
    if (sc.qc === 'qa') L.push(suEl('t_qa', 'Kalite onayı bekleme', 1, 15, '', 'JIT'));
    return L;
  }
  const zU = sc.meas === 'manual' || P.meas === 'manual' ? 4 : 1.5;
  if (P.apc && kit) L.push(suEl('m_pal', 'Palet değişimi (aparat dışarıda hazır)', 1, 1, '', ''));
  else L.push(suEl('m_clean', 'Tabla temizliği', 1, 0.8, '', 'IRJET'), suEl('m_mount', 'Aparat bağlama', P.nfix || 1, 1.2, '', 'IRJET'), suEl('m_true', 'Aparat hizalama', P.nfix || 1, suFixP(P), '', 'IRJET'));
  L.push(suEl('m_zero', 'Sıfır noktası', S2, zU, '', 'IRJET'), suEl('m_prog', 'Program yükleme', S2, 1, '', 'IEOM'));
  if (!kit) L.push(suEl('m_find', 'Takım arama', nw, 1.25, '', 'IEOM'));
  L.push(suEl('m_swap', 'Magazine takım', nw, P.swap, '', 'IRJET'), suEl('m_meas', 'Takım ölçme', nw, mU, '', ''));
  if (P.kg > 20) L.push(suEl('m_crane', 'Vinçle yükleme', 1, 8, '', ''));
  if (nu) L.push(suEl('m_prove', 'Program denemesi', 1, (1.5 * SU_REF.cycM + SU_REF.ops) * P.prove, '', 'PM'), suEl('m_fai', 'FAI', 1, faiW(), '', 'FAI'));
  else L.push(suEl('m_dry', 'Kuru çalışma', S2, 2, '', 'IRJET'), suEl('m_fai', 'İlk parça ölçümü', 1, suFAI(F), '', 'JIT'));
  if (sc.qc === 'qa') L.push(suEl('m_qa', 'Kalite onayı bekleme', 1, 15, '', 'JIT'));
  return L;
}
export function suRefRange(m: Pick<Tezgah, 'id' | 'manual' | 'type' | 'pockets'>, job: string): AyarAraligi { return suWith({ job }, () => suRangeOf(() => ({ els: suRefEls(m), of: suOpF() }))); }
export interface ProfilSatiri { m: Tezgah; P: TezgahProfili & { ready: number }; A: AyarAraligi; B: AyarAraligi }
export function suProfRows(): ProfilSatiri[] { return allMachines().map((m) => ({ m, P: suProf(m), A: suRefRange(m, 'repeat'), B: suRefRange(m, 'new') })); }
