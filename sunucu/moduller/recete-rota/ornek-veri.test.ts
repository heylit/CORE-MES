import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ANAHTAR_ONEKI } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { ornekBelge } from './ornek-veri.ts';
import { durum, yaz } from './servis.ts';
import { kayitGetir, kayitlar } from './sorgular.ts';

interface Belge {
  version: number; ornek: boolean;
  items: Array<{ id: string; type: string }>;
  opdefs: Array<{ id: string }>;
  routes: Record<string, { steps: Array<{ id: string; opId: string; stationId: string | null; machineId: string | null; fasonId: string | null }> }>;
  routeRevs: Array<{ itemId: string; status: string }>;
  orders: Array<{ id: string; itemId: string }>;
  opStatus: Record<string, string>;
  settings: { orderItem: string | null; start: string };
  machines?: unknown; stations?: unknown; people?: unknown; wcs?: unknown;
}

// recete-rota örneği ve onun gerektirdiği örnekler (gerekir zinciri), yükleme sırası çekirdekte.
const zincir = async (): Promise<OrnekVeriTanimi[]> => {
  const hepsi = await modulOrnekVerileriniKesfet();
  const ad = new Map(hepsi.map((t) => [t.modul, t]));
  const secili = new Set<string>();
  const ekle = (m: string): void => {
    if (secili.has(m)) return;
    secili.add(m);
    for (const g of ad.get(m)?.gerekir ?? []) ekle(g);
  };
  ekle('recete-rota');
  return hepsi.filter((t) => secili.has(t.modul));
};

const VT_SURESI = 240_000;
const secenek = { ortam: 'test' as const, bildir: () => undefined };

describe('recete-rota örnek verisi', () => {
  test('belge durum okumasının ürün, operasyon, rota ve emir dilimlerini taşır; okunamayan dilim boş kalır', () => {
    const d = {
      items: [{ id: '5', type: 'ham' }, { id: '6', type: 'mamul' }, { id: '7', type: 'mamul' }],
      opdefs: [{ id: '1' }], routes: { 7: { base: null, steps: [] } }, routeRevs: [{ id: '3', itemId: '7', status: 'yururlukte' }],
      emirler: { orders: [{ id: '9', itemId: '7' }], opStatus: { '9|root|1': 'tamam' }, opProg: {} },
    } as unknown as DurumCevabi;
    const b = ornekBelge(d, '2026-10-21', new Date('2026-10-21T08:00:00Z')) as unknown as Belge;
    assert.equal(b.version, 7);
    assert.equal(b.ornek, true);
    assert.equal(b.items, d.items);
    assert.deepEqual(Object.keys(b.routes), ['7']);
    assert.deepEqual(b.orders.map((o) => o.id), ['9']);
    assert.deepEqual(b.opStatus, { '9|root|1': 'tamam' });
    assert.equal(b.settings.orderItem, '7', 'rotası olan ilk mamul');
    assert.equal(b.settings.start, '2026-10-21');
    for (const k of ['machines', 'stations', 'people', 'wcs']) assert.equal(k in b, false, `${k} kayda yazılmaz`);

    const bos = ornekBelge({ items: null, opdefs: null, routes: null, routeRevs: null, emirler: null } as unknown as DurumCevabi, '2026-10-21', new Date()) as unknown as Belge;
    assert.deepEqual([bos.items, bos.orders, bos.routes, bos.settings.orderItem], [[], [], {}, null]);
  });

  describe('gerçek PostgreSQL, boş şema', { timeout: VT_SURESI }, () => {
    let ortam: TestVeritabani | undefined;
    const vt = (): TestVeritabani['vt'] => {
      if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
      return ortam.vt;
    };
    before(async () => { ortam = await testVeritabaniKur('recete_rota_ornek'); });
    after(async () => { await ortam?.kaldir(); });

    test('kayıt sahiplerin örnek kimlikleriyle yazılır: rota adımı tesisin istasyon ve makinesinde, emir rotalı üründe; ikinci koşu yüklü der', async () => {
      assert.deepEqual(await vt().tx((db) => kayitlar(db)), []);
      const ilk = await ornekVeriYukle(vt(), await zincir(), secenek);
      assert.equal(ilk.durum, 'yuklendi');
      const liste = await vt().tx((db) => kayitlar(db));
      assert.deepEqual(liste.map((k) => k.anahtar), [ANAHTAR_ONEKI]);
      const kayit = liste[0]!;
      const b = kayit.deger as Belge;

      const tesis = await vt().tx(async (db) => {
        const kisiId = await kisiNoKullaniciAdindan(db, 'ornek.yonetici');
        const k = kisiId === null ? null : await kullaniciYukle(db, kisiId);
        if (k === null) throw new Error('ornek.yonetici yok');
        return durum(db, k as Kullanici);
      });
      const istasyonlar = new Set((tesis.stations ?? []).map((s) => s.id));
      const makineler = new Map((tesis.machines ?? []).map((m) => [m.id, m.stationId]));
      const urunler = new Set(b.items.map((m) => m.id));
      const operasyonlar = new Set(b.opdefs.map((o) => o.id));
      assert.ok(istasyonlar.size > 0 && makineler.size > 0);

      const rotalar = Object.entries(b.routes);
      assert.ok(rotalar.length >= 3);
      for (const [urun, rota] of rotalar) {
        assert.ok(urunler.has(urun), `rota ürünü ${urun}`);
        for (const a of rota.steps) {
          assert.ok(operasyonlar.has(a.opId), `operasyon ${a.opId}`);
          if (a.fasonId !== null) continue;
          assert.ok(a.stationId !== null && istasyonlar.has(a.stationId), `adım ${a.id} istasyonu tesiste`);
          if (a.machineId !== null) assert.equal(makineler.get(a.machineId), a.stationId, `adım ${a.id} makinesi istasyonunda`);
        }
      }
      assert.ok(Object.values(b.routes).some((r) => r.steps.some((a) => a.fasonId !== null)), 'fason adım var');
      assert.ok(b.routeRevs.every((r) => b.routes[r.itemId] !== undefined));
      assert.ok(b.orders.length >= 3);
      for (const o of b.orders) assert.ok(b.routes[o.itemId] !== undefined, `emir ${o.id} rotalı üründe`);
      for (const anahtar of Object.keys(b.opStatus)) assert.ok(b.orders.some((o) => anahtar.startsWith(`${o.id}|`)), anahtar);
      for (const k of ['machines', 'stations', 'people', 'wcs']) assert.equal(k in b, false, `${k} kayda yazılmaz`);

      const ikinci = await ornekVeriYukle(vt(), await zincir(), secenek);
      assert.equal(ikinci.durum, 'yuklu');
      assert.equal((await vt().tx((db) => kayitGetir(db, ANAHTAR_ONEKI)))?.surum, kayit.surum);
    });
  });

  describe('gerçek PostgreSQL, elle yazılmış kayıt', { timeout: VT_SURESI }, () => {
    let dolu: TestVeritabani | undefined;
    before(async () => { dolu = await testVeritabaniKur('recete_rota_ornek_dolu'); });
    after(async () => { await dolu?.kaldir(); });

    test('var olan kayıt ezilmez', async () => {
      if (!dolu) throw new Error('Test veritabanı açılamadı.');
      const tumu = await zincir();
      await ornekVeriYukle(dolu.vt, tumu.filter((t) => t.modul !== 'recete-rota'), secenek);
      await dolu.vt.tx(async (db) => {
        const kisiId = await kisiNoKullaniciAdindan(db, 'ornek.planlama');
        const kullanici = kisiId === null ? null : await kullaniciYukle(db, kisiId);
        if (kullanici === null) throw new Error('ornek.planlama yok');
        await yaz(db, kullanici, { anahtar: ANAHTAR_ONEKI, bicim: 'json', deger: { name: 'Elle' }, beklenenSurum: null });
      });
      const sonuc = await ornekVeriYukle(dolu.vt, tumu, secenek);
      assert.equal(sonuc.durum, 'yuklu');
      assert.deepEqual((await dolu.vt.tx((db) => kayitGetir(db, ANAHTAR_ONEKI)))?.deger, { name: 'Elle' });
    });
  });
});
