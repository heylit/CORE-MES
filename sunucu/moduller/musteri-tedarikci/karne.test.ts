import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { FirmaTuru, KarneCevabi, KarneOlayi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { karneOlayiYaz, karneOzetleri } from './disari.ts';

// Örnek firmalar uydurmadır. Olaylar satın alma ve Kalite Merkezi'nin disari.ts çağrısının yerine doğrudan yazılır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
const kodu = (c: Cevap): unknown => (c.govde as { kod?: unknown } | undefined)?.kod;

describe('tedarikçi karnesi (gerçek PostgreSQL, 1259 c, 1260 a)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function istek<T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = {};
    if (kim !== null) basliklar['cookie'] = cerez.get(kim) ?? '';
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const karne = (kim: string | null, id: number) => istek<KarneCevabi>(kim, 'GET', `/musteri-tedarikci/firmalar/${id}/karne`);
  const hizmetEkle = (kim: string | null, id: number, govde: unknown) => istek<KarneCevabi>(kim, 'POST', `/musteri-tedarikci/firmalar/${id}/hizmet-puani/ekle`, govde);
  const yillikEkle = (kim: string | null, id: number, govde: unknown) => istek<KarneCevabi>(kim, 'POST', `/musteri-tedarikci/firmalar/${id}/yillik-karne/ekle`, govde);

  let sayac = 0;
  async function firma(tur: FirmaTuru = 'tedarikci'): Promise<number> {
    const f = await vt().tek<{ id: number }>(
      'INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ($1, $2, $3) RETURNING id', [`Karne Deneme ${(sayac += 1)}`, tur, yoneticiId]);
    if (!f) throw new Error('firma kurulamadı');
    return f.id;
  }
  const bugun = (): string => tesisGunu(Date.now());
  const simdi = (): string => new Date().toISOString().replace('Z', '+00:00');
  const olay = (o: KarneOlayi): Promise<void> => vt().tx((db) => karneOlayiYaz(db, o));
  const teslim = (firmaId: number, anahtar: string, termin: string, teslimGunu: string, tam = true): KarneOlayi =>
    ({ kaynak: 'satin-alma', anahtar, firmaId, zaman: simdi(), tur: 'teslim', termin, teslimGunu, tam });
  const lot = (firmaId: number, anahtar: string, karar: 'kabul' | 'sartli_kabul' | 'hatali_kabul' | 'red' | 'iade'): KarneOlayi =>
    ({ kaynak: 'kalite-merkezi', anahtar, firmaId, zaman: simdi(), tur: 'lot', karar });
  const olaySayisi = async (): Promise<number> => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM musteri_tedarikci_karne_olayi'))?.n ?? -1;
  const kisitAdi = async (sql: string, p: unknown[]): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
  };

  async function girisliKisi(kullaniciAdi: string, rolKodu: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('mtkarne');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Rol x işlem satırları teslimle girmez: test kendi geçici rollerini kurar.
    await girisliKisi('rolsuz', 'gecici_rolsuz', ['sayfa.musteri-tedarikci']);
    await girisliKisi('okuyan', 'gecici_karne_oku', ['musteri-tedarikci.oku', 'musteri-tedarikci.yaz']);
    await girisliKisi('satinalma', 'gecici_karne_hizmet', ['musteri-tedarikci.oku', 'satin-alma.yaz']);
    await girisliKisi('kalite', 'gecici_karne_yillik', ['musteri-tedarikci.oku', 'kalite-merkezi.onayla']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: karne okuması musteri-tedarikci.oku ister; oturumsuz 401, işlemsiz 403', async () => {
    const id = await firma();
    assert.equal((await karne(null, id)).durum, 401);
    assert.equal((await karne('rolsuz', id)).durum, 403);
    assert.equal((await karne('okuyan', id)).durum, 200);
    assert.equal((await karne('okuyan', 999_999)).durum, 404);
  });

  test('yetki: hizmet puanını yalnız satin-alma.yaz, yıllık karneyi yalnız kalite-merkezi.onayla yazar; reddedilen kayıt açmaz', async () => {
    const id = await firma();
    for (const kim of [null, 'rolsuz', 'okuyan', 'kalite']) {
      assert.equal((await hizmetEkle(kim, id, { puan: 4 })).durum, kim === null ? 401 : 403, String(kim));
    }
    for (const kim of [null, 'rolsuz', 'okuyan', 'satinalma']) {
      assert.equal((await yillikEkle(kim, id, { yil: 2026 })).durum, kim === null ? 401 : 403, String(kim));
    }
    const c = (await karne('okuyan', id)).govde;
    assert.equal(c.hizmetPuanlari.length, 0);
    assert.equal(c.yillikKarneler.length, 0);
    assert.equal((await hizmetEkle('satinalma', id, { puan: 4, not: 'Hızlı dönüş' })).durum, 200);
    assert.equal((await yillikEkle('kalite', id, { yil: 2026 })).durum, 200);
  });

  test('MT-16: olaylardan kayan 12 aylık karne hesaplanır; kişi ve zaman sunucudan yazılır', async () => {
    const id = await firma();
    const gun = bugun();
    for (let i = 0; i < 4; i += 1) await olay(teslim(id, `t${id}-${i}`, gun, gun));
    await olay(teslim(id, `t${id}-gec`, '2026-01-01', '2026-01-10'));
    for (const [i, k] of (['kabul', 'kabul', 'sartli_kabul', 'iade'] as const).entries()) await olay(lot(id, `l${id}-${i}`, k));
    // Dönem dışı teslim sayılmaz.
    await olay(teslim(id, `t${id}-eski`, '2020-01-01', '2020-01-01'));
    const h = await hizmetEkle('satinalma', id, { puan: 5, giren: 1, olusturma: '2000-01-01T00:00:00+00:00' });
    assert.equal(h.durum, 200, JSON.stringify(h.govde));
    const k = h.govde.karne;
    assert.equal(k.donemSonu, gun);
    assert.equal(k.teslim.toplam, 4 + (k.donemBasi <= '2026-01-01' ? 1 : 0));
    assert.equal(k.kalite.lot, 4);
    assert.equal(k.kalite.puan, 62.5);
    assert.equal(k.hizmet.puan, 100);
    assert.equal(k.yetersizVeri, false);
    assert.notEqual(k.puan, null);
    const [hp] = h.govde.hizmetPuanlari;
    assert.equal(hp?.giren, 'Deneme satinalma');
    assert.notEqual(hp?.olusturma.slice(0, 4), '2000');
    const disari = (await vt().tx((db) => karneOzetleri(db, [id, id]))).get(id);
    assert.deepEqual(disari, k);
  });

  test('olay kaynak ve anahtarla tektir: sonraki karar öncekinin yerine geçer, tekrar ikinci satır açmaz', async () => {
    const id = await firma();
    await olay(lot(id, `tek${id}`, 'kabul'));
    const once = await olaySayisi();
    await olay(lot(id, `tek${id}`, 'iade'));
    assert.equal(await olaySayisi(), once);
    const s = await vt().tek<{ k: string }>("SELECT lot_karari AS k FROM musteri_tedarikci_karne_olayi WHERE anahtar = $1", [`tek${id}`]);
    assert.equal(s?.k, 'iade');
  });

  test('reddedilen olay: geçersiz alan ve olmayan firma yazılmaz; kısıt tür alanlarını karıştırmaz', async () => {
    const id = await firma();
    const once = await olaySayisi();
    await assert.rejects(olay({ ...lot(id, 'x', 'kabul'), karar: 'hurda' } as unknown as KarneOlayi));
    await assert.rejects(olay(lot(999_999, 'y', 'kabul')), (h: { kod?: string }) => h.kod === 'BULUNAMADI');
    assert.equal(await olaySayisi(), once);
    assert.equal(await kisitAdi(
      "INSERT INTO musteri_tedarikci_karne_olayi (firma_id, kaynak, anahtar, tur, zaman, lot_karari, tam) VALUES ($1, 'kalite-merkezi', 'z', 'lot', now(), 'kabul', true)",
      [id]), 'musteri_tedarikci_karne_olayi_alanlar');
  });

  test('MT-16: yetersiz veride yıllık karne puansız ve sınıfsız kaydedilir; aynı yıl ikinci kez CAKISMA', async () => {
    const id = await firma('ikisi');
    const y = await yillikEkle('kalite', id, { yil: 2025, not: 'İlk değerlendirme', puan: 100, sinif: 'A' });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const [kayit] = y.govde.yillikKarneler;
    assert.equal(kayit?.puan, null);
    assert.equal(kayit?.sinif, null);
    assert.equal(kayit?.degerlendiren, 'Deneme kalite');
    const tekrar = await yillikEkle('kalite', id, { yil: 2025 });
    assert.equal(tekrar.durum, 409);
    assert.equal(kodu(tekrar), 'CAKISMA');
    assert.equal((await karne('okuyan', id)).govde.yillikKarneler.length, 1);
  });

  test('MT-17: müşteri türündeki firmaya hizmet puanı ve yıllık karne yazılmaz (422), kayıt açılmaz', async () => {
    const id = await firma('musteri');
    assert.equal((await hizmetEkle('satinalma', id, { puan: 3 })).durum, 422);
    assert.equal((await yillikEkle('kalite', id, { yil: 2026 })).durum, 422);
    const c = (await karne('okuyan', id)).govde;
    assert.equal(c.hizmetPuanlari.length + c.yillikKarneler.length, 0);
    assert.equal((await hizmetEkle('satinalma', id, { puan: 6 })).durum, 400);
  });
});
