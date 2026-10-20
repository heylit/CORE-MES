import { uc } from '#cekirdek/uc.ts';
import {
  belgeCevabi, belgeParametresi, benCevabi, damgaCevabi, ekCevabi, ekIcerikCevabi, ekParametresi, ekYukleGovdesi, kilitCevabi, kilitGovdesi,
  kisilerCevabi, kurulumCevabi, odaCevabi, odaParametresi, olcuAletleriCevabi, silCevabi, silGovdesi, sorguCevabi, sorguParametresi, yazGovdesi,
} from '#paylasilan/sozlesme/denetim-hazirlik.ts';
import { belgeOku, belgeSil, belgeYaz, ben, damga, ekOku, ekYukle, kilitle, kisiler, kurulum, odaGuncelle, olcuAletleri, sorgu } from './servis.ts';

// Çerçevedeki prototipin depo çağrıları bu uçlara gelir (istemci/src/moduller/denetim-hazirlik/kopru.ts). Her yazma uçtan geçer:
// yetki ve denetim kaydı uç katmanındadır.
const OKUMA = { biri: ['denetim-hazirlik.oku', 'denetim-hazirlik.yaz'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/ben',
    yetki: { biri: ['sayfa.denetim-hazirlik', 'denetim-hazirlik.oku', 'denetim-hazirlik.yaz'] },
    cevap: benCevabi,
    isle: ({ db, kullanici }) => ben(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/olcu-aletleri',
    // 329 a: cihaz listesinin kaynağı Kalibrasyondur; modülün okuma işlemleriyle açılır, yazma ucu yoktur.
    yetki: OKUMA,
    cevap: olcuAletleriCevabi,
    isle: ({ db }) => olcuAletleri(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/damga',
    yetki: OKUMA,
    cevap: damgaCevabi,
    isle: ({ db }) => damga(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/sorgu',
    yetki: OKUMA,
    sorgu: sorguParametresi,
    cevap: sorguCevabi,
    isle: ({ db, kullanici, sorgu: s }) => sorgu(db, kullanici, s),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/belge',
    yetki: OKUMA,
    sorgu: belgeParametresi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, sorgu: s }) => belgeOku(db, kullanici, s.yol),
  }),
  uc({
    yontem: 'POST',
    yol: '/denetim-hazirlik/belge/yaz',
    yetki: 'denetim-hazirlik.yaz',
    govde: yazGovdesi,
    cevap: belgeCevabi,
    isle: ({ db, kullanici, govde }) => belgeYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/denetim-hazirlik/belge/sil',
    yetki: 'denetim-hazirlik.yaz',
    govde: silGovdesi,
    cevap: silCevabi,
    isle: ({ db, kullanici, govde }) => belgeSil(db, kullanici, govde.yol),
  }),
  uc({
    yontem: 'POST',
    yol: '/denetim-hazirlik/belge/kilitle',
    yetki: 'denetim-hazirlik.yaz',
    govde: kilitGovdesi,
    cevap: kilitCevabi,
    isle: ({ db, kullanici, govde }) => kilitle(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/kisiler',
    yetki: OKUMA,
    cevap: kisilerCevabi,
    isle: ({ db }) => kisiler(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/denetim-hazirlik/kurulum',
    yetki: 'denetim-hazirlik.yonet',
    cevap: kurulumCevabi,
    isle: ({ db, kullanici }) => kurulum(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/oda',
    yetki: OKUMA,
    sorgu: odaParametresi,
    cevap: odaCevabi,
    isle: ({ kullanici, sorgu: s }) => odaGuncelle(kullanici, s.durum),
  }),
  uc({
    yontem: 'POST',
    yol: '/denetim-hazirlik/ekler/yukle',
    yetki: 'denetim-hazirlik.yaz',
    // Dosya içeriği deftere girmez (boyutu ve özeti girer); adı ve türü seçilir. Kullanıcı kararı bekler (CEKIRDEK-ISTEKLERI).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ ad: g.ad, tur: g.tur }),
    govde: ekYukleGovdesi,
    cevap: ekCevabi,
    isle: ({ db, kullanici, govde }) => ekYukle(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/denetim-hazirlik/ekler/:id',
    yetki: OKUMA,
    parametre: ekParametresi,
    cevap: ekIcerikCevabi,
    isle: ({ db, parametre }) => ekOku(db, parametre.id),
  }),
];
