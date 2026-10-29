import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  benimGorevimMi, cevrimIsGunu, emirAdimiUygunMu, emirGorevleri, emirHatti, emirIlerler, emirKarariOner, etkiAnaliziKur, faiGereksinimi, gorevSuresi, ilkParcaTuru, isGunuFarki,
  izinliKodlar, kapanisKosullari, kapatilabilirMi, kararIslemi, kendiTalebiMi, musteriOnayiIstenirMi, seriUyumu, stokKarariOner, talepAdimiUygunMu,
  talepGerekmezMi, talepGorevi, talepHatti, topluUygulanirMi, yayinaGonderimEksigi, yeniParcaNoGerekirMi,
} from './kurallar.ts';
import type { EtkilenenEmir, KalemTaslagi } from './kurallar.ts';

const emir = (ek: Partial<EtkilenenEmir> = {}): EtkilenenEmir => ({
  durum: 'planli', basladi: false, donmus: false, seriAraligi: null, sonUrunu: false, baslangic: '2026-11-10', terminKayar: false, ...ek,
});

describe('degisiklik-yonetimi kuralları', () => {
  test('DY-1: yalnız süre ya da tezgah tercihi değişiyorsa talep gerekmez; çizim ya da proses değişiyorsa gerekir', () => {
    assert.equal(talepGerekmezMi({ cizim: 'hayir', fff: null, proses: 'hayir', sure: 'evet' }), true);
    assert.equal(talepGerekmezMi({ cizim: 'hayir', fff: null, proses: 'hayir', sure: 'hayir' }), false);
    assert.equal(talepGerekmezMi({ cizim: 'evet', fff: 'evet', proses: null, sure: 'evet' }), false);
    assert.equal(talepGerekmezMi({ cizim: null, fff: null, proses: null, sure: null }), false);
  });

  test('DY-2: adım yalnız sıradaki durumda; ilk parça kararla birlikte ya da uygulamada onaylanır', () => {
    assert.equal(talepAdimiUygunMu('siniflandir', 'gonderildi'), true);
    assert.equal(talepAdimiUygunMu('siniflandir', 'analizde'), false);
    assert.equal(talepAdimiUygunMu('emirAc', 'onaylandi'), true);
    assert.equal(talepAdimiUygunMu('emirAc', 'reddedildi'), false);
    assert.equal(emirAdimiUygunMu('faiOnayla', 'karar'), true);
    assert.equal(emirAdimiUygunMu('faiOnayla', 'uygulamada'), true);
    assert.equal(emirAdimiUygunMu('faiOnayla', 'dogrulama'), false);
    assert.equal(emirAdimiUygunMu('kapat', 'uygulamada'), false);
    assert.equal(emirAdimiUygunMu('kapat', 'dogrulama'), true);
  });

  test('DY-3: talebi açan kendi talebine CCB veremez, başkası verir', () => {
    assert.equal(kendiTalebiMi(7, 7), true);
    assert.equal(kendiTalebiMi(7, 8), false);
  });

  test('DY-4 ve DY-5: ilk parça şartı ve müşteri onayı sınıftan; müşteri bilgisi yoksa D1 onay ister', () => {
    assert.deepEqual(['D1', 'D2', 'P1', 'P2'].map((s) => faiGereksinimi(s as 'D1')), ['tam_ve_kismi', 'gerekmez', 'kismi', 'gerekmez']);
    assert.equal(musteriOnayiIstenirMi('D1', null), true);
    assert.equal(musteriOnayiIstenirMi('D1', false), false);
    assert.equal(musteriOnayiIstenirMi('D2', true), false);
    const etki = etkiAnaliziKur('P1', '2026-10-28T10:00:00+03:00');
    assert.equal(etki.fai, 'kismi');
    assert.deepEqual([etki.emirler, etki.stok, etki.sahada, etki.ustParcalar, etki.mrbAdayi], [null, null, null, null, null]);
  });

  test('DY-6: değiştirilebilirlik iki yönde evet değilse yeni parça numarası; proseste hiç gerekmez; eksik cevapta bilinmez', () => {
    assert.equal(yeniParcaNoGerekirMi('D1', 'evet', 'evet'), false);
    assert.equal(yeniParcaNoGerekirMi('D1', 'hayir', 'evet'), true);
    assert.equal(yeniParcaNoGerekirMi('D2', 'evet', 'hayir'), true);
    assert.equal(yeniParcaNoGerekirMi('D1', 'evet', null), null);
    assert.equal(yeniParcaNoGerekirMi('P1', null, null), false);
  });

  test('DY-7: yayına gönderimde özet, değiştirilebilirlik ve gereken yeni parça numarası aranır', () => {
    const k = (ek: Partial<KalemTaslagi>): KalemTaslagi => ({ malzemeAdi: 'A', eskiYeniyeUyar: 'evet', yeniEskiyeUyar: 'evet', yeniParcaNo: null, ozet: 'x', ...ek });
    assert.equal(yayinaGonderimEksigi('D1', [k({})]), null);
    assert.match(yayinaGonderimEksigi('D1', [k({ ozet: ' ' })]) ?? '', /özetini/);
    assert.match(yayinaGonderimEksigi('D2', [k({ yeniEskiyeUyar: null })]) ?? '', /değiştirilebilirlik/);
    assert.match(yayinaGonderimEksigi('D1', [k({ eskiYeniyeUyar: 'hayir' })]) ?? '', /yeni parça numarası/);
    assert.equal(yayinaGonderimEksigi('D1', [k({ eskiYeniyeUyar: 'hayir', yeniParcaNo: 'YENI-1' })]), null);
    assert.equal(yayinaGonderimEksigi('P2', [k({ eskiYeniyeUyar: null, yeniEskiyeUyar: null })]), null);
    assert.match(yayinaGonderimEksigi('P1', []) ?? '', /parça yok/);
  });

  test('DY-8: ilk parça D1 yeni numarada tam, revizyonda kısmi; P1 kısmi; D2 ve P2 yok', () => {
    assert.equal(ilkParcaTuru('D1', 'YENI-1'), 'tam');
    assert.equal(ilkParcaTuru('D1', null), 'kismi');
    assert.equal(ilkParcaTuru('P1', null), 'kismi');
    assert.equal(ilkParcaTuru('D2', null), null);
    assert.equal(ilkParcaTuru('P2', null), null);
  });

  test('DY-9: emir karar önerisi seri sınırı, tarih, bitmiş, fason, başlamış ve donmuş bölgeye göre', () => {
    const seri = { tur: 'seri' as const, sonUrunMalzemeId: 1, ilkSeri: 100 };
    assert.deepEqual(
      [emirKarariOner('D2', seri, emir({ seriAraligi: [10, 20], sonUrunu: true })).kod, emirKarariOner('D1', seri, emir({ seriAraligi: [10, 20], sonUrunu: true })).mod],
      ['eskiyle_tamamla', 'onayli'],
    );
    assert.equal(emirKarariOner('D2', seri, emir({ seriAraligi: [10, 20], sonUrunu: true, durum: 'tamamlandi' })).kod, 'islem_yok');
    assert.deepEqual(emirKarariOner('D2', seri, emir({ seriAraligi: [90, 110], sonUrunu: true })), {
      kod: 'beklet', mod: 'mrb', gerekce: 'Seri aralığı geçerlilik sınırını kesiyor; emir bölünmeli.',
    });
    assert.equal(emirKarariOner('D2', { tur: 'tarih', tarih: '2026-12-01' }, emir()).kod, 'eskiyle_tamamla');
    assert.deepEqual([emirKarariOner('D1', null, emir({ durum: 'tamamlandi' })).kod, emirKarariOner('D1', null, emir({ durum: 'tamamlandi' })).mod], ['rework', 'mrb']);
    assert.equal(emirKarariOner('P2', null, emir({ durum: 'tamamlandi' })).mod, 'otomatik');
    assert.equal(emirKarariOner('P1', null, emir({ durum: 'fasonda' })).kod, 'beklet');
    assert.equal(emirKarariOner('D2', null, emir({ durum: 'fasonda' })).kod, 'eskiyle_tamamla');
    assert.equal(emirKarariOner('D1', null, emir({ basladi: true })).kod, 'beklet');
    assert.equal(emirKarariOner('D2', null, emir({ basladi: true })).kod, 'eskiyle_tamamla');
    assert.deepEqual([emirKarariOner('P1', null, emir({ basladi: true })).kod, emirKarariOner('P1', null, emir({ basladi: true })).mod], ['kalanlari_gecir', 'mrb']);
    assert.equal(emirKarariOner('P2', null, emir({ basladi: true })).mod, 'onayli');
    assert.equal(emirKarariOner('D1', null, emir({ donmus: true })).mod, 'mrb');
    assert.equal(emirKarariOner('P2', null, emir({ donmus: true })).kod, 'eskiyle_tamamla');
    assert.equal(emirKarariOner('P1', null, emir({ durum: 'serbest' })).mod, 'onayli');
    assert.equal(emirKarariOner('P2', null, emir()).mod, 'otomatik');
    assert.equal(emirKarariOner('P2', null, emir({ terminKayar: true })).mod, 'onayli');
    assert.equal(emirKarariOner('P2', null, emir({ terminKayar: null })).mod, 'onayli');
  });

  test('DY-10: stok önerisi D1 eski yedek (MRB), öteki sınıflarda işlem yok (otomatik)', () => {
    assert.deepEqual([stokKarariOner('D1').kod, stokKarariOner('D1').mod], ['eski_yedek', 'mrb']);
    assert.deepEqual([stokKarariOner('P1').kod, stokKarariOner('P1').mod], ['islem_yok', 'otomatik']);
  });

  test('DY-11: izinli kodlar hedefe ve emrin durumuna göre', () => {
    assert.deepEqual(izinliKodlar('stok', null, false), ['eski_yedek', 'islem_yok', 'hurda', 'rework']);
    assert.ok(!izinliKodlar('emir', emir({ durum: 'tamamlandi' }), false).includes('yeniden_olustur'));
    assert.ok(izinliKodlar('emir', emir(), false).includes('yeniden_olustur'));
    assert.ok(!izinliKodlar('emir', emir({ basladi: true }), false).includes('yeniden_olustur'));
    assert.ok(izinliKodlar('emir', emir({ basladi: true }), false).includes('kalanlari_gecir'));
    assert.ok(!izinliKodlar('emir', emir({ basladi: true }), true).includes('kalanlari_gecir'));
  });

  test('DY-12: hurda, rework, sapma, yedek ve MRB modu mrb-karar ister; öteki karar-ver', () => {
    assert.equal(kararIslemi('onayli', 'hurda'), 'degisiklik-yonetimi.mrb-karar');
    assert.equal(kararIslemi('otomatik', 'eskiyle_tamamla_sapma'), 'degisiklik-yonetimi.mrb-karar');
    assert.equal(kararIslemi('mrb', 'yeniden_olustur'), 'degisiklik-yonetimi.mrb-karar');
    assert.equal(kararIslemi('onayli', 'eskiyle_tamamla'), 'degisiklik-yonetimi.karar-ver');
    assert.equal(kararIslemi('onayli', 'beklet'), 'degisiklik-yonetimi.karar-ver');
  });

  test('DY-13: toplu onay MRB, bekletme, izinsiz ve verilmiş öneriyi atlar', () => {
    const k = { mod: 'onayli' as const, onerilenKod: 'eskiyle_tamamla' as const, izinliKodlar: ['eskiyle_tamamla' as const], verilenKod: null };
    assert.equal(topluUygulanirMi(k), true);
    assert.equal(topluUygulanirMi({ ...k, mod: 'mrb' }), false);
    assert.equal(topluUygulanirMi({ ...k, onerilenKod: 'beklet', izinliKodlar: ['beklet'] }), false);
    assert.equal(topluUygulanirMi({ ...k, onerilenKod: 'rework', izinliKodlar: ['rework'] }), false);
    assert.equal(topluUygulanirMi({ ...k, izinliKodlar: ['hurda'] }), false);
    assert.equal(topluUygulanirMi({ ...k, verilenKod: 'eskiyle_tamamla' }), false);
  });

  test('DY-14: emir kararlar bitince uygulamaya, ilk parçalar bitince doğrulamaya geçer', () => {
    assert.equal(emirIlerler('karar', false, true), 'karar');
    assert.equal(emirIlerler('karar', true, false), 'uygulamada');
    assert.equal(emirIlerler('karar', true, true), 'dogrulama');
    assert.equal(emirIlerler('uygulamada', false, true), 'dogrulama');
  });

  test('DY-15: eksik koşul kapanışı durdurur, bilinmeyen durdurmaz', () => {
    const bagsiz = kapanisKosullari({ kaynakBagli: false, bekleyenKarar: 0, bekleyenFai: 0 });
    assert.equal(bagsiz.find((k) => k.kosul === 'kararlar')?.durum, 'bilinmiyor');
    assert.equal(kapatilabilirMi(bagsiz), true);
    assert.equal(kapanisKosullari({ kaynakBagli: true, bekleyenKarar: 0, bekleyenFai: 0 })[0]?.durum, 'tamam');
    assert.equal(kapatilabilirMi(kapanisKosullari({ kaynakBagli: true, bekleyenKarar: 1, bekleyenFai: 0 })), false);
    assert.equal(kapatilabilirMi(kapanisKosullari({ kaynakBagli: false, bekleyenKarar: 0, bekleyenFai: 2 })), false);
  });

  test('DY-16: seri uyumu', () => {
    assert.equal(seriUyumu({ sapmali: true, ilkSeri: 10, seri: 12, yeniRevizyonla: false }), 'sapmali');
    assert.equal(seriUyumu({ sapmali: false, ilkSeri: null, seri: 12, yeniRevizyonla: false }), 'uyumlu');
    assert.equal(seriUyumu({ sapmali: false, ilkSeri: 10, seri: 12, yeniRevizyonla: null }), 'bilinmiyor');
    assert.equal(seriUyumu({ sapmali: false, ilkSeri: 10, seri: 12, yeniRevizyonla: true }), 'uyumlu');
    assert.equal(seriUyumu({ sapmali: false, ilkSeri: 10, seri: 9, yeniRevizyonla: true }), 'uyumsuz');
    assert.equal(seriUyumu({ sapmali: false, ilkSeri: 10, seri: 9, yeniRevizyonla: false }), 'uyumlu');
  });

  test('DY-17 ve DY-18: iş günü hafta sonunu saymaz; hedefi aşan görev gecikmiştir', () => {
    // 2026-10-30 cuma, 2026-11-02 pazartesi.
    assert.equal(isGunuFarki('2026-10-30', '2026-11-02'), 1);
    assert.equal(isGunuFarki('2026-10-26', '2026-10-30'), 4);
    assert.equal(isGunuFarki('2026-10-30', '2026-10-30'), 0);
    assert.deepEqual(gorevSuresi('acil', '2026-10-26', '2026-10-27'), { yasIsGunu: 1, hedefIsGunu: 1, gecikti: false });
    assert.deepEqual(gorevSuresi('acil', '2026-10-26', '2026-10-28'), { yasIsGunu: 2, hedefIsGunu: 1, gecikti: true });
    assert.equal(gorevSuresi('normal', '2026-10-26', '2026-10-30').gecikti, false);
    // Çevrim 9 iş günü; CCB onayından müşteri onayına 5 iş günü beklenmiş, hedef hesabına girmez.
    assert.equal(cevrimIsGunu('2026-10-26', '2026-11-06', { baslangic: '2026-10-27', bitis: '2026-11-03' }), 4);
    assert.equal(cevrimIsGunu('2026-10-26', '2026-11-06', null), 9);
  });

  test('DY-19: görev adımları ve hat aşaması; açan kişiye kendi CCB görevi düşmez', () => {
    const ccb = talepGorevi('ccb_bekliyor');
    assert.equal(ccb?.islem, 'degisiklik-yonetimi.ccb-karar');
    assert.equal(talepGorevi('reddedildi'), null);
    // Ekipte görünür, ama açana kendi talebinin CCB adımı düşmez; öteki adım işlemi olanındır.
    const islemler = ['degisiklik-yonetimi.ccb-karar', 'degisiklik-yonetimi.siniflandir'];
    if (ccb === null) throw new Error('CCB adımı yok');
    assert.equal(benimGorevimMi(ccb, islemler, true), false);
    assert.equal(benimGorevimMi(ccb, islemler, false), true);
    assert.equal(benimGorevimMi({ adim: 'x', islem: 'degisiklik-yonetimi.kapat' }, islemler, false), false);
    assert.equal(benimGorevimMi({ adim: 'x', islem: 'degisiklik-yonetimi.siniflandir' }, islemler, true), true);
    assert.deepEqual(emirGorevleri({ durum: 'karar', bekleyenKarar: 2, bekleyenMrb: 1, bekleyenFai: 0 }).map((g) => g.islem), [
      'degisiklik-yonetimi.karar-ver', 'degisiklik-yonetimi.mrb-karar',
    ]);
    assert.deepEqual(emirGorevleri({ durum: 'uygulamada', bekleyenKarar: 0, bekleyenMrb: 0, bekleyenFai: 1 }).map((g) => g.islem), ['degisiklik-yonetimi.fai-onayla']);
    assert.deepEqual(emirGorevleri({ durum: 'kapandi', bekleyenKarar: 0, bekleyenMrb: 0, bekleyenFai: 0 }), []);
    assert.equal(talepHatti('emir_acildi'), null);
    assert.equal(emirHatti('uygulamada'), 'fai');
    assert.equal(emirHatti('kapandi'), null);
  });
});
