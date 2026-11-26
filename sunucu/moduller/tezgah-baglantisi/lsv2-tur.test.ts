import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tezgahAyrintisiCevabi, tezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { Lsv2Makinesi } from './ayar.ts';
import { tezgahIstemcisiKur } from './istemci.ts';
import { lsv2IstemcisiKur } from './lsv2.ts';
import { lsv2Kapat, lsv2Turu, yeniLsv2Bellegi } from './lsv2-tur.ts';
import type { Lsv2Bellegi } from './lsv2-tur.ts';
import { sahteLsv2Ac } from './sahte-lsv2.ts';
import type { SahteLsv2 } from './sahte-lsv2.ts';
import { sahteMtconnectAc } from './sahte-mtconnect.ts';
import { ayrinti, durum, okumaTuru, yeniTurBellegi } from './servis.ts';
import type { TurBellegi } from './servis.ts';

// Kart 3753: Heidenhain okuma turu gerçek PostgreSQL ile; makine yerine yerel sahte LSV2 sunucusu. Adlar ve değerler uydurmadır.
const PAROLA = 'dogru-parola-1';
const D10000 = 10_000;

describe('Heidenhain (LSV2) okuma turu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let sahte: SahteLsv2;
  let bellek: Lsv2Bellegi;
  let ortak: TurBellegi;
  let simdi = Date.parse('2026-11-26T09:00:00Z');
  let istemciSayisi = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ayar = async (anahtar: string, deger: boolean) => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici }, payload: { deger } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const makine = (cihazAdi: string, kapi: number, sayac: number | null = D10000) => ({ m: { cihazAdi, adres: '127.0.0.1', sayac } satisfies Lsv2Makinesi, kapi });
  const tur = (makineler: { m: Lsv2Makinesi; kapi: number }[]) => lsv2Turu(vt(), {
    makineler: makineler.map((x) => x.m),
    istemciKur: (m) => {
      istemciSayisi += 1;
      const kapi = makineler.find((x) => x.m.cihazAdi === m.cihazAdi)?.kapi ?? 0;
      return lsv2IstemcisiKur(m.adres, m.sayac, { kapi, istekSuresiMs: 500 });
    },
    saat: () => new Date(simdi), bellek, ortak, mtconnectVar: false,
  });
  const pano = async (makineler: { m: Lsv2Makinesi }[]) =>
    tezgahBaglantisiDurumCevabi.parse(await vt().tx((db) => durum(db, null, ortak, new Date(simdi), { makineler: makineler.map((x) => x.m), bellek })));

  before(async () => {
    ortam = await testVeritabaniKur('tezlsv');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Lsv2', kullaniciAdi: 'lsv2-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lsv2-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    simdi += 3_600_000;
    bellek = yeniLsv2Bellegi();
    ortak = yeniTurBellegi();
    istemciSayisi = 0;
    sahte = await sahteLsv2Ac({ kip: 4, programDurumu: 0, program: 'TNC:/ORN/P200.h', oranlar: [100, 100, 100], takim: 5, hatalar: [], plc: new Map([[D10000, 77]]) });
    await vt().sorgu('DELETE FROM tezgah_okuma');
    await vt().sorgu('DELETE FROM tezgah_deger_gecmisi');
    await vt().sorgu('DELETE FROM tezgah_ornek');
  });
  afterEach(async () => {
    lsv2Kapat(bellek);
    await sahte.kapat();
  });

  test('ayar kapalıyken ya da makine listesi boşken hiç bağlantı açılmaz (kabul 4)', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', false);
    assert.deepEqual(await tur([makine('ORN-H01', sahte.kapi)]), { tur: 'kapali' });
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    assert.deepEqual(await tur([]), { tur: 'ayar-yok' });
    assert.equal(sahte.kabulEdilen(), 0);
    assert.equal(istemciSayisi, 0);
    const p = await pano([]);
    assert.equal(p.lsv2Baglanti, 'adres-yok');
  });

  test('okunan makine son durum tablosuna MTConnect adlarıyla yazılır; ekranda kaynak lsv2, ayrıntıda alan tanımları var (kabul 2)', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    const m = [makine('ORN-H01', sahte.kapi)];
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 1 });
    const p = await pano(m);
    assert.equal(p.lsv2Baglanti, 'acik');
    const t = p.tezgahlar.find((x) => x.cihazAdi === 'ORN-H01');
    assert.ok(t);
    assert.deepEqual(
      { kaynak: t.kaynak, durum: t.durum, program: t.program, sayac: t.sayac, takim: t.takim, mod: t.mod, uyari: t.uyari, eski: t.eski },
      { kaynak: 'lsv2', durum: 'calisiyor', program: 'TNC:/ORN/P200.h', sayac: 77, takim: '5', mod: 'AUTOMATIC', uyari: null, eski: false },
    );
    const a = tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-H01', new Date(simdi))));
    assert.equal(a.alanlar.find((x) => x.tur === 'PartCount')?.kategori, 'EVENT');
    assert.equal(a.alanlar.find((x) => x.tur === 'RotaryVelocityOverride')?.birim, 'PERCENT');
    // Aralık dolmadan ikinci tur makineye gitmez; dolunca aynı bağlantıdan okur, değişmeyen değer geçmişe yeniden yazılmaz.
    const gecmis = async () => (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM tezgah_deger_gecmisi WHERE data_item_id = 'lsv2-sayac'"))?.n;
    assert.equal(await gecmis(), 1);
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 0 });
    simdi += 5_000;
    sahte.makine.plc?.set(D10000, 78);
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 1 });
    assert.equal(sahte.kabulEdilen(), 1);
    assert.equal((await pano(m)).tezgahlar[0]?.sayac, 78);
    assert.equal(await gecmis(), 2);
  });

  test('kapalı makine: "bağlantı yok", değerler null, uyarı yazılır; art arda hatada aralık uzar; öteki makine okunur (kabul 3)', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    const kapali = await sahteLsv2Ac();
    const kapi = kapali.kapi;
    await kapali.kapat();
    const m = [makine('ORN-H09', kapi), makine('ORN-H01', sahte.kapi)];
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 2 });
    const t = (await pano(m)).tezgahlar.find((x) => x.cihazAdi === 'ORN-H09');
    assert.ok(t);
    assert.deepEqual(
      { durum: t.durum, program: t.program, sayac: t.sayac, takim: t.takim, alarm: t.alarm, uyari: t.uyari },
      { durum: 'baglanti-yok', program: null, sayac: null, takim: null, alarm: null, uyari: 'Makine kapalı ya da meşgul (bağlantı reddedildi)' },
    );
    assert.equal((await pano(m)).tezgahlar.find((x) => x.cihazAdi === 'ORN-H01')?.durum, 'calisiyor');
    // İlk hatadan sonra aralık 5 sn'den 10 sn'ye çıkar: 5 sn sonra yalnız sağlam makine okunur.
    simdi += 5_000;
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 1 });
    simdi += 5_000;
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 2 });
    assert.equal(bellek.makineler.get('ORN-H09')?.ardisikHata, 2);
  });

  test('MTConnect turu Heidenhain makinesinin son okuma anını yenilemez, aynı adlı MTConnect cihazını yazmaz', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    await ayar('tezgah-baglantisi.okuma', true);
    const m = [makine('ORN-H01', sahte.kapi)];
    await tur(m);
    const once = (await pano(m)).tezgahlar.find((x) => x.cihazAdi === 'ORN-H01')?.okundu;
    const mt = await sahteMtconnectAc([{ ad: 'ORN-T01', calisma: 'ACTIVE', program: 'O1001', sayac: '5' }, { ad: 'ORN-H01', calisma: 'READY', program: 'O9999', sayac: '1' }], simdi);
    try {
      simdi += 60_000;
      const r = await okumaTuru(vt(), { istemci: tezgahIstemcisiKur(mt.adres, { istekSuresiMs: 2000 }), saat: () => new Date(simdi), bellek: ortak, lsv2Adlari: new Set(['orn-h01']) });
      assert.equal(r.tur, 'okundu');
    } finally {
      await mt.kapat();
    }
    const p = await pano(m);
    const h = p.tezgahlar.find((x) => x.cihazAdi === 'ORN-H01');
    assert.equal(h?.okundu, once);
    assert.equal(h?.program, 'TNC:/ORN/P200.h');
    assert.equal(p.tezgahlar.find((x) => x.cihazAdi === 'ORN-T01')?.kaynak, 'mtconnect');
    await ayar('tezgah-baglantisi.okuma', false);
  });
});
