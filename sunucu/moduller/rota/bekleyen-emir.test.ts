import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimGirdisi, KomutCevabi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { BEKLEYEN_ROTA_YOK, ROTA_BEKLEMIYOR } from './servis.ts';

// 3272 (UE-SA-04, 3272-2 a): siparişten açılan emir türünün yürürlükteki rotasını alır; rotası yoksa "rota bekliyor" açılır ve rota
// yürürlüğe girince kendiliğinden dolar. Veriler uydurmadır (ORN- kodlu).
const PAROLA = 'dogru-parola-1';
interface Hata { kod: string; mesaj: string }

describe('rota bekleyen emir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let firmaId = 0;
  let makine = 0;
  let tipId = 0;
  let hammadde = 0;
  let sayac = 0;
  const c = { yazan: '', onayci: '' };

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, payload: payload as object | undefined, headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) } });
  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const r = await istek(cerez, yontem, url, payload);
    assert.equal(r.statusCode, 200, `${yontem} ${url}: ${r.body}`);
    return r.json();
  }
  async function giris(kullaniciAdi: string): Promise<string> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    return String(g.headers['set-cookie']).split(';')[0] ?? '';
  }

  const kart = async (tur: 'mamul' | 'hammadde'): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'ORN-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`ornbe-${sayac}`, tur, sayac, JSON.stringify({ id: `ornbe-${sayac}`, com: { ad: 'Deneme malzeme' } }), yoneticiId]))!.no;
  };
  const adim = (): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tipId, ad: 'Deneme adım', kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [],
  });
  async function yururlugeAl(urun: number): Promise<number> {
    const { id } = await tamam<KomutCevabi>(c.yazan, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' } });
    const k = await tamam<KomutCevabi>(c.yazan, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar: [adim(), adim()] });
    const g = await tamam<KomutCevabi>(c.yazan, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.surum });
    await tamam(c.onayci, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.surum, yururlugeAl: true });
    return id;
  }
  const siparisOnayla = async (malzemeNo: number): Promise<number> => {
    sayac += 1;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 30, 20, $3) RETURNING id`, [`ORN-BE-${sayac}`, firmaId, yoneticiId]);
    const satir = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 4, 5) RETURNING id', [id, malzemeNo]);
    await tamam(c.yazan, 'POST', `/siparisler/${id}/onayla`, { surum: 1 });
    return satir;
  };
  interface Emir { id: number; bekliyor: boolean; kaynak: number | null; adim: number; durum: string; surum: number }
  const emri = async (satir: number): Promise<Emir> => (await o().sahip.tek<Emir>(
    `SELECT e.id, e.rota_bekliyor AS bekliyor, e.kaynak_rota_revizyonu_id AS kaynak, e.durum, e.surum,
            (SELECT count(*)::int FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id) AS adim
       FROM uretim_emri e WHERE e.siparis_satiri_id = $1`, [satir]))!;

  before(async () => {
    ortam = await testVeritabaniKur('rota_bekleyen_emir');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Onaycı', kullaniciAdi: 'onayci', parola: PAROLA }));
    c.yazan = await giris('yonetici');
    c.onayci = await giris('onayci');
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-', 0) ON CONFLICT (onek) DO NOTHING");
    const merkez = await tamam<{ id: number }>(c.yazan, 'POST', '/is-merkezleri', { kod: 'ORN-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yazan, 'POST', '/istasyonlar', { kod: 'ORN-I', ad: 'Deneme istasyon', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>(c.yazan, 'POST', '/makineler', { kod: 'ORN-M', ad: 'Deneme makine', istasyonId: istasyon })).id;
    const tipler = (await tamam<SeceneklerCevabi>(c.yazan, 'GET', '/rota/secenekler')).operasyonTipleri;
    tipId = (tipler.find((t) => t.kod === 'TRN') ?? tipler[0])!.id;
    hammadde = await kart('hammadde');
  });
  after(async () => { await ortam?.kaldir(); });

  test('yürürlükte rotası olan ürünün emri onayda rotadan dolu açılır', async () => {
    const urun = await kart('mamul');
    const rev = await yururlugeAl(urun);
    const e = await emri(await siparisOnayla(urun));
    assert.deepEqual([e.bekliyor, e.kaynak, e.adim, e.durum], [false, rev, 2, 'taslak']);
  });

  test('3272-2 a: rotasız ürünün emri "rota bekliyor" açılır; rota yürürlüğe girince kendiliğinden dolar ve bekleme kalkar', async () => {
    const urun = await kart('mamul');
    const satir = await siparisOnayla(urun);
    const once = await emri(satir);
    assert.deepEqual([once.bekliyor, once.kaynak, once.adim], [true, null, 0]);
    const elle = await istek(c.yazan, 'POST', `/rota/emirler/${once.id}/bekleyen-rotayi-uygula`);
    assert.deepEqual([elle.statusCode, elle.json<Hata>().mesaj], [422, BEKLEYEN_ROTA_YOK]);
    const rev = await yururlugeAl(urun);
    const sonra = await emri(satir);
    assert.deepEqual([sonra.id, sonra.bekliyor, sonra.kaynak, sonra.adim, sonra.durum], [once.id, false, rev, 2, 'taslak']);
    const yine = await istek(c.yazan, 'POST', `/rota/emirler/${once.id}/bekleyen-rotayi-uygula`);
    assert.deepEqual([yine.statusCode, yine.json<Hata>().mesaj], [409, ROTA_BEKLEMIYOR]);
  });
});
