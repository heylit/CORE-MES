import { uc } from '#cekirdek/uc.ts';
import {
  belgeCevabi, belgeParametresi, benCevabi, benHazirlaCevabi, damgaCevabi, ekCevabi, firmaKisisiCevabi, firmaKisisiGovdesi, firmaKisisiParametresi, ekIcerikCevabi, ekParametresi, ekYukleGovdesi, kilitCevabi, kilitGovdesi,
  kisilerCevabi, kurulumCevabi, odaCevabi, onayKarariGovdesi, onayParametresi, odaParametresi, silCevabi, silGovdesi, sorguCevabi, sorguParametresi, yazGovdesi,
} from '#paylasilan/sozlesme/portal.ts';
import { belgeOku, belgeSil, belgeYaz, ben, benHazirla, damga, ekOku, ekYukle, firmaKisisiAta, izleyiciBul, kilitle, kisiler, kurulum, odaGuncelle, onayKarariVer, sorgu } from './servis.ts';

// Çerçevedeki prototipin depo çağrıları bu uçlara gelir (istemci/src/moduller/portal/kopru.ts). Her yazma uçtan geçer:
// yetki ve denetim kaydı uç katmanındadır.
const OKUMA = { biri: ['portal.oku', 'portal.yaz'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/portal/ben',
    yetki: { biri: ['sayfa.portal', 'portal.oku', 'portal.yaz'] },
    cevap: benCevabi,
    isle: ({ db, kullanici }) => ben(db, kullanici),
  }),
  // Kişinin kendi kaydı: okuyan da yazan da kendi firma kullanıcısını kurar (o olmadan prototip kullanıcı seçim ekranında
  // kalır). Yazma ucu tek işlem ister; oku ya da yaz denetimi serviste. İş verisine dokunmaz.
  uc({
    yontem: 'POST',
    yol: '/portal/ben/hazirla',
    yetki: 'oturum',
    cevap: benHazirlaCevabi,
    isle: ({ db, kullanici }) => benHazirla(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/portal/damga',
    yetki: OKUMA,
    cevap: damgaCevabi,
    isle: ({ db }) => damga(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/portal/sorgu',
    yetki: OKUMA,
    sorgu: sorguParametresi,
    cevap: sorguCevabi,
    isle: ({ db, kullanici, sorgu: s }) => sorgu(db, kullanici, s),
  }),
  uc({
    yontem: 'GET',
    yol: '/portal/belge',
    yetki: OKUMA,
    sorgu: belgeParametresi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, sorgu: s }) => belgeOku(db, kullanici, s.yol),
  }),
  uc({
    yontem: 'POST',
    yol: '/portal/belge/yaz',
    yetki: 'portal.yaz',
    govde: yazGovdesi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, govde }) => belgeYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/portal/belge/sil',
    yetki: 'portal.yaz',
    govde: silGovdesi,
    cevap: silCevabi,
    isle: ({ db, kullanici, govde }) => belgeSil(db, kullanici, govde.yol),
  }),
  uc({
    yontem: 'POST',
    yol: '/portal/belge/kilitle',
    yetki: 'portal.yaz',
    govde: kilitGovdesi,
    cevap: kilitCevabi,
    isle: ({ db, kullanici, govde }) => kilitle(db, kullanici, govde),
  }),
  // Onay kararı yalnız bu uçtan: genel yazma onay kaydının karar alanlarını reddeder (kart #1583). Adımı kimin verebileceği
  // serviste, kişinin TMI rolünden çıkan portal rolüyle denetlenir.
  uc({
    yontem: 'POST',
    yol: '/portal/onaylar/:kimlik/karar',
    yetki: 'portal.yaz',
    parametre: onayParametresi,
    govde: onayKarariGovdesi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, parametre, govde }) => onayKarariVer(db, kullanici, parametre.kimlik, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/portal/kisiler',
    yetki: OKUMA,
    cevap: kisilerCevabi,
    isle: ({ db, kullanici }) => kisiler(db, kullanici),
  }),
  // Firma kişisi (1021 b): kişi portalda o firmanın müşteri ya da tedarikçi kullanıcısı olarak, yalnız okuyarak açılır.
  uc({
    yontem: 'POST',
    yol: '/portal/kisiler/:kisiId/firma',
    yetki: 'portal.yonet',
    parametre: firmaKisisiParametresi,
    govde: firmaKisisiGovdesi,
    cevap: firmaKisisiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => firmaKisisiAta(db, kullanici, parametre.kisiId, govde.firma),
  }),
  uc({
    yontem: 'POST',
    yol: '/portal/kurulum',
    yetki: 'portal.yonet',
    cevap: kurulumCevabi,
    isle: ({ db, kullanici }) => kurulum(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/portal/oda',
    yetki: OKUMA,
    sorgu: odaParametresi,
    cevap: odaCevabi,
    isle: async ({ db, kullanici, sorgu: s }) => odaGuncelle(kullanici, await izleyiciBul(db, kullanici), s.durum),
  }),
  uc({
    yontem: 'POST',
    yol: '/portal/ekler/yukle',
    yetki: 'portal.yaz',
    // Dosya içeriği deftere girmez (boyutu ve özeti girer); adı ve türü seçilir. Kullanıcı kararı bekler (CEKIRDEK-ISTEKLERI).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ ad: g.ad, tur: g.tur }),
    govde: ekYukleGovdesi,
    cevap: ekCevabi,
    isle: ({ db, kullanici, govde }) => ekYukle(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/portal/ekler/:id',
    yetki: OKUMA,
    parametre: ekParametresi,
    cevap: ekIcerikCevabi,
    isle: ({ db, kullanici, parametre }) => ekOku(db, kullanici, parametre.id),
  }),
];
