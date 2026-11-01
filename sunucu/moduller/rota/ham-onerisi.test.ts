import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { HAM_ONERI_SAYISI, hamOnerisiCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { HamOnerisiCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('rota hammadde önerisi 3B analizden (1709)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let mil = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object | undefined });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const oneri = async (urunId: number): Promise<HamOnerisiCevabi> => hamOnerisiCevabi.parse(tamam(await istek('GET', `/rota/urunler/${String(urunId)}/ham-onerisi`)));

  // Model Çizim Merkezi'nin uçlarıyla eklenip yayınlanır; dönen revizyon analiz satırını eşlemek içindir.
  async function modelEkle(malzemeNo: number, dosyaAdi: string): Promise<{ revizyonId: number; belgeId: number; ozet: string }> {
    const icerik = Buffer.from(`ISO-10303-21;\n/* ${dosyaAdi} */\nEND-ISO-10303-21;\n`);
    const ozet = createHash('sha256').update(icerik).digest('hex');
    tamam(await istek('POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }));
    const ad = `Model ${dosyaAdi}`;
    const c = tamam(await istek('POST', `/cizimler/malzemeler/${String(malzemeNo)}/belge-ekle`, { ad, tur: '3b-model', ozet, dosyaAdi })) as
      { belgeler: { id: number; ad: string; surum: number; revizyonlar: { id: number }[] }[] };
    const b = c.belgeler.find((x) => x.ad === ad);
    assert.ok(b);
    const revizyonId = b.revizyonlar[0]?.id ?? 0;
    tamam(await istek('POST', `/cizimler/${String(b.id)}/revizyonlar/${String(revizyonId)}/yayinla`, { surum: b.surum }));
    return { revizyonId, belgeId: b.id, ozet };
  }

  // Analizi geometri süreci yazar (ayrı süreç, STEP çekirdeği); burada sürecin yazacağı satır 40x20x10 kutunun ölçüleriyle konur.
  async function analizYaz(m: { revizyonId: number; belgeId: number; ozet: string }): Promise<void> {
    await o().sahip.sorgu(
      `INSERT INTO geometri_analiz (revizyon_id, belge_id, ozet, motor, kutu_x_mm, kutu_y_mm, kutu_z_mm, obb_a_mm, obb_b_mm, obb_c_mm, cap_mm, obb_yon,
         hacim_mm3, alan_mm2, govde_sayisi, kapali, ucgen_sayisi, hesap_suresi_ms)
       VALUES ($1, $2, $3, 'deneme', 40, 20, 10, 40, 20, 10, 22.3607, '{1,0,0,0,1,0,0,0,1}', 8000, 2800, 1, true, 12, 1)`,
      [m.revizyonId, m.belgeId, m.ozet],
    );
  }

  before(async () => {
    ortam = await testVeritabaniKur('rota_ham_onerisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    mil = (await o().vt.tx((db) => ornekMalzemeNo(db, 'mil')))!;
  });

  after(async () => { await ortam?.kaldir(); });

  test('model yokken ve analiz bitmemişken öneri boş, neden söylenir', async () => {
    assert.deepEqual(await oneri(mil), { model: null, payMm: null, oneriler: [], neden: 'model-yok' });
    const m = await modelEkle(mil, 'kup.step');
    const r = await oneri(mil);
    assert.deepEqual([r.model?.belgeAdi, r.oneriler, r.neden], ['Model kup.step', [], 'analiz-yok']);
    await analizYaz(m);
  });

  test('analizden sonra sığan en küçük stok kartları en çok üç tane gelir; pay ayardan, ayar yoksa 0', async () => {
    const r = await oneri(mil);
    assert.equal(r.neden, null);
    assert.equal(r.payMm, 0);
    assert.ok(r.oneriler.length > 0 && r.oneriler.length <= HAM_ONERI_SAYISI, JSON.stringify(r.oneriler));
    const hacimler = r.oneriler.map((x) => x.hamHacimMm3);
    assert.deepEqual(hacimler, [...hacimler].sort((x, y) => x - y), 'en az talaş önce');
    assert.ok(hacimler.every((h) => h >= 8000), 'ham parçadan küçük olamaz');
    assert.equal((await istek('GET', `/rota/urunler/${String(mil)}/ham-onerisi`, undefined, '')).statusCode, 401);
  });
});
