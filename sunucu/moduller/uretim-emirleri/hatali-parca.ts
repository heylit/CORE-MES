import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { HataliCevabi, HataliKaydi, HataliKaydiOzeti, HataliKarari } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { SABIT_HURDA_KODLARI, hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';
import { aktifIstasyonlar, isMerkeziIzinliMi, istasyonGetir, kisininIzinliIsMerkezleri, operasyonTipleri } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { baslatmaDenetle } from './baslatma-denetimi.ts';
import { emirBittiBildir } from './emir-olaylari.ts';
import {
  adimlariKoy, bekleyeniSil, bolmeDurumu, gkkHesabi, kilitliEmriBol, kolSonuysaKatil, siradakiIstasyonuYaz, ustuOnceKilitle,
} from './is-emri-servis.ts';
import type { EklenenAdim } from './is-emri-servis.ts';
import {
  ADIM_ACIK_DEGIL, ADIM_SECILMELI, EMIR_YOK, FIRMA_HATALISI_GKK_DISI, firmaHatalisiIhlali, HATALI_ADET, HATALI_ADIMSIZ, HATALI_EMIR_DURDU, HATALI_KALITE_ADIMI, HATALI_KALITE_TIPI_YOK, HATALI_KAYIT_YOK,
  HATALI_NEDEN_YOK, HATALI_OP_YERI, IS_EMRI_YOK, ISTASYONSUZ_ADIM, KAPSAM_DISI, TERMINAL_FASON, adetOnculleri, araOpNolari, calismaDurumu, hataliDurduMu, hataliIhlali,
  hataliKarariIhlali, hataliKararNotuIhlali, hataliYolu, kabulKarariMi, kaliteIstasyonuSec, kaliteTipiSec, sayimIhlali, siradakiIsEmri,
} from './kurallar.ts';
import { hurdaSayimiBildir, saglamSayimiBildir } from './sayim-olayi.ts';
import { emirBitir } from './servis.ts';
import * as s from './sorgular.ts';
import type { HataliKaydiSatiri, IsEmriSatiri } from './sorgular.ts';

const KALITE_ADIMI = 'Kalite kararı';
const REWORK_ADIMI = 'Rework (planlama seçecek)';

// Kararı bekleyen kalite adımı terminalden başlatılmaz: karar Kalite Merkezi'nden yazılır ve adımı kendisi kapatır.
baslatmaDenetle(async (db, o) => ((await s.acikKaliteAdimiMi(db, o.isEmriId)) ? { engel: HATALI_KALITE_ADIMI } : null));
// 1045 b: emrin kendisinde (4 a) bütün parça hurda ya da red olduysa sonraki adım başlamaz; emir durur, planlama yeniden başlatır ya da
// kapatır. Durma ayrı bir durum değildir: önceki adım bu kararın sağlamsız kalite adımıdır.
baslatmaDenetle(async (db, o) => ((await hataliDurdu(db, o.uretimEmriId, o.isEmriId)) ? { engel: HATALI_EMIR_DURDU } : null));

export async function hataliDurdu(db: Db, emirId: number, adimId?: number, adimlar?: readonly IsEmriSatiri[]): Promise<boolean> {
  const kayitlar = await s.hataliKayitlariGetir(db, { acik: false, emirId });
  if (!kayitlar.some((k) => k.karar === 'hurda' || k.karar === 'red')) return false;
  return hataliDurduMu(adimlar ?? (await s.isEmirleriGetir(db, [emirId])), kayitlar, adimId);
}

// Operatörün adımı: verilen, verilmezse emrin terminaldeki tek çalışan adımı (paralel adımda sorulur, servis.ts komutAdimi ile aynı).
function hataliAdim(hepsi: readonly IsEmriSatiri[], isEmriId: number | undefined): IsEmriSatiri {
  if (isEmriId !== undefined) {
    const adim = hepsi.find((i) => i.id === isEmriId);
    if (adim === undefined) throw bulunamadi(IS_EMRI_YOK);
    return adim;
  }
  const calisan = hepsi.filter((i) => i.durum === 'calisiyor' && i.fasonFirmaId === null);
  if (calisan.length > 1) throw cakisma(ADIM_SECILMELI);
  if (calisan[0] === undefined) throw cakisma(ADIM_ACIK_DEGIL);
  return calisan[0];
}

async function kapsamDenetle(db: Db, kisiId: number, istasyonId: number): Promise<void> {
  const istasyon = await istasyonGetir(db, istasyonId);
  if (istasyon !== null && !isMerkeziIzinliMi(await kisininIzinliIsMerkezleri(db, kisiId), istasyon.isMerkeziId)) throw yetkiYok(KAPSAM_DISI);
}

// 1034, 1036 a, 4 a: operatör hatalı nedeni ve adedi verir. Adet çalışan adımdan kola ayrılır (kalite kararı, rework, adımın tekrarı;
// kol sonraki adımda ana partiye katılır). Adımdaki bütün parça hatalıysa emir bölünemez: aynı adımlar ve tekrar hatalı adımın arkasına
// girer, hatalı adım sağlamsız biter. 1188: hatalı giriş adımda üretimdir ve adımın girdisini tüketir (adimTuketimi); sağlam sayılmaz,
// kaydı hatalı parça kaydındadır. 1207 c: Firmada hurda ve Firmadan gelmedi yalnız GKK adımında, dönmeyen adet kadar girer.
export async function hataliKaydet(db: Db, kisiId: number, emirId: number, g: HataliKaydi): Promise<HataliCevabi> {
  await ustuOnceKilitle(db, emirId);
  const e = await s.ustEmirBul(db, emirId, true);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (e.malzemeNo === null) throw cakisma(HATALI_ADIMSIZ);
  const hepsi = await s.isEmirleriGetir(db, [emirId]);
  const adim = hataliAdim(hepsi, g.isEmriId);
  if (adim.fasonFirmaId !== null) throw cakisma(TERMINAL_FASON);
  if (adim.istasyonId === null) throw cakisma(ISTASYONSUZ_ADIM);
  await kapsamDenetle(db, kisiId, adim.istasyonId);
  const calisma = adim.durum === 'calisiyor' ? sayimIhlali(e.durum, calismaDurumu((await s.adimSonOlayi(db, emirId, adim.id))?.olay ?? null)) : null;
  if (calisma !== null) throw cakisma(calisma);
  const neden = (await hurdaNedenleriniListele(db, { yalnizAktif: true })).find((n) => n.kod === g.hurdaNedeniKodu) ?? null;
  if (neden === null) throw dogrulama(HATALI_NEDEN_YOK, 'hurdaNedeniKodu');
  if (SABIT_HURDA_KODLARI.includes(neden.kod)) {
    const firma = firmaHatalisiIhlali(await gkkHesabi(db, hepsi, adim), g.adet);
    if (firma === FIRMA_HATALISI_GKK_DISI) throw dogrulama(firma, 'hurdaNedeniKodu');
    if (firma !== null) throw cakisma(firma);
  }
  const durum = await bolmeDurumu(db, e, hepsi, adim.sira);
  const ihlal = hataliIhlali(durum, adim.sira, g.adet, e.kaynakRotaRevizyonId !== null);
  if (ihlal === HATALI_ADET) throw dogrulama(ihlal, 'adet');
  if (ihlal !== null) throw cakisma(ihlal);
  const tip = kaliteTipiSec(await operasyonTipleri(db));
  if (tip === null) throw cakisma(HATALI_KALITE_TIPI_YOK);
  const kalite: EklenenAdim = {
    opNo: 0, ad: KALITE_ADIMI, operasyonTipiId: tip.id, istasyonId: kaliteIstasyonuSec(tip, await aktifIstasyonlar(db), adim.istasyonId),
    tur: 'ek', ekAciklama: `OP ${adim.opNo}: ${neden.ad}`, bagimlilik: 'bekleyen',
  };
  const rework: EklenenAdim = {
    opNo: 0, ad: REWORK_ADIMI, operasyonTipiId: adim.operasyonTipiId, istasyonId: null, tur: 'rework', ekAciklama: null, bagimlilik: 'bekleyen',
  };
  const sirali = [...hepsi].sort((a, b) => a.sira - b.sira);
  const onceki = sirali.filter((i) => i.sira < adim.sira).at(-1) ?? null;
  const sonraki = sirali.find((i) => i.sira > adim.sira) ?? null;
  // Kol, hatalı adımın ardılında (onu öncül alan ilk adım) katılır; dallı rotada sıradaki adım başka dalın adımı olabilir (B-3).
  const ardil = sirali.find((i) => i.sira > adim.sira && adetOnculleri(sirali, i).some((o) => o.id === adim.id)) ?? null;
  const yol = hataliYolu(durum, adim.sira, g.adet);
  let hedefEmirId = emirId;
  let idler: number[];
  let uyari: string | null = null;
  if (yol === 'kol') {
    const oplar = araOpNolari(onceki?.opNo ?? 0, adim.opNo, 2);
    if (oplar === null) throw cakisma(HATALI_OP_YERI);
    hedefEmirId = await kilitliEmriBol(db, kisiId, e, { adimSira: adim.sira, adet: g.adet, birlesmeOpNo: ardil?.opNo ?? null });
    idler = await adimlariKoy(db, kisiId, hedefEmirId, null, [{ ...kalite, opNo: oplar[0]! }, { ...rework, opNo: oplar[1]! }]);
    await siradakiIstasyonuYaz(db, hedefEmirId);
  } else {
    const oplar = araOpNolari(adim.opNo, sonraki?.opNo ?? null, 3);
    if (oplar === null) throw cakisma(HATALI_OP_YERI);
    // Kalite adımı bağımsızdır: hatalı adım sağlamsız biter, kalite kararı ona giren adede bağlı değildir.
    idler = await adimlariKoy(db, kisiId, emirId, adim.opNo, [
      { ...kalite, opNo: oplar[0]!, bagimlilik: 'bagimsiz' }, { ...rework, opNo: oplar[1]! },
      { ...rework, opNo: oplar[2]!, ad: adim.ad, ekAciklama: `OP ${adim.opNo} tekrarı`, kopya: adim },
    ]);
    uyari = (await emirBitir(db, kisiId, emirId, undefined, null, undefined, adim.id)).uyari;
  }
  const [kaliteId, reworkId, tekrarId] = idler;
  if (kaliteId === undefined || reworkId === undefined) throw new Error('Hatalı parça adımları eklenemedi.');
  const kayitId = await s.hataliKaydiEkle(db, {
    uretimEmriId: emirId, isEmriId: adim.id, hedefEmirId, kaliteIsEmriId: kaliteId, reworkIsEmriId: reworkId, tekrarIsEmriId: tekrarId ?? null,
    hurdaNedeniId: neden.id, adet: g.adet, aciklama: g.aciklama, kisiId, an: await s.anAl(db),
  });
  const hedef = await s.ustEmirBul(db, hedefEmirId);
  return { kayitId, hedefEmir: { id: hedefEmirId, emirNo: hedef?.emirNo ?? e.emirNo }, kolAcildi: yol === 'kol', uyari };
}

// 1034, 1038 a: kalite kararı Kalite Merkezi'nin formundan gelir (uç orada, işlemi burada da aranır). Karar kalite adımını kapatır:
// rework parçayı sağlam geçirir, rework adımı planlamayı bekler; hurda ve red parçayı ayırır, rework ve tekrar adımları kalkar.
// Kol böylece adımsız kalırsa üstüne katılır (planlı birleşme) ya da sağlamsız biter. Red stok olayı vermez: parça kalite kaydında kalır.
// 1211: kabul ve şartlı kabul parçayı sağlam geçirir ve rework ile tekrar adımlarını kaldırır: kol ana partiye katılır, emirde parça
// sıradaki adıma girer. Şartlı kabulde sağlam stokta şartlı yazılır.
export async function hataliKarariVer(
  db: Db, kullanici: Kullanici, kayitId: number, g: { karar: HataliKarari; not: string | null; ncrKimlik: string | null },
): Promise<{ kayit: HataliKaydiOzeti; uyari: string | null }> {
  if (!islemVarMi(kullanici, 'kalite-merkezi.onayla')) throw yetkiYok();
  const ilk = await s.hataliKaydiBul(db, kayitId);
  if (ilk === null) throw bulunamadi(HATALI_KAYIT_YOK);
  await ustuOnceKilitle(db, ilk.hedefEmirId);
  const hedef = await s.ustEmirBul(db, ilk.hedefEmirId, true);
  const kayit = await s.hataliKaydiBul(db, kayitId, true);
  if (kayit === null) throw bulunamadi(HATALI_KAYIT_YOK);
  const kalite = await s.isEmriBul(db, kayit.kaliteIsEmriId);
  const ihlal = hataliKarariIhlali(kayit, kalite, hedef);
  if (ihlal !== null || kalite === null || hedef === null) throw cakisma(ihlal ?? HATALI_KAYIT_YOK);
  const notIhlali = hataliKararNotuIhlali(g.karar, g.not);
  if (notIhlali !== null) throw dogrulama(notIhlali, 'not');
  const saglamGecer = g.karar === 'rework' || kabulKarariMi(g.karar);
  const istasyonId = kalite.istasyonId ?? (await s.isEmriBul(db, kayit.isEmriId))?.istasyonId;
  if (istasyonId == null) throw cakisma(ISTASYONSUZ_ADIM);
  const an = await s.anAl(db);
  const kisiId = kullanici.id;
  const sayim = { emirId: hedef.id, kisiId, istasyonId, adet: kayit.adet, duzeltme: false, an, refakatPartisiId: null, isEmriId: kalite.id };
  await s.isEmriBaslat(db, kalite.id, an);
  let uyari: string | null = null;
  if (saglamGecer) {
    await s.sayimEkle(db, { ...sayim, tur: 'saglam', hurdaNedeniId: null });
    uyari = await saglamSayimiBildir(db, {
      uretimEmriId: hedef.id, isEmriId: kalite.id, istasyonId, kisiId, fark: kayit.adet, refakatPartisiId: null,
      kaliteDurumu: g.karar === 'sartli_kabul' ? 'sartli' : 'serbest',
    });
  } else if (g.karar === 'hurda') {
    await s.sayimEkle(db, { ...sayim, tur: 'hurda', hurdaNedeniId: kayit.hurdaNedeniId });
    uyari = await hurdaSayimiBildir(db, {
      uretimEmriId: hedef.id, isEmriId: kalite.id, istasyonId, kisiId, hurdaNedeniId: kayit.hurdaNedeniId, fark: kayit.adet, refakatPartisiId: null,
    });
  } else {
    await s.sayimEkle(db, { ...sayim, tur: 'red', hurdaNedeniId: null });
  }
  await s.isEmriBitir(db, kalite.id, saglamGecer ? kayit.adet : 0, an);
  await s.hataliKarariYaz(db, kayit.id, { karar: g.karar, kisiId, an, not: g.not, ncrKimlik: g.ncrKimlik });
  if (g.karar !== 'rework') {
    uyari = [uyari, await ayrilaniKapat(db, kayit, hedef.id, kisiId, an, !saglamGecer)].filter((u) => u !== null).join(' ') || null;
  }
  else await siradakiIstasyonuYaz(db, hedef.id);
  const [ozet] = await ozetle(db, [(await s.hataliKaydiBul(db, kayit.id))!]);
  return { kayit: ozet!, uyari };
}

// Hurda, red, kabul ve şartlı kabul: kolda kalite adımından sonraki bekleyen adımlar, emirde rework ve tekrar adımları kalkar. durur:
// parça ayrıldı (hurda, red), emir sağlamsız kalabilir; kabulde parça sağlam geçtiği için emir durmaz.
async function ayrilaniKapat(db: Db, kayit: HataliKaydiSatiri, hedefId: number, kisiId: number, an: string, durur: boolean): Promise<string | null> {
  const kolda = hedefId !== kayit.uretimEmriId;
  const kalkan = kolda
    ? (await s.isEmirleriGetir(db, [hedefId])).filter((i) => i.durum === 'bekliyor').map((i) => i.id)
    : [kayit.reworkIsEmriId, kayit.tekrarIsEmriId].filter((id): id is number => id !== null);
  for (const id of kalkan) await bekleyeniSil(db, id);
  const kalan = await s.isEmirleriGetir(db, [hedefId]);
  for (const [n, i] of [...kalan].sort((a, b) => a.sira - b.sira).entries()) if (i.sira !== n + 1) await s.isEmriSirasiYaz(db, i.id, n + 1);
  if (siradakiIsEmri(kalan) !== null) {
    await siradakiIstasyonuYaz(db, hedefId);
    return kolda || !durur ? null : HATALI_EMIR_DURDU;
  }
  const e = await s.ustEmirBul(db, hedefId);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (await kolSonuysaKatil(db, e, kisiId)) return null;
  const son = [...kalan].sort((a, b) => b.sira - a.sira)[0];
  await s.fasonlaBitir(db, hedefId, son?.saglamAdet ?? 0, an);
  await emirBittiBildir(db, { uretimEmriId: hedefId, saglamAdet: son?.saglamAdet ?? 0, kisiId });
  return kolda || !durur ? null : HATALI_EMIR_DURDU;
}

async function ozetle(db: Db, satirlar: readonly HataliKaydiSatiri[]): Promise<HataliKaydiOzeti[]> {
  const nedenler = new Map((await hurdaNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n]));
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.flatMap((r) => (r.kararKisiId === null ? [r.kisiId] : [r.kisiId, r.kararKisiId])))]);
  return satirlar.map((r) => {
    const neden = nedenler.get(r.hurdaNedeniId);
    return {
      id: r.id, uretimEmri: { id: r.uretimEmriId, emirNo: r.emirNo, parcaNo: r.parcaNo, parcaAd: r.parcaAd },
      isEmri: { id: r.isEmriId, opNo: r.opNo, ad: r.isEmriAd }, hedefEmir: { id: r.hedefEmirId, emirNo: r.hedefEmirNo },
      kaliteIsEmriId: r.kaliteIsEmriId, reworkIsEmriId: r.reworkIsEmriId,
      hurdaNedeni: { id: r.hurdaNedeniId, kod: neden?.kod ?? `#${r.hurdaNedeniId}`, ad: neden?.ad ?? `#${r.hurdaNedeniId}` },
      adet: r.adet, aciklama: r.aciklama, kisi: { id: r.kisiId, ad: kisiler.get(r.kisiId) ?? null }, zaman: r.zaman, karar: r.karar,
      kararKisi: r.kararKisiId === null ? null : { id: r.kararKisiId, ad: kisiler.get(r.kararKisiId) ?? null },
      kararZamani: r.kararZamani, kararNotu: r.kararNotu, ncrKimlik: r.ncrKimlik,
    };
  });
}

export async function hataliKayitlari(db: Db, secim: { acik: boolean; emirId: number | null }): Promise<HataliKaydiOzeti[]> {
  return ozetle(db, await s.hataliKayitlariGetir(db, secim));
}

export async function hataliKaydi(db: Db, id: number): Promise<HataliKaydiOzeti | null> {
  const satir = await s.hataliKaydiBul(db, id);
  return satir === null ? null : (await ozetle(db, [satir]))[0] ?? null;
}
