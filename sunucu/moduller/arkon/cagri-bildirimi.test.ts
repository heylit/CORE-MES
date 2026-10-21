import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// 298: operatörün açtığı ekip çağrısı TMI bildirim merkezine düşer; alıcıyı bildirim modülünün ekip eşlemesi seçer (varsayılan: ayarcı ve
// bakım müdüre de gider). Çağıran almaz; kabul, yükseltme ve kapatma yeni bildirim açmaz; aynı kayıt ikinci kez gelirse bildirim yinelenmez.
describe('arkon ekip çağrısı bildirimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  // Geçici rol işlemleriyle ya da var olan rol koduyla kişi.
  async function kisiKur(kullaniciAdi: string, rol: string[] | string): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const hedef = typeof rol === 'string'
      ? await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol])
      : await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    if (!yoneticiRolu || !hedef) throw new Error('rol kurulamadı');
    if (typeof rol !== 'string') for (const islem of rol) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [hedef.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, hedef.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  const cagriYaz = async (cerez: string, satir: Record<string, unknown>): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: '/api/arkon/kayitlar/calls/ekle', headers: { cookie: cerez }, payload: { satirlar: [satir], kaynak: 'cb1' } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const alanlar = async (kimlik: string): Promise<{ kisiId: number; baslik: string; metin: string | null; tekrar: number }[]> => vt().sorgu(
    `SELECT kisi_id AS "kisiId", baslik, metin, tekrar_sayisi AS tekrar FROM bildirim_kaydi WHERE tur = 'arkon.ekip-cagrisi' AND tekil_anahtar LIKE '%' || $1 ORDER BY kisi_id`, [kimlik]);

  before(async () => {
    ortam = await testVeritabaniKur('arkoncagri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('açılan ayarcı çağrısı müdüre bildirim olur; çağıran almaz; kabul, yükseltme, kapatma ve aynı kaydın yinelenmesi yeni bildirim açmaz', async () => {
    const operator = await kisiKur(`cbop${(sayac += 1)}`, ['arkon.operator', 'sayfa.uretim-terminali']);
    const mudur = await kisiKur(`cbmd${(sayac += 1)}`, 'mudur');
    const kalite = await kisiKur(`cbkl${(sayac += 1)}`, 'kalite');
    const ac = { cid: 'cb-1', callId: 'cb-call-1', team: 'ayarci', phase: 'open', machine: 'IST-9', mc: 'MK-9', note: 'Program değişti' };
    await cagriYaz(operator.cerez, ac);
    const ilk = await alanlar('cb-call-1');
    assert.deepEqual(ilk.map((x) => x.kisiId), [mudur.id], 'yalnız ayarcı ekibinin rolü (müdür) alır; kalite ve çağıran almaz');
    assert.match(ilk[0]!.baslik, /MK-9/);
    assert.equal(ilk[0]!.metin, 'Program değişti');
    assert.ok(!ilk.some((x) => x.kisiId === kalite.id || x.kisiId === operator.id));

    await cagriYaz(operator.cerez, ac);
    for (const phase of ['ack', 'esc', 'done']) await cagriYaz(operator.cerez, { ...ac, cid: `cb-1-${phase}`, phase });
    assert.deepEqual((await alanlar('cb-call-1')).map((x) => [x.kisiId, x.tekrar]), [[mudur.id, 1]], 'aynı çağrının sonraki aşamaları ve yinelenen kaydı yeni bildirim açmaz');
  });

  test('çağıran alıcı rolündeyse kendisi almaz; tanınmayan ekip bildirim açmaz', async () => {
    const mudurOperator = await kisiKur(`cbmo${(sayac += 1)}`, 'mudur');
    const baskaMudur = await kisiKur(`cbbm${(sayac += 1)}`, 'mudur');
    await cagriYaz(mudurOperator.cerez, { cid: 'cb-2', callId: 'cb-call-2', team: 'ayarci', phase: 'open', machine: 'IST-9' });
    const alicilar = (await alanlar('cb-call-2')).map((x) => x.kisiId);
    assert.ok(alicilar.includes(baskaMudur.id));
    assert.ok(!alicilar.includes(mudurOperator.id), 'çağıran kendi çağrısını almaz');
    await cagriYaz(mudurOperator.cerez, { cid: 'cb-3', callId: 'cb-call-3', team: 'forklift', phase: 'open', machine: 'IST-9' });
    assert.deepEqual(await alanlar('cb-call-3'), []);
  });
});
