import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { after, before, describe, test } from 'node:test';
import { rolluGiris } from '#cekirdek/test-yetki.ts';
import { testSemasiAc, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { FINANS_YONETIM_YAZMA_ISLEMLERI } from '#paylasilan/islemler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uclar } from './uclar.ts';

// 3165 a: finans.yonet sekiz eyleme bölündü. Ölçülen: (B1) göç rolü, kişiye verilen eki ve kişiden alınanı kopyalar, bugün eski işlemi
// olan hiçbir rol ve kişi yetki kaybetmez; (B2) hiçbir uç eski işleme bağlı kalmaz, tablodaki her uç yazılı eylemi ister, her eylem
// en az bir ucu açar; (B3) tek eylemi olan kişi yalnız o eylemin uçlarından geçer; (B4) rol x uç tablosu bölünmeden önce ve sonra aynıdır.
const GERCEK_KLASOR = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC_ADI = '20261113212200_kisiler_finans_yonetim_eylemleri.sql';
const ESKI = 'finans.yonet';
const YENI: readonly string[] = FINANS_YONETIM_YAZMA_ISLEMLERI;

type Yetki = string | { biri: readonly string[] };
const ucYetkisi = (u: (typeof uclar)[number]): Yetki => u.yetki as Yetki;
const yetkiListesi = (y: Yetki): readonly string[] => (typeof y === 'string' ? [y] : y.biri);
// Bölünmeden önce bu uçlar eski işlemi isterdi; okumalar onu "biri" listesinde başka işlemlerle taşırdı.
const eskiYetki = (y: Yetki): Yetki => {
  const liste = yetkiListesi(y).filter((i) => !YENI.includes(i));
  if (!yetkiListesi(y).some((i) => YENI.includes(i))) return y;
  const eski = [...new Set([ESKI, ...liste])];
  return eski.length === 1 ? ESKI : { biri: eski };
};
const izinli = (y: Yetki, islemler: ReadonlySet<string>): boolean => yetkiListesi(y).some((i) => islemler.has(i));

// Sabit tablo: eylemler yer değiştirirse yerleşik roller (sekizini birden taşır) fark etmez, bu tablo eder.
const TANIM_UCLARI: Readonly<Record<string, Yetki>> = {
  'POST /finans/belgeler/:id/iptal': 'finans.iptal',
  'POST /finans/odemeler/:id/iptal': 'finans.iptal',
  'POST /finans/dagitimlar/:id/iptal': 'finans.iptal',
  'POST /finans/mahsuplar/:id/iptal': 'finans.iptal',
  'POST /finans/virmanlar/:id/iptal': 'finans.iptal',
  'POST /finans/cekler/:id/karsiliksiz': 'finans.cek-yonet',
  'POST /finans/cekler/:id/geri-al': 'finans.cek-yonet',
  'POST /finans/cekler/:id/iptal': 'finans.cek-yonet',
  'POST /finans/hesaplar/ekle': 'finans.hesap-yonet',
  'POST /finans/hesaplar/:id/guncelle': 'finans.hesap-yonet',
  'POST /finans/hesaplar/:id/pasif': 'finans.hesap-yonet',
  'POST /finans/hesaplar/:id/aktif': 'finans.hesap-yonet',
  'POST /finans/hesaplar/:id/esitle': 'finans.hesap-yonet',
  'POST /finans/genel-gider-oranlari/ekle': 'finans.oran-yaz',
  'POST /finans/genel-gider-oranlari/belgeden-ekle': 'finans.oran-yaz',
  'POST /finans/kdv-oranlari/ekle': 'finans.oran-yaz',
  'POST /finans/kdv-oranlari/kapat': 'finans.oran-yaz',
  'POST /finans/sabit-kiymetler/ekle': 'finans.sabit-kiymet',
  'POST /finans/sabit-kiymetler/:id/guncelle': 'finans.sabit-kiymet',
  'POST /finans/sabit-kiymetler/:id/pasif': 'finans.sabit-kiymet',
  'POST /finans/maliyetler/:tur/yaz': 'finans.maliyet-yaz',
  'POST /finans/maliyetler/:tur/:anahtar/kaldir': 'finans.maliyet-yaz',
  'POST /finans/duzenli-odemeler/ekle': 'finans.duzenli-odeme',
  'POST /finans/duzenli-odemeler/:id/guncelle': 'finans.duzenli-odeme',
  'POST /finans/butce/belirle': 'finans.ayar',
  'POST /finans/ayar/guncelle': 'finans.ayar',
  'POST /finans/toplu-ice-aktar': 'finans.ayar',
};
const ad = (u: (typeof uclar)[number]): string => `${u.yontem} ${u.yol}`;

describe('finans yönetim eylemlerine bölme (saf)', () => {
  test('B2: hiçbir uç eski işlemi istemez; tablodaki her uç yazılı eylemi ister; tablo dışında yalnız eylemle açılan uç yok', () => {
    for (const u of uclar) assert.equal(yetkiListesi(ucYetkisi(u)).includes(ESKI), false, ad(u));
    const bulunan = new Map(uclar.map((u) => [ad(u), ucYetkisi(u)]));
    for (const [yol, yetki] of Object.entries(TANIM_UCLARI)) assert.deepEqual(bulunan.get(yol), yetki, yol);
    const yalnizEylem = uclar.filter((u) => yetkiListesi(ucYetkisi(u)).every((i) => YENI.includes(i))).map(ad).sort();
    assert.deepEqual(yalnizEylem, Object.keys(TANIM_UCLARI).sort());
    for (const e of YENI) assert.equal(Object.values(TANIM_UCLARI).some((y) => y === e), true, e);
  });
});

describe('finans yönetim eylemleri uçta (gerçek giriş, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  before(async () => {
    ortam = await testVeritabaniKur('fnucyetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('B3: tek eylemi olan kişi yalnız o eylemin uçlarından geçer, ötekilerde 403 alır; eski işlem hiçbirini açmaz', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).');
    const cerezAl = rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur });
    for (const eylem of [...YENI, ESKI]) {
      const cerez = await cerezAl(['sayfa.finans', eylem]);
      for (const [yol, yetki] of Object.entries(TANIM_UCLARI)) {
        const [yontem, sablon] = yol.split(' ') as ['GET' | 'POST', string];
        const c = await app.inject({
          method: yontem, url: `/api${sablon.replace(':id', '999999').replace(':tur', 'malzeme').replace(':anahtar', '999999')}`,
          headers: { cookie: cerez, ...(yontem === 'POST' ? { 'istek-kimligi': randomUUID() } : {}) },
          ...(yontem === 'POST' ? { payload: {} } : {}),
        });
        assert.notEqual(c.statusCode, 401, `${eylem}: ${yol}`);
        assert.equal(c.statusCode !== 403, yetkiListesi(yetki).includes(eylem), `${eylem}: ${yol} -> ${c.statusCode}`);
      }
    }
  });
});

describe('finans yönetim eylemlerine bölme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  before(async () => { ortam = await testVeritabaniKur('fnbolme'); });
  after(async () => { await ortam?.kaldir(); });

  test('B1: yerleşik rollerde eski işlemi taşıyan her rol sekiz eylemi de taşır; eylemi olup eski işlemi olmayan rol yok', async () => {
    const satirlar = await vt().sorgu<{ kod: string; islemler: string[] }>(
      'SELECT r.kod, array_agg(ri.islem ORDER BY ri.islem) AS islemler FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id GROUP BY r.kod');
    assert.equal(satirlar.some((r) => r.islemler.includes(ESKI)), true);
    for (const r of satirlar) {
      const yeni = r.islemler.filter((i) => YENI.includes(i));
      assert.deepEqual(yeni, r.islemler.includes(ESKI) ? [...YENI].sort() : [], r.kod);
    }
  });

  test('B4: yerleşik her rol için rol x uç tablosu bölünmeden önce ve sonra aynıdır', async () => {
    const satirlar = await vt().sorgu<{ kod: string; islemler: string[] }>(
      'SELECT r.kod, coalesce(array_agg(ri.islem) FILTER (WHERE ri.islem IS NOT NULL), ARRAY[]::text[]) AS islemler FROM rol r LEFT JOIN rol_islemi ri ON ri.rol_id = r.id WHERE NOT r.yonetici GROUP BY r.kod');
    let karsilastirilan = 0;
    for (const r of satirlar) {
      const islemler = new Set(r.islemler);
      for (const u of uclar) {
        const y = ucYetkisi(u);
        if (!yetkiListesi(y).some((i) => YENI.includes(i))) continue;
        assert.equal(izinli(y, islemler), izinli(eskiYetki(y), islemler), `${r.kod}: ${u.yontem} ${u.yol}`);
        karsilastirilan += 1;
      }
    }
    assert.equal(karsilastirilan > 0, true);
  });
});

describe('finans yönetim eylemleri göçü var olan veritabanında (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  before(async () => {
    ortam = await testSemasiAc('fngoc');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-fngoc-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('B1: eski işlemi taşıyan rol, kişiye verilen ek ve kişiden alınan sekiz eyleme kopyalanır; kimse kaybetmez, alınan geri gelmez', async () => {
    const hepsi = (await readdir(GERCEK_KLASOR)).filter((ad) => ad.endsWith('.sql')).sort();
    const sira = hepsi.indexOf(GOC_ADI);
    assert.equal(sira > 0, true, 'göç bulunamadı');
    for (const ad of hepsi.slice(0, sira)) await copyFile(join(GERCEK_KLASOR, ad), join(klasor, ad));
    const { ayar, sema, vt } = acik();
    await gocleriUygula(ayar, klasor, { sema });
    // Göçten önceki durum: rol satırı yerleşik planlama rollerinden gelir; kişi eki ve kısıtı yöneticinin ekranından verilmiş gibi kurulur.
    const veren = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Veren') RETURNING id");
    const ekli = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Ekli') RETURNING id");
    const kisitli = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kısıtlı') RETURNING id");
    if (!veren || !ekli || !kisitli) throw new Error('kişi eklenemedi');
    await vt.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3)', [ekli.id, ESKI, veren.id]);
    await vt.sorgu('INSERT INTO kisi_islem_kisiti (kisi_id, islem, alan_id) VALUES ($1, $2, $3)', [kisitli.id, ESKI, veren.id]);
    const rolOnce = await vt.sorgu<{ rol_id: number }>('SELECT rol_id FROM rol_islemi WHERE islem = $1 ORDER BY rol_id', [ESKI]);
    assert.equal(rolOnce.length > 0, true);

    assert.deepEqual(await gocleriUygula(ayar, GERCEK_KLASOR, { sema }), hepsi.slice(sira));

    for (const { rol_id } of rolOnce) {
      const satir = await vt.sorgu<{ islem: string }>('SELECT islem FROM rol_islemi WHERE rol_id = $1 AND islem LIKE $2 ORDER BY islem', [rol_id, 'finans.%']);
      for (const e of [ESKI, ...YENI]) assert.equal(satir.some((x) => x.islem === e), true, `rol ${rol_id}: ${e}`);
    }
    const ekler = await vt.sorgu<{ islem: string; veren_id: number }>('SELECT islem, veren_id FROM kisi_islemi WHERE kisi_id = $1 ORDER BY islem', [ekli.id]);
    assert.deepEqual(ekler.map((e) => e.islem), [ESKI, ...YENI].sort());
    assert.equal(ekler.every((e) => e.veren_id === veren.id), true, 'veren korunur');
    const alinan = await vt.sorgu<{ islem: string }>('SELECT islem FROM kisi_islem_kisiti WHERE kisi_id = $1 ORDER BY islem', [kisitli.id]);
    assert.deepEqual(alinan.map((e) => e.islem), [ESKI, ...YENI].sort(), 'alınan yetki bölünmeyle geri gelmez');
    // Eski işlem silinmez (ayrı kart); başka işlem satırına dokunulmaz.
    assert.deepEqual(await vt.sorgu<{ rol_id: number }>('SELECT rol_id FROM rol_islemi WHERE islem = $1 ORDER BY rol_id', [ESKI]), rolOnce);
  });
});
