import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { operasyonTipiGuncellemeGovdesi, operasyonTipiGovdesi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { katalogKartiKaydetGovdesi } from '#paylasilan/sozlesme/malzemeler.ts';

// Köprü (istemci/src/moduller/recete-rota/kopru.ts) sahiplerin uçlarına bu gövdeleri gönderir; istemci testleri (kopru-komut.test.ts) aynı
// gövdeleri birebir sabitler, burada sahibin gerçek şemasıyla kabul ve ret sınanır.
describe('köprü gövdeleri sahiplerin şemasına uyar', () => {
  const mevcut = { ad: 'Testere', grup: 'KES', aktif: false, kisaltma: 'TST', varsayilanAyarDk: '5', varsayilanBirimDk: '2.5', varsayilanIstasyonId: 31, surum: 7 };

  test('KS-1: operasyon tipi düzenleme gövdesi (kayıttan birleştirilmiş) kabul edilir ve pasif tip pasif kalır; kısmi gövde reddedilir', () => {
    const g = operasyonTipiGuncellemeGovdesi.parse(mevcut);
    assert.equal(g.aktif, false);
    assert.equal(operasyonTipiGuncellemeGovdesi.safeParse({ varsayilanBirimDk: '2.5', surum: 7 }).success, false);
    assert.equal(operasyonTipiGuncellemeGovdesi.safeParse({ ad: 'Testere', varsayilanBirimDk: '2.5', surum: 7 }).success, false);
    // aktif hiç gönderilmeseydi sahibin şeması etkin sayardı: köprü bu yüzden her zaman gönderir.
    assert.equal(operasyonTipiGuncellemeGovdesi.parse({ ad: 'Testere', grup: 'KES', surum: 7 }).aktif, true);
  });

  test('KS-2: operasyon tipi ekleme gövdesi kabul edilir; grup ve ad zorunlu', () => {
    assert.equal(operasyonTipiGovdesi.safeParse({ kod: 'BOY-TOZ', ad: 'Toz boya', grup: 'BOY', kisaltma: 'toz', varsayilanAyarDk: '12', varsayilanBirimDk: '4', varsayilanIstasyonId: null }).success, true);
    assert.equal(operasyonTipiGovdesi.safeParse({ kod: 'BOY-TOZ', varsayilanAyarDk: '12' }).success, false);
  });

  test('KS-3: taslak kart gövdesi (hammadde, benzersiz anahtarlı ve anahtarsız) şemaya uyar; anahtarın zorunluluğu şemada değil sahibin servisindedir', () => {
    const kart = (anahtar: string | null) => ({
      kayit: { id: 'rr0123456789abcdef0123456789abcdef', tur: 'hammadde', onay: { durum: 'taslak' }, com: { ad: 'Sac', birim: 'kg' }, g: {} },
      ozet: { tur: 'hammadde', onay_durumu: 'taslak', stok_kodu: null, benzersiz_anahtar: anahtar, mukerrer_gerekcesi: null },
      surum: null,
    });
    assert.equal(katalogKartiKaydetGovdesi.safeParse(kart('S235-2MM')).success, true);
    assert.equal(katalogKartiKaydetGovdesi.safeParse(kart(null)).success, true);
    assert.equal(katalogKartiKaydetGovdesi.safeParse({ ...kart('x'), surum: 0 }).success, false);
  });
});
