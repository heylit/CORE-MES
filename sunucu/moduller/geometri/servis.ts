import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  GeometriAnalizCevabi, GeometriDosyaTuru, GeometriDurumu, GeometriHamCevabi, GeometriModelSatiri, GeometriMontajCevabi, GeometriOzellikCevabi, GeometriSaglikCevabi,
  GeometriIsoGrubu, GeometriKalibrasyonCevabi, GeometriSureCevabi, GeometriTalasliAdim, HamStokFormu, GeometriYuzeyAdimi, GeometriYuzeyCevabi, GeometriYuzeyKaydetGovdesi,
} from '#paylasilan/sozlesme/geometri.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { alinanRevizyonDosyasi, kayitlaraBagliTaslakBelgeler, kayitlaraBagliYayindakiBelgeler, taslagiGorur } from '../belge-merkezi/disari.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { hammaddeKaliteleri, hammaddeStokOlculeri, kesmeKatsayisi, makineIsMiliGucu, malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  bicimDenetimi, bilesenListesi, disTablosuOku, donelEksen, DOSYA_EN_BUYUK_BAYT, enAzHam, enYakinKart, formGerekleri, HAM_KESME_VARSAYILAN_MM, hamGeregi, hataMetniKisalt, hataSonrasiDurum, ILETILER, islemAnahtari, MOTOR, ozellikGruplari, saglikDegerlendir, STOK_FORMLARI,
  kalibrasyonHesapla, kalibreAralik, kalibreOrta, KALIBRASYON_ESIGI, malzemeBasinaModel, KALIBRASYON_ILETILERI, kienzleKc, rotaToplamlari, stokEslestir, SURE_HM_MM, SURE_ISO, SURE_TEZGAH_GUCU_KW, sureTahmini, TUR_BASINA_EN_COK_IS, YUZ_MOTORU, YUZEY_ILETILERI, yuzeyAlanlari, yuzeyKaydiDenetle, yuzleriEslestir,
} from './kurallar.ts';
import type { KalibrasyonCifti, KalibrasyonSonucu, YuzeyIsaretGirdisi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { GeometriSureci } from './surec.ts';

const DOSYA_TURLERI: readonly GeometriDosyaTuru[] = ['step', 'iges'];
const geometriTuruMu = (t: string): t is GeometriDosyaTuru => (DOSYA_TURLERI as readonly string[]).includes(t);

interface Model {
  malzemeNo: number;
  belgeId: number;
  belgeAdi: string;
  revizyonId: number;
  harf: string;
  // 2138-2: gösterilen revizyon kodu; harf merkezin iç sırasıdır, gösterilmez.
  revKodu: string | null;
  ozet: string;
  dosyaTuru: GeometriDosyaTuru;
  kapak: boolean;
}

// Malzeme kartına bağlı, yayındaki STEP/IGES modeller. Aynı belge iki karta bağlıysa iki satırdır (iş ve analiz revizyon başına tektir).
async function modeller(db: Db): Promise<Model[]> {
  const sonuc: Model[] = [];
  for (const [malzemeNo, belgeler] of await kayitlaraBagliYayindakiBelgeler(db, 'malzemeler', DOSYA_TURLERI)) {
    for (const b of belgeler) {
      if (!geometriTuruMu(b.dosyaTuru)) continue;
      sonuc.push({ malzemeNo, belgeId: b.id, belgeAdi: b.ad, revizyonId: b.revizyonId, harf: b.harf, revKodu: b.revKodu, ozet: b.ozet, dosyaTuru: b.dosyaTuru, kapak: b.kapak });
    }
  }
  return sonuc;
}

async function model(db: Db, revizyonId: number): Promise<Model> {
  const m = (await modeller(db)).find((x) => x.revizyonId === revizyonId);
  if (m === undefined) throw bulunamadi(ILETILER.modelYok);
  return m;
}

const durumu = (is: sorgular.IsSatiri | undefined | null): GeometriDurumu => is?.durum ?? 'yok';
const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR');

// Malzeme kartına bağlı, hiç yayınlanmamış STEP/IGES modeller (3028 b). Ölçülmez; yalnız listede "Taslak" satırıdır.
async function taslakModeller(db: Db): Promise<Omit<Model, 'ozet' | 'kapak'>[]> {
  const sonuc: Omit<Model, 'ozet' | 'kapak'>[] = [];
  for (const [malzemeNo, belgeler] of await kayitlaraBagliTaslakBelgeler(db, 'malzemeler', DOSYA_TURLERI)) {
    for (const b of belgeler) {
      if (!geometriTuruMu(b.dosyaTuru)) continue;
      sonuc.push({ malzemeNo, belgeId: b.id, belgeAdi: b.ad, revizyonId: b.revizyonId, harf: b.harf, revKodu: b.revKodu, dosyaTuru: b.dosyaTuru });
    }
  }
  return sonuc;
}

// Taslak satırlar yalnız yazana ve yayıncıya döner (1885 b); durum süzgecinde yer almazlar, listenin başındadırlar.
export async function modelListesi(
  db: Db, kullanici: Kullanici, s: { sayfa: number; sayfaBoyu?: number | undefined; ara?: string | undefined; durum?: GeometriDurumu | undefined },
): Promise<SayfaliListe<GeometriModelSatiri>> {
  const liste = await modeller(db);
  const taslaklar = s.durum === undefined && taslagiGorur(kullanici) ? await taslakModeller(db) : [];
  const malzemeler = await malzemeOzetleri(db, [...liste, ...taslaklar].map((m) => m.malzemeNo));
  const isler = new Map((await sorgular.isler(db, [...new Set(liste.map((m) => m.revizyonId))])).map((i) => [i.revizyonId, i]));
  const ara = s.ara ? kucuk(s.ara) : null;
  const satirlar: GeometriModelSatiri[] = [];
  for (const m of liste) {
    const mz = malzemeler.get(m.malzemeNo);
    if (mz === undefined) continue;
    const is = isler.get(m.revizyonId);
    const satir: GeometriModelSatiri = {
      malzemeNo: m.malzemeNo, malzemeKodu: mz.kod, malzemeAdi: mz.ad, belgeId: m.belgeId, belgeAdi: m.belgeAdi, revizyonId: m.revizyonId,
      harf: m.harf, revKodu: m.revKodu, dosyaTuru: m.dosyaTuru, durum: durumu(is), hataMetni: is?.hataMetni ?? null, yayinda: true,
    };
    if (s.durum !== undefined && satir.durum !== s.durum) continue;
    if (ara !== null && ![satir.malzemeKodu, satir.malzemeAdi ?? '', satir.belgeAdi].some((x) => kucuk(x).includes(ara))) continue;
    satirlar.push(satir);
  }
  const sira = (a: GeometriModelSatiri, b: GeometriModelSatiri): number => a.malzemeKodu.localeCompare(b.malzemeKodu, 'tr') || a.revizyonId - b.revizyonId;
  satirlar.sort(sira);
  const taslakSatirlar: GeometriModelSatiri[] = [];
  for (const m of taslaklar) {
    const mz = malzemeler.get(m.malzemeNo);
    if (mz === undefined) continue;
    const satir: GeometriModelSatiri = {
      malzemeNo: m.malzemeNo, malzemeKodu: mz.kod, malzemeAdi: mz.ad, belgeId: m.belgeId, belgeAdi: m.belgeAdi, revizyonId: m.revizyonId,
      harf: m.harf, revKodu: m.revKodu, dosyaTuru: m.dosyaTuru, durum: 'yok', hataMetni: null, yayinda: false,
    };
    if (ara !== null && ![satir.malzemeKodu, satir.malzemeAdi ?? '', satir.belgeAdi].some((x) => kucuk(x).includes(ara))) continue;
    taslakSatirlar.push(satir);
  }
  satirlar.unshift(...taslakSatirlar.sort(sira));
  return sayfaliListe(s, { say: () => Promise.resolve(satirlar.length), satirlar: (d) => Promise.resolve(satirlar.slice(d.atla, d.atla + d.sinir)) });
}

async function analizCevabi(db: Db, m: Model): Promise<GeometriAnalizCevabi> {
  const is = await sorgular.is(db, m.revizyonId);
  const a = await sorgular.analiz(db, m.revizyonId);
  const yuzSatirlari = a === null ? [] : await sorgular.yuzOzeti(db, m.revizyonId);
  return {
    revizyonId: m.revizyonId, belgeId: m.belgeId, dosyaTuru: m.dosyaTuru, durum: durumu(is),
    is: is === null ? null : {
      durum: is.durum, denemeSayisi: is.denemeSayisi, hataMetni: is.hataMetni, olusturma: is.olusturma, baslama: is.baslama, bitis: is.bitis, surum: is.surum,
    },
    analiz: a === null || a.ozet !== m.ozet ? null : {
      motor: a.motor, kutu: { x: a.kutuX, y: a.kutuY, z: a.kutuZ },
      obb: { a: a.obbA, b: a.obbB, c: a.obbC, cap: a.capMm, yon: [0, 1, 2].map((i) => a.obbYon.slice(i * 3, i * 3 + 3)) },
      hacimMm3: a.hacimMm3, alanMm2: a.alanMm2, govdeSayisi: a.govdeSayisi, kapali: a.kapali, ucgenSayisi: a.ucgenSayisi,
      hesapSuresiMs: a.hesapSuresiMs, hesapZamani: a.hesapZamani,
      yuzler: yuzSatirlari.length === 0 ? null : {
        motor: yuzSatirlari[0]!.motor,
        toplam: yuzSatirlari.reduce((t, y) => t + y.sayi, 0),
        sayilar: Object.fromEntries(yuzSatirlari.map((y) => [y.tur, y.sayi])),
      },
    },
  };
}

// Bağlantıdaki revizyon listede yoksa (yeni revizyon yayınlandı) aynı belgenin listedeki revizyonu. Belge kimliği kuyruğun kaydındandır;
// belge arşivdeyse ya da bağı kalktıysa null.
export async function guncelRevizyon(db: Db, revizyonId: number): Promise<{ revizyonId: number | null }> {
  const liste = await modeller(db);
  if (liste.some((m) => m.revizyonId === revizyonId)) return { revizyonId };
  const is = await sorgular.is(db, revizyonId);
  const guncel = is === null ? undefined : liste.find((m) => m.belgeId === is.belgeId);
  return { revizyonId: guncel?.revizyonId ?? null };
}

export async function analizOku(db: Db, revizyonId: number): Promise<GeometriAnalizCevabi> {
  return analizCevabi(db, await model(db, revizyonId));
}

// Tanınan özellikler (kart 2044). Analiz yoksa ya da başka içeriğe aitse, ya da yüzler okunamadıysa ozellikler null; yüzler var ama
// özellik yoksa boş liste. Yalnız öneridir.
export async function ozellikOku(db: Db, revizyonId: number): Promise<GeometriOzellikCevabi> {
  return ozellikCevabi(db, await model(db, revizyonId));
}

async function ozellikCevabi(db: Db, m: Model): Promise<GeometriOzellikCevabi> {
  const revizyonId = m.revizyonId;
  const a = await sorgular.analiz(db, revizyonId);
  if (a === null || a.ozet !== m.ozet || (await sorgular.yuzOzeti(db, revizyonId)).length === 0) return { revizyonId, motor: null, ozellikler: null, gruplar: null };
  const ozellikler = (await sorgular.ozellikler(db, revizyonId)).map(({ motor: _m, ...o }) => o);
  // 3281-1: gruplar her okumada hesaplanır; diş tablosu sistem ayarından (boşsa yerleşik).
  const tablo = disTablosuOku(await sistemAyariOku(db, 'geometri.dis-matkap-tablosu'));
  return { revizyonId, motor: YUZ_MOTORU, ozellikler, gruplar: ozellikGruplari(ozellikler, tablo) };
}

// Montaj ağacı ve bileşen listesi (kart 2109, M1). Bileşen listesi kayıttan her okumada hesaplanır (saf kural); yalnız öneridir.
export async function montajOku(db: Db, revizyonId: number): Promise<GeometriMontajCevabi> {
  const m = await model(db, revizyonId);
  const bos = { revizyonId, oneri: true as const, motor: null, montaj: null, dugumler: null, bilesenler: null };
  const a = await sorgular.analiz(db, revizyonId);
  if (a === null || a.ozet !== m.ozet) return { ...bos, neden: 'analiz-yok' };
  const t = await sorgular.montaj(db, revizyonId);
  if (t === null) return { ...bos, neden: 'montaj-yok' };
  return {
    revizyonId, oneri: true, motor: t.motor, montaj: t.dugumler.some((d) => d.tur === 'montaj'),
    dugumler: t.dugumler, bilesenler: bilesenListesi(t.dugumler), neden: null,
  };
}

// Dosya sağlık raporu (kart 2143): ölçüm kayıttan, değerlendirme her okumada saf kuraldan. Analiz başka içeriğe aitse 'analiz-yok';
// B-rep okunmadıysa (eski analiz ya da okunamayan dosya) 'saglik-yok'. Yalnız uyarıdır.
export async function saglikOku(db: Db, revizyonId: number): Promise<GeometriSaglikCevabi> {
  const m = await model(db, revizyonId);
  const bos = {
    revizyonId, oneri: true as const, motor: null, durum: null, acikKenarSayisi: null, acikSinirSayisi: null, gecersizYuzSayisi: null, sekilGecerli: null,
    enBuyukToleransMm: null, kucukKenarSayisi: null, dosyaBirimi: null, kapali: null, bulgular: [], hesapZamani: null,
  };
  const a = await sorgular.analiz(db, revizyonId);
  if (a === null || a.ozet !== m.ozet) return { ...bos, neden: 'analiz-yok' };
  const s = await sorgular.saglik(db, revizyonId);
  if (s === null) return { ...bos, kapali: a.kapali, neden: 'saglik-yok' };
  const { motor, hesapZamani, ...olcum } = s;
  const { durum, bulgular } = saglikDegerlendir(olcum, { kapali: a.kapali, enBuyukOlcuMm: a.obbA });
  return { revizyonId, oneri: true, motor, durum, ...olcum, kapali: a.kapali, bulgular, hesapZamani, neden: null };
}

// Pay sorgudan, yoksa sistem ayarından; ikisi de yoksa 0 ve kaynak 'yok' (ekran söyler). Stok listesi aktif hammadde kartları (1469 a).
// 3321-1: dönme ekseni yüzlerden (yüz özeti yoksa eski kural), kesme payı sorgudan ya da 3 mm; form başına en az ölçü ve en yakın kart.
// Malzemeler sihirbazı ve CNC Kurulum aynı sonucu kullanır (tek hesap).
export async function hamOnerisi(
  db: Db, revizyonId: number, sorgu: { payMm?: number | undefined; kalite?: string | undefined; kesmeMm?: number | undefined },
): Promise<GeometriHamCevabi> {
  return hamCevabi(db, await model(db, revizyonId), sorgu);
}

// Kalibrasyon bütün parçalarda döner: stok listesi bir kez okunur (onYuk).
async function hamCevabi(
  db: Db, m: Model, sorgu: { payMm?: number | undefined; kalite?: string | undefined; kesmeMm?: number | undefined },
  onYuk?: { stokListesi: Awaited<ReturnType<typeof hammaddeStokOlculeri>> },
): Promise<GeometriHamCevabi> {
  const revizyonId = m.revizyonId;
  const ayar = sorgu.payMm === undefined ? await sistemAyariOku(db, 'geometri.ham-payi-mm') : null;
  const payMm = sorgu.payMm ?? ayar ?? 0;
  const payKaynagi = sorgu.payMm !== undefined ? 'istek' : ayar !== null ? 'ayar' : 'yok';
  const kesmeMm = sorgu.kesmeMm ?? HAM_KESME_VARSAYILAN_MM;
  const c = await analizCevabi(db, m);
  const bos: Omit<GeometriHamCevabi, 'neden'> = { revizyonId, payMm, payKaynagi, kesmeMm, enAz: null, oneriler: [], kaliteler: [], donel: null, formlar: [], rotaMalzemesi: null };
  if (c.analiz === null) return { ...bos, neden: 'analiz-yok' };
  const enAz = enAzHam(c.analiz.obb, payMm);
  const donel = donelEksen(c.analiz.obb, await sorgular.yuzler(db, revizyonId));
  const g = hamGeregi(c.analiz.obb, payMm, kesmeMm, donel);
  const liste = onYuk?.stokListesi ?? await hammaddeStokOlculeri(db, STOK_FORMLARI);
  const kaliteler = [...new Set(liste.flatMap((k) => (k.kalite === null ? [] : [k.kalite])))].sort((x, y) => x.localeCompare(y, 'tr'));
  const adaylar = sorgu.kalite === undefined ? liste : liste.filter((k) => k.kalite === sorgu.kalite);
  const oneriler = stokEslestir(g, adaylar);
  const formlar = formGerekleri(g).map((f) => ({
    ...f, enYakinKart: oneriler.some((o) => o.form === f.form) ? null : enYakinKart(g, f, adaylar),
  }));
  const neden = oneriler.length > 0 ? null : adaylar.length === 0 ? 'stok-listesi-yok' : 'sigan-yok';
  return { ...bos, enAz, oneriler, kaliteler, donel, formlar, neden };
}

// Talaştan kaba süre (kart 3278; 1195 c): yalnız ekranda gösterilen kalibresiz aralık; rotaya ve plana yazılmaz. Ham, ham önerisinin
// ilk (en az talaşlı) stok kartıdır; yoksa döndürülmüş kutu + pay. Parça hacmi ağ hacmidir (kapalı ağda; yaklaşık). Delikler özellik
// tanımasından; tanıma yoksa delik kalemi yazılmaz ve ozellikOkundu false döner.
// 3278 D: süre kartının rota karşılaştırması. Talaşlı adımları rota verir (yalnız okuma, rotaya yazılmaz); bağı kablolama.ts kurar
// (ADR 0006 madde 6). Çözücü malzemenin yürürlükteki rotasındaki talaşlı adımları verir; rota yoksa null. Yetki denetlemez.
// 3321-2: adımın makinesi (kaynak makineyse) ve bileşen kartları; süre kartı tezgâh gücünü ve varsayılan malzemeyi bunlardan bulur.
export type TalasliRotaAdimi = GeometriTalasliAdim & { makineId: number | null; makineKod: string | null; islemTuru: string | null; hammaddeNolari: number[] };
export type TalasliAdimCozucusu = (db: Db, malzemeNo: number) => Promise<TalasliRotaAdimi[] | null>;
let talasliAdimlar: TalasliAdimCozucusu | null = null;
// Önceki çözücüyü döner (test kurup geri koyar).
export function talasliAdimCozucusuKaydet(cozucu: TalasliAdimCozucusu | null): TalasliAdimCozucusu | null {
  const onceki = talasliAdimlar;
  talasliAdimlar = cozucu;
  return onceki;
}

async function talasliRotaOku(db: Db, malzemeNo: number): Promise<TalasliRotaAdimi[] | null | 'bagli-degil'> {
  return talasliAdimlar === null ? 'bagli-degil' : talasliAdimlar(db, malzemeNo);
}

function sureRotasi(adimlar: TalasliRotaAdimi[] | null | 'bagli-degil'): GeometriSureCevabi['rota'] {
  const bos = { adimlar: [], islemToplamDk: null, olcumToplamDk: null, eksik: false };
  if (adimlar === 'bagli-degil') return { durum: 'rota-bagli-degil', ...bos };
  if (adimlar === null) return { durum: 'rota-yok', ...bos };
  const yalin = adimlar.map(({ opNo, ad, islemDk, olcumOrtancaDk, olcumAdedi }) => ({ opNo, ad, islemDk, olcumOrtancaDk, olcumAdedi }));
  return { durum: 'bagli', ...rotaToplamlari(yalin) };
}

// 3321-2: varsayılan malzeme ilk talaşlı adımın (sıra düzeninde) ilk aktif hammadde girdisidir; tezgâh gücü ilk talaşlı adımın makinesinin
// demirbaş kartından (makine yoksa ya da kartta güç yoksa sıradaki adıma bakılmaz: tahmin parçanın ana tezgâhıdır, VARSAYIM).
async function rotaMalzemesi(db: Db, adimlar: TalasliRotaAdimi[] | null | 'bagli-degil'): Promise<GeometriHamCevabi['rotaMalzemesi']> {
  if (adimlar === 'bagli-degil' || adimlar === null) return null;
  const kartlar = new Map((await hammaddeKaliteleri(db, [...new Set(adimlar.flatMap((a) => a.hammaddeNolari))])).map((k) => [k.no, k]));
  for (const a of adimlar) {
    const k = a.hammaddeNolari.map((no) => kartlar.get(no)).find((x) => x !== undefined);
    if (k === undefined) continue;
    const sinif = k.aile !== null && k.sinif !== null ? `${k.aile}/${k.sinif}` : null;
    return { malzemeNo: k.no, kod: k.kod, kalite: k.kalite, aile: k.aile, sinif, kaliteKodu: k.kaliteKodu, opNo: a.opNo };
  }
  return null;
}

async function tezgahGucu(db: Db, adimlar: TalasliRotaAdimi[] | null | 'bagli-degil'): Promise<GeometriSureCevabi['tezgah']> {
  const ilk = adimlar === 'bagli-degil' || adimlar === null ? undefined : adimlar[0];
  const guc = ilk?.makineId == null ? null : await makineIsMiliGucu(db, ilk.makineId);
  return guc === null
    ? { gucKw: SURE_TEZGAH_GUCU_KW, kaynak: 'varsayilan', makineKod: ilk?.makineKod ?? null }
    : { gucKw: guc, kaynak: 'demirbas', makineKod: ilk?.makineKod ?? null };
}

// Ham önerisi ucu (3D Atölyesi Ham kartı): hamOnerisi ve rotadan varsayılan malzeme. Sihirbaz ve CNC Kurulum rotayı okumaz.
export async function hamOnerisiRotayla(
  db: Db, revizyonId: number, sorgu: { payMm?: number | undefined; kalite?: string | undefined; kesmeMm?: number | undefined },
): Promise<GeometriHamCevabi> {
  const ham = await hamOnerisi(db, revizyonId, sorgu);
  if (ham.neden === 'analiz-yok') return ham;
  return { ...ham, rotaMalzemesi: await rotaMalzemesi(db, await talasliRotaOku(db, (await model(db, revizyonId)).malzemeNo)) };
}

type SureSorgusu = { payMm?: number | undefined; kalite?: string | undefined; kesmeMm?: number | undefined; iso?: GeometriIsoGrubu | undefined; sinif?: string | undefined; form?: HamStokFormu | undefined };
type KalibresizSure = Omit<GeometriSureCevabi, 'kalibre' | 'kalibrasyon'> & { ozellikSayisi: number };

async function sureHesapla(
  db: Db, m: Model, sorgu: SureSorgusu,
  onYuk: { adimlar: TalasliRotaAdimi[] | null | 'bagli-degil'; stokListesi?: Awaited<ReturnType<typeof hammaddeStokOlculeri>> },
): Promise<KalibresizSure> {
  const revizyonId = m.revizyonId;
  const katsayi = kesmeKatsayisi(sorgu.sinif ?? null);
  const iso = sorgu.iso ?? katsayi?.iso ?? 'P';
  const isoKaynagi = sorgu.iso !== undefined ? 'istek' as const : katsayi !== null ? 'sinif' as const : 'varsayilan' as const;
  // Elle seçilen grup sınıfınkinden başkaysa sınıfın kc'si kullanılmaz (kullanıcı malzemenin davranışını değiştirdi).
  const kienzle = katsayi !== null && katsayi.kc1 !== null && katsayi.mc !== null && katsayi.iso === iso ? { kc1: katsayi.kc1, mc: katsayi.mc } : null;
  const kc = kienzle === null
    ? { degerNmm2: SURE_ISO[iso].kc, kc1: null, mc: null, hmMm: null, kaynak: 'iso' as const }
    : { degerNmm2: kienzleKc(kienzle.kc1, kienzle.mc), kc1: kienzle.kc1, mc: kienzle.mc, hmMm: SURE_HM_MM, kaynak: 'kienzle' as const };
  const ham = await hamCevabi(db, m, sorgu, onYuk.stokListesi === undefined ? undefined : { stokListesi: onYuk.stokListesi });
  const adimlar = onYuk.adimlar;
  const tezgah = await tezgahGucu(db, adimlar);
  const bos = {
    revizyonId, oneri: true as const, iso, isoKaynagi, sinif: katsayi === null ? null : sorgu.sinif ?? null,
    sinifIso: katsayi?.iso ?? null, kc, tezgah, hamFormu: null,
    payMm: ham.payMm, payKaynagi: ham.payKaynagi, hamKaynagi: null, hamKodu: null, hamHacimMm3: null, parcaHacimMm3: null, talasMm3: null,
    kalemler: [], altDk: null, ortaDk: null, ustDk: null, ozellikOkundu: false, rota: sureRotasi(adimlar), ozellikSayisi: 0,
  };
  const a = (await analizCevabi(db, m)).analiz;
  if (a === null || ham.enAz === null) return { ...bos, neden: 'analiz-yok' };
  const stok = ham.oneriler.find((o) => o.form === sorgu.form) ?? ham.oneriler[0];
  const hamHacimMm3 = stok?.hamHacimMm3 ?? ham.enAz.a * ham.enAz.b * ham.enAz.c;
  const hamBilgisi = { hamKaynagi: stok === undefined ? 'kutu' as const : 'stok' as const, hamKodu: stok?.kod ?? null, hamFormu: stok?.form ?? null, hamHacimMm3 };
  if (a.hacimMm3 === null) return { ...bos, ...hamBilgisi, neden: 'hacim-yok' };
  const oz = (await ozellikCevabi(db, m)).ozellikler;
  const delikler = oz === null ? null : oz.flatMap((o) =>
    o.tur === 'delik' && o.capMm !== null && o.derinlikMm !== null ? [{ capMm: o.capMm, derinlikMm: o.derinlikMm }] : []);
  const t = sureTahmini({ iso, hamHacimMm3, parcaHacimMm3: a.hacimMm3, alanMm2: a.alanMm2, delikler, kc: kc.degerNmm2, gucKw: tezgah.gucKw });
  const parca = { ...hamBilgisi, parcaHacimMm3: a.hacimMm3, ozellikOkundu: oz !== null, ozellikSayisi: oz?.length ?? 0 };
  if (t === null) return { ...bos, ...parca, neden: 'talas-yok' };
  return { ...bos, ...parca, talasMm3: t.talasMm3, kalemler: t.kalemler, altDk: t.altDk, ortaDk: t.ortaDk, ustDk: t.ustDk, neden: null };
}

export async function sureTahminiOku(db: Db, revizyonId: number, sorgu: SureSorgusu): Promise<GeometriSureCevabi> {
  const m = await model(db, revizyonId);
  const adimlar = await talasliRotaOku(db, m.malzemeNo);
  const { ozellikSayisi, ...h } = await sureHesapla(db, m, sorgu, { adimlar });
  if (h.ortaDk === null || h.altDk === null || h.ustDk === null) return { ...h, kalibre: false, kalibrasyon: null };
  const s = (await kalibrasyonVerisi(db)).sonuc;
  const c = { ...bilesenleri(h.kalemler, ozellikSayisi), tahminDk: h.ortaDk, gruplar: kalibrasyonGrubu(h.iso, h.isoKaynagi !== 'varsayilan', adimlar) };
  const kalibrasyon = kalibreAralik(s, c);
  return { ...h, kalibre: kalibrasyon !== null, kalibrasyon };
}

// ---------------- Süre kalibrasyonu (3321-3; S1 a: okumada hesaplanır, tablo yok) ----------------

const dk4 = (x: number): number => Math.round(x * 1e4) / 1e4;
const olasi = (k: { altDk: number; ustDk: number } | undefined): number => (k === undefined ? 0 : Math.sqrt(k.altDk * k.ustDk));
function bilesenleri(kalemler: GeometriSureCevabi['kalemler'], ozellikSayisi: number): Pick<KalibrasyonCifti, 'kabaDk' | 'finisDk' | 'delikDk' | 'ozellikSayisi'> {
  const k = (ad: string) => kalemler.find((x) => x.kalem === ad);
  return { kabaDk: olasi(k('kaba')), finisDk: olasi(k('finis')), delikDk: olasi(k('delik')), ozellikSayisi };
}
// Malzeme grubu ISO grubudur (sınıftan ya da elle seçilen); varsayılan P bilinmeyen sayılır. Tezgâh ve işlem ilk talaşlı adımdan.
function kalibrasyonGrubu(iso: GeometriIsoGrubu, isoBilinir: boolean, adimlar: TalasliRotaAdimi[] | null | 'bagli-degil'): KalibrasyonCifti['gruplar'] {
  const ilk = Array.isArray(adimlar) ? adimlar[0] : undefined;
  return { malzeme: isoBilinir ? iso : null, tezgah: ilk?.makineKod ?? null, islem: ilk?.islemTuru ?? null };
}

type KalibrasyonParcasi = KalibrasyonCifti & { kod: string; ad: string | null; revizyonId: number; disaridaNedeni: string | null };
interface KalibrasyonVerisi { parcalar: KalibrasyonParcasi[]; olcumuEksik: number; sonuc: KalibrasyonSonucu }

// Her malzemenin tek modeli (kapak, yoksa en son yayına giren; malzemeGeometrisi kuralı). Tahmin parçanın varsayılan malzemesi (rotadaki
// hammadde) ve ilk ham önerisiyle kalibresiz olası süredir; ölçüm bütün talaşlı adımların son 5 ölçüm ortancası toplamıdır.
async function kalibrasyonHesabi(db: Db): Promise<KalibrasyonVerisi> {
  const secili = malzemeBasinaModel(await modeller(db));
  const disarida = new Map((await sorgular.kalibrasyonDisaridalar(db)).map((d) => [d.malzemeNo, d.neden]));
  const ozetler = await malzemeOzetleri(db, [...secili.keys()]);
  let stokListesi: Awaited<ReturnType<typeof hammaddeStokOlculeri>> | undefined;
  const parcalar: KalibrasyonParcasi[] = [];
  let olcumuEksik = 0;
  for (const m of secili.values()) {
    const mz = ozetler.get(m.malzemeNo);
    const adimlar = await talasliRotaOku(db, m.malzemeNo);
    if (mz === undefined || !Array.isArray(adimlar) || adimlar.length === 0) continue;
    if (adimlar.some((a) => a.olcumOrtancaDk === null)) { olcumuEksik += 1; continue; }
    const olcumDk = adimlar.reduce((t, a) => t + (a.olcumOrtancaDk ?? 0), 0);
    const rm = await rotaMalzemesi(db, adimlar);
    stokListesi ??= await hammaddeStokOlculeri(db, STOK_FORMLARI);
    const h = await sureHesapla(db, m, { kalite: rm?.kalite ?? undefined, sinif: rm?.sinif ?? undefined }, { adimlar, stokListesi });
    if (h.ortaDk === null || !(olcumDk > 0)) continue;
    parcalar.push({
      malzemeNo: m.malzemeNo, kod: mz.kod, ad: mz.ad, revizyonId: m.revizyonId, tahminDk: h.ortaDk, olcumDk: dk4(olcumDk),
      disarida: disarida.has(m.malzemeNo), disaridaNedeni: disarida.get(m.malzemeNo) ?? null,
      gruplar: kalibrasyonGrubu(h.iso, h.isoKaynagi !== 'varsayilan', adimlar), ...bilesenleri(h.kalemler, h.ozellikSayisi),
    });
  }
  parcalar.sort((a, b) => a.kod.localeCompare(b.kod, 'tr') || a.malzemeNo - b.malzemeNo);
  return { parcalar, olcumuEksik, sonuc: kalibrasyonHesapla(parcalar) };
}

// Bütün parçaları dolaşmak her süre okumasında pahalıdır: sonuç 60 saniye bellekte tutulur (tek sunucu). "Dışarıda bırak" ve "geri al"
// işareti transaction içinde yazar; önbellek commit'ten önce temizlenir. Commit'e kadar başlayan bir okuma eski sonucu önbelleğe koymasın
// diye yazmadan sonraki 5 saniye içinde başlamış hesap önbellekte güvenilmez (commit bu sürede biter, VARSAYIM). Ölçüm ya da model
// değişince en çok 60 saniye eski kalır.
const KALIBRASYON_ONBELLEK_MS = 60_000;
const KALIBRASYON_YAZMA_PAYI_MS = 5_000;
let onbellek: { zaman: number; veri: Promise<KalibrasyonVerisi> } | null = null;
let sonYazma = Number.NEGATIVE_INFINITY;
export function kalibrasyonOnbellegiTemizle(): void { onbellek = null; sonYazma = Date.now(); }
// Yalnız test: önbelleği yazma payı olmadan boşaltır (bırakma sonrası temizliğin ölçülebilmesi için).
export function kalibrasyonOnbellegiSifirla(): void { onbellek = null; sonYazma = Number.NEGATIVE_INFINITY; }
function kalibrasyonVerisi(db: Db): Promise<KalibrasyonVerisi> {
  const simdi = Date.now();
  if (onbellek !== null && simdi - onbellek.zaman < KALIBRASYON_ONBELLEK_MS && onbellek.zaman > sonYazma + KALIBRASYON_YAZMA_PAYI_MS) return onbellek.veri;
  const veri = kalibrasyonHesabi(db);
  onbellek = { zaman: simdi, veri };
  veri.catch(() => { if (onbellek?.veri === veri) onbellek = null; });
  return veri;
}

export async function kalibrasyonOku(db: Db): Promise<GeometriKalibrasyonCevabi> {
  return kalibrasyonCevabi(await kalibrasyonVerisi(db));
}

function kalibrasyonCevabi({ parcalar, olcumuEksik, sonuc: s }: KalibrasyonVerisi): GeometriKalibrasyonCevabi {
  return {
    asama: s.asama, esikler: { ...KALIBRASYON_ESIGI }, n: s.n, disarida: s.disarida, olcumuEksik, carpan: s.carpan, hataYuzde: s.hataYuzde,
    kalibresizHataYuzde: s.kalibresizHataYuzde, aralik: s.aralik, regresyon: s.regresyon, gruplar: s.gruplar,
    parcalar: parcalar.map((p) => {
      const k = kalibreOrta(s, p);
      return {
        malzemeNo: p.malzemeNo, kod: p.kod, ad: p.ad, revizyonId: p.revizyonId, tahminDk: p.tahminDk, olcumDk: p.olcumDk,
        kalibreDk: k === null ? null : dk4(k), gruplar: { ...p.gruplar }, disarida: p.disarida, disaridaNedeni: p.disaridaNedeni,
      };
    }),
  };
}

// Yalnız işaret yazılır; ölçüm ve model değişmez. Malzeme kartı yoksa yabancı anahtar reddeder (kartın varlığı denetlenir).
export async function kalibrasyondanCikar(db: Db, kullanici: Kullanici, malzemeNo: number, neden: string | null): Promise<GeometriKalibrasyonCevabi> {
  if (!(await malzemeOzetleri(db, [malzemeNo])).has(malzemeNo)) throw bulunamadi(KALIBRASYON_ILETILERI.malzemeYok);
  await sorgular.kalibrasyonDisaridaYaz(db, malzemeNo, neden, kullanici.id);
  kalibrasyonOnbellegiTemizle();
  // Yazan transaction kendi yazısını görür; sonuç önbelleğe konmaz (geri dönerse başkasına sızmasın).
  return kalibrasyonCevabi(await kalibrasyonHesabi(db));
}

export async function kalibrasyonaGeriAl(db: Db, malzemeNo: number): Promise<GeometriKalibrasyonCevabi> {
  await sorgular.kalibrasyonDisaridaSil(db, malzemeNo);
  kalibrasyonOnbellegiTemizle();
  // Yazan transaction kendi yazısını görür; sonuç önbelleğe konmaz (geri dönerse başkasına sızmasın).
  return kalibrasyonCevabi(await kalibrasyonHesabi(db));
}

// Malzemenin yayındaki 3B modeli, analizi ve ham önerisi: başka modül (CNC Kurulum ham ekranı) `disari.ts` ile okur (1703 a).
// Malzemeye bağlı birden çok yayındaki model varsa kartta kapak seçilen model esastır (GEO-2 a); kapak yoksa en son yayına giren
// (en büyük revizyon kimliği). modelSayisi birden büyükse okuyan ekran hangi modelin alındığını söyler.
// Model yoksa null; model var ama analiz henüz yoksa analiz null ve öneri 'analiz-yok' nedeniyle boştur. Yetki denetlemez.
export interface MalzemeGeometrisi {
  malzemeNo: number;
  belgeAdi: string;
  harf: string;
  revKodu: string | null;
  kapak: boolean;
  modelSayisi: number;
  analiz: GeometriAnalizCevabi;
  ham: GeometriHamCevabi;
}

export async function malzemeGeometrisi(
  db: Db, malzemeNo: number, sorgu: { payMm?: number | undefined; kalite?: string | undefined } = {},
): Promise<MalzemeGeometrisi | null> {
  const liste = (await modeller(db)).filter((x) => x.malzemeNo === malzemeNo)
    .sort((a, b) => Number(b.kapak) - Number(a.kapak) || b.revizyonId - a.revizyonId);
  const m = liste[0];
  if (m === undefined) return null;
  return {
    malzemeNo, belgeAdi: m.belgeAdi, harf: m.harf, revKodu: m.revKodu, kapak: m.kapak, modelSayisi: liste.length,
    analiz: await analizCevabi(db, m), ham: await hamCevabi(db, m, sorgu),
  };
}

// ---------------- Yüzey işaretleri (kart 2144) ----------------

// İşlem listesi rotadandır (2140-3). Rota geometriyi okur (ham önerisi), geometri rotayı ithal edemez (ADR 0006); adımları rota verir,
// bağı sunucu/kablolama.ts kurar. Çözücü malzemenin yürürlükteki rota revizyonundaki yüzey işlemi adımlarını verir; rota yoksa null.
// Yetki denetlemez.
export type YuzeyAdimlariCozucusu = (db: Db, malzemeNo: number) => Promise<GeometriYuzeyAdimi[] | null>;
let yuzeyAdimlari: YuzeyAdimlariCozucusu | null = null;
// Önceki çözücüyü döner (test kurup geri koyar).
export function yuzeyAdimlariCozucusuKaydet(cozucu: YuzeyAdimlariCozucusu | null): YuzeyAdimlariCozucusu | null {
  const onceki = yuzeyAdimlari;
  yuzeyAdimlari = cozucu;
  return onceki;
}

async function rotaAdimlari(db: Db, malzemeNo: number): Promise<GeometriYuzeyCevabi['rota']> {
  if (yuzeyAdimlari === null) return { durum: 'rota-bagli-degil', adimlar: [] };
  const adimlar = await yuzeyAdimlari(db, malzemeNo);
  return adimlar === null ? { durum: 'rota-yok', adimlar: [] } : { durum: 'bagli', adimlar };
}

const rotaAnahtarlari = (r: GeometriYuzeyCevabi['rota']): Set<string> =>
  new Set(r.adimlar.map((a) => islemAnahtari({ tur: 'rota', opNo: a.opNo, sartnameId: a.sartname.id })));

// Kayıt yoksa aynı belgenin önceki işaretli revizyonundan eşleşen yüzlere öneri (2140-4 a); öneri kaydedilmez, kaydedilince onaylanana kadar
// oneri işaretiyle kalır. Yüzler revizyonun B-rep okumasındandır; yüzleri okunmamış analiz 'yuz-yok'.
export async function yuzeyOku(db: Db, revizyonId: number): Promise<GeometriYuzeyCevabi> {
  const m = await model(db, revizyonId);
  const rota = await rotaAdimlari(db, m.malzemeNo);
  const bos: GeometriYuzeyCevabi = {
    revizyonId, oneri: true, neden: null, yuzler: [], rota, isaretler: [], alanlar: [], isaretsizMm2: 0, toplamMm2: 0,
    surum: null, guncelleyen: null, guncelleme: null, tasima: null,
  };
  const a = await sorgular.analiz(db, revizyonId);
  if (a === null || a.ozet !== m.ozet) return { ...bos, neden: 'analiz-yok' };
  const yuzler = await sorgular.yuzler(db, revizyonId);
  if (yuzler.length === 0) return { ...bos, neden: 'yuz-yok' };
  const siralar = new Set(yuzler.map((y) => y.sira));
  const baslik = await sorgular.yuzeyBasligi(db, revizyonId);
  let isaretler: YuzeyIsaretGirdisi[] = [];
  let tasima: GeometriYuzeyCevabi['tasima'] = null;
  if (baslik !== null) {
    isaretler = (await sorgular.yuzeyIsaretleri(db, revizyonId)).filter((x) => siralar.has(x.yuzSira));
  } else {
    const kaynak = await sorgular.oncekiIsaretliRevizyon(db, m.belgeId, revizyonId);
    if (kaynak !== null) {
      const eski = await sorgular.yuzeyIsaretleri(db, kaynak);
      const isaretli = new Set(eski.map((x) => x.yuzSira));
      const eslesme = yuzleriEslestir((await sorgular.yuzler(db, kaynak)).filter((y) => isaretli.has(y.sira)), yuzler);
      isaretler = eski.flatMap((x) => {
        const yeni = eslesme.get(x.yuzSira);
        return yeni === undefined ? [] : [{ yuzSira: yeni, islem: x.islem, oneri: true }];
      }).sort((p, q) => p.yuzSira - q.yuzSira);
      tasima = { kaynakRevizyonId: kaynak, eslesen: isaretler.length, eslesmeyen: eski.length - isaretler.length };
    }
  }
  const anahtarlar = rotaAnahtarlari(rota);
  const ad = baslik === null ? null : (await kisiAdlari(db, [baslik.guncelleyenKisiId])).get(baslik.guncelleyenKisiId) ?? null;
  return {
    ...bos,
    yuzler: yuzler.map((y) => ({ sira: y.sira, tur: y.tur, ters: y.ters, alanMm2: y.alanMm2 })),
    isaretler: isaretler.map((x) => ({ ...x, rotadaVar: x.islem.tur === 'maske' || anahtarlar.has(islemAnahtari(x.islem)) })),
    ...yuzeyAlanlari(yuzler, isaretler),
    surum: baslik?.surum ?? null,
    guncelleyen: baslik === null ? null : { id: baslik.guncelleyenKisiId, ad },
    guncelleme: baslik?.guncelleme ?? null,
    tasima,
  };
}

// Bütün işaretler tek komutla, sürüm koşuluyla yazılır; kişi ve zaman sunucudandır.
export async function yuzeyKaydet(db: Db, kullanici: Kullanici, revizyonId: number, govde: GeometriYuzeyKaydetGovdesi): Promise<GeometriYuzeyCevabi> {
  const m = await model(db, revizyonId);
  const a = await sorgular.analiz(db, revizyonId);
  if (a === null || a.ozet !== m.ozet) throw gecersiz(YUZEY_ILETILERI.analizYok);
  const yuzler = await sorgular.yuzler(db, revizyonId);
  if (yuzler.length === 0) throw gecersiz(YUZEY_ILETILERI.yuzYok);
  const baslik = await sorgular.yuzeyBasligi(db, revizyonId, true);
  if (baslik === null ? govde.surum !== null : govde.surum !== baslik.surum) throw eskiSurum();
  const kayitli = baslik === null ? [] : await sorgular.yuzeyIsaretleri(db, revizyonId);
  const hata = yuzeyKaydiDenetle(new Set(yuzler.map((y) => y.sira)), rotaAnahtarlari(await rotaAdimlari(db, m.malzemeNo)), kayitli, govde.isaretler);
  if (hata !== null) throw dogrulama(hata, 'isaretler');
  if ((await sorgular.yuzeyYaz(db, revizyonId, govde.surum, kullanici.id, govde.isaretler)) === null) throw eskiSurum();
  return yuzeyOku(db, revizyonId);
}

// İş yoksa (tarama yakalamadı) açılır; varsa sürüm koşuluyla yeniden kuyruğa girer. Süren iş de yeniden kuyruğa alınabilir:
// süreç sonucu dönünce 'bitti' yazar, yeni tur aynı içeriği yeniden hesaplar (zarar yok).
export async function yenidenHesapla(db: Db, revizyonId: number, surum: number | null): Promise<GeometriAnalizCevabi> {
  const m = await model(db, revizyonId);
  const var_ = await sorgular.is(db, revizyonId);
  if (var_ === null) {
    if (surum !== null) throw eskiSurum();
    const eklenen = await sorgular.kuyrugaEkle(db, [m]);
    if (eklenen === 0) throw eskiSurum();
  } else {
    if (surum === null) throw eskiSurum();
    if ((await sorgular.yenidenKuyruga(db, revizyonId, surum)) === null) throw eskiSurum();
  }
  return analizCevabi(db, m);
}

// Görüntüleyicinin dosyası: listede gösterilen revizyon (geometri.oku); Çizim Merkezi okuma yetkisi ayrıca istenmez.
export async function modelDosyasi(db: Db, revizyonId: number): Promise<IkiliCevap> {
  const m = await model(db, revizyonId);
  const d = await alinanRevizyonDosyasi(db, m.belgeId, m.ozet);
  if (d === null) throw bulunamadi(ILETILER.dosyaYok);
  return d.dosya;
}

export async function kuyrugaTara(db: Db): Promise<number> {
  return sorgular.kuyrugaEkle(db, await modeller(db));
}

async function dosyaOku(db: Db, is: sorgular.IsSatiri): Promise<Uint8Array | string> {
  const d = await alinanRevizyonDosyasi(db, is.belgeId, is.ozet);
  if (d === null) return ILETILER.dosyaYok;
  if (d.dosya.boyut > DOSYA_EN_BUYUK_BAYT) return ILETILER.dosyaBuyuk;
  const parcalar: Buffer[] = [];
  let toplam = 0;
  for await (const p of d.dosya.akis(db)) {
    toplam += p.length;
    if (toplam > DOSYA_EN_BUYUK_BAYT) return ILETILER.dosyaBuyuk;
    parcalar.push(p);
  }
  const veri = new Uint8Array(Buffer.concat(parcalar));
  return bicimDenetimi(is.dosyaTuru, veri) ?? veri;
}

// Zamanlayıcı turu: tara, öksüzleri kapat, sırayla en çok TUR_BASINA_EN_COK_IS işi hesaplat. Dosya kısa transaction'da okunur,
// hesap transaction dışında beklenir (bağlantı tutulmaz), sonuç ayrı transaction'da yazılır.
export async function geometriTuru(vt: Veritabani, surec: GeometriSureci, gunluk: Gunluk): Promise<number> {
  await vt.tx(async (db) => {
    await kuyrugaTara(db);
    for (const o of await sorgular.oksuzIsler(db)) {
      await sorgular.isBitir(db, o.id, hataSonrasiDurum(o.denemeSayisi, false), ILETILER.surecDustu);
    }
  });
  const alinanlar: number[] = [];
  while (alinanlar.length < TUR_BASINA_EN_COK_IS) {
    const alinan = await vt.tx(async (db) => {
      const is = await sorgular.siradakiIsiAl(db, alinanlar);
      if (is === null) return null;
      alinanlar.push(is.id);
      const veri = await dosyaOku(db, is);
      if (typeof veri === 'string') {
        await sorgular.isBitir(db, is.id, 'hata', veri);
        return { is, veri: null };
      }
      return { is, veri };
    });
    if (alinan === null) break;
    if (alinan.veri === null) continue;
    const { is, veri } = alinan;
    const yanit = await surec.hesapla(is.dosyaTuru, veri);
    await vt.tx(async (db) => {
      if (yanit.tamam) {
        await sorgular.analizYaz(db, { revizyonId: is.revizyonId, belgeId: is.belgeId, ozet: is.ozet, motor: MOTOR, olcum: yanit.olcum, sureMs: yanit.sureMs });
        await sorgular.montajYaz(db, is.revizyonId, MOTOR, yanit.montaj);
        await sorgular.yuzlerYaz(db, is.revizyonId, YUZ_MOTORU, yanit.yuzler);
        await sorgular.ozelliklerYaz(db, is.revizyonId, YUZ_MOTORU, yanit.yuzler === null ? null : yanit.ozellikler);
        await sorgular.saglikYaz(db, is.revizyonId, YUZ_MOTORU, yanit.saglik);
        await sorgular.isBitir(db, is.id, 'bitti', null);
      } else {
        if (!yanit.kalici) gunluk.uyar(`Geometri hesabı yarıda kaldı (revizyon ${String(is.revizyonId)}): ${yanit.hata}`);
        await sorgular.isBitir(db, is.id, hataSonrasiDurum(is.denemeSayisi, yanit.kalici), hataMetniKisalt(yanit.hata));
      }
    });
  }
  return alinanlar.length;
}

// Malzemenin yayındaki 3B model revizyonları (3209 a, Risk R2): rota talimat sahnesi kaydında modelin ürüne ait olduğunu denetler.
// Yetki denetlemez; çağıran kendi yazma işlemini ister.
export async function malzemeModelRevizyonlari(db: Db, malzemeNo: number): Promise<number[]> {
  return (await modeller(db)).filter((x) => x.malzemeNo === malzemeNo).map((x) => x.revizyonId);
}
