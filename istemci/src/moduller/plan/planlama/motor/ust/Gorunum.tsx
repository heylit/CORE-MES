import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { donemAdi, DONEMLER, type Donem } from '../kurallar.ts';

// Görünüm seçici (3308-2 a): Özet, Harita ve Keşfet; dönem tek ayardır, bütün görünümleri birlikte geçirir. Dar ekranda çubuk alt satıra
// sarar (459/3 b).
export type TahtaGorunumu = 'genel' | 'atolye' | 'kesif';
const GORUNUMLER: [TahtaGorunumu, string, SimgeAdi, string][] = [
  ['genel', 'Özet', 'expand', 'Özet: geciken emirler ve tezgâh doluluğu'],
  ['atolye', 'Harita', 'fit', 'Harita: yalnız tezgâhlar ve aralarındaki iş akışı, ekrana sığdırılmış'],
  ['kesif', 'Keşfet', 'eye', 'Keşfet: pay şeridi, sipariş hatları, hazırlık ve planı anlatan adımlar'],
];

interface Ozellikler {
  gorunum: TahtaGorunumu; sec: (g: TahtaGorunumu) => void;
  donem: Donem; donemSec: (d: Donem) => void; kaydir: (n: number) => void; donemYazi: string;
}

export function Gorunum(o: Ozellikler) {
  const ad = donemAdi(o.donem);
  return (
    <div className="tc-pym-sg" data-masa="" role="toolbar" aria-label="Görünüm">
      <div className="tc-pym-sg-sec">
        {GORUNUMLER.map(([id, baslik, simge, ipucu]) => (
          <button key={id} type="button" aria-pressed={o.gorunum === id} title={ipucu} onClick={() => o.sec(id)}>
            <Simge ad={simge} boyut="k" /><span>{baslik}</span>
          </button>
        ))}
      </div>
      <div className="tc-pym-sg-sec tc-pym-ol-ortak" role="group" aria-label="Dönem" title={`Dönem: ${o.donemYazi}`}>
        <button type="button" className="tc-pym-ol-kay" title={`Önceki ${ad}`} aria-label={`Önceki ${ad}`} onClick={() => o.kaydir(-1)}><Simge ad="chev-left" boyut="k" /></button>
        {DONEMLER.map(([k, n]) => <button key={k} type="button" aria-pressed={o.donem === k} onClick={() => o.donemSec(k)}>{n}</button>)}
        <button type="button" className="tc-pym-ol-kay" title={`Sonraki ${ad}`} aria-label={`Sonraki ${ad}`} onClick={() => o.kaydir(1)}><Simge ad="chev-right" boyut="k" /></button>
      </div>
    </div>
  );
}
