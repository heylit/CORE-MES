import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Tezgah, TezgahAyari } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tezgahListesi } from './kurallar.ts';

// Tezgâh ayarı (1091 a, 1136 a, 1139 b: makine başına). Kişi, istasyon ve makine adları uydurmadır.
const PAROLA = 'dogru-parola-1';
const AYAR: TezgahAyari = {
  tur: 'mill', kontrol: 'heid', konik: 'HSK-A63', cepSayisi: 30, devir: 15000, isMiliDevri: null, canliTakim: null, canliDevir: null, elle: null, modelTuru: 'm_5ax',
};

describe('tezgâh listesi (saf)', () => {
  test('TZ-01: istasyonsuz ya da talaşlı istasyondaki makineler; pasif makine yalnız ayarı varsa gelir; ayarsızın sürümü 0', () => {
    const liste = tezgahListesi([
      { id: 1, kod: 'F-01', ad: 'Freze', istasyonId: 10, aktif: true },
      { id: 2, kod: 'K-01', ad: 'Ölçüm', istasyonId: 20, aktif: true },
      { id: 3, kod: 'F-02', ad: 'Eski freze', istasyonId: 10, aktif: false },
      { id: 4, kod: 'F-03', ad: 'Pasif ayarlı', istasyonId: 10, aktif: false },
      { id: 5, kod: 'Y-01', ad: 'Yeni gelen', istasyonId: null, aktif: true },
    ], new Set([10]), [{ makineId: 4, surum: 2, ...AYAR }]);
    assert.deepEqual(liste.map((t) => [t.makineId, t.istasyonId, t.surum, t.ayar?.konik ?? null]), [[1, 10, 0, null], [4, 10, 2, 'HSK-A63'], [5, null, 0, null]]);
  });
});

describe('cnc-kurulum tezgâh ayarı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazar = '';
  let okur = '';
  let yetkisiz = '';
  let istasyon = 0;
  let freze = 0;
  let bosta = 0;
  let kalite = 0;
  let pasif = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, payload: payload as object | undefined });
  const ayarYaz = (cerez: string, istasyonId: number | string, govde: Record<string, unknown>) => istek(cerez, 'POST', `/cnc-kurulum/tezgahlar/${String(istasyonId)}/ayar`, govde);
  const liste = async (cerez: string): Promise<Tezgah[]> => {
    const c = await istek(cerez, 'GET', '/cnc-kurulum/tezgahlar');
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as { tezgahlar: Tezgah[] }).tezgahlar;
  };

  before(async () => {
    ortam = await testVeritabaniKur('cnc_kurulum_tezgah');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yazar = await islemliKisi('yazar', ['cnc-kurulum.yaz']);
    okur = await islemliKisi('okur', ['cnc-kurulum.oku']);
    yetkisiz = await islemliKisi('yetkisiz', ['sayfa.ayarlar']);
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMTZ', 'Deneme Merkezi') RETURNING id");
    const istasyonEkle = async (kod: string, tip: string): Promise<number> =>
      (await ortam!.sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $1, $2, $3) RETURNING id', [kod, im!.id, tip]))!.id;
    istasyon = await istasyonEkle('TZ-IF', 'talasli');
    const olcum = await istasyonEkle('TZ-IK', 'kalite');
    const makineEkle = async (kod: string, istasyonId: number | null, aktif: boolean): Promise<number> =>
      (await ortam!.sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ($1, $1, $2, $3) RETURNING id', [kod, istasyonId, aktif]))!.id;
    freze = await makineEkle('TZ-F01', istasyon, true);
    bosta = await makineEkle('TZ-S01', null, true);
    kalite = await makineEkle('TZ-K01', olcum, true);
    pasif = await makineEkle('TZ-F02', istasyon, false);
  });

  after(async () => { await ortam?.kaldir(); });

  test('TZ-02: okuyan kişi makineleri ayarsız görür; yazan ilk ayarı 0 sürümle yazar, okuyan aynen görür', async () => {
    const once = await liste(okur);
    assert.deepEqual(once.map((t) => t.makineId), [freze, bosta]);
    assert.deepEqual(once[0], { makineId: freze, kod: 'TZ-F01', ad: 'TZ-F01', istasyonId: istasyon, aktif: true, ayar: null, surum: 0 });
    const c = await ayarYaz(yazar, freze, { ...AYAR, beklenenSurum: 0 });
    assert.equal(c.statusCode, 200, c.body);
    const t = (c.json() as { tezgah: Tezgah }).tezgah;
    assert.deepEqual(t.ayar, AYAR);
    assert.equal(t.surum, 1);
    assert.deepEqual((await liste(okur))[0], t);
  });

  test('TZ-03: sürüm tutmazsa 409 ve ayar değişmez; doğru sürümle yazılır ve sürüm ilerler', async () => {
    const [t] = await liste(okur);
    const eski = await ayarYaz(yazar, freze, { ...AYAR, cepSayisi: 60, beklenenSurum: 0 });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.deepEqual((await liste(okur))[0], t);
    const yeni = await ayarYaz(yazar, freze, { ...AYAR, cepSayisi: 60, beklenenSurum: t!.surum });
    assert.equal(yeni.statusCode, 200, yeni.body);
    assert.deepEqual((yeni.json() as { tezgah: Tezgah }).tezgah.surum, t!.surum + 1);
    assert.equal((await liste(okur))[0]?.ayar?.cepSayisi, 60);
  });

  test('TZ-04: yazma işlemi olmayan kişi yazamaz; işlemi olmayan kişi listeyi göremez (reddedilen)', async () => {
    const [t] = await liste(okur);
    assert.equal((await ayarYaz(okur, freze, { ...AYAR, devir: 1, beklenenSurum: t!.surum })).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/tezgahlar')).statusCode, 403);
    assert.equal((await ayarYaz(yetkisiz, freze, { ...AYAR, beklenenSurum: t!.surum })).statusCode, 403);
    assert.deepEqual((await liste(okur))[0], t);
  });

  test('TZ-05: geçersiz değer, talaşlı olmayan istasyondaki, pasif ve bulunmayan makine reddedilir; istasyonsuz makine yazılır', async () => {
    const [t] = await liste(okur);
    const s = t!.surum;
    for (const govde of [
      { ...AYAR, kontrol: 'fanuc' }, { ...AYAR, cepSayisi: 0 }, { ...AYAR, devir: 0 }, { ...AYAR, konik: '' }, { ...AYAR, modelTuru: 'kutu' },
      { ...AYAR, canliDevir: 6000 }, { ...AYAR, tur: undefined },
    ]) {
      const c = await ayarYaz(yazar, freze, { ...govde, beklenenSurum: s });
      assert.equal(c.statusCode, 400, `${JSON.stringify(govde)} ${c.body}`);
    }
    assert.equal((await ayarYaz(yazar, kalite, { ...AYAR, beklenenSurum: 0 })).statusCode, 400);
    assert.equal((await ayarYaz(yazar, pasif, { ...AYAR, beklenenSurum: 0 })).statusCode, 400);
    assert.equal((await ayarYaz(yazar, 999999, { ...AYAR, beklenenSurum: 0 })).statusCode, 404);
    assert.equal((await ayarYaz(yazar, 'x', { ...AYAR, beklenenSurum: 0 })).statusCode, 400);
    assert.deepEqual((await liste(okur))[0], t);
    const canli = await ayarYaz(yazar, freze, { ...AYAR, tur: 'lathe', canliTakim: true, canliDevir: 6000, beklenenSurum: s });
    assert.equal(canli.statusCode, 200, canli.body);
    const istasyonsuz = await ayarYaz(yazar, bosta, { ...AYAR, beklenenSurum: 0 });
    assert.equal(istasyonsuz.statusCode, 200, istasyonsuz.body);
    assert.equal((istasyonsuz.json() as { tezgah: Tezgah }).tezgah.istasyonId, null);
  });

  test('TZ-06: ayarı olan makine silinmez; pasiflenince listede kalır', async () => {
    // Sahip rolüyle: uygulama rolünün silme yetkisi olmasa da yabancı anahtar reddeder.
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM makine WHERE id = $1', [freze]), (e: { code?: string }) => e.code === '23503');
    await ortam!.sahip.sorgu('UPDATE makine SET aktif = false WHERE id = $1', [freze]);
    const l = await liste(okur);
    assert.deepEqual(l.map((t) => [t.makineId, t.aktif]), [[freze, false], [bosta, true]]);
    await ortam!.sahip.sorgu('UPDATE makine SET aktif = true WHERE id = $1', [freze]);
  });
});
