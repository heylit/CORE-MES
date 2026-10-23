import { OZF, OZV, type ProgramTanimi } from '../icerik/programlar.ts';
import { yeniKimlik } from '../normalize.ts';
import { bugunTarihi, gunEkle, gunFarki } from '../tarih.ts';
import type { Cevap, OzDurumu, OzMaddesi, OzTuru, Soru } from '../tipler.ts';
import { aktifSorular, puanHesapla, type KuralBaglami, type PuanSonucu } from './puan.ts';

// Periyodik öz değerlendirme: simülasyonun düzenli kısa hâli. Tur bitince puanlar simülasyon cevaplarına yazılır, önceki değer
// turda saklanır (eğilim ve gerileme bundan hesaplanır).

export const ozNotu = (p: number | null): string => (p == null ? '–' : p >= 85 ? 'A' : p >= 70 ? 'B' : p >= 50 ? 'C' : 'D');

export function turCevaplari(r: { items: Record<string, { v: Cevap | '' }> }): Record<string, Cevap> {
  const a: Record<string, Cevap> = {};
  for (const [k, x] of Object.entries(r.items)) if (x.v !== '') a[k] = x.v;
  return a;
}

export const turPuani = (r: OzTuru, pg: ProgramTanimi): PuanSonucu => puanHesapla(pg.Q.filter((x) => r.items[x.id]), turCevaplari(r), pg);

// Önceki değeri bilinen sorularda turun puan farkı (yüzde puan); karşılaştırılacak yoksa null.
export function turDegisimi(r: OzTuru, pg: ProgramTanimi): number | null {
  const soruyla = new Map(pg.Q.map((q) => [q.id, q]));
  const ids = Object.keys(r.items).filter((id) => (r.items[id] as OzMaddesi).pv !== '' && soruyla.has(id));
  if (ids.length === 0) return null;
  const simdi: Record<string, Cevap> = {};
  const once: Record<string, Cevap> = {};
  for (const id of ids) {
    const it = r.items[id] as OzMaddesi;
    simdi[id] = it.v;
    once[id] = it.pv as Cevap;
  }
  const qs = ids.map((id) => soruyla.get(id) as Soru);
  const a = puanHesapla(qs, simdi, pg).pct;
  const b = puanHesapla(qs, once, pg).pct;
  return a == null || b == null ? null : a - b;
}

export const ozSonrakiVade = (o: OzDurumu): string => {
  const son = o.rounds[o.rounds.length - 1];
  return son ? gunEkle(son.date, OZF[o.freq].d) : '';
};

// Son üç dönemde (en az 90 gün) en az bir kez puanlanan soru sayısı.
export function ozKapsama(kb: KuralBaglami): { k: number; n: number; win: number } {
  const o = kb.calisma.oz;
  const qs = aktifSorular(kb.pg, kb.calisma.def);
  const win = Math.max(OZF[o.freq].d * 3, 90);
  const k = qs.filter((x) => {
    const d = o.last[x.id];
    return !!d && gunFarki(d) >= -win;
  }).length;
  return { k, n: qs.length, win };
}

export function ozTurAdi(kind: string, pg: ProgramTanimi): string {
  if (kind === 'full') return 'Tam tur';
  if (kind.startsWith('group:')) {
    const g = kind.slice(6);
    return `${pg.unit} ${pg.CL[g]?.s ?? g}`;
  }
  return 'Dönüşümlü tur';
}

// Dönüşümlü turun sorusu: en uzun süredir bakılmayan, düşük puanlı ve ağır sorular öne çıkar; küçük rastgele pay eşitliği bozar.
function ozSec(kb: KuralBaglami, n: number, rastgele: () => number): string[] {
  const o = kb.calisma.oz;
  const qs = aktifSorular(kb.pg, kb.calisma.def);
  const ans = kb.calisma.ans;
  const sc = qs.map((x) => {
    const d = o.last[x.id];
    const yas = d ? Math.max(0, -gunFarki(d)) : 400;
    const v = ans[x.id];
    const dusuk = v === undefined || v === 'na' ? 1.5 : 3 - Number(v);
    return { x, p: (Math.min(yas, 400) / 30) * (1 + x.w / 3) + dusuk * 1.5 + x.w * 0.5 + rastgele() * 0.3 };
  });
  sc.sort((a, b) => b.p - a.p);
  const secilen = sc.slice(0, n).map((s) => s.x);
  secilen.sort((a, b) => qs.indexOf(a) - qs.indexOf(b));
  return secilen.map((x) => x.id);
}

// Tur başlatır ya da açık turu yeni kapsamla yeniden kurar; puanlanmış ama yeni kapsamda olmayan madde sayısını döner.
// kb.calisma yerinde değişir (useDenetim().degistir içinde çağrılır).
export function ozTurBaslat(kb: KuralBaglami, tur: 'full' | 'group' | 'rot', grup = '', rastgele: () => number = Math.random): number {
  const o = kb.calisma.oz;
  const eski = o.cur;
  const qs = aktifSorular(kb.pg, kb.calisma.def);
  const soruyla = new Map(qs.map((q) => [q.id, q]));
  const puanli = eski ? eski.qids.filter((id) => OZV.has(eski.items[id]?.v ?? '')) : [];
  let ids: string[];
  if (tur === 'full') ids = qs.map((x) => x.id);
  else if (tur === 'group') ids = qs.filter((x) => x.g === grup).map((x) => x.id);
  else {
    const kalan = puanli.slice(0, o.size);
    ids = kalan.concat(ozSec(kb, Math.min(qs.length, o.size * 3), rastgele).filter((id) => !kalan.includes(id))).slice(0, o.size);
    ids.sort((a, b) => qs.indexOf(soruyla.get(a) as Soru) - qs.indexOf(soruyla.get(b) as Soru));
  }
  if (ids.length === 0) return 0;
  const items: NonNullable<OzDurumu['cur']>['items'] = {};
  let dusen = 0;
  if (eski) {
    for (const id of puanli) {
      const it = eski.items[id];
      if (ids.includes(id) && it) items[id] = it;
      else dusen++;
    }
    for (const id of ids) {
      const it = eski.items[id];
      if (!items[id] && it && it.n) items[id] = { v: '', n: it.n };
    }
  }
  o.cur = {
    id: eski ? eski.id : yeniKimlik(), date: eski ? eski.date : bugunTarihi(), by: eski ? eski.by : o.by,
    kind: tur === 'group' ? `group:${grup}` : tur, qids: ids, items,
  };
  return dusen;
}

// Turu bitirir: puanlananlar simülasyon cevabına yazılır, tur geçmişe eklenir, örnek kipi kapanır. Puanlanan yoksa false.
export function ozTurBitir(kb: KuralBaglami): boolean {
  const o = kb.calisma.oz;
  const c = o.cur;
  const w = kb.calisma;
  if (!c) return false;
  const items: Record<string, OzMaddesi> = {};
  for (const id of c.qids) {
    const it = c.items[id];
    if (!it || it.v === '') continue;
    items[id] = { v: it.v, n: it.n || '', pv: w.ans[id] ?? '' };
    w.ans[id] = it.v;
    o.last[id] = c.date;
  }
  if (Object.keys(items).length === 0) return false;
  o.rounds.push({ id: c.id, date: c.date, by: c.by, kind: c.kind, items });
  o.cur = null;
  w.example = false;
  return true;
}
