import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { motorGirdisiDenetle, motorPlaniDenetle } from './motor-sinir.ts';
import { motorYukle, planCoz, type MotorDurumu } from './plan-motoru.ts';

const veri = () => ({
  meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
  calismaGunleri: { pzt: ['V'], sal: ['V'], car: ['V'], per: ['V'], cum: ['V'] },
  tezgahlar: [{ id: 'T1', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'] }],
  urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
  siparisler: [{ id: 'S1', urun: 'U', adet: 4, termin: '2026-01-09 17:00' }],
});
const durum = (D: unknown = veri()): MotorDurumu => ({
  D, now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { ...motorYukle().W0 },
});
const reddi = (f: () => unknown, alan: RegExp) => assert.throws(f, (e: unknown) => e instanceof UygulamaHatasi && alan.test(e.message));

describe('plan motoru sınırı (1462)', () => {
  test('geçerli girdi geçer; motorun okumadığı alanlar dokunulmadan kalır', () => {
    assert.doesNotThrow(() => motorGirdisiDenetle(durum({ ...veri(), planTL: { amac: 'sira' }, bilinmeyenAlan: [1] })));
  });

  test('saati bozuk vardiya, başlangıcı olmayan çalışma ve sayı olmayan adet reddedilir; ileti alanı söyler', () => {
    reddi(() => motorGirdisiDenetle(durum({ ...veri(), vardiyalar: [{ id: 'V', bas: '8', bit: '16:00' }] })), /D\.vardiyalar\.0\.bas/);
    reddi(() => motorGirdisiDenetle(durum({ ...veri(), meta: {} })), /D\.meta\.baslangic/);
    reddi(() => motorGirdisiDenetle(durum({ ...veri(), siparisler: [{ id: 'S1', urun: 'U', adet: 'dört' }] })), /D\.siparisler\.0\.adet/);
  });

  test('sayı metni süre kabul edilir; boş metin ve eksi süre reddedilir (motor onları sessizce 0 okurdu)', () => {
    const sureli = (cevrim: unknown) => durum({ ...veri(), urunler: [{ id: 'U', rota: [{ k: '10', tezgahlar: [{ id: 'T1', cevrim }] }] }] });
    assert.doesNotThrow(() => motorGirdisiDenetle(sureli('12.5')));
    reddi(() => motorGirdisiDenetle(sureli('')), /cevrim/);
    reddi(() => motorGirdisiDenetle(sureli(-5)), /cevrim/);
  });

  test('termin metin, saat ekseninde sayı ya da boş olabilir; bozuk tarih reddedilir', () => {
    const terminli = (termin: unknown) => durum({ ...veri(), siparisler: [{ id: 'S1', urun: 'U', adet: 1, termin }] });
    for (const t of ['2026-01-09', '2026-01-09 17:00', 96, null]) assert.doesNotThrow(() => motorGirdisiDenetle(terminli(t)));
    reddi(() => motorGirdisiDenetle(terminli('09.01.2026')), /termin/);
  });

  test('çıktıda sonsuz ya da ters saat reddedilir', () => {
    assert.doesNotThrow(() => motorPlaniDenetle({ ops: { 'S1.10': { m: 'T1', S: 0, C: 4 } }, fail: [] }));
    reddi(() => motorPlaniDenetle({ ops: { 'S1.10': { m: 'T1', S: 0, C: Infinity } } }), /ops\.S1\.10\.C/);
    reddi(() => motorPlaniDenetle({ ops: { 'S1.10': { m: 'T1', S: 5, C: 4 } } }), /bitiş başlangıçtan önce/);
  });

  test('planCoz bozuk girdiyi işçiye göndermeden reddeder; geçerli girdi plan verir', async () => {
    await assert.rejects(planCoz({ durum: durum({ ...veri(), tezgahlar: 'T1' }), kip: 'yeni', taban: null }), /girdisi geçersiz.*D\.tezgahlar/);
    await assert.rejects(planCoz({ durum: durum(), kip: 'sabit', taban: { ops: { x: { m: '', S: 0, C: 1 } } } }), /taban planı geçersiz.*ops\.x\.m/);
    const p = await planCoz({ durum: durum(), kip: 'yeni', taban: null });
    assert.equal(p.ops['S1.10']?.m, 'T1');
  });
});
