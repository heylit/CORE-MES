import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { cagriEkiplerimCevabi, cagriYonlendirmeCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { CAGRI_EKIPLERI } from '#paylasilan/sozlesme/durus-nedenleri.ts';
import type { CagriYonlendirmeCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ekipCagrisiBildir, type EkipCagrisi } from './disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('ekip çağrısı yönlendirmesi (298 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): number => {
    const id = kisiler.get(ad);
    if (id === undefined) throw new Error(`kişi yok: ${ad}`);
    return id;
  };
  const rolNo = async (kod: string): Promise<number> => {
    const r = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!r) throw new Error(`rol yok: ${kod}`);
    return r.id;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await rolNo(rolKodu);
    const yoneticiRolu = await rolNo('yonetici');
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      return yeni;
    });
    kisiler.set(kullaniciAdi, id);
    await giris(kullaniciAdi);
  }

  const cagir = (c: EkipCagrisi): Promise<number> => o().vt.tx((db) => ekipCagrisiBildir(db, c));
  const alanlar = async (): Promise<number[]> =>
    (await o().vt.sorgu<{ kisiId: number }>(
      "SELECT DISTINCT kisi_id AS \"kisiId\" FROM bildirim_kaydi WHERE tur = 'arkon.ekip-cagrisi' ORDER BY kisi_id",
    )).map((r) => r.kisiId);
  const bosalt = (): Promise<unknown> => o().vt.tx((db) => db.sorgu('DELETE FROM bildirim_kaydi'));
  async function yonlendirme(ad = 'yonetici'): Promise<CagriYonlendirmeCevabi> {
    const c = await istek(ad, 'GET', '/bildirimler/cagri-yonlendirme');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return cagriYonlendirmeCevabi.parse(c.govde);
  }
  const ekipSatiri = async (ekip: string) => {
    const s = (await yonlendirme()).satirlar.find((r) => r.ekip === ekip);
    if (!s) throw new Error(`ekip yok: ${ekip}`);
    return s;
  };

  before(async () => {
    ortam = await testVeritabaniKur('cagriyon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kisiler.set('yonetici', yoneticiId);
    await giris('yonetici');
    for (const [ad, rol] of [['bakim', 'bakim'], ['mudur', 'mudur'], ['depo', 'depo'], ['kalite', 'kalite'], ['vardiya', 'vardiya_sorumlusu'],
      ['planlama', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('varsayılan (298 a, 298 b): bakım -> bakım + müdür, malzeme -> depo, kalite -> kalite, amir -> vardiya + müdür, ayarcı -> müdür', async () => {
    const beklenen: Record<string, string[]> = {
      bakim: ['bakim', 'mudur'], malzeme: ['depo'], kalite: ['kalite'], amir: ['mudur', 'vardiya'], ayarci: ['mudur'],
    };
    for (const [ekip, adlar] of Object.entries(beklenen)) {
      await bosalt();
      await cagir({ ekip: ekip as EkipCagrisi['ekip'], yer: 'T-01', cagriKimligi: `v-${ekip}`, haric: kim('operator') });
      assert.deepEqual(await alanlar(), adlar.map(kim).sort((a, b) => a - b), ekip);
    }
  });

  test('malzeme çağrısı bugünkü gibi planlamaya gitmez; yönetici rolü yönlendirmede yoksa almaz', async () => {
    await bosalt();
    await cagir({ ekip: 'malzeme', yer: 'T-01', cagriKimligi: 'm-1', haric: kim('operator') });
    const al = await alanlar();
    assert.ok(!al.includes(kim('planlama')));
    assert.ok(!al.includes(yoneticiId));
  });

  test('bildirim acil, yolsuz, başlıkta ekip ve yer; okunmamış aynı çağrı yeni satır açmaz', async () => {
    await bosalt();
    await cagir({ ekip: 'kalite', yer: 'T-07', not: 'İlk parça', cagriKimligi: 'k-1' });
    await cagir({ ekip: 'kalite', yer: 'T-07', not: 'İlk parça', cagriKimligi: 'k-1' });
    const satirlar = await o().vt.sorgu<{ onem: string; yol: string | null; baslik: string; metin: string | null; tekrar: number }>(
      "SELECT onem, yol, baslik, metin, tekrar_sayisi AS tekrar FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'arkon.ekip-cagrisi'",
      [kim('kalite')],
    );
    assert.deepEqual(satirlar, [{ onem: 'acil', yol: null, baslik: 'Kalite çağrısı: T-07', metin: 'İlk parça', tekrar: 2 }]);
  });

  test('BIL-7: çağrıyı açan, yönlendirmedeki rolü taşısa da kendi çağrısını almaz', async () => {
    await bosalt();
    const yazilan = await cagir({ ekip: 'bakim', yer: 'T-01', cagriKimligi: 'b-1', haric: kim('bakim') });
    assert.equal(yazilan, 1);
    assert.deepEqual(await alanlar(), [kim('mudur')]);
  });

  test('pasif kişi düşer', async () => {
    await bosalt();
    await o().vt.tx((db) => db.sorgu('UPDATE kisi SET aktif = false WHERE id = $1', [kim('depo')]));
    try {
      assert.equal(await cagir({ ekip: 'malzeme', yer: 'T-01', cagriKimligi: 'p-1' }), 0);
      assert.deepEqual(await alanlar(), []);
    } finally {
      await o().vt.tx((db) => db.sorgu('UPDATE kisi SET aktif = true WHERE id = $1', [kim('depo')]));
    }
  });

  test('yönlendirme değişince alıcı değişir; değiştiren ve sürüm sunucudan', async () => {
    const once = await ekipSatiri('malzeme');
    const c = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/malzeme/degistir', {
      rolIdleri: [await rolNo('depo'), await rolNo('planlama_proje')], surum: once.surum,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const sonra = await ekipSatiri('malzeme');
    assert.equal(sonra.surum, once.surum + 1);
    assert.equal(sonra.degistiren?.id, yoneticiId);
    await bosalt();
    await cagir({ ekip: 'malzeme', yer: 'T-01', cagriKimligi: 'd-1' });
    assert.deepEqual(await alanlar(), [kim('depo'), kim('planlama')].sort((a, b) => a - b));
  });

  test('boş yönlendirme kimseye gitmez', async () => {
    const once = await ekipSatiri('ayarci');
    const c = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/ayarci/degistir', { rolIdleri: [], surum: once.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    await bosalt();
    assert.equal(await cagir({ ekip: 'ayarci', yer: 'T-01', cagriKimligi: 'a-1' }), 0);
  });

  test('eski sürümle yazma reddedilir, alıcılar değişmez', async () => {
    const once = await ekipSatiri('kalite');
    const c = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/kalite/degistir', { rolIdleri: [], surum: once.surum + 5 });
    assert.equal(c.durum, 409, JSON.stringify(c.govde));
    assert.deepEqual((await ekipSatiri('kalite')).rolIdleri, once.rolIdleri);
  });

  test('BIL-8: olmayan rol ve yinelenen rol reddedilir', async () => {
    const once = await ekipSatiri('kalite');
    const olmayan = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/kalite/degistir', { rolIdleri: [999999], surum: once.surum });
    assert.equal(olmayan.durum, 400, JSON.stringify(olmayan.govde));
    const kalite = await rolNo('kalite');
    const cift = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/kalite/degistir', { rolIdleri: [kalite, kalite], surum: once.surum });
    assert.equal(cift.durum, 400, JSON.stringify(cift.govde));
    assert.equal((await ekipSatiri('kalite')).surum, once.surum);
  });

  test('bilinmeyen ekip ve fazla alan reddedilir', async () => {
    const bilinmeyen = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/forklift/degistir', { rolIdleri: [], surum: 1 });
    assert.equal(bilinmeyen.durum, 400);
    const once = await ekipSatiri('kalite');
    const fazla = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/kalite/degistir', { rolIdleri: [], surum: once.surum, kisiId: 1 });
    assert.equal(fazla.durum, 400);
  });

  test('okuma ve yazma Sistem Ayarları işlemini ister: oturumsuz 401, müdür ve operatör 403', async () => {
    assert.equal((await istek(null, 'GET', '/bildirimler/cagri-yonlendirme')).durum, 401);
    const once = await ekipSatiri('bakim');
    for (const ad of ['mudur', 'operator']) {
      assert.equal((await istek(ad, 'GET', '/bildirimler/cagri-yonlendirme')).durum, 403, ad);
      const c = await istek(ad, 'POST', '/bildirimler/cagri-yonlendirme/bakim/degistir', { rolIdleri: [], surum: once.surum });
      assert.equal(c.durum, 403, ad);
    }
    assert.deepEqual(await ekipSatiri('bakim'), once);
  });

  async function ekiplerim(ad: string): Promise<string[]> {
    const c = await istek(ad, 'GET', '/bildirimler/cagri-yonlendirme/benim');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return cagriEkiplerimCevabi.parse(c.govde).ekipler;
  }

  test('benim ekiplerim: kişi yalnız rolünün yönlendirildiği ekipleri görür; yönlendirmede olmayan rol boş liste alır', async () => {
    const satirlar = (await yonlendirme()).satirlar;
    const beklenen = async (rolKodu: string) => {
      const rol = await rolNo(rolKodu);
      return satirlar.filter((r) => r.rolIdleri.includes(rol)).map((r) => r.ekip).sort();
    };
    for (const [ad, rol] of [['bakim', 'bakim'], ['mudur', 'mudur'], ['depo', 'depo'], ['kalite', 'kalite']] as const) {
      const ekipler = await ekiplerim(ad);
      assert.deepEqual([...ekipler].sort(), await beklenen(rol), ad);
      assert.ok(ekipler.length > 0, ad);
    }
    assert.deepEqual(await ekiplerim('operator'), []);
  });

  test('benim ekiplerim yönlendirmeyle değişir; çağrının gittiği kişilerle aynıdır', async () => {
    const once = await ekipSatiri('kalite');
    const c = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/kalite/degistir', {
      rolIdleri: [...once.rolIdleri, await rolNo('operator')], surum: once.surum,
    });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    try {
      assert.ok((await ekiplerim('operator')).includes('kalite'));
      await bosalt();
      await cagir({ ekip: 'kalite', yer: 'T-01', cagriKimligi: 'ben-1' });
      assert.ok((await alanlar()).includes(kim('operator')));
    } finally {
      const geri = await istek('yonetici', 'POST', '/bildirimler/cagri-yonlendirme/kalite/degistir', {
        rolIdleri: once.rolIdleri, surum: once.surum + 1,
      });
      assert.equal(geri.durum, 200, JSON.stringify(geri.govde));
    }
    assert.ok(!(await ekiplerim('operator')).includes('kalite'));
  });

  test('benim ekiplerim oturum ister ve başka kişiyi seçtirmez', async () => {
    assert.equal((await istek(null, 'GET', '/bildirimler/cagri-yonlendirme/benim')).durum, 401);
    const baska = await istek('operator', 'GET', `/bildirimler/cagri-yonlendirme/benim?kisiId=${kim('bakim')}`);
    // Adres kişi seçemez: ya reddedilir ya da yalnız oturumdaki kişinin (boş) listesi döner.
    if (baska.durum === 200) assert.deepEqual(cagriEkiplerimCevabi.parse(baska.govde).ekipler, []);
    else assert.equal(baska.durum, 400);
  });

  test('silinen rol yönlendirmeden düşer', async () => {
    const id = await o().sahip.tx(async (db) => {
      const r = await db.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('cy_gecici', 'Geçici') RETURNING id");
      if (!r) throw new Error('rol açılamadı');
      await db.sorgu("INSERT INTO bildirim_cagri_alicisi (ekip, rol_id) VALUES ('amir', $1)", [r.id]);
      await db.sorgu('DELETE FROM rol WHERE id = $1', [r.id]);
      return r.id;
    });
    assert.ok(!(await ekipSatiri('amir')).rolIdleri.includes(id));
  });

  test('ekip listesi sözleşme, yönlendirme ve duruş nedeni kısıtında aynıdır (ayarcı 298 b)', async () => {
    assert.deepEqual((await yonlendirme()).satirlar.map((r) => r.ekip).sort(), [...CAGRI_EKIPLERI].sort());
    const GERI_AL = new Error('geri al');
    const dene = (ekip: string) => o().vt.tx(async (db) => {
      await db.sorgu(
        "INSERT INTO durus_nedeni (kod, ad, kategori, cagri_ekibi, cagri_gecikme_dk, sira) VALUES ('CY-1', 'Deneme', 'plansiz', $1, 5, 999)", [ekip],
      );
      throw GERI_AL;
    });
    for (const ekip of CAGRI_EKIPLERI) await assert.rejects(dene(ekip), (h) => h === GERI_AL, ekip);
    await assert.rejects(dene('forklift'), (h: { constraint?: string }) => h.constraint === 'durus_nedeni_ekip');
  });
});
