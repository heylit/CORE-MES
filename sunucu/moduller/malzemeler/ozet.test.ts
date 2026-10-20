import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, MalzemelerOzetiCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Malzemeler pano özeti (kart #489, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, govde)) as object }) });
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  const kart = (kimlik: string, durum: string) => ({ id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: `HM-OZT-0000${kimlik.slice(-1)}`, birim: 'adet' }, onay: { durum } });
  const kaydet = (kayit: Record<string, unknown>, surum: number | null = null) =>
    tamam<KatalogKartiKaydetCevabi>(yonetici, 'POST', `/malzeme-katalogu-kartlari/${String(kayit['id'])}/kaydet`, {
      kayit, ozet: { benzersiz_anahtar: `hammadde|ozet|${String(kayit['id'])}`, mukerrer_gerekcesi: null }, surum,
    });
  const ozet = (cerez: string) => tamam<MalzemelerOzetiCevabi>(cerez, 'GET', '/malzemeler/ozet');

  before(async () => {
    ortam = await testVeritabaniKur('malzemeozet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme özet', kullaniciAdi: 'oz-yonetici', parola: PAROLA }));
    yonetici = await giris('oz-yonetici');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('onaydaki kart ve bekleyen değişiklik talebi sayılır; aktif ve taslak kart sayılmaz', async () => {
    assert.deepEqual(await ozet(yonetici), { onayBekleyen: 0 });
    await kaydet(kart('oz1', 'onayda'));
    await kaydet(kart('oz4', 'taslak'));
    // Kartın doğrudan aktif kaydı onay akışı kapalıyken olur.
    await tamam(yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    await kaydet(kart('oz3', 'aktif'));
    const aktif = kart('oz2', 'aktif');
    const r = await kaydet(aktif);
    assert.deepEqual(await ozet(yonetici), { onayBekleyen: 1 });
    const yeni = { ...aktif, com: { ...aktif.com, not: 'değişiklik' } };
    await kaydet({ ...aktif, talep: { id: 't1', durum: 'beklemede', yeni, by: yoneticiId, byAd: 'x', t: 7 } }, r.surum);
    assert.deepEqual(await ozet(yonetici), { onayBekleyen: 2 });
  });

  // Yönetici yerine yalnız verilen rolü taşıyan kişiyle girer.
  const rolluGiris = async (kullaniciAdi: string, rol: string): Promise<string> => {
    const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const [yoneticiRolu, hedefRol] = [await rolId('yonetici'), await rolId(rol)];
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme özet ${rol}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, hedefRol);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu);
    });
    return giris(kullaniciAdi);
  };

  test('onaylama işlemi olan rol (kalite) sayıyı görür; olmayan (operator) null alır, 403 değil', async () => {
    assert.deepEqual(await ozet(await rolluGiris('oz-kalite', 'kalite')), { onayBekleyen: 2 });
    assert.deepEqual(await ozet(await rolluGiris('oz-operator', 'operator')), { onayBekleyen: null });
  });

  test('oturumsuz istek 401', async () => {
    const c = await app.inject({ method: 'GET', url: '/api/malzemeler/ozet' });
    assert.equal(c.statusCode, 401, c.body);
  });
});
