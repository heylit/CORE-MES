import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  acilisCevabi, disOperasyonlarCevabi, fasonSureleriCevabi, fasonSureleriSorgusu, ayarlarKaydetGovdesi, sirketAdiCevabi, hizliAcGovdesi, talebimSemasi, taleplerimCevabi, taleplerimSorgusu, ayarlarSemasi, firmaParametresi, firmaSecenekleriCevabi, firmaSecenekleriSorgusu, katalogKaydetGovdesi, malzemeSecenekleriCevabi, malzemeSecenekleriSorgusu, katalogSemasi, katalogSilGovdesi, talepGovdesi, acikEmirlerCevabi, onTalepleriCevabi, onTalepYoksayGovdesi, onTalepGeriAlGovdesi,
  satinAlmaOzetiCevabi, stokYokIstekleriCevabi, odemePlaniGovdesi, siparisTakibiCevabi, siparisBelgeleriCevabi, siparisBelgesiGovdesi, siparisBelgesiParametresi, siparisSatiriParametresi, siparisFaturalariCevabi, siparisFaturalariSorgusu, siparisFaturasiGovdesi, siparisKalemiDegistirGovdesi, siparisKapatGovdesi, teslimYontemiGovdesi, talepKaydetGovdesi, talepParametresi, talepSemasi, talepSilGovdesi, tamamCevabi, tedarikciKaydetGovdesi, tedarikciSemasi,
  tedarikTerminiKaydetGovdesi, tedarikTerminiKaydetCevabi, tedarikTerminleriCevabi,
  kgFiyatiEkleGovdesi, kgFiyatiGecmisiCevabi, kgFiyatiGecmisiSorgusu, kgFiyatlariCevabi, malzemeKgFiyatlariCevabi, malzemeKgFiyatlariSorgusu,
} from '#paylasilan/sozlesme/satin-alma.ts';
import { z } from 'zod';
import * as servis from './servis.ts';

const katalogParametresi = z.object({ id: z.string().uuid() });

// 215 a: maliyet okuyan (müdür, muhasebe/finans) kg fiyatını görür, değiştiremez.
const KG_FIYATI_OKUR = ['satin-alma.oku', 'satin-alma.yaz', 'finans.maliyet-oku'] as const;
// 534 1 a: tedarik terminini satın almayı yazan ve planı yazan girer (Planlama ekranındaki giriş de bu uca gelir); yeni işlem yok.
const TERMIN_YAZAR = ['satin-alma.yaz', 'plan.yaz'] as const;

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
  // D6 b: sipariş ve finanstaki alış faturası bağı. Seçici tutarsız liste okur; bağı satın almayı yazan işlem kurar.
  // Ağ kopunca aynı kimlikle yinelenen bağ ilk cevabı alır; geçmişe ikinci satır yazılmaz.
  uc({
    yontem: 'GET', yol: '/satin-alma-siparis-faturalari', yetki: 'satin-alma.yaz', sorgu: siparisFaturalariSorgusu, cevap: siparisFaturalariCevabi,
    isle: ({ db, sorgu }) => servis.siparisFaturalari(db, sorgu.talepId, sorgu.teklifId),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-talepleri/:id/siparis-faturasi', yetki: 'satin-alma.yaz', parametre: talepParametresi,
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
  // Şirket adı başka ekranlarda da (Finans) gösterilir: oturum yeter, ayarın geri kalanı gitmez.
  uc({
    yontem: 'GET', yol: '/satin-alma-ayarlari/sirket-adi', yetki: 'oturum', cevap: sirketAdiCevabi,
    isle: async ({ db }) => ({ sirketAdi: await servis.sirketAdi(db) }),
  }),
  uc({
    yontem: 'POST', yol: '/satin-alma-ayarlari/kaydet', yetki: 'satin-alma.ayar', govde: ayarlarKaydetGovdesi, cevap: ayarlarSemasi,
    isle: ({ db, govde }) => servis.ayarlarKaydet(db, govde),
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
];
