import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ALICI_AYARLI_TURLER, bildirimAlicilariCevabi, bildirimTercihleriCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import type { BildirimAliciSatiri, BildirimAlicilariCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder, type BildirimOlayi } from './disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('bildirim alıcıları (760 c, 761 b, gerçek PostgreSQL)', () => {
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

  const gonder = (olay: BildirimOlayi): Promise<number> => o().vt.tx((db) => bildirimGonder(db, olay));
  const alanlar = async (tur: string): Promise<number[]> =>
    (await o().vt.sorgu<{ kisiId: number }>('SELECT DISTINCT kisi_id AS "kisiId" FROM bildirim_kaydi WHERE tur = $1 ORDER BY kisi_id', [tur]))
      .map((r) => r.kisiId);
  const bosalt = (): Promise<unknown> => o().vt.tx((db) => db.sorgu('DELETE FROM bildirim_kaydi'));
  const sirala = (l: number[]): number[] => [...l].sort((a, b) => a - b);

  async function alicilar(ad = 'yonetici'): Promise<BildirimAlicilariCevabi> {
    const c = await istek(ad, 'GET', '/bildirimler/alicilar');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bildirimAlicilariCevabi.parse(c.govde);
  }
  const satir = async (tur: string): Promise<BildirimAliciSatiri> => {
    const s = (await alicilar()).satirlar.find((r) => r.tur === tur);
    if (!s) throw new Error(`tür yok: ${tur}`);
    return s;
  };
  const yaz = (tur: string, govde: unknown, ad: string | null = 'yonetici'): Promise<Cevap> => istek(ad, 'POST', `/bildirimler/alicilar/${tur}/degistir`, govde);
  async function ayarla(tur: string, rolIdleri: number[], kisiIdleri: number[]): Promise<void> {
    const c = await yaz(tur, { rolIdleri, kisiIdleri, surum: (await satir(tur)).surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  }

  before(async () => {
    ortam = await testVeritabaniKur('turalici');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kisiler.set('yonetici', yoneticiId);
    await giris('yonetici');
    for (const [ad, rol] of [['bakim', 'bakim'], ['mudur', 'mudur'], ['kalite', 'kalite'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('okuma ve yazma ayarlar.yaz ister: oturumsuz 401, yetkisiz 403', async () => {
    assert.equal((await istek(null, 'GET', '/bildirimler/alicilar')).durum, 401);
    assert.equal((await istek('bakim', 'GET', '/bildirimler/alicilar')).durum, 403);
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [], kisiIdleri: [], surum: null }, null)).durum, 401);
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [await rolNo('kalite')], kisiIdleri: [], surum: null }, 'bakim')).durum, 403);
    assert.equal((await satir('istasyonlar.makine-durdu')).surum, null);
  });

  test('liste ekip çağrısı dışındaki bütün türleri ayarsız gösterir; varsayılan işlemler türün işlemleridir', async () => {
    const c = await alicilar();
    assert.deepEqual(c.satirlar.map((s) => s.tur), ALICI_AYARLI_TURLER);
    assert.ok(!c.satirlar.some((s) => s.tur === 'arkon.ekip-cagrisi'));
    const makine = c.satirlar.find((s) => s.tur === 'istasyonlar.makine-durdu');
    assert.deepEqual(makine?.varsayilanIslemler, ['arkon.bakim', 'arkon.amir']);
    assert.ok(c.kisiler.some((k) => k.id === kim('kalite')));
    assert.ok(c.roller.some((r) => r.kod === 'kalite'));
    assert.equal((await yaz('arkon.ekip-cagrisi', { rolIdleri: [], kisiIdleri: [], surum: null })).durum, 400);
    assert.equal((await yaz('olmayan.tur', { rolIdleri: [], kisiIdleri: [], surum: null })).durum, 400);
  });

  test('seçimsiz türde işlem kuralı geçer (yönetici dahil)', async () => {
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Durdu', kaynakKimlik: 'a-1' });
    const al = await alanlar('istasyonlar.makine-durdu');
    assert.ok(al.includes(kim('bakim')));
    assert.ok(al.includes(yoneticiId));
    assert.ok(!al.includes(kim('kalite')));
  });

  test('BIL-10: seçimli türde yalnız seçilen rol ve kişiler alır; yönetici seçilmediyse almaz (761 b)', async () => {
    await ayarla('istasyonlar.makine-durdu', [await rolNo('kalite')], [kim('operator')]);
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Durdu', kaynakKimlik: 'a-2' });
    assert.deepEqual(await alanlar('istasyonlar.makine-durdu'), sirala([kim('kalite'), kim('operator')]));
  });

  test('BIL-10: kayda bağlı kişi seçimden bağımsız alır; tetikleyen almaz', async () => {
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Durdu', kisiler: [kim('mudur')], haric: kim('operator') });
    assert.deepEqual(await alanlar('istasyonlar.makine-durdu'), sirala([kim('kalite'), kim('mudur')]));
  });

  test('tercih listesi seçime uyar: seçilen kalite türü görür, seçilmeyen bakım görmez', async () => {
    const tercih = async (ad: string): Promise<string[]> =>
      bildirimTercihleriCevabi.parse((await istek(ad, 'GET', '/bildirimler/tercihler')).govde).satirlar.map((s) => s.tur);
    assert.ok((await tercih('kalite')).includes('istasyonlar.makine-durdu'));
    assert.ok(!(await tercih('bakim')).includes('istasyonlar.makine-durdu'));
    assert.ok(!(await tercih('yonetici')).includes('istasyonlar.makine-durdu'));
  });

  test('sürüm denetimi: eski sürüm 409, sürümsüz yazım ayarlı türü açamaz', async () => {
    const s = await satir('istasyonlar.makine-durdu');
    assert.ok(s.surum !== null);
    assert.equal(s.degistiren?.id, yoneticiId);
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [], kisiIdleri: [kim('bakim')], surum: s.surum + 5 })).durum, 409);
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [], kisiIdleri: [kim('bakim')], surum: null })).durum, 409);
    assert.deepEqual((await satir('istasyonlar.makine-durdu')).kisiIdleri, [kim('operator')]);
  });

  test('BIL-8: olmayan rol, olmayan kişi ve yinelenen kimlik reddedilir; alıcılar değişmez', async () => {
    const surum = (await satir('istasyonlar.makine-durdu')).surum;
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [999999], kisiIdleri: [], surum })).durum, 400);
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [], kisiIdleri: [999999], surum })).durum, 400);
    const kalite = await rolNo('kalite');
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [kalite, kalite], kisiIdleri: [], surum })).durum, 400);
    assert.equal((await yaz('istasyonlar.makine-durdu', { rolIdleri: [], kisiIdleri: [], surum, fazla: 1 })).durum, 400);
    assert.equal((await satir('istasyonlar.makine-durdu')).surum, surum);
  });

  test('ikisi de boş yazılınca seçim kalkar, tür işlem kuralına döner', async () => {
    await ayarla('istasyonlar.makine-durdu', [], []);
    const s = await satir('istasyonlar.makine-durdu');
    assert.equal(s.surum, null);
    assert.deepEqual(s.rolIdleri, []);
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Durdu', kaynakKimlik: 'a-3' });
    const al = await alanlar('istasyonlar.makine-durdu');
    assert.ok(al.includes(kim('bakim')) && al.includes(yoneticiId) && !al.includes(kim('kalite')));
  });

  test('yönetici rolü seçilirse yönetici alır', async () => {
    await ayarla('satin-alma.talep-onay-bekliyor', [await rolNo('yonetici')], []);
    await bosalt();
    await gonder({ tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Talep', kaynakKimlik: 't-1' });
    assert.deepEqual(await alanlar('satin-alma.talep-onay-bekliyor'), [yoneticiId]);
  });
});
