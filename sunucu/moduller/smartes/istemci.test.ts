import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import type { IstemciSecenegi, SmartesIstemcisi } from './istemci.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteSmartes } from './sahte-smartes.ts';

describe('SmartES istemcisi, sahte SmartES ile (kart #778)', () => {
  let sahte: SahteSmartes;
  let beklemeler: number[] = [];

  const kur = (secenek: IstemciSecenegi = {}): SmartesIstemcisi =>
    smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, {
      bekle: async (ms) => { beklemeler.push(ms); },
      istekSuresiMs: 5000,
      listeSuresiMs: 5000,
      ...secenek,
    });

  before(async () => { sahte = await sahteSmartesAc(); });
  after(async () => { await sahte.kapat(); });
  beforeEach(() => {
    sahte.cagrilar.length = 0;
    sahte.isleyiciler.clear();
    beklemeler = [];
  });

  test('SME-8: skaler çağrı başlıkları ve parametreleri gönderir, sonucu okur', async () => {
    sahte.isleyiciler.set('WorkStationCreateUpdate', () => ({ tur: 'skaler', etkilenen: 1 }));
    const r = await kur().skaler('WorkStationCreateUpdate', [['WorkStationCode', 'TST'], ['WorkStationName', 'Ş & Ğ']], { yinele: false });
    assert.deepEqual(r, { tur: 'basarili', deger: { etkilenen: 1, hata: null } });
    const [c] = sahte.cagrilar;
    assert.equal(c?.metot, 'WorkStationCreateUpdate');
    assert.equal(c?.soapAction, '"http://tempuri.org/WorkStationCreateUpdate"');
    assert.match(c?.icerikTuru ?? '', /^text\/xml; charset=utf-8$/);
    assert.deepEqual(c?.parametreler, { WorkStationCode: 'TST', WorkStationName: 'Ş & Ğ' });
  });

  test('SME-8: liste çağrısı satırları döndürür', async () => {
    sahte.isleyiciler.set('DownTimeList', () => ({ tur: 'tablo', satirlar: [{ DOWNTIME_ID: '7' }] }));
    assert.deepEqual(await kur().liste('DownTimeList', []), { tur: 'basarili', deger: [{ DOWNTIME_ID: '7' }] });
  });

  test('SME-9: Fault (HTTP 500) yinelenmez; ileti saklanır', async () => {
    sahte.isleyiciler.set('M', () => ({ tur: 'fault', ileti: 'Metot bulunamadı' }));
    assert.deepEqual(await kur().liste('M', []), { tur: 'fault', ileti: 'Metot bulunamadı' });
    assert.equal(sahte.cagrilar.length, 1);
    assert.deepEqual(beklemeler, []);
  });

  test('SME-9: zaman aşımında 3 kez geri çekilerek yinelenir (1-3-9 sn), sonra zaman-asimi', async () => {
    sahte.isleyiciler.set('M', () => ({ tur: 'cevapsiz' }));
    const r = await kur({ listeSuresiMs: 150 }).liste('M', []);
    assert.equal(r.tur, 'zaman-asimi');
    assert.equal(sahte.cagrilar.length, 4);
    assert.deepEqual(beklemeler, [1000, 3000, 9000]);
  });

  test('SME-9: yinele=false olan yazma zaman aşımında yinelenmez', async () => {
    sahte.isleyiciler.set('M', () => ({ tur: 'cevapsiz' }));
    const r = await kur({ istekSuresiMs: 150 }).skaler('M', [], { yinele: false });
    assert.equal(r.tur, 'zaman-asimi');
    assert.equal(sahte.cagrilar.length, 1);
  });

  test('SME-9: kopan bağlantı ve HTTP 503 bir kez yinelenir; ikincisi geçerse başarı', async () => {
    let n = 0;
    sahte.isleyiciler.set('M', () => (n++ === 0 ? { tur: 'kopar' } : { tur: 'tablo', satirlar: [] }));
    assert.deepEqual(await kur().liste('M', []), { tur: 'basarili', deger: [] });
    assert.deepEqual(beklemeler, [1000]);
    sahte.isleyiciler.set('N', () => ({ tur: 'http', durum: 503, govde: 'Service Unavailable' }));
    const r = await kur().liste('N', []);
    assert.deepEqual(r, { tur: 'http', durum: 503, ileti: 'SmartES HTTP 503 döndü.' });
  });

  test('SME-9: HTTP 404 yinelenmez; 200 ile gelen bozuk gövde "bozuk"', async () => {
    sahte.isleyiciler.set('M', () => ({ tur: 'http', durum: 404, govde: 'Not Found' }));
    assert.equal((await kur().liste('M', [])).tur, 'http');
    assert.equal(sahte.cagrilar.length, 1);
    sahte.isleyiciler.set('N', () => ({ tur: 'http', durum: 200, govde: '<html>giris</html>' }));
    assert.equal((await kur().liste('N', [])).tur, 'bozuk');
  });

  test('SME-10: ulaşılamayan adres sabit ileti verir; adres iletide geçmez', async () => {
    const istemci = smartesIstemcisiKur({ adres: 'http://127.0.0.1:9/Yok.asmx', adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {} });
    const r = await istemci.liste('M', []);
    assert.equal(r.tur, 'ag');
    assert.equal(JSON.stringify(r).includes('127.0.0.1'), false);
  });
});
