import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { HAZIRLIK_MADDELERI, YALNIZ_GORUNUM_MADDELERI, hazirlikUyarirMi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { makineDurumlari, makineler } from '../istasyonlar/disari.ts';
import type { HazirlikCevabi, HazirlikMaddesi, HazirlikMuafiyetiGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import type { BaslatmaOlayi } from './baslatma-denetimi.ts';
import { EMIR_YOK, MUAF_IS_EMRI_YOK, MUAF_KAPALI_EMIR, MUAF_MADDE_YOK, MUAF_TUTULUR, MUAF_ZATEN, hazirlikEngeli, hazirlikHali, makineHazirligi, talimatHazirligi } from './kurallar.ts';
import type { HazirlikBilgisi, HazirlikHali } from './kurallar.ts';
import * as s from './sorgular.ts';
import { talimatHazirlikSayilari } from './sorgular/adim/sorgular.ts';

// Hazırlık durdurucuları (120-122 a, denetim #14): maddenin durumunu sahibi modül verir. Sahipler (cnc-kurulum, Arkon, Kalite Merkezi)
// bu modülü okuduğu için çözücüler kablolama.ts'te kaydedilir; kayıtsız madde emirde aranmaz. CNC kurulumu iş emri başınadır (266 a),
// çözücüsü iş emri kimliği alır; ötekiler üretim emri kimliği. Uyaran maddeler (2146-1 a) başlatmada sorulmaz, yalnız görünümde.
export type HazirlikCozucusu = (db: Db, idler: readonly number[]) => Promise<ReadonlyMap<number, HazirlikBilgisi>>;
const IS_EMRI_DUZEYI: ReadonlySet<HazirlikMaddesi> = new Set(['cnc', 'malzeme', 'takim-omru', 'makine', 'yayin', 'talimat']);
const BASLATMADA_SORULMAZ: ReadonlySet<string> = new Set(YALNIZ_GORUNUM_MADDELERI);
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

// isEmriId verilirse yalnız o iş emri ve yalnız durduran maddeler (başlatma), verilmezse emrin bitmemiş iş emirleri (görünüm) sorulur.
async function maddeler(db: Db, uretimEmriId: number, isEmriId: number | null, muaf: readonly s.MuafiyetSatiri[]): Promise<Map<HazirlikMaddesi, HazirlikHali>> {
  const sonuc = new Map<HazirlikMaddesi, HazirlikHali>();
  let isEmirleri: number[] | null = isEmriId === null ? null : [isEmriId];
  for (const m of HAZIRLIK_MADDELERI) {
    if (isEmriId !== null && (hazirlikUyarirMi(m) || BASLATMADA_SORULMAZ.has(m))) continue;
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
  const v = (await hazirliklar(db, [uretimEmriId])).get(uretimEmriId);
  if (v === undefined) throw bulunamadi(EMIR_YOK);
  return v;
}

// Emir ayrıntısı (tek emir) ve Üretim Hazırlık listesi (2227, birçok emir) aynı yoldan geçer: her çözücü bütün emirler için bir kez
// sorulur. Emir görünümündeki madde hâli bitmemiş iş emirlerinden, matris satırları bütün iş emirlerinden çıkar (2060 a).
// Bulunamayan ya da malzemesiz emir haritada yoktur.
export async function hazirliklar(db: Db, uretimEmriIdleri: readonly number[]): Promise<Map<number, HazirlikCevabi>> {
  const emirler: { id: number; muaf: s.MuafiyetSatiri[] }[] = [];
  for (const id of new Set(uretimEmriIdleri)) {
    const e = await s.ustEmirBul(db, id, false);
    if (e !== null && e.malzemeNo !== null) emirler.push({ id, muaf: await s.muafiyetler(db, id) });
  }
  const sonuc = new Map<number, HazirlikCevabi>();
  if (emirler.length === 0) return sonuc;
  const emirIdleri = emirler.map((e) => e.id);
  const isEmirleri = [...(await s.isEmirleriGetir(db, emirIdleri))].sort((a, b) => a.sira - b.sira);
  const isEmriIdleri = isEmirleri.map((i) => i.id);
  const durumlar = new Map<HazirlikMaddesi, ReadonlyMap<number, HazirlikBilgisi> | null>();
  for (const m of HAZIRLIK_MADDELERI) {
    const c = cozuculer.get(m);
    const idler = IS_EMRI_DUZEYI.has(m) ? isEmriIdleri : emirIdleri;
    durumlar.set(m, c && idler.length > 0 ? await c(db, idler) : null);
  }
  const adlar = await kisiAdlari(db, [...new Set(emirler.flatMap((e) => e.muaf.map((x) => x.kisiId)))]);
  for (const { id, muaf } of emirler) {
    const kendi = isEmirleri.filter((i) => i.uretimEmriId === id);
    const acik = kendi.filter((i) => i.durum !== 'tamam').map((i) => i.id);
    sonuc.set(id, {
      maddeler: HAZIRLIK_MADDELERI.map((madde) => {
        const d = durumlar.get(madde) ?? null;
        const durum = IS_EMRI_DUZEYI.has(madde)
          ? enKotu(acik.map((i) => hazirlikHali(d?.get(i), muafMi(muaf, madde, i))))
          : hazirlikHali(d?.get(id), muafMi(muaf, madde, null));
        return { madde, durum, muafTutulur: MUAF_TUTULUR.has(madde), isEmriDuzeyi: IS_EMRI_DUZEYI.has(madde) };
      }),
      muafiyetler: muaf.map((x) => ({ ...x, kisiAdi: adlar.get(x.kisiId) ?? null })),
      isEmirleri: kendi.map((i) => ({
        isEmriId: i.id, opNo: i.opNo, ad: i.ad, bitti: i.durum === 'tamam',
        maddeler: HAZIRLIK_MADDELERI.filter((m) => IS_EMRI_DUZEYI.has(m))
          .map((madde) => ({ madde, durum: hazirlikHali(durumlar.get(madde)?.get(i.id), muafMi(muaf, madde, i.id)) })),
      })),
    });
  }
  return sonuc;
}

// 264 a: yalnız müdür (uretim-emirleri.hazirlik-muaf); kişi, gerekçe ve zamanla yazılır, silinmez.
export async function muafiyetVer(db: Db, kullanici: Kullanici, uretimEmriId: number, g: HazirlikMuafiyetiGovdesi): Promise<HazirlikCevabi> {
  const e = await s.ustEmirBul(db, uretimEmriId, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  if (e.durum === 'bitti' || e.durum === 'iptal') throw cakisma(MUAF_KAPALI_EMIR);
  if (!(MUAF_TUTULUR as ReadonlySet<string>).has(g.madde)) throw dogrulama(MUAF_MADDE_YOK, 'madde');
  if (g.isEmriId !== null && !(await s.isEmirleriGetir(db, [uretimEmriId])).some((i) => i.id === g.isEmriId)) throw dogrulama(MUAF_IS_EMRI_YOK, 'isEmriId');
  if ((await s.muafiyetler(db, uretimEmriId)).some((x) => x.madde === g.madde && x.isEmriId === g.isEmriId)) throw cakisma(MUAF_ZATEN);
  await s.muafiyetEkle(db, { uretimEmriId, isEmriId: g.isEmriId, madde: g.madde, kisiId: kullanici.id, gerekce: g.gerekce });
  return hazirlik(db, uretimEmriId);
}

// Makine durumu (2146-1 a): sahibi İstasyonlar'dır; bu modül onu zaten okuduğu için çözücü burada kayıtlıdır (İstasyonlar üretim
// emirlerini okuyamaz, döngü olur). Durum satırı olmayan makine çalışır sayılır (İstasyonlar'daki kural).
export async function makineHazirlikDurumlari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, HazirlikBilgisi>> {
  const planlar = await s.isEmriPlanBilgileriGetir(db, [...new Set(isEmriIdleri)]);
  if (planlar.length === 0) return new Map();
  const durum = new Map((await makineDurumlari(db)).map((d) => [d.makineId, d.durum]));
  const aktif = await makineler(db, { pasiflerDahil: false });
  const sonuc = new Map<number, HazirlikBilgisi>();
  for (const p of planlar) {
    const istasyonda = p.istasyonId === null ? [] : aktif.filter((m) => m.istasyonId === p.istasyonId);
    sonuc.set(p.id, p.fasonFirmaId !== null || (p.makineId === null && p.istasyonId === null)
      ? { durum: 'yok', secildi: false }
      : makineHazirligi({
        secili: p.makineId === null ? null : (durum.get(p.makineId) ?? 'calisir'),
        istasyondaMakine: istasyonda.length,
        calisir: istasyonda.filter((m) => (durum.get(m.id) ?? 'calisir') === 'calisir').length,
      }));
  }
  return sonuc;
}
hazirlikCozucusuKaydet('makine', makineHazirlikDurumlari);

// Talimat maddesi (2227-1): adımlar bu modülün tablosundadır, çözücü burada kayıtlıdır.
export async function talimatHazirlikDurumlari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, HazirlikBilgisi>> {
  const idler = [...new Set(isEmriIdleri)];
  if (idler.length === 0) return new Map();
  const sayilar = new Map((await talimatHazirlikSayilari(db, idler)).map((x) => [x.isEmriId, x]));
  return new Map(idler.map((i) => [i, talimatHazirligi(sayilar.get(i))]));
}
hazirlikCozucusuKaydet('talimat', talimatHazirlikDurumlari);
