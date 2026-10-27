import { uc } from '#cekirdek/uc.ts';
import {
  masrafBaglaGovdesi, masrafParametresi, masrafSecenekleriCevabi, masrafSecenekleriSorgusu, projeMaliyetCevabi, projeMaliyetParametresi,
  tabanAlGovdesi, yazmaCevabi,
} from '#paylasilan/sozlesme/proje-maliyet.ts';
import { masrafBagiKaldir, masrafBagla, masrafSecenekleri, projeMaliyeti, tabanAl } from './servis.ts';

export const uclar = [
  // Projeler'in Maliyet sekmesi (197 a). Maliyet finans.maliyet-oku ister; tutar, katkı ve kâr ayrıca siparisler.fiyat-oku (servis).
  uc({
    yontem: 'GET',
    yol: '/proje-maliyet/:projeId',
    yetki: 'finans.maliyet-oku',
    parametre: projeMaliyetParametresi,
    cevap: projeMaliyetCevabi,
    isle: ({ db, kullanici, parametre }) => projeMaliyeti(db, kullanici, parametre.projeId),
  }),
  // 940 c: taban alma ve masraf bağı proje yazma işlemiyle. Yazma cevabı tutar taşımaz; ekran maliyeti okuma ucundan tazeler.
  uc({
    yontem: 'GET',
    yol: '/proje-maliyet/masraf-secenekleri',
    yetki: 'projeler.yaz',
    sorgu: masrafSecenekleriSorgusu,
    cevap: masrafSecenekleriCevabi,
    isle: ({ db, kullanici, sorgu }) => masrafSecenekleri(db, kullanici, sorgu.ara),
  }),
  uc({
    yontem: 'POST',
    yol: '/proje-maliyet/:projeId/taban',
    yetki: 'projeler.yaz',
    tekrarKorumali: true,
    parametre: projeMaliyetParametresi,
    govde: tabanAlGovdesi,
    cevap: yazmaCevabi,
    isle: ({ db, kullanici, parametre, govde }) => tabanAl(db, kullanici, parametre.projeId, govde.gerekce),
  }),
  uc({
    yontem: 'POST',
    yol: '/proje-maliyet/:projeId/masraflar',
    yetki: 'projeler.yaz',
    tekrarKorumali: true,
    parametre: projeMaliyetParametresi,
    govde: masrafBaglaGovdesi,
    cevap: yazmaCevabi,
    isle: ({ db, kullanici, parametre, govde }) => masrafBagla(db, kullanici, parametre.projeId, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/proje-maliyet/masraflar/:bagId/kaldir',
    yetki: 'projeler.yaz',
    parametre: masrafParametresi,
    cevap: yazmaCevabi,
    isle: ({ db, parametre }) => masrafBagiKaldir(db, parametre.bagId),
  }),
];
