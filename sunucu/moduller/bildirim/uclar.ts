import { uc } from '#cekirdek/uc.ts';
import {
  bildirimCevabi, bildirimListeCevabi, bildirimListeSorgusu, bildirimParametresi, bildirimSayacCevabi, bildirimTercihDegistirGovdesi,
  bildirimTercihleriCevabi, cagriEkiplerimCevabi, cagriYonlendirmeCevabi, cagriYonlendirmeDegistirGovdesi, cagriYonlendirmeParametresi, tumunuOkunduCevabi,
} from '#paylasilan/sozlesme/bildirim.ts';
import {
  arsivle, bildirimListesi, bildirimSayaci, cagriEkiplerim, cagriYonlendirmesi, cagriYonlendirmesiYaz, okundu, tercihDegistir, tercihler, tumunuOkundu,
} from './servis.ts';

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
];
