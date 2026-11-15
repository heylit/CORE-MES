import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MevcutCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import type { SiparisAyrintisi } from '#paylasilan/sozlesme/siparisler.ts';
import { kablola } from '../../kablolama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Kart 3288-2: kaynak modülün olayı klasörü kayıtla aynı işlemde açar (kablolama.ts). Gerçek uçlar, gerçek PostgreSQL; ORN- veri.
const PAROLA = 'dogru-parola-1';

describe('kayıt olayları klasör açar (kart 3288-2; gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kisiId = 0;
  let sayac = 0;
  let mamulNo = 0;
  let kokYokSiparis = 0;
  let kokYokProje = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const gonder = async (yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const tamam = async (yol: string, govde: unknown = {}) => {
    const c = await gonder(yol, govde);
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c;
  };
  const klasor = (tur: string, id: number) => o().vt.tek<{ id: number; ad: string; ust_id: number | null; arsiv: boolean }>(
    'SELECT id, ad, ust_id, arsiv FROM ortak_dosyalar_klasor WHERE kaynak_tur = $1 AND kaynak_id = $2', [tur, id],
  );
  const altAdlar = async (ustId: number) => (await o().vt.sorgu<{ ad: string }>(
    'SELECT ad FROM ortak_dosyalar_klasor WHERE ust_id = $1 AND kaynak_tur IS NULL ORDER BY ad', [ustId],
  )).map((r) => r.ad);
  const acilamayan = (tur: string, id: number) => o().vt.tek<{ neden: string }>(
    'SELECT neden FROM ortak_dosyalar_acilamayan WHERE kaynak_tur = $1 AND kaynak_id = $2', [tur, id],
  );
  const firmaAc = async (tur: string, kod: string | null = null) =>
    (await tamam('/musteri-tedarikci/firmalar/ekle', { ad: `ORN Firma ${(sayac += 1)}`, kod, tur })).json<{ firma: { id: number; surum: number } }>().firma;
  const siparisAc = async (firmaId: number) => (await tamam('/siparisler/ekle', {
    firmaId, musteriSiparisNo: `ORN-PO-${(sayac += 1)}`, siparisTarihi: '2026-11-15', termin: '2026-12-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
    satirlar: [{ malzemeNo: mamulNo, miktar: '10', birimFiyat: '5', termin: null, aciklama: null }],
  })).json<SiparisAyrintisi>();
  const projeAc = async (siparisId: number) => (await tamam('/projeler', {
    kod: `ORN.P${(sayac += 1)}`, ad: 'ORN Valf gövdesi', baslangic: '2026-11-15', bitis: null, aciklama: null, siparisId,
  })).json<{ id: number; kod: string; surum: number; durum: string }>();

  before(async () => {
    ortam = await testVeritabaniKur('ortak_dosyalar_kayit_baglari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kablola();
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kayit-bag-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'kayit-bag-yonetici', parola: PAROLA } });
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-KB-', 0) ON CONFLICT (onek) DO NOTHING");
    mamulNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('orn-kb-1', 'mamul', 'ORN-KB-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'orn-kb-1', com: { ad: 'ORN mamul' } }), kisiId],
    ))!.no;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KB-1 kök yokken müşteri, sipariş ve proje yazılır, klasörü "Açılamayan"a düşer; kök açılınca yeniden denenir', async () => {
    const f = await firmaAc('musteri', 'ORN-M900');
    const ad = `ORN-M900 ORN Firma ${sayac}`;
    assert.equal(await klasor('firma', f.id), null);
    assert.ok((await acilamayan('firma', f.id)) !== null);
    const s = await siparisAc(f.id);
    await tamam(`/siparisler/${s.id}/onayla`, { surum: s.surum });
    const p = await projeAc(s.id);
    assert.equal(await klasor('siparis', s.id), null);
    assert.equal(await klasor('proje', p.id), null);
    kokYokSiparis = s.id;
    kokYokProje = p.id;
    await tamam('/ortak-dosyalar/ayarlar/kok-ac');
    await tamam(`/ortak-dosyalar/ayarlar/acilamayan/firma/${f.id}/yeniden-dene`);
    assert.equal((await klasor('firma', f.id))?.ad, ad);
  });

  test('KB-2 müşteri ve iki yönlü firmaya klasör açılır, adı değişince izler; yalnız tedarikçi olan firmaya açılmaz', async () => {
    const f = await firmaAc('musteri', 'ORN-M901');
    const k = await klasor('firma', f.id);
    assert.equal(k?.ad, `ORN-M901 ORN Firma ${sayac}`);
    await tamam(`/musteri-tedarikci/firmalar/${f.id}/guncelle`, { ad: 'ORN Yeni Ad', kod: 'ORN-M901', tur: 'musteri', surum: f.surum });
    assert.equal((await klasor('firma', f.id))?.ad, 'ORN-M901 ORN Yeni Ad');
    const i = await firmaAc('ikisi', 'ORN-M903');
    assert.equal((await klasor('firma', i.id))?.ad, `ORN-M903 ORN Firma ${sayac}`);
    const t = await firmaAc('tedarikci');
    assert.equal(await klasor('firma', t.id), null);
    assert.equal(await acilamayan('firma', t.id), null);
  });

  test('KB-3 sipariş müşteri klasörünün altında şablonuyla, proje siparişin altında açılır; adları izler; iptalde sipariş klasörü arşive kalkar', async () => {
    const f = await firmaAc('musteri', 'ORN-M902');
    const s0 = await siparisAc(f.id);
    const k = await klasor('siparis', s0.id);
    assert.equal(k?.ust_id, (await klasor('firma', f.id))?.id);
    assert.equal(k?.ad, `${s0.no} (ORN-PO-${sayac})`);
    assert.deepEqual((await altAdlar(k!.id)).sort((a, b) => a.localeCompare(b, 'tr')), ['Çizim ve model', 'Kalite', 'Sevkiyat', 'Teklif']);
    const s = (await tamam(`/siparisler/${s0.id}/guncelle`, {
      firmaId: f.id, musteriSiparisNo: 'ORN-PO-YENI', siparisTarihi: '2026-11-15', termin: '2026-12-15', kdvOrani: '20', odemeKosulu: null, aciklama: null,
      satirlar: [{ malzemeNo: mamulNo, miktar: '10', birimFiyat: '5', termin: null, aciklama: null }], surum: s0.surum,
    })).json<SiparisAyrintisi>();
    assert.equal((await klasor('siparis', s.id))?.ad, `${s.no} (ORN-PO-YENI)`);
    const onayli = (await tamam(`/siparisler/${s.id}/onayla`, { surum: s.surum })).json<SiparisAyrintisi>();
    const p = await projeAc(s.id);
    const pk = await klasor('proje', p.id);
    assert.equal(pk?.ust_id, k?.id);
    assert.equal(pk?.ad, `${p.kod} ORN Valf gövdesi`);
    await tamam(`/projeler/${p.id}/guncelle`, { ad: 'ORN Yeni proje', firmaId: f.id, baslangic: '2026-11-15', bitis: null, aciklama: null, durum: p.durum, surum: p.surum });
    assert.equal((await klasor('proje', p.id))?.ad, `${p.kod} ORN Yeni proje`);
    const iptal = (await tamam(`/siparisler/${s.id}/iptal`, { surum: onayli.surum, neden: 'ORN deneme' })).json<SiparisAyrintisi>();
    assert.equal(iptal.durum, 'iptal');
    assert.equal((await klasor('siparis', s.id))?.arsiv, true);
  });

  test('KB-4 toplu komutun kaynağı bağlıdır; klasörü olmayan sipariş ve projeyi sayar ve açar', async () => {
    const mevcut = async () => (await app.inject({ method: 'GET', url: '/api/ortak-dosyalar/ayarlar/mevcut', headers: { cookie: cerez } })).json<MevcutCevabi>();
    const m = await mevcut();
    assert.equal(m.bagli, true);
    assert.equal(m.kokVar, true);
    // KB-1'de kök yokken: bir sipariş, onayda kendiliğinden açılan proje (3272) ve elle açılan proje.
    assert.deepEqual(m.klasorsuz, { firma: 0, siparis: 1, proje: 2 });
    // Toplu komut "Açılamayan"daki kaydı atlar (yeniden dene ile açılır); bağlantıdan önce yazılmış kayıt gibi olsunlar diye o satırlar silinir.
    await o().sahip.sorgu("DELETE FROM ortak_dosyalar_acilamayan WHERE kaynak_tur IN ('siparis', 'proje')");
    const topluIs = randomUUID();
    for (let i = 0; i < 10; i += 1) {
      const c = (await tamam('/ortak-dosyalar/ayarlar/mevcut/ac', { topluIs, beklenen: i === 0 ? m.klasorsuz : null })).json<{ kalan: number }>();
      if (c.kalan === 0) break;
    }
    assert.deepEqual((await mevcut()).klasorsuz, { firma: 0, siparis: 0, proje: 0 });
    assert.equal((await klasor('proje', kokYokProje))?.ust_id, (await klasor('siparis', kokYokSiparis))?.id);
  });
});
