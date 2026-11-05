import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ESKI_SURUM_NEDENI } from '#paylasilan/hata.ts';
import type { AparatKapasitesi, AparatKapasiteleriCevabi } from '#paylasilan/sozlesme/istasyonlar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { aparatKapasiteleri } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const YOL = '/istasyonlar/aparat-kapasiteleri';

interface Cevap<T = unknown> { durum: number; govde: T }

// 2112 (2099-1 a): aparatın plan kapasitesi. Yetki ve 401/403 reddi istasyonlar.test.ts'teki yazma tablosundadır.
describe('istasyonlar 2112: aparat plan kapasitesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let sayac = 0;
  const yeniKod = (onek: string): string => `${onek}-${(sayac += 1)}`;
  let kart = 700000;
  const yeniKart = (): number => (kart += 1);

  const vt = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde?: unknown) => istek<T>('POST', yol, govde);
  const hataKodu = (c: Cevap): unknown => (c.govde as { kod?: unknown } | undefined)?.kod;
  // Eski sürüm 409 CAKISMA'dır; ayrımı gövdedeki neden yapar.
  const eskiSurumMu = (c: Cevap): boolean => c.durum === 409 && JSON.stringify(c.govde).includes(ESKI_SURUM_NEDENI);
  const liste = async (): Promise<AparatKapasitesi[]> => (await istek<AparatKapasiteleriCevabi>('GET', YOL)).govde.kapasiteler;
  const kimlik = async (yol: string, govde: unknown): Promise<number> => {
    const c = await yaz<{ id: number }>(yol, govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.id;
  };
  const istasyonKur = async (): Promise<number> => {
    const merkez = await kimlik('/is-merkezleri', { kod: yeniKod('AP-IM'), ad: 'Deneme Merkezi' });
    return kimlik('/istasyonlar', { kod: yeniKod('AP-IS'), ad: 'Deneme İstasyonu', isMerkeziId: merkez });
  };
  const ekle = (govde: unknown) => yaz<AparatKapasitesi>(YOL, govde);

  before(async () => {
    ortam = await testVeritabaniKur('istasyonlar_aparat_kapasitesi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('ekleme kişi, zaman ve sürümle yazılır; okuma ve disari aynı satırı verir; istasyonsuz satır ortak aparattır', async () => {
    const istasyon = await istasyonKur();
    const [k1, k2] = [yeniKart(), yeniKart()];
    const ortak = await ekle({ aparatKartiId: k1, istasyonId: null, adet: 4 });
    assert.equal(ortak.durum, 200, JSON.stringify(ortak.govde));
    assert.deepEqual(
      [ortak.govde.aparatKartiId, ortak.govde.istasyonId, ortak.govde.adet, ortak.govde.degistiren, ortak.govde.surum],
      [k1, null, 4, { id: yoneticiId, ad: 'Deneme Yönetici' }, 1],
    );
    assert.match(ortak.govde.degisme, /^\d{4}-\d{2}-\d{2}T/);
    const bagli = await ekle({ aparatKartiId: k2, istasyonId: istasyon, adet: 2 });
    assert.equal(bagli.durum, 200, JSON.stringify(bagli.govde));

    const okunan = (await liste()).filter((s) => [k1, k2].includes(s.aparatKartiId));
    assert.deepEqual(okunan, [ortak.govde, bagli.govde]);
    const disaridan = (await vt().vt.tx((db) => aparatKapasiteleri(db))).filter((s) => [k1, k2].includes(s.aparatKartiId));
    assert.deepEqual(disaridan, okunan);
  });

  test('aynı kart aynı istasyonda (ya da ikisi de ortakta) iki satır olmaz: 409; başka istasyonda olur', async () => {
    const [i1, i2] = [await istasyonKur(), await istasyonKur()];
    const k = yeniKart();
    assert.equal((await ekle({ aparatKartiId: k, istasyonId: i1, adet: 1 })).durum, 200);
    const tekrar = await ekle({ aparatKartiId: k, istasyonId: i1, adet: 3 });
    assert.deepEqual([tekrar.durum, hataKodu(tekrar)], [409, 'CAKISMA']);
    assert.equal((await ekle({ aparatKartiId: k, istasyonId: i2, adet: 1 })).durum, 200);
    assert.equal((await ekle({ aparatKartiId: k, istasyonId: null, adet: 1 })).durum, 200);
    const ortakTekrar = await ekle({ aparatKartiId: k, istasyonId: null, adet: 2 });
    assert.deepEqual([ortakTekrar.durum, hataKodu(ortakTekrar)], [409, 'CAKISMA'], 'NULLS NOT DISTINCT');
    assert.equal((await liste()).filter((s) => s.aparatKartiId === k).length, 3);
  });

  test('geçersiz gövde 400 ve satır yazılmaz: adet 0 ve tavan üstü, kesirli adet, kart 0, int dışı kimlik, olmayan ya da pasif istasyon', async () => {
    const istasyon = await istasyonKur();
    const once = await liste();
    for (const govde of [
      { aparatKartiId: yeniKart(), istasyonId: null, adet: 0 },
      { aparatKartiId: yeniKart(), istasyonId: null, adet: 10001 },
      { aparatKartiId: yeniKart(), istasyonId: null, adet: 1.5 },
      { aparatKartiId: 0, istasyonId: null, adet: 1 },
      { aparatKartiId: 2147483648, istasyonId: null, adet: 1 },
      { aparatKartiId: yeniKart(), adet: 1 },
      { aparatKartiId: yeniKart(), istasyonId: 999999, adet: 1 },
    ]) {
      const c = await ekle(govde);
      assert.deepEqual([c.durum, hataKodu(c)], [400, 'DOGRULAMA'], JSON.stringify(govde));
    }
    const satir = await vt().vt.tek<{ surum: number; kod: string; is_merkezi_id: number }>('SELECT surum, kod, is_merkezi_id FROM istasyon WHERE id = $1', [istasyon]);
    assert.ok(satir);
    assert.equal((await yaz(`/istasyonlar/${istasyon}/guncelle`, { kod: satir.kod, ad: 'Deneme İstasyonu', isMerkeziId: satir.is_merkezi_id, aktif: false, surum: satir.surum })).durum, 200);
    const pasif = await ekle({ aparatKartiId: yeniKart(), istasyonId: istasyon, adet: 1 });
    assert.deepEqual([pasif.durum, hataKodu(pasif)], [400, 'DOGRULAMA'], 'pasif istasyon');
    assert.deepEqual(await liste(), once);
  });

  test('güncelleme adet ve istasyonu değiştirir, sürümü artırır; eski sürüm 409, olmayan kayıt 404; kart değişmez', async () => {
    const [i1, i2] = [await istasyonKur(), await istasyonKur()];
    const k = yeniKart();
    const id = (await ekle({ aparatKartiId: k, istasyonId: i1, adet: 1 })).govde.id;
    const yeni = await yaz<AparatKapasitesi>(`${YOL}/${id}/guncelle`, { istasyonId: i2, adet: 5, surum: 1, aparatKartiId: yeniKart() });
    assert.equal(yeni.durum, 200, JSON.stringify(yeni.govde));
    assert.deepEqual([yeni.govde.aparatKartiId, yeni.govde.istasyonId, yeni.govde.adet, yeni.govde.surum], [k, i2, 5, 2]);
    const eski = await yaz(`${YOL}/${id}/guncelle`, { istasyonId: i1, adet: 9, surum: 1 });
    assert.ok(eskiSurumMu(eski), JSON.stringify(eski));
    const surumsuz = await yaz(`${YOL}/${id}/guncelle`, { istasyonId: i1, adet: 9 });
    assert.deepEqual([surumsuz.durum, hataKodu(surumsuz)], [400, 'DOGRULAMA'], 'sürüm zorunlu');
    const yok = await yaz(`${YOL}/999999/guncelle`, { istasyonId: null, adet: 1, surum: 1 });
    assert.deepEqual([yok.durum, hataKodu(yok)], [404, 'BULUNAMADI']);
    assert.deepEqual((await liste()).find((s) => s.id === id), yeni.govde);

    assert.equal((await ekle({ aparatKartiId: k, istasyonId: null, adet: 1 })).durum, 200);
    const cakisan = await yaz(`${YOL}/${id}/guncelle`, { istasyonId: null, adet: 1, surum: 2 });
    assert.deepEqual([cakisan.durum, hataKodu(cakisan), eskiSurumMu(cakisan)], [409, 'CAKISMA', false], 'güncelleme de tekliği korur');
  });

  test('silme sürüm ister: eski sürüm 409 ve satır kalır, doğru sürüm 204, ikinci silme 404; istasyon silinince satırı gider', async () => {
    const istasyon = await istasyonKur();
    const id = (await ekle({ aparatKartiId: yeniKart(), istasyonId: null, adet: 1 })).govde.id;
    assert.deepEqual([(await yaz(`${YOL}/${id}/sil`, {})).durum], [400], 'sürüm zorunlu');
    const eski = await yaz(`${YOL}/${id}/sil`, { surum: 7 });
    assert.ok(eskiSurumMu(eski), JSON.stringify(eski));
    assert.ok((await liste()).some((s) => s.id === id));
    assert.equal((await yaz(`${YOL}/${id}/sil`, { surum: 1 })).durum, 204);
    const ikinci = await yaz(`${YOL}/${id}/sil`, { surum: 1 });
    assert.deepEqual([ikinci.durum, hataKodu(ikinci)], [404, 'BULUNAMADI']);

    const bagli = (await ekle({ aparatKartiId: yeniKart(), istasyonId: istasyon, adet: 1 })).govde.id;
    assert.equal((await yaz(`/istasyonlar/${istasyon}/sil`)).durum, 204);
    assert.equal((await liste()).some((s) => s.id === bagli), false);
  });

  test('1968 a: ekleme, güncelleme ve silme değişiklik defterine kişiyle düşer', async () => {
    const id = (await ekle({ aparatKartiId: yeniKart(), istasyonId: null, adet: 1 })).govde.id;
    assert.equal((await yaz(`${YOL}/${id}/guncelle`, { istasyonId: null, adet: 2, surum: 1 })).durum, 200);
    assert.equal((await yaz(`${YOL}/${id}/sil`, { surum: 2 })).durum, 204);
    const defter = await vt().sahip.sorgu<{ islem: string; kisi_id: number | null }>(
      `SELECT islem, kisi_id FROM denetim_degisiklik WHERE tablo = 'istasyonlar_aparat_kapasitesi' AND anahtar = jsonb_build_object('id', $1::int)
        ORDER BY id`,
      [id],
    );
    assert.equal(defter.length, 3, JSON.stringify(defter));
    assert.ok(defter.every((d) => d.kisi_id === yoneticiId), JSON.stringify(defter));
  });
});
