import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { KokpitModeli } from './kurallar.ts';

// 3793-2 (madde 7, a): tahtada bırakılıp kilitlenen adım yerinde kalan işle (sahada süren, kilitli, başlamış ya da donuk) üst üste gelince Kokpit
// onu o işin arkasına koyar (elle taşıma 3414-3, motor 3538 b). Bu sessiz kalmasın: neyle çakıştığı ve yeni saati söylenir. Karar planlamacınındır:
// Tamam (böyle kalsın), Kilidi kaldır (yalnız bu emrin elle kilitleri kalkar, yeniden dizilir) ya da Geri al (taşımadan önceki hâl).
export interface KilitKaydi { isId: string; engel: string; S: number; neden: 'sahada süren' | 'kilitli' | 'yerinde kalan' }
const E = 1 / 60;
export function kilitKaydi(m: Pick<KokpitModeli, 'isler'>, isId: string, istenen: number): KilitKaydi | null {
  const r = m.isler[isId];
  if (!r || !Number.isFinite(r.S) || r.S <= istenen + E) return null;
  const sure = r.C - r.S;
  const e = Object.values(m.isler)
    .filter((o) => o.id !== isId && o.m === r.m && (o.basladi || o.kilitli) && Number.isFinite(o.S) && Number.isFinite(o.C) && o.S < istenen + sure - E && o.C > istenen + E && o.C <= r.S + E)
    .sort((a, b) => b.C - a.C)[0];
  if (!e) return null;
  return { isId, engel: e.id, S: r.S, neden: e.basladi && !e.bitti ? 'sahada süren' : e.kilitli ? 'kilitli' : 'yerinde kalan' };
}
export function isAdi(m: Pick<KokpitModeli, 'isler' | 'emirler'>, id: string): string {
  const i = m.isler[id];
  const no = m.emirler.find((e) => e.id === i?.job)?.no ?? i?.job ?? id;
  const op = id.slice(id.lastIndexOf('.') + 1);
  return /^\d+$/.test(op) ? `${no} OP ${op}` : `${no} ${i?.ad ?? id}`;
}

export function KilitKaydiSatiri({ k, m, zaman, tamam, kilidiKaldir, geriAl }: {
  k: KilitKaydi; m: Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>; zaman: (t: number) => string;
  tamam: () => void; kilidiKaldir: (() => void) | null; geriAl: (() => void) | null;
}) {
  const tezgah = m.tezgahlar.find((t) => t.id === m.isler[k.isId]?.m)?.kod ?? m.isler[k.isId]?.m ?? '';
  const ad = isAdi(m, k.isId), engel = isAdi(m, k.engel);
  return (
    <div className="tc-pyq-ipucu tc-pyq-tasima-onayi tc-pyq-guncelleme" role="status">
      <span><Simge ad="lock" boyut="k" />{`${ad} bırakılan saatte ${tezgah} üzerinde ${k.neden} ${engel} ile üst üste geliyordu; onun bitişine, ${zaman(k.S)} saatine alındı ve orada kilitli. Canlıya almada aynı saatte kalır.`}</span>
      <Dugme tur="birincil" onClick={tamam}>Tamam</Dugme>
      {kilidiKaldir !== null && <Dugme simge="rotate" onClick={kilidiKaldir} title={`Yalnız ${m.emirler.find((e) => e.id === m.isler[k.isId]?.job)?.no ?? ad} yeniden dizilir ve yalnız onun elle kilitleri kalkar; Geri al ile döner.`}>Kilidi kaldır</Dugme>}
      {geriAl !== null && <Dugme simge="back" onClick={geriAl}>Geri al</Dugme>}
    </div>
  );
}
