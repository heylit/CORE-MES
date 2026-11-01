import { uc } from '#cekirdek/uc.ts';
import { ikinciMenuSayacSemasi } from '#paylasilan/ikinci-menu.ts';
import {
  ayarGovdesi, bedelAyari, canliyaAlmaGecmisiCevabi, ekMesaiGovdesi, bedelAyariTaslakGovdesi, geriGonderGovdesi, onayaGonderGovdesi, onaydanCekGovdesi, canliYerlesimCevabi, canliYerlesimSorgusu, canliyaAlCevabi, canliyaAlGovdesi, musteriSecenekleriCevabi, musteriSecenekleriSorgusu, degisiklikParametresi, hizliGovdesi, isEmriParametresi, kuyrukGovdesi, motorUyarilariCevabi, motorYerlesimiCevabi, kuyrukYazCevabi, kuyrukYazGovdesi, onizleSorgusu, onizlemeCevabi, projePlaniCevabi, projePlaniParametresi,
  motorAyariGovdesi, motorAyarlariCevabi, motorKuraliGovdesi, planCevabi, planSorgusu, planSurumCevabi,
  senaryoBilgiGovdesi, senaryoGovdesi, senaryoParametresi, senaryoSurumGovdesi, senaryolarCevabi, siparisCarpaniCevabi, siparisParametresi,
  siralaGovdesi, taslakGovdesi, tasiGovdesi, PLAN_ONAY_KOMUTLARI, mrpIhtiyaciCevabi, planSagligiCevabi, veriSagligiCevabi,
  yerlestirGovdesi,
} from '#paylasilan/sozlesme/plan.ts';
import {
  calismaGeriAlCevabi, calismaGeriAlGovdesi, calismaTaslagiCevabi, calismaTaslagiGovdesi, canliFarkiCevabi, degerlendirmeBaslatCevabi, degerlendirmeDurumuCevabi, degerlendirmeGovdesi,
  degerlendirmeParametresi, durumCevabi, kapasiteCevabi, planlamaCalismasiCevabi, planlamaSilGovdesi, planlamaYazGovdesi, satinAlmaEkiCevabi, tabanVeCanliCevabi,
  taslaktanCalismayaCevabi, taslaktanCalismayaGovdesi, yillikCozBaslatCevabi, yillikCozDurumuCevabi, yillikCozGovdesi, yillikCozParametresi,
} from '#paylasilan/sozlesme/planlama.ts';
import { kayitlarCevabi, silCevabi, yazCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { calismaGeriAl, calismaTaslagi, canliFarki, tabanVeCanli, taslaktanCalismaya } from './calisma-plani.ts';
import { degerlendirmeBaslat, degerlendirmeDurumu } from './degerlendirme.ts';
import { motorAyarlari, motorAyariYaz } from './motor-ayari.ts';
import { mrpIhtiyaci } from './mrp.ts';
import * as planlama from './planlama-servis.ts';
import { planSagligi } from './plan-sagligi.ts';
import { projePlani } from './proje-plani.ts';
import * as servis from './servis.ts';
import { veriSagligi } from './veri-sagligi.ts';
import { yillikCozBaslat, yillikCozDurumu } from './yillik-cozucu.ts';

// 237 a: plan öncelik ayarlarını ve sipariş çarpanını planı yazan, bedel ayarını yapan ya da fiyatı gören okur; gerekçe ticari bilgi taşır.
const PLAN_BEDELI_OKUR = { biri: ['plan.yaz', 'plan.bedel-ayari', 'siparisler.fiyat-oku'] } as const;

// Her yazma adından belli ayrı bir uçtur (genel kaydet yok). Planlama işlemleri taslağa yazar (P6); taslak verilmezse açılır.
// 280 a: planı, karşılaştırmayı, canlı yerleşimi ve senaryoları planı gören ya da yazan okur. Sürüm ve menü sayaçları oturumludur
// (kabuk her rolde çağırır); sayaçlar planı göremeyene boş gelir.
const PLAN_OKUR = { biri: ['plan.oku', 'plan.yaz'] } as const;
// Planlama sayfasının kaynak okumaları (658 b): taşımadan önce Reçete ve Rota'nın okuma uçlarıydı; yetki aynı kalır (genişlemez, daralmaz).
// Reçete ve Rota ekranı da birleşik durumu buradan okur.
const KAYNAK_OKUR = { biri: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'] } as const;
const PLANLAMA_OKUR = 'plan.planlama-oku';
// 933 a: projenin plan ve gerçekleşenini projeyi okuyan görür (Projeler'in okuma yetkisiyle aynı); salt okunur, plan yetkisi istemez.
const PROJEYI_OKUR = { biri: ['sayfa.projeler', 'projeler.oku'] } as const;
// Planlama kayıtlarına yazma (925 a): çalışma anahtarı plan.yaz, öteki anahtarlar recete-rota.yaz ister; ayrımı servis yapar.
const KAYIT_YAZAR = { biri: ['recete-rota.yaz', 'plan.yaz'] } as const;

export const uclar = [
  uc({ yontem: 'GET', yol: '/plan', yetki: PLAN_OKUR, sorgu: planSorgusu, cevap: planCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.plan(db, kullanici, sorgu.taslak) }),
  // 220 a: ekranın çizdiği motor yerleşimi; yazmaz. Plan ekranını açan (Reçete ve Rota sayfası) ya da plan yazan okur (232 a).
  uc({ yontem: 'GET', yol: '/plan/motor-yerlesimi', yetki: { biri: ['sayfa.recete-rota', 'plan.yaz'] }, sorgu: planSorgusu, cevap: motorYerlesimiCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.motorYerlesimi(db, kullanici, sorgu.taslak) }),
  uc({ yontem: 'GET', yol: '/plan/motor-uyarilari', yetki: { biri: ['sayfa.recete-rota', 'plan.yaz'] }, sorgu: planSorgusu, cevap: motorUyarilariCevabi,
    isle: ({ db, kullanici, sorgu }) => servis.motorUyarilariOku(db, kullanici, sorgu.taslak) }),
  uc({ yontem: 'GET', yol: '/plan/canli-yerlesim', yetki: PLAN_OKUR, sorgu: canliYerlesimSorgusu, cevap: canliYerlesimCevabi,
    isle: ({ db, sorgu }) => servis.canliYerlesim(db, sorgu.isEmirleri) }),
  // 510 a: canlıya alma geçmişi (eski "Plan değişikliği" kutusu); planı okuyan görür.
  uc({ yontem: 'GET', yol: '/plan/canliya-alma-gecmisi', yetki: PLAN_OKUR, cevap: canliyaAlmaGecmisiCevabi, isle: ({ db }) => servis.canliyaAlmaGecmisi(db) }),
  // 782: plana giden verinin kaynağında boş olan yerler; yalnız okur, kaynak çağıranın yetkisiyle.
  uc({ yontem: 'GET', yol: '/plan/veri-sagligi', yetki: { biri: ['plan.oku', 'plan.yaz', PLANLAMA_OKUR] }, cevap: veriSagligiCevabi, isle: ({ db, kullanici }) => veriSagligi(db, kullanici) }),
  // 1478: plan sağlığı; yalnız okur. Planlama sayfalarını gören (yönetici, müdür, planlama) okur.
  uc({ yontem: 'GET', yol: '/plan/plan-sagligi', yetki: PLANLAMA_OKUR, cevap: planSagligiCevabi, isle: ({ db, kullanici }) => planSagligi(db, kullanici) }),
  // 1472 M1 (1522 a): açık emirlerin brüt ve net malzeme ihtiyacı; yalnız okur, yeni işlem açılmaz. Planlama sayfalarını gören okur;
  // stok ve satın alma miktarı okuyanın kendi yetkisiyle (1545 a).
  uc({ yontem: 'GET', yol: '/plan/mrp-ihtiyaci', yetki: PLANLAMA_OKUR, cevap: mrpIhtiyaciCevabi, isle: ({ db, kullanici }) => mrpIhtiyaci(db, kullanici) }),
  uc({ yontem: 'GET', yol: '/plan/surum', yetki: 'oturum', cevap: planSurumCevabi, isle: ({ db }) => servis.canliSurum(db) }),
  uc({ yontem: 'GET', yol: '/plan/menu-sayaclari', yetki: 'oturum', cevap: ikinciMenuSayacSemasi,
    isle: ({ db, kullanici }) => servis.menuSayaclari(db, kullanici) }),
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
  // 148 a: yazma taslağa gider (taslak verilmezse açılır), onayla canlıya geçer; okuma taslak verilirse taslağınki.
  uc({ yontem: 'GET', yol: '/plan/bedel-ayari', yetki: PLAN_BEDELI_OKUR, sorgu: planSorgusu, cevap: bedelAyari,
    isle: ({ db, sorgu }) => servis.bedelAyari(db, sorgu.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/bedel-ayari', yetki: 'plan.bedel-ayari', tekrarKorumali: true, govde: bedelAyariTaslakGovdesi, cevap: planCevabi,
    isle: ({ db, kullanici, govde: { taslak, ...ayar } }) => servis.bedelAyariYaz(db, kullanici, taslak ?? null, ayar) }),
  // Plan motoru ayarları (kart 811): planı ya da planlama sayfalarını gören okur; değiştirmek plan.motor-ayari (775 b). Yazma yeni sürümdür,
  // açık taslak eski sürümde kalır; taslak "güncel ayarları uygula" ile geçer (774 a).
  uc({ yontem: 'GET', yol: '/plan/motor-ayarlari', yetki: { biri: ['plan.oku', 'plan.yaz', 'plan.planlama-oku', 'plan.motor-ayari'] }, sorgu: planSorgusu,
    cevap: motorAyarlariCevabi, isle: ({ db, sorgu }) => motorAyarlari(db, sorgu.taslak) }),
  uc({ yontem: 'POST', yol: '/plan/motor-ayarlari', yetki: 'plan.motor-ayari', tekrarKorumali: true, govde: motorAyariGovdesi, cevap: motorAyarlariCevabi,
    isle: ({ db, kullanici, govde }) => motorAyariYaz(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/motor-ayari-guncelle', yetki: 'plan.yaz', tekrarKorumali: true, parametre: senaryoParametresi,
    govde: senaryoSurumGovdesi, cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.motorAyariGuncelle(db, kullanici, parametre.id, govde.surum) }),
  // 830 a: taslağa özel kural; taslağın sahibi yazar (motor-ayari-guncelle gibi plan.yaz).
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/motor-kurali', yetki: 'plan.yaz', tekrarKorumali: true, parametre: senaryoParametresi,
    govde: motorKuraliGovdesi, cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.motorKuraliYaz(db, kullanici, parametre.id, govde) }),
  // Elle çarpan geçmişi (195 a). 815 (699/3 a): çarpan artık verilmez ve plana girmez; yazma ve bant uçları kalktı, eski kayıtlar okunur.
  uc({ yontem: 'GET', yol: '/plan/siparisler/:id/carpan', yetki: PLAN_BEDELI_OKUR, parametre: siparisParametresi, cevap: siparisCarpaniCevabi,
    isle: ({ db, parametre }) => servis.siparisCarpani(db, parametre.id) }),
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
  // Onay akışı (146, 147 a): sahip gönderir ve çeker (plan.studyo), onaylayan geri gönderir ya da canlıya alır (plan.canliya-al). Yol ve
  // işlem sözleşmenin PLAN_ONAY_KOMUTLARI'ndadır; kişi ve durum kuralı serviste (PL-ONAY).
  uc({ yontem: 'POST', yol: PLAN_ONAY_KOMUTLARI['onaya-gonder'].yol, yetki: PLAN_ONAY_KOMUTLARI['onaya-gonder'].islem, parametre: senaryoParametresi,
    govde: onayaGonderGovdesi, cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.onayaGonder(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: PLAN_ONAY_KOMUTLARI['onaydan-cek'].yol, yetki: PLAN_ONAY_KOMUTLARI['onaydan-cek'].islem, parametre: senaryoParametresi,
    govde: onaydanCekGovdesi, cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.onaydanCek(db, kullanici, parametre.id, govde.surum) }),
  uc({ yontem: 'POST', yol: PLAN_ONAY_KOMUTLARI['geri-gonder'].yol, yetki: PLAN_ONAY_KOMUTLARI['geri-gonder'].islem, parametre: senaryoParametresi,
    govde: geriGonderGovdesi, cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.geriGonder(db, kullanici, parametre.id, govde) }),
  // Kardeş taslakları da kilitler (502 a): o taslağa aynı anda yazan komutla kilitlenirse baştan yeniden koşar.
  uc({ yontem: 'POST', yol: PLAN_ONAY_KOMUTLARI['canliya-al'].yol, yetki: PLAN_ONAY_KOMUTLARI['canliya-al'].islem, tekrarKorumali: true, kilitlenmedeYinele: true, parametre: senaryoParametresi,
    govde: canliyaAlGovdesi, cevap: canliyaAlCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.canliyaAl(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'GET', yol: '/plan/musteri-secenekleri', yetki: 'plan.canliya-al', sorgu: musteriSecenekleriSorgusu, cevap: musteriSecenekleriCevabi,
    isle: ({ db, sorgu }) => servis.musteriSecenekleri(db, sorgu.ara) }),
  // 507 2 a: taslağın ek vardiyaları baştan yazılır; okuma GET /plan cevabının ekMesai'sidir.
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/ek-mesai', yetki: 'plan.yaz', tekrarKorumali: true, parametre: senaryoParametresi, govde: ekMesaiGovdesi,
    cevap: planCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.ekMesaiYaz(db, kullanici, parametre.id, govde) }),
  uc({ yontem: 'POST', yol: '/plan/senaryolar/:id/vazgec', yetki: 'plan.studyo', parametre: senaryoParametresi, govde: senaryoSurumGovdesi,
    cevap: senaryolarCevabi, isle: ({ db, kullanici, parametre, govde }) => servis.vazgec(db, kullanici, parametre.id, govde.surum) }),

  // ----- Planlama sayfası ve ortak motor (658 b): Reçete ve Rota'dan taşındı; yollar /plan altında, yetkiler aynı (işlem adı 663 a). -----
  uc({ yontem: 'GET', yol: '/plan/planlama-kaynagi', yetki: KAYNAK_OKUR, cevap: durumCevabi, isle: ({ db, kullanici }) => planlama.planlamaKaynagi(db, kullanici) }),
  // Plan kapasitesi (kart #1324): izin, fazla mesai ve atama payı; köprü kaynak okumasında ister.
  uc({ yontem: 'GET', yol: '/plan/planlama-kapasitesi', yetki: KAYNAK_OKUR, cevap: kapasiteCevabi, isle: ({ db, kullanici }) => planlama.kapasite(db, kullanici) }),
  // 525 1 a, 533 a: planın satın alma eki (açık sipariş gelişi, tedarik termini); çerçevenin kaynak okuması ister.
  uc({ yontem: 'GET', yol: '/plan/satin-alma-eki', yetki: KAYNAK_OKUR, cevap: satinAlmaEkiCevabi, isle: ({ db, kullanici }) => planlama.satinAlmaEki(db, kullanici) }),
  // Planlama çalışması ve sayfa tercihleri (662 a). Çalışma yalnız plan.yaz, öteki anahtarlar recete-rota.yaz ister (925 a,
  // planlamaYazmaDenetimi). Gövde deftere girmez (yüzlerce KB olabilir): anahtar ve beklenen sürüm girer.
  uc({ yontem: 'GET', yol: '/plan/planlama-kayitlari', yetki: KAYNAK_OKUR, cevap: kayitlarCevabi, isle: ({ db }) => planlama.planlamaKayitlari(db) }),
  uc({ yontem: 'POST', yol: '/plan/planlama-kayitlari/yaz', yetki: KAYIT_YAZAR, denetim: 'govdesiz',
    denetimOzeti: (g) => ({ anahtar: g.anahtar, bicim: g.bicim, beklenenSurum: g.beklenenSurum }), govde: planlamaYazGovdesi, cevap: yazCevabi,
    isle: ({ db, kullanici, govde }) => planlama.planlamaYaz(db, kullanici, govde) }),
  uc({ yontem: 'POST', yol: '/plan/planlama-kayitlari/sil', yetki: KAYIT_YAZAR, govde: planlamaSilGovdesi, cevap: silCevabi,
    isle: ({ db, kullanici, govde }) => planlama.planlamaSil(db, kullanici, govde) }),
  // Planlama sayfasının birleşmiş çalışması (288 a); planlama sayfalarını görme işlemi ister (menüdeki gibi).
  uc({ yontem: 'GET', yol: '/plan/planlama-calismasi', yetki: PLANLAMA_OKUR, cevap: planlamaCalismasiCevabi,
    isle: ({ db, kullanici }) => planlama.planlamaCalismasi(db, kullanici) }),
  // 657 a: kayıt yoksa sayfa boş çalışmayı açar; kaydı yazmak gibi yalnız plan.yaz ister (925 a). Kayıt varsa dokunulmaz, var olan döner.
  uc({ yontem: 'POST', yol: '/plan/planlama-calismasi/olustur', yetki: 'plan.yaz', tekrarKorumali: true, cevap: planlamaCalismasiCevabi,
    isle: ({ db, kullanici }) => planlama.planlamaCalismasiOlustur(db, kullanici) }),
  // 542 a, 546 a, 549 a: Satın Alma menüsünün malzeme ve fason planı; daraltılmış çalışma (müşteri, fiyat, maliyet, tezgâh, personel yok).
  uc({ yontem: 'GET', yol: '/plan/planlama-calismasi/satin-alma', yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz', PLANLAMA_OKUR] }, cevap: planlamaCalismasiCevabi,
    isle: ({ db }) => planlama.satinAlmaPlanCalismasi(db) }),
  // 499 a, 506 a: çalışma planı ile canlı planın farkı; yalnız okur. Çalışmayı okuma yetkisi uçta, canlı planı okuma yetkisi (GET /plan'ınki)
  // işleyicide aranır: iki okumanın birleşimi yetkiyi genişletmez.
  uc({ yontem: 'GET', yol: '/plan/planlama-calismasi/canli-farki', yetki: PLANLAMA_OKUR, cevap: canliFarkiCevabi,
    isle: ({ db, kullanici }) => canliFarki(db, kullanici) }),
  // 505 a, 506 a: taban ve son canlı plan, sayfanın anahtarlarıyla; GET /plan'ın yetkisiyle. Sayfanın kimliği yalnız çalışmayı okuyabilene çevrilir.
  uc({ yontem: 'GET', yol: '/plan/projeler/:projeId/plan-gerceklesen', yetki: PROJEYI_OKUR, parametre: projePlaniParametresi, cevap: projePlaniCevabi,
    isle: ({ db, parametre }) => projePlani(db, parametre.projeId) }),
  uc({ yontem: 'GET', yol: '/plan/planlama-calismasi/taban-ve-canli', yetki: PLAN_OKUR, cevap: tabanVeCanliCevabi,
    isle: ({ db, kullanici }) => tabanVeCanli(db, kullanici) }),
  // 503 a: kayıtlı çalışma planı kişiye yeni plan taslağı olarak yazılır. Plan uçlarının denetim satırı bu yolda yazılmaz: açılan taslak ve
  // yazılan iş sayısı bu ucun satırına eklenir.
  uc({ yontem: 'POST', yol: '/plan/planlama-calismasi/taslak-yaz', yetki: 'plan.yaz', tekrarKorumali: true, govde: calismaTaslagiGovdesi, cevap: calismaTaslagiCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => {
      const r = await calismaTaslagi(db, kullanici, govde);
      denetimEki([{ taslak: r.taslak.id, yazilan: r.yazilan, atlanan: r.atlanan, yazilamaz: r.yazilamaz.length }]);
      return r;
    } }),
  // 507 3 a: plan taslağının yerleşimleri ve kilitleri kayıtlı çalışmaya yazılır; çalışma kaydını yazmak gibi recete-rota.yaz ve plan.yaz
  // ister, taslağı okumak plan okuma yetkisi (plan.yaz onu kapsar).
  uc({ yontem: 'POST', yol: '/plan/planlama-calismasi/taslaktan-yaz', yetki: 'recete-rota.yaz', tekrarKorumali: true, govde: taslaktanCalismayaGovdesi,
    cevap: taslaktanCalismayaCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => {
      const r = await taslaktanCalismaya(db, kullanici, govde);
      denetimEki([{ taslak: govde.taslakId, calismaSurumu: r.calismaSurumu, oncekiSurum: r.oncekiSurum, yazilan: r.yazilan, kilitli: r.kilitli, atlanan: r.atlanan.length }]);
      return r;
    } }),
  // 508 2 a: çalışma kaydı bir önceki sürümüne döner (geçmişten); arada başka yazma olduysa 409.
  uc({ yontem: 'POST', yol: '/plan/planlama-calismasi/geri-al', yetki: 'recete-rota.yaz', tekrarKorumali: true, govde: calismaGeriAlGovdesi, cevap: calismaGeriAlCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => {
      const r = await calismaGeriAl(db, kullanici, govde.calismaSurumu);
      denetimEki([{ calismaSurumu: r.calismaSurumu, donulenSurum: r.donulenSurum }]);
      return r;
    } }),
  // Planlama kartlarının sunucuda hesabı (Soru 357 a, 463 a): başlatma girdiyi okur, kayıt yazmaz; hesap uç transaction'ının dışında koşar,
  // sonuç kimlikle transaction açmadan okunur.
  uc({ yontem: 'POST', yol: '/plan/planlama-degerlendirmesi', yetki: PLANLAMA_OKUR, govde: degerlendirmeGovdesi, cevap: degerlendirmeBaslatCevabi,
    isle: ({ db, kullanici, govde }) => degerlendirmeBaslat(db, kullanici, govde) }),
  uc({ yontem: 'GET', yol: '/plan/planlama-degerlendirmesi/:is', yetki: PLANLAMA_OKUR, txDisi: true, parametre: degerlendirmeParametresi, cevap: degerlendirmeDurumuCevabi,
    isle: ({ kullanici, parametre }) => degerlendirmeDurumu(kullanici.id, parametre.is) }),
  // Yıllık planın çözümü (454/6 a): planlama sayfasını gören başlatır, kayıt yazılmaz. Çözüm uç transaction'ının dışında koşar; sonuç
  // kimlikle, transaction açmadan okunur.
  uc({ yontem: 'POST', yol: '/plan/yillik-plan/coz', yetki: PLANLAMA_OKUR, govde: yillikCozGovdesi, cevap: yillikCozBaslatCevabi,
    isle: ({ kullanici, govde }) => yillikCozBaslat(kullanici.id, govde) }),
  uc({ yontem: 'GET', yol: '/plan/yillik-plan/coz/:is', yetki: PLANLAMA_OKUR, txDisi: true, parametre: yillikCozParametresi, cevap: yillikCozDurumuCevabi,
    isle: ({ kullanici, parametre }) => yillikCozDurumu(kullanici.id, parametre.is) }),
];
