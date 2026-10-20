import { ikiliCevap, uc } from '#cekirdek/uc.ts';
import {
  dosyaParametresi, dosyaParcasiCevabi, dosyaParcasiGovdesi, eksiklerCevabi, eksiklerGovdesi,
} from '#paylasilan/sozlesme/dosya.ts';
import * as servis from './servis.ts';

// Yükleme her oturuma açıktır; kotalar kişi ve depo başınadır. İçerik denetim kaydına girmez (DS9 a): yalnız boyut ve özet.
export const uclar = [
  uc({
    yontem: 'POST',
    yol: '/dosyalar/eksikler',
    yetki: 'oturum',
    denetim: 'govdesiz',
    govde: eksiklerGovdesi,
    cevap: eksiklerCevabi,
    isle: async ({ db, kullanici, govde }) => ({ eksikler: await servis.eksikDosyalar(db, kullanici, govde.ozetler) }),
  }),
  uc({
    yontem: 'POST',
    yol: '/dosyalar/:ozet/parca',
    yetki: 'oturum',
    denetim: 'govdesiz',
    parametre: dosyaParametresi,
    govde: dosyaParcasiGovdesi,
    cevap: dosyaParcasiCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ tamam: await servis.dosyaParcasi(db, kullanici, parametre.ozet, govde) }),
  }),
  // Kişinin kendi yüklediği, henüz bağlanmamış dosya (ADR 0007 madde 4: kişinin kendi kaydı).
  uc({
    yontem: 'GET',
    yol: '/dosyalar/:ozet',
    yetki: 'oturum',
    parametre: dosyaParametresi,
    cevap: ikiliCevap,
    isle: ({ db, kullanici, parametre }) => servis.kendiDosyam(db, kullanici, parametre.ozet),
  }),
];
