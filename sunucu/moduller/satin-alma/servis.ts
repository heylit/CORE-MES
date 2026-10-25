import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { KmTedarikciDurumu } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type {
  AcilisCevabi, Ayarlar, DisOperasyonlarCevabi, FasonSureleriCevabi, SiparisBelgeleriCevabi, SiparisBelgesi, SiparisBelgesiYazimi, AyarlarKaydetYazimi, HizliAcYazimi, KatalogKaydetYazimi, KatalogKaydi, MalzemeSecenekleriCevabi, SatinAlmaOzetiCevabi, SiparisCikisi, SiparisFaturalariCevabi, SiparisFaturasiYazimi, SiparisKalemiDegistirYazimi, SiparisKapatYazimi, TeslimYontemiYazimi, OdemePlaniYazimi, SiparisTakibiCevabi, Talep, TalepDurumu, TalepKaydetYazimi, TalepTuru,
  AcikEmirlerCevabi, TedarikTermini, TedarikTerminiKaydetYazimi, TedarikTerminleriCevabi, KgFiyatiGecmisiCevabi, KgFiyatiSatiri, KgFiyatlariCevabi, KgStokDegeri, StokAyriGrubu, StokYokIstekleriCevabi, TaleplerimCevabi, Talebim, TalepYazimi, Tedarikci, TedarikciKaydetYazimi,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { STOK_AYRI_GRUPLARI } from '#paylasilan/sozlesme/satin-alma.ts';
import { randomUUID } from 'node:crypto';
import { numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari, kisiVarMi } from '../kisiler/disari.ts';
import { alisBelgeleri, belgeSiparisBagla, faizler, kurGetir, kurlar, siparisOdemePlaniYaz, siparisPlanlari, tedarikciOlabilirMi } from '../finans/disari.ts';
import { firmaAra, firmaOzeti, firmaOzetleri, tumFirmalar, type FirmaOzeti } from '../musteri-tedarikci/disari.ts';
import { kullanilanKaliteler, malzemeAra, malzemeMaliyetBilgileri, malzemeOzetleri } from '../malzemeler/disari.ts';
import { belgeAcVeBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldir, type BagliBelge } from '../cizimler/disari.ts';
import { acikEmirler, emirDurumlari, emirNolari, fasonGecmisi, fasonIsEmirleri } from '../uretim-emirleri/disari.ts';
import { operasyonTipleri } from '../istasyonlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import {
  ILETILER, ISLEM, emirAcikMi, degisiklikReddi, gecikmeGunu, degisiklikTuru, dortGozSonucu, fazlaTeslim, finanstanEklenenKurlar, aylikFaiz, fiyatIzleri, kullanilanParaBirimleri, VARSAYILAN_AYLIK_FAIZ, gecisVarMi, gorunenDurum, kararDegistiMi, kararOnayliMi, talepFisiGiderMi,
  KARTSIZ_KATEGORI, TALEP_TURU_KARTLARI, satinAlinabilirKartReddi, kartBirimiReddi, hizliBaslik, hizliKalemReddi, kartKopyasi, kartsizSiparisReddi, katalogKartiReddi, logoGuncellenecekSiparisler, logoIptalGeriAlmaReddi, logoSiparisDegisikligiReddi, siparisliKalemReddi, siparisDegisikligiMetni, siparisFaturaFirmasi, siparisKalemiDegisikligiReddi, siparisKapatmaReddi, talebinAlimlari, ondalikKiyas, siparisReddi, sirketAdiGorunumu, talebim,
  fasonKirilimlari, fasonSureOrnekleri, fasonSuresiTahmini, fasonTerminUyumu, talepEdenDurumu, talepEdenGorunumu, talepKartiReddi, tamGorurMu, teklifKuru, teslimDurumu, odemePlaniHedefi, varsayilanOdemePlani,
  askidakiTedarikciReddi, birimFiyati, kaliteSiparisReddi, stokTutari, uygulananKgFiyati, yeniSiparisFirmalari,
} from './kurallar.ts';
import type { FiyatIzi } from './kurallar.ts';
import * as s from './sorgular.ts';
import { alimBildir } from './alim-olayi.ts';
import { ondalikMetinSemasi } from '#paylasilan/ondalik.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';

const ad = (harita: Map<number, string>, id: number | null) => (id === null ? null : harita.get(id) ?? null);

// Ondalık metin sade biçimde gider (sondaki sıfırlar ve nokta atılır): ekran sayıyla çalışıp geri yazdığında aynı metin döner,
// kayıt karşılaştırması biçim farkını değişiklik sanmaz. Sayıya çevrilmez.
export function sade(d: string): string;
export function sade(d: string | null): string | null;
export function sade(d: string | null): string | null {
  if (d === null || !d.includes('.')) return d;
  return d.replace(/0+$/, '').replace(/\.$/, '');
}

// Veritabanı satırlarından istemcinin bütününü kurar.
async function talepleriKur(db: Db, satirlar: s.TalepSatiri[]): Promise<Talep[]> {
  if (satirlar.length === 0) return [];
  const a = await s.altKayitlariOku(db, satirlar.map((t) => t.id));
  const kisiler = await kisiAdlari(db, [
    ...satirlar.map((t) => t.talepEdenKisiId), ...a.onaylar.map((o) => o.kisiId), ...a.hareketler.map((h) => h.kisiId),
    ...a.senaryolar.map((x) => x.kisiId), ...a.kararlar.map((k) => k.kararVerenKisiId),
  ].filter((x): x is number => x !== null));
  // SAT-37, SAT-38: teslim satın almanın kendi tablosundadır, stok mal kabulde yazar (SH1 a). GKK sonucu kalite modülü gelene
  // kadar yoktur (SH2 b); kalite boş döner.
  const emirNolariHaritasi = await emirNolari(db, satirlar.flatMap((t) => (t.uretimEmriId === null ? [] : [t.uretimEmriId])));
  const toplamlar = new Map((await s.teslimToplamlari(db, a.siparisSatirlari.map((x) => x.id))).map((x) => [x.siparisSatiriId, x]));
  const grup = <T extends { talepId: string }>(l: T[], id: string) => l.filter((x) => x.talepId === id);
  const siparisKur = (x: (typeof a.siparisler)[number]): SiparisCikisi => {
    const satirlar = a.siparisSatirlari.filter((r) => r.talepId === x.talepId && r.teklifId === x.teklifId).map((r) => {
      const t = toplamlar.get(r.id);
      const teslimAlinan = t === undefined ? null : sade(t.toplam);
      const miktar = sade(r.miktar);
      return {
        id: r.id, kalemId: r.kalemId, miktar, birim: r.birim, teslimAlinan,
        sonTeslimTarihi: t?.sonTarih ?? null, fazlaTeslim: fazlaTeslim(miktar, teslimAlinan),
      };
    });
    return {
      teklifId: x.teklifId, no: x.no, siparisNo: x.siparisNo, siparisTarihi: x.siparisTarihi, beklenenTeslim: x.beklenenTeslim,
      // Kalanı kapatılmış sipariş tamamlanmış sayılır: talep, kalan beklenmeden teslim alındıya geçer.
      satirlar, teslimDurumu: x.logoKapatmaDurumu === null ? teslimDurumu(satirlar) : 'tamam', kalite: null,
      logo: x.logoDurumu === null ? null
        : { durum: x.logoDurumu, kayitNo: x.logoKayitNo, hata: x.logoHata, iptalDurumu: x.logoIptalDurumu, iptalHata: x.logoIptalHata,
          guncellemeDurumu: x.logoGuncellemeDurumu, guncellemeHata: x.logoGuncellemeHata, kapatmaDurumu: x.logoKapatmaDurumu, kapatmaHata: x.logoKapatmaHata },
    };
  };
  const at = <T extends { talepId: string }>({ talepId: _t, ...r }: T) => r;
  return satirlar.map((t) => {
    const k = a.kararlar.find((x) => x.talepId === t.id) ?? null;
    return {
      id: t.id, no: t.no, baslik: t.baslik, birim: t.birim, talepEdenKisiId: t.talepEdenKisiId, talepEdenAdi: ad(kisiler, t.talepEdenKisiId),
      acanKisiId: t.acanKisiId, oncelik: t.oncelik as Talep['oncelik'], ihtiyacTarihi: t.ihtiyacTarihi, notlar: t.notlar,
      teslimYontemi: t.teslimYontemi, uretimEmriId: t.uretimEmriId,
      uretimEmriNo: t.uretimEmriId === null ? null : emirNolariHaritasi.get(t.uretimEmriId) ?? null,
      // "Teslim alındı" yazılmaz; bütün siparişler stokta tam kabul edilince görünür (SAT-38).
      durum: gorunenDurum(t.durum as TalepDurumu, k === null ? [] : grup(a.siparisler, t.id).map((x) => siparisKur(x).teslimDurumu)),
      iptalNedeni: t.iptalNedeni,
      agirliklar: t.agirlikMaliyet === null ? null
        : { maliyet: t.agirlikMaliyet, termin: t.agirlikTermin ?? 0, tedarikci: t.agirlikTedarikci ?? 0, garanti: t.agirlikGaranti ?? 0 },
      kalemler: grup(a.kalemler, t.id).map((k) => ({ ...at(k), miktar: sade(k.miktar) })),
      teklifIstekleri: grup(a.istekler, t.id).map(at),
      teklifler: grup(a.teklifler, t.id).map((q) => ({
        ...at(q), kur: sade(q.kur), iskontoYuzdesi: sade(q.iskontoYuzdesi), nakliye: sade(q.nakliye), digerMasraf: sade(q.digerMasraf),
        avansYuzdesi: sade(q.avansYuzdesi), ilkToplam: sade(q.ilkToplam),
        fiyatlar: a.fiyatlar.filter((f) => f.talepId === t.id && f.teklifId === q.id).map(({ kalemId, birimFiyat }) => ({ kalemId, birimFiyat: sade(birimFiyat) })),
      })),
      karar: k === null ? null : {
        mod: k.mod, teklifId: k.teklifId, gerekce: k.gerekce, kararVerenKisiId: k.kararVerenKisiId, kararVerenAdi: ad(kisiler, k.kararVerenKisiId), kararTarihi: k.kararTarihi, ogrenilenler: k.ogrenilenler,
        bolunme: grup(a.bolunmeler, t.id).map(at),
        sabitKurlar: grup(a.sabitKurlar, t.id).map(({ paraBirimi, kur }) => ({ paraBirimi: paraBirimi as 'TRY', kur: sade(kur) })),
        siparisler: grup(a.siparisler, t.id).map(siparisKur),
      },
      onaylar: grup(a.onaylar, t.id).map((o) => ({ ...at(o), kisiAdi: ad(kisiler, o.kisiId) })),
      hareketler: grup(a.hareketler, t.id).map((h) => ({ ...at(h), kisiAdi: ad(kisiler, h.kisiId) })),
      senaryolar: grup(a.senaryolar, t.id).map((x) => ({
        id: x.id, ad: x.ad, kisiId: x.kisiId, kisiAdi: ad(kisiler, x.kisiId), olusturma: x.olusturma,
        paylar: a.paylar.filter((p) => p.talepId === t.id && p.senaryoId === x.id).map(({ kalemId, teklifId, miktar }) => ({ kalemId, teklifId, miktar: sade(miktar) })),
        dengeler: a.dengeler.filter((d) => d.talepId === t.id && d.senaryoId === x.id).map(({ kalemId, denge }) => ({ kalemId, denge: sade(denge) })),
      })),
      surum: t.surum, olusturma: t.olusturma, guncelleme: t.guncelleme,
    };
  });
}

async function talepOku(db: Db, id: string): Promise<Talep | null> {
  return (await talepleriKur(db, await s.talepSatirlariOku(db, null, id)))[0] ?? null;
}

// SAT-41: tedarikçi, aktif ve türü finansın kuralına göre tedarikçi olabilen firmadır (kural finansta, #471).
const tedarikciOlabilir = (f: FirmaOzeti | null): boolean => f !== null && f.aktif && tedarikciOlabilirMi(f.tur);

// Firma kartı finanstadır (SA1); finansta yetkili alanı yok, boş döner (sıfır uydurulmaz).
async function tedarikcileriKur(db: Db, firmaId: number | null = null): Promise<Tedarikci[]> {
  const satirlar = await s.tedarikcileriOku(db, firmaId);
  const firmalar = await firmaOzetleri(db, satirlar.map((t) => t.firmaId));
  const kategoriler = await s.tedarikciKategorileriOku(db, firmaId);
  const degerlendirmeler = await s.degerlendirmeleriOku(db, firmaId);
  const kisiler = await kisiAdlari(db, degerlendirmeler.map((d) => d.kisiId).filter((x): x is number => x !== null));
  const kalite = await kaliteDurumlari(db, satirlar.map((t) => t.firmaId));
  return satirlar.map((t) => {
    const f = firmalar.get(t.firmaId);
    return {
      firmaId: t.firmaId, ad: f?.ad ?? '', vergiNo: f?.vergiNo ?? null, yetkili: null, telefon: f?.telefon ?? null,
      eposta: f?.ePosta ?? null, sehir: f?.il ?? null, firmaAktif: f?.aktif ?? false, firmaSurum: f?.surum ?? null, durum: t.durum, kaliteDurumu: kalite.get(t.firmaId) ?? null, puan: t.puan, notlar: t.notlar,
      kategoriler: kategoriler.filter((k) => k.firmaId === t.firmaId).map((k) => k.kategori),
      degerlendirmeler: degerlendirmeler.filter((d) => d.firmaId === t.firmaId).map(({ firmaId: _f, ...d }) => ({ ...d, kisiAdi: ad(kisiler, d.kisiId) })),
      surum: t.surum, olusturma: t.olusturma,
    };
  });
}

// SA2 b, 249 a: kod, ad ve birim yalnız malzeme kartındadır (adsız kartta ad stok kodudur). Kategori kartta yalnız sarf, demirbaş ve
// hizmette vardır; olmayanda kalemde saklanan değer gösterilir. Kart bağı yabancı anahtarla zorunludur.
async function katalogKur(db: Db, id: string | null = null): Promise<KatalogKaydi[]> {
  const adlar = await s.takmaAdlariOku(db);
  const satirlar = await s.katalogOku(db, id);
  const kartlar = await malzemeOzetleri(db, satirlar.map((k) => k.malzemeNo));
  return satirlar.map((k) => {
    const kart = kartlar.get(k.malzemeNo);
    const kod = kart?.kod ?? `#${k.malzemeNo}`;
    return {
      ...k, kod, ad: kart?.ad ?? kod, kategori: kart?.kategoriAdi ?? k.kategori, birim: kart?.birim ?? '',
      takmaAdlari: adlar.filter((a) => a.katalogId === k.id).map((a) => a.takmaAd),
    };
  }).sort((a, b) => a.kod.localeCompare(b.kod, 'tr-TR'));
}

// SAT-53, SAT-65, #375: açılış satın almanın ekranıdır; yalnız talep açabilen 403 alır (uç yetkisi), kendi taleplerini
// ana sayfadaki uçtan görür. Tam gören (oku, yaz, onayla) her şeyi; yalnız ayar yetkisi olan kendi taleplerini talep eden gibi görür.
export async function acilis(db: Db, k: Kullanici): Promise<AcilisCevabi> {
  const tam = tamGorurMu(k.islemler);
  const talepler = await talepleriKur(db, await s.talepSatirlariOku(db, tam ? null : k.id));
  const tedarikciler = tam ? await tedarikcileriKur(db) : [];
  return {
    kullanici: { id: k.id, ad: k.ad },
    talepler: tam ? talepler : talepler.map((t) => talepEdenGorunumu(t, k.id)),
    tedarikciler,
    firmaKartlari: tam ? await firmaKartlari(db, new Set(tedarikciler.map((x) => x.firmaId))) : [],
    katalog: await katalogKur(db),
    ayarlar: await ayarlariKur(db),
  };
}

// Teklif seçicisi kayıtlı tedarikçilerin yanında firma kartlarını da sunar; sunucu da kayıtsız aktif tedarikçi firmayı kabul eder.
// Sınır, açılış cevabını tüm firma listesi kadar şişirmemek içindir; ada göre ilk 200 gelir.
const FIRMA_KARTI_SINIRI = 200;
async function firmaKartlari(db: Db, kayitli: ReadonlySet<number>): Promise<AcilisCevabi['firmaKartlari']> {
  return (await tumFirmalar(db))
    .filter((f) => f.aktif && tedarikciOlabilirMi(f.tur) && !kayitli.has(f.id))
    .map((f) => ({ id: f.id, ad: f.ad }))
    .sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.id - b.id)
    .slice(0, FIRMA_KARTI_SINIRI);
}

// SA3 a: güncel kur finanstan, bugünün ya da öncesinin son kuru; finansta yoksa boş (sıfır uydurulmaz).
async function ayarlariKur(db: Db): Promise<Ayarlar> {
  const a = await s.ayarlariOku(db);
  const bugun = await s.bugun(db);
  const finans = await kurlar(db, bugun);
  const finansFaizi = await faizler(db, bugun);
  // Finansın para birimleri yalnız hiç kaydedilmemiş ayarlara önerilir; kaydedilmiş listeden kaldırılan para birimi geri gelmez (borç 38).
  const oneri = a.surum === 1 ? finanstanEklenenKurlar(a.kurlar.map((k) => k.paraBirimi), new Set(finans.keys())) : [];
  const listeler = [...a.kurlar, ...oneri];
  const satirlar = listeler.map((k) => ({ ...k, aylikFaizYuzdesi: aylikFaiz(finansFaizi.get(k.paraBirimi)?.aylikYuzde, k.aylikFaizYuzdesi), kur: sade(finans.get(k.paraBirimi)?.kur ?? null) }));
  const tarihler = listeler.filter((k) => k.paraBirimi !== 'TRY').flatMap((k) => finans.get(k.paraBirimi)?.tarih ?? []).sort();
  return { ...a, kurlar: satirlar, kurTarihi: tarihler[0] ?? null };
}

// Birim boş olabilir (departmansız talep); doluysa ayarlardaki listede olmalı.
async function birimiDenetle(db: Db, birim: string | null): Promise<void> {
  if (birim !== null && !(await s.birimVarMi(db, birim))) throw gecersiz(ILETILER.birimYok(birim));
}

// Üretim emri boş bırakılabilir; yeni bağlanan emir açık olmalı. Bağı değişmeyen talep, emri sonradan kapansa da düzenlenir.
async function emriDenetle(db: Db, emirId: number | null, eskiEmirId: number | null): Promise<void> {
  if (emirId === null || emirId === eskiEmirId) return;
  if (!emirAcikMi((await emirDurumlari(db, [emirId])).get(emirId))) throw dogrulama(ILETILER.emirKapali, 'uretimEmriId');
}

export async function acikEmirSecenekleri(db: Db): Promise<AcikEmirlerCevabi> {
  return { emirler: (await acikEmirler(db)).map((e) => ({ id: e.id, emirNo: e.emirNo, parcaNo: e.parcaNo, parcaAd: e.parcaAd })) };
}

async function talepEdeniDenetle(db: Db, k: Kullanici, id: number | null): Promise<number> {
  const talepEden = id ?? k.id;
  if (talepEden !== k.id && !(await kisiVarMi(db, talepEden))) throw dogrulama(ILETILER.kisiYok, 'talepEdenKisiId');
  return talepEden;
}

// SAT-01, SAT-06: numara sunucuda verilir; talep başkası adına açılabilir. Talep eden (yaz yok) yalnız taslak ya da teklif istenen
// hâlde, teklifsiz ve kararsız açar.
// Fiyat izi (S2) yazmadan sonra veritabanından okunan hâlle kurulur: kayda istemcinin değil saklananın değeri girer.
// İz yazıcısı zorunludur; fiyatı değişen kayıt izsiz geçemez.
type FiyatIziYazici = (satirlar: readonly FiyatIzi[]) => void;

function fiyatIziniYaz(izYaz: FiyatIziYazici, eski: Talep | null, sonra: Talep): Talep {
  const satirlar = fiyatIzleri(eski, sonra);
  if (satirlar.length > 0) izYaz(satirlar);
  return sonra;
}

// SAT-41: yeni teklif ya da firması değişen teklif aktif bir tedarikçi firmayla kurulur. Eski teklifin sonradan pasifleşen firması korunur:
// aynı talep yeniden kaydedilince geçmiş teklif reddedilmez. Firma kimliği satın alma tedarikçisiyle finans firmasında aynıdır (SA1).
async function teklifFirmalariniDenetle(db: Db, gelen: TalepYazimi['teklifler'], eskiler: ReadonlyMap<string, { firmaId: number | null }>): Promise<void> {
  const yeniler = gelen.flatMap((q) => (q.firmaId !== null && eskiler.get(q.id)?.firmaId !== q.firmaId ? [q.firmaId] : []));
  if (yeniler.length === 0) return;
  const firmalar = await firmaOzetleri(db, yeniler);
  if (yeniler.some((id) => !tedarikciOlabilir(firmalar.get(id) ?? null))) throw gecersiz(ILETILER.firmaPasif);
  // Kayıtsız firma teklif alınca Tedarikçiler'e nötr başlangıçla eklenir; var olan kayıt değişmez.
  for (const firmaId of new Set(yeniler)) await s.tedarikciEkle(db, { firmaId, puan: 3, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null });
}

// B-001, B-010: kararı veren ve karar tarihi, senaryonun kişisi ve zamanı sunucunundur. Karar özü değişmediyse önceki kişi ve tarih
// korunur; yeni senaryo oturumdaki kişiyi ve sunucunun saatini alır, var olan senaryonun kişisi ve zamanı değişmez.
// SA3 a: döviz teklifinin kuru da burada yerleşir (kurallar `teklifKuru`); finansta o günün kuru yoksa kullanıcıdan istenir.
async function sunucuAlanlari(db: Db, k: Kullanici, t: TalepYazimi, eski: Talep | null): Promise<TalepYazimi> {
  const eskiKarar = eski?.karar ?? null;
  const karar = t.karar === null ? null : eskiKarar !== null && !kararDegistiMi(eskiKarar, t.karar)
    ? { ...t.karar, kararVerenKisiId: eskiKarar.kararVerenKisiId, kararTarihi: eskiKarar.kararTarihi }
    : { ...t.karar, kararVerenKisiId: k.id, kararTarihi: await s.bugun(db) };
  const eskiSenaryolar = new Map((eski?.senaryolar ?? []).map((x) => [x.id, x]));
  const senaryolar = t.senaryolar.map((x) => {
    const e = eskiSenaryolar.get(x.id);
    return e ? { ...x, kisiId: e.kisiId, olusturma: e.olusturma } : { ...x, kisiId: k.id, olusturma: '' };
  });
  const eskiTeklifler = new Map((eski?.teklifler ?? []).map((q) => [q.id, q]));
  await teklifFirmalariniDenetle(db, t.teklifler, eskiTeklifler);
  const teklifler: TalepYazimi['teklifler'] = [];
  for (const q of t.teklifler) {
    const kaynak = teklifKuru(q, eskiTeklifler.get(q.id));
    if (kaynak.tur === 'hazir') { teklifler.push({ ...q, kur: kaynak.kur }); continue; }
    const kur = await kurGetir(db, kaynak.paraBirimi, kaynak.tarih);
    if (kur === null) throw dogrulama(ILETILER.kurYok(kaynak.paraBirimi, kaynak.tarih), 'teklifler');
    teklifler.push({ ...q, kur: kur.kur });
  }
  // Ayarlar hiç kaydedilmemişse teklifin para birimi satırı yoktur; yazmadan önce eklenir (finansın kuruna dokunulmaz).
  await s.paraBirimleriniEkle(db, kullanilanParaBirimleri({ teklifler, karar }).map((paraBirimi) => ({ paraBirimi, aylikFaizYuzdesi: VARSAYILAN_AYLIK_FAIZ[paraBirimi] })));
  return { ...t, karar, senaryolar, teklifler };
}

// SAT-75: kaleme yeni bağlanan katalog kaleminin kartı satın alınabilir türde olmalı. Bağı değişmeyen kalem denetlenmez
// (kart sonradan değişse de eski talep düzenlenir); katalog kalemi bulunamazsa ya da kartsızsa karar burada verilmez.
// 257 a: kartı ya da birimi değişen kalem kartın birimiyle girilir; yeni bağlanan kart satın alınabilir olmalıdır.
type KalemOzu = { id: string; katalogId: string | null; ad: string; birim: string };
async function kalemKartlariniDenetle(db: Db, kalemler: readonly KalemOzu[], eskiler: readonly KalemOzu[]): Promise<void> {
  const eski = new Map(eskiler.map((x) => [x.id, x]));
  const yeniBaglar = new Set(kalemler.flatMap((x) => (x.katalogId !== null && eski.get(x.id)?.katalogId !== x.katalogId ? [x.katalogId] : [])));
  const idler = [...new Set(kalemler.flatMap((x) => (x.katalogId !== null && (yeniBaglar.has(x.katalogId) || eski.get(x.id)?.birim !== x.birim) ? [x.katalogId] : [])))];
  if (idler.length === 0) return;
  const baglar = await s.katalogMalzemeNolari(db, idler);
  const kartlar = await malzemeOzetleri(db, baglar.flatMap((x) => (x.no === null ? [] : [x.no])));
  const kartBirimi = new Map<string, string>();
  for (const b of baglar) {
    const kart = b.no === null ? undefined : kartlar.get(b.no);
    const red = kart === undefined || !yeniBaglar.has(b.id) ? null : satinAlinabilirKartReddi(kart);
    if (red !== null) throw dogrulama(red, 'kalemler');
    kartBirimi.set(b.id, kart?.birim ?? '');
  }
  const red = kartBirimiReddi(kalemler, eskiler, kartBirimi);
  if (red !== null) throw gecersiz(red);
}

export async function talepAc(db: Db, k: Kullanici, gelen: TalepYazimi, izYaz: FiyatIziYazici): Promise<Talep> {
  if (!k.islemler.includes(ISLEM.yaz) && (!talepEdenDurumu(gelen.durum) || gelen.teklifler.length > 0 || gelen.karar !== null)) {
    throw yetkiYok(ILETILER.yalnizTaslak);
  }
  // B-002: açılış taslaktan geçiştir; onaya ve siparişe açılışta geçilmez.
  if (!gecisVarMi('taslak', gelen.durum)) throw gecersiz(ILETILER.acilisDurumu);
  const t = await sunucuAlanlari(db, k, gelen, null);
  await kalemKartlariniDenetle(db, t.kalemler, []);
  const talepEden = await talepEdeniDenetle(db, k, t.talepEdenKisiId);
  await birimiDenetle(db, t.birim);
  await emriDenetle(db, t.uretimEmriId, null);
  const no = await belgeNo(db, 'satin-alma.talep-no', (x) => s.talepNoVarMi(db, x));
  await kisitKorumali({}, () => s.talepEkle(db, t, no, talepEden, k.id), { CAKISMA: ILETILER.talepVar });
  await s.altKayitlariYaz(db, t, siparisNoVerici(db));
  for (const h of t.hareketler) await s.hareketEkle(db, t.id, h.id, h.metin, k.id);
  return gorunen(k, fiyatIziniYaz(izYaz, null, (await talepOku(db, t.id))!));
}

// #375: talep edenin eline geçen her talep onun görünümüyle döner (teklif, fiyat, tedarikçi, karar yok).
const gorunen = (k: Kullanici, t: Talep): Talep => (tamGorurMu(k.islemler) ? t : talepEdenGorunumu(t, k.id));

// #375: ana sayfadaki "Taleplerim": yalnız kişinin açtığı ya da adına açılan talepler, yeniden eskiye.
export async function taleplerim(db: Db, k: Kullanici, sinir: number): Promise<TaleplerimCevabi> {
  const satirlar = await s.talepSatirlariOku(db, k.id);
  const talepler = await talepleriKur(db, satirlar.slice(0, sinir));
  return { talepler: talepler.map(talebim), toplam: satirlar.length };
}

// #375: ana sayfadan talep. Kişi her zaman oturumdaki kişidir; kart seçilen kalem kataloğa bağlanır (katalogda yoksa karttan açılır),
// kartsız kalem "kart bekliyor" kalır. Talep taslak açılır: satın almanın iş kutusundadır, talep eden düzeltip silebilir.
// Numara ayardaki kalıptan gelir. Talep ve sipariş numarası Logo fiş numarası olur; sığmayan kalıp kayıt açtırmaz.
const LOGO_FIS_NO_EN_COK = 16;
async function belgeNo(db: Db, anahtar: 'satin-alma.talep-no' | 'satin-alma.siparis-no',
  varMi: (no: string) => Promise<boolean>): Promise<string> {
  const no = await numaraAl(db, anahtar, { varMi });
  if (no.length > LOGO_FIS_NO_EN_COK) throw gecersiz(ILETILER.numaraUzun);
  return no;
}
const siparisNoVerici = (db: Db) => () => belgeNo(db, 'satin-alma.siparis-no', (x) => s.siparisNoVarMi(db, x));

export async function hizliAc(db: Db, k: Kullanici, g: HizliAcYazimi, izYaz: FiyatIziYazici): Promise<Talebim> {
  g.kalemler.forEach((x, i) => {
    const red = hizliKalemReddi(x);
    if (red !== null) throw dogrulama(red, `kalemler.${i}`);
  });
  const nolar = [...new Set(g.kalemler.flatMap((x) => (x.malzemeNo === null ? [] : [x.malzemeNo])))];
  const kartlar = await malzemeOzetleri(db, nolar);
  for (const no of nolar) {
    const red = talepKartiReddi(kartlar.get(no), g.tur);
    if (red !== null) throw dogrulama(red, 'kalemler');
  }
  if (nolar.length > 0) await s.katalogEklemeKilidi(db);
  const baglar = new Map((await s.katalogBaglari(db, nolar)).map((b) => [b.no, b.id]));
  for (const no of nolar.filter((n) => !baglar.has(n))) {
    const yeni = await katalogKaydet(db, k, { id: randomUUID(), malzemeNo: no, ozellik: '', notlar: '', takmaAdlari: [], surum: null });
    baglar.set(no, yeni.id);
  }
  const kalemler: TalepYazimi['kalemler'] = g.kalemler.map((x) => {
    const kart = x.malzemeNo === null ? null : kartlar.get(x.malzemeNo)!;
    const kopya = kart === null ? null : kartKopyasi(kart);
    return {
      id: randomUUID(), katalogId: x.malzemeNo === null ? null : baglar.get(x.malzemeNo)!, ad: kopya?.ad ?? x.ad, ozellik: x.aciklama,
      miktar: sade(x.miktar), birim: kopya?.birim ?? x.birim, kategori: kopya?.kategori ?? KARTSIZ_KATEGORI[g.tur],
    };
  });
  const t: TalepYazimi = {
    id: g.id, baslik: hizliBaslik(kalemler.map((x) => x.ad)), birim: null, talepEdenKisiId: k.id, oncelik: 'normal', ihtiyacTarihi: g.ihtiyacTarihi,
    notlar: g.aciklama, durum: 'taslak', iptalNedeni: '', agirliklar: null, kalemler, teklifIstekleri: [], teklifler: [], karar: null,
    onaylar: [], hareketler: [], senaryolar: [], uretimEmriId: g.uretimEmriId,
  };
  return talebim(await talepAc(db, k, t, izYaz));
}

// E-13: Kalite Merkezi stok üzerinden satın almayı ithal eder; tedarikçi onay durumunu sunucu açılışında kablolama kaydeder (ADR 0006).
// Kayıtsız süreçte (çözücüyü kurmayan araç ya da test) kalite durumu bilinmez: denetlenmez ve gösterimde null'dır.
export type KaliteDurumuCozucusu = (db: Db, firmaIdler: readonly number[]) => Promise<ReadonlyMap<number, KmTedarikciDurumu>>;
let kaliteDurumuCozucu: KaliteDurumuCozucusu | null = null;
export function kaliteDurumuCozucusuKaydet(cozucu: KaliteDurumuCozucusu | null): void { kaliteDurumuCozucu = cozucu; }
const kaliteDurumlari = async (db: Db, firmaIdler: readonly number[]): Promise<ReadonlyMap<number, KmTedarikciDurumu>> =>
  kaliteDurumuCozucu === null || firmaIdler.length === 0 ? new Map() : kaliteDurumuCozucu(db, firmaIdler);

// SAT-76, E-13 (236 a): tedarikçinin Kalite Merkezi onayı "Aday" ya da "Askıda" ise yeni sipariş verilmez. Durum firma kimliğiyle okunur;
// satın almanın eski durum sütunu bakılmaz. Ad firma kartından okunur; kartı olmayan firmanın kimliği yazılır.
async function askidakiTedarikciyiDenetle(db: Db, eski: Talep, yeni: TalepYazimi): Promise<void> {
  const yeniler = yeniSiparisFirmalari(eski, yeni);
  if (yeniler.length === 0) return;
  const durumlar = await kaliteDurumlari(db, yeniler);
  const reddedilen = yeniler.filter((id) => kaliteSiparisReddi(durumlar.get(id)));
  if (reddedilen.length === 0) return;
  const firmalar = await firmaOzetleri(db, reddedilen);
  const red = askidakiTedarikciReddi(reddedilen.map((id) => `${firmalar.get(id)?.ad ?? `#${id}`} (${durumlar.get(id)})`));
  if (red !== null) throw gecersiz(red);
}

// SAT-07, SAT-30, SAT-45, SAT-64: değişiklik sınıflanır, gereken işlem aranır, durum geçişi ve dört göz denetlenir; sonra sürümle yazılır.
export async function talepKaydet(db: Db, k: Kullanici, id: string, g: TalepKaydetYazimi, izYaz: FiyatIziYazici): Promise<Talep> {
  if (g.id !== id) throw dogrulama('Kimlik adresle aynı olmalı.', 'id');
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  const { surum, ...yeni } = g;
  const kendiTaslagi = (eski.acanKisiId === k.id || eski.talepEdenKisiId === k.id) && talepEdenDurumu(eski.durum) && talepEdenDurumu(yeni.durum);
  // Talep eden adsız teklifleri görür; değişikliği kendi gördüğü hâlle karşılaştırılır (SAT-53).
  const kiyas = tamGorurMu(k.islemler) ? eski : talepEdenGorunumu(eski, k.id);
  const red = degisiklikReddi(degisiklikTuru(kiyas, yeni), k.islemler, kendiTaslagi);
  if (red !== null) throw yetkiYok(red);
  if (!gecisVarMi(eski.durum, yeni.durum)) throw gecersiz(ILETILER.gecisYok);
  // Boş gelen talep eden mevcut olanı korur: kaydeden kişiye sessizce dönmez.
  const talepEden = await talepEdeniDenetle(db, k, yeni.talepEdenKisiId ?? eski.talepEdenKisiId);
  await birimiDenetle(db, yeni.birim);
  await emriDenetle(db, yeni.uretimEmriId, eski.uretimEmriId);
  // Talep edenin bütününde başkalarının teklifleri yoktur: talep eden yalnız gövdeyi değiştirdiyse teklif ve karar korunur.
  // "Teslim alındı" türetilmiş durumdur: veritabanına "sipariş verildi" yazılır (SAT-38).
  const temel: TalepYazimi = k.islemler.includes(ISLEM.yaz) || tamGorurMu(k.islemler)
    ? yeni : { ...yeni, teklifler: eski.teklifler, teklifIstekleri: eski.teklifIstekleri, karar: eski.karar, senaryolar: eski.senaryolar };
  // B-002: onay yalnız onaydaki, kararı verilmiş talebe eklenir; onaylı karar ret gelmeden değişmez; sipariş onaylı karar ister.
  const yeniOnaylar = yeni.onaylar.filter((x) => !eski.onaylar.some((o) => o.id === x.id));
  if (yeniOnaylar.length > 0 && (eski.durum !== 'onayda' || temel.karar === null)) {
    throw gecersiz(ILETILER.onayDurumu);
  }
  if (kararDegistiMi(eski.karar, temel.karar) && kararOnayliMi(eski.onaylar)) throw gecersiz(ILETILER.onayliKararDegismez);
  const siparisRed = siparisReddi(eski.durum, temel.durum, temel.karar !== null, [...eski.onaylar, ...yeniOnaylar])
    ?? kartsizSiparisReddi(eski.durum, temel.durum, temel.kalemler)
    ?? siparisliKalemReddi(eski, temel.kalemler)
    ?? logoSiparisDegisikligiReddi(eski, temel)
    ?? logoIptalGeriAlmaReddi(eski, temel.durum);
  if (siparisRed !== null) throw gecersiz(siparisRed);
  await askidakiTedarikciyiDenetle(db, eski, temel);
  await kalemKartlariniDenetle(db, temel.kalemler, eski.kalemler);
  const sunucudan = await sunucuAlanlari(db, k, temel, eski);
  const yazilacak: TalepYazimi = sunucudan.durum === 'teslim_alindi' ? { ...sunucudan, durum: 'siparis_verildi' } : sunucudan;
  await surumluGuncelle({
    guncelle: () => s.talepGuncelle(db, yazilacak, talepEden, surum),
    varMi: () => s.talepVarMi(db, id),
    bulunamadiIletisi: ILETILER.talepYok,
  });
  // 221 a: onaya yeni düşen talep onaylayanlara bildirilir; onaydayken yeniden kaydetmek yeni bildirim açmaz.
  if (yazilacak.durum === 'onayda' && eski.durum !== 'onayda') {
    await bildirimGonder(db, {
      tur: 'satin-alma.talep-onay-bekliyor', baslik: `Onay bekleyen talep: ${eski.no}`, metin: yazilacak.baslik, yol: '/satin-alma/onaylar', kaynakKimlik: id, haric: k.id,
    });
  }
  const guncellenecek = logoGuncellenecekSiparisler(eski, yazilacak);
  await s.altKayitlariYaz(db, yazilacak, siparisNoVerici(db));
  await s.siparisGuncellemesiniIsaretle(db, id, guncellenecek);
  const siparisteMi = (d: TalepDurumu) => d === 'siparis_verildi' || d === 'teslim_alindi';
  if (siparisteMi(yazilacak.durum) && !siparisteMi(eski.durum)) {
    await s.siparisleriLogoyaIsaretle(db, id, ILETILER.logoKayitsizTedarikci);
    await varsayilanPlanlariYaz(db, k, id);
  }
  if (yazilacak.durum === 'iptal' && eski.durum !== 'iptal') await s.siparisIptaliniLogoyaIsaretle(db, id);
  // Sipariş bilgisi (beklenen teslim, tedarikçi) ya da durum değişmiş olabilir: alım satırları her kayıtta eşitlenir.
  if (siparisteMi(yazilacak.durum) || siparisteMi(eski.durum)) await alimlariBildir(db, k, id);
  for (const o of yeniOnaylar) {
    // Dört göz yazılan kararın sahibine bakar (B-001): istemcinin gönderdiği ya da eski karar değil.
    const sonuc = dortGozSonucu(k.id, yazilacak.karar?.kararVerenKisiId ?? null, await sistemAyariOku(db, 'satin-alma.dort-goz'));
    if (sonuc === 'red') throw yetkiYok(ILETILER.dortGoz);
    await s.onayEkle(db, id, o, k.id, sonuc === 'dortGozsuz');
  }
  if (talepFisiGiderMi(eski.onaylar, yeniOnaylar, yazilacak.durum)) await s.talebiLogoyaIsaretle(db, id);
  if (yazilacak.durum === 'iptal' && eski.durum !== 'iptal') await s.talepIptaliniLogoyaIsaretle(db, id);
  const eskiHareketler = new Set(eski.hareketler.map((h) => h.id));
  for (const h of yeni.hareketler.filter((x) => !eskiHareketler.has(x.id))) await s.hareketEkle(db, id, h.id, h.metin, k.id);
  return gorunen(k, fiyatIziniYaz(izYaz, eski, (await talepOku(db, id))!));
}

// Borç 36: talep önce kilitlenip sürümü artar, sonra okunur; aradaki teslim kaydı denetimden kaçmaz.
export async function siparisKalemiDegistir(db: Db, k: Kullanici, id: string, g: SiparisKalemiDegistirYazimi): Promise<Talep> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, id, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  const eski = (await talepOku(db, id))!;
  const red = siparisKalemiDegisikligiReddi(eski, g);
  if (red !== null) throw gecersiz(red);
  const kalem = eski.kalemler.find((x) => x.id === g.kalemId)!;
  await kalemKartlariniDenetle(db, [{ ...kalem, birim: g.birim }], [kalem]);
  await s.siparisKalemiYaz(db, id, g.kalemId, g.miktar, g.birim);
  await s.siparisGuncellemesiniIsaretle(db, id, (eski.karar?.siparisler ?? []).filter((x) => x.satirlar.some((r) => r.kalemId === g.kalemId)).map((x) => x.teklifId));
  await s.hareketEkle(db, id, randomUUID(), siparisDegisikligiMetni(eski.kalemler.find((x) => x.id === g.kalemId)!, g), k.id);
  return gorunen(k, (await talepOku(db, id))!);
}

// Kart #1310: malzemeyi tedarikçi mi getirir, biz mi alırız. Siparişten önce de sonra da değişebilir; sevkiyattaki alım satırı izler.
export async function teslimYontemiDegistir(db: Db, k: Kullanici, id: string, g: TeslimYontemiYazimi): Promise<Talep> {
  await surumluGuncelle({ guncelle: () => s.teslimYontemiYaz(db, id, g.teslimYontemi, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  await alimlariBildir(db, k, id);
  return gorunen(k, (await talepOku(db, id))!);
}
async function alimlariBildir(db: Db, k: Kullanici, id: string): Promise<void> {
  const t = (await talepOku(db, id))!;
  await alimBildir(db, { talepId: id, talepNo: t.no, alimlar: talebinAlimlari(t), kisiId: k.id });
}

// "Kalanı kapat" (#205 S2 b): talep önce kilitlenir (teslimle sıraya girer); kapatma Logo kuyruğuna girer, gerekçe harekete yazılır.
export async function siparisKapat(db: Db, k: Kullanici, id: string, g: SiparisKapatYazimi): Promise<Talep> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, id, g.surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  const eski = (await talepOku(db, id))!;
  const red = siparisKapatmaReddi(eski, g.teklifId);
  if (red !== null) throw gecersiz(red);
  if (!(await s.siparisiKapatmayaIsaretle(db, id, g.teklifId))) throw gecersiz(ILETILER.kapatmaVar);
  const sip = eski.karar!.siparisler.find((x) => x.teklifId === g.teklifId)!;
  await s.hareketEkle(db, id, randomUUID(), `Sipariş ${sip.no ?? sip.siparisNo} kalanı kapatıldı: ${g.gerekce}`, k.id);
  return gorunen(k, (await talepOku(db, id))!);
}

// D6 b: siparişin tedarikçisinin alış faturaları; bu siparişe ve başka siparişe bağlı olanlar işaretli. Tutar gelmez (FNS-48).
async function siparisFirmasi(db: Db, talepId: string, teklifId: string): Promise<{ firmaId: number; talep: Talep }> {
  const talep = await talepOku(db, talepId);
  if (talep === null) throw bulunamadi(ILETILER.talepYok);
  const f = siparisFaturaFirmasi(talep, teklifId);
  if ('red' in f) throw gecersiz(f.red);
  return { firmaId: f.firmaId, talep };
}
async function faturaListesi(db: Db, firmaId: number, talepId: string, teklifId: string): Promise<SiparisFaturalariCevabi> {
  return {
    faturalar: (await alisBelgeleri(db, firmaId)).map((b) => {
      const bagli = b.satinAlmaSiparisi?.talepId === talepId && b.satinAlmaSiparisi.teklifId === teklifId;
      return { id: b.id, belgeNo: b.belgeNo, belgeTarihi: b.belgeTarihi, aciklama: b.aciklama, bagli, baskaSipariste: b.satinAlmaSiparisi !== null && !bagli };
    }),
  };
}
export async function siparisFaturalari(db: Db, talepId: string, teklifId: string): Promise<SiparisFaturalariCevabi> {
  const { firmaId } = await siparisFirmasi(db, talepId, teklifId);
  return faturaListesi(db, firmaId, talepId, teklifId);
}
// Bağı finansın komutu yazar; satın alma siparişin tedarikçisini verir, başka siparişe bağlı faturayı üstüne yazdırmaz.
// Bağlama ve kaldırma talebin geçmişine yazılır.
export async function siparisFaturasiYaz(db: Db, k: Kullanici, talepId: string, g: SiparisFaturasiYazimi): Promise<SiparisFaturalariCevabi> {
  const { firmaId, talep } = await siparisFirmasi(db, talepId, g.teklifId);
  await s.faturaBagKilidi(db, g.belgeId);
  const mevcut = (await faturaListesi(db, firmaId, talepId, g.teklifId)).faturalar.find((f) => f.id === g.belgeId);
  if (g.bagla && mevcut?.baskaSipariste) throw gecersiz(ILETILER.faturaBaskaSipariste);
  if (!g.bagla && !mevcut?.bagli) throw gecersiz(ILETILER.faturaBagliDegil);
  if (g.bagla && mevcut?.bagli) return faturaListesi(db, firmaId, talepId, g.teklifId);
  await belgeSiparisBagla(db, k.id, { belgeId: g.belgeId, siparisFirmaId: firmaId, siparis: g.bagla ? { talepId, teklifId: g.teklifId } : null });
  const ad = mevcut?.belgeNo ?? `#${g.belgeId}`;
  const tedarikci = talep.teklifler.find((x) => x.id === g.teklifId)?.tedarikciAdi ?? '';
  await s.hareketEkle(db, talepId, randomUUID(), `${g.bagla ? 'Fatura bağlandı' : 'Fatura bağı kaldırıldı'}: ${ad}${tedarikci ? ` (${tedarikci})` : ''}`, k.id);
  return faturaListesi(db, firmaId, talepId, g.teklifId);
}

// Kart #1124: siparişin ödeme planı ve takip satırları. Plan finanstadır (beklenen ödeme); fatura finansta girilir, siparişe bağlanır.
async function takipKur(db: Db, talep: Talep): Promise<SiparisTakibiCevabi> {
  const siparisler = talep.karar?.siparisler ?? [];
  const planlar = await siparisPlanlari(db, siparisler.map((x) => ({ talepId: talep.id, teklifId: x.teklifId })));
  return {
    siparisler: siparisler.map((x) => {
      const p = planlar.get(`${talep.id}:${x.teklifId}`) ?? { satirlar: [], faturalar: [] };
      return {
        teklifId: x.teklifId, satirIdleri: x.satirlar.map((r) => r.id), paraBirimi: talep.teklifler.find((q) => q.id === x.teklifId)?.paraBirimi ?? 'TRY',
        odemePlani: p.satirlar.map((r) => ({ ...r, tutar: sade(r.tutar) })),
        faturalar: p.faturalar.map(({ belgeNo, belgeTarihi, vade }) => ({ belgeNo, belgeTarihi, vade })),
      };
    }),
  };
}
export async function siparisTakibi(db: Db, talepId: string): Promise<SiparisTakibiCevabi> {
  const talep = await talepOku(db, talepId);
  if (talep === null) throw bulunamadi(ILETILER.talepYok);
  return takipKur(db, talep);
}
const siparisNumarasi = (x: { no?: string | null; siparisNo: string }): string => x.no ?? x.siparisNo;
// SAT-73: talep önce kilitlenip sürümü artar (plan değişikliği talebin değişikliğidir), sonra plan finansa yazılır ve geçmişe girer.
export async function odemePlaniYaz(db: Db, k: Kullanici, talepId: string, g: OdemePlaniYazimi): Promise<SiparisTakibiCevabi> {
  await surumluGuncelle({ guncelle: () => s.talepSurumuArttir(db, talepId, g.surum), varMi: () => s.talepVarMi(db, talepId), bulunamadiIletisi: ILETILER.talepYok });
  const talep = (await talepOku(db, talepId))!;
  const hedef = odemePlaniHedefi(talep, g.teklifId);
  if ('red' in hedef) throw gecersiz(hedef.red);
  const sip = talep.karar!.siparisler.find((x) => x.teklifId === g.teklifId)!;
  await siparisOdemePlaniYaz(db, k.id, { siparis: { talepId, teklifId: g.teklifId }, siparisNo: siparisNumarasi(sip), firmaId: hedef.firmaId, paraBirimi: hedef.paraBirimi, satirlar: g.satirlar });
  await s.hareketEkle(db, talepId, randomUUID(), `Sipariş ${siparisNumarasi(sip)} ödeme planı güncellendi: ${g.satirlar.map((x) => `${x.vade} ${x.tutar} ${hedef.paraBirimi}`).join(', ')}`, k.id);
  return takipKur(db, (await talepOku(db, talepId))!);
}
// SAT-74: siparişe çevrilirken planı olmayan her siparişe tekliften plan kurulur; tedarikçisi finansta kayıtlı olmayan ya da toplamı
// sıfır olan sipariş plansız kalır (ödeme planı sonra elle girilir).
async function varsayilanPlanlariYaz(db: Db, k: Kullanici, talepId: string): Promise<void> {
  const talep = (await talepOku(db, talepId))!;
  const mevcut = await siparisPlanlari(db, (talep.karar?.siparisler ?? []).map((x) => ({ talepId, teklifId: x.teklifId })));
  for (const kosul of await s.siparisOdemeKosullari(db, talepId)) {
    if ((mevcut.get(`${talepId}:${kosul.teklifId}`)?.satirlar.length ?? 0) > 0) continue;
    const hedef = odemePlaniHedefi(talep, kosul.teklifId);
    const plan = varsayilanOdemePlani(kosul, tesisGunu(new Date()));
    const sip = talep.karar?.siparisler.find((x) => x.teklifId === kosul.teklifId);
    if ('red' in hedef || plan.length === 0 || sip === undefined) continue;
    await siparisOdemePlaniYaz(db, k.id, { siparis: { talepId, teklifId: kosul.teklifId }, siparisNo: siparisNumarasi(sip), firmaId: hedef.firmaId, paraBirimi: hedef.paraBirimi, satirlar: plan });
  }
}

// SAT-66: yalnız taslak silinir (tetikleyici); satın alma her taslağı, talep eden kendi taslağını siler.
export async function talepSil(db: Db, k: Kullanici, id: string, surum: number): Promise<{ tamam: true }> {
  const eski = await talepOku(db, id);
  if (eski === null) throw bulunamadi(ILETILER.talepYok);
  const kendi = eski.acanKisiId === k.id || eski.talepEdenKisiId === k.id;
  if (!k.islemler.includes(ISLEM.yaz) && !(kendi && k.islemler.includes(ISLEM.talepAc))) throw yetkiYok();
  await surumluGuncelle({ guncelle: () => s.talepSil(db, id, surum), varMi: () => s.talepVarMi(db, id), bulunamadiIletisi: ILETILER.talepYok });
  return { tamam: true };
}

// SAT-41, SAT-42: tedarikçi finansta kayıtlı aktif bir firmadır (firma finansta açılır, burada seçilir; kullanıcı kararı S1,
// 07.10.2026); firma alanları finansta yazılır, burada yalnız satın almaya özgü olanlar.
export async function tedarikciKaydet(db: Db, k: Kullanici, t: TedarikciKaydetYazimi): Promise<Tedarikci> {
  if (t.surum === null) {
    if (!tedarikciOlabilir(await firmaOzeti(db, t.firmaId))) throw gecersiz(ILETILER.firmaPasif);
    if ((await s.tedarikciEkle(db, t)) === null) throw cakisma(ILETILER.tedarikciVar);
  } else {
    const surum = t.surum;
    await surumluGuncelle({ guncelle: () => s.tedarikciGuncelle(db, t, surum), varMi: () => s.tedarikciVarMi(db, t.firmaId), bulunamadiIletisi: ILETILER.tedarikciYok });
  }
  await s.tedarikciAltlariniYaz(db, t, k.id);
  return (await tedarikcileriKur(db, t.firmaId))[0]!;
}


// Silinmek istenen kayda başka tablo bağlıysa modülün iletisi döner (bağlayan yabancı anahtar başka modülde olabilir: türe göre yedek).
const bagliyken = <T>(is: () => Promise<T>): Promise<T> => kisitKorumali({}, is, { BAGIMLI_KAYIT: ILETILER.bagliKayit });

// Tedarikçi eklerken firma seçimi: finansın aktif tedarikçi firmaları adla aranır; zaten tedarikçi olanlar işaretlenir.
export async function firmaSecenekleri(db: Db, ara: string): Promise<{ id: number; ad: string; tedarikci: boolean }[]> {
  const bulunan = await firmaAra(db, { metin: ara, sinir: FIRMA_SECENEK_SINIRI, yalnizAktif: true, tur: 'tedarikci' });
  const tedarikciler = new Set((await s.tedarikcileriOku(db)).map((t) => t.firmaId));
  return bulunan.map((f) => ({ id: f.id, ad: f.ad, tedarikci: tedarikciler.has(f.id) }));
}
const FIRMA_SECENEK_SINIRI = 50;

// SA2 b: kataloğa bağlanacak kart malzemelerin aktif kartlarından aranır; kataloğa bağlı olan kalem kimliğiyle döner.
// #1192: talep türüne göre (malzeme: fiziksel kartlar, hizmet: alınan hizmet); boş arama ilk sayfayı verir.
export async function malzemeSecenekleri(db: Db, ara: string, tur: TalepTuru = 'malzeme'): Promise<MalzemeSecenekleriCevabi['malzemeler']> {
  const izin = TALEP_TURU_KARTLARI[tur];
  const bulunan = (await malzemeAra(db, {
    metin: ara === '' ? null : ara, turler: izin.turler, ...(izin.hizmetYonu ? { hizmetYonu: izin.hizmetYonu } : {}), sayfa: 1, sayfaBoyu: FIRMA_SECENEK_SINIRI, yalnizAktif: true,
  })).satirlar;
  const baglar = new Map((await s.katalogBaglari(db, bulunan.map((m) => m.id))).map((b) => [b.no, b.id]));
  return bulunan.map((m) => ({ no: m.id, kod: m.kod, ad: m.ad ?? m.kod, birim: m.birim, kategori: m.kategoriAdi, katalogId: baglar.get(m.id) ?? null }));
}

export async function tedarikciSil(db: Db, firmaId: number): Promise<{ tamam: true }> {
  const r = await bagliyken(() => s.tedarikciSil(db, firmaId));
  if (r === null) throw bulunamadi(ILETILER.tedarikciYok);
  return { tamam: true };
}

// SAT-58 (SA2 b), SAT-59: yeni kart malzemelerin sayfasında açılır; burada var olan aktif malzeme kartı kataloğa bağlanır
// (talep eden de bağlar). Düzenleme satın almanın. Kartı değişmeyen kalem, kart sonradan pasifleşse de düzenlenir.
export async function katalogKaydet(db: Db, k: Kullanici, g: KatalogKaydetYazimi): Promise<KatalogKaydi> {
  const yetkili = k.islemler.includes(ISLEM.yaz) || (g.surum === null && k.islemler.includes(ISLEM.talepAc));
  if (!yetkili) throw yetkiYok();
  const kart = (await malzemeOzetleri(db, [g.malzemeNo])).get(g.malzemeNo);
  const ayniKart = g.surum !== null && (await s.katalogMalzemeNosu(db, g.id)) === g.malzemeNo;
  const red = ayniKart && kart !== undefined ? null : katalogKartiReddi(kart) ?? satinAlinabilirKartReddi(kart);
  if (red !== null) throw dogrulama(red, 'malzemeNo');
  const yazim = { ...g, kategori: kartKopyasi(kart!).kategori };
  if (g.surum === null) {
    await s.katalogEklemeKilidi(db);
    if ((await s.katalogEkle(db, yazim)) === null) throw cakisma('Bu kimlikle bir katalog kalemi zaten var.');
  } else {
    const surum = g.surum;
    await surumluGuncelle({ guncelle: () => s.katalogGuncelle(db, yazim, surum), varMi: () => s.katalogVarMi(db, g.id), bulunamadiIletisi: ILETILER.katalogYok });
  }
  await s.takmaAdlariYaz(db, g.id, g.takmaAdlari);
  return (await katalogKur(db, g.id))[0]!;
}

export async function katalogSil(db: Db, id: string, surum: number): Promise<{ tamam: true }> {
  await bagliyken(() => surumluGuncelle({ guncelle: () => s.katalogSil(db, id, surum), varMi: () => s.katalogVarMi(db, id), bulunamadiIletisi: ILETILER.katalogYok }));
  return { tamam: true };
}

export async function sirketAdi(db: Db): Promise<string | null> {
  return sirketAdiGorunumu(await s.sirketAdiOku(db));
}

export async function ayarlarKaydet(db: Db, a: AyarlarKaydetYazimi): Promise<Ayarlar> {
  await surumluGuncelle({ guncelle: () => s.ayarGuncelle(db, a), varMi: async () => true });
  await bagliyken(() => s.ayarListeleriniYaz(db, a));
  return ayarlariKur(db);
}

// SAT-37: stokun mal kabul belgesi için teslim bekleyen sipariş satırları (fiyatsız). Kimlik verilirse yalnız o satırlar.
// Kalıp `kisiAdlari` ile aynı: boş dizide sorgu yok, olmayan kimlik sonuçta yok.
// SH1 a: stok mal kabul işleminin içinde çağırır (çağıranın işlemi; yetki stok ucundadır). Kişi oturumdan, zaman sunucudan.
// Kalanı aşan miktar reddedilmez, sipariş satırında fazla teslim görünür. Aynı mal kabul satırı ikinci kez yazılmaz.
export async function teslimIsle(db: Db, k: Kullanici, g: { siparisSatirId: number; miktar: string; malKabulSatirId: number }): Promise<void> {
  if (!ondalikMetinSemasi.safeParse(g.miktar).success || ondalikKiyas(g.miktar, '0') <= 0) throw gecersiz(ILETILER.teslimMiktari);
  const hedef = await s.teslimHedefiKilitle(db, g.siparisSatirId);
  if (hedef === null) throw gecersiz(ILETILER.teslimSiparisYok);
  if (hedef.talepDurumu !== 'siparis_verildi') throw gecersiz(ILETILER.teslimDurumu);
  if (hedef.kapali) throw gecersiz(ILETILER.kapaliSipariseTeslim);
  if ((await s.malKabulNetleri(db, g.malKabulSatirId)).length > 0) throw cakisma(ILETILER.teslimTekrar);
  await s.teslimEkle(db, g.siparisSatirId, g.malKabulSatirId, g.miktar, k.id);
}

// Mal kabul düzeltilince (stok DEP-53) eski satırın teslimi ters kayıtla geri alınır; kayıt silinmez.
export async function teslimGeriAl(db: Db, k: Kullanici, g: { malKabulSatirId: number }): Promise<void> {
  const netler = await s.malKabulNetleri(db, g.malKabulSatirId);
  if (netler.length === 0) throw gecersiz(ILETILER.teslimGeriAlinacakYok);
  for (const n of netler) {
    await s.teslimHedefiKilitle(db, n.siparisSatiriId);
    await s.teslimEkle(db, n.siparisSatiriId, g.malKabulSatirId, n.net.startsWith('-') ? n.net.slice(1) : `-${n.net}`, k.id);
  }
}

// Stok değeri için (stok isteği): malzeme no -> son alış fiyatı; teslimi olmayan malzeme haritada yoktur.
export interface SonAlisFiyati { birimFiyat: string; paraBirimi: string; tryBirimFiyat: string | null; zaman: string }
export async function sonAlisFiyatlari(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, SonAlisFiyati>> {
  if (malzemeNolar.length === 0) return new Map();
  const l = await s.sonAlisFiyatlariOku(db, [...new Set(malzemeNolar)]);
  return new Map(l.map(({ malzemeNo, ...x }) => [malzemeNo, { ...x, birimFiyat: sade(x.birimFiyat), tryBirimFiyat: x.tryBirimFiyat === null ? null : sade(x.tryBirimFiyat) }]));
}
// Stok değeri (stok isteği, kullanıcı kararı 12.10.2026): ağırlıklı ortalama alış fiyatı; istenen her malzeme haritadadır,
// teslimi olmayanın fiyatı boş.
// Plan motoru: açık siparişte gelecek malzeme, termin sırasıyla (tarihsiz en sonda). Miktar kalemin birimiyle; fiyat yok.
export interface MalzemeGelisi { tarih: string | null; miktar: string; birim: string; siparisNo: string }
export async function malzemeGelisTarihleri(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, MalzemeGelisi[]>> {
  const tekil = [...new Set(malzemeNolar)];
  const m = new Map<number, MalzemeGelisi[]>();
  if (tekil.length === 0) return m;
  for (const { malzemeNo, ...x } of await s.malzemeGelisleriOku(db, tekil)) m.set(malzemeNo, [...(m.get(malzemeNo) ?? []), { ...x, miktar: sade(x.miktar) }]);
  return m;
}
export interface OrtalamaAlisFiyati { tryBirimFiyat: string | null; teslimSayisi: number }
export async function ortalamaAlisFiyatlari(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, OrtalamaAlisFiyati>> {
  if (malzemeNolar.length === 0) return new Map();
  const l = await s.ortalamaAlisFiyatlariOku(db, [...new Set(malzemeNolar)]);
  return new Map(l.map(({ malzemeNo, tryBirimFiyat, teslimSayisi }) => [malzemeNo, { tryBirimFiyat: sade(tryBirimFiyat), teslimSayisi }]));
}
export function siparisSatirlari(db: Db, idler?: readonly number[]): Promise<s.SiparisSatiriOkuma[]> {
  if (idler !== undefined && idler.length === 0) return Promise.resolve([]);
  return s.siparisSatirlariOku(db, idler === undefined ? null : [...new Set(idler)]).then((l) => l.map((x) => ({ ...x, miktar: sade(x.miktar), kalanMiktar: sade(x.kalanMiktar) })));
}

// İkinci menü sayıları (şartname): yetkisi olmayan maddenin sayısı boş; hesaplanmayan (iş kutusu, raporlar, ayarlar) boş, sıfır uydurulmaz.
// Ana sayfa pano kartları: onay bekleyen onaylayana, iş sayıları satın almayı yazana, açık sipariş satın almayı okuyana.
export async function panoOzeti(db: Db, k: Kullanici): Promise<SatinAlmaOzetiCevabi> {
  const var_ = (i: (typeof k.islemler)[number]) => k.islemler.includes(i);
  const okur = var_(ISLEM.oku) || var_(ISLEM.yaz);
  // Depo mal kabulü stokta yapar (`stok.giris`); teslim bekleyen satır sayısını satın almayı okumadan görür.
  const kabulEder = var_('stok.giris');
  if (!var_(ISLEM.onayla) && !var_(ISLEM.yaz) && !okur && !kabulEder) return { onayBekleyen: null, acikTalep: null, teslimBekleyenSatir: null, acikSiparis: null, acikSiparisTutari: null };
  const n = await s.panoSayilari(db);
  return {
    onayBekleyen: var_(ISLEM.onayla) ? n.onayBekleyen : null,
    acikTalep: var_(ISLEM.yaz) ? n.acikTalep : null,
    teslimBekleyenSatir: var_(ISLEM.yaz) || kabulEder ? n.teslimBekleyenSatir : null,
    acikSiparis: okur ? n.acikSiparis : null,
    acikSiparisTutari: okur && n.acikSiparisTutari !== null ? sade(n.acikSiparisTutari) : null,
  };
}
// Sertifika ve rapor sipariş satırına bağlanır: belge Çizimler'de açılır, yayınlanır ve satıra bağlanır; dosya satırın ucundan
// verilir (okuma yetkisi satın almanındır). Stok mal kabulde satırın belgelerini disari.ts ile okur.
const BELGE_HEDEFI = 'satin-alma';
const SATIR_YOK = 'Sipariş satırı bulunamadı.';
const BELGE_YOK = 'Belge bu sipariş satırına bağlı değil.';
const belgeOzeti = ({ id, ad, tur, harf }: BagliBelge): SiparisBelgesi => ({ id, ad, tur, harf });
async function satirOlmali(db: Db, satirId: number): Promise<void> {
  if (!(await s.siparisSatiriVarMi(db, satirId))) throw bulunamadi(SATIR_YOK);
}
export async function siparisBelgeleri(db: Db, satirId: number): Promise<SiparisBelgeleriCevabi> {
  await satirOlmali(db, satirId);
  return { belgeler: (await kaydaBagliBelgeler(db, BELGE_HEDEFI, satirId)).map(belgeOzeti) };
}
export async function siparisBelgesiEkle(
  db: Db, k: Kullanici, satirId: number, g: SiparisBelgesiYazimi, denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<SiparisBelgeleriCevabi> {
  await satirOlmali(db, satirId);
  await belgeAcVeBagla(db, k, { ad: g.ad, tur: g.tur, ozet: g.ozet, dosyaAdi: g.dosyaAdi }, BELGE_HEDEFI, satirId, denetimEki);
  return siparisBelgeleri(db, satirId);
}
export async function siparisBelgesiKaldir(db: Db, satirId: number, belgeId: number): Promise<SiparisBelgeleriCevabi> {
  await satirOlmali(db, satirId);
  if (!(await kayittanKaldir(db, belgeId, BELGE_HEDEFI, satirId))) throw bulunamadi(BELGE_YOK);
  return siparisBelgeleri(db, satirId);
}
export async function siparisBelgesiDosyasi(db: Db, satirId: number, belgeId: number): Promise<IkiliCevap> {
  const dosya = await kayittakiBelgeDosyasi(db, BELGE_HEDEFI, satirId, belgeId);
  if (dosya === null) throw bulunamadi(BELGE_YOK);
  return dosya;
}
// Stok mal kabulü için: satır başına bağlı belgeler; belgesi olmayan satır haritada yoktur.
export async function siparisSatiriBelgeleri(db: Db, satirIdler: readonly number[]): Promise<Map<number, SiparisBelgesi[]>> {
  const m = await kayitlaraBagliBelgeler(db, BELGE_HEDEFI, satirIdler);
  return new Map([...m].map(([id, l]) => [id, l.map(belgeOzeti)]));
}
// Dış operasyonlar (kart #542): fason iş emirleri üretim emirlerinden; firma adı finanstan, gecikme kuraldan.
export async function disOperasyonlar(db: Db): Promise<DisOperasyonlarCevabi> {
  const liste = await fasonIsEmirleri(db);
  const firmalar = await firmaOzetleri(db, [...new Set(liste.flatMap((x) => (x.firmaId === null ? [] : [x.firmaId])))]);
  const gun = await s.bugun(db);
  return {
    hazir: true,
    operasyonlar: liste.map(({ ilkGidis, ...x }) => ({
      ...x, gerceklesenGidis: ilkGidis, firmaAdi: x.firmaId === null ? null : (firmalar.get(x.firmaId)?.ad ?? null),
      gecikmeGun: gecikmeGunu(x.termin, x.ilkDonus, gun),
    })),
  };
}
// Fason grafikleri: gerçekleşen geçmiş (son `sonGun` günde başlayan) kırılımda ve firma bazında termin uyumu; adlar kendi sahibinden.
export async function fasonSureleri(db: Db, sonGun: number): Promise<FasonSureleriCevabi> {
  const gecmis = await fasonGecmisi(db, { sonGun });
  const kirilimlar = fasonKirilimlari(fasonSureOrnekleri(gecmis));
  const uyum = fasonTerminUyumu(gecmis);
  const firmalar = await firmaOzetleri(db, [...new Set([...kirilimlar.map((k) => k.firmaId), ...uyum.map((u) => u.firmaId)])]);
  const malzemeler = await malzemeOzetleri(db, kirilimlar.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])));
  const tipler = await operasyonTipleri(db, { pasiflerDahil: true });
  const tipAdi = new Map(tipler.map((t) => [t.id, t.ad]));
  return {
    sureler: kirilimlar.map((k) => ({
      ...k, malzemeAdi: k.malzemeNo === null ? null : (malzemeler.get(k.malzemeNo)?.ad ?? malzemeler.get(k.malzemeNo)?.kod ?? null),
      operasyonAdi: tipAdi.get(k.operasyonTipiId) ?? null, firmaAdi: firmalar.get(k.firmaId)?.ad ?? null,
    })),
    terminUyumu: uyum.map((u) => ({ ...u, firmaAdi: firmalar.get(u.firmaId)?.ad ?? null })),
  };
}

// Plan için fason süresi tahmini (sorgularla aynı sırada, takvim günü); veri yoksa null. Yetki denetlemez, yalnız okur; geçmişi tek okumada alır.
export async function fasonSuresiTahminleri(
  db: Db, sorgular: readonly { malzemeNo: number; operasyonTipiId: number | null; firmaId: number; adet: number }[],
): Promise<(number | null)[]> {
  if (!sorgular.some((q) => q.operasyonTipiId !== null)) return sorgular.map(() => null);
  const tek = (l: Set<number>): number | undefined => (l.size === 1 ? [...l][0] : undefined);
  const gecmis = await fasonGecmisi(db, { firmaId: tek(new Set(sorgular.map((q) => q.firmaId))), malzemeNo: tek(new Set(sorgular.map((q) => q.malzemeNo))) });
  const ornekler = fasonSureOrnekleri(gecmis);
  return sorgular.map((q) => (q.operasyonTipiId === null ? null : fasonSuresiTahmini(ornekler, { ...q, operasyonTipiId: q.operasyonTipiId })));
}
export async function menuSayaclari(db: Db, k: Kullanici): Promise<Record<string, number | null>> {
  const var_ = (i: (typeof k.islemler)[number]) => k.islemler.includes(i);
  const n = await s.menuSayilari(db);
  return {
    'is-kutusu': null,
    'dis-operasyonlar': null,
    talepler: var_(ISLEM.oku) ? n.acik : null,
    onaylar: var_(ISLEM.onayla) ? n.onayda : null,
    malzemeler: var_(ISLEM.oku) ? n.katalog : null,
    tedarikciler: var_(ISLEM.oku) ? n.tedarikci : null,
    raporlar: null,
    ayarlar: null,
  };
}


// ---- Logo bağlantısı (#205 karar 1): yalnız logo modülü çağırır; yetki denetlemez, çağıranın işlemini kullanır.
export interface LogoyaGidecekSiparis {
  id: number; no: string; tarih: string; firmaId: number; paraBirimi: string; kur: string | null; iskontoYuzdesi: string; termin: string | null;
  durum: 'bekliyor' | 'hata';
  satirlar: { satirId: number; stokKodu: string | null; hizmet: boolean; miktar: string; birim: string; birimFiyat: string }[];
}
// Düzenlemede Logo'daki kayıt ve satır numaraları da gelir; numarası boş satır Logo'ya yeni eklenir. Kaldırılan satırlar açık listededir.
export interface LogoyaGuncellemeGidecekSiparis extends Omit<LogoyaGidecekSiparis, 'satirlar'> {
  logoKayitNo: string; kaldirilanSatirRefleri: string[];
  satirlar: (LogoyaGidecekSiparis['satirlar'][number] & { logoSatirRef: string | null })[];
}
// Kuyruktaki (bekliyor ve hata) siparişler en eskiden; kayıtsız tedarikçinin siparişi gelmez. Stok kodu malzeme kartındandır.
export async function logoyaGidecekSiparisler(db: Db, sinir: number): Promise<LogoyaGidecekSiparis[]> {
  return (await logoKuyrugu(db, sinir, 'gonderim')).map(({ logoKayitNo: _k, kaldirilanSatirRefleri: _s, ...x }) => ({ ...x, satirlar: x.satirlar.map(({ logoSatirRef: _r, ...r }) => r) }));
}
export async function logoyaGuncellemeGidecekSiparisler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekSiparis[]> {
  return (await logoKuyrugu(db, sinir, 'guncelleme')).map((x) => ({ ...x, logoKayitNo: x.logoKayitNo! }));
}
async function logoKuyrugu(db: Db, sinir: number, kuyruk: 'gonderim' | 'guncelleme') {
  const siparisler = await s.logoyaGidecekSiparislerOku(db, sinir, kuyruk);
  const kalemler = await s.logoSiparisKalemleriOku(db, siparisler.map((x) => x.id));
  const kartlar = await malzemeOzetleri(db, kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])));
  return siparisler.map((x) => ({
    ...x, kur: sade(x.kur), iskontoYuzdesi: sade(x.iskontoYuzdesi),
    satirlar: kalemler.filter((k) => k.siparisId === x.id).map((k) => {
      const kart = k.malzemeNo === null ? undefined : kartlar.get(k.malzemeNo);
      return {
        satirId: k.satirId, stokKodu: kart?.kod ?? null, hizmet: kart?.tur === 'hizmet', miktar: sade(k.miktar), birim: k.birim, birimFiyat: sade(k.birimFiyat),
        logoSatirRef: k.logoSatirRef,
      };
    }),
  }));
}
const logoHatasi = (h: string): string => (h.trim() === '' ? 'Logo hata metni vermedi.' : h.trim().slice(0, 2000));
// Başarıda kayıt ve satır numaraları yazılır; aynı sonuç ikinci kez gelirse değişmez. Sipariş yoksa ya da başka kayıt numarasıyla
// gönderilmişse ya da satır siparişte yoksa hata atılır (çağıranın işlemi geri sarar).
export async function siparisLogoSonucu(db: Db, id: number, sonuc: { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string }): Promise<void> {
  if ('hata' in sonuc) { await s.siparisLogoHatasiYaz(db, id, logoHatasi(sonuc.hata)); return; }
  const sip = await s.siparisLogoBasarisiYaz(db, id, sonuc.kayitNo);
  if (sip === null) throw gecersiz(`Sipariş ${id} bulunamadı ya da başka bir Logo kaydıyla gönderilmiş.`);
  for (const r of sonuc.satirlar) {
    if (!(await s.siparisSatiriLogoRefYaz(db, sip, r.satirId, r.logoSatirRef))) throw gecersiz(`Sipariş satırı ${r.satirId} bu siparişte yok.`);
  }
}
// Düzenleme başarısında yeni satırların Logo numaraları yazılır. Sipariş bu arada iptal kuyruğuna girdiyse sonuç yok sayılır (iptal gider).
export async function siparisLogoGuncellemeSonucu(db: Db, id: number, sonuc: { satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string }): Promise<void> {
  const sip = await s.siparisLogoGuncellemeSonucuYaz(db, id, 'hata' in sonuc ? logoHatasi(sonuc.hata) : null);
  if (sip === null || 'hata' in sonuc) return;
  for (const r of sonuc.satirlar) {
    if (!(await s.siparisSatiriLogoRefYaz(db, sip, r.satirId, r.logoSatirRef))) throw gecersiz(`Sipariş satırı ${r.satirId} bu siparişte yok.`);
  }
}
// ---- Logo talep fişi ve karşılama (#205 S3 b, kart #790): yalnız logo modülü çağırır; yetki denetlemez, çağıranın işlemini kullanır.
export interface LogoyaGidecekTalep {
  id: number; no: string; tarih: string; ihtiyacTarihi: string | null; durum: 'bekliyor' | 'hata';
  satirlar: { satirId: number; stokKodu: string | null; miktar: string; birim: string }[];
}
export async function logoyaGidecekTalepler(db: Db, sinir: number): Promise<LogoyaGidecekTalep[]> {
  const talepler = await s.logoyaGidecekTaleplerOku(db, sinir);
  const kalemler = await s.logoTalepKalemleriOku(db, talepler.map((x) => x.id));
  const kartlar = await malzemeOzetleri(db, kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])));
  return talepler.map((x) => ({
    ...x,
    satirlar: kalemler.filter((k) => k.talepId === x.id).map((k) => ({
      satirId: k.satirId, stokKodu: (k.malzemeNo === null ? undefined : kartlar.get(k.malzemeNo))?.kod ?? null, miktar: sade(k.miktar), birim: k.birim,
    })),
  }));
}
export async function talepLogoSonucu(db: Db, id: number, sonuc: { kayitNo: string; satirlar: { satirId: number; logoSatirRef: string }[] } | { hata: string }): Promise<void> {
  if ('hata' in sonuc) { await s.talepLogoHatasiYaz(db, id, logoHatasi(sonuc.hata)); return; }
  const t = await s.talepLogoBasarisiYaz(db, id, sonuc.kayitNo);
  if (t === null) throw gecersiz(`Talep ${id} bulunamadı ya da başka bir Logo kaydıyla gönderilmiş.`);
  for (const r of sonuc.satirlar) {
    if (!(await s.talepKalemiLogoRefYaz(db, t.talepId, r.satirId, r.logoSatirRef))) throw gecersiz(`Talep satırı ${r.satirId} bu talepte yok.`);
  }
}
export interface LogoyaGidecekKarsilama {
  siparisSatirId: number; siparisKayitNo: string; talepSatirRef: string; siparisSatirRef: string; miktar: string; stokKodu: string; birim: string; firmaId: number;
}
// Stok kodu olmayan kartın satırı gelmez (Logo malzemesiz karşılama yapmaz).
export async function logoyaGidecekKarsilamalar(db: Db, sinir: number): Promise<LogoyaGidecekKarsilama[]> {
  const satirlar = await s.logoyaGidecekKarsilamalarOku(db, sinir);
  const kartlar = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeNo));
  return satirlar.flatMap(({ malzemeNo, ...x }) => {
    const kod = kartlar.get(malzemeNo)?.kod ?? null;
    return kod === null ? [] : [{ ...x, miktar: sade(x.miktar), stokKodu: kod }];
  });
}
export async function karsilamaLogoSonucu(db: Db, siparisSatirId: number, sonuc: { karsilamaRef: string } | { hata: string }): Promise<void> {
  if ('hata' in sonuc) { await s.karsilamaLogoHatasiYaz(db, siparisSatirId, logoHatasi(sonuc.hata)); return; }
  if (!(await s.karsilamaLogoBasarisiYaz(db, siparisSatirId, sonuc.karsilamaRef))) {
    throw gecersiz(`Sipariş satırı ${siparisSatirId} bulunamadı ya da başka bir Logo karşılamasıyla gönderilmiş.`);
  }
}
export interface LogoyaKapatmaGidecekSiparis { id: number; no: string; logoKayitNo: string; satirRefleri: string[] }
export function logoyaKapatmaGidecekSiparisler(db: Db, sinir: number): Promise<LogoyaKapatmaGidecekSiparis[]> {
  return s.logoyaKapatmaGidecekSiparislerOku(db, sinir);
}
export async function siparisLogoKapatmaSonucu(db: Db, id: number, sonuc: { tamam: true } | { hata: string }): Promise<void> {
  await s.siparisLogoKapatmaSonucuYaz(db, id, 'hata' in sonuc ? logoHatasi(sonuc.hata) : null);
}
export function logoyaIptalGidecekSiparisler(db: Db, sinir: number): Promise<{ id: number; no: string; logoKayitNo: string }[]> {
  return s.logoyaIptalGidecekSiparislerOku(db, sinir);
}
export async function siparisLogoIptalSonucu(db: Db, id: number, sonuc: { tamam: true } | { hata: string }): Promise<void> {
  await s.siparisLogoIptalSonucuYaz(db, id, 'hata' in sonuc ? logoHatasi(sonuc.hata) : null);
}

// Kart #435: stoğun karşılayamadığı istekler iş kutusunda salt okunur görünür. Stok satın almayı ithal ettiği için satın alma stoğu
// ithal edemez (ADR 0006): kaynak stoktan gelir, sunucu açılışında kablolama kaydeder. Kayıtsız süreç sessizce boş dönmez, açık hata atar.
const STOK_YOK_SINIRI = 100;
export interface StokYokKaynagi {
  id: number; no: string; malzemeId: number; miktar: string; birim: string | null; uretimEmriId: number | null; acilma: string;
}
export type StokYokCozucusu = (db: Db, sinir: number) => Promise<StokYokKaynagi[]>;
let stokYokCozucu: StokYokCozucusu | null = null;
export function stokYokCozucusuKaydet(cozucu: StokYokCozucusu): void { stokYokCozucu = cozucu; }

export async function stokYokIstekleri(db: Db): Promise<StokYokIstekleriCevabi> {
  if (stokYokCozucu === null) throw new Error('Stok yok isteği çözücüsü kayıtlı değil (sunucu/kablolama.ts).');
  const ham = await stokYokCozucu(db, STOK_YOK_SINIRI);
  const kartlar = await malzemeOzetleri(db, ham.map((i) => i.malzemeId));
  const emirler = await emirNolari(db, ham.flatMap((i) => (i.uretimEmriId === null ? [] : [i.uretimEmriId])));
  return {
    istekler: ham.map((i) => {
      const kart = kartlar.get(i.malzemeId);
      return {
        id: i.id, no: i.no, malzemeKodu: kart?.kod ?? null, malzemeAdi: kart?.ad ?? null, miktar: i.miktar, birim: i.birim,
        emirNo: i.uretimEmriId === null ? null : emirler.get(i.uretimEmriId) ?? null, acilma: i.acilma,
      };
    }),
  };
}

// ---- Kg fiyatı (SAT-77). TL karşılığı finansın bugünkü ya da önceki son kuruyla; kuru olmayan para biriminde boş.
async function kgKuru(db: Db): Promise<s.KurDizisi> {
  const k = [...(await kurlar(db, await s.bugun(db))).entries()];
  return { paraBirimleri: k.map(([p]) => p), kurlar: k.map(([, v]) => v.kur) };
}
async function kgFiyatiAdlari(db: Db, satirlar: s.KgFiyatiOkuma[]): Promise<KgFiyatiSatiri[]> {
  const kisiler = await kisiAdlari(db, satirlar.map((x) => x.kisiId));
  return satirlar.map(({ kisiId, ...x }) => ({ ...x, paraBirimi: x.paraBirimi as KgFiyatiSatiri['paraBirimi'], kisiAdi: ad(kisiler, kisiId) }));
}
export async function kgFiyatlari(db: Db, islemler: readonly string[]): Promise<KgFiyatlariCevabi> {
  const fiyatlar = await s.guncelKgFiyatlari(db, await kgKuru(db));
  const fiyatsizKaliteler = (await kullanilanKaliteler(db)).filter((k) => uygulananKgFiyati(fiyatlar, k.kaliteKodu, k.form) === null);
  const stokDegeri = islemler.includes('finans.oku') ? await kgStokDegeri(db) : null;
  return { fiyatlar: await kgFiyatiAdlari(db, fiyatlar), fiyatsizKaliteler, stokDegeri };
}

// Stok satın almayı ithal ettiği için satın alma stoğu ithal edemez: miktarı sunucu açılışında kablolama kaydeder (stokYokCozucusu gibi).
// Stok bütün kartların bakiyesini değer grubuyla verir (228 a, stok/disari degerGrubuToplamlari); satın alma hammaddeyi süzer.
export type StokMiktariCozucusu = (db: Db) => Promise<readonly { malzemeId: number; grup: 'kullanilabilir' | StokAyriGrubu; toplam: string }[]>;
let stokMiktariCozucu: StokMiktariCozucusu | null = null;
export function stokMiktariCozucusuKaydet(cozucu: StokMiktariCozucusu | null): void { stokMiktariCozucu = cozucu; }

const HAMMADDE_SAYFASI = 200;
async function hammaddeNolari(db: Db): Promise<number[]> {
  const nolar: number[] = [];
  for (let sayfa = 1; ; sayfa += 1) {
    const l = (await malzemeAra(db, { metin: null, turler: ['hammadde'], sayfa, sayfaBoyu: HAMMADDE_SAYFASI })).satirlar;
    nolar.push(...l.map((m) => m.id));
    if (l.length < HAMMADDE_SAYFASI) return nolar;
  }
}
// SAT-77: hammadde stok değeri iki fiyatla: güncel kg fiyatı (birim fiyatı bilinmeyen kalem dışarıda kalır) ve ortalama alış fiyatı.
async function kgStokDegeri(db: Db): Promise<KgStokDegeri> {
  const ayriBos = { kgFiyatiyla: null, alisFiyatiyla: null };
  const bos: KgStokDegeri = {
    kgFiyatiyla: null, alisFiyatiyla: null, kgFiyatsizKalem: 0, alisFiyatsizKalem: 0, ayriToplam: ayriBos,
    ayriGruplar: STOK_AYRI_GRUPLARI.map((grup) => ({ grup, ...ayriBos })), satirlar: [],
  };
  if (stokMiktariCozucu === null) return bos;
  const hammadde = new Set(await hammaddeNolari(db));
  const bakiyeler = (await stokMiktariCozucu(db)).filter((b) => hammadde.has(b.malzemeId));
  const nolar = [...new Set(bakiyeler.map((b) => b.malzemeId))];
  if (nolar.length === 0) return bos;
  const kg = await malzemeKgFiyatlari(db, nolar);
  const alis = await ortalamaAlisFiyatlari(db, nolar);
  const kgTutari = (l: readonly { malzemeId: number; toplam: string }[]) => stokTutari(l.map((b) => ({ miktar: b.toplam, tryBirimFiyati: kg.get(b.malzemeId)?.tryBirimFiyati ?? null })));
  const alisTutari = (l: readonly { malzemeId: number; toplam: string }[]) => stokTutari(l.map((b) => ({ miktar: b.toplam, tryBirimFiyati: alis.get(b.malzemeId)?.tryBirimFiyat ?? null })));
  const kullanilabilir = bakiyeler.filter((b) => b.grup === 'kullanilabilir');
  const ayri = bakiyeler.filter((b) => b.grup !== 'kullanilabilir');
  const kgToplam = kgTutari(kullanilabilir);
  const alisToplam = alisTutari(kullanilabilir);
  const gruplar = new Map<string, { kaliteKodu: string; form: string | null; nolar: Set<number> }>();
  for (const [no, f] of kg) {
    const anahtar = `${f.kaliteKodu}|${f.form ?? ''}`;
    const g = gruplar.get(anahtar) ?? { kaliteKodu: f.kaliteKodu, form: f.form, nolar: new Set<number>() };
    g.nolar.add(no);
    gruplar.set(anahtar, g);
  }
  return {
    kgFiyatiyla: kgToplam.tutar, alisFiyatiyla: alisToplam.tutar, kgFiyatsizKalem: kgToplam.fiyatsizKalem, alisFiyatsizKalem: alisToplam.fiyatsizKalem,
    ayriToplam: { kgFiyatiyla: kgTutari(ayri).tutar, alisFiyatiyla: alisTutari(ayri).tutar },
    ayriGruplar: STOK_AYRI_GRUPLARI.map((grup) => {
      const l = ayri.filter((b) => b.grup === grup);
      return { grup, kgFiyatiyla: kgTutari(l).tutar, alisFiyatiyla: alisTutari(l).tutar };
    }),
    satirlar: [...gruplar.values()].map((g) => ({ kaliteKodu: g.kaliteKodu, form: g.form, tutar: kgTutari(kullanilabilir.filter((b) => g.nolar.has(b.malzemeId))).tutar })),
  };
}
// Malzemenin birim fiyatı ve stokun güncel değeri (SAT-77): kartın kalite + formuna uygulanan güncel kg fiyatı ve stok birimi başına
// karşılığı. Kalitesi ya da fiyatı olmayan kart haritada yoktur; birim ağırlığı bilinmeyen kartta birim fiyat boştur.
export interface MalzemeKgFiyati {
  kaliteKodu: string; form: string | null; kgFiyati: string; paraBirimi: KgFiyatiSatiri['paraBirimi']; tryKgFiyati: string | null; gecerlilik: string;
  birimFiyati: string | null; tryBirimFiyati: string | null; talasKgFiyati: string | null; tryTalasKgFiyati: string | null;
}
export async function malzemeKgFiyatlari(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, MalzemeKgFiyati>> {
  const sonuc = new Map<number, MalzemeKgFiyati>();
  const bilgiler = await malzemeMaliyetBilgileri(db, [...malzemeNolar]);
  if (bilgiler.size === 0) return sonuc;
  const fiyatlar = await s.guncelKgFiyatlari(db, await kgKuru(db));
  for (const [no, b] of bilgiler) {
    if (b.kaliteKodu === null) continue;
    const f = uygulananKgFiyati(fiyatlar, b.kaliteKodu, b.form);
    if (f === null) continue;
    sonuc.set(no, {
      kaliteKodu: f.kaliteKodu, form: f.form, kgFiyati: f.kgFiyati, paraBirimi: f.paraBirimi as KgFiyatiSatiri['paraBirimi'], tryKgFiyati: f.tryKgFiyati, gecerlilik: f.gecerlilik,
      talasKgFiyati: f.talasKgFiyati, tryTalasKgFiyati: f.tryTalasKgFiyati,
      birimFiyati: birimFiyati(f.kgFiyati, b.stokBirimi, b.birimKg), tryBirimFiyati: birimFiyati(f.tryKgFiyati, b.stokBirimi, b.birimKg),
    });
  }
  return sonuc;
}
export async function kgFiyatiGecmisi(db: Db, kaliteKodu: string, form: string | null): Promise<KgFiyatiGecmisiCevabi> {
  return { girisler: await kgFiyatiAdlari(db, await s.kgFiyatiGecmisi(db, await kgKuru(db), kaliteKodu, form)) };
}
export async function kgFiyatlariEkle(db: Db, k: Kullanici, satirlar: readonly s.KgFiyatiYazimi[]): Promise<KgFiyatlariCevabi> {
  await s.kgFiyatlariEkle(db, k.id, satirlar);
  return kgFiyatlari(db, k.islemler);
}

// 533 a: tedarik termini satın almanındır; satın alma ekranı ve planlama ekranı aynı komutla yazar (yetki uçta). Kişi ve zaman
// sunucudan. Geçmiş tarih kabul edilir: geç kalan termin planda işi bekletir, girişi reddetmek gecikmeyi saklardı.
const terminCikisi = ({ kisiId: _, ...t }: s.TedarikTerminiOkuma): TedarikTermini => t;
export async function tedarikTerminiKaydet(db: Db, k: Kullanici, g: TedarikTerminiKaydetYazimi): Promise<{ termin: TedarikTermini }> {
  const yazim = { malzemeNo: g.malzemeNo, termin: g.termin, aciklama: g.aciklama };
  if (g.surum === null) {
    if (!(await malzemeOzetleri(db, [g.malzemeNo])).has(g.malzemeNo)) throw dogrulama(ILETILER.terminMalzemesiYok, 'malzemeNo');
    const yeni = await s.tedarikTerminiEkle(db, yazim, k.id);
    if (yeni === null) throw cakisma(ILETILER.terminVar);
    return { termin: terminCikisi(yeni) };
  }
  const surum = g.surum;
  const satir = await surumluGuncelle({
    guncelle: () => s.tedarikTerminiGuncelle(db, yazim, surum, k.id), varMi: () => s.tedarikTerminiVarMi(db, g.malzemeNo), bulunamadiIletisi: ILETILER.terminMalzemesiYok,
  });
  return { termin: terminCikisi(satir) };
}
export async function tedarikTerminleriListesi(db: Db): Promise<TedarikTerminleriCevabi> {
  const satirlar = await s.tedarikTerminleriOku(db, null);
  const malzemeler = await malzemeOzetleri(db, satirlar.map((t) => t.malzemeNo));
  const adlar = await kisiAdlari(db, satirlar.flatMap((t) => (t.kisiId === null ? [] : [t.kisiId])));
  return {
    terminler: satirlar.map((t) => {
      const m = malzemeler.get(t.malzemeNo);
      return { ...terminCikisi(t), malzemeKodu: m?.kod ?? '', malzemeAdi: m?.ad ?? '', kisiAdi: t.kisiId === null ? null : adlar.get(t.kisiId) ?? null };
    }),
  };
}
// Plan okuması: satırı olmayan malzeme haritada yoktur (termin bekliyor, ilk giriş sürümsüz yazılır).
export async function tedarikTerminleri(db: Db, malzemeNolar: readonly number[]): Promise<Map<number, TedarikTermini>> {
  const tekil = [...new Set(malzemeNolar)];
  if (tekil.length === 0) return new Map();
  return new Map((await s.tedarikTerminleriOku(db, tekil)).map((t) => [t.malzemeNo, terminCikisi(t)]));
}
// Plan "olması gereken" tarihi tam liste olarak bildirir; listede olmayanın gereken tarihi boşalır, termin kalır. Bilinmeyen
// malzeme ya da aynı malzemenin iki kez gelmesi çağıranın hatasıdır, yazılmaz.
export async function tedarikIhtiyaclariniYaz(db: Db, ihtiyaclar: readonly { malzemeNo: number; gerekenTarih: string }[]): Promise<void> {
  const nolar = ihtiyaclar.map((i) => i.malzemeNo);
  if (new Set(nolar).size !== nolar.length) throw gecersiz('Aynı malzeme ihtiyaç listesinde iki kez var.');
  const kartlar = await malzemeOzetleri(db, nolar);
  const yok = nolar.filter((n) => !kartlar.has(n));
  if (yok.length > 0) throw gecersiz(`${ILETILER.terminMalzemesiYok} (${yok.join(', ')})`);
  await s.gerekenTarihleriYaz(db, ihtiyaclar);
}
