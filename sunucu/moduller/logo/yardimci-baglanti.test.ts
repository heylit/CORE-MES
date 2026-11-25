import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { baglantiHatasiniTemizle, oturumAcildi, sonBaglantiHatasi, yardimciCevabiniIzle, YAZMA_UYARISI_PENCERESI_MS, yazmaUyarisi } from './yardimci-baglanti.ts';

const GOVDE = { neden: 'baglanamadi', adim: 'UserLogin', kod: -93, ileti: '[code=-93] Kullanıcı sayısı limiti aşılmıştır', beklemeSn: 240 };
const T = new Date('2026-11-25T09:00:00.000Z');
const sonra = (ms: number): Date => new Date(T.getTime() + ms);

// 3698: "Logo'ya yazılamıyor" uyarısının kuralları (süreç belleği). Hazırlık cevabına ve bağlantı izleme ekranına buradan gelir.
describe('Logo yardımcısı yazma uyarısı', () => {
  beforeEach(() => baglantiHatasiniTemizle());

  test('15 dakika: yazmadan gelen 503 tam 15 dakika görünür, bir milisaniye sonra kalkar', () => {
    yardimciCevabiniIzle('POST', 503, GOVDE, T);
    assert.equal(YAZMA_UYARISI_PENCERESI_MS, 15 * 60_000);
    assert.equal(yazmaUyarisi(sonra(0))?.kod, -93);
    assert.equal(yazmaUyarisi(sonra(14 * 60_000 + 59_999))?.adim, 'UserLogin');
    assert.equal(yazmaUyarisi(sonra(15 * 60_000))?.adim, 'UserLogin', 'sınırda hâlâ görünür');
    assert.equal(yazmaUyarisi(sonra(15 * 60_000 + 1)), null);
  });

  test('GET isteğinden gelen 503 yazma sayılmaz: son bağlantı hatası olur, "yazılamıyor" uyarısı çıkmaz', () => {
    yardimciCevabiniIzle('GET', 503, GOVDE, T);
    assert.equal(sonBaglantiHatasi()?.kod, -93);
    assert.equal(yazmaUyarisi(sonra(1000)), null);
  });

  test('oturum açılınca ikisi de silinir; başarılı yazma da siler, başarılı okuma silmez', () => {
    yardimciCevabiniIzle('POST', 503, GOVDE, T);
    yardimciCevabiniIzle('GET', 200, {}, sonra(1000));
    assert.notEqual(yazmaUyarisi(sonra(2000)), null, 'okuma uyarıyı gizlemez');
    oturumAcildi();
    assert.equal(yazmaUyarisi(sonra(3000)), null);
    assert.equal(sonBaglantiHatasi(), null);
    yardimciCevabiniIzle('POST', 503, GOVDE, T);
    yardimciCevabiniIzle('POST', 200, { success: true }, sonra(1000));
    assert.equal(yazmaUyarisi(sonra(2000)), null);
    assert.equal(sonBaglantiHatasi(), null);
  });
});
