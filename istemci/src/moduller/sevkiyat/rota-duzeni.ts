// Elle düzenleme: araç rotaları listesinde taşıma işlemleri. Yalnız listeyi değiştirir; kurala uygunluğu, saatleri ve
// eksik al-bırak ucunu sunucu kaydederken denetler ve hesaplar.
import type { GunPlaniCevabi, IsTuru, KaydetGovdesi, RotaOgesi } from '#paylasilan/sozlesme/sevkiyat.ts';

export type Rotalar = KaydetGovdesi['rotalar'];
export type IsUcu = { isId: number; alis: boolean };

export const araDonusMu = (oge: RotaOgesi): oge is { araDonus: true } => 'araDonus' in oge;

export function plandakiRotalar(plan: GunPlaniCevabi): Rotalar {
  return plan.rotalar.map((r) => ({ aracId: r.aracId, kilitli: r.kilitli, ogeler: [...r.ogeler] }));
}

// İşin rotaya giren uçları: teslimat bırakış, alım alış, al-bırak ikisi (önce alış).
export const isUclari = (isId: number, tur: IsTuru): IsUcu[] =>
  tur === 'teslimat' ? [{ isId, alis: false }] : tur === 'alim' ? [{ isId, alis: true }] : [{ isId, alis: true }, { isId, alis: false }];

const rotaDegistir = (rotalar: Rotalar, aracId: number, degistir: (ogeler: RotaOgesi[]) => RotaOgesi[]): Rotalar => {
  const varMi = rotalar.some((r) => r.aracId === aracId);
  const liste = varMi ? rotalar : [...rotalar, { aracId, kilitli: false, ogeler: [] }];
  return liste.map((r) => (r.aracId === aracId ? { ...r, ogeler: degistir([...r.ogeler]) } : r));
};

export function bekleyeneAl(rotalar: Rotalar, isId: number): Rotalar {
  return rotalar.map((r) => ({ ...r, ogeler: r.ogeler.filter((o) => araDonusMu(o) || o.isId !== isId) }));
}

// İşi (bütün uçlarıyla) bir araca taşır; sira verilmezse sona. Aynı araç içinde taşımada sıra, çıkarmadan önceki dizine göredir.
export function isiTasi(rotalar: Rotalar, isId: number, tur: IsTuru, hedefAracId: number, sira?: number): Rotalar {
  const kaynak = rotalar.find((r) => r.ogeler.some((o) => !araDonusMu(o) && o.isId === isId));
  let hedefSira = sira;
  if (hedefSira !== undefined && kaynak?.aracId === hedefAracId) {
    hedefSira -= kaynak.ogeler.slice(0, hedefSira).filter((o) => !araDonusMu(o) && o.isId === isId).length;
  }
  const bosaltilmis = bekleyeneAl(rotalar, isId);
  return rotaDegistir(bosaltilmis, hedefAracId, (ogeler) => {
    const yer = hedefSira === undefined ? ogeler.length : Math.max(0, Math.min(ogeler.length, hedefSira));
    ogeler.splice(yer, 0, ...isUclari(isId, tur));
    return ogeler;
  });
}

// Bir öğeyi aynı rotada başka sıraya taşır (al-bırak ucu tek başına taşınabilir; sıra ihlali uyarı olarak döner).
export function ogeyiTasi(rotalar: Rotalar, aracId: number, eskiSira: number, yeniSira: number): Rotalar {
  return rotaDegistir(rotalar, aracId, (ogeler) => {
    if (eskiSira < 0 || eskiSira >= ogeler.length) return ogeler;
    const [oge] = ogeler.splice(eskiSira, 1);
    const hedef = Math.max(0, Math.min(ogeler.length, yeniSira > eskiSira ? yeniSira - 1 : yeniSira));
    ogeler.splice(hedef, 0, oge!);
    return ogeler;
  });
}

export const araDonusEkle = (rotalar: Rotalar, aracId: number, sira: number): Rotalar =>
  rotaDegistir(rotalar, aracId, (ogeler) => { ogeler.splice(sira, 0, { araDonus: true }); return ogeler; });
export const ogeyiSil = (rotalar: Rotalar, aracId: number, sira: number): Rotalar =>
  rotaDegistir(rotalar, aracId, (ogeler) => { ogeler.splice(sira, 1); return ogeler; });
export const kilitDegistir = (rotalar: Rotalar, aracId: number): Rotalar => {
  const varMi = rotalar.some((r) => r.aracId === aracId);
  return varMi ? rotalar.map((r) => (r.aracId === aracId ? { ...r, kilitli: !r.kilitli } : r)) : [...rotalar, { aracId, kilitli: true, ogeler: [] }];
};
// Kilitsiz araçlardaki bütün işler bekleyene döner.
export const kilitsizleriBosalt = (rotalar: Rotalar): Rotalar => rotalar.map((r) => (r.kilitli ? r : { ...r, ogeler: [] }));

// Saat hesabı yokken (harita paketi yok) araçtaki en yüksek yük sıradan çıkarılır: her seferde teslimatlar fabrikada yüklenir,
// alış ucu ekler, teslimat ve al-bırak bırakışı düşürür; alım fabrikada boşaltılır. Sunucunun hesabıyla aynı sayım.
export function yukTepesi(ogeler: readonly RotaOgesi[], isBul: (isId: number) => { tur: IsTuru; agirlikKilogram: string; paletSayisi: number } | undefined): { kilogram: number; palet: number } {
  let enCokKg = 0, enCokPalet = 0;
  const seferler: RotaOgesi[][] = [[]];
  for (const o of ogeler) if (araDonusMu(o)) seferler.push([]); else seferler[seferler.length - 1]!.push(o);
  for (const sefer of seferler) {
    let kg = 0, palet = 0;
    for (const o of sefer) {
      const is = araDonusMu(o) ? undefined : isBul(o.isId);
      if (is?.tur === 'teslimat') { kg += Number(is.agirlikKilogram); palet += is.paletSayisi; }
    }
    enCokKg = Math.max(enCokKg, kg); enCokPalet = Math.max(enCokPalet, palet);
    for (const o of sefer) {
      if (araDonusMu(o)) continue;
      const is = isBul(o.isId); if (!is) continue;
      const kat = o.alis ? 1 : is.tur === 'alim' ? 0 : -1;
      kg += kat * Number(is.agirlikKilogram); palet += kat * is.paletSayisi;
      enCokKg = Math.max(enCokKg, kg); enCokPalet = Math.max(enCokPalet, palet);
    }
  }
  return { kilogram: enCokKg, palet: enCokPalet };
}
