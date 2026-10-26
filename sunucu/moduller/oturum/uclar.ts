import { uc } from '#cekirdek/uc.ts';
import {
  cikisCevabi, girisCevabi, girisGovdesi, hesapKilidiAcCevabi, hesapKilidiParametresi, hesapKilitleriCevabi, hesapKilitleriSorgusu,
  kendiParolaGovdesi, kendiPinGovdesi, oturumCevabi, parolaCevabi, pinBelirleGovdesi, saatCihaziKapatCevabi, saatCihaziParametresi,
  saatCihazlariCevabi, saatIstegiCevabi, saatIstegiSorCevabi, saatIstegiSorGovdesi, saatOnaylaGovdesi,
  cihazDurumuCevabi, ortakCihazKapatCevabi, ortakCihazKaydetCevabi, ortakCihazKaydetGovdesi, ortakCihazParametresi, ortakCihazlarCevabi,
} from '#paylasilan/sozlesme/oturum.ts';
import { AZAMI_SN, CEREZ_ADI, CIHAZ_CEREZ_SN, CIHAZ_CEREZI } from './kurallar.ts';
import {
  cikisYap, girisYap, hesapKilidiniAc, hesapKilitleri, ilkPiniBelirle, istektekiOturumOzeti, kendiParolasiniDegistir, kendiPininiDegistir,
  oturumKullanicisi, saatCihaziniKapat, saatCihazlari, saatIstegiAc, saatIstegiSor, saatIsteginiOnayla,
  cihazDurumu, ortakCihazKaydet, ortakCihazlar, ortakCihaziKapat,
} from './servis.ts';
import type { Simdi } from './sorgular.ts';

// Saat parametredir ki test giriş beklemesini saat beklemeden sınayabilsin; üretimde null: veritabanı saati.
export function oturumUclari(simdi: () => Simdi = () => null) {
  return [
    uc({
      yontem: 'GET',
      yol: '/oturum',
      yetki: 'acik',
      // Çerezsiz istek veritabanına dokunmaz: veritabanı yokken de giriş ekranı açılabilsin.
      txDisi: true,
      cevap: oturumCevabi,
      isle: async ({ db, kullanici, istek }) => ({
        kullanici: await oturumKullanicisi(db, istek.cerez(CEREZ_ADI), kullanici),
      }),
    }),
    uc({
      yontem: 'POST',
      yol: '/oturum/giris',
      yetki: 'acik',
      govde: girisGovdesi,
      cevap: girisCevabi,
      isle: async ({ db, govde, istek, gunluk }) => {
        const sonuc = await girisYap(db, { ...govde, ip: istek.ip, tarayici: istek.tarayici, gunluk }, simdi());
        if (sonuc.anahtar === null) return { kullanici: null, pinBelirlenecek: true as const };
        istek.cerezYaz(CEREZ_ADI, sonuc.anahtar, AZAMI_SN);
        return { kullanici: sonuc.kullanici };
      },
    }),
    uc({
      yontem: 'POST',
      yol: '/oturum/pin-belirle',
      yetki: 'acik',
      govde: pinBelirleGovdesi,
      cevap: oturumCevabi,
      isle: async ({ db, govde, istek, gunluk }) => {
        const { anahtar, kullanici } = await ilkPiniBelirle(db, { ...govde, ip: istek.ip, tarayici: istek.tarayici, gunluk }, simdi());
        istek.cerezYaz(CEREZ_ADI, anahtar, AZAMI_SN);
        return { kullanici };
      },
    }),
    uc({
      yontem: 'POST',
      yol: '/hesabim/parola-degistir',
      yetki: 'oturum',
      govde: kendiParolaGovdesi,
      cevap: parolaCevabi,
      isle: async ({ db, kullanici, govde, istek, gunluk }) => {
        await kendiParolasiniDegistir(
          db,
          kullanici.id,
          { ...govde, ip: istek.ip, oturumOzeti: istektekiOturumOzeti(istek), gunluk },
          simdi(),
        );
        return { tamam: true as const };
      },
    }),
    // Hesap kilitleri rol yönetenindir (kullanıcı kararı, 14.10.2026): ayrı güvenlik sayfası gelene dek yeni işlem açılmaz.
    uc({
      yontem: 'GET',
      yol: '/oturum/kilitler',
      yetki: 'kisiler.rol-yonet',
      sorgu: hesapKilitleriSorgusu,
      cevap: hesapKilitleriCevabi,
      isle: ({ db, sorgu }) => hesapKilitleri(db, sorgu, simdi()),
    }),
    // Açma durum komutudur: yinelenen istek açacak kilit bulamaz, 404 alır; tekrar koruması gerekmez.
    uc({
      yontem: 'POST',
      yol: '/oturum/kilitler/:id/ac',
      yetki: 'kisiler.rol-yonet',
      parametre: hesapKilidiParametresi,
      cevap: hesapKilidiAcCevabi,
      isle: ({ db, kullanici, parametre }) => hesapKilidiniAc(db, parametre.id, kullanici.id, simdi()),
    }),
    uc({
      yontem: 'POST',
      yol: '/hesabim/pin-degistir',
      yetki: 'oturum',
      govde: kendiPinGovdesi,
      cevap: parolaCevabi,
      isle: async ({ db, kullanici, govde, istek, gunluk }) => {
        await kendiPininiDegistir(
          db,
          kullanici.id,
          { ...govde, ip: istek.ip, oturumOzeti: istektekiOturumOzeti(istek), gunluk },
          simdi(),
        );
        return { tamam: true as const };
      },
    }),
    // Akıllı saat (kart #1632). Saatin oturumu yoktur: isteği açma ve sorma oturumsuzdur, onay oturumu açık kişinindir.
    // Kişi kendi saatini, rol yöneten herkesinkini kapatır (hesap kilitleriyle aynı yetki).
    uc({
      yontem: 'POST',
      yol: '/oturum/saat-istegi',
      yetki: 'acik',
      cevap: saatIstegiCevabi,
      isle: ({ db, istek }) => saatIstegiAc(db, istek.ip),
    }),
    uc({
      yontem: 'POST',
      yol: '/oturum/saat-istegi/sor',
      yetki: 'acik',
      govde: saatIstegiSorGovdesi,
      cevap: saatIstegiSorCevabi,
      isle: async ({ db, govde, istek, gunluk }) => {
        const s = await saatIstegiSor(db, { istek: govde.istek, ip: istek.ip, gunluk }, simdi());
        return s.durum === 'onaylandi' ? { durum: s.durum, belirtec: s.belirtec, son: s.son, kisi: { ad: s.kullanici.ad } } : s;
      },
    }),
    uc({
      yontem: 'POST',
      yol: '/hesabim/saat-onayla',
      yetki: 'oturum',
      govde: saatOnaylaGovdesi,
      cevap: saatCihaziKapatCevabi,
      isle: async ({ db, kullanici, govde, istek, gunluk }) => {
        await saatIsteginiOnayla(db, kullanici.id, { kod: govde.kod, ip: istek.ip, gunluk }, simdi());
        return { tamam: true as const };
      },
    }),
    uc({
      yontem: 'GET',
      yol: '/hesabim/saat-cihazlari',
      yetki: 'oturum',
      cevap: saatCihazlariCevabi,
      isle: async ({ db, kullanici }) => ({ cihazlar: await saatCihazlari(db, kullanici.id) }),
    }),
    uc({
      yontem: 'POST',
      yol: '/hesabim/saat-cihazlari/:id/kapat',
      yetki: 'oturum',
      parametre: saatCihaziParametresi,
      cevap: saatCihaziKapatCevabi,
      isle: async ({ db, kullanici, parametre }) => {
        await saatCihaziniKapat(db, parametre.id, kullanici.id, kullanici.id);
        return { tamam: true as const };
      },
    }),
    uc({
      yontem: 'GET',
      yol: '/oturum/saat-cihazlari',
      yetki: 'kisiler.rol-yonet',
      cevap: saatCihazlariCevabi,
      isle: async ({ db }) => ({ cihazlar: await saatCihazlari(db, null) }),
    }),
    uc({
      yontem: 'POST',
      yol: '/oturum/saat-cihazlari/:id/kapat',
      yetki: 'kisiler.rol-yonet',
      parametre: saatCihaziParametresi,
      cevap: saatCihaziKapatCevabi,
      isle: async ({ db, kullanici, parametre }) => {
        await saatCihaziniKapat(db, parametre.id, kullanici.id, null);
        return { tamam: true as const };
      },
    }),
    // Ortak cihaz (kart #739, karar 738 a). Cihaz çerezi oturum çerezinden ayrıdır ve çıkışta kalır; ortak cihazda Arkon dosyaları
    // çıkışta silinmez, kayıtsız cihaz kalıcı veri tutmaz. Durum her oturumdaki kişiye açıktır: istemci yerel depolama kipini buna göre seçer.
    uc({
      yontem: 'GET',
      yol: '/oturum/cihaz',
      yetki: 'oturum',
      cevap: cihazDurumuCevabi,
      isle: async ({ db, istek }) => {
        const belirtec = istek.cerez(CIHAZ_CEREZI);
        const { bayatCerez, ...durum } = await cihazDurumu(db, belirtec);
        if (bayatCerez) istek.cerezSil(CIHAZ_CEREZI);
        // Kullanılan cihazın çerezi tazelenir: tarayıcının çerez ömrü dolup cihaz kendiliğinden kişisele dönmesin.
        else if (durum.ortak && belirtec !== null) istek.cerezYaz(CIHAZ_CEREZI, belirtec, CIHAZ_CEREZ_SN);
        return durum;
      },
    }),
    uc({
      yontem: 'GET',
      yol: '/oturum/ortak-cihazlar',
      yetki: 'oturum.ortak-cihaz',
      cevap: ortakCihazlarCevabi,
      isle: async ({ db, istek }) => ({ cihazlar: await ortakCihazlar(db, istek.cerez(CIHAZ_CEREZI)) }),
    }),
    uc({
      yontem: 'POST',
      yol: '/oturum/ortak-cihazlar',
      yetki: 'oturum.ortak-cihaz',
      govde: ortakCihazKaydetGovdesi,
      cevap: ortakCihazKaydetCevabi,
      isle: async ({ db, kullanici, govde, istek }) => {
        const { cihaz, belirtec } = await ortakCihazKaydet(db, kullanici.id, govde.ad, istek.cerez(CIHAZ_CEREZI));
        istek.cerezYaz(CIHAZ_CEREZI, belirtec, CIHAZ_CEREZ_SN);
        return { cihaz };
      },
    }),
    // İptal durum komutudur: yinelenen istek açık cihaz bulamaz, 404 alır.
    uc({
      yontem: 'POST',
      yol: '/oturum/ortak-cihazlar/:id/kapat',
      yetki: 'oturum.ortak-cihaz',
      parametre: ortakCihazParametresi,
      cevap: ortakCihazKapatCevabi,
      isle: async ({ db, kullanici, parametre, istek }) => {
        if (await ortakCihaziKapat(db, parametre.id, kullanici.id, istek.cerez(CIHAZ_CEREZI))) istek.cerezSil(CIHAZ_CEREZI);
        return { tamam: true as const };
      },
    }),
    uc({
      yontem: 'POST',
      yol: '/oturum/cikis',
      yetki: 'acik',
      cevap: cikisCevabi,
      isle: async ({ db, istek }) => {
        await cikisYap(db, istek.cerez(CEREZ_ADI));
        istek.cerezSil(CEREZ_ADI);
        return undefined;
      },
    }),
  ];
}

export const uclar = oturumUclari();
