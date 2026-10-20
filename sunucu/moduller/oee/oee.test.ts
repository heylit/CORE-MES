import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { OeeCevabi } from '#paylasilan/sozlesme/oee.ts';
import type { TakvimCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { istasyonOeeleri } from './disari.ts';
import { oee } from './servis.ts';

const PAROLA = 'dogru-parola-1';
// Uç denetimleri geçmiş, sabit bir haftada: 2000-01-03 pazartesi. Atamalar bugün başlar (geçmiş tarihli atama girilmez); sayısal
// denetim bu yüzden gelecekteki bir pazartesiyi (2099-10-05) okuma anı ondan sonraymış gibi servisten okur.
const PAZARTESI = '2000-01-03';
const SALI = '2000-01-04';
const GELECEK_PAZARTESI = '2099-10-05';
const GELECEK_SALI = '2099-10-06';
const SONRA = Date.parse('2100-01-01T00:00:00Z');

interface Rol { id: number; ad: string }
interface Cevap<T> { durum: number; govde: T }

describe('oee (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c: Record<'yonetici' | 'operator' | 'izleyici' | 'kisitli', string> = { yonetici: '', operator: '', izleyici: '', kisitli: '' };
  const kisiler: Record<string, number> = {};
  let merkezA = 0;
  let merkezB = 0;
  let istasyonA = 0;
  let makineler: number[] = [];
  let makineB = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function istek<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik: Record<string, string> = {}): Promise<Cevap<T>> {
    const cevap = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...baslik }, payload: payload as object | undefined });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }
  const tamam = async <T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, baslik?: Record<string, string>): Promise<T> => {
    const cevap = await istek<T>(cerez, yontem, url, payload, baslik);
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  };
  const oku = (cerez: string, bas = PAZARTESI, bit = SALI) => istek<OeeCevabi>(cerez, 'GET', `/oee?baslangic=${bas}&bitis=${bit}`);

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('oee');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    const roller = (await tamam<{ roller: Rol[] }>(c.yonetici, 'GET', '/roller')).roller;
    const operatorRolu = roller.find((r) => r.ad === 'Operatör')!.id;
    for (const ad of ['operator', 'izleyici', 'kisitli', 'personel']) {
      kisiler[ad] = await vt().tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const kisi = await rolAta(db, yoneticiId, id, operatorRolu);
        for (const r of kisi.roller) if (r.id !== operatorRolu) await rolAl(db, yoneticiId, id, r.id);
        return id;
      });
      if (ad in c) c[ad as keyof typeof c] = await girisCerezi(ad);
    }
    // İzleyici ve kısıtlı operatör rolündedir, OEE'yi ek işlemle görür; kısıtlı yalnız A merkezini görür.
    for (const ad of ['izleyici', 'kisitli']) {
      await tamam(c.yonetici, 'POST', `/kisiler/${kisiler[ad]!}/ek-islem-degistir`, { islem: 'oee.oku', verildi: true });
    }
    merkezA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'OE-A', ad: 'Deneme merkez A', aciklama: null })).id;
    merkezB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'OE-B', ad: 'Deneme merkez B', aciklama: null })).id;
    await tamam(c.yonetici, 'POST', `/kisi-is-merkezleri/${kisiler['kisitli']!}/belirle`, { isMerkeziIdleri: [merkezA] });
    istasyonA = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'OE-IA', ad: 'Deneme istasyon A', isMerkeziId: merkezA })).id;
    const istasyonB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'OE-IB', ad: 'Deneme istasyon B', isMerkeziId: merkezB })).id;
    makineler = [];
    for (const n of [1, 2, 3]) {
      makineler.push((await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `OE-M${n}`, ad: `Deneme makine ${n}`, istasyonId: istasyonA })).id);
    }
    makineB = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'OE-MB', ad: 'Deneme makine B', istasyonId: istasyonB })).id;
    // A merkezinde pazartesi 08:00-16:00 molasız tek vardiya: makine başına 480 dk planlı.
    const t = await tamam<TakvimCevabi>(c.yonetici, 'POST', '/vardiyalar', { ad: 'OE-Gündüz', baslangic: '08:00', bitis: '16:00', molalar: [] }, { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() });
    const vardiya = t.vardiyalar.find((v) => v.ad === 'OE-Gündüz')!.id;
    await tamam(c.yonetici, 'POST', '/vardiya-matrisi/degistir', { isMerkeziId: merkezA, gun: 1, vardiyaId: vardiya, acik: true });
    // Personel istasyon A'da çalışır ve üç makineye eşit bakar (1 kişi 3 makine).
    await tamam(c.yonetici, 'POST', `/istasyonlar/${istasyonA}/kisiler/ata`, { kisiId: kisiler['personel']!, yuzde: '10.00' });
    for (const m of makineler) await tamam(c.yonetici, 'POST', `/makineler/${m}/kisiler/ata`, { kisiId: kisiler['personel']!, yuzde: '30.00' });
    await tamam(c.yonetici, 'POST', '/finans/maliyetler/istasyon/yaz', { anahtar: istasyonA, birimMaliyet: 600, surum: null });
    await tamam(c.yonetici, 'POST', '/finans/maliyetler/kisi/yaz', { anahtar: kisiler['personel']!, birimMaliyet: 300, surum: null });
  });
  after(async () => { await ortam?.kaldir(); });

  test('OE-10: oee.oku olmayan 403 alır; ek işlemle verilen kişi okur', async () => {
    assert.equal((await oku(c.operator)).durum, 403);
    assert.equal((await oku(c.izleyici)).durum, 200);
  });

  test('OE-13: OEE yalnız müdür ve Planlama ve Proje rollerinde; operatör ve diğer rollerde yok', async () => {
    const satirlar = await vt().sorgu<{ kod: string; islem: string }>(
      "SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem IN ('sayfa.oee', 'oee.oku') ORDER BY r.kod, ri.islem");
    assert.deepEqual(satirlar.map((s) => `${s.kod} ${s.islem}`), [
      'mudur oee.oku', 'mudur sayfa.oee', 'planlama_proje oee.oku', 'planlama_proje sayfa.oee',
    ]);
  });

  test('OE-11: aralık ters ya da çok uzunsa 400', async () => {
    assert.equal((await oku(c.yonetici, SALI, PAZARTESI)).durum, 400);
    assert.equal((await oku(c.yonetici, '2000-01-01', '2000-06-01')).durum, 400);
  });

  const sayisal = async (ad = 'yonetici') => vt().tx(async (db) => {
    const kullanici = (await kullaniciYukle(db, ad === 'yonetici' ? yoneticiId : kisiler[ad]!))!;
    return oee(db, kullanici, { baslangic: GELECEK_PAZARTESI, bitis: GELECEK_SALI }, SONRA);
  });

  test('OE-01, OE-02: planlı süre vardiya takviminden; üretimsiz planlı makinenin OEE\'si sıfır, takvimsiz merkezde null', async () => {
    const g = await sayisal();
    const m1 = g.makineler.find((m) => m.id === makineler[0])!;
    assert.equal(m1.planliDk, 480);
    assert.equal(m1.takvimDk, 2 * 24 * 60);
    assert.equal(m1.calismaDk, 0);
    assert.equal(m1.oee, 0);
    assert.equal(m1.teep, 0);
    assert.equal(m1.kalite, null);
    const b = g.makineler.find((m) => m.id === makineB)!;
    assert.equal(b.planliDk, 0);
    assert.equal(b.oee, null);
    const ist = g.istasyonlar.find((i) => i.id === istasyonA)!;
    assert.equal(ist.planliDk, 3 * 480);
  });

  test('OE-05, OE-07, OE-08: 1 kişi 3 makinede her makineye üçte bir kişi ve üçte bir işçilik düşer; maliyet yetkilisi tutarı görür', async () => {
    const g = await sayisal();
    assert.equal(g.maliyetGorunur, true);
    const m1 = g.makineler.find((m) => m.id === makineler[0])!;
    assert.equal(m1.kisiPayi, 0.333);
    assert.equal(m1.makineMaliyeti, 4800);
    assert.equal(m1.iscilikMaliyeti, 800);
    // Sağlam yok: birim maliyet bilinmez, sıfır uydurulmaz.
    assert.equal(m1.birimMaliyet, null);
    const ist = g.istasyonlar.find((i) => i.id === istasyonA)!;
    assert.equal(ist.kisiPayi, 1);
    assert.equal(ist.iscilikMaliyeti, 2400);
    const b = g.makineler.find((m) => m.id === makineB)!;
    assert.equal(b.kisiPayi, null);
    assert.equal(b.iscilikMaliyeti, null);
  });

  test('OE-09: finans.maliyet-oku olmayan tutarları boş alır, oranları görür', async () => {
    assert.equal((await tamam<OeeCevabi>(c.izleyici, 'GET', `/oee?baslangic=${PAZARTESI}&bitis=${SALI}`)).maliyetGorunur, false);
    assert.equal((await tamam<OeeCevabi>(c.yonetici, 'GET', `/oee?baslangic=${PAZARTESI}&bitis=${SALI}`)).maliyetGorunur, true);
    const g = await sayisal('izleyici');
    assert.equal(g.maliyetGorunur, false);
    const m1 = g.makineler.find((m) => m.id === makineler[0])!;
    assert.equal(m1.planliDk, 480);
    assert.equal(m1.makineMaliyeti, null);
    assert.equal(m1.iscilikMaliyeti, null);
  });

  test('OE-12: iş merkezi kısıtlı kişi yalnız kendi merkezinin makinelerini görür; kısıtsız hepsini', async () => {
    const kisitli = (await tamam<OeeCevabi>(c.kisitli, 'GET', `/oee?baslangic=${PAZARTESI}&bitis=${SALI}`));
    assert.ok(kisitli.makineler.length > 0);
    assert.ok(kisitli.makineler.every((m) => m.isMerkeziId === merkezA));
    assert.deepEqual(kisitli.isMerkezleri.map((m) => m.id), [merkezA]);
    const hepsi = (await oku(c.izleyici)).govde;
    assert.ok(hepsi.makineler.some((m) => m.id === makineB));
  });
  test('OE-14: istasyonOeeleri uçla aynı denetimi yapar: oee.oku yoksa 403, aralık bozuksa 400; kapsam ve maliyet gizleme korunur', async () => {
    const cagir = (ad: string, baslangic = GELECEK_PAZARTESI, bitis = GELECEK_SALI) => vt().tx(async (db) => {
      const kullanici = (await kullaniciYukle(db, ad === 'yonetici' ? yoneticiId : kisiler[ad]!))!;
      return istasyonOeeleri(db, kullanici, { baslangic, bitis }, SONRA);
    });
    await assert.rejects(cagir('operator'), (h: UygulamaHatasi) => h.durum === 403);
    await assert.rejects(cagir('yonetici', GELECEK_SALI, GELECEK_PAZARTESI), (h: UygulamaHatasi) => h.durum === 400);
    assert.deepEqual(await cagir('yonetici'), (await sayisal()).istasyonlar);
    const kisitli = await cagir('kisitli');
    assert.ok(kisitli.length > 0 && kisitli.every((i) => i.isMerkeziId === merkezA));
  });
});
