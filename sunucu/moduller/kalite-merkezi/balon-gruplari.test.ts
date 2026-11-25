import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { yururlukteOperasyonlar } from '../rota/disari.ts';
import { STUDYO_ILETILER, grupPlaniReddi } from './kurallar.ts';
import { resimMerkezdenEkle } from './studyo.ts';

// Balon grupları ve operasyon ataması (3693): adlı gruplar, bir balon birden çok grupta, operasyon en çok bir gruba, revizyon kopyası.
const PAROLA = 'dogru-parola-1';

async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

describe('Grup planı kuralı (saf)', () => {
  const temel = { mevcutGruplar: new Set([7]), balonNolari: new Set([1, 2, 3]), operasyonlar: new Set([10, 20]) };
  test('KM-S40 ad tekil, üye resmin balonu, atama listedeki gruba ve rotadaki operasyona, operasyon bir kez', () => {
    const g = [{ ad: 'A', balonlar: [1, 2] }, { id: 7, ad: 'B', balonlar: [2, 3] }];
    assert.equal(grupPlaniReddi({ ...temel, gruplar: g, atamalar: [{ operasyonId: 10, grup: 'A' }, { operasyonId: 20, grup: 'A' }] }), null);
    assert.equal(grupPlaniReddi({ ...temel, gruplar: [...g, { ad: 'a', balonlar: [] }], atamalar: [] }), 'grupAdTekrar');
    assert.equal(grupPlaniReddi({ ...temel, gruplar: [{ id: 9, ad: 'C', balonlar: [] }], atamalar: [] }), 'grupKimlikGecersiz');
    assert.equal(grupPlaniReddi({ ...temel, gruplar: [{ ad: 'C', balonlar: [4] }], atamalar: [] }), 'grupBalonYok');
    assert.equal(grupPlaniReddi({ ...temel, gruplar: g, atamalar: [{ operasyonId: 10, grup: 'A' }, { operasyonId: 10, grup: 'B' }] }), 'grupAtamaTekrar');
    assert.equal(grupPlaniReddi({ ...temel, gruplar: g, atamalar: [{ operasyonId: 10, grup: 'Z' }] }), 'grupAtamaGrupYok');
    assert.equal(grupPlaniReddi({ ...temel, gruplar: g, atamalar: [{ operasyonId: 99, grup: 'A' }] }), 'grupOperasyonYok');
  });
});

describe('Balon grupları (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let yonetici = '';
  let kalite = '';
  let yazar = '';
  let operator = '';
  let flans = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const oku = (cerez: string, url: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  const yaz = (cerez: string | null, url: string, govde: unknown, kimlik: string | null = randomUUID()): Promise<LightMyRequestResponse> => app.inject({
    method: 'POST', url: `/api${url}`, payload: govde as object,
    headers: { ...(cerez === null ? {} : { cookie: cerez }), ...(kimlik === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }) },
  });
  const ileti = (r: LightMyRequestResponse): unknown => (r.json() as { mesaj?: unknown }).mesaj;

  async function girisYap(kullaniciAdi: string, rolKodu: string | null): Promise<string> {
    const rol = async (kod: string) => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    if (rolKodu !== null) {
      await o().vt.tx(async (db) => {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yonId, yeni, await rol(rolKodu));
        await rolAl(db, yonId, yeni, await rol('yonetici'));
      });
    }
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function merkez<T>(yol: string, govde: unknown): Promise<T> {
    const c = await yaz(yonetici, yol, govde);
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as T;
  }
  async function belgeAc(ad: string): Promise<number> {
    const icerik = Buffer.from(`%PDF-1.4\n% ${ad}\n%%EOF\n`), ozet = createHash('sha256').update(icerik).digest('hex');
    await merkez(`/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    const b = await merkez<{ id: number; surum: number; revizyonlar: { id: number }[] }>('/cizimler', { ad, tur: 'teknik-resim', ozet, dosyaAdi: `${ad}.pdf` });
    await merkez(`/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    return b.id;
  }
  async function resimAc(ad: string): Promise<KmResim> {
    const id = (await o().vt.tx(async (db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: await belgeAc(ad) }))).id;
    for (const no of [1, 2]) {
      await o().sahip.sorgu('INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, guncelleyen_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [id, no, `Ø${String(no)}0`, '9.9', '10.1', yonId]);
    }
    return resimOku(id);
  }
  async function resimOku(id: number): Promise<KmResim> {
    const r = await oku(kalite, `/kalite-merkezi/studyo/parcalar/${String(flans)}`);
    assert.equal(r.statusCode, 200, r.body);
    return (r.json() as KmStudyoParcaCevabi).resimler.find((x) => x.id === id)!;
  }

  before(async () => {
    ortam = await testVeritabaniKur('km_balon_gruplari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kbg-yon', parola: PAROLA }));
    const yukle = await ornekVeriYukle(ortam.vt, await zincir('uretim-emirleri'), { ortam: 'test', bildir: () => undefined });
    assert.equal(yukle.durum, 'yuklendi');
    yonetici = await girisYap('kbg-yon', null);
    kalite = await girisYap('kbg-kalite', 'kalite');
    operator = await girisYap('kbg-operator', 'operator');
    // Yazar kalite kaydı girer ama planı ve balonu değiştirmez (603 a).
    const yazarRolu = (await o().vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('kbg_yazar', 'Deneme yazar') RETURNING id"))!.id;
    for (const islem of ['sayfa.kalite-merkezi', 'kalite-merkezi.oku', 'kalite-merkezi.yaz']) {
      await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [yazarRolu, islem]);
    }
    yazar = await girisYap('kbg-yazar', 'kbg_yazar');
    flans = (await o().vt.tx((db) => ornekMalzemeNo(db, 'flans')))!;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const yol = (id: number): string => `/kalite-merkezi/studyo/resimler/${String(id)}/gruplar`;
  const gruplar = (r: KmResim) => (r.gruplar ?? []).map((g) => [g.ad, g.balonlar, g.operasyonlar.map((x) => x.operasyonId)]);

  test('KM-S41 grup planı yazılır: bir balon iki grupta, grup iki operasyonda; plan sürümü artmaz; yazar ve operatör 403, oturumsuz 401', async () => {
    const r0 = await resimAc('Grup resmi');
    const ops = (await o().vt.tx((db) => yururlukteOperasyonlar(db, [flans]))).map((x) => x.operasyonId);
    assert.ok(ops.length >= 1, 'örnek rotada operasyon olmalı');
    const parcaOps = ((await oku(kalite, `/kalite-merkezi/studyo/parcalar/${String(flans)}`)).json() as KmStudyoParcaCevabi).operasyonlar ?? [];
    assert.deepEqual(parcaOps.map((x) => x.operasyonId), ops, 'parça cevabı rotanın operasyonlarını verir');
    assert.ok(parcaOps.every((x) => typeof x.ad === 'string' && x.ad.length > 0), 'operasyon adı rotadan gelir');
    const govde = { surum: r0.gruplarSurum!, gruplar: [{ ad: 'Boyutlar', balonlar: [1, 2] }, { ad: 'Çaplar', balonlar: [2] }], atamalar: ops.map((operasyonId) => ({ operasyonId, grup: 'Boyutlar' })) };
    assert.equal((await yaz(yazar, yol(r0.id), govde)).statusCode, 403);
    assert.equal((await yaz(operator, yol(r0.id), govde)).statusCode, 403);
    assert.equal((await yaz(null, yol(r0.id), govde)).statusCode, 401);
    const c = await yaz(kalite, yol(r0.id), govde);
    assert.equal(c.statusCode, 200, c.body);
    const r1 = (c.json() as { resim: KmResim }).resim;
    assert.deepEqual(gruplar(r1), [['Boyutlar', [1, 2], ops], ['Çaplar', [2], []]]);
    assert.deepEqual([r1.surum, r1.gruplarSurum], [r0.surum, r0.gruplarSurum! + 1], 'plan sürümü artmaz, grup sürümü artar');
    // Yeniden adlandırma ve silme: silinen grubun ataması kalkar, balonlar resimde kalır.
    const id = r1.gruplar![0]!.id;
    const d = await yaz(kalite, yol(r0.id), { surum: r1.gruplarSurum, gruplar: [{ id, ad: 'Ana', balonlar: [1] }], atamalar: [] });
    assert.equal(d.statusCode, 200, d.body);
    const r2 = (d.json() as { resim: KmResim }).resim;
    assert.deepEqual(gruplar(r2), [['Ana', [1], []]]);
    assert.equal(r2.balonlar.length, 2);
  });

  test('KM-S42 eski sürüm 409; geçersiz plan 400; kaldırılan balon gruptan görünmez', async () => {
    const r0 = await resimAc('Grup ret resmi');
    const g1 = { surum: r0.gruplarSurum!, gruplar: [{ ad: 'A', balonlar: [1, 2] }], atamalar: [] };
    assert.equal((await yaz(kalite, yol(r0.id), g1)).statusCode, 200);
    const eski = await yaz(kalite, yol(r0.id), g1);
    assert.deepEqual([eski.statusCode, ileti(eski)], [409, STUDYO_ILETILER.surumDegisti]);
    const gecersiz = [
      { gruplar: [{ ad: 'A', balonlar: [] }, { ad: 'a', balonlar: [] }], atamalar: [], ileti: STUDYO_ILETILER.grupAdTekrar },
      { gruplar: [{ ad: 'Iş', balonlar: [] }, { ad: 'iş', balonlar: [] }], atamalar: [], ileti: STUDYO_ILETILER.grupAdTekrar },
      { gruplar: [{ ad: 'A', balonlar: [9] }], atamalar: [], ileti: STUDYO_ILETILER.grupBalonYok },
      { gruplar: [{ ad: 'A', balonlar: [] }], atamalar: [{ operasyonId: 999999, grup: 'A' }], ileti: STUDYO_ILETILER.grupOperasyonYok },
      { gruplar: [{ ad: 'A', balonlar: [] }], atamalar: [{ operasyonId: 999999, grup: 'Z' }], ileti: STUDYO_ILETILER.grupAtamaGrupYok },
    ];
    const surum = r0.gruplarSurum! + 1;
    for (const g of gecersiz) {
      const r = await yaz(kalite, yol(r0.id), { surum, gruplar: g.gruplar, atamalar: g.atamalar });
      assert.deepEqual([r.statusCode, ileti(r)], [400, g.ileti]);
    }
    // Red sürümü artırmaz (işlem geri alınır): doğru sürümle yazım hâlâ geçer.
    const kalanSurum = (await resimOku(r0.id)).gruplarSurum!;
    assert.equal(kalanSurum, r0.gruplarSurum! + 1);
    await o().sahip.sorgu('UPDATE kalite_merkezi_balon SET aktif = false WHERE resim_id = $1 AND no = 2', [r0.id]);
    assert.deepEqual(gruplar(await resimOku(r0.id)), [['A', [1], []]]);
  });

  test('KM-S43 veritabanı kısıtları: aynı ad (büyük küçük harf gözetmeden) iki kez ve aynı operasyon iki gruba bağlanamaz', async () => {
    const r0 = await resimAc('Grup kısıt resmi');
    const g = async (ad: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
      'INSERT INTO kalite_merkezi_balon_grubu (resim_id, ad, guncelleyen_id) VALUES ($1, $2, $3) RETURNING id', [r0.id, ad, yonId]))!.id;
    const a = await g('A');
    const b = await g('B');
    await assert.rejects(g('a'));
    const op = (await o().vt.tx((db) => yururlukteOperasyonlar(db, [flans])))[0]!.operasyonId;
    await o().sahip.sorgu('INSERT INTO kalite_merkezi_balon_grubu_operasyon (resim_id, operasyon_id, grup_id) VALUES ($1, $2, $3)', [r0.id, op, a]);
    await assert.rejects(o().sahip.sorgu('INSERT INTO kalite_merkezi_balon_grubu_operasyon (resim_id, operasyon_id, grup_id) VALUES ($1, $2, $3)', [r0.id, op, b]));
    // Başka resmin grubuna bağlanamaz.
    const baska = await resimAc('Grup başka resim');
    await assert.rejects(o().sahip.sorgu('INSERT INTO kalite_merkezi_balon_grubu_operasyon (resim_id, operasyon_id, grup_id) VALUES ($1, $2, $3)', [baska.id, op, b]));
  });
});
