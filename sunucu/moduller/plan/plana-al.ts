import { tasimaTakvimi } from './plan-girdisi.ts';
import { planaAlHesabi, type PlanaAlSonucu } from './plana-al-kurallar.ts';
import type { BagTuru } from './tasima-kurallar.ts';

// Plana almanın girdisi (3151): emrin adımları ve takvim motorun derlemesinden (elle taşımayla aynı bağlam), dolu aralıklar çalışmanın
// planından ve planı bekleyen kilitlerden. Derlemede olmayan emir (iptal, havuzda, bitmiş) plana alınamaz. Önizleme ve komut aynı hesabı kullanır.
type Nesne = Record<string, unknown>;
const nesne = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);

export function planaAlmaHesabi(calisma: Nesne, simdi: number, g: { emirId: string; tezgah: string; baslangic: number }): PlanaAlSonucu {
  const t = tasimaTakvimi(calisma, simdi);
  const adimlar = t.emirler[g.emirId];
  if (adimlar === undefined) return { gecerli: false, ileti: 'Emir plana alınamaz: iptal edilmiş, bitmiş ya da plan dışında.', alan: 'emirId', isler: [], bitis: null };
  const plan = nesne(calisma.plan) ? calisma.plan : null;
  const ops = plan !== null && nesne(plan.ops) ? plan.ops : {};
  const dolu = new Map<string, [number, number][]>();
  const ekle = (m: string, S: number, C: number): void => { dolu.set(m, [...(dolu.get(m) ?? []), [S, C]]); };
  for (const r of Object.values(ops)) {
    if (!nesne(r) || r.fas || typeof r.S !== 'number' || typeof r.C !== 'number' || !Number.isFinite(r.S) || !Number.isFinite(r.C)) continue;
    ekle(String(r.m), r.S, r.C);
  }
  // Plana alınıp henüz dizilmemiş başka emrin kilidi de yer tutar; emrin kendi eski kilidi tutmaz (yeri değiştirilebilir).
  const kendi = new Set(adimlar.map((a) => a.id));
  for (const [id, k] of Object.entries(nesne(calisma.locks) ? calisma.locks : {})) {
    if (ops[id] !== undefined || kendi.has(id) || !nesne(k) || typeof k.m !== 'string' || typeof k.S !== 'number') continue;
    const y = t.yer(id, k.m, k.S);
    if (y !== null && Number.isFinite(y.C)) ekle(k.m, y.S, y.C);
  }
  const onculler = new Map<string, (readonly [string, BagTuru])[]>(adimlar.map((a) => [a.id, t.onculler[a.id] ?? []]));
  return planaAlHesabi({ adimlar, onculler, dolu, simdi, ufuk: t.ufuk, tasimaSaat: t.tasimaSaat, yer: t.yer, saatMetni: t.saatMetni, tezgahAdi: t.tezgahAdi }, g.tezgah, g.baslangic);
}
