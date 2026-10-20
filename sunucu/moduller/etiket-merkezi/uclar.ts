import { uc } from '#cekirdek/uc.ts';
import {
  basCevabi, basGovdesi, baskilarCevabi, ciktiCevabi, ciktiSorgusu, indirCevabi, indirGovdesi, kayitCiktiCevabi, kayitCiktiSorgusu, sablonParametresi, sablonlarCevabi,
  yaziciAcGovdesi, yaziciGuncelleGovdesi, yaziciParametresi, yaziciSemasi, yazicilarCevabi,
} from '#paylasilan/sozlesme/etiket-merkezi.ts';
import { bas, baskilar, indir, kayitCiktisi, ornekCikti, sablonlar, yaziciAc, yaziciDuzenle, yazicilar } from './servis.ts';

// Örnek değerli önizleme sayfayı görene açıktır; gerçek kayıt, yazıcı ve baskı kaydı ayrı işlemler ister (99 evet).
const OKUMA = { biri: ['sayfa.etiket-merkezi'] } as const;
const YAZICI_OKUMA = { biri: ['etiket-merkezi.oku', 'etiket-merkezi.yazici-yaz'] } as const;

export const uclar = [
  uc({ yontem: 'GET', yol: '/etiket-merkezi/sablonlar', yetki: OKUMA, cevap: sablonlarCevabi, isle: () => sablonlar() }),
  uc({
    yontem: 'GET',
    yol: '/etiket-merkezi/sablonlar/:anahtar/cikti',
    yetki: OKUMA,
    parametre: sablonParametresi,
    sorgu: ciktiSorgusu,
    cevap: ciktiCevabi,
    isle: ({ parametre, sorgu }) => ornekCikti(parametre.anahtar, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/etiket-merkezi/sablonlar/:anahtar/kayit-cikti',
    yetki: 'etiket-merkezi.oku',
    parametre: sablonParametresi,
    sorgu: kayitCiktiSorgusu,
    cevap: kayitCiktiCevabi,
    isle: ({ db, parametre, sorgu: { tur, id, ...secenek } }) => kayitCiktisi(db, parametre.anahtar, { tur, idler: id }, secenek),
  }),
  uc({ yontem: 'GET', yol: '/etiket-merkezi/yazicilar', yetki: YAZICI_OKUMA, cevap: yazicilarCevabi, isle: ({ db }) => yazicilar(db) }),
  uc({
    yontem: 'POST',
    yol: '/etiket-merkezi/yazicilar/ac',
    yetki: 'etiket-merkezi.yazici-yaz',
    govde: yaziciAcGovdesi,
    cevap: yaziciSemasi,
    isle: ({ db, kullanici, govde }) => yaziciAc(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/etiket-merkezi/yazicilar/:id/guncelle',
    yetki: 'etiket-merkezi.yazici-yaz',
    parametre: yaziciParametresi,
    govde: yaziciGuncelleGovdesi,
    cevap: yaziciSemasi,
    isle: ({ db, kullanici, parametre, govde }) => yaziciDuzenle(db, kullanici, parametre.id, govde),
  }),
  // Ağ yinelemesi ikinci baskı açmaz: aynı istek kimliği ilk cevabı döner.
  uc({
    yontem: 'POST',
    yol: '/etiket-merkezi/sablonlar/:anahtar/bas',
    yetki: 'etiket-merkezi.bas',
    tekrarKorumali: true,
    parametre: sablonParametresi,
    govde: basGovdesi,
    cevap: basCevabi,
    isle: ({ db, kullanici, parametre, govde }) => bas(db, kullanici, parametre.anahtar, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/etiket-merkezi/sablonlar/:anahtar/indir',
    yetki: 'etiket-merkezi.bas',
    tekrarKorumali: true,
    parametre: sablonParametresi,
    govde: indirGovdesi,
    cevap: indirCevabi,
    isle: ({ db, kullanici, parametre, govde }) => indir(db, kullanici, parametre.anahtar, govde),
  }),
  uc({ yontem: 'GET', yol: '/etiket-merkezi/baskilar', yetki: 'etiket-merkezi.oku', cevap: baskilarCevabi, isle: ({ db }) => baskilar(db) }),
];
