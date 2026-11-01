import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { agirlikOzetiCevabi } from '#paylasilan/sozlesme/geometri.ts';
import type { AgirlikOzetiCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('geometri ağırlık özeti: malzeme kartının net ağırlığı için (1710)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let mil = 0;
  let yoneticiId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object | undefined });
  const tamam = (r: LightMyRequestResponse): unknown => { assert.equal(r.statusCode, 200, r.body); return r.json(); };
  const yol = (no: number): string => `/geometri/malzemeler/${String(no)}/agirlik-ozeti`;
  const ozet = async (no: number, c = cerez): Promise<AgirlikOzetiCevabi> => agirlikOzetiCevabi.parse(tamam(await istek('GET', yol(no), undefined, c)));

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }

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
    ortam = await testVeritabaniKur('geometri_agirlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const secilen = (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'malzemeler' || t.modul === 'kisiler');
    assert.equal((await ornekVeriYukle(ortam.vt, secilen, { ortam: 'test', bildir: () => undefined })).durum, 'yuklendi');
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    mil = (await o().vt.tx((db) => ornekMalzemeNo(db, 'mil')))!;
  });

  after(async () => { await ortam?.kaldir(); });

  test('model yokken ve analiz bitmemişken hacim gelmez, neden söylenir', async () => {
    assert.deepEqual(await ozet(mil), { model: null, hacimMm3: null, neden: 'model-yok', kalite: null });
    const m = await modelEkle(mil, 'kup.step');
    const r = await ozet(mil);
    assert.deepEqual([r.model?.belgeAdi, r.hacimMm3, r.neden], ['Model kup.step', null, 'analiz-yok']);
    await analizYaz(m);
  });

  test('analizden sonra hacim ve ilk önerinin kalitesi gelir; kart yazan alır, yalnız sayfayı gören alamaz', async () => {
    const r = await ozet(mil);
    assert.equal(r.neden, null);
    assert.equal(r.hacimMm3, 8000);
    assert.ok(r.kalite, 'örnek veride sığan hammadde var');
    const yazan = await islemliKisi('kartyazan', ['sayfa.malzemeler', 'malzemeler.yaz']);
    assert.deepEqual(await ozet(mil, yazan), r);
    const goren = await islemliKisi('kartgoren', ['sayfa.malzemeler']);
    assert.equal((await istek('GET', yol(mil), undefined, goren)).statusCode, 403);
  });
});
