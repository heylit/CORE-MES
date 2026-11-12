import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { donemAdi, DONEMLER, type Donem } from '../kurallar.ts';
import { BaskaMenusu, type BaskaDurumu } from './BaskaMenusu.tsx';

// Görünüm seçici (zj-gorunum sgHtml, zo-kontrol, zn-kesif, zs-olcek-ortak olOrtak): Özet, Harita, Çizelge ve Keşfet; dönem tek ayardır,
// bütün görünümleri birlikte geçirir. Stüdyo görünüm değil, ayrı sayfadır: yalnız plan çubuğunda adıyla durur (3042; burada sekme gibi
// görünüp sayfa değiştiriyordu). Dar ekranda çubuk alt satıra sarar (459/3 b).
export type TahtaGorunumu = 'genel' | 'atolye' | 'cizelge' | 'kesif';
const GORUNUMLER: [TahtaGorunumu, string, SimgeAdi, string][] = [
  ['genel', 'Özet', 'expand', 'Özet: göstergeler, tezgâh haritası ve grafikler birlikte'],
  ['atolye', 'Harita', 'fit', 'Harita: yalnız tezgâhlar ve aralarındaki iş akışı, ekrana sığdırılmış'],
  ['cizelge', 'Çizelge', 'gantt', 'Çizelge: tezgâh başına gün gün çizelge; işleri sürükleyerek taşı'],
  ['kesif', 'Keşfet', 'eye', 'Keşfet: pay şeridi, sipariş hatları, hazırlık ve planı anlatan adımlar'],
];

interface Ozellikler {
  gorunum: TahtaGorunumu; sec: (g: TahtaGorunumu) => void;
  donem: Donem; donemSec: (d: Donem) => void; kaydir: (n: number) => void; donemYazi: string;
  menuAcik: boolean; menuAc: (v: boolean) => void; baska: BaskaDurumu;
  // Çizelgenin araç satırındaki görünüm çubuğunda (sgHtml "masa") Başka menüsü yoktur.
  masa?: boolean;
}

export function Gorunum(o: Ozellikler) {
  const ad = donemAdi(o.donem);
  return (
    <div className="tc-pym-sg" data-masa={o.masa ? '' : undefined} role="toolbar" aria-label="Görünüm">
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
      {!o.masa && <span className="tc-pym-sg-baska-kap"><BaskaMenusu acik={o.menuAcik} ac={o.menuAc} {...o.baska} /></span>}
    </div>
  );
}
