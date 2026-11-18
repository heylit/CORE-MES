import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { isGunuFarki, kademeleriIlerlet, kademeTatilCozucusuKaydet } from '../bildirim/disari.ts';
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

  test('kablolama yedi kaynağı motora bağlar; açık yedi kaynak ilk koşuda başlangıç yazar (tezgah-takım 3418 a ile açık)', async () => {
    await vt().tx((db) => kademeleriIlerlet(db));
    const yazilan = (await ortam!.sahip.sorgu<{ kaynak: string }>(
      "SELECT kaynak FROM bildirim_kademe_baslangic WHERE kaynak LIKE 'uretim-emirleri.bekleme-%' ORDER BY kaynak")).map((r) => r.kaynak);
    assert.deepEqual(yazilan, ['fason', 'kalite', 'malzeme', 'muhendislik', 'suruyor', 'takim', 'teslim'].map((n) => `uretim-emirleri.bekleme-${n}`));
  });

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

  test('kapanan emrin bekletmesi süreye ve uyarıya girmez', async () => {
    const e = await planliEmir();
    await olayEkle(e.id, 'beklet', 'malzeme', gunOnce(5));
    await ortam!.sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [e.id]);
    const oku = (kaynak: Parameters<typeof bekletmeKademeOkuyucusu>[0]) => vt().tx((db) => bekletmeKademeOkuyucusu(kaynak)(db));
    assert.ok(!(await oku('uretim-emirleri.bekleme-malzeme')).some((r) => r.no === e.emirNo));
    assert.ok(!(await oku('uretim-emirleri.bekleme-suruyor')).some((r) => r.no === e.emirNo));
  });

  test('resmi tatil bekleme gününden düşülür', async () => {
    const e = await planliEmir();
    await olayEkle(e.id, 'beklet', 'kalite', gunOnce(10));
    const bas = tesisGunu(new Date(gunOnce(10)));
    const bugun = tesisGunu(new Date());
    const tatil = Array.from({ length: 8 }, (_, i) => tesisGunu(new Date(gunOnce(9 - i))))
      .find((g) => { const d = new Date(`${g}T12:00:00Z`).getUTCDay(); return d !== 0 && d !== 6; })!;
    const [yil, ay, gn] = tatil.split('-').map(Number);
    await ortam!.sahip.sorgu("INSERT INTO ik_genel_ayar (anahtar, guncelleyen_kisi_id) VALUES ('genel', $1) ON CONFLICT DO NOTHING", [yoneticiId]);
    await ortam!.sahip.sorgu("INSERT INTO ik_resmi_tatil (sira, yil, ay, gun, ad) VALUES (901, $1, $2, $3, 'Deneme tatili')", [yil, ay, gn]);
    try {
      const beklenen = isGunuFarki(bas, bugun, new Set([tatil]));
      assert.equal(beklenen, isGunuFarki(bas, bugun, new Set()) - 1);
      assert.equal((await vt().tx((db) => emirAyrintisi(db, e.id))).emir.bekletme?.isGunu, beklenen);
    } finally {
      await ortam!.sahip.sorgu('DELETE FROM ik_resmi_tatil WHERE sira = 901');
    }
  });

  test('motor: süre dolan bekleme bekletene Gecikti bildirimi olarak düşer', async () => {
    const e = await planliEmir();
    await olayEkle(e.id, 'beklet', 'muhendislik', gunOnce(7));
    await vt().tx((db) => kademeleriIlerlet(db));
    const satir = await ortam!.sahip.sorgu<{ tur: string; yol: string }>(
      "SELECT tur, yol FROM bildirim_kaydi WHERE kisi_id = $1 AND tur LIKE 'uretim-emirleri.kademe-bekleme-muhendislik-%' AND yol = $2",
      [yoneticiId, `/uretim-emirleri/${String(e.id)}`],
    );
    assert.ok(satir.length > 0, 'bildirim yok');
  });
});
