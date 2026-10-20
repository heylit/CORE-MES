import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ANAHTAR_ONEKI } from '#paylasilan/sozlesme/recete-rota.ts';
import { kisiNoKullaniciAdindan, kullaniciYukle } from '../kisiler/disari.ts';
import { ornekBelge } from './ornek-veri.ts';
import { yaz } from './servis.ts';
import { kayitGetir, kayitlar } from './sorgular.ts';

interface Adim { id: string; opId: string; stationId: string; setup: number; proc: number; chg: number | null; cycle: number; ins: Array<{ itemId: string }> }
interface Belge {
  version: number; ornek: boolean; name: string;
  items: Array<{ id: string; code: string; name: string; type: string }>;
  stations: Array<{ id: string; wcId: string }>; wcs: Array<{ id: string }>; opdefs: Array<{ id: string; stationId: string; proc: number; chg: number | null; cycle: number }>;
  gercekSure: Record<string, { taban: string; deger: Record<string, number | null>; kaynak: Record<string, string | null> }>;
  machines: Array<{ stationId: string }>; people: Array<{ wcId: string; skills: string[] }>;
  routes: Record<string, { steps: Adim[] }>;
  routeRevs: Array<{ itemId: string; no: string; status: string }>;
  orders: Array<{ id: string; itemId: string; tur: string; start: string; due: string }>;
  opStatus: Record<string, string>; statusStock: Record<string, Record<string, number>>;
}

const zincir = async () => (await modulOrnekVerileriniKesfet()).filter((t) => t.modul === 'kisiler' || t.modul === 'recete-rota');

// Veritabanı kuran her bölüm kendi şemasını kendi zaman aşımıyla kurar: iki şemayı tek `before`da tek 60 sn içinde kurmak
// yüklü CI'da üst bölümü aşıp testleri iptal ettiriyordu.
const VT_SURESI = 120_000;
const secenek = { ortam: 'test' as const, bildir: () => undefined };

describe('recete-rota örnek verisi', () => {
  test('belge kendi içinde tutarlıdır: kodlar, başvurular, süreler, revizyonlar, emir türleri', () => {
    const b = ornekBelge('2026-10-13', new Date('2026-10-13T08:00:00Z')) as unknown as Belge;
    assert.equal(b.version, 7);
    assert.equal(b.ornek, true);
    assert.ok(b.items.every((m) => m.code.startsWith('ORN-') && m.name.startsWith('Ornek ')));
    const mallar = new Set(b.items.map((m) => m.id));
    const istasyonlar = new Set(b.stations.map((s) => s.id));
    for (const s of b.stations) assert.ok(b.wcs.some((w) => w.id === s.wcId), `istasyon ${s.id} iş merkezi`);
    for (const d of b.opdefs) assert.ok(istasyonlar.has(d.stationId));
    for (const m of b.machines) assert.ok(istasyonlar.has(m.stationId));
    for (const p of b.people) for (const s of p.skills) assert.ok(istasyonlar.has(s), `beceri ${s}`);
    const rotalar = Object.entries(b.routes);
    assert.ok(rotalar.length >= 6);
    for (const [urun, rota] of rotalar) {
      assert.ok(mallar.has(urun));
      assert.ok(rota.steps.length >= 2);
      for (const a of rota.steps) {
        assert.ok(b.opdefs.some((d) => d.id === a.opId) && istasyonlar.has(a.stationId));
        assert.ok(a.setup >= 0 && a.cycle > 0);
        assert.equal(a.cycle, a.proc + (a.chg ?? 0), `çevrim = işlem + değişim: ${a.id}`);
        for (const g of a.ins) assert.ok(mallar.has(g.itemId), `girdi ${g.itemId}`);
      }
    }
    for (const d of b.opdefs) assert.equal(d.cycle, d.proc + (d.chg ?? 0), `operasyon çevrimi: ${d.id}`);
    const adimlarDuz = Object.values(b.routes).flatMap((r) => r.steps);
    assert.ok(adimlarDuz.some((a) => a.chg === null) && adimlarDuz.some((a) => a.chg !== null && a.chg > 0), 'değişimi boş ve dolu adımlar var');
    const gercekler = Object.entries(b.gercekSure);
    assert.ok(gercekler.length >= 2);
    for (const [adimId, g] of gercekler) {
      assert.ok(adimlarDuz.some((a) => a.id === adimId), `gerçek süre adımı: ${adimId}`);
      assert.ok(g.taban === 'teorik' || g.taban === 'gerceklesen');
      for (const [alan, v] of Object.entries(g.deger)) {
        if (v === null) assert.equal(g.kaynak[alan], null, `boş değerin kaynağı boş: ${adimId}.${alan}`);
        else assert.equal(g.kaynak[alan], 'elle', `dolu değerin kaynağı elle: ${adimId}.${alan}`);
      }
    }
    const bosDegerler = gercekler.flatMap(([, g]) => Object.values(g.deger).filter((v) => v === null));
    assert.ok(bosDegerler.length >= 1, 'boş gerçek değer içeren satır var');
    assert.equal(b.gercekSure['q8']?.deger['degisim'], null);
    assert.equal(b.gercekSure['q8']?.kaynak['degisim'], null);
    assert.equal(b.gercekSure['q8']?.kaynak['islem'], 'elle');
    assert.ok(gercekler.some(([, g]) => g.taban === 'gerceklesen'), 'gerçekleşen tabanlı adım var');
    for (const r of b.routeRevs) assert.ok(b.routes[r.itemId] !== undefined);
    for (const durum of ['yururlukte', 'onayli', 'taslak', 'onay']) assert.ok(b.routeRevs.some((r) => r.status === durum), durum);
    for (const urun of Object.keys(b.routes)) assert.equal(b.routeRevs.filter((r) => r.itemId === urun && r.status === 'yururlukte').length, 1, urun);
    assert.ok(b.orders.length >= 8);
    assert.deepEqual([...new Set(b.orders.map((o) => o.tur))].sort(), ['fai', 'numune', 'prototip', 'seri']);
    for (const o of b.orders) assert.ok(b.routes[o.itemId] !== undefined && o.due >= o.start && /^\d{4}-\d{2}-\d{2}$/.test(o.start));
    for (const anahtar of Object.keys(b.opStatus)) assert.ok(b.orders.some((o) => anahtar.startsWith(`${o.id}|`)), anahtar);
    assert.ok(Object.keys(b.statusStock).length >= 2);
    assert.ok(b.orders[0]!.start >= '2026-10-13', 'tarihler koşu gününden başlar');
  });

  describe('gerçek PostgreSQL, boş şema', { timeout: VT_SURESI }, () => {
    let ortam: TestVeritabani | undefined;
    const vt = (): TestVeritabani['vt'] => {
      if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
      return ortam.vt;
    };
    before(async () => { ortam = await testVeritabaniKur('recete_rota_ornek'); });
    after(async () => { await ortam?.kaldir(); });

    test('boş şemada tek ana belge yazılır; ikinci koşu yüklü der ve belgeyi değiştirmez', async () => {
      assert.deepEqual(await vt().tx((db) => kayitlar(db)), []);
      assert.deepEqual(await ornekVeriYukle(vt(), await zincir(), secenek), { durum: 'yuklendi', moduller: ['kisiler', 'recete-rota'] });
      const liste = await vt().tx((db) => kayitlar(db));
      assert.deepEqual(liste.map((k) => k.anahtar), [ANAHTAR_ONEKI]);
      const kayit = liste[0]!;
      assert.equal(kayit.bicim, 'json');
      const b = kayit.deger as Belge;
      assert.equal(b.version, 7);
      assert.ok(Object.keys(b.routes).length >= 6 && b.orders.length >= 8 && b.items.length >= 20);
      assert.notEqual(await vt().tx((db) => kisiNoKullaniciAdindan(db, 'ornek.planlama')), null);
      assert.deepEqual(await ornekVeriYukle(vt(), await zincir(), secenek), { durum: 'yuklu', moduller: ['kisiler', 'recete-rota'] });
      assert.equal((await vt().tx((db) => kayitGetir(db, ANAHTAR_ONEKI)))?.surum, kayit.surum);
    });
  });

  describe('gerçek PostgreSQL, elle yazılmış kayıt', { timeout: VT_SURESI }, () => {
    let dolu: TestVeritabani | undefined;
    before(async () => { dolu = await testVeritabaniKur('recete_rota_ornek_dolu'); });
    after(async () => { await dolu?.kaldir(); });

    test('var olan kayıt ezilmez', async () => {
      if (!dolu) throw new Error('Test veritabanı açılamadı.');
      await ornekVeriYukle(dolu.vt, (await zincir()).filter((t) => t.modul === 'kisiler'), secenek);
      await dolu.vt.tx(async (db) => {
        const kisiId = await kisiNoKullaniciAdindan(db, 'ornek.planlama');
        const kullanici = kisiId === null ? null : await kullaniciYukle(db, kisiId);
        if (kullanici === null) throw new Error('ornek.planlama yok');
        await yaz(db, kullanici, { anahtar: ANAHTAR_ONEKI, bicim: 'json', deger: { name: 'Elle' }, beklenenSurum: null });
      });
      const sonuc = await ornekVeriYukle(dolu.vt, await zincir(), secenek);
      assert.deepEqual(sonuc, { durum: 'yuklu', moduller: ['kisiler', 'recete-rota'] });
      assert.deepEqual((await dolu.vt.tx((db) => kayitGetir(db, ANAHTAR_ONEKI)))?.deger, { name: 'Elle' });
    });
  });
});
