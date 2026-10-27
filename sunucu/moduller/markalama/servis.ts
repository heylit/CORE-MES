import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  BirimAyrintisi, BirimDurumu, BirimlerCevabi, DogrulaGovdesi, DurumGovdesi, EmirOzetiCevabi, MarkalaGovdesi, MarkalamaBirimi,
  MarkalamaTanimi, OnizlemeCevabi, TanimEkleGovdesi, TanimEmirleriCevabi, TanimKaydetGovdesi, TanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { hurdaNedeniGetir } from '../durus-nedenleri/disari.ts';
import { malzemeOzeti, malzemeOzetleri } from '../malzemeler/disari.ts';
import { acikEmirler, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  alanHatasi, durumGecisi, hurdaNedeniHatasi, kapsamAnahtari, sablonHatasi, seriAlaniVarMi, seriNoUret,
} from './kurallar.ts';
import * as s from './sorgular.ts';

const TANIM_YOK = 'Markalama tanımı bulunamadı.';
const BIRIM_YOK = 'Seri no bulunamadı.';
const BIRIM_LISTE_SINIRI = 500;

async function tanimlariKur(db: Db, satirlar: s.TanimSatiri[]): Promise<MarkalamaTanimi[]> {
  const alanlar = await s.alanlariOku(db, satirlar.map((t) => t.id));
  const malzemeler = await malzemeOzetleri(db, satirlar.map((t) => t.malzemeId));
  return satirlar.map((t) => ({
    id: t.id, malzemeId: t.malzemeId, malzemeKodu: malzemeler.get(t.malzemeId)?.kod ?? null, opNo: t.opNo,
    seriSablonu: t.seriSablonu, sayacKapsami: t.sayacKapsami, baslangicSirasi: t.baslangicSirasi, dogrulama: t.dogrulama,
    model: t.modelBelgeId === null || t.modelRevizyon === null ? null : { belgeId: t.modelBelgeId, revizyon: t.modelRevizyon },
    alanlar: alanlar.get(t.id) ?? [], surum: t.surum, degismeZamani: t.degismeZamani,
  }));
}

async function varOlanTanim(db: Db, id: number): Promise<s.TanimSatiri> {
  const t = await s.tanimOku(db, id);
  if (t === null) throw bulunamadi(TANIM_YOK);
  return t;
}

export async function tanimlar(db: Db, malzemeId: number | null): Promise<TanimlarCevabi> {
  return { tanimlar: await tanimlariKur(db, await s.tanimlariOku(db, malzemeId)) };
}

export async function tanimGetir(db: Db, id: number): Promise<MarkalamaTanimi> {
  const [t] = await tanimlariKur(db, [await varOlanTanim(db, id)]);
  if (t === undefined) throw bulunamadi(TANIM_YOK);
  return t;
}

function tanimYazimi(g: TanimKaydetGovdesi | TanimEkleGovdesi): s.TanimYazimi {
  const sablon = sablonHatasi(g.seriSablonu, g.sayacKapsami);
  if (sablon !== null) throw dogrulama(sablon, 'seriSablonu');
  const alan = alanHatasi(g.alanlar);
  if (alan !== null) throw dogrulama(alan, 'alanlar');
  return {
    seriSablonu: g.seriSablonu, sayacKapsami: g.sayacKapsami, baslangicSirasi: g.baslangicSirasi, dogrulama: g.dogrulama,
    modelBelgeId: g.model?.belgeId ?? null, modelRevizyon: g.model?.revizyon ?? null,
  };
}

export async function tanimEkle(db: Db, kullanici: Kullanici, g: TanimEkleGovdesi): Promise<MarkalamaTanimi> {
  const yazim = tanimYazimi(g);
  // MRK-08: tanım var olan malzemeye açılır (rota adımı bağı Aşama 2'de yabancı anahtarla gelir).
  if ((await malzemeOzeti(db, g.malzemeId)) === null) throw dogrulama('Malzeme bulunamadı.', 'malzemeId');
  const id = await kisitKorumali(
    { markalama_tanimi_adim_tekil: 'Bu rota adımının markalama tanımı zaten var.' },
    () => s.tanimEkle(db, g.malzemeId, g.opNo, yazim, kullanici.id),
  );
  await s.alanlariYaz(db, id, g.alanlar);
  return tanimGetir(db, id);
}

export async function tanimKaydet(db: Db, kullanici: Kullanici, id: number, g: TanimKaydetGovdesi): Promise<MarkalamaTanimi> {
  const yazim = tanimYazimi(g);
  await surumluGuncelle({
    guncelle: () => s.tanimGuncelle(db, id, { ...yazim, surum: g.surum }, kullanici.id),
    varMi: () => s.tanimVarMi(db, id),
    bulunamadiIletisi: TANIM_YOK,
  });
  await s.alanlariYaz(db, id, g.alanlar);
  return tanimGetir(db, id);
}

interface SeriKaynagi { parca: string; emirNo: string }

async function seriKaynagi(db: Db, t: s.TanimSatiri, emirId: number | null): Promise<SeriKaynagi> {
  const malzeme = await malzemeOzeti(db, t.malzemeId);
  if (malzeme === null) throw gecersiz('Tanımın malzemesi bulunamadı.');
  if (emirId === null) return { parca: malzeme.kod, emirNo: '' };
  const emir = await uretimEmriOzeti(db, emirId);
  if (emir === null) throw bulunamadi('Üretim emri bulunamadı.');
  // MRK-07: seri yalnız açık emirde ve tanımın malzemesinin emrinde verilir.
  if (emir.malzemeNo !== t.malzemeId) throw gecersiz('Bu emir tanımın malzemesi için açılmamış.');
  if (!(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) throw gecersiz('Emir açık değil; seri verilmez.');
  return { parca: malzeme.kod, emirNo: emir.emirNo };
}

export async function tanimEmirleri(db: Db, tanimId: number): Promise<TanimEmirleriCevabi> {
  const t = await varOlanTanim(db, tanimId);
  const emirler = (await acikEmirler(db)).filter((e) => e.malzemeNo === t.malzemeId);
  return { emirler: emirler.map((e) => ({ id: e.id, emirNo: e.emirNo, adet: e.adet, durum: e.durum })) };
}

// Sıradaki numaralar sayacı tüketmez; gün sunucunun tesis günüdür.
export async function onizleme(db: Db, tanimId: number, emirId: number | null): Promise<OnizlemeCevabi> {
  const t = await varOlanTanim(db, tanimId);
  const k = await seriKaynagi(db, t, emirId);
  const gun = tesisGunu(Date.now());
  const anahtar = kapsamAnahtari(t.sayacKapsami, emirId ?? 0, gun);
  const son = await s.sonSira(db, t.malzemeId, anahtar);
  const ilk = son === null ? t.baslangicSirasi : son + 1;
  return { numaralar: [0, 1, 2].map((i) => seriNoUret(t.seriSablonu, { parca: k.parca, emir: k.emirNo, gun }, ilk + i)) };
}

export async function markala(db: Db, kullanici: Kullanici, g: MarkalaGovdesi): Promise<MarkalamaBirimi> {
  const t = await varOlanTanim(db, g.tanimId);
  const alanlar = (await s.alanlariOku(db, [t.id])).get(t.id) ?? [];
  if (!seriAlaniVarMi(alanlar)) throw gecersiz('Bu tanımda seri no taşıyan marka yok; seri verilmez.');
  const k = await seriKaynagi(db, t, g.uretimEmriId);
  const gun = tesisGunu(Date.now());
  const sira = await s.sayaciArtir(db, t.malzemeId, kapsamAnahtari(t.sayacKapsami, g.uretimEmriId, gun), t.baslangicSirasi);
  const seriNo = seriNoUret(t.seriSablonu, { parca: k.parca, emir: k.emirNo, gun }, sira);
  const iyi = g.sonuc === 'iyi';
  const birim = await kisitKorumali(
    { markalama_birimi_seri_tekil: 'Bu seri no daha önce verilmiş; şablonu ya da başlangıç sırasını denetleyin.' },
    () => s.birimEkle(db, {
      seriNo, tanimId: t.id, malzemeId: t.malzemeId, uretimEmriId: g.uretimEmriId, istasyonId: g.istasyonId, sira,
      durum: iyi ? 'saglam' : 'hurda',
    }, kullanici.id),
  );
  await s.olayYaz(db, birim.id, iyi ? 'markalandi' : 'hatali_markalama', kullanici.id);
  return birim;
}

// MRK-06: okutulan numara bu tanımda markalanmış olmalı; hurda birim doğrulanmaz. Yinelenen okutma kaydı değiştirmez.
export async function dogrula(db: Db, kullanici: Kullanici, g: DogrulaGovdesi): Promise<MarkalamaBirimi> {
  const birim = await s.seridenBirimOku(db, g.seriNo, true);
  if (birim === null || birim.tanimId !== g.tanimId) throw bulunamadi('Bu numara bu işte markalanmamış.');
  if (birim.durum === 'hurda') throw gecersiz('Hurdaya ayrılmış birim doğrulanmaz.');
  if (birim.dogrulamaZamani !== null) return birim;
  const yeni = await s.birimDogrulandi(db, birim.id);
  if (yeni === null) throw bulunamadi(BIRIM_YOK);
  await s.olayYaz(db, birim.id, 'dogrulandi', kullanici.id);
  return yeni;
}

const OLAY_ADI = { red: 'red', rework: 'rework', kabul: 'kabul', hurda: 'hurda' } as const;

export async function durumDegistir(db: Db, kullanici: Kullanici, id: number, g: DurumGovdesi): Promise<MarkalamaBirimi> {
  const nedenHatasi = hurdaNedeniHatasi(g.komut, g.hurdaNedeniId);
  if (nedenHatasi !== null) throw dogrulama(nedenHatasi, 'hurdaNedeniId');
  const birim = await s.birimOku(db, id, true);
  if (birim === null) throw bulunamadi(BIRIM_YOK);
  if (birim.surum !== g.surum) throw eskiSurum();
  const hedef = durumGecisi(birim.durum, g.komut);
  if (hedef === null) throw cakisma(`Birim "${durumAdi(birim.durum)}" durumundayken bu kayıt girilemez.`);
  if (g.hurdaNedeniId !== null && (await hurdaNedeniGetir(db, g.hurdaNedeniId)) === null) {
    throw dogrulama('Hurda nedeni bulunamadı.', 'hurdaNedeniId');
  }
  const yeni = await s.birimDurumuYaz(db, id, hedef);
  if (yeni === null) throw bulunamadi(BIRIM_YOK);
  await s.olayYaz(db, id, OLAY_ADI[g.komut], kullanici.id, { hurdaNedeniId: g.hurdaNedeniId, aciklama: g.aciklama });
  return yeni;
}

const DURUM_ADLARI: Readonly<Record<BirimDurumu, string>> = { saglam: 'sağlam', red: 'red', rework: 'rework', hurda: 'hurda' };
const durumAdi = (d: BirimDurumu): string => DURUM_ADLARI[d];

export async function birimGetir(db: Db, id: number): Promise<BirimAyrintisi> {
  const birim = await s.birimOku(db, id);
  if (birim === null) throw bulunamadi(BIRIM_YOK);
  const emir = await uretimEmriOzeti(db, birim.uretimEmriId);
  return { ...birim, emirNo: emir?.emirNo ?? null, olaylar: await s.olaylariOku(db, id) };
}

export async function birimler(
  db: Db, q: { seriNo?: string | undefined; emirId?: number | undefined; durum?: BirimDurumu | undefined },
): Promise<BirimlerCevabi> {
  return { birimler: await s.birimleriOku(db, { seriNo: q.seriNo ?? null, emirId: q.emirId ?? null, durum: q.durum ?? null }, BIRIM_LISTE_SINIRI) };
}

export async function emirOzeti(db: Db, emirId: number): Promise<EmirOzetiCevabi> {
  const satirlar = await s.emirSayilari(db, emirId);
  const sayilar = { saglam: 0, red: 0, rework: 0, hurda: 0 };
  let dogrulanan = 0;
  for (const r of satirlar) { sayilar[r.durum] = r.adet; dogrulanan += r.dogrulanan; }
  return { uretimEmriId: emirId, sayilar, dogrulanan };
}
