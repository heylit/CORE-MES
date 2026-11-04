import { GOVDE_ALANI, katalogModeli, type GovdeTipi } from '../veri/tezgah-katalogu.ts';

// Katalog modelinin gövdeye göre oranı (1893 a). Gövde tek ölçüde çizilir. Üretici dış ölçüsü bilinen modelde gövde o ölçüye
// getirilir (2100-1 a); bilinmeyende model çalışma alanı büyüdükçe o yönde uzar, oran karekökle yumuşatılır ve 0,75-1,5
// aralığında tutulur: gövde tanınır kalır, iş mili ve kapı gibi parçalar bozulmaz.
// Sahne ekseni: x en, y yükseklik, z derinlik. Frezede X kursu ene, Y derinliğe, Z yüksekliğe; tornada boy ene, çap yükseklik ve
// derinliğe; CMM'de X ene, Y derinliğe, Z yüksekliğe gider.

export interface Oran { x: number; y: number; z: number }
export const BIRIM: Oran = { x: 1, y: 1, z: 1 };
const ALT = 0.75, UST = 1.5;

function oran(model: number, govde: number): number {
  if (!(model > 0) || !(govde > 0)) return 1;
  return Math.min(UST, Math.max(ALT, Math.sqrt(model / govde)));
}

const TORNA = new Set<GovdeTipi>(['m_lathe', 'm_ulathe', 'm_tf', 'm_swiss']);

// Modelin dış ölçüsüne göre oran: `cizilen` gövdenin sahnedeki kutusu (metre). Dış ölçüsü olmayan model çalışma alanı oranını alır.
export function govdeOlcegi(kind: string, cizilen: Oran): Oran {
  const d = katalogModeli(kind)?.dis;
  if (!d || !(cizilen.x > 0) || !(cizilen.y > 0) || !(cizilen.z > 0)) return katalogOrani(kind);
  return { x: d.en / 1000 / cizilen.x, y: d.yukseklik / 1000 / cizilen.y, z: d.derinlik / 1000 / cizilen.z };
}

// Kayıttaki model türünün oranı; gövde tipi ya da bilinmeyen anahtar birim orandır.
export function katalogOrani(kind: string): Oran {
  const m = katalogModeli(kind);
  if (!m) return BIRIM;
  const a = m.alan, g = GOVDE_ALANI[m.govde];
  if (TORNA.has(m.govde)) { const cap = oran(a.x, g.x); return { x: oran(a.z, g.z), y: cap, z: cap }; }
  return { x: oran(a.x, g.x), y: oran(a.z, g.z), z: oran(a.y, g.y) };
}
