import { tplSummary, type KuralBaglami, type TurDegerleri, type TurTaslagi } from '../kurallar/index.ts';
import { FAM_ICON, TUR_ICON } from '../sabitler/index.ts';
import { kayitTamamla, type Sablon } from '../tipler.ts';

export interface SablonGorunumu {
  id: string;
  ad: string;
  ozet: string;
  simge: string;
  // Renk niteliği: hammadde dışı şablonda tür, hammaddede aile (prototip: TURLER[tur].c ya da FAMS[fam].c, bilinmeyen aile `diger`).
  renk: { tur: string } | { aile: string };
}

// Prototip Tpl.silinirMi: hazır şablon hiç silinmez; kayıtlı şablonu sunucunun `kaldirabilir` dediği kişi siler.
export function silinirMi(t: Sablon, kaldirabilir: ReadonlySet<string>): boolean {
  return t['sys'] !== true && kaldirabilir.has(t.id);
}

// Şablon kartın alt kümesidir (prototip şablonu taslak gibi okur): eksik alan taslağın boş değeriyle dolar, tür alanları `g`'den gelir.
export function sablonTaslagi(t: Sablon): TurTaslagi {
  const k = kayitTamamla(t);
  const g: TurDegerleri = { ...k.g };
  return { ...k, g };
}

// Prototip renderTplView'daki kart: tür, aile, ad ve özet (tplSummary).
export function sablonGorunumu(t: Sablon, b: KuralBaglami): SablonGorunumu {
  const tur = typeof t['tur'] === 'string' && t['tur'] !== 'hammadde' ? t['tur'] : null;
  const fam = typeof t['fam'] === 'string' ? t['fam'] : '';
  const bilinen = fam in b.t.FAMS;
  const aile = bilinen ? fam : 'diger';
  const simgeler = tur === null ? FAM_ICON : TUR_ICON;
  return {
    id: t.id,
    ad: t.ad ?? '',
    // Prototipin özeti hammaddede aileyi okur; ailesi bilinmeyen kayıtlı şablon özetsiz çizilir, liste düşmez.
    ozet: tur === null && !bilinen ? '' : tplSummary(sablonTaslagi(t), b),
    simge: (tur === null ? simgeler[aile] ?? simgeler['diger'] : simgeler[tur]) ?? '',
    renk: tur === null ? { aile } : { tur },
  };
}
