import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bosKullaniciAdi, ikRolVerebilirMi, kullaniciAdiKoku, pinHatasi, rastgelePin } from './kurallar.ts';

// 1925 a: İK'nın açtığı hesabın kuralları (saf). Adlar uydurmadır.
describe('İK hesap açma kuralları', () => {
  test('İK yalnız yetki dağıtmayan rolü verebilir', () => {
    assert.equal(ikRolVerebilirMi({ yonetici: false, islemler: ['sayfa.ik-islemlerim', 'ik.izin-talep'] }), true);
    assert.equal(ikRolVerebilirMi({ yonetici: true, islemler: [] }), false);
    for (const islem of ['kisiler.rol-yonet', 'kisiler.parola-degistir', 'ik.hesap-ac']) {
      assert.equal(ikRolVerebilirMi({ yonetici: false, islemler: ['sayfa.mesaj', islem] }), false, islem);
    }
  });

  test('kullanıcı adı kökü Türkçe harfi düzeltir; kısa ad boş döner; dolu ad sayıyla ayrılır ve 40 karakteri aşmaz', () => {
    assert.equal(kullaniciAdiKoku('Şükrü Çağlar Öz'), 'sukru.caglar.oz');
    assert.equal(kullaniciAdiKoku('Al'), '');
    assert.equal(bosKullaniciAdi('ayse.deneme', new Set()), 'ayse.deneme');
    assert.equal(bosKullaniciAdi('ayse.deneme', new Set(['ayse.deneme', 'ayse.deneme2'])), 'ayse.deneme3');
    const uzun = 'a'.repeat(40);
    assert.equal(bosKullaniciAdi(uzun, new Set([uzun])), `${'a'.repeat(39)}2`);
  });

  test('geçici PIN PIN kuralını geçer; tekrar ya da sıra çekilirse yeniden çekilir', () => {
    const cekilisler = [1, 1, 1, 1, 1, 1, 4, 0, 7, 2, 9, 5];
    const pin = rastgelePin(() => cekilisler.shift() ?? 0);
    assert.equal(pin, '407295');
    assert.equal(pinHatasi(pin), null);
    for (let i = 0; i < 50; i += 1) assert.equal(pinHatasi(rastgelePin(() => Math.floor(Math.random() * 10))), null);
  });
});
