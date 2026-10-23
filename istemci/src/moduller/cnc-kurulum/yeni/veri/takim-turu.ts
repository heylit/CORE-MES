import type { Kalem } from './tipler.ts';

// Takımın türü (prototipte CNC3D'nin TOOL ve LATHE tablolarının anahtarları); veri katmanı tutucu kataloğunu bundan türetir.
export const FREZE_TURLERI: ReadonlySet<string> = new Set([
  'endmill', 'rougher', 'ball', 'bullnose', 'drill', 'spot', 'tap', 'reamer', 'chamfer', 'threadmill', 'tslot', 'keyseat', 'facemill',
  'facemill45', 'boring', 'probe', 'longneck', 'taperball', 'lollipop', 'engrave', 'barrel', 'backchamfer', 'center', 'csink', 'stepdrill',
  'idrill', 'shoulder', 'hfmi', 'roundins', 'disc', 'longedge', 'boring2',
]);
export const TORNA_TURLERI: ReadonlySet<string> = new Set([
  'lt_ext', 'lt_thread', 'lt_bore', 'lt_ithread', 'lt_groove', 'lt_part', 'lt_udrill', 'lt_igroove', 'lt_facegroove', 'lt_knurl',
]);

export function isMillTool(it: Pick<Kalem, 'kind'>): boolean { return FREZE_TURLERI.has(it.kind); }
export function isLatheTool(it: Pick<Kalem, 'kind'>): boolean { return TORNA_TURLERI.has(it.kind); }

// Takımın tutucu türü.
// Çapı olmayan takım prototipte karşılaştırmayı yanlış sayar (undefined <= n): eşik sınaması çap varsa yapılır.
export function htype(t: Pick<Kalem, 'kind' | 'd' | 'tm'>): string {
  const enCok = (n: number): boolean => t.d !== undefined && t.d <= n;
  switch (t.kind) {
    case 'facemill': case 'facemill45': return 'arbor';
    case 'disc': return 'arbord';
    case 'shoulder': case 'hfmi': return enCok(42) ? 'weldon' : 'arbor';
    case 'roundins': case 'longedge': case 'keyseat': case 'idrill': return 'weldon';
    case 'boring2': return 'none';
    case 'center': case 'csink': case 'stepdrill': return 'er';
    case 'longneck': case 'taperball': case 'lollipop': case 'engrave': case 'barrel': case 'backchamfer': return 'shrink';
    case 'tap': return 'tap';
    case 'boring': case 'probe': return 'none';
    case 'drill': case 'reamer': return t.tm === 'H' ? 'er' : 'hyd';
    case 'spot': return 'er';
    case 'rougher': case 'tslot': return 'weldon';
    default: return enCok(20) ? 'shrink' : 'weldon';
  }
}
