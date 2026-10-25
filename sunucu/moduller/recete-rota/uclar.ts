import { uc } from '#cekirdek/uc.ts';
import {
  benCevabi, calismaGeriAlCevabi, calismaGeriAlGovdesi, calismaTaslagiCevabi, calismaTaslagiGovdesi, canliFarkiCevabi, degerlendirmeBaslatCevabi, degerlendirmeDurumuCevabi, degerlendirmeGovdesi, degerlendirmeParametresi, durumCevabi, fasonTahminCevabi, fasonTahminSorgusu, kapasiteCevabi, kayitlarCevabi, planlamaCalismasiCevabi, satinAlmaEkiCevabi, silCevabi, silGovdesi, statulerCevabi, statuTanimiCevabi,
  statuTanimiKaydetGovdesi, statuTanimiParametresi, statuTanimiSilGovdesi, tabanVeCanliCevabi, taslaktanCalismayaCevabi, taslaktanCalismayaGovdesi, yazCevabi, yazGovdesi, yillikCozBaslatCevabi, yillikCozDurumuCevabi,
  yillikCozGovdesi, yillikCozParametresi,
} from '#paylasilan/sozlesme/recete-rota.ts';
import {
  ben, durum, fasonTahminleri, kapasite, kayitlar, planlamaCalismasi, planlamaYazmaDenetimi, satinAlmaEki, satinAlmaPlanCalismasi, sil, statuler, statuTanimiKaydet, statuTanimiSil, yaz,
} from './servis.ts';
import { calismaGeriAl, calismaTaslagi, canliFarki, tabanVeCanli, taslaktanCalismaya } from './calisma-plani.ts';
import { degerlendirmeBaslat, degerlendirmeDurumu } from './degerlendirme.ts';
import { yillikCozBaslat, yillikCozDurumu } from './yillik-cozucu.ts';

// Çerçevedeki prototipin yerel deposu bu uçlara gelir (istemci/src/moduller/recete-rota/kopru.ts). Her yazma uçtan geçer:
// yetki ve denetim kaydı uç katmanındadır.
const OKUMA = { biri: ['sayfa.recete-rota', 'recete-rota.oku', 'recete-rota.yaz'] } as const;
// Plan modülünün okuma yetkisi (plan/uclar.ts PLAN_OKUR).
const PLAN_OKUMA = { biri: ['plan.oku', 'plan.yaz'] } as const;

export const uclar = [
  uc({
    yontem: 'GET',
    yol: '/recete-rota/ben',
    yetki: OKUMA,
    cevap: benCevabi,
    isle: ({ kullanici }) => ben(kullanici),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/kayitlar',
    yetki: OKUMA,
    cevap: kayitlarCevabi,
    isle: ({ db }) => kayitlar(db),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/durum',
    yetki: OKUMA,
    cevap: durumCevabi,
    isle: ({ db, kullanici }) => durum(db, kullanici),
  }),
  // Plan kapasitesi (kart #1324): izin, fazla mesai ve atama payı; köprü kaynak okumasında ister.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/kapasite',
    yetki: OKUMA,
    cevap: kapasiteCevabi,
    isle: ({ db, kullanici }) => kapasite(db, kullanici),
  }),
  // 525 1 a, 533 a: planın satın alma eki (açık sipariş gelişi, tedarik termini); çerçevenin kaynak okuması ister.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/satin-alma-eki',
    yetki: OKUMA,
    cevap: satinAlmaEkiCevabi,
    isle: ({ db, kullanici }) => satinAlmaEki(db, kullanici),
  }),
  // Planlama sayfasının birleşmiş çalışması (288 a); planlama sayfalarını görme işlemi ister (menüdeki gibi).
  uc({
    yontem: 'GET',
    yol: '/recete-rota/planlama-calismasi',
    yetki: 'recete-rota.planlama-oku',
    cevap: planlamaCalismasiCevabi,
    isle: ({ db, kullanici }) => planlamaCalismasi(db, kullanici),
  }),
  // 542 a, 546 a, 549 a: Satın Alma menüsünün malzeme ve fason planı; daraltılmış çalışma (müşteri, fiyat, maliyet, tezgâh, personel yok).
  uc({
    yontem: 'GET',
    yol: '/recete-rota/planlama-calismasi/satin-alma',
    yetki: { biri: ['satin-alma.oku', 'satin-alma.yaz', 'recete-rota.planlama-oku'] },
    cevap: planlamaCalismasiCevabi,
    isle: ({ db }) => satinAlmaPlanCalismasi(db),
  }),
  // 499 a, 506 a: çalışma planı ile canlı planın farkı (atölyenin "canlı planla aynı" rozeti); yalnız okur. Çalışmayı okuma yetkisi uçta,
  // canlı planı okuma yetkisi (GET /plan'ınki) işleyicide aranır: iki okumanın birleşimi yetkiyi genişletmez.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/planlama-calismasi/canli-farki',
    yetki: 'recete-rota.planlama-oku',
    cevap: canliFarkiCevabi,
    isle: ({ db, kullanici }) => canliFarki(db, kullanici),
  }),
  // 505 a, 506 a: taban ve son canlı plan, sayfanın anahtarlarıyla ("Plan ve gerçekleşen" sekmesi); yalnız okur, GET /plan'ın yetkisiyle.
  // Sayfanın kimliği yalnız çalışmayı okuyabilene çevrilir.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/planlama-calismasi/taban-ve-canli',
    yetki: PLAN_OKUMA,
    cevap: tabanVeCanliCevabi,
    isle: ({ db, kullanici }) => tabanVeCanli(db, kullanici),
  }),
  // 503 a: kayıtlı çalışma planı kişiye yeni plan taslağı olarak yazılır; plan stüdyosu yetkisi de plan modülünde aranır.
  uc({
    yontem: 'POST',
    yol: '/recete-rota/planlama-calismasi/taslak-yaz',
    yetki: 'plan.yaz',
    tekrarKorumali: true,
    govde: calismaTaslagiGovdesi,
    cevap: calismaTaslagiCevabi,
    // Plan uçlarının denetim satırı bu yolda yazılmaz: açılan taslak ve yazılan iş sayısı bu ucun satırına eklenir.
    isle: async ({ db, kullanici, govde, denetimEki }) => {
      const r = await calismaTaslagi(db, kullanici, govde);
      denetimEki([{ taslak: r.taslak.id, yazilan: r.yazilan, atlanan: r.atlanan, yazilamaz: r.yazilamaz.length }]);
      return r;
    },
  }),
  // 507 3 a: plan taslağının yerleşimleri ve kilitleri kayıtlı çalışmaya yazılır; çalışma kaydını yazmak gibi recete-rota.yaz ve plan.yaz
  // ister, taslağı okumak plan okuma yetkisi (plan.yaz onu kapsar).
  uc({
    yontem: 'POST',
    yol: '/recete-rota/planlama-calismasi/taslaktan-yaz',
    yetki: 'recete-rota.yaz',
    tekrarKorumali: true,
    govde: taslaktanCalismayaGovdesi,
    cevap: taslaktanCalismayaCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => {
      const r = await taslaktanCalismaya(db, kullanici, govde);
      denetimEki([{ taslak: govde.taslakId, calismaSurumu: r.calismaSurumu, oncekiSurum: r.oncekiSurum, yazilan: r.yazilan, kilitli: r.kilitli, atlanan: r.atlanan.length }]);
      return r;
    },
  }),
  // 508 2 a: çalışma kaydı bir önceki sürümüne döner (geçmişten); arada başka yazma olduysa 409.
  uc({
    yontem: 'POST',
    yol: '/recete-rota/planlama-calismasi/geri-al',
    yetki: 'recete-rota.yaz',
    tekrarKorumali: true,
    govde: calismaGeriAlGovdesi,
    cevap: calismaGeriAlCevabi,
    isle: async ({ db, kullanici, govde, denetimEki }) => {
      const r = await calismaGeriAl(db, kullanici, govde.calismaSurumu);
      denetimEki([{ calismaSurumu: r.calismaSurumu, donulenSurum: r.donulenSurum }]);
      return r;
    },
  }),
  // Planlama kartlarının sunucuda hesabı (Soru 357 a, 463 a): başlatma girdiyi okur, kayıt yazmaz; hesap uç transaction'ının dışında koşar,
  // sonuç kimlikle transaction açmadan okunur.
  uc({
    yontem: 'POST',
    yol: '/recete-rota/planlama-degerlendirmesi',
    yetki: 'recete-rota.planlama-oku',
    govde: degerlendirmeGovdesi,
    cevap: degerlendirmeBaslatCevabi,
    isle: ({ db, kullanici, govde }) => degerlendirmeBaslat(db, kullanici, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/planlama-degerlendirmesi/:is',
    yetki: 'recete-rota.planlama-oku',
    txDisi: true,
    parametre: degerlendirmeParametresi,
    cevap: degerlendirmeDurumuCevabi,
    isle: ({ kullanici, parametre }) => degerlendirmeDurumu(kullanici.id, parametre.is),
  }),
  // Yıllık planın çözümü (454/6 a): planlama sayfasını gören başlatır, kayıt yazılmaz. Çözüm uç transaction'ının dışında koşar; sonuç
  // kimlikle, transaction açmadan okunur.
  uc({
    yontem: 'POST',
    yol: '/recete-rota/yillik-plan/coz',
    yetki: 'recete-rota.planlama-oku',
    govde: yillikCozGovdesi,
    cevap: yillikCozBaslatCevabi,
    isle: ({ kullanici, govde }) => yillikCozBaslat(kullanici.id, govde),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/yillik-plan/coz/:is',
    yetki: 'recete-rota.planlama-oku',
    txDisi: true,
    parametre: yillikCozParametresi,
    cevap: yillikCozDurumuCevabi,
    isle: ({ kullanici, parametre }) => yillikCozDurumu(kullanici.id, parametre.is),
  }),
  uc({
    yontem: 'GET',
    yol: '/recete-rota/statuler',
    yetki: OKUMA,
    cevap: statulerCevabi,
    isle: ({ db }) => statuler(db),
  }),
  // Termini girilmemiş fason adımın plan süresi: satın almanın geçmiş teslimat tahmini (kullanıcı kararı 16.10.2026). Satın alma
  // okuma yetkisi istenmez: dönen yalnız gün sayısıdır, firma ya da fiyat bilgisi taşımaz.
  uc({
    yontem: 'GET',
    yol: '/recete-rota/fason-tahminleri',
    yetki: OKUMA,
    sorgu: fasonTahminSorgusu,
    cevap: fasonTahminCevabi,
    isle: ({ db, sorgu }) => fasonTahminleri(db, sorgu.s),
  }),
  uc({
    yontem: 'POST',
    yol: '/recete-rota/kayitlar/yaz',
    yetki: 'recete-rota.yaz',
    // Prototip her değişiklikte bütün durumunu (reçete, rota, emir, plan; yüzlerce KB olabilir) yazar: gövde deftere girmez, anahtar ve
    // beklenen sürüm girer (CNC Kurulum Motoru ile aynı kalıp; uygulama.test listesine eklenir).
    denetim: 'govdesiz',
    denetimOzeti: (g) => ({ anahtar: g.anahtar, bicim: g.bicim, beklenenSurum: g.beklenenSurum }),
    govde: yazGovdesi,
    cevap: yazCevabi,
    isle: ({ db, kullanici, govde, gunluk }) => yaz(db, kullanici, govde, gunluk),
  }),
  uc({
    yontem: 'POST',
    yol: '/recete-rota/kayitlar/sil',
    yetki: 'recete-rota.yaz',
    govde: silGovdesi,
    cevap: silCevabi,
    isle: ({ db, kullanici, govde }) => { planlamaYazmaDenetimi(kullanici, govde.anahtar); return sil(db, govde.anahtar, govde.beklenenSurum); },
  }),
  // Elle tanımlanan statü (geçiş planı adım 4): ekleme, değişiklik ve silme tabloya komutla gider.
  uc({
    yontem: 'POST',
    yol: '/recete-rota/statu-tanimlari/:id/kaydet',
    yetki: 'recete-rota.yaz',
    parametre: statuTanimiParametresi,
    govde: statuTanimiKaydetGovdesi,
    cevap: statuTanimiCevabi,
    isle: ({ db, kullanici, parametre, govde }) => statuTanimiKaydet(db, kullanici, parametre.id, govde),
  }),
  uc({
    yontem: 'POST',
    yol: '/recete-rota/statu-tanimlari/:id/sil',
    yetki: 'recete-rota.yaz',
    parametre: statuTanimiParametresi,
    govde: statuTanimiSilGovdesi,
    cevap: statuTanimiCevabi,
    isle: ({ db, parametre, govde }) => statuTanimiSil(db, parametre.id, govde.beklenenSurum),
  }),
];
