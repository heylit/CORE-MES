import { uc } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  eksikBilgiOzetiCevabi, hesapGovdesi, kisiSecimCevabi, kisiSecimSorgusu, kisiDuzenleGovdesi, kisiEkIslemleriCevabi, kisiGovdesi, kisiParametresi, kisiSemasi, kisilerCevabi, parolaGovdesi, rolGovdesi,
  pinVerGovdesi, rolIslemiGovdesi, rolIslemleriCevabi, rolParametresi, rollerCevabi, surumGovdesi, tamamCevabi,
} from '#paylasilan/sozlesme/kisiler.ts';
import {
  baskasinaPinVer, baskasininParolasiniDegistir, eksikBilgiOzeti, hesapAc, kisiAktifYap, kisiDuzenle, kisiEkIslemiDegistir, kisiEkIslemleriGetir, kisiEkleGetir, kisileriGetir, kisiSecimAra,
  kisiPasifeAl, rolAl, rolAta, rolIslemiDegistir, rolIslemleriGetir, rolleriGetir,
} from './servis.ts';

// Ortak kişi seçicisini çağıran modüller (karar 1321 b): kişiler, bugün kişi seçen istasyonlar (atama), mesaj ve Arkon.
// Seçiciyi alan modül (A5) işlemini buraya ekler.
const SECIM_OKUMA = { biri: ['kisiler.oku', 'istasyonlar.yaz', 'sayfa.mesaj', 'sayfa.arkon'] } as const;

const bayrakGorur = (kullanici: Kullanici): boolean => kullanici.islemler.includes('kisiler.rol-yonet');

export const uclar = [
  // Ortak seçici (kart #1320).
  uc({
    yontem: 'GET',
    yol: '/kisiler/secim-ara',
    yetki: SECIM_OKUMA,
    sorgu: kisiSecimSorgusu,
    cevap: kisiSecimCevabi,
    isle: ({ db, sorgu }) => kisiSecimAra(db, sorgu),
  }),
  uc({
    yontem: 'GET',
    yol: '/kisiler',
    yetki: 'kisiler.oku',
    cevap: kisilerCevabi,
    isle: async ({ db, kullanici }) => ({ kisiler: await kisileriGetir(db, bayrakGorur(kullanici)) }),
  }),
  // Ana sayfa kartı: listeyi okuyabilen sayısını da okur.
  uc({
    yontem: 'GET',
    yol: '/kisiler/eksik-bilgi-ozeti',
    yetki: 'kisiler.oku',
    cevap: eksikBilgiOzetiCevabi,
    isle: ({ db }) => eksikBilgiOzeti(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/roller',
    yetki: 'kisiler.oku',
    cevap: rollerCevabi,
    isle: async ({ db, kullanici }) => ({ roller: await rolleriGetir(db, bayrakGorur(kullanici)) }),
  }),
  uc({
    yontem: 'GET',
    yol: '/rol-islemleri',
    // Matris bütün yetkili rolü ele verir; onu yalnız rol yöneten görür (kullanıcı kararı 11.10.2026, kart #586).
    yetki: 'kisiler.rol-yonet',
    cevap: rolIslemleriCevabi,
    isle: ({ db, kullanici }) => rolIslemleriGetir(db, bayrakGorur(kullanici)),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler',
    yetki: 'kisiler.yaz',
    govde: kisiGovdesi,
    cevap: kisiSemasi,
    // Çift tıklama ya da cevabı yitirilen yeniden gönderim ikinci kişiyi açmaz (sicil boşken kısıt tutmaz).
    tekrarKorumali: true,
    isle: ({ db, kullanici, govde }) => kisiEkleGetir(db, govde, bayrakGorur(kullanici)),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/duzenle',
    yetki: 'kisiler.yaz',
    parametre: kisiParametresi,
    govde: kisiDuzenleGovdesi,
    cevap: kisiSemasi,
    isle: ({ db, kullanici, parametre, govde }) =>
      kisiDuzenle(db, kullanici.id, parametre.id, govde, bayrakGorur(kullanici), govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/pasife-al',
    yetki: 'kisiler.yaz',
    parametre: kisiParametresi,
    govde: surumGovdesi,
    cevap: kisiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => kisiPasifeAl(db, kullanici.id, parametre.id, bayrakGorur(kullanici), govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/aktif-yap',
    yetki: 'kisiler.yaz',
    parametre: kisiParametresi,
    govde: surumGovdesi,
    cevap: kisiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => kisiAktifYap(db, kullanici.id, parametre.id, bayrakGorur(kullanici), govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/hesap-ac',
    yetki: 'kisiler.rol-yonet',
    parametre: kisiParametresi,
    govde: hesapGovdesi,
    cevap: kisiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => hesapAc(db, kullanici.id, parametre.id, govde, true, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/parola-degistir',
    yetki: 'kisiler.parola-degistir',
    parametre: kisiParametresi,
    govde: parolaGovdesi,
    cevap: tamamCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await baskasininParolasiniDegistir(db, kullanici.id, parametre.id, govde.yeniParola, govde.surum);
      return { tamam: true as const };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/pin-ver',
    yetki: 'kisiler.parola-degistir',
    parametre: kisiParametresi,
    govde: pinVerGovdesi,
    cevap: tamamCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await baskasinaPinVer(db, kullanici.id, parametre.id, govde.pin, govde.surum);
      return { tamam: true as const };
    },
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/rol-ata',
    yetki: 'kisiler.rol-yonet',
    parametre: kisiParametresi,
    govde: rolGovdesi,
    cevap: kisiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => rolAta(db, kullanici.id, parametre.id, govde.rolId, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/rol-al',
    yetki: 'kisiler.rol-yonet',
    parametre: kisiParametresi,
    govde: rolGovdesi,
    cevap: kisiSemasi,
    isle: ({ db, kullanici, parametre, govde }) => rolAl(db, kullanici.id, parametre.id, govde.rolId, govde.surum),
  }),
  uc({
    yontem: 'POST',
    yol: '/roller/:id/islem-degistir',
    // Uç rol yönetene açıktır; değişikliği yalnız bayraklı kişi yapabilir (kural servis katmanında, kart #684).
    yetki: 'kisiler.rol-yonet',
    parametre: rolParametresi,
    govde: rolIslemiGovdesi,
    cevap: rolIslemleriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => rolIslemiDegistir(db, kullanici.id, parametre.id, govde.islem, govde.verildi),
  }),
  // Kişiye rolünün üstüne ek işlem (kart #1233). Liste kimin neye fiilen sahip olduğunu ele verir; matris gibi yalnız rol yönetene açık.
  uc({
    yontem: 'GET',
    yol: '/kisi-ek-islemleri',
    yetki: 'kisiler.rol-yonet',
    cevap: kisiEkIslemleriCevabi,
    isle: ({ db }) => kisiEkIslemleriGetir(db),
  }),
  uc({
    yontem: 'POST',
    yol: '/kisiler/:id/ek-islem-degistir',
    // Uç rol yönetene açıktır; değişikliği yalnız bayraklı kişi yapar (KS-4, servis katmanında).
    yetki: 'kisiler.rol-yonet',
    parametre: kisiParametresi,
    govde: rolIslemiGovdesi,
    cevap: kisiEkIslemleriCevabi,
    isle: ({ db, kullanici, parametre, govde }) => kisiEkIslemiDegistir(db, kullanici.id, parametre.id, govde.islem, govde.verildi),
  }),
];
