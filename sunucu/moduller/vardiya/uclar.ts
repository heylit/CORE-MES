import { uc } from '#cekirdek/uc.ts';
import {
  calismaTakvimiCevabi, calismaTakvimiSorgusu, fazlaMesaiCevabi, fazlaMesaiGovdesi, fazlaMesaiGuncelleGovdesi, fazlaMesaiIptalGovdesi, fazlaMesaiListeCevabi, fazlaMesaiListeSorgusu,
  fazlaMesaiParametresi, gunlukMesaiCevabi, gunlukMesaiSorgusu, haftaUygulaGovdesi, kisiParametresi, kisiVardiyasiGovdesi, kisiVardiyasiTopluGovdesi, matrisGovdesi, matrisKopyalaGovdesi, matrisTopluGovdesi, planliDurusCevabi,
  planliDurusGovdesi, planliDurusGuncelleGovdesi, planliDurusKaldirCevabi, planliDurusKaldirGovdesi, planliDurusListeCevabi, planliDurusListeSorgusu, planliDurusParametresi,
  resmiTatilGovdesi, takvimCevabi, takvimGunuGovdesi, vardiyaPersoneliCevabi, tarihParametresi, vardiyaGovdesi, vardiyaGuncelleGovdesi,
  vardiyaParametresi,
} from '#paylasilan/sozlesme/vardiya.ts';
import * as servis from './servis.ts';

// Okuma oturumla açıktır: takvimi plan, rota Kaynaklar ekranı ve operatör ekranı okur; kişi takvimi izin taşır ve VR-27 ile süzülür. Yazmalar `vardiya.yaz`; geçmiş tarih servis içinde
// `vardiya.gecmis-yaz` ister (uç tek işlem isteyebilir). Yazma komutları takvimin tamamını döner: ekran tek sorguyla yenilenir.
export const uclar = [
  uc({ yontem: 'GET', yol: '/vardiya-takvimi', yetki: 'oturum', cevap: takvimCevabi, isle: ({ db }) => servis.takvim(db) }),
  uc({
    yontem: 'GET', yol: '/calisma-takvimi', yetki: 'oturum', sorgu: calismaTakvimiSorgusu, cevap: calismaTakvimiCevabi,
    isle: async ({ db, kullanici, sorgu }) => ({
      takvim: await servis.kaynakTakvimiOku(db, kullanici, { tur: sorgu.tur, id: sorgu.id }, { baslangic: sorgu.baslangic, bitis: sorgu.bitis }),
    }),
  }),
  // Günlük Mesai sayfası (sayfa.mesai) kişi adlarıyla günün planlı çalışmasını okur.
  uc({
    yontem: 'GET', yol: '/gunluk-mesai', yetki: { biri: ['sayfa.mesai'] }, sorgu: gunlukMesaiSorgusu, cevap: gunlukMesaiCevabi,
    isle: ({ db, sorgu }) => servis.gunlukMesai(db, sorgu.tarih),
  }),
  // Kişi adları döner: yalnız vardiya sayfasını gören ya da vardiya yazan okur.
  uc({
    yontem: 'GET', yol: '/vardiya-personeli', yetki: { biri: ['sayfa.vardiya', 'vardiya.yaz'] }, cevap: vardiyaPersoneliCevabi,
    isle: ({ db }) => servis.vardiyaPersoneli(db),
  }),
  uc({
    yontem: 'POST', yol: '/vardiyalar', yetki: 'vardiya.yaz', tekrarKorumali: true, govde: vardiyaGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.vardiyaEkle(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/vardiyalar/:id/guncelle', yetki: 'vardiya.yaz', parametre: vardiyaParametresi, govde: vardiyaGuncelleGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.vardiyaGuncelle(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST', yol: '/vardiya-matrisi/degistir', yetki: 'vardiya.yaz', govde: matrisGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.matrisYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/vardiya-matrisi/hafta-uygula', yetki: 'vardiya.yaz', govde: haftaUygulaGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.haftaUygula(db, kullanici, govde.kaynakIsMerkeziId),
  }),
  // Toplu komutlar (kart #1305): tek transaction, hepsi ya da hiçbiri; kapsam dışı kayıtlar 403 ayrıntısında döner.
  uc({
    yontem: 'POST', yol: '/vardiya-matrisi/toplu-yaz', yetki: 'vardiya.yaz', govde: matrisTopluGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.matrisTopluYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/vardiya-matrisi/kopyala', yetki: 'vardiya.yaz', govde: matrisKopyalaGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.matrisKopyala(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/takvim-gunleri', yetki: 'vardiya.yaz', govde: takvimGunuGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.gunYaz(db, kullanici, govde),
  }),
  uc({
    yontem: 'POST', yol: '/takvim-gunleri/:tarih/kaldir', yetki: 'vardiya.yaz', parametre: tarihParametresi, cevap: takvimCevabi,
    isle: ({ db, kullanici, parametre }) => servis.gunSil(db, kullanici, parametre.tarih),
  }),
  uc({
    yontem: 'POST', yol: '/takvim-gunleri/resmi-tatiller', yetki: 'vardiya.yaz', govde: resmiTatilGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.resmiTatilleriEkle(db, kullanici, govde.yil),
  }),
  uc({
    yontem: 'POST', yol: '/takvim-gunleri/temizle', yetki: 'vardiya.yaz', cevap: takvimCevabi,
    isle: ({ db, kullanici }) => servis.tatilleriTemizle(db, kullanici),
  }),
  uc({
    yontem: 'POST', yol: '/kisi-vardiyalari/:kisiId/belirle', yetki: 'vardiya.yaz', parametre: kisiParametresi, govde: kisiVardiyasiGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.kisiVardiyasiBelirle(db, kullanici, parametre.kisiId, govde),
  }),
  uc({
    yontem: 'POST', yol: '/kisi-vardiyalari/toplu-belirle', yetki: 'vardiya.yaz', govde: kisiVardiyasiTopluGovdesi, cevap: takvimCevabi,
    isle: ({ db, kullanici, govde }) => servis.kisiVardiyasiTopluBelirle(db, kullanici, govde),
  }),
  // Planlı duruş (kart #519): okuma oturumla açık (takvim gibi); yazma `vardiya.durus-yaz`, kapsam ve kurallar serviste.
  uc({
    yontem: 'GET', yol: '/planli-duruslar', yetki: 'oturum', sorgu: planliDurusListeSorgusu, cevap: planliDurusListeCevabi,
    isle: ({ db, sorgu }) => servis.planliDurusListesi(db, sorgu),
  }),
  uc({
    yontem: 'POST', yol: '/planli-duruslar', yetki: 'vardiya.durus-yaz', tekrarKorumali: true, govde: planliDurusGovdesi, cevap: planliDurusCevabi,
    isle: async ({ db, kullanici, govde }) => ({ durus: await servis.planliDurusOlustur(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/planli-duruslar/:id/guncelle', yetki: 'vardiya.durus-yaz', parametre: planliDurusParametresi, govde: planliDurusGuncelleGovdesi,
    cevap: planliDurusCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ durus: await servis.planliDurusDegistir(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/planli-duruslar/:id/kaldir', yetki: 'vardiya.durus-yaz', parametre: planliDurusParametresi, govde: planliDurusKaldirGovdesi,
    cevap: planliDurusKaldirCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => {
      await servis.planliDurusKaldir(db, kullanici, parametre.id, govde.surum);
      return { kaldirildi: true as const };
    },
  }),
  // Fazla mesai planı (kart #1324): kişi listesi döndüğü için okuma vardiya sayfasını göreninde; yazma `vardiya.yaz`, kapsam ve geçmiş serviste.
  uc({
    yontem: 'GET', yol: '/fazla-mesai', yetki: { biri: ['sayfa.vardiya', 'vardiya.yaz'] }, sorgu: fazlaMesaiListeSorgusu, cevap: fazlaMesaiListeCevabi,
    isle: async ({ db, sorgu }) => ({ fazlaMesailer: await servis.fazlaMesaiListesi(db, sorgu.baslangic, sorgu.bitis) }),
  }),
  uc({
    yontem: 'POST', yol: '/fazla-mesai', yetki: 'vardiya.yaz', tekrarKorumali: true, govde: fazlaMesaiGovdesi, cevap: fazlaMesaiCevabi,
    isle: async ({ db, kullanici, govde }) => ({ fazlaMesai: await servis.fazlaMesaiOlustur(db, kullanici, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/fazla-mesai/:id/guncelle', yetki: 'vardiya.yaz', parametre: fazlaMesaiParametresi, govde: fazlaMesaiGuncelleGovdesi, cevap: fazlaMesaiCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ fazlaMesai: await servis.fazlaMesaiDegistir(db, kullanici, parametre.id, govde) }),
  }),
  uc({
    yontem: 'POST', yol: '/fazla-mesai/:id/iptal', yetki: 'vardiya.yaz', parametre: fazlaMesaiParametresi, govde: fazlaMesaiIptalGovdesi, cevap: fazlaMesaiCevabi,
    isle: async ({ db, kullanici, parametre, govde }) => ({ fazlaMesai: await servis.fazlaMesaiIptal(db, kullanici, parametre.id, govde.surum) }),
  }),
];
