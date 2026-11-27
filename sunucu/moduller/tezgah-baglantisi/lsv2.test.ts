import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { lsv2GecmisteYok, lsv2Ogeleri, lsv2TaniMetni, ozetle } from './kurallar.ts';
import { dosyaYuku, IZINLI_KOMUTLAR, lsv2IstemcisiKur, Lsv2Hatti, Lsv2YasakHatasi, TAKIM_TABLOSU, telgrafKur } from './lsv2.ts';
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
const PLC = { plcSayaci: true } as const;
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

  test('giriş yalnız INSPECT, DNC, PLCDEBUG, FILE ve DIAGNOSTICS; parola eklenemez', () => {
    for (const g of ['INSPECT', 'DNC', 'PLCDEBUG', 'FILE', 'DIAGNOSTICS']) assert.doesNotThrow(() => telgrafKur('A_LG', Buffer.from(`${g}\0`, 'latin1'), null));
    for (const g of ['FILE\0ORN-PAROLA\0', 'DIAGNOSTICS\0ORN-PAROLA\0', 'FILESYS\0', 'FILEPLC\0', 'MONITOR\0', 'DSP\0', 'DATA\0', 'OSZI\0', 'PLCDEBUG\0ORN-PAROLA\0', 'INSPECT']) {
      assert.throws(() => telgrafKur('A_LG', Buffer.from(g, 'latin1'), null), Lsv2YasakHatasi, g);
    }
  });

  test('R_RI yalnız izinli okuma kodlarıyla; R_VR, R_PR, A_LO yük taşımaz', () => {
    for (const kod of [22, 23, 24, 25, 26, 27, 28, 51]) assert.doesNotThrow(() => telgrafKur('R_RI', yuk(0, kod), null));
    for (const kod of [20, 21, 29, 30, 31, 32, 50, 52]) assert.throws(() => telgrafKur('R_RI', yuk(0, kod), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_RI', yuk(0, 23, 0), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_VR', yuk(5), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_PR', yuk(1), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('A_LO', Buffer.from('INSPECT\0', 'latin1'), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('A_LO', Buffer.from('PLCDEBUG', 'latin1'), null), Lsv2YasakHatasi);
    assert.doesNotThrow(() => telgrafKur('A_LO', Buffer.from('PLCDEBUG\0', 'latin1'), null));
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

  test('PLCDEBUG düzeyinde de yalnız ayardaki sayaç adresi okunur; yazma ve kontrol komutu soketten çıkmaz', async () => {
    const s = await ac(calisan());
    const adres = kelimeBasi + D10000;
    const hat = new Lsv2Hatti('127.0.0.1', s.kapi, 1000);
    await hat.ac();
    assert.equal((await hat.istek('A_LG', Buffer.from('PLCDEBUG\0', 'latin1'), adres)).kod, 'T_OK');
    for (const komut of ['C_CC', 'C_MC', 'C_EK', 'C_LK', 'C_FL', 'C_ST', 'W_MB', 'W_PR', 'R_FL']) {
      assert.throws(() => hat.istek(komut as Lsv2Komutu, Buffer.concat([u32(adres), yuk(4, 0, 0, 0, 1)]), adres), Lsv2YasakHatasi, komut);
    }
    for (const a of [adres - 4, adres + 4, kelimeBasi]) assert.throws(() => hat.istek('R_MB', Buffer.concat([u32(a), yuk(4)]), adres), Lsv2YasakHatasi);
    assert.throws(() => hat.istek('R_MB', Buffer.concat([u32(adres), yuk(4)]), null), Lsv2YasakHatasi);
    assert.throws(() => hat.istek('A_LG', Buffer.from('PLCDEBUG\0ORN-PAROLA\0', 'latin1'), adres), Lsv2YasakHatasi);
    assert.equal((await hat.istek('R_MB', Buffer.concat([u32(adres), yuk(4)]), adres)).kod, 'S_MB');
    hat.kapat();
    assert.deepEqual(s.gelenler.map((g) => g.komut), ['A_LG', 'R_MB']);
  });

  test('PLC sayacı: giriş okumadan hemen önce, çıkış hemen sonra; anahtar kapalıyken PLCDEBUG hiç gitmez', async () => {
    const s = await ac(calisan());
    const i = istemci(s);
    for (let n = 0; n < 2; n += 1) {
      const r = await i.oku(PLC);
      assert.equal(r.tur === 'basarili' ? r.okuma.sayac : 'hata', 148);
    }
    const plc = s.gelenler
      .filter((g) => g.komut === 'R_MB' || ((g.komut === 'A_LG' || g.komut === 'A_LO') && g.yuk.toString('latin1') === 'PLCDEBUG\0'))
      .map((g) => `${g.komut} ${g.yuk.toString('latin1').replace(/\0/g, '')}`.trim());
    assert.equal(plc.length, 6);
    assert.deepEqual(plc.filter((x) => !x.startsWith('R_MB')), ['A_LG PLCDEBUG', 'A_LO PLCDEBUG', 'A_LG PLCDEBUG', 'A_LO PLCDEBUG']);
    assert.deepEqual(plc.map((x) => x.slice(0, 4)), ['A_LG', 'R_MB', 'A_LO', 'A_LG', 'R_MB', 'A_LO']);
    const once = s.gelenler.length;
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.sayac, null);
    assert.deepEqual(r.okuma.uyarilar, ['sayac-kapali']);
    assert.ok(!s.gelenler.slice(once).some((g) => g.komut === 'R_MB' || g.yuk.toString('latin1') === 'PLCDEBUG\0'));
  });

  test('tam okumada makineye giden her telgraf izin listesindedir; C_ komutu hiç gitmez', async () => {
    const s = await ac(calisan());
    const i = istemci(s);
    assert.equal((await i.oku(PLC)).tur, 'basarili');
    i.kapat();
    assert.ok(s.gelenler.length > 0);
    for (const g of s.gelenler) {
      assert.ok((IZINLI_KOMUTLAR as readonly string[]).includes(g.komut), g.komut);
      assert.ok(!g.komut.startsWith('C_'));
    }
    const girisler = s.gelenler.filter((g) => g.komut === 'A_LG').map((g) => g.yuk.toString('latin1'));
    assert.deepEqual(girisler, ['INSPECT\0', 'DNC\0', 'DIAGNOSTICS\0', 'PLCDEBUG\0']);
    const m = metinler(s);
    assert.deepEqual(m.slice(m.indexOf('A_LG DIAGNOSTICS|'), m.indexOf('A_LG DIAGNOSTICS|') + 3), ['A_LG DIAGNOSTICS|', 'R_DT', 'A_LO DIAGNOSTICS|']);
  });
});

describe('LSV2 okuması TezgahOgesi\'ne çevrilir (kabul 2)', () => {
  test('durum, kip, program, takım, oranlar ve sayaç; özet bugünkü alanları doldurur', async () => {
    const s = await ac(calisan());
    const i = istemci(s);
    const r = await i.oku(PLC);
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
    const r = await i.oku(PLC);
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
    const r = await i.oku(PLC);
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

// ---- Kart 3790: bütün okumalar, yazma yok ----
const TABLO = [
  'BEGIN TOOL.T MM',
  'T    NAME             L          R          TL TIME1 CUR_TIME',
  '0    ORN-SIFIR        +0         +0            0     0',
  '1    ORN-FREZE-10     +75.5      +5            60    12.5',
  '2    ORN-MATKAP-8     +90        +4         L  30    30',
  '[END]',
].join('\n');
const tamOkuma = (): SahteMakine => ({
  ...calisan(), tumce: 345, eksenler: [{ ad: 'X', deger: '+12.500' }, { ad: 'Y', deger: '-3.25' }, { ad: 'Z', deger: '+100' }],
  takimAyrintisi: { indeks: 1, eksen: 2, boy: 75.5, yaricap: 5 }, takimTablosu: TABLO, blokBoyu: 64,
  programlar: [{ ad: 'ORN-P100.H', boyut: 1200, zaman: Date.parse('2026-11-20T08:00:00Z') / 1000 }, { ad: 'ORN-P200.H', boyut: 3400, zaman: Date.parse('2026-11-21T09:30:00Z') / 1000 }],
});
const metinler = (s: SahteLsv2) => s.gelenler.map((g) => `${g.komut} ${g.yuk.toString('latin1').replace(/\0/g, '|')}`.trim());

describe('Kart 3790 beyaz liste: yalnız A_LG, A_LO, R_ okumaları ve aktarım onayı', () => {
  test('C_ ile başlayan her komut, liste dışı dosya yolu ve aktarım dışı T_OK soket yazılmadan reddedilir', () => {
    for (const komut of ['C_CC', 'C_DC', 'C_DD', 'C_DM', 'C_DT', 'C_EK', 'C_FA', 'C_FC', 'C_FD', 'C_FL', 'C_FR', 'C_LK', 'C_MC', 'C_ST', 'R_DR', 'R_DT', 'R_DI', 'R_FI']) {
      assert.throws(() => telgrafKur(komut, dosyaYuku(TAKIM_TABLOSU), null, true), Lsv2YasakHatasi, komut);
    }
    assert.doesNotThrow(() => telgrafKur('R_FL', dosyaYuku(TAKIM_TABLOSU), null));
    for (const yol of ['TNC:\\nc_prog\\P100.h', 'TNC:\\TABLE\\TOOL.T', 'TNC:\\table\\tool_p.tch', 'PLC:\\table\\tool.t', 'TNC:\\table\\tool.t\\..\\x.h']) {
      assert.throws(() => telgrafKur('R_FL', dosyaYuku(yol), null), Lsv2YasakHatasi, yol);
    }
    // İkili kip ya da kipsiz yol da reddedilir.
    assert.throws(() => telgrafKur('R_FL', Buffer.concat([Buffer.from(`${TAKIM_TABLOSU}\0`, 'latin1'), yuk(1)]), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_FL', Buffer.from(`${TAKIM_TABLOSU}\0`, 'latin1'), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('T_OK', yuk(), null, false), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('T_OK', yuk(1), null, true), Lsv2YasakHatasi);
    assert.doesNotThrow(() => telgrafKur('T_OK', yuk(), null, true));
    for (const k of [1, 2, 3, 4]) assert.doesNotThrow(() => telgrafKur('R_VR', yuk(k), null));
    for (const k of [0, 5, 6, 7]) assert.throws(() => telgrafKur('R_VR', yuk(k), null), Lsv2YasakHatasi);
    assert.doesNotThrow(() => telgrafKur('A_LO', Buffer.from('FILE\0', 'latin1'), null));
    assert.throws(() => telgrafKur('A_LO', Buffer.from('DNC\0', 'latin1'), null), Lsv2YasakHatasi);
  });

  test('hatta T_OK yalnız S_FL cevabından sonra gider', async () => {
    const s = await ac(tamOkuma());
    const hat = new Lsv2Hatti('127.0.0.1', s.kapi, 1000);
    await hat.ac();
    assert.throws(() => hat.istek('T_OK', yuk(), null), Lsv2YasakHatasi);
    await hat.istek('A_LG', Buffer.from('FILE\0', 'latin1'), null);
    assert.equal((await hat.istek('R_FL', dosyaYuku(TAKIM_TABLOSU), null)).kod, 'S_FL');
    assert.equal((await hat.istek('T_OK', yuk(), null)).kod, 'S_FL');
    hat.kapat();
    assert.deepEqual(s.gelenler.map((g) => g.komut), ['A_LG', 'R_FL', 'T_OK']);
  });

  test('seyrek okumalı tam okumada giden her telgraf beyaz listede; NC program okunmaz, C_ gitmez', async () => {
    const s = await ac(tamOkuma());
    const i = istemci(s);
    const r = await i.oku({ plcSayaci: true, takimTablosu: true });
    i.kapat();
    assert.equal(r.tur, 'basarili');
    for (const g of s.gelenler) {
      assert.ok((IZINLI_KOMUTLAR as readonly string[]).includes(g.komut), g.komut);
      if (g.komut === 'R_FL') assert.ok(g.yuk.equals(dosyaYuku(TAKIM_TABLOSU)));
      if (g.komut === 'R_RI') assert.ok([22, 23, 24, 25, 26, 27, 28, 51].includes(g.yuk.readUInt16BE(0)));
    }
    assert.deepEqual(s.gelenler.filter((g) => g.komut === 'R_FL').length, 1);
  });

  test('seyrek anahtarı kapalıyken FILE girişi hiç yapılmaz', async () => {
    const s = await ac(tamOkuma());
    const i = istemci(s);
    for (let n = 0; n < 2; n += 1) {
      const r = await i.oku({ plcSayaci: true });
      assert.equal(r.tur === 'basarili' ? r.okuma.takimTablosu : 'hata', undefined);
    }
    i.kapat();
    assert.ok(!s.gelenler.some((g) => g.komut === 'R_FL' || g.komut === 'T_OK' || g.yuk.toString('latin1') === 'FILE\0'));
  });
});

describe('Kart 3790 giriş düzeyleri: FILE ve PLCDEBUG her yolda kapanır', () => {
  test('başarı: FILE girişi, R_DR ve R_FL, bloklar arası T_OK, T_FD, hemen FILE çıkışı', async () => {
    const s = await ac(tamOkuma());
    const i = istemci(s);
    const r = await i.oku({ takimTablosu: true });
    i.kapat();
    const m = metinler(s);
    const bas = m.indexOf('A_LG FILE|');
    assert.ok(bas >= 0);
    const dilim = m.slice(bas);
    assert.equal(dilim[1], 'R_DR |');
    const rfl = dilim.indexOf(`R_FL ${TAKIM_TABLOSU}||`);
    assert.deepEqual(dilim.slice(2, rfl), ['T_OK', 'T_OK'], 'iki klasör kaydı: her kayıttan sonra T_OK');
    const cikis = dilim.indexOf('A_LO FILE|');
    assert.ok(dilim.slice(rfl + 1, cikis).every((x) => x === 'T_OK'));
    assert.ok(cikis - rfl - 1 >= 2, 'tablo birden çok blokta gelir');
    assert.equal(cikis, dilim.length - 1, 'FILE çıkışından sonra telgraf yok');
    assert.equal(r.tur === 'basarili' ? r.okuma.takimTablosu?.length : -1, 3);
    assert.deepEqual(r.tur === 'basarili' ? r.okuma.programListesi : null, [
      { ad: 'ORN-P100.H', boyut: 1200, tarih: '2026-11-20T08:00:00.000Z' },
      { ad: 'ORN-P200.H', boyut: 3400, tarih: '2026-11-21T09:30:00.000Z' },
    ]);
  });

  test('T_ER (dosya yok ya da aktarım ortasında hata): tanı yazılır, FILE çıkışı yine yapılır', async () => {
    for (const m of [{ ...tamOkuma(), takimTablosu: undefined, programlar: undefined }, { ...tamOkuma(), aktarimHatasi: 'hata' as const, programlar: undefined }]) {
      const s = await ac(m);
      const i = istemci(s);
      const r = await i.oku({ takimTablosu: true });
      i.kapat();
      assert.equal(r.tur, 'basarili');
      if (r.tur !== 'basarili') return;
      assert.equal(r.okuma.takimTablosu, null);
      assert.equal(r.okuma.tani.find((t) => t.alan === 'takim-tablosu')?.kod, m.takimTablosu === undefined ? 32 : 33);
      assert.equal(r.okuma.programListesi, null);
      assert.equal(r.okuma.tani.find((t) => t.alan === 'program-listesi')?.kod, 32);
      assert.equal(metinler(s).at(-1), 'A_LO FILE|');
    }
  });

  test('aktarım ortasında beklenmeyen cevap: okuma düşer ama önce FILE düzeyinden çıkılır', async () => {
    const s = await ac({ ...tamOkuma(), aktarimHatasi: 'beklenmeyen' });
    const i = istemci(s);
    const r = await i.oku({ takimTablosu: true });
    i.kapat();
    assert.equal(r.tur, 'bozuk');
    const m = metinler(s);
    assert.ok(m.indexOf('A_LO FILE|') > m.findIndex((x) => x.startsWith('R_FL')), m.join(' / '));
  });

  test('kumanda saati: DIAGNOSTICS girişi, R_DT, hemen çıkış; 60 sn üstü farkta uyarı; giriş reddinde tanı, çıkış reddinde bağlantı kapanır', async () => {
    const ileri = Math.floor(Date.now() / 1000) + 120;
    const s = await ac({ ...tamOkuma(), saat: ileri });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.kumandaSaati, new Date(ileri * 1000).toISOString());
    assert.ok(r.okuma.saatFarki !== null && r.okuma.saatFarki >= 118 && r.okuma.saatFarki <= 121, String(r.okuma.saatFarki));
    assert.ok(r.okuma.uyarilar.includes('saat-farki'));
    const og = lsv2Ogeleri(r.okuma, ZAMAN);
    assert.equal(og.find((x) => x.kimlik === 'lsv2-kumanda-saati')?.deger, r.okuma.kumandaSaati);
    assert.ok(lsv2GecmisteYok('lsv2-kumanda-saati') && lsv2GecmisteYok('lsv2-saat-farki'));

    const s2 = await ac({ ...tamOkuma(), diagYetkiYok: true });
    const i2 = istemci(s2);
    const r2 = await i2.oku();
    i2.kapat();
    assert.equal(r2.tur, 'basarili');
    if (r2.tur !== 'basarili') return;
    assert.deepEqual([r2.okuma.kumandaSaati, r2.okuma.saatFarki, r2.okuma.uyarilar.includes('saat-farki')], [null, null, false]);
    assert.deepEqual(r2.okuma.tani.find((t) => t.alan === 'saat'), { alan: 'saat', kod: 23 });
    assert.ok(!s2.gelenler.some((g) => g.komut === 'R_DT'));

    const s3 = await ac({ ...tamOkuma(), cikisReddi: 'DIAGNOSTICS' });
    const i3 = istemci(s3);
    const r3 = await i3.oku();
    assert.equal(r3.tur, 'bozuk');
    await new Promise((coz) => setTimeout(coz, 50));
    assert.equal(s3.baglantiSayisi(), 0);
    i3.kapat();
  });

  test('R_DR yalnız tek kayıt kipinde; T_OK süren R_DR aktarımında da gider; program içeriği hiç istenmez', async () => {
    assert.doesNotThrow(() => telgrafKur('R_DR', Uint8Array.of(0), null));
    for (const y of [Uint8Array.of(1), Uint8Array.of(2), new Uint8Array(), Uint8Array.of(0, 0)]) assert.throws(() => telgrafKur('R_DR', y, null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_DT', Uint8Array.of(0), null), Lsv2YasakHatasi);
    assert.throws(() => telgrafKur('R_FL', dosyaYuku('TNC:\\nc_prog\\ORN-P100.H'), null), Lsv2YasakHatasi);
    const s = await ac({ ...tamOkuma(), programBloklari: [Buffer.alloc(13), Buffer.concat([Buffer.alloc(12), Buffer.from('..\0', 'latin1')]), Buffer.concat([Buffer.from([0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([0x4f, 0x52, 0x4e, 0xfd, 0])])] });
    const i = istemci(s);
    const r = await i.oku({ takimTablosu: true });
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.deepEqual(r.okuma.programListesi, [{ ad: 'ORNı', boyut: 7, tarih: null }], 'boş ad ve .. atlanır, ad 1254 ile çözülür, sıfır zaman null');
    assert.deepEqual(s.gelenler.filter((g) => g.komut === 'R_FL').map((g) => g.yuk.toString('latin1').split('\0')[0]), [TAKIM_TABLOSU]);
  });

  test('PLCDEBUG girişinden sonra R_MB T_ER verirse sayaç null, tanı yazılır, PLCDEBUG çıkışı yapılır', async () => {
    const s = await ac({ ...tamOkuma(), plc: new Map() });
    const i = istemci(s);
    const r = await i.oku({ plcSayaci: true });
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.equal(r.okuma.sayac, null);
    assert.deepEqual(r.okuma.tani.find((t) => t.alan === 'sayac'), { alan: 'sayac', kod: 52 });
    const m = metinler(s);
    assert.ok(m.indexOf('A_LO PLCDEBUG|') > m.findIndex((x) => x.startsWith('R_MB')), m.join(' / '));
  });

  test('zaman aşımı aktarım ortasında: bağlantı kapatılır, oturum FILE düzeyinde kalmaz', async () => {
    const s = await ac({ ...tamOkuma(), aktarimHatasi: 'cevapsiz' });
    const i = istemci(s, D10000, 200);
    const r = await i.oku({ takimTablosu: true });
    assert.equal(r.tur, 'zaman-asimi');
    await new Promise((coz) => setTimeout(coz, 50));
    assert.equal(s.baglantiSayisi(), 0);
    i.kapat();
  });

  test('FILE ya da PLCDEBUG çıkışı reddedilince bağlantı kapanır, okuma düşer', async () => {
    for (const duzey of ['FILE', 'PLCDEBUG'] as const) {
      const s = await ac({ ...tamOkuma(), cikisReddi: duzey });
      const i = istemci(s);
      const r = await i.oku({ plcSayaci: true, takimTablosu: true });
      assert.equal(r.tur, 'bozuk', duzey);
      await new Promise((coz) => setTimeout(coz, 50));
      assert.equal(s.baglantiSayisi(), 0, duzey);
      i.kapat();
    }
  });

  test('FILE girişi reddedilirse tablo okunmaz, tanı yazılır, R_FL gitmez', async () => {
    const s = await ac({ ...tamOkuma(), fileYetkiYok: true });
    const i = istemci(s);
    const r = await i.oku({ takimTablosu: true });
    i.kapat();
    assert.equal(r.tur === 'basarili' ? r.okuma.takimTablosu : 'hata', null);
    assert.ok(!s.gelenler.some((g) => g.komut === 'R_FL'));
    assert.equal(r.tur === 'basarili' ? lsv2TaniMetni(r.okuma.tani[0] ?? { alan: 'takim', kod: 0 }) : '', 'Takım tablosu: yetki yok (kod 23)');
  });
});

describe('Kart 3790 okumalar ve tanı', () => {
  test('tümce, eksenler, iş milindeki takım, hızlı oranı, sürüm ve sistem parametreleri', async () => {
    const s = await ac(tamOkuma());
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    const o = r.okuma;
    assert.equal(o.tumce, 345);
    assert.deepEqual(o.eksenler, [{ ad: 'X', deger: 12.5 }, { ad: 'Y', deger: -3.25 }, { ad: 'Z', deger: 100 }]);
    assert.deepEqual(o.takim, { no: 12, indeks: 1, eksen: 'Z', boy: 75.5, yaricap: 5 });
    assert.equal(o.hizliOrani, 100);
    assert.deepEqual([o.kontrol, o.ncSurumu, o.plcSurumu, o.secenekler], ['ORN-TNC640', 'ORN-NC 01', 'ORN-PLC 01', 'ORN-SECENEK']);
    assert.deepEqual(s.gelenler.filter((g) => g.komut === 'R_VR').map((g) => g.yuk[0]), [1, 2, 3, 4]);
    assert.deepEqual(o.tani, []);
    const ogeler = lsv2Ogeleri(o, ZAMAN);
    assert.deepEqual(ogeler.filter((x) => x.bilesen === 'Axes').map((x) => [x.kimlik, x.ad, x.deger]), [['lsv2-eksen-X', 'X', '12.5'], ['lsv2-eksen-Y', 'Y', '-3.25'], ['lsv2-eksen-Z', 'Z', '100']]);
    assert.deepEqual(ogeler.filter((x) => x.bilesen === 'Tool').map((x) => x.deger), ['12', '1', 'Z', '75.5', '5']);
  });

  test('alt kodu tanımayan eski kumandada sürüm yüksüz R_VR ile okunur', async () => {
    const s = await ac({ ...tamOkuma(), eskiSurum: true });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.deepEqual(r.tur === 'basarili' ? [r.okuma.kontrol, r.okuma.ncSurumu, r.okuma.plcSurumu] : [], ['ORN-TNC640', 'ORN-NC 01', 'ORN-PLC 01']);
  });

  test('her okuma kodunda T_ER: 23, 46, 57, 80 ve bilinmeyen kod tanıya alan adı ve kodla yazılır', async () => {
    const red = new Map([[51, 23], [22, 46], [25, 80], [23, 57], [24, 99]]);
    const s = await ac({ ...tamOkuma(), reddedilenOkumalar: red });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur, 'basarili');
    if (r.tur !== 'basarili') return;
    assert.deepEqual([r.okuma.takim, r.okuma.eksenler, r.okuma.ilerlemeOrani, r.okuma.kip, r.okuma.program, r.okuma.tumce], [null, null, null, null, null, null]);
    assert.deepEqual(r.okuma.tani.map(lsv2TaniMetni), [
      'Çalışma kipi: sonraki hata yok (kod 57)',
      'Seçili program: kumanda kodu 99',
      'Oranlar: çok fazla bağlantı (kod 80)',
      'Takım: yetki yok (kod 23)',
      'Eksenler: DNC durumu (kod 46)',
    ]);
    const tani = lsv2Ogeleri(r.okuma, ZAMAN).find((x) => x.kimlik === 'lsv2-tani');
    assert.match(tani?.deger ?? '', /^Çalışma kipi: sonraki hata yok/);
  });

  test('alarm koşulu: hata yok Normal, hata Fault, okunamayınca Unavailable ve nedeni', async () => {
    const durumlar: [SahteMakine, string, string | null][] = [
      [tamOkuma(), 'Normal', null],
      [{ ...tamOkuma(), hatalar: [{ sinif: 1, grup: 2, no: 1101, metin: 'ORN hata' }] }, 'Fault', 'ORN hata'],
      [{ ...tamOkuma(), reddedilenOkumalar: new Map([[27, 23]]) }, 'Unavailable', 'Alarm: yetki yok (kod 23)'],
    ];
    for (const [m, kosul, deger] of durumlar) {
      const s = await ac(m);
      const i = istemci(s);
      const r = await i.oku();
      i.kapat();
      assert.equal(r.tur, 'basarili');
      if (r.tur !== 'basarili') return;
      const alarm = lsv2Ogeleri(r.okuma, ZAMAN).find((x) => x.kimlik === 'lsv2-alarm');
      assert.deepEqual([alarm?.kosul, alarm?.deger], [kosul, deger]);
    }
  });

  test('kumanda metni Windows-1254 ile çözülür: 0xFD "ı" olur', async () => {
    const s = await ac({ ...tamOkuma(), hatalar: [{ sinif: 1, grup: 1, no: 7, metin: '' }], hataMetniBayt: Buffer.from([0x41, 0xfd, 0x6b, 0x20, 0xdd, 0xfe, 0xf0, 0]) });
    const i = istemci(s);
    const r = await i.oku();
    i.kapat();
    assert.equal(r.tur === 'basarili' ? r.okuma.hatalar?.[0]?.metin : '', 'Aık İşğ');
  });
});
