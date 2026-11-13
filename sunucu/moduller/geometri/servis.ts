import type { Db, Veritabani } from '#cekirdek/db.ts';
import type { IkiliCevap } from '#cekirdek/uc.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  GeometriAnalizCevabi, GeometriDosyaTuru, GeometriDurumu, GeometriHamCevabi, GeometriModelSatiri, GeometriMontajCevabi, GeometriOzellikCevabi, GeometriSaglikCevabi,
  GeometriYuzeyAdimi, GeometriYuzeyCevabi, GeometriYuzeyKaydetGovdesi,
} from '#paylasilan/sozlesme/geometri.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { alinanRevizyonDosyasi, kayitlaraBagliTaslakBelgeler, kayitlaraBagliYayindakiBelgeler, taslagiGorur } from '../belge-merkezi/disari.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { hammaddeStokOlculeri, malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  bicimDenetimi, bilesenListesi, DOSYA_EN_BUYUK_BAYT, enAzHam, hataMetniKisalt, hataSonrasiDurum, ILETILER, islemAnahtari, MOTOR, saglikDegerlendir, STOK_FORMLARI,
  stokEslestir, TUR_BASINA_EN_COK_IS, YUZ_MOTORU, YUZEY_ILETILERI, yuzeyAlanlari, yuzeyKaydiDenetle, yuzleriEslestir,
} from './kurallar.ts';
import type { YuzeyIsaretGirdisi } from './kurallar.ts';
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
  const m = await model(db, revizyonId);
  const a = await sorgular.analiz(db, revizyonId);
  if (a === null || a.ozet !== m.ozet || (await sorgular.yuzOzeti(db, revizyonId)).length === 0) return { revizyonId, motor: null, ozellikler: null };
  const satirlar = await sorgular.ozellikler(db, revizyonId);
  return { revizyonId, motor: YUZ_MOTORU, ozellikler: satirlar.map(({ motor: _m, ...o }) => o) };
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
export async function hamOnerisi(db: Db, revizyonId: number, sorgu: { payMm?: number | undefined; kalite?: string | undefined }): Promise<GeometriHamCevabi> {
  const ayar = sorgu.payMm === undefined ? await sistemAyariOku(db, 'geometri.ham-payi-mm') : null;
  const payMm = sorgu.payMm ?? ayar ?? 0;
  const payKaynagi = sorgu.payMm !== undefined ? 'istek' : ayar !== null ? 'ayar' : 'yok';
  const c = await analizOku(db, revizyonId);
  if (c.analiz === null) return { revizyonId, payMm, payKaynagi, enAz: null, oneriler: [], kaliteler: [], neden: 'analiz-yok' };
  const enAz = enAzHam(c.analiz.obb, payMm);
  const liste = await hammaddeStokOlculeri(db, STOK_FORMLARI);
  const kaliteler = [...new Set(liste.flatMap((k) => (k.kalite === null ? [] : [k.kalite])))].sort((x, y) => x.localeCompare(y, 'tr'));
  const adaylar = sorgu.kalite === undefined ? liste : liste.filter((k) => k.kalite === sorgu.kalite);
  const oneriler = stokEslestir(c.analiz.obb, payMm, adaylar);
  const neden = oneriler.length > 0 ? null : adaylar.length === 0 ? 'stok-listesi-yok' : 'sigan-yok';
  return { revizyonId, payMm, payKaynagi, enAz, oneriler, kaliteler, neden };
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
    analiz: await analizCevabi(db, m), ham: await hamOnerisi(db, m.revizyonId, sorgu),
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
