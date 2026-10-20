import { uc } from '#cekirdek/uc.ts';
import {
  belgeCevabi, belgeParametresi, benCevabi, damgaCevabi, ekCevabi, ekIcerikCevabi, ekParametresi, ekYukleGovdesi, kilitCevabi, kilitGovdesi,
  kisilerCevabi, kurulumCevabi, odaCevabi, odaParametresi, silCevabi, silGovdesi, sorguCevabi, sorguParametresi, yazGovdesi,
} from '#paylasilan/sozlesme/mesaj.ts';
import { belgeOku, belgeSil, belgeYaz, ben, damga, ekOku, ekYukle, kilitle, kisiler, kurulum, odaGuncelle, sorgu } from './servis.ts';

// Çerçevedeki prototipin depo çağrıları bu uçlara gelir (istemci/src/moduller/mesaj/kopru.ts). Her yazma uçtan geçer:
// yetki ve denetim kaydı uç katmanındadır.
const OKUMA = { biri: ['mesaj.oku', 'mesaj.yaz'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/mesaj/ben',
    yetki: { biri: ['sayfa.mesaj', 'mesaj.oku', 'mesaj.yaz'] },
    cevap: benCevabi,
    isle: ({ db, kullanici }) => ben(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/mesaj/damga',
    yetki: OKUMA,
    cevap: damgaCevabi,
    isle: ({ db }) => damga(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/mesaj/sorgu',
    yetki: OKUMA,
    sorgu: sorguParametresi,
    cevap: sorguCevabi,
    isle: ({ db, kullanici, sorgu: s }) => sorgu(db, kullanici, s),
  }),
  uc({
    yontem: 'GET',
    yol: '/mesaj/belge',
    yetki: OKUMA,
    sorgu: belgeParametresi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, sorgu: s }) => belgeOku(db, kullanici, s.yol),
  }),
  uc({
    yontem: 'POST',
    yol: '/mesaj/belge/yaz',
    yetki: 'mesaj.yaz',
    govde: yazGovdesi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, govde }) => belgeYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/mesaj/belge/sil',
    yetki: 'mesaj.yaz',
    govde: silGovdesi,
    cevap: silCevabi,
    isle: ({ db, kullanici, govde }) => belgeSil(db, kullanici, govde.yol),
  }),
  uc({
    yontem: 'POST',
    yol: '/mesaj/belge/kilitle',
    yetki: 'mesaj.yaz',
    govde: kilitGovdesi,
    cevap: kilitCevabi,
    isle: ({ db, kullanici, govde }) => kilitle(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/mesaj/kisiler',
    yetki: OKUMA,
    cevap: kisilerCevabi,
    isle: ({ db }) => kisiler(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/mesaj/kurulum',
    yetki: 'mesaj.yonet',
    cevap: kurulumCevabi,
    isle: ({ db, kullanici }) => kurulum(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/mesaj/oda',
    yetki: OKUMA,
    sorgu: odaParametresi,
    cevap: odaCevabi,
    isle: ({ kullanici, sorgu: s }) => odaGuncelle(kullanici, s.durum),
  }),
  uc({
    yontem: 'POST',
    yol: '/mesaj/ekler/yukle',
    yetki: 'mesaj.yaz',
    // Dosya içeriği deftere girmez (boyutu ve özeti girer); adı ve türü seçilir. Kullanıcı kararı bekler (CEKIRDEK-ISTEKLERI).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ ad: g.ad, tur: g.tur }),
    govde: ekYukleGovdesi,
    cevap: ekCevabi,
    isle: ({ db, kullanici, govde }) => ekYukle(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/mesaj/ekler/:id',
    yetki: OKUMA,
    parametre: ekParametresi,
    cevap: ekIcerikCevabi,
    isle: ({ db, parametre }) => ekOku(db, parametre.id),
  }),
];
