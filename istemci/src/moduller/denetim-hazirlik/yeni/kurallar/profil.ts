import { PROGRAMLAR, PROGRAM_SIRASI } from '../icerik/programlar.ts';
import { PROC_TPL } from '../icerik/kys-yapi.ts';
import { TYPES_EY } from '../icerik/iso9001.ts';
import { bosKal, bosKys, bosOz, bosProfil, profilNormalize, yeniDenetim, yeniKimlik } from '../normalize.ts';
import { bugunTarihi, gunEkle, pazartesi } from '../tarih.ts';
import type { Calisma, Depo, OzMaddesi, Profil, ProgramKodu } from '../tipler.ts';
import { belgeSonGunuEsitle } from './denetim-takvimi.ts';
import { donemAnahtari, gostergeAylari } from './kys.ts';

// Profil listesi işlemleri (prototip Profil ve veriler). Silme, seçerek sıfırlama, bütün profilleri silme ve yedekten yükleme yalnız
// yöneticidedir (226 a; yonetim.ts); bu işlevler yalnız kaydı değiştirir.

export { bosProfil, yeniKimlik };

export const profilAdi = (x: Profil | undefined): string => x?.profile.firma || 'Adsız profil';

// Prototipin "boş profil" tanımı; sunucudaki yönetim kuralı da bunu kullanır (226 a).
export const bosProfilMi = (x: Profil): boolean =>
  !x.profile.firma && !x.audits.length && PROGRAM_SIRASI.every((p) => {
    const w = x.pw[p];
    return (['ans', 'checks', 'docs', 'cards', 'trace', 'notes'] as const).every((k) => Object.keys(w[k]).length === 0);
  });

export type SifirlamaAlani = 'sim' | 'prep' | 'trace' | 'cards' | 'docs' | 'cal' | 'oz' | 'kys' | 'kalib' | 'info';
export const SIFIRLAMA_ALANLARI: readonly [SifirlamaAlani, string][] = [
  ['sim', 'Simülasyon cevapları, kanıt işaretleri, notlar ve aksiyon durumları'], ['prep', 'Hazırlık takvimi görevleri'], ['trace', 'İz sürme tatbikatı'],
  ['cards', 'Soru kartı ilerlemesi'], ['docs', 'Doküman işaretleri'], ['cal', 'Bu firmanın takvimdeki tüm denetimleri'], ['oz', 'Öz değerlendirme turları ve geçmişi'],
  ['kys', 'KYS yapı taşları ve süreçler (firma geneli)'], ['kalib', 'Kalibrasyon cihaz listesi ve geçmişi (firma geneli)'], ['info', 'Firma bilgileri'],
];

// Seçilen alanları açık programda ve profilde sıfırlar (prototip applyReset; ekran durumu ayrıca sıfırlanır).
export function sifirla(profil: Profil, program: ProgramKodu, secim: ReadonlySet<SifirlamaAlani>): void {
  const W: Calisma = profil.pw[program];
  if (secim.has('sim')) { W.ans = {}; W.notes = {}; W.ev = {}; W.done = {}; W.exDone = {}; W.cur = 0; W.example = false; W.quick = []; W.mode = 'full'; }
  if (secim.has('prep')) { W.checks = {}; W.phase = -1; W.wkx = []; W.wkAnchor = {}; }
  if (secim.has('trace')) { W.trace = {}; W.chainSel = 't1'; }
  if (secim.has('cards')) { W.cards = {}; W.card = 0; W.flipped = false; }
  if (secim.has('docs')) { W.docs = {}; W.docq = ''; }
  if (secim.has('oz')) W.oz = bosOz();
  if (secim.has('kalib')) profil.kal = bosKal();
  if (secim.has('kys')) profil.kys = bosKys();
  if (secim.has('cal')) profil.audits = [];
  if (secim.has('info')) profil.profile = bosProfil().profile;
}

export function profilEkle(depo: Depo, p: Profil = bosProfil()): string {
  const id = yeniKimlik();
  depo.data[id] = p;
  depo.order.push(id);
  depo.active = id;
  return id;
}

export function profilKopyala(depo: Depo): string {
  const kaynak = depo.data[depo.active];
  const c = profilNormalize(structuredClone(kaynak));
  c.profile.firma = `${profilAdi(kaynak)} (kopya)`;
  return profilEkle(depo, c);
}

// Son profil silinmez (ekranda düğme yok); açık profil silinirse ilki açılır.
export function profilSil(depo: Depo, id: string): void {
  if (depo.order.length <= 1) return;
  depo.order = depo.order.filter((x) => x !== id);
  delete depo.data[id];
  if (depo.active === id) depo.active = depo.order[0] ?? '';
}

export function hepsiniSil(depo: Depo): void {
  const id = yeniKimlik();
  depo.order = [id];
  depo.data = { [id]: bosProfil() };
  depo.active = id;
  depo.lastBackup = 0;
}

export interface Yedek { app: 'kalite-denetim'; surum: 4; tarih: string; profiller: Profil[] }

export const yedekVerisi = (depo: Depo, ids: readonly string[]): Yedek => ({
  app: 'kalite-denetim', surum: 4, tarih: new Date().toISOString(), profiller: ids.map((id) => structuredClone(depo.data[id] as Profil)),
});

export function yedekDosyaAdi(depo: Depo, ids: readonly string[]): string {
  const ad = ids.length === 1 ? profilAdi(depo.data[ids[0] ?? '']) : 'tum-profiller';
  return `${`denetim-yedek-${ad}-${new Date().toISOString().slice(0, 10)}`.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-')}.json`;
}

// Yedek dosyası üç biçimde olabilir: yedek, bütün kayıt ya da tek eski profil. Geçersizse null.
export function yedektenOku(metin: string): unknown[] | null {
  let j: unknown;
  try { j = JSON.parse(metin); } catch { return null; }
  if (j === null || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  let arr: unknown[] = [];
  if (Array.isArray(o['profiller'])) arr = o['profiller'];
  else if (Array.isArray(o['order']) && o['data'] && typeof o['data'] === 'object') {
    const veri = o['data'] as Record<string, unknown>;
    arr = o['order'].map((id) => (typeof id === 'string' ? veri[id] : undefined));
  } else if (o['pw'] || o['ans'] || o['checks']) arr = [o];
  arr = arr.filter((x) => x && typeof x === 'object');
  return arr.length ? arr : null;
}

// Yedekteki profiller eklenir; tek ve boş profil varsa onun yerine geçer. Aynı adlı profile "(yedekten)" eklenir. Eklenen sayı döner.
export function yedekYukle(depo: Depo, profiller: readonly unknown[]): number {
  const acik = depo.data[depo.active];
  const bosunYerine = depo.order.length === 1 && acik !== undefined && bosProfilMi(acik);
  const adlar = bosunYerine ? [] : depo.order.map((id) => profilAdi(depo.data[id]));
  let ilk: string | null = null;
  if (bosunYerine) {
    delete depo.data[depo.active];
    depo.order = [];
  }
  for (const x of profiller) {
    const ns = profilNormalize(x);
    ns.view = 'profil';
    if (ns.profile.firma && adlar.includes(ns.profile.firma)) ns.profile.firma += ' (yedekten)';
    adlar.push(ns.profile.firma);
    const id = yeniKimlik();
    depo.data[id] = ns;
    depo.order.push(id);
    ilk ??= id;
  }
  if (bosunYerine && ilk) depo.active = ilk;
  return profiller.length;
}

// Örnek (demo) profil: adı öteki ekranla aynıdır, örnek profil adından tanınır.
export const ORNEK_PROFIL_ADI = 'Örnek: Anadolu Hassas İşleme A.Ş. (demo)';
export const ornekMi = (st: Profil | undefined): boolean => st?.profile.firma === ORNEK_PROFIL_ADI;

export function ornekProfil(): Profil {
  const st = bosProfil();
  const t = bugunTarihi();
  const A = (n: number): string => gunEkle(t, n);
  st.profile = { firma: ORNEK_PROFIL_ADI, tesis: 'Bursa OSB, 2. fabrika', kapsam: 'Savunma ve havacılık sanayine yönelik hassas talaşlı imalat parçalarının üretimi', kurulus: 'TSE', hazirlayan: 'Ayşe Yılmaz, KYS sorumlusu' };
  st.prog = 'iso9001';
  st.view = 'dash';
  for (const k of PROGRAM_SIRASI) {
    const ex = PROGRAMLAR[k].EXAMPLE;
    const w = st.pw[k];
    Object.keys(ex).forEach((id, i) => {
      const v = ex[id];
      if (v !== undefined && (k === 'iso9001' || i % 2 === 0)) w.ans[id] = v;
    });
  }
  const wi = st.pw.iso9001;
  wi.done = { c715: true };
  wi.checks = { p1: true, p2: true, p3: true };
  const r1: Record<string, OzMaddesi> = {}, r2: Record<string, OzMaddesi> = {}, r3: Record<string, OzMaddesi> = {};
  const ids = Object.keys(wi.ans);
  for (const id of ids.slice(0, 10)) r1[id] = { v: '2', n: '', pv: '' };
  for (const id of ids.slice(8, 18)) r2[id] = { v: wi.ans[id] === 'na' ? 'na' : Number(wi.ans[id]) >= 2 ? '3' : '1', n: '', pv: '2' };
  for (const id of ids.slice(16, 26)) r3[id] = { v: wi.ans[id] ?? '2', n: '', pv: '' };
  wi.oz = {
    freq: 'monthly', size: 10, by: 'Ayşe Yılmaz', cur: null, last: {},
    rounds: [{ id: 'rd1', date: A(-95), by: 'Can Öz', kind: 'rot', items: r1 }, { id: 'rd2', date: A(-62), by: 'Ayşe Yılmaz', kind: 'rot', items: r2 }, { id: 'rd3', date: A(-30), by: 'Mehmet Kaya', kind: 'rot', items: r3 }],
  };
  ids.slice(0, 26).forEach((id, i) => { wi.oz.last[id] = i < 10 ? A(-95) : i < 18 ? A(-62) : A(-30); });
  const au = [
    yeniDenetim({ prog: 'iso9001', type: '1. gözetim', date: A(-350), cb: 'TSE' }),
    yeniDenetim({ prog: 'iso9001', type: 'İç denetim / ön denetim', date: A(-120), cb: 'İç denetçiler' }),
    yeniDenetim({ prog: 'iso9001', type: '2. gözetim', date: A(50), end: A(51), cb: 'TSE' }),
    yeniDenetim({ prog: 'eydep', type: TYPES_EY[1] ?? '', date: A(95), cb: 'SSB değerlendirme heyeti' }),
  ];
  const [a0, a1] = au as [typeof au[0], typeof au[0]];
  a0.status = 'done';
  a0.res = { major: 0, minor: 2, obs: 1, score: '', areas: {}, items: [{ lvl: 'minor', g: '7', c: '7.1.5', t: 'Kalibrasyonu geçmiş kumpas kullanılıyor' }, { lvl: 'minor', g: '8', c: '8.7', t: 'Red ürün etiketsiz' }, { lvl: 'obs', g: '9', c: '9.1.3', t: 'Gösterge trend analizi zayıf' }] };
  a1.status = 'done';
  a1.res = { major: 0, minor: 2, obs: 0, score: '', areas: {}, items: [{ lvl: 'minor', g: '7', c: '7.5', t: 'Sahada eski revizyon resim' }, { lvl: 'minor', g: '10', c: '10.2', t: 'DÖF etkinliği doğrulanmamış' }] };
  st.audits = au;
  for (const a of [...au]) belgeSonGunuEsitle(a, st);
  const K = st.kys;
  ['b41', 'b42', 'b43', 'b44', 'b52', 'b53', 'b62', 'b715', 'b72', 'b75', 'b84', 'b87', 'b92', 'b102'].forEach((id, i) => {
    K.items[id] = { st: i < 10 ? 2 : 1, date: A(-(30 + i * 20)), code: '', rev: '00', owner: i % 2 ? 'Ayşe Yılmaz' : 'Hasan Demir', note: '' };
  });
  K.items['b61'] = { st: 2, date: A(-400), code: '', rev: '01', owner: 'Hasan Demir', note: 'Gözden geçirmesi gecikmiş örnek' };
  K.roles = { ust: { kisi: 'Hasan Demir', vekil: '' }, kys: { kisi: 'Ayşe Yılmaz', vekil: 'Can Öz' }, kk: { kisi: 'Can Öz', vekil: '' }, kal: { kisi: 'Mehmet Kaya', vekil: '' } };
  K.start = A(-150);
  K.road = { r11: true, r12: true, r13: true, r14: true };
  const ms = gostergeAylari(6);
  K.procs = PROC_TPL.map((tp, i) => {
    const vals: Record<string, number> = {};
    if (i < 6) {
      const taban = Number(tp[7]) || 1;
      ms.forEach((m, j) => {
        const f = [0.96, 1.02, 0.98, 1.05, 0.93, 1.01][(j + i) % 6] ?? 1;
        vals[m] = Math.round(taban * (tp[8] === 'le' ? 2 - f : f) * 100) / 100;
      });
    }
    return {
      id: `dp${String(i)}`, type: tp[0] as 'y' | 'a' | 'd', name: tp[1], owner: tp[2], inputs: tp[3], outputs: tp[4], kpi: tp[5], unit: tp[6], target: tp[7], dir: tp[8],
      res: tp[9] || '', who: tp[10] || '', how: tp[11] || '', risk: tp[12] || '', vals,
    };
  });
  K.rt = { h1: [`W${pazartesi(t)}`], a1: [donemAnahtari('a')] };
  K.rtStart = A(-60);
  // Örnek cihaz listesi yazılmaz: ölçü aletleri Kalibrasyondan gelir (329 a), öteki ekran da kayıttakini göstermez.
  return profilNormalize(st);
}
