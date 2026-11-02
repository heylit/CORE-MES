import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

interface Oturum { id: number; cerez: string }
interface Kart { kimlik: string; surum: number | null; stokKodu: string | null }

// MLZ-5 a: onaya gönderilen kart onaycılara, reddedilen kart gönderene bildirilir; işlemi yapan kendi eylemi için almaz.
describe('Malzeme kartı onay bildirimleri (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string): Promise<Oturum> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu) {
        await rolAta(db, yoneticiId, yeni, hedefRol);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }
  async function kaydet(o: Oturum, k: Kart, durum: string): Promise<void> {
    const kod = k.stokKodu ?? 'HM-BIL-00001';
    const url = `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`;
    const govde = {
      kayit: { id: k.kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad: `Bildirim kart ${k.kimlik}`, birim: 'adet' }, opts: { koruma: ['Koruyucu folyo'] }, onay: { durum } },
      ozet: { stok_kodu: kod, tur: 'hammadde', onay_durumu: durum, benzersiz_anahtar: `HM|metal|${k.kimlik}`, mukerrer_gerekcesi: null },
      surum: k.surum,
    };
    const c = await app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: o.cerez }, payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object });
    assert.equal(c.statusCode, 200, c.body);
    const r = c.json() as KatalogKartiKaydetCevabi;
    k.surum = r.surum;
    k.stokKodu = r.stok_kodu;
  }
  const bildirimler = (kisiId: number, tur: string, k: Kart) => vt().sorgu<{ baslik: string; metin: string | null; yol: string | null }>(
    "SELECT baslik, metin, yol FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = $2 AND tekil_anahtar LIKE '%' || $3 ORDER BY id", [kisiId, tur, k.kimlik]);

  before(async () => {
    ortam = await testVeritabaniKur('malzemebildirim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = (await girisYap('b-yonetici', 'yonetici')).id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('onaya gönderilen kart onaycılara "onay bekliyor" olarak düşer; gönderen ve onay yetkisi olmayan almaz', async () => {
    const depo = await girisYap('b-depo', 'depo');
    const kalite = await girisYap('b-kalite', 'kalite');
    const satinAlma = await girisYap('b-satin-alma', 'satin_alma');
    const k: Kart = { kimlik: `bil${++sayac}`, surum: null, stokKodu: null };
    await kaydet(depo, k, 'onayda');
    const tur = 'malzemeler.kart-onay-bekliyor';
    assert.deepEqual(await bildirimler(kalite.id, tur, k), [
      { baslik: `Onay bekleyen malzeme kartı: ${k.stokKodu}`, metin: `${k.stokKodu} · Bildirim kart ${k.kimlik}`, yol: '/malzemeler' },
    ]);
    assert.deepEqual(await bildirimler(depo.id, tur, k), []);
    assert.deepEqual(await bildirimler(satinAlma.id, tur, k), []);
  });

  test('reddedilen kart gönderene "reddedildi" olarak düşer; reddeden almaz; taslak kayıt bildirim doğurmaz', async () => {
    const depo = await girisYap('b-depo-2', 'depo');
    const kalite = await girisYap('b-kalite-2', 'kalite');
    const k: Kart = { kimlik: `bil${++sayac}`, surum: null, stokKodu: null };
    await kaydet(depo, k, 'taslak');
    assert.deepEqual(await bildirimler(kalite.id, 'malzemeler.kart-onay-bekliyor', k), []);
    await kaydet(depo, k, 'onayda');
    await kaydet(kalite, k, 'taslak');
    const tur = 'malzemeler.kart-reddedildi';
    assert.deepEqual(await bildirimler(depo.id, tur, k), [
      { baslik: `Malzeme kartın reddedildi: ${k.stokKodu}`, metin: `${k.stokKodu} · Bildirim kart ${k.kimlik}`, yol: '/malzemeler' },
    ]);
    assert.deepEqual(await bildirimler(kalite.id, tur, k), []);
  });

  test('onaylanan kart ret bildirimi doğurmaz', async () => {
    const depo = await girisYap('b-depo-3', 'depo');
    const kalite = await girisYap('b-kalite-3', 'kalite');
    const k: Kart = { kimlik: `bil${++sayac}`, surum: null, stokKodu: null };
    await kaydet(depo, k, 'onayda');
    await kaydet(kalite, k, 'aktif');
    assert.deepEqual(await bildirimler(depo.id, 'malzemeler.kart-reddedildi', k), []);
  });
});
