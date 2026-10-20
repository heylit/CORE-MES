import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  ayarGovdesi, bedelAyari, bedelAyariGovdesi, canliYerlesimCevabi, canliYerlesimSorgusu, canliyaAlGovdesi, musteriSecenekleriCevabi, musteriSecenekleriSorgusu, degisiklikParametresi, hizliGovdesi, isEmriParametresi, karsilastirmaCevabi, kuyrukGovdesi, motorYerlesimiCevabi, kuyrukYazCevabi, kuyrukYazGovdesi, onizleSorgusu, onizlemeCevabi,
  planCevabi, planSorgusu, planSurumCevabi,
  senaryoBilgiGovdesi, senaryoGovdesi, senaryoParametresi, senaryoSurumGovdesi, senaryolarCevabi, siparisBandiCevabi, siparisCarpaniCevabi, siparisCarpaniGovdesi, siparisParametresi,
  siralaGovdesi, taslakGovdesi, tasiGovdesi,
  yerlestirGovdesi,
} from '#paylasilan/sozlesme/plan.ts';
import * as servis from './servis.ts';

// 237 a: plan öncelik ayarlarını ve sipariş çarpanını planı yazan, bedel ayarını yapan ya da fiyatı gören okur; gerekçe ticari bilgi taşır.
const PLAN_BEDELI_OKUR = { biri: ['plan.yaz', 'plan.bedel-ayari', 'siparisler.fiyat-oku'] } as const;

// Her yazma adından belli ayrı bir uçtur (genel kaydet yok). Planlama işlemleri taslağa yazar (P6); taslak verilmezse açılır.
// 280 a: planı, karşılaştırmayı, canlı yerleşimi ve senaryoları planı gören ya da yazan okur. Sürüm ve menü sayaçları oturumludur
// (kabuk her rolde çağırır); sayaçlar planı göremeyene boş gelir.
const PLAN_OKUR = { biri: ['plan.oku', 'plan.yaz'] } as const;

export const uclar = [
  uc({ yontem: 'GET', yol: '/plan', yetki: PLAN_OKUR, sorgu: planSorgusu, cevap: planCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.plan(db, kullanici, sorgu.taslak) }),
  uc({ yontem: 'GET', yol: '/plan/karsilastir', yetki: PLAN_OKUR, sorgu: planSorgusu, cevap: karsilastirmaCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.karsilastir(db, kullanici, sorgu.taslak) }),
  // 220 a: ekranın çizdiği motor yerleşimi; yazmaz. Plan ekranını açan (Reçete ve Rota sayfası) ya da plan yazan okur (232 a).
  uc({ yontem: 'GET', yol: '/plan/motor-yerlesimi', yetki: { biri: ['sayfa.recete-rota', 'plan.yaz'] }, sorgu: planSorgusu, cevap: motorYerlesimiCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.motorYerlesimi(db, kullanici, sorgu.taslak) }),
  uc({ yontem: 'GET', yol: '/plan/canli-yerlesim', yetki: PLAN_OKUR, sorgu: canliYerlesimSorgusu, cevap: canliYerlesimCevabi,
    isle: ({ db, sorgu }) => servis.canliYerlesim(db, sorgu.isEmirleri) }),
  uc({ yontem: 'GET', yol: '/plan/surum', yetki: 'oturum', cevap: planSurumCevabi, isle: ({ db }) => servis.canliSurum(db) }),
  uc({ yontem: 'GET', yol: '/plan/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi,
    isle: ({ db, kullanici }) => servis.menuSayaclari(db, kullanici) }),
  uc({ yontem: 'POST', yol: '/plan/oner', yetki: 'plan.yaz', tekrarKorumali: true, govde: taslakGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.oner(db, kullanici, govde.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/yerlestir', yetki: 'plan.yaz', tekrarKorumali: true, govde: yerlestirGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.yerlestir(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/plan/is-emirleri/:id/tasi', yetki: 'plan.yaz', tekrarKorumali: true, parametre: isEmriParametresi, govde: tasiGovdesi,
    cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.tasi(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/plan/is-emirleri/:id/kaldir', yetki: 'plan.yaz', tekrarKorumali: true, parametre: isEmriParametresi, govde: taslakGovdesi,
    cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.kaldir(db, kullanici, parametre.id, govde.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/is-emirleri/:id/kilitle', yetki: 'plan.kilitle', tekrarKorumali: true, parametre: isEmriParametresi,
    govde: taslakGovdesi, cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.kilit(db, kullanici, parametre.id, govde.taslak, true) }),
  uc({ yontem: 'POST', yol: '/plan/is-emirleri/:id/kilidi-ac', yetki: 'plan.kilitle', tekrarKorumali: true, parametre: isEmriParametresi,
    govde: taslakGovdesi, cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.kilit(db, kullanici, parametre.id, govde.taslak, false) }),
  uc({ yontem: 'POST', yol: '/plan/is-emirleri/:id/dondurmayi-kaldir', yetki: 'plan.kilitle', tekrarKorumali: true, parametre: isEmriParametresi,
    govde: taslakGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.dondurmayiKaldir(db, kullanici, parametre.id, govde.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/kuyruk/sirala', yetki: 'plan.yaz', tekrarKorumali: true, govde: siralaGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.sirala(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/plan/kuyruk/plan-sirasina-don', yetki: 'plan.yaz', tekrarKorumali: true, govde: kuyrukGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.planSirasinaDon(db, kullanici, govde) }),
  // Emir önizlemesi yazmaz; yeni emri açabilen ya da planı yazabilen görür (emir rotanın emre kopyalama ucuyla açılır).
  uc({ yontem: 'GET', yol: '/plan/onizle', yetki: { biri: ['rota.emre-kopyala', 'plan.yaz'] }, sorgu: onizleSorgusu, cevap: onizlemeCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.onizle(db, kullanici, {
      taslak: sorgu.taslak ?? null, revizyonId: sorgu.revizyonId, adet: sorgu.adet, oncelik: sorgu.oncelik,
      baslangic: sorgu.baslangic ?? null, teslim: sorgu.teslim ?? null,
    }) }),
  uc({ yontem: 'POST', yol: '/plan/dondur', yetki: 'plan.kilitle', tekrarKorumali: true, govde: taslakGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.dondur(db, kullanici, govde.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/dondurmayi-kaldir', yetki: 'plan.kilitle', tekrarKorumali: true, govde: taslakGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.dondurmayiKaldir(db, kullanici, null, govde.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/elle-siralari-sil', yetki: 'plan.yaz', tekrarKorumali: true, govde: taslakGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.elleSiralariSil(db, kullanici, govde.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/ayar', yetki: 'plan.yaz', tekrarKorumali: true, govde: ayarGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde }) => servis.ayarYaz(db, kullanici, govde.taslak, govde.ayar) }),
  // Bedel ayarı (209 a): değiştirmek yalnız plan.bedel-ayari (210 a, müdür); bütün siparişlerin sırasını değiştirir. Okuma ticari bilgidir (237 a).
  uc({ yontem: 'GET', yol: '/plan/bedel-ayari', yetki: PLAN_BEDELI_OKUR, cevap: bedelAyari, isle: ({ db }) => servis.bedelAyari(db) }),
  uc({ yontem: 'POST', yol: '/plan/bedel-ayari', yetki: 'plan.bedel-ayari', tekrarKorumali: true, govde: bedelAyariGovdesi, cevap: bedelAyari,
    isle: ({ db, kullanici, govde }) => servis.bedelAyariYaz(db, kullanici, govde) }),
  // Elle çarpan (195 a): plan.yaz 2'ye, siparisler.onayla 3'e kadar; sınırı servis denetler. Taslağa değil siparişe yazılır.
  uc({ yontem: 'GET', yol: '/plan/siparisler/:id/carpan', yetki: PLAN_BEDELI_OKUR, parametre: siparisParametresi, cevap: siparisCarpaniCevabi,
    isle: ({ db, parametre }) => servis.siparisCarpani(db, parametre.id) }),
  // 306 a: çarpanın düştüğü bant; bedel TL olduğundan çarpanla aynı okurlar.
  uc({ yontem: 'GET', yol: '/plan/siparisler/:id/bant', yetki: PLAN_BEDELI_OKUR, parametre: siparisParametresi, cevap: siparisBandiCevabi,
    isle: ({ db, kullanici, parametre }) => servis.siparisBandi(db, kullanici, parametre.id) }),
  uc({ yontem: 'POST', yol: '/plan/siparisler/:id/carpan', yetki: { biri: ['plan.yaz', 'siparisler.onayla'] }, tekrarKorumali: true, parametre: siparisParametresi,
    govde: siparisCarpaniGovdesi, cevap: siparisCarpaniCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.siparisCarpaniYaz(db, kullanici, parametre.id, govde) }),
  // Reçete ve Rota motorunun hesapladığı kuyruklar (kart #1186): ayar ve kuyruklar tek komutla taslağa, istenirse canlıya.
  uc({ yontem: 'POST', yol: '/plan/kuyruklari-yaz', yetki: 'plan.yaz', tekrarKorumali: true, govde: kuyrukYazGovdesi, cevap: kuyrukYazCevabi,
    isle: ({ db, kullanici, govde }) => servis.kuyruklariYaz(db, kullanici, govde) }),
  // Stüdyo (P4, P6).
  uc({ yontem: 'GET', yol: '/plan/senaryolar', yetki: PLAN_OKUR, cevap: senaryolarCevabi, isle: ({ db, kullanici }) => servis.senaryolar(db, kullanici) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar', yetki: 'plan.studyo', tekrarKorumali: true, govde: senaryoGovdesi, cevap: senaryolarCevabi,
    isle: ({ db, kullanici, govde }) => servis.senaryoAc(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/cogalt', yetki: 'plan.studyo', tekrarKorumali: true, parametre: senaryoParametresi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre }) => servis.senaryoCogalt(db, kullanici, parametre.id) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/bilgi', yetki: 'plan.studyo', parametre: senaryoParametresi, govde: senaryoBilgiGovdesi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.senaryoBilgi(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/degisiklikler/:degisiklikId/kaldir', yetki: 'plan.studyo', parametre: degisiklikParametresi,
    govde: senaryoSurumGovdesi, cevap: senaryolarCevabi,
    isle: ({ db, kullanici, parametre, govde }) => servis.degisiklikKaldir(db, kullanici, parametre.id, parametre.degisiklikId, govde.surum) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/degisiklikleri-at', yetki: 'plan.studyo', parametre: senaryoParametresi, govde: senaryoSurumGovdesi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.degisiklikleriAt(db, kullanici, parametre.id, govde.surum) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/canliyi-al', yetki: 'plan.studyo', parametre: senaryoParametresi, govde: senaryoSurumGovdesi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.canlidakileriAl(db, kullanici, parametre.id, govde.surum) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/hizli', yetki: 'plan.studyo', tekrarKorumali: true, parametre: senaryoParametresi, govde: hizliGovdesi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.hizliDene(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/canliya-al', yetki: 'plan.canliya-al', tekrarKorumali: true, parametre: senaryoParametresi,
    govde: canliyaAlGovdesi, cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.canliyaAl(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'GET', yol: '/plan/musteri-secenekleri', yetki: 'plan.canliya-al', sorgu: musteriSecenekleriSorgusu, cevap: musteriSecenekleriCevabi,
    isle: ({ db, sorgu }) => servis.musteriSecenekleri(db, sorgu.ara) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/vazgec', yetki: 'plan.studyo', parametre: senaryoParametresi, govde: senaryoSurumGovdesi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.vazgec(db, kullanici, parametre.id, govde.surum) }),
];
