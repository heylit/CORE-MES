import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { baglantiHatasiMetni, baglantiHatasiOzeti, yazilamiyorSatirlari } from './logo-baglanti-metni.ts';
import type { LogoYardimciBaglantiHatasi } from './sozlesme/logo.ts';

const hata: LogoYardimciBaglantiHatasi = {
  zaman: '2026-11-25T09:14:00.000Z', adim: 'UserLogin', kod: -93, ileti: '[code=-93] Kullanıcı sayısı limiti aşılmıştır',
  aciklama: 'Logo lisansı dolu ya da oturum başka yerde açık.', yenidenDeneme: '2026-11-25T09:19:00.000Z',
};

describe('Logo bağlantı hatası metni (3698)', () => {
  test('zaman tesis saatiyle, adım, kod, açıklama ve yeniden deneme saati yazılır', () => {
    const m = baglantiHatasiMetni(hata, new Date('2026-11-25T09:15:00.000Z'));
    assert.deepEqual(m, { baslik: '25.11.2026 12:14 · UserLogin · kod -93', ayrinti: 'Logo lisansı dolu ya da oturum başka yerde açık', yenidenDeneme: '12:19', gecti: false });
    assert.equal(baglantiHatasiOzeti(hata, new Date('2026-11-25T09:15:00.000Z')),
      'Logo lisansı dolu ya da oturum başka yerde açık. 25.11.2026 12:14 · UserLogin · kod -93 · Logo: [code=-93] Kullanıcı sayısı limiti aşılmıştır · Yeniden deneme: 12:19');
  });
  test('bilinmeyen kod düz gösterilir: açıklama yoksa Logo\'nun metni, ikisi de yoksa boş; bekleme bildirilmediyse yeniden deneme yok', () => {
    const m = baglantiHatasiMetni({ ...hata, kod: null, aciklama: null, yenidenDeneme: null });
    assert.equal(m.baslik, '25.11.2026 12:14 · UserLogin · kod okunamadı');
    assert.equal(m.ayrinti, '[code=-93] Kullanıcı sayısı limiti aşılmıştır');
    assert.equal(m.yenidenDeneme, null);
    assert.equal(m.gecti, false);
    assert.equal(baglantiHatasiMetni({ ...hata, adim: null, aciklama: null, ileti: null }).ayrinti, '');
  });
  test('yeniden deneme saati geçtiyse işaretlenir', () => {
    assert.equal(baglantiHatasiMetni(hata, new Date('2026-11-25T09:20:00.000Z')).gecti, true);
    assert.match(baglantiHatasiOzeti(hata, new Date('2026-11-25T09:20:00.000Z')), /zamanı geçti/);
  });
  test('yazılamıyor uyarısı üç satırdır: özet, neden, teknik ayrıntı; çift nokta olmaz', () => {
    const m = yazilamiyorSatirlari(hata, new Date('2026-11-25T09:15:00.000Z'));
    assert.equal(m.ozet, "Logo'ya yazılamıyor: oturum açılamıyor, giden belgeler bekliyor.");
    assert.equal(m.neden, 'Logo lisansı dolu ya da oturum başka yerde açık');
    assert.equal(m.teknik, '25.11.2026 12:14 · UserLogin · kod -93 · Logo: [code=-93] Kullanıcı sayısı limiti aşılmıştır · Yeniden deneme: 12:19');
    const noktali = yazilamiyorSatirlari({ ...hata, aciklama: null, ileti: 'Parola hatalı.' }, new Date('2026-11-25T09:15:00.000Z'));
    assert.equal(noktali.neden, 'Parola hatalı');
    assert.ok(!noktali.teknik.includes('..') && !baglantiHatasiOzeti({ ...hata, aciklama: null, ileti: 'Parola hatalı.' }).includes('..'));
  });
});
