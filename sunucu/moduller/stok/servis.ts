import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kayitNoktasi, type Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bagimliKayit, bulunamadi, cakisma, dogrulama, gecersiz, onayGerekli, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kapsamDisiysaReddet, kapsamdaMi, kapsamSuzgeci, kisininKapsami } from '#cekirdek/kapsam.ts';
import type { Kapsam } from '#cekirdek/kapsam.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { KisitEslemesi } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { NumaraAnahtari } from '#paylasilan/ayarlar.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import { KATALOG_TURLERI, type KatalogMalzemeOzeti } from '#paylasilan/sozlesme/malzemeler.ts';
import { ACIK_EMIR_DURUMLARI, type RefakatKartiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  AcikSiparisSatirlariCevabi, BakiyeSatiri, KaliteDurumu, CikisKomutu, CikisOnerisiCevabi, DepolarCevabi, Hareket, HareketCevabi, HareketlerListesi, IsKutusuCevabi, Konum, KonumAyrintiCevabi,
  KonumlarListesi, MalKabulAyrintiCevabi, MalKabulCevabi, MalKabulDuzeltKomutu, MalKabulKomutu, MalKabullerListesi, MalKabulOzeti, MalzemeAyarKomutu,
  FasonIsleriCevabi, MalzemeAyrintiCevabi, RezervelerCevabi, RezerveEtKomutu, RezerveKaldirKomutu, MalzemeKartBilgileriCevabi, MalzemelerListesi, MalzemeOzetiCevabi, MalzemeStokSatiri, Parti, PartiIziCevabi, PartilerListesi, Raf,
  RafAcKomutu, RafDuzenleKomutu, RafDuzenleCevabi, KonumDuzenleCevabi, RafMatrisiCevabi, RaflarListesi, SayimCevabi, SayimKomutu, TasimaKomutu, UretimGirisiKomutu, GozOnerisiCevabi, PanelCevabi, StatuDegistirKomutu, AylikStokDegeriCevabi, StokDegeriCevabi, DegerlemeYontemi,
  FisAyrintiCevabi, FislerListesi, FisOzeti, MalzemeFisiAyrintiCevabi, KodCozCevabi, SepetCevabi, SepetEkleKomutu, SepetTeslimCevabi, SepetTeslimEtCevabi, SepetTeslimEtKomutu, StoktanDusKomutu, TeslimKomutu,
  ToplamaAcKomutu, ToplamaAyrintiCevabi, ToplamalarListesi, ToplamaOzeti, YerlesimCevabi, YerlesimKaydetKomutu, AraCevabi, TopluGeriAlKomutu,
  EmirTamamlamaCevabi, EmirTamamlaKomutu, HaritaEslemeCevabi, HaritaOzetiCevabi, GozStoklariCevabi, StokOzetiCevabi, MalzemeIstegi, MalzemeIstegiAcGirdisi, MalzemeIstegiCevabi, MalzemeIstegiDurumu, MalzemeIstekleriListesi,
  LotEtiketi, LotEtiketleriCevabi, IstekAcGovdesi, IstekMalzemeleriCevabi, Teslim, TeslimAlGovdesi, TeslimCevabi, TeslimGonderGovdesi, TeslimKutusuCevabi,
  TeslimReddetGovdesi, TeslimYeri, YerdekiStokCevabi, OkutCozCevabi, IstekKabulGovdesi, IstekReddetGovdesi, MalzemeYerleriCevabi, OkutarakAlCevabi, OkutarakAlGovdesi, ItirazGovdesi, OkutYeri, KisiKoduCevabi, IstasyonSepetiCevabi, GelecekSepetCevabi, IstasyonSepetleriCevabi, IsMalzemeleriCevabi, IsMalzemesiIsteGovdesi, SepettenCekGovdesi, UretimHazirligiCevabi, UretimHazirligiGovdesi,
} from '#paylasilan/sozlesme/stok.ts';
import type { GozKalemi, GozKalemiKaydi, KayitCevabi, RafKaydi } from '#paylasilan/sozlesme/atolye.ts';
import { malzemeIstegiAcGirdisi, REFAKAT_KARTLARI_SINIRI, type ElleKonumTuru, type IstekTeslimGovdesi, type PartiBelgesi, type KartlaAlGovdesi, type LotBekleyenKartlarCevabi, type RefakatKartlariCevabi, type RefakatKartSatiri, type RefakatCiktisi, type RefakatIziCevabi, type RefakatLotaBaglaCevabi, type RefakatPartileriCevabi, type RefakatPartisi, type RefakatPartisiCevabi, type RefakatPartisiKartiCevabi, type RefakatSevki, type SiparisIrsaliyeleriCevabi, type SonParti, type ZeminCevabi, type DepoCikisCevabi, type DepoSevkCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { StatulerCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { KOD_ONEKI, kodTuru } from '#paylasilan/kod-sozlugu.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { belgeAcVeBagla, kaydaBagla, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi } from '../cizimler/disari.ts';
import {
  alanlar as haritaAlanlari, gozAdresi as haritaGozAdresi, gozKaleminBolumu, gozKalemiSil as haritaGozKalemiSil, gozKalemiYaz as haritaGozKalemiYaz, gozler as haritaGozleri,
  rafYerlesimiKaydet, zemin as haritaZemini,
} from '../atolye/disari.ts';
import { aktifIstasyonlar, istasyonAdlari, istasyonGetir, istasyondakiKisiler, istasyonlar as tumIstasyonlar, kisininIzinliIsMerkezleri } from '../istasyonlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { basladigiGunTakvimi } from '../vardiya/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { gkkGerekenKartlar, malzemeAdlari, malzemeAra, malzemeKullanilabilirMi, malzemeNoKoddan, malzemeOzeti, malzemeOzetleri } from '../malzemeler/disari.ts';
import { degerlemeKgFiyatlari, malKabulFiyatlari, siparisSatirlari, siparisSatirlarininEmri, teslimGeriAl, teslimIsle } from '../satin-alma/disari.ts';
import { firmaAdlari } from '../musteri-tedarikci/disari.ts';
import { siparisFaturalari } from '../finans/disari.ts';
import { depoBekleyenleri, depoCikisiniGeriAl, depoCikisiYaz, depoKabuluYaz, depoKabulunuGeriAl, depoKalemiAl, emirlerinSevkleri, sevkIsiOzeti } from '../sevkiyat/disari.ts';
import type { DepoKalemi, FasonSevkiOlayi, UrunSevkiOlayi, UrunSevkSatiri } from '../sevkiyat/disari.ts';
import {
  KOMUT_ISLEMI as URETIM_ISLEMI, acikEmirler, acikIstasyon, adimUretimBilgisi, adimliEmirAyrintisi, baslatmaDenetle, emirDilimi, emirDurumlari, emirMalzemeIhtiyaci, emirlerinMalzemeIhtiyaci, emirOzeti, fasonDonusuKaydet, fasonHareketiOzeti, fasonIsEmirleri, isEmriOzeti,
  uretimEmriOzeti, emirDugumleri, emirNolari, refakatKarti, kapanisSonuclari,
} from '../uretim-emirleri/disari.ts';
import type { FasonHareketiOlayi } from '../uretim-emirleri/disari.ts';
import {
  binde, bindenMetin, cikisOnerisi, duzeltmeEngeli, dusumKarari, geriAlmaEngeli, ilkGirisBirlesik, kalanAmbalajAdedi, partiDenetimi, partiEtiketi, partiGereksinimi, statuAramasi, statuDegisimiEngeli, statuKirilimi, statuKodlari, stokDegeri, alisFiyatlari, DEGER_GRUPLARI, stoksuzStatuler, stoklanirMi,
  bolmeNo, malKabulGozOnerisi, partiSec, rafGozleri, rotaSirala, sayimFarki, siparisBagiEngeli, siparisMalzemeEngeli, malKabulSatirTuru, stokDurumu, tersYon,
  ihtiyacToplami, kalanSarf, tamamlamaEngeli, ISTEK_GECIS_KAYNAKLARI, istekGecisEngeli, haritaPlani, haritaAlaniMi, depoKoduOner, konumTurDegisimEngeli,
  buradakiIstasyon, istekAcilisDurumu, sayimArtisPlani, sayimAzalisPlani, istekliTeslimEngeli, istekListeEngeli, adimMiktarEngeli, istekKarsilamalari, teslimAlimMiktariEngeli, serbestMiktarEngeli, istekKalani, istenenFazlaNotu, teslimAlmaEngeli, teslimKapanisEngeli, yoldaSureSonu,
  sonrakiIstasyon, type SepetAdimi, kaynaklardanAl, uretimAdimPlani, dalliAdimPlani, tasimaKaynagi, type TasimaKaynagi, gelenOrani, oranliAdet, type GelenOrani, type ReceteGirdisi, type UretimAdimPlani, baslatmaEksikleri, adetMiktari, type BaslatmaEksigi, rezerveSiniri, fasonGonderimiEksikMi, koduDegisenler, cikisKaliteKarari, kaliteDegisimiEngeli, enKotuKalite, girdiSec, eksidenUyari, geriCevirmeKaliteleri, teslimBolmesi,
  sevkAdediBinde, sevkKaynaklariSec, urunSevkAdimlari, elleSarfMahsubu, kaliteKarariHareketiMi, karantinaEngeli, fasonDonusKonumuEngeli, KARANTINA_KONUMU_YOK, gkkGirisKonumuEngeli, GKK_KARANTINA_KONUMU_YOK, girisKontroluDuzeltmeEngeli, eksiKaliteEngeli, uretimGirisiEngeli, uretimGirisiDurumEngeli, sevkAciklamasi, sevkTeslimIsi, faturaliSevkEngeli,
  kisiKoduAyristir, kisiKoduEngeli, kisiKoduGovdesi, KISI_KODU_SURESI_SN, katalogEtiketiStokKodu,
  sevkCikisEngeli, istasyondanIstekEngeli, okutarakAlmaEngeli, itirazSonu, refakatBaglamaEngeli, refakatEtiketi, refakatIptalEngeli, refakatKolEngeli, refakatLotEngeli, refakatSayimEngeli, refakatTeslimEngeli, kartOnayiTuru, refakatAnaEylemi,
  AYRILMIS_KONUM_TURLERI,
} from './kurallar.ts';
import type { IstekGecisi, MalzemeTuru, SevkBakiyesi } from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import * as malzemeFisi from './malzeme-fisi.ts';
import type { BakiyeHam, BelgeTablosu, HareketHam, HareketYeni, IstekHam, RefakatPartisiHam, TeslimHam } from './sorgular.ts';

// Numara kayıtla aynı işlemde alınır: kayıt geri alınırsa sıra da geri alınır.
const belgeNo = (db: Db, anahtar: NumaraAnahtari, tablo: BelgeTablosu): Promise<string> =>
  numaraAl(db, anahtar, { varMi: (no) => sorgular.belgeNoVarMi(db, tablo, no) });

// Her mal kabul gelişi ayrı lottur, aynı tedarikçi parti/döküm no gelse de (#124); yalnız üretim girişi emrin partisine eklenir.
async function partiBulVeyaAc(db: Db, p: sorgular.PartiAnahtari): Promise<number> {
  const varOlan = p.uretimEmriId !== null ? await sorgular.emirPartisiBul(db, p.malzemeId, p.uretimEmriId) : null;
  if (varOlan !== null) return varOlan;
  const lotNo = await numaraAl(db, 'stok.lot-no', { varMi: (no) => sorgular.lotNoVarMi(db, no) });
  return (await sorgular.partiAc(db, { ...p, lotNo })) ?? (await sorgular.emirPartisiBul(db, p.malzemeId, p.uretimEmriId!))!;
}
// Üretim girişinin partisi: refakat kartıyla sayılan parça kartın partisine, kartsız sayım emrin partisine girer (#126).
async function uretimPartisi(db: Db, p: { malzemeId: number; uretimEmriId: number; refakatPartisiId: number | null; kisiId: number }): Promise<number> {
  if (p.refakatPartisiId === null) {
    return partiBulVeyaAc(db, { malzemeId: p.malzemeId, tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, uretimEmriId: p.uretimEmriId, kisiId: p.kisiId });
  }
  const varOlan = await sorgular.refakatCiktiPartisiBul(db, p.malzemeId, p.refakatPartisiId);
  if (varOlan !== null) return varOlan;
  const lotNo = await numaraAl(db, 'stok.lot-no', { varMi: (no) => sorgular.lotNoVarMi(db, no) });
  return (await sorgular.refakatCiktiPartisiAc(db, { ...p, refakatPartisiId: p.refakatPartisiId, lotNo }))
    ?? (await sorgular.refakatCiktiPartisiBul(db, p.malzemeId, p.refakatPartisiId))!;
}

// ---- Kısıt → ileti (kisitKorumali); adlar göçtedir ---------------------------------------------------------------
const ESLEME: KisitEslemesi = {
  stok_konum_kod_tek: { ileti: 'Bu konum kodu kullanılıyor.', alan: 'kod' },
  stok_konum_raf_gozu_tek: 'Bu rafta bu bölme ve kat zaten var.',
  stok_bakiye_aktif_konumda: 'Bu konumda stok var ya da konum pasif; önce stoğu taşıyın.',
  stok_bakiye_tek: 'Aynı anda başka bir stok işlemi yazıldı; yeniden deneyin.',
  stok_parti_tanimli: { ileti: 'Parti için tedarikçi parti no ya da döküm no gerekli.', alan: 'parti' },
  stok_parti_emir_tek: 'Bu parti az önce açıldı; yeniden deneyin.',
  stok_parti_lot_tek: 'Bu lot numarası kullanılıyor; yeniden deneyin.',
  stok_bakiye_parti_malzemesi: { ileti: 'Parti bu malzemeye ait değil.', alan: 'partiId' },
  stok_hareketi_parti_malzemesi: { ileti: 'Parti bu malzemeye ait değil.', alan: 'partiId' },
  stok_mal_kabul_satiri_parti_malzemesi: { ileti: 'Parti bu malzemeye ait değil.', alan: 'partiId' },
  stok_hareketi_tek_geri_alma: 'Bu hareket zaten geri alındı.',
  stok_hareketi_sarf_emirli: { ileti: 'Üretime sarf için üretim emri seçin.', alan: 'uretimEmriId' },
  stok_hareketi_emir_yalniz_uretimde: { ileti: 'Üretim emri yalnız üretime sarf çıkışında girilir.', alan: 'uretimEmriId' },
  stok_hareketi_malzeme_var: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeId' },
  stok_bakiye_malzeme_var: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeId' },
  stok_malzeme_ayari_malzeme_var: { ileti: 'Malzeme kartı bulunamadı.', alan: 'malzemeId' },
  stok_mal_kabul_tek_duzeltme: 'Bu belge az önce düzeltildi.',
  stok_raf_zemin_tek_kat: { ileti: 'Zemin istif alanı tek katlıdır.', alan: 'katSayisi' },
  stok_mal_kabul_satiri_siparis_satiri_var: { ileti: 'Sipariş satırı bulunamadı.', alan: 'siparisSatirId' },
};
const korumali = <T>(is: () => Promise<T>): Promise<T> => kisitKorumali(ESLEME, is, { BAGIMLI_KAYIT: 'Bu kayıt kullanımda; değiştirilemez.' });

// ---- Yardımcılar --------------------------------------------------------------------------------------------------
async function adlar(db: Db, malzemeIdler: number[]): Promise<Map<number, string>> {
  return malzemeAdlari(db, [...new Set(malzemeIdler)]);
}
type EmirNolari = ReadonlyMap<number, string>;
const emirNoDe = (nolar: EmirNolari, id: number | null | undefined): string | null => (id === null || id === undefined ? null : nolar.get(id) ?? null);
// Tek sorguyla (N+1 yok); kimlik listesi boşsa sorgu atılmaz.
const emirNoHaritasi = (db: Db, idler: readonly (number | null | undefined)[]): Promise<EmirNolari> =>
  emirNolari(db, idler.filter((x): x is number => x !== null && x !== undefined));
function bakiyeSatiri(b: BakiyeHam, ad: Map<number, string>, nolar: EmirNolari): BakiyeSatiri {
  return {
    id: b.id, malzemeId: b.malzemeId, malzemeAd: ad.get(b.malzemeId) ?? null, konumId: b.konumId, konumKod: b.konumKod, partiId: b.partiId,
    partiEtiketi: b.partiId === null ? null : partiEtiketi({ lotNo: b.lotNo, tedarikciPartiNo: b.tedarikciPartiNo, dokumNo: b.dokumNo, uretimEmriId: b.uretimEmriId }, emirNoDe(nolar, b.uretimEmriId)),
    miktar: b.miktar, ilkGiris: b.ilkGiris,
    ambalaj: b.ambalajTur === null ? null : { tur: b.ambalajTur, olcu: b.ambalajOlcu ?? '', adet: b.ambalajAdet }, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu,
  };
}
async function hareketleriCevir(db: Db, satirlar: HareketHam[]): Promise<Hareket[]> {
  const ad = await adlar(db, satirlar.map((h) => h.malzemeId));
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.map((h) => h.kisiId))]);
  const nolar = await emirNoHaritasi(db, satirlar.flatMap((h) => [h.partiEmirId, h.uretimEmriId]));
  return satirlar.map((h) => ({
    id: h.id, zaman: h.zaman, tur: h.tur, malzemeId: h.malzemeId, malzemeAd: ad.get(h.malzemeId) ?? null, partiId: h.partiId,
    partiEtiketi: h.partiId === null ? null : partiEtiketi({ lotNo: h.lotNo, tedarikciPartiNo: h.tedarikciPartiNo, dokumNo: h.dokumNo, uretimEmriId: h.partiEmirId }, emirNoDe(nolar, h.partiEmirId)),
    kaynakKonumKod: h.kaynakKonumKod, hedefKonumKod: h.hedefKonumKod, miktar: h.miktar, onayliEksi: h.onayliEksi, girisKaynagi: h.girisKaynagi,
    cikisNedeni: h.cikisNedeni, uretimEmriId: h.uretimEmriId, emirNo: emirNoDe(nolar, h.uretimEmriId), geriAlinanId: h.geriAlinanId, geriAlindi: h.geriAlindi, fisId: h.fisId, fisNo: h.fisNo,
    hareketFisiId: h.hareketFisiId, hareketFisiNo: h.hareketFisiNo, otomatik: h.akis !== null,
    kisiAd: kisiler.get(h.kisiId) ?? null, aciklama: h.aciklama, kaynakStatuId: h.kaynakStatuId, hedefStatuId: h.hedefStatuId,
    kaynakKaliteDurumu: h.kaynakKaliteDurumu, hedefKaliteDurumu: h.hedefKaliteDurumu,
  }));
}
async function aktifKonum(db: Db, id: number, alan: string) {
  const k = await sorgular.konumBul(db, id);
  if (!k) throw dogrulama('Konum bulunamadı.', alan);
  if (!k.aktif) throw gecersiz('Konum pasif; stok yazılamaz.');
  return k;
}
async function varsayilanKonum(db: Db, kod: 'KABUL' | 'URETIM'): Promise<number> {
  const k = await sorgular.konumKoduyla(db, kod);
  if (!k) throw new Error(`Sabit konum yok: ${kod}`);
  return k.id;
}

interface BakiyeDegisimi {
  malzemeId: number; konumId: number; partiId: number | null; statuId?: number | null; kaliteDurumu?: KaliteDurumu; fark: bigint; ilkGiris?: string | null;
  ambalaj?: { tur: string; olcu: string; uzunluk: string | null; genislik: string | null; yukseklik: string | null; adet: number | null } | null;
}
// Bakiye (malzeme, konum, parti, statü, kalite) satırı kilitlenir; sıfıra inen satır silinir (DEP-01). Önceki miktar döner.
async function bakiyeDegistir(db: Db, d: BakiyeDegisimi): Promise<BakiyeHam | null> {
  let b = await sorgular.bakiyeKilitle(db, d.malzemeId, d.konumId, d.partiId, d.statuId ?? null, d.kaliteDurumu ?? 'serbest');
  if (!b) {
    if (d.fark === 0n) return null;
    // Hizmet kartı hiçbir komutla (sayım fazlası, eksiye onaylı çıkış dahil) bakiye açmaz; hizmetten çıkan malzeme kendi kartıyla girer.
    const o = await malzemeOzeti(db, d.malzemeId);
    if (o && !stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; hizmetten çıkan malzeme kendi kartıyla girer.`, 'malzemeId');
    const a = d.ambalaj ?? null;
    const acilan = await sorgular.bakiyeEkle(db, {
      malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId ?? null, kaliteDurumu: d.kaliteDurumu ?? 'serbest', miktar: bindenMetin(d.fark), ilkGiris: d.ilkGiris ?? null,
      ambalajTur: a?.tur ?? null, ambalajOlcu: a?.olcu ?? null, uzunluk: a?.uzunluk ?? null, genislik: a?.genislik ?? null, yukseklik: a?.yukseklik ?? null, ambalajAdet: a?.adet ?? null,
    });
    if (acilan.length > 0) return null;
    // Aynı satırı eşzamanlı başka komut açtı (ON CONFLICT bekleyip boş döndü): onun satırı kilitlenip üstüne yazılır.
    b = await sorgular.bakiyeKilitle(db, d.malzemeId, d.konumId, d.partiId, d.statuId ?? null, d.kaliteDurumu ?? 'serbest');
    if (!b) throw cakisma('Stok bu sırada değişti; yeniden deneyin.');
  }
  const yeni = binde(b.miktar) + d.fark;
  if (yeni === 0n) { await sorgular.bakiyeSil(db, b.id); return b; }
  const ilk = d.fark > 0n && d.ilkGiris ? ilkGirisBirlesik(b.ilkGiris, d.ilkGiris) : b.ilkGiris;
  const adet = d.fark < 0n ? kalanAmbalajAdedi(b.ambalajAdet, b.miktar, bindenMetin(yeni))
    : b.ambalajAdet !== null && d.ambalaj?.adet ? b.ambalajAdet + d.ambalaj.adet : b.ambalajAdet;
  await sorgular.bakiyeGuncelle(db, b.id, bindenMetin(yeni), ilk, adet);
  return b;
}
const siraliKilitle = async (db: Db, ...a: { malzemeId: number; konumId: number | null; partiId: number | null; statuId?: number | null; kaliteDurumu?: KaliteDurumu }[]): Promise<void> => {
  await sorgular.bakiyeleriKilitle(db, a.flatMap((x) => (x.konumId === null ? []
    : [{ malzemeId: x.malzemeId, konumId: x.konumId, partiId: x.partiId, statuId: x.statuId ?? null, kaliteDurumu: x.kaliteDurumu ?? 'serbest' }])));
};
type BakiyeAnahtari = { malzemeId: number; konumId: number; partiId: number | null; statuId?: number | null; kaliteDurumu?: KaliteDurumu };
// 1059 a: seçim kilitsiz okunur. Kilitten sonra satırda istenenden az kaldıysa başka lota geçilmez, seçilen lot bu konumda eksiye düşer
// (sonraki giriş tamamlar); eksiye düşen miktar döner, hareket onaylı eksi işaretlenir.
async function kilitliEksik(db: Db, a: BakiyeAnahtari, miktar: bigint): Promise<bigint> {
  const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId, a.statuId ?? null, a.kaliteDurumu ?? 'serbest');
  const olan = b === null ? 0n : binde(b.miktar);
  const eksik = miktar - (olan > 0n ? olan : 0n);
  return eksik > 0n ? eksik : 0n;
}
// Olan kadar taşınan yollar (fason) için: kilitsiz okunan satır kilit beklerken azaldıysa azalan kadar az alınır, satır eksiye inmez.
async function kilitliOlan(db: Db, a: BakiyeAnahtari, okunan: string, secilen: bigint): Promise<bigint> {
  const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId, a.statuId ?? null, a.kaliteDurumu ?? 'serbest');
  const azalan = binde(okunan) - (b === null ? 0n : binde(b.miktar));
  const alinan = azalan > 0n ? secilen - azalan : secilen;
  return alinan > 0n ? alinan : 0n;
}
const eksiUyarisi = (eksik: bigint): string => `Stok bu sırada başka kayıtla düştü; ${bindenMetin(eksik)} eksiye yazıldı, sonraki giriş tamamlar.`;
const hareket = (h: Partial<HareketYeni> & Pick<HareketYeni, 'tur' | 'malzemeId' | 'miktar' | 'kisiId'>): HareketYeni => ({
  partiId: null, partiSecimi: null, kaynakKonumId: null, hedefKonumId: null, onayliEksi: false, girisKaynagi: null, cikisNedeni: null,
  uretimEmriId: null, geriAlinanId: null, aciklama: null, kaynakStatuId: null, hedefStatuId: null, kaynakKaliteDurumu: null, hedefKaliteDurumu: null, isEmriId: null, ...h,
});
// 142 a: emre yapılan teslim, emrin hedef istasyondaki bitmemiş ilk adımına bağlanır; istasyon dışı hedefte ya da adım yoksa yalnız emre.
async function teslimAdimi(db: Db, uretimEmriId: number | null, hedefKonumId: number): Promise<number | null> {
  if (uretimEmriId === null) return null;
  const istasyonId = await sorgular.konumIstasyonu(db, hedefKonumId);
  if (istasyonId === null) return null;
  const e = await adimliEmirAyrintisi(db, uretimEmriId).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
  return e?.isEmirleri.filter((i) => i.istasyon?.id === istasyonId && i.durum !== 'tamam').sort((a, b) => a.sira - b.sira)[0]?.id ?? null;
}
type TeslimYenisi = Omit<Parameters<typeof sorgular.teslimAc>[1], 'isEmriId'> & { isEmriId?: number | null };
const teslimYaz = async (db: Db, t: TeslimYenisi): Promise<number | null> =>
  sorgular.teslimAc(db, { ...t, isEmriId: t.isEmriId !== undefined ? t.isEmriId : await teslimAdimi(db, t.uretimEmriId, t.hedefKonumId) });

// ---- İş kutusu ve menü sayaçları ------------------------------------------------------------------------------------
export async function isKutusu(db: Db, islemler: readonly string[], kisiId: number): Promise<IsKutusuCevabi> {
  const s = await sorgular.isKutusuSayilari(db);
  const depo = await sorgular.depoKimligi(db, 'ANA');
  const y = depo === null ? null : await sorgular.yerlesim(db, depo);
  const sayim = y ? (await sorgular.sayimBekleyenGozler(db, y.sayim_suresi_gun)).length : null;
  return {
    kabuldeBekleyen: s?.kabuldeBekleyen ?? 0, eksiBakiye: s?.eksiBakiye ?? 0, kritik: s?.kritik ?? 0, sayimBekleyen: sayim, logoFarki: s?.logoFarki ?? 0, logoHatasi: s?.logoHatasi ?? 0,
    fasondaEksik: await fasondaEksikSayisi(db),
    fasonEksikGonderimi: await fasonEksikGonderimSayisi(db),
    // Akış A provası D1: teslimi bekleyen istek depo işidir; yolda teslimi olan istek bekleyen sayılmaz.
    teslimBekleyenIstek: islemler.includes('stok.transfer')
      ? await sorgular.teslimBekleyenIstekSayisi(db, await istasyonKapsamiIdleri(db, await kapsamOku(db, kisiId))) : null,
    depoyaGelenTeslim: islemler.includes('stok.transfer') ? await sorgular.depoyaGelenTeslimSayisi(db) : null,
  };
}
// Fason firmasında parçası kalan emirlerden kapanmış olanlar; açık emrin parçası firmada beklenen yerdedir.
async function fasondaEksikSayisi(db: Db): Promise<number> {
  const firmada = await sorgular.firmadakiEmirler(db);
  if (firmada.length === 0) return 0;
  const durumlar = await emirDurumlari(db, firmada.map((e) => e.uretimEmriId));
  return firmada.filter((e) => !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(e.uretimEmriId) ?? '')).length;
}
// Açık fason işlerinde istasyonda yeterli parça olmadığı için gönderimi eksik giden (emir, firma, kart) sayısı (borç #440, kullanıcı kararı 16.10):
// gönderim reddedilmez; gönderilen adet ile "Yolda" konumuna giren taşıma karşılaştırılır. İlk adımda önceki istasyon yoktur, stok taşınmaz ve sayılmaz.
export async function fasonEksikGonderimSayisi(db: Db): Promise<number> {
  const beklenen = new Map<string, { emirId: number; firmaId: number; malzemeId: number; miktar: bigint }>();
  // Bir emrin birden çok fason işi ve aynı ürün kartı olur: emir ve kart özeti bir kez okunur.
  const emirler = new Map<number, Awaited<ReturnType<typeof uretimEmriOzeti>>>();
  const kartlar = new Map<number, Awaited<ReturnType<typeof malzemeOzeti>>>();
  for (const x of await fasonIsEmirleri(db)) {
    if (x.firmaId === null || (x.gonderilen ?? 0) <= 0) continue;
    if (!emirler.has(x.uretimEmriId)) emirler.set(x.uretimEmriId, await uretimEmriOzeti(db, x.uretimEmriId));
    const emir = emirler.get(x.uretimEmriId)!;
    const bilgi = await adimBilgisi(db, x.isEmriId);
    if (!emir || emir.malzemeNo === null || !bilgi || (bilgi.onculOpNolari ?? bilgi.oncekiOpNolari).length === 0) continue;
    if (!kartlar.has(emir.malzemeNo)) kartlar.set(emir.malzemeNo, await malzemeOzeti(db, emir.malzemeNo));
    const o = kartlar.get(emir.malzemeNo)!;
    if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) continue;
    const yari = await fasonYariParcasi(db, x.uretimEmriId, emir.malzemeNo, x.isEmriId);
    const malzemeId = yari?.malzemeId ?? emir.malzemeNo;
    const miktar = yari ? adetMiktari(BigInt(x.gonderilen!) * 1000n, yari.birim) : BigInt(x.gonderilen!) * 1000n;
    const anahtar = `${String(x.uretimEmriId)}:${String(x.firmaId)}:${String(malzemeId)}`;
    const onceki = beklenen.get(anahtar);
    beklenen.set(anahtar, { emirId: x.uretimEmriId, firmaId: x.firmaId, malzemeId, miktar: (onceki?.miktar ?? 0n) + miktar });
  }
  let n = 0;
  const yoldalar = new Map<number, Awaited<ReturnType<typeof sorgular.firmaKonumu>>>();
  for (const b of beklenen.values()) {
    if (!yoldalar.has(b.firmaId)) yoldalar.set(b.firmaId, await sorgular.firmaKonumu(db, b.firmaId, 'yolda'));
    const yolda = yoldalar.get(b.firmaId)!;
    const tasinan = yolda === null ? 0n : binde(await sorgular.fasonaTasinan(db, b.emirId, b.malzemeId, yolda));
    if (fasonGonderimiEksikMi(b.miktar, tasinan)) n += 1;
  }
  return n;
}
// Rol panosu: yetkisi olmayan sayı hesaplanmaz, null döner. Sayım süresi tanımsızsa (ana depo yerleşimi yok) sayım null.
export async function stokOzeti(db: Db, islemler: readonly string[]): Promise<StokOzetiCevabi> {
  const okur = islemler.includes('sayfa.stok') || STOK_ISLEMLERI.some((i) => islemler.includes(i));
  let sayimBekleyen: number | null = null;
  if (islemler.includes('stok.sayim')) {
    const depo = await sorgular.depoKimligi(db, 'ANA');
    const y = depo === null ? null : await sorgular.yerlesim(db, depo);
    sayimBekleyen = y ? (await sorgular.sayimBekleyenGozler(db, y.sayim_suresi_gun)).length : null;
  }
  return {
    acikIstek: islemler.includes('stok.transfer') ? await sorgular.acikIstekSayisi(db) : null,
    dusukStok: okur ? await sorgular.dusukStokSayisi(db) : null,
    sayimBekleyen,
    eksikEmir: okur ? await eksikEmirSayisi(db) : null,
  };
}
// Açık emirlerden plana göre kalan ihtiyacı kullanılabilir stokla karşılanamayanlar: bir öngörüdür; tamamlama eksik aramaz (K-1 a). Her emir stoğu
// tek başına görür: iki emir aynı malzemeyi bekliyorsa ikisi de yeterli sayılabilir. Ürün kartı olmayan eski emir sayılmaz.
// Emirler aynı malzemeleri paylaşır: bakiye ve kart özeti tek okuma işleminde bir kez okunur (hesap aynı, sorgu azalır).
async function eksikEmirSayisi(db: Db): Promise<number> {
  const onbellek: TamamlamaOnbellegi = { bakiye: new Map(), ozet: new Map() };
  const ids = (await acikEmirler(db)).map((e) => e.id);
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, ids);
  const verilenler = await sorgular.emirlerinNetSarfi(db, ids);
  let n = 0;
  for (const id of ids) {
    const satirlar = ihtiyaclar.get(id) ?? null;
    if (satirlar === null) continue;
    const ihtiyac = ihtiyacToplami(satirlar.map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut })));
    const verilen = new Map(verilenler.filter((v) => v.emirId === id).map((v) => [v.malzemeId, binde(v.miktar)]));
    const ozet = await onbellekliOzetler(db, [...ihtiyac.keys()], onbellek);
    if ((await kalanIhtiyacPlani(db, ihtiyac, verilen, ozet, onbellek)).bilesenler.some((b) => binde(b.eksik) > 0n)) n += 1;
  }
  return n;
}
// Sayaç ucu: madde anahtarı -> sayı. Yetkisi olmayan maddenin sayısı null (kabuk göstermez); sayılamayan madde null.
export async function menuSayaclari(db: Db, islemler: readonly string[], kisiId: number): Promise<IkinciMenuSayaclari> {
  const k = await isKutusu(db, islemler, kisiId);
  const kapsamliIstasyonlar = await istasyonKapsamiIdleri(db, await kapsamOku(db, kisiId));
  // İş kutusu ekranındaki satır sayısı: sıfır olmayan her iş türü bir satırdır (ekranla aynı sayı).
  const isler = [k.kabuldeBekleyen, k.eksiBakiye, k.kritik, k.logoFarki, k.logoHatasi, k.sayimBekleyen ?? 0, k.fasondaEksik, k.fasonEksikGonderimi, k.teslimBekleyenIstek ?? 0, k.depoyaGelenTeslim ?? 0].filter((n) => n > 0).length;
  return {
    'is-kutusu': islemler.includes('sayfa.stok') ? isler : null,
    'mal-kabul': islemler.includes('stok.giris') ? k.logoFarki : null,
    // Hazırlık: bekleyen istekler ve açık listeler birlikte.
    hazirlik: islemler.includes('stok.transfer') || islemler.includes('stok.toplama')
      ? (islemler.includes('stok.transfer') ? await sorgular.acikIstekSayisi(db, kapsamliIstasyonlar) : 0) + await sorgular.toplamaSay(db, 'topluyor', kapsamliIstasyonlar) : null,
    okut: null, depo: null,
    // Depo sevk (960): sayaç yok; liste sevkiyatın tetiklediği kalemlerdir, kabuk rozet göstermez.
    'depo-sevk': null,
    sepet: islemler.includes('stok.transfer') ? (await sorgular.sepetSatirlari(db, kisiId)).length : null,
    malzemeler: null, hareketler: null, 'refakat-kartlari': null, 'malzeme-fisleri': null, konumlar: null, ayarlar: null,
  };
}

// ---- Depo ve konum -----------------------------------------------------------------------------------------------------
export async function depoListesi(db: Db): Promise<DepolarCevabi> { return { depolar: await sorgular.depolar(db) }; }

export function konumListesi(db: Db, s: KonumlarListesi): Promise<SayfaliListe<Konum>> {
  const suzgec = { tur: s.tur, rafId: s.rafId, metin: s.metin };
  return sayfaliListe(s, { say: () => sorgular.konumSay(db, suzgec), satirlar: (d) => sorgular.konumlar(db, suzgec, s, d) });
}
// Zemin ızgarası (kart #1304): konumun karesi bağlı olduğu öğenin (gözün rafı, alan, istasyon) karesidir; bölüm kodu ve kare
// adıyla yazılır ("DEPO1 C4"). Öğesi haritada olmayan konumun karesi yoktur, uydurulmaz.
async function zeminDurumu(db: Db) {
  const z = await haritaZemini(db);
  const konumlar = await sorgular.zeminKonumlari(db);
  const gozRafi = new Map((await haritaGozleri(db)).map((g) => [g.id, g.rafId]));
  const kareler = new Map<string, { salonId: number; bolumKod: string; hucre: string }>();
  for (const b of z.bolumler) for (const n of b.nesneler) kareler.set(`${n.tur}:${n.id}`, { salonId: b.salonId, bolumKod: b.kod, hucre: n.hucre });
  const kare = (k: { gozId: number | null; alanId: number | null; istasyonId: number | null }) =>
    (k.gozId !== null ? kareler.get(`raf:${gozRafi.get(k.gozId)}`) : k.alanId !== null ? kareler.get(`alan:${k.alanId}`)
      : k.istasyonId !== null ? kareler.get(`istasyon:${k.istasyonId}`) : undefined) ?? null;
  const konumKaresi = new Map(konumlar.flatMap((k) => { const y = kare(k); return y ? [[k.id, y] as const] : []; }));
  return { z, konumlar, konumKaresi, zeminMetni: (konumId: number) => { const y = konumKaresi.get(konumId); return y ? `${y.bolumKod} ${y.hucre}` : null; } };
}

export async function zeminIzgarasi(db: Db): Promise<ZeminCevabi> {
  const { z, konumlar, konumKaresi } = await zeminDurumu(db);
  const depo = new Map((await sorgular.haritaDepolari(db)).flatMap((d) => (d.salonId !== null && d.aktif ? [[d.salonId, d.kod] as const] : [])));
  return {
    bolumler: z.bolumler.map((b) => ({
      ...b, depoKod: depo.get(b.salonId) ?? null,
      konumlar: konumlar.flatMap((k) => { const y = konumKaresi.get(k.id); return y && y.salonId === b.salonId ? [{ id: k.id, kod: k.kod, tur: k.tur, hucre: y.hucre, satirSayisi: k.satirSayisi }] : []; }),
    })),
    istasyonlar: z.istasyonlar,
  };
}

export async function konumAyrintisi(db: Db, id: number): Promise<KonumAyrintiCevabi> {
  const konum = await sorgular.konumBul(db, id);
  if (!konum) throw bulunamadi('Konum bulunamadı.');
  const b = await sorgular.konumBakiyeleri(db, id);
  const ad = await adlar(db, b.map((x) => x.malzemeId));
  const zemin = (await zeminDurumu(db)).zeminMetni(id);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return {
    konum, raf: konum.rafId === null ? null : await sorgular.konumunRafOlcusu(db, id), bakiyeler: b.map((x) => ({ ...bakiyeSatiri(x, ad, nolar), zemin })), zemin,
    haritaYeri: konum.haritaGozId !== null ? (await haritaGozAdresi(db, konum.haritaGozId))?.adres ?? null
      : konum.haritaAlanId !== null ? (await haritaAlanlari(db)).find((a) => a.id === konum.haritaAlanId)?.ad ?? null : null,
  };
}
export async function konumAc(db: Db, g: { tur: ElleKonumTuru; kod: string; ad?: string | null | undefined; depoId?: number | undefined }): Promise<{ konum: Konum }> {
  const depoId = g.depoId ?? (await sorgular.depoKimligi(db, 'ANA'));
  if (depoId === null || !(await sorgular.depoVarMi(db, depoId))) throw dogrulama('Depo bulunamadı.', 'depoId');
  const id = await korumali(() => sorgular.konumAc(db, { depoId, kod: g.kod, tur: g.tur, ad: g.ad ?? null }));
  return { konum: (await sorgular.konumBul(db, id))! };
}
export async function konumDuzenle(db: Db, id: number, g: { surum: number; kod: string; ad?: string | null | undefined; tur?: ElleKonumTuru | undefined }): Promise<KonumDuzenleCevabi> {
  const k = await sorgular.konumBul(db, id);
  if (k && k.tur === 'raf_gozu' && k.kod !== g.kod) throw dogrulama('Raf gözünün kodu raftan gelir; rafı düzenleyin.', 'kod');
  if (k && ['KABUL', 'URETIM'].includes(k.kod) && k.kod !== g.kod) throw dogrulama('Sabit konumun kodu değişmez.', 'kod');
  const turEngeli = k && g.tur !== undefined ? konumTurDegisimEngeli(k, g.tur) : null;
  if (turEngeli !== null) throw dogrulama(turEngeli, 'tur');
  await korumali(() => surumluGuncelle({ guncelle: () => sorgular.konumGuncelle(db, id, g.surum, { kod: g.kod, ad: g.ad ?? null, tur: g.tur ?? null }), varMi: () => sorgular.konumVarMi(db, id), bulunamadiIletisi: 'Konum bulunamadı.' }));
  return { konum: (await sorgular.konumBul(db, id))!, koduDegisenler: koduDegisenler(k ? [k] : [], await sorgular.kodDurumlari(db, { idler: [id] })) };
}
export async function konumPasif(db: Db, id: number, surum: number): Promise<{ konum: Konum }> {
  const k = await sorgular.konumBul(db, id);
  if (k && ['KABUL', 'URETIM'].includes(k.kod)) throw gecersiz('Sabit konum pasife alınamaz.');
  if (k && k.tur === 'raf_gozu') throw gecersiz('Raf gözü raftan kapatılır; rafı düzenleyin.');
  await korumali(() => surumluGuncelle({ guncelle: () => sorgular.konumPasifYap(db, id, surum), varMi: () => sorgular.konumVarMi(db, id), bulunamadiIletisi: 'Konum bulunamadı.' }));
  return { konum: (await sorgular.konumBul(db, id))! };
}

// Fabrika Haritası raf, göz ve alanın tek kaynağıdır (#686); eşleme depo seçilmiş bölümün yeni yerini stok konumu yapar (#711).
async function haritaDurumu(db: Db) {
  const gozler = await haritaGozleri(db), alanlar = await haritaAlanlari(db), depolar = await sorgular.haritaDepolari(db);
  const plan = haritaPlani({ gozler, alanlar, depolar, konumlar: await sorgular.haritaKonumlari(db), kodlar: new Set(await sorgular.tumKonumKodlari(db)) });
  return { gozler, alanlar, depolar, plan };
}
export async function haritadanEsle(db: Db): Promise<HaritaEslemeCevabi> {
  const { plan } = await haritaDurumu(db);
  const idler = plan.guncelle.map((k) => k.id);
  const onceki = idler.length === 0 ? [] : await sorgular.kodDurumlari(db, { idler });
  for (const k of plan.ekle) await korumali(() => sorgular.haritaKonumuAc(db, k));
  for (const k of plan.guncelle) await korumali(() => sorgular.haritaKonumuGuncelle(db, k));
  for (const k of plan.turDegisimi) await sorgular.haritaKonumuTuru(db, k);
  const kapatilan = plan.kapat.length === 0 ? 0 : (await sorgular.haritaKonumlariniKapat(db, plan.kapat)).length;
  return {
    eklenen: plan.ekle.length, guncellenen: plan.guncelle.length + plan.turDegisimi.length, kapatilan, atlanan: plan.atlanan,
    koduDegisenler: idler.length === 0 ? [] : koduDegisenler(onceki, await sorgular.kodDurumlari(db, { idler })),
  };
}

export async function haritaOzeti(db: Db): Promise<HaritaOzetiCevabi> {
  const { gozler, alanlar, depolar, plan } = await haritaDurumu(db);
  const bolumler = new Map<number, { salonId: number; kod: string; gozSayisi: number }>();
  for (const z of gozler) {
    const b = bolumler.get(z.salonId) ?? { salonId: z.salonId, kod: z.salonKodu, gozSayisi: 0 };
    b.gozSayisi += 1;
    bolumler.set(z.salonId, b);
  }
  for (const a of alanlar) if (haritaAlaniMi(a.tur) && !bolumler.has(a.salonId)) bolumler.set(a.salonId, { salonId: a.salonId, kod: `Bölüm ${a.salonId}`, gozSayisi: 0 });
  const depo = new Map(depolar.flatMap((d) => (d.salonId !== null && d.aktif ? [[d.salonId, d.kod] as const] : [])));
  return {
    ...(await sorgular.haritaBagSayilari(db)), eslenmemis: plan.ekle.length + plan.atlanan.length, bagsizKonumlar: await sorgular.haritasizKonumlar(db),
    bolumler: [...bolumler.values()].sort((x, y) => x.kod.localeCompare(y.kod, 'tr')).map((b) => ({ ...b, depoKod: depo.get(b.salonId) ?? null })),
  };
}

export async function gozStoklari(db: Db, gozIdler: number[]): Promise<GozStoklariCevabi> {
  const satirlar = await sorgular.gozStoklari(db, gozIdler);
  const ad = await adlar(db, satirlar.flatMap((s) => (s.ilkMalzemeId === null ? [] : [s.ilkMalzemeId])));
  return { gozler: satirlar.map(({ ilkMalzemeId, ...s }) => ({ ...s, ilkMalzemeAd: ilkMalzemeId === null ? null : ad.get(ilkMalzemeId) ?? null })) };
}

// Bölümü stok deposu yapar (varsa pasif depoyu açar, yoksa bölüm kodundan açar) ya da depodan çıkarır. Çıkarmada bölümde stok ya da
// sabit konum (KABUL, URETIM) varsa reddedilir; boş konumlar kapanır. Ardından eşleme koşar.
// DEP-61 (kart #1304): Stok Merkezi'nden raf ve göz kalemi yalnız stok deposu yapılmış (etkin) bölümde yazılır; öbür bölümler
// ve makineler Fabrika Haritası'nın düzenleme yetkisini ister. Raf kaydında bölümün öbür öğeleri kayıtlı haliyle kalır.
const DEPO_DEGIL = 'Bu bölüm stok deposu değil; rafını Fabrika Haritası yetkisi olan kişi düzenler.';
async function depoBolumuOlmali(db: Db, salonId: number | null): Promise<void> {
  if (salonId === null) throw bulunamadi('Göz bulunamadı.');
  if (!(await sorgular.haritaDepolari(db)).some((d) => d.aktif && d.salonId === salonId)) throw yetkiYok(DEPO_DEGIL);
}
export async function depoRaflariKaydet(db: Db, salonId: number, g: { surum: number; raflar: RafKaydi[] }, kisiId: number): Promise<KayitCevabi> {
  await depoBolumuOlmali(db, salonId);
  return rafYerlesimiKaydet(db, salonId, g, kisiId);
}
export async function depoGozKalemiYaz(db: Db, g: GozKalemiKaydi, kisiId: number): Promise<GozKalemi> {
  await depoBolumuOlmali(db, (await haritaGozAdresi(db, g.gozId))?.salonId ?? null);
  return haritaGozKalemiYaz(db, g, kisiId);
}
export async function depoGozKalemiSil(db: Db, id: number): Promise<void> {
  const salonId = await gozKaleminBolumu(db, id);
  if (salonId === null) throw bulunamadi('Göz kalemi bulunamadı.');
  await depoBolumuOlmali(db, salonId);
  await haritaGozKalemiSil(db, id);
}

export async function bolumDeposu(db: Db, salonId: number, depoOlsun: boolean): Promise<HaritaOzetiCevabi> {
  const { gozler, alanlar, depolar } = await haritaDurumu(db);
  const salonKodu = gozler.find((z) => z.salonId === salonId)?.salonKodu ?? (alanlar.some((a) => a.salonId === salonId) ? `BOLUM${salonId}` : null);
  if (salonKodu === null) throw bulunamadi('Bölüm Fabrika Haritası\'nda bulunamadı ya da rafı yok.');
  const mevcut = depolar.find((d) => d.salonId === salonId) ?? null;
  if (depoOlsun) {
    if (mevcut) await sorgular.depoAktifligi(db, mevcut.id, true);
    else await korumali(() => sorgular.haritaDeposuAc(db, { salonId, kod: depoKoduOner(salonKodu, new Set(depolar.map((d) => d.kod))), ad: salonKodu }));
  } else if (mevcut?.aktif) {
    const dolu = await sorgular.depoDoluMu(db, mevcut.id);
    if (dolu.sabit > 0) throw gecersiz('Bu bölümde mal kabul ve üretim çıkışı konumları var; ana depo depodan çıkarılamaz.');
    if (dolu.bakiye > 0) throw cakisma(`Bölümde ${dolu.bakiye} stok satırı var; önce taşıyın.`);
    await sorgular.depoKonumlariniKapat(db, mevcut.id);
    await sorgular.depoAktifligi(db, mevcut.id, false);
  }
  await haritadanEsle(db);
  return haritaOzeti(db);
}

// ---- Raf -------------------------------------------------------------------------------------------------------------------
export function rafListesi(db: Db, s: RaflarListesi): Promise<SayfaliListe<Raf>> {
  const suzgec = { tur: s.tur, metin: s.metin };
  return sayfaliListe(s, { say: () => sorgular.rafSay(db, suzgec), satirlar: (d) => sorgular.raflar(db, suzgec, s, d) });
}
export async function rafMatrisi(db: Db, id: number): Promise<RafMatrisiCevabi> {
  const raf = await sorgular.rafBul(db, id);
  if (!raf) throw bulunamadi('Raf bulunamadı.');
  const gozler = await sorgular.rafinGozleri(db, id);
  const ad = await adlar(db, gozler.flatMap((g) => (g.ilkMalzemeId === null ? [] : [g.ilkMalzemeId])));
  return { raf, gozler: gozler.map(({ ilkMalzemeId, ...g }) => ({ ...g, ilkMalzemeAd: ilkMalzemeId === null ? null : ad.get(ilkMalzemeId) ?? null })) };
}
type RafGirdisi = Omit<RafAcKomutu, 'depoId'>;
async function gozleriKur(db: Db, rafId: number, depoId: number, r: RafGirdisi): Promise<void> {
  const gozler = rafGozleri({ kod: r.kod, numaralama: r.numaralama, ilkBolme: r.ilkBolme, bolmeSayisi: r.bolmeSayisi, katSayisi: r.katSayisi });
  await korumali(async () => {
    await sorgular.kodDenetiminiErtele(db);
    await sorgular.gozKodlariniYenile(db, rafId, r.kod);
    await sorgular.fazlaGozleriKapat(db, rafId, gozler);
    await sorgular.gozleriYaz(db, rafId, depoId, gozler);
    await sorgular.kodDenetiminiAc(db);
  });
}
export async function rafAc(db: Db, g: RafAcKomutu): Promise<{ raf: Raf }> {
  const depoId = g.depoId ?? (await sorgular.depoKimligi(db, 'ANA'));
  if (depoId === null || !(await sorgular.depoVarMi(db, depoId))) throw dogrulama('Depo bulunamadı.', 'depoId');
  const id = await korumali(() => sorgular.rafAc(db, { ...g, depoId }));
  await gozleriKur(db, id, depoId, g);
  return { raf: (await sorgular.rafBul(db, id))! };
}
const bolmeleri = (r: { numaralama: 'sirali' | 'tek' | 'cift'; ilkBolme: number; bolmeSayisi: number }): number[] =>
  Array.from({ length: r.bolmeSayisi }, (_, k) => bolmeNo(r.numaralama, r.ilkBolme, k));
export async function rafDuzenle(db: Db, id: number, g: RafDuzenleKomutu): Promise<RafDuzenleCevabi> {
  const { surum, ...alanlar } = g;
  const eski = await sorgular.rafBul(db, id, true);
  const onceki = await sorgular.kodDurumlari(db, { rafId: id });
  if (eski) await korumali(() => sorgular.gozleriYenidenNumarala(db, id, bolmeleri(eski), bolmeleri(alanlar)));
  await korumali(() => surumluGuncelle({ guncelle: () => sorgular.rafGuncelle(db, id, surum, alanlar), varMi: () => sorgular.rafVarMi(db, id), bulunamadiIletisi: 'Raf bulunamadı.' }));
  const raf = (await sorgular.rafBul(db, id))!;
  await gozleriKur(db, id, raf.depoId, alanlar);
  return { raf: (await sorgular.rafBul(db, id))!, koduDegisenler: koduDegisenler(onceki, await sorgular.kodDurumlari(db, { rafId: id })) };
}
export async function rafPasif(db: Db, id: number, surum: number): Promise<{ raf: Raf }> {
  await korumali(async () => {
    await surumluGuncelle({ guncelle: () => sorgular.rafPasifYap(db, id, surum), varMi: () => sorgular.rafVarMi(db, id), bulunamadiIletisi: 'Raf bulunamadı.' });
    await sorgular.rafGozleriniKapat(db, id);
  });
  return { raf: (await sorgular.rafBul(db, id))! };
}

// ---- Malzeme gözüyle stok -------------------------------------------------------------------------------------------------
// Açık emirlere ayrılan toplam, malzeme başına (kapanan ya da iptal edilen emrinki sayılmaz).
async function rezerveToplamlari(db: Db, malzemeIdler: number[]): Promise<Map<number, bigint>> {
  const satirlar = malzemeIdler.length === 0 ? [] : await sorgular.rezerveler(db, malzemeIdler);
  const durumlar = await emirDurumlari(db, satirlar.map((r) => r.uretimEmriId));
  const t = new Map<number, bigint>();
  for (const r of satirlar) {
    if ((ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(r.uretimEmriId) ?? '')) t.set(r.malzemeId, (t.get(r.malzemeId) ?? 0n) + binde(r.miktar));
  }
  return t;
}
function malzemeSatiri(h: sorgular.MalzemeStokHam, o: KatalogMalzemeOzeti | undefined | null, rezerve: bigint): MalzemeStokSatiri {
  return {
    malzemeId: h.malzemeId, ad: o?.ad ?? null, stokKodu: o?.kod ?? null, tur: o?.tur ?? null, birim: o?.birim ?? null,
    toplam: bindenMetin(binde(h.toplam)), serbest: bindenMetin(binde(h.serbest)), statude: bindenMetin(binde(h.statude)), kritikSeviye: h.kritikSeviye, durum: stokDurumu(h.serbest, h.kritikSeviye), konumSayisi: h.konumSayisi,
    rezerve: bindenMetin(rezerve),
    konumlar: h.konumlar.map((k) => ({ ...k, miktar: bindenMetin(binde(k.miktar)) })),
  };
}
// Kart tablosu malzemelerindir: "bütün kartlar" sayfası malzemeAra ile gelir, stok sayıları o sayfanın kartları için okunur.
const STOKLANIR_TURLER = KATALOG_TURLERI.filter(stoklanirMi);
async function kartListesi(db: Db, s: MalzemelerListesi): Promise<SayfaliListe<MalzemeStokSatiri>> {
  const metin = s.metin ?? null;
  return sayfaliListe(s, {
    say: async () => (await malzemeAra(db, { metin, turler: STOKLANIR_TURLER, sayfa: 1, sayfaBoyu: 1 })).toplam ?? 0,
    satirlar: async (d) => {
      const kartlar = (await malzemeAra(db, { metin, turler: STOKLANIR_TURLER, sayfa: Math.floor(d.atla / d.sinir) + 1, sayfaBoyu: d.sinir })).satirlar;
      const stok = await sorgular.kartStoklari(db, kartlar.map((k) => k.id));
      const rezerve = await rezerveToplamlari(db, stok.map((h) => h.malzemeId));
      return stok.map((h, i) => malzemeSatiri(h, kartlar[i], rezerve.get(h.malzemeId) ?? 0n));
    },
  });
}
export async function malzemeListesi(db: Db, s: MalzemelerListesi): Promise<SayfaliListe<MalzemeStokSatiri>> {
  if (s.kapsam === 'kartlar') return kartListesi(db, s);
  // Ad ve stok koduyla eşleşen kartların ilk 200'ü süzgece girer; fazlası daha uzun metinle daraltılır.
  const adlaBulunan = s.metin ? (await malzemeAra(db, { metin: s.metin, sayfa: 1, sayfaBoyu: 200 })).satirlar.map((x) => x.id) : undefined;
  // Statülü süzgeç tanımlı statüsü olan kartı stoğu olmasa da getirir; metin statü adıyla da aranır (K-X8).
  const tum = s.durum === 'statulu' || s.metin ? (await statuler(db)).statuler : [];
  const statuIdleri = s.metin ? statuAramasi(tum, s.metin) : [];
  const kaynak = s.metin ? tum.filter((x) => statuIdleri.includes(x.id)) : tum;
  const statuluKartlar = await kartlarKoddan(db, statuKodlari(kaynak));
  const suzgec = { durum: s.durum, metin: s.metin, adlaBulunan, statuIdleri, statuluKartlar };
  const l = await sayfaliListe(s, { say: () => sorgular.malzemeSay(db, suzgec), satirlar: (d) => sorgular.malzemeStoklari(db, suzgec, s, d) });
  const ozetler = await malzemeOzetleri(db, l.satirlar.map((h) => h.malzemeId));
  const rezerve = await rezerveToplamlari(db, l.satirlar.map((h) => h.malzemeId));
  return { ...l, satirlar: l.satirlar.map((h) => malzemeSatiri(h, ozetler.get(h.malzemeId), rezerve.get(h.malzemeId) ?? 0n)) };
}
async function kartlarKoddan(db: Db, kodlar: readonly string[]): Promise<number[]> {
  const idler: number[] = [];
  for (const kod of kodlar) { const no = await malzemeNoKoddan(db, kod); if (no !== null) idler.push(no); }
  return idler;
}
export async function malzemeOzetiOku(db: Db, id: number): Promise<MalzemeOzetiCevabi> {
  const o = await malzemeOzeti(db, id);
  if (!o) throw bulunamadi('Malzeme kartı bulunamadı.');
  return { ozet: { id: o.id, tur: o.tur, kod: o.kod, ad: o.ad, onayDurumu: o.onayDurumu, kullanilabilir: await malzemeKullanilabilirMi(db, id), birim: o.birim } };
}
export async function malzemeAyrintisi(db: Db, id: number): Promise<MalzemeAyrintiCevabi> {
  const h = await sorgular.malzemeStoku(db, id);
  const o = await malzemeOzeti(db, id);
  if (!o) throw bulunamadi('Malzeme kartı bulunamadı.');
  const b = await sorgular.malzemeBakiyeleri(db, id);
  const ad = new Map(o.ad === null ? [] : [[id, o.ad]]);
  const ayar = await sorgular.malzemeAyari(db, id);
  const son = await sorgular.hareketler(db, { malzemeId: id }, {}, { sinir: 5, atla: 0 });
  const { zeminMetni } = await zeminDurumu(db);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  const kirilim = statuKirilimi(b);
  return {
    satir: malzemeSatiri(h!, o, (await rezerveToplamlari(db, [id])).get(id) ?? 0n),
    bakiyeler: b.map((x) => ({ ...bakiyeSatiri(x, ad, nolar), zemin: zeminMetni(x.konumId) })),
    statuKirilimi: kirilim,
    tanimliStatuler: stoksuzStatuler((await statuler(db)).statuler, o.kod, kirilim),
    rezerveler: (await rezerveListesi(db, id)).rezerveler,
    bekleyenler: (await bekleyenEmirler(db, id)).map((e) => ({ uretimEmriId: e.uretimEmriId, emirNo: e.emirNo, miktar: bindenMetin(e.bekleyen) })),
    ayar: {
      kritikSeviye: ayar?.kritikSeviye ?? null,
      varsayilanAmbalaj: ayar?.varsayilanAmbalajTur ? { tur: ayar.varsayilanAmbalajTur, olcu: ayar.varsayilanAmbalajOlcu ?? '' } : null,
      varsayilanKonum: ayar?.varsayilanKonumId != null && ayar.varsayilanKonumKod !== null ? { id: ayar.varsayilanKonumId, kod: ayar.varsayilanKonumKod } : null,
      ambalajlar: await sorgular.malzemeAmbalajlari(db, id),
      surum: ayar?.surum ?? null,
    },
    sonHareketler: await hareketleriCevir(db, son),
  };
}
export async function malzemeAyariYaz(db: Db, id: number, g: MalzemeAyarKomutu): Promise<MalzemeAyrintiCevabi> {
  if (!(await malzemeOzeti(db, id))) throw bulunamadi('Malzeme kartı bulunamadı.');
  const a = { kritikSeviye: g.kritikSeviye ?? null, ambalajTur: g.varsayilanAmbalaj?.tur ?? null, ambalajOlcu: g.varsayilanAmbalaj?.olcu ?? null, konumId: g.varsayilanKonumId };
  await korumali(async () => {
    if (a.konumId !== null && !(await sorgular.konumAktifMi(db, a.konumId))) throw gecersiz('Varsayılan konum bulunamadı ya da pasif.');
    if (g.surum === null) {
      if (!(await sorgular.ayarAc(db, id, a))) throw cakisma('Bu malzemenin ayarı az önce açıldı; yeniden okuyun.');
    } else {
      const surum = g.surum;
      await surumluGuncelle({ guncelle: () => sorgular.ayarGuncelle(db, id, surum, a), varMi: () => sorgular.ayarVarMi(db, id), bulunamadiIletisi: 'Malzeme ayarı bulunamadı.' });
    }
    await sorgular.ambalajlariYaz(db, id, g.ambalajlar);
  });
  return malzemeAyrintisi(db, id);
}
// DEP-60: kart kimliği malzemelerden okunur (stok malzemeleri ithal eder, ters yön döngü olurdu).
export function malzemeKartBilgileri(db: Db, s: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<MalzemeKartBilgileriCevabi['satirlar'][number]>> {
  return sayfaliListe(s, {
    say: () => sorgular.kartBilgisiSay(db),
    satirlar: async (d) => {
      const satirlar = await sorgular.kartBilgileri(db, d);
      const ozet = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeId));
      return satirlar.map((x) => ({ ...x, kartKimligi: ozet.get(x.malzemeId)?.kimlik ?? null }));
    },
    sayfaBoyu: { varsayilan: 200, azami: 500 },
  });
}
export async function cikisOnerisiOku(db: Db, id: number, miktar: string): Promise<CikisOnerisiCevabi> {
  const b = await sorgular.serbestBakiyeler(db, id);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return cikisOnerisi(b.map((x) => ({
    bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, miktar: x.miktar, ilkGiris: x.ilkGiris,
    partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.uretimEmriId }, emirNoDe(nolar, x.uretimEmriId)),
  })), miktar);
}

// Göz önerisi (DEP-34): kural saf fonksiyondadır; veri yoksa null döner, göz uydurulmaz.
export async function gozOnerisi(db: Db, malzemeId: number): Promise<GozOnerisiCevabi> {
  const o = malKabulGozOnerisi(await sorgular.gozAdaylari(db, malzemeId));
  return { oneri: o ? { konumId: o.konumId, kod: o.kod } : null };
}

// Panel: iş kutusunun gösterge kartları, son yedi gün, kritik stok, raf doluluğu ve son hareketler.
export async function panel(db: Db, islemler: readonly string[]): Promise<PanelCevabi> {
  const s = await sorgular.panelSayilari(db);
  const kritik = await sorgular.kritikMalzemeler(db);
  const ko = await malzemeOzetleri(db, kritik.map((k) => k.malzemeId));
  const kritikListe = kritik.map((k) => {
    const o = ko.get(k.malzemeId);
    return { malzemeId: k.malzemeId, ad: o?.ad ?? null, kod: o?.kod ?? null, toplam: bindenMetin(binde(k.toplam)), kritikSeviye: k.kritikSeviye };
  });
  const raflar = await sorgular.raflar(db, {}, {}, { sinir: 12, atla: 0 });
  const son = await sorgular.hareketler(db, {}, {}, { sinir: 6, atla: 0 });
  return {
    malzemeCesidi: s?.malzemeCesidi ?? 0, gozDolu: s?.gozDolu ?? 0, gozToplam: s?.gozToplam ?? 0, kritik: s?.kritik ?? 0, eksi: s?.eksi ?? 0, kabulde: s?.kabulde ?? 0,
    toplamaBekleyen: await sorgular.toplamaSay(db, 'topluyor'),
    gunluk: await sorgular.gunlukHareketler(db),
    kritikListe,
    raflar: raflar.map((r) => ({ rafId: r.id, kod: r.kod, tur: r.tur, dolu: r.doluGoz, toplam: r.toplamGoz })),
    sonHareketler: await hareketleriCevir(db, son),
  };
}
// ---- Stok değeri (1382 d): üç yöntemin tek hesabı ---------------------------------------------------------------------------
// Kesim: `son` o andan önceki mal kabuller (null bütün geçmiş), `gun` kg fiyatının ve kurun günü (null bugün). Hurda her yöntemde
// talaş fiyatıyladır; fiyatı satın almadan (disari) gelir, eldeki miktar ve mal kabul sırası stoğundur.
interface Kesim { son: string | null; gun: string | null }
interface KesimFiyati { fiyat: ReadonlyMap<number, string | null>; talas: ReadonlyMap<number, string | null> }
async function degerlemeFiyatlari(db: Db, yontem: DegerlemeYontemi, malzemeIdler: readonly number[], kesimler: readonly Kesim[]): Promise<KesimFiyati[]> {
  const nolar = [...new Set(malzemeIdler)];
  let alis: Map<number, { ortalama: string | null; sonAlis: string | null }>[] = [];
  if (yontem !== 'guncel_kg' && nolar.length > 0) {
    const olaylar = await sorgular.degerlemeAlisOlaylari(db, nolar);
    const fiyat = await malKabulFiyatlari(db, olaylar.map((o) => o.malKabulSatirId));
    alis = alisFiyatlari(olaylar.map((o) => ({ ...o, fiyat: fiyat.get(o.malKabulSatirId) ?? null })), kesimler.map((k) => k.son));
  }
  const sonuc: KesimFiyati[] = [];
  for (const [i, k] of kesimler.entries()) {
    const kg = await degerlemeKgFiyatlari(db, nolar, k.gun);
    const alisFiyati = (no: number) => { const f = alis[i]?.get(no); return (yontem === 'son_alis' ? f?.sonAlis : f?.ortalama) ?? null; };
    sonuc.push({
      fiyat: new Map(nolar.map((no) => [no, yontem === 'guncel_kg' ? kg.get(no)?.tryBirimFiyati ?? null : alisFiyati(no)])),
      talas: new Map(nolar.map((no) => [no, kg.get(no)?.tryTalasBirimFiyati ?? null])),
    });
  }
  return sonuc;
}
const kurusa = (d: string): bigint => BigInt(d.replace('.', ''));
const kurustan = (k: bigint): string => `${k / 100n}.${(k % 100n).toString().padStart(2, '0')}`;
// Ayrı fiyatla değerlenen satırların (hurda ve öteki) değeri: fiyatlı kart yoksa null, fiyatsız kartlar sayılır.
function degerleriTopla(l: readonly { deger: string | null; fiyatsizKart: number }[]): { deger: string | null; fiyatsizKart: number } {
  const fiyatli = l.flatMap((x) => (x.deger === null ? [] : [kurusa(x.deger)]));
  return { deger: fiyatli.length === 0 ? null : kurustan(fiyatli.reduce((a, b) => a + b, 0n)), fiyatsizKart: l.reduce((a, x) => a + x.fiyatsizKart, 0) };
}
function hurdaAyriDeger(l: readonly { malzemeId: number; toplam: string; hurda: boolean }[], f: KesimFiyati): { deger: string | null; fiyatsizKart: number } {
  return degerleriTopla([stokDegeri(l.filter((x) => !x.hurda), f.fiyat), stokDegeri(l.filter((x) => x.hurda), f.talas)]);
}

export async function stokDegeriOku(db: Db, islemler: readonly string[], yontem: DegerlemeYontemi): Promise<StokDegeriCevabi> {
  if (!islemler.includes('finans.oku')) {
    return { degerGorunur: false, yontem, stokDegeri: null, fiyatsizKart: 0, ayri: { kalite: null, hurda: null, fason: null, yolda: null, diger: null, toplam: null } };
  }
  const gruplar = await sorgular.degerGrubuMalzemeToplamlari(db);
  const [f] = await degerlemeFiyatlari(db, yontem, gruplar.map((g) => g.malzemeId), [{ son: null, gun: null }]);
  const grup = (g: (typeof gruplar)[number]['grup']) => stokDegeri(gruplar.filter((x) => x.grup === g), g === 'hurda' ? f!.talas : f!.fiyat);
  const d = Object.fromEntries(DEGER_GRUPLARI.map((g) => [g, grup(g)])) as Record<(typeof DEGER_GRUPLARI)[number], ReturnType<typeof stokDegeri>>;
  return {
    degerGorunur: true, yontem, stokDegeri: d.kullanilabilir.deger, fiyatsizKart: d.kullanilabilir.fiyatsizKart,
    ayri: {
      kalite: d.kalite.deger, hurda: d.hurda.deger, fason: d.fason.deger, yolda: d.yolda.deger, diger: d.diger.deger,
      toplam: degerleriTopla(Object.values(d)).deger,
    },
  };
}

// Yönetici paneli (#1079): ay sonu stok değeri serisi. Ay listesi verisiz aylarda da tamdır; stoksuz ay null değerlidir.
export async function aylikStokDegeri(db: Db, islemler: readonly string[], ay: number, yontem: DegerlemeYontemi): Promise<AylikStokDegeriCevabi> {
  if (!islemler.includes('finans.oku')) return { degerGorunur: false, yontem, aylar: [] };
  const satirlar = await sorgular.aySonuMalzemeToplamlari(db, ay);
  const aylar = [...new Map(satirlar.map((x) => [x.ay, { ay: x.ay, son: x.son, gun: x.son === null ? null : x.gun }])).values()];
  const kartli = satirlar.flatMap((x) => (x.malzemeId === null || x.toplam === null ? [] : [{ ay: x.ay, malzemeId: x.malzemeId, toplam: x.toplam, hurda: x.hurda === true }]));
  const fiyatlar = await degerlemeFiyatlari(db, yontem, kartli.map((x) => x.malzemeId), aylar);
  return {
    degerGorunur: true, yontem,
    aylar: aylar.map((a, i) => {
      const d = hurdaAyriDeger(kartli.filter((x) => x.ay === a.ay), fiyatlar[i]!);
      return { ay: a.ay, stokDegeri: d.deger, fiyatsizKart: d.fiyatsizKart };
    }),
  };
}

// ---- Parti -------------------------------------------------------------------------------------------------------------------
async function partileriCevir(db: Db, l: sorgular.PartiHam[]): Promise<Parti[]> {
  const ad = await adlar(db, l.map((p) => p.malzemeId));
  return l.map((p) => ({ ...p, malzemeAd: ad.get(p.malzemeId) ?? null, eldeki: bindenMetin(binde(p.eldeki)) }));
}
export async function partiListesi(db: Db, s: PartilerListesi): Promise<SayfaliListe<Parti>> {
  const suzgec = { malzemeId: s.malzemeId, metin: s.metin };
  const l = await sayfaliListe(s, { say: () => sorgular.partiSay(db, suzgec), satirlar: (d) => sorgular.partiler(db, suzgec, s, d) });
  return { ...l, satirlar: await partileriCevir(db, l.satirlar) };
}
// Parti izi (DEP-25, DEP-48, Dal 9): partinin bütün hareketleri, çıktığı (ya da üretildiği) ve kartlarının üretim emirleri, o emirlerin
// sevkleri; lotun kartları, kartlarla üretilen partiler ve sevk çıkışları.
export async function partiIzi(db: Db, id: number): Promise<PartiIziCevabi> {
  const p = await sorgular.partiBul(db, id);
  if (!p) throw bulunamadi('Parti bulunamadı.');
  const h = await sorgular.hareketler(db, { partiId: id }, { sirala: 'zaman', yon: 'artan' }, { sinir: 500, atla: 0 });
  const kartlar = await refakatPartileriCevir(db, await sorgular.refakatPartileriBul(db, await sorgular.lotunKartlari(db, id)));
  const emirler = [...new Set([
    ...(p.uretimEmriId === null ? [] : [p.uretimEmriId]), ...h.flatMap((x) => (x.uretimEmriId === null ? [] : [x.uretimEmriId])), ...kartlar.map((k) => k.uretimEmriId),
  ])];
  const sevkler = await emirlerinSevkleri(db, emirler);
  return {
    parti: (await partileriCevir(db, [p]))[0]!, hareketler: await hareketleriCevir(db, h), emirler,
    sevkler: emirler.flatMap((e) => (sevkler.get(e) ?? []).map((x) => ({
      emirId: e, isId: x.isId, gun: x.tarih, durum: x.durum, adet: x.adet, firmaId: x.firmaId, firmaAdi: x.firmaAdi,
    }))),
    kartlar, ...(await kartlarinCiktiVeSevkleri(db, kartlar.map((k) => k.id))),
  };
}

// ---- Lot etiketi (#1060) ------------------------------------------------------------------------------------------------------
async function lotEtiketleriCevir(db: Db, h: sorgular.LotEtiketiHam[]): Promise<LotEtiketi[]> {
  const ozet = await malzemeOzetleri(db, h.map((x) => x.malzemeId));
  return h.map((x) => {
    const o = ozet.get(x.malzemeId);
    return { ...x, malzemeAd: o?.ad ?? null, malzemeKod: o?.kod ?? null, malzemeTuru: o?.tur ?? null, birim: o?.birim ?? null };
  });
}
export async function malKabulLotEtiketleri(db: Db, malKabulId: number): Promise<LotEtiketleriCevabi> {
  if (!(await sorgular.malKabulBul(db, malKabulId))) throw bulunamadi('Mal kabul belgesi bulunamadı.');
  return { etiketler: await lotEtiketleriCevir(db, await sorgular.malKabulLotEtiketleri(db, malKabulId)) };
}
// Etiket Merkezi için: olmayan parti ya da mal kabul boş liste verir (uçlardaki 404 yerine).
export async function lotEtiketleri(db: Db, a: { partiId: number } | { malKabulId: number }): Promise<LotEtiketi[]> {
  if ('partiId' in a) {
    const h = await sorgular.partiLotEtiketi(db, a.partiId);
    return h ? lotEtiketleriCevir(db, [h]) : [];
  }
  return lotEtiketleriCevir(db, await sorgular.malKabulLotEtiketleri(db, a.malKabulId));
}
export async function partiLotEtiketi(db: Db, partiId: number): Promise<LotEtiketleriCevabi> {
  const h = await sorgular.partiLotEtiketi(db, partiId);
  if (!h) throw bulunamadi('Parti bulunamadı.');
  return { etiketler: await lotEtiketleriCevir(db, [h]) };
}

// ---- Mal kabul (DEP-10, DEP-20, DEP-38, DEP-39) ---------------------------------------------------------------------------------
// Denetim eki komutta bir kez yazılır: satırların sertifika bağları burada toplanır, komut sonunda tek ek olur.
type DenetimDefteri = DenetimSecimi[];
async function malKabulSatirlariniYaz(
  db: Db, malKabulId: number, tur: string, satirlar: MalKabulKomutu['satirlar'], k: Kullanici, eksiOnay: boolean, denetim: DenetimDefteri,
): Promise<number[]> {
  const kisiId = k.id;
  const kabul = await varsayilanKonum(db, 'KABUL');
  const idler: number[] = [];
  for (const [i, s] of satirlar.entries()) {
    // Düzeltmede sıfır miktarlı satır o kalemin hiç gelmediğidir: yazılmaz (yalnız düzeltme gövdesi sıfıra izin verir).
    if (binde(s.miktar) === 0n) continue;
    const alan = `satirlar.${i}`;
    const malzemeId = Number(s.malzemeId);
    const o = await malzemeOzeti(db, malzemeId);
    if (!o) throw dogrulama('Malzeme kartı bulunamadı.', `${alan}.malzemeId`);
    if (!(await malzemeKullanilabilirMi(db, malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil; mal kabul yapılamaz.`);
    const siparisSatirId = s.siparisSatirId === undefined ? null : Number(s.siparisSatirId);
    const bagEngeli = siparisBagiEngeli(tur, siparisSatirId);
    if (bagEngeli) throw dogrulama(bagEngeli, `${alan}.siparisSatirId`);
    const [ss] = siparisSatirId === null ? [] : await siparisSatirlari(db, [siparisSatirId]);
    const siparisKarti = ss?.malzemeNo == null ? null : await malzemeOzeti(db, ss.malzemeNo);
    const satirTuru = malKabulSatirTuru({
      malzemeTuru: o.tur, siparisMalzemeTuru: siparisKarti?.tur ?? null, siparisVar: siparisSatirId !== null, fasonVar: s.fason !== undefined || s.fasonIsi !== undefined,
      konumVar: s.konumId !== undefined, partiVar: s.partiId !== undefined || !!(s.parti && (s.parti.tedarikciPartiNo || s.parti.dokumNo || s.parti.sertifikaNo)),
    });
    if ('hata' in satirTuru) throw dogrulama(`${o.ad ?? o.kod}: ${satirTuru.hata}`, `${alan}.${satirTuru.alan}`);
    // Fasonda satırın kartı dönen malzemedir; sipariş hizmet kartınadır (KD-009 karşılaştırması stok ve saf hizmet satırında).
    if (satirTuru.tur !== 'fason' && ss) {
      const malzemeEngeli = siparisMalzemeEngeli(malzemeId, ss.malzemeNo);
      if (malzemeEngeli) throw dogrulama(malzemeEngeli, `${alan}.siparisSatirId`);
    }
    const miktar = bindenMetin(binde(s.miktar));
    if (satirTuru.tur === 'hizmet') {
      if (s.sertifika) throw dogrulama(SERTIFIKA_PARTISIZ, `${alan}.sertifika`);
      const satirId = await korumali(() => sorgular.malKabulSatiriYaz(db, { malKabulId, sira: i + 1, malzemeId, miktar, partiId: null, konumId: null, hareketId: null, siparisSatirId, fasonCikisHareketId: null }));
      await teslimIsle(db, k, { siparisSatirId: siparisSatirId!, miktar, malKabulSatirId: satirId });
      await sevkKalemiKabulu(db, kisiId, s, alan, satirId);
      continue;
    }
    if (s.fasonIsi !== undefined) {
      if (s.fason !== undefined) throw dogrulama('Fason işinden dönüşte giden kart ayrıca seçilmez; giden, işin parçasıdır.', `${alan}.fason`);
      if (s.partiId !== undefined || s.parti || s.ambalaj || s.sertifika) throw dogrulama('Fason işinden dönen parça emrin parçasıdır; parti, ambalaj ve sertifika girilmez.', `${alan}.parti`);
      const konumId = s.konumId === undefined ? await sorgular.ilkKarantinaKonumu(db) : Number(s.konumId);
      if (konumId === null) throw dogrulama(KARANTINA_KONUMU_YOK, `${alan}.konumId`);
      const konum = await aktifKonum(db, konumId, `${alan}.konumId`);
      const karantina = fasonDonusKonumuEngeli(konum.tur);
      if (karantina) throw dogrulama(karantina, `${alan}.konumId`);
      const giren = await korumali(() => fasonIsindenDonus(db, kisiId, { isEmriId: Number(s.fasonIsi!.isEmriId), malzemeId, adet: binde(s.miktar), konumId, alan }));
      const satirId = await korumali(() => sorgular.malKabulSatiriYaz(db, { malKabulId, sira: i + 1, malzemeId, miktar: bindenMetin(giren.miktar), partiId: null, konumId, hareketId: giren.hareketId, siparisSatirId, fasonCikisHareketId: null }));
      idler.push(giren.hareketId);
      if (siparisSatirId !== null) await teslimIsle(db, k, { siparisSatirId, miktar: bindenMetin(giren.miktar), malKabulSatirId: satirId });
      await sevkKalemiKabulu(db, kisiId, s, alan, satirId);
      continue;
    }
    const fason = satirTuru.tur === 'fason' ? await fasonGideni(db, s.fason!, miktar, `${alan}.fason`) : null;
    const partiId = s.partiId === undefined ? undefined : Number(s.partiId);
    const hata = partiDenetimi(o.tur as MalzemeTuru, 'mal_kabul', { parti: s.parti ?? null, partiId });
    if (hata) throw dogrulama(hata, `${alan}.parti`);
    // 1246 (1247 d, 1251): kartı GKK isteyen satın alma lotu karantinaya karar bekliyor girer; kararı giriş kontrolü verir.
    const gkk = tur === 'satin_alma' && satirTuru.tur === 'stok' && (await gkkGerekenKartlar(db, [malzemeId])).has(malzemeId);
    const konumId = s.konumId !== undefined ? Number(s.konumId) : gkk ? await sorgular.ilkKarantinaKonumu(db) : kabul;
    if (konumId === null) throw dogrulama(GKK_KARANTINA_KONUMU_YOK, `${alan}.konumId`);
    const konum = await aktifKonum(db, konumId, `${alan}.konumId`);
    const gkkEngeli = gkk ? gkkGirisKonumuEngeli(konum.tur) : null;
    if (gkkEngeli) throw dogrulama(gkkEngeli, `${alan}.konumId`);
    const kalite: KaliteDurumu = gkk ? 'karar_bekliyor' : 'serbest';
    let parti: number | null = partiId ?? null;
    // Lotlu türde numarasız satır da parti açar (#1018); sarfta parti yalnız numara girilince açılır.
    const lotlu = partiGereksinimi(o.tur as MalzemeTuru, 'mal_kabul') === 'lot';
    if (parti === null && (lotlu || (s.parti && (s.parti.tedarikciPartiNo || s.parti.dokumNo)))) {
      const p = s.parti;
      parti = await korumali(() => partiBulVeyaAc(db, { malzemeId, tedarikciPartiNo: p?.tedarikciPartiNo ?? null, dokumNo: p?.dokumNo ?? null, sertifikaNo: p?.sertifikaNo ?? null, uretimEmriId: null, kisiId }));
    }
    if (s.sertifika && parti === null) throw dogrulama(SERTIFIKA_PARTISIZ, `${alan}.sertifika`);
    // Kalite kararı partiye verilir; GKK kartı lotsuz türde olamaz (malzemeler kuralı), bu yalnız savunmadır.
    if (gkk && parti === null) throw dogrulama('Giriş kalite kontrolü isteyen satır lotla girer.', `${alan}.parti`);
    const a = s.ambalaj ?? null;
    const yazilan = await korumali(async () => {
      const id = await sorgular.hareketYaz(db, hareket({
        tur: 'giris', malzemeId, miktar, kisiId, partiId: parti, partiSecimi: parti === null ? null : 'giris', hedefKonumId: konumId, girisKaynagi: 'mal_kabul',
        hedefKaliteDurumu: gkk ? kalite : null,
      }));
      await bakiyeDegistir(db, {
        malzemeId, konumId, partiId: parti, kaliteDurumu: kalite, fark: binde(miktar),
        ambalaj: a ? { tur: a.tur, olcu: a.olcu, uzunluk: a.ozelOlcu?.uzunlukCm ?? null, genislik: a.ozelOlcu?.genislikCm ?? null, yukseklik: a.ozelOlcu?.yukseklikCm ?? null, adet: a.adet ?? null } : null,
      });
      const fasonCikisHareketId = fason ? await fasonCikisiYaz(db, kisiId, fason, eksiOnay) : null;
      const satirId = await sorgular.malKabulSatiriYaz(db, { malKabulId, sira: i + 1, malzemeId, miktar, partiId: parti, konumId, hareketId: id, siparisSatirId, fasonCikisHareketId });
      return { id, satirId, fasonCikisHareketId };
    });
    if (s.sertifika && parti !== null) {
      const ad = `Sertifika ${s.parti?.sertifikaNo ?? s.parti?.dokumNo ?? s.parti?.tedarikciPartiNo ?? `P-${parti}`} (${o.kod})`;
      const belgeId = await belgeAcVeBagla(db, k, { ad, tur: 'sertifika', ozet: s.sertifika.ozet, dosyaAdi: s.sertifika.dosyaAdi }, 'stok', parti, (x) => { denetim.push(...x); });
      // Satın alma sertifikayı sipariş satırından da görür (kullanıcı isteği 13.10, #1026).
      if (siparisSatirId !== null) await kaydaBagla(db, k, belgeId, 'satin-alma', siparisSatirId);
    }
    // SH1 a: teslim satın almaya aynı işlemde yazılır; kalanı aşan miktar reddedilmez, satın almada fazla teslim görünür.
    if (siparisSatirId !== null) await teslimIsle(db, k, { siparisSatirId, miktar, malKabulSatirId: yazilan.satirId });
    await sevkKalemiKabulu(db, kisiId, s, alan, yazilan.satirId);
    idler.push(yazilan.id, ...(yazilan.fasonCikisHareketId === null ? [] : [yazilan.fasonCikisHareketId]));
  }
  return idler;
}
// Fasona giden yarı mamul: fason konumunda durur (oraya taşımayla gider); dönüşte o konumdan düşülür.
interface FasonGideni { malzemeId: number; konumId: number; partiId: number | null; secim: string | null; miktar: string }
async function fasonGideni(db: Db, f: NonNullable<MalKabulKomutu['satirlar'][number]['fason']>, donenMiktar: string, alan: string): Promise<FasonGideni> {
  const malzemeId = Number(f.malzemeId);
  const o = await malzemeOzeti(db, malzemeId);
  if (!o) throw dogrulama('Giden malzemenin kartı bulunamadı.', `${alan}.malzemeId`);
  if (!stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; giden malzeme fason konumundaki karttır.`, `${alan}.malzemeId`);
  const konumId = Number(f.konumId);
  const konum = await sorgular.konumBul(db, konumId);
  if (!konum || !konum.aktif) throw dogrulama('Fason konumu bulunamadı.', `${alan}.konumId`);
  if (konum.tur !== 'fason') throw dogrulama('Giden malzeme yalnız fason konumundan düşülür.', `${alan}.konumId`);
  const p = await kaynakPartisi(db, malzemeId, konumId, f.partiId === undefined ? undefined : f.partiId === null ? null : Number(f.partiId), `${alan}.partiId`);
  return { malzemeId, konumId, partiId: p.partiId, secim: p.secim, miktar: f.miktar === undefined ? donenMiktar : bindenMetin(binde(f.miktar)) };
}
async function fasonCikisiYaz(db: Db, kisiId: number, f: FasonGideni, eksiOnay: boolean): Promise<number> {
  const b = await sorgular.bakiyeKilitle(db, f.malzemeId, f.konumId, f.partiId);
  const onayliEksi = dusumDenetle(b?.miktar ?? '0', f.miktar, eksiOnay);
  const id = await sorgular.hareketYaz(db, hareket({
    tur: 'cikis', malzemeId: f.malzemeId, miktar: f.miktar, kisiId, partiId: f.partiId, partiSecimi: f.secim, kaynakKonumId: f.konumId, onayliEksi,
    cikisNedeni: 'diger', aciklama: 'Fason dönüşü',
  }));
  await bakiyeDegistir(db, { malzemeId: f.malzemeId, konumId: f.konumId, partiId: f.partiId, fark: -binde(f.miktar) });
  return id;
}
async function malKabulOzetiCevir(db: Db, b: sorgular.MalKabulHam): Promise<MalKabulOzeti> {
  const kisi = await kisiAdlari(db, [b.kisiId]);
  const { kisiId, ...geri } = b;
  return { ...geri, kisiAd: kisi.get(kisiId) ?? null };
}
const SERTIFIKA_PARTISIZ = 'Sertifika dosyası partiye bağlanır; satıra parti bilgisi girin.';
function denetimiYaz(denetim: DenetimDefteri, denetimEki: (s: readonly DenetimSecimi[]) => void): void {
  if (denetim.length > 0) denetimEki(denetim);
}
export async function malKabulYap(db: Db, k: Kullanici, g: MalKabulKomutu, denetimEki: (s: readonly DenetimSecimi[]) => void): Promise<MalKabulCevabi> {
  const id = await sorgular.malKabulAc(db, { no: await belgeNo(db, 'stok.mal-kabul-no', 'stok_mal_kabul'), tur: g.tur, irsaliyeNo: g.irsaliyeNo ?? null, duzeltilenId: null, kisiId: k.id });
  const denetim: DenetimDefteri = [];
  const hareketIdler = await malKabulSatirlariniYaz(db, id, g.tur, g.satirlar, k, g.eksiOnay === true, denetim);
  // Gelen serbest malzeme bekleyen emirlere sırayla ayrılır (fason dönüşü emrin kendi parçasıdır, ayrılmaz); talepte seçilen emir öne geçer.
  const serbest = g.satirlar.filter((x) => x.fason === undefined && x.fasonIsi === undefined);
  const satirEmri = await siparisSatirlarininEmri(db, serbest.flatMap((x) => (x.siparisSatirId === undefined ? [] : [Number(x.siparisSatirId)])));
  const onde = new Map<number, Set<number>>();
  for (const x of serbest) {
    const emirId = x.siparisSatirId === undefined ? undefined : satirEmri.get(Number(x.siparisSatirId));
    if (emirId !== undefined) onde.set(Number(x.malzemeId), (onde.get(Number(x.malzemeId)) ?? new Set()).add(emirId));
  }
  await bekleyenlereDagit(db, k.id, serbest.map((x) => Number(x.malzemeId)), onde);
  denetimiYaz(denetim, denetimEki);
  return { belge: await malKabulOzetiCevir(db, (await sorgular.malKabulBul(db, id))!), hareketIdler };
}
// Düzeltme (DEP-53): eski belgenin her satırı aynı işlemde ters çevrilir, siparişe bağlı satırın teslimi geri alınır, doğru
// satırlarla yeni belge açılır. Satırsız düzeltme belgeyi tamamen iptal eder: yeni belge satırsız kalır, iptalin kaydıdır.
export async function malKabulDuzelt(db: Db, k: Kullanici, id: number, g: MalKabulDuzeltKomutu, denetimEki: (s: readonly DenetimSecimi[]) => void): Promise<MalKabulCevabi> {
  const kisiId = k.id;
  const eski = await sorgular.malKabulBul(db, id, true);
  if (!eski) throw bulunamadi('Mal kabul belgesi bulunamadı.');
  const engel = duzeltmeEngeli({ duzeltildi: eski.duzeltenId !== null });
  if (engel) throw cakisma(engel);
  const hareketIdler: number[] = [];
  const satirlar = await sorgular.malKabulSatirlari(db, id);
  // Fason işinden dönen satırın stoğu emir adımıyla yazılmıştır (statü çevirme, sarf, çıktı); tek hareketle geri alınamaz.
  if (satirlar.some((s) => s.emirAdimi)) {
    throw cakisma('Bu belgede fason işinden dönen parça var; düzeltme onu geri alamaz. Farkı Stok Merkezi\'nde hareketle düzeltin.');
  }
  const gkkSatirlari = satirlar.filter((s) => s.gkk).map((s) => s.id);
  const gkkEngeli = girisKontroluDuzeltmeEngeli(gkkSatirlari.length === 0 ? [] : await sorgular.girisKontroluSatirlari(db, gkkSatirlari));
  if (gkkEngeli) throw cakisma(gkkEngeli);
  for (const s of satirlar) {
    if (s.hareketId !== null) hareketIdler.push(await tersCevir(db, kisiId, s.hareketId, g.eksiOnay === true, `Düzeltme: ${eski.no}`, true));
    if (s.fasonCikisHareketId !== null) hareketIdler.push(await tersCevir(db, kisiId, s.fasonCikisHareketId, g.eksiOnay === true, `Düzeltme: ${eski.no}`, true));
    if (s.siparisSatirId !== null) await teslimGeriAl(db, k, { malKabulSatirId: s.id });
  }
  // B-4 (1405 a): satırın kabul ettiği sevkiyat kalemi kabulü geri alır; kalem depoda yeniden bekler, yeni satır ona yeniden bağlanabilir.
  await depoKabulunuGeriAl(db, kisiId, satirlar.map((s) => s.id));
  const yeni = await korumali(async () => sorgular.malKabulAc(db, { no: await belgeNo(db, 'stok.mal-kabul-no', 'stok_mal_kabul'), tur: eski.tur, irsaliyeNo: eski.irsaliyeNo, duzeltilenId: id, kisiId }));
  const denetim: DenetimDefteri = [];
  hareketIdler.push(...(await malKabulSatirlariniYaz(db, yeni, eski.tur, g.satirlar, k, g.eksiOnay === true, denetim)));
  denetimiYaz(denetim, denetimEki);
  return { belge: await malKabulOzetiCevir(db, (await sorgular.malKabulBul(db, yeni))!), hareketIdler };
}
export async function acikSiparisSatirlari(db: Db): Promise<AcikSiparisSatirlariCevabi> {
  const l = await siparisSatirlari(db);
  const kartlar = await malzemeOzetleri(db, [...new Set(l.flatMap((x) => (x.malzemeNo === null ? [] : [x.malzemeNo])))]);
  return { satirlar: l.map((x) => ({
    id: x.id, siparisNo: x.siparisNo, talepNo: x.talepNo, tedarikciAdi: x.tedarikciAdi, malzemeId: x.malzemeNo,
    malzemeTur: (x.malzemeNo === null ? null : (kartlar.get(x.malzemeNo)?.tur as MalzemeTuru | undefined)) ?? null, kalemAdi: x.kalemAdi,
    miktar: x.miktar, kalanMiktar: x.kalanMiktar, birim: x.birim, beklenenTeslim: x.beklenenTeslim,
  })) };
}
export async function malKabulListesi(db: Db, s: MalKabullerListesi): Promise<SayfaliListe<MalKabulOzeti>> {
  const suzgec = { tur: s.tur, logoDurumu: s.logoDurumu, baslangic: s.baslangic, bitis: s.bitis, metin: s.metin };
  const l = await sayfaliListe(s, { say: () => sorgular.malKabulSay(db, suzgec), satirlar: (d) => sorgular.malKabuller(db, suzgec, s, d) });
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.map((b) => b.kisiId))]);
  return { ...l, satirlar: l.satirlar.map(({ kisiId, ...b }) => ({ ...b, kisiAd: kisiler.get(kisiId) ?? null })) };
}
export async function malKabulAyrintisi(db: Db, id: number): Promise<MalKabulAyrintiCevabi> {
  const b = await sorgular.malKabulBul(db, id);
  if (!b) throw bulunamadi('Mal kabul belgesi bulunamadı.');
  const s = await sorgular.malKabulSatirlari(db, id);
  const ad = await adlar(db, [...s.map((x) => x.malzemeId), ...s.flatMap((x) => (x.fasonMalzemeId === null ? [] : [x.fasonMalzemeId]))]);
  const fasonSiparisleri = s.flatMap((x) => (x.fasonCikisHareketId === null || x.siparisSatirId === null ? [] : [x.siparisSatirId]));
  const hizmetKarti = new Map((fasonSiparisleri.length === 0 ? [] : await siparisSatirlari(db, fasonSiparisleri)).map((x) => [x.id, x.malzemeNo]));
  const belgeler = await partiBelgeleri(db, s.flatMap((x) => (x.partiId === null ? [] : [x.partiId])));
  const nolar = await emirNoHaritasi(db, s.map((x) => x.partiEmirId));
  return {
    belge: await malKabulOzetiCevir(db, b),
    satirlar: s.map((x) => ({
      sira: x.sira, malzemeId: x.malzemeId, malzemeAd: ad.get(x.malzemeId) ?? null, sayilanMiktar: x.sayilanMiktar, konumKod: x.konumKod, hareketId: x.hareketId, siparisSatirId: x.siparisSatirId,
      fason: x.fasonCikisHareketId === null || x.fasonMalzemeId === null ? null
        : { malzemeId: x.fasonMalzemeId, malzemeAd: ad.get(x.fasonMalzemeId) ?? null, miktar: x.fasonMiktar!, konumId: x.fasonKonumId!, konumKod: x.fasonKonumKod!, hareketId: x.fasonCikisHareketId,
          hizmetMalzemeId: x.siparisSatirId === null ? null : hizmetKarti.get(x.siparisSatirId) ?? null },
      partiId: x.partiId,
      partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.partiEmirId }, emirNoDe(nolar, x.partiEmirId)),
      partiBelgeleri: x.partiId === null ? [] : belgeler.get(x.partiId) ?? [],
      logoDurumu: x.logoDurumu, logoIrsaliyeSatirNo: x.logoIrsaliyeSatirNo, logoIrsaliyeMiktari: x.logoIrsaliyeMiktari, gkk: x.gkk,
    })),
  };
}

// ---- Giriş kontrolü (1246; 1251 a, 1252, 1253 a) -------------------------------------------------------------------------------------
// Kalite Merkezi'nin listesi için GKK satırları: kimlik verilmezse karantinada karar bekleyeni olanlar. Yetkiyi çağıran korur.
export interface GirisKontroluSatiri {
  malKabulSatirId: number; malKabulNo: string; zaman: string; malzemeId: number; partiId: number; partiEtiketi: string | null; sertifikaVar: boolean;
  siparisSatirId: number | null; miktar: string; bekleyen: string;
}
export async function girisKontroluSatirlari(db: Db, idler: readonly number[] | null): Promise<GirisKontroluSatiri[]> {
  if (idler !== null && idler.length === 0) return [];
  const l = await sorgular.girisKontroluSatirlari(db, idler === null ? null : [...new Set(idler)]);
  const belgeler = await partiBelgeleri(db, l.map((x) => x.partiId));
  return l.map((x) => ({
    malKabulSatirId: x.id, malKabulNo: x.malKabulNo, zaman: x.zaman, malzemeId: x.malzemeId, partiId: x.partiId,
    partiEtiketi: partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: null }, null),
    sertifikaVar: (belgeler.get(x.partiId) ?? []).length > 0, siparisSatirId: x.siparisSatirId,
    miktar: bindenMetin(binde(x.miktar)), bekleyen: bindenMetin(binde(x.bekleyen)),
  }));
}
// Kabul edilen giriş kontrolü lotunun gideceği konum: mal kabul alanı.
export const malKabulKonumu = (db: Db): Promise<number> => varsayilanKonum(db, 'KABUL');

// 1252: giriş kontrolünün stok yansıması. Karantinadaki `kaynak` kalitesinden `miktar` kadarı: serbest ya da şartlıysa mal kabul alanına
// taşınır ve kalitesi çevrilir; redse karantinada red olur; iadeyse (yalnız red kaynaktan, 1253 a) tedarikçiye iade çıkışıdır. Miktar
// karantinadaki kullanılabilir bakiyeyi aşarsa hiçbir şey yazılmaz. Yazılan hareketler döner. Yetkiyi çağıran korur.
export type GirisKontroluSonucu = 'serbest' | 'sartli' | 'red' | 'iade';
export async function girisKontroluUygula(db: Db, kisiId: number, g: {
  malKabulSatirId: number; partiId: number; kaynak: 'karar_bekliyor' | 'red'; miktar: string; sonuc: GirisKontroluSonucu; aciklama: string;
}): Promise<number[]> {
  if (g.sonuc === 'iade') {
    if (g.kaynak !== 'red') throw gecersiz('Tedarikçiye iade yalnız red kararından sonra yazılır.');
    return tedarikciyeIade(db, kisiId, { partiId: g.partiId, miktar: g.miktar, aciklama: g.aciklama });
  }
  if (g.sonuc === 'red') {
    let kalan = binde(g.miktar);
    if (kalan <= 0n) throw gecersiz('Hatalı miktar sıfırdan büyük olmalı.');
    const idler: number[] = [];
    for (const x of (await sorgular.partininKarantinaBakiyeleri(db, g.partiId)).filter((b) => b.kaliteDurumu === g.kaynak)) {
      if (kalan <= 0n) break;
      const b = await sorgular.bakiyeKilitle(db, x.malzemeId, x.konumId, g.partiId, x.statuId, g.kaynak);
      const eldeki = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, x.malzemeId, x.konumId, g.partiId, x.statuId, g.kaynak));
      const miktar = kalan < eldeki ? kalan : eldeki;
      if (miktar <= 0n) continue;
      kalan -= miktar;
      idler.push(await kaliteDegistir(db, kisiId, { ...x, partiId: g.partiId, kaynak: g.kaynak, hedef: 'red', miktar, uretimEmriId: null, aciklama: g.aciklama }));
    }
    if (kalan > 0n) throw gecersiz('Hatalı miktar karantinadaki bakiyeyi aşıyor.');
    return idler;
  }
  const tasinan = await karantinadanBirak(db, kisiId, { partiId: g.partiId, hedefKonumId: await malKabulKonumu(db), aciklama: g.aciklama, miktar: g.miktar, kaliteDurumu: g.kaynak });
  const satirlar = new Map<string, { konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: bigint }>();
  for (const t of tasinan) {
    const k = `${t.hedefKonumId}:${t.statuId ?? ''}`;
    satirlar.set(k, { konumId: t.hedefKonumId, statuId: t.statuId, kaliteDurumu: t.kaliteDurumu, miktar: (satirlar.get(k)?.miktar ?? 0n) + binde(t.miktar) });
  }
  const cevrilen = await partiKaliteDurumuYap(db, kisiId, {
    partiId: g.partiId, hedef: g.sonuc, aciklama: g.aciklama, satirlar: [...satirlar.values()].map((x) => ({ ...x, miktar: bindenMetin(x.miktar) })),
  });
  // Serbest kalan lot mal kabuldeki gibi bekleyen emirlere ayrılır; siparişin talebinde seçilen emir öne geçer. Şartlı kabul ayrılmaz.
  if (g.sonuc === 'serbest') {
    const [s] = await sorgular.girisKontroluSatirlari(db, [g.malKabulSatirId]);
    if (s !== undefined) {
      const emir = s.siparisSatirId === null ? undefined : (await siparisSatirlarininEmri(db, [s.siparisSatirId])).get(s.siparisSatirId);
      await bekleyenlereDagit(db, kisiId, [s.malzemeId], emir === undefined ? new Map() : new Map([[s.malzemeId, new Set([emir])]]));
    }
  }
  return [...tasinan.map((t) => t.hareketId), ...cevrilen.map((c) => c.hareketId)];
}

// 1253 a: kalitenin red kararı partinin karantinadaki red bakiyesini tedarikçiye iade çıkışıyla düşürür; yoldaki teslime ayrılan
// dokunulmaz. Miktar kullanılabilir red bakiyesini aşarsa hiçbir şey yazılmaz. Yetkiyi çağıran korur.
export async function tedarikciyeIade(db: Db, kisiId: number, g: { partiId: number; miktar: string; aciklama: string }): Promise<number[]> {
  let kalan = binde(g.miktar);
  if (kalan <= 0n) throw gecersiz('İade miktarı sıfırdan büyük olmalı.');
  const satirlar = (await sorgular.partininKarantinaBakiyeleri(db, g.partiId)).filter((x) => x.kaliteDurumu === 'red');
  await siraliKilitle(db, ...satirlar.map((x) => ({ ...x, partiId: g.partiId })));
  const plan: { s: (typeof satirlar)[number]; miktar: bigint }[] = [];
  for (const x of satirlar) {
    if (kalan <= 0n) break;
    const b = await sorgular.bakiyeKilitle(db, x.malzemeId, x.konumId, g.partiId, x.statuId, 'red');
    const eldeki = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, x.malzemeId, x.konumId, g.partiId, x.statuId, 'red'));
    const miktar = kalan < eldeki ? kalan : eldeki;
    if (miktar <= 0n) continue;
    kalan -= miktar;
    plan.push({ s: x, miktar });
  }
  if (kalan > 0n) throw gecersiz('İade miktarı karantinadaki red bakiyesini aşıyor.');
  const idler: number[] = [];
  for (const { s: x, miktar } of plan) {
    idler.push(await sorgular.hareketYaz(db, hareket({
      tur: 'cikis', malzemeId: x.malzemeId, miktar: bindenMetin(miktar), kisiId, partiId: g.partiId, partiSecimi: 'kisi', kaynakKonumId: x.konumId,
      kaynakStatuId: x.statuId, kaynakKaliteDurumu: 'red', cikisNedeni: 'tedarikci_iade', aciklama: g.aciklama,
    })));
    await bakiyeDegistir(db, { malzemeId: x.malzemeId, konumId: x.konumId, partiId: g.partiId, statuId: x.statuId, kaliteDurumu: 'red', fark: -miktar });
  }
  return idler;
}

// ---- Üretim girişi (DEP-47, DEP-48, DEP-52): kaynak hazır olana kadar elle --------------------------------------------------------
export async function uretimGirisi(db: Db, kisiId: number, g: UretimGirisiKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId);
  const o = await malzemeOzeti(db, malzemeId);
  if (!o) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (o.tur !== 'mamul' && o.tur !== 'yarimamul') throw dogrulama('Üretim girişi yalnız yarı mamul ve mamul için yapılır.', 'malzemeId');
  if (!(await malzemeKullanilabilirMi(db, malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil.`);
  const konumId = g.konumId === undefined ? await varsayilanKonum(db, 'URETIM') : Number(g.konumId);
  await aktifKonum(db, konumId, 'konumId');
  const emir = Number(g.uretimEmriId);
  await emirVarDenetle(db, emir);
  const miktar = bindenMetin(binde(g.miktar));
  // 21.4: emrin kendi ürünü sayım ve tamamlamayla da girer; elle giriş adedi aşmaz. Tamamlamayla aynı kilit: eşzamanlı iki giriş
  // sınırı birlikte aşamaz. Emrin ürünü olmayan yarı mamulün emirdeki miktarı adetten çıkmaz, sınırsız kalır.
  const e = await uretimEmriOzeti(db, emir);
  if (e !== null && e.malzemeNo === malzemeId) await sorgular.emirTamamlamaKilidi(db, emir);
  const durumEngeli = e === null ? null : uretimGirisiDurumEngeli(e.durum, (await kapanisSonuclari(db, [emir])).get(emir) != null);
  if (durumEngeli) throw cakisma(durumEngeli);
  if (e !== null && e.malzemeNo === malzemeId) {
    const asim = uretimGirisiEngeli(e.saglamAdet ?? e.adet, await sorgular.emirUretimGirisi(db, emir, malzemeId), miktar);
    if (asim) throw dogrulama(asim, 'miktar');
  }
  return korumali(async () => {
    const parti = await partiBulVeyaAc(db, { malzemeId, tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, uretimEmriId: emir, kisiId });
    const id = await sorgular.hareketYaz(db, hareket({ tur: 'giris', malzemeId, miktar, kisiId, partiId: parti, partiSecimi: 'giris', hedefKonumId: konumId, girisKaynagi: 'uretim', uretimEmriId: emir }));
    await bakiyeDegistir(db, { malzemeId, konumId, partiId: parti, fark: binde(miktar) });
    return { hareketIdler: [id], onayliEksi: false };
  });
}

// ---- Emir tamamlama (EK "Stok ve tamamlama"): bitmiş emrin kalan sarfı ve çıktısı tek işlemde ------------------------------------
interface TamamlamaPlani {
  cevap: EmirTamamlamaCevabi;
  sarflar: { malzemeId: number; konumId: number; partiId: number | null; miktar: string }[];
}
// Yalnız okuma hesabında (sayaç) verilir; yazan komut her zaman taze okur.
interface TamamlamaOnbellegi {
  bakiye: Map<number, BakiyeHam[]>;
  ozet: Map<number, KatalogMalzemeOzeti>;
}
async function onbellekliOzetler(db: Db, idler: number[], onbellek?: TamamlamaOnbellegi): Promise<Map<number, KatalogMalzemeOzeti>> {
  if (!onbellek) return malzemeOzetleri(db, idler);
  const eksik = [...new Set(idler)].filter((id) => !onbellek.ozet.has(id));
  if (eksik.length > 0) for (const [id, o] of await malzemeOzetleri(db, eksik)) onbellek.ozet.set(id, o);
  return new Map(idler.flatMap((id) => { const o = onbellek.ozet.get(id); return o === undefined ? [] : [[id, o] as const]; }));
}
async function onbellekliBakiyeler(db: Db, malzemeId: number, onbellek?: TamamlamaOnbellegi): Promise<BakiyeHam[]> {
  if (!onbellek) return sorgular.serbestBakiyeler(db, malzemeId);
  let b = onbellek.bakiye.get(malzemeId);
  if (b === undefined) { b = await sorgular.serbestBakiyeler(db, malzemeId); onbellek.bakiye.set(malzemeId, b); }
  return b;
}
// Açık emrin plana göre kalan ihtiyacı ve en eski girişten karşılanan: yalnız iş kutusu sayacı (eksik malzemeli emir) için bir öngörüdür,
// tüketim yazmaz. Tamamlama fiili tüketimle kapanır (K-1 a, aşağıda).
async function kalanIhtiyacPlani(
  db: Db, ihtiyac: Map<number, bigint>, verilen: Map<number, bigint>, ozet: Map<number, KatalogMalzemeOzeti>, onbellek?: TamamlamaOnbellegi,
): Promise<Pick<TamamlamaPlani, 'sarflar'> & { bilesenler: EmirTamamlamaCevabi['bilesenler'] }> {
  const sarflar: TamamlamaPlani['sarflar'] = [];
  const bilesenler: EmirTamamlamaCevabi['bilesenler'] = [];
  for (const [malzemeId, brut] of ihtiyac) {
    const o = ozet.get(malzemeId);
    const hizmet = o !== undefined && !stoklanirMi(o.tur);
    const v = verilen.get(malzemeId) ?? 0n;
    const kalan = hizmet ? 0n : kalanSarf(brut, v);
    let mevcut = 0n;
    let alinan = 0n;
    if (kalan > 0n) {
      const b = await onbellekliBakiyeler(db, malzemeId, onbellek);
      const o2 = cikisOnerisi(b.map((x) => ({ bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, partiEtiketi: null, miktar: x.miktar, ilkGiris: x.ilkGiris })), bindenMetin(kalan));
      mevcut = binde(o2.mevcut);
      for (const a of o2.oneriler) {
        sarflar.push({ malzemeId, konumId: a.konumId, partiId: a.partiId, miktar: a.miktar });
        alinan += binde(a.miktar);
      }
    }
    bilesenler.push({
      malzemeId, malzemeAd: o?.ad ?? o?.kod ?? null, hizmet, brut: bindenMetin(brut), verilen: bindenMetin(v), kalan: bindenMetin(kalan),
      mevcut: bindenMetin(mevcut), eksik: bindenMetin(kalan - alinan),
    });
  }
  return { sarflar, bilesenler };
}
// K-1 a (1385): emrin hammadde tüketimi fiilidir: terminalde düşülen ve hurdanın fire çıkışı (emre verilmiş net sarf). Plandaki fire
// payı tüketim sayılmaz; tamamlama sarf yazmaz, yalnız çıktıyı girer. Brüt plan bilgisi olarak gösterilir, kalan her zaman sıfırdır.
// Böylece tamamlamanın istasyondaki malzemeyi görmeden depodan ikinci kez düşmesi (S-2) de ortadan kalkar.
const SIFIR = bindenMetin(0n);
function bilesenPlani(
  ihtiyac: ReadonlyMap<number, bigint>, verilen: ReadonlyMap<number, bigint>, ozet: ReadonlyMap<number, KatalogMalzemeOzeti>,
): Pick<TamamlamaPlani, 'sarflar'> & { bilesenler: EmirTamamlamaCevabi['bilesenler'] } {
  const bilesenler: EmirTamamlamaCevabi['bilesenler'] = [];
  for (const [malzemeId, brut] of ihtiyac) {
    const o = ozet.get(malzemeId);
    const hizmet = o !== undefined && !stoklanirMi(o.tur);
    bilesenler.push({
      malzemeId, malzemeAd: o?.ad ?? o?.kod ?? null, hizmet, brut: bindenMetin(brut), verilen: bindenMetin(verilen.get(malzemeId) ?? 0n), kalan: SIFIR,
      mevcut: SIFIR, eksik: SIFIR,
    });
  }
  return { sarflar: [], bilesenler };
}
async function tamamlamaPlani(db: Db, emirId: number, ciktiMiktari?: string, onbellek?: TamamlamaOnbellegi): Promise<TamamlamaPlani> {
  const emir = await uretimEmriOzeti(db, emirId);
  if (emir === null) throw bulunamadi('Üretim emri bulunamadı.');
  if (emir.malzemeNo === null) throw gecersiz('Bu emrin ürün kartı yok (eski emir); stokta tamamlanmaz.');
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, emirId)) ?? []).map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut })));
  const verilen = new Map<number, bigint>();
  for (const p of await sorgular.emrinPartileri(db, emirId)) verilen.set(p.malzemeId, (verilen.get(p.malzemeId) ?? 0n) + binde(p.miktar));
  const ozet = await onbellekliOzetler(db, [emir.malzemeNo, ...ihtiyac.keys()], onbellek);
  const { sarflar, bilesenler } = bilesenPlani(ihtiyac, verilen, ozet);
  const girilen = binde(await sorgular.emirUretimGirisi(db, emirId, emir.malzemeNo));
  // Çıktı emrin sağlam adedine göre girer (fire düşülmüş, bitmiş emirde dolu); bitmemiş emirde adet gösterilir, engel zaten vardır.
  const hedef = BigInt(emir.saglamAdet ?? emir.adet) * 1000n;
  const kalanCikti = hedef > girilen ? hedef - girilen : 0n;
  // Sağlam adedi girmiş ve sarfı kalmamış emir tamamlanmıştır (hepsi fire olmuş emirde sağlam 0'dır).
  const tamam = girilen >= hedef && sarflar.length === 0;
  const girecek = tamam ? 0n : ciktiMiktari === undefined ? kalanCikti : binde(ciktiMiktari);
  if (girecek > kalanCikti) throw dogrulama(`Sağlam adet emrin girilmemiş adedini (${bindenMetin(kalanCikti)}) aşamaz.`, 'miktar');
  const engel = tamamlamaEngeli({
    durum: emir.durum, eksikVar: bilesenler.some((b) => binde(b.eksik) > 0n), yapilacakVar: girecek > 0n || sarflar.length > 0,
  });
  const urun = ozet.get(emir.malzemeNo);
  return {
    sarflar,
    cevap: {
      emir: { id: emir.id, emirNo: emir.emirNo, durum: emir.durum, adet: emir.adet, malzemeId: emir.malzemeNo, malzemeAd: urun?.ad ?? urun?.kod ?? null },
      cikti: { girilen: bindenMetin(girilen), kalan: bindenMetin(girecek) }, bilesenler, engel,
    },
  };
}
export async function emirTamamlamaOku(db: Db, emirId: number): Promise<EmirTamamlamaCevabi> {
  return (await tamamlamaPlani(db, emirId)).cevap;
}
// Uç giriş işlemiyle açılır; çıkış işlemi de istenir (yetki K-1 a öncesiyle aynı kalır, genişletilmez). K-1 a: tamamlama sarf yazmaz,
// yalnız sağlam adedin girilmemiş kısmını girer. Hesap emir kilidi alındıktan sonra yeniden yapılır.
export async function emirTamamla(db: Db, k: Kullanici, emirId: number, g: EmirTamamlaKomutu): Promise<HareketCevabi> {
  if (!islemVarMi(k, 'stok.cikis')) throw yetkiYok('Stokta tamamlama için stok çıkış yetkisi de gerekir.');
  await sorgular.emirTamamlamaKilidi(db, emirId);
  const plan = await tamamlamaPlani(db, emirId, g.miktar);
  if (plan.cevap.engel !== null) throw cakisma(plan.cevap.engel, { bilesenler: plan.cevap.bilesenler });
  // DEP-36 kapsamı sarf yazılmasa da korunur: kapsam dışındaki emri tamamlayamaz.
  await sarfEmriDenetle(db, k.id, emirId);
  const hareketIdler: number[] = [];
  if (binde(plan.cevap.cikti.kalan) > 0n) {
    const giris = await uretimGirisi(db, k.id, { uretimEmriId: emirId, malzemeId: plan.cevap.emir.malzemeId, miktar: plan.cevap.cikti.kalan });
    hareketIdler.push(...giris.hareketIdler);
  }
  return { hareketIdler, onayliEksi: false };
}

// Emre yabancı anahtar Aşama 2'de gelir (STK6 b: emir modeli değişiyor); o zamana kadar emrin varlığını sahibi söyler.
async function emirVarDenetle(db: Db, id: number | null): Promise<void> {
  if (id !== null && (await emirOzeti(db, id)) === null) throw bagimliKayit('Üretim emri bulunamadı.');
}
// DEP-36: üretime sarfı yalnız emrin iş merkezi kişinin kapsamındaysa yazar.
async function sarfEmriDenetle(db: Db, kisiId: number, id: number | null): Promise<void> {
  if (id === null) return;
  const emir = await emirOzeti(db, id);
  if (emir === null) throw bagimliKayit('Üretim emri bulunamadı.');
  const istasyon = await istasyonGetir(db, emir.istasyonId);
  kapsamDisiysaReddet(await kisininKapsami(db, kisiId, kisininIzinliIsMerkezleri), istasyon?.isMerkeziId ?? null);
}

// ---- Düşüm: çıkış ve taşıma (DEP-02…DEP-06, DEP-09, DEP-23) ---------------------------------------------------------------------
async function kaynakPartisi(db: Db, malzemeId: number, konumId: number, istenen: number | null | undefined, alan = 'partiId', kalite: KaliteDurumu = 'serbest') {
  const s = partiSec(await sorgular.gozdekiPartiler(db, malzemeId, konumId, kalite), istenen);
  if (s.tur === 'secim-gerekli') throw dogrulama('Bu gözde birden çok parti var; partiyi seçin.', alan, { partiler: s.partiler });
  return s;
}
// Denetim #35: yoldaki teslime ayrılan miktar elle çıkış ve taşımayla düşülmez (eksi onayı da bunu açmaz); teslim alınınca kaynaktan düşer.
async function yoldakiniYemesin(db: Db, bakiye: string, a: { malzemeId: number; konumId: number; partiId: number | null; kalite: KaliteDurumu }, miktar: string): Promise<void> {
  const yolda = await sorgular.yoldaAyrilan(db, a.malzemeId, a.konumId, a.partiId, null, a.kalite);
  if (binde(yolda) <= 0n) return;
  const engel = serbestMiktarEngeli(bakiye, yolda, miktar, 'yoldaki teslime ayrılmış');
  if (engel) throw dogrulama(engel, 'miktar');
}
// Soru 98 a: mamul ve yarı mamulün sevki sevkiyat işinden düşer; elle sevk çıkışı ikinci kez düşürürdü.
async function sevkCikisiniDenetle(db: Db, malzemeIdler: readonly number[], cikisNedeni: string): Promise<void> {
  if (cikisNedeni !== 'sevk') return;
  for (const [id, o] of await malzemeOzetleri(db, [...malzemeIdler])) {
    const engel = sevkCikisEngeli(o.tur, cikisNedeni);
    if (engel) throw gecersiz(`${o.ad ?? o.kod ?? `#${id}`}: ${engel}`);
  }
}
// 16.1: eksik varken gözdeki red ya da karar bekleyen parça eksi onayıyla da serbest yazılmaz.
async function eksiKaliteDenetle(db: Db, a: { malzemeId: number; konumId: number; partiId: number | null }, mevcut: string, miktar: string): Promise<void> {
  if (binde(mevcut) >= binde(miktar)) return;
  const engel = eksiKaliteEngeli(await sorgular.gozdekiKullanilamazKalite(db, a.malzemeId, a.konumId, a.partiId));
  if (engel) throw gecersiz(engel);
}
function dusumDenetle(mevcut: string, miktar: string, eksiOnay: boolean): boolean {
  const k = dusumKarari(mevcut, miktar, eksiOnay);
  if (k.tur === 'onay-gerekli') throw onayGerekli(`Yetersiz stok. Mevcut: ${k.mevcut}. Yine de yazmak için onaylayın; bakiye eksiye düşer.`, { mevcut: k.mevcut });
  return k.onayliEksi;
}
export async function cikisYap(db: Db, kisiId: number, g: CikisKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId);
  const konumId = Number(g.konumId);
  // Kalite engeli tür engelinden önce: karar bekleyen parça her türde aynı nedenle durur.
  const kalite = g.kaliteDurumu ?? 'serbest';
  const karar = cikisKaliteKarari(kalite, g.cikisNedeni);
  if (karar !== null && 'engel' in karar) throw gecersiz(karar.engel);
  await sevkCikisiniDenetle(db, [malzemeId], g.cikisNedeni);
  const konum = await aktifKonum(db, konumId, 'konumId');
  const karantina = karantinaEngeli(konum.tur, { cikisNedeni: g.cikisNedeni });
  if (karantina) throw gecersiz(karantina);
  await sarfEmriDenetle(db, kisiId, g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId));
  const p = await kaynakPartisi(db, malzemeId, konumId, g.partiId === undefined ? undefined : g.partiId === null ? null : Number(g.partiId), 'partiId', kalite);
  const miktar = bindenMetin(binde(g.miktar));
  return korumali(async () => {
    const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, p.partiId, null, kalite);
    await yoldakiniYemesin(db, b?.miktar ?? '0', { malzemeId, konumId, partiId: p.partiId, kalite }, miktar);
    if (kalite === 'serbest') await eksiKaliteDenetle(db, { malzemeId, konumId, partiId: p.partiId }, b?.miktar ?? '0', miktar);
    const onayliEksi = dusumDenetle(b?.miktar ?? '0', miktar, g.eksiOnay === true);
    const emir = g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId);
    // Karar bekleyen ve red parça rezerveye girmez (135): ayrılanı ne yer ne düşürür.
    if (kalite === 'serbest') await rezerveyiAsmasin(db, malzemeId, null, emir, binde(miktar));
    const not = karar?.not ?? null;
    const id = await sorgular.hareketYaz(db, hareket({
      tur: 'cikis', malzemeId, miktar, kisiId, partiId: p.partiId, partiSecimi: p.secim, kaynakKonumId: konumId, onayliEksi, kaynakKaliteDurumu: kalite,
      cikisNedeni: g.cikisNedeni, uretimEmriId: emir, aciklama: not === null ? g.aciklama ?? null : [not, g.aciklama].filter(Boolean).join(' · ').slice(0, 200),
    }));
    await bakiyeDegistir(db, { malzemeId, konumId, partiId: p.partiId, kaliteDurumu: kalite, fark: -binde(miktar) });
    if (kalite === 'serbest') await rezerveDegistir(db, { malzemeId, statuId: null, uretimEmriId: emir, fark: -binde(miktar) });
    return { hareketIdler: [id], onayliEksi, ...(karar === null ? {} : { uyari: karar.uyari }) };
  });
}
// CNC takım stoğu (153 a, 164 b): kurulumda değişen takım ya da kullanılan uç seti kartın serbest bakiyesinden, ilk giren önce
// (çıkış önerisiyle) düşer. Yetmezse hiç düşülmez, eksiye inilmez; mevcut miktar döner. Yetkiyi çağıran korur.
export type CncTakimCikisiSonucu = { yeterli: true; hareketIdler: number[] } | { yeterli: false; mevcut: string };
export async function cncTakimCikisi(db: Db, kisiId: number, g: { malzemeId: number; miktar: string; aciklama: string }): Promise<CncTakimCikisiSonucu> {
  const oneri = await cikisOnerisiOku(db, g.malzemeId, g.miktar);
  if (!oneri.yeterli) return { yeterli: false, mevcut: oneri.mevcut };
  const hareketIdler: number[] = [];
  for (const o of oneri.oneriler) {
    const c = await cikisYap(db, kisiId, { malzemeId: g.malzemeId, konumId: o.konumId, partiId: o.partiId, miktar: o.miktar, cikisNedeni: 'diger', aciklama: g.aciklama.slice(0, 200) });
    hareketIdler.push(...c.hareketIdler);
  }
  return { yeterli: true, hareketIdler };
}
export async function tasimaYap(db: Db, kisiId: number, g: TasimaKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId);
  const kaynak = Number(g.kaynakKonumId);
  const hedef = Number(g.hedefKonumId);
  if (kaynak === hedef) throw dogrulama('Kaynak ve hedef konum aynı.', 'hedefKonumId');
  const kaynakKonum = await aktifKonum(db, kaynak, 'kaynakKonumId');
  const hedefKonum = await aktifKonum(db, hedef, 'hedefKonumId');
  const karantina = karantinaEngeli(kaynakKonum.tur, { hedefTuru: hedefKonum.tur });
  if (karantina) throw gecersiz(karantina);
  const p = await kaynakPartisi(db, malzemeId, kaynak, g.partiId === undefined ? undefined : g.partiId === null ? null : Number(g.partiId));
  const miktar = bindenMetin(binde(g.miktar));
  return korumali(async () => {
    await siraliKilitle(db, { malzemeId, konumId: kaynak, partiId: p.partiId }, { malzemeId, konumId: hedef, partiId: p.partiId });
    const b = await sorgular.bakiyeKilitle(db, malzemeId, kaynak, p.partiId);
    await yoldakiniYemesin(db, b?.miktar ?? '0', { malzemeId, konumId: kaynak, partiId: p.partiId, kalite: 'serbest' }, miktar);
    await eksiKaliteDenetle(db, { malzemeId, konumId: kaynak, partiId: p.partiId }, b?.miktar ?? '0', miktar);
    const onayliEksi = dusumDenetle(b?.miktar ?? '0', miktar, g.eksiOnay === true);
    const id = await sorgular.hareketYaz(db, hareket({ tur: 'transfer', malzemeId, miktar, kisiId, partiId: p.partiId, partiSecimi: p.secim, kaynakKonumId: kaynak, hedefKonumId: hedef, onayliEksi, aciklama: g.aciklama ?? null }));
    await bakiyeDegistir(db, { malzemeId, konumId: kaynak, partiId: p.partiId, fark: -binde(miktar) });
    const ambalaj = b?.ambalajTur ? { tur: b.ambalajTur, olcu: b.ambalajOlcu ?? '', uzunluk: null, genislik: null, yukseklik: null, adet: null } : null;
    await bakiyeDegistir(db, { malzemeId, konumId: hedef, partiId: p.partiId, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null, ambalaj: ambalaj?.olcu === 'ozel' ? null : ambalaj });
    return { hareketIdler: [id], onayliEksi };
  });
}

// ---- Statü değişimi (#1108, STK-S1) ------------------------------------------------------------------------------------------
// Aynı konumda transfer hareketi; yeni statü satırı değişim anıyla açılır (bekleme süresi statüye girişten, STK-S4). Statü kimliği
// Reçete ve Rota'nın tanımıdır; yoksa yabancı anahtar reddeder.
export async function statuDegistir(db: Db, kisiId: number, g: StatuDegistirKomutu): Promise<HareketCevabi> {
  const malzemeId = Number(g.malzemeId), konumId = Number(g.konumId), partiId = g.partiId === null ? null : Number(g.partiId);
  const kaynakStatuId = g.kaynakStatuId === null ? null : Number(g.kaynakStatuId), hedefStatuId = g.hedefStatuId === null ? null : Number(g.hedefStatuId);
  await aktifKonum(db, konumId, 'konumId');
  const miktar = bindenMetin(binde(g.miktar));
  return korumali(async () => {
    await siraliKilitle(db, { malzemeId, konumId, partiId, statuId: kaynakStatuId }, { malzemeId, konumId, partiId, statuId: hedefStatuId });
    const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, partiId, kaynakStatuId);
    const engel = statuDegisimiEngeli(kaynakStatuId, hedefStatuId, b?.miktar ?? '0', miktar);
    if (engel) throw dogrulama(engel, kaynakStatuId === hedefStatuId ? 'hedefStatuId' : 'miktar');
    await rezerveyiAsmasin(db, malzemeId, kaynakStatuId, null, binde(miktar));
    const id = await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId, miktar, kisiId, partiId, partiSecimi: partiId === null ? null : 'kisi', kaynakKonumId: konumId, hedefKonumId: konumId,
      kaynakStatuId, hedefStatuId, aciklama: g.aciklama ?? null,
    }));
    await bakiyeDegistir(db, { malzemeId, konumId, partiId, statuId: kaynakStatuId, fark: -binde(miktar) });
    await bakiyeDegistir(db, { malzemeId, konumId, partiId, statuId: hedefStatuId, fark: binde(miktar), ilkGiris: new Date().toISOString() });
    return { hareketIdler: [id], onayliEksi: false };
  });
}

// ---- Kalite durumu (134 a) ---------------------------------------------------------------------------------------------------
// Aynı konumda transfer hareketi (statüdeki gibi); parça yerinde kalır, statüsü ve ilk girişi değişmez. Kararın sahibi kalite ve
// Arkon'dur; stok yalnız hareketi yazar. Yolda teslime ayrılan miktar değişmez.
export interface KaliteDegisimi {
  malzemeId: number; konumId: number; partiId: number | null; statuId: number | null; kaynak: KaliteDurumu; hedef: KaliteDurumu; miktar: bigint;
  uretimEmriId: number | null; aciklama: string;
}
export async function kaliteDegistir(db: Db, kisiId: number, d: KaliteDegisimi): Promise<number> {
  const anahtar = { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId };
  const miktar = bindenMetin(d.miktar);
  await siraliKilitle(db, { ...anahtar, kaliteDurumu: d.kaynak }, { ...anahtar, kaliteDurumu: d.hedef });
  const b = await sorgular.bakiyeKilitle(db, d.malzemeId, d.konumId, d.partiId, d.statuId, d.kaynak);
  const yolda = binde(await sorgular.yoldaAyrilan(db, d.malzemeId, d.konumId, d.partiId, d.statuId, d.kaynak));
  const engel = kaliteDegisimiEngeli(d.kaynak, d.hedef, bindenMetin(binde(b?.miktar ?? '0') - yolda), miktar);
  if (engel) throw dogrulama(engel, 'miktar');
  const id = await sorgular.hareketYaz(db, hareket({
    tur: 'transfer', malzemeId: d.malzemeId, miktar, kisiId, partiId: d.partiId, partiSecimi: d.partiId === null ? null : 'kisi', kaynakKonumId: d.konumId, hedefKonumId: d.konumId,
    kaynakStatuId: d.statuId, hedefStatuId: d.statuId, kaynakKaliteDurumu: d.kaynak, hedefKaliteDurumu: d.hedef, uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
  }));
  await bakiyeDegistir(db, { ...anahtar, kaliteDurumu: d.kaynak, fark: -d.miktar });
  await bakiyeDegistir(db, { ...anahtar, kaliteDurumu: d.hedef, fark: d.miktar, ilkGiris: b?.ilkGiris ?? null });
  return id;
}

// Kalite Merkezi'nin parti kararı (229 a): partinin bütün konum ve statülerdeki bakiyesi hedef kaliteye geçer; yoldaki teslime ayrılan
// miktar dokunulmaz kalır. Satır verilirse (320 a, NCR kısmi serbest bırakma) yalnız o bakiyeler o miktarla çevrilir; bulunmayan, sıfır ya da
// kullanılabilir miktarı aşan satırda hiçbir şey yazılmaz. Değişen satır yoksa boş dizi. Yetkiyi çağıran korur.
export async function partiKaliteDurumuYap(db: Db, kisiId: number, g: {
  partiId: number; hedef: KaliteDurumu; aciklama: string; uretimEmriId?: number | null;
  satirlar?: { konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string }[];
}): Promise<{ konumId: number; statuId: number | null; kaynak: KaliteDurumu; miktar: string; hareketId: number }[]> {
  const sonuc: { konumId: number; statuId: number | null; kaynak: KaliteDurumu; miktar: string; hareketId: number }[] = [];
  const bakiyeler = await sorgular.partininBakiyeleri(db, g.partiId, g.hedef);
  const ayni = (a: { konumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu }, b: typeof a) =>
    a.konumId === b.konumId && a.statuId === b.statuId && a.kaliteDurumu === b.kaliteDurumu;
  const istenen = g.satirlar?.map((x) => {
    const miktar = binde(x.miktar);
    if (miktar <= 0n) throw gecersiz('Kalitesi değişecek miktar sıfırdan büyük olmalı.');
    const b = bakiyeler.find((s) => ayni(s, x));
    if (!b) throw gecersiz('Partinin bu konum ve kalitede bakiyesi yok.');
    if (g.satirlar!.filter((y) => ayni(y, x)).length > 1) throw gecersiz('Aynı bakiye için tek satır verilir.');
    return { s: b, miktar };
  });
  const satirlar = istenen?.map((x) => x.s) ?? bakiyeler;
  await siraliKilitle(db, ...satirlar.flatMap((s) => [s, { ...s, kaliteDurumu: g.hedef }].map((x) => ({ ...x, partiId: g.partiId }))));
  const plan: { s: (typeof bakiyeler)[number]; miktar: bigint }[] = [];
  for (const [i, s] of satirlar.entries()) {
    const b = await sorgular.bakiyeKilitle(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu);
    const eldeki = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu));
    const miktar = istenen ? istenen[i]!.miktar : eldeki;
    if (istenen && miktar > eldeki) throw gecersiz('Kalitesi değişecek miktar bakiyenin kullanılabilir miktarını aşıyor.');
    if (miktar > 0n) plan.push({ s, miktar });
  }
  for (const { s, miktar } of plan) {
    const hareketId = await kaliteDegistir(db, kisiId, {
      malzemeId: s.malzemeId, konumId: s.konumId, partiId: g.partiId, statuId: s.statuId, kaynak: s.kaliteDurumu, hedef: g.hedef, miktar,
      uretimEmriId: g.uretimEmriId ?? null, aciklama: g.aciklama,
    });
    sonuc.push({ konumId: s.konumId, statuId: s.statuId, kaynak: s.kaliteDurumu, miktar: bindenMetin(miktar), hareketId });
  }
  return sonuc;
}

// 320 a: NCR partiyi yerinde red yapar (taşımaz); Kalite Merkezi serbest bırakacağı adedi karantinadaki ve yerinde duran red bakiyeden seçer.
// Her istenen parti anahtar olarak döner; red bakiyesi yoksa boş dizi.
export async function partilerinRedBakiyeleri(db: Db, partiIdler: readonly number[]):
  Promise<Map<number, { konumId: number; statuId: number | null; kaliteDurumu: 'red'; kullanilabilir: string; karantinaKonumuMu: boolean }[]>> {
  const sonuc = new Map<number, { konumId: number; statuId: number | null; kaliteDurumu: 'red'; kullanilabilir: string; karantinaKonumuMu: boolean }[]>(
    [...new Set(partiIdler)].map((id) => [id, []]));
  if (sonuc.size === 0) return sonuc;
  for (const r of await sorgular.partilerinRedBakiyeleri(db, [...sonuc.keys()])) {
    sonuc.get(r.partiId)!.push({ konumId: r.konumId, statuId: r.statuId, kaliteDurumu: 'red', kullanilabilir: bindenMetin(binde(r.kullanilabilir)), karantinaKonumuMu: r.karantina });
  }
  return sonuc;
}

// Denetim #15: karantinadan serbest bırakma yalnız Kalite Merkezi kararıyla (stok/disari); depo karantinadaki parçayı yalnız imha eder.
// Partinin karantina konumlarındaki bakiyesi statü ve kalitesi korunarak hedefe geçer (kaliteyi Kalite Merkezi ayrıca yazar); yoldaki
// teslime ayrılan dokunulmaz. Hedef verilmezse her karantina satırı partinin o karantinaya geldiği konuma döner (MRB kapanışında
// kullanıcıya ek adım yok); biri bilinmiyorsa hiçbir şey yazılmadan reddedilir. Bırakılacak bakiye yoksa boş dizi. Yetkiyi çağıran korur.
export async function karantinadanBirak(db: Db, kisiId: number, g: { partiId: number; hedefKonumId?: number | null; aciklama: string; miktar?: string; kaliteDurumu?: KaliteDurumu }):
  Promise<{ konumId: number; hedefKonumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; hareketId: number }[]> {
  const sonuc: { konumId: number; hedefKonumId: number; statuId: number | null; kaliteDurumu: KaliteDurumu; miktar: string; hareketId: number }[] = [];
  const istenen = g.miktar === undefined ? null : binde(g.miktar);
  if (istenen !== null && istenen <= 0n) throw gecersiz('Serbest bırakılacak miktar sıfırdan büyük olmalı.');
  const satirlar: (Awaited<ReturnType<typeof sorgular.partininKarantinaBakiyeleri>>[number] & { hedefKonumId: number })[] = [];
  for (const s of await sorgular.partininKarantinaBakiyeleri(db, g.partiId)) {
    // 320 a: kalite verilirse aynı karantinadaki başka kalitedeki bakiye ne taşınır ne aşım hesabına girer.
    if (g.kaliteDurumu !== undefined && s.kaliteDurumu !== g.kaliteDurumu) continue;
    const hedefKonumId = g.hedefKonumId ?? await sorgular.karantinaOncesiKonumu(db, g.partiId, s.konumId);
    if (hedefKonumId === null) throw gecersiz('Partinin karantinadan önceki konumu bilinmiyor; serbest bırakılacak konumu seçin.');
    satirlar.push({ ...s, hedefKonumId });
  }
  for (const id of new Set(satirlar.map((s) => s.hedefKonumId).concat(g.hedefKonumId ?? []))) {
    const hedef = await aktifKonum(db, id, 'hedefKonumId');
    if (hedef.tur === 'karantina') throw gecersiz('Serbest bırakılan parça karantina dışında bir konuma gider.');
  }
  await siraliKilitle(db, ...satirlar.flatMap((s) => [s, { ...s, konumId: s.hedefKonumId }].map((x) => ({ ...x, partiId: g.partiId }))));
  const kullanilabilir: { s: (typeof satirlar)[number]; b: Awaited<ReturnType<typeof sorgular.bakiyeKilitle>>; miktar: bigint }[] = [];
  for (const s of satirlar) {
    const b = await sorgular.bakiyeKilitle(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu);
    kullanilabilir.push({ s, b, miktar: binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, s.malzemeId, s.konumId, g.partiId, s.statuId, s.kaliteDurumu)) });
  }
  // Miktar verilmezse partinin bütün karantina bakiyesi gider; verilirse bakiyeler sırayla tüketilir, kalan karantinada kalır.
  let kalan = istenen;
  if (kalan !== null && kalan > kullanilabilir.reduce((t, x) => t + (x.miktar > 0n ? x.miktar : 0n), 0n)) {
    throw gecersiz('Serbest bırakılacak miktar karantinadaki kullanılabilir miktarı aşıyor.');
  }
  for (const { s, b, miktar: eldeki } of kullanilabilir) {
    if (kalan !== null && kalan <= 0n) break;
    const miktar = kalan !== null && kalan < eldeki ? kalan : eldeki;
    if (miktar <= 0n) continue;
    if (kalan !== null) kalan -= miktar;
    const anahtar = { malzemeId: s.malzemeId, partiId: g.partiId, statuId: s.statuId, kaliteDurumu: s.kaliteDurumu };
    const hareketId = await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: s.malzemeId, miktar: bindenMetin(miktar), kisiId, partiId: g.partiId, partiSecimi: 'kisi', kaynakKonumId: s.konumId, hedefKonumId: s.hedefKonumId,
      kaynakStatuId: s.statuId, hedefStatuId: s.statuId, kaynakKaliteDurumu: s.kaliteDurumu, hedefKaliteDurumu: s.kaliteDurumu, aciklama: g.aciklama,
    }));
    await bakiyeDegistir(db, { ...anahtar, konumId: s.konumId, fark: -miktar });
    await bakiyeDegistir(db, { ...anahtar, konumId: s.hedefKonumId, fark: miktar, ilkGiris: b?.ilkGiris ?? null });
    sonuc.push({ konumId: s.konumId, hedefKonumId: s.hedefKonumId, statuId: s.statuId, kaliteDurumu: s.kaliteDurumu, miktar: bindenMetin(miktar), hareketId });
  }
  return sonuc;
}

// 335: emir başına sarf ve üretimden giriş fişinin satırları; sarf hurdanın fire çıkışını da içerir, hurda ayrıca verilir. Her istenen emir
// anahtardır (hareketsiz emir boş fiş). Kart ya da stok birimi yoksa null (uydurulmaz). Salt okur.
export interface EmirFisSatiri { malzemeId: number; stokKodu: string | null; birim: string | null; miktar: string }
export async function emirMalzemeFisleri(db: Db, emirIdler: readonly number[]): Promise<Map<number, { sarf: EmirFisSatiri[]; giris: EmirFisSatiri[]; hurda: EmirFisSatiri[] }>> {
  const sonuc = new Map(emirIdler.map((id) => [id, { sarf: [] as EmirFisSatiri[], giris: [] as EmirFisSatiri[], hurda: [] as EmirFisSatiri[] }]));
  if (emirIdler.length === 0) return sonuc;
  const satirlar = await sorgular.emirlerinFisHareketleri(db, emirIdler);
  const kartlar = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeId));
  for (const x of satirlar) {
    const f = sonuc.get(x.emirId);
    const kart = kartlar.get(x.malzemeId);
    if (!f) continue;
    const satir = (miktar: string): EmirFisSatiri => ({ malzemeId: x.malzemeId, stokKodu: kart?.kod ?? null, birim: kart?.birim ?? null, miktar: bindenMetin(binde(miktar)) });
    if (binde(x.miktar) !== 0n) f[x.fis].push(satir(x.miktar));
    if (binde(x.hurda) !== 0n) f.hurda.push(satir(x.hurda));
  }
  return sonuc;
}

// ---- Sayım (DEP-16) ------------------------------------------------------------------------------------------------------------
export async function sayimYap(db: Db, kisiId: number, g: SayimKomutu): Promise<SayimCevabi> {
  const konumId = Number(g.konumId);
  await aktifKonum(db, konumId, 'konumId');
  const hareketIdler: number[] = [];
  await korumali(async () => {
    await siraliKilitle(db, ...g.satirlar.map((s) => ({ malzemeId: Number(s.malzemeId), konumId, partiId: s.partiId === null ? null : Number(s.partiId) })));
    for (const s of g.satirlar) {
      const malzemeId = Number(s.malzemeId);
      const partiId = s.partiId === null ? null : Number(s.partiId);
      const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, partiId);
      const sistem = b?.miktar ?? '0';
      if (binde(sistem) !== binde(s.beklenenMiktar)) throw cakisma('Sayım sırasında bu gözün stoğu değişti; gözü yeniden açıp sayın.', { malzemeId, partiId, guncel: sistem });
      const f = sayimFarki(sistem, s.sayilanMiktar);
      if (f.tur === 'yok') continue;
      const yon = f.tur === 'sayim_fazla' ? { hedefKonumId: konumId } : { kaynakKonumId: konumId };
      hareketIdler.push(await sorgular.hareketYaz(db, hareket({ tur: f.tur, malzemeId, miktar: f.miktar, kisiId, partiId, partiSecimi: partiId === null ? null : 'kisi', ...yon })));
      await bakiyeDegistir(db, { malzemeId, konumId, partiId, fark: f.tur === 'sayim_fazla' ? binde(f.miktar) : -binde(f.miktar) });
    }
    await sorgular.konumSayildi(db, konumId);
  });
  return { hareketIdler, farkSayisi: hareketIdler.length };
}

// ---- Geri alma (DEP-17, DEP-18, DEP-19, DEP-53) --------------------------------------------------------------------------------
// Soru 186 a: ürün sevkinin teslim çıkışı, iş faturalıyken ne elle ne sevkiyatın teslim geri almasıyla çevrilir. Fatura siparişe ve
// işe bağlıdır (Finans); işin siparişi sevkiyattan okunur.
async function faturaliSevkDenetle(db: Db, h: { tur: string; cikisNedeni: string | null; aciklama: string | null }): Promise<void> {
  const isId = sevkTeslimIsi(h);
  if (isId === null) return;
  const siparisId = (await sevkIsiOzeti(db, isId))?.siparisId ?? null;
  if (siparisId === null) return;
  const engel = faturaliSevkEngeli(isId, (await siparisFaturalari(db, [siparisId])).get(siparisId) ?? []);
  if (engel) throw cakisma(engel);
}
// 1387 a: elle eksiye düşüm onayı ayrı işlemdir (stok.eksi-onayla, yalnız müdür). Terminalin ve akışların kendi eksisi bu onayı istemez;
// onlar uçtan değil, çağıranın işleminden yazar.
export function eksiOnayiDenetle(k: Kullanici, g: { eksiOnay?: boolean | undefined }): void {
  if (g.eksiOnay === true && !islemVarMi(k, 'stok.eksi-onayla')) throw yetkiYok('Stoğu eksiye düşürme onayı yetkiniz yok; müdür onaylar.');
}
// elle: Stok Merkezi'nin geri alması; akışın yazdığı hareketi almaz (1388 a). Akışların ve belge düzeltmesinin kendi geri alması elle değildir.
async function tersCevir(db: Db, kisiId: number, hareketId: number, eksiOnay: boolean, aciklama: string | null, malKabulDuzeltmesi = false, elle = false): Promise<number> {
  const h = await sorgular.hareketBul(db, hareketId);
  if (!h) throw bulunamadi('Hareket bulunamadı.');
  const engel = geriAlmaEngeli({
    tur: h.tur, geriAlindi: h.geriAlindi, malKabulSatiriMi: h.malKabulSatiriMi && !malKabulDuzeltmesi, disCagriMi: kaliteKarariHareketiMi(h), elleAkis: elle ? h.akis : null,
  });
  if (engel) throw cakisma(engel);
  await faturaliSevkDenetle(db, h);
  const y = tersYon(h.kaynakKonumId, h.hedefKonumId);
  return korumali(async () => {
    let onayliEksi = false;
    // Statü ve kalite de ters döner: hareketin hedefinden kaynağına (boş kalite serbesttir).
    const ks = h.hedefStatuId, hs = h.kaynakStatuId;
    const kq = h.hedefKaliteDurumu ?? 'serbest', hq = h.kaynakKaliteDurumu ?? 'serbest';
    await siraliKilitle(db, { malzemeId: h.malzemeId, konumId: y.kaynak, partiId: h.partiId, statuId: ks, kaliteDurumu: kq },
      { malzemeId: h.malzemeId, konumId: y.hedef, partiId: h.partiId, statuId: hs, kaliteDurumu: hq });
    if (y.kaynak !== null) {
      const b = await sorgular.bakiyeKilitle(db, h.malzemeId, y.kaynak, h.partiId, ks, kq);
      onayliEksi = dusumDenetle(b?.miktar ?? '0', h.miktar, eksiOnay);
    }
    const id = await sorgular.hareketYaz(db, hareket({
      tur: 'geri_alma', malzemeId: h.malzemeId, miktar: h.miktar, kisiId, partiId: h.partiId, partiSecimi: h.partiId === null ? null : 'kisi',
      kaynakKonumId: y.kaynak, hedefKonumId: y.hedef, onayliEksi, uretimEmriId: h.uretimEmriId, geriAlinanId: h.id, aciklama,
      kaynakStatuId: y.kaynak === null ? null : ks, hedefStatuId: y.hedef === null ? null : hs,
      kaynakKaliteDurumu: y.kaynak === null ? null : h.hedefKaliteDurumu, hedefKaliteDurumu: y.hedef === null ? null : h.kaynakKaliteDurumu,
    }));
    if (y.kaynak !== null) await bakiyeDegistir(db, { malzemeId: h.malzemeId, konumId: y.kaynak, partiId: h.partiId, statuId: ks, kaliteDurumu: kq, fark: -binde(h.miktar) });
    if (y.hedef !== null) await bakiyeDegistir(db, { malzemeId: h.malzemeId, konumId: y.hedef, partiId: h.partiId, statuId: hs, kaliteDurumu: hq, fark: binde(h.miktar) });
    // Teslimin hareketi geri alındıysa teslim iptal olur ve kapattığı istek yeniden açılır: sayım ve istek teslim edilmiş saymasın.
    // Kısmi teslimde açılan kalan isteği, açıksa, iptal olur: istek yeniden bütün miktarla açıktır.
    const t = await sorgular.teslimGeriAlindi(db, h.id, kisiId);
    const istek = t?.istekId == null ? null : await sorgular.istekBul(db, t.istekId, true);
    if (istek?.durum === 'teslim') {
      await sorgular.istekGecir(db, istek.id, istek.surum, { kaynaklar: ['teslim'], durum: 'acik', karsilanan: null, kapatanKisiId: null });
      for (const x of await sorgular.istekleriKaynaktan(db, [kalanKimligi(istek)])) {
        await sorgular.istekGecir(db, x.id, x.surum, { kaynaklar: ['acik', 'stok_yok'], durum: 'iptal', karsilanan: null, kapatanKisiId: kisiId });
      }
    }
    return id;
  });
}
export async function geriAl(db: Db, kisiId: number, hareketId: number, g: { eksiOnay?: boolean | undefined; aciklama?: string | null | undefined }): Promise<HareketCevabi> {
  const id = await tersCevir(db, kisiId, hareketId, g.eksiOnay === true, g.aciklama ?? null, false, true);
  const h = await sorgular.hareketBul(db, id);
  return { hareketIdler: [id], onayliEksi: h?.onayliEksi ?? false };
}
// Toplu geri alma (ilk sistemdeki "İşlemi geri al"): uç tek işlemdedir; biri reddedilirse hiçbiri yazılmaz. Yeniden eskiye geri
// alınır: önce yapılan hareket sonra geri alınırsa (taşıma, ardından o konumdan çıkış) ara bakiye eksiye düşmez.
export async function topluGeriAl(db: Db, kisiId: number, g: TopluGeriAlKomutu): Promise<HareketCevabi> {
  const idler = g.hareketIdler;
  if (new Set(idler).size !== idler.length) throw dogrulama('Aynı hareket iki kez seçilmiş.', 'hareketIdler');
  const yazilan: number[] = [];
  const hareketler: NonNullable<Awaited<ReturnType<typeof sorgular.hareketBul>>>[] = [];
  for (const id of idler) { const h = await sorgular.hareketBul(db, id); if (h) hareketler.push(h); }
  await siraliKilitle(db, ...hareketler.flatMap((h) => [
    { malzemeId: h.malzemeId, konumId: h.kaynakKonumId, partiId: h.partiId, statuId: h.kaynakStatuId },
    { malzemeId: h.malzemeId, konumId: h.hedefKonumId, partiId: h.partiId, statuId: h.hedefStatuId },
  ]));
  for (const id of [...idler].sort((a, b) => b - a)) yazilan.push(await tersCevir(db, kisiId, id, g.eksiOnay === true, g.aciklama ?? null, false, true));
  // İşlem tek bağlantıdadır: sorgular sırayla gider (pg aynı istemcide eşzamanlı sorguyu reddedecek).
  let onayliEksi = false;
  for (const id of yazilan) if ((await sorgular.hareketBul(db, id))?.onayliEksi === true) { onayliEksi = true; break; }
  return { hareketIdler: yazilan, onayliEksi };
}

// ---- Hareket listesi: süzgeçsiz istekte sayım yok (defter büyür) ----------------------------------------------------------------
export async function hareketListesi(db: Db, s: HareketlerListesi): Promise<SayfaliListe<Hareket>> {
  const suzgec: sorgular.HareketSuzgeci = { malzemeId: s.malzemeId, konumId: s.konumId, partiId: s.partiId, tur: s.tur, uretimEmriId: s.uretimEmriId, baslangic: s.baslangic, bitis: s.bitis, metin: s.metin };
  const l = await sayfaliListe(s, {
    ...(sorgular.suzgecVarMi(suzgec) ? { say: () => sorgular.hareketSay(db, suzgec) } : {}),
    satirlar: (d) => sorgular.hareketler(db, suzgec, s, d),
  });
  return { ...l, satirlar: await hareketleriCevir(db, l.satirlar) };
}


// ---- Sepet (DEP-54: kişiye özel) ------------------------------------------------------------------------------------------
const KULLANILABILIR = new Set(['raf_gozu', 'kabul', 'depo_zemini']);
const kullanilabilirToplam = (b: BakiyeHam[]): bigint => b.filter((x) => KULLANILABILIR.has(x.konumTur) && binde(x.miktar) > 0n).reduce((t, x) => t + binde(x.miktar), 0n);
export async function sepet(db: Db, kisiId: number): Promise<SepetCevabi> {
  const satirlar = await sorgular.sepetSatirlari(db, kisiId);
  const ozetler = await malzemeOzetleri(db, satirlar.map((x) => x.malzemeId));
  const kartIdler = [...new Set(satirlar.flatMap((x) => (x.refakatPartisiId === null ? [] : [x.refakatPartisiId])))];
  const kartlar = kartIdler.length === 0 ? [] : await sorgular.refakatPartileriBul(db, kartIdler);
  const nolar = await emirNoHaritasi(db, [...satirlar.map((x) => x.partiEmirId), ...kartlar.map((r) => r.uretimEmriId)]);
  const istKodlari = await istasyonKodlari(db, satirlar.map((x) => x.hedefIstasyonId));
  const cevap = [];
  for (const x of satirlar) {
    const mevcut = x.kaynakKonumId === null ? kullanilabilirToplam(await sorgular.serbestBakiyeler(db, x.malzemeId))
      : binde((await sorgular.bakiyeOku(db, x.malzemeId, x.kaynakKonumId, x.partiId))?.miktar ?? '0');
    const o = ozetler.get(x.malzemeId) ?? null;
    const r = x.refakatPartisiId === null ? undefined : kartlar.find((y) => y.id === x.refakatPartisiId);
    cevap.push({
      id: x.id, malzemeId: x.malzemeId, malzemeAd: o?.ad ?? null, malzemeKod: o?.kod ?? null, kaynakKonumId: x.kaynakKonumId, kaynakKonumKod: x.kaynakKonumKod,
      partiId: x.partiId, partiEtiketi: x.partiId === null ? null : partiEtiketi({ lotNo: x.lotNo, tedarikciPartiNo: x.tedarikciPartiNo, dokumNo: x.dokumNo, uretimEmriId: x.partiEmirId }, emirNoDe(nolar, x.partiEmirId)),
      miktar: bindenMetin(binde(x.miktar)), mevcut: bindenMetin(mevcut), eklenme: x.eklenme,
      refakat: r === undefined ? null : { id: r.id, etiket: refakatEtiketi(emirNoDe(nolar, r.uretimEmriId), r.uretimEmriId, r.sira) },
      hedef: x.hedefKonumId === null ? null
        : { konumId: x.hedefKonumId, kod: x.hedefIstasyonId === null ? (x.hedefKonumKod ?? '') : (istKodlari.get(x.hedefIstasyonId) ?? x.hedefKonumKod ?? ''), ad: x.hedefKonumAd, istasyonId: x.hedefIstasyonId },
    });
  }
  return { satirlar: cevap };
}
// Sepet hedefi önerisi (Soru 133): kartın emrine açık istek varsa isteyen istasyon, yoksa rotada kaynaktan sonraki istasyon; ikisi de yoksa elle seçilir.
async function sepetHedefOnerisi(db: Db, malzemeId: number, kaynakKonumId: number | null, r: RefakatPartisiHam): Promise<number | null> {
  const istek = (await sorgular.emrinAcikIstekleri(db, r.uretimEmriId)).find((i) => i.malzemeId === malzemeId && i.istasyonId !== null);
  if (istek?.istasyonId != null) return istek.istasyonId;
  const e = await adimliEmirAyrintisi(db, r.uretimEmriId).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
  if (!e) return null;
  const rota: SepetAdimi[] = e.isEmirleri.map((i) => ({ sira: i.sira, opNo: i.opNo, istasyonId: i.istasyon?.id ?? null, statuId: null }));
  const buradaki = kaynakKonumId === null ? null : await sorgular.konumIstasyonu(db, kaynakKonumId);
  if (buradaki === null) return [...rota].sort((a, b) => a.sira - b.sira || a.opNo - b.opNo).find((a) => a.istasyonId !== null)?.istasyonId ?? null;
  const sonraki = sonrakiIstasyon(rota, buradaki, null);
  return 'yok' in sonraki ? null : sonraki.istasyonId;
}
export async function sepeteEkle(db: Db, kisiId: number, g: SepetEkleKomutu): Promise<SepetCevabi> {
  if (!(await malzemeOzeti(db, g.malzemeId))) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  let partiId: number | null = null;
  if (g.kaynakKonumId !== undefined) {
    await aktifKonum(db, g.kaynakKonumId, 'kaynakKonumId');
    partiId = (await kaynakPartisi(db, g.malzemeId, g.kaynakKonumId, g.partiId === undefined ? undefined : g.partiId)).partiId;
  } else if (g.partiId !== undefined && g.partiId !== null) throw dogrulama('Parti ancak kaynak gözle seçilir.', 'partiId');
  // Sepet satırı statü tutmaz (UYUM-BORCU): adım statüsündeki parça Teslim al ya da okutup Teslim et ile gider.
  if (g.statuId != null) throw dogrulama('Adım statüsündeki parça sepete eklenmez; okutup Teslim et ile gönderin.', 'statuId');
  let refakatPartisiId: number | null = null, hedefKonumId: number | null = null;
  if (g.refakatPartisiId != null) {
    const r = await sorgular.etkinRefakatPartisiBul(db, g.refakatPartisiId);
    if (!r) throw dogrulama('Refakat kartı bulunamadı.', 'refakatPartisiId');
    if (g.kaynakKonumId === undefined) throw dogrulama('Kartla sepete ekleme kartın bir satırından yapılır.', 'kaynakKonumId');
    const engel = refakatTeslimEngeli(r, { malzemeId: g.malzemeId, partiId, uretimEmriId: undefined });
    if (engel) throw dogrulama(engel, 'refakatPartisiId');
    refakatPartisiId = r.id;
    const oneri = g.hedef ? null : await sepetHedefOnerisi(db, g.malzemeId, g.kaynakKonumId, r);
    if (oneri !== null) hedefKonumId = await istasyonKonumuBul(db, oneri, 'hedef');
  }
  if (g.hedef) hedefKonumId = 'istasyonId' in g.hedef ? await istasyonKonumuBul(db, g.hedef.istasyonId, 'hedef') : (await aktifKonum(db, g.hedef.konumId, 'hedef')).id;
  if (hedefKonumId !== null && hedefKonumId === g.kaynakKonumId) hedefKonumId = null;
  await korumali(() => sorgular.sepeteEkle(db, { kisiId, malzemeId: g.malzemeId, kaynakKonumId: g.kaynakKonumId ?? null, partiId, miktar: bindenMetin(binde(g.miktar)), refakatPartisiId, hedefKonumId }));
  return sepet(db, kisiId);
}
// Herkese sepet (Soru 133): her satır kendi hedefine ayrı yoldaki teslim olur; bir satırın reddi ötekileri durdurmaz, satır sepette kalır ve nedeni döner.
export async function sepetGonder(db: Db, k: Kullanici, g: SepetTeslimEtKomutu): Promise<SepetTeslimEtCevabi> {
  const satirlar = await sorgular.sepetSatirlari(db, k.id, true);
  const teslimler: SepetTeslimEtCevabi['teslimler'] = [], kalanlar: SepetTeslimEtCevabi['kalanlar'] = [];
  for (const istenen of g.satirlar) {
    const satirId = Number(istenen.satirId);
    const x = satirlar.find((y) => y.id === satirId);
    if (!x) { kalanlar.push({ satirId, neden: 'Sepet satırı bulunamadı; sayfayı yenileyin.' }); continue; }
    const hedef: TeslimYeri | null = istenen.hedef ?? (x.hedefKonumId === null ? null : x.hedefIstasyonId === null ? { konumId: x.hedefKonumId } : { istasyonId: x.hedefIstasyonId });
    if (hedef === null) { kalanlar.push({ satirId, neden: 'Hedef seçilmedi.' }); continue; }
    if (x.kaynakKonumId === null) { kalanlar.push({ satirId, neden: 'Satırın alınacağı yer yok; malzemeyi yerinden sepete ekleyin.' }); continue; }
    const kaynakKonumId = x.kaynakKonumId;
    const miktar = istenen.miktar === undefined ? x.miktar : bindenMetin(binde(istenen.miktar));
    if (binde(miktar) <= 0n || binde(miktar) > binde(x.miktar)) { kalanlar.push({ satirId, neden: `Miktar sepetteki ${x.miktar} miktarını aşamaz.` }); continue; }
    const kalan = binde(x.miktar) - binde(miktar);
    const sonuc = await kayitNoktasi(db, async () => {
      const t = await teslimGonder(db, k, {
        malzemeId: x.malzemeId, miktar, partiId: x.partiId, statuId: null, kaynak: { konumId: kaynakKonumId }, hedef, aliciKodu: g.aliciKodu ?? null, not: 'Sepet',
        kaynakKimligi: `sepet:${g.kaynakKimligi}:${satirId}`, ...(x.refakatPartisiId === null ? {} : { refakatPartisiId: x.refakatPartisiId }),
      });
      if (kalan > 0n) await sorgular.sepetMiktari(db, satirId, k.id, bindenMetin(kalan));
      else await sorgular.sepettenSil(db, satirId, k.id);
      return t;
    });
    if (sonuc.tamam) teslimler.push({ satirId, teslimNo: sonuc.deger.teslim.no });
    else kalanlar.push({ satirId, neden: sonuc.hata.message });
  }
  return { teslimler, kalanlar };
}
export async function sepetSatiriDegistir(db: Db, kisiId: number, id: number, miktar: string): Promise<SepetCevabi> {
  if (!(await sorgular.sepetMiktari(db, id, kisiId, bindenMetin(binde(miktar))))) throw bulunamadi('Sepet satırı bulunamadı.');
  return sepet(db, kisiId);
}
export async function sepetSatiriSil(db: Db, kisiId: number, id: number): Promise<SepetCevabi> {
  if (!(await sorgular.sepettenSil(db, id, kisiId))) throw bulunamadi('Sepet satırı bulunamadı.');
  return sepet(db, kisiId);
}

// ---- Teslim (DEP-40, DEP-41): bütün satırlar tek işlemde; bir satır karşılanamazsa hiçbiri yazılmaz -----------------------
interface Ayirma { satirId: number; malzemeId: number; konumId: number; partiId: number | null; partiSecimi: 'kisi' | 'tek_parti' | 'en_eski' | null; miktar: string; onayliEksi: boolean }
async function sepetiAyir(db: Db, kisiId: number, eksiOnay: boolean): Promise<{ satirIdler: number[]; ayirmalar: Ayirma[] }> {
  const satirlar = await sorgular.sepetSatirlari(db, kisiId, true);
  if (satirlar.length === 0) throw gecersiz('Sepet boş.');
  const ayirmalar: Ayirma[] = [], eksikler: { malzemeId: number; mevcut: string; istenen: string }[] = [];
  const kabul = await varsayilanKonum(db, 'KABUL');
  await siraliKilitle(db, ...satirlar.map((s) => ({ malzemeId: s.malzemeId, konumId: s.kaynakKonumId, partiId: s.partiId })));
  for (const s of satirlar) {
    if (s.kaynakKonumId !== null) {
      const b = await sorgular.bakiyeKilitle(db, s.malzemeId, s.kaynakKonumId, s.partiId);
      const mevcut = b?.miktar ?? '0', yeterli = binde(mevcut) >= binde(s.miktar);
      await eksiKaliteDenetle(db, { malzemeId: s.malzemeId, konumId: s.kaynakKonumId, partiId: s.partiId }, mevcut, s.miktar);
      if (!yeterli) eksikler.push({ malzemeId: s.malzemeId, mevcut: bindenMetin(binde(mevcut)), istenen: bindenMetin(binde(s.miktar)) });
      ayirmalar.push({ satirId: s.id, malzemeId: s.malzemeId, konumId: s.kaynakKonumId, partiId: s.partiId, partiSecimi: s.partiId === null ? null : 'kisi', miktar: bindenMetin(binde(s.miktar)), onayliEksi: !yeterli });
      continue;
    }
    const b = await sorgular.serbestBakiyeler(db, s.malzemeId);
    const o = cikisOnerisi(b.map((x) => ({ bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, partiEtiketi: null, miktar: x.miktar, ilkGiris: x.ilkGiris })), s.miktar);
    let kalan = binde(s.miktar);
    for (const x of o.oneriler) { ayirmalar.push({ satirId: s.id, malzemeId: s.malzemeId, konumId: x.konumId, partiId: x.partiId, partiSecimi: x.partiId === null ? null : 'en_eski', miktar: x.miktar, onayliEksi: false }); kalan -= binde(x.miktar); }
    if (kalan > 0n) {
      eksikler.push({ malzemeId: s.malzemeId, mevcut: o.mevcut, istenen: bindenMetin(binde(s.miktar)) });
      const son = o.oneriler[o.oneriler.length - 1];
      ayirmalar.push({ satirId: s.id, malzemeId: s.malzemeId, konumId: son?.konumId ?? kabul, partiId: son?.partiId ?? null, partiSecimi: son?.partiId ? 'en_eski' : null, miktar: bindenMetin(kalan), onayliEksi: true });
    }
  }
  if (eksikler.length > 0 && !eksiOnay) {
    const ad = await adlar(db, eksikler.map((e) => e.malzemeId));
    const ilk = eksikler[0]!;
    throw onayGerekli(`Yetersiz stok: ${eksikler.map((e) => `${ad.get(e.malzemeId) ?? `kart ${e.malzemeId}`} mevcut ${e.mevcut}, istenen ${e.istenen}`).join('; ')}. Yine de teslim etmek için onaylayın; bakiye eksiye düşer.`,
      { mevcut: ilk.mevcut, eksikler });
  }
  return { satirIdler: satirlar.map((x) => x.id), ayirmalar };
}
async function fisOzetiCevir(db: Db, f: sorgular.FisHam): Promise<FisOzeti> {
  const { kisiId, ...geri } = f;
  const nolar = await emirNoHaritasi(db, [f.uretimEmriId]);
  return { ...geri, emirNo: emirNoDe(nolar, f.uretimEmriId), kisiAd: (await kisiAdlari(db, [kisiId])).get(kisiId) ?? null };
}
// Taşı: satırın hedefi verilmişse o, verilmemişse ortak hedef; her hedef için ayrı fiş (fiş tek hedeflidir). Hepsi tek işlemde.
export async function teslimEt(db: Db, kisiId: number, g: TeslimKomutu): Promise<SepetTeslimCevabi> {
  const satirHedefi = new Map((g.satirHedefleri ?? []).map((x) => [Number(x.satirId), Number(x.hedefKonumId)]));
  for (const h of new Set([...satirHedefi.values(), ...(g.hedefKonumId === undefined ? [] : [Number(g.hedefKonumId)])])) await aktifKonum(db, h, 'hedefKonumId');
  const { satirIdler, ayirmalar } = await sepetiAyir(db, kisiId, g.eksiOnay === true);
  if ([...satirHedefi.keys()].some((id) => !satirIdler.includes(id))) throw dogrulama('Sepet satırı bulunamadı; sayfayı yenileyin.', 'satirHedefleri');
  const hedefi = (satirId: number): number | null => satirHedefi.get(satirId) ?? (g.hedefKonumId === undefined ? null : Number(g.hedefKonumId));
  if (satirIdler.some((id) => hedefi(id) === null)) throw dogrulama('Her satırın teslim yerini seçin.', 'hedefKonumId');
  await siraliKilitle(db, ...ayirmalar.flatMap((a) => [a, { ...a, konumId: hedefi(a.satirId)! }]));
  return korumali(async () => {
    const gruplar = new Map<number, number[]>();
    for (const a of ayirmalar) {
      const hedef = hedefi(a.satirId)!;
      const hareketler = gruplar.get(hedef) ?? [];
      gruplar.set(hedef, hareketler);
      if (a.konumId === hedef) continue;
      const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId);
      hareketler.push(await sorgular.hareketYaz(db, hareket({ tur: 'transfer', malzemeId: a.malzemeId, miktar: a.miktar, kisiId, partiId: a.partiId, partiSecimi: a.partiSecimi, kaynakKonumId: a.konumId, hedefKonumId: hedef, onayliEksi: a.onayliEksi, aciklama: g.aciklama ?? null })));
      await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, fark: -binde(a.miktar) });
      const ambalaj = b?.ambalajTur && b.ambalajOlcu !== 'ozel' ? { tur: b.ambalajTur, olcu: b.ambalajOlcu ?? '', uzunluk: null, genislik: null, yukseklik: null, adet: null } : null;
      await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: hedef, partiId: a.partiId, fark: binde(a.miktar), ilkGiris: b?.ilkGiris ?? null, ambalaj });
    }
    const fisler: FisOzeti[] = [];
    for (const [hedef, hareketler] of gruplar) {
      const fisId = await sorgular.fisAc(db, { no: await belgeNo(db, 'stok.fis-no', 'stok_fis'), hedefKonumId: hedef, cikisNedeni: null, uretimEmriId: null, aciklama: g.aciklama ?? null, kisiId });
      if (hareketler.length) await sorgular.fisSatiriYaz(db, fisId, hareketler);
      fisler.push(await fisOzetiCevir(db, (await sorgular.fisBul(db, fisId))!));
    }
    await sorgular.sepetiBosalt(db, kisiId, satirIdler);
    return { fis: fisler[0]!, fisler };
  });
}
export async function stoktanDus(db: Db, kisiId: number, g: StoktanDusKomutu): Promise<{ fis: FisOzeti }> {
  const { satirIdler, ayirmalar } = await sepetiAyir(db, kisiId, g.eksiOnay === true);
  await sevkCikisiniDenetle(db, [...new Set(ayirmalar.map((a) => a.malzemeId))], g.cikisNedeni);
  const emir = g.uretimEmriId ?? null;
  await sarfEmriDenetle(db, kisiId, emir === null ? null : Number(emir));
  return korumali(async () => {
    const hareketler: number[] = [];
    for (const a of ayirmalar) {
      await rezerveyiAsmasin(db, a.malzemeId, null, emir === null ? null : Number(emir), binde(a.miktar));
      await rezerveDegistir(db, { malzemeId: a.malzemeId, statuId: null, uretimEmriId: emir === null ? null : Number(emir), fark: -binde(a.miktar) });
      hareketler.push(await sorgular.hareketYaz(db, hareket({ tur: 'cikis', malzemeId: a.malzemeId, miktar: a.miktar, kisiId, partiId: a.partiId, partiSecimi: a.partiSecimi, kaynakKonumId: a.konumId, onayliEksi: a.onayliEksi, cikisNedeni: g.cikisNedeni, uretimEmriId: emir, aciklama: g.aciklama ?? null })));
      await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, fark: -binde(a.miktar) });
    }
    const fisId = await sorgular.fisAc(db, { no: await belgeNo(db, 'stok.fis-no', 'stok_fis'), hedefKonumId: null, cikisNedeni: g.cikisNedeni, uretimEmriId: emir, aciklama: g.aciklama ?? null, kisiId });
    await sorgular.fisSatiriYaz(db, fisId, hareketler);
    await sorgular.sepetiBosalt(db, kisiId, satirIdler);
    return { fis: await fisOzetiCevir(db, (await sorgular.fisBul(db, fisId))!) };
  });
}
export async function fisListesi(db: Db, s: FislerListesi): Promise<SayfaliListe<FisOzeti>> {
  const l = await sayfaliListe(s, { say: () => sorgular.fisSay(db), satirlar: (d) => sorgular.fisler(db, s, d) });
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.map((f) => f.kisiId))]);
  return { ...l, satirlar: l.satirlar.map(({ kisiId, ...f }) => ({ ...f, kisiAd: kisiler.get(kisiId) ?? null })) };
}
export const malzemeFisiAyrintisiOku = (db: Db, id: number): Promise<MalzemeFisiAyrintiCevabi> =>
  malzemeFisi.malzemeFisiAyrintisi(db, id, (h) => hareketleriCevir(db, h));
export async function fisAyrintisi(db: Db, id: number): Promise<FisAyrintiCevabi> {
  const f = await sorgular.fisBul(db, id);
  if (!f) throw bulunamadi('Fiş bulunamadı.');
  return { fis: await fisOzetiCevir(db, f), hareketler: await hareketleriCevir(db, await sorgular.fisinHareketleri(db, id)) };
}

// ---- Kod çözümleme (DEP-55): önek ayrımı ortak kod sözlüğünden (#1070); kaydın varlığını stok doğrular, bilinmeyen kod uydurulmaz --
async function lotCoz(db: Db, lotNo: string): Promise<KodCozCevabi | null> {
  const p = await sorgular.lotNoylaParti(db, lotNo);
  if (!p) return null;
  const o = await malzemeOzeti(db, p.malzemeId);
  if (!o) return null;
  const b = await sorgular.lotBakiyeleri(db, p.id);
  const ad = new Map(o.ad === null ? [] : [[o.id, o.ad]]);
  const nolar = await emirNoHaritasi(db, [p.uretimEmriId, ...b.map((x) => x.uretimEmriId)]);
  return {
    tur: 'lot', parti: { id: p.id, lotNo: p.lotNo, etiket: partiEtiketi(p, emirNoDe(nolar, p.uretimEmriId)) ?? p.lotNo },
    ozet: { id: o.id, tur: o.tur, kod: o.kod, ad: o.ad, onayDurumu: o.onayDurumu, kullanilabilir: await malzemeKullanilabilirMi(db, o.id), birim: o.birim },
    toplam: bindenMetin(b.reduce((t, x) => t + binde(x.miktar), 0n)), bakiyeler: b.map((x) => bakiyeSatiri(x, ad, nolar)),
  };
}
// Refakat kartı: lotun çözümü ve kartın partisi.
async function refakatCoz(db: Db, id: number): Promise<KodCozCevabi | null> {
  const r = await sorgular.etkinRefakatPartisiBul(db, id);
  // Lot bekleyen (istisna) kartın lot satırı yok; kodu tanınmaz, kart Lot bekleyen kartlar listesinden açılır.
  const lot = r === null || r.lotNo === null ? null : await lotCoz(db, r.lotNo);
  if (!r || lot?.tur !== 'lot') return null;
  return { ...lot, refakat: (await refakatPartileriCevir(db, [r]))[0]! };
}
async function konumCoz(db: Db, kod: string): Promise<KodCozCevabi | null> {
  const k = await sorgular.konumKoduyla(db, kod);
  if (!k) return null;
  const b = await sorgular.konumBakiyeleri(db, k.id);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return { tur: 'konum', konum: k, bakiyeler: b.map((x) => bakiyeSatiri(x, new Map(), nolar)) };
}
async function malzemeCoz(db: Db, no: number): Promise<KodCozCevabi | null> {
  const o = await malzemeOzeti(db, no);
  if (!o) return null;
  const b = await sorgular.malzemeBakiyeleri(db, o.id);
  const ad = new Map(o.ad === null ? [] : [[o.id, o.ad]]);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return {
    tur: 'malzeme', ozet: { id: o.id, tur: o.tur, kod: o.kod, ad: o.ad, onayDurumu: o.onayDurumu, kullanilabilir: await malzemeKullanilabilirMi(db, o.id), birim: o.birim },
    toplam: bindenMetin(b.reduce((t, x) => t + binde(x.miktar), 0n)), bakiyeler: b.map((x) => bakiyeSatiri(x, ad, nolar)),
  };
}
// Üretim emri kodu stokta çözülmez (emre çıkış bağlamada); sözlüğün tanımadığı öneksiz konum kodu (A-01-01, KABUL), eski `LOC-`
// biçimi ve düz kart no stokun kendi geri düşmesiyle aranır.
export async function kodCoz(db: Db, ham: string): Promise<KodCozCevabi> {
  const t = kodTuru(ham);
  const bulunan = t.tur === 'lot' ? await lotCoz(db, t.deger) : t.tur === 'refakat-partisi' ? await refakatCoz(db, Number(t.deger)) : t.tur === 'konum' ? await konumCoz(db, t.deger) : t.tur === 'malzeme' ? await malzemeCoz(db, Number(t.deger)) : null;
  if (bulunan) return bulunan;
  const kod = ham.trim().toUpperCase();
  const konum = await konumCoz(db, kod.replace(/^LOC[:\s-]*/, ''));
  if (konum) return konum;
  const no = /^(?:MLZ[:\s-]*)?(\d{1,9})$/.exec(kod)?.[1] ?? await katalogEtiketiKartNo(db, ham);
  return (no === undefined || no === null ? null : await malzemeCoz(db, Number(no))) ?? { tur: 'bilinmiyor', kod: ham.trim() };
}
// DEP-64: katalog etiketi (MK:<stok kodu>); kart no'yu Malzemeler verir, stok onun tablosunu okumaz. Kart yoksa null.
async function katalogEtiketiKartNo(db: Db, ham: string): Promise<number | null> {
  const stokKodu = katalogEtiketiStokKodu(ham);
  return stokKodu === null ? null : malzemeNoKoddan(db, stokKodu);
}


// ---- Toplama (DEP-42 rota, DEP-56 adım toplanınca çıkış) -----------------------------------------------------------------
async function toplamaOzetiCevir(db: Db, t: sorgular.ToplamaHam): Promise<ToplamaOzeti> {
  const { kisiId, kapatanKisiId, ...geri } = t;
  const ad = await kisiAdlari(db, kapatanKisiId === null ? [kisiId] : [kisiId, kapatanKisiId]);
  return { ...geri, kisiAd: ad.get(kisiId) ?? null, kapatanKisiAd: kapatanKisiId === null ? null : ad.get(kapatanKisiId) ?? null };
}
// Hazırlık listesi (toplama ve istek birleşik): kalemler elle ya da isteklerden gelir. İstekleri karşılayan liste bir teslim
// yerine toplanır; istekler listeye bağlanır ve hazırlanıyor olur.
async function toplamaHedefiCoz(db: Db, hedef: NonNullable<ToplamaAcKomutu['hedef']>): Promise<number> {
  if ('istasyonId' in hedef) return istasyonKonumuBul(db, Number(hedef.istasyonId), 'hedef');
  const k = await aktifKonum(db, Number(hedef.konumId), 'hedef');
  if (k.tur === 'istasyon') throw dogrulama('İstasyonu istasyon olarak seçin.', 'hedef');
  return k.id;
}
export async function toplamaAc(db: Db, k: Kullanici, g: ToplamaAcKomutu): Promise<ToplamaAyrintiCevabi> {
  const istekIdler = [...new Set((g.istekIdler ?? []).map(Number))];
  if (istekIdler.length > 0 && !islemVarMi(k, 'stok.transfer')) throw yetkiYok();
  if (istekIdler.length > 0 && !g.hedef) throw dogrulama('İstekleri karşılayan liste bir teslim yerine toplanır; teslim yerini seçin.', 'hedef');
  const istekler: IstekHam[] = [];
  for (const [i, id] of istekIdler.entries()) {
    const x = await sorgular.istekBul(db, id, true);
    if (!x) throw dogrulama('Malzeme isteği bulunamadı.', `istekIdler.${i}`);
    await istasyonKapsaminiDenetle(db, k.id, x.istasyonId);
    if (!ISTEK_GECIS_KAYNAKLARI.teslim.includes(x.durum)) throw cakisma(`${x.no} kapandı; listeye alınamaz.`);
    if (x.kaynakIstasyonId !== null) throw cakisma(`${x.no}: ${ISTASYON_ISTEGI}`);
    const engel = istekListeEngeli(x);
    if (engel) throw cakisma(engel);
    istekler.push(x);
  }
  const hedef = g.hedef ? await toplamaHedefiCoz(db, g.hedef) : null;
  if (hedef !== null) await istasyonKapsaminiDenetle(db, k.id, await sorgular.konumIstasyonu(db, hedef));
  // İstasyonlu istek yalnız kendi istasyonuna toplanır; yolda teslimi olan istek ikinci kez taşınmasın diye listeye alınmaz (kart #1410).
  for (const [i, x] of istekler.entries()) {
    const yer = x.istasyonId === null ? null : await sorgular.istasyonKonumu(db, x.istasyonId);
    if (yer !== null && hedef !== null && yer !== hedef) throw dogrulama(`${x.no} başka istasyonun isteği; liste o istasyona toplanmalı.`, `istekIdler.${i}`);
    if (await sorgular.yoldaTeslimVarMi(db, x.id)) throw cakisma(`${x.no} için yolda bir teslim var; alınınca ya da reddedilince listeye alınır.`);
  }
  // Elle girilen kalemde aynı malzeme iki kez olamaz; isteklerin miktarı aynı malzemenin kalemine eklenir.
  const istenen = new Map<number, bigint>();
  for (const [i, x] of g.kalemler.entries()) {
    if (istenen.has(x.malzemeId)) throw dogrulama('Aynı malzeme listede iki kez var; miktarı birleştirin.', `kalemler.${i}.malzemeId`);
    if (!(await malzemeOzeti(db, x.malzemeId))) throw dogrulama('Malzeme kartı bulunamadı.', `kalemler.${i}.malzemeId`);
    istenen.set(x.malzemeId, binde(x.miktar));
  }
  for (const x of istekler) istenen.set(x.malzemeId, (istenen.get(x.malzemeId) ?? 0n) + binde(x.miktar));
  const plan: { malzemeId: number; konumId: number; partiId: number | null; miktar: string }[] = [];
  const kalemler: { malzemeId: number; istenen: string; eksik: string }[] = [];
  for (const [malzemeId, miktar] of istenen) {
    const b = (await sorgular.serbestBakiyeler(db, malzemeId)).filter((x) => x.konumId !== hedef);
    const o = cikisOnerisi(b.map((x) => ({ bakiyeId: x.id, konumId: x.konumId, konumKod: x.konumKod, konumTur: x.konumTur, partiId: x.partiId, partiEtiketi: null, miktar: x.miktar, ilkGiris: x.ilkGiris })), bindenMetin(miktar));
    const karsilanan = o.oneriler.reduce((t, x) => t + binde(x.miktar), 0n);
    kalemler.push({ malzemeId, istenen: bindenMetin(miktar), eksik: bindenMetin(miktar - karsilanan) });
    for (const x of o.oneriler) plan.push({ malzemeId, konumId: x.konumId, partiId: x.partiId, miktar: x.miktar });
  }
  const rota = new Map((await sorgular.konumRotaBilgisi(db, [...new Set(plan.map((p) => p.konumId))])).map((r) => [r.id, r]));
  const sirali = rotaSirala(plan.map((p) => { const r = rota.get(p.konumId)!; return { ...p, konumKod: r.kod, rafKod: r.rafKod, bolmeNo: r.bolmeNo, katNo: r.katNo }; }));
  const id = await korumali(async () => {
    const t = await sorgular.toplamaAc(db, await belgeNo(db, 'stok.toplama-no', 'stok_toplama'), g.ad, k.id);
    for (const x of kalemler) await sorgular.toplamaKalemiYaz(db, t, x.malzemeId, x.istenen, x.eksik);
    for (const [i, a] of sirali.entries()) await sorgular.toplamaAdimiYaz(db, { toplamaId: t, sira: i + 1, malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, miktar: a.miktar });
    if (hedef !== null) await sorgular.toplamaHedefiYaz(db, t, hedef);
    for (const x of istekler) {
      if (!(await sorgular.toplamaIstegiBagla(db, t, x.id))) throw cakisma(`${x.no} başka bir listede; yenileyin.`);
      if (x.durum !== 'hazirlaniyor' && !(await sorgular.istekGecir(db, x.id, x.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.hazirla, durum: 'hazirlaniyor', karsilanan: null, kapatanKisiId: null }))) {
        throw cakisma(`${x.no} değişti; yenileyin.`);
      }
    }
    return t;
  });
  return toplamaAyrintisi(db, id);
}
export async function toplamaAyrintisiGor(db: Db, kisiId: number, id: number): Promise<ToplamaAyrintiCevabi> {
  await toplamaKapsaminiDenetle(db, kisiId, id);
  return toplamaAyrintisi(db, id);
}
// Teslim yeri istasyon olan liste, istasyonu kişinin kapsamındaysa görünür ve işlenir; teslim yeri istasyon olmayan liste kapsamsızdır.
async function toplamaKapsaminiDenetle(db: Db, kisiId: number, toplamaId: number): Promise<void> {
  await istasyonKapsaminiDenetle(db, kisiId, (await sorgular.toplamaHedefi(db, toplamaId))?.istasyonId ?? null);
}
export async function toplamaAyrintisi(db: Db, id: number): Promise<ToplamaAyrintiCevabi> {
  const t = await sorgular.toplamaBul(db, id);
  if (!t) throw bulunamadi('Toplama listesi bulunamadı.');
  const kalemler = await sorgular.toplamaKalemleri(db, id);
  const adimlar = await sorgular.toplamaAdimlari(db, id);
  const ad = await adlar(db, kalemler.map((k) => k.malzemeId));
  const nolar = await emirNoHaritasi(db, adimlar.map((a) => a.partiEmirId));
  return {
    toplama: await toplamaOzetiCevir(db, t),
    kalemler: kalemler.map((k) => ({ ...k, malzemeAd: ad.get(k.malzemeId) ?? null, istenen: bindenMetin(binde(k.istenen)), eksik: bindenMetin(binde(k.eksik)) })),
    adimlar: adimlar.map((a) => ({
      id: a.id, sira: a.sira, malzemeId: a.malzemeId, malzemeAd: ad.get(a.malzemeId) ?? null, konumId: a.konumId, konumKod: a.konumKod, partiId: a.partiId,
      partiEtiketi: a.partiId === null ? null : partiEtiketi({ lotNo: a.lotNo, tedarikciPartiNo: a.tedarikciPartiNo, dokumNo: a.dokumNo, uretimEmriId: a.partiEmirId }, emirNoDe(nolar, a.partiEmirId)),
      miktar: bindenMetin(binde(a.miktar)), toplandi: a.hareketId !== null, hareketId: a.hareketId, toplanan: a.toplanan === null ? null : bindenMetin(binde(a.toplanan)),
    })),
    hedef: await toplamaHedefiGoster(db, id),
    istekler: (await sorgular.toplamaIstekleri(db, id)).map((i) => ({
      id: i.id, no: i.no, malzemeId: i.malzemeId, miktar: bindenMetin(binde(i.miktar)), karsilanan: i.karsilanan === null ? null : bindenMetin(binde(i.karsilanan)), durum: i.durum,
    })),
  };
}
export async function toplamaListesi(db: Db, kisiId: number, s: ToplamalarListesi): Promise<SayfaliListe<ToplamaOzeti>> {
  const istasyonlar = await istasyonKapsamiIdleri(db, await kapsamOku(db, kisiId));
  const l = await sayfaliListe(s, { say: () => sorgular.toplamaSay(db, s.durum, istasyonlar), satirlar: (d) => sorgular.toplamalar(db, s.durum, s, d, istasyonlar) });
  const kisiler = await kisiAdlari(db, [...new Set(l.satirlar.flatMap((t) => (t.kapatanKisiId === null ? [t.kisiId] : [t.kisiId, t.kapatanKisiId])))]);
  return {
    ...l,
    satirlar: l.satirlar.map(({ kisiId, kapatanKisiId, ...t }) => ({ ...t, kisiAd: kisiler.get(kisiId) ?? null, kapatanKisiAd: kapatanKisiId === null ? null : kisiler.get(kapatanKisiId) ?? null })),
  };
}
// Adım toplanınca hedefli listede mal o gözden hedefe taşınır, hedefsiz listede gözden sevk çıkışı yazılır. Miktar kısmi olabilir
// (STK-H2). Liste sürümü artar, iki kişi aynı adımı toplayamaz.
export async function adimTopla(db: Db, kisiId: number, toplamaId: number, adimId: number, g: { surum: number; miktar?: string | undefined; eksiOnay?: boolean | undefined }): Promise<ToplamaAyrintiCevabi> {
  const t = await sorgular.toplamaBul(db, toplamaId, true);
  if (!t) throw bulunamadi('Toplama listesi bulunamadı.');
  await toplamaKapsaminiDenetle(db, kisiId, toplamaId);
  if (t.durum !== 'topluyor') throw cakisma('Liste kapandı; adım toplanamaz.');
  await surumluGuncelle({ guncelle: () => sorgular.toplamaSurumu(db, toplamaId, g.surum), varMi: () => sorgular.toplamaVarMi(db, toplamaId), bulunamadiIletisi: 'Toplama listesi bulunamadı.' });
  const a = await sorgular.adimBul(db, toplamaId, adimId);
  if (!a) throw bulunamadi('Adım bulunamadı.');
  if (a.hareketId !== null) throw cakisma('Bu adım zaten toplandı.');
  const miktar = bindenMetin(binde(g.miktar ?? a.miktar));
  const engel = adimMiktarEngeli(a.miktar, miktar);
  if (engel) throw dogrulama(engel, 'miktar');
  const hedef = await sorgular.toplamaHedefi(db, toplamaId);
  await siraliKilitle(db, a, ...(hedef === null ? [] : [{ ...a, konumId: hedef.konumId }]));
  await korumali(async () => {
    const b = await sorgular.bakiyeKilitle(db, a.malzemeId, a.konumId, a.partiId);
    const onayliEksi = dusumDenetle(b?.miktar ?? '0', miktar, g.eksiOnay === true);
    if (hedef === null) await rezerveyiAsmasin(db, a.malzemeId, null, null, binde(miktar));
    const ortak = { malzemeId: a.malzemeId, miktar, kisiId, partiId: a.partiId, partiSecimi: a.partiId === null ? null : 'en_eski' as const, kaynakKonumId: a.konumId, onayliEksi, aciklama: `Toplama ${t.no}` };
    const h = await sorgular.hareketYaz(db, hedef === null
      ? hareket({ ...ortak, tur: 'cikis', cikisNedeni: 'sevk' })
      : hareket({ ...ortak, tur: 'transfer', hedefKonumId: hedef.konumId }));
    await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: a.konumId, partiId: a.partiId, fark: -binde(miktar) });
    if (hedef !== null) await bakiyeDegistir(db, { malzemeId: a.malzemeId, konumId: hedef.konumId, partiId: a.partiId, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null });
    await sorgular.adimToplandi(db, adimId, h);
  });
  return toplamaAyrintisi(db, toplamaId);
}
// ST4 a: listeyi açan ya da `stok.toplama` işlemi olan başka biri kapatır (yetki uçta); kapatan kişi listede tutulur.
// Biten listede toplanan, bağlı isteklere dağıtılır ve karşılanan istek teslim olur (STK-H4); karşılanmayan istek listeden çıkar,
// açık kalır. İptal edilen listenin istekleri listeden çıkar.
export async function toplamaKapat(db: Db, kisiId: number, id: number, g: { surum: number; durum: 'bitti' | 'iptal' }): Promise<ToplamaAyrintiCevabi> {
  const t = await sorgular.toplamaBul(db, id, true);
  if (t) await toplamaKapsaminiDenetle(db, kisiId, id);
  if (t && t.durum !== 'topluyor') throw cakisma('Liste zaten kapalı.');
  await surumluGuncelle({ guncelle: () => sorgular.toplamaKapat(db, id, g.surum, g.durum, kisiId), varMi: () => sorgular.toplamaVarMi(db, id), bulunamadiIletisi: 'Toplama listesi bulunamadı.' });
  const acik = (await sorgular.toplamaIstekleri(db, id, true)).filter((i) => ISTEK_GECIS_KAYNAKLARI.teslim.includes(i.durum));
  if (g.durum === 'iptal') {
    for (const i of acik) await sorgular.toplamaIstekBaginiSil(db, i.id);
  } else if (acik.length > 0) {
    const toplanan = new Map<number, bigint>();
    for (const a of await sorgular.toplamaAdimlari(db, id)) if (a.toplanan !== null) toplanan.set(a.malzemeId, (toplanan.get(a.malzemeId) ?? 0n) + binde(a.toplanan));
    const karsilama = istekKarsilamalari(acik, new Map([...toplanan].map(([m, b]) => [m, bindenMetin(b)])));
    for (const i of acik) {
      const karsilanan = karsilama.get(i.id);
      if (karsilanan === undefined) { await sorgular.toplamaIstekBaginiSil(db, i.id); continue; }
      if (!(await sorgular.istekGecir(db, i.id, i.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.teslim, durum: 'teslim', karsilanan, kapatanKisiId: kisiId }))) throw cakisma(`${i.no} değişti; yenileyin.`);
      await kalaniAc(db, i, karsilanan);
    }
  }
  return toplamaAyrintisi(db, id);
}


// ---- Malzeme isteği: üretim (Arkon) açar, depo hazırlar ve teslim eder ------------------------------------------------------
// İsteği üretim yapan kişi açar (emri başlatan işlem); istasyon kişinin iş merkezi kapsamında olmalıdır. Aynı kaynak kimliği
// ikinci kez istek açmaz, ilk kaydı döner (çağıranın tekrar denemesi ve eşzamanlı iki çağrı tek istek bırakır).
export async function malzemeIstegiAc(db: Db, k: Kullanici, girdi: MalzemeIstegiAcGirdisi): Promise<{ id: number; no: string; durum: MalzemeIstegiDurumu }> {
  if (!islemVarMi(k, URETIM_ISLEMI)) throw yetkiYok();
  const c = malzemeIstegiAcGirdisi.safeParse(girdi);
  if (!c.success) throw dogrulama(c.error.issues[0]!.message, c.error.issues[0]!.path.join('.') || undefined);
  const g = c.data;
  const kapsam = await kisininKapsami(db, k.id, kisininIzinliIsMerkezleri);
  const onceki = (await sorgular.istekleriKaynaktan(db, [g.kaynakKimligi]))[0];
  if (onceki) {
    kapsamDisiysaReddet(kapsam, onceki.istasyonId === null ? null : (await istasyonGetir(db, onceki.istasyonId))?.isMerkeziId ?? null);
    return { id: onceki.id, no: onceki.no, durum: onceki.durum };
  }
  const o = await malzemeOzeti(db, g.malzemeId);
  if (!o) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (!stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoklanmaz; istek malzeme kartıyla açılır.`, 'malzemeId');
  if (!(await malzemeKullanilabilirMi(db, g.malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil.`);
  const istasyon = await istasyonGetir(db, g.istasyonId);
  if (!istasyon || !istasyon.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(kapsam, istasyon.isMerkeziId);
  if (g.uretimEmriId !== null) await istenebilirEmir(db, g.uretimEmriId);
  const durum = istekAcilisDurumu(await depodakiMiktar(db, g.malzemeId), g.miktar);
  const id = await sorgular.istekAc(db, { no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi: g.kaynakKimligi, malzemeId: g.malzemeId, miktar: g.miktar, istasyonId: g.istasyonId, uretimEmriId: g.uretimEmriId, aciklama: g.not ?? null, kisiId: k.id, durum });
  const i = id === null ? (await sorgular.istekleriKaynaktan(db, [g.kaynakKimligi]))[0]! : (await sorgular.istekBul(db, id))!;
  return { id: i.id, no: i.no, durum: i.durum };
}
export async function malzemeIstekleriniOku(db: Db, kaynakKimlikleri: string[]): Promise<Map<string, { id: number; no: string; durum: MalzemeIstegiDurumu; miktar: string; karsilanan: string | null; guncelleme: string }>> {
  if (kaynakKimlikleri.length === 0) return new Map();
  const satirlar = await sorgular.istekleriKaynaktan(db, [...new Set(kaynakKimlikleri)]);
  return new Map(satirlar.map((i) => [i.kaynakKimligi, { id: i.id, no: i.no, durum: i.durum, miktar: i.miktar, karsilanan: i.karsilanan, guncelleme: i.guncelleme }]));
}
export async function stokYokIstekleri(db: Db, sinir: number): Promise<{ id: number; no: string; malzemeId: number; miktar: string; birim: string | null; uretimEmriId: number | null; istasyonId: number | null; acilma: string; guncelleme: string }[]> {
  const satirlar = await sorgular.stokYokIstekleri(db, Math.min(Math.max(1, Math.trunc(sinir)), 500));
  const ozetler = await malzemeOzetleri(db, satirlar.map((i) => i.malzemeId));
  return satirlar.map(({ acilis, ...i }) => ({ ...i, birim: ozetler.get(i.malzemeId)?.birim ?? null, acilma: acilis }));
}
async function istekleriAdlandir(db: Db, satirlar: IstekHam[]): Promise<MalzemeIstegi[]> {
  const ad = await adlar(db, satirlar.map((i) => i.malzemeId));
  const yolda = new Map((await sorgular.yoldaTeslimleri(db, satirlar.map((i) => i.id))).map((t) => [t.istekId, { id: t.id, no: t.no }]));
  const istasyonlar = await istasyonAdlari(db, [...new Set(satirlar.flatMap((i) => [i.istasyonId, i.kaynakIstasyonId].filter((x): x is number => x !== null)))]);
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.flatMap((i) => (i.kapatanKisiId === null ? [i.kisiId] : [i.kisiId, i.kapatanKisiId])))]);
  return satirlar.map(({ kisiId, kapatanKisiId, toplamaDurumu, toplamaId, toplamaNo, ...i }) => ({
    ...i, malzemeAd: ad.get(i.malzemeId) ?? null, istasyonAd: i.istasyonId === null ? null : istasyonlar.get(i.istasyonId) ?? null,
    kaynakIstasyonAd: i.kaynakIstasyonId === null ? null : istasyonlar.get(i.kaynakIstasyonId) ?? null,
    kisiAd: kisiler.get(kisiId) ?? null, kapatanKisiAd: kapatanKisiId === null ? null : kisiler.get(kapatanKisiId) ?? null,
    ...(toplamaDurumu === 'topluyor' ? { toplamaId, toplamaNo } : { toplamaId: null, toplamaNo: null }),
    yoldaTeslim: yolda.get(i.id) ?? null,
  }));
}
export async function malzemeIstekleriListesi(db: Db, kisiId: number, s: MalzemeIstekleriListesi): Promise<SayfaliListe<MalzemeIstegi>> {
  const istasyonlar = await istasyonKapsamiIdleri(db, await kapsamOku(db, kisiId));
  const l = await sayfaliListe(s, { say: () => sorgular.istekSay(db, s.durum, istasyonlar), satirlar: (d) => sorgular.istekler(db, s.durum, s, d, istasyonlar) });
  return { ...l, satirlar: await istekleriAdlandir(db, l.satirlar) };
}
export async function malzemeIstegiGor(db: Db, kisiId: number, id: number): Promise<MalzemeIstegiCevabi> {
  await istasyonKapsaminiDenetle(db, kisiId, (await sorgular.istekBul(db, id))?.istasyonId ?? null);
  return malzemeIstegiOku(db, id);
}
export async function malzemeIstegiOku(db: Db, id: number): Promise<MalzemeIstegiCevabi> {
  const i = await sorgular.istekBul(db, id);
  if (!i) throw bulunamadi('Malzeme isteği bulunamadı.');
  return { istek: (await istekleriAdlandir(db, [i]))[0]! };
}
const ISTASYON_ISTEGI = 'Bu istek bir istasyondan istendi; o istasyon karşılar ya da reddeder.';
// Hazırlama istek açık kalır; teslim ve iptal kapatır. Teslim stok hareketi yazmaz: malzeme sepetle ya da çıkışla düşülür.
export async function malzemeIstegiGecir(db: Db, kisiId: number, id: number, gecis: IstekGecisi, g: { surum: number; karsilanan?: string }): Promise<MalzemeIstegiCevabi> {
  const i = await sorgular.istekBul(db, id, true);
  if (i) {
    await istasyonKapsaminiDenetle(db, kisiId, i.istasyonId);
    // Teslim alınınca kapanış (teslimiKapat) bu işlevden geçmez; buradaki geçişler depo işidir.
    if (i.kaynakIstasyonId !== null) throw cakisma(ISTASYON_ISTEGI);
    const engel = istekGecisEngeli(i.durum, gecis);
    if (engel) throw cakisma(engel);
    // Listedeki istek iptal edilmez: liste onu yine toplar ve taşır (kart #1410).
    const liste = gecis === 'iptal' ? istekListeEngeli(i) : null;
    if (liste) throw cakisma(liste);
  }
  const durum = ({ hazirla: 'hazirlaniyor', teslim: 'teslim', iptal: 'iptal' } as const)[gecis];
  await surumluGuncelle({
    guncelle: () => sorgular.istekGecir(db, id, g.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI[gecis], durum, karsilanan: gecis === 'teslim' ? g.karsilanan! : null, kapatanKisiId: gecis === 'hazirla' ? null : kisiId }),
    varMi: () => sorgular.istekVarMi(db, id),
    bulunamadiIletisi: 'Malzeme isteği bulunamadı.',
  });
  if (i && gecis === 'teslim') await kalaniAc(db, i, g.karsilanan!);
  return malzemeIstegiOku(db, id);
}
// Kısmi karşılanan isteğin kalanı aynı kişiye, istasyona ve emre yeni istekle açılır; kimliği kapanan isteğe bağlıdır, ikinci kez açılmaz.
const kalanKimligi = (i: IstekHam): string => `${i.kaynakKimligi.slice(0, 100)}~k${i.id}`;
async function kalaniAc(db: Db, i: IstekHam, karsilanan: string): Promise<void> {
  const miktar = istekKalani(i.miktar, karsilanan);
  if (miktar === null) return;
  await sorgular.istekAc(db, {
    no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi: kalanKimligi(i), malzemeId: i.malzemeId, miktar, istasyonId: i.istasyonId,
    uretimEmriId: i.uretimEmriId, aciklama: `${i.no} kalanı`, kisiId: i.kisiId, kaynakIstasyonId: i.kaynakIstasyonId,
    durum: i.kaynakIstasyonId !== null ? 'acik' : istekAcilisDurumu(await depodakiMiktar(db, i.malzemeId), miktar),
  });
}

// ---- Malzeme · Teslim: bütün sayfalardan istek ve iki adımlı teslim (kart #1208) ------------------------------------------------
// Depo isteği teslim eder. İstasyonsuz istekte malzeme kişinin istasyonuna taşınır (kart #1289, "İstasyonuna aktar"): istasyon
// verilmezse kişinin bulunduğu istasyon (STK-T7); o da bilinmiyorsa depo seçer. İstasyonlu istek teslim kaydıyla taşınır, burada yalnız kapanır.
export async function istekTeslimEt(db: Db, k: Kullanici, id: number, g: IstekTeslimGovdesi): Promise<MalzemeIstegiCevabi> {
  const i = await sorgular.istekBul(db, id, true);
  if (i) await istasyonKapsaminiDenetle(db, k.id, i.istasyonId);
  if (i?.kaynakIstasyonId != null) throw cakisma(ISTASYON_ISTEGI);
  const listede = i ? istekListeEngeli(i) : null;
  if (listede) throw cakisma(listede);
  if (i && i.istasyonId === null) {
    const engel = istekGecisEngeli(i.durum, 'teslim');
    if (engel) throw cakisma(engel);
    if (g.kaynakKonumId === undefined) throw dogrulama('Malzemenin verildiği konumu seçin.', 'kaynakKonumId');
    const kaynak = await aktifKonum(db, Number(g.kaynakKonumId), 'kaynakKonumId');
    if (kaynak.tur === 'istasyon') throw dogrulama('İstasyondan kişiye teslim, teslim et ile yapılır.', 'kaynakKonumId');
    let istasyonId = g.istasyonId === undefined || g.istasyonId === null ? null : Number(g.istasyonId);
    if (istasyonId === null) {
      const kapsamdakiler = await kapsamdakiIstasyonlar(db, await kapsamOku(db, i.kisiId));
      istasyonId = buradakiIstasyon(await acikIstasyon(db, i.kisiId), kapsamdakiler.map((x) => x.id));
    }
    if (istasyonId === null) throw dogrulama('Kişinin bulunduğu istasyon bilinmiyor; istasyonu seçin.', 'istasyonId');
    const hedef = await istasyonKonumuBul(db, istasyonId, 'istasyonId');
    const statuId = g.statuId === undefined || g.statuId === null ? null : Number(g.statuId);
    let partiId: number | null;
    if (g.partiId !== undefined) partiId = g.partiId === null ? null : Number(g.partiId);
    else {
      const p = partiSec(await sorgular.konumdakiPartiler(db, i.malzemeId, kaynak.id, statuId), undefined);
      if (p.tur === 'secim-gerekli') throw dogrulama('Bu konumda birden çok parti var; partiyi seçin.', 'partiId', { partiler: p.partiler });
      partiId = p.partiId;
    }
    const miktar = bindenMetin(binde(g.karsilanan));
    await korumali(async () => {
      await siraliKilitle(db, { malzemeId: i.malzemeId, konumId: kaynak.id, partiId, statuId }, { malzemeId: i.malzemeId, konumId: hedef, partiId, statuId });
      const b = await sorgular.bakiyeKilitle(db, i.malzemeId, kaynak.id, partiId, statuId);
      if (binde(b?.miktar ?? '0') < binde(miktar)) throw dogrulama(`Konumda yeterli stok yok (mevcut ${bindenMetin(binde(b?.miktar ?? '0'))}).`, 'karsilanan');
      if (i.uretimEmriId !== null) await rezerveyiAsmasin(db, i.malzemeId, statuId, i.uretimEmriId, binde(miktar));
      await emreKartiSagla(db, k.id, { uretimEmriId: i.uretimEmriId, partiId, malzemeId: i.malzemeId, miktar }, g.kartOnayi);
      await sorgular.hareketYaz(db, hareket({
        tur: 'transfer', malzemeId: i.malzemeId, miktar, kisiId: k.id, partiId, partiSecimi: partiId === null ? null : 'kisi', kaynakKonumId: kaynak.id, hedefKonumId: hedef,
        onayliEksi: false, uretimEmriId: i.uretimEmriId, kaynakStatuId: statuId, hedefStatuId: statuId,
        aciklama: [`İstek ${i.no}`, istenenFazlaNotu(i.miktar, miktar)].filter((x) => x !== null).join(' · '),
      }));
      await bakiyeDegistir(db, { malzemeId: i.malzemeId, konumId: kaynak.id, partiId, statuId, fark: -binde(miktar) });
      await bakiyeDegistir(db, { malzemeId: i.malzemeId, konumId: hedef, partiId, statuId, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null });
    });
  }
  return malzemeIstegiGecir(db, k.id, id, 'teslim', g);
}

// Biten ya da iptal edilen emre istek açılmaz (kart #1413): kapanınca açık istekleri de iptal olur.
async function istenebilirEmir(db: Db, uretimEmriId: number): Promise<void> {
  const e = await uretimEmriOzeti(db, uretimEmriId);
  if (e === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (e.durum === 'bitti' || e.durum === 'iptal') throw dogrulama(`Emir ${e.emirNo} ${e.durum === 'bitti' ? 'bitti' : 'iptal edildi'}; malzeme istenmez.`, 'uretimEmriId');
}
// Depo konumlarındaki (raf, kabul, zemin) serbest ve statülü toplam; istek açılış durumunun ölçüsüdür (STK-T1).
async function depodakiMiktar(db: Db, malzemeId: number): Promise<string> {
  return bindenMetin((await sorgular.istekStoklari(db, [malzemeId])).reduce((t, r) => t + binde(r.miktar), 0n));
}
const kapsamOku = (db: Db, kisiId: number): Promise<Kapsam> => kisininKapsami(db, kisiId, kisininIzinliIsMerkezleri);
// Liste süzgeci için kapsamdaki bütün istasyonlar (pasifler dahil); sınırsız kapsamda null (süzülmez). İstasyonu olmayan kayıt süzgeçte ayrıca geçer.
async function istasyonKapsamiIdleri(db: Db, kapsam: Kapsam): Promise<number[] | null> {
  if (kapsamSuzgeci(kapsam) === null) return null;
  return (await tumIstasyonlar(db, { pasiflerDahil: true })).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => i.id);
}
// Tekil kayıt ve komut: istasyonlu kaydın iş merkezi kişinin kapsamında olmalıdır; istasyonsuz kayıt geçer.
async function istasyonKapsaminiDenetle(db: Db, kisiId: number, istasyonId: number | null): Promise<void> {
  if (istasyonId === null) return;
  kapsamDisiysaReddet(await kapsamOku(db, kisiId), (await istasyonGetir(db, istasyonId))?.isMerkeziId ?? null);
}
// Kapsamdaki aktif istasyonlar; sınırsız kapsamda null (hepsi).
async function kapsamdakiIstasyonlar(db: Db, kapsam: Kapsam): Promise<{ id: number; kod: string; ad: string; isMerkeziId: number | null }[]> {
  return (await aktifIstasyonlar(db)).filter((i) => kapsamdaMi(kapsam, i.isMerkeziId)).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad, isMerkeziId: i.isMerkeziId }));
}
// İstasyonun stok konumu ilk kullanımda ana depoda açılır; adı istasyonun adıdır (harita ve istasyonlar aynı kaydı gösterir).
async function istasyonKonumuBul(db: Db, istasyonId: number, alan: string): Promise<number> {
  const varOlan = await sorgular.istasyonKonumu(db, istasyonId);
  if (varOlan !== null) return varOlan;
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', alan);
  const id = await sorgular.istasyonKonumuAc(db, { depoId: await anaDepo(db), kod: `IST-${istasyonId}`, ad: ist.ad.slice(0, 60), istasyonId });
  return id ?? (await sorgular.istasyonKonumu(db, istasyonId))!;
}
// Yer, istasyon ya da stok konumudur. Kaynak istasyonsa kişinin kapsamında olmalıdır; kaynak depo konumuysa depo işlemi gerekir.
async function yerCoz(db: Db, k: Kullanici, yer: TeslimYeri, alan: string, kaynakMi: boolean, kapsam: Kapsam): Promise<number> {
  if ('istasyonId' in yer) {
    const istasyonId = Number(yer.istasyonId);
    if (kaynakMi) {
      const ist = await istasyonGetir(db, istasyonId);
      if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', alan);
      kapsamDisiysaReddet(kapsam, ist.isMerkeziId);
    }
    return istasyonKonumuBul(db, istasyonId, alan);
  }
  const konumId = Number(yer.konumId);
  const konum = await aktifKonum(db, konumId, alan);
  // Okutulan istasyon etiketi konum kodu taşır: istasyon olarak çözülür, kapsam denetimi aynı yoldan geçer.
  if (konum.tur === 'istasyon') {
    const istasyonId = await sorgular.konumIstasyonu(db, konumId);
    if (istasyonId === null) throw dogrulama('İstasyon bulunamadı ya da pasif.', alan);
    return yerCoz(db, k, { istasyonId }, alan, kaynakMi, kapsam);
  }
  // Serbest ara alan fabrikadaki ortak bekleme yeridir: oradan almak depo işlemi istemez.
  if (kaynakMi && konum.tur !== 'ara_alan' && !islemVarMi(k, 'stok.transfer')) throw yetkiYok();
  return konumId;
}
// İstasyon konumunun saklı kodu (IST-<id>) yalnız konum tekilliği içindir; ekranda istasyonun kendi kodu görünür.
async function istasyonKodlari(db: Db, istasyonIdler: readonly (number | null)[]): Promise<Map<number, string>> {
  if (!istasyonIdler.some((i) => i !== null)) return new Map();
  return new Map((await tumIstasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, i.kod]));
}
async function toplamaHedefiGoster(db: Db, toplamaId: number) {
  const h = await sorgular.toplamaHedefi(db, toplamaId);
  if (h === null || h.istasyonId === null) return h;
  return { ...h, kod: (await istasyonKodlari(db, [h.istasyonId])).get(h.istasyonId) ?? h.kod };
}
async function teslimleriAdlandir(db: Db, satirlar: TeslimHam[]): Promise<Teslim[]> {
  const ad = await adlar(db, satirlar.map((t) => t.malzemeId));
  const sureDk = satirlar.some((t) => t.durum === 'yolda') ? await sistemAyariOku(db, 'stok.yolda-suresi-dk') : null;
  const uclar = new Map((await sorgular.teslimUclari(db, [...new Set(satirlar.flatMap((t) => [t.kaynakKonumId, t.hedefKonumId]))])).map((u) => [u.konumId, u]));
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.flatMap((t) => [t.gonderenKisiId, t.kapatanKisiId, t.aliciKisiId, t.itirazKisiId].filter((x): x is number => x !== null)))]);
  const istKodlari = await istasyonKodlari(db, [...uclar.values()].map((u) => u.istasyonId));
  const uc = (id: number) => { const u = uclar.get(id); return { konumId: id, kod: (u?.istasyonId == null ? undefined : istKodlari.get(u.istasyonId)) ?? u?.kod ?? '', ad: u?.ad ?? null, istasyonId: u?.istasyonId ?? null }; };
  return satirlar.map((t) => ({
    id: t.id, no: t.no, malzemeId: t.malzemeId, malzemeAd: ad.get(t.malzemeId) ?? null, miktar: t.miktar, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: t.kaliteDurumu,
    kaynak: uc(t.kaynakKonumId), hedef: uc(t.hedefKonumId), uretimEmriId: t.uretimEmriId, istekId: t.istekId, aciklama: t.aciklama, durum: t.durum,
    alinan: t.alinan, redNedeni: t.redNedeni, gonderenAd: kisiler.get(t.gonderenKisiId) ?? null,
    kapatanAd: t.kapatanKisiId === null ? null : kisiler.get(t.kapatanKisiId) ?? null, aliciAd: t.aliciKisiId === null ? null : kisiler.get(t.aliciKisiId) ?? null, gonderim: t.gonderim, kapanis: t.kapanis, surum: t.surum,
    okutarak: t.okutarak, itirazSonu: t.itirazSonu, sureSonu: t.durum === 'yolda' ? yoldaSureSonu(t.gonderim, sureDk) : null,
    itiraz: t.itirazNedeni === null || t.itirazZamani === null ? null
      : { neden: t.itirazNedeni, kisiAd: t.itirazKisiId === null ? null : kisiler.get(t.itirazKisiId) ?? null, zaman: t.itirazZamani, iadeTeslimId: t.iadeTeslimId },
  }));
}
async function teslimOku(db: Db, id: number): Promise<TeslimCevabi> {
  const t = await sorgular.teslimBul(db, id);
  if (!t) throw bulunamadi('Teslim bulunamadı.');
  return { teslim: (await teslimleriAdlandir(db, [t]))[0]! };
}
// Stoklanan, kullanılabilir kart; hizmet istenmez (satın alma talebiyle alınır).
async function istenebilirKart(db: Db, malzemeId: number) {
  const o = await malzemeOzeti(db, malzemeId);
  if (!o) throw dogrulama('Malzeme kartı bulunamadı.', 'malzemeId');
  if (!stoklanirMi(o.tur)) throw dogrulama(`${o.ad ?? o.kod}: hizmet stoktan istenmez; satın alma talebiyle alınır.`, 'malzemeId');
  if (!(await malzemeKullanilabilirMi(db, malzemeId))) throw gecersiz(`${o.ad ?? o.kod}: kart kullanılabilir değil.`);
  return o;
}

// Bütün sayfalardan istek: kaynak kimliği kişiye bağlanır (başkasının ya da Arkon'un kimliğiyle çakışmaz). İstasyonsuz istek
// isteyen kişiye teslim edilir; istasyon verilirse kişinin kapsamında olmalıdır.
export async function genelIstekAc(db: Db, k: Kullanici, g: IstekAcGovdesi): Promise<MalzemeIstegiCevabi> {
  const kaynakKimligi = `kisi:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = (await sorgular.istekleriKaynaktan(db, [kaynakKimligi]))[0];
  if (onceki) return malzemeIstegiOku(db, onceki.id);
  const malzemeId = Number(g.malzemeId);
  await istenebilirKart(db, malzemeId);
  const istasyonId = g.istasyonId === null ? null : Number(g.istasyonId);
  if (istasyonId !== null) {
    const ist = await istasyonGetir(db, istasyonId);
    if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
    kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  }
  const uretimEmriId = g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId);
  if (uretimEmriId !== null) await istenebilirEmir(db, uretimEmriId);
  // Soru 96 a: istasyondan istenen istek depo stoğuna bakmaz, açık açılır; o istasyonun yetkilisi karşılar. Kaynak istasyon kapsam dışı olabilir.
  const kaynakIstasyonId = g.kaynakIstasyonId === undefined || g.kaynakIstasyonId === null ? null : Number(g.kaynakIstasyonId);
  if (kaynakIstasyonId !== null) {
    const kaynak = await istasyonGetir(db, kaynakIstasyonId);
    if (!kaynak || !kaynak.aktif) throw dogrulama('Kaynak istasyon bulunamadı ya da pasif.', 'kaynakIstasyonId');
    const engel = istasyondanIstekEngeli(kaynakIstasyonId, istasyonId);
    if (engel) throw dogrulama(engel, istasyonId === null ? 'istasyonId' : 'kaynakIstasyonId');
  }
  const durum = kaynakIstasyonId !== null ? 'acik' : istekAcilisDurumu(await depodakiMiktar(db, malzemeId), g.miktar);
  const id = await sorgular.istekAc(db, {
    no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi, malzemeId, miktar: g.miktar, istasyonId, uretimEmriId,
    aciklama: g.not ?? null, kisiId: k.id, durum, kaynakIstasyonId,
  });
  return malzemeIstegiOku(db, id ?? (await sorgular.istekleriKaynaktan(db, [kaynakKimligi]))[0]!.id);
}

// Seçici: katalogdaki onaylı stoklanan kartlar, depo konumlarındaki serbest miktar ve statü kırılımıyla. Stoğu olmayan kart da listelenir.
export async function istekMalzemeleri(db: Db, ara: string | undefined): Promise<IstekMalzemeleriCevabi> {
  // Yalnız onaylı (aktif) kart: onaysız kart istenemez, seçicide de sunulmaz.
  const kartlar = (await malzemeAra(db, { metin: ara ?? '', turler: STOKLANIR_TURLER, yalnizAktif: true, sayfa: 1, sayfaBoyu: 30 })).satirlar;
  const stok = await sorgular.istekStoklari(db, kartlar.map((m) => m.id));
  return {
    malzemeler: kartlar.map((m) => {
      const satirlar = stok.filter((r) => r.malzemeId === m.id);
      return {
        id: m.id, kod: m.kod, ad: m.ad, birim: m.birim,
        kullanilabilir: satirlar.find((r) => r.statuId === null)?.miktar ?? '0',
        statuler: satirlar.flatMap((r) => (r.statuId === null ? [] : [{ statuId: r.statuId, miktar: r.miktar }])),
      };
    }),
  };
}

async function teslimHaritasi(db: Db): Promise<TeslimKutusuCevabi['harita']> {
  const depoId = await anaDepo(db);
  const y = await sorgular.yerlesim(db, depoId);
  if (!y) return null;
  return {
    bina: { x0: say(y.bina_x0), x1: say(y.bina_x1), z0: say(y.bina_z0), z1: say(y.bina_z1) }, kareBoyu: say(y.kare_boyu),
  };
}
async function teslimZemini(db: Db, konumIdleri: ReadonlySet<number>): Promise<TeslimKutusuCevabi['zemin']> {
  const { z, konumKaresi } = await zeminDurumu(db);
  if (z.bolumler.length === 0) return null;
  return {
    bolumler: z.bolumler.map(({ salonId, kod, sutunlar, satirlar }) => ({ salonId, kod, sutunlar, satirlar })),
    istasyonlar: z.bolumler.flatMap((b) => b.nesneler.flatMap((n) => (n.tur === 'istasyon' ? [{ istasyonId: n.id, salonId: b.salonId, hucre: n.hucre }] : []))),
    konumlar: [...konumKaresi].flatMap(([konumId, y]) => (konumIdleri.has(konumId) ? [{ konumId, salonId: y.salonId, hucre: y.hucre }] : [])),
  };
}
// Kendi gönderdiğim gelen sayılmaz; başka kişiye yazılan teslim (STK-T8) o kişinindir.
// Soru 133: kişiye teslim istasyona teslimdir; alıcı adı yalnız bilgi, istasyondaki herkes görür (kapsamı çağıran süzer).
const banaGelen = (t: TeslimHam, kisiId: number): boolean => t.gonderenKisiId !== kisiId;
export async function teslimKutusu(db: Db, k: Kullanici): Promise<TeslimKutusuCevabi> {
  const kapsam = await kapsamOku(db, k.id);
  const istasyonlar = await kapsamdakiIstasyonlar(db, kapsam);
  // Kapsamı sınırsız kişi bütün istasyonlara geleni görür (iş merkezi olmayan istasyon dahil).
  const sinirsiz = kapsamSuzgeci(kapsam) === null;
  const gelen = await sorgular.yoldakiGelenler(db, sinirsiz ? null : istasyonlar.map((i) => i.id), islemVarMi(k, 'stok.transfer'));
  const depoKonumlari = await sorgular.teslimDepoKonumlari(db);
  const araAlanlar = await sorgular.teslimAraAlanlari(db);
  return {
    gelenler: await teslimleriAdlandir(db, gelen.filter((t) => banaGelen(t, k.id))),
    gonderdiklerim: await teslimleriAdlandir(db, await sorgular.gonderdiklerim(db, k.id)),
    isteklerim: await istekleriAdlandir(db, await sorgular.isteklerim(db, k.id)),
    bendenIstenenler: await istekleriAdlandir(db, await sorgular.istasyondanIstenenler(db, sinirsiz ? null : istasyonlar.map((i) => i.id))),
    okutarakAlinanlar: await teslimleriAdlandir(db, await sorgular.okutarakAlinanlar(db, sinirsiz ? null : istasyonlar.map((i) => i.id), k.id)),
    istasyonlar: istasyonlar.map(({ id, kod, ad }) => ({ id, kod, ad })),
    hedefIstasyonlar: (await aktifIstasyonlar(db)).map((i) => ({ id: i.id, kod: i.kod, ad: i.ad })),
    depoKonumlari,
    araAlanlar,
    buradakiIstasyonId: buradakiIstasyon(await acikIstasyon(db, k.id), istasyonlar.map((i) => i.id)),
    harita: await teslimHaritasi(db),
    zemin: await teslimZemini(db, new Set([...depoKonumlari, ...araAlanlar].map((x) => x.id))),
  };
}
// Yoldaki teslim kaynağında ayrılmıştır (kart #1410): konumdaki satırlar serbest miktarla verilir, yoldaki ayrıca yazılır.
async function konumdakiSerbest(db: Db, konumId: number): Promise<(BakiyeHam & { yolda: string })[]> {
  const yolda = await sorgular.konumdakiYoldaAyrilanlar(db, konumId);
  return (await sorgular.konumBakiyeleri(db, konumId)).flatMap((x) => {
    const y = binde(yolda.find((t) => t.malzemeId === x.malzemeId && t.partiId === x.partiId && t.statuId === x.statuId && t.kaliteDurumu === x.kaliteDurumu)?.miktar ?? '0');
    const serbest = binde(x.miktar) - y;
    return binde(x.miktar) > 0n ? [{ ...x, miktar: ucHane(serbest > 0n ? serbest : 0n), yolda: ucHane(y) }] : [];
  });
}
// Bakiye numeric(14,3) metni gibi üç haneli yazılır: serbest ve yolda bakiye satırıyla aynı biçimde döner.
function ucHane(b: bigint): string {
  const [tam, kesir = ''] = bindenMetin(b).split('.');
  return `${tam}.${kesir.padEnd(3, '0')}`;
}
// Kaynak satırı kilitlenir: eşzamanlı iki gönderim aynı serbest miktarı ikisi birden ayıramaz.
async function serbestDenetle(
  db: Db, malzemeId: number, konumId: number, partiId: number | null, statuId: number | null, miktar: string, eylem: string, kalite: KaliteDurumu = 'serbest',
): Promise<void> {
  const b = await sorgular.bakiyeKilitle(db, malzemeId, konumId, partiId, statuId, kalite);
  const engel = serbestMiktarEngeli(b?.miktar ?? '0', await sorgular.yoldaAyrilan(db, malzemeId, konumId, partiId, statuId, kalite), miktar, eylem);
  if (engel) throw dogrulama(engel, 'miktar');
}
// Gönderilecek yerdeki stok: istasyon kişinin kapsamında olmalı, depo konumu depo işlemi ister (gönderimle aynı kural).
export async function yerdekiStok(db: Db, k: Kullanici, yer: TeslimYeri): Promise<YerdekiStokCevabi> {
  let konumId: number | null;
  if ('istasyonId' in yer) {
    const ist = await istasyonGetir(db, Number(yer.istasyonId));
    if (!ist) throw bulunamadi('İstasyon bulunamadı.');
    kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
    konumId = await sorgular.istasyonKonumu(db, ist.id);
  } else {
    konumId = Number(yer.konumId);
    if ((await sorgular.konumBul(db, konumId))?.tur !== 'ara_alan' && !islemVarMi(k, 'stok.transfer')) throw yetkiYok();
  }
  if (konumId === null) return { satirlar: [] };
  const b = await konumdakiSerbest(db, konumId);
  const kartlar = await malzemeOzetleri(db, [...new Set(b.map((x) => x.malzemeId))]);
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  return {
    satirlar: b.filter((x) => binde(x.miktar) > 0n).map((x) => {
      const m = kartlar.get(x.malzemeId);
      return { malzemeId: x.malzemeId, kod: m?.kod ?? null, ad: m?.ad ?? null, partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId,
        kaliteDurumu: x.kaliteDurumu, miktar: x.miktar };
    }),
  };
}
// Kişi kodu anahtarı süreç başına üretilir ve hiçbir yere yazılmaz: kod kısa ömürlüdür, sunucu yeniden başlayınca ekran yeni kodu alır.
const KISI_KODU_ANAHTARI = randomBytes(32);
const kisiKoduImzasi = (govde: string): string => createHmac('sha256', KISI_KODU_ANAHTARI).update(govde).digest('hex').slice(0, 32);
export function kisiKodu(k: Kullanici, simdiMs = Date.now()): KisiKoduCevabi {
  const sonSn = Math.floor(simdiMs / 1000) + KISI_KODU_SURESI_SN;
  const govde = kisiKoduGovdesi(k.id, sonSn);
  return { kod: `${govde}-${kisiKoduImzasi(govde)}`, gecerlilikSonu: new Date(sonSn * 1000).toISOString() };
}
// Kişi kodu değilse null; kişi koduysa imza ve süre doğrulanır, kişinin bulunduğu istasyon (STK-T7) bulunur.
async function kisiKoduCoz(db: Db, ham: string, alan = 'kod'): Promise<{ kisiId: number; ad: string | null; istasyon: { id: number; kod: string; ad: string } } | null> {
  const p = kisiKoduAyristir(ham);
  if (!p) return null;
  const beklenen = Buffer.from(kisiKoduImzasi(p.govde)), gelen = Buffer.from(p.imza);
  const engel = kisiKoduEngeli(p.sonSn, Math.floor(Date.now() / 1000), gelen.length === beklenen.length && timingSafeEqual(gelen, beklenen));
  if (engel) throw dogrulama(engel, alan);
  const ad = (await kisiAdlari(db, [p.kisiId])).get(p.kisiId) ?? null;
  const istasyonlar = await kapsamdakiIstasyonlar(db, await kapsamOku(db, p.kisiId));
  const buradaki = buradakiIstasyon(await acikIstasyon(db, p.kisiId), istasyonlar.map((i) => i.id));
  const ist = istasyonlar.find((i) => i.id === buradaki);
  if (!ist) throw dogrulama(`${ad ?? 'Kişi'} şu an bir istasyonda görünmüyor; teslim yerinin etiketini okutun.`, alan);
  return { kisiId: p.kisiId, ad, istasyon: { id: ist.id, kod: ist.kod, ad: ist.ad } };
}
// QR Okut paneli (karar 91 a): alınabilir yer teslim gönderimiyle aynı kuraldır (yerCoz): kapsamdaki istasyon, serbest ara alan; depo
// işlemi olana her konum. Pasif ya da bilinmeyen kod "bilinmiyor" döner.
export async function okutCoz(db: Db, k: Kullanici, ham: string): Promise<OkutCozCevabi> {
  const kisi = await kisiKoduCoz(db, ham);
  if (kisi) return { tur: 'kisi', kod: ham.trim(), kisi: { id: kisi.kisiId, ad: kisi.ad }, istasyon: kisi.istasyon };
  const kapsam = await kapsamOku(db, k.id);
  const istasyonlar = new Set((await kapsamdakiIstasyonlar(db, kapsam)).map((i) => i.id));
  const depocu = islemVarMi(k, 'stok.transfer');
  const yerOku = async (konumIdler: number[]): Promise<Map<number, OkutYeri>> => {
    const uclar = await sorgular.teslimUclari(db, [...new Set(konumIdler)]);
    const kodlar = await istasyonKodlari(db, uclar.map((u) => u.istasyonId));
    return new Map(uclar.filter((u) => u.aktif).map((u) => [u.konumId, {
      konumId: u.konumId, kod: (u.istasyonId === null ? undefined : kodlar.get(u.istasyonId)) ?? u.kod, ad: u.ad, tur: u.tur, istasyonId: u.istasyonId,
    }]));
  };
  const alinir = (y: OkutYeri): boolean => (y.tur === 'istasyon' ? y.istasyonId !== null && istasyonlar.has(y.istasyonId) : depocu || y.tur === 'ara_alan');
  const yerCevabi = async (kod: string): Promise<OkutCozCevabi | null> => {
    const satir = await sorgular.konumKoduyla(db, kod);
    const yer = satir === null ? undefined : (await yerOku([satir.id])).get(satir.id);
    if (yer === undefined) return null;
    if (!alinir(yer)) return { tur: 'yer', yer, satirlar: null };
    return { tur: 'yer', yer, satirlar: (await yerdekiStok(db, k, yer.istasyonId === null ? { konumId: yer.konumId } : { istasyonId: yer.istasyonId })).satirlar };
  };
  // Serbest miktar okutulan bakiyelerden tek seferde çıkar: yerler ve yoldaki ayrılanlar topluca okunur, yer başına sorgu atılmaz.
  const malzemeCevabi = async (malzemeId: number, parti: { id: number; etiket: string; uretimEmriId: number | null } | null, bakiyeler: BakiyeHam[]): Promise<OkutCozCevabi | null> => {
    const o = await malzemeOzeti(db, malzemeId);
    if (!o) return null;
    const dolu = bakiyeler.filter((b) => b.malzemeId === malzemeId && (parti === null || b.partiId === parti.id) && binde(b.miktar) > 0n);
    const yerHaritasi = await yerOku(dolu.map((b) => b.konumId));
    const alinanlar = dolu.filter((b) => { const y = yerHaritasi.get(b.konumId); return y !== undefined && alinir(y); });
    const yolda = await sorgular.konumlardakiYoldaAyrilanlar(db, malzemeId, [...new Set(alinanlar.map((b) => b.konumId))]);
    const nolar = await emirNoHaritasi(db, alinanlar.map((b) => b.uretimEmriId));
    const yerler: Extract<OkutCozCevabi, { tur: 'malzeme' }>['yerler'] = [];
    for (const konumId of new Set(alinanlar.map((b) => b.konumId))) {
      const yer = yerHaritasi.get(konumId)!;
      for (const x of alinanlar.filter((b) => b.konumId === konumId)) {
        const y = binde(yolda.find((t) => t.konumId === konumId && t.partiId === x.partiId && t.statuId === x.statuId && t.kaliteDurumu === x.kaliteDurumu)?.miktar ?? '0');
        const serbest = binde(x.miktar) - y;
        if (serbest <= 0n) continue;
        yerler.push({ ...yer, partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId, kaliteDurumu: x.kaliteDurumu, miktar: ucHane(serbest) });
      }
    }
    return { tur: 'malzeme', malzeme: { id: o.id, kod: o.kod, ad: o.ad, birim: o.birim, tur: o.tur }, parti, yerler, digerIstasyonlar: await digerIstasyonlar(malzemeId, parti) };
  };
  // Soru 93 a: kapsam dışı istasyonlardaki serbest miktar yalnız gösterilir; teslim akışına girmez (Malzeme iste ile alınır).
  const digerIstasyonlar = async (malzemeId: number, parti: { id: number } | null) =>
    (await malzemeninIstasyonlari(db, malzemeId, parti?.id)).filter((x) => !istasyonlar.has(x.istasyonId))
      .map(({ istasyonId, kod, ad, miktar }) => ({ istasyonId, kod, ad, miktar }));
  // Çözüm sırası Okut sayfasındaki kodCoz ile aynıdır: önekli kod, sonra öneksiz konum kodu, en son düz kart no.
  const t = kodTuru(ham);
  let bulunan: OkutCozCevabi | null = null;
  if (t.tur === 'konum') bulunan = await yerCevabi(t.deger);
  else if (t.tur === 'malzeme') bulunan = await malzemeCevabi(Number(t.deger), null, await sorgular.malzemeBakiyeleri(db, Number(t.deger)));
  else if (t.tur === 'lot') {
    const p = await sorgular.lotNoylaParti(db, t.deger);
    const nolar = p === null ? new Map() : await emirNoHaritasi(db, [p.uretimEmriId]);
    if (p) await kartaBagliLotuReddet(db, k, p.id);
    if (p) bulunan = await malzemeCevabi(p.malzemeId, { id: p.id, etiket: partiEtiketi(p, emirNoDe(nolar, p.uretimEmriId)) ?? p.lotNo, uretimEmriId: p.uretimEmriId }, await sorgular.lotBakiyeleri(db, p.id));
  } else if (t.tur === 'refakat-partisi') {
    // Refakat kartı (kart #123): veren için lotun alabileceği yerleri, alan için kendisine o kartla yoldaki teslimleri taşır (Soru 118 a).
    // Lot bekleyen (istisna) kartın lotu yok: okutma ekranı onu Dal 8'de gösterir; burada kod tanınmaz.
    // Soru 128: kartın satırları her okutana gelir; istisna kartı (lotsuz) da okutulur, alınacak yeri yoktur.
    const r = await sorgular.etkinRefakatPartisiBul(db, Number(t.deger));
    const lotId = r?.partiId ?? null;
    const refakat = r === null ? undefined : (await refakatPartileriCevir(db, [r]))[0];
    const m = !r || !refakat ? null : lotId === null
      ? await malzemeCevabi(r.malzemeId, null, [])
      : await malzemeCevabi(r.malzemeId, { id: lotId, etiket: refakat.etiket, uretimEmriId: null }, await sorgular.lotBakiyeleri(db, lotId));
    if (r && refakat && m?.tur === 'malzeme') {
      const gelenler: TeslimHam[] = [];
      if (lotId !== null) for (const x of await sorgular.refakatYoldakiTeslimleri(db, r.uretimEmriId, lotId)) if (banaGelen(x, k.id) && await teslimAlabilir(db, k, x)) gelenler.push(x);
      const kartSatirlari = await refakatKartSatirlari(db, r.id);
      const anaEylem = refakatAnaEylemi({ gelenSayisi: gelenler.length, kartAcik: refakat.durum === 'acik', satirIstasyonlari: kartSatirlari.map((x) => x.istasyonId), kapsamdakiIstasyonlar: istasyonlar });
      bulunan = { ...m, ...(lotId === null ? { parti: null, digerIstasyonlar: [] } : {}), refakat, gelenler: await teslimleriAdlandir(db, gelenler), kartSatirlari, anaEylem };
    }
  } else if (t.tur === 'raf') {
    const raf = await sorgular.rafKoduyla(db, t.deger);
    if (raf) {
      const gozler = await sorgular.rafinGozleri(db, raf.id);
      const yerler = await yerOku(gozler.map((g) => g.konumId));
      const icerikli: Extract<OkutCozCevabi, { tur: 'raf' }>['gozler'] = [];
      for (const y of gozler.flatMap((g) => yerler.get(g.konumId) ?? [])) {
        icerikli.push({ ...y, satirlar: alinir(y) ? (await yerdekiStok(db, k, { konumId: y.konumId })).satirlar : null });
      }
      bulunan = { tur: 'raf', raf, gozler: icerikli };
    }
  } else if (t.tur === 'uretim-emri' && t.bicim === 'kimlik') {
    return { tur: 'eski-kart', kod: ham.trim(), uretimEmriId: Number(t.deger) };
  }
  // 1338 a, 1342 a: okutulan yerde başkasının sepetindeki miktar etiket olarak gelir; stok ayrılmaz.
  const sepetler = async (c: OkutCozCevabi): Promise<OkutCozCevabi> => {
    const konumlar = c.tur === 'yer' ? [c.yer.konumId] : c.tur === 'malzeme' ? c.yerler.map((y) => y.konumId) : c.tur === 'raf' ? c.gozler.map((g) => g.konumId) : [];
    const satirlar = await sorgular.baskaSepetlerdekiler(db, [...new Set(konumlar)], k.id);
    if (satirlar.length === 0) return c;
    const adlar = await kisiAdlari(db, [...new Set(satirlar.map((x) => x.kisiId))]);
    const baskaSepetler = satirlar.filter((x) => c.tur !== 'malzeme' || x.malzemeId === c.malzeme.id)
      .map(({ kisiId, ...x }) => ({ ...x, kisiAd: adlar.get(kisiId) ?? null }));
    return baskaSepetler.length === 0 ? c : { ...c, baskaSepetler } as OkutCozCevabi;
  };
  const stokluCevap = async (c: OkutCozCevabi): Promise<OkutCozCevabi> =>
    sepetler((c.tur === 'malzeme' || c.tur === 'yer') && stokOkurMu(k) ? { ...c, stok: await kodCoz(db, ham) } : c);
  if (bulunan) return stokluCevap(bulunan);
  const kod = ham.trim().toUpperCase();
  const yer = await yerCevabi(kod.replace(/^LOC[:\s-]*/, ''));
  if (yer) return stokluCevap(yer);
  const no = /^(?:MLZ[:\s-]*)?(\d{1,9})$/.exec(kod)?.[1] ?? await katalogEtiketiKartNo(db, ham);
  const m = no === undefined || no === null ? null : await malzemeCevabi(Number(no), null, await sorgular.malzemeBakiyeleri(db, Number(no)));
  return m ? stokluCevap(m) : { tur: 'bilinmiyor', kod: ham.trim() };
}
// Stok okuması (sayfa ya da herhangi bir stok işlemi): okutma cevabına gözler ve toplam eklenir; panel ayrıca istek atmaz.
const stokOkurMu = (k: Kullanici): boolean => islemVarMi(k, 'sayfa.stok') || STOK_ISLEMLERI.some((i) => islemVarMi(k, i));
// İstasyon sepeti (kart #1353): istasyonun stoğu kapsamdaki herkese açıktır. Getiren, satıra son giren hareketin kişisidir (teslim,
// üretim sayımı ya da statü dönüşümü). Sonraki istasyon emrin iş emirlerinden okunur; adımın statüsünü Reçete ve Rota çözer.
export async function istasyonSepeti(db: Db, k: Kullanici, istasyonId: number): Promise<IstasyonSepetiCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  return sepetiOku(db, ist);
}
async function sepetiOku(db: Db, ist: { id: number; kod: string; ad: string }): Promise<IstasyonSepetiCevabi> {
  const konumId = await sorgular.istasyonKonumu(db, ist.id);
  const istasyon = { id: ist.id, kod: ist.kod, ad: ist.ad };
  const emirler = await istasyonEmirleri(db, ist.id);
  if (konumId === null) return { istasyon, emirler, satirlar: [] };
  const b = await konumdakiSerbest(db, konumId);
  const kartlar = await malzemeOzetleri(db, [...new Set(b.map((x) => x.malzemeId))]);
  const girisler = await sorgular.konumaSonGirisler(db, konumId);
  const giris = (x: BakiyeHam) => girisler.find((g) => g.malzemeId === x.malzemeId && g.partiId === x.partiId && g.statuId === x.statuId);
  const kisiler = await kisiAdlari(db, [...new Set(girisler.map((g) => g.kisiId))]);
  const adimlar = new Map<number, SepetAdimi[]>();
  const adlar = new Map<number, { kod: string | null; ad: string }>();
  const nolar = await emirNoHaritasi(db, b.map((x) => x.uretimEmriId));
  for (const emirId of new Set(b.flatMap((x) => (x.uretimEmriId === null ? [] : [x.uretimEmriId])))) {
    const e = await adimliEmirAyrintisi(db, emirId).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
    if (!e || e.urun.id === null) continue;
    const malzemeNo = e.urun.id;
    for (const i of e.isEmirleri) if (i.istasyon) adlar.set(i.istasyon.id, i.istasyon);
    const rota: SepetAdimi[] = [];
    for (const i of e.isEmirleri) {
      rota.push({ sira: i.sira, opNo: i.opNo, istasyonId: i.istasyon?.id ?? null, statuId: adimStatusu === null ? null : await adimStatusu(db, { malzemeNo, opNo: i.opNo, uretimEmriId: emirId }) });
    }
    adimlar.set(emirId, rota);
  }
  return {
    istasyon, emirler,
    satirlar: b.map((x) => {
      const m = kartlar.get(x.malzemeId);
      const g = giris(x);
      const rota = x.uretimEmriId === null ? undefined : adimlar.get(x.uretimEmriId);
      const s = rota === undefined ? { yok: 'rota-disi' as const } : sonrakiIstasyon(rota, ist.id, x.statuId);
      const ad = 'yok' in s ? undefined : adlar.get(s.istasyonId);
      return {
        malzemeId: x.malzemeId, kod: m?.kod ?? null, ad: m?.ad ?? null, partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId,
        miktar: x.miktar, yolda: x.yolda, uretimEmriId: x.uretimEmriId, getiren: g === undefined ? null : kisiler.get(g.kisiId) ?? null, gelis: g?.zaman ?? null, koken: g?.koken ?? null,
        sonraki: 'yok' in s ? null : { istasyonId: s.istasyonId, kod: ad?.kod ?? null, ad: ad?.ad ?? `#${s.istasyonId}`, opNo: s.opNo },
        sonrakiYok: 'yok' in s ? s.yok : null,
      };
    }),
  };
}
async function istasyonEmirleri(db: Db, istasyonId: number): Promise<{ id: number; emirNo: string }[]> {
  return (await emirDilimi(db))
    .filter((e) => e.durum !== 'bitti' && e.durum !== 'iptal' && e.durum !== 'taslak' && e.isEmirleri.some((i) => i.istasyonId === istasyonId && i.durum !== 'tamam'))
    .map((e) => ({ id: e.id, emirNo: e.emirNo }));
}
// Teslim edilmeyen parça (kart #1289): kullanacak istasyon, emirlerinin rotasındaki öteki istasyonların sepetinde sonraki adımı
// kendisi olan satırları görür. Kaynak istasyon çekenin kapsamında olmak zorunda değildir; parça zaten ona gidecektir.
export async function gelecekSepet(db: Db, k: Kullanici, istasyonId: number): Promise<GelecekSepetCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const kaynaklar = new Set<number>();
  for (const e of await istasyonEmirleri(db, ist.id)) {
    const a = await adimliEmirAyrintisi(db, e.id).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
    for (const i of a?.isEmirleri ?? []) if (i.istasyon && i.istasyon.id !== ist.id) kaynaklar.add(i.istasyon.id);
  }
  const satirlar: GelecekSepetCevabi['satirlar'] = [];
  for (const kaynakId of kaynaklar) {
    const kaynak = await istasyonGetir(db, kaynakId);
    if (!kaynak) continue;
    const sepet = await sepetiOku(db, kaynak);
    for (const x of sepet.satirlar) if (x.sonraki?.istasyonId === ist.id && binde(x.miktar) > 0n) satirlar.push({ ...x, kaynak: sepet.istasyon });
  }
  return { satirlar };
}
// İki sepet (745): emre süzülmüş gelecek sepet ve yoldaki teslimler gelendir, istasyonun kendi sepeti çıkandır. Düğmeler var olan
// uçlardır (sepetten çek, teslim al, teslim gönder); bu okuma yeni işlem açmaz.
export async function istasyonSepetleri(db: Db, k: Kullanici, istasyonId: number, uretimEmriId: number): Promise<IstasyonSepetleriCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const bekleyen = (await gelecekSepet(db, k, istasyonId)).satirlar.filter((x) => x.uretimEmriId === uretimEmriId);
  const yolda = (await sorgular.yoldakiGelenler(db, [istasyonId], false)).filter((t) => t.uretimEmriId === uretimEmriId);
  const sepet = await sepetiOku(db, ist);
  return { istasyon: sepet.istasyon, gelen: { bekleyen, yolda: await teslimleriAdlandir(db, yolda) }, cikan: sepet.satirlar.filter((x) => x.uretimEmriId === uretimEmriId) };
}
// Teslim al ile çekme: çeken hem gönderen hem alan olur; teslim açılır ve aynı anda kapanır (kayıt ve hareket teslim etle aynıdır).
export async function sepettenCek(db: Db, k: Kullanici, g: SepettenCekGovdesi): Promise<TeslimCevabi> {
  const kaynakKimligi = `cek:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const istasyonId = Number(g.istasyonId);
  const kaynakIstasyonId = Number(g.kaynakIstasyonId);
  const partiId = g.partiId === null ? null : Number(g.partiId);
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const x = (await gelecekSepet(db, k, istasyonId)).satirlar.find((s) => s.kaynak.id === kaynakIstasyonId && s.malzemeId === Number(g.malzemeId)
    && s.partiId === partiId && s.statuId === statuId);
  if (!x) throw dogrulama('Bu parça önceki istasyonun sepetinde yok ya da sonraki adımı bu istasyon değil.', 'malzemeId');
  if (binde(g.miktar) > binde(x.miktar)) throw dogrulama(`Sepette ${bindenMetin(binde(x.miktar))} var; fazlası çekilemez.`, 'miktar');
  const kaynak = await istasyonKonumuBul(db, kaynakIstasyonId, 'kaynakIstasyonId');
  const hedef = await istasyonKonumuBul(db, istasyonId, 'istasyonId');
  const miktar = bindenMetin(binde(g.miktar));
  const id = await korumali(async () => {
    await serbestDenetle(db, x.malzemeId, kaynak, partiId, statuId, miktar, 'çekilemez');
    if (x.uretimEmriId !== null) await rezerveyiAsmasin(db, x.malzemeId, statuId, x.uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: x.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak, hedefKonumId: hedef,
      uretimEmriId: x.uretimEmriId, istekId: null, aciklama: `Önceki istasyonun sepetinden çekildi · ${x.kaynak.ad}`.slice(0, 200), gonderenKisiId: k.id,
    });
  });
  if (id === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  const t = (await sorgular.teslimBul(db, id, true))!;
  await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  return teslimOku(db, id);
}
// ---- Üretime hazırlık (kart #1289) ------------------------------------------------------------------------------------------------
// Adımın girdileri istasyonda serbest (statüsüz, yoldaki teslime ayrılmamış) miktarla karşılaştırılır; bir adetlik yoksa eksiktir.
async function baslatmaGirdiEksikleri(db: Db, uretimEmriId: number, isEmriId: number, istasyonId: number, adet: number): Promise<BaslatmaEksigi[]> {
  const bilgi = await adimBilgisi(db, isEmriId);
  if (bilgi === null || bilgi.girdiler.length === 0) return [];
  // Hizmet stoklanmaz: istasyona gelmesi beklenmez.
  const kartlar = await malzemeOzetleri(db, [...new Set(bilgi.girdiler.map((g) => g.malzemeNo))]);
  const girdiler = bilgi.girdiler.filter((g) => stoklanirMi(kartlar.get(g.malzemeNo)?.tur ?? ''));
  const konumId = await sorgular.istasyonKonumu(db, istasyonId);
  const istasyonda = new Map<number, bigint>();
  for (const m of new Set(girdiler.map((g) => g.malzemeNo))) {
    const satirlar = konumId === null ? [] : (await sorgular.uretimGirdiKaynaklari(db, m, null, konumId, uretimEmriId)).filter((k) => k.konumId === konumId);
    istasyonda.set(m, satirlar.reduce((t, k) => t + binde(k.serbest), 0n));
  }
  // Çok katmanlı emirde alt düğümün girdisi alt parça başınadır: emrin bütün adedi kök başına adetle çarpılır (1476-C). Dal çarpanı
  // malzemeyi çarpmaz (1333 a): tek katmanlı emirde ve kökte emir adedi.
  const carpan = Number((await emirDugumleri(db, uretimEmriId)).get(bilgi.opNo)?.birimCarpani ?? 1);
  return baslatmaEksikleri(girdiler, istasyonda, BigInt(Math.round(adet * carpan * 1000)));
}

// Terminal başlatmadan önce sorar: her eksik girdi için istasyona malzeme isteği bir kez açılır (aynı adım ve malzeme ikinci istek açmaz,
// kapanmış istek yeniden açılmaz). İsteği depo karşılar, istasyon teslim alınca başlatılır.
export async function uretimHazirligi(db: Db, k: Kullanici, g: UretimHazirligiGovdesi): Promise<UretimHazirligiCevabi> {
  const istasyonId = Number(g.istasyonId);
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist || !ist.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const emir = await uretimEmriOzeti(db, Number(g.uretimEmriId));
  if (!emir) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (emir.siradakiIsEmriId === null) return { hazir: true, eksikler: [] };
  // Sıradaki adım bu istasyonun değilse (önceki adım bitmedi) o adımın girdisi burada aranmaz, buraya istek açılmaz;
  // başlatmayı sıra kuralı reddeder ve operatör tek ileti görür (622).
  if ((await isEmriOzeti(db, emir.siradakiIsEmriId))?.istasyonId !== istasyonId) return { hazir: true, eksikler: [] };
  const sonuc = await eksikIstekleriAc(db, k.id, emir, emir.siradakiIsEmriId, istasyonId, 'Üretime başlarken istasyonda yok');
  const eksikler = [...sonuc, ...await tasinanEksikleri(db, emir, emir.siradakiIsEmriId, istasyonId)];
  return { hazir: eksikler.length === 0, eksikler };
}
// Önceki adımın parçası (745, 2 b) bu adıma statüsüyle gelir ve sayımda yalnız bu istasyondan düşülür. Hazırlık ve Teslim al onu öteki
// girdiler gibi gösterir; depodan istenmez, bulunduğu istasyondan teslimle alınır. İlk adımda, taşınan stoklanmıyorsa ya da adımın
// kendi girdisiyle aynı kartsa yoktur (o kart girdi satırında zaten görünür).
interface TasinanGirdi { malzemeId: number; statuId: number | null; birAdet: bigint }
// Dallı emirde (1348 a) birleştirme adımına her dalın parçası ayrı gelir; dal başına önceki parça gelmez.
async function tasinanGirdileri(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number,
): Promise<TasinanGirdi[]> {
  const stoklanir = async (m: number) => stoklanirMi((await malzemeOzeti(db, m))?.tur ?? '');
  const dalli = await dalliTasima(db, malzemeNo, bilgi, uretimEmriId);
  if (dalli !== null) {
    const l: TasinanGirdi[] = [];
    for (const p of dalli.gelenler) {
      if (bilgi.girdiler.some((g) => g.malzemeNo === p.malzemeId) || !(await stoklanir(p.malzemeId))) continue;
      l.push({ malzemeId: p.malzemeId, statuId: p.statuId, birAdet: adetMiktari(oranliAdet(1000n, p.oran), p.miktar, p.bolen) });
    }
    return l;
  }
  const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
  if (oncekiOpNo === null || tasinan === null || bilgi.girdiler.some((g) => g.malzemeNo === tasinan.malzemeNo)) return [];
  if (!(await stoklanir(tasinan.malzemeNo))) return [];
  const statuId = adimStatusu === null || (await cikti(oncekiOpNo)) !== null ? null : await adimStatusu(db, { malzemeNo, opNo: oncekiOpNo, uretimEmriId });
  return [{ malzemeId: tasinan.malzemeNo, statuId, birAdet: adetMiktari(1000n, tasinan.miktar, tasinan.bolen) }];
}
async function adimTasinanGirdileri(db: Db, uretimEmriId: number, malzemeNo: number, opNo: number): Promise<TasinanGirdi[]> {
  const isEmriId = (await adimliEmirAyrintisi(db, uretimEmriId)).isEmirleri.find((x) => x.opNo === opNo)?.id;
  const bilgi = isEmriId === undefined ? null : await adimBilgisi(db, isEmriId);
  return bilgi === null ? [] : tasinanGirdileri(db, malzemeNo, bilgi, uretimEmriId);
}
async function istasyondakiSerbest(db: Db, malzemeId: number, statuId: number | null, konumId: number | null, uretimEmriId: number): Promise<bigint> {
  if (konumId === null) return 0n;
  return (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, konumId, uretimEmriId)).filter((x) => x.konumId === konumId).reduce((t, x) => t + binde(x.serbest), 0n);
}
// İstasyonda bir adetlik önceki adım parçası yoksa ve parça başka yerdeyse eksiktir; istek açılmaz (depo karşılamaz), yer gösterilir.
// Önceki adım henüz parça çıkarmadıysa gösterilecek yer yoktur; sıra kuralı başlatmayı zaten bekletir.
async function tasinanEksikleri(
  db: Db, emir: { id: number; malzemeNo: number | null }, isEmriId: number, istasyonId: number,
): Promise<UretimHazirligiCevabi['eksikler']> {
  if (emir.malzemeNo === null) return [];
  const bilgi = await adimBilgisi(db, isEmriId);
  const l: UretimHazirligiCevabi['eksikler'] = [];
  for (const t of bilgi === null ? [] : await tasinanGirdileri(db, emir.malzemeNo, bilgi, emir.id)) {
    const e = await tasinanEksigi(db, emir.id, t, istasyonId);
    if (e !== null) l.push(e);
  }
  return l;
}
async function tasinanEksigi(db: Db, emirId: number, t: TasinanGirdi, istasyonId: number): Promise<UretimHazirligiCevabi['eksikler'][number] | null> {
  const konumId = await sorgular.istasyonKonumu(db, istasyonId);
  const istasyonda = await istasyondakiSerbest(db, t.malzemeId, t.statuId, konumId, emirId);
  if (istasyonda >= t.birAdet) return null;
  const yerler = await girdiYerleri(db, t.malzemeId, konumId, emirId, t.statuId);
  if (yerler.length === 0) return null;
  const kart = await malzemeOzeti(db, t.malzemeId);
  return { malzemeId: t.malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, gereken: bindenMetin(t.birAdet), istasyonda: bindenMetin(istasyonda), yerler, istek: null };
}
// Her eksik girdi için istasyona malzeme isteği bir kez açılır (aynı adım ve malzeme ikinci istek açmaz, kapanmış istek yeniden açılmaz).
async function eksikIstekleriAc(
  db: Db, kisiId: number, emir: { id: number; emirNo: string; adet: number }, isEmriId: number, istasyonId: number, neden: string,
): Promise<UretimHazirligiCevabi['eksikler']> {
  const opNo = (await adimBilgisi(db, isEmriId))?.opNo ?? 0;
  const eksikler = await baslatmaGirdiEksikleri(db, emir.id, isEmriId, istasyonId, emir.adet);
  const kartlar = await malzemeOzetleri(db, eksikler.map((e) => e.malzemeId));
  const istasyonKonumu = await sorgular.istasyonKonumu(db, istasyonId);
  const sonuc: UretimHazirligiCevabi['eksikler'] = [];
  for (const e of eksikler) {
    const yerler = await girdiYerleri(db, e.malzemeId, istasyonKonumu, emir.id);
    const kok = uretimIstekKoku(emir.id, opNo, e.malzemeId);
    const onceki = await sorgular.istekleriKoktan(db, kok);
    let istek = onceki.find((x) => ISTEK_GECIS_KAYNAKLARI.teslim.includes(x.durum)) ?? null;
    // Önceki istek kapandı (teslim, iptal) ama girdi hâlâ eksik: adım bitene kadar yeni istek açılır.
    if (istek === null) {
      const kaynakKimligi = `${kok}${onceki.length + 1}`;
      const miktar = bindenMetin(e.istenecek);
      const yerMetni = yerler.length === 0 ? 'stokta yok' : yerler.slice(0, 3).map((y) => `${y.konum} (${y.miktar})`).join(', ');
      const id = await sorgular.istekAc(db, {
        no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi, malzemeId: e.malzemeId, miktar, istasyonId, uretimEmriId: emir.id,
        aciklama: `${neden} · emir ${emir.emirNo} · OP ${opNo} · bulunduğu yer: ${yerMetni}`.slice(0, 500), kisiId,
        durum: istekAcilisDurumu(await depodakiMiktar(db, e.malzemeId), miktar),
      });
      istek = (id === null ? (await sorgular.istekleriKaynaktan(db, [kaynakKimligi]))[0] : await sorgular.istekBul(db, id)) ?? null;
    }
    const kart = kartlar.get(e.malzemeId);
    sonuc.push({
      malzemeId: e.malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, gereken: bindenMetin(e.gereken), istasyonda: bindenMetin(e.istasyonda), yerler,
      istek: istek === null ? null : { id: istek.id, no: istek.no, durum: istek.durum },
    });
  }
  return sonuc;
}
const uretimIstekKoku = (emirId: number, opNo: number, malzemeId: number): string => `uretim:${emirId}:${opNo}:${malzemeId}:`;
// Girdinin istasyon dışında bulunduğu yerler (depo, üretim çıkışı, öteki istasyonlar), en eskisi önce.
// Aynı konumdaki partiler tek yer olarak toplanır (kart #1418): kişi yeri seçer, partiyi sistem en eskiden alır.
async function girdiYerleri(
  db: Db, malzemeId: number, istasyonKonumu: number | null, uretimEmriId: number, statuId: number | null = null,
): Promise<IsMalzemeleriCevabi['isler'][number]['malzemeler'][number]['yerler']> {
  const toplam = new Map<string, { konumId: number; buEmrin: boolean; m: bigint }>();
  for (const x of await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, istasyonKonumu ?? 0, uretimEmriId, true)) {
    if (x.konumId === istasyonKonumu || binde(x.serbest) <= 0n) continue;
    const buEmrin = x.partiEmriId === uretimEmriId;
    const a = `${x.konumId}:${buEmrin}`;
    toplam.set(a, { konumId: x.konumId, buEmrin, m: (toplam.get(a)?.m ?? 0n) + binde(x.serbest) });
  }
  const uclar = new Map((await sorgular.teslimUclari(db, [...new Set([...toplam.values()].map((x) => x.konumId))])).map((u) => [u.konumId, u]));
  const istKodlari = await istasyonKodlari(db, [...uclar.values()].map((u) => u.istasyonId));
  const yerKodu = (konumId: number): string => { const u = uclar.get(konumId); return (u?.istasyonId == null ? undefined : istKodlari.get(u.istasyonId)) ?? u?.kod ?? `#${konumId}`; };
  return [...toplam.values()].map(({ konumId, buEmrin, m }) => ({ konum: yerKodu(konumId), miktar: bindenMetin(m), konumId, istasyonId: uclar.get(konumId)?.istasyonId ?? null, buEmrin }));
}
// Teslim al'daki iş malzemeleri (kart #1289): istasyonda bitmemiş her adımın stoklanan girdileri, adım bitene kadar; bulunduğu yer ve
// açık istekle. Kalan adet, çalışan adımda sayılan sağlam düşülerek hesaplanır.
export async function isMalzemeleri(db: Db, k: Kullanici, istasyonId: number): Promise<IsMalzemeleriCevabi> {
  const ist = await istasyonGetir(db, istasyonId);
  if (!ist) throw bulunamadi('İstasyon bulunamadı.');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), ist.isMerkeziId);
  const emirler = (await emirDilimi(db)).filter((e) => e.durum !== 'bitti' && e.durum !== 'iptal' && e.durum !== 'taslak');
  const adimlar = emirler.flatMap((e) => e.isEmirleri.filter((i) => i.istasyonId === ist.id && i.durum !== 'tamam').map((i) => ({ e, i })));
  const kartlar = await malzemeOzetleri(db, [...new Set(adimlar.flatMap(({ i }) => i.bilesenler.map((b) => b.malzemeId)))]);
  const konumId = await sorgular.istasyonKonumu(db, ist.id);
  const istasyonda = new Map<string, bigint>();
  const yerler = new Map<string, IsMalzemeleriCevabi['isler'][number]['malzemeler'][number]['yerler']>();
  const isler: IsMalzemeleriCevabi['isler'] = [];
  for (const { e, i } of adimlar) {
    const kalan = BigInt(Math.max(0, e.adet - (i.canliAdet ?? 0)));
    const birim = new Map<number, bigint>();
    for (const b of i.bilesenler) if (stoklanirMi(kartlar.get(b.malzemeId)?.tur ?? '')) birim.set(b.malzemeId, (birim.get(b.malzemeId) ?? 0n) + adetMiktari(1000n, b.miktar));
    const malzemeler: IsMalzemeleriCevabi['isler'][number]['malzemeler'] = [];
    for (const [malzemeId, birAdet] of birim) {
      // Başka emrin partisi bu iş için kullanılamaz (K2): istasyondaki ve yerler emir başına hesaplanır.
      const anahtar = `${e.id}:${malzemeId}`;
      if (!istasyonda.has(anahtar)) {
        const satirlar = konumId === null ? [] : (await sorgular.uretimGirdiKaynaklari(db, malzemeId, null, konumId, e.id)).filter((x) => x.konumId === konumId);
        istasyonda.set(anahtar, satirlar.reduce((t, x) => t + binde(x.serbest), 0n));
        yerler.set(anahtar, await girdiYerleri(db, malzemeId, konumId, e.id));
      }
      const istek = (await sorgular.istekleriKoktan(db, uretimIstekKoku(e.id, i.opNo, malzemeId)))[0] ?? null;
      const kart = kartlar.get(malzemeId);
      const mevcut = istasyonda.get(anahtar)!;
      malzemeler.push({
        malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, birim: kart?.birim ?? null, birAdet: bindenMetin(birAdet), gereken: bindenMetin(birAdet * kalan), istasyonda: bindenMetin(mevcut),
        eksik: mevcut < birAdet, yerler: yerler.get(anahtar)!, istek: istek === null ? null : { id: istek.id, no: istek.no, durum: istek.durum },
      });
    }
    for (const t of await adimTasinanGirdileri(db, e.id, e.malzemeNo, i.opNo)) {
      if (birim.has(t.malzemeId)) continue;
      const kart = await malzemeOzeti(db, t.malzemeId);
      const mevcut = await istasyondakiSerbest(db, t.malzemeId, t.statuId, konumId, e.id);
      malzemeler.push({
        malzemeId: t.malzemeId, kod: kart?.kod ?? null, ad: kart?.ad ?? null, birim: kart?.birim ?? null, birAdet: bindenMetin(t.birAdet), gereken: bindenMetin(t.birAdet * kalan),
        istasyonda: bindenMetin(mevcut), eksik: mevcut < t.birAdet, yerler: await girdiYerleri(db, t.malzemeId, konumId, e.id, t.statuId), istek: null,
      });
    }
    if (malzemeler.length > 0) isler.push({ uretimEmriId: e.id, emirNo: e.emirNo, opNo: i.opNo, adimAd: i.ad, calisiyor: i.durum === 'calisiyor', kalanAdet: Number(kalan), malzemeler });
  }
  // Depo isteği "Yolda" gösterirken operatör de aynı isteği yolda görür (Akış A provası 2. tur Y2).
  const istekler = isler.flatMap((x) => x.malzemeler.flatMap((m) => (m.istek === null ? [] : [m.istek])));
  const yolda = new Map((await sorgular.yoldaTeslimleri(db, istekler.map((x) => x.id))).map((t) => [t.istekId, { id: t.id, no: t.no }]));
  for (const x of istekler) x.yoldaTeslim = yolda.get(x.id) ?? null;
  return { isler };
}
// İşin malzemesini iste (kart #1418): depodan eksik miktarla istek; emrin rotasındaki başka istasyondan teslim kaydıyla alma.
export async function isMalzemesiIste(db: Db, k: Kullanici, g: IsMalzemesiIsteGovdesi): Promise<IsMalzemeleriCevabi> {
  const istasyonId = Number(g.istasyonId), uretimEmriId = Number(g.uretimEmriId), malzemeId = Number(g.malzemeId);
  const liste = await isMalzemeleri(db, k, istasyonId);
  const is = liste.isler.find((x) => x.uretimEmriId === uretimEmriId && x.opNo === g.opNo);
  const m = is?.malzemeler.find((x) => x.malzemeId === malzemeId);
  if (!is || !m) throw dogrulama('Bu istasyonda bu işin böyle bir malzemesi yok.', 'malzemeId');
  const eksik = binde(m.gereken) - binde(m.istasyonda);
  if (eksik <= 0n) throw dogrulama('Kalan iş için istasyonda yeterli var.', 'malzemeId');
  const kaynakKonumId = g.kaynakKonumId === null ? null : Number(g.kaynakKonumId);
  const kaynak = kaynakKonumId === null ? null : (await sorgular.teslimUclari(db, [kaynakKonumId]))[0];
  if (kaynakKonumId !== null && !kaynak) throw dogrulama('Kaynak yer bulunamadı.', 'kaynakKonumId');
  const urun = (await uretimEmriOzeti(db, uretimEmriId))?.malzemeNo ?? null;
  const tasinan = urun === null ? undefined : (await adimTasinanGirdileri(db, uretimEmriId, urun, is.opNo)).find((t) => t.malzemeId === malzemeId);
  const tasinanMi = tasinan !== undefined;
  const statuId = tasinanMi ? tasinan.statuId : null;
  if (tasinanMi && (!kaynak || kaynak.istasyonId === null)) throw dogrulama('Önceki adımın parçası depodan istenmez; bulunduğu istasyondan alın.', 'kaynakKonumId');
  if (!kaynak || kaynak.istasyonId === null) {
    const kok = uretimIstekKoku(uretimEmriId, is.opNo, malzemeId);
    const onceki = await sorgular.istekleriKoktan(db, kok);
    if (onceki.some((x) => ISTEK_GECIS_KAYNAKLARI.teslim.includes(x.durum))) throw cakisma('Bu malzeme için açık istek var.');
    const miktar = bindenMetin(eksik);
    const yer = kaynak ? ` · bulunduğu yer: ${kaynak.kod}` : '';
    await sorgular.istekAc(db, {
      no: await belgeNo(db, 'stok.malzeme-istegi-no', 'stok_malzeme_istegi'), kaynakKimligi: `${kok}${onceki.length + 1}`, malzemeId, miktar, istasyonId, uretimEmriId,
      aciklama: `İş malzemesi · emir ${is.emirNo} · OP ${is.opNo}${yer}`.slice(0, 200), kisiId: k.id, durum: istekAcilisDurumu(await depodakiMiktar(db, malzemeId), miktar),
    });
    return isMalzemeleri(db, k, istasyonId);
  }
  // Başka istasyondan alma yalnız emrin rotasındaki istasyondan ve yalnız bu emrin ya da emirsiz partisinden (K2); alma teslim kaydıdır.
  const rota = await adimliEmirAyrintisi(db, uretimEmriId);
  if (kaynak.istasyonId === istasyonId || !rota.isEmirleri.some((i) => i.istasyon?.id === kaynak.istasyonId)) throw dogrulama('Yalnız bu emrin rotasındaki başka bir istasyondan alınır.', 'kaynakKonumId');
  const hedef = await istasyonKonumuBul(db, istasyonId, 'istasyonId');
  const buEmrin = g.buEmrin ?? null;
  const satirlar = (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, kaynak.konumId, uretimEmriId))
    .filter((x) => x.konumId === kaynak.konumId && (buEmrin === null || (x.partiEmriId === uretimEmriId) === buEmrin));
  const alinacaklar = kaynaklardanAl(satirlar, eksik);
  if (alinacaklar.length === 0) throw dogrulama(`${kaynak.kod} yerinde serbest malzeme yok.`, 'kaynakKonumId');
  for (const [n, a] of alinacaklar.entries()) {
    const kaynakKimligi = `al:${k.id}:${g.kaynakKimligi}:${n}`;
    if (await sorgular.teslimKaynaktan(db, kaynakKimligi)) continue;
    const miktar = bindenMetin(a.miktar);
    const id = await korumali(async () => {
      await serbestDenetle(db, malzemeId, kaynak.konumId, a.partiId, statuId, miktar, 'alınamaz');
      await emreKartiSagla(db, k.id, { uretimEmriId, partiId: a.partiId, malzemeId, miktar }, g.kartOnayi);
      return teslimYaz(db, {
        no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId, miktar, partiId: a.partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak.konumId, hedefKonumId: hedef,
        uretimEmriId, istekId: null, aciklama: `İş malzemesi alındı · emir ${is.emirNo} · OP ${is.opNo}`.slice(0, 200), gonderenKisiId: k.id,
      });
    });
    if (id === null) continue;
    const t = (await sorgular.teslimBul(db, id, true))!;
    await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  }
  return isMalzemeleri(db, k, istasyonId);
}
async function konumAdlariAl(db: Db, idler: number[]): Promise<Map<number, string>> {
  if (idler.length === 0) return new Map();
  return new Map((await sorgular.konumKodlari(db, [...new Set(idler)])).map((x) => [x.id, x.kod]));
}

// Karar 110 b: adımın girdisi istasyonda bir adetlik yokken iş yine başlar. Eksik, başlatmayla aynı işlemde istasyona açılan malzeme
// isteğiyle iz bırakır (Hazırlık'ta depo karşılar ya da iptal eder); stok burada yazılmaz. Sayım yalnız bulunan stoktan düşer, emrin
// stokta tamamlanması eksik varken durur: stok eksiye inmez.
baslatmaDenetle(async (db, o) => {
  const emir = await uretimEmriOzeti(db, o.uretimEmriId);
  if (!emir) return null;
  const eksikler = await eksikIstekleriAc(db, o.kisiId, emir, o.isEmriId, o.istasyonId, 'Malzeme eksikken üretim başladı');
  if (eksikler.length === 0) return null;
  const adlar = eksikler.map((e) => `${e.kod ?? e.ad ?? `#${e.malzemeId}`}${e.istek === null ? '' : ` (istek ${e.istek.no})`}`);
  return { uyari: `Malzeme eksik: ${adlar.join(', ')}. İş başladı; depo isteği karşılayınca stok düzelir.` };
});

// Kutunun rozet sayısı: bana gelen yoldaki teslimler.
export async function gelenTeslimSayisi(db: Db, k: Kullanici): Promise<number> {
  const kapsam = await kapsamOku(db, k.id);
  const istasyonlar = await kapsamdakiIstasyonlar(db, kapsam);
  const sinirsiz = kapsamSuzgeci(kapsam) === null;
  return (await sorgular.yoldakiGelenler(db, sinirsiz ? null : istasyonlar.map((i) => i.id), islemVarMi(k, 'stok.transfer'))).filter((t) => banaGelen(t, k.id)).length;
}

// Emre giden malzeme kartla gider (615-2 a, 632 a, 633 b): kart sessizce açılmaz. Onaysız gelen teslim ONAY_GEREKLI döner; ayrıntı
// depocuya emri, lotu, miktarı ve kullanılacak açık kartı söyler. Onaylı (kartOnayi) yinelemede açık kart kullanılır ya da açılır.
async function emreKartiSagla(db: Db, kisiId: number, t: { uretimEmriId: number | null; partiId: number | null; malzemeId: number; miktar: string }, onay: boolean | undefined): Promise<void> {
  if (t.uretimEmriId === null) return;
  const emir = await uretimEmriOzeti(db, t.uretimEmriId);
  const lot = t.partiId === null ? null : await sorgular.partiBul(db, t.partiId);
  const tur = kartOnayiTuru(t, lot, emir?.durum ?? null);
  if (tur === null) return;
  const bul = () => (tur === 'lot' ? sorgular.acikRefakatPartisi(db, t.uretimEmriId!, t.partiId!) : sorgular.acikIstisnaKarti(db, t.uretimEmriId!, t.malzemeId));
  const acik = await bul();
  if (!onay) {
    const kart = acik ? (await refakatPartileriCevir(db, [acik]))[0]!.etiket : null;
    const malzeme = (await adlar(db, [t.malzemeId])).get(t.malzemeId) ?? null;
    const ne = tur === 'lot' ? `lot ${lot!.lotNo}` : 'lotsuz';
    throw onayGerekli(kart === null
      ? `Emir ${emir!.emirNo}: ${ne} malzeme refakat kartıyla gider. ${tur === 'lot' ? 'Refakat kartı' : 'Lot bekleyen istisna kartı'} açılsın mı?`
      : `Emir ${emir!.emirNo}: ${ne} malzeme ${kart} kartına eklensin mi?`,
    { kartOnayi: { tur, emirNo: emir!.emirNo, lotNo: lot?.lotNo ?? null, malzeme, miktar: bindenMetin(binde(t.miktar)), kart } });
  }
  if (acik) return;
  if (tur === 'lot') await sorgular.refakatPartisiAc(db, { uretimEmriId: t.uretimEmriId, malzemeId: lot!.malzemeId, partiId: t.partiId!, kisiId });
  else await sorgular.istisnaKartiAc(db, { uretimEmriId: t.uretimEmriId, malzemeId: t.malzemeId, kisiId });
}
// Teslim et: stok yazılmaz, kayıt "yolda" açılır; parça olduğu statü ve partiyle gider. Aynı kaynak kimliği ikinci teslim açmaz.
// bolunenParca: bölünen teslimin ilkinden sonraki parçası; isteğin yoldaki teslimi o bölmenin önceki parçasıdır, yeni teslimi engellemez.
export async function teslimGonder(db: Db, k: Kullanici, g: TeslimGonderGovdesi, bolunenParca = false): Promise<TeslimCevabi> {
  const kaynakKimligi = `kisi:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const malzemeId = Number(g.malzemeId);
  await istenebilirKart(db, malzemeId);
  const kapsam = await kapsamOku(db, k.id);
  const kaynak = await yerCoz(db, k, g.kaynak, 'kaynak', true, kapsam);
  let hedef = await yerCoz(db, k, g.hedef, 'hedef', false, kapsam);
  if (kaynak === hedef) throw dogrulama('Kaynak ve hedef aynı.', 'hedef');
  // Bırakınca teslim (Soru 133): depo rafına yalnız depo bırakır; başkasının depoya bıraktığı mal kabul alanına düşer.
  if (g.birak === true && !islemVarMi(k, 'stok.transfer') && ['raf_gozu', 'depo_zemini'].includes((await sorgular.konumBul(db, hedef))?.tur ?? '')) {
    const kabul = await sorgular.ilkKabulKonumu(db);
    if (kabul === null) throw dogrulama('Mal kabul alanı tanımlı değil; depo rafına yalnız depo bırakır.', 'hedef');
    hedef = kabul;
  }
  // Kişiye teslim: kod yeniden doğrulanır, hedef kişinin bulunduğu istasyon olmalıdır (istemcinin yazdığı kişiye güvenilmez).
  const alici = g.aliciKodu == null ? null : await kisiKoduCoz(db, g.aliciKodu, 'aliciKodu');
  if (g.aliciKodu != null && alici === null) throw dogrulama('Kişi kodu tanınmadı.', 'aliciKodu');
  if (alici?.kisiId === k.id) throw dogrulama('Kendinize teslim edemezsiniz; karşıdakinin kodunu okutun.', 'aliciKodu');
  if (alici && !('istasyonId' in g.hedef && Number(g.hedef.istasyonId) === alici.istasyon.id)) throw dogrulama(`${alici.ad ?? 'Kişi'} şu an ${alici.istasyon.ad} istasyonunda; teslim oraya gider.`, 'hedef');
  // Elden teslim (537 a): alıcının gösterdiği kod onay sayılır; teslim Bıraktım gibi hemen kapanır, alıcı taraf vardiya sonuna kadar itiraz eder.
  const birak = g.birak === true || alici !== null;
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const kalite = g.kaliteDurumu ?? 'serbest';
  // Refakat kartıyla teslim (kart #123): lot ve emir karttan gelir; gövdedeki farklıysa yanlış kart okutulmuştur.
  const refakat = g.refakatPartisiId == null ? null : await sorgular.etkinRefakatPartisiBul(db, Number(g.refakatPartisiId));
  if (g.refakatPartisiId != null) {
    if (!refakat) throw dogrulama('Refakat kartı bulunamadı.', 'refakatPartisiId');
    const engel = refakatTeslimEngeli(refakat, { malzemeId, partiId: g.partiId == null ? g.partiId : Number(g.partiId), uretimEmriId: g.uretimEmriId == null ? g.uretimEmriId : Number(g.uretimEmriId) });
    if (engel) throw dogrulama(engel, 'refakatPartisiId');
  }
  let partiId: number | null;
  if (refakat) partiId = refakat.partiId;
  else if (g.partiId !== undefined) partiId = g.partiId === null ? null : Number(g.partiId);
  else {
    const p = partiSec(await sorgular.konumdakiPartiler(db, malzemeId, kaynak, statuId, kalite), undefined);
    if (p.tur === 'secim-gerekli') {
      // 1229 a: miktar partilere en eskiden bölünür (eksiden çevrilen lotsuz parça lotlu parçayla birlikte gider).
      return bolunmusTeslim(db, k, g, kaynak, statuId, kalite);
    }
    partiId = p.partiId;
  }
  let uretimEmriId = refakat?.uretimEmriId ?? (g.uretimEmriId === undefined || g.uretimEmriId === null ? null : Number(g.uretimEmriId));
  let aciklama = g.not ?? null;
  const istekId = g.istekId === undefined || g.istekId === null ? null : Number(g.istekId);
  if (istekId !== null) {
    // İstek kilitlenir: aynı isteğe eşzamanlı iki teslim açılmaz (STK-H3).
    const istek = await sorgular.istekBul(db, istekId, true);
    if (!istek) throw dogrulama('Malzeme isteği bulunamadı.', 'istekId');
    const hedefIstasyonId = 'istasyonId' in g.hedef ? Number(g.hedef.istasyonId) : null;
    const engel = istekliTeslimEngeli(istek, { malzemeId, hedefIstasyonId, depoIslemi: islemVarMi(k, 'stok.transfer'), yoldaVar: !bolunenParca && await sorgular.yoldaTeslimVarMi(db, istekId) });
    if (engel) throw dogrulama(engel, 'istekId');
    if (refakat && istek.uretimEmriId !== null && istek.uretimEmriId !== refakat.uretimEmriId) throw dogrulama('Malzeme isteği refakat kartının emrine ait değil.', 'refakatPartisiId');
    const fazla = istenenFazlaNotu(istek.miktar, g.miktar);
    if (fazla) aciklama = (aciklama === null ? fazla : `${aciklama} · ${fazla}`).slice(0, 200);
    uretimEmriId ??= istek.uretimEmriId;
  }
  const id = await korumali(async () => {
    await serbestDenetle(db, malzemeId, kaynak, partiId, statuId, bindenMetin(binde(g.miktar)), 'gönderilemez', kalite);
    // Karar bekleyen ve red parça rezerveye girmez (135); yalnız kullanılabilir stok başkasının ayrılmışını yiyebilir.
    if (uretimEmriId !== null && kalite === 'serbest') await rezerveyiAsmasin(db, malzemeId, statuId, uretimEmriId, binde(g.miktar));
    if (!refakat) await emreKartiSagla(db, k.id, { uretimEmriId, partiId, malzemeId, miktar: g.miktar }, g.kartOnayi);
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId, miktar: g.miktar, partiId, statuId, kaliteDurumu: kalite, kaynakKonumId: kaynak, hedefKonumId: hedef,
      uretimEmriId, istekId, aciklama: birak ? (aciklama === null ? birakmaNotu(alici !== null) : `${birakmaNotu(alici !== null)} · ${aciklama}`).slice(0, 200) : aciklama,
      gonderenKisiId: k.id, aliciKisiId: alici?.kisiId ?? null, itirazSonu: birak ? await birakmaItirazSuresi(db, hedef, kaynak) : null,
    });
  });
  if (id === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  if (birak) {
    const t = (await sorgular.teslimBul(db, id, true))!;
    await teslimiKapat(db, k.id, t, bindenMetin(binde(t.miktar)), t.surum, 'miktar');
    const hedefIstasyonId = (await sorgular.teslimUclari(db, [hedef]))[0]?.istasyonId ?? null;
    if (hedefIstasyonId !== null) {
      const fiil = alici === null ? 'bırakıldı' : 'elden teslim edildi';
      await bildirimGonder(db, {
        tur: 'stok.birakildi', baslik: `${t.no}: malzeme ${fiil}`, metin: `${t.miktar} ${fiil} (${t.no}). Yanlışsa vardiya sonuna kadar itiraz edin: Malzeme · Teslim > Teslim et.`,
        kisiler: (await istasyondakiKisiler(db, hedefIstasyonId)).map((x) => x.kisiId), haric: k.id, kaynakKimlik: t.no,
      });
    }
    return teslimOku(db, id);
  }
  // Serbest ara alanda alan taraf yoktur: bırakılan teslim bırakıldığı an alınmış sayılır, transfer gönderimle yazılır (kart #1289).
  if ((await sorgular.konumBul(db, hedef))?.tur === 'ara_alan') {
    const t = (await sorgular.teslimBul(db, id, true))!;
    await teslimiKapat(db, k.id, t, bindenMetin(binde(t.miktar)), t.surum, 'miktar');
  }
  return teslimOku(db, id);
}
// Bölünen teslimin her parçası kendi partisiyle ayrı kayıttır; kaynak kimliği parça sırasıyla türetilir, aynı istek ikinci kez gelirse
// ilk parçadan tanınır ve aynı kayıtlar döner.
async function bolunmusTeslim(db: Db, k: Kullanici, g: TeslimGonderGovdesi, kaynak: number, statuId: number | null, kalite: KaliteDurumu): Promise<TeslimCevabi> {
  const parcaKimligi = (i: number) => `${g.kaynakKimligi}:${String(i + 1)}`;
  const teslimler: TeslimCevabi['teslim'][] = [];
  for (let i = 0, t = await sorgular.teslimKaynaktan(db, `kisi:${k.id}:${parcaKimligi(0)}`.slice(0, 120)); t; i += 1, t = await sorgular.teslimKaynaktan(db, `kisi:${k.id}:${parcaKimligi(i)}`.slice(0, 120))) {
    teslimler.push((await teslimOku(db, t.id)).teslim);
  }
  if (teslimler.length > 0) return { teslim: teslimler[0]!, ekTeslimler: teslimler.slice(1) };
  const adaylar = (await sorgular.konumdakiPartiMiktarlari(db, Number(g.malzemeId), kaynak, statuId, kalite)).map((x) => ({ partiId: x.partiId, serbest: binde(x.serbest) }));
  const bolme = teslimBolmesi(adaylar, binde(g.miktar));
  if (bolme === null) {
    const toplam = adaylar.reduce((t, x) => t + (x.serbest > 0n ? x.serbest : 0n), 0n);
    throw dogrulama(`Burada ${bindenMetin(toplam)} var; fazlası gönderilemez.`, 'miktar');
  }
  for (const [i, p] of bolme.entries()) {
    teslimler.push((await teslimGonder(db, k, { ...g, kaynakKimligi: parcaKimligi(i), partiId: p.partiId, miktar: bindenMetin(p.miktar) }, i > 0)).teslim);
  }
  return { teslim: teslimler[0]!, ekTeslimler: teslimler.slice(1) };
}
const birakmaNotu = (elden: boolean): string => (elden ? 'Elden teslim, alıcı kodu okutuldu' : 'Bırakıldı, alan onayı yok');
async function teslimAlaniDenetle(db: Db, k: Kullanici, t: TeslimHam): Promise<void> {
  const hedef = (await sorgular.teslimUclari(db, [t.hedefKonumId]))[0];
  let alan: Parameters<typeof teslimAlmaEngeli>[1];
  if (hedef?.istasyonId != null) {
    const ist = await istasyonGetir(db, hedef.istasyonId);
    alan = { tur: 'istasyon', kapsamda: kapsamdaMi(await kapsamOku(db, k.id), ist?.isMerkeziId ?? null) };
  } else alan = { tur: 'depo', depoIslemi: islemVarMi(k, 'stok.transfer') };
  const engel = teslimAlmaEngeli(t.gonderenKisiId === k.id, alan, t.aliciKisiId !== null && t.aliciKisiId !== k.id);
  if (engel) throw yetkiYok(engel);
}
// Kişiye refakat kartıyla gelen lotu kişi lot etiketiyle değil kartla alır (kullanıcı akışı 14:16): lot okutulursa kart söylenir.
async function kartaBagliLotuReddet(db: Db, k: Kullanici, partiId: number): Promise<void> {
  for (const t of await sorgular.kartliYoldakiTeslimler(db, partiId)) {
    if (!banaGelen(t, k.id) || !(await teslimAlabilir(db, k, t))) continue;
    const r = await sorgular.acikRefakatPartisi(db, t.uretimEmriId!, partiId);
    const etiket = r === null ? null : (await refakatPartileriCevir(db, [r]))[0]!.etiket;
    throw dogrulama(`Bu malzeme ${etiket ?? 'bir'} refakat kartına bağlı; teslim almak için kartı okutun.`, 'kod');
  }
}
const teslimAlabilir = (db: Db, k: Kullanici, t: TeslimHam): Promise<boolean> =>
  teslimAlaniDenetle(db, k, t).then(() => true, (h: unknown) => { if (h instanceof UygulamaHatasi) return false; throw h; });
async function yoldakiTeslim(db: Db, id: number): Promise<TeslimHam> {
  const t = await sorgular.teslimBul(db, id, true);
  if (!t) throw bulunamadi('Teslim bulunamadı.');
  const engel = teslimKapanisEngeli(t.durum);
  if (engel) throw cakisma(engel);
  return t;
}
// Teslim al: alınan miktar kaynaktan hedefe transfer olarak yazılır (parti ve statü değişmez); kaynakta yetmezse onay istenir.
export async function teslimAl(db: Db, k: Kullanici, id: number, g: TeslimAlGovdesi): Promise<TeslimCevabi> {
  const t = await yoldakiTeslim(db, id);
  await teslimAlaniDenetle(db, k, t);
  await teslimiKapat(db, k.id, t, bindenMetin(binde(g.alinan)), g.surum, 'alinan');
  return teslimOku(db, id);
}
async function teslimiKapat(db: Db, kisiId: number, t: TeslimHam, miktar: string, surum: number, alan: string): Promise<void> {
  const id = t.id;
  await korumali(async () => {
    const istek = t.istekId === null ? null : await sorgular.istekBul(db, t.istekId, true);
    const fazla = istek === null ? null : istenenFazlaNotu(istek.miktar, miktar);
    const q = t.kaliteDurumu;
    await siraliKilitle(db, { malzemeId: t.malzemeId, konumId: t.kaynakKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q },
      { malzemeId: t.malzemeId, konumId: t.hedefKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q });
    const b = await sorgular.bakiyeKilitle(db, t.malzemeId, t.kaynakKonumId, t.partiId, t.statuId, q);
    const engel = teslimAlimMiktariEngeli(t.miktar, miktar, b?.miktar ?? '0');
    if (engel !== null) throw dogrulama(alan === 'miktar' ? `Kaynakta yeterli stok yok (mevcut ${bindenMetin(binde(b?.miktar ?? '0'))}).` : engel, alan);
    const hareketId = await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: t.malzemeId, miktar, kisiId, partiId: t.partiId, partiSecimi: t.partiId === null ? null : 'kisi',
      kaynakKonumId: t.kaynakKonumId, hedefKonumId: t.hedefKonumId, onayliEksi: false, uretimEmriId: t.uretimEmriId, kaynakStatuId: t.statuId, hedefStatuId: t.statuId,
      kaynakKaliteDurumu: q, hedefKaliteDurumu: q, aciklama: fazla === null ? `Teslim ${t.no}` : `Teslim ${t.no} · ${fazla}`,
    }));
    await bakiyeDegistir(db, { malzemeId: t.malzemeId, konumId: t.kaynakKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q, fark: -binde(miktar) });
    await bakiyeDegistir(db, { malzemeId: t.malzemeId, konumId: t.hedefKonumId, partiId: t.partiId, statuId: t.statuId, kaliteDurumu: q, fark: binde(miktar), ilkGiris: b?.ilkGiris ?? null });
    await surumluGuncelle({
      guncelle: () => sorgular.teslimKapat(db, id, surum, { durum: 'teslim', alinan: miktar, redNedeni: null, hareketId, kisiId }),
      varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
    });
    if (istek) await istegiTeslimlerleKapat(db, kisiId, istek);
  });
}
// İstek, teslimlerinin sonuncusu kapanınca alınanların toplamıyla kapanır; kalanı yeni istek olur. Tek teslimde bu o teslimin alınanıdır;
// bölünen teslimde (1229 a) parçalar ayrı alınır, yolda parça kaldıkça istek açık kalır. Hiçbir parça alınmadıysa istek açık kalır
// (yeniden gönderilir). İstek bu arada iptal edildiyse teslim yine geçerlidir; istek olduğu gibi kalır.
async function istegiTeslimlerleKapat(db: Db, kisiId: number, istek: IstekHam): Promise<void> {
  const t = await sorgular.istegeTeslimler(db, istek.id);
  if (t.yolda || binde(t.alinan) <= 0n || istekGecisEngeli(istek.durum, 'teslim') !== null) return;
  const karsilanan = bindenMetin(binde(t.alinan));
  await sorgular.istekGecir(db, istek.id, istek.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.teslim, durum: 'teslim', karsilanan, kapatanKisiId: kisiId });
  await kalaniAc(db, istek, karsilanan);
}
// Reddedilen ya da iptal edilen teslim bölünen isteğin son yoldaki parçasıysa istek alınan parçalarla kapanır.
async function istegiYenidenDene(db: Db, kisiId: number, istekId: number | null): Promise<void> {
  const istek = istekId === null ? null : await sorgular.istekBul(db, istekId, true);
  if (istek) await istegiTeslimlerleKapat(db, kisiId, istek);
}
export async function teslimReddet(db: Db, k: Kullanici, id: number, g: TeslimReddetGovdesi): Promise<TeslimCevabi> {
  const t = await yoldakiTeslim(db, id);
  await teslimAlaniDenetle(db, k, t);
  await surumluGuncelle({
    guncelle: () => sorgular.teslimKapat(db, id, g.surum, { durum: 'red', alinan: null, redNedeni: g.neden, hareketId: null, kisiId: k.id }),
    varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
  });
  await istegiYenidenDene(db, k.id, t.istekId);
  return teslimOku(db, id);
}
export async function teslimIptal(db: Db, k: Kullanici, id: number, g: { surum: number }): Promise<TeslimCevabi> {
  const t = await yoldakiTeslim(db, id);
  if (t.gonderenKisiId !== k.id) throw yetkiYok('Teslimi yalnız gönderen iptal eder.');
  await surumluGuncelle({
    guncelle: () => sorgular.teslimKapat(db, id, g.surum, { durum: 'iptal', alinan: null, redNedeni: null, hareketId: null, kisiId: k.id }),
    varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
  });
  await istegiYenidenDene(db, k.id, t.istekId);
  return teslimOku(db, id);
}

// ---- Malzeme iste: istasyondan istek (soru 96 a) ve okutarak alma (soru 96 b) ----------------------------------------------------
// İstasyonlardaki serbest miktar (yoldaki düşülür, kalitesi serbest), istasyon ve statü başına. Kapsam süzmez: soru 93 a ve 96 bunu
// malzeme isteyebilen herkese açtı; çağıran yalnız miktarı gösterir, gönderim yine kendi kuralından geçer.
async function malzemeninIstasyonlari(db: Db, malzemeId: number, partiId?: number): Promise<MalzemeYerleriCevabi['istasyonlar']> {
  const konumlar = [...new Set((await sorgular.malzemeBakiyeleri(db, malzemeId))
    .filter((b) => b.konumTur === 'istasyon' && binde(b.miktar) > 0n && (partiId === undefined || b.partiId === partiId)).map((b) => b.konumId))];
  const ist = new Map((await aktifIstasyonlar(db)).map((i) => [i.id, i]));
  const sonuc: MalzemeYerleriCevabi['istasyonlar'] = [];
  for (const u of await sorgular.teslimUclari(db, konumlar)) {
    const i = u.aktif && u.istasyonId !== null ? ist.get(u.istasyonId) : undefined;
    if (!i) continue;
    const toplam = new Map<number | null, bigint>();
    for (const x of await konumdakiSerbest(db, u.konumId)) {
      if (x.malzemeId === malzemeId && x.kaliteDurumu === 'serbest' && (partiId === undefined || x.partiId === partiId)) toplam.set(x.statuId, (toplam.get(x.statuId) ?? 0n) + binde(x.miktar));
    }
    for (const [statuId, m] of toplam) if (m > 0n) sonuc.push({ istasyonId: i.id, kod: i.kod, ad: i.ad, statuId, miktar: bindenMetin(m) });
  }
  return sonuc;
}
export async function malzemeYerleri(db: Db, malzemeId: number): Promise<MalzemeYerleriCevabi> {
  await istenebilirKart(db, malzemeId);
  return { depo: await depodakiMiktar(db, malzemeId), istasyonlar: await malzemeninIstasyonlari(db, malzemeId) };
}
// İstasyondan istenen istek o istasyonun kapsamındaki kişiye düşer; kabul eden teslimi istekle gönderir, isteyen istasyon teslimi alınca
// istek kapanır (iki imza korunur). İsteği açan kendi isteğini kabul edemez.
async function istasyonIstegiAl(db: Db, k: Kullanici, id: number): Promise<IstekHam & { kaynakIstasyonId: number }> {
  const i = await sorgular.istekBul(db, id, true);
  if (!i) throw bulunamadi('Malzeme isteği bulunamadı.');
  if (i.kaynakIstasyonId === null) throw cakisma('Bu istek depodan istendi; depo karşılar.');
  await istasyonKapsaminiDenetle(db, k.id, i.kaynakIstasyonId);
  if (i.kisiId === k.id) throw yetkiYok('Kendi isteğinizi kabul edemez ya da reddedemezsiniz.');
  return { ...i, kaynakIstasyonId: i.kaynakIstasyonId };
}
export async function istekKabulEt(db: Db, k: Kullanici, id: number, g: IstekKabulGovdesi): Promise<MalzemeIstegiCevabi> {
  const kaynakKimligi = `kabul:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  if (await sorgular.teslimKaynaktan(db, kaynakKimligi)) return malzemeIstegiOku(db, id);
  const i = await istasyonIstegiAl(db, k, id);
  if (i.istasyonId === null) throw cakisma('İsteğin teslim yeri yok.');
  await istenebilirKart(db, i.malzemeId);
  const kaynak = await istasyonKonumuBul(db, i.kaynakIstasyonId, 'kaynakIstasyonId');
  const hedef = await istasyonKonumuBul(db, i.istasyonId, 'istasyonId');
  const statuId = g.statuId === undefined || g.statuId === null ? null : Number(g.statuId);
  let partiId: number | null;
  if (g.partiId !== undefined) partiId = g.partiId === null ? null : Number(g.partiId);
  else {
    const p = partiSec(await sorgular.konumdakiPartiler(db, i.malzemeId, kaynak, statuId), undefined);
    if (p.tur === 'secim-gerekli') throw dogrulama('Bu istasyonda birden çok parti var; partiyi seçin.', 'partiId', { partiler: p.partiler });
    partiId = p.partiId;
  }
  // K2: başka emrin partisi bu isteğe gönderilmez.
  const partiEmri = partiId === null ? null : (await sorgular.partiBul(db, partiId))?.uretimEmriId ?? null;
  if (partiEmri !== null && partiEmri !== i.uretimEmriId) throw dogrulama('Bu parti başka bir emrin; isteğe gönderilmez.', 'partiId');
  const miktar = bindenMetin(binde(g.miktar));
  await surumluGuncelle({
    guncelle: () => sorgular.istekGecir(db, id, g.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.hazirla, durum: 'hazirlaniyor', karsilanan: null, kapatanKisiId: null }),
    varMi: () => sorgular.istekVarMi(db, id), bulunamadiIletisi: 'Malzeme isteği bulunamadı.',
  });
  await korumali(async () => {
    await serbestDenetle(db, i.malzemeId, kaynak, partiId, statuId, miktar, 'gönderilemez');
    if (i.uretimEmriId !== null) await rezerveyiAsmasin(db, i.malzemeId, statuId, i.uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: i.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak, hedefKonumId: hedef,
      uretimEmriId: i.uretimEmriId, istekId: i.id, aciklama: [`İstek ${i.no}`, istenenFazlaNotu(i.miktar, miktar)].filter((x) => x !== null).join(' · '), gonderenKisiId: k.id,
    });
  });
  return malzemeIstegiOku(db, id);
}
export async function istekReddet(db: Db, k: Kullanici, id: number, g: IstekReddetGovdesi): Promise<MalzemeIstegiCevabi> {
  await istasyonIstegiAl(db, k, id);
  await surumluGuncelle({
    guncelle: () => sorgular.istekReddet(db, id, g.surum, { neden: g.neden, kisiId: k.id }),
    varMi: () => sorgular.istekVarMi(db, id), bulunamadiIletisi: 'Malzeme isteği bulunamadı.',
  });
  return malzemeIstegiOku(db, id);
}
// Okutulan malzeme ya da lot (okutCoz ile aynı çözüm sırası); konum ve bilinmeyen kod malzeme değildir.
async function okutulanMalzeme(db: Db, ham: string): Promise<{ malzemeId: number; partiId: number | null } | null> {
  const t = kodTuru(ham);
  if (t.tur === 'lot') { const p = await sorgular.lotNoylaParti(db, t.deger); return p ? { malzemeId: p.malzemeId, partiId: p.id } : null; }
  if (t.tur === 'malzeme') return { malzemeId: Number(t.deger), partiId: null };
  if (t.tur === 'refakat-partisi') { const r = await sorgular.etkinRefakatPartisiBul(db, Number(t.deger)); return r ? { malzemeId: r.malzemeId, partiId: r.partiId } : null; }
  if (t.tur === 'konum') return null;
  const no = /^(?:MLZ[:\s-]*)?(\d{1,9})$/.exec(ham.trim().toUpperCase())?.[1] ?? await katalogEtiketiKartNo(db, ham);
  return no === undefined || no === null ? null : { malzemeId: Number(no), partiId: null };
}
// Okutulan yer etiketi yalnız aktif istasyon konumu olabilir: okutarak alma istasyondan istasyona yapılır.
async function okutulanIstasyonYeri(db: Db, ham: string): Promise<{ konumId: number; istasyonId: number; kod: string; ad: string } | null> {
  const t = kodTuru(ham);
  const kod = t.tur === 'konum' ? t.deger : ham.trim().toUpperCase().replace(/^LOC[:\s-]*/, '');
  const satir = await sorgular.konumKoduyla(db, kod);
  const u = satir === null ? undefined : (await sorgular.teslimUclari(db, [satir.id]))[0];
  if (!u || !u.aktif || u.tur !== 'istasyon' || u.istasyonId === null) return null;
  const ist = await istasyonGetir(db, u.istasyonId);
  return ist && ist.aktif ? { konumId: u.konumId, istasyonId: ist.id, kod: ist.kod, ad: ist.ad } : null;
}
async function okutarakAlinacak(db: Db, kod: string, yerKodu: string) {
  const m = await okutulanMalzeme(db, kod);
  const o = m === null ? null : await malzemeOzeti(db, m.malzemeId);
  if (m === null || !o) throw dogrulama('Okutulan kod malzeme ya da lot değil.', 'kod');
  const yer = await okutulanIstasyonYeri(db, yerKodu);
  if (yer === null) throw dogrulama('Aldığınız yerin istasyon etiketini okutun.', 'yerKodu');
  return { m, o, yer };
}
export async function okutarakAlOnizle(db: Db, kod: string, yerKodu: string): Promise<OkutarakAlCevabi> {
  const { m, o, yer } = await okutarakAlinacak(db, kod, yerKodu);
  const serbest = (await konumdakiSerbest(db, yer.konumId))
    .filter((x) => x.malzemeId === m.malzemeId && x.kaliteDurumu === 'serbest' && (m.partiId === null || x.partiId === m.partiId) && binde(x.miktar) > 0n);
  const nolar = await emirNoHaritasi(db, serbest.map((x) => x.uretimEmriId));
  return {
    malzeme: { id: o.id, kod: o.kod, ad: o.ad, birim: o.birim }, yer,
    satirlar: serbest.map((x) => ({ partiId: x.partiId, partiEtiketi: partiEtiketi(x.partiId === null ? null : x, emirNoDe(nolar, x.uretimEmriId)), statuId: x.statuId, uretimEmriId: x.uretimEmriId, miktar: x.miktar })),
  };
}
// Bırakınca teslimde itiraz eden hedef taraftır: süre hedef istasyonun (hedef depo ise kaynağın) vardiyasıdır; ikisi de istasyon değilse tesis günü.
async function birakmaItirazSuresi(db: Db, hedefKonumId: number, kaynakKonumId: number): Promise<string> {
  const uclar = await sorgular.teslimUclari(db, [hedefKonumId, kaynakKonumId]);
  const ist = uclar.find((u) => u.konumId === hedefKonumId)?.istasyonId ?? uclar.find((u) => u.konumId === kaynakKonumId)?.istasyonId ?? null;
  if (ist !== null) return itirazSuresi(db, ist);
  return new Date(tesisGunBasi(tesisGunu(Date.now() + 24 * 3600 * 1000))).toISOString();
}
// İtiraz süresi kaynak istasyonun o gün başlayan vardiyalarının bitişidir; takvim okunamazsa tesis gününün sonu.
async function itirazSuresi(db: Db, istasyonId: number): Promise<string> {
  const an = Date.now();
  const gun = tesisGunu(an);
  const yarin = new Date(tesisGunBasi(gun) + 36 * 3600 * 1000);
  const takvim = await basladigiGunTakvimi(db, { tur: 'istasyon', id: istasyonId }, gun).catch((h: unknown) => { if (h instanceof UygulamaHatasi) return null; throw h; });
  return itirazSonu(an, takvim?.bitis ?? null, tesisGunBasi(tesisGunu(yarin)));
}
// Soru 96 b: alan kişi malzemeyi ve aldığı yeri okutur; teslim kaynak onayı olmadan açılıp aynı anda alınır (T7 değişti). Telafi:
// 1 yalnız serbest ve kalitesi serbest stok, başka emrin partisi değil; 2 kaynak istasyona bildirim; 3 süre içinde itiraz; 4 kayıt işaretli.
export async function okutarakAl(db: Db, k: Kullanici, g: OkutarakAlGovdesi): Promise<TeslimCevabi> {
  const kaynakKimligi = `okut:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const { m, o, yer } = await okutarakAlinacak(db, g.kod, g.yerKodu);
  await istenebilirKart(db, m.malzemeId);
  const partiId = g.partiId === null ? null : Number(g.partiId);
  if (m.partiId !== null && m.partiId !== partiId) throw dogrulama('Okutulan lot ile seçilen parti aynı değil.', 'partiId');
  const hedefIstasyon = await istasyonGetir(db, Number(g.istasyonId));
  if (!hedefIstasyon || !hedefIstasyon.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), hedefIstasyon.isMerkeziId);
  const partiEmriId = partiId === null ? null : (await sorgular.partiBul(db, partiId))?.uretimEmriId ?? null;
  const uretimEmriId = g.uretimEmriId === undefined || g.uretimEmriId === null ? partiEmriId : Number(g.uretimEmriId);
  if (uretimEmriId !== null && uretimEmriId !== partiEmriId) await istenebilirEmir(db, uretimEmriId);
  const engel = okutarakAlmaEngeli({ kalite: 'serbest', partiEmriId, uretimEmriId, kaynakIstasyonId: yer.istasyonId, hedefIstasyonId: hedefIstasyon.id });
  if (engel) throw dogrulama(engel, 'kod');
  const hedef = await istasyonKonumuBul(db, hedefIstasyon.id, 'istasyonId');
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const miktar = bindenMetin(binde(g.miktar));
  const sure = await itirazSuresi(db, yer.istasyonId);
  const id = await korumali(async () => {
    await serbestDenetle(db, m.malzemeId, yer.konumId, partiId, statuId, miktar, 'alınamaz');
    if (uretimEmriId !== null) await rezerveyiAsmasin(db, m.malzemeId, statuId, uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: m.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: yer.konumId, hedefKonumId: hedef,
      uretimEmriId, istekId: null, aciklama: 'Okutarak alındı, kaynak onayı yok', gonderenKisiId: k.id, itirazSonu: sure,
    });
  });
  if (id === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  const t = (await sorgular.teslimBul(db, id, true))!;
  await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  const alan = (await kisiAdlari(db, [k.id])).get(k.id) ?? null;
  await bildirimGonder(db, {
    tur: 'stok.okutarak-alindi', baslik: `${yer.ad}: ${o.ad ?? o.kod} okutarak alındı`.slice(0, 200),
    metin: `${miktar}${o.birim ? ` ${o.birim}` : ''} ${hedefIstasyon.ad} istasyonuna alındı${alan ? ` (${alan})` : ''}, ${t.no}. İtiraz: Malzeme · Teslim > Teslim et.`,
    kisiler: (await istasyondakiKisiler(db, yer.istasyonId)).map((x) => x.kisiId), haric: k.id, kaynakKimlik: t.no,
  });
  return teslimOku(db, id);
}
// Kartın satırları (Soru 128). Alınabilir: kalitesi serbest, ayrılmış, yolda ve fason konumunda değil; yoldaki düşülür.
export async function refakatKartSatirlari(db: Db, kartId: number): Promise<RefakatKartSatiri[]> {
  const satirlar = await sorgular.kartSatirlari(db, kartId);
  const kartlar = await malzemeOzetleri(db, [...new Set(satirlar.map((x) => x.malzemeId))]);
  const kapali = new Set<string>([...AYRILMIS_KONUM_TURLERI, 'yolda', 'fason']);
  return satirlar.map((x) => {
    const m = kartlar.get(x.malzemeId);
    const kalan = binde(x.miktar) - binde(x.yolda);
    const alinabilir = x.kaliteDurumu === 'serbest' && !kapali.has(x.konumTur) && kalan > 0n ? kalan : 0n;
    return {
      konumId: x.konumId, konumKod: x.konumKod, konumAd: x.konumAd, konumTur: x.konumTur, istasyonId: x.istasyonId, malzemeId: x.malzemeId, malzemeKod: m?.kod ?? null, malzemeAd: m?.ad ?? null,
      birim: m?.birim ?? null, partiId: x.partiId, partiEtiketi: x.lotNo, statuId: x.statuId, kaliteDurumu: x.kaliteDurumu, miktar: x.miktar, yolda: x.yolda, alinabilir: bindenMetin(alinabilir),
    };
  });
}
// Serbest Al (Soru 133): kartı okutan, kartın satırından kendi istasyonuna alır. Okutarak almanın (96 b) telafileri aynıdır: yalnız serbest,
// kaynak istasyona bildirim, süre içinde itiraz; kaynak depo ise itiraz süresi alanın istasyonunun vardiyasıdır.
export async function kartlaAl(db: Db, k: Kullanici, id: number, g: KartlaAlGovdesi): Promise<TeslimCevabi> {
  const kaynakKimligi = `kart-al:${k.id}:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return teslimOku(db, onceki.id);
  const r = await sorgular.etkinRefakatPartisiBul(db, id);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  if (r.durum !== 'acik') throw cakisma('Refakat kartı iptal edilmiş.');
  const statuId = g.statuId === null ? null : Number(g.statuId);
  const partiId = Number(g.partiId);
  const satir = (await refakatKartSatirlari(db, r.id)).find((x) => x.konumId === Number(g.konumId) && x.partiId === partiId && x.statuId === statuId && x.kaliteDurumu === 'serbest');
  if (!satir) throw dogrulama('Kartın bu satırı yok ya da kalitesi serbest değil.', 'konumId');
  const miktar = bindenMetin(binde(g.miktar));
  if (binde(miktar) > binde(satir.alinabilir)) throw dogrulama(`Bu satırdan en çok ${bindenMetin(binde(satir.alinabilir))} alınır.`, 'miktar');
  const hedefIstasyon = await istasyonGetir(db, Number(g.istasyonId));
  if (!hedefIstasyon || !hedefIstasyon.aktif) throw dogrulama('İstasyon bulunamadı ya da pasif.', 'istasyonId');
  kapsamDisiysaReddet(await kapsamOku(db, k.id), hedefIstasyon.isMerkeziId);
  if (satir.istasyonId === hedefIstasyon.id) throw dogrulama('Malzeme zaten bu istasyonda.', 'istasyonId');
  const hedef = await istasyonKonumuBul(db, hedefIstasyon.id, 'istasyonId');
  const sure = await itirazSuresi(db, satir.istasyonId ?? hedefIstasyon.id);
  const tid = await korumali(async () => {
    await serbestDenetle(db, satir.malzemeId, satir.konumId, partiId, statuId, miktar, 'alınamaz');
    await rezerveyiAsmasin(db, satir.malzemeId, statuId, r.uretimEmriId, binde(miktar));
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: satir.malzemeId, miktar, partiId, statuId, kaliteDurumu: 'serbest', kaynakKonumId: satir.konumId, hedefKonumId: hedef,
      uretimEmriId: r.uretimEmriId, istekId: null, aciklama: 'Kartla alındı (Serbest Al), kaynak onayı yok', gonderenKisiId: k.id, itirazSonu: sure,
    });
  });
  if (tid === null) return teslimOku(db, (await sorgular.teslimKaynaktan(db, kaynakKimligi))!.id);
  const t = (await sorgular.teslimBul(db, tid, true))!;
  await teslimiKapat(db, k.id, t, miktar, t.surum, 'miktar');
  if (satir.istasyonId !== null) {
    const alan = (await kisiAdlari(db, [k.id])).get(k.id) ?? null;
    await bildirimGonder(db, {
      tur: 'stok.okutarak-alindi', baslik: `${satir.konumAd ?? satir.konumKod}: ${satir.malzemeAd ?? satir.malzemeKod ?? 'malzeme'} kartla alındı`.slice(0, 200),
      metin: `${miktar}${satir.birim ? ` ${satir.birim}` : ''} ${hedefIstasyon.ad} istasyonuna alındı${alan ? ` (${alan})` : ''}, ${t.no}. İtiraz: Malzeme · Teslim > Teslim et.`,
      kisiler: (await istasyondakiKisiler(db, satir.istasyonId)).map((x) => x.kisiId), haric: k.id, kaynakKimlik: t.no,
    });
  }
  return teslimOku(db, tid);
}
// Yolda süresi (Soru 133): süresi dolan teslim "Süre doldu" notuyla iptal olur; stok kaynakta kalır, ayırma kalkar (yolda düşülmez olur).
// İstek teslim alınana kadar açık kaldığından yeniden gönderilebilir. Gönderen ve hedef istasyon bildirim alır. Döner: iptal edilen sayısı.
export async function suresiDolanTeslimleriIptal(db: Db): Promise<number> {
  const dk = await sistemAyariOku(db, 'stok.yolda-suresi-dk');
  if (dk === null) return 0;
  let n = 0;
  for (const t of await sorgular.suresiDolanTeslimler(db, dk)) {
    const kapandi = await sorgular.teslimKapat(db, t.id, t.surum, { durum: 'iptal', alinan: null, redNedeni: null, hareketId: null, kisiId: t.gonderenKisiId });
    if (!kapandi) continue;
    await sorgular.teslimeNotYaz(db, t.id, 'Süre doldu');
    await istegiYenidenDene(db, t.gonderenKisiId, t.istekId);
    n++;
    const hedefIstasyonId = (await sorgular.teslimUclari(db, [t.hedefKonumId]))[0]?.istasyonId ?? null;
    const alicilar = hedefIstasyonId === null ? [] : (await istasyondakiKisiler(db, hedefIstasyonId)).map((x) => x.kisiId);
    await bildirimGonder(db, {
      tur: 'stok.teslim-suresi-doldu', baslik: `${t.no}: yolda süresi doldu`,
      metin: `${t.no} alınmadan süresi doldu ve iptal oldu; malzeme kaynakta kalır. Göndermek için yeniden Teslim et.`,
      kisiler: [...new Set([t.gonderenKisiId, ...alicilar])], kaynakKimlik: t.no,
    });
  }
  return n;
}
// Telafi 3: kaynak istasyonun kapsamındaki kişi süre içinde bir kez itiraz eder. İtiraz geri almaz: malzeme alanın istasyonunda serbestse
// alan kişiden kaynağa iade teslimi açılır (kaynak taraf teslim alır); kullanılmışsa yalnız itiraz kalır, alan kişi ve depo görür.
export async function teslimItiraz(db: Db, k: Kullanici, id: number, g: ItirazGovdesi): Promise<TeslimCevabi> {
  const t = await sorgular.teslimBul(db, id, true);
  if (!t) throw bulunamadi('Teslim bulunamadı.');
  if (!t.okutarak || t.durum !== 'teslim') throw cakisma('Yalnız onaysız teslime (okutarak alınan ya da bırakılan) itiraz edilir.');
  // Karşı taraf itiraz eder: okutarak almada kaynak, bırakınca teslimde hedef (Soru 133). İki uç da istasyon değilse depo işlemi gerekir.
  const uclar = await sorgular.teslimUclari(db, [t.kaynakKonumId, t.hedefKonumId]);
  const istasyonlari = [t.kaynakKonumId, t.hedefKonumId].map((kid) => uclar.find((u) => u.konumId === kid)?.istasyonId ?? null);
  const kapsam = await kapsamOku(db, k.id);
  let yetkili = false;
  for (const ist of istasyonlari) {
    if (ist === null) { yetkili ||= islemVarMi(k, 'stok.transfer'); continue; }
    const i = await istasyonGetir(db, ist);
    yetkili ||= kapsamdaMi(kapsam, i?.isMerkeziId ?? null);
  }
  if (!yetkili) throw yetkiYok('Bu teslimin iki ucunda da yetkiniz yok.');
  if (t.kapatanKisiId === k.id) throw yetkiYok('Kendi aldığınız malzemeye itiraz edemezsiniz.');
  if (t.itirazNedeni !== null) throw cakisma('Bu teslime itiraz edildi.');
  if (t.itirazSonu === null || Date.parse(t.itirazSonu) <= Date.now()) throw cakisma('İtiraz süresi bitti; depoya ya da amirinize bildirin.');
  await surumluGuncelle({
    guncelle: () => sorgular.itirazYaz(db, id, g.surum, { neden: g.neden, kisiId: k.id }),
    varMi: () => sorgular.teslimVarMi(db, id), bulunamadiIletisi: 'Teslim bulunamadı.',
  });
  const b = await sorgular.bakiyeKilitle(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest');
  const serbest = binde(b?.miktar ?? '0') - binde(await sorgular.yoldaAyrilan(db, t.malzemeId, t.hedefKonumId, t.partiId, t.statuId, 'serbest'));
  const alinan = binde(t.alinan ?? t.miktar);
  const iade = serbest < alinan ? serbest : alinan;
  if (iade > 0n) {
    const iadeId = await teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi: `itiraz:${t.id}`, malzemeId: t.malzemeId, miktar: bindenMetin(iade), partiId: t.partiId, statuId: t.statuId,
      kaliteDurumu: 'serbest', kaynakKonumId: t.hedefKonumId, hedefKonumId: t.kaynakKonumId, uretimEmriId: t.uretimEmriId, istekId: null,
      aciklama: `İtiraz iadesi · ${t.no}`, gonderenKisiId: t.kapatanKisiId ?? t.gonderenKisiId,
    });
    if (iadeId !== null) await sorgular.iadeBagla(db, t.id, iadeId);
  }
  return teslimOku(db, id);
}

// ---- Depo yerleşimi (2B düzenleyici) ---------------------------------------------------------------------------------------
const say = (m: string): number => Number(m);
async function anaDepo(db: Db): Promise<number> {
  const id = await sorgular.depoKimligi(db, 'ANA');
  if (id === null) throw new Error('Ana depo yok');
  return id;
}
export async function yerlesimOku(db: Db): Promise<YerlesimCevabi> {
  const depoId = await anaDepo(db);
  const y = (await sorgular.yerlesim(db, depoId))!;
  const raflar = await sorgular.yerlesimRaflari(db, depoId);
  return {
    depo: (await sorgular.depoBul(db, depoId))!,
    yerlesim: {
      bina: { x0: say(y.bina_x0), x1: say(y.bina_x1), z0: say(y.bina_z0), z1: say(y.bina_z1) },
      kabul: { x: say(y.kabul_x), z: say(y.kabul_z), genislik: say(y.kabul_genislik), derinlik: say(y.kabul_derinlik) },
      kareBoyu: say(y.kare_boyu), sayimSuresiGun: y.sayim_suresi_gun, fason: { x: say(y.fason_x), z: say(y.fason_z), aci: y.fason_aci }, surum: y.surum,
    },
    raflar: raflar.map((r) => ({ ...r, bolmeGenislikM: say(r.bolmeGenislikM), derinlikM: say(r.derinlikM), katAraligiM: say(r.katAraligiM), xM: say(r.xM), zM: say(r.zM) })),
  };
}
const metin2 = (n: number): string => n.toFixed(2);
// Tek işlemde kaydeder: önce kaldırılanlar (stoklu göz kaldırılamaz), sonra değişenler (sürümlü), sonra yeniler.
// Göz adresi tekil kalmalı: iki raf aynı adresi üretirse `stok_konum_kod_tek` 409 döner.
export async function yerlesimKaydet(db: Db, g: YerlesimKaydetKomutu): Promise<YerlesimCevabi> {
  const depoId = await anaDepo(db);
  await korumali(async () => {
    await surumluGuncelle({ guncelle: () => sorgular.yerlesimGuncelle(db, depoId, g.surum, g), varMi: () => sorgular.yerlesimVarMi(db, depoId), bulunamadiIletisi: 'Yerleşim bulunamadı.' });
    await sorgular.depoAdiYaz(db, depoId, g.depoAdi);
    for (const x of g.silinenler) {
      await surumluGuncelle({ guncelle: () => sorgular.rafPasifYap(db, x.id, x.surum), varMi: () => sorgular.rafVarMi(db, x.id), bulunamadiIletisi: 'Raf bulunamadı.' });
      await sorgular.rafGozleriniKapat(db, x.id);
    }
    for (const r of g.raflar) {
      const alanlar = { kod: r.kod, tur: r.tur, numaralama: r.numaralama, ilkBolme: r.ilkBolme, bolmeSayisi: r.bolmeSayisi, katSayisi: r.tur === 'zemin' ? 1 : r.katSayisi,
        bolmeGenislikM: metin2(r.bolmeGenislikM), derinlikM: metin2(r.derinlikM), katAraligiM: metin2(r.katAraligiM) };
      let id: number;
      if (r.id !== null) {
        const eski = await sorgular.rafBul(db, r.id, true);
        if (!eski) throw bulunamadi(`Raf ${r.kod} bulunamadı.`);
        await sorgular.gozleriYenidenNumarala(db, r.id, bolmeleri(eski), bolmeleri(alanlar));
        const rid = r.id, rs = r.surum ?? 0;
        await surumluGuncelle({ guncelle: () => sorgular.rafGuncelle(db, rid, rs, alanlar), varMi: () => sorgular.rafVarMi(db, rid), bulunamadiIletisi: 'Raf bulunamadı.' });
        id = r.id;
      } else id = await sorgular.rafAc(db, { ...alanlar, depoId });
      await sorgular.rafYeriYaz(db, id, r);
      await gozleriKur(db, id, depoId, alanlar);
    }
  });
  return yerlesimOku(db);
}


// ---- Stok içi arama (önizlemedeki Ctrl K) ------------------------------------------------------------------------------------
// Malzeme kart numarasıyla (ya da MLZ:no) ve ad ya da stok koduyla (`malzemeAra`, ilk 8) bulunur. Hizmet kartı stoklanmadığı için
// önerilmez (mal kabul, fason ve toplama seçicileri bu aramayı kullanır); hizmet satırı sipariş satırıyla gelir.
export async function ara(db: Db, q: string): Promise<AraCevabi> {
  const sonuclar: AraCevabi['sonuclar'] = [];
  const no = /^(?:MLZ[:\s-]*)?(\d{1,9})$/i.exec(q)?.[1];
  const kartlar = new Map<number, { id: number; ad: string | null; kod: string; tur: string }>();
  if (no !== undefined) {
    const o = await malzemeOzeti(db, Number(no));
    if (o) kartlar.set(o.id, o);
  }
  for (const o of (await malzemeAra(db, { metin: q, sayfa: 1, sayfaBoyu: 8 })).satirlar) if (!kartlar.has(o.id)) kartlar.set(o.id, o);
  for (const o of [...kartlar.values()].filter((x) => stoklanirMi(x.tur))) {
    const b = await sorgular.malzemeBakiyeleri(db, o.id);
    sonuclar.push({ tur: 'malzeme', malzemeId: o.id, ad: o.ad, kod: o.kod, toplam: bindenMetin(b.reduce((t, x) => t + binde(x.miktar), 0n)) });
  }
  const kod = q.replace(/^LOC[:\s-]*/i, '');
  for (const k of await sorgular.konumAra(db, kod)) sonuclar.push({ tur: 'konum', ...k });
  for (const r of await sorgular.rafAra(db, q)) sonuclar.push({ tur: 'raf', ...r });
  const partiler = await sorgular.partiAra(db, q);
  const nolar = await emirNoHaritasi(db, partiler.map((p) => p.uretimEmriId));
  for (const p of partiler) sonuclar.push({ tur: 'parti', partiId: p.partiId, malzemeId: p.malzemeId, etiket: partiEtiketi({ lotNo: p.lotNo, tedarikciPartiNo: p.tedarikciPartiNo, dokumNo: p.dokumNo, uretimEmriId: p.uretimEmriId }, emirNoDe(nolar, p.uretimEmriId)) ?? '' });
  return { sonuclar };
}

export async function sayimBekleyenler(db: Db): Promise<{ gun: number; gozler: { konumId: number; kod: string; sonSayim: string | null }[] }> {
  const y = (await sorgular.yerlesim(db, await anaDepo(db)))!;
  return { gun: y.sayim_suresi_gun, gozler: await sorgular.sayimBekleyenGozler(db, y.sayim_suresi_gun) };
}

// ---- Son partiler ve sertifikaları (#960) ------------------------------------------------------------------------------------
async function partiBelgeleri(db: Db, partiIdler: number[]): Promise<Map<number, PartiBelgesi[]>> {
  if (partiIdler.length === 0) return new Map();
  const bagli = await kayitlaraBagliBelgeler(db, 'stok', [...new Set(partiIdler)]);
  return new Map([...bagli].map(([id, l]) => [id, l.map(({ id: belgeId, ad, tur, harf }) => ({ id: belgeId, ad, tur, harf }))]));
}
export async function sonPartiler(db: Db, malzemeId: number, sinir: number): Promise<SonParti[]> {
  const partiler = await sorgular.sonPartiler(db, malzemeId, sinir);
  const belgeler = await partiBelgeleri(db, partiler.map((p) => p.partiId));
  return partiler.map((p) => ({ ...p, belgeler: belgeler.get(p.partiId) ?? [] }));
}
// Dosya yalnız o partiye bağlıysa verilir: stok, kendi gösterdiği kaydın belgesini kendi ucundan verir.
export async function partiBelgeDosyasi(db: Db, partiId: number, belgeId: number): Promise<IkiliCevap> {
  const dosya = await kayittakiBelgeDosyasi(db, 'stok', partiId, belgeId);
  if (dosya === null) throw bulunamadi('Partide bu belge yok.');
  return dosya;
}

export async function siparisIrsaliyeleri(db: Db, siparisSatirIdler: readonly number[]): Promise<SiparisIrsaliyeleriCevabi> {
  return { irsaliyeler: await sorgular.siparisIrsaliyeleri(db, siparisSatirIdler) };
}

// ---- Üretim sayımının stoğa yansıması (kart #1289) --------------------------------------------------------------------------------
// Sağlam sayım girilince parça istasyonun konumuna girer (STK-U1); teslim edilen sayı kilitlidir (STK-U2). Adımın statüsünü Reçete ve
// Rota çözer: stok onu ithal edemez (o stoğu ithal eder), başlangıçta çözücüsünü kaydeder. Kayıt yokken parça statüsüz girer.
// kaliteDurumu: ilk parça kararı beklenirken sayılan parça stoğa karar bekliyor girer (131 b); hatalı parçanın şartlı kabulü şartlı (1211); yoksa serbest.
export interface UretimSayimiYansimasi {
  uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; fark: string; kaliteDurumu?: KaliteDurumu;
  refakatPartisiId?: number | null;
}
// Sayımın refakat kartı (#126): kart emre ait ve açık olmalı, yoksa sayım reddedilir (ret sayımı geri alır). Kartın lotu ve kartla
// sayılmış partiler önce kullanılır; kartsız sayımda liste boştur ve seçim bugünkü gibidir. Birleşmiş kolun kartı birleştiği karta
// yönlenir; kart kendi emrine yazılmışsa (birleşmeden önceki sayımın geri alınması) yönlenmez.
interface SayimKarti { id: number | null; partiler: readonly number[] }
async function sayimKarti(db: Db, uretimEmriId: number, refakatPartisiId: number | null | undefined): Promise<SayimKarti> {
  if (refakatPartisiId === null || refakatPartisiId === undefined) return { id: null, partiler: [] };
  const kendi = await sorgular.refakatPartisiBul(db, refakatPartisiId);
  const r = kendi !== null && kendi.uretimEmriId === uretimEmriId ? kendi : await sorgular.etkinRefakatPartisiBul(db, refakatPartisiId);
  const engel = refakatSayimEngeli(r, uretimEmriId, r === null ? null : (await uretimEmriOzeti(db, uretimEmriId))?.ustEmirId ?? null);
  if (engel !== null || r === null) throw dogrulama(engel ?? 'Refakat kartı bulunamadı.', 'refakatPartisiId');
  return { id: r.id, partiler: await sorgular.refakatStokPartileri(db, await sorgular.refakatSoyu(db, r.id)) };
}
// Soru 126 b: kartla sayımda malzeme kartın dışından düştüyse (kartın lotu istasyonda bitti) çıktı, malzemenin çoğunu veren partinin
// kartına girer: mal kabul lotuysa emrin o lotla açık kartı, yoksa yeni kart açılır; başka kartın çıktısıysa o kart. Not hareketin
// açıklamasına yazılır (depo yeni kartı basar). Kartsız ya da eşlenemeyen (kartsız emir partisi) malzeme kararı değiştirmez.
// Soru 129: kartsız sayımda kart aynı yolla bulunur (not yazılmaz); lotsuz düşüm (ISTISNA) istisna kartının payıdır.
const ISTISNA = 'istisna' as const;
type SarfPayi = Map<number | null | typeof ISTISNA, bigint>;
async function girisKarti(db: Db, y: UretimYazimi, paylar: ReadonlyMap<number | null | typeof ISTISNA, bigint>, istisnaId: number | null): Promise<{ id: number | null; not: string | null }> {
  const kendi = y.kart !== undefined && y.kart.id !== null ? { id: y.kart.id, partiler: y.kart.partiler } : null;
  const kartlar = new Map<string, bigint>();
  for (const [partiId, miktar] of paylar) {
    let k: string | null;
    if (partiId === ISTISNA) k = istisnaId === null ? null : `k:${istisnaId}`;
    else if (kendi !== null && (partiId === null || kendi.partiler.includes(partiId))) k = `k:${kendi.id}`;
    else k = partiId === null ? null : await partininKarti(db, y.uretimEmriId, partiId);
    k ??= kendi === null ? null : `k:${kendi.id}`;
    if (k !== null) kartlar.set(k, (kartlar.get(k) ?? 0n) + miktar);
  }
  const [secilen] = [...kartlar].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  if (secilen === undefined) return { id: kendi?.id ?? null, not: null };
  if (kendi !== null && secilen[0] === `k:${kendi.id}`) return { id: kendi.id, not: null };
  const [tur, deger] = secilen[0].split(':') as ['k' | 'l', string];
  let id = Number(deger);
  if (tur === 'l') {
    const lot = (await sorgular.partiBul(db, id))!;
    id = (await sorgular.acikRefakatPartisi(db, y.uretimEmriId, lot.id))?.id
      ?? await sorgular.refakatPartisiAc(db, { uretimEmriId: y.uretimEmriId, malzemeId: lot.malzemeId, partiId: lot.id, kisiId: y.kisiId })
      ?? (await sorgular.acikRefakatPartisi(db, y.uretimEmriId, lot.id))!.id;
  }
  if (kendi === null) return { id, not: null };
  const [eski, yeni] = await refakatPartileriCevir(db, [(await sorgular.refakatPartisiBul(db, kendi.id))!, (await sorgular.refakatPartisiBul(db, id))!]);
  if (id === istisnaId) return { id, not: `istisna kartı ${yeni!.etiket} (stokta yok; lot bekliyor)` };
  return { id, not: `yeni kart ${yeni!.etiket}, ${yeni!.lotNo ?? 'lot bekliyor'} (${eski!.etiket} lotu bitti; kartı basın)` };
}
// Kartın dışındaki partinin kartı: mal kabul lotu `l:<parti>` (kart açılabilir), emrin kartlı üretim partisi `k:<kart>`; kartsız parti null.
async function partininKarti(db: Db, uretimEmriId: number, partiId: number): Promise<string | null> {
  const p = await sorgular.partiKaynagi(db, partiId);
  if (p === null) return null;
  if (p.uretimEmriId === null) return `l:${partiId}`;
  if (p.refakatPartisiId === null || p.uretimEmriId !== uretimEmriId) return null;
  const r = await sorgular.refakatPartisiBul(db, p.refakatPartisiId);
  return r !== null && r.durum === 'acik' ? `k:${r.id}` : null;
}
// Sıralı listede kartın partileri öne alınır; kalanların sırası korunur.
// istasyon verilirse kart yalnız istasyonun içinde öne alınır: istasyondaki başka lot depodaki kart lotundan önce gelir, çünkü operatör
// istasyondakini işler (kartın lotu istasyonda bitince Soru 126 b: parça o lotun kartına girer).
const kartOnce = <T extends { partiId: number | null; konumId?: number }>(l: readonly T[], kart: SayimKarti | undefined, istasyon?: number): T[] => {
  if (kart === undefined || kart.partiler.length === 0) return [...l];
  const sira = (x: T) => (istasyon !== undefined && x.konumId !== istasyon ? 2 : 0) + (kart.partiler.includes(x.partiId ?? 0) ? 0 : 1);
  return [...l].sort((a, b) => sira(a) - sira(b));
};
export type AdimStatusuCozucusu = (db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null }) => Promise<number | null>;
// 1476-C: çok katmanlı emirde alt düğümün adımı emrin ürününün rotasında değil, düğümün malzemesinin rotasında kaynak op numarasıyladır.
// Çözücüye düğümün malzemesi ve rotadaki numarası gider; emir verilmez, çünkü Reçete ve Rota emrin (kök) revizyonunu okur, alt parçanın
// revizyonu o değildir; alt parça yürürlükteki revizyonundan çözülür. Düğümün son adımının çıktısı düğümün malzemesidir: alt parça stoğa
// girmeden tüketen adıma akar (1482 a). Kök düğümde ve tek katmanlı emirde çağrı olduğu gibi geçer.
const dugumlu = (cozucu: AdimStatusuCozucusu, cikti: boolean): AdimStatusuCozucusu => async (db, g) => {
  const d = g.uretimEmriId == null ? undefined : (await emirDugumleri(db, g.uretimEmriId)).get(g.opNo);
  if (d === undefined || d.dugum === '0') return cozucu(db, g);
  if (cikti && d.dugumSonu) return d.malzemeNo;
  return cozucu(db, { malzemeNo: d.malzemeNo, opNo: d.kaynakOpNo, uretimEmriId: null });
};
let adimStatusu: AdimStatusuCozucusu | null = null;
export function adimStatusuCozucusuKaydet(cozucu: AdimStatusuCozucusu): void { adimStatusu = dugumlu(cozucu, false); }
// Adımın çıktı kartı da Reçete ve Rota'dadır (rotanın "çıkan" kalemi); kayıt yokken her adım çıktısız sayılır.
let adimCiktisi: AdimStatusuCozucusu | null = null;
export function adimCiktisiCozucusuKaydet(cozucu: AdimStatusuCozucusu): void { adimCiktisi = dugumlu(cozucu, true); }
// Statü adları Reçete ve Rota'nındır; stok depocuya kendi ucundan verir (depocunun reçete-rota okuması yok). Kayıt yokken liste boştur
// (kablolama eksik bağda süreci zaten açmaz).
export type StatuListesiCozucusu = (db: Db) => Promise<StatulerCevabi['statuler']>;
let statuListesiCozucu: StatuListesiCozucusu | null = null;
export function statuListesiCozucusuKaydet(cozucu: StatuListesiCozucusu): void { statuListesiCozucu = cozucu; }
export async function statuler(db: Db): Promise<StatulerCevabi> {
  return { statuler: statuListesiCozucu ? await statuListesiCozucu(db) : [] };
}

// 1532 a (1333 a): dal adımında reçete miktarı mamul başınadır, adım mamul başına çarpan kadar parça işler; her girdi adımın kendi dal
// çarpanını bölen olarak taşır (adetMiktari). Çok katmanlı emirde (1476) alt düğümün bileşeni zaten alt parça başınadır: bölen yalnız
// düğümün kendi dal çarpanıdır (emirdeki çarpan / kök başına adet).
type AdimBilgisi = Omit<NonNullable<Awaited<ReturnType<typeof adimUretimBilgisi>>>, 'girdiler' | 'emirAdimlari'> & {
  girdiler: ReceteGirdisi[];
  emirAdimlari: (Omit<NonNullable<Awaited<ReturnType<typeof adimUretimBilgisi>>>['emirAdimlari'][number], 'girdiler'> & { girdiler: ReceteGirdisi[] })[];
};
async function adimBilgisi(db: Db, isEmriId: number): Promise<AdimBilgisi | null> {
  const b = await adimUretimBilgisi(db, isEmriId);
  if (b === null) return null;
  const dugumler = await emirDugumleri(db, b.uretimEmriId);
  const bolenli = (opNo: number, carpan: number | null, girdiler: readonly { malzemeNo: number; miktar: string }[]): ReceteGirdisi[] => {
    const bolen = Math.round((carpan ?? 1) / Number(dugumler.get(opNo)?.birimCarpani ?? 1));
    return girdiler.map((g) => (bolen > 1 ? { ...g, bolen } : { ...g }));
  };
  const emirAdimlari = b.emirAdimlari.map((a) => ({ ...a, girdiler: bolenli(a.opNo, a.adetCarpani, a.girdiler) }));
  const kendi = b.emirAdimlari.find((a) => a.opNo === b.opNo);
  return { ...b, emirAdimlari, girdiler: bolenli(b.opNo, kendi?.adetCarpani ?? null, b.girdiler) };
}
// Taşınan, en yakın çıktılı önceki adımın çıktısıdır (bir adet); çıktılı önceki adım yoksa ilk adımın ilk girdisi. Taşınan yoksa null:
// sayım eski yolla (yalnız ürün girişi) yansır.
// Çıktı emrin revizyonundan çözülür (1214 D-8): yürürlükteki rota sonradan değişse de açık emir statüsüyle aynı rotayı okur.
async function adimTasinani(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number,
): Promise<{ oncekiOpNo: number | null; tasinan: ReceteGirdisi | null; cikti: (opNo: number) => Promise<number | null> }> {
  const cikti = async (opNo: number) => (adimCiktisi === null ? null : adimCiktisi(db, { malzemeNo, opNo, uretimEmriId }));
  const oncekiOpNo = bilgi.oncekiOpNolari.at(-1) ?? null;
  let oncekiCikti: number | null = null;
  for (const op of [...bilgi.oncekiOpNolari].reverse()) {
    oncekiCikti = await cikti(op);
    if (oncekiCikti !== null) break;
  }
  return { oncekiOpNo, tasinan: oncekiCikti !== null ? { malzemeNo: oncekiCikti, miktar: '1' } : bilgi.tasinan, cikti };
}
// Dallı emirde (1348 a) adımın taşıdığı ve öncüllerinden gelen parçalar; öncül listesi olmayan emirde null (adimTasinani geçerli).
// Gelen parça öncülün çıktısıdır (statüsüz, bir adet) ya da öncülün taşıdığı malzemenin öncül statüsündeki hâli; adedi dal çarpanı oranıyla
// (1360): adımın bir adedine öncülden oran kadar parça gelir.
interface GelenParca { opNo: number; malzemeId: number; statuId: number | null; miktar: string; bolen?: number; oran?: GelenOrani }
interface DalliTasima { kaynak: TasimaKaynagi; tasinan: ReceteGirdisi | null; gelenler: GelenParca[] }
async function dalliTasima(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number,
): Promise<DalliTasima | null> {
  if (bilgi.onculOpNolari === null) return null;
  const dugumler = await emirDugumleri(db, uretimEmriId);
  const zincir = bilgi.emirAdimlari.map((a) => ({ ...a, dugum: dugumler.get(a.opNo)?.dugum ?? null }));
  const cikti = async (opNo: number) => (adimCiktisi === null ? null : adimCiktisi(db, { malzemeNo, opNo, uretimEmriId }));
  const statu = async (opNo: number) => (adimStatusu === null ? null : adimStatusu(db, { malzemeNo, opNo, uretimEmriId }));
  const tasinanlar = new Map<number, ReceteGirdisi | null>();
  const parca = async (opNo: number): Promise<GelenParca | null> => {
    const c = await cikti(opNo);
    if (c !== null) return { opNo, malzemeId: c, statuId: null, miktar: '1' };
    const t = await tasinanOf(opNo);
    return t === null ? null : { opNo, malzemeId: t.malzemeNo, statuId: await statu(opNo), miktar: t.miktar, ...(t.bolen === undefined ? {} : { bolen: t.bolen }) };
  };
  const tasinanOf = async (opNo: number): Promise<ReceteGirdisi | null> => {
    if (tasinanlar.has(opNo)) return tasinanlar.get(opNo)!;
    const k = tasimaKaynagi(zincir, opNo);
    let t: ReceteGirdisi | null = null;
    if (k?.tur === 'ilk') t = k.girdi;
    else if (k?.tur === 'birlesme') t = { malzemeNo: dugumler.get(opNo)?.malzemeNo ?? malzemeNo, miktar: '1' };
    else if (k?.tur === 'oncul') { const p = await parca(k.opNo); t = p === null ? null : { malzemeNo: p.malzemeId, miktar: p.miktar, ...(p.bolen === undefined ? {} : { bolen: p.bolen }) }; }
    tasinanlar.set(opNo, t);
    return t;
  };
  const kaynak = tasimaKaynagi(zincir, bilgi.opNo);
  if (kaynak === null) return null;
  const oncul = kaynak.tur === 'oncul' ? [kaynak.opNo] : kaynak.tur === 'birlesme' ? kaynak.opNolari : [];
  const adim = zincir.find((a) => a.opNo === bilgi.opNo) ?? {};
  const gelenler = (await Promise.all(oncul.map(parca))).filter((p): p is GelenParca => p !== null)
    .map((p) => ({ ...p, oran: gelenOrani(zincir.find((a) => a.opNo === p.opNo) ?? {}, adim) }));
  return { kaynak, tasinan: await tasinanOf(bilgi.opNo), gelenler };
}
async function adimPlaniKur(
  db: Db, uretimEmriId: number, malzemeNo: number, statuId: number | null, bilgi: AdimBilgisi, adet: bigint,
): Promise<UretimAdimPlani | null> {
  const dalli = await dalliTasima(db, malzemeNo, bilgi, uretimEmriId);
  if (dalli !== null) {
    if (dalli.tasinan === null && dalli.gelenler.length === 0) return null;
    const cikti = bilgi.sonAdim || adimCiktisi === null ? null : await adimCiktisi(db, { malzemeNo, opNo: bilgi.opNo, uretimEmriId });
    return dalliAdimPlani({
      adet, sonAdim: bilgi.sonAdim, statuId, cikti, girdiler: bilgi.girdiler, tasinan: dalli.tasinan ?? { malzemeNo, miktar: '1' }, gelenler: dalli.gelenler, kaynak: dalli.kaynak.tur,
    });
  }
  const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
  if (tasinan === null) return null;
  return uretimAdimPlani({
    adet, ilkAdim: oncekiOpNo === null, sonAdim: bilgi.sonAdim, statuId,
    oncekiStatuId: oncekiOpNo === null || adimStatusu === null ? null : await adimStatusu(db, { malzemeNo, opNo: oncekiOpNo, uretimEmriId }),
    oncekiCiktili: oncekiOpNo !== null && (await cikti(oncekiOpNo)) !== null,
    cikti: bilgi.sonAdim ? null : await cikti(bilgi.opNo), girdiler: bilgi.girdiler, tasinan,
  });
}

// Döner: sayım cevabına giden uyarı (yoksa null); sayım hiçbir uyarıda durmaz.
export async function uretimSayimiYansit(db: Db, g: UretimSayimiYansimasi): Promise<{ uyari: string | null }> {
  const yok = { uyari: null };
  const fark = binde(g.fark);
  if (fark === 0n) return yok;
  const kart = await sayimKarti(db, g.uretimEmriId, g.refakatPartisiId);
  const kalite: KaliteDurumu = g.kaliteDurumu ?? 'serbest';
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (!emir) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  // Adımsız eski emrin kartı yok; mamul ve yarı mamul dışı kart stoğa üretimle girmez (üretim girişiyle aynı kural).
  if (emir.malzemeNo === null) return yok;
  const malzemeId = emir.malzemeNo;
  const o = await malzemeOzeti(db, malzemeId);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return yok;
  const adim = g.isEmriId === null ? null : await isEmriOzeti(db, g.isEmriId);
  const statuId = adim === null || adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: malzemeId, opNo: adim.opNo, uretimEmriId: g.uretimEmriId });
  const konumId = await istasyonKonumuBul(db, g.istasyonId, 'istasyonId');
  const aciklama = `Üretim sayımı · emir ${emir.emirNo}${adim ? ` · OP ${String(adim.opNo)}` : ''}`;
  const bilgi = g.isEmriId === null ? null : await adimBilgisi(db, g.isEmriId);
  const plan = bilgi === null ? null : await adimPlaniKur(db, g.uretimEmriId, malzemeId, statuId, bilgi, fark > 0n ? fark : -fark);
  if (plan !== null) {
    const y: UretimYazimi = { uretimEmriId: g.uretimEmriId, kisiId: g.kisiId, konumId, malzemeId, aciklama, kalite, isEmriId: g.isEmriId, kart, uyarilar: new Set() };
    await korumali(async () => { if (fark > 0n) await uretimAdiminiYaz(db, y, plan); else await uretimAdiminiGeriAl(db, y, plan); });
    return { uyari: y.uyarilar!.size === 0 ? null : [...y.uyarilar!].join(' ') };
  }
  // Girdisiz rotada ara adım ürün girmez: emrin ürünü rotanın sonunda çıkar; yoksa her adımın sayımı mamulü yeniden ekler.
  if (bilgi !== null && !bilgi.sonAdim) return yok;
  await korumali(async () => {
    const bakiyeler = kartOnce(await sorgular.istasyondakiEmirBakiyeleri(db, konumId, malzemeId, g.uretimEmriId), kart);
    if (fark > 0n) {
      const plan = sayimArtisPlani(fark, statuId, bakiyeler, kalite);
      for (const d of plan.donusumler) await statuCevir(db, g.kisiId, { malzemeId, konumId, ...d, aciklama, uretimEmriId: g.uretimEmriId });
      if (plan.giris > 0n) {
        const partiId = await uretimPartisi(db, { malzemeId, uretimEmriId: g.uretimEmriId, refakatPartisiId: kart.id, kisiId: g.kisiId });
        const miktar = bindenMetin(plan.giris);
        await sorgular.hareketYaz(db, hareket({
          tur: 'giris', malzemeId, miktar, kisiId: g.kisiId, partiId, partiSecimi: 'giris', hedefKonumId: konumId, hedefStatuId: statuId,
          hedefKaliteDurumu: kalite, girisKaynagi: 'uretim', uretimEmriId: g.uretimEmriId, aciklama,
        }));
        await bakiyeDegistir(db, { malzemeId, konumId, partiId, statuId, kaliteDurumu: kalite, fark: plan.giris });
      }
      return;
    }
    const plan = sayimAzalisPlani(-fark, statuId, bakiyeler, await sorgular.netStatuDonusumleri(db, konumId, malzemeId, g.uretimEmriId, statuId), kalite);
    if (plan === null) {
      const edilen = await sorgular.konumdanTeslimEdilen(db, konumId, g.uretimEmriId);
      throw dogrulama(`${bindenMetin(binde(edilen))} adet teslim edildi; sayı bunun altına düşürülemez.`, 'saglamAdet');
    }
    for (const d of plan.donusumler) await statuCevir(db, g.kisiId, { malzemeId, konumId, ...d, aciklama, uretimEmriId: g.uretimEmriId });
    for (const x of plan.geriAlinacaklar) await uretimGirisiniDus(db, g.kisiId, { malzemeId, konumId, uretimEmriId: g.uretimEmriId, ...x, aciklama });
  });
  return yok;
}
// ---- Hurdanın girdisi (kart G1) ---------------------------------------------------------------------------------------------------
// Terminalde hurdaya ayrılan parçanın taşınan HM'si (reçetedeki adet miktarı, sağlam sayımdaki gibi yukarı yuvarlı) istasyondaki emrin
// stoğundan FİRE ÇIKIŞI olarak düşer; HM serbestte kalmaz. Seçim (ayrılan statüden fire çıkışı) yalnız hurdaHmDus ve hurdaHmGeriAl'dadır.
// Yetmeyen istasyonda eksiye fire yazılır (iş 558); eksi fark (hurda geri alma) bu hurdanın fire çıkışlarını geri alır.
// Parçanın HM'sinin arandığı statüler: önceki adımdan gelen statü, serbest, adım statüsü (ilk adımda önceki statü yoktur).
export interface HurdaSayimiYansimasi {
  uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; hurdaNedeniId: number; fark: string; refakatPartisiId?: number | null;
}
const HURDA_ACIKLAMASI = 'Hurda sayımı';

export async function hurdaSayimiYansit(db: Db, g: HurdaSayimiYansimasi): Promise<{ uyari: string | null }> {
  const yok = { uyari: null };
  const fark = binde(g.fark);
  if (fark === 0n) return yok;
  // Mamul hurdası üretimden giriş fişinin "Hurda" satırıdır; hareket yazılmasa da fiş değişir.
  await sorgular.emirFisiDegisti(db, g.uretimEmriId, 'uretim_girisi');
  if (g.isEmriId === null) return yok;
  const refakat = await sayimKarti(db, g.uretimEmriId, g.refakatPartisiId);
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return yok;
  const o = await malzemeOzeti(db, emir.malzemeNo);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return yok;
  const bilgi = await adimBilgisi(db, g.isEmriId);
  if (bilgi === null) return yok;
  const statuId = adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: emir.malzemeNo, opNo: bilgi.opNo, uretimEmriId: g.uretimEmriId });
  // Hurdaya giden parçalar: dallı emirde (1348 a) birleştirmede her dalın parçası, öteki adımda taşınan; adımın statüsü yalnız taşınanındır.
  const parcalar: { malzemeId: number; miktar: string; bolen?: number; statuler: (number | null)[]; oran?: GelenOrani }[] = [];
  const dalli = await dalliTasima(db, emir.malzemeNo, bilgi, g.uretimEmriId);
  if (dalli?.kaynak.tur === 'birlesme') {
    for (const p of dalli.gelenler) parcalar.push({ malzemeId: p.malzemeId, miktar: p.miktar, bolen: p.bolen, statuler: [p.statuId, null], oran: p.oran });
  } else if (dalli !== null) {
    const p = dalli.gelenler[0];
    if (dalli.tasinan !== null) parcalar.push({ malzemeId: dalli.tasinan.malzemeNo, miktar: dalli.tasinan.miktar, bolen: dalli.tasinan.bolen, statuler: [p?.statuId ?? null, null, statuId], ...(p ? { oran: p.oran } : {}) });
  } else {
    const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, emir.malzemeNo, bilgi, g.uretimEmriId);
    const oncekiStatuId = oncekiOpNo === null || adimStatusu === null || (await cikti(oncekiOpNo)) !== null
      ? null : await adimStatusu(db, { malzemeNo: emir.malzemeNo, opNo: oncekiOpNo, uretimEmriId: g.uretimEmriId });
    if (tasinan !== null) parcalar.push({ malzemeId: tasinan.malzemeNo, miktar: tasinan.miktar, statuler: [oncekiStatuId, null, statuId] });
  }
  const konumId = await istasyonKonumuBul(db, g.istasyonId, 'istasyonId');
  const uyarilar = new Set<string>();
  for (const p of parcalar) {
    if (!stoklanirMi((await malzemeOzeti(db, p.malzemeId))?.tur ?? '')) continue;
    const y: UretimYazimi = {
      uretimEmriId: g.uretimEmriId, isEmriId: g.isEmriId, kisiId: g.kisiId, konumId, malzemeId: p.malzemeId, aciklama: `${HURDA_ACIKLAMASI} · emir ${emir.emirNo} · OP ${String(bilgi.opNo)}`,
      kart: refakat, uyarilar,
    };
    const miktar = adetMiktari(oranliAdet(fark > 0n ? fark : -fark, p.oran), p.miktar, p.bolen);
    if (miktar === 0n) continue;
    await korumali(async () => {
      if (fark > 0n) await hurdaHmDus(db, y, miktar, [...new Set(p.statuler)]);
      else await hurdaHmGeriAl(db, y, miktar);
    });
  }
  return { uyari: uyarilar.size === 0 ? null : [...uyarilar].join(' ') };
}

async function hurdaHmDus(db: Db, y: UretimYazimi, miktar: bigint, statuAdaylari: readonly (number | null)[]): Promise<void> {
  let kalan = miktar;
  for (const statuId of statuAdaylari) {
    if (kalan <= 0n) break;
    const hak = await kullanilabilirStatu(db, y.malzemeId, statuId, y.uretimEmriId, kalan);
    const kaynaklar = kartOnce((await sorgular.uretimGirdiKaynaklari(db, y.malzemeId, statuId, y.konumId, y.uretimEmriId, false, true)).filter((k) => k.konumId === y.konumId), y.kart);
    for (const a of girdiSec(kaynaklar, kalan, hak)) {
      const anahtar = { malzemeId: y.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId, kaliteDurumu: a.kaliteDurumu };
      await siraliKilitle(db, anahtar);
      const eksik = await kilitliEksik(db, anahtar, a.miktar);
      if (eksik > 0n) y.uyarilar?.add(eksiUyarisi(eksik));
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: y.malzemeId, miktar: bindenMetin(a.miktar), kisiId: y.kisiId, partiId: a.partiId, partiSecimi: a.partiId === null ? null : 'en_eski',
        kaynakKonumId: a.konumId, kaynakStatuId: statuId, kaynakKaliteDurumu: a.kaliteDurumu, onayliEksi: eksik > 0n, cikisNedeni: 'fire', uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: y.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: y.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId, kaliteDurumu: a.kaliteDurumu, fark: -a.miktar });
      await rezerveDegistir(db, { malzemeId: y.malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: -a.miktar });
      kalan -= a.miktar;
    }
  }
  // İş 558: istasyonda yetmeyen hurda payı da sayımı durdurmaz; parçanın geldiği statüde eksiye fire yazılır.
  if (kalan > 0n) await istasyondaEksiDus(db, y, y.malzemeId, statuAdaylari[0] ?? null, kalan, 'fire');
}
async function hurdaHmGeriAl(db: Db, y: UretimYazimi, miktar: bigint): Promise<void> {
  await cikislariGeriAl(db, y, y.malzemeId, await sorgular.geriAlinmamisHurdaCikislari(db, y.uretimEmriId, y.malzemeId, y.konumId, HURDA_ACIKLAMASI), miktar, 'fire');
}

// Operatöre uyarı (kart #1289): sayım bu adımda stoktan malzeme düşemeyecekse nedeni; düşebilecekse null. Adımlı ürün emrinde girdisi
// hiç tanımlı değilse (taşınan da yok) sayım yalnız son adımda ürün girer; tanımlı girdi hiçbir yerde serbest değilse sarf yazılamaz.
// stokYok: yalnız stok eksikliği sorulur (sayımda; girdisiz uyarısı başlatmada bir kez söylenir).
export async function uretimGirdiUyarisi(db: Db, g: { uretimEmriId: number; isEmriId: number | null; istasyonId: number; stokYok?: boolean }): Promise<string | null> {
  const uyarilar = [await girdiStokUyarisi(db, g), await kaliteUyarisi(db, g)].filter((x): x is string => x !== null);
  return uyarilar.length === 0 ? null : uyarilar.join(' ');
}
// 135: red ve karar bekleyen parça üretimde durmaz, operatör her sayımda görür. Adımın parçası (numunedeki gibi) istasyonda red ya da
// karar bekliyorsa söylenir; o parçadan yapılan ürün de aynı durumu alır (138 a).
async function kaliteUyarisi(db: Db, g: { uretimEmriId: number; isEmriId: number | null; istasyonId: number }): Promise<string | null> {
  const konumId = await sorgular.istasyonKonumu(db, g.istasyonId);
  const parca = konumId === null ? null : await adimParcasi(db, g.uretimEmriId, g.isEmriId, 1n);
  if (konumId === null || parca === null) return null;
  const toplam = await sorgular.konumKaliteToplamlari(db, konumId, parca.malzemeId, parca.statuId);
  const red = toplam.find((x) => x.kaliteDurumu === 'red');
  const bekleyen = toplam.find((x) => x.kaliteDurumu === 'karar_bekliyor');
  const parcalar = [
    ...(red ? [`${bindenMetin(binde(red.miktar))} red`] : []),
    ...(bekleyen ? [`${bindenMetin(binde(bekleyen.miktar))} karar bekleyen`] : []),
  ];
  return parcalar.length === 0 ? null : `Bu istasyonda ${parcalar.join(' ve ')} parça var; bu parçadan yapılan ürün de aynı durumu alır. Kalite kararını bekleyin.`;
}
async function girdiStokUyarisi(db: Db, g: { uretimEmriId: number; isEmriId: number | null; istasyonId: number; stokYok?: boolean }): Promise<string | null> {
  if (g.isEmriId === null) return null;
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const urun = await malzemeOzeti(db, emir.malzemeNo);
  if (!urun || (urun.tur !== 'mamul' && urun.tur !== 'yarimamul')) return null;
  const bilgi = await adimBilgisi(db, g.isEmriId);
  if (bilgi === null) return null;
  if (bilgi.tasinan === null && bilgi.girdiler.length === 0) {
    return g.stokYok === true ? null : `OP ${String(bilgi.opNo)}: rotada girdi tanımlı değil; sayım stoktan malzeme düşmez. Reçete ve Rota'da ilk adıma girdi ekleyin.`;
  }
  const kartlar = await malzemeOzetleri(db, [...new Set(bilgi.girdiler.map((x) => x.malzemeNo))]);
  const konumId = (await sorgular.istasyonKonumu(db, g.istasyonId)) ?? 0;
  const yok: string[] = [];
  const teslimsiz: string[] = [];
  for (const m of new Set(bilgi.girdiler.map((x) => x.malzemeNo))) {
    const kart = kartlar.get(m);
    if (!stoklanirMi(kart?.tur ?? '')) continue;
    const kaynaklar = await sorgular.uretimGirdiKaynaklari(db, m, null, konumId, g.uretimEmriId);
    const ad = kart?.kod ?? kart?.ad ?? `#${String(m)}`;
    if (kaynaklar.every((k) => binde(k.serbest) <= 0n)) yok.push(ad);
    else if (!kaynaklar.some((k) => k.konumId === konumId && binde(k.serbest) > 0n)) teslimsiz.push(ad);
  }
  // 562 2 b: istasyona teslim edilmemiş girdi depodan düşülmez, istasyonda eksiye yazılır; operatör bunu başlatmada ve sayımda görür.
  const uyarilar = [
    ...(await tasinanTeslimUyarisi(db, emir.malzemeNo, bilgi, g.uretimEmriId, konumId)),
    ...(yok.length === 0 ? [] : [`OP ${String(bilgi.opNo)}: girdi stokta yok (${yok.join(', ')}); sayım istasyonda istisna kartıyla eksiye düşer. Malzemeyi istasyona teslim ettirin.`]),
    ...(teslimsiz.length === 0 ? [] : [`OP ${String(bilgi.opNo)}: girdi istasyona teslim edilmedi (${teslimsiz.join(', ')}); sayım depodan düşmez, istasyonda istisna kartıyla eksiye düşer. Malzemeyi teslim alın.`]),
  ];
  return uyarilar.length === 0 ? null : uyarilar.join(' ');
}
// İş 558: önceki adımın parçası K2 ve 562 gereği yalnız bu istasyondan alınır. Teslim edilmemişse sayım
// istasyonda eksiye düşer; operatör başlatmada ve sayımda görür.
async function tasinanTeslimUyarisi(
  db: Db, malzemeNo: number, bilgi: AdimBilgisi, uretimEmriId: number, konumId: number,
): Promise<string[]> {
  const dalli = await dalliTasima(db, malzemeNo, bilgi, uretimEmriId);
  let gelenler: GelenParca[] = dalli?.gelenler ?? [];
  if (dalli === null) {
    const { oncekiOpNo, tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
    if (oncekiOpNo === null || tasinan === null) return [];
    const statuId = adimStatusu === null || (await cikti(oncekiOpNo)) !== null ? null : await adimStatusu(db, { malzemeNo, opNo: oncekiOpNo, uretimEmriId });
    gelenler = [{ opNo: oncekiOpNo, malzemeId: tasinan.malzemeNo, statuId, miktar: tasinan.miktar }];
  }
  const uyarilar: string[] = [];
  for (const p of gelenler) {
    const kart = await malzemeOzeti(db, p.malzemeId);
    if (!stoklanirMi(kart?.tur ?? '')) continue;
    const kaynaklar = await sorgular.uretimGirdiKaynaklari(db, p.malzemeId, p.statuId, konumId, uretimEmriId, false, true);
    if (kaynaklar.some((k) => k.konumId === konumId && binde(k.serbest) > 0n)) continue;
    // Önceki adım henüz parça çıkarmadıysa söylenecek bir şey yoktur: parça başka yerde durmalı, statülüde emre ayrılmış olmalı.
    const baskaYerde = (await sorgular.uretimGirdiKaynaklari(db, p.malzemeId, p.statuId, konumId, uretimEmriId, true, false)).some((k) => binde(k.serbest) > 0n);
    if (!baskaYerde || (p.statuId !== null && ((await acikRezerveler(db, p.malzemeId, p.statuId)).get(uretimEmriId) ?? 0n) <= 0n)) continue;
    uyarilar.push(`OP ${String(bilgi.opNo)}: OP ${String(p.opNo)} parçası (${kart?.kod ?? kart?.ad ?? `#${String(p.malzemeId)}`}) bu istasyona teslim edilmedi; sayım istasyonda eksiye düşer. Parçayı teslim alın.`);
  }
  return uyarilar;
}
// kalite: sayımın kalite durumu; ürün bununla tüketilen girdinin en kötüsünü alır (138 a).
interface UretimYazimi {
  uretimEmriId: number; kisiId: number; konumId: number; malzemeId: number; aciklama: string; kalite?: KaliteDurumu; isEmriId?: number | null; kart?: SayimKarti;
  // Sayım cevabına giden uyarılar (Soru 129, 126 b): sayım durmaz, operatör ne olduğunu ekranda görür (Dal 11 sayım cevabında gösterir).
  uyarilar?: Set<string>;
}
// İş 558, 562: girdi yalnız bu istasyondan düşülür (kartın partileri önce); depo, kabul (fason dönüşü dahil) ve başka istasyon
// aranmaz. Yetmeyen sayımı durdurmaz, istasyonda eksiye yazılır; malzeme istasyona teslim edilince kapanır.
async function uretimKaynaklariSec(db: Db, y: UretimYazimi, malzemeId: number, statuId: number | null, istenen: bigint, hak: bigint) {
  const adaylar = (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, y.konumId, y.uretimEmriId, false, true))
    .filter((k) => k.konumId === y.konumId);
  return girdiSec(kartOnce(adaylar, y.kart), istenen, hak);
}
// Düşümden sonra istasyonda bu girdiden kalan: düşüm yetmediyse kalan başka emre ayrılı olduğu için alınamamıştır (1214 D-7).
async function istasyondaKalanGirdi(db: Db, y: UretimYazimi, malzemeId: number, statuId: number | null): Promise<bigint> {
  return (await sorgular.uretimGirdiKaynaklari(db, malzemeId, statuId, y.konumId, y.uretimEmriId, false, true))
    .filter((k) => k.konumId === y.konumId).reduce((t, k) => t + (binde(k.serbest) > 0n ? binde(k.serbest) : 0n), 0n);
}
// İş 558: istasyonda bulunmayan önceki adım parçası rotadaki miktarla istasyonda lotsuz onaylı eksi düşülür; parça sonradan istasyona
// teslim edilince statünün toplamı düzelir. İstisna kartı yalnız statüsüz sarfındır (lotsuzDus): lota bağlama statülüyü bilmez.
async function istasyondaEksiDus(db: Db, y: UretimYazimi, malzemeId: number, statuId: number | null, miktar: bigint, cikisNedeni: 'uretime_sarf' | 'fire'): Promise<void> {
  const baskaEmreAyrili = await istasyondaKalanGirdi(db, y, malzemeId, statuId);
  await siraliKilitle(db, { malzemeId, konumId: y.konumId, partiId: null, statuId });
  await sorgular.hareketYaz(db, hareket({
    tur: 'cikis', malzemeId, miktar: bindenMetin(miktar), kisiId: y.kisiId, kaynakKonumId: y.konumId, kaynakStatuId: statuId, onayliEksi: true, kaynakKaliteDurumu: 'serbest',
    cikisNedeni, uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: `${y.aciklama} · istasyonda yok, eksiye düşüldü`.slice(0, 200),
  }));
  await bakiyeDegistir(db, { malzemeId, konumId: y.konumId, partiId: null, statuId, kaliteDurumu: 'serbest', fark: -miktar });
  await rezerveDegistir(db, { malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: -miktar });
  y.uyarilar?.add(eksidenUyari({ ilkAdim: false, eksik: miktar, baskaEmreAyrili, fiil: 'düşüldü' }));
}
// Lotsuz eksi düşüm (Soru 129, 131 a): istasyonda partisiz eksi bakiye kalır; hareket emrin o malzemedeki açık istisna kartına bağlanır
// (yoksa açılır). Eksi kişinin sayımıyla yazıldığı için onaylı eksidir. Döner: istisna kartı.
async function lotsuzDus(db: Db, y: UretimYazimi, malzemeId: number, miktar: bigint): Promise<number> {
  const kartId = (await sorgular.acikIstisnaKarti(db, y.uretimEmriId, malzemeId))?.id
    ?? await sorgular.istisnaKartiAc(db, { uretimEmriId: y.uretimEmriId, malzemeId, kisiId: y.kisiId })
    ?? (await sorgular.acikIstisnaKarti(db, y.uretimEmriId, malzemeId))!.id;
  const etiket = (await refakatPartileriCevir(db, [(await sorgular.refakatPartisiBul(db, kartId))!]))[0]!.etiket;
  await siraliKilitle(db, { malzemeId, konumId: y.konumId, partiId: null });
  const hareketId = await sorgular.hareketYaz(db, hareket({
    tur: 'cikis', malzemeId, miktar: bindenMetin(miktar), kisiId: y.kisiId, kaynakKonumId: y.konumId, onayliEksi: true, kaynakKaliteDurumu: 'serbest',
    cikisNedeni: 'uretime_sarf', uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: `${y.aciklama} · stokta yok, istisna kartı ${etiket}`.slice(0, 200),
  }));
  await bakiyeDegistir(db, { malzemeId, konumId: y.konumId, partiId: null, statuId: null, kaliteDurumu: 'serbest', fark: -miktar });
  await rezerveDegistir(db, { malzemeId, statuId: null, uretimEmriId: y.uretimEmriId, fark: -miktar });
  await sorgular.istisnaDusumuYaz(db, kartId, hareketId);
  y.uyarilar?.add(`Stokta yok; istisna kartı ${etiket} açıldı. Depo kartı lota bağlar.`);
  return kartId;
}

async function elleSarfMahsubuOku(db: Db, uretimEmriId: number, malzemeId: number, istenen: bigint): Promise<bigint> {
  const sarf = await sorgular.emrinStatusuzSarfi(db, uretimEmriId, malzemeId);
  if (binde(sarf.elle) <= 0n) return 0n;
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, uretimEmriId)) ?? []).map((m) => ({ malzemeId: m.malzemeNo, brut: m.brut }))).get(malzemeId) ?? null;
  return elleSarfMahsubu({ istenen, elle: binde(sarf.elle), net: binde(sarf.net), ihtiyac });
}
// Artış: girdiler yalnız istasyondan emre sarf edilir, taşınan malzeme adımın statüsüne istasyonda çevrilir; çıktılı
// ve son adımda çıktı (son adımda emrin ürünü) emir partisiyle istasyona girer. Yetmeyen girdi istasyonda eksiye düşülür (iş 558, 562 2 b).
// Döner: konuma giren son hareket (çıktı girişi ya da statü çevirme); yalnız sarf varsa null.
async function uretimAdiminiYaz(db: Db, y: UretimYazimi, plan: UretimAdimPlani): Promise<number | null> {
  let giren: number | null = null;
  let kalite: KaliteDurumu = y.kalite ?? 'serbest';
  let istisnaId: number | null = null;
  const sarfPayi: SarfPayi = new Map();
  const cevirmePayi: SarfPayi = new Map();
  const pay = (m: SarfPayi, partiId: number | null | typeof ISTISNA, miktar: bigint) => { m.set(partiId, (m.get(partiId) ?? 0n) + miktar); };
  for (const s of plan.sarflar) {
    const istenen = s.statuId === null ? s.miktar - await elleSarfMahsubuOku(db, y.uretimEmriId, s.malzemeId, s.miktar) : s.miktar;
    if (istenen <= 0n) continue;
    const hak = await kullanilabilirStatu(db, s.malzemeId, s.statuId, y.uretimEmriId, istenen);
    let dusulen = 0n;
    for (const a of await uretimKaynaklariSec(db, y, s.malzemeId, s.statuId, istenen, hak)) {
      const anahtar = { malzemeId: s.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId: s.statuId, kaliteDurumu: a.kaliteDurumu };
      await siraliKilitle(db, anahtar);
      const eksik = await kilitliEksik(db, anahtar, a.miktar);
      if (eksik > 0n) y.uyarilar?.add(eksiUyarisi(eksik));
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: s.malzemeId, miktar: bindenMetin(a.miktar), kisiId: y.kisiId, partiId: a.partiId, partiSecimi: a.partiId === null ? null : 'en_eski',
        kaynakKonumId: a.konumId, kaynakStatuId: s.statuId, kaynakKaliteDurumu: a.kaliteDurumu, onayliEksi: eksik > 0n, cikisNedeni: 'uretime_sarf', uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null,
        aciklama: y.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: s.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId: s.statuId, kaliteDurumu: a.kaliteDurumu, fark: -a.miktar });
      await rezerveDegistir(db, { malzemeId: s.malzemeId, statuId: s.statuId, uretimEmriId: y.uretimEmriId, fark: -a.miktar });
      kalite = enKotuKalite(kalite, a.kaliteDurumu);
      pay(sarfPayi, a.partiId, a.miktar);
      dusulen += a.miktar;
    }
    // Soru 129, 562 2 b: istasyonda yetmeyen hammadde istisna kartıyla, önceki adımın parçası (558) kartsız eksi düşülür; sayım durmaz.
    if (dusulen < istenen && s.statuId === null) {
      istisnaId = await lotsuzDus(db, y, s.malzemeId, istenen - dusulen);
      pay(sarfPayi, ISTISNA, istenen - dusulen);
    } else if (dusulen < istenen) {
      await istasyondaEksiDus(db, y, s.malzemeId, s.statuId, istenen - dusulen, 'uretime_sarf');
      pay(sarfPayi, null, istenen - dusulen);
    }
  }
  const c = plan.cevirme;
  if (c !== null) {
    const hak = await kullanilabilirStatu(db, c.malzemeId, c.kaynakStatuId, y.uretimEmriId, c.miktar);
    let cevrilen = 0n;
    for (const a of await uretimKaynaklariSec(db, y, c.malzemeId, c.kaynakStatuId, c.miktar, hak)) {
      giren = await statuTasi(db, y.kisiId, {
        malzemeId: c.malzemeId, partiId: a.partiId, kaynakKonumId: a.konumId, hedefKonumId: y.konumId, kaynakStatuId: c.kaynakStatuId, hedefStatuId: c.hedefStatuId,
        kaynakKalite: a.kaliteDurumu, hedefKalite: enKotuKalite(kalite, a.kaliteDurumu), miktar: a.miktar, aciklama: y.aciklama, uretimEmriId: y.uretimEmriId,
      });
      kalite = enKotuKalite(kalite, a.kaliteDurumu);
      pay(cevirmePayi, a.partiId, a.miktar);
      cevrilen += a.miktar;
    }
    // İş 558: istasyonda yetmeyen parça lotsuz eksiden çevrilir (kaynak statü eksiye düşer, adım statüsü artar).
    if (cevrilen < c.miktar) {
      const eksik = c.miktar - cevrilen;
      const baskaEmreAyrili = await istasyondaKalanGirdi(db, y, c.malzemeId, c.kaynakStatuId);
      giren = await statuTasi(db, y.kisiId, {
        malzemeId: c.malzemeId, partiId: null, kaynakKonumId: y.konumId, hedefKonumId: y.konumId, kaynakStatuId: c.kaynakStatuId, hedefStatuId: c.hedefStatuId,
        hedefKalite: kalite, miktar: eksik, aciklama: `${y.aciklama} · istasyonda yok, eksiden çevrildi`.slice(0, 200), uretimEmriId: y.uretimEmriId,
      });
      pay(cevirmePayi, null, eksik);
      y.uyarilar?.add(eksidenUyari({ ilkAdim: c.tasinan !== true, eksik, baskaEmreAyrili, fiil: 'çevrildi' }));
    }
  }
  if (plan.giris !== null) {
    const malzemeId = plan.giris.malzemeId ?? y.malzemeId;
    const hedef = await girisKarti(db, y, cevirmePayi.size > 0 ? cevirmePayi : sarfPayi, istisnaId);
    if (hedef.not !== null && hedef.id !== istisnaId) y.uyarilar?.add(`Parça ${hedef.not.charAt(0).toLocaleUpperCase('tr')}${hedef.not.slice(1)} kartına girdi; yeni kartı ve malzemeyi teslim alın.`);
    const partiId = await uretimPartisi(db, { malzemeId, uretimEmriId: y.uretimEmriId, refakatPartisiId: hedef.id, kisiId: y.kisiId });
    const statuId = plan.giris.statuId ?? null;
    giren = await sorgular.hareketYaz(db, hareket({
      tur: 'giris', malzemeId, miktar: bindenMetin(plan.giris.miktar), kisiId: y.kisiId, partiId, partiSecimi: 'giris', hedefKonumId: y.konumId, hedefStatuId: statuId,
      hedefKaliteDurumu: kalite, girisKaynagi: 'uretim', uretimEmriId: y.uretimEmriId, aciklama: hedef.not === null ? y.aciklama : `${y.aciklama} · ${hedef.not}`.slice(0, 200),
    }));
    await bakiyeDegistir(db, { malzemeId, konumId: y.konumId, partiId, statuId, kaliteDurumu: kalite, fark: plan.giris.miktar });
    // Statüye giren ürün, statüye çevrilen parça gibi emre ayrılır (sonraki adım onu kendi rezervesinden alır).
    if (statuId !== null) await rezerveDegistir(db, { malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: plan.giris.miktar });
  }
  return giren;
}

// Azalış artışın tersidir: önce ürün girişi geri alınır (teslim edilen kilitlidir), sonra statü geri çevrilir (istasyonda kalan kadar),
// en son sarflar en yenisinden geri alınır.
async function uretimAdiminiGeriAl(db: Db, y: UretimYazimi, plan: UretimAdimPlani): Promise<void> {
  if (plan.giris !== null) {
    const malzemeId = plan.giris.malzemeId ?? y.malzemeId;
    const statuId = plan.giris.statuId ?? null;
    const p = sayimAzalisPlani(plan.giris.miktar, statuId, kartOnce(await sorgular.istasyondakiEmirBakiyeleri(db, y.konumId, malzemeId, y.uretimEmriId), y.kart), [], y.kalite);
    if (p === null) {
      const edilen = await sorgular.konumdanTeslimEdilen(db, y.konumId, y.uretimEmriId);
      throw dogrulama(`${bindenMetin(binde(edilen))} adet teslim edildi; sayı bunun altına düşürülemez.`, 'saglamAdet');
    }
    for (const x of p.geriAlinacaklar) await uretimGirisiniDus(db, y.kisiId, { malzemeId, konumId: y.konumId, uretimEmriId: y.uretimEmriId, ...x, aciklama: y.aciklama });
    if (statuId !== null) await rezerveDegistir(db, { malzemeId, statuId, uretimEmriId: y.uretimEmriId, fark: -plan.giris.miktar });
  }
  const c = plan.cevirme;
  if (c !== null) {
    const q = y.kalite ?? 'serbest';
    const istasyonda = kartOnce((await sorgular.uretimGirdiKaynaklari(db, c.malzemeId, c.hedefStatuId, y.konumId, y.uretimEmriId, false, true))
      .filter((k) => k.konumId === y.konumId), y.kart).sort((a, b) => Number(b.kaliteDurumu === q) - Number(a.kaliteDurumu === q));
    for (const a of kaynaklardanAl(istasyonda, c.miktar)) {
      // 1214 O-1: parça ileri çevrilmeden önceki kalitesine döner; lotsuz eksiden çevrilen serbest eksiyi kapatır.
      const ileri = await sorgular.emrinStatuCevirmeleri(db, {
        uretimEmriId: y.uretimEmriId, malzemeId: c.malzemeId, konumId: y.konumId, partiId: a.partiId, kaynakStatuId: c.kaynakStatuId, hedefStatuId: c.hedefStatuId, hedefKalite: a.kaliteDurumu,
      });
      const kaliteler = geriCevirmeKaliteleri(ileri.ileri.map((h) => ({ miktar: binde(h.miktar), kaynakKalite: h.kaynakKalite })), binde(ileri.geriCevrilen), a.miktar, a.kaliteDurumu);
      for (const k of kaliteler) {
        await statuTasi(db, y.kisiId, {
          malzemeId: c.malzemeId, partiId: a.partiId, kaynakKonumId: y.konumId, hedefKonumId: y.konumId, kaynakStatuId: c.hedefStatuId, hedefStatuId: c.kaynakStatuId,
          kaynakKalite: a.kaliteDurumu, hedefKalite: k.kalite, miktar: k.miktar, aciklama: y.aciklama, uretimEmriId: y.uretimEmriId,
        });
      }
    }
  }
  for (const s of plan.sarflar) await sarfiGeriAl(db, y, s.malzemeId, s.miktar);
}

// Statüdeki malzeme statüye geçiren emre ayrılır (rezerve). Ayrılan konumdan bağımsızdır; yalnız açık emrinki sayılır: emir kapanınca
// ya da iptal edilince ayrılanı kendiliğinden kalkar.
async function acikRezerveler(db: Db, malzemeId: number, statuId: number | null): Promise<Map<number, bigint>> {
  const satirlar = (await sorgular.rezerveler(db, [malzemeId])).filter((r) => r.statuId === statuId);
  const durumlar = await emirDurumlari(db, satirlar.map((r) => r.uretimEmriId));
  const acik = satirlar.filter((r) => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(r.uretimEmriId) ?? ''));
  return new Map(acik.map((r) => [r.uretimEmriId, binde(r.miktar)]));
}
// Emrin bu statüden (null: serbest stoktan) kullanabileceği: toplamdan başka açık emirlere ayrılan düşülür. Emir verilmezse bütün ayrılan
// düşülür.
async function kullanilabilirStatu(db: Db, malzemeId: number, statuId: number | null, uretimEmriId: number | null, istenen: bigint): Promise<bigint> {
  const toplam = binde(await sorgular.statuToplami(db, malzemeId, statuId));
  let diger = 0n;
  for (const [emir, m] of await acikRezerveler(db, malzemeId, statuId)) if (emir !== uretimEmriId) diger += m;
  return rezerveSiniri(toplam, diger, istenen);
}
// Rezerve, kaldırılmadıkça o emrindir: başka emre kullanım, teslim ya da emirsiz çıkış yalnız ayrılmamış kısımdan olur. Yer değiştiren
// teslim (emirsiz) ayrılanı bozmaz; ayrılan konumdan bağımsızdır.
async function rezerveyiAsmasin(db: Db, malzemeId: number, statuId: number | null, uretimEmriId: number | null, miktar: bigint): Promise<void> {
  // Denetim #35: aynı malzemenin iki eşzamanlı düşümü ayrılmamış miktarı birlikte okuyup ayrılanı yiyemez; ikinci, ilk işlem bitince okur.
  await sorgular.rezerveKilidi(db, malzemeId);
  // Başka emre ayrılan yoksa sınır stok yeterliliğidir (onaylı eksi düşüm dahil), rezerve değil.
  if (![...(await acikRezerveler(db, malzemeId, statuId))].some(([emir, m]) => emir !== uretimEmriId && m > 0n)) return;
  const kullanilabilir = await kullanilabilirStatu(db, malzemeId, statuId, uretimEmriId, miktar);
  if (kullanilabilir < miktar) {
    const yer = statuId === null ? 'Serbest stokta' : 'Bu statüde';
    throw dogrulama(`${yer} ${uretimEmriId === null ? 'emirlere' : 'başka emirlere'} ayrılmamış ${bindenMetin(kullanilabilir)} var; fazlası rezerveli; rezerveyi Stok Merkezi'nde müdür kaldırır.`, 'miktar');
  }
}
async function rezerveDegistir(db: Db, d: { malzemeId: number; statuId: number | null; uretimEmriId: number | null | undefined; fark: bigint }): Promise<void> {
  if (d.uretimEmriId === undefined || d.uretimEmriId === null || d.fark === 0n) return;
  const r = { malzemeId: d.malzemeId, statuId: d.statuId, uretimEmriId: d.uretimEmriId, miktar: bindenMetin(d.fark < 0n ? -d.fark : d.fark) };
  if (d.fark > 0n) await sorgular.rezerveArtir(db, r);
  else await sorgular.rezerveAzalt(db, r);
}

// ---- Emir açılışında ve mal kabulde serbest stoktan ayırma (kullanıcı kararı 2026-10-15) ----------------------------------------
// Emrin bekleyeni: girdi ihtiyacından emre ayrılan (her statüde) ve emre net sarf edilen düşülür. Yalnız açılışta "Stoktan rezerve et"
// denen açık emir bekler.
async function emrinBekleyeni(db: Db, uretimEmriId: number, yalniz?: number): Promise<Map<number, bigint>> {
  // Tamamlamadaki ihtiyaçla aynı yuvarlanır; yoksa tam rezerve görünen emir tamamlamada 0,001 eksik çıkar.
  const ihtiyac = ihtiyacToplami(((await emirMalzemeIhtiyaci(db, uretimEmriId)) ?? [])
    .filter((x) => yalniz === undefined || x.malzemeNo === yalniz).map((x) => ({ malzemeId: x.malzemeNo, brut: x.brut })));
  const sonuc = new Map<number, bigint>();
  if (ihtiyac.size === 0) return sonuc;
  const ayrilan = await sorgular.rezerveler(db, [...ihtiyac.keys()]);
  for (const [malzemeId, gereken] of ihtiyac) {
    let kapsanan = binde(await sorgular.emrinNetSarfi(db, uretimEmriId, malzemeId));
    for (const r of ayrilan) if (r.malzemeId === malzemeId && r.uretimEmriId === uretimEmriId) kapsanan += binde(r.miktar);
    if (gereken > kapsanan) sonuc.set(malzemeId, gereken - kapsanan);
  }
  return sonuc;
}
async function serbesttenAyir(db: Db, kisiId: number, uretimEmriId: number, malzemeId: number, istenen: bigint, neden: string): Promise<bigint> {
  await sorgular.rezerveKilidi(db, malzemeId);
  const bos = await kullanilabilirStatu(db, malzemeId, null, null, istenen);
  const miktar = bos < istenen ? bos : istenen;
  if (miktar <= 0n) return 0n;
  await sorgular.rezerveArtir(db, { malzemeId, statuId: null, uretimEmriId, miktar: bindenMetin(miktar) });
  await sorgular.rezerveKaydiYaz(db, { malzemeId, statuId: null, uretimEmriId, tur: 'ayir', miktar: bindenMetin(miktar), neden, kisiId });
  return miktar;
}
async function emreRezerveEt(db: Db, kisiId: number, uretimEmriId: number): Promise<void> {
  // Kilitler malzeme sırasıyla alınır: iki işlem aynı malzemeleri ters sırada kilitleyip birbirini beklemez.
  for (const [malzemeId, bekleyen] of [...await emrinBekleyeni(db, uretimEmriId)].sort(([a], [b]) => a - b)) await serbesttenAyir(db, kisiId, uretimEmriId, malzemeId, bekleyen, 'Emir açılışı');
}
// Bekleyen emirler sırası: önce talepte seçilen emir, sonra öncelik (1 acil), termin (boş en sonda), açılış (kimlik sırası).
async function bekleyenEmirler(db: Db, malzemeId: number, onde: ReadonlySet<number> = new Set()): Promise<{ uretimEmriId: number; emirNo: string; bekleyen: bigint }[]> {
  const adaylar: { uretimEmriId: number; emirNo: string; bekleyen: bigint; oncelik: number; teslim: string | null }[] = [];
  // Talepte seçilen emir, açılışta rezerve istemese de bu malzemeyi bekler: alım onun için yapıldı.
  for (const id of new Set([...await sorgular.rezerveIsteyenEmirler(db), ...onde])) {
    const e = await uretimEmriOzeti(db, id);
    if (!e || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(e.durum)) continue;
    const bekleyen = (await emrinBekleyeni(db, id, malzemeId)).get(malzemeId);
    if (bekleyen !== undefined) adaylar.push({ uretimEmriId: id, emirNo: e.emirNo, bekleyen, oncelik: e.oncelik, teslim: e.teslim });
  }
  return adaylar.sort((a, b) => Number(onde.has(b.uretimEmriId)) - Number(onde.has(a.uretimEmriId)) || a.oncelik - b.oncelik
    || (a.teslim ?? '9999-12-31').localeCompare(b.teslim ?? '9999-12-31') || a.uretimEmriId - b.uretimEmriId);
}
async function bekleyenlereDagit(db: Db, kisiId: number, malzemeIdler: readonly number[], onde: ReadonlyMap<number, ReadonlySet<number>> = new Map()): Promise<void> {
  for (const malzemeId of [...new Set(malzemeIdler)].sort((a, b) => a - b)) {
    for (const e of await bekleyenEmirler(db, malzemeId, onde.get(malzemeId))) {
      if ((await serbesttenAyir(db, kisiId, e.uretimEmriId, malzemeId, e.bekleyen, 'Mal kabul')) < e.bekleyen) break;
    }
  }
}
// Emir açıldı olayı (sunucu/kablolama.ts bağlar).
export async function emirAcildiYansit(db: Db, olay: { uretimEmriId: number; kisiId: number; stoktanRezerve: boolean }): Promise<void> {
  // Emrin sarf, üretimden giriş ve fire fişi emirle birlikte boş açılır (294 c).
  await sorgular.emirFisleriniAc(db, olay.uretimEmriId);
  if (!olay.stoktanRezerve) return;
  await sorgular.emirRezerveIstegiYaz(db, olay.uretimEmriId, olay.kisiId);
  await emreRezerveEt(db, olay.kisiId, olay.uretimEmriId);
}


export async function rezerveListesi(db: Db, malzemeId: number): Promise<RezervelerCevabi> {
  const satirlar = await sorgular.rezerveler(db, [malzemeId]);
  const durumlar = await emirDurumlari(db, satirlar.map((r) => r.uretimEmriId));
  const acik = satirlar.filter((r) => (ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(r.uretimEmriId) ?? ''));
  const nolar = await emirNolari(db, acik.map((r) => r.uretimEmriId));
  return { rezerveler: acik.map((r) => ({ statuId: r.statuId, uretimEmriId: r.uretimEmriId, emirNo: nolar.get(r.uretimEmriId) ?? null, miktar: r.miktar })) };
}

// Elle ayırma: emir açık olmalı ve statü o emrin rotasındaki bir adımın statüsü olmalı; ayrılan, statüde kimseye ayrılmamış kadar olabilir.
export async function rezerveEt(db: Db, kisiId: number, g: RezerveEtKomutu): Promise<RezervelerCevabi> {
  const malzemeId = Number(g.malzemeId), statuId = Number(g.statuId), uretimEmriId = Number(g.uretimEmriId);
  const miktar = binde(g.miktar);
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (!emir || !(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) throw dogrulama('Açık üretim emri bulunamadı.', 'uretimEmriId');
  const urun = emir.malzemeNo;
  const oplar = urun === null || adimStatusu === null ? [] : (await adimliEmirAyrintisi(db, uretimEmriId)).isEmirleri.map((i) => i.opNo);
  let rotada = false;
  for (const opNo of oplar) if ((await adimStatusu!(db, { malzemeNo: urun!, opNo, uretimEmriId })) === statuId) { rotada = true; break; }
  if (!rotada) throw dogrulama('Bu statü bu emrin rotasında yok; statü ürün ve OP\'ye aittir.', 'statuId');
  await korumali(async () => {
    await sorgular.rezerveKilidi(db, malzemeId);
    const bos = await kullanilabilirStatu(db, malzemeId, statuId, null, miktar);
    if (bos < miktar) throw dogrulama(`Statüde ayrılmamış ${bindenMetin(bos)} var; daha fazlası ayrılamaz.`, 'miktar');
    await sorgular.rezerveArtir(db, { malzemeId, statuId, uretimEmriId, miktar: bindenMetin(miktar) });
    await sorgular.rezerveKaydiYaz(db, { malzemeId, statuId, uretimEmriId, tur: 'ayir', miktar: bindenMetin(miktar), neden: null, kisiId });
  });
  return rezerveListesi(db, malzemeId);
}

// Kaldırılan malzeme statüsünü korur; aynı ürün + OP'nin başka emri kullanabilir.
export async function rezerveKaldir(db: Db, kisiId: number, g: RezerveKaldirKomutu): Promise<RezervelerCevabi> {
  const malzemeId = Number(g.malzemeId), statuId = g.statuId === null ? null : Number(g.statuId), uretimEmriId = Number(g.uretimEmriId);
  await korumali(async () => {
    await sorgular.rezerveKilidi(db, malzemeId);
    const mevcut = (await acikRezerveler(db, malzemeId, statuId)).get(uretimEmriId) ?? 0n;
    if (mevcut <= 0n) throw bulunamadi('Bu emre ayrılmış malzeme yok.');
    const miktar = g.miktar === undefined ? mevcut : binde(g.miktar);
    if (miktar > mevcut) throw dogrulama(`Bu emre ayrılan ${bindenMetin(mevcut)}; daha fazlası kaldırılamaz.`, 'miktar');
    await sorgular.rezerveAzalt(db, { malzemeId, statuId, uretimEmriId, miktar: bindenMetin(miktar) });
    await sorgular.rezerveKaydiYaz(db, { malzemeId, statuId, uretimEmriId, tur: 'kaldir', miktar: bindenMetin(miktar), neden: g.neden, kisiId });
  });
  return rezerveListesi(db, malzemeId);
}

// Statü değişimi, istenirse konum değişimiyle birlikte (önceki adımın çıktısı başka istasyondan alınır). Emir kimliği hareketi emre
// bağlar: Akış Süresi statüde kalışı emrin hareketlerinden okur (tedarikçi partisi emre ait değildir).
async function statuTasi(db: Db, kisiId: number, d: {
  malzemeId: number; partiId: number | null; kaynakKonumId: number; hedefKonumId: number; kaynakStatuId: number | null; hedefStatuId: number | null;
  kaynakKalite?: KaliteDurumu; hedefKalite?: KaliteDurumu; miktar: bigint; aciklama: string; uretimEmriId?: number;
}): Promise<number> {
  const kq = d.kaynakKalite ?? 'serbest', hq = d.hedefKalite ?? 'serbest';
  const kaynak = { malzemeId: d.malzemeId, konumId: d.kaynakKonumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq };
  await siraliKilitle(db, kaynak, { malzemeId: d.malzemeId, konumId: d.hedefKonumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq });
  const id = await sorgular.hareketYaz(db, hareket({
    tur: 'transfer', malzemeId: d.malzemeId, miktar: bindenMetin(d.miktar), kisiId, partiId: d.partiId, partiSecimi: d.partiId === null ? null : 'kisi',
    kaynakKonumId: d.kaynakKonumId, hedefKonumId: d.hedefKonumId, kaynakStatuId: d.kaynakStatuId, hedefStatuId: d.hedefStatuId,
    kaynakKaliteDurumu: kq, hedefKaliteDurumu: hq, onayliEksi: await kilitliEksik(db, kaynak, d.miktar) > 0n, uretimEmriId: d.uretimEmriId ?? null, aciklama: d.aciklama,
  }));
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.kaynakKonumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq, fark: -d.miktar });
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.hedefKonumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq, fark: d.miktar, ilkGiris: new Date().toISOString() });
  if (d.kaynakStatuId !== d.hedefStatuId) {
    await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.kaynakStatuId, uretimEmriId: d.uretimEmriId, fark: -d.miktar });
    await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.hedefStatuId, uretimEmriId: d.uretimEmriId, fark: d.miktar });
  }
  return id;
}

// Emrin sarfı en yenisinden bütün hareket olarak geri alınır; fazlası aynı yerden yeniden sarf edilir. Geri alınacak sarf yoksa bulunan kadarı.
async function sarfiGeriAl(db: Db, y: UretimYazimi, malzemeId: number, miktar: bigint): Promise<void> {
  await cikislariGeriAl(db, y, malzemeId, await sorgular.geriAlinmamisSarflar(db, y.uretimEmriId, malzemeId), miktar, 'uretime_sarf');
}
async function cikislariGeriAl(
  db: Db, y: UretimYazimi, malzemeId: number, cikislar: { id: number; miktar: string; konumId: number; partiId: number | null; statuId: number | null; kaliteDurumu: KaliteDurumu }[],
  miktar: bigint, cikisNedeni: 'uretime_sarf' | 'fire',
): Promise<void> {
  let kalan = miktar;
  for (const h of cikislar) {
    if (kalan <= 0n) break;
    const m = binde(h.miktar);
    const q = h.kaliteDurumu;
    await siraliKilitle(db, { malzemeId, konumId: h.konumId, partiId: h.partiId, statuId: h.statuId, kaliteDurumu: q });
    await sorgular.hareketYaz(db, hareket({
      tur: 'geri_alma', malzemeId, miktar: h.miktar, kisiId: y.kisiId, partiId: h.partiId, partiSecimi: h.partiId === null ? null : 'kisi',
      hedefKonumId: h.konumId, hedefStatuId: h.statuId, hedefKaliteDurumu: q, uretimEmriId: y.uretimEmriId, geriAlinanId: h.id, aciklama: y.aciklama,
    }));
    await bakiyeDegistir(db, { malzemeId, konumId: h.konumId, partiId: h.partiId, statuId: h.statuId, kaliteDurumu: q, fark: m });
    await rezerveDegistir(db, { malzemeId, statuId: h.statuId, uretimEmriId: y.uretimEmriId, fark: m });
    let kalanCikis: number | null = null;
    const istisna = h.partiId === null && await sorgular.istisnaDusumuMu(db, h.id);
    if (m > kalan) {
      kalanCikis = await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId, miktar: bindenMetin(m - kalan), kisiId: y.kisiId, partiId: h.partiId, partiSecimi: h.partiId === null ? null : 'en_eski',
        kaynakKonumId: h.konumId, kaynakStatuId: h.statuId, kaynakKaliteDurumu: q, cikisNedeni, uretimEmriId: y.uretimEmriId, isEmriId: y.isEmriId ?? null, aciklama: y.aciklama,
        onayliEksi: istisna,
      }));
      await bakiyeDegistir(db, { malzemeId, konumId: h.konumId, partiId: h.partiId, statuId: h.statuId, kaliteDurumu: q, fark: -(m - kalan) });
      await rezerveDegistir(db, { malzemeId, statuId: h.statuId, uretimEmriId: y.uretimEmriId, fark: -(m - kalan) });
    }
    // Lotsuz düşümün istisna kartı bağı kalan çıkışa geçer; tamamı geri alındıysa bağ düşer.
    if (istisna) await sorgular.istisnaDusumuTasi(db, h.id, kalanCikis);
    kalan -= m;
  }
}

// K5 (kart #1413, kullanıcı kararı "İptal, yolda uyarı"): emir bitince ya da iptal olunca açık malzeme istekleri iptal olur. Hazırlık
// listesindeki istek listeye bırakılır (liste kapanınca düşer). Yoldaki teslim kendiliğinden kapanmaz: uyarı yazılır, alan ya da gönderen karar verir.
async function emirKapandi(db: Db, uretimEmriId: number, kisiId: number, neden: string): Promise<void> {
  for (const r of await sorgular.emrinRezerveleriniSil(db, uretimEmriId)) {
    await sorgular.rezerveKaydiYaz(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId, tur: 'kaldir', miktar: r.miktar, neden, kisiId });
  }
  for (const i of await sorgular.emrinAcikIstekleri(db, uretimEmriId)) {
    if (istekListeEngeli(i) !== null) continue;
    await sorgular.istekGecir(db, i.id, i.surum, { kaynaklar: ISTEK_GECIS_KAYNAKLARI.iptal, durum: 'iptal', karsilanan: null, kapatanKisiId: kisiId });
  }
  await sorgular.emrinYoldakiTeslimlerineYaz(db, uretimEmriId, 'Emir kapandı: teslimi alın ya da iptal edin');
}
export const emirBittiYansit = (db: Db, olay: { uretimEmriId: number; kisiId: number }): Promise<void> => emirKapandi(db, olay.uretimEmriId, olay.kisiId, 'Emir bitti');
export const emirIptalYansit = (db: Db, olay: { uretimEmriId: number; kisiId: number }): Promise<void> => emirKapandi(db, olay.uretimEmriId, olay.kisiId, 'Emir iptal edildi');
// Birleşen partinin ayrılanı üretimin sürdüğü üst emre geçer: malzeme başka emre kaymaz. Kaynağın bekleme isteği ve refakat kartları da hedefe geçer.
export async function emirBirlestiYansit(db: Db, olay: { uretimEmriId: number; hedefEmirId: number; kisiId: number }): Promise<void> {
  await refakatKartlariniBirlestir(db, olay.uretimEmriId, olay.hedefEmirId, olay.kisiId);
  const bekliyordu = (await sorgular.rezerveIsteyenEmirler(db)).includes(olay.uretimEmriId);
  const satirlar = await sorgular.emrinRezerveleriniSil(db, olay.uretimEmriId);
  if (bekliyordu) await sorgular.emirRezerveIstegiYaz(db, olay.hedefEmirId, olay.kisiId);
  if (satirlar.length === 0) return;
  const nolar = await emirNolari(db, [olay.uretimEmriId, olay.hedefEmirId]);
  const neden = `Parti birleşti: ${nolar.get(olay.uretimEmriId) ?? olay.uretimEmriId} -> ${nolar.get(olay.hedefEmirId) ?? olay.hedefEmirId}`;
  for (const r of satirlar) {
    await sorgular.rezerveKaydiYaz(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId: olay.uretimEmriId, tur: 'kaldir', miktar: r.miktar, neden, kisiId: olay.kisiId });
    await sorgular.rezerveArtir(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId: olay.hedefEmirId, miktar: r.miktar });
    await sorgular.rezerveKaydiYaz(db, { malzemeId: r.malzemeId, statuId: r.statuId, uretimEmriId: olay.hedefEmirId, tur: 'ayir', miktar: r.miktar, neden, kisiId: olay.kisiId });
  }
}


// Aynı konumda statü dönüşümü (statuDegistir'in transaction içi hâli; konum ve miktar çağıranda denetlenmiştir).
async function statuCevir(db: Db, kisiId: number, d: {
  malzemeId: number; konumId: number; partiId: number; kaynakStatuId: number | null; hedefStatuId: number | null; kaynakKalite?: KaliteDurumu; hedefKalite?: KaliteDurumu;
  miktar: bigint; aciklama: string; uretimEmriId: number;
}): Promise<void> {
  const kq = d.kaynakKalite ?? 'serbest', hq = d.hedefKalite ?? 'serbest';
  await siraliKilitle(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq }, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq });
  await sorgular.hareketYaz(db, hareket({
    tur: 'transfer', malzemeId: d.malzemeId, miktar: bindenMetin(d.miktar), kisiId, partiId: d.partiId, partiSecimi: 'kisi', kaynakKonumId: d.konumId, hedefKonumId: d.konumId,
    kaynakStatuId: d.kaynakStatuId, hedefStatuId: d.hedefStatuId, kaynakKaliteDurumu: kq, hedefKaliteDurumu: hq, uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
  }));
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.kaynakStatuId, kaliteDurumu: kq, fark: -d.miktar });
  await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.hedefStatuId, kaliteDurumu: hq, fark: d.miktar, ilkGiris: new Date().toISOString() });
  await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.kaynakStatuId, uretimEmriId: d.uretimEmriId, fark: -d.miktar });
  await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: d.hedefStatuId, uretimEmriId: d.uretimEmriId, fark: d.miktar });
}

// Sayım azalışı üretim girişinden düşülür: en son girişler bütün olarak geri alınır, fazlası yeniden girilir. Böylece emrin girilen
// üretimi (tamamlamadaki "girilen") ve hareket defteri tutarlı kalır; çıkış nedeni uydurulmaz.
// Giriş hareketi parti ve statüyle seçilir; düşüş bakiyenin bugünkü kalite durumundan yazılır (kalite kararı girişten sonra değişmiş olabilir).
async function uretimGirisiniDus(db: Db, kisiId: number, d: { malzemeId: number; konumId: number; uretimEmriId: number; partiId: number; statuId: number | null; kaliteDurumu?: KaliteDurumu; miktar: bigint; aciklama: string }): Promise<void> {
  const q = d.kaliteDurumu ?? 'serbest';
  const secilen: { id: number; miktar: string }[] = [];
  let toplam = 0n;
  for (const h of await sorgular.geriAlinmamisUretimGirisleri(db, d.konumId, d.partiId, d.statuId)) {
    if (toplam >= d.miktar) break;
    secilen.push(h);
    toplam += binde(h.miktar);
  }
  if (toplam < d.miktar) throw dogrulama('Bu istasyonda düşülecek üretim girişi yok; sayıyı stok sorumlusu düzeltsin.', 'saglamAdet');
  if (toplam > d.miktar) {
    await sorgular.hareketYaz(db, hareket({
      tur: 'giris', malzemeId: d.malzemeId, miktar: bindenMetin(toplam - d.miktar), kisiId, partiId: d.partiId, partiSecimi: 'giris', hedefKonumId: d.konumId,
      hedefStatuId: d.statuId, hedefKaliteDurumu: q, girisKaynagi: 'uretim', uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
    }));
    await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId, kaliteDurumu: q, fark: toplam - d.miktar });
  }
  for (const h of secilen) {
    await sorgular.hareketYaz(db, hareket({
      tur: 'geri_alma', malzemeId: d.malzemeId, miktar: h.miktar, kisiId, partiId: d.partiId, partiSecimi: 'kisi', kaynakKonumId: d.konumId,
      kaynakStatuId: d.statuId, kaynakKaliteDurumu: q, uretimEmriId: d.uretimEmriId, geriAlinanId: h.id, aciklama: d.aciklama,
    }));
    await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId: d.konumId, partiId: d.partiId, statuId: d.statuId, kaliteDurumu: q, fark: -binde(h.miktar) });
  }
}

// Emrin bu istasyondan teslim edilen miktarı (yoldaki ve alınan); istasyonun konumu yoksa sıfır değil null: hiç teslim olmamıştır.
export async function istasyondanTeslimEdilen(db: Db, g: { uretimEmriId: number; istasyonId: number }): Promise<string | null> {
  const konumId = await sorgular.istasyonKonumu(db, g.istasyonId);
  return konumId === null ? null : bindenMetin(binde(await sorgular.konumdanTeslimEdilen(db, konumId, g.uretimEmriId)));
}

// ---- Numune teslimi (karar 115 a, 125 a) -----------------------------------------------------------------------------------------
// Operatörün kaliteye gönderdiği numune, adımın bir adetlik parçasıdır: ara adımda taşınan malzeme adım statüsüyle, son adımda ya da
// çıktılı adımda çıktının kendisi. Parça istasyondan "Kalite numune" adlı kutuya teslim edilir; ara alan kutusunda bırakınca kapanır.
// Teslim numuneyi durdurmaz: kutu ya da parça yoksa stok yazılmaz, neden döner (stok sonradan düzeltilir, karar 110 b ile aynı yön).
// isEmriId null: rotasız emir; numune emrin ürünüdür (adımsız emrin sağlam sayımı gibi statüsüz).
// 564 1 b: numune kalite istasyonuna gönderiliyorsa (`hedefIstasyonId`) teslim yolda kalır, kalite "Teslim al" ile alır (Teslim et ile aynı yol);
// hedef yoksa eski davranış: "Kalite numune" kutusu.
export interface NumuneTeslimi { uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; adet: number; kaynakKimligi: string; hedefIstasyonId?: number | null }
export type NumuneTeslimSonucu = { teslim: { id: number; no: string } } | { atlandi: string };
const NUMUNE_KUTUSU = 'Kalite numune';
async function adimParcasi(db: Db, uretimEmriId: number, isEmriId: number | null, adet: bigint): Promise<{ malzemeId: number; statuId: number | null; miktar: bigint } | null> {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const malzemeNo = emir.malzemeNo;
  const urun = await malzemeOzeti(db, malzemeNo);
  if (!urun || (urun.tur !== 'mamul' && urun.tur !== 'yarimamul')) return null;
  if (isEmriId === null) return { malzemeId: malzemeNo, statuId: null, miktar: adet };
  const bilgi = await adimBilgisi(db, isEmriId);
  if (bilgi === null) return null;
  const statuId = adimStatusu === null ? null : await adimStatusu(db, { malzemeNo, opNo: bilgi.opNo, uretimEmriId });
  const { tasinan, cikti } = await adimTasinani(db, malzemeNo, bilgi, uretimEmriId);
  // Taşınansız rotada son adımın ürünü adım statüsüyle girer (uretimSayimiYansit'in eski yolu); taşınanlıda statüsüz.
  if (bilgi.sonAdim) return { malzemeId: malzemeNo, statuId: tasinan === null ? statuId : null, miktar: adet };
  const ara = await cikti(bilgi.opNo);
  if (ara !== null) return { malzemeId: ara, statuId: null, miktar: adet };
  if (tasinan === null || !stoklanirMi((await malzemeOzeti(db, tasinan.malzemeNo))?.tur ?? '')) return null;
  return { malzemeId: tasinan.malzemeNo, statuId, miktar: adetMiktari(adet, tasinan.miktar, tasinan.bolen) };
}
// ---- Kalite kararı (131 b, 136 a) ----------------------------------------------------------------------------------------------
// İlk parça kararı adımın karar bekleyen parçasını her konumda serbest (onay) ya da red (ret) yapar; red parça uyarıyla akışta kalır (135).
// Adımın parçası numunedeki gibi bulunur; emrin partisi önce, sonra en eski giriş. Yoldaki teslime ayrılan değişmez, bulunan kadarı çevrilir.
export interface KaliteKarariYansimasi { uretimEmriId: number; isEmriId: number | null; kisiId: number; karar: 'onay' | 'ret'; adet: string; refakatPartisiId?: number | null }
export async function kaliteKarariYansit(db: Db, g: KaliteKarariYansimasi): Promise<void> {
  const parca = await adimParcasi(db, g.uretimEmriId, g.isEmriId, binde(g.adet));
  if (parca === null || parca.miktar <= 0n) return;
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  const hedef: KaliteDurumu = g.karar === 'onay' ? 'serbest' : 'red';
  const aciklama = `Kalite kararı: ${g.karar === 'onay' ? 'onay' : 'ret'} · emir ${emir?.emirNo ?? String(g.uretimEmriId)}`;
  await korumali(async () => {
    // Karar, sayımın kartının partisine önce uygulanır; kart artık geçersizse de karar düşmez (sayım zaten yazılmıştı).
    const kart = g.refakatPartisiId == null ? undefined : { id: g.refakatPartisiId, partiler: await sorgular.refakatStokPartileri(db, await sorgular.refakatSoyu(db, g.refakatPartisiId)) };
    const kaynaklar = kartOnce(await sorgular.kaliteBakiyeleri(db, parca.malzemeId, parca.statuId, 'karar_bekliyor', g.uretimEmriId), kart);
    for (const a of kaynaklardanAl(kaynaklar, parca.miktar)) {
      await kaliteDegistir(db, g.kisiId, {
        malzemeId: parca.malzemeId, konumId: a.konumId, partiId: a.partiId, statuId: parca.statuId, kaynak: 'karar_bekliyor', hedef, miktar: a.miktar,
        uretimEmriId: g.uretimEmriId, aciklama,
      });
    }
  });
}
// 564 6 a: kalite istasyonunun lot kararı (Kalite Merkezi lot kaydıyla birlikte çağrılır). Ret, emrin istasyondaki serbest parçasını en çok
// `adet` kadar (yoldaki teslime ayrılan hariç) red kalitesine geçirir; kabul parçayı olduğu gibi bırakır (zaten serbesttir). Taşınan döner.
export interface IstasyonLotKarari { uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; karar: 'kabul' | 'ret'; adet: string; lotNo: string }
export async function istasyonLotKarari(db: Db, g: IstasyonLotKarari): Promise<string> {
  if (g.karar === 'kabul') return bindenMetin(0n);
  const parca = await adimParcasi(db, g.uretimEmriId, g.isEmriId, binde(g.adet));
  const konum = await sorgular.istasyonKonumu(db, g.istasyonId);
  if (parca === null || konum === null || parca.miktar <= 0n) return bindenMetin(0n);
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  let kalan = parca.miktar;
  await korumali(async () => {
    for (const b of await sorgular.istasyondakiEmirBakiyeleri(db, konum, parca.malzemeId, g.uretimEmriId)) {
      if (kalan === 0n || b.kaliteDurumu !== 'serbest') continue;
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      const miktar = serbest < kalan ? serbest : kalan;
      if (miktar <= 0n) continue;
      await kaliteDegistir(db, g.kisiId, {
        malzemeId: parca.malzemeId, konumId: konum, partiId: b.partiId, statuId: b.statuId, kaynak: 'serbest', hedef: 'red', miktar,
        uretimEmriId: g.uretimEmriId, aciklama: `Lot reddi ${g.lotNo} · emir ${emir?.emirNo ?? String(g.uretimEmriId)}`,
      });
      kalan -= miktar;
    }
  });
  return bindenMetin(parca.miktar - kalan);
}
async function numuneKutusu(db: Db): Promise<{ id: number; tur: string } | { atlandi: string }> {
  const ad = (x: string) => x.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
  const kutular = (await sorgular.adiGecenKonumlar(db, 'numune')).filter((k) => ad(k.ad) === ad(NUMUNE_KUTUSU));
  if (kutular.length === 0) return { atlandi: `Fabrika Haritası'nda "${NUMUNE_KUTUSU}" kutusu yok; numunenin teslimi stoğa yazılmadı.` };
  if (kutular.length > 1) return { atlandi: `"${NUMUNE_KUTUSU}" adlı birden çok kutu var (${kutular.map((k) => k.kod).join(', ')}); numunenin teslimi stoğa yazılmadı.` };
  return kutular[0]!;
}
export async function numuneTeslimi(db: Db, g: NumuneTeslimi): Promise<NumuneTeslimSonucu> {
  const kaynakKimligi = `numune:${g.kaynakKimligi}`.slice(0, 120);
  const onceki = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (onceki) return { teslim: { id: onceki.id, no: onceki.no } };
  if (g.hedefIstasyonId === g.istasyonId) return { atlandi: 'Numune kendi istasyonuna gönderilemez; numunenin teslimi stoğa yazılmadı.' };
  const kutu = g.hedefIstasyonId != null ? { id: await istasyonKonumuBul(db, g.hedefIstasyonId, 'hedefIstasyonId'), tur: 'istasyon' } : await numuneKutusu(db);
  if ('atlandi' in kutu) return kutu;
  const kaynak = await sorgular.istasyonKonumu(db, g.istasyonId);
  const parca = await adimParcasi(db, g.uretimEmriId, g.isEmriId, binde(String(g.adet)));
  if (kaynak === null || parca === null) return { atlandi: 'Bu adımın parçası stokta izlenmiyor; numunenin teslimi stoğa yazılmadı.' };
  const id = await korumali(async () => {
    const yer = (await sorgular.uretimGirdiKaynaklari(db, parca.malzemeId, parca.statuId, kaynak, g.uretimEmriId))
      .find((x) => x.konumId === kaynak && binde(x.serbest) >= parca.miktar);
    if (!yer) return null;
    const emir = await uretimEmriOzeti(db, g.uretimEmriId);
    return teslimYaz(db, {
      no: await belgeNo(db, 'stok.teslim-no', 'stok_teslim'), kaynakKimligi, malzemeId: parca.malzemeId, miktar: bindenMetin(parca.miktar), partiId: yer.partiId,
      statuId: parca.statuId, kaliteDurumu: 'serbest', kaynakKonumId: kaynak, hedefKonumId: kutu.id, uretimEmriId: g.uretimEmriId, isEmriId: g.isEmriId, istekId: null,
      aciklama: `Numune · emir ${emir?.emirNo ?? String(g.uretimEmriId)}`, gonderenKisiId: g.kisiId,
    });
  });
  const t = await sorgular.teslimKaynaktan(db, kaynakKimligi);
  if (t === null) return { atlandi: 'İstasyonda numunelik parça yok; numunenin teslimi stoğa yazılmadı.' };
  if (id !== null && kutu.tur === 'ara_alan') await teslimiKapat(db, g.kisiId, (await sorgular.teslimBul(db, t.id, true))!, t.miktar, t.surum, 'miktar');
  return { teslim: { id: t.id, no: t.no } };
}

// ---- Fasona gönderim (kart #1310, iki adım) ------------------------------------------------------------------------------------
// Gönderimde parça önceki adımın istasyonundan firmanın "Yolda" konumuna geçer; sevkiyat işi tamamlanınca firmanın fason konumuna.
// Sağlam dönüşü mal kabul alır (giden fason konumundan düşer); Dış operasyonlardaki dönüş yalnız hurdayı firmadan düşer. Kalan
// parça firmada görünür; fason işi kapanmış emrin firmada kalanı iş kutusunda "eksik" uyarısıdır.
async function firmaKonumuBul(db: Db, firmaId: number, tur: 'yolda' | 'fason'): Promise<number> {
  const varOlan = await sorgular.firmaKonumu(db, firmaId, tur);
  if (varOlan !== null) return varOlan;
  const firma = (await firmaAdlari(db, [firmaId])).get(firmaId) ?? `Firma ${String(firmaId)}`;
  const ad = (tur === 'yolda' ? `Yolda · ${firma}` : firma).slice(0, 60);
  const depoId = await anaDepo(db);
  const onek = `${tur === 'yolda' ? 'YLD' : 'FSN'}-${String(firmaId)}`;
  // Kod elle açılmış bir konumla çakışırsa sonraki ek denenir; eşzamanlı açılışta öteki işlemin konumu kullanılır.
  for (let ek = 0; ; ek += 1) {
    const id = await sorgular.firmaKonumuAc(db, { depoId, kod: ek === 0 ? onek : `${onek}-${String(ek)}`, ad, firmaId, tur });
    if (id !== null) return id;
    const acilan = await sorgular.firmaKonumu(db, firmaId, tur);
    if (acilan !== null) return acilan;
  }
}

// Emrin partisinden (statüsü korunarak) en eskiden başlayıp en çok `miktar` taşır; yolda teslime ayrılan dokunulmaz. Taşınan döner:
// konumda yeterli parça yoksa olan taşınır, gönderim reddedilmez (sayım eksik girilmiş olabilir).
async function emirParcasiniTasi(db: Db, kisiId: number, d: { malzemeId: number; uretimEmriId: number; kaynak: number; hedef: number; miktar: bigint; aciklama: string }): Promise<bigint> {
  let kalan = d.miktar;
  for (const b of await sorgular.istasyondakiEmirBakiyeleri(db, d.kaynak, d.malzemeId, d.uretimEmriId)) {
    if (kalan === 0n) break;
    const serbest = binde(b.miktar) - binde(b.ayrilan);
    const anahtar = { malzemeId: d.malzemeId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu };
    if (serbest <= 0n) continue;
    await siraliKilitle(db, { ...anahtar, konumId: d.kaynak }, { ...anahtar, konumId: d.hedef });
    const tasinan = await kilitliOlan(db, { ...anahtar, konumId: d.kaynak }, b.miktar, serbest < kalan ? serbest : kalan);
    if (tasinan <= 0n) continue;
    await sorgular.hareketYaz(db, hareket({
      tur: 'transfer', malzemeId: d.malzemeId, miktar: bindenMetin(tasinan), kisiId, partiId: b.partiId, partiSecimi: 'kisi', kaynakKonumId: d.kaynak, hedefKonumId: d.hedef,
      kaynakStatuId: b.statuId, hedefStatuId: b.statuId, kaynakKaliteDurumu: b.kaliteDurumu, hedefKaliteDurumu: b.kaliteDurumu, uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
    }));
    await bakiyeDegistir(db, { ...anahtar, konumId: d.kaynak, fark: -tasinan });
    await bakiyeDegistir(db, { ...anahtar, konumId: d.hedef, fark: tasinan, ilkGiris: new Date().toISOString() });
    kalan -= tasinan;
  }
  return d.miktar - kalan;
}

// Girdili emirde fasona giden yarı parça (kart #1289): önceki adımın çıktısı varsa o (emrin partisi), yoksa taşınan malzemenin önceki adım
// statüsündeki hâli (tedarikçi partisi). Taşınan yoksa (girdisiz rota) ya da fason ilk adımsa null: emrin ürünü gider.
// birim: bir adetin stok miktarı (taşınan girdinin reçete miktarı; çıktı için 1).
interface YariParca { malzemeId: number; statuId: number | null; emirPartisi: boolean; birim: string }
async function fasonYariParcasi(db: Db, uretimEmriId: number, urunNo: number, isEmriId: number): Promise<YariParca | null> {
  const bilgi = await adimBilgisi(db, isEmriId);
  if (!bilgi) return null;
  // Dallı emirde (1348 a) yarı parça tek öncülden devralınan parçadır; dal başı ve birleştirme fasonunda emrin ürünü gider.
  const dalli = await dalliTasima(db, urunNo, bilgi, uretimEmriId);
  if (dalli !== null) {
    const p = dalli.kaynak.tur === 'oncul' ? dalli.gelenler[0] : undefined;
    if (p === undefined) return null;
    const ciktili = adimCiktisi !== null && (await adimCiktisi(db, { malzemeNo: urunNo, opNo: p.opNo, uretimEmriId })) !== null;
    // Birleştirmeden çıkan ürün statüdedir ama emrin partisiyle girer.
    const emirPartisi = ciktili || p.malzemeId === urunNo;
    return { malzemeId: p.malzemeId, statuId: p.statuId, emirPartisi, birim: p.miktar };
  }
  const onceki = bilgi.oncekiOpNolari.at(-1);
  if (onceki === undefined) return null;
  const cikti = async (opNo: number) => (adimCiktisi === null ? null : adimCiktisi(db, { malzemeNo: urunNo, opNo, uretimEmriId }));
  const oncekiCikti = await cikti(onceki);
  if (oncekiCikti !== null) return { malzemeId: oncekiCikti, statuId: null, emirPartisi: true, birim: '1' };
  let tasinan = bilgi.tasinan;
  for (const op of [...bilgi.oncekiOpNolari].reverse()) {
    const c = await cikti(op);
    if (c !== null) { tasinan = { malzemeNo: c, miktar: '1' }; break; }
  }
  if (tasinan === null) return null;
  const statuId = adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: urunNo, opNo: onceki, uretimEmriId });
  return { malzemeId: tasinan.malzemeNo, statuId, emirPartisi: false, birim: tasinan.miktar };
}
// Yarı parçayı konumlardan sırayla, en eskiden en çok `miktar` taşır (statüsü korunur); olan kadar taşınır, taşınan döner. Kaynak serbest
// bakiyedir; hedef kalite verilirse parça hedefte o kaliteyle durur (fason dönüşü karar bekliyor).
async function yariParcayiTasi(
  db: Db, kisiId: number, p: YariParca, d: { uretimEmriId: number; kaynaklar: number[]; hedef: number; miktar: bigint; aciklama: string; hedefKalite?: KaliteDurumu },
): Promise<{ tasinan: bigint; sonHareketId: number | null }> {
  const hedefKalite = d.hedefKalite ?? 'serbest';
  let kalan = d.miktar;
  let sonHareketId: number | null = null;
  for (const kaynak of d.kaynaklar) {
    for (const b of await sorgular.konumdakiParcaBakiyeleri(db, kaynak, p.malzemeId, p.statuId, p.emirPartisi ? d.uretimEmriId : null)) {
      if (kalan === 0n) return { tasinan: d.miktar, sonHareketId };
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      if (serbest <= 0n) continue;
      const anahtar = { malzemeId: p.malzemeId, partiId: b.partiId, statuId: p.statuId };
      await siraliKilitle(db, { ...anahtar, konumId: kaynak }, { ...anahtar, konumId: d.hedef, kaliteDurumu: hedefKalite });
      const tasinan = await kilitliOlan(db, { ...anahtar, konumId: kaynak }, b.miktar, serbest < kalan ? serbest : kalan);
      if (tasinan <= 0n) continue;
      sonHareketId = await sorgular.hareketYaz(db, hareket({
        tur: 'transfer', malzemeId: p.malzemeId, miktar: bindenMetin(tasinan), kisiId, partiId: b.partiId, partiSecimi: b.partiId === null ? null : 'kisi', kaynakKonumId: kaynak,
        hedefKonumId: d.hedef, kaynakStatuId: p.statuId, hedefStatuId: p.statuId, kaynakKaliteDurumu: 'serbest', hedefKaliteDurumu: hedefKalite, uretimEmriId: d.uretimEmriId,
        aciklama: d.aciklama,
      }));
      await bakiyeDegistir(db, { ...anahtar, konumId: kaynak, fark: -tasinan });
      await bakiyeDegistir(db, { ...anahtar, konumId: d.hedef, kaliteDurumu: hedefKalite, fark: tasinan, ilkGiris: new Date().toISOString() });
      kalan -= tasinan;
    }
  }
  return { tasinan: d.miktar - kalan, sonHareketId };
}
// Yarı parçanın hurdası firmadan fire çıkışıyla düşer; olmayan düşülmez.
async function yariParcayiDus(db: Db, kisiId: number, p: YariParca, d: { uretimEmriId: number; konumlar: number[]; miktar: bigint; aciklama: string }): Promise<void> {
  let kalan = d.miktar;
  for (const konumId of d.konumlar) {
    for (const b of await sorgular.konumdakiParcaBakiyeleri(db, konumId, p.malzemeId, p.statuId, p.emirPartisi ? d.uretimEmriId : null)) {
      if (kalan === 0n) return;
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      if (serbest <= 0n) continue;
      const anahtar = { malzemeId: p.malzemeId, konumId, partiId: b.partiId, statuId: p.statuId };
      await siraliKilitle(db, anahtar);
      const dusulen = await kilitliOlan(db, anahtar, b.miktar, serbest < kalan ? serbest : kalan);
      if (dusulen <= 0n) continue;
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: p.malzemeId, miktar: bindenMetin(dusulen), kisiId, partiId: b.partiId, partiSecimi: b.partiId === null ? null : 'kisi', kaynakKonumId: konumId,
        kaynakStatuId: p.statuId, cikisNedeni: 'fire', uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: p.malzemeId, konumId, partiId: b.partiId, statuId: p.statuId, fark: -dusulen });
      await rezerveDegistir(db, { malzemeId: p.malzemeId, statuId: p.statuId, uretimEmriId: d.uretimEmriId, fark: -dusulen });
      kalan -= dusulen;
    }
  }
}

// Hurda firmadan (önce fason konumu, sonra yolda) fire çıkışıyla düşer; olmayan düşülmez, bakiye eksiye inmez.
async function emirParcasiniDus(db: Db, kisiId: number, d: { malzemeId: number; uretimEmriId: number; konumlar: number[]; miktar: bigint; aciklama: string }): Promise<void> {
  let kalan = d.miktar;
  for (const konumId of d.konumlar) {
    for (const b of await sorgular.istasyondakiEmirBakiyeleri(db, konumId, d.malzemeId, d.uretimEmriId)) {
      if (kalan === 0n) return;
      const serbest = binde(b.miktar) - binde(b.ayrilan);
      if (serbest <= 0n) continue;
      const anahtar = { malzemeId: d.malzemeId, konumId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu };
      await siraliKilitle(db, anahtar);
      const dusulen = await kilitliOlan(db, anahtar, b.miktar, serbest < kalan ? serbest : kalan);
      if (dusulen <= 0n) continue;
      await sorgular.hareketYaz(db, hareket({
        tur: 'cikis', malzemeId: d.malzemeId, miktar: bindenMetin(dusulen), kisiId, partiId: b.partiId, partiSecimi: 'kisi', kaynakKonumId: konumId,
        kaynakStatuId: b.statuId, kaynakKaliteDurumu: b.kaliteDurumu, cikisNedeni: 'fire', uretimEmriId: d.uretimEmriId, aciklama: d.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: d.malzemeId, konumId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu, fark: -dusulen });
      await rezerveDegistir(db, { malzemeId: d.malzemeId, statuId: b.statuId, uretimEmriId: d.uretimEmriId, fark: -dusulen });
      kalan -= dusulen;
    }
  }
}

// Fason hareketinin emri stoğa ürün kartıyla girmişse (mamul, yarı mamul) kartı ve emir numarası; değilse null (stok izlemez).
async function fasonBaglami(db: Db, hareketId: number) {
  const h = await fasonHareketiOzeti(db, hareketId);
  if (!h) return null;
  const emir = await uretimEmriOzeti(db, h.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const o = await malzemeOzeti(db, emir.malzemeNo);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return null;
  return { h, malzemeId: emir.malzemeNo, emirNo: emir.emirNo, yari: await fasonYariParcasi(db, h.uretimEmriId, emir.malzemeNo, h.isEmriId) };
}
const firmaKonumlari = async (db: Db, firmaId: number): Promise<number[]> => {
  const konumlar: number[] = [];
  for (const tur of ['fason', 'yolda'] as const) {
    const k = await sorgular.firmaKonumu(db, firmaId, tur);
    if (k !== null) konumlar.push(k);
  }
  return konumlar;
};

export async function fasonHareketiYansit(db: Db, olay: FasonHareketiOlayi): Promise<void> {
  const b = await fasonBaglami(db, olay.hareketId);
  if (!b) return;
  const { h, malzemeId } = b;
  const aciklama = `Fason ${h.yon === 'gidis' ? 'gönderimi' : 'dönüşü'} · emir ${b.emirNo}`;
  if (h.yon === 'gidis') {
    if (h.adet <= 0 || olay.oncekiIsEmriId === null) return;
    const onceki = await isEmriOzeti(db, olay.oncekiIsEmriId);
    const kaynak = onceki?.istasyonId == null ? null : await sorgular.istasyonKonumu(db, onceki.istasyonId);
    if (kaynak === null) return;
    const hedef = await firmaKonumuBul(db, h.firmaId, 'yolda');
    const yari = b.yari;
    await korumali(() => (yari
      ? yariParcayiTasi(db, olay.kisiId, yari, { uretimEmriId: h.uretimEmriId, kaynaklar: [kaynak], hedef, miktar: adetMiktari(BigInt(h.adet) * 1000n, yari.birim), aciklama }).then((x) => x.tasinan)
      : emirParcasiniTasi(db, olay.kisiId, { malzemeId, uretimEmriId: h.uretimEmriId, kaynak, hedef, miktar: BigInt(h.adet) * 1000n, aciklama })));
    return;
  }
  const konumlar = await firmaKonumlari(db, h.firmaId);
  if (h.hurdaAdet && h.hurdaAdet > 0) {
    const yari = b.yari;
    const adet = BigInt(h.hurdaAdet) * 1000n;
    const d = { uretimEmriId: h.uretimEmriId, konumlar, aciklama: `${aciklama} · hurda` };
    await korumali(() => (yari ? yariParcayiDus(db, olay.kisiId, yari, { ...d, miktar: adetMiktari(adet, yari.birim) }) : emirParcasiniDus(db, olay.kisiId, { malzemeId, ...d, miktar: adet })));
  }
}
// Fasondan dönüş yalnız mal kabulle girer (kullanıcı kararları, kart #1289 ve 15.10 B): satır fason işine bağlanır, dönüş kaydı üretim
// emrine buradan yazılır. 1205, 1207 c: mal kabul sağlam ve hurda ayırmaz; dönen adedin hepsi karantinaya karar bekliyor girer, kabul ve
// hatalı kararını GKK adımı verir (gelmeyen parça da orada hatalı sayılır). Parça firmadan (fason, sonra yolda) gelir ve fason adımının
// sayımı gibi yansır; rotadaki seçim belirler: adımın çıkanı varsa (YM, MM; son adımda ürün) o girer ve yarı parça emre sarf edilir, yoksa
// yarı parça adımın statüsüne çevrilir. Girdisiz rotada emrin ürünü olduğu gibi döner. Satırın kartı dönen karttır; firmada olandan
// fazlası gelmez, eksik firmada kalır. Dönen stok miktarı ve satırın hareketi döner.
async function fasonIsindenDonus(
  db: Db, kisiId: number, d: { isEmriId: number; malzemeId: number; adet: bigint; konumId: number; alan: string },
): Promise<{ miktar: bigint; hareketId: number }> {
  const is = await isEmriOzeti(db, d.isEmriId);
  if (!is || is.kaynak?.tur !== 'fason') throw dogrulama('Fason işi bulunamadı.', `${d.alan}.fasonIsi`);
  if (d.adet <= 0n || d.adet % 1000n !== 0n) throw dogrulama('Fason işinden dönen sağlam adet sıfırdan büyük tam sayıdır.', `${d.alan}.miktar`);
  const plan = await fasonDonusPlani(db, is.uretimEmriId, d.isEmriId, d.adet);
  if (!plan) throw dogrulama('Fason işinin emri bulunamadı.', `${d.alan}.fasonIsi`);
  if (plan.donenKart !== d.malzemeId) {
    const kart = await malzemeOzeti(db, plan.donenKart);
    throw dogrulama(`Bu fason işinden ${kart?.kod ?? `kart ${String(plan.donenKart)}`} döner (rotadaki seçim).`, `${d.alan}.malzemeId`);
  }
  const aciklama = `Fason dönüşü · emir ${is.emirNo} · OP ${String(is.opNo)}`;
  const konumlar = await firmaKonumlari(db, is.kaynak.id);
  // Firmada olandan fazlası gelmez: dönen adet firmada kalan tam adede indirilir (kalan firmada eksik görünür).
  let firmada = 0n;
  for (const k of konumlar) {
    for (const b of await sorgular.konumdakiParcaBakiyeleri(db, k, plan.yari.malzemeId, plan.yari.statuId, plan.yari.emirPartisi ? is.uretimEmriId : null)) firmada += binde(b.miktar) - binde(b.ayrilan);
  }
  const birAdet = adetMiktari(1000n, plan.yari.birim);
  const olan = birAdet > 0n ? (firmada / birAdet) * 1000n : 0n;
  const adet = d.adet < olan ? d.adet : olan;
  if (adet <= 0n) throw dogrulama('Firmada bu işin parçası yok; gönderim Dış operasyonlardan yazılır.', `${d.alan}.fasonIsi`);
  await fasonDonusuKaydet(db, kisiId, is.uretimEmriId, d.isEmriId, Number(adet / 1000n), 0);
  const t = await yariParcayiTasi(db, kisiId, plan.yari, {
    uretimEmriId: is.uretimEmriId, kaynaklar: konumlar, hedef: d.konumId, miktar: adetMiktari(adet, plan.yari.birim), aciklama, hedefKalite: 'karar_bekliyor',
  });
  if (plan.uretim === null) {
    if (t.sonHareketId === null) throw dogrulama('Firmada bu işin parçası yok.', `${d.alan}.fasonIsi`);
    return { miktar: t.tasinan, hareketId: t.sonHareketId };
  }
  const p = adet === d.adet ? plan.uretim : (await fasonDonusPlani(db, is.uretimEmriId, d.isEmriId, adet))!.uretim!;
  const hareketId = await uretimAdiminiYaz(db, { uretimEmriId: is.uretimEmriId, kisiId, konumId: d.konumId, malzemeId: plan.urun, aciklama, kalite: 'karar_bekliyor' }, p);
  if (hareketId === null) throw dogrulama('Bu fason işinin adımı stoğa parça çıkarmıyor.', `${d.alan}.fasonIsi`);
  return { miktar: p.giris !== null ? p.giris.miktar : (p.cevirme?.miktar ?? adetMiktari(adet, plan.yari.birim)), hareketId };
}
// Fason adımının dönüş planı: yarı parça, adımın sayım planı ve dönen kart. Emrin ürünü gidiyorsa (girdisiz rota) plan yoktur, ürün döner.
async function fasonDonusPlani(db: Db, uretimEmriId: number, isEmriId: number, adet: bigint) {
  const emir = await uretimEmriOzeti(db, uretimEmriId);
  if (!emir || emir.malzemeNo === null) return null;
  const urun = emir.malzemeNo;
  const yari = await fasonYariParcasi(db, uretimEmriId, urun, isEmriId);
  const bilgi = await adimBilgisi(db, isEmriId);
  const uretim = yari && bilgi ? await adimPlaniKur(db, uretimEmriId, urun, adimStatusu === null ? null : await adimStatusu(db, { malzemeNo: urun, opNo: bilgi.opNo, uretimEmriId }), bilgi, adet) : null;
  if (!yari || !uretim) return { urun, yari: { malzemeId: urun, statuId: null, emirPartisi: true, birim: '1' } satisfies YariParca, uretim: null, donenKart: urun, statulu: false };
  const donenKart = uretim.giris !== null ? (uretim.giris.malzemeId ?? urun) : yari.malzemeId;
  return { urun, yari, uretim, donenKart, statulu: uretim.giris === null };
}
// Mal kabulün fason kutusu: firmanın açık emirlerindeki fason işleri, rotaya göre dönecek kartla (girdili emirde).
export async function fasonIsleri(db: Db, konumId: number): Promise<FasonIsleriCevabi> {
  const konum = await sorgular.konumBul(db, konumId);
  if (!konum || konum.tur !== 'fason') throw dogrulama('Fason kutusu bulunamadı.', 'konumId');
  const firmaId = await sorgular.konumFirmasi(db, konumId);
  if (firmaId === null) return { isler: [] };
  const isler = (await fasonIsEmirleri(db)).filter((x) => x.firmaId === firmaId && (x.gonderilen ?? 0) > 0);
  const durumlar = await emirDurumlari(db, isler.map((x) => x.uretimEmriId));
  const sonuc: FasonIsleriCevabi['isler'] = [];
  for (const x of isler) {
    if (!(ACIK_EMIR_DURUMLARI as readonly string[]).includes(durumlar.get(x.uretimEmriId) ?? '')) continue;
    const plan = await fasonDonusPlani(db, x.uretimEmriId, x.isEmriId, 1000n);
    if (!plan) continue;
    const kart = await malzemeOzeti(db, plan.donenKart);
    sonuc.push({
      isEmriId: x.isEmriId, emirNo: x.emirNo, opNo: x.opNo, adim: x.adim, gonderilen: x.gonderilen ?? 0, donen: x.donen ?? 0, hurda: x.hurda ?? 0,
      donenKart: { malzemeId: plan.donenKart, kod: kart?.kod ?? null, ad: kart?.ad ?? null, birim: kart?.birim ?? null }, statulu: plan.statulu,
    });
  }
  return { isler: sonuc };
}

// Sevkiyat teslimi: gönderilen adet firmanın Yolda konumundan fason konumuna geçer; teslim geri alınırsa geri döner.
export async function fasonSevkiYansit(db: Db, olay: FasonSevkiOlayi): Promise<void> {
  for (const hareketId of olay.fasonHareketIdleri) {
    if (olay.kisiId === null) throw new Error('Fason teslimi kişisiz yazılamaz');
    await fasonGidisiniTasi(db, olay.kisiId, hareketId, olay.teslim, olay.teslim ? 'Fason sevkiyatı teslim edildi' : 'Fason sevkiyatı teslimi geri alındı');
  }
}
async function fasonGidisiniTasi(db: Db, kisiId: number, hareketId: number, fasona: boolean, neden: string): Promise<void> {
  const b = await fasonBaglami(db, hareketId);
  if (!b || b.h.yon !== 'gidis' || b.h.adet <= 0) return;
  const yolda = await firmaKonumuBul(db, b.h.firmaId, 'yolda');
  const fason = await firmaKonumuBul(db, b.h.firmaId, 'fason');
  const [kaynak, hedef] = fasona ? [yolda, fason] : [fason, yolda];
  const aciklama = `${neden} · emir ${b.emirNo}`;
  const adet = BigInt(b.h.adet) * 1000n;
  const yari = b.yari;
  await korumali(() => (yari
    ? yariParcayiTasi(db, kisiId, yari, { uretimEmriId: b.h.uretimEmriId, kaynaklar: [kaynak], hedef, miktar: adetMiktari(adet, yari.birim), aciklama }).then((x) => x.tasinan)
    : emirParcasiniTasi(db, kisiId, { malzemeId: b.malzemeId, uretimEmriId: b.h.uretimEmriId, kaynak, hedef, miktar: adet, aciklama })));
}

// ---- Ürün sevki (235 a) ---------------------------------------------------------------------------------------------------------
// Sevkiyatta ürün işi durum değiştirince (E-12) emrin ürünü yola çıkışta müşteri firmasının Yolda konumuna geçer, teslimde Yolda'dan
// sevk çıkışıyla düşer; geri dönüşler bu hareketleri geri alır, parça geldiği konuma döner. Lot, statü ve kalite korunur. Firmasız
// noktada Yolda adımı yoktur: teslim parçayı bulunduğu konumdan düşer. Red parça çıkar, hareketin açıklaması bunu söyler (147 b).
// İş kimliği açıklamadadır: geri alma aynı işin hareketlerini bulur, aynı emrin başka işine dokunmaz.
const RED_EKI = ' · red parça';
// 1222 a: açık uygunsuzluğu (NCR) olan partiler Kalite Merkezi'nindir; stok onu ithal edemez, bağı sunucu/kablolama.ts kurar.
// Kayıt yokken hiçbir parti açık NCR'li sayılmaz.
export type AcikNcrPartiCozucusu = (db: Db, partiIdler: readonly number[]) => Promise<ReadonlySet<number>>;
let acikNcrPartiCozucu: AcikNcrPartiCozucusu | null = null;
export function acikNcrPartiCozucusuKaydet(cozucu: AcikNcrPartiCozucusu): void { acikNcrPartiCozucu = cozucu; }
const acikNcrPartileri = async (db: Db, bakiyeler: readonly SevkBakiyesi[]): Promise<ReadonlySet<number>> =>
  acikNcrPartiCozucu === null || bakiyeler.length === 0 ? new Set() : acikNcrPartiCozucu(db, [...new Set(bakiyeler.map((b) => b.partiId))]);
const ncrEngelMetni = (ncrEngelli: bigint): string => (ncrEngelli > 0n ? ` ${bindenMetin(ncrEngelli)} adet açık uygunsuzluk (NCR) kaydında; sevk edilemez.` : '');

// 1059 a: yetmeyen sevk reddedilmez; eksik son seçilen lota eklenir, o lot bulunduğu konumda eksiye düşer (sonraki giriş tamamlar).
// Kalite kararı bekleyen, karantinadaki ya da açık NCR'li parça varken, ya da emrin hiç parçası yokken (eksiye düşecek lot ve konum yok)
// reddedilir. Eksik red olmayan son lota yazılır: eksiye düşen miktar red parça sayılmasın.
function sevkEksiginiYukle(emirNo: string, istenen: bigint, r: ReturnType<typeof sevkKaynaklariSec>): void {
  if (r.eksik === 0n) return;
  const ileti = `Emir ${emirNo}: sevk için ${bindenMetin(istenen)} adet gerekli, stokta ${bindenMetin(istenen - r.eksik)} adet var.`;
  const kalite = r.engelli > 0n ? ` ${bindenMetin(r.engelli)} adet kalite kararı bekliyor ya da karantinada; sevk edilemez.` : '';
  if (r.engelli > 0n || r.ncrEngelli > 0n) throw cakisma(`${ileti}${kalite}${ncrEngelMetni(r.ncrEngelli)}`);
  const son = r.secim.findLast((b) => b.kaliteDurumu !== 'red') ?? r.secim.at(-1);
  if (son === undefined) throw cakisma(`${ileti} Eksiye düşecek lot yok.`);
  son.alinan += r.eksik;
}

// Taşınan ya da düşülen red parça ve eksiye düşen miktar döner: sevkiyat uyarıyı kullanıcıya gösterir.
async function sevkTasi(db: Db, kisiId: number, s: UrunSevkSatiri, malzemeId: number, emirNo: string, adim: 'yola' | 'teslim', hedef: number | null): Promise<{ red: bigint; eksi: bigint }> {
  const istenen = s.adet === null ? null : sevkAdediBinde(s.adet);
  if (istenen === null) throw gecersiz(`Emir ${emirNo}: sevk adedi bilinmiyor; stok yazılamaz.`);
  if (istenen <= 0n) return { red: 0n, eksi: 0n };
  const yolda = adim === 'teslim' && s.firmaId !== null ? await firmaKonumuBul(db, s.firmaId, 'yolda') : null;
  const bakiyeler = yolda === null
    ? await sorgular.emrinSevkBakiyeleri(db, malzemeId, s.uretimEmriId)
    : (await sorgular.istasyondakiEmirBakiyeleri(db, yolda, malzemeId, s.uretimEmriId)).map((b) => ({ ...b, konumId: yolda, konumTuru: 'yolda' as const }));
  const r = sevkKaynaklariSec(bakiyeler, istenen, await acikNcrPartileri(db, bakiyeler));
  sevkEksiginiYukle(emirNo, istenen, r);
  return sevkSeciminiYaz(db, kisiId, r.secim, { malzemeId, uretimEmriId: s.uretimEmriId, hedef, aciklama: sevkAciklamasi(s.isId, emirNo, adim) });
}
// Seçilen bakiyeler hedefe taşınır ya da (hedef yoksa) sevk çıkışıyla düşer; red parçanın açıklaması ekini taşır.
async function sevkSeciminiYaz(
  db: Db, kisiId: number, secim: readonly (SevkBakiyesi & { alinan: bigint })[], d: { malzemeId: number; uretimEmriId: number; hedef: number | null; aciklama: string },
): Promise<{ red: bigint; eksi: bigint; hareketIdler: number[] }> {
  const { malzemeId, hedef, aciklama } = d;
  let red = 0n, eksi = 0n;
  const hareketIdler: number[] = [];
  for (const b of secim) {
    if (b.kaliteDurumu === 'red') red += b.alinan;
    const anahtar = { malzemeId, partiId: b.partiId, statuId: b.statuId, kaliteDurumu: b.kaliteDurumu };
    await siraliKilitle(db, { ...anahtar, konumId: b.konumId }, { ...anahtar, konumId: hedef });
    const eksik = await kilitliEksik(db, { ...anahtar, konumId: b.konumId }, b.alinan);
    eksi += eksik;
    hareketIdler.push(await sorgular.hareketYaz(db, hareket({
      tur: hedef === null ? 'cikis' : 'transfer', malzemeId, miktar: bindenMetin(b.alinan), kisiId, partiId: b.partiId, partiSecimi: 'kisi',
      kaynakKonumId: b.konumId, hedefKonumId: hedef, kaynakStatuId: b.statuId, hedefStatuId: hedef === null ? null : b.statuId,
      kaynakKaliteDurumu: b.kaliteDurumu, hedefKaliteDurumu: hedef === null ? null : b.kaliteDurumu, onayliEksi: eksik > 0n, cikisNedeni: hedef === null ? 'sevk' : null,
      uretimEmriId: d.uretimEmriId, aciklama: b.kaliteDurumu === 'red' ? aciklama + RED_EKI : aciklama,
    })));
    await bakiyeDegistir(db, { ...anahtar, konumId: b.konumId, fark: -b.alinan });
    if (hedef !== null) await bakiyeDegistir(db, { ...anahtar, konumId: hedef, fark: b.alinan, ilkGiris: new Date().toISOString() });
  }
  return { red, eksi, hareketIdler };
}
async function sevkiGeriAl(db: Db, kisiId: number, s: UrunSevkSatiri, emirNo: string, adim: 'yola' | 'teslim'): Promise<void> {
  const aciklama = sevkAciklamasi(s.isId, emirNo, adim);
  const geri = `Ürün sevki geri alındı · iş ${String(s.isId)} · emir ${emirNo}`;
  for (const id of await sorgular.geriAlinmamisSevkHareketleri(db, s.uretimEmriId, aciklama, RED_EKI)) await tersCevir(db, kisiId, id, false, geri);
}

// Dönen: red parça uyarıları (147 b), Türkçe; sevkiyat komut cevabında gösterir. Uyarı yalnız ileri adımda (yola çıkış, teslim) verilir.
export async function urunSevkiYansit(db: Db, olay: UrunSevkiOlayi): Promise<string[]> {
  const adimlar = urunSevkAdimlari(olay.onceki, olay.yeni);
  const uyarilar: string[] = [];
  if (adimlar.length === 0) return uyarilar;
  if (olay.kisiId === null) throw gecersiz('Ürün sevki kişisiz yazılamaz.');
  const kisiId = olay.kisiId;
  for (const s of olay.satirlar) {
    const emir = await uretimEmriOzeti(db, s.uretimEmriId);
    if (!emir || emir.malzemeNo === null) continue;
    const malzemeId = emir.malzemeNo;
    const o = await malzemeOzeti(db, malzemeId);
    // Stoğa ürün kartıyla girmeyen emrin (mamul ve yarı mamul dışı, adımsız eski emir) ürününü stok izlemez.
    if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) continue;
    const { red, eksi } = await korumali(async () => {
      const enCok = { red: 0n, eksi: 0n };
      for (const a of adimlar) {
        let r = { red: 0n, eksi: 0n };
        if (a === 'yola_cik') {
          if (s.firmaId !== null) r = await sevkTasi(db, kisiId, s, malzemeId, emir.emirNo, 'yola', await firmaKonumuBul(db, s.firmaId, 'yolda'));
        } else if (a === 'teslim') r = await sevkTasi(db, kisiId, s, malzemeId, emir.emirNo, 'teslim', null);
        else await sevkiGeriAl(db, kisiId, s, emir.emirNo, a === 'teslim_geri' ? 'teslim' : 'yola');
        if (r.red > enCok.red) enCok.red = r.red;
        if (r.eksi > enCok.eksi) enCok.eksi = r.eksi;
      }
      return enCok;
    });
    // Havuzdan doğrudan teslimde aynı parça iki adımda geçer: uyarı bir kez, büyük miktarla.
    if (red > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(red)} adet red parça sevk edildi.`);
    if (eksi > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(eksi)} adet stokta yoktu, eksiye düştü; sonraki giriş tamamlar.`);
  }
  return uyarilar;
}

// ---- Depo sevk (944, 962 a, 966 b) ----------------------------------------------------------------------------------------------
// Sevkiyatın tetiklediği kalemde stok depoda oynar: ürün sevk çıkışıyla düşer, fason gidişi parçayı firmanın fason konumuna geçirir,
// geliş mal kabulle girer (satır kalemi taşır). Elle kalemde stok oynamaz: malzemesi ve lotu belli değildir, gerekirse elle çıkış yazılır.
export type FasonGidisYazici = (db: Db, kisiId: number, g: { uretimEmriId: number; isEmriId: number; adet: number; sevkKalemiId: number }) => Promise<{ hareketId: number }>;
let fasonGidisYazici: FasonGidisYazici | null = null;
// Fason gidiş kaydı üretim emrinindir; bağ sunucu/kablolama.ts'de kurulur (bugün Dış operasyonlar yazar).
export function fasonGidisYaziciKaydet(y: FasonGidisYazici): void { fasonGidisYazici = y; }
const depoCikisAciklamasi = (kalemId: number, emirNo: string): string => `Depo çıkışı · kalem ${String(kalemId)} · emir ${emirNo}`;

export async function depoSevkListesi(db: Db): Promise<DepoSevkCevabi> {
  const kalemler = await depoBekleyenleri(db);
  const emirler = await emirNolari(db, [...new Set(kalemler.flatMap((k) => (k.uretimEmriId === null ? [] : [k.uretimEmriId])))]);
  const malzemeler = await malzemeAdlari(db, [...new Set(kalemler.flatMap((k) => (k.malzemeNo === null ? [] : [k.malzemeNo])))]);
  const firmalar = await firmaAdlari(db, [...new Set(kalemler.flatMap((k) => (k.firmaId === null ? [] : [k.firmaId])))]);
  const adimlar = new Map((kalemler.some((k) => k.isEmriId !== null) ? await fasonIsEmirleri(db) : []).map((f) => [f.isEmriId, f.opNo]));
  return {
    satirlar: kalemler.map((k) => ({
      kalemId: k.kalemId, is: k.is, kaynak: k.kaynak, uretimEmriId: k.uretimEmriId, emirNo: k.uretimEmriId === null ? null : emirler.get(k.uretimEmriId) ?? null,
      isEmriId: k.isEmriId, opNo: k.isEmriId === null ? null : adimlar.get(k.isEmriId) ?? null, malzemeId: k.malzemeNo,
      malzemeAd: k.malzemeNo === null ? null : malzemeler.get(k.malzemeNo) ?? null, adet: k.adet, kabulAdet: k.kabulAdet,
      firmaId: k.firmaId, firmaAd: k.firmaId === null ? null : firmalar.get(k.firmaId) ?? null, tasima: k.tasima, tetiklendi: k.tetiklendi, erken: k.erken,
      siparisSatirId: k.siparisSatiriId,
    })),
  };
}

export async function depoCikisiYap(db: Db, kisiId: number, kalemId: number): Promise<DepoCikisCevabi> {
  const k = await depoKalemiAl(db, kalemId, 'cikis');
  const sonuc: { hareketIdler: number[]; uyarilar: string[] } = { hareketIdler: [], uyarilar: [] };
  if (k.kaynak === 'urun') Object.assign(sonuc, await urunDepoCikisi(db, kisiId, k));
  else if (k.kaynak === 'fason') {
    let hareketId = k.fasonHareketId;
    if (hareketId === null) {
      if (fasonGidisYazici === null || k.uretimEmriId === null || k.isEmriId === null || k.adet === null) throw gecersiz('Fason gidişi bu kalemden yazılamıyor; Dış operasyonlardan gönderin.');
      hareketId = (await fasonGidisYazici(db, kisiId, { uretimEmriId: k.uretimEmriId, isEmriId: k.isEmriId, adet: Number(k.adet), sevkKalemiId: k.kalemId })).hareketId;
    }
    await fasonGidisiniTasi(db, kisiId, hareketId, true, 'Depo çıkışı, fasona');
  }
  await depoCikisiYaz(db, kisiId, kalemId);
  return { kalemId, hareketIdler: sonuc.hareketIdler, ...(sonuc.uyarilar.length ? { uyarilar: sonuc.uyarilar } : {}) };
}

// Erken çıkışta (945 a) eksik çıkışı durdurmaz: eldeki kadarı çıkar, eksik uyarıdır. Yola önceden taşınmış parça (göçten önce onaylanmış iş)
// firmanın Yolda konumundan önce alınır.
async function urunDepoCikisi(db: Db, kisiId: number, k: DepoKalemi): Promise<{ hareketIdler: number[]; uyarilar: string[] }> {
  const emir = k.uretimEmriId === null ? null : await uretimEmriOzeti(db, k.uretimEmriId);
  if (!emir || emir.malzemeNo === null) return { hareketIdler: [], uyarilar: [] };
  const malzemeId = emir.malzemeNo;
  const o = await malzemeOzeti(db, malzemeId);
  if (!o || (o.tur !== 'mamul' && o.tur !== 'yarimamul')) return { hareketIdler: [], uyarilar: [] };
  const yolda = k.firmaId === null ? null : await firmaKonumuBul(db, k.firmaId, 'yolda');
  const yoldakiler = yolda === null ? [] : (await sorgular.istasyondakiEmirBakiyeleri(db, yolda, malzemeId, emir.id)).map((b) => ({ ...b, konumId: yolda, konumTuru: 'yolda' as const }));
  const bakiyeler = [...yoldakiler, ...await sorgular.emrinSevkBakiyeleri(db, malzemeId, emir.id)];
  // Bitmemiş emrin erken çıkışında adet henüz yoktur: sevk edilebilir olanın hepsi çıkar.
  const ncr = await acikNcrPartileri(db, bakiyeler);
  const istenen = k.adet !== null ? sevkAdediBinde(k.adet) : k.erken ? sevkKaynaklariSec(bakiyeler, 1n << 62n, ncr).secim.reduce((t, b) => t + b.alinan, 0n) : null;
  if (istenen === null) throw gecersiz(`Emir ${emir.emirNo}: sevk adedi bilinmiyor; stok yazılamaz.`);
  if (istenen === 0n) throw cakisma(`Emir ${emir.emirNo}: sevk edilebilir parça yok.`);
  const r = sevkKaynaklariSec(bakiyeler, istenen, ncr);
  const { secim, eksik, engelli, ncrEngelli } = r;
  const uyarilar: string[] = [];
  if (eksik > 0n && k.erken) {
    const neden = (engelli > 0n ? ` ${bindenMetin(engelli)} adet kalite kararı bekliyor ya da karantinada; sevk edilemez.` : '') + ncrEngelMetni(ncrEngelli);
    uyarilar.push(`Emir ${emir.emirNo}: sevk için ${bindenMetin(istenen)} adet gerekli, stokta ${bindenMetin(istenen - eksik)} adet var.${neden} Erken çıkış: eldeki kadarı çıktı.`);
  } else sevkEksiginiYukle(emir.emirNo, istenen, r);
  const { red, eksi, hareketIdler } = await korumali(() => sevkSeciminiYaz(db, kisiId, secim, { malzemeId, uretimEmriId: emir.id, hedef: null, aciklama: depoCikisAciklamasi(k.kalemId, emir.emirNo) }));
  if (red > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(red)} adet red parça sevk edildi.`);
  if (eksi > 0n) uyarilar.push(`Emir ${emir.emirNo}: ${bindenMetin(eksi)} adet stokta yoktu, eksiye düştü; sonraki giriş tamamlar.`);
  return { hareketIdler, uyarilar };
}

// Depo çıkışının geri alınması (teslim geri almanın yerine): ürün hareketleri ters çevrilir, fason parçası Yolda'ya döner (gidiş kaydı
// emirde kalır; yeniden çıkışta fasona geçer). Kalem yeniden depoda bekler.
export async function depoCikisiniGeriAlYap(db: Db, kisiId: number, kalemId: number): Promise<DepoCikisCevabi> {
  const k = await depoCikisiniGeriAl(db, kalemId);
  const hareketIdler: number[] = [];
  if (k.kaynak === 'urun' && k.uretimEmriId !== null) {
    const emir = await uretimEmriOzeti(db, k.uretimEmriId);
    if (emir) {
      const geri = `Depo çıkışı geri alındı · kalem ${String(kalemId)} · emir ${emir.emirNo}`;
      for (const id of await sorgular.geriAlinmamisSevkHareketleri(db, emir.id, depoCikisAciklamasi(kalemId, emir.emirNo), RED_EKI)) hareketIdler.push(await tersCevir(db, kisiId, id, false, geri));
    }
  } else if (k.kaynak === 'fason' && k.fasonHareketId !== null) {
    await fasonGidisiniTasi(db, kisiId, k.fasonHareketId, false, 'Depo çıkışı geri alındı');
  }
  return { kalemId, hareketIdler };
}

// Mal kabul satırının sevkiyat kalemi (944, 957 a): yalnız geliş; fason dönüşünde aynı fason adımı, alımda aynı sipariş satırı.
async function sevkKalemiKabulu(db: Db, kisiId: number, s: MalKabulKomutu['satirlar'][number], alan: string, malKabulSatirId: number): Promise<void> {
  if (s.sevkKalemiId === undefined) return;
  const k = await depoKalemiAl(db, Number(s.sevkKalemiId), 'kabul');
  if (k.kaynak === 'fason-donus' && (s.fasonIsi === undefined || Number(s.fasonIsi.isEmriId) !== k.isEmriId)) {
    throw dogrulama('Bu kalem bir fason dönüşüdür; satır aynı fason işine bağlanır.', `${alan}.sevkKalemiId`);
  }
  if (k.kaynak === 'alim' && k.siparisSatiriId !== null && (s.siparisSatirId === undefined || Number(s.siparisSatirId) !== k.siparisSatiriId)) {
    throw dogrulama('Bu kalem başka bir sipariş satırının alımıdır.', `${alan}.sevkKalemiId`);
  }
  await depoKabuluYaz(db, kisiId, k.kalemId, bindenMetin(binde(s.miktar)), malKabulSatirId);
}

// ---- Refakat partisi (kart #123): depo lotu okutup emre ayırınca doğar, kartı basılır; teslim kartla yapılır ------------------
async function refakatPartileriCevir(db: Db, satirlar: RefakatPartisiHam[]): Promise<RefakatPartisi[]> {
  const bagliIdler = [...new Set(satirlar.flatMap((r) => [r.ustRefakatPartisiId, r.birlestigiRefakatPartisiId]).filter((x): x is number => x !== null))];
  const bagliler = bagliIdler.length === 0 ? [] : await sorgular.refakatPartileriBul(db, bagliIdler);
  const nolar = await emirNoHaritasi(db, [...satirlar, ...bagliler].map((r) => r.uretimEmriId));
  const ozetler = await malzemeOzetleri(db, satirlar.map((r) => r.malzemeId));
  const bag = (id: number | null): { id: number; etiket: string } | null => {
    const b = id === null ? undefined : bagliler.find((x) => x.id === id);
    return b === undefined ? null : { id: b.id, etiket: refakatEtiketi(emirNoDe(nolar, b.uretimEmriId), b.uretimEmriId, b.sira) };
  };
  return satirlar.map((r) => {
    const o = ozetler.get(r.malzemeId);
    const emirNo = emirNoDe(nolar, r.uretimEmriId);
    return {
      id: r.id, qr: `${KOD_ONEKI['refakat-partisi']}:${r.id}`, etiket: refakatEtiketi(emirNo, r.uretimEmriId, r.sira), uretimEmriId: r.uretimEmriId, emirNo, sira: r.sira,
      malzemeId: r.malzemeId, malzemeKod: o?.kod ?? null, malzemeAd: o?.ad ?? null, birim: o?.birim ?? null,
      partiId: r.partiId, lotNo: r.lotNo, tedarikciPartiNo: r.tedarikciPartiNo, dokumNo: r.dokumNo, sertifikaNo: r.sertifikaNo, lotaBaglanmaZamani: r.lotaBaglanmaZamani,
      verilen: bindenMetin(binde(r.verilen)), durum: r.durum, surum: r.surum, kayitZamani: r.kayitZamani,
      ust: bag(r.ustRefakatPartisiId), birlestigi: bag(r.birlestigiRefakatPartisiId), birlesmeZamani: r.birlesmeZamani,
    };
  });
}
export async function refakatPartisiOku(db: Db, id: number): Promise<RefakatPartisiCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  return { refakat: (await refakatPartileriCevir(db, [r]))[0]! };
}
// Refakat kartları sayfası (kart #708): emrin kartı bir kez okunur; aynı emrin kartları ürünü paylaşır. Sırayla: işlemdeki tek bağlantıda
// sorgular eşzamanlı koşamaz.
export async function refakatKartlari(db: Db, durum: 'acik' | 'tumu'): Promise<RefakatKartlariCevabi> {
  const satirlar = await sorgular.refakatKartlariListe(db, durum === 'tumu', REFAKAT_KARTLARI_SINIRI + 1);
  const kartlar = await refakatPartileriCevir(db, satirlar.slice(0, REFAKAT_KARTLARI_SINIRI));
  const emirler = new Map<number, RefakatKartiCevabi>();
  for (const id of new Set(kartlar.map((k) => k.uretimEmriId))) emirler.set(id, await refakatKarti(db, id));
  return {
    kartlar: kartlar.map((r) => {
      const e = emirler.get(r.uretimEmriId)!;
      return { refakat: r, urun: e.urun, adet: e.adet, teslim: e.teslim, adimSayisi: e.adimlar.length };
    }),
    sinirda: satirlar.length > REFAKAT_KARTLARI_SINIRI,
  };
}
export async function emrinRefakatPartileri(db: Db, uretimEmriId: number): Promise<RefakatPartileriCevabi> {
  return { partiler: await refakatPartileriCevir(db, await sorgular.emrinRefakatPartileri(db, uretimEmriId)) };
}
// Soru 116 b: emre ayırmada lot etiketi okutulur (ya da lot okutularak eklenmiş sepet satırı seçilir); kart etiketi kartı açmaz. Aynı emir ve lotun açık partisi
// varsa o döner (aynı lotun kalanı aynı kartla gider); başka lot yeni parti açar.
export async function refakatPartisiAc(db: Db, kisiId: number, g: { uretimEmriId: number; lotKodu?: string | undefined; sepetSatirId?: number | undefined }): Promise<RefakatPartisiCevabi> {
  let lot: Awaited<ReturnType<typeof sorgular.partiBul>>;
  let sepetSatiri: number | null = null;
  if (g.sepetSatirId !== undefined) {
    const satir = (await sorgular.sepetSatirlari(db, kisiId, true)).find((x) => x.id === g.sepetSatirId);
    if (!satir) throw bulunamadi('Sepet satırı bulunamadı.');
    if (satir.partiId === null) throw dogrulama('Bu satırın lotu yok; lot etiketini okutup sepete ekleyin.', 'sepetSatirId');
    lot = await sorgular.partiBul(db, satir.partiId);
    sepetSatiri = satir.id;
  } else {
    const t = kodTuru(g.lotKodu ?? '');
    lot = t.tur === 'lot' ? await sorgular.lotNoylaParti(db, t.deger) : null;
    if (!lot) throw dogrulama(t.tur === 'lot' ? 'Lot bulunamadı.' : 'Lot etiketini okutun; refakat kartı lotla açılır.', 'lotKodu');
  }
  if (!lot) throw bulunamadi('Lot bulunamadı.');
  const engel = refakatLotEngeli(lot);
  if (engel) throw dogrulama(engel, 'lotKodu');
  const e = await uretimEmriOzeti(db, g.uretimEmriId);
  if (e === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (e.durum === 'bitti' || e.durum === 'iptal') throw dogrulama(`Emir ${e.emirNo} ${e.durum === 'bitti' ? 'bitti' : 'iptal edildi'}; refakat kartı açılmaz.`, 'uretimEmriId');
  if (sepetSatiri !== null) await sorgular.sepettenSil(db, sepetSatiri, kisiId);
  const varOlan = await sorgular.acikRefakatPartisi(db, g.uretimEmriId, lot.id);
  if (varOlan) return { refakat: (await refakatPartileriCevir(db, [varOlan]))[0]! };
  const id = await sorgular.refakatPartisiAc(db, { uretimEmriId: g.uretimEmriId, malzemeId: lot.malzemeId, partiId: lot.id, kisiId })
    ?? (await sorgular.acikRefakatPartisi(db, g.uretimEmriId, lot.id))!.id;
  return refakatPartisiOku(db, id);
}
export async function refakatPartisiIptal(db: Db, kisiId: number, id: number, g: { surum: number }): Promise<RefakatPartisiCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id, true);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  const engel = refakatIptalEngeli(r, await sorgular.refakatUretimiVar(db, r.id));
  if (engel) throw cakisma(engel);
  await surumluGuncelle({
    guncelle: () => sorgular.refakatPartisiIptal(db, id, g.surum, kisiId), varMi: () => sorgular.refakatPartisiVarMi(db, id), bulunamadiIletisi: 'Refakat kartı bulunamadı.',
  });
  return refakatPartisiOku(db, id);
}
// Alt parti (kol) kartı (kart #126): bölmeyle doğan kol, üst emrin kartının lotuyla kendi kartını alır; parçalar artık bu kartla
// sayılır. Kart üst karta bağlanır (iz ve birleşmede üst karta dönüş). Kolun aynı lotla açık kartı varsa o döner.
export async function refakatKolKartiAc(db: Db, kisiId: number, ustId: number, g: { uretimEmriId: number }): Promise<RefakatPartisiCevabi> {
  const ust = await sorgular.etkinRefakatPartisiBul(db, ustId);
  if (!ust) throw bulunamadi('Refakat kartı bulunamadı.');
  const kol = await uretimEmriOzeti(db, g.uretimEmriId);
  if (kol === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  const engel = refakatKolEngeli(ust, kol);
  if (engel) throw dogrulama(engel, 'uretimEmriId');
  const lotId = ust.partiId;
  if (lotId === null) throw dogrulama('Üst kart lot bekliyor; alt parti kartı lota bağlandıktan sonra açılır.', 'uretimEmriId');
  const varOlan = await sorgular.acikRefakatPartisi(db, kol.id, lotId);
  if (varOlan) return { refakat: (await refakatPartileriCevir(db, [varOlan]))[0]! };
  const id = await sorgular.refakatPartisiAc(db, { uretimEmriId: kol.id, malzemeId: ust.malzemeId, partiId: lotId, kisiId, ustRefakatPartisiId: ust.id })
    ?? (await sorgular.acikRefakatPartisi(db, kol.id, lotId))!.id;
  return refakatPartisiOku(db, id);
}
// Birleşen emrin açık kartları hedef emrin kartına bağlanır (kart #126): kol üst emre döndüyse üst kart, değilse hedefin aynı lotla
// açık kartı; o da yoksa hedefe aynı lotla kart açılır. Eski kart okutulunca birleştiği kart döner; iz iki kartı da gösterir.
async function refakatKartlariniBirlestir(db: Db, kaynakEmirId: number, hedefEmirId: number, kisiId: number): Promise<void> {
  for (const k of await sorgular.emrinRefakatPartileri(db, kaynakEmirId)) {
    if (k.durum !== 'acik' || k.birlestigiRefakatPartisiId !== null) continue;
    const ust = k.ustRefakatPartisiId === null ? null : await sorgular.etkinRefakatPartisiBul(db, k.ustRefakatPartisiId);
    const lotId = k.partiId;
    // İstisna kartı hedefin aynı malzemedeki istisna kartına birleşir; yoksa hedefe lotsuz kart açılır (bağlanmamış düşümler kaynak kartta kalır).
    const ayniKart = (): Promise<RefakatPartisiHam | null> =>
      (lotId === null ? sorgular.acikIstisnaKarti(db, hedefEmirId, k.malzemeId) : sorgular.acikRefakatPartisi(db, hedefEmirId, lotId));
    const hedef = ust !== null && ust.uretimEmriId === hedefEmirId && ust.durum === 'acik' ? ust : await ayniKart();
    const hedefId = hedef?.id
      ?? (lotId === null ? await sorgular.istisnaKartiAc(db, { uretimEmriId: hedefEmirId, malzemeId: k.malzemeId, kisiId })
        : await sorgular.refakatPartisiAc(db, { uretimEmriId: hedefEmirId, malzemeId: k.malzemeId, partiId: lotId, kisiId }))
      ?? (await ayniKart())!.id;
    await sorgular.refakatBirlestir(db, k.id, hedefId);
  }
}
export async function refakatIzi(db: Db, id: number): Promise<RefakatIziCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  const soy = await sorgular.refakatSoyu(db, r.id);
  const ustler: RefakatPartisiHam[] = [];
  for (let u = r.ustRefakatPartisiId; u !== null && ustler.length < 20;) {
    const x = await sorgular.refakatPartisiBul(db, u);
    if (x === null) break;
    ustler.push(x);
    u = x.ustRefakatPartisiId;
  }
  const [altlar, birlesenler, ayniLot] = [
    await sorgular.altRefakatPartileri(db, r.id), await sorgular.birlesenRefakatPartileri(db, r.id),
    r.partiId === null ? [] : (await sorgular.lotunRefakatPartileri(db, r.partiId)).filter((x) => x.id !== r.id),
  ];
  const { ciktilar, sevkCikislari } = await kartlarinCiktiVeSevkleri(db, soy);
  const cevir = (l: RefakatPartisiHam[]) => refakatPartileriCevir(db, l);
  return {
    refakat: (await cevir([r]))[0]!, ustler: await cevir(ustler), altlar: await cevir(altlar), birlesenler: await cevir(birlesenler), ayniLot: await cevir(ayniLot),
    ciktilar, sevkler: sevkCikislari,
  };
}
// Kartlarla sayılan üretim partileri (eldekiyle) ve bu partilerden yapılmış sevk çıkışları; kart izi ve lot izi ortak okur.
async function kartlarinCiktiVeSevkleri(db: Db, kartlar: readonly number[]): Promise<{ ciktilar: RefakatCiktisi[]; sevkCikislari: RefakatSevki[] }> {
  if (kartlar.length === 0) return { ciktilar: [], sevkCikislari: [] };
  const [ciktilar, sevkler] = [await sorgular.refakatCiktilari(db, kartlar), await sorgular.refakatSevkleri(db, kartlar)];
  const ozetler = await malzemeOzetleri(db, [...ciktilar.map((c) => c.malzemeId), ...sevkler.map((x) => x.malzemeId)]);
  const nolar = await emirNoHaritasi(db, sevkler.flatMap((x) => (x.uretimEmriId === null ? [] : [x.uretimEmriId])));
  const malzeme = (m: number) => { const o = ozetler.get(m); return { malzemeId: m, malzemeKod: o?.kod ?? null, malzemeAd: o?.ad ?? null, birim: o?.birim ?? null }; };
  return {
    ciktilar: ciktilar.map((c) => ({ partiId: c.partiId, lotNo: c.lotNo, refakatPartisiId: c.refakatPartisiId, ...malzeme(c.malzemeId), eldeki: bindenMetin(binde(c.eldeki)) })),
    sevkCikislari: sevkler.map((x) => ({
      hareketId: x.hareketId, zaman: x.zaman, partiId: x.partiId, lotNo: x.lotNo, ...malzeme(x.malzemeId), miktar: bindenMetin(binde(x.miktar)),
      emirNo: x.uretimEmriId === null ? null : emirNoDe(nolar, x.uretimEmriId), aciklama: x.aciklama,
    })),
  };
}
// ---- İstisna kartı (Soru 129, 131 a): lot bekleyen kartlar ve lota bağlama ---------------------------------------------------------
export async function lotBekleyenKartlar(db: Db): Promise<LotBekleyenKartlarCevabi> {
  const satirlar = await sorgular.lotBekleyenKartlar(db);
  const kartlar = await refakatPartileriCevir(db, await sorgular.refakatPartileriBul(db, satirlar.map((x) => x.id)));
  return { kartlar: satirlar.flatMap((x) => { const r = kartlar.find((k) => k.id === x.id); return r ? [{ refakat: r, bekleyen: bindenMetin(binde(x.bekleyen)) }] : []; }) };
}
// Lota bağlama: her lotsuz düşüm geri alınır ve aynı miktar lottan (önce düşümün istasyonundaki, sonra en eski bakiyeden) emre sarf
// yazılır; lot o düşüme yetmezse durulur, kalan bekler. Hepsi bağlanınca kart lotu alır; emrin o lotla açık kartı varsa ona birleşir.
// Kod lot etiketi ya da refakat kartıdır (eksik malzeme o kartın lotundandır). Sarfın iş emri korunur: sayım düzeltmesi onu geri alır.
export async function refakatLotaBagla(db: Db, kisiId: number, id: number, g: { kod: string; surum: number }): Promise<RefakatLotaBaglaCevabi> {
  const r = await sorgular.refakatPartisiBul(db, id, true);
  if (!r) throw bulunamadi('Refakat kartı bulunamadı.');
  const t = kodTuru(g.kod);
  let partiId: number | null = null;
  if (t.tur === 'lot') partiId = (await sorgular.lotNoylaParti(db, t.deger))?.id ?? null;
  else if (t.tur === 'refakat-partisi') partiId = (await sorgular.etkinRefakatPartisiBul(db, Number(t.deger)))?.partiId ?? null;
  const lot = partiId === null ? null : await sorgular.partiBul(db, partiId);
  if (!lot) throw dogrulama(t.tur === 'refakat-partisi' ? 'Okutulan kartın lotu yok.' : 'Lot bulunamadı; lot etiketini ya da refakat kartını okutun.', 'kod');
  const engel = refakatBaglamaEngeli(r, lot, g.surum);
  if (engel) throw dogrulama(engel, 'kod');
  const etiket = (await refakatPartileriCevir(db, [r]))[0]!.etiket;
  const y: UretimYazimi = { uretimEmriId: r.uretimEmriId, kisiId, konumId: 0, malzemeId: r.malzemeId, aciklama: `Lota bağlama · ${etiket} · ${lot.lotNo}`.slice(0, 200) };
  let baglanan = 0n;
  await korumali(async () => {
    for (const d of await sorgular.istisnaDusumleri(db, r.id)) {
      const m = binde(d.miktar);
      // Rezerve sınırı yok: geri alma ve lottan düşüm aynı miktardır, malzemenin toplamı değişmez; başka emre ayrılan azalmaz.
      const secim = girdiSec((await sorgular.lotunBaglamaBakiyeleri(db, lot.id, d.konumId)).map((b) => ({ ...b, kaliteDurumu: 'serbest' as const })), m, m);
      if (secim.reduce((x, a) => x + a.miktar, 0n) < m) break;
      await siraliKilitle(db, { malzemeId: r.malzemeId, konumId: d.konumId, partiId: null }, ...secim.map((a) => ({ malzemeId: r.malzemeId, konumId: a.konumId, partiId: lot.id })));
      const geriId = await sorgular.hareketYaz(db, hareket({
        tur: 'geri_alma', malzemeId: r.malzemeId, miktar: d.miktar, kisiId, hedefKonumId: d.konumId, hedefKaliteDurumu: 'serbest', uretimEmriId: r.uretimEmriId,
        geriAlinanId: d.hareketId, aciklama: y.aciklama,
      }));
      await bakiyeDegistir(db, { malzemeId: r.malzemeId, konumId: d.konumId, partiId: null, statuId: null, kaliteDurumu: 'serbest', fark: m });
      await rezerveDegistir(db, { malzemeId: r.malzemeId, statuId: null, uretimEmriId: r.uretimEmriId, fark: m });
      let lotHareketi: number | null = null;
      for (const a of secim) {
        const hid = await sorgular.hareketYaz(db, hareket({
          tur: 'cikis', malzemeId: r.malzemeId, miktar: bindenMetin(a.miktar), kisiId, partiId: lot.id, partiSecimi: 'kisi', kaynakKonumId: a.konumId, kaynakKaliteDurumu: 'serbest',
          cikisNedeni: 'uretime_sarf', uretimEmriId: r.uretimEmriId, isEmriId: d.isEmriId, aciklama: y.aciklama,
        }));
        lotHareketi ??= hid;
        await bakiyeDegistir(db, { malzemeId: r.malzemeId, konumId: a.konumId, partiId: lot.id, statuId: null, kaliteDurumu: 'serbest', fark: -a.miktar });
        await rezerveDegistir(db, { malzemeId: r.malzemeId, statuId: null, uretimEmriId: r.uretimEmriId, fark: -a.miktar });
      }
      await sorgular.istisnaDusumuBagla(db, d.id, geriId, lotHareketi!);
      baglanan += m;
    }
    if ((await sorgular.istisnaDusumleri(db, r.id)).length > 0) return;
    const ayni = await sorgular.acikRefakatPartisi(db, r.uretimEmriId, lot.id);
    if (ayni) await sorgular.refakatBirlestir(db, r.id, ayni.id);
    else if (!(await sorgular.refakatLotaBagla(db, r.id, lot.id, kisiId))) throw cakisma('Kart bu sırada değişti; listeyi yenileyip yeniden deneyin.');
  });
  const bekleyen = (await sorgular.istisnaDusumleri(db, r.id)).reduce((x, d) => x + binde(d.miktar), 0n);
  const etkin = (await sorgular.etkinRefakatPartisiBul(db, r.id))!;
  return { refakat: (await refakatPartileriCevir(db, [etkin]))[0]!, baglanan: bindenMetin(baglanan), bekleyen: bindenMetin(bekleyen) };
}
// Kart, emrin refakat kartıdır (Üretim Emirleri'nin verisi); QR partiyi taşır, lot bilgisi partiden gelir.
export async function refakatPartisiKarti(db: Db, id: number): Promise<RefakatPartisiKartiCevabi> {
  const { refakat } = await refakatPartisiOku(db, id);
  return { refakat, kart: { ...(await refakatKarti(db, refakat.uretimEmriId)), qr: refakat.qr } };
}
