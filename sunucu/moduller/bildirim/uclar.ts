import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  bildirimAliciDegistirGovdesi, bildirimAliciParametresi, bildirimAlicilariCevabi, bildirimCevabi, bildirimListeCevabi, bildirimListeSorgusu, bildirimParametresi, bildirimSayacCevabi, bildirimTercihDegistirGovdesi,
  bildirimTercihleriCevabi, cagriEkiplerimCevabi, cagriYonlendirmeCevabi, cagriYonlendirmeDegistirGovdesi, cagriYonlendirmeParametresi, tumunuOkunduCevabi,
  bildirimOnayCevabi, bildirimYayinAlicilariCevabi, bildirimYayinCevabi, bildirimYayinHedefleriCevabi, bildirimYayinListeCevabi, bildirimYayinListeSorgusu,
  bildirimYayinlaGovdesi, bildirimYayinParametresi, ortadakiBildirimlerCevabi,
  bildirimGosterimDegistirGovdesi, bildirimGosterimleriCevabi, bildirimGosterimParametresi,
} from '#paylasilan/sozlesme/bildirim.ts';
import {
  arsivle, bildirimAlicilari, bildirimAlicilariYaz, bildirimGosterimleri, bildirimGosterimiYaz, bildirimListesi, bildirimSayaci, cagriEkiplerim, cagriYonlendirmesi, cagriYonlendirmesiYaz, okundu, tercihDegistir, tercihler, tumunuOkundu,
} from './servis.ts';
import {
  geriCek, hedefSecenekleri, onayla, ortadakiBildirimler, yayinAyrintisi, yayinGorseli, yayinla, yayinListesi,
} from './yayin.ts';

// Rapor uçları: yayınlayan kendininkini, `bildirim.yayin-oku` taşıyan hepsini görür (servis süzer).
const YAYIN_GORME = { biri: ['bildirim.yayinla', 'bildirim.yayin-oku'] } as const;

// Kişinin kendi bildirimleri (222 a): her uç yalnız oturum ister ve yalnız oturumdaki kişinin satırına dokunur; adres ya da
// gövde başka kişiyi seçemez. Başkasının bildirim kimliği "bulunamadı" döner.
export const uclar = [
  uc({
    yontem: 'GET', yol: '/bildirimler', yetki: 'oturum', sorgu: bildirimListeSorgusu, cevap: bildirimListeCevabi,
    isle: ({ db, kullanici, sorgu }) => bildirimListesi(db, kullanici, sorgu),
  }),
  uc({ yontem: 'GET', yol: '/bildirimler/sayac', yetki: 'oturum', cevap: bildirimSayacCevabi, isle: ({ db, kullanici }) => bildirimSayaci(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/:id/okundu', yetki: 'oturum', parametre: bildirimParametresi, cevap: bildirimCevabi,
    isle: ({ db, kullanici, parametre }) => okundu(db, kullanici, parametre.id),
  }),
  uc({ yontem: 'POST', yol: '/bildirimler/tumunu-okundu', yetki: 'oturum', cevap: tumunuOkunduCevabi, isle: ({ db, kullanici }) => tumunuOkundu(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/:id/arsivle', yetki: 'oturum', parametre: bildirimParametresi, cevap: bildirimCevabi,
    isle: ({ db, kullanici, parametre }) => arsivle(db, kullanici, parametre.id),
  }),
  uc({ yontem: 'GET', yol: '/bildirimler/tercihler', yetki: 'oturum', cevap: bildirimTercihleriCevabi, isle: ({ db, kullanici }) => tercihler(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/tercihler/degistir', yetki: 'oturum', govde: bildirimTercihDegistirGovdesi, cevap: bildirimTercihleriCevabi,
    isle: ({ db, kullanici, govde }) => tercihDegistir(db, kullanici, govde),
  }),
  // Ekip çağrısı yönlendirmesi (298 a): Sistem Ayarları'nın işlemiyle okunur ve yazılır; rol yetkisi vermez, yalnız alıcıyı seçer.
  // Arkon çağrı bandı için: oturumdaki kişinin hangi ekip çağrılarını aldığı; eşlemenin kendisini ve başka kişiyi göstermez.
  uc({ yontem: 'GET', yol: '/bildirimler/cagri-yonlendirme/benim', yetki: 'oturum', cevap: cagriEkiplerimCevabi, isle: ({ db, kullanici }) => cagriEkiplerim(db, kullanici) }),
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
  uc({ yontem: 'GET', yol: '/bildirimler/ortada', yetki: 'oturum', cevap: ortadakiBildirimlerCevabi, isle: ({ db, kullanici }) => ortadakiBildirimler(db, kullanici) }),
  uc({
    yontem: 'POST', yol: '/bildirimler/:id/onayla', yetki: 'oturum', parametre: bildirimParametresi, cevap: bildirimOnayCevabi,
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
    yontem: 'GET', yol: '/bildirimler/yayinlar/:id/gorsel', yetki: 'oturum', parametre: bildirimYayinParametresi, cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => yayinGorseli(db, kullanici, parametre.id),
  }),
];
