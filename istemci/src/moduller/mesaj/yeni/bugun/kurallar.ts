import { H, M } from '../bicim.ts';
import {
  bahsedildi, bendenOnayBekliyor, benimYanitim, duyuruBekliyor, duzMetin, katilimciMi, onayDurumu, teslimEtiketi, toplantiBitisi,
} from '../kurallar.ts';
import type { Duyuru, Gorev, Kanal, Kayit, Onay, SiparisOzeti, Toplanti, Zamanli } from '../tipler.ts';

// Bugün görünümünün hesapları (prototip `viewToday`, `dayStrip`, `heroHTML`). Saf; saat parametredir.

const ayniGun = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

export function selam(saat: number): string {
  return saat < 5 ? 'İyi geceler' : saat < 11 ? 'Günaydın' : saat < 17 ? 'İyi günler' : saat < 21 ? 'İyi akşamlar' : 'İyi geceler';
}

export interface BugunGirdisi {
  ben: string;
  simdi: number;
  okunan: Readonly<Record<string, number>>;
  kanallar: readonly Kayit<Kanal>[];
  gorevler: readonly Kayit<Gorev>[];
  onaylar: readonly Kayit<Onay & { closedSeen?: boolean }>[];
  duyurular: readonly Kayit<Duyuru>[];
  toplantilar: readonly Kayit<Toplanti>[];
  siparisler: readonly SiparisOzeti[];
}

export interface BugunOzeti {
  davetler: Kayit<Toplanti>[];
  bahisler: Kayit<Kanal>[];
  duyurular: Kayit<Duyuru>[];
  onaylar: Kayit<Onay>[];
  gorevler: Kayit<Gorev>[];
  siparisler: SiparisOzeti[];
  takipOnaylar: Kayit<Onay>[];
  takipGorevler: Kayit<Gorev>[];
  bugunToplantilar: Kayit<Toplanti>[];
  siradaki: Kayit<Toplanti> | null;
  bekleyen: number;
}

export function bugunOzeti(g: BugunGirdisi): BugunOzeti {
  const { ben, simdi } = g;
  const duyurular = g.duyurular.filter((a) => duyuruBekliyor(a, ben)).sort((a, b) => b.ts - a.ts);
  const onaylar = g.onaylar.filter((a) => bendenOnayBekliyor(a, ben)).sort((a, b) => b.createdAt - a.createdAt);
  const gorevler = g.gorevler.filter((t) => t.to === ben && t.status !== 'done').sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
  const siparisler = g.siparisler
    .filter((o) => o.durum !== 'sevk' && o.teslim && (teslimEtiketi(o.teslim, simdi)?.diff ?? Infinity) <= 7)
    .sort((a, b) => (a.teslim ?? 0) - (b.teslim ?? 0));
  const takipGorevler = g.gorevler.filter((t) => t.by === ben && t.to && t.to !== ben && t.status !== 'done');
  const takipOnaylar = g.onaylar.filter((a) => a.by === ben && onayDurumu(a).s !== 'ok' && !a.closedSeen);
  const bahisler = g.kanallar.filter((c) => bahsedildi(c, g.okunan, ben, null));
  const bugunToplantilar = g.toplantilar
    .filter((mt) => !mt.cancelled && katilimciMi(mt, ben) && benimYanitim(mt, ben) !== 'no' && ayniGun(mt.start, simdi))
    .sort((a, b) => a.start - b.start);
  const davetler = g.toplantilar
    .filter((mt) => !mt.cancelled && mt.by !== ben && katilimciMi(mt, ben) && !benimYanitim(mt, ben) && mt.start > simdi)
    .sort((a, b) => a.start - b.start);
  return {
    davetler, bahisler, duyurular, onaylar, gorevler, siparisler, takipOnaylar, takipGorevler, bugunToplantilar,
    siradaki: bugunToplantilar.find((mt) => toplantiBitisi(mt) > simdi) ?? null,
    bekleyen: duyurular.length + onaylar.length + gorevler.length + bahisler.length,
  };
}

export function ozetCumlesi(o: BugunOzeti, simdi: number, baslamaMetni: (ts: number) => string): string {
  const ilk = o.bekleyen ? `Seni bekleyen ${o.bekleyen} şey var.` : 'Bekleyen işin yok.';
  if (o.siradaki) return `${ilk} Sıradaki toplantı ${o.siradaki.start <= simdi ? 'şu an sürüyor' : baslamaMetni(o.siradaki.start)}.`;
  return o.bugunToplantilar.length ? ilk : `${ilk} Bugün toplantın yok.`;
}

export type SeritTuru = 'toplanti' | 'gorev' | 'siparis' | 'zamanli';

export interface SeritOgesi {
  tur: SeritTuru;
  id: string;
  bas: number;
  bit?: number;
  baslik: string;
  // Toplantılar en çok iki şeride dizilir; çakışan üçüncü ikinci şeride biner (prototip).
  serit: 0 | 1;
}

export interface GunSeridi {
  ilkSaat: number;
  sonSaat: number;
  ogeler: SeritOgesi[];
}

// Prototip `dayStrip`: bugünün toplantıları, bugün teslimli ya da hatırlatmalı görevlerim, bugün teslim siparişler
// ve bugün gidecek zamanlanmış iletilerim; saat aralığı 07-20, öğeler ve şimdi sığacak kadar genişler.
export function gunSeridi(g: {
  ben: string;
  simdi: number;
  toplantilar: readonly Kayit<Toplanti>[];
  gorevler: readonly Kayit<Gorev>[];
  siparisler: readonly SiparisOzeti[];
  zamanli: readonly Kayit<Zamanli>[];
  ad: (id: string) => string;
}): GunSeridi {
  const { ben, simdi } = g;
  const gunBasi = new Date(simdi).setHours(0, 0, 0, 0);
  const ogeler: SeritOgesi[] = [];
  g.toplantilar
    .filter((mt) => !mt.cancelled && katilimciMi(mt, ben) && benimYanitim(mt, ben) !== 'no' && ayniGun(mt.start, simdi))
    .sort((a, b) => a.start - b.start)
    .forEach((mt) => ogeler.push({ tur: 'toplanti', id: mt.id, bas: mt.start, bit: toplantiBitisi(mt), baslik: mt.title, serit: 0 }));
  for (const t of g.gorevler) {
    if (t.to !== ben || t.status === 'done') continue;
    const hatirlatmaBugun = t.remind != null && ayniGun(t.remind, simdi);
    if (!hatirlatmaBugun && !(t.due && ayniGun(t.due, simdi))) continue;
    ogeler.push({ tur: 'gorev', id: t.id, bas: hatirlatmaBugun ? t.remind! : t.due!, baslik: t.title, serit: 0 });
  }
  for (const o of g.siparisler) {
    if (o.durum !== 'sevk' && o.teslim && ayniGun(o.teslim, simdi)) ogeler.push({ tur: 'siparis', id: o.id, bas: o.teslim, baslik: `#${o.no} teslim`, serit: 0 });
  }
  for (const z of g.zamanli) {
    if (z.status === 'bekliyor' && z.by === ben && ayniGun(z.sendAt, simdi)) ogeler.push({ tur: 'zamanli', id: z.id, bas: z.sendAt, baslik: duzMetin(z.text, g.ad).slice(0, 40), serit: 0 });
  }
  const saatte = (ts: number) => (ts - gunBasi) / H;
  let a = 7;
  let b = 20;
  for (const i of ogeler) { a = Math.min(a, Math.floor(saatte(i.bas))); b = Math.max(b, Math.ceil(saatte(i.bit ?? i.bas) + 0.5)); }
  const simdiSaat = saatte(simdi);
  a = Math.max(0, Math.min(a, Math.floor(simdiSaat) - 1));
  b = Math.min(24, Math.max(b, Math.ceil(simdiSaat) + 1));
  const seritSonu: number[] = [];
  for (const i of ogeler) {
    if (i.tur !== 'toplanti') continue;
    let s = seritSonu.findIndex((son) => son <= i.bas);
    if (s < 0) { s = seritSonu.length; seritSonu.push(0); }
    seritSonu[s] = i.bit ?? i.bas;
    i.serit = s === 0 ? 0 : 1;
  }
  return { ilkSaat: a, sonSaat: b, ogeler };
}

export const SIRADAKI_SICAK_MS = 15 * M;
