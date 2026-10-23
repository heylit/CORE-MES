import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { ROTA_ISLEMLERI } from '#paylasilan/islemler/rota.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { planAyariOku } from '../plan/disari.ts';
import { DURUM_ANAHTARI, PLANLAMA_ANAHTARI } from './disari.ts';
import { planAni, planSaati } from './kurallar.ts';
import { teklifDene, type TeklifDenemeGirdisi } from './servis.ts';
import * as sorgular from './sorgular.ts';

// Teklif denemesi servisi: kayıtlar veritabanından, tezgâh ve takvim sahiplerinden okunur; saatler tesis anına çevrilir. Çözücünün
// kendisi teklif-denemesi.test.ts'te sınanır. Veriler uydurmadır.
// Ürün, rota ve emir burada kayıttan gelir: kullanıcı onların sahiplerini okuyamaz, okunamayan dilim kayıttaki gibi kalır. Okuyabilseydi
// sahiplerin (boş) kayıtları kaydın üstüne konurdu (13.1); o yol plan-girdisi-emirler.test.ts'te.
const OKUNMAYAN = new Set<string>(['sayfa.malzemeler', 'sayfa.rota', ...ROTA_ISLEMLERI, ...ADIMLI_OKUMA_ISLEMLERI]);

describe('teklif denemesi servisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kullanici: Kullanici;
  let makineId = 0;
  const SIMDI = Date.parse('2026-10-19T05:00:00Z');
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const girdi = (ek: Partial<TeklifDenemeGirdisi> = {}): TeklifDenemeGirdisi => ({
    kalemler: [{ malzemeNo: 50, adet: 4 }], gecerlilik: '2026-10-30', istenenTermin: null, taslakId: null, taslaklar: [], ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_teklif');
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    kullanici = { id: yoneticiId, ad: 'Deneme Yonetici', islemler: ISLEMLER.filter((i) => !OKUNMAYAN.has(i)) };
    const s = ortam.sahip;
    const im = await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TK-IM', 'Deneme merkezi') RETURNING id");
    const ist = await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TK-IS', 'Deneme torna', $1, true) RETURNING id", [im!.id]);
    const mk = await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('TK-M1', 'Deneme torna 1', $1, true) RETURNING id", [ist!.id]);
    const v = await s.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ('Gunduz', '08:00', '16:00', true) RETURNING id");
    makineId = mk!.id;
    const V = String(v!.id);
    const tezgah = { id: String(makineId), ad: 'Deneme torna 1', grup: String(ist!.id), ucret: 750, verim: 1, vardiyalar: [V], opOran: 0 };
    const kayit = {
      version: 7, savedAt: 9,
      items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }],
      opdefs: [{ id: '13', name: 'Tornalama' }],
      machines: [{ id: String(makineId), name: 'Deneme torna 1', stationId: String(ist!.id), plan: tezgah }],
      routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: String(ist!.id), setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [] }] } },
      orders: [{ id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-23', priority: 2, status: 'serbest' }],
      // dağılmayan plan alanları (takvim, başlangıç) kaydın plan diliminde durur; çerçeve rrDenemedenKur ile yazar
      plan: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] }, tatiller: [], ayarlar: {} },
    };
    const calisma = {
      surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
      w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
      D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [{ id: V, bas: '08:00', bit: '16:00' }], calismaGunleri: { pzt: [V], sal: [V], car: [V], per: [V], cum: [V] },
        tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    };
    await ortam.vt.tx(async (db) => {
      await sorgular.kayitEkle(db, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: kayit, kisiId: yoneticiId });
      await sorgular.kayitEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: JSON.stringify(calisma), kisiId: yoneticiId });
    });
  });
  after(async () => { await ortam?.kaldir(); });

  test('plan saati ile tesis anı birbirine döner', () => {
    assert.equal(planAni('2026-10-19', 24 + 9.5), '2026-10-20T06:30:00.000Z');
    assert.equal(planSaati('2026-10-19', '2026-10-20T06:30:00.000Z'), 33.5);
  });

  test('kalem kayıttaki çalışmaya eklenir; bitiş, plan termini ve kilitlenecek yer tesis anıyla döner', async () => {
    const r = await vt().tx((db) => teklifDene(db, kullanici, girdi(), SIMDI));
    assert.ok(r);
    const k = r.kalemler[0]!;
    assert.equal(k.tamam, true, k.eksik.join(', '));
    assert.equal(k.malzemeNo, 50);
    assert.equal(k.islemler.length, 1);
    assert.equal(k.islemler[0]?.makineId, String(makineId));
    assert.equal(k.islemler[0]?.tl, 4 * 0.5 * 750);
    assert.deepEqual(Object.keys(k.yerlesim), ['10']);
    assert.equal(k.yerlesim['10']?.baslangic, k.islemler[0]?.baslangic);
    assert.match(k.planTermini ?? '', /^2026-1\d-\d{2}$/);
    // tampon girdide yoksa canlı plan ayarından: 0 gün verilince plan termini bitişin günü ya da sonraki ilk çalışma günüdür
    const sifir = await vt().tx((db) => teklifDene(db, kullanici, girdi({ tamponGun: 0 }), SIMDI));
    assert.ok((sifir?.kalemler[0]?.planTermini ?? '') <= (k.planTermini ?? ''));
    const ayar = await vt().tx((db) => planAyariOku(db));
    const gunFarki = (Date.parse(k.planTermini!) - Date.parse(sifir!.kalemler[0]!.planTermini!)) / 86_400_000;
    assert.ok(gunFarki >= ayar.tamponGun, `${String(gunFarki)} < ${String(ayar.tamponGun)}`);
    assert.ok(k.bitis !== null && Date.parse(k.bitis) > SIMDI);
  });

  test('plan şeridi tesis anıyla döner: sipariş bloğunda emir no, teklif bloğu kalemin işlemiyle aynı yerde', async () => {
    const r = await vt().tx((db) => teklifDene(db, kullanici, girdi(), SIMDI));
    const p = r?.plan;
    assert.ok(p);
    // geçerlilik 2026-10-30 (gün 11) + 2 gün, plan termini daha erken: pencere 2026-11-02 00:00 tesis saatinde biter
    assert.equal(p.bitis, planAni('2026-10-19', 14 * 24));
    // pencere planın şimdisinden başlar: çalışmada simdi yoksa motorunki, başlangıç günü 07:00
    assert.equal(p.baslangic, planAni('2026-10-19', 7));
    assert.ok(p.kapaliGunler.includes('2026-10-24') && p.kapaliGunler.includes('2026-10-25'));
    assert.deepEqual(p.hatlar, [{ makineId: String(makineId), ad: 'Deneme torna 1', fason: false }]);
    const islem = r.kalemler[0]!.islemler[0]!;
    assert.deepEqual(p.bloklar.filter((b) => b.tur === 'teklif'), [{
      makineId: String(makineId), tur: 'teklif', is: 'teklif', emirNo: null, kalem: 1, adim: '10', baslangic: islem.baslangic, bitis: islem.bitis, gecikir: false,
    }]);
    const siparis = p.bloklar.filter((b) => b.tur === 'siparis');
    assert.ok(siparis.length > 0);
    assert.ok(siparis.every((b) => b.is === 'O1' && b.emirNo === 'E-1' && b.kalem === null));
  });

  test('geçerli satış taslağı yerinde kalır, süresi dolan taslak denemeye girmez', async () => {
    const yer = { makineId: String(makineId), baslangic: '2026-10-28T05:00:00.000Z' };
    const taslak = (id: string, gecerlilik: string) => ({ id, gecerlilik, kalemler: [{ malzemeNo: 50, adet: 2, termin: '2026-11-06', yerlesim: { 10: yer } }] });
    const r = await vt().tx((db) => teklifDene(db, kullanici, girdi({ istenenTermin: '2026-10-22', taslaklar: [taslak('ST-1', '2026-10-25'), taslak('ST-2', '2026-10-18')] }), SIMDI));
    assert.deepEqual(r?.taslakYerlesimi, [{ taslakId: 'ST-1', kalem: 1, adim: '10', ...yer }]);
  });

  test('çalışma kaydı yoksa null', async () => {
    await vt().tx((db) => sorgular.kayitSil(db, PLANLAMA_ANAHTARI));
    assert.equal(await vt().tx((db) => teklifDene(db, kullanici, girdi(), SIMDI)), null);
  });
});
