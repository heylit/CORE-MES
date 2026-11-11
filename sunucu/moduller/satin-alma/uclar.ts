import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  acilisCevabi, disOperasyonlarCevabi, disOperasyonAyrintisiCevabi, disOperasyonParametresi, fasonSureleriCevabi, fasonSureleriSorgusu, ayarlarKaydetGovdesi, hizliAcGovdesi, talebimiDuzenleGovdesi, talebimGuncellemeGovdesi, talebimSemasi, taleplerimCevabi, taleplerimSorgusu, ayarlarSemasi, firmaParametresi, firmaSecenekleriCevabi, firmaSecenekleriSorgusu, katalogKaydetGovdesi, malzemeSecenekleriCevabi, malzemeSecenekleriSorgusu, katalogSemasi, katalogSilGovdesi, talepGovdesi, acikEmirlerCevabi, projeSecenekleriCevabi, onTalepleriCevabi, onTalepYoksayGovdesi, onTalepGeriAlGovdesi,
  iptaliGeriAlCevabi, iptaliGeriAlGovdesi, talepAyirGovdesi, talepBirlestirGovdesi, satinAlmaOzetiCevabi, degerlendirmeCevabi, kartAyrintilariCevabi, stokYokIstekleriCevabi, odemePlaniGovdesi, siparisTakibiCevabi, siparisBelgeleriCevabi, siparisBelgesiGovdesi, siparisBelgesiParametresi, siparisSatiriParametresi, siparisFaturalariCevabi, siparisFaturalariSorgusu, siparisFaturasiGovdesi, siparisKalemiDegistirGovdesi, siparisKapatGovdesi, siparisLogoBekletGovdesi, teslimYontemiGovdesi, talepKaydetGovdesi, talepParametresi, talepSemasi, talepSilGovdesi, tamamCevabi, tedarikciKaydetGovdesi, tedarikciSemasi,
  tedarikTerminiKaydetGovdesi, tedarikTerminiKaydetCevabi, tedarikTerminleriCevabi,
  butceKullanimiCevabi, butceKullanimiSorgusu, kgFiyatiEkleGovdesi, kgFiyatiIptalGovdesi, kgFiyatiParametresi, kgFiyatiGecmisiCevabi, kgFiyatiGecmisiSorgusu, kgFiyatlariCevabi, malzemeKgFiyatlariCevabi, malzemeKgFiyatlariSorgusu,
  faturaEslemesiCevabi, faturaEslemesiKaydetGovdesi, faturaEslemesiParametresi,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { satinAlmaAnaliziCevabi } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { z } from 'zod';
import { satinAlmaAnalizi } from './analiz.ts';
import * as servis from './servis.ts';

const katalogParametresi = z.object({ id: z.guid() });

// 215 a: maliyet okuyan (müdür, muhasebe/finans) kg fiyatını görür, değiştiremez.
const KG_FIYATI_OKUR = ['satin-alma.oku', 'satin-alma.yaz', 'finans.maliyet-oku'] as const;
// 534 1 a: tedarik terminini satın almayı yazan ve planı yazan girer (Planlama ekranındaki giriş de bu uca gelir); yeni işlem yok.
const TERMIN_YAZAR = ['satin-alma.yaz', 'plan.yaz'] as const;
// K8 a (2077-3 a): muhasebe fatura-sipariş bağını yalnız bu dar işlemle kurar, satın alma kaydı yazmaz.
const FATURA_BAGLAR = ['satin-alma.yaz', 'satin-alma.fatura-bagla'] as const;

// Tekrar korumalı (#188): talep açma, katalog kaydı ve teslim alma. Cevabı yitirilen komut aynı kimlikle yeniden gönderilince
// ilk cevap döner; kimliksiz gönderim 400 alır.
export const uclar = [
  // İkinci menü sayaçları (şartname): oturum yeter, sayıyı kullanıcının yetkisine göre sunucu süzer.
  // Ana sayfa pano kartları (kart #489): oturum yeter, sayıyı kullanıcının işlemlerine göre sunucu süzer.
  uc({ yontem: 'GET', yol: '/satin-alma/ozet', yetki: 'oturum', cevap: satinAlmaOzetiCevabi, isle: ({ db, kullanici }) => servis.panoOzeti(db, kullanici) }),
  // Dış operasyonlar sayfası (kart #542, D1 a): satın almayı okuyan ya da yazan görür.
  uc({
    yontem: 'GET', yol: '/satin-alma-dis-operasyonlar', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] }, cevap: disOperasyonlarCevabi,
    isle: ({ db }) => servis.disOperasyonlar(db),
  }),
  // 2428: dış işlem emri ayrıntısı ve satın alma bağı; liste ile aynı yetki.
  uc({
    yontem: 'GET', yol: '/satin-alma-dis-operasyonlar/:dieId', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] },
    parametre: disOperasyonParametresi, cevap: disOperasyonAyrintisiCevabi,
    isle: ({ db, parametre }) => servis.disOperasyonAyrintisi(db, parametre.dieId),
  }),
  // 2151 (2151-1 b): Analiz sayfası; yalnız okur, dış operasyonlarla aynı yetki.
  uc({
    yontem: 'GET', yol: '/satin-alma-analiz', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] }, cevap: satinAlmaAnaliziCevabi,
    isle: ({ db }) => satinAlmaAnalizi(db),
  }),
  // Fason süre ve termin grafikleri: dış operasyonlar sayfasıyla aynı yetki.
  uc({
    yontem: 'GET', yol: '/satin-alma-fason-sureleri', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] }, sorgu: fasonSureleriSorgusu, cevap: fasonSureleriCevabi,
    isle: ({ db, sorgu }) => servis.fasonSureleri(db, sorgu.sonGun),
  }),
  // İş kutusu kartı (kart #435): stokta karşılanamayan istekler, salt okunur; yalnız satın alma yazıcısı görür.
  uc({ yontem: 'GET', yol: '/satin-alma-stok-yok-istekleri', yetki: 'satin-alma.yaz', cevap: stokYokIstekleriCevabi, isle: ({ db }) => servis.stokYokIstekleri(db) }),
  uc({ yontem: 'GET', yol: '/satin-alma-menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi, isle: ({ db, kullanici }) => servis.menuSayaclari(db, kullanici) }),
  // Açılış: satın almanın ekranı, role göre süzülmüş bütün (SAT-53, SAT-65). Yalnız talep açabilen buraya giremez (#375):
  // bütçe, onay limiti, kur ve teklifler talep edene gitmez; o kendi taleplerini ana sayfadaki uçtan görür.
  uc({
    yontem: 'GET', yol: '/satin-alma-acilis', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla', 'satin-alma.ayar'] }, cevap: acilisCevabi,
    isle: ({ db, kullanici }) => servis.acilis(db, kullanici),
  }),
  // Ana sayfa (#375): kişinin kendi talepleri, fiyatsız ve tedarikçisiz.
  uc({
    yontem: 'GET', yol: '/satin-alma-taleplerim', yetki: 'satin-alma.talep-ac', sorgu: taleplerimSorgusu, cevap: taleplerimCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.taleplerim(db, kullanici, sorgu.sinir),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/hizli-ac', yetki: 'satin-alma.talep-ac', govde: hizliAcGovdesi, cevap: talebimSemasi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, govde, denetimEki }) => servis.hizliAc(db, kullanici, govde, denetimEki),
  }),
  // 898 a, 903 a: ön talepler talep açabilen herkese açıktır (yeni işlem yok); yoksayma ve geri alma ayrı komuttur.
  uc({ yontem: 'GET', yol: '/satin-alma-on-talepleri', yetki: 'satin-alma.talep-ac', cevap: onTalepleriCevabi, isle: ({ db }) => servis.onTalepleri(db) }),
  uc({
    yontem: 'POST', yol: '/satin-alma-on-talepleri/yoksay', yetki: 'satin-alma.talep-ac', govde: onTalepYoksayGovdesi, cevap: tamamCevabi,
    isle: ({ db, kullanici, govde }) => servis.onTalepYoksay(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-on-talepleri/geri-al', yetki: 'satin-alma.talep-ac', govde: onTalepGeriAlGovdesi, cevap: tamamCevabi,
    isle: ({ db, govde }) => servis.onTalepGeriAl(db, govde.id),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/ac', yetki: 'satin-alma.talep-ac', govde: talepGovdesi, cevap: talepSemasi,
    tekrarKorumali: true,
    denetim: 'govdesiz',
    isle: ({ db, kullanici, govde, denetimEki }) => servis.talepAc(db, kullanici, govde, denetimEki),
  }),
  // Kaydet en zayıf işlemi ister; gereken işlemi değişikliğin türü belirler (V-33).
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/kaydet', yetki: 'satin-alma.talep-ac', parametre: talepParametresi, govde: talepKaydetGovdesi,
    cevap: talepSemasi, denetim: 'govdesiz',
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.talepKaydet(db, kullanici, parametre.id, govde, denetimEki),
  }),
  // 2871-1 a: talep eden kendi taslağını Taleplerim'den düzenler; sahiplik ve durum servisde (SAT-79). Kaydet ucunun izin verdiğinin alt kümesidir.
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/talebimi-duzenle', yetki: 'satin-alma.talep-ac', parametre: talepParametresi,
    govde: talebimiDuzenleGovdesi, cevap: talebimSemasi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.talebimiDuzenle(db, kullanici, parametre.id, govde, denetimEki),
  }),
  // 2876 (2871-1 b): teklif toplanırken sahibi güncelleme talebi açar; var olan talep-ac işlemi, yeni işlem yok.
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/guncelleme-ac', yetki: 'satin-alma.talep-ac', parametre: talepParametresi,
    govde: talebimGuncellemeGovdesi, cevap: talebimSemasi, tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.guncellemeAc(db, kullanici, parametre.id, govde, denetimEki),
  }),
  // 2413 a: elle durum değiştirme yalnız "İptali geri al"dır; iptal etmekle aynı işlem.
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/iptali-geri-al', yetki: 'satin-alma.yaz', parametre: talepParametresi, govde: iptaliGeriAlGovdesi,
    cevap: iptaliGeriAlCevabi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.iptaliGeriAl(db, kullanici, parametre.id, govde, denetimEki),
  }),
  // 2414 a: talepleri birleştirme ve ayırma; teklif ve karar yokken (V2 a), satın almanın işi.
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/birlestir', yetki: 'satin-alma.yaz', govde: talepBirlestirGovdesi, cevap: talepSemasi,
    isle: ({ db, kullanici, govde }) => servis.talepleriBirlestir(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/ayir', yetki: 'satin-alma.yaz', parametre: talepParametresi, govde: talepAyirGovdesi, cevap: talepSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.talepAyir(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/sil', yetki: 'satin-alma.talep-ac', parametre: talepParametresi, govde: talepSilGovdesi,
    cevap: tamamCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.talepSil(db, kullanici, parametre.id, govde.surum),
  }),
  // Borç 36: siparişteki kalem onay yetkisiyle, gerekçeyle değişir; sürüm tekrarı önler (aynı sürümle ikinci gönderim 409 alır).
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/siparis-kalemi-degistir', yetki: 'satin-alma.onayla', parametre: talepParametresi,
    govde: siparisKalemiDegistirGovdesi, cevap: talepSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.siparisKalemiDegistir(db, kullanici, parametre.id, govde),
  }),
  // Kart #1310: malzemeyi tedarikçi mi getirir, biz mi alırız; "biz alacağız" siparişi sevkiyatta alım olarak bekler.
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/teslim-yontemi', yetki: 'satin-alma.yaz', parametre: talepParametresi,
    govde: teslimYontemiGovdesi, cevap: talepSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.teslimYontemiDegistir(db, kullanici, parametre.id, govde),
  }),
  // "Kalanı kapat" (#205 S2 b): Logo'daki siparişin kalanı satın almayı yazanca, gerekçeyle kapatılır.
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/siparis-kapat', yetki: 'satin-alma.yaz', parametre: talepParametresi,
    govde: siparisKapatGovdesi, cevap: talepSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.siparisKapat(db, kullanici, parametre.id, govde),
  }),
  // 2966-1 b: "Logo'da beklet / serbest bırak" kalanı kapatmayla aynı yetkidedir (Güvenlik 2971 madde 4: genişleme yok).
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/siparis-logo-beklet', yetki: 'satin-alma.yaz', parametre: talepParametresi,
    govde: siparisLogoBekletGovdesi, cevap: talepSemasi,
    isle: ({ db, kullanici, parametre, govde }) => servis.siparisLogoBeklet(db, kullanici, parametre.id, govde),
  }),
  // 1094 b: teklif karşılaştırması ve kararın tutarı sunucuda hesaplanır; teklifleri gören görür.
  // 2454: bütçe kullanımı yalnız tam görenlere (V4; talep eden görmez).
  uc({
    yontem: 'GET', yol: '/satin-alma-butce-kullanimi', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla'] }, sorgu: butceKullanimiSorgusu,
    cevap: butceKullanimiCevabi, isle: ({ db, sorgu }) => servis.butceKullanimiOku(db, sorgu.yil),
  }),
  uc({
    yontem: 'GET', yol: '/satin-alma-talepleri/:id/degerlendirme', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla'] },
    parametre: talepParametresi, cevap: degerlendirmeCevabi,
    isle: ({ db, parametre }) => servis.degerlendirme(db, parametre.id),
  }),
  // 1104 a, 1105 a: kalemlerin kart ayrıntısı ve tedarikçiye giden alanlar; teklifleri gören görür (tercih edilen tedarikçi içerir).
  uc({
    yontem: 'GET', yol: '/satin-alma-talepleri/:id/kart-ayrintilari', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla'] },
    parametre: talepParametresi, cevap: kartAyrintilariCevabi,
    isle: ({ db, parametre }) => servis.kartAyrintilari(db, parametre.id),
  }),
  // Kart #1124: siparişin ödeme planı, bağlı faturası ve irsaliye için satır kimlikleri; okuyan görür, planı satın almayı yazan değiştirir.
  uc({
    yontem: 'GET', yol: '/satin-alma-talepleri/:id/siparis-takibi', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] },
    parametre: talepParametresi, cevap: siparisTakibiCevabi,
    isle: ({ db, parametre }) => servis.siparisTakibi(db, parametre.id),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/odeme-plani', yetki: 'satin-alma.yaz', parametre: talepParametresi,
    govde: odemePlaniGovdesi, cevap: siparisTakibiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.odemePlaniYaz(db, kullanici, parametre.id, govde),
  }),
  // Sipariş satırının sertifika ve raporu: okuyan görür ve dosyayı açar; yükleme ve kaldırma satın almayı yazanındır.
  uc({
    yontem: 'GET', yol: '/satin-alma-siparis-satirlari/:id/belgeler', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] },
    parametre: siparisSatiriParametresi, cevap: siparisBelgeleriCevabi,
    isle: ({ db, parametre }) => servis.siparisBelgeleri(db, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/satin-alma-siparis-satirlari/:id/belgeler/:belgeId/dosya', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] },
    parametre: siparisBelgesiParametresi, cevap: ikiliCevap,
    isle: ({ db, parametre }) => servis.siparisBelgesiDosyasi(db, parametre.id, parametre.belgeId),
  }),
  // Yinelenen yükleme ikinci belge açmasın diye istek kimliği zorunludur.
  uc({
    yontem: 'POST', yol: '/satin-alma-siparis-satirlari/:id/belge-ekle', yetki: 'satin-alma.yaz', tekrarKorumali: true,
    parametre: siparisSatiriParametresi, govde: siparisBelgesiGovdesi, cevap: siparisBelgeleriCevabi,
    isle: ({ db, kullanici, parametre, govde, denetimEki }) => servis.siparisBelgesiEkle(db, kullanici, parametre.id, govde, denetimEki),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-siparis-satirlari/:id/belgeler/:belgeId/kaldir', yetki: 'satin-alma.yaz',
    parametre: siparisBelgesiParametresi, cevap: siparisBelgeleriCevabi,
    isle: ({ db, parametre }) => servis.siparisBelgesiKaldir(db, parametre.id, parametre.belgeId),
  }),
  // D6 b: sipariş ve finanstaki alış faturası bağı. Seçici tutarsız liste okur; bağı satın almayı yazan ya da yalnız fatura bağlayan işlem kurar.
  // Ağ kopunca aynı kimlikle yinelenen bağ ilk cevabı alır; geçmişe ikinci satır yazılmaz.
  uc({
    yontem: 'GET', yol: '/satin-alma-siparis-faturalari', yetki: { biri: FATURA_BAGLAR }, sorgu: siparisFaturalariSorgusu, cevap: siparisFaturalariCevabi,
    isle: ({ db, sorgu }) => servis.siparisFaturalari(db, sorgu.talepId, sorgu.teklifId),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/siparis-faturasi', yetki: { biri: FATURA_BAGLAR }, parametre: talepParametresi,
    govde: siparisFaturasiGovdesi, cevap: siparisFaturalariCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde }) => servis.siparisFaturasiYaz(db, kullanici, parametre.id, govde),
  }),
  // Tedarikçi eklerken finanstaki firma seçilir (S1); tedarikçiyi yazan işlem arar.
  uc({
    yontem: 'GET', yol: '/satin-alma-firma-secenekleri', yetki: 'satin-alma.yaz', sorgu: firmaSecenekleriSorgusu, cevap: firmaSecenekleriCevabi,
    isle: async ({ db, sorgu }) => ({ firmalar: await servis.firmaSecenekleri(db, sorgu.ara) }),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-tedarikcileri/kaydet', yetki: 'satin-alma.yaz', govde: tedarikciKaydetGovdesi, cevap: tedarikciSemasi,
    isle: ({ db, kullanici, govde }) => servis.tedarikciKaydet(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-tedarikcileri/:id/sil', yetki: 'satin-alma.yaz', parametre: firmaParametresi, cevap: tamamCevabi,
    isle: ({ db, parametre }) => servis.tedarikciSil(db, parametre.id),
  }),
  // SA2 b: kataloğa bağlanacak malzeme kartı aranır; talep eden de bağlar.
  uc({
    yontem: 'GET', yol: '/satin-alma-malzeme-secenekleri', yetki: 'satin-alma.talep-ac', sorgu: malzemeSecenekleriSorgusu, cevap: malzemeSecenekleriCevabi,
    isle: async ({ db, sorgu }) => ({ malzemeler: await servis.malzemeSecenekleri(db, sorgu.ara, sorgu.tur) }),
  }),
  // Talep formunun isteğe bağlı üretim emri seçimi: açık emirler; talep eden de görür.
  uc({
    yontem: 'GET', yol: '/satin-alma-acik-emirler', yetki: 'satin-alma.talep-ac', cevap: acikEmirlerCevabi,
    isle: ({ db }) => servis.acikEmirSecenekleri(db),
  }),
  // 2611 a: talep formunun isteğe bağlı proje seçimi (yalnız aktif projeler); talep açan projeler.oku taşımayabilir.
  uc({
    yontem: 'GET', yol: '/satin-alma-talepleri/proje-secenekleri', yetki: { biri: ['satin-alma.talep-ac', 'satin-alma.yaz'] }, cevap: projeSecenekleriCevabi,
    isle: ({ db }) => servis.talepProjeSecenekleri(db),
  }),
  // Katalog: talep eden de malzeme kartını kataloğa bağlar (SAT-58, SA2 b); düzenlemeyi servis yaz işlemine bağlar.
  uc({
    yontem: 'POST', yol: '/satin-alma-katalogu/kaydet', yetki: 'satin-alma.talep-ac', govde: katalogKaydetGovdesi, cevap: katalogSemasi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, govde }) => servis.katalogKaydet(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-katalogu/:id/sil', yetki: 'satin-alma.yaz', parametre: katalogParametresi, govde: katalogSilGovdesi,
    cevap: tamamCevabi, isle: ({ db, parametre, govde }) => servis.katalogSil(db, parametre.id, govde.surum),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-ayarlari/kaydet', yetki: 'satin-alma.ayar', govde: ayarlarKaydetGovdesi, cevap: ayarlarSemasi,
    isle: ({ db, kullanici, govde }) => servis.ayarlarKaydet(db, kullanici, govde),
  }),
  // SAT-77: malzeme kg fiyatları; satın almayı okuyan ve maliyet okuyan (215 a) görür, satın almayı yazan girer (geçmiş silinmez).
  uc({
    yontem: 'GET', yol: '/satin-alma-kg-fiyatlari', yetki: { biri: KG_FIYATI_OKUR }, cevap: kgFiyatlariCevabi,
    isle: ({ db, kullanici }) => servis.kgFiyatlari(db, kullanici.islemler),
  }),
  uc({
    yontem: 'GET', yol: '/satin-alma-kg-fiyatlari/gecmis', yetki: { biri: KG_FIYATI_OKUR }, sorgu: kgFiyatiGecmisiSorgusu,
    cevap: kgFiyatiGecmisiCevabi, isle: ({ db, sorgu }) => servis.kgFiyatiGecmisi(db, sorgu.kalite, sorgu.form ?? null),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-kg-fiyatlari/ekle', yetki: 'satin-alma.yaz', govde: kgFiyatiEkleGovdesi, cevap: kgFiyatlariCevabi,
    tekrarKorumali: true,
    isle: ({ db, kullanici, govde }) => servis.kgFiyatlariEkle(db, kullanici, govde.satirlar),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-kg-fiyatlari/:id/iptal', yetki: 'satin-alma.yaz', parametre: kgFiyatiParametresi, govde: kgFiyatiIptalGovdesi,
    cevap: kgFiyatlariCevabi, tekrarKorumali: true,
    isle: ({ db, kullanici, parametre, govde }) => servis.kgFiyatiIptalEt(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'GET', yol: '/satin-alma-kg-fiyatlari/malzemeler', yetki: { biri: KG_FIYATI_OKUR }, sorgu: malzemeKgFiyatlariSorgusu,
    cevap: malzemeKgFiyatlariCevabi,
    isle: async ({ db, sorgu }) => ({ malzemeler: [...(await servis.malzemeKgFiyatlari(db, sorgu.nolar))].map(([malzemeNo, f]) => ({ malzemeNo, ...f })) }),
  }),
  // 533 a: malzeme başına tedarik termini; liste planın gereken tarihini ve girilen termini gösterir.
  uc({
    yontem: 'GET', yol: '/satin-alma-tedarik-terminleri', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz'] }, cevap: tedarikTerminleriCevabi,
    isle: ({ db }) => servis.tedarikTerminleriListesi(db),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-tedarik-terminleri/kaydet', yetki: { biri: TERMIN_YAZAR }, govde: tedarikTerminiKaydetGovdesi, cevap: tedarikTerminiKaydetCevabi,
    isle: ({ db, kullanici, govde }) => servis.tedarikTerminiKaydet(db, kullanici, govde),
  }),
  // 2642 b (Güvenlik K1-K3): cevapta fiyat var; talep eden ve yalnız oturumu olan okuyamaz. Belge yalnız yoldan, kişi oturumdan.
  uc({
    yontem: 'GET', yol: '/satin-alma-fatura-eslemeleri/:belgeId', yetki: { biri: ['finans.oku', 'finans.maliyet-oku'] }, parametre: faturaEslemesiParametresi,
    cevap: faturaEslemesiCevabi, isle: ({ db, parametre }) => servis.faturaEslemesiGetir(db, parametre.belgeId),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-fatura-eslemeleri/:belgeId/kaydet', yetki: 'finans.yaz', parametre: faturaEslemesiParametresi,
    govde: faturaEslemesiKaydetGovdesi, cevap: faturaEslemesiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.faturaEslemesiYaz(db, kullanici.id, parametre.belgeId, govde),
  }),
];
