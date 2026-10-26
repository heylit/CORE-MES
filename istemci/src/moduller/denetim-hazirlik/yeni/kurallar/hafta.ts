import { gunArasi, gunEkle, bugunTarihi, pazartesi, tarihMetni } from '../tarih.ts';
import type { Calisma, Denetim, ProgramKodu, Seviye } from '../tipler.ts';
import { siradakiDenetim } from './denetim-takvimi.ts';
import { aktifSorular, puanHesapla, type KuralBaglami } from './puan.ts';
import { seviyeAdi } from '../icerik/programlar.ts';

// Haftalık hazırlık programı: denetim tarihinden geriye hafta hafta görevler (prototip buildWeeks). Hazırlık görevleri dönemlerine,
// açık riskler ilk haftalara, öz değerlendirme turları ve mülakat kartları tatbikat haftalarına dağıtılır.

export const WKT: Record<ProgramKodu, readonly string[]> = {
  iso9001: ['Planlama: kapsam, önceki bulgular, iç denetim, YGG', 'Kayıtlar, kalibrasyon, yetkinlik ve tedarikçiler', 'Tatbikat: iz sürme, saha turu, mülakat', 'Son kontroller ve denetim lojistiği', 'Denetim haftası', 'Bulgular, kök neden ve DÖF'],
  as9100: ["Planlama: OASIS, önceki NCR'ler, iç denetim, YGG", 'FAI, konfigürasyon, tedarikçi şartları ve kayıtlar', 'Tatbikat: iz sürme, FOD turu, mülakat', 'Son kontroller ve denetim lojistiği', 'Denetim haftası', "NCR yanıtı, kök neden ve DÖF"],
  eydep: ['YETEN, öz değerlendirme ve başvuru', 'Listeler, referanslar ve sistem kayıtları', 'Belge teslimi: en geç 15 gün önce', 'Prova, sunum ve saha düzeni', 'Değerlendirme haftası', 'Rapor ve gelişim planı'],
};

export type HaftaMaddesiTuru = 'prep' | 'risk' | 'oz' | 'cards' | 'dl' | 'audit' | 'custom';
export interface HaftaMaddesi { k: HaftaMaddesiTuru; id: string; t: string; done: boolean; tag?: string; sub?: string; lvl?: Seviye; dept?: string }
export interface Hafta {
  m: string;
  e: string;
  // Dönem: 0-3 hazırlık, 4 denetim haftası, 5 sonrası.
  ph: number;
  wBefore: number;
  items: HaftaMaddesi[];
  n: number;
  cur: boolean;
  past: boolean;
  tot: number;
  k: number;
}
export interface HaftaPlani {
  weeks: Hafta[];
  na: Denetim;
  cur: string;
  // Programın başladığı haftanın çapası; kayıttakinden farklıysa kişinin ilk değişikliğiyle kaydedilir (baglam.tsx degistir).
  capa: Calisma['wkAnchor'];
  capaDegisti: boolean;
}

export function haftalariKur(kb: KuralBaglami): HaftaPlani | null {
  const na = siradakiDenetim(kb.profil, kb.program);
  if (!na) return null;
  const w = kb.calisma;
  const pg = kb.pg;
  const ad = na.date;
  const son = na.end || ad;
  const t = bugunTarihi();
  const pd = pg.phaseDays;
  const baslangic = gunEkle(ad, -(pd[0] + 28));
  const capaDegisti = w.wkAnchor.ad !== ad;
  const capa = capaDegisti ? { ad, from: baslangic > t ? baslangic : t } : w.wkAnchor;
  const capaFrom = capa.from ?? t;
  let from = pazartesi(capaFrom < t && capaFrom < baslangic ? baslangic : capaFrom);
  const am = pazartesi(ad);
  const em = pazartesi(son);
  if (from > am) from = am;
  const weeks: Hafta[] = [];
  for (let m = from; m <= gunEkle(em, 7); m = gunEkle(m, 7)) {
    const db = gunArasi(gunEkle(m, 3), ad);
    const ph = m > em ? 5 : m >= am ? 4 : db >= pd[0] ? 0 : db >= pd[1] ? 1 : db >= pd[2] ? 2 : 3;
    weeks.push({ m, e: gunEkle(m, 6), ph, wBefore: Math.round(gunArasi(m, am) / 7), items: [], n: 0, cur: false, past: false, tot: 0, k: 0 });
  }
  const ilk = weeks[0] as Hafta;
  const sonHafta = weeks[weeks.length - 1] as Hafta;
  const hedefler = (ph: number): Hafta[] => {
    const tg = weeks.filter((x) => x.ph === ph);
    if (tg.length) return tg;
    if (ph < 4) {
      const once = weeks.filter((x) => x.ph < 4);
      if (!once.length) return [ilk];
      const ust = once.filter((x) => x.ph > ph);
      return ph < (once[0] as Hafta).ph ? [once[0] as Hafta] : ust.length ? [ust[0] as Hafta] : [once[once.length - 1] as Hafta];
    }
    return [sonHafta];
  };
  const dagit = (liste: HaftaMaddesi[], tg: Hafta[]): void => {
    liste.forEach((it, j) => { (tg[Math.min(tg.length - 1, Math.floor((j * tg.length) / liste.length))] as Hafta).items.push(it); });
  };
  pg.PREP.forEach((ph, i) => {
    dagit(ph.items.map((it) => ({ k: 'prep', id: it[0], t: it[1], tag: it[2] ?? '', done: !!w.checks[it[0]] })), hedefler(i));
  });
  let hazirlikHaftalari = weeks.filter((x) => x.ph <= 2);
  if (!hazirlikHaftalari.length) hazirlikHaftalari = weeks.filter((x) => x.ph < 4).slice(0, 1);
  if (!hazirlikHaftalari.length) hazirlikHaftalari = [ilk];
  const r = puanHesapla(aktifSorular(pg, w.def), w.ans, pg);
  dagit(r.risks.filter((x) => x.lvl !== 'obs').map((x) => ({
    k: 'risk', id: x.q.id, t: x.q.fix, tag: x.q.c, sub: seviyeAdi(pg, x.lvl), lvl: x.lvl, done: !!w.done[x.q.id],
  })), hazirlikHaftalari);
  const o = w.oz;
  const once4 = weeks.filter((x) => x.ph < 4);
  once4.forEach((x, i) => {
    const tam = x.ph === 2 && (i === 0 || (once4[i - 1] as Hafta).ph < 2);
    if (!tam && i % 2) return;
    const yapildi = o.rounds.some((rd) => rd.date >= x.m && rd.date <= x.e && (!tam || rd.kind === 'full'));
    x.items.push({ k: 'oz', id: `oz${x.m}`, t: tam ? 'Tam öz değerlendirme turu: tüm sorular' : `Öz değerlendirme turu (${String(o.size)} soru)`, done: yapildi });
  });
  let tatbikat = weeks.filter((x) => x.ph === 2 || x.ph === 3);
  if (!tatbikat.length) tatbikat = once4.slice(-2);
  pg.DEPTS.forEach((d, i) => {
    if (!tatbikat.length) return;
    const x = tatbikat[i % tatbikat.length] as Hafta;
    const tamam = d.items.every((_, j) => w.cards[d.k + String(j)] === 'ok');
    x.items.push({ k: 'cards', id: `cd${d.k}`, dept: d.k, t: `Soru kartları: ${d.n} ile mini mülakat`, done: tamam });
  });
  for (const a of kb.profil.audits) {
    if (a.kind !== 'deadline' || a.prog !== kb.program || a.status !== 'plan') continue;
    for (const x of weeks) if (a.date >= x.m && a.date <= x.e) x.items.unshift({ k: 'dl', id: a.id, t: a.type, sub: tarihMetni(a.date), done: a.date < t });
  }
  for (const x of weeks) {
    if (x.ph === 4) x.items.unshift({ k: 'audit', id: na.id, t: na.type || `${pg.s} denetimi`, sub: tarihMetni(ad) + (na.end ? ` – ${tarihMetni(na.end)}` : ''), done: false });
  }
  for (const c of w.wkx) {
    const x = weeks.find((y) => c.w === y.m) ?? (c.w < ilk.m ? ilk : sonHafta);
    x.items.push({ k: 'custom', id: c.id, t: c.t, done: c.done });
  }
  const cur = pazartesi(t);
  weeks.forEach((x, i) => {
    x.n = i + 1;
    x.cur = x.m === cur;
    x.past = x.e < t;
    const sayilan = x.items.filter((it) => it.k !== 'dl' && it.k !== 'audit');
    x.tot = sayilan.length;
    x.k = sayilan.filter((it) => it.done).length;
  });
  return { weeks, na, cur, capa, capaDegisti };
}
