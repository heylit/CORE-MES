import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { gunlukOku } from './gunluk-okuyucu.ts';
import { kapanmaTemizligi, kapanmayiKaydet } from './kapanma.ts';
import {
  bekciSatiriCoz, cokusRaporunuYorumla, gunlukImleciCoz, gunlukSatiriCoz, gunlukSatiriUyar, kapanmaBildirimMetni, kapanmaNedeniBelirle, sonKapanisiBul,
} from './kurallar.ts';
import type { BekciSatiri } from './kurallar.ts';
import { saglikUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const bekci = (an: string, metin: string): string => `${an} [bekçi] ${metin}`;
const coz = (satirlar: string[]): BekciSatiri[] => satirlar.map((s) => bekciSatiriCoz(s)).filter((s): s is BekciSatiri => s !== null);
const pino = (zaman: string, level: number, ek: Record<string, unknown> = {}): string => JSON.stringify({ level, time: Date.parse(zaman), msg: 'ileti', ...ek });

describe('kapanma kuralları (saf)', () => {
  const acilis = new Date('2026-11-24T12:24:00.000Z');
  const hamBekci = [
    bekci('2026-11-24T08:00:00.000Z', 'Sunucu açılıyor.'),
    bekci('2026-11-24T12:22:00.000Z', 'Sunucu art arda 3 yoklamada cevap vermedi; sonlandırılıp yeniden açılacak.'),
    bekci('2026-11-24T12:22:01.000Z', 'Sunucu kapandı (çıkış 1); 5 sn sonra yeniden açılacak.'),
    bekci('2026-11-24T12:22:06.000Z', 'Sunucu açılıyor.'),
  ];

  test('bekçi satırı çözülür; ilk açılışta kapanış yoktur; donma önceki açılışın ömründen bulunur', () => {
    assert.equal(bekciSatiriCoz('düz metin'), null);
    assert.equal(sonKapanisiBul(coz([hamBekci[0] as string]), acilis), null);
    const k = sonKapanisiBul(coz(hamBekci), acilis);
    assert.deepEqual({ kod: k?.cikisKodu, sinyal: k?.sinyal, donma: k?.donma, guncelleme: k?.guncelleme, an: k?.kapandiAn.toISOString() }, { kod: 1, sinyal: null, donma: true, guncelleme: false, an: '2026-11-24T12:22:01.000Z' });
  });

  test('sinyalle kapanış ve güncelleme nedeni; açılıştan sonraki kapanış satırı bu açılışa ait değildir', () => {
    const k = sonKapanisiBul(coz([
      bekci('2026-11-24T08:00:00.000Z', 'Sunucu açılıyor.'),
      bekci('2026-11-24T09:00:00.000Z', 'Güncelleme sürüyor; bitene kadar cevapsız yoklama sayılmaz.'),
      bekci('2026-11-24T09:01:00.000Z', 'Sunucu kapandı (sinyal SIGKILL); 5 sn sonra yeniden açılacak.'),
      bekci('2026-11-24T13:00:00.000Z', 'Sunucu kapandı (çıkış 0); 5 sn sonra yeniden açılacak.'),
    ]), acilis);
    assert.deepEqual({ kod: k?.cikisKodu, sinyal: k?.sinyal, guncelleme: k?.guncelleme }, { kod: null, sinyal: 'SIGKILL', guncelleme: true });
  });

  test('tanı raporu: bellek taşması ve yakalanmamış istisna ayrılır; bozuk rapor null; eksik bellek alanı uydurulmaz', () => {
    const tas = cokusRaporunuYorumla({ header: { event: 'JavaScript heap out of memory', trigger: 'FatalError', dumpEventTime: '2026-11-24T12:22:00.000Z' }, javascriptHeap: { usedMemory: 100 }, resourceUsage: { rss: 200 } });
    assert.deepEqual({ n: tas?.neden, b: tas?.bellek }, { n: 'bellek-tasmasi', b: { rssBayt: 200, yiginBayt: 100 } });
    const ist = cokusRaporunuYorumla({ header: { event: 'Exception', trigger: 'Exception' }, javascriptStack: { message: 'Error: x', stack: ['a', 'b'] } });
    assert.deepEqual({ n: ist?.neden, y: ist?.yigin, b: ist?.bellek }, { n: 'yakalanmamis-hata', y: 'Error: x\na\nb', b: null });
    assert.equal(cokusRaporunuYorumla({ baska: 1 }), null);
    assert.equal(cokusRaporunuYorumla('x'), null);
  });

  test('neden önceliği: rapor > donma > güncelleme > ekrandan > bilinmiyor', () => {
    const b = { kapandiAn: new Date(0), cikisKodu: 1, sinyal: null, donma: true, guncelleme: true };
    const r = cokusRaporunuYorumla({ header: { event: 'heap out of memory', trigger: 'FatalError' } });
    assert.equal(kapanmaNedeniBelirle({ bekci: b, rapor: r, ekrandanYenidenBaslatma: true }).neden, 'bellek-tasmasi');
    assert.equal(kapanmaNedeniBelirle({ bekci: b, rapor: null, ekrandanYenidenBaslatma: true }).neden, 'donma');
    assert.equal(kapanmaNedeniBelirle({ bekci: { ...b, donma: false }, rapor: null, ekrandanYenidenBaslatma: true }).neden, 'guncelleme');
    assert.equal(kapanmaNedeniBelirle({ bekci: { ...b, donma: false, guncelleme: false }, rapor: null, ekrandanYenidenBaslatma: true }).neden, 'ekrandan-yeniden-baslatma');
    assert.deepEqual(kapanmaNedeniBelirle({ bekci: { ...b, donma: false, guncelleme: false }, rapor: null, ekrandanYenidenBaslatma: false }), { neden: 'bilinmiyor', kanit: null });
  });

  test('bildirim metni tesis saatiyle ve süreyle yazılır', () => {
    assert.equal(kapanmaBildirimMetni(new Date('2026-11-24T12:22:00.000Z'), 100, 'bellek-tasmasi', 'Europe/Istanbul'), "15:22'de kapandı, 1 dk 40 sn, neden: bellek taşması");
  });

  test('günlük satırı çözülür ve süzülür; konsol metni ve düzeysiz satır atlanır', () => {
    assert.equal(gunlukSatiriCoz('konsol metni'), null);
    assert.equal(gunlukSatiriCoz('{"time":1}'), null);
    const s = gunlukSatiriCoz(pino('2026-11-24T12:00:00.000Z', 50, { yontem: 'POST', yol: '/plan/hesapla', kisiId: 12, durum: 500, sureMs: 40, reqId: '1a2b3c4d', err: { type: 'Error', message: 'x' } }));
    assert.deepEqual({ d: s?.duzey, uc: s?.uc, k: s?.kisiId, kod: s?.hataKodu, h: s?.hata }, { d: 'hata', uc: '/plan/hesapla', k: 12, kod: '1a2b3c4d', h: 'Error: x' });
    assert.ok(s !== null);
    const f = { duzey: 'hata' as const };
    assert.equal(gunlukSatiriUyar(s, { ...f, uc: 'PLAN', kisi: 12, hataKodu: '1A2B3C4D' }), true);
    assert.equal(gunlukSatiriUyar(s, { ...f, kisi: 13 }), false);
    assert.equal(gunlukSatiriUyar(s, { duzey: 'olumcul' }), false);
    assert.equal(gunlukSatiriUyar(s, { ...f, bitis: '2026-11-24T11:59:00.000Z' }), false);
    assert.deepEqual(gunlukImleciCoz('bozuk', ['sunucu-2026-11-24.log']), { dosya: 0, ofset: null });
    assert.deepEqual(gunlukImleciCoz('sunucu-2026-11-23.log:42', ['sunucu-2026-11-24.log', 'sunucu-2026-11-23.log']), { dosya: 1, ofset: 42 });
  });
});

describe('günlük okuyucu (gerçek dosya)', () => {
  let dizin: string;
  before(async () => {
    dizin = await mkdtemp(join(tmpdir(), 'gunluk-'));
    const bugun: string[] = [];
    for (let i = 0; i < 1200; i += 1) bugun.push(pino(new Date(Date.UTC(2026, 10, 24, 10, 0, 0) + i * 1000).toISOString(), i % 10 === 0 ? 50 : 30, { kisiId: i % 7, reqId: i === 777 ? 'abcdef12' : undefined, msg: `satir ${String(i)} türkçe çğış` }));
    bugun.splice(5, 0, 'konsol satırı JSON değil');
    await writeFile(join(dizin, 'sunucu-2026-11-24.log'), `${bugun.join('\n')}\n`);
    await writeFile(join(dizin, 'sunucu-2026-11-23.log'), `${pino('2026-11-23T10:00:00.000Z', 50, { msg: 'dün' })}\n`);
    await writeFile(join(dizin, 'sunucu-2026-11-01.log'), `${pino('2026-11-01T10:00:00.000Z', 50, { msg: 'eski' })}\n`);
    await writeFile(join(dizin, 'baska.txt'), 'x');
  });
  after(async () => { await rm(dizin, { recursive: true, force: true }); });

  test('en yeniden eskiye, sayfalı; her satır bir kez; yalnız bugünkü ve önceki dosya okunur', async () => {
    const ilk = await gunlukOku(dizin, { duzey: 'bilgi', adet: 500 });
    assert.equal(ilk.satirlar.length, 500);
    assert.equal(ilk.satirlar[0]?.ileti, 'satir 1199 türkçe çğış');
    assert.ok(ilk.sonraki !== null);
    assert.deepEqual(ilk.dosyalar, ['sunucu-2026-11-24.log', 'sunucu-2026-11-23.log']);
    const toplam = [...ilk.satirlar];
    let imlec: string | null = ilk.sonraki;
    let tur = 0;
    while (imlec !== null && tur < 10) {
      const s = await gunlukOku(dizin, { duzey: 'bilgi', adet: 500, imlec });
      toplam.push(...s.satirlar);
      imlec = s.sonraki;
      tur += 1;
    }
    assert.equal(toplam.length, 1201);
    assert.equal(new Set(toplam.map((s) => s.ileti)).size, 1201);
    assert.equal(toplam.at(-1)?.ileti, 'dün');
    assert.equal(toplam.some((s) => s.ileti === 'eski'), false);
  });

  test('süzgeç: hata kodu, düzey, kişi; hiç eşleşme yoksa boş ve imleçsiz', async () => {
    const kod = await gunlukOku(dizin, { duzey: 'bilgi', adet: 50, hataKodu: 'abcdef12' });
    assert.deepEqual(kod.satirlar.map((s) => s.ileti), ['satir 777 türkçe çğış']);
    assert.equal(kod.sonraki, null);
    const hata = await gunlukOku(dizin, { duzey: 'hata', adet: 500, kisi: 3 });
    assert.ok(hata.satirlar.every((s) => s.duzey === 'hata' && s.kisiId === 3));
    const yok = await gunlukOku(dizin, { duzey: 'olumcul', adet: 10 });
    assert.deepEqual({ n: yok.satirlar.length, s: yok.sonraki }, { n: 0, s: null });
  });

  test('klasör ya da dosya yoksa boş cevap', async () => {
    assert.deepEqual(await gunlukOku(join(dizin, 'yok'), { duzey: 'hata', adet: 10 }), { satirlar: [], sonraki: null, dosyalar: [], gunler: [] });
  });

  test('gün verilirse yalnız o dosya okunur (üç günlük klasörde bile); gün listesi hepsini verir', async () => {
    const eski = await gunlukOku(dizin, { duzey: 'hata', adet: 10, gun: '2026-11-01' });
    assert.deepEqual({ d: eski.dosyalar, s: eski.satirlar.map((x) => x.ileti), g: eski.gunler }, { d: ['sunucu-2026-11-01.log'], s: ['eski'], g: ['2026-11-24', '2026-11-23', '2026-11-01'] });
    assert.deepEqual((await gunlukOku(dizin, { duzey: 'hata', adet: 10, gun: '2026-10-01' })).dosyalar, []);
  });
});

describe('kapanma kaydı ve uçlar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let uyg: FastifyInstance;
  let dizin: string;
  let yonetici = '';
  let izleyen = '';
  const acik = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam; };
  const acilis = new Date('2026-11-24T12:24:00.000Z');
  const kapandi = '2026-11-24T12:22:01.000Z';

  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie'] ?? '').split(';')[0] ?? '';
  };

  before(async () => {
    ortam = await testVeritabaniKur('saglikkapanma');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    dizin = await mkdtemp(join(tmpdir(), 'kapanma-'));
    // Oturum uçları tam uygulamada; sağlık uçları günlük klasörü yönlendirilmiş ayrı uygulamada, kimlik aynı veritabanındaki oturumdan çözülür.
    uyg = Fastify();
    hataYonetiminiKur(uyg);
    uclariKaydet(uyg, saglikUclari(30, { ayarOku: () => ({ commit: null, ortam: 'test' }), gitOku: async () => null, gunlukDizini: () => dizin }), { vt: acik().vt, kimlik: kimlikCozucu(acik().vt) });
    app = await uygulamaKur({ vt: acik().vt, ayar: acik().ayar, kimlik: kimlikCozucu(acik().vt) });
    await acik().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const id = await acik().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'izleyen', parola: PAROLA }));
    await acik().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('izleyen', 'İzleyen')");
    await acik().vt.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = \'izleyen\') WHERE kisi_id = $1', [id]);
    yonetici = await giris('yonetici');
    izleyen = await giris('izleyen');
  });
  after(async () => {
    await rm(dizin, { recursive: true, force: true });
    await uyg.close();
    await app.close();
    await ortam?.kaldir();
  });

  test('kayıt: bellek taşması, süren istekler, hata satırları, dakikalar; ikinci çalışma tekrar yazmaz; dosyalar arşivlenir; bildirim gider', async () => {
    const vt = acik().vt;
    await mkdir(join(dizin, 'cokus'), { recursive: true });
    await writeFile(join(dizin, 'bekci.log'), `${[
      bekci('2026-11-24T08:00:00.000Z', 'Sunucu açılıyor.'),
      bekci(kapandi, 'Sunucu kapandı (çıkış 134); 5 sn sonra yeniden açılacak.'),
      bekci('2026-11-24T12:22:06.000Z', 'Sunucu açılıyor.'),
    ].join('\n')}\n`);
    await writeFile(join(dizin, 'cokus', 'report.1.json'), JSON.stringify({ header: { event: 'JavaScript heap out of memory', trigger: 'FatalError', dumpEventTime: '2026-11-24T12:22:00.500Z' }, javascriptHeap: { usedMemory: 2_000_000_000 }, resourceUsage: { rss: 2_400_000_000 } }));
    await writeFile(join(dizin, 'suren-istekler.json'), JSON.stringify({ surum: 1, an: '2026-11-24T12:21:50.000Z', istekler: [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, baslangic: '2026-11-24T12:21:23.000Z' }] }));
    await writeFile(join(dizin, 'sunucu-2026-11-24.log'), `${[
      pino('2026-11-24T12:21:58.000Z', 50, { msg: 'Plan hesabı bellek sınırını aştı', reqId: '1a2b3c4d' }),
      pino('2026-11-24T12:23:00.000Z', 50, { msg: 'yeni açılışın satırı' }),
    ].join('\n')}\n`);
    await vt.sorgu('INSERT INTO saglik_metrik_dakika (an, veri) VALUES ($1, $2), ($3, $4)', [
      '2026-11-24T12:20:00.000Z', JSON.stringify({ bellek: { rssBayt: 1, yiginBayt: 2 } }), '2026-11-24T12:21:00.000Z', JSON.stringify({ bellek: { rssBayt: 3, yiginBayt: 4 } }),
    ]);
    const id = await vt.tx((db) => kapanmayiKaydet(db, { gunlukDizini: dizin, acilis }));
    assert.ok(id !== null);
    assert.equal(await vt.tx((db) => kapanmayiKaydet(db, { gunlukDizini: dizin, acilis })), null);
    assert.deepEqual((await readdir(join(dizin, 'cokus', 'arsiv'))).sort(), [`cokus-${String(Date.parse(kapandi))}.json`, `suren-istekler-${String(Date.parse(kapandi))}.json`]);
    const b = await vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE tur = 'saglik.sunucu-kapandi'");
    assert.equal(b?.n, 1);

    const liste = await uyg.inject({ method: 'GET', url: '/api/saglik/kapanmalar', headers: { cookie: yonetici } });
    assert.equal(liste.statusCode, 200, liste.body);
    assert.deepEqual(liste.json().kapanmalar.map((x: { id: number; neden: string }) => [x.id, x.neden]), [[id, 'bellek-tasmasi']]);
    const ayr = await app.inject({ method: 'GET', url: `/api/saglik/kapanmalar/${String(id)}`, headers: { cookie: yonetici } });
    assert.equal(ayr.statusCode, 200, ayr.body);
    const k = ayr.json();
    assert.deepEqual({ neden: k.neden, kod: k.cikisKodu, sn: k.kapaliSn, bellek: k.bellek, yigin: typeof k.yigin }, { neden: 'bellek-tasmasi', kod: 134, sn: 119, bellek: { rssBayt: 2_400_000_000, yiginBayt: 2_000_000_000 }, yigin: 'object' });
    assert.deepEqual(k.surenIstekler, [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, sureSn: 38 }]);
    assert.deepEqual(k.hataSatirlari.map((h: { hataKodu: string | null }) => h.hataKodu), ['1a2b3c4d']);
    assert.equal(k.dakikalar.length, 0, 'örnek dakika eksik alanlı olduğundan sözleşmeyi geçmez ya da boş');
  });

  test('uçlar: kimliksiz 401, işlemsiz 403, bilinmeyen kayıt 404, günlük ekrandan okunur', async () => {
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/kapanmalar' })).statusCode, 401);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/kapanmalar', headers: { cookie: izleyen } })).statusCode, 403);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/kapanmalar/999999', headers: { cookie: yonetici } })).statusCode, 404);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/gunluk', headers: { cookie: izleyen } })).statusCode, 403);
    const g = await uyg.inject({ method: 'GET', url: '/api/saglik/gunluk?duzey=hata&hataKodu=1a2b3c4d', headers: { cookie: yonetici } });
    assert.equal(g.statusCode, 200, g.body);
    assert.equal(g.json().satirlar.length, 1);
    assert.equal((await uyg.inject({ method: 'GET', url: '/api/saglik/gunluk?hataKodu=zz', headers: { cookie: yonetici } })).statusCode, 400);
  });

  test('90 günden eski kayıt ve arşiv dosyası silinir, yenisi kalır', async () => {
    const vt = acik().vt;
    const sil = await vt.tx((db) => kapanmaTemizligi(db, dizin, new Date('2027-03-01T00:00:00.000Z')));
    assert.equal(sil.kayit, 1);
    const kalan = await vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM saglik_kapanma');
    assert.equal(kalan?.n, 0);
  });
});
