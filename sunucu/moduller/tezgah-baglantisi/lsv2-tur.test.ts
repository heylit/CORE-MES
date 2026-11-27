import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { tezgahAyrintisiCevabi, tezgahBaglantisiDurumCevabi, tezgahTakimTablosuCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
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
  // Liste Sistem Ayarları'ndan: makine adresi uydurmadır; istemci adresi değil sahte sunucunun kapısını kullanır.
  const ayardanTur = () => lsv2Turu(vt(), {
    istemciKur: (m) => {
      istemciSayisi += 1;
      return lsv2IstemcisiKur('127.0.0.1', m.sayac, { kapi: sahte.kapi, istekSuresiMs: 500 });
    },
    saat: () => new Date(simdi), bellek, ortak, mtconnectVar: false,
  });
  const liste = async (deger: string) => {
    const c = await app.inject({ method: 'POST', url: '/api/ayarlar/tezgah-baglantisi.lsv2-makineleri/degistir', headers: { cookie: yonetici }, payload: { deger } });
    return c;
  };
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
    await vt().sorgu('DELETE FROM tezgah_lsv2_takim');
    await vt().sorgu('DELETE FROM tezgah_lsv2_takim_gecmisi');
    await vt().sorgu('DELETE FROM tezgah_lsv2_seyrek');
    await vt().sorgu('DELETE FROM tezgah_lsv2_program');
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
    await ayar('tezgah-baglantisi.lsv2-plc-sayaci', true);
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
    // PLC sayacı anahtarı kapanınca PLCDEBUG girişi gitmez; sayaç boş kalır, uyarı yazılır.
    await ayar('tezgah-baglantisi.lsv2-plc-sayaci', false);
    const once = sahte.gelenler.length;
    simdi += 5_000;
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 1 });
    assert.ok(!sahte.gelenler.slice(once).some((g) => g.komut === 'R_MB' || g.yuk.toString('latin1') === 'PLCDEBUG\0'));
    const t2 = (await pano(m)).tezgahlar[0];
    assert.deepEqual([t2?.sayac, t2?.uyari], [null, 'PLC sayacı okuması kapalı (Sistem Ayarları)']);
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

  test('liste Sistem Ayarları\'ndan okunur; geçersiz liste kaydedilmez; listeden çıkan makinenin bağlantısı kapanır (kart 3757)', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    const bozuk = await liste('ORN-H01=203.0.113.7;D10000');
    assert.equal(bozuk.statusCode, 400, bozuk.body);
    assert.ok(!bozuk.body.includes('203.0.113'), 'ileti adresi söylemez');
    assert.deepEqual(await ayardanTur(), { tur: 'ayar-yok' });
    assert.equal((await liste('ORN-H01=10.250.0.11;D10000')).statusCode, 200);
    assert.deepEqual(await ayardanTur(), { tur: 'okundu', makine: 1 });
    assert.equal(istemciSayisi, 1);
    const p = tezgahBaglantisiDurumCevabi.parse(await vt().tx((db) => durum(db, null, ortak, new Date(simdi), { bellek })));
    assert.equal(p.lsv2Baglanti, 'acik');
    assert.equal(p.tezgahlar.find((x) => x.cihazAdi === 'ORN-H01')?.kaynak, 'lsv2');
    // Adres değişince eski bağlantı kapanır, yenisi kurulur; liste boşalınca bağlantı ve bellek düşer, ekranda "liste yok".
    assert.equal((await liste('ORN-H01=10.250.0.12;D10000')).statusCode, 200);
    simdi += 5_000;
    assert.deepEqual(await ayardanTur(), { tur: 'okundu', makine: 1 });
    assert.equal(istemciSayisi, 2);
    assert.equal(sahte.kabulEdilen(), 2);
    assert.equal((await liste('')).statusCode, 200);
    assert.deepEqual(await ayardanTur(), { tur: 'ayar-yok' });
    assert.equal(bellek.istemciler.size, 0);
    assert.equal(bellek.makineler.size, 0);
    const q = tezgahBaglantisiDurumCevabi.parse(await vt().tx((db) => durum(db, null, ortak, new Date(simdi), { bellek })));
    assert.equal(q.lsv2Baglanti, 'adres-yok');
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

  // ---- Kart 3790 ----
  test('eksen konumu ve tümce numarası yalnız son durumda: değişse de geçmiş tablosuna satır eklemez', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    sahte.makine.eksenler = [{ ad: 'X', deger: '+1.000' }, { ad: 'Z', deger: '+50' }];
    sahte.makine.tumce = 10;
    const m = [makine('ORN-H01', sahte.kapi)];
    await tur(m);
    for (let n = 1; n <= 3; n += 1) {
      simdi += 5_000;
      sahte.makine.eksenler = [{ ad: 'X', deger: `+${String(n * 2)}.000` }, { ad: 'Z', deger: `+${String(50 - n)}` }];
      sahte.makine.tumce = 10 + n;
      assert.deepEqual(await tur(m), { tur: 'okundu', makine: 1 });
    }
    const satir = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM tezgah_deger_gecmisi WHERE data_item_id LIKE 'lsv2-eksen-%' OR data_item_id IN ('lsv2-tumce', 'lsv2-tani')");
    assert.equal(satir?.n, 0);
    const a = tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-H01', new Date(simdi))));
    assert.deepEqual(a.alanlar.filter((x) => x.bilesen === 'Axes').map((x) => [x.ad, x.deger]), [['X', '6'], ['Z', '47']]);
    assert.equal(a.alanlar.find((x) => x.tur === 'BlockNumber')?.deger, '13');
    assert.equal(a.alanlar.find((x) => x.tur === 'ToolNumber')?.bilesen, 'Tool');
  });

  test('takım tablosu: seyrek anahtarı kapalıyken okunmaz; açılınca aralıkla okunur, geçmişe yalnız ömür ya da kilit değişikliği', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    await ayar('tezgah-baglantisi.lsv2-seyrek-okuma', false);
    const tablo = (satirlar: string[]) => ['BEGIN TOOL.T MM', 'T    NAME             L          R          TL TIME1 CUR_TIME', ...satirlar, '[END]'].join('\n');
    sahte.makine.takimTablosu = tablo(['1    ORN-FREZE-10     +75.5      +5            60    12.5', '2    ORN-MATKAP-8     +90        +4         L  30    30', '3    ORN-KILAVUZ      +60        +3            0     0']);
    const m = [makine('ORN-H01', sahte.kapi)];
    await tur(m);
    sahte.makine.programlar = [{ ad: 'ORN-P100.H', boyut: 1200, zaman: Date.parse('2026-11-20T08:00:00Z') / 1000 }];
    const rfl = () => sahte.gelenler.filter((g) => g.komut === 'R_FL').length;
    assert.equal(rfl(), 0);
    assert.ok(!sahte.gelenler.some((g) => g.komut === 'R_DR'), 'anahtar kapalıyken program listesi de okunmaz');
    assert.ok(!sahte.gelenler.some((g) => g.yuk.toString('latin1') === 'FILE\0'));
    await ayar('tezgah-baglantisi.lsv2-seyrek-okuma', true);
    simdi += 5_000;
    await tur(m);
    assert.equal(rfl(), 1);
    const sayi = async (tablo: string) => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo}`))?.n;
    assert.equal(await sayi('tezgah_lsv2_takim'), 3);
    assert.equal(await sayi('tezgah_lsv2_takim_gecmisi'), 0, 'ilk okuma başlangıç durumudur');
    // Ad, boy ve tek başına kullanılan süre (3) geçmişe yazılmaz; ömür (1), kilit (2) değişikliği yazılır; yeni takım (4) yazılmaz.
    sahte.makine.takimTablosu = tablo(['1    ORN-FREZE-10B    +75.4      +5            45    20', '2    ORN-MATKAP-8     +90        +4            30    30', '3    ORN-KILAVUZ      +61        +3            0     5', '4    ORN-YENI         +10        +1            0     0']);
    simdi += 60_000;
    await tur(m);
    assert.equal(rfl(), 1, 'aralık (10 dk) dolmadan yeniden okunmaz');
    simdi += 10 * 60_000;
    await tur(m);
    assert.equal(rfl(), 2);
    const gecmis = await vt().sorgu<{ takim_no: number; kullanilan: number; kilitli: boolean }>('SELECT takim_no, kullanilan, kilitli FROM tezgah_lsv2_takim_gecmisi ORDER BY takim_no');
    assert.deepEqual(gecmis.map((g) => [g.takim_no, g.kullanilan, g.kilitli]), [[1, 20, false], [2, 30, false]]);
    const c = await app.inject({ method: 'GET', url: '/api/tezgah-baglantisi/tezgahlar/ORN-H01/takim-tablosu', headers: { cookie: yonetici } });
    assert.equal(c.statusCode, 200, c.body);
    const tt = tezgahTakimTablosuCevabi.parse(c.json());
    assert.deepEqual([tt.seyrekAcik, tt.tani, tt.gecmisSayisi, tt.takimlar.length], [true, null, 2, 4]);
    assert.deepEqual([tt.programTani, tt.programlar.map((p) => ({ ...p, tarih: p.tarih === null ? null : new Date(p.tarih).toISOString() }))],
      [null, [{ ad: 'ORN-P100.H', boyut: 1200, tarih: '2026-11-20T08:00:00.000Z' }]]);
    assert.deepEqual(tt.takimlar[0], { no: 1, ad: 'ORN-FREZE-10B', boy: 75.4, yaricap: 5, omur: 45, kullanilan: 20, kilitli: false });
    // Okunamayınca son durum korunur, neden kumanda koduyla yazılır.
    sahte.makine.takimTablosu = undefined;
    simdi += 10 * 60_000;
    await tur(m);
    const t2 = tezgahTakimTablosuCevabi.parse((await app.inject({ method: 'GET', url: '/api/tezgah-baglantisi/tezgahlar/ORN-H01/takim-tablosu', headers: { cookie: yonetici } })).json());
    assert.deepEqual([t2.tani, t2.takimlar.length], ['Takım tablosu: kumanda kodu 32', 4]);
    assert.deepEqual([t2.programTani, t2.programlar.length], [null, 1]);
    await ayar('tezgah-baglantisi.lsv2-seyrek-okuma', false);
  });

  test('takım tablosu 2 MB\'ı aşarsa bağlantı kapanır, neden yazılır; sonraki normal tur FILE\'a girmez ve canlı okuma yazılır', async () => {
    await ayar('tezgah-baglantisi.lsv2-okuma', true);
    await ayar('tezgah-baglantisi.lsv2-seyrek-okuma', true);
    sahte.makine.blokBoyu = 65_536;
    sahte.makine.takimTablosu = `BEGIN TOOL.T MM\n${'A'.repeat(2 * 1024 * 1024 + 10)}`;
    const m = [makine('ORN-H01', sahte.kapi)];
    await tur(m);
    const fileGirisi = () => sahte.gelenler.filter((g) => g.komut === 'A_LG' && g.yuk.toString('latin1') === 'FILE\0').length;
    assert.equal(fileGirisi(), 1);
    const t = tezgahTakimTablosuCevabi.parse((await app.inject({ method: 'GET', url: '/api/tezgah-baglantisi/tezgahlar/ORN-H01/takim-tablosu', headers: { cookie: yonetici } })).json());
    assert.match(t.tani ?? '', /^Takım tablosu okunamadı: Takım tablosu beklenenden büyük/);
    simdi += 60_000;
    sahte.makine.tumce = 77;
    assert.deepEqual(await tur(m), { tur: 'okundu', makine: 1 });
    assert.equal(fileGirisi(), 1, 'aralık dolmadan FILE\'a yeniden girilmez');
    const a = tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-H01', new Date(simdi))));
    assert.equal(a.alanlar.find((x) => x.tur === 'BlockNumber')?.deger, '77');
    await ayar('tezgah-baglantisi.lsv2-seyrek-okuma', false);
  });
});
