import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  anaKayitHatasi, acabildigiSayfalar, bilinmeyenMenuSayfalari, gelenBildirimTuru, menuCevabiYap, kapanisBildirilir, kategoriSecilebilir, kayitDurumu, mesaiToplami, miniPanoCevabiYap, ortanca, ozetAylari, profilAraliklari, temaCevabiYap, YONETIM_IMZASI,
  yanitImzasi, yanitSonrasiDurum,
} from './kurallar.ts';

describe('profil kuralları', () => {
  test('PRF-2/3: izin aralığı bir yıl geri ve ileri, fazla mesai yılın başından bugüne', () => {
    assert.deepEqual(profilAraliklari('2026-10-14'), {
      izinBaslangic: '2025-10-14', izinBitis: '2027-10-14', mesaiBaslangic: '2026-01-01', mesaiBitis: '2026-10-14',
    });
  });

  test('PRF-2: 29 Şubat kayınca geçerli güne düşer', () => {
    const a = profilAraliklari('2028-02-29');
    assert.equal(a.izinBaslangic, '2027-02-28');
    assert.equal(a.izinBitis, '2029-02-28');
  });

  test('PRF-4: saat girilmemiş satır toplama girmez; hiç saat yoksa null', () => {
    assert.equal(mesaiToplami([]), null);
    assert.equal(mesaiToplami([{ saat: null }]), null);
    assert.equal(mesaiToplami([{ saat: 2.5 }, { saat: null }, { saat: 1.25 }]), 3.75);
  });

  test('PRF-5: kaydı olmayan kişide tema null ve sürüm 0', () => {
    assert.deepEqual(temaCevabiYap(null), { tema: null, surum: 0 });
    assert.deepEqual(temaCevabiYap({ tema: 'gun', surum: 3 }), { tema: 'gun', surum: 3 });
  });

  test('PRF-6: kaydı olmayan kişide hepsi açık, öneri kapalı, sürüm 0; kapalı liste sıralı döner', () => {
    assert.deepEqual(miniPanoCevabiYap(null), { kapali: [], acilistaOner: false, surum: 0 });
    assert.deepEqual(miniPanoCevabiYap({ kapali: ['uretim', 'satin-alma'], acilistaOner: true, surum: 2 }), { kapali: ['satin-alma', 'uretim'], acilistaOner: true, surum: 2 });
  });

  test('PRF-7: kaydı olmayan kişinin sık kullanılanı yok, sürüm 0; kayıtlı liste seçilen sırayla döner', () => {
    const hepsi = new Set(['/stok', '/kuyruk']);
    assert.deepEqual(menuCevabiYap(null, hepsi), { sayfalar: [], surum: 0 });
    assert.deepEqual(menuCevabiYap({ sayfalar: ['/stok', '/kuyruk'], surum: 3 }, hepsi), { sayfalar: ['/stok', '/kuyruk'], surum: 3 });
  });

  test('PRF-9: liste kişinin açabildiği sayfalara süzülür, sıra korunur; yetkisi kalkan sayfa okurken dönmez', () => {
    const acabildigi = new Set(['/stok', '/kuyruk']);
    assert.deepEqual(acabildigiSayfalar(['/kuyruk', '/finans', '/stok'], acabildigi), ['/kuyruk', '/stok']);
    assert.deepEqual(menuCevabiYap({ sayfalar: ['/finans', '/stok'], surum: 2 }, acabildigi), { sayfalar: ['/stok'], surum: 2 });
  });

  test('PRF-8: bilinmeyen menü sayfaları ayıklanır', () => {
    const bilinen = new Set(['/stok', '/kuyruk']);
    assert.deepEqual(bilinmeyenMenuSayfalari(['/stok', '/yok', '/kuyruk'], bilinen), ['/yok']);
    assert.deepEqual(bilinmeyenMenuSayfalari([], bilinen), []);
  });

  test('GBM-1: takip satırı olmayan kayıt yenidir; satır varsa durumu okunur', () => {
    assert.equal(kayitDurumu(null), 'yeni');
    assert.equal(kayitDurumu({ durum: 'cozuldu' }), 'cozuldu');
  });

  test('GBM-2: yanıt açık kaydı yanıtlandıya taşır; çözülmüş ve kapanmış kayıt değişmez', () => {
    assert.equal(yanitSonrasiDurum('yeni'), 'yanitlandi');
    assert.equal(yanitSonrasiDurum('inceleniyor'), 'yanitlandi');
    assert.equal(yanitSonrasiDurum('yanitlandi'), 'yanitlandi');
    assert.equal(yanitSonrasiDurum('cozuldu'), 'cozuldu');
    assert.equal(yanitSonrasiDurum('kapandi'), 'kapandi');
  });

  test('GBM-3: imza yönetici olmayan rollerden sıraca ilkinin adı; yalnız bayraklı rolde Yönetim', () => {
    assert.equal(yanitImzasi([{ ad: 'Müdür', yonetici: false }, { ad: 'İnsan Kaynakları', yonetici: false }]), 'İnsan Kaynakları');
    assert.equal(yanitImzasi([{ ad: 'Yönetici', yonetici: true }, { ad: 'Müdür', yonetici: false }]), 'Müdür');
    assert.equal(yanitImzasi([{ ad: 'Yönetici', yonetici: true }]), YONETIM_IMZASI);
    assert.equal(yanitImzasi([]), YONETIM_IMZASI);
  });

  test('GBM-4: toplama tek kademe; kendine, bağlı kayda ve bağlıları olan kayıttan bağlama reddedilir', () => {
    assert.equal(anaKayitHatasi({ id: 5, anaKayitId: null, ananinAnasi: null, bagliSayisi: 3 }), null);
    assert.equal(anaKayitHatasi({ id: 5, anaKayitId: 2, ananinAnasi: null, bagliSayisi: 0 }), null);
    assert.match(anaKayitHatasi({ id: 5, anaKayitId: 5, ananinAnasi: null, bagliSayisi: 0 }) ?? '', /kendisine/);
    assert.match(anaKayitHatasi({ id: 5, anaKayitId: 2, ananinAnasi: 1, bagliSayisi: 0 }) ?? '', /#1/);
    assert.match(anaKayitHatasi({ id: 5, anaKayitId: 2, ananinAnasi: null, bagliSayisi: 1 }) ?? '', /bağlı kayıtlar/);
  });

  test('GBM-5: pasif kategori yeni seçilmez, kayıttaki pasif kategori kalabilir; olmayan kategori seçilmez', () => {
    assert.equal(kategoriSecilebilir({ id: 1, etkin: true }, null), true);
    assert.equal(kategoriSecilebilir({ id: 1, etkin: false }, null), false);
    assert.equal(kategoriSecilebilir({ id: 1, etkin: false }, 1), true);
    assert.equal(kategoriSecilebilir(null, null), false);
  });

  test('GBM-6: ortanca tek ve çift sayıda; boşta null', () => {
    assert.equal(ortanca([]), null);
    assert.equal(ortanca([5, 1, 3]), 3);
    assert.equal(ortanca([4, 1, 3, 10]), 3.5);
    assert.equal(ortanca([1 / 3]), 0.33);
  });

  test('GBM-7: eğilim bu ay dahil son altı ay; yıl dönümü geçilir', () => {
    assert.deepEqual(ozetAylari('2026-11-06'), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    assert.deepEqual(ozetAylari('2027-02-28'), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });
  test('GBM-8: uygulama konulu kayıt ayrı türle duyurulur', () => {
    assert.equal(gelenBildirimTuru('sirket'), 'profil.geri-bildirim-geldi');
    assert.equal(gelenBildirimTuru('uygulama'), 'profil.uygulama-geri-bildirimi-geldi');
  });

  test('GBM-9: kapanış yalnız açık kayıt sonuçlanınca bildirilir', () => {
    assert.equal(kapanisBildirilir('yanitlandi', 'cozuldu'), true);
    assert.equal(kapanisBildirilir('yeni', 'kapandi'), true);
    assert.equal(kapanisBildirilir('cozuldu', 'kapandi'), false);
    assert.equal(kapanisBildirilir('kapandi', 'inceleniyor'), false);
  });
});
