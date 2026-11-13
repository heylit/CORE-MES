import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { KomutCevabi, IsEmriSartnamesi, IsEmriSartnameleriCevabi, ParametreDegerleri, RevizyonSartnameleriCevabi, SartnameCevabi, SartnameKapsami, SartnameOzeti, SartnameTaslakGovdesiCikti, SartnamelerCevabi, StandartCevabi } from '#paylasilan/sozlesme/rota.ts';
import { GEOMETRI_YUZEY_KATEGORILERI } from '#paylasilan/sozlesme/geometri.ts';
import type { GeometriYuzeyAdimi } from '../../geometri/disari.ts';
import { firmaAdlari, firmaOzetleri } from '../../musteri-tedarikci/disari.ts';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { adimliEmirAyrintisi } from '../../uretim-emirleri/disari.ts';
import type { IsEmriKopyalandiOlayi } from '../../uretim-emirleri/disari.ts';
import { adimDegerleriDenetle, cozulmusDegerler, ekAdimSartnameIhlali, eksikZorunlular, kapsamUyarMi, sartnameSablonuDenetle, yayinEksigi } from '../kurallar.ts';
import * as s from '../sorgular.ts';
import { SARTNAME_YOK, adimSabitleri, cevap, fasonAdimMi, komutIcinAl, revizyonuAl, sartnameBaglami, surumAyrintilari, yururlukteSurum } from './ortak.ts';
import { gecerliTalimat } from './okuma.ts';

async function sartnameOzetleri(db: Db, satirlar: readonly s.SartnameSatiri[]): Promise<SartnameOzeti[]> {
  const firmalar = await firmaAdlari(db, satirlar.flatMap((x) => (x.musteriFirmaId === null ? [] : [x.musteriFirmaId])));
  return satirlar.map((x) => ({
    id: x.id, kod: x.kod, ad: x.ad, kategoriId: x.kategoriId, kapsam: x.kapsam, kaynak: x.kaynak,
    musteriFirma: x.musteriFirmaId === null ? null : { id: x.musteriFirmaId, ad: firmalar.get(x.musteriFirmaId) ?? null },
    musteriBelgeNo: x.musteriBelgeNo, aktif: x.aktif, surum: x.surum,
    yururlukteSurumNo: x.yururlukteSurumNo, taslakSurumNo: x.taslakSurumNo, kullanim: x.kullanim,
  }));
}

export async function sartnameListesi(db: Db): Promise<SartnamelerCevabi> {
  return {
    kategoriler: await s.kategoriler(db),
    standartlar: await s.standartlar(db),
    sartnameler: await sartnameOzetleri(db, await s.sartnameleriOku(db, null)),
  };
}

export async function sartnameAyrintisi(db: Db, id: number): Promise<SartnameCevabi> {
  const x = (await s.sartnameleriOku(db, [id]))[0];
  if (!x) throw bulunamadi(SARTNAME_YOK);
  const surumler = await s.sartnameSurumleri(db, id);
  const ayrinti = await surumAyrintilari(db, surumler.map((v) => v.id));
  const [ozet] = await sartnameOzetleri(db, [x]);
  return { sartname: { ...ozet!, surumler: surumler.flatMap((v) => ayrinti.get(v.id) ?? []) } };
}

async function sartnameKomutIcinAl(db: Db, id: number, surum: number): Promise<s.SartnameSatiri> {
  const x = await s.sartnameKilitle(db, id);
  if (!x) throw bulunamadi(SARTNAME_YOK);
  if (x.surum !== surum) throw eskiSurum();
  return x;
}

const SARTNAME_KISITLARI = { rota_islem_sartnamesi_kod_tekil: { ileti: 'Bu kod başka bir şartnamede kullanılıyor.', alan: 'kod' } };

// Müşteri şartnamesinin karşılığı firma ve belge numarasıyla birlikte tutulur; firma müşteri olmalıdır.
async function musteriDenetle(db: Db, firmaId: number | null, belgeNo: string | null): Promise<'firma' | 'musteri'> {
  if ((firmaId === null) !== (belgeNo === null)) {
    throw dogrulama('Müşteri şartnamesinde firma ve belge numarası birlikte girilir.', firmaId === null ? 'musteriFirmaId' : 'musteriBelgeNo');
  }
  if (firmaId === null) return 'firma';
  const f = (await firmaOzetleri(db, [firmaId])).get(firmaId);
  if (!f || f.tur === 'tedarikci') throw dogrulama('Müşteri firma bulunamadı.', 'musteriFirmaId');
  return 'musteri';
}

export async function sartnameEkle(db: Db, kullanici: Kullanici, g: {
  kod: string; kategoriId: number; ad: string; kapsam: SartnameKapsami; musteriFirmaId: number | null; musteriBelgeNo: string | null;
}): Promise<SartnameCevabi> {
  if (!(await s.kategoriVarMi(db, g.kategoriId))) throw dogrulama('Kategori bulunamadı.', 'kategoriId');
  const kaynak = await musteriDenetle(db, g.musteriFirmaId, g.musteriBelgeNo);
  const id = await kisitKorumali(SARTNAME_KISITLARI, () => s.sartnameEkle(db, { ...g, kaynak }));
  await s.surumEkle(db, id, 1, kullanici.id, null);
  return sartnameAyrintisi(db, id);
}

// Kopya yürürlükteki sürümün içeriğiyle taslak olarak başlar: varsayılan şartnameden atölyenin ya da müşterinin şartnamesi türetilir.
export async function sartnameKopyala(db: Db, kullanici: Kullanici, id: number, g: {
  kod: string; ad: string; musteriFirmaId: number | null; musteriBelgeNo: string | null;
}): Promise<SartnameCevabi> {
  const kaynak = (await s.sartnameleriOku(db, [id]))[0];
  if (!kaynak) throw bulunamadi(SARTNAME_YOK);
  if (kaynak.yururlukteSurumId === null) throw gecersiz('Yayınlanmamış şartname kopyalanmaz.');
  const tur = await musteriDenetle(db, g.musteriFirmaId, g.musteriBelgeNo);
  const yeni = await kisitKorumali(SARTNAME_KISITLARI, () => s.sartnameEkle(db, { ...g, kategoriId: kaynak.kategoriId, kapsam: kaynak.kapsam, kaynak: tur }));
  await s.surumEkle(db, yeni, 1, kullanici.id, kaynak.yururlukteSurumId);
  return sartnameAyrintisi(db, yeni);
}

export async function sartnameKunyeKaydet(db: Db, id: number, g: { surum: number; ad: string; kategoriId: number }): Promise<SartnameCevabi> {
  await sartnameKomutIcinAl(db, id, g.surum);
  if (!(await s.kategoriVarMi(db, g.kategoriId))) throw dogrulama('Kategori bulunamadı.', 'kategoriId');
  await s.sartnameSurumArtir(db, id, 'ad = $2, kategori_id = $3', [g.ad, g.kategoriId]);
  return sartnameAyrintisi(db, id);
}

export async function sartnameSurumAc(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<SartnameCevabi> {
  const x = await sartnameKomutIcinAl(db, id, surum);
  if (x.taslakSurumId !== null) throw cakisma('Bu şartnamenin açık taslağı var; önce onu yayınlayın ya da silin.');
  if (x.yururlukteSurumId === null) throw gecersiz('Yürürlükte sürüm yok.');
  await s.surumEkle(db, id, (await s.enBuyukSurumNo(db, id)) + 1, kullanici.id, x.yururlukteSurumId);
  await s.sartnameSurumArtir(db, id);
  return sartnameAyrintisi(db, id);
}

const TASLAK_YOK = 'Taslak sürüm yok; önce yeni sürüm açın.';

export async function sartnameTaslakKaydet(db: Db, id: number, g: SartnameTaslakGovdesiCikti): Promise<SartnameCevabi> {
  const x = await sartnameKomutIcinAl(db, id, g.surum);
  if (x.taslakSurumId === null) throw gecersiz(TASLAK_YOK);
  const hata = sartnameSablonuDenetle(g.parametreler, g.atiflar);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
  const bilinen = new Set((await s.standartlariOku(db, g.atiflar.map((a) => a.standartId))).map((t) => t.id));
  const eksik = g.atiflar.findIndex((a) => !bilinen.has(a.standartId));
  if (eksik >= 0) throw dogrulama('Standart bulunamadı.', `atiflar.${eksik}.standartId`);
  await s.taslakIcerikYaz(db, x.taslakSurumId, g);
  await s.sartnameSurumArtir(db, id);
  return sartnameAyrintisi(db, id);
}

// Yayınlanan sürüm değişmez; emre sabitlenmiş eski sürüm de yerinde kalır, yeni emirler yeni sürümü alır.
export async function sartnameYayinla(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<SartnameCevabi> {
  const x = await sartnameKomutIcinAl(db, id, surum);
  if (x.taslakSurumId === null) throw gecersiz(TASLAK_YOK);
  const eksik = yayinEksigi(await s.surumParametreleri(db, [x.taslakSurumId]));
  if (eksik) throw gecersiz(eksik);
  await s.surumuYayinla(db, id, x.taslakSurumId, kullanici.id);
  await s.sartnameSurumArtir(db, id);
  return sartnameAyrintisi(db, id);
}

export async function sartnameTaslakSil(db: Db, id: number, surum: number): Promise<SartnameCevabi> {
  const x = await sartnameKomutIcinAl(db, id, surum);
  if (x.taslakSurumId === null) throw gecersiz(TASLAK_YOK);
  if (x.yururlukteSurumId === null) throw gecersiz('İlk sürüm silinmez; şartnameyi kullanımdan kaldırın.');
  await s.taslakSil(db, x.taslakSurumId);
  await s.sartnameSurumArtir(db, id);
  return sartnameAyrintisi(db, id);
}

// Kullanımdan kalkan şartname yeni adıma seçilmez ve onayda reddedilir; emre sabitlenmiş olan yerinde kalır.
export async function sartnameAktifYap(db: Db, id: number, surum: number, aktif: boolean): Promise<SartnameCevabi> {
  const x = await sartnameKomutIcinAl(db, id, surum);
  if (x.aktif === aktif) throw cakisma(aktif ? 'Şartname zaten kullanımda.' : 'Şartname zaten kullanımda değil.');
  await s.sartnameSurumArtir(db, id, 'aktif = $2', [aktif]);
  return sartnameAyrintisi(db, id);
}

export async function standartEkle(db: Db, g: { numara: string; kisaAciklama: string }): Promise<StandartCevabi> {
  const standart = await kisitKorumali(
    { rota_standart_atfi_numara_tekil: { ileti: 'Bu standart numarası kayıtlı.', alan: 'numara' } },
    () => s.standartEkle(db, g.numara, g.kisaAciklama),
  );
  return { standart };
}

export async function revizyonSartnameleri(db: Db, revizyonId: number): Promise<RevizyonSartnameleriCevabi> {
  revizyonuAl(await s.revizyonOku(db, revizyonId));
  const icerik = await s.icerikOku(db, revizyonId);
  const baglar = await s.adimSartnameleri(db, [revizyonId]);
  const b = await sartnameBaglami(db, baglar.map((x) => x.sartnameId));
  const ozetler = new Map((await sartnameOzetleri(db, [...b.ozet.values()])).map((o) => [o.id, o]));
  return {
    adimlar: icerik.adimlar.flatMap((a) => {
      const kendi = baglar.filter((x) => x.opNo === a.opNo);
      if (kendi.length === 0) return [];
      return [{
        opNo: a.opNo,
        sartnameler: kendi.flatMap((x) => {
          const ozet = ozetler.get(x.sartnameId);
          if (!ozet) return [];
          const yururlukte = yururlukteSurum(b, x.sartnameId);
          return [{
            sira: x.sira, sartname: ozet, degerler: x.degerler, yururlukte,
            eksikler: yururlukte ? eksikZorunlular(yururlukte.parametreler, cozulmusDegerler(yururlukte.parametreler, x.degerler)) : [],
            kapsamUyumsuz: !kapsamUyarMi(ozet.kapsam, fasonAdimMi(a)),
          }];
        }),
      }];
    }),
  };
}

// 3D Atölyesi yüzey işaretlemesinin işlem listesi (kart 2144, 2140-3): yürürlükteki revizyonun yüzey işlemi kategorisindeki (KPL, DNS,
// AST, BYA, YHZ) şartnameli adımları, adım ve şartname sırasıyla. Yürürlükte rota yoksa null. Yetki denetlemez; geometri rotayı ithal
// edemediği için bağı kablolama.ts kurar (ADR 0006 madde 6).
export async function yuzeyIslemiAdimlari(db: Db, malzemeId: number): Promise<GeometriYuzeyAdimi[] | null> {
  const revizyonId = await s.yururluktekiRevizyonId(db, malzemeId);
  if (revizyonId === null) return null;
  const baglar = await s.adimSartnameleri(db, [revizyonId]);
  if (baglar.length === 0) return [];
  const icerik = await s.icerikOku(db, revizyonId);
  const b = await sartnameBaglami(db, baglar.map((x) => x.sartnameId));
  const sartnameler = b.ozet;
  const kategori = new Map((await s.kategoriler(db)).map((k) => [k.id, k.kod]));
  const sonuc: GeometriYuzeyAdimi[] = [];
  for (const a of [...icerik.adimlar].sort((p, q) => p.sira - q.sira)) {
    const kendi = baglar.filter((x) => x.opNo === a.opNo);
    if (kendi.length === 0) continue;
    const talimatVar = (await gecerliTalimat(db, malzemeId, a.opNo)) !== null;
    for (const x of kendi) {
      const sartname = sartnameler.get(x.sartnameId);
      const kod = sartname === undefined ? undefined : kategori.get(sartname.kategoriId);
      const kategoriKodu = GEOMETRI_YUZEY_KATEGORILERI.find((k) => k === kod);
      if (sartname === undefined || kategoriKodu === undefined) continue;
      // 2144-3 b: kalınlık ve yoğunluk hesabı için yürürlükteki sürümün alanları, adımdaki değer (yoksa varsayılan) ile.
      const surum = yururlukteSurum(b, x.sartnameId);
      const degerler = surum === null ? {} : cozulmusDegerler(surum.parametreler, x.degerler);
      const parametreler = (surum?.parametreler ?? []).map((p) => ({ anahtar: p.anahtar, ad: p.ad, birim: p.birim, deger: degerler[p.anahtar] ?? null }));
      sonuc.push({
        opNo: a.opNo, adimAdi: a.ad, fason: fasonAdimMi(a), talimatVar,
        sartname: { id: sartname.id, kod: sartname.kod, ad: sartname.ad, kategoriKodu }, parametreler,
      });
    }
  }
  return sonuc;
}

// Adımın şartnameleri bütün olarak yazılır; yalnız taslak revizyonda (rota.revizyon-yaz). Yeni bağ kullanımdaki, yayınlanmış ve adımın
// kaynağına uyan şartnameyi alır; değerler yürürlükteki sürümün "adımda değişir" alanlarına göre denetlenir.
export async function adimSartnameleriKaydet(db: Db, kullanici: Kullanici, revizyonId: number, g: {
  surum: number; opNo: number; sartnameler: { sartnameId: number; degerler: ParametreDegerleri }[];
}): Promise<KomutCevabi> {
  await komutIcinAl(db, kullanici, revizyonId, 'kaydet', g.surum);
  const adim = (await s.icerikOku(db, revizyonId)).adimlar.find((a) => a.opNo === g.opNo);
  if (!adim) throw dogrulama('Adım bu revizyonda yok.', 'opNo');
  const onceki = new Set((await s.adimSartnameleri(db, [revizyonId])).filter((x) => x.opNo === g.opNo).map((x) => x.sartnameId));
  const b = await sartnameBaglami(db, g.sartnameler.map((x) => x.sartnameId));
  const gorulen = new Set<number>();
  for (const [i, x] of g.sartnameler.entries()) {
    const alan = `sartnameler.${i}`;
    if (gorulen.has(x.sartnameId)) throw dogrulama('Aynı şartname adıma iki kez eklenmez.', alan);
    gorulen.add(x.sartnameId);
    const ozet = b.ozet.get(x.sartnameId);
    if (!ozet) throw dogrulama(SARTNAME_YOK, `${alan}.sartnameId`);
    if (!ozet.aktif && !onceki.has(x.sartnameId)) throw dogrulama(`${ozet.kod}: şartname kullanımda değil.`, `${alan}.sartnameId`);
    if (!kapsamUyarMi(ozet.kapsam, fasonAdimMi(adim))) {
      throw dogrulama(`${ozet.kod}: ${ozet.kapsam === 'fason' ? 'yalnız fason adıma' : 'yalnız iç adıma'} eklenir.`, `${alan}.sartnameId`);
    }
    const yururlukte = yururlukteSurum(b, x.sartnameId);
    if (!yururlukte) throw dogrulama(`${ozet.kod}: yayınlanmış sürümü olmayan şartname seçilmez.`, `${alan}.sartnameId`);
    const hata = adimDegerleriDenetle(yururlukte.parametreler, x.degerler);
    if (hata) throw dogrulama(hata, `${alan}.degerler`);
  }
  await s.adimSartnameleriYaz(db, revizyonId, g.opNo, g.sartnameler);
  return cevap(revizyonId, 'taslak', await s.duzenlemeYaz(db, revizyonId, kullanici.id));
}

// 1203 b: bölünen partinin kolu ve hatalı adımın tekrarı kaynak adımın kopyasıdır. Rota adımının kopyası emrin rota revizyonundaki
// bağları bugünkü yürürlükteki sürümle yeniden sabitler; sabitlenemezse kaynağın sabitini alır, çünkü bölme ve terminaldeki hatalı
// kaydı şartname yüzünden durmamalıdır. Ek adımın (rework, tamir, ek) rotada bağı yoktur; kopyası kaynağın sabitini alır.
export async function isEmriKopyalandiYansit(db: Db, olay: IsEmriKopyalandiOlayi): Promise<void> {
  if (olay.isEmirleri.length === 0) return;
  const { kaynakRotaRevizyonId } = await adimliEmirAyrintisi(db, olay.uretimEmriId);
  const baglar = kaynakRotaRevizyonId === null ? [] : await s.adimSartnameleri(db, [kaynakRotaRevizyonId]);
  const b = await sartnameBaglami(db, baglar.map((x) => x.sartnameId));
  for (const k of olay.isEmirleri) {
    await s.isEmriEkipmaniniKopyala(db, k.kaynakIsEmriId, k.yeniIsEmriId);
    const r = k.rotaAdimi ? adimSabitleri(b, baglar, k.kaynakOpNo) : null;
    if (r !== null && !('hata' in r)) {
      if (r.sabitler.length > 0) await s.isEmriSabitle(db, k.yeniIsEmriId, r.sabitler, olay.kisiId);
    } else {
      await s.isEmriSabitiniKopyala(db, k.kaynakIsEmriId, k.yeniIsEmriId, olay.kisiId);
    }
  }
}

export async function isEmriSartnameleri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, IsEmriSartnamesi[]>> {
  const tekil = [...new Set(isEmriIdleri)];
  if (tekil.length === 0) return new Map();
  const satirlar = await s.isEmriSabitleri(db, tekil);
  const surum = await surumAyrintilari(db, satirlar.map((x) => x.surumId));
  const ad = await kisiAdlari(db, satirlar.map((x) => x.sabitleyenKisiId));
  const sonuc = new Map<number, IsEmriSartnamesi[]>();
  for (const x of satirlar) {
    const v = surum.get(x.surumId);
    if (!v) continue;
    const liste = sonuc.get(x.isEmriId) ?? [];
    liste.push({
      sira: x.sira, sartname: { id: x.sartnameId, kod: x.kod, ad: x.ad }, surum: v, degerler: x.degerler,
      sabitleyen: { id: x.sabitleyenKisiId, ad: ad.get(x.sabitleyenKisiId) ?? null }, sabitlenme: x.sabitlenme,
    });
    sonuc.set(x.isEmriId, liste);
  }
  return sonuc;
}

export async function isEmriSartnameleriCevabi(db: Db, isEmriIdleri: readonly number[]): Promise<IsEmriSartnameleriCevabi> {
  const harita = await isEmriSartnameleri(db, isEmriIdleri);
  return { isEmirleri: [...new Set(isEmriIdleri)].map((id) => ({ isEmriId: id, sartnameler: harita.get(id) ?? [] })) };
}

// 1034: planlama hatalı parçanın rework adımını (ya da kola koyduğu tamir veya ek adımı) doldurunca şartnamesini burada seçer. Değerler
// emir açılışındaki gibi yürürlükteki sürümle çözülür ve sabitlenir; liste bütün olarak yazılır (boş liste sabitleri kaldırır). Emir
// sürümü denetlenir (bu komut emri değiştirmez, sürümü artırmaz); aynı iş emrine iki eşzamanlı komut sıraya girer.
export async function ekAdimSartnameleriSabitle(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: {
  surum: number; sartnameler: { sartnameId: number; degerler: ParametreDegerleri }[];
}): Promise<IsEmriSartnameleriCevabi> {
  await s.isEmriSabitKilidi(db, isEmriId);
  const e = await adimliEmirAyrintisi(db, emirId);
  if (e.surum !== g.surum) throw eskiSurum();
  const adim = e.isEmirleri.find((i) => i.id === isEmriId);
  if (!adim) throw bulunamadi('İş emri bu emirde yok.');
  const ihlal = ekAdimSartnameIhlali(e, { tur: adim.tur ?? 'rota', durum: adim.durum });
  if (ihlal) throw cakisma(ihlal);
  const fason = adim.kaynak?.tur === 'fason';
  const b = await sartnameBaglami(db, g.sartnameler.map((x) => x.sartnameId));
  const gorulen = new Set<number>();
  const sabitler = g.sartnameler.map((x, i) => {
    const alan = `sartnameler.${i}`;
    if (gorulen.has(x.sartnameId)) throw dogrulama('Aynı şartname adıma iki kez eklenmez.', alan);
    gorulen.add(x.sartnameId);
    const ozet = b.ozet.get(x.sartnameId);
    if (!ozet) throw dogrulama(SARTNAME_YOK, `${alan}.sartnameId`);
    if (!ozet.aktif) throw dogrulama(`${ozet.kod}: şartname kullanımda değil.`, `${alan}.sartnameId`);
    if (!kapsamUyarMi(ozet.kapsam, fason)) throw dogrulama(`${ozet.kod}: ${ozet.kapsam === 'fason' ? 'yalnız fason adıma' : 'yalnız iç adıma'} eklenir.`, `${alan}.sartnameId`);
    const yururlukte = yururlukteSurum(b, x.sartnameId);
    if (!yururlukte) throw dogrulama(`${ozet.kod}: yayınlanmış sürümü olmayan şartname seçilmez.`, `${alan}.sartnameId`);
    const hata = adimDegerleriDenetle(yururlukte.parametreler, x.degerler);
    if (hata) throw dogrulama(hata, `${alan}.degerler`);
    const degerler = cozulmusDegerler(yururlukte.parametreler, x.degerler);
    const eksik = eksikZorunlular(yururlukte.parametreler, degerler);
    if (eksik.length > 0) throw dogrulama(`${ozet.kod}: zorunlu alan boş (${eksik.join(', ')}).`, `${alan}.degerler`);
    return { surumId: yururlukte.id, degerler };
  });
  await s.isEmriSabitleriniSil(db, [isEmriId]);
  if (sabitler.length > 0) await s.isEmriSabitle(db, isEmriId, sabitler, kullanici.id);
  return isEmriSartnameleriCevabi(db, [isEmriId]);
}
