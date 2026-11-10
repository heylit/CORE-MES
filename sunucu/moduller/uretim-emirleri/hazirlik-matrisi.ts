import type { Db } from '#cekirdek/db.ts';
import type { HazirlikCevabi, HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { hazirliklar } from './hazirlik.ts';
import { isEmriIlerlemeleri } from './is-emri-servis.ts';
import { gorunenDurum } from './kurallar.ts';
import * as s from './sorgular.ts';

// Hazırlık matrisi (2748): açık emirler (taslak, planlı, başladı), teslime göre; her emrin iş emri ilerlemesi ve hazırlığı. Emir
// kimlikleri verilirse yalnız o emirler (kapalı olan da). Arşivdeki ve iş emirsiz emir yoktur. Operatör de okur: alanlar sayfanınkilerdir.
const ACIK: ReadonlySet<string> = new Set(['taslak', 'planli', 'basladi']);

// Muafiyet listesi (kişi, gerekçe) operatöre gitmez; madde ve iş emri satırları alan alan kopyalanır, cevap şeması strict'tir.
function darHazirlik(h: HazirlikCevabi | null): HazirlikMatrisiCevabi['emirler'][number]['hazirlik'] {
  if (h === null) return null;
  return {
    maddeler: h.maddeler.map((m) => ({ madde: m.madde, durum: m.durum, muafTutulur: m.muafTutulur, isEmriDuzeyi: m.isEmriDuzeyi })),
    isEmirleri: h.isEmirleri.map((i) => ({ isEmriId: i.isEmriId, opNo: i.opNo, ad: i.ad, bitti: i.bitti, maddeler: i.maddeler.map((m) => ({ madde: m.madde, durum: m.durum })) })),
  };
}

export async function hazirlikMatrisi(db: Db, emirIdleri: readonly number[] | null): Promise<HazirlikMatrisiCevabi> {
  const ust = emirIdleri === null
    ? (await s.ustEmirler(db, false, null, false)).filter((e) => ACIK.has(e.durum))
    : (await s.ustEmirlerBul(db, emirIdleri)).filter((e) => !e.arsiv && e.malzemeNo !== null);
  const emirler = ust.sort((a, b) => (a.teslim ?? '9999').localeCompare(b.teslim ?? '9999') || a.id - b.id);
  const idler = emirler.map((e) => e.id);
  const ilerleme = await isEmriIlerlemeleri(db, idler);
  const hazirlik = await hazirliklar(db, idler);
  const istasyonlar = [...new Set([...ilerleme.values()].flat().map((i) => i.istasyonId).filter((x): x is number => x !== null))];
  const ad = await istasyonAdlari(db, istasyonlar);
  return {
    emirler: emirler.map((e) => {
      const isEmirleri = ilerleme.get(e.id) ?? [];
      return {
        id: e.id, emirNo: e.emirNo, urun: { id: e.malzemeNo, kod: e.parcaNo, ad: e.parcaAd }, adet: e.adet, teslim: e.teslim,
        durum: gorunenDurum(e.durum, isEmirleri.some((i) => i.durum !== 'bekliyor')),
        isEmirleri: isEmirleri.map((i) => ({ ...i, istasyon: i.istasyonId === null ? null : (ad.get(i.istasyonId) ?? null) })),
        hazirlik: darHazirlik(hazirlik.get(e.id) ?? null),
      };
    }),
  };
}
