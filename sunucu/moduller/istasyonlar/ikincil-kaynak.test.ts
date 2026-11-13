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

// 3199 (A + D): kapasite satırı ikincil kaynaktır (tür, kısıt, özel takımın ömrü, kesinti takvimi). Yetki 2112 uçlarınınkiyle aynıdır
// (istasyonlar.test.ts yazma tablosu).
describe('istasyonlar 3199: ikincil kaynak alanları ve kesinti takvimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let yoneticiId = 0;
  let sayac = 0;
  const yeniKod = (onek: string): string => `${onek}-${(sayac += 1)}`;
  let kart = 760000;
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
    ortam = await testVeritabaniKur('istasyonlar_ikincil_kaynak');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
  });

  after(async () => {
    await ortam?.kaldir();
  });

  const KESINTI = { neden: 'bakim', baslangic: '2026-11-13T08:00:00+03:00', bitis: '2026-11-13T11:00:00+03:00', adet: 1, aciklama: 'ORN bakım' };

  test('varsayılan: alan verilmezse sert kısıtlı aparat, ömür boş, kesinti yok', async () => {
    const c = await ekle({ aparatKartiId: yeniKart(), istasyonId: null, adet: 2 });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual([c.govde.tur, c.govde.kisit, c.govde.omur, c.govde.omurBirimi, c.govde.degisimDk, c.govde.kesintiler], ['aparat', 'sert', null, null, null, []]);
  });

  test('özel takım ömrü, birimi, değişim süresi ve izle kısıtı yazılır; kesinti takvimi satırla döner, okuma ve disari aynıdır', async () => {
    const istasyon = await istasyonKur();
    const k = yeniKart();
    const c = await ekle({
      aparatKartiId: k, istasyonId: istasyon, adet: 1, tur: 'ozel_takim', kisit: 'izle', omur: 600, omurBirimi: 'dk', degisimDk: 20, kesintiler: [KESINTI],
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual([c.govde.tur, c.govde.kisit, c.govde.omur, c.govde.omurBirimi, c.govde.degisimDk], ['ozel_takim', 'izle', 600, 'dk', 20]);
    assert.equal(c.govde.kesintiler.length, 1);
    const [kes] = c.govde.kesintiler;
    assert.deepEqual([kes?.neden, kes?.adet, kes?.aciklama, Date.parse(kes?.baslangic ?? ''), Date.parse(kes?.bitis ?? '')],
      ['bakim', 1, 'ORN bakım', Date.parse(KESINTI.baslangic), Date.parse(KESINTI.bitis)]);
    const okunan = (await liste()).find((s) => s.aparatKartiId === k);
    assert.deepEqual(okunan, c.govde);
    const disaridan = (await vt().vt.tx((db) => aparatKapasiteleri(db))).find((s) => s.aparatKartiId === k);
    assert.deepEqual(disaridan, okunan);
  });

  test('güncelleme kesinti listesini yenisiyle değiştirir; eski sürüm 409 ve kesinti değişmez; satır silinince kesintisi de gider', async () => {
    const k = yeniKart();
    const c = await ekle({ aparatKartiId: k, istasyonId: null, adet: 2, kesintiler: [KESINTI] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const yeni = { neden: 'odunc', baslangic: '2026-11-18T08:00:00+03:00', bitis: '2026-11-20T17:00:00+03:00', adet: 1 };
    const g = await yaz<AparatKapasitesi>(`${YOL}/${c.govde.id}/guncelle`, { surum: 1, istasyonId: null, adet: 2, kesintiler: [yeni] });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.deepEqual(g.govde.kesintiler.map((x) => [x.neden, x.aciklama]), [['odunc', null]]);
    const eski = await yaz(`${YOL}/${c.govde.id}/guncelle`, { surum: 1, istasyonId: null, adet: 2, kesintiler: [] });
    assert.ok(eskiSurumMu(eski), JSON.stringify(eski.govde));
    assert.deepEqual((await liste()).find((s) => s.id === c.govde.id)?.kesintiler.map((x) => x.neden), ['odunc']);
    assert.equal((await yaz(`${YOL}/${c.govde.id}/sil`, { surum: 2 })).durum, 204);
    const kalan = await vt().vt.tx((db) => db.sorgu('SELECT 1 FROM istasyonlar_aparat_kesintisi WHERE kapasite_id = $1', [c.govde.id]));
    assert.equal(kalan.length, 0);
  });

  test('geçersiz gövde 400 ve satır yazılmaz: aparata ömür, birimsiz ömür, sıfır ömür, ters aralıklı kesinti, bilinmeyen tür ve kısıt, 51 kesinti', async () => {
    const k = yeniKart();
    const gecersiz: unknown[] = [
      { tur: 'aparat', omur: 100, omurBirimi: 'dk' },
      { tur: 'ozel_takim', omur: 100, omurBirimi: null },
      { tur: 'ozel_takim', omur: null, omurBirimi: 'adet' },
      { tur: 'ozel_takim', omur: 0, omurBirimi: 'adet' },
      { kesintiler: [{ ...KESINTI, bitis: KESINTI.baslangic }] },
      { kesintiler: [{ ...KESINTI, adet: 0 }] },
      { kesintiler: [{ ...KESINTI, neden: 'tatil' }] },
      { tur: 'olcu' },
      { kisit: 'yumusak' },
      { degisimDk: 1441 },
      { kesintiler: Array.from({ length: 51 }, () => KESINTI) },
    ];
    for (const ek of gecersiz) {
      const c = await ekle({ aparatKartiId: k, istasyonId: null, adet: 1, ...(ek as object) });
      assert.deepEqual([c.durum, hataKodu(c)], [400, 'DOGRULAMA'], JSON.stringify(ek));
    }
    assert.equal((await liste()).filter((s) => s.aparatKartiId === k).length, 0);
  });

  test('veritabanı kısıtı da korur: ömür aparatta ve birimsiz yazılamaz', async () => {
    await assert.rejects(vt().vt.tx((db) => db.sorgu(
      "INSERT INTO istasyonlar_aparat_kapasitesi (aparat_karti_id, adet, tur, omur, omur_birimi, degistiren_kisi_id) VALUES ($1, 1, 'aparat', 10, 'dk', $2)", [yeniKart(), yoneticiId])),
    /istasyonlar_aparat_kapasitesi_omur_takimda/);
    await assert.rejects(vt().vt.tx((db) => db.sorgu(
      "INSERT INTO istasyonlar_aparat_kapasitesi (aparat_karti_id, adet, tur, omur, degistiren_kisi_id) VALUES ($1, 1, 'ozel_takim', 10, $2)", [yeniKart(), yoneticiId])),
    /istasyonlar_aparat_kapasitesi_omur_birimli/);
  });
});
