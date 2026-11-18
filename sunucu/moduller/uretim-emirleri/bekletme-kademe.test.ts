import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { isGunuFarki, kademeKaynagiKaydet, kademeleriIlerlet, kademeTatilCozucusuKaydet } from '../bildirim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { bekletmeKademeOkuyucusu } from './disari.ts';
import { emirAc, emirAyrintisi, emirBeklet, izlemeListesi } from './servis.ts';

// 3416-1 a: yeni nedenler kısıttan geçer; beklemedeki emir kademeli uyarıya neden başına ve süren bekleme olarak girer; bekleme günü
// ekranda motorla aynı sayılır. Geçmiş anlı olaylar doğrudan eklenir (defter yalnız ekleme alır).
describe('uretim-emirleri bekletme kademeli uyarı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let sayac = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const gunOnce = (g: number): string => new Date(Date.now() - g * 86_400_000).toISOString();
  async function planliEmir(): Promise<{ id: number; emirNo: string }> {
    sayac += 1;
    const im = await ortam!.sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`BKD${sayac}`, 'Deneme Merkezi']);
    const ist = await ortam!.sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`BKDS${sayac}`, `Deneme ${sayac}`, im?.id]);
    const { emir } = await vt().tx((db) => emirAc(db, yoneticiId, { parcaNo: 'ORN-1', parcaAd: 'Deneme Parçası', adet: 10, istasyonId: ist!.id }));
    return { id: emir.id, emirNo: emir.emirNo };
  }
  const olayEkle = (emirId: number, olay: 'beklet' | 'devam', neden: string | null, zaman: string) => ortam!.sahip.sorgu(
    'INSERT INTO uretim_emirleri_bekletme (uretim_emri_id, olay, neden, kisi_id, zaman) VALUES ($1, $2, $3, $4, $5::timestamptz)',
    [emirId, olay, neden, yoneticiId, zaman],
  );

  before(async () => {
    ortam = await testVeritabaniKur('uebkademe');
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Yönetici', kullaniciAdi: 'uebk-yonetici', parola: 'dogru-parola-1' }));
    kademeTatilCozucusuKaydet(null);
  });
  after(async () => { await ortam?.kaldir(); });

  test('mühendislik ve teslim edilmedi nedenleriyle bekletilir; bilinmeyen neden kısıta takılır', async () => {
    for (const neden of ['muhendislik', 'teslim'] as const) {
      const e = await planliEmir();
      const c = await vt().tx((db) => emirBeklet(db, yoneticiId, e.id, { neden }));
      assert.equal(c.emir.bekletme?.neden, neden);
      assert.equal(c.emir.bekletme?.isGunu, 0);
    }
    const e = await planliEmir();
    await assert.rejects(olayEkle(e.id, 'beklet', 'baska', gunOnce(0)), /uretim_emirleri_bekletme_neden/);
  });

  test('bekleme günü yeniden bekletmeyle sıfırlanmaz; liste ve ayrıntı aynı günü gösterir', async () => {
    const e = await planliEmir();
    await olayEkle(e.id, 'beklet', 'fason', gunOnce(6));
    await olayEkle(e.id, 'devam', null, gunOnce(6));
    await olayEkle(e.id, 'beklet', 'fason', gunOnce(6));
    const beklenen = isGunuFarki(tesisGunu(new Date(gunOnce(6))), tesisGunu(new Date()), new Set());
    const ayrinti = await vt().tx((db) => emirAyrintisi(db, e.id));
    assert.equal(ayrinti.emir.bekletme?.isGunu, beklenen);
    const liste = await vt().tx((db) => izlemeListesi(db, undefined, true));
    assert.equal(liste.emirler.find((x) => x.id === e.id)?.bekletme?.isGunu, beklenen);
  });

  test('okuyucu: neden kaynağı yalnız kendi nedenini, süren bekleme kaynağı malzeme ve fason gibi uzun süreli nedenleri alır', async () => {
    const m = await planliEmir();
    await olayEkle(m.id, 'beklet', 'malzeme', gunOnce(3));
    const k = await planliEmir();
    await olayEkle(k.id, 'beklet', 'kalite', gunOnce(3));
    const devamEden = await planliEmir();
    await olayEkle(devamEden.id, 'beklet', 'malzeme', gunOnce(3));
    await olayEkle(devamEden.id, 'devam', null, gunOnce(2));
    const oku = (kaynak: Parameters<typeof bekletmeKademeOkuyucusu>[0]) => vt().tx((db) => bekletmeKademeOkuyucusu(kaynak)(db));
    const malzeme = (await oku('uretim-emirleri.bekleme-malzeme')).map((r) => r.no);
    assert.ok(malzeme.includes(m.emirNo));
    assert.ok(!malzeme.includes(k.emirNo));
    assert.ok(!malzeme.includes(devamEden.emirNo));
    const kalite = await oku('uretim-emirleri.bekleme-kalite');
    const kaydi = kalite.find((r) => r.no === k.emirNo);
    assert.equal(kaydi?.baslangic, tesisGunu(new Date(gunOnce(3))));
    assert.deepEqual(kaydi?.yapanlar, [yoneticiId]);
    const suren = (await oku('uretim-emirleri.bekleme-suruyor')).map((r) => r.no);
    assert.ok(suren.includes(m.emirNo));
    assert.ok(!suren.includes(k.emirNo));
  });

  test('motor: süre dolan bekleme bekletene Gecikti bildirimi olarak düşer', async () => {
    const e = await planliEmir();
    kademeKaynagiKaydet('uretim-emirleri.bekleme-muhendislik', bekletmeKademeOkuyucusu('uretim-emirleri.bekleme-muhendislik'));
    await vt().tx((db) => kademeleriIlerlet(db));
    await olayEkle(e.id, 'beklet', 'muhendislik', gunOnce(7));
    await vt().tx((db) => kademeleriIlerlet(db));
    const satir = await ortam!.sahip.sorgu<{ tur: string; yol: string }>(
      "SELECT tur, yol FROM bildirim_kaydi WHERE kisi_id = $1 AND tur LIKE 'uretim-emirleri.kademe-bekleme-muhendislik-%' AND yol = $2",
      [yoneticiId, `/uretim-emirleri/${String(e.id)}`],
    );
    assert.ok(satir.length > 0, 'bildirim yok');
    kademeKaynagiKaydet('uretim-emirleri.bekleme-muhendislik', null);
  });
});
