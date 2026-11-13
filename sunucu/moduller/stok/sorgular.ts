// Modülün sorgu girişi: sorgular alana göre sorgular/<alan>/sorgular.ts dosyalarındadır (SQL yalnız sorgular.ts adlı dosyada durur).
// Servis, disari.ts ve öteki modül dosyaları yalnız bu dosyayı ithal eder; alt dosyalar birbirini ithal edebilir, bu dosyayı ithal etmez.
export {
  type DepoSatiri, type KonumSatiri, type RafSatiri, type BakiyeHam, type HareketHam, type PartiHam, type MalKabulHam, depolar, depoKimligi, depoVarMi,
  konumBul, konumKoduyla, type KonumSuzgeci, KONUM_SIRALAMASI, konumSay, konumlar, konumAc, konumGuncelle, konumPasifYap, konumSayildi, haritaDepolari,
  depoAktifligi, depoDoluMu, depoKonumlariniKapat, haritaDeposuAc, haritaKonumlari, zeminKonumlari, haritaBagSayilari, haritasizKonumlar, gozStoklari,
  tumKonumKodlari, haritaKonumuAc, haritaKonumuGuncelle, haritaKonumuTuru, haritaKonumlariniKapat, type KonumKodu, kodDurumlari, konumVarMi, rafBul,
  type RafSuzgeci, RAF_SIRALAMASI, rafSay, raflar, type RafAlanlari, rafAc, rafGuncelle, rafPasifYap, rafVarMi, gozKodlariniYenile, gozleriYaz,
  fazlaGozleriKapat, rafGozleriniKapat, type GozHam, rafinGozleri, type KonumMalzemesiHam, type KonumMalzemesiSuzgeci,
  KONUM_MALZEMESI_SIRALAMASI, konumMalzemesiSay, konumMalzemeleri,
} from './sorgular/depo/sorgular.ts';
export {
  bakiyeKilitle, partileriBul, partininBakiyeleri, partininKarantinaBakiyeleri, partilerinRedBakiyeleri, karantinaOncesiKonumu, karantinaDisiKonumlar,
  partilerinRedGirisleri, hareketPartileri, type BakiyeAnahtari, bakiyeleriKilitle, bakiyeOku, konumBakiyeleri, malzemeBakiyeleri, serbestBakiyeler,
  gozdekiPartiler, type BakiyeYeni, bakiyeEkle, bakiyeGuncelle, bakiyeSil, konumaGelisYenile, partiBul, lotNoylaParti, lotBakiyeleri, type LotEtiketiHam, malKabulLotEtiketleri,
  partiLotEtiketi, type MalzemeEtiketiHam, type MalzemeEtiketiKaynagi, malzemeEtiketleri, type PartiAnahtari, emirPartisiBul, partiAc, refakatCiktiPartisiBul, refakatCiktiPartisiAc, refakatStokPartileri, partiKaynagi,
  refakatUretimiVar, lotNoVarMi, type PartiSuzgeci, PARTI_SIRALAMASI, partiSay, partiler, type HareketYeni, hareketYaz, akisAyarla, hareketBul,
  type HareketSuzgeci, suzgecVarMi, HAREKET_SIRALAMASI, hareketSay, hareketler, partiSonKullanma, partiSonKullanmaKilitle, partiSonKullanmaYaz,
  partiSonKullanmaDuzelt, partiMalzemesi, kartSktOzetleri,
} from './sorgular/bakiye/sorgular.ts';
export {
  type MalzemeStokHam, type MalzemeSuzgeci, MALZEME_SIRALAMASI, malzemeSay, malzemeStoklari, kartStoklari, malzemeStoku, type AyarHam, malzemeAyari,
  malzemeAmbalajlari, type AyarAlanlari, ayarAc, ayarGuncelle, konumAktifMi, kartBilgisiSay, kartBilgileri, ayarVarMi, ambalajlariYaz, type BelgeTablosu,
  belgeNoVarMi, type GirisKontroluHam, girisKontroluSatirlari, malKabulAc, malKabulBul, malKabulSatiriYaz, type MalKabulSatirHam, malKabulSatirlari,
  type MalKabulSuzgeci, MAL_KABUL_SIRALAMASI, malKabulSay, malKabuller, gozAdaylari, konumunRafOlcusu, stokluMalzemeToplamlari, degerGrubuMalzemeToplamlari,
  type AySonuToplami, aySonuMalzemeToplamlari, type DegerlemeAlisOlayiHam, degerlemeAlisOlaylari, panelSayilari, gunlukHareketler, kritikMalzemeler,
  malzemeKartiIzleri, aylikTuketim, tuketimTarihleri, emirsizCikislar,
} from './sorgular/malzeme/sorgular.ts';
export {
  isKutusuSayilari, stokMiktarlari, malzemeToplamlari, dusukStokSayisi, emirlerinNetSarfi, emirlerinSarfCikislari, emirlerinZincirdekiMiktari, statuluStoklar, statuSonHareketleri, emrinStatuAkisi, emirlerinFisHareketleri, emrinPartileri, type AkisHareketi,
  emrinAkisHareketleri, refakatCiktiPartiIdleri, type KartTeslimi, kartTeslimleri, type EmirTeslimSatiri, emirTeslimleri, type EmirIstekSatiri,
  emirIstekleri, partiGirisZamanlari, partiKimlikleri, sonPartiler, emirTamamlamaKilidi, emirUretimGirisi, konumKodlari, bakiyeDefterFarki,
  type EmirHareketiHam, emrinHareketleri, type EmirRezerveKaydi, emrinRezerveKayitlari, emrinRezerveToplamlari,
} from './sorgular/emir/sorgular.ts';
export {
  type SepetHam, sepetSatirlari, sepeteEkle, lotunGozdekiSerbesti, sepetMiktari, sepettenSil, sepetiBosalt, fisAc, fisSatiriYaz, type FisHam, fisBul, FIS_SIRALAMASI, fisSay,
  fisler, fisinHareketleri, toplamaAc, toplamaKalemiYaz, toplamaAdimiYaz, konumRotaBilgisi, type ToplamaHam, toplamaBul, TOPLAMA_SIRALAMASI, toplamaSay,
  toplamalar, toplamaKalemleri, type AdimHam, toplamaAdimlari, adimBul, adimToplandi, toplamaSurumu, toplamaKapat, toplamaVarMi, toplamaHedefiYaz,
  konumIstasyonu, toplamaHedefi, toplamaIstegiBagla, toplamaIstekBaglariniSil, toplamaIstekBaginiSil, type IstekHam, toplamaIstekleri, yoldaTeslimleri,
  yoldaTeslimVarMi, istegeTeslimler, istekAc, emrinAcikIstekleri, emrinYoldakiTeslimlerineYaz, istekBul, istekleriKoktan, istekleriKaynaktan,
  ISTEK_SIRALAMASI, istekSay, istekler, istekGecir, acikIstekSayisi, teslimBekleyenIstekSayisi, depoyaGelenTeslimSayisi, type StokYokIstegiHam,
  stokYokIstekleri, istekVarMi, istasyondanIstenenler, istekReddet, isteklerim, istekleriKoklerden,
} from './sorgular/toplama/sorgular.ts';
export {
  istasyonKonumlari, istasyonKonumu, konumaSonGirisler, istasyonKonumuAc, teslimUclari, istekStoklari, type TeslimHam, teslimAc, teslimBul, teslimKaynaktan,
  adiGecenKonumlar, teslimDepoKonumlari, ilkKabulKonumu, ilkKarantinaKonumu, suresiDolanTeslimler, teslimAraAlanlari, konumdakiPartiler,
  konumdakiPartiMiktarlari, teslimVarMi, yoldakiGelenler, okutarakAlinanlar, itirazYaz, iadeBagla, gonderdiklerim, type SonIslemHam, sonIslemlerim, teslimKapat, teslimeNotYaz, yoldaAyrilan,
  konumdakiYoldaAyrilanlar, konumlardakiYoldaAyrilanlar, baskaSepetlerdekiler, rafKoduyla, teslimGeriAlindi, yoldakiTeslimSayisi, type YerlesimHam, yerlesim,
  depoBul, depoAdiYaz, yerlesimGuncelle, yerlesimVarMi, rafYeriYaz, type YerlesimRafHam, yerlesimRaflari, gozleriYenidenNumarala, kodDenetiminiErtele,
  kodDenetiminiAc, konumAra, rafAra, partiAra, type PartiKaydi, partiKayitAra, type KonumKaydi, konumKayitAra, sayimBekleyenGozler, siparisIrsaliyeleri,
} from './sorgular/teslim/sorgular.ts';
export {
  istasyondakiEmirBakiyeleri, konumFirmasi, konumdakiParcaBakiyeleri, netStatuDonusumleri, konumdanTeslimEdilen, geriAlinmamisUretimGirisleri, firmaKonumu,
  firmaKonumuAc, firmadakiEmirler, emrinSevkBakiyeleri, geriAlinmamisSevkHareketleri, uretimGirdiKaynaklari, gozdekiKullanilamazKalite,
  konumKaliteToplamlari, kaliteBekleyenIstasyonKonumu, kaliteBakiyeleri, emrinIstasyonEksileri, emrinIstasyonArtilari, emrinStatuCevirmeleri, geriAlinmamisSarflar, emrinStatusuzSarfi,
  geriAlinmamisHurdaCikislari, type RezerveSatiri, rezerveKilidi, rezerveArtir, rezerveAzalt, rezerveler, tumRezerveler, statuToplami, emrinRezerveleriniSil,
  emirRezerveIstegiYaz, rezerveIsteyenEmirler, emrinNetSarfi, rezerveKaydiYaz, fasonaTasinan, type GirdiKaynagiAnahtari, uretimGirdiKaynaklariToplu,
} from './sorgular/uretim/sorgular.ts';
export {
  type RefakatPartisiHam, refakatPartisiBul, refakatPartileriBul, acikRefakatPartisi, refakatKartlariListe, emrinRefakatPartileri,
  istasyondaSatiriOlanKartlar, refakatPartisiAc, etkinRefakatPartisiBul, refakatBirlestir, altRefakatPartileri, birlesenRefakatPartileri,
  lotunRefakatPartileri, refakatSoyu, lotunKartlari, type RefakatCiktisiHam, refakatCiktilari, type RefakatSevkiHam, refakatSevkleri, refakatPartisiIptal,
  refakatPartisiVarMi, acikIstisnaKarti, istisnaKartiAc, istisnaDusumuYaz, istisnaDusumuMu, istisnaDusumuTasi, type IstisnaDusumuHam, istisnaDusumleri,
  istisnaDusumuBagla, type LotBekleyenKartHam, lotBekleyenKartlar, refakatLotaBagla, lotunBaglamaBakiyeleri, refakatYoldakiTeslimleri,
  kartliYoldakiTeslimler, type KartSatiriHam, kartSatirlari,
} from './sorgular/refakat/sorgular.ts';
export {
  emirFisleriniAc, emirFisiDegisti, type MalzemeFisiHam, MALZEME_FISI_SIRALAMASI, type MalzemeFisiSuzgeci, malzemeFisiSay, malzemeFisleri,
  malzemeFisiKimlikleri, malzemeFisleriBul, type BelgeKaynagi, type ListeFisiAnahtari, LISTE_FISI_SIRALAMASI, listeFisiSay, listeFisleri, type BelgeHam,
  teslimFisleriBul, toplamalarBul, hareketFisleriBul, belgeNoBul, malKabullerBul, emirlerinMalzemeFisleri, degisenMalzemeFisleri, type MalzemeFisiSatirHam,
  malzemeFisiSatirlari, malzemeFisininHareketleri, gonderimIstegiYaz, malzemeFisiVarMi, type KaliteEtiketiHam, kaliteEtiketleri,
} from './sorgular/malzeme-fisi/sorgular.ts';
export {
  konumunSayimEsigi, type SayimFarkiYeni, sayimFarkiEkle, type SayimFarkiHam, sayimFarklari, sayimFarkiBul, sayimFarkiVarMi, bekleyenSayimFarkiSayisi,
  sayimFarkiKarar, sayimEsikleri, sayimEsigiYaz, type PartiBakiyesi, malzemePartiBakiyeleri, sonDefterKarsilastirmasi, defterKarsilastirmaZamaniMi,
  defterKarsilastir, type DefterFarkiHam, defterFarklari,
} from './sorgular/sayim/sorgular.ts';
export {
  type SeriListeHam, type SeriSatirHam, seriAcikListeler, seriListe, seriListeKilitle, seriListeAc, seriSatirlari, seriSatirEkle, seriAdetYaz, seriSatirSil,
  seriIslendi, seriDegisti, seriListeKapat,
} from './sorgular/seri/sorgular.ts';
export {
  type MalKabulSatirSuzgeci, MAL_KABUL_SATIRI_SIRALAMASI, malKabulSatiriSay, type MalKabulListeSatiriHam, malKabulListeSatirlari, type LotYeriHam, lotYerleri,
  type MalKabulTaslakHam, malKabulTaslagiOku, malKabulTaslagiAc, malKabulTaslagiGuncelle, malKabulTaslagiSil,
} from './sorgular/kabul/sorgular.ts';
export {
  type BaslangicKonumu, konumlarKodlarla, konumlarIdlerle, type BaslangicLotu, lotlarNoyla, gozBakiyeleri, tekrarBelgesi, baslangicKilidi, baslangicBelgesiAc,
  baslangicBilgisi, baslangicEksenleriniKilitle, type HareketGorenSatir, hareketGorenSatirlar, baslangicSayilari,
} from './sorgular/baslangic/sorgular.ts';
