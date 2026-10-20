import type { AlanTuru, GecisTuru, RafTuru } from '#paylasilan/sozlesme/atolye.ts';
import type { MakineCinsi } from './kurallar.ts';

// Plan simgeleri: kuşbakışı mimari çizim dilinde, makine ve öğe cinsini tek bakışta söyleyen küçük çizimler.
// Aynı çizim hem planda (metre ölçeğinde) hem paletteki düğmede (piksel) kullanılır. Koordinat -12..12; renk sınıftan.

export type PlanSimgesiAdi =
  | MakineCinsi
  | `raf_${RafTuru}`
  | AlanTuru
  | `gecis_${GecisTuru}`
  | 'duvar' | 'cam_duvar' | 'giris' | 'model';

interface Cizim {
  // Çizgi (dolgusuz) ve vurgu (yarı saydam dolgu) yolları.
  cizgi: string;
  vurgu?: string;
}

const daire = (x: number, y: number, r: number) => `M${x + r} ${y}a${r} ${r} 0 1 1 ${-2 * r} 0a${r} ${r} 0 1 1 ${2 * r} 0`;

export const PLAN_SIMGELERI: Record<PlanSimgesiAdi, Cizim> = {
  // Kabin, T kanallı tabla, iş mili.
  dik_isleme: { cizgi: `M-10-8h20v16h-20z M-7-1h14v7h-14z M-7 2.5h14 ${daire(0, -4.5, 2)}`, vurgu: daire(0, -4.5, 2) },
  // Kabin, döner tabla ve devrilme ekseni.
  bes_eksen: { cizgi: `M-10-8h20v16h-20z M-9 2h18 ${daire(0, 2, 4.2)} ${daire(0, -5, 1.4)}`, vurgu: daire(0, 2, 4.2) },
  // Kızak, fener mili, ayna, iş parçası, punta.
  torna: { cizgi: 'M-11-6h22v12h-22z M-6-6v12 M-6-3h2v6h-2z M-4 0h9 M5-2h4v4h-4z', vurgu: 'M-11-6h5v12h-5z' },
  // Izgara tabla, portal, kafa.
  lazer: { cizgi: 'M-11-6h22v12h-22z M-8-4v8M-5-4v8M-2-4v8M7-4v8 M1-8h3v16h-3z', vurgu: 'M1-8h3v16h-3z' },
  // Granit tabla, köprü, ölçülen parça, prob.
  cmm: { cizgi: 'M-10-7h20v14h-20z M-6-8h3v16h-3z M1-3h6v6h-6z M-3 0h4', vurgu: 'M-6-8h3v16h-3z' },
  // Tezgah ve operatör taburesi.
  montaj: { cizgi: `M-10-7h20v8h-20z M-10-3h20 ${daire(0, 6, 2)}`, vurgu: 'M-10-7h20v4h-20z' },
  // Kabin, arka filtre duvarı, püskürtme konisi.
  boya: { cizgi: 'M-10-8h20v16h-20z M-10-5h20 M-6-8v3M-2-8v3M2-8v3M6-8v3 M0 6l-4-7 M0 6l4-7 M0 6v-7', vurgu: 'M-10-8h20v3h-20z' },
  depo: { cizgi: 'M-10-7h20v14h-20z M-10 0h20 M-7-5h5v3h-5z M2-5h5v3h-5z M-7 2h5v3h-5z', vurgu: 'M-7-5h5v3h-5z M-7 2h5v3h-5z' },

  // Palet rafı: bölmeler ve çapraz (plan çiziminde dolu raf işareti).
  raf_palet: { cizgi: 'M-11-4h22v8h-22z M-3.7-4v8 M3.7-4v8 M-11-4l7.3 8 M-3.7-4l7.4 8 M3.7-4l7.3 8' },
  raf_kucuk_parca: { cizgi: 'M-11-3h22v6h-22z M-6.5-3v6 M-2-3v6 M2.5-3v6 M7-3v6 M-11 0h22', vurgu: 'M-11-3h4.5v3h-4.5z M-2-3h4.5v3h-4.5z M7-3h4v3h-4z' },
  // Konsol: orta omurga, iki yana kollar.
  raf_konsol: { cizgi: 'M-11 0h22 M-8-6v12 M0-6v12 M8-6v12 M-9.5-6h3M-1.5-6h3M6.5-6h3 M-9.5 6h3M-1.5 6h3M6.5 6h3' },
  // Üst üste sac levhalar.
  raf_zemin: { cizgi: 'M-10-7h15v9h-15z M-7.5-4.5h15v9h-15z M-5-2h15v9h-15z', vurgu: 'M-5-2h15v9h-15z' },

  palet: { cizgi: 'M-10-6h20v12h-20z M-10-2h20 M-10 2h20', vurgu: 'M-10-6h20v12h-20z' },
  yuruyus_yolu: { cizgi: 'M-11-5h22 M-11 5h22 M-8-2l3 2-3 2 M-1-2l3 2-3 2 M6-2l3 2-3 2' },
  bolge: { cizgi: 'M-10-5v-3h3 M7-8h3v3 M10 5v3h-3 M-7 8h-3v-3 M-3 0h6 M0-3v6' },
  karantina: { cizgi: 'M0-9.5l10.5 18h-21z M0-3v5.5 M0 5v.5', vurgu: 'M0-9.5l10.5 18h-21z' },
  sevkiyat: { cizgi: `M-11-6h13v10h-13z M2-2h5l4 3.5v2.5h-9z ${daire(-6, 6.5, 2)} ${daire(6, 6.5, 2)}`, vurgu: 'M-11-6h13v10h-13z' },
  // Stok alanları: içeri ok ve kutu (kabul), dışarı ok ve dişli (üretim çıkışı), zemin istifi, fasona giden kutu, bekleme, hurda.
  kabul: { cizgi: 'M-3-6h13v12h-13z M-11 0h7 M-7-3l3 3-3 3', vurgu: 'M-3-6h13v12h-13z' },
  uretim_cikisi: { cizgi: `${daire(-4, 0, 5)} M-4-7v2 M-4 5v2 M-11 0h2 M1 0h2 M3 0h8 M8-3l3 3-3 3`, vurgu: daire(-4, 0, 2) },
  depo_zemini: { cizgi: 'M-10 6h20 M-8 6v-5h7v5 M1 6v-5h7v5 M-4.5 1v-5h7v5', vurgu: 'M-4.5-4h7v5h-7z' },
  fason: { cizgi: 'M-11-5h10v10h-10z M1 0h10 M8-3l3 3-3 3 M4-6h7', vurgu: 'M-11-5h10v10h-10z' },
  // Bekleme: kum saati. Hurda: kapaklı çöp kutusu.
  ara_alan: { cizgi: 'M-6-9h12 M-6 9h12 M-5-9c0 5 10 5 10 9s-10 4-10 9 M5-9c0 5-10 5-10 9s10 4 10 9', vurgu: 'M-3 6h6l-3-3z' },
  hurda: { cizgi: 'M-9-6h18 M-3-6v-2h6v2 M-7-6l1.5 15h11l1.5-15 M-2.5-2v8 M2.5-2v8', vurgu: 'M-7-6l1.5 15h11l1.5-15z' },
  // Oda: duvar, kapı kanadı ve açılma yayı.
  oda: { cizgi: 'M-6 8h-4v-16h20v16h-8 M-2 8v-4 M-6 8a4 4 0 0 1 4-4' },
  cam_oda: { cizgi: 'M-6 8h-4v-16h20v16h-8 M-8.5-6.5h17 M-2 8v-4 M-6 8a4 4 0 0 1 4-4', vurgu: 'M-10-8h20v1.5h-20z' },

  duvar: { cizgi: 'M-11-2.5h22v5h-22z M-8 2.5l5-5 M-2 2.5l5-5 M4 2.5l5-5', vurgu: 'M-11-2.5h22v5h-22z' },
  cam_duvar: { cizgi: 'M-11-1.2h22 M-11 1.2h22 M-11-3v6 M11-3v6 M0-3v6' },
  // Giriş: kapı ve içeri ok.
  giris: { cizgi: 'M-1-9h9v18h-9 M-11 0h8 M-6-3l3 3-3 3', vurgu: 'M-1-9h9v18h-9z' },
  // Geçişler: duvar kesiti ve aralıktaki kapatma (kepenk çıtaları, kapı kanadı ve yayı); açık geçişte aralıktan ok.
  gecis_kepenk: { cizgi: 'M-11-2h5v4h-5z M6-2h5v4h-5z M-6-6h12 M-6-3h12 M-6 0h12 M-6 3h12 M-6 6h12', vurgu: 'M-6-6h12v12h-12z' },
  gecis_acik: { cizgi: 'M-11-2h5v4h-5z M6-2h5v4h-5z M0-8v16 M-3 5l3 3 3-3', vurgu: 'M-11-2h5v4h-5z M6-2h5v4h-5z' },
  gecis_kapi: { cizgi: 'M-11-2h6v4h-6z M5-2h6v4h-6z M-5 2l9-9 M-5 2a12.7 12.7 0 0 1 10 0', vurgu: 'M-11-2h6v4h-6z M5-2h6v4h-6z' },
  gecis_yangin_kapisi: { cizgi: 'M-11-2h6v4h-6z M5-2h6v4h-6z M-5 2l9-9 M-5 2a12.7 12.7 0 0 1 10 0 M6-10c-2 2-2 4 0 5 2-1 2-3 0-5z', vurgu: 'M6-10c-2 2-2 4 0 5 2-1 2-3 0-5z' },
  // Atanmış gerçek 3B model rozeti: küp.
  model: { cizgi: 'M0-9l8 4.5v9l-8 4.5-8-4.5v-9z M-8-4.5l8 4.5 8-4.5 M0 0v9', vurgu: 'M0-9l8 4.5-8 4.5-8-4.5z' },
};

const RAF_SIMGESI: Record<RafTuru, PlanSimgesiAdi> = {
  palet: 'raf_palet', kucuk_parca: 'raf_kucuk_parca', konsol: 'raf_konsol', zemin: 'raf_zemin',
};
export const rafSimgesi = (tur: RafTuru): PlanSimgesiAdi => RAF_SIMGESI[tur];

// Planın içinde: merkezi (x, z), kenarı `boy` metre.
export function PlanSimgesi({ ad, x, z, boy }: { ad: PlanSimgesiAdi; x: number; z: number; boy: number }) {
  const c = PLAN_SIMGELERI[ad];
  return (
    <g className="tc-plan-simge" data-simge={ad} transform={`translate(${x.toFixed(3)} ${z.toFixed(3)}) scale(${(boy / 24).toFixed(4)})`} aria-hidden="true">
      {c.vurgu && <path className="tc-plan-simge-vurgu" d={c.vurgu} />}
      <path className="tc-plan-simge-cizgi" d={c.cizgi} />
    </g>
  );
}

// Düğme ve liste için tek başına simge; boyut çekirdek simge sınıflarından.
export function OgeSimgesi({ ad }: { ad: PlanSimgesiAdi }) {
  const c = PLAN_SIMGELERI[ad];
  return (
    <svg className="tc-simge tc-simge-b tc-atolye-oge-simgesi" viewBox="-12 -12 24 24" aria-hidden="true" data-simge={ad}>
      {c.vurgu && <path className="tc-plan-simge-vurgu" d={c.vurgu} />}
      <path className="tc-plan-simge-cizgi" d={c.cizgi} />
    </svg>
  );
}
