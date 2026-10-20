import { uc } from '#cekirdek/uc.ts';
import { birimSetiCevabi, birimSetiEkleGovdesi, birimSetiParametresi, birimSetleriCevabi, logoHazirlikCevabi, logoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import { ortamKoprusu, ortamOzeti } from './baglanti.ts';
import { birimSetiEkle, birimSetiKaldir, birimSetleriniGetir, hazirlik, kontrol } from './servis.ts';

// Birim seti listesi: malzemelerin "Logo gönderimi" sayfası karşılık seçerken okur (LB9 a); elle ekleme ve kaldırma yalnız yöneticide (LB11 a).
export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/logo/birim-setleri',
    yetki: { biri: ['sayfa.malzemeler', 'logo.birim-seti-yaz'] },
    cevap: birimSetleriCevabi,
    isle: ({ db }) => birimSetleriniGetir(db, ortamKoprusu),
  }),
  uc({
    yontem: 'POST',
    yol: '/logo/birim-setleri/ekle',
    yetki: 'logo.birim-seti-yaz',
    govde: birimSetiEkleGovdesi,
    cevap: birimSetiCevabi,
    isle: ({ db, kullanici, govde }) => birimSetiEkle(db, kullanici.id, govde.kod, govde.ad),
  }),
  uc({
    yontem: 'POST',
    yol: '/logo/birim-setleri/:kod/kaldir',
    yetki: 'logo.birim-seti-yaz',
    parametre: birimSetiParametresi,
    cevap: birimSetiCevabi,
    isle: ({ db, parametre }) => birimSetiKaldir(db, parametre.kod),
  }),
  // Hazırlık ve canlı kontrol yalnız sistem ayrıntısını görene (yönetici): adres ve ayar durumu gösterilir, anahtar gösterilmez.
  uc({
    yontem: 'GET',
    yol: '/logo/hazirlik',
    yetki: 'saglik.ayrinti-oku',
    cevap: logoHazirlikCevabi,
    isle: ({ db }) => hazirlik(db, ortamKoprusu, ortamOzeti),
  }),
  // Köprüye yalnız GET gider. Transaction dışında koşar: köprü 60 sn'ye kadar cevap bekletebilir, okuma transaction'ı açık kalmasın.
  uc({
    yontem: 'GET',
    yol: '/logo/hazirlik/kontrol',
    yetki: 'saglik.ayrinti-oku',
    txDisi: true,
    cevap: logoKontrolCevabi,
    isle: () => kontrol(ortamKoprusu),
  }),
];
