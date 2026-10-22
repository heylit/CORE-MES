import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  acikSiparisSatirlariCevabi, fasonIsleriCevabi, fasonIsleriSorgusu, cikisGovdesi, cikisOnerisiCevabi, emirTamamlaGovdesi, emirTamamlamaCevabi, cikisOnerisiSorgusu, depolarCevabi, geriAlGovdesi, topluGeriAlGovdesi, hareketCevabi, hareketlerCevabi, hareketlerSorgusu, isKutusuCevabi,
  depoRaflariGovdesi, gozOnerisiCevabi, haritaEslemeCevabi, haritaOzetiCevabi, zeminCevabi, bolumDeposuGovdesi, gozStoklariSorgusu, gozStoklariCevabi, kimlikParametresi, konumAcGovdesi, panelCevabi, aylikStokDegeriCevabi, aylikStokDegeriSorgusu, konumAyrintiCevabi, konumCevabi, konumDuzenleCevabi, konumDuzenleGovdesi, konumlarCevabi, konumlarSorgusu, malKabulAyrintiCevabi,
  malKabulCevabi, malKabulDuzeltGovdesi, malKabulGovdesi, malKabullerCevabi, malKabullerSorgusu, malzemeAyarGovdesi, malzemeAyrintiCevabi, malzemeKartBilgileriCevabi, partiBelgeParametresi, siparisIrsaliyeleriCevabi, siparisIrsaliyeleriSorgusu, sonPartilerCevabi, sonPartilerSorgusu,
  malzemelerCevabi, malzemelerSorgusu, malzemeOzetiCevabi, sayfaSorgusu, partiIziCevabi, partilerCevabi, partilerSorgusu, rafAcGovdesi,
  rafCevabi, rafDuzenleCevabi, rafDuzenleGovdesi, raflarCevabi, raflarSorgusu, rafMatrisiCevabi, sayimCevabi, sayimGovdesi, surumGovdesi, statuDegistirGovdesi, tasimaGovdesi, uretimGirisiGovdesi,
  rezerveEtGovdesi, rezerveKaldirGovdesi, rezervelerCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { gozKalemiGovdesi, gozKalemiSemasi, gozKalemiSilGovdesi, kayitCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import { z } from 'zod';
import {
  araCevabi, araSorgusu, sayimBekleyenlerCevabi, yerlesimCevabi, yerlesimKaydetGovdesi, adimToplaGovdesi, toplamaAcGovdesi, toplamaAdimParametresi, toplamaAyrintiCevabi, toplamaKapatGovdesi, toplamalarCevabi, toplamalarSorgusu,
  fisAyrintiCevabi, fisCevabi, fislerCevabi, fislerSorgusu, kodCozCevabi, kodCozSorgusu, okutCozCevabi, kisiKoduCevabi, lotEtiketleriCevabi, sepetCevabi, sepetDegistirGovdesi, sepetEkleGovdesi, sepetTeslimCevabi, stoktanDusGovdesi, teslimGovdesi,
  istekTeslimGovdesi, stokOzetiCevabi, malzemeIstegiCevabi, malzemeIstekleriCevabi, malzemeIstekleriSorgusu,
  istasyonSepetiCevabi, istasyonSepetiSorgusu, sepettenKullanGovdesi, gelecekSepetCevabi, isMalzemeleriCevabi, isMalzemesiIsteGovdesi, sepettenCekGovdesi, uretimHazirligiCevabi, uretimHazirligiGovdesi, istekAcGovdesi, istekMalzemeleriCevabi, istekMalzemeSorgusu, teslimAlGovdesi, teslimCevabi, teslimGonderGovdesi, teslimKutusuCevabi, teslimReddetGovdesi, yerdekiStokCevabi, yerdekiStokSorgusu,
  istekKabulGovdesi, istekReddetGovdesi, malzemeYerleriSorgusu, malzemeYerleriCevabi, okutarakAlSorgusu, okutarakAlCevabi, okutarakAlGovdesi, itirazGovdesi,
} from '#paylasilan/sozlesme/stok.ts';
import { refakatIziCevabi, refakatKolAcGovdesi, refakatPartileriCevabi, refakatPartisiAcGovdesi, refakatPartisiCevabi, refakatPartisiKartiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { statulerCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import * as s from './servis.ts';

// ST5 a: stoğu stok sayfası ya da bir stok işlemi olan okur (ADR 0007). Menü sayacı kabuğundur, oturumla açık kalır.
// Yazma komutları POST'tur ve kendi işlemini ister; yinelenince iki kez yazacak olanlar tekrar korumalıdır (ağ hatasından
// sonraki yeniden gönderim ikinci mal kabul ya da hareket açmaz). Sürümlü, tekil ya da bir kez yapılan komut bayrak almaz.
const OKUMA = { biri: ['sayfa.stok', ...STOK_ISLEMLERI] } as const;
// Satın alma Malzemeler'de hammadde sertifikasını, siparişte irsaliyesini gösterir; cevap fiyat taşımaz.
const SON_PARTI_OKUMA = { biri: ['sayfa.stok', ...STOK_ISLEMLERI, 'satin-alma.oku', 'satin-alma.yaz'] } as const;
export const uclar = [
  uc({ yontem: 'GET', yol: '/stok/is-kutusu', yetki: OKUMA, cevap: isKutusuCevabi, isle: ({ db, kullanici }) => s.isKutusu(db, kullanici.islemler, kullanici.id) }),
  uc({ yontem: 'GET', yol: '/stok/ozet', yetki: 'oturum', cevap: stokOzetiCevabi, isle: ({ db, kullanici }) => s.stokOzeti(db, kullanici.islemler) }),
  uc({ yontem: 'GET', yol: '/stok/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi, isle: ({ db, kullanici }) => s.menuSayaclari(db, kullanici.islemler, kullanici.id) }),
  uc({ yontem: 'GET', yol: '/stok/panel', yetki: OKUMA, cevap: panelCevabi, isle: ({ db, kullanici }) => s.panel(db, kullanici.islemler) }),
  uc({ yontem: 'GET', yol: '/stok/panel/aylik-deger', yetki: OKUMA, sorgu: aylikStokDegeriSorgusu, cevap: aylikStokDegeriCevabi, isle: ({ db, kullanici, sorgu }) => s.aylikStokDegeri(db, kullanici.islemler, sorgu.ay) }),
  // Teslim paneli (stok.istek) parçanın statüsünü adıyla gösterir; statü adı stok miktarı taşımaz (Akış A provası D2).
  uc({ yontem: 'GET', yol: '/stok/statuler', yetki: { biri: [...OKUMA.biri, 'stok.istek'] }, cevap: statulerCevabi, isle: ({ db }) => s.statuler(db) }),
  uc({ yontem: 'GET', yol: '/stok/depolar', yetki: OKUMA, cevap: depolarCevabi, isle: ({ db }) => s.depoListesi(db) }),

  uc({ yontem: 'GET', yol: '/stok/konumlar', yetki: OKUMA, sorgu: konumlarSorgusu, cevap: konumlarCevabi, isle: ({ db, sorgu }) => s.konumListesi(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/konumlar/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: konumAyrintiCevabi, isle: ({ db, parametre }) => s.konumAyrintisi(db, parametre.id) }),
  uc({ yontem: 'POST', yol: '/stok/konumlar', yetki: 'stok.tanim', govde: konumAcGovdesi, cevap: konumCevabi, isle: ({ db, govde }) => s.konumAc(db, govde) }),
  uc({ yontem: 'GET', yol: '/stok/goz-stoklari', yetki: OKUMA, sorgu: gozStoklariSorgusu, cevap: gozStoklariCevabi, isle: ({ db, sorgu }) => s.gozStoklari(db, sorgu.gozIdler) }),
  uc({ yontem: 'GET', yol: '/stok/harita-ozeti', yetki: OKUMA, cevap: haritaOzetiCevabi, isle: ({ db }) => s.haritaOzeti(db) }),
  uc({ yontem: 'GET', yol: '/stok/zemin', yetki: OKUMA, cevap: zeminCevabi, isle: ({ db }) => s.zeminIzgarasi(db) }),
  uc({ yontem: 'POST', yol: '/stok/harita-bolumleri/:id/depo', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: bolumDeposuGovdesi, cevap: haritaOzetiCevabi, isle: ({ db, parametre, govde }) => s.bolumDeposu(db, parametre.id, govde.depo) }),
  // Stok Merkezi > Depo: stok deposu bölümünün rafı ve göz kalemi (DEP-61, kart #1304). Kayıt Fabrika Haritası'nındır.
  uc({ yontem: 'POST', yol: '/stok/depo-bolumleri/:id/raflari-kaydet', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: depoRaflariGovdesi, cevap: kayitCevabi, isle: ({ db, kullanici, parametre, govde }) => s.depoRaflariKaydet(db, parametre.id, govde, kullanici.id) }),
  uc({ yontem: 'POST', yol: '/stok/depo-goz-kalemleri/yaz', yetki: 'stok.tanim', govde: gozKalemiGovdesi, cevap: gozKalemiSemasi, isle: ({ db, kullanici, govde }) => s.depoGozKalemiYaz(db, govde, kullanici.id) }),
  uc({ yontem: 'POST', yol: '/stok/depo-goz-kalemleri/sil', yetki: 'stok.tanim', govde: gozKalemiSilGovdesi, cevap: z.undefined(), isle: async ({ db, govde }) => { await s.depoGozKalemiSil(db, govde.id); return undefined; } }),
  uc({ yontem: 'POST', yol: '/stok/konumlar/haritadan-esle', yetki: 'stok.tanim', cevap: haritaEslemeCevabi, isle: ({ db }) => s.haritadanEsle(db) }),
  uc({ yontem: 'POST', yol: '/stok/konumlar/:id/duzenle', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: konumDuzenleGovdesi, cevap: konumDuzenleCevabi, isle: ({ db, parametre, govde }) => s.konumDuzenle(db, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/konumlar/:id/pasif-yap', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: surumGovdesi, cevap: konumCevabi, isle: ({ db, parametre, govde }) => s.konumPasif(db, parametre.id, govde.surum) }),

  uc({ yontem: 'GET', yol: '/stok/raflar', yetki: OKUMA, sorgu: raflarSorgusu, cevap: raflarCevabi, isle: ({ db, sorgu }) => s.rafListesi(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/raflar/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: rafMatrisiCevabi, isle: ({ db, parametre }) => s.rafMatrisi(db, parametre.id) }),
  uc({ yontem: 'POST', yol: '/stok/raflar', yetki: 'stok.tanim', govde: rafAcGovdesi, cevap: rafCevabi, isle: ({ db, govde }) => s.rafAc(db, govde) }),
  uc({ yontem: 'POST', yol: '/stok/raflar/:id/duzenle', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: rafDuzenleGovdesi, cevap: rafDuzenleCevabi, isle: ({ db, parametre, govde }) => s.rafDuzenle(db, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/raflar/:id/pasif-yap', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: surumGovdesi, cevap: rafCevabi, isle: ({ db, parametre, govde }) => s.rafPasif(db, parametre.id, govde.surum) }),

  uc({ yontem: 'GET', yol: '/stok/malzemeler', yetki: OKUMA, sorgu: malzemelerSorgusu, cevap: malzemelerCevabi, isle: ({ db, sorgu }) => s.malzemeListesi(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/malzemeler/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: malzemeAyrintiCevabi, isle: ({ db, parametre }) => s.malzemeAyrintisi(db, parametre.id) }),
  uc({ yontem: 'GET', yol: '/stok/malzemeler/:id/ozet', yetki: OKUMA, parametre: kimlikParametresi, cevap: malzemeOzetiCevabi, isle: ({ db, parametre }) => s.malzemeOzetiOku(db, parametre.id) }),
  uc({ yontem: 'GET', yol: '/stok/malzemeler/:id/cikis-onerisi', yetki: OKUMA, parametre: kimlikParametresi, sorgu: cikisOnerisiSorgusu, cevap: cikisOnerisiCevabi, isle: ({ db, parametre, sorgu }) => s.cikisOnerisiOku(db, parametre.id, sorgu.miktar) }),
  uc({ yontem: 'GET', yol: '/stok/malzemeler/:id/son-partiler', yetki: SON_PARTI_OKUMA, parametre: kimlikParametresi, sorgu: sonPartilerSorgusu, cevap: sonPartilerCevabi,
    isle: async ({ db, parametre, sorgu }) => ({ partiler: await s.sonPartiler(db, parametre.id, sorgu.sinir) }) }),
  uc({ yontem: 'GET', yol: '/stok/malzemeler/:id/goz-onerisi', yetki: OKUMA, parametre: kimlikParametresi, cevap: gozOnerisiCevabi, isle: ({ db, parametre }) => s.gozOnerisi(db, parametre.id) }),
  // Malzeme kartı (Malzemeler ve Hizmetler) bu iki değeri gösterir; kartı açabilen herkes görür.
  uc({ yontem: 'GET', yol: '/stok/malzeme-kart-bilgileri', yetki: 'oturum', sorgu: sayfaSorgusu, cevap: malzemeKartBilgileriCevabi, isle: ({ db, sorgu }) => s.malzemeKartBilgileri(db, sorgu) }),
  uc({ yontem: 'POST', yol: '/stok/malzemeler/:id/ayar-duzenle', yetki: 'stok.tanim', parametre: kimlikParametresi, govde: malzemeAyarGovdesi, cevap: malzemeAyrintiCevabi, isle: ({ db, parametre, govde }) => s.malzemeAyariYaz(db, parametre.id, govde) }),

  uc({ yontem: 'GET', yol: '/stok/partiler', yetki: OKUMA, sorgu: partilerSorgusu, cevap: partilerCevabi, isle: ({ db, sorgu }) => s.partiListesi(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/partiler/:id/belgeler/:belgeId', yetki: OKUMA, parametre: partiBelgeParametresi, cevap: ikiliCevap, isle: ({ db, parametre }) => s.partiBelgeDosyasi(db, parametre.id, parametre.belgeId) }),
  uc({ yontem: 'GET', yol: '/stok/partiler/:id/etiket', yetki: OKUMA, parametre: kimlikParametresi, cevap: lotEtiketleriCevabi, isle: ({ db, parametre }) => s.partiLotEtiketi(db, parametre.id) }),
  uc({ yontem: 'GET', yol: '/stok/partiler/:id/iz', yetki: OKUMA, parametre: kimlikParametresi, cevap: partiIziCevabi, isle: ({ db, parametre }) => s.partiIzi(db, parametre.id) }),

  uc({ yontem: 'GET', yol: '/stok/fason-isleri', yetki: 'stok.giris', sorgu: fasonIsleriSorgusu, cevap: fasonIsleriCevabi, isle: ({ db, sorgu }) => s.fasonIsleri(db, sorgu.konumId) }),
  uc({ yontem: 'GET', yol: '/stok/acik-siparis-satirlari', yetki: 'stok.giris', cevap: acikSiparisSatirlariCevabi, isle: ({ db }) => s.acikSiparisSatirlari(db) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/mal-kabul', yetki: 'stok.giris', govde: malKabulGovdesi, cevap: malKabulCevabi, isle: ({ db, kullanici, govde, denetimEki }) => s.malKabulYap(db, kullanici, govde, denetimEki) }),
  // Kart #1124: satın alma siparişinin irsaliye satırı.
  uc({ yontem: 'GET', yol: '/stok/siparis-irsaliyeleri', yetki: SON_PARTI_OKUMA, sorgu: siparisIrsaliyeleriSorgusu, cevap: siparisIrsaliyeleriCevabi,
    isle: ({ db, sorgu }) => s.siparisIrsaliyeleri(db, sorgu.siparisSatirlari) }),
  uc({ yontem: 'GET', yol: '/stok/mal-kabuller', yetki: OKUMA, sorgu: malKabullerSorgusu, cevap: malKabullerCevabi, isle: ({ db, sorgu }) => s.malKabulListesi(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/mal-kabuller/:id/lot-etiketleri', yetki: OKUMA, parametre: kimlikParametresi, cevap: lotEtiketleriCevabi, isle: ({ db, parametre }) => s.malKabulLotEtiketleri(db, parametre.id) }),
  uc({ yontem: 'GET', yol: '/stok/mal-kabuller/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: malKabulAyrintiCevabi, isle: ({ db, parametre }) => s.malKabulAyrintisi(db, parametre.id) }),
  // Düzeltme hareketleri ters çevirir: geri alma işlemiyle korunur (DEP-53).
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/mal-kabuller/:id/duzelt', yetki: 'stok.geri-al', parametre: kimlikParametresi, govde: malKabulDuzeltGovdesi, cevap: malKabulCevabi, isle: ({ db, kullanici, parametre, govde, denetimEki }) => s.malKabulDuzelt(db, kullanici, parametre.id, govde, denetimEki) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/uretim-girisi', yetki: 'stok.giris', govde: uretimGirisiGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, govde }) => s.uretimGirisi(db, kullanici.id, govde) }),

  // Emir tamamlama: bitmiş emrin kalan sarfı ve çıktısı tek komutla (EK "Stok ve tamamlama"). Komut çıkış yetkisini ayrıca ister.
  uc({ yontem: 'GET', yol: '/stok/uretim-emirleri/:id/tamamlama', yetki: OKUMA, parametre: kimlikParametresi, cevap: emirTamamlamaCevabi, isle: ({ db, parametre }) => s.emirTamamlamaOku(db, parametre.id) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/uretim-emirleri/:id/tamamla', yetki: 'stok.giris', parametre: kimlikParametresi, govde: emirTamamlaGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, parametre, govde }) => s.emirTamamla(db, kullanici, parametre.id, govde) }),

  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/tasima', yetki: 'stok.transfer', govde: tasimaGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, govde }) => s.tasimaYap(db, kullanici.id, govde) }),
  // Statülü malzemenin emre ayrılması: statü değiştirme yetkisiyle (müdür; kullanıcı kararı 15.10, yeni yetki yok).
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/rezerve-et', yetki: 'stok.statu-degistir', govde: rezerveEtGovdesi, cevap: rezervelerCevabi, isle: ({ db, kullanici, govde }) => s.rezerveEt(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/rezerve-kaldir', yetki: 'stok.statu-degistir', govde: rezerveKaldirGovdesi, cevap: rezervelerCevabi, isle: ({ db, kullanici, govde }) => s.rezerveKaldir(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/statu-degistir', yetki: 'stok.statu-degistir', govde: statuDegistirGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, govde }) => s.statuDegistir(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/cikis', yetki: 'stok.cikis', govde: cikisGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, govde }) => s.cikisYap(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/sayim', yetki: 'stok.sayim', govde: sayimGovdesi, cevap: sayimCevabi, isle: ({ db, kullanici, govde }) => s.sayimYap(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/hareketler/geri-al', yetki: 'stok.geri-al', govde: topluGeriAlGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, govde }) => s.topluGeriAl(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, yol: '/stok/hareketler/:id/geri-al', yetki: 'stok.geri-al', parametre: kimlikParametresi, govde: geriAlGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, parametre, govde }) => s.geriAl(db, kullanici.id, parametre.id, govde) }),
  uc({ yontem: 'GET', yol: '/stok/hareketler', yetki: OKUMA, sorgu: hareketlerSorgusu, cevap: hareketlerCevabi, isle: ({ db, sorgu }) => s.hareketListesi(db, sorgu) }),

  // Okut ve sepet. Sepet kişinindir; teslim tek işlemde fiş yazar (DEP-40). Konuma teslim taşımadır, stoktan düşme çıkıştır.
  uc({ yontem: 'GET', yol: '/stok/kod-coz', yetki: OKUMA, sorgu: kodCozSorgusu, cevap: kodCozCevabi, isle: ({ db, sorgu }) => s.kodCoz(db, sorgu.kod) }),
  uc({ yontem: 'GET', yol: '/stok/sepet', yetki: 'stok.transfer', cevap: sepetCevabi, isle: ({ db, kullanici }) => s.sepet(db, kullanici.id) }),
  uc({ yontem: 'POST', tekrarKorumali: true, yol: '/stok/sepet/satir-ekle', yetki: 'stok.transfer', govde: sepetEkleGovdesi, cevap: sepetCevabi, isle: ({ db, kullanici, govde }) => s.sepeteEkle(db, kullanici.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/sepet/satirlar/:id/degistir', yetki: 'stok.transfer', parametre: kimlikParametresi, govde: sepetDegistirGovdesi, cevap: sepetCevabi, isle: ({ db, kullanici, parametre, govde }) => s.sepetSatiriDegistir(db, kullanici.id, parametre.id, govde.miktar) }),
  uc({ yontem: 'POST', yol: '/stok/sepet/satirlar/:id/sil', yetki: 'stok.transfer', parametre: kimlikParametresi, cevap: sepetCevabi, isle: ({ db, kullanici, parametre }) => s.sepetSatiriSil(db, kullanici.id, parametre.id) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/sepet/teslim-et', yetki: 'stok.transfer', govde: teslimGovdesi, cevap: sepetTeslimCevabi, isle: ({ db, kullanici, govde }) => s.teslimEt(db, kullanici.id, govde) }),
  // Refakat partisi (kart #123): depo lotu okutup emre ayırır, kartı basar; hiç teslimi olmayan kart iptal edilir.
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/refakat-partileri/ac', yetki: 'stok.transfer', govde: refakatPartisiAcGovdesi, cevap: refakatPartisiCevabi, isle: ({ db, kullanici, govde }) => s.refakatPartisiAc(db, kullanici.id, govde) }),
  uc({ yontem: 'GET', yol: '/stok/refakat-partileri/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: refakatPartisiCevabi, isle: ({ db, parametre }) => s.refakatPartisiOku(db, parametre.id) }),
  uc({ yontem: 'GET', yol: '/stok/refakat-partileri/:id/kart', yetki: OKUMA, parametre: kimlikParametresi, cevap: refakatPartisiKartiCevabi, isle: ({ db, parametre }) => s.refakatPartisiKarti(db, parametre.id) }),
  uc({ yontem: 'GET', yol: '/stok/refakat-partileri/:id/iz', yetki: OKUMA, parametre: kimlikParametresi, cevap: refakatIziCevabi, isle: ({ db, parametre }) => s.refakatIzi(db, parametre.id) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/refakat-partileri/:id/kol-ac', yetki: 'stok.transfer', parametre: kimlikParametresi, govde: refakatKolAcGovdesi, cevap: refakatPartisiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.refakatKolKartiAc(db, kullanici.id, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/refakat-partileri/:id/iptal-et', yetki: 'stok.transfer', parametre: kimlikParametresi, govde: surumGovdesi, cevap: refakatPartisiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.refakatPartisiIptal(db, kullanici.id, parametre.id, govde) }),
  uc({ yontem: 'GET', yol: '/stok/uretim-emirleri/:id/refakat-partileri', yetki: OKUMA, parametre: kimlikParametresi, cevap: refakatPartileriCevabi, isle: ({ db, parametre }) => s.emrinRefakatPartileri(db, parametre.id) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/sepet/stoktan-dus', yetki: 'stok.cikis', govde: stoktanDusGovdesi, cevap: fisCevabi, isle: ({ db, kullanici, govde }) => s.stoktanDus(db, kullanici.id, govde) }),
  uc({ yontem: 'GET', yol: '/stok/fisler', yetki: OKUMA, sorgu: fislerSorgusu, cevap: fislerCevabi, isle: ({ db, sorgu }) => s.fisListesi(db, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/fisler/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: fisAyrintiCevabi, isle: ({ db, parametre }) => s.fisAyrintisi(db, parametre.id) }),

  // Toplama: liste açılınca en eski girişten gözlere ayrılır ve rotaya dizilir; her adım toplanınca çıkış yazılır.
  uc({ yontem: 'GET', yol: '/stok/toplamalar', yetki: OKUMA, sorgu: toplamalarSorgusu, cevap: toplamalarCevabi, isle: ({ db, kullanici, sorgu }) => s.toplamaListesi(db, kullanici.id, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/toplamalar/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: toplamaAyrintiCevabi, isle: ({ db, kullanici, parametre }) => s.toplamaAyrintisiGor(db, kullanici.id, parametre.id) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/toplamalar', yetki: 'stok.toplama', govde: toplamaAcGovdesi, cevap: toplamaAyrintiCevabi, isle: ({ db, kullanici, govde }) => s.toplamaAc(db, kullanici, govde) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/toplamalar/:id/adimlar/:adimId/topla', yetki: 'stok.toplama', parametre: toplamaAdimParametresi, govde: adimToplaGovdesi, cevap: toplamaAyrintiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.adimTopla(db, kullanici.id, parametre.id, parametre.adimId, govde) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/toplamalar/:id/kapat', yetki: 'stok.toplama', parametre: kimlikParametresi, govde: toplamaKapatGovdesi, cevap: toplamaAyrintiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.toplamaKapat(db, kullanici.id, parametre.id, govde) }),
  // Malzeme isteği: üretim (Arkon) stok/disari ile açar; depo hazırlar, teslim eder ya da iptal eder.
  uc({ yontem: 'GET', yol: '/stok/malzeme-istekleri', yetki: OKUMA, sorgu: malzemeIstekleriSorgusu, cevap: malzemeIstekleriCevabi, isle: ({ db, kullanici, sorgu }) => s.malzemeIstekleriListesi(db, kullanici.id, sorgu) }),
  uc({ yontem: 'GET', yol: '/stok/malzeme-istekleri/:id', yetki: OKUMA, parametre: kimlikParametresi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, parametre }) => s.malzemeIstegiGor(db, kullanici.id, parametre.id) }),
  uc({ yontem: 'POST', yol: '/stok/malzeme-istekleri/:id/hazirla', yetki: 'stok.transfer', parametre: kimlikParametresi, govde: surumGovdesi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.malzemeIstegiGecir(db, kullanici.id, parametre.id, 'hazirla', govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, yol: '/stok/malzeme-istekleri/:id/teslim-et', yetki: 'stok.transfer', parametre: kimlikParametresi, govde: istekTeslimGovdesi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.istekTeslimEt(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/malzeme-istekleri/:id/iptal-et', yetki: 'stok.transfer', parametre: kimlikParametresi, govde: surumGovdesi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.malzemeIstegiGecir(db, kullanici.id, parametre.id, 'iptal', govde) }),
  // Malzeme · Teslim (kart #1208): bütün sayfaların üst çubuğundan; okuma yalnız kişinin kendi kutusu ve istek seçicisidir.
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu', yetki: 'stok.istek', cevap: teslimKutusuCevabi, isle: ({ db, kullanici }) => s.teslimKutusu(db, kullanici) }),
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/sayac', yetki: 'stok.istek', cevap: z.object({ gelen: z.number().int() }), isle: async ({ db, kullanici }) => ({ gelen: await s.gelenTeslimSayisi(db, kullanici) }) }),
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/yerdeki-stok', yetki: 'stok.istek', sorgu: yerdekiStokSorgusu, cevap: yerdekiStokCevabi, isle: ({ db, kullanici, sorgu }) => s.yerdekiStok(db, kullanici, sorgu.istasyonId !== undefined ? { istasyonId: sorgu.istasyonId } : { konumId: sorgu.konumId! }) }),
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/kod-coz', yetki: 'stok.istek', sorgu: kodCozSorgusu, cevap: okutCozCevabi, isle: ({ db, kullanici, sorgu }) => s.okutCoz(db, kullanici, sorgu.kod) }),
  // Kişiye teslim (299 b): Teslim al'da gösterilen, imzalı ve kısa süreli kişi kodu; teslim eden okutur.
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/kisi-kodu', yetki: 'stok.istek', cevap: kisiKoduCevabi, isle: ({ kullanici }) => s.kisiKodu(kullanici) }),
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/sepet', yetki: 'stok.istek', sorgu: istasyonSepetiSorgusu, cevap: istasyonSepetiCevabi, isle: ({ db, kullanici, sorgu }) => s.istasyonSepeti(db, kullanici, sorgu.istasyonId) }),
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/is-malzemeleri', yetki: 'stok.istek', sorgu: istasyonSepetiSorgusu, cevap: isMalzemeleriCevabi, isle: ({ db, kullanici, sorgu }) => s.isMalzemeleri(db, kullanici, sorgu.istasyonId) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, tekrarKorumali: true, yol: '/stok/teslim-kutusu/is-malzemeleri/iste', yetki: 'stok.istek', govde: isMalzemesiIsteGovdesi, cevap: isMalzemeleriCevabi, isle: ({ db, kullanici, govde }) => s.isMalzemesiIste(db, kullanici, govde) }),
  // Teslim edilmeyen parçayı kullanacak istasyon görür ve "Teslim al" ile çeker (kart #1289); teslim almayla aynı işlem.
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/sepet/gelecek', yetki: 'stok.istek', sorgu: istasyonSepetiSorgusu, cevap: gelecekSepetCevabi, isle: ({ db, kullanici, sorgu }) => s.gelecekSepet(db, kullanici, sorgu.istasyonId) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/teslim-kutusu/sepet/cek', yetki: 'stok.istek', govde: sepettenCekGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, govde }) => s.sepettenCek(db, kullanici, govde) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/teslim-kutusu/sepet/kullan', yetki: 'stok.istek', govde: sepettenKullanGovdesi, cevap: hareketCevabi, isle: ({ db, kullanici, govde }) => s.sepettenKullan(db, kullanici, govde) }),
  // Terminal başlatmadan önce (kart #1289): eksik girdiye istasyon isteği açar; yetki üretim terminalininkidir. Tekrar korumasız: istek
  // adım ve malzemeyle tekildir, yinelenen çağrı ikinci istek açmaz.
  uc({ yontem: 'POST', kilitlenmedeYinele: true, yol: '/stok/uretim-hazirligi', yetki: 'terminal.uret', govde: uretimHazirligiGovdesi, cevap: uretimHazirligiCevabi, isle: ({ db, kullanici, govde }) => s.uretimHazirligi(db, kullanici, govde) }),
  uc({ yontem: 'GET', yol: '/stok/istek-malzemeleri', yetki: 'stok.istek', sorgu: istekMalzemeSorgusu, cevap: istekMalzemeleriCevabi, isle: ({ db, sorgu }) => s.istekMalzemeleri(db, sorgu.ara) }),
  uc({ yontem: 'POST', tekrarKorumali: true, yol: '/stok/malzeme-istekleri/ac', yetki: 'stok.istek', govde: istekAcGovdesi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, govde }) => s.genelIstekAc(db, kullanici, govde) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/teslimler/gonder', yetki: 'stok.istek', govde: teslimGonderGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, govde }) => s.teslimGonder(db, kullanici, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, yol: '/stok/teslimler/:id/teslim-al', yetki: 'stok.istek', parametre: kimlikParametresi, govde: teslimAlGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, parametre, govde }) => s.teslimAl(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/teslimler/:id/reddet', yetki: 'stok.istek', parametre: kimlikParametresi, govde: teslimReddetGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, parametre, govde }) => s.teslimReddet(db, kullanici, parametre.id, govde) }),
  // Soru 96: istasyondan istek (A) ve okutarak alma (B). Kapsam ve iki imza kuralları servis içindedir.
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/malzeme-yerleri', yetki: 'stok.istek', sorgu: malzemeYerleriSorgusu, cevap: malzemeYerleriCevabi, isle: ({ db, sorgu }) => s.malzemeYerleri(db, sorgu.malzemeId) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, yol: '/stok/malzeme-istekleri/:id/kabul-et', yetki: 'stok.istek', parametre: kimlikParametresi, govde: istekKabulGovdesi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.istekKabulEt(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/malzeme-istekleri/:id/reddet', yetki: 'stok.istek', parametre: kimlikParametresi, govde: istekReddetGovdesi, cevap: malzemeIstegiCevabi, isle: ({ db, kullanici, parametre, govde }) => s.istekReddet(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'GET', yol: '/stok/teslim-kutusu/okutarak-al', yetki: 'stok.istek', sorgu: okutarakAlSorgusu, cevap: okutarakAlCevabi, isle: ({ db, sorgu }) => s.okutarakAlOnizle(db, sorgu.kod, sorgu.yerKodu) }),
  uc({ yontem: 'POST', tekrarKorumali: true, kilitlenmedeYinele: true, yol: '/stok/teslim-kutusu/okutarak-al', yetki: 'stok.istek', govde: okutarakAlGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, govde }) => s.okutarakAl(db, kullanici, govde) }),
  uc({ yontem: 'POST', kilitlenmedeYinele: true, yol: '/stok/teslimler/:id/itiraz', yetki: 'stok.istek', parametre: kimlikParametresi, govde: itirazGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, parametre, govde }) => s.teslimItiraz(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/stok/teslimler/:id/iptal-et', yetki: 'stok.istek', parametre: kimlikParametresi, govde: surumGovdesi, cevap: teslimCevabi, isle: ({ db, kullanici, parametre, govde }) => s.teslimIptal(db, kullanici, parametre.id, govde) }),

  // Depo yerleşimi: düzenleyici tek komutla kaydeder (raf tanımı işlemi). Kare adı dama tahtası içindir.
  uc({ yontem: 'GET', yol: '/stok/yerlesim', yetki: OKUMA, cevap: yerlesimCevabi, isle: ({ db }) => s.yerlesimOku(db) }),
  uc({ yontem: 'POST', yol: '/stok/yerlesim/kaydet', yetki: 'stok.tanim', govde: yerlesimKaydetGovdesi, cevap: yerlesimCevabi, isle: ({ db, govde }) => s.yerlesimKaydet(db, govde) }),
  uc({ yontem: 'GET', yol: '/stok/ara', yetki: OKUMA, sorgu: araSorgusu, cevap: araCevabi, isle: ({ db, sorgu }) => s.ara(db, sorgu.q) }),
  uc({ yontem: 'GET', yol: '/stok/sayim-bekleyenler', yetki: OKUMA, cevap: sayimBekleyenlerCevabi, isle: ({ db }) => s.sayimBekleyenler(db) }),
];
