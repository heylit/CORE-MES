import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { HAZIRLIK_MADDELERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { HazirlikCevabi, HazirlikMaddesi, HazirlikMuafiyetiGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import type { BaslatmaOlayi } from './baslatma-denetimi.ts';
import { EMIR_YOK, MUAF_IS_EMRI_YOK, MUAF_KAPALI_EMIR, MUAF_TUTULUR, MUAF_ZATEN, hazirlikEngeli, hazirlikHali } from './kurallar.ts';
import type { HazirlikBilgisi, HazirlikHali } from './kurallar.ts';
import * as s from './sorgular.ts';

// Hazırlık durdurucuları (120-122 a, denetim #14): maddenin durumunu sahibi modül verir. Sahipler (cnc-kurulum, Arkon, Kalite Merkezi)
// bu modülü okuduğu için çözücüler kablolama.ts'te kaydedilir; kayıtsız madde emirde aranmaz. CNC kurulumu iş emri başınadır (266 a),
// çözücüsü iş emri kimliği alır; ötekiler üretim emri kimliği.
export type HazirlikCozucusu = (db: Db, idler: readonly number[]) => Promise<ReadonlyMap<number, HazirlikBilgisi>>;
const IS_EMRI_DUZEYI: ReadonlySet<HazirlikMaddesi> = new Set(['cnc']);
const cozuculer = new Map<HazirlikMaddesi, HazirlikCozucusu>();
// Önceki çözücüyü döner: test kendi çözücüsünü koyup sonra geri yükler.
export function hazirlikCozucusuKaydet(madde: HazirlikMaddesi, cozucu: HazirlikCozucusu | null): HazirlikCozucusu | null {
  const onceki = cozuculer.get(madde) ?? null;
  if (cozucu) cozuculer.set(madde, cozucu); else cozuculer.delete(madde);
  return onceki;
}

const muafMi = (l: readonly s.MuafiyetSatiri[], madde: HazirlikMaddesi, isEmriId: number | null) =>
  l.some((x) => x.madde === madde && (x.isEmriId === null || x.isEmriId === isEmriId));

// Emir görünümünde iş emri düzeyindeki madde en kötü iş emrinin hâlini alır.
const HAL_SIRASI: readonly HazirlikHali[] = ['eksik', 'bilinmiyor', 'muaf', 'tamam', 'gerekmez'];
const enKotu = (l: readonly HazirlikHali[]): HazirlikHali => HAL_SIRASI.find((h) => l.includes(h)) ?? 'gerekmez';

// isEmriId verilirse yalnız o iş emri (başlatma), verilmezse emrin bitmemiş iş emirleri (görünüm) sorulur.
async function maddeler(db: Db, uretimEmriId: number, isEmriId: number | null, muaf: readonly s.MuafiyetSatiri[]): Promise<Map<HazirlikMaddesi, HazirlikHali>> {
  const sonuc = new Map<HazirlikMaddesi, HazirlikHali>();
  let isEmirleri: number[] | null = isEmriId === null ? null : [isEmriId];
  for (const m of HAZIRLIK_MADDELERI) {
    const c = cozuculer.get(m);
    if (!IS_EMRI_DUZEYI.has(m)) {
      sonuc.set(m, hazirlikHali(c ? (await c(db, [uretimEmriId])).get(uretimEmriId) : undefined, muafMi(muaf, m, isEmriId)));
      continue;
    }
    isEmirleri ??= (await s.isEmirleriGetir(db, [uretimEmriId])).filter((i) => i.durum !== 'tamam').map((i) => i.id);
    const durum = c ? await c(db, isEmirleri) : null;
    sonuc.set(m, enKotu(isEmirleri.map((i) => hazirlikHali(durum?.get(i), muafMi(muaf, m, i)))));
  }
  return sonuc;
}

// Başlatma kancası (baslatmaDenetimi) iş emri başlamadan önce sorar.
export async function hazirlikDenetimi(db: Db, olay: BaslatmaOlayi): Promise<string | null> {
  if (cozuculer.size === 0) return null;
  const durum = await maddeler(db, olay.uretimEmriId, olay.isEmriId, await s.muafiyetler(db, olay.uretimEmriId));
  return hazirlikEngeli([...durum].filter(([, h]) => h === 'eksik').map(([m]) => m));
}

export async function hazirlik(db: Db, uretimEmriId: number): Promise<HazirlikCevabi> {
  const e = await s.ustEmirBul(db, uretimEmriId, false);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  const muaf = await s.muafiyetler(db, uretimEmriId);
  const durum = await maddeler(db, uretimEmriId, null, muaf);
  const adlar = await kisiAdlari(db, [...new Set(muaf.map((x) => x.kisiId))]);
  return {
    maddeler: [...durum].map(([madde, h]) => ({ madde, durum: h, muafTutulur: MUAF_TUTULUR.has(madde) })),
    muafiyetler: muaf.map((x) => ({ ...x, kisiAdi: adlar.get(x.kisiId) ?? null })),
  };
}

// 264 a: yalnız müdür (uretim-emirleri.hazirlik-muaf); kişi, gerekçe ve zamanla yazılır, silinmez.
export async function muafiyetVer(db: Db, kullanici: Kullanici, uretimEmriId: number, g: HazirlikMuafiyetiGovdesi): Promise<HazirlikCevabi> {
  const e = await s.ustEmirBul(db, uretimEmriId, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  if (e.durum === 'bitti' || e.durum === 'iptal') throw cakisma(MUAF_KAPALI_EMIR);
  if (g.isEmriId !== null && !(await s.isEmirleriGetir(db, [uretimEmriId])).some((i) => i.id === g.isEmriId)) throw dogrulama(MUAF_IS_EMRI_YOK, 'isEmriId');
  if ((await s.muafiyetler(db, uretimEmriId)).some((x) => x.madde === g.madde && x.isEmriId === g.isEmriId)) throw cakisma(MUAF_ZATEN);
  await s.muafiyetEkle(db, { uretimEmriId, isEmriId: g.isEmriId, madde: g.madde, kisiId: kullanici.id, gerekce: g.gerekce });
  return hazirlik(db, uretimEmriId);
}
