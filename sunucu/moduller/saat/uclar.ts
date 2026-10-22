import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { emirParametresi, onizlemeKaresiParametresi, saatDurdurGovdesi, saatDurusNedenleriCevabi, saatEmriCevabi, saatIstasyonlariCevabi, saatOnizlemesiCevabi, saatSiradakiCevabi, saatUstlenGovdesi, saatUyarilariCevabi, saatVardiyaCevabi } from '#paylasilan/sozlesme/saat.ts';
import * as servis from './servis.ts';

// Okuma uçları yeni işlem istemez (kart #1631): açık emirleri ve istasyon durumunu zaten okuyan roller (emir listesi,
// Fabrika Haritası) saatte de görür. Terminal rolü emir listesini okumadığı için burada da yoktur.
const OKUMA = { biri: [...ADIMLI_OKUMA_ISLEMLERI, 'sayfa.atolye'] } as const;
const PLAN_OKUMA = { biri: ['plan.oku', 'plan.yaz'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/saat/istasyonlar',
    yetki: OKUMA,
    cevap: saatIstasyonlariCevabi,
    isle: ({ db, kullanici }) => servis.istasyonlar(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/uyarilar',
    yetki: OKUMA,
    cevap: saatUyarilariCevabi,
    isle: ({ db, kullanici }) => servis.uyarilar(db, kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/emirler/:id',
    yetki: OKUMA,
    parametre: emirParametresi,
    cevap: saatEmriCevabi,
    isle: ({ db, kullanici, parametre }) => servis.emir(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/emirler/:id/onizleme',
    yetki: OKUMA,
    parametre: emirParametresi,
    cevap: saatOnizlemesiCevabi,
    isle: ({ db, kullanici, parametre }) => servis.onizleme(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/emirler/:id/onizleme/:kare',
    yetki: OKUMA,
    parametre: onizlemeKaresiParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => servis.onizlemeKaresi(db, kullanici, parametre.id, parametre.kare),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/istasyonlar/:id/onizleme',
    yetki: OKUMA,
    parametre: emirParametresi,
    cevap: saatOnizlemesiCevabi,
    isle: ({ db, kullanici, parametre }) => servis.tezgahOnizlemesi(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/istasyonlar/:id/onizleme/:kare',
    yetki: OKUMA,
    parametre: onizlemeKaresiParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => servis.tezgahOnizlemeKaresi(db, kullanici, parametre.id, parametre.kare),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/vardiya',
    yetki: OKUMA,
    cevap: saatVardiyaCevabi,
    isle: ({ db, kullanici }) => servis.vardiya(db, kullanici),
  }),
  // Plan saati yalnız planı okuyan rolde (karar 84 a); plan modülünün okuma işlemleriyle aynı küme.
  uc({
    yontem: 'GET',
    yol: '/saat/istasyonlar/:id/siradaki',
    yetki: PLAN_OKUMA,
    parametre: emirParametresi,
    cevap: saatSiradakiCevabi,
    isle: ({ db, kullanici, parametre }) => servis.siradaki(db, kullanici, parametre.id),
  }),
  uc({
    yontem: 'GET',
    yol: '/saat/durus-nedenleri',
    yetki: 'terminal.uret',
    cevap: saatDurusNedenleriCevabi,
    isle: ({ db }) => servis.durusNedenleri(db),
  }),
  // Üstlenme (karar 79 a): yalnız üstlenir, kapatmaz; saat belirteci bunun için de oturum modülünde ayrıca açılır.
  uc({
    yontem: 'POST',
    yol: '/saat/uyarilar/ustlen',
    yetki: 'saat.uyari-ustlen',
    tekrarKorumali: true,
    govde: saatUstlenGovdesi,
    cevap: saatUyarilariCevabi,
    isle: ({ db, kullanici, govde }) => servis.ustlen(db, kullanici, govde.kimlik),
  }),
  // Duruş yazma (onaylı kapsam): saat belirteci bunun için oturum modülünde ayrıca açılır.
  uc({
    yontem: 'POST',
    yol: '/saat/emirler/:id/durdur',
    yetki: 'terminal.uret',
    tekrarKorumali: true,
    parametre: emirParametresi,
    govde: saatDurdurGovdesi,
    cevap: saatEmriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.durdur(db, kullanici, parametre.id, govde.durusNedeniId),
  }),
];
