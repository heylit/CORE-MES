import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  bildirimAliciDegistirGovdesi, bildirimAliciParametresi, bildirimAlicilariCevabi, bildirimCevabi, bildirimListeCevabi, bildirimListeSorgusu, bildirimParametresi, bildirimSayacCevabi, bildirimTercihDegistirGovdesi,
  bildirimTercihleriCevabi, cagriEkiplerimCevabi, cagriYonlendirmeCevabi, cagriYonlendirmeDegistirGovdesi, cagriYonlendirmeParametresi, tumunuOkunduCevabi,
  bildirimOnayCevabi, bildirimYayinAlicilariCevabi, bildirimYayinCevabi, bildirimYayinHedefleriCevabi, bildirimYayinListeCevabi, bildirimYayinListeSorgusu,
  bildirimYayinlaGovdesi, bildirimYayinParametresi, ortadakiBildirimlerCevabi,
  bildirimGosterimDegistirGovdesi, bildirimGosterimleriCevabi, bildirimGosterimParametresi,
  bildirimPushAbonelikGovdesi, bildirimPushDurumuCevabi, bildirimPushTurDegistirGovdesi, bildirimPushTurleriCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import {
  arsivle, bildirimAlicilari, bildirimAlicilariYaz, bildirimGosterimleri, bildirimGosterimiYaz, bildirimListesi, bildirimSayaci, cagriEkiplerim, cagriYonlendirmesi, cagriYonlendirmesiYaz, okundu, tercihDegistir, tercihler, tumunuOkundu,
  pushAboneOl, pushAbonelikSil, pushDurumu, pushTuruYaz, pushTurleri,
} from './servis.ts';
import {
  epostaDefterCevabi, epostaDefterSorgusu, epostaDenemeCevabi, epostaDenemeGovdesi, epostaDurumuCevabi, epostaSablonDegistirGovdesi, epostaSablonParametresi,
  epostaSablonlariCevabi, epostaSinamaCevabi, epostaTetikleyiciDegistirGovdesi, epostaTetikleyiciParametresi, epostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import {
  epostaDefteri, epostaDenemesi, epostaDurumu, epostaSablonlari, epostaSablonuYaz, epostaSinamasi, epostaTetikleyicileri, epostaTetikleyicisiYaz,
} from './eposta.ts';
import {
  acikTakiplerCevabi, gecikenlerimCevabi, kademeAyarDegistirGovdesi, kademeAyarlariCevabi, kademeKaynagiParametresi,
} from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { acikTakipler, gecikenlerim, kademeAyarlari, kademeAyariYaz, seridim } from './kademe.ts';
import {
  geriCek, hedefSecenekleri, onayla, ortadakiBildirimler, yayinAyrintisi, yayinGorseli, yayinla, yayinListesi,
} from './yayin.ts';

// Rapor uçları: yayınlayan kendininkini, `bildirim.yayin-oku` taşıyan hepsini görür (servis süzer).
const YAYIN_GORME = { biri: ['bildirim.yayinla', 'bildirim.yayin-oku'] } as const;

// Kişinin kendi bildirimleri (222 a): her uç yalnız oturum ister ve yalnız oturumdaki kişinin satırına dokunur; adres ya da
// gövde başka kişiyi seçemez. Başkasının bildirim kimliği "bulunamadı" döner.
export const uclar = [
  uc({
    yontem: 'GET', yol: '/bildirimler', yetki: 'oturum', sahiplik: 'kendi', sorgu: bildirimListeSorgusu, cevap: bildirimListeCevabi,
    isle: ({ db, kullanici, sorgu }) => bildirimListesi(db, kullanici, sorgu),
  }),
  uc({ yontem: 'GET', yol: '/bildirimler/sayac', yetki: 'oturum', sahiplik: 'kendi', cevap: bildirimSayacCevabi, isle: ({ db, kullanici }) => bildirimSayaci(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/:id/okundu', yetki: 'oturum', sahiplik: 'kendi', parametre: bildirimParametresi, cevap: bildirimCevabi,
    isle: ({ db, kullanici, parametre }) => okundu(db, kullanici, parametre.id),
  }),
  uc({ yontem: 'POST', yol: '/bildirimler/tumunu-okundu', yetki: 'oturum', sahiplik: 'kendi', cevap: tumunuOkunduCevabi, isle: ({ db, kullanici }) => tumunuOkundu(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/:id/arsivle', yetki: 'oturum', sahiplik: 'kendi', parametre: bildirimParametresi, cevap: bildirimCevabi,
    isle: ({ db, kullanici, parametre }) => arsivle(db, kullanici, parametre.id),
  }),
  uc({ yontem: 'GET', yol: '/bildirimler/tercihler', yetki: 'oturum', sahiplik: 'kendi', cevap: bildirimTercihleriCevabi, isle: ({ db, kullanici }) => tercihler(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/tercihler/degistir', yetki: 'oturum', sahiplik: 'kendi', govde: bildirimTercihDegistirGovdesi, cevap: bildirimTercihleriCevabi,
    isle: ({ db, kullanici, govde }) => tercihDegistir(db, kullanici, govde),
  }),
  // Web Push (ADR 0031): kişi yalnız kendi cihazını açar ve kapatır; gövde kişi seçemez. Açık anahtar gizli değildir.
  uc({ yontem: 'GET', yol: '/bildirimler/push', yetki: 'oturum', sahiplik: 'kendi', cevap: bildirimPushDurumuCevabi, isle: ({ db, kullanici }) => pushDurumu(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/push/abone-ol', yetki: 'oturum', sahiplik: 'kendi', govde: bildirimPushAbonelikGovdesi, cevap: bildirimPushDurumuCevabi,
    isle: ({ db, kullanici, govde }) => pushAboneOl(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/bildirimler/push/abonelik-sil', yetki: 'oturum', sahiplik: 'kendi', govde: bildirimPushAbonelikGovdesi, cevap: bildirimPushDurumuCevabi,
    isle: ({ db, kullanici, govde }) => pushAbonelikSil(db, kullanici, govde),
  }),
  // Türe göre sinyal (ADR 0031 madde 7): Sistem Ayarları'nın işlemiyle okunur ve yazılır.
  uc({ yontem: 'GET', yol: '/bildirimler/push/turler', yetki: 'ayarlar.yaz', cevap: bildirimPushTurleriCevabi, isle: ({ db }) => pushTurleri(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/push/turler/:tur/degistir', yetki: 'ayarlar.yaz', parametre: bildirimGosterimParametresi,
    govde: bildirimPushTurDegistirGovdesi, cevap: bildirimPushTurleriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => pushTuruYaz(db, kullanici, parametre.tur, govde),
  }),
  // Ekip çağrısı yönlendirmesi (298 a): Sistem Ayarları'nın işlemiyle okunur ve yazılır; rol yetkisi vermez, yalnız alıcıyı seçer.
  // Arkon çağrı bandı için: oturumdaki kişinin hangi ekip çağrılarını aldığı; eşlemenin kendisini ve başka kişiyi göstermez.
  uc({ yontem: 'GET', yol: '/bildirimler/cagri-yonlendirme/benim', yetki: 'oturum', sahiplik: 'kendi', cevap: cagriEkiplerimCevabi, isle: ({ db, kullanici }) => cagriEkiplerim(db, kullanici) }),
  uc({ yontem: 'GET', yol: '/bildirimler/cagri-yonlendirme', yetki: 'ayarlar.yaz', cevap: cagriYonlendirmeCevabi, isle: ({ db }) => cagriYonlendirmesi(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/cagri-yonlendirme/:ekip/degistir', yetki: 'ayarlar.yaz', parametre: cagriYonlendirmeParametresi,
    govde: cagriYonlendirmeDegistirGovdesi, cevap: cagriYonlendirmeCevabi,
    isle: ({ db, kullanici, parametre, govde }) => cagriYonlendirmesiYaz(db, kullanici, parametre.ekip, govde),
  }),
  // Bildirim alıcıları (760 c): Sistem Ayarları'nın işlemiyle okunur ve yazılır; rol ya da kişi seçmek yetki vermez, yalnız alıcıyı seçer.
  uc({ yontem: 'GET', yol: '/bildirimler/alicilar', yetki: 'ayarlar.yaz', cevap: bildirimAlicilariCevabi, isle: ({ db }) => bildirimAlicilari(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/alicilar/:tur/degistir', yetki: 'ayarlar.yaz', parametre: bildirimAliciParametresi,
    govde: bildirimAliciDegistirGovdesi, cevap: bildirimAlicilariCevabi,
    isle: ({ db, kullanici, parametre, govde }) => bildirimAlicilariYaz(db, kullanici, parametre.tur, govde),
  }),
  // Otomatik bildirimin gösterimi (2147 Y4): Sistem Ayarları'nın işlemiyle okunur ve yazılır.
  uc({ yontem: 'GET', yol: '/bildirimler/gosterim', yetki: 'ayarlar.yaz', cevap: bildirimGosterimleriCevabi, isle: ({ db }) => bildirimGosterimleri(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/gosterim/:tur/degistir', yetki: 'ayarlar.yaz', parametre: bildirimGosterimParametresi,
    govde: bildirimGosterimDegistirGovdesi, cevap: bildirimGosterimleriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => bildirimGosterimiYaz(db, kullanici, parametre.tur, govde),
  }),
  // Ekran ortası (2147-3 a): kişinin kendi bekleyenleri; onay yalnız kendi satırına.
  uc({ yontem: 'GET', yol: '/bildirimler/ortada', yetki: 'oturum', sahiplik: 'kendi', cevap: ortadakiBildirimlerCevabi, isle: ({ db, kullanici }) => ortadakiBildirimler(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/:id/onayla', yetki: 'oturum', sahiplik: 'kendi', parametre: bildirimParametresi, cevap: bildirimOnayCevabi,
    isle: ({ db, kullanici, parametre }) => onayla(db, kullanici, parametre.id),
  }),
  // Elle bildirim (2147-2 c): yayınlamak `bildirim.yayinla` ister; işlem hiçbir role göçle verilmedi, başta yalnız yönetici.
  uc({ yontem: 'GET', yol: '/bildirimler/yayinlar/hedefler', yetki: 'bildirim.yayinla', cevap: bildirimYayinHedefleriCevabi, isle: ({ db }) => hedefSecenekleri(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/yayinlar/yayinla', yetki: 'bildirim.yayinla', tekrarKorumali: true, govde: bildirimYayinlaGovdesi, cevap: bildirimYayinCevabi,
    isle: ({ db, kullanici, govde, denetimEki }) => yayinla(db, kullanici, govde, denetimEki),
  }),
  uc({
    yontem: 'POST', yol: '/bildirimler/yayinlar/:id/geri-cek', yetki: 'bildirim.yayinla', parametre: bildirimYayinParametresi, cevap: bildirimYayinCevabi,
    isle: ({ db, kullanici, parametre }) => geriCek(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET', yol: '/bildirimler/yayinlar', yetki: YAYIN_GORME, sorgu: bildirimYayinListeSorgusu, cevap: bildirimYayinListeCevabi,
    isle: ({ db, kullanici, sorgu }) => yayinListesi(db, kullanici, sorgu),
  }),
  uc({
    yontem: 'GET', yol: '/bildirimler/yayinlar/:id/alicilar', yetki: YAYIN_GORME, parametre: bildirimYayinParametresi, cevap: bildirimYayinAlicilariCevabi,
    isle: ({ db, kullanici, parametre }) => yayinAyrintisi(db, kullanici, parametre.id),
  }),
  // Görsel alıcıya da açıktır: oturum ister, servis alıcı, yazan ya da rapor işlemi olmayana "bulunamadı" der.
  uc({
    yontem: 'GET', yol: '/bildirimler/yayinlar/:id/gorsel', yetki: 'oturum', sahiplik: 'kendi', parametre: bildirimYayinParametresi, cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => yayinGorseli(db, kullanici, parametre.id),
  }),
  // E-posta kanalı (ADR 0015, 3397): sunucu adresi ve parola ortamdadır, hiçbir uçtan yazılmaz. Deneme yalnız isteyenin kendi adresine.
  uc({ yontem: 'GET', yol: '/bildirimler/eposta/durum', yetki: 'bildirim.eposta-yonet', cevap: epostaDurumuCevabi, isle: ({ db }) => epostaDurumu(db) }),
  uc({ yontem: 'GET', yol: '/bildirimler/eposta/sablonlar', yetki: 'bildirim.eposta-yonet', cevap: epostaSablonlariCevabi, isle: ({ db }) => epostaSablonlari(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/eposta/sablonlar/:konu/degistir', yetki: 'bildirim.eposta-yonet', parametre: epostaSablonParametresi,
    govde: epostaSablonDegistirGovdesi, cevap: epostaSablonlariCevabi,
    isle: ({ db, kullanici, parametre, govde }) => epostaSablonuYaz(db, kullanici, parametre.konu, govde),
  }),
  uc({ yontem: 'GET', yol: '/bildirimler/eposta/tetikleyiciler', yetki: 'bildirim.eposta-yonet', cevap: epostaTetikleyicileriCevabi, isle: ({ db }) => epostaTetikleyicileri(db) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/eposta/tetikleyiciler/:tur/degistir', yetki: 'bildirim.eposta-yonet', parametre: epostaTetikleyiciParametresi,
    govde: epostaTetikleyiciDegistirGovdesi, cevap: epostaTetikleyicileriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => epostaTetikleyicisiYaz(db, kullanici, parametre.tur, govde),
  }),
  uc({
    yontem: 'GET', yol: '/bildirimler/eposta/defter', yetki: 'bildirim.eposta-yonet', sorgu: epostaDefterSorgusu, cevap: epostaDefterCevabi,
    isle: ({ db, sorgu }) => epostaDefteri(db, sorgu),
  }),
  uc({
    yontem: 'POST', yol: '/bildirimler/eposta/deneme', yetki: 'bildirim.eposta-yonet', govde: epostaDenemeGovdesi, cevap: epostaDenemeCevabi,
    isle: ({ db, kullanici, govde }) => epostaDenemesi(db, kullanici, govde.konu),
  }),
  uc({ yontem: 'POST', yol: '/bildirimler/eposta/sina', yetki: 'bildirim.eposta-yonet', cevap: epostaSinamaCevabi, isle: ({ db }) => epostaSinamasi(db) }),
  // Kademeli uyarı (3405): ayar ve bütün açık takipler yalnız `bildirim.kademe-yonet` (yönetici bayrağı, 3405-3 a). Kişinin kendi
  // geciken işleri yalnız oturumdur; servis kaynağı okuyamayanın satırını vermez (Risk K2).
  uc({ yontem: 'GET', yol: '/bildirim-kademe/kaynaklar', yetki: 'bildirim.kademe-yonet', cevap: kademeAyarlariCevabi, isle: ({ db }) => kademeAyarlari(db) }),
  uc({
    yontem: 'POST', yol: '/bildirim-kademe/kaynaklar/:kaynak/ayarla', yetki: 'bildirim.kademe-yonet', parametre: kademeKaynagiParametresi,
    govde: kademeAyarDegistirGovdesi, cevap: kademeAyarlariCevabi,
    isle: ({ db, kullanici, parametre, govde }) => kademeAyariYaz(db, kullanici, parametre.kaynak, govde),
  }),
  uc({
    yontem: 'GET', yol: '/bildirim-kademe/acik-takipler', yetki: 'bildirim.kademe-yonet', cevap: acikTakiplerCevabi,
    isle: ({ db, kullanici }) => acikTakipler(db, kullanici),
  }),
  uc({
    yontem: 'GET', yol: '/bildirim-kademe/gecikenlerim', yetki: 'oturum', sahiplik: 'kendi', cevap: gecikenlerimCevabi,
    isle: ({ db, kullanici }) => gecikenlerim(db, kullanici),
  }),
  uc({
    yontem: 'GET', yol: '/bildirim-kademe/seridim', yetki: 'oturum', sahiplik: 'kendi', cevap: gecikenlerimCevabi,
    isle: ({ db, kullanici }) => seridim(db, kullanici),
  }),
];
