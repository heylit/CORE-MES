import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { lsv2MakineleriOku, LSV2_DEGISKENI } from './ayar.ts';
import { lsv2Ogeleri, ozetle } from './kurallar.ts';
import { IZINLI_KOMUTLAR, lsv2IstemcisiKur, Lsv2Hatti, Lsv2YasakHatasi, telgrafKur } from './lsv2.ts';
import type { Lsv2Komutu } from './lsv2.ts';
import { sahteLsv2Ac } from './sahte-lsv2.ts';
import type { SahteLsv2, SahteMakine } from './sahte-lsv2.ts';

// Kart 3753: Heidenhain LSV2 salt okuma. Testler yalnız yerel sahte sunucuya bağlanır; adresler ve sayaç adresleri uydurmadır.
const ZAMAN = new Date('2026-11-26T09:00:00Z');
const D10000 = 10_000;
const kelimeBasi = 0x2000;

const sahteler: SahteLsv2[] = [];
const ac = async (m: SahteMakine): Promise<SahteLsv2> => {
  const s = await sahteLsv2Ac(m);
  sahteler.push(s);
  return s;
};
const istemci = (s: SahteLsv2, sayac: number | null = D10000, sure = 1000) => lsv2IstemcisiKur('127.0.0.1', sayac, { kapi: s.kapi, istekSuresiMs: sure });
afterEach(async () => {
  await Promise.all(sahteler.splice(0).map((s) => s.kapat()));
});

const calisan = (): SahteMakine => ({
  kip: 4, programDurumu: 0, program: 'TNC:/ORN/P100.h', oranlar: [110, 95, 100], takim: 12, hatalar: [], plc: new Map([[D10000, 148]]),
});
const yuk = (...b: number[]) => Uint8Array.from(b);
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; };

describe('LSV2 beyaz liste (kabul 1)', () => {
  test('yazma, kontrol (C_), dosya ve izin listesi dışı her komut kurulmadan reddedilir', () => {
    for (const komut of ['C_CC', 'C_FD', 'C_FL', 'C_EK', 'C_MC', 'C_LK', 'C_DM', 'C_ST', 'R_FL', 'R_DR', 'R_DP', 'R_MC', 'R_OC', 'W_XX', 'A_L']) {
      assert.throws(() => telgrafKur(komut, yuk(), null), Lsv2YasakHatasi, komut);
    }
  });

  test('giriş yalnız INSPECT, DNC ve PLCDEBUG; parola eklenemez', () => {
    for (const g of ['INSPECT', 'DNC', 'PLCDEBUG']) assert.doesNotThrow(() => telgrafKur('A_LG', Buffer.from(`${g}\0`, 'latin1'), null));
    for (const g of ['FILE\0', 'MONITOR\0', 'DIAGNOSTICS\0', 'DATA\0', 'OSZI\0', 'PLCDEBUG\0ORN-PAROLA\0', 'INSPECT']) {
      assert.throws(() => telgrafKur('A_LG', Buffer.from(g, 'latin1'), null), Lsv2YasakHatasi, g);
    }
  });

  test('R_RI yalnız izinli okuma kodlarıyla; R_VR, R_PR, A_LO yük taşımaz', () => {
    for (const kod of [23, 24, 25, 26, 27, 28, 51]) assert.doesNotThrow(() => telgrafKur('R_RI', yuk(0, kod), null));
    for (const kod of [20, 21, 22, 30, 31, 32]) assert.throws(() => telgrafKur('R_RI', yuk(0, kod), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_RI', yuk(0, 23, 0), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_VR', yuk(5), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_PR', yuk(1), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('A_LO', Buffer.from('INSPECT\0', 'latin1'), null), Lsv2YasakHatasi);
  });

  test('PLC belleği yalnız ayardaki sayaç adresinden, yalnız 4 bayt okunur', () => {
    const adres = kelimeBasi + D10000;
    assert.doesNotThrow(() => telgrafKur('R_MB', Buffer.concat([u32(adres), yuk(4)]), adres));
    assert.throws(() => telgrafKur('R_MB', Buffer.concat([u32(adres), yuk(4)]), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_MB', Buffer.concat([u32(adres + 4), yuk(4)]), adres), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_MB', Buffer.concat([u32(adres), yuk(8)]), adres), Lsv2YasakHatasi);
  });

  test('liste dışı telgraf açık bağlantıda da soketten çıkmaz', async () => {
    const s = await ac(calisan());
    const hat = new Lsv2Hatti('127.0.0.1', s.kapi, 1000);
    await hat.ac();
    for (const komut of ['C_CC', 'C_FL', 'R_FL']) assert.throws(() => hat.istek(komut as Lsv2Komutu, yuk(0, 1), null), Lsv2YasakHatasi);
    assert.throws(() => hat.istek('R_MB', Buffer.concat([u32(kelimeBasi), yuk(4)]), null), Lsv2YasakHatasi);
    const c = await hat.istek('A_LG', Buffer.from('INSPECT\0', 'latin1'), null);
    assert.equal(c.kod, 'T_OK');
    hat.kapat();
    assert.deepEqual(s.gelenler.map((g) => g.komut), ['A_LG']);
  });

  test('tam okumada makineye giden her telgraf izin listesindedir; C_ komutu hiç gitmez', async () => {
    const s = await ac(calisan());
    const i = istemci(s);
    assert.equal((await i.oku()).tur, 'basarili');
    i.kapat();
    assert.ok(s.gelenler.length > 0);
    for (const g of s.gelenler) {
      assert.ok((IZINLI_KOMUTLAR as readonly string[]).includes(g.komut), g.komut);
      assert.ok(!g.komut.startsWith('C_'));
    }
    const girisler = s.gelenler.filter((g) => g.komut === 'A_LG').map((g) => g.yuk.toString('latin1'));
    assert.deepEqual(girisler, ['INSPECT\0', 'DNC\0', 'PLCDEBUG\0']);
  });
});

describe('LSV2 okuması TezgahOgesi\'ne çevrilir (kabul 2)', () => {
  test('durum, kip, program, takım, oranlar ve sayaç; özet bugünkü alanları doldurur', async () => {
    const s = await ac(calisan());
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.kontrol, 'ORN-TNC640');
    assert.equal(r.okuma.sayac, 148);
    const ozet = ozetle(lsv2Ogeleri(r.okuma, ZAMAN));
    assert.deepEqual(
      { durum: ozet.durum, calisma: ozet.calisma, mod: ozet.mod, program: ozet.program, sayac: ozet.sayac, takim: ozet.takim, alarm: ozet.alarm },
      { durum: 'calisiyor', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'TNC:/ORN/P100.h', sayac: 148, takim: '12', alarm: null },
    );
    // Oran hız değildir: iş mili hızı, yükü ve ilerleme hızı uydurulmaz.
    assert.deepEqual([ozet.isMiliHizi, ozet.isMiliYuku, ozet.ilerleme], [null, null, null]);
    const ogeler = lsv2Ogeleri(r.okuma, ZAMAN);
    assert.equal(ogeler.find((o) => o.tur === 'PathFeedrateOverride')?.deger, '110');
    assert.equal(ogeler.find((o) => o.tur === 'RotaryVelocityOverride')?.deger, '95');
  });

  test('kumanda hata iletisi alarm olur; program durumu durdu', async () => {
    const s = await ac({ ...calisan(), programDurumu: 5, hatalar: [{ sinif: 1, grup: 2, no: 1101, metin: 'ORN hata iletisi' }, { sinif: 1, grup: 2, no: 1102, metin: 'ORN ikinci' }] });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.hatalar?.length, 2);
    const ozet = ozetle(lsv2Ogeleri(r.okuma, ZAMAN));
    assert.equal(ozet.durum, 'alarm');
    assert.equal(ozet.alarm, 'SYSTEM: ORN hata iletisi · ORN ikinci');
    assert.equal(ozet.calisma, 'STOPPED');
  });

  test('tek kalıcı bağlantı: art arda okumalar aynı bağlantıdan, giriş bir kez', async () => {
    const s = await ac(calisan());
    const i = istemci(s);
    for (let n = 0; n < 3; n += 1) assert.equal((await i.oku()).tur, 'basarili');
    i.kapat();
    assert.equal(s.kabulEdilen(), 1);
    assert.equal(s.gelenler.filter((g) => g.komut === 'A_LG' && g.yuk.toString('latin1') === 'INSPECT\0').length, 1);
  });
});

describe('LSV2 hata halleri (kabul 3)', () => {
  test('bağlantı reddi: "kapalı ya da meşgul", değer yok; okuma yokken yalnız erişim öğesi kalır', async () => {
    const s = await sahteLsv2Ac();
    const kapi = s.kapi;
    await s.kapat();
    const i = lsv2IstemcisiKur('127.0.0.1', D10000, { kapi, istekSuresiMs: 1000 });
    const r = await i.oku();
    assert.equal(r.tur, 'kapali');
    const ogeler = lsv2Ogeleri(null, ZAMAN);
    assert.deepEqual(ogeler.map((o) => [o.tur, o.deger]), [['Availability', null]]);
    const ozet = ozetle(ogeler);
    assert.equal(ozet.durum, 'baglanti-yok');
    assert.deepEqual([ozet.program, ozet.sayac, ozet.takim, ozet.alarm], [null, null, null, null]);
  });

  test('zaman aşımı: cevap gelmezse süre dolunca bağlantı bırakılır', async () => {
    const s = await ac({ ...calisan(), bozuk: 'cevapsiz' });
    const i = istemci(s, D10000, 150);
    const r = await i.oku();
    assert.equal(r.tur, 'zaman-asimi');
    i.kapat();
  });

  test('yarım çerçeve: bozuk sayılır, değer üretilmez', async () => {
    const s = await ac({ ...calisan(), bozuk: 'yarim' });
    const i = istemci(s);
    const r = await i.oku();
    assert.equal(r.tur, 'bozuk');
    i.kapat();
  });

  test('PLC yetki hatası (NO_PRIV): sayaç null, "yetki yok" uyarısı; öteki değerler okunur', async () => {
    const s = await ac({ ...calisan(), plcYetkiYok: true });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.sayac, null);
    assert.deepEqual(r.okuma.uyarilar, ['sayac-yetki-yok']);
    assert.equal(r.okuma.program, 'TNC:/ORN/P100.h');
    assert.ok(!s.gelenler.some((g) => g.komut === 'R_MB'), 'yetki yokken PLC okunmaz');
  });

  test('DNC kapalı: durum, program, takım ve alarm null, uyarı yazılır', async () => {
    const s = await ac({ ...calisan(), dncYok: true });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.deepEqual([r.okuma.kip, r.okuma.programDurumu, r.okuma.program, r.okuma.takim, r.okuma.hatalar], [null, null, null, null, null]);
    assert.ok(r.okuma.uyarilar.includes('dnc-yok'));
    assert.equal(ozetle(lsv2Ogeleri(r.okuma, ZAMAN)).durum, 'bilinmiyor');
  });

  test('sayaç adresi kelime alanı dışındaysa PLC hiç sorgulanmaz', async () => {
    const s = await ac({ ...calisan(), kelimeSayisi: 100 });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.sayac, null);
    assert.deepEqual(r.okuma.uyarilar, ['sayac-adresi-yok']);
    assert.ok(!s.gelenler.some((g) => g.komut === 'R_MB' || (g.komut === 'A_LG' && g.yuk.toString('latin1') === 'PLCDEBUG\0')));
  });

  test('sayaç adresi verilmemişse PartCount null kalır, PLC sorgulanmaz', async () => {
    const s = await ac(calisan());
    const i = istemci(s, null);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(ozetle(lsv2Ogeleri(r.okuma, ZAMAN)).sayac, null);
    assert.ok(!s.gelenler.some((g) => g.komut === 'R_MB'));
  });

  test('başka sistem bağlıyken ikinci bağlantı reddedilirse geri çekilinir; ilk bağlantı bozulmaz (kabul 5)', async () => {
    const s = await ac({ ...calisan(), tekBaglanti: true });
    const smartes = istemci(s);
    assert.equal((await smartes.oku()).tur, 'basarili');
    const core = istemci(s);
    const r = await core.oku();
    assert.equal(r.tur, 'kapali');
    assert.equal(s.baglantiSayisi(), 1);
    assert.equal((await smartes.oku()).tur, 'basarili', 'ilk bağlantının okuması sürer');
    smartes.kapat();
    core.kapat();
  });
});

describe('Heidenhain makine listesi ayarı (kabul 4)', () => {
  const oku = (deger: string | undefined) => lsv2MakineleriOku({ [LSV2_DEGISKENI]: deger });

  test('boş ya da tanımsız: liste boş (bağlantı açılmaz)', () => {
    assert.deepEqual(oku(undefined), []);
    assert.deepEqual(oku('  '), []);
  });

  test('geçerli liste: kurum içi IP, isteğe bağlı D sayaç adresi', () => {
    assert.deepEqual(oku('ORN-H01=127.0.0.11;D10000, ORN-H02=127.0.0.12'), [
      { cihazAdi: 'ORN-H01', adres: '127.0.0.11', sayac: 10_000 },
      { cihazAdi: 'ORN-H02', adres: '127.0.0.12', sayac: null },
    ]);
  });

  test('dış adres, ad, kapı, bozuk sayaç ve tekrarlanan ad açılışı durdurur; ileti değeri söylemez', () => {
    for (const deger of [
      'ORN-H01=192.0.2.11', 'ORN-H01=203.0.113.7;D10000', 'ORN-H01=makine01', 'ORN-H01=orn.example', 'ORN-H01=127.0.0.11:19000',
      'ORN-H01=127.0.0.11;D10001', 'ORN-H01=127.0.0.11;W10000', 'ORN-H01=127.0.0.11;D10000;D4', 'ORN-H01', '=127.0.0.11',
      'ORN-H01=127.0.0.11,orn-h01=127.0.0.12', 'ORN H01=127.0.0.11',
    ]) {
      assert.throws(() => oku(deger), (h: Error) => h.message.startsWith(`Ortam değişkeni geçersiz: ${LSV2_DEGISKENI}`) && !h.message.includes('192.0.2') && !h.message.includes('127.0.0'), deger);
    }
  });
});
