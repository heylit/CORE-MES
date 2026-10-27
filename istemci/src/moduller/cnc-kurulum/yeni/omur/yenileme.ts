import { fmtN } from './cekirdek.ts';
import type { AsinmaKaydi, OmurKarti, Takim, YenilemeAni } from './tipler.ts';

// Ömür yenileme: uç çevirme, bileme, kenar düzeltme. Hangi takımda hangisi mümkün: uç kodundan kenar sayısı, takım tipinden bileme
// hakkı. Kayıt `state.wear[tezgâh][cep]` içindedir (ed kenar, rg bileme, lf ömür katsayısı, dd çap kaybı, dl boy kaybı, log geçmiş).

const RN_SHAPE: Record<string, [number, string]> = {
  C: [2, '80° eşkenar dörtgen'], D: [2, '55° eşkenar dörtgen'], V: [2, '35° eşkenar dörtgen'], A: [2, '85° paralelkenar'],
  K: [2, '55° paralelkenar'], B: [2, '82° paralelkenar'], E: [2, '75° eşkenar dörtgen'], M: [2, '86° eşkenar dörtgen'],
  L: [2, 'dikdörtgen'], W: [3, 'trigon'], T: [3, 'üçgen'], S: [4, 'kare'], P: [5, 'beşgen'], H: [6, 'altıgen'], O: [8, 'sekizgen'],
  R: [4, 'yuvarlak (döndürme konumu)'],
};

export interface UcBilgisi { edges: number; n: number; code: string; txt: string }

export function rnInsert(t: Takim): UcBilgisi {
  const src = (t.code || '') + ' ' + (t.name || ''), m = /\b([CDVAKBEMLWTSPHOR])([NABCDEFGOP])([A-Z])([A-Z])\b/.exec(src);
  const n = /(\d+)\s*uç/i.exec(t.code || ''), ins = n ? +n[1]! : 1;
  if (/^lt_(thread|ithread)$/.test(t.kind) || /\b\d{2}[EI]R\b/.test(src)) {
    return { edges: 3, n: 1, code: (/\b\d{2}[EI]R[^·]*/.exec(src) || ['diş ucu'])[0].trim(), txt: 'yatay diş ucu · 3 köşe' };
  }
  if (/^lt_(groove|igroove|part|facegroove)$/.test(t.kind) || t.kind === 'disc') {
    return {
      edges: t.kind === 'lt_facegroove' ? 1 : 2, n: t.kind === 'disc' ? Math.max(4, Math.round((t.d || 80) / 10)) : 1,
      code: t.kind === 'disc' ? 'kanal ucu' : 'kanal / kesme ucu', txt: t.kind === 'lt_facegroove' ? 'tek uçlu' : 'çift uçlu (iki tarafı kullanılır)',
    };
  }
  if (m) {
    const sh = RN_SHAPE[m[1]!]!, dbl = m[2] === 'N', e = sh[0] * (dbl ? 2 : 1);
    return {
      edges: e, n: ins, code: m[0],
      txt: sh[1] + (dbl ? ' · çift taraflı (negatif)' : ' · tek taraflı (pozitif)') + ' · ' + e + ' kenar' + (ins > 1 ? ' · gövdede ' + ins + ' uç' : ''),
    };
  }
  if (t.kind === 'lt_knurl') return { edges: 0, n: 1, code: 'tırtıl makarası', txt: 'çevrilmez — makara değişir' };
  return { edges: 2, n: ins, code: 'kesici uç', txt: 'uç kodu bulunamadı · 2 kenar varsayıldı' };
}

export interface YenilemeOlanagi {
  index: number;
  regrind: number;
  dress: boolean;
  kind: 'none' | 'index' | 'regrind' | 'dress';
  why: string;
  ins?: UcBilgisi;
  dD?: number;
  dL?: number;
  coated?: boolean;
}

export function rnCaps(t: Takim): YenilemeOlanagi {
  const k = t.kind, o: YenilemeOlanagi = { index: 0, regrind: 0, dress: false, kind: 'none', why: '' }, d = t.d || 0, H = t.tm === 'H';
  if (k === 'probe' || k === 'empty') { o.why = 'Ölçüm probu / boş cep'; return o; }
  if (t.tm === 'I' || (/^lt_/.test(k) && k !== 'lt_knurl')) {
    const ins = rnInsert(t); o.ins = ins; o.index = ins.edges; o.kind = 'index'; o.why = ins.edges ? 'Uçlu takım: ' + ins.txt : ins.txt; return o;
  }
  if (k === 'lt_knurl') { o.why = 'Tırtıl makarası çevrilmez, bilenmez'; return o; }
  const tab: Record<string, number> = {
    endmill: H ? 6 : d < 6 ? 2 : d < 12 ? 4 : 5, rougher: 3, bullnose: 3, ball: d >= 6 ? 3 : 1, taperball: 2, longneck: 2,
    drill: H ? 12 : /5×D|8×D|10×D/.test(t.name) ? 8 : 5, stepdrill: 3, spot: 6, center: 8, csink: 8, chamfer: 4, backchamfer: 2, reamer: 3,
    tap: d >= 5 ? 3 : 0, threadmill: 0, tslot: 2, keyseat: 2, engrave: 6, lollipop: 1, barrel: 1,
  };
  o.regrind = tab[k] ?? 2;
  if (d > 0 && d < 3 && !/spot|center|engrave|csink|chamfer/.test(k)) o.regrind = 0;
  o.dress = k !== 'threadmill' && k !== 'tap';
  o.kind = o.regrind ? 'regrind' : o.dress ? 'dress' : 'none';
  // Bileme başına tipik kayıp.
  o.dD = /endmill|rougher|bullnose|ball|longneck|taperball|tslot|keyseat/.test(k) ? 0.1 : 0;
  o.dL = /drill/.test(k) ? 0.8 : /tap/.test(k) ? 0.5 : 0.3;
  o.coated = !!(t.coat || /AlTiN|TiAlN|TiN|AlCrN|DLC|kapl/i.test((t.code || '') + (t.name || '')));
  o.why = k === 'threadmill' ? 'Diş frezesi profil taşlamalı: bilenmez, yalnız değiştirilir'
    : k === 'tap' && !o.regrind ? 'Küçük kılavuz: bileme ekonomik değil'
    : !o.regrind ? 'Küçük çap: bileme ekonomik değil' + (o.dress ? ', yalnız kenar düzeltme' : '')
    : (H ? 'HSS' : 'Karbür') + ' takım: en çok ' + o.regrind + ' kez bilenebilir'
      + (o.dD ? ' (her bilemede çap ≈ −' + o.dD + ' mm)' : ' (her bilemede boy ≈ −' + o.dL + ' mm)');
  if (k === 'lollipop' || k === 'barrel') o.why = 'Form takımı: yalnız üreticide 1 kez bilenebilir';
  return o;
}

export function rnFactor(t: Takim, caps: YenilemeOlanagi, rg: number, recoat: boolean): number {
  const f = t.tm === 'H' ? (caps.coated && !recoat ? 0.75 : 0.85) : caps.coated && !recoat ? 0.65 : 0.9;
  return f * Math.pow(0.97, Math.max(0, rg - 1));
}

export type YenilemeKaydi = AsinmaKaydi & Required<Pick<AsinmaKaydi, 'ed' | 'rg' | 'lf' | 'log'>>;

// Eksik yenileme alanları ilk dokunuşta prototipteki varsayılanla açılır.
export function rnTamamla(r: AsinmaKaydi): YenilemeKaydi {
  if (r.ed == null) r.ed = 1;
  if (r.rg == null) r.rg = 0;
  if (r.lf == null) r.lf = 1;
  if (!r.log) r.log = [];
  return r as YenilemeKaydi;
}

export const rnSnap = (r: YenilemeKaydi): YenilemeAni =>
  ({ used: r.used, parts: r.parts, ed: r.ed, rg: r.rg, lf: r.lf, dd: r.dd || 0, dl: r.dl || 0 });

function rnLog(r: YenilemeKaydi, a: string, txt: string, snap: YenilemeAni, simdi: number): void {
  r.log.unshift({ t: simdi, a, txt, s: snap });
  r.log = r.log.slice(0, 20);
}

export function rnState(c: Pick<OmurKarti, 'w' | 't'>): { caps: YenilemeOlanagi; txt: string } {
  const w = c.w, caps = rnCaps(c.t), s: string[] = [];
  if (caps.index) s.push('Kenar ' + (w.ed || 1) + '/' + caps.index);
  if (caps.regrind) s.push((w.rg || 0) ? 'Bileme ' + w.rg + '/' + caps.regrind : 'Yeni (' + caps.regrind + ' bileme hakkı)');
  return { caps, txt: s.join(' · ') || (c.t.kind === 'probe' ? 'Yenileme yok' : caps.dress ? 'Düzeltilebilir' : 'Yalnız değişim') };
}

export type YenilemeEylemi =
  | { a: 'index' }
  | { a: 'newins' }
  | { a: 'regrind'; cap: number; boy: number; kaplandi: boolean }
  | { a: 'dress'; oran: number }
  | { a: 'undo' };

// Bir yenileme eylemini kayda uygular; uygulanmadıysa (hak kalmadı, geri alınacak yok) false döner. `new` (yeni takım) eylemi
// onay penceresinden geçtiği için `yeniTakim` ile ayrıdır. Örnek işareti kalkar: kayıt artık kullanıcınındır.
export function yenile(t: Takim, r: YenilemeKaydi, e: YenilemeEylemi, simdi: number): boolean {
  const caps = rnCaps(t), snap = rnSnap(r);
  if (e.a === 'index' && r.ed < caps.index) {
    rnLog(r, 'index', 'Uç çevrildi: kenar ' + r.ed + ' → ' + (r.ed + 1) + ' (' + fmtN(r.used, 1) + ' dk kesmişti)', snap, simdi);
    r.ed++; r.used = 0; r.parts = 0; r.since = simdi;
  } else if (e.a === 'newins' && caps.ins) {
    rnLog(r, 'newins', 'Yeni uç seti takıldı (' + caps.ins.n + ' uç · ' + caps.index + ' kenar)', snap, simdi);
    r.ed = 1; r.used = 0; r.parts = 0; r.since = simdi;
  } else if (e.a === 'regrind' && r.rg < caps.regrind) {
    const f = rnFactor(t, caps, r.rg + 1, e.kaplandi);
    rnLog(r, 'regrind', 'Bilendi #' + (r.rg + 1) + (t.d ? ' · Ø' + fmtN(e.cap, 2) : '') + ' · boy −' + fmtN(e.boy, 1) + ' mm'
      + (e.kaplandi ? ' · yeniden kaplandı' : '') + ' · ömür %' + fmtN(f * 100, 0), snap, simdi);
    r.rg++; r.lf = f; r.dd = t.d ? Math.max(0, t.d - e.cap) : 0; r.dl = (r.dl || 0) + e.boy; r.used = 0; r.parts = 0; r.since = simdi;
  } else if (e.a === 'dress') {
    const back = r.used * e.oran;
    rnLog(r, 'dress', 'Kenar düzeltildi · ' + fmtN(back, 1) + ' dk geri kazanıldı', snap, simdi);
    r.used = Math.max(0, r.used - back); r.lf = (r.lf || 1) * 0.98;
  } else if (e.a === 'undo' && r.log.length) {
    const lg = r.log.shift();
    if (lg?.s) Object.assign(r, lg.s);
  } else return false;
  delete r.demo;
  return true;
}

export const yeniTakim = (t: Takim, simdi: number): AsinmaKaydi =>
  ({ id: t.id, used: 0, parts: 0, since: simdi, ed: 1, rg: 0, lf: 1, log: [{ t: simdi, a: 'new', txt: 'Yeni takım takıldı' }] });

// Yeni uç setinde düşülecek depo kalemi: uç kodunun ilk parçasıyla başlayan sarf kalemi.
export function rnInsItem<T extends { name?: string }>(t: Takim, inserts: readonly T[]): T | null {
  const code = rnInsert(t).code.replace(/\s+/g, ' ');
  return inserts.filter((x) => x.name && code.length > 3 && x.name.replace(/\s+/g, ' ').indexOf(code.split(' ')[0]!) === 0)[0] ?? null;
}
