import assert from 'node:assert/strict';
import { createECDH } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { BildirimPushDurumuCevabi, BildirimPushTurleriCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import type { BildirimOlayi } from './disari.ts';
import type { Getir } from './push.ts';

// ADR 0031 uçtan uca. Ortam değişkeni push modülü yüklenmeden kurulur (açılış okuması geçsin diye modüller dinamik alınır) ve test
// bitince eski hâline döner: modül testleri aynı süreçte koşabilir.
const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const ESKI_ORTAM = { ...process.env };
const PUSH_ORTAMI = {
  TMIV2_PUSH_ACIK: '1', TMIV2_PUSH_VAPID_OZEL: ecdh.getPrivateKey().toString('base64url'), TMIV2_PUSH_KONU: 'mailto:yonetici@ornek.invalid',
};

const PAROLA = 'dogru-parola-1';
const UC_BAKIM = 'https://fcm.googleapis.com/fcm/send/bakim-cihazi';
const UC_BAKIM_2 = 'https://updates.push.services.mozilla.com/wpush/v2/bakim-ikinci';
const UC_OPERATOR = 'https://web.push.apple.com/operator-cihazi';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('Web Push (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let gonder: (olay: BildirimOlayi) => Promise<number>;
  let tur: (getir: Getir) => Promise<{ kisi: number; tamam: number; silinen: number; hata: number }>;
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
  const abone = (ad: string, ucNokta: string) => istek<BildirimPushDurumuCevabi>(ad, 'POST', '/bildirimler/push/abone-ol', { ucNokta });
  const kuyruk = () => o().vt.sorgu<{ kisiId: number }>('SELECT kisi_id AS "kisiId" FROM bildirim_push_kuyruk WHERE bekleyen IS NOT NULL ORDER BY kisi_id');
  const abonelikler = () => o().vt.sorgu<{ kisiId: number; ucNokta: string }>('SELECT kisi_id AS "kisiId", uc_nokta AS "ucNokta" FROM bildirim_push_abonelik ORDER BY id');
  const sifirla = () => o().vt.tx(async (db) => {
    await db.sorgu('DELETE FROM bildirim_push_kuyruk');
    await db.sorgu('DELETE FROM bildirim_push_abonelik');
    await db.sorgu('DELETE FROM bildirim_push_turu');
    await db.sorgu('DELETE FROM bildirim_kaydi');
  });
  const kayitliGetir = (durum = 201) => {
    const adresler: string[] = [];
    const getir: Getir = async (adres) => { adresler.push(adres); return { status: durum }; };
    return { adresler, getir };
  };

  before(async () => {
    Object.assign(process.env, PUSH_ORTAMI);
    const { testVeritabaniKur } = await import('#cekirdek/test-vt.ts');
    const { uygulamaKur } = await import('#cekirdek/uygulama.ts');
    const { denetimYaz } = await import('../denetim/disari.ts');
    const { tekrarDeposu } = await import('../istek-kimligi/disari.ts');
    const { rolAl, rolAta, yoneticiOlustur } = await import('../kisiler/disari.ts');
    const { kimlikCozucu } = await import('../oturum/disari.ts');
    const { bildirimGonder } = await import('./disari.ts');
    const push = await import('./push.ts');
    ortam = await testVeritabaniKur('bildirim_push');
    const vt = ortam.vt;
    const ayar = push.ortamPushAyari();
    assert.ok(ayar, 'push ayarı açık olmalı');
    gonder = (olay) => vt.tx((db) => bildirimGonder(db, olay));
    tur = (getir) => push.pushTuru(vt, ayar, { uyar: () => undefined, hata: () => undefined }, getir);
    app = await uygulamaKur({ vt, ayar: ortam.ayar, kimlik: kimlikCozucu(vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kisiler.set('yonetici', yoneticiId);
    await giris('yonetici');
    const yoneticiRolu = await vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    for (const [ad, kod] of [['bakim', 'bakim'], ['operator', 'operator']] as const) {
      const rol = await vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
      if (!rol || !yoneticiRolu) throw new Error('rol yok');
      const id = await vt.tx(async (db) => {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        await rolAta(db, yoneticiId, yeni, rol.id);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
        return yeni;
      });
      kisiler.set(ad, id);
      await giris(ad);
    }
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
    for (const ad of Object.keys(PUSH_ORTAMI)) {
      if (ESKI_ORTAM[ad] === undefined) delete process.env[ad];
      else process.env[ad] = ESKI_ORTAM[ad];
    }
  });

  test('uçlar oturum ister; tür ayarı Sistem Ayarları işlemi ister', async () => {
    assert.equal((await istek(null, 'GET', '/bildirimler/push')).durum, 401);
    assert.equal((await istek(null, 'POST', '/bildirimler/push/abone-ol', { ucNokta: UC_BAKIM })).durum, 401);
    assert.equal((await istek(null, 'POST', '/bildirimler/push/abonelik-sil', { ucNokta: UC_BAKIM })).durum, 401);
    assert.equal((await istek('bakim', 'GET', '/bildirimler/push/turler')).durum, 403);
    assert.equal((await istek('bakim', 'POST', '/bildirimler/push/turler/istasyonlar.makine-durdu/degistir', { acik: false })).durum, 403);
  });

  test('durum açık anahtarı verir; kişi kendi cihazını açar, liste dışı adres reddedilir', async () => {
    await sifirla();
    const d = await istek<BildirimPushDurumuCevabi>('bakim', 'GET', '/bildirimler/push');
    assert.equal(d.durum, 200);
    assert.equal(d.govde.acik, true);
    assert.equal(d.govde.acikAnahtar, ecdh.getPublicKey().toString('base64url'));
    assert.equal(d.govde.cihazSayisi, 0);
    assert.equal((await abone('bakim', 'https://ornek.invalid/push')).durum, 400);
    assert.equal((await abone('bakim', 'http://fcm.googleapis.com/fcm/send/x')).durum, 400);
    const a = await abone('bakim', UC_BAKIM);
    assert.equal(a.durum, 200);
    assert.equal(a.govde.cihazSayisi, 1);
    assert.deepEqual(await abonelikler(), [{ kisiId: kim('bakim'), ucNokta: UC_BAKIM }]);
  });

  test('başkasının aboneliğini silme girişimi reddedilir ve abonelik kalır', async () => {
    await sifirla();
    assert.equal((await abone('bakim', UC_BAKIM)).durum, 200);
    const c = await istek('operator', 'POST', '/bildirimler/push/abonelik-sil', { ucNokta: UC_BAKIM });
    assert.equal(c.durum, 404);
    assert.deepEqual(await abonelikler(), [{ kisiId: kim('bakim'), ucNokta: UC_BAKIM }]);
    const k = await istek<BildirimPushDurumuCevabi>('bakim', 'POST', '/bildirimler/push/abonelik-sil', { ucNokta: UC_BAKIM });
    assert.equal(k.durum, 200);
    assert.equal(k.govde.cihazSayisi, 0);
    assert.deepEqual(await abonelikler(), []);
  });

  test('acil ve görev türü yalnız aboneliği olan alıcıyı kuyruğa koyar; bilgi koymaz; yönetici türü kapatabilir', async () => {
    await sifirla();
    await abone('bakim', UC_BAKIM);
    // Makine durdu acildir: bakım ve yönetici alır, yalnız aboneliği olan bakım kuyruğa girer.
    assert.equal(await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', yol: '/istasyonlar' }), 2);
    assert.deepEqual(await kuyruk(), [{ kisiId: kim('bakim') }]);
    await sifirla();
    await abone('yonetici', UC_OPERATOR);
    assert.ok(await gonder({ tur: 'satin-alma.talep-onaylandi', baslik: 'Talep onaylandı', kisiler: [yoneticiId] }) >= 1);
    assert.deepEqual(await kuyruk(), [], 'bilgi sınıfı sinyal üretmez');
    const kapat = await istek<BildirimPushTurleriCevabi>('yonetici', 'POST', '/bildirimler/push/turler/istasyonlar.makine-durdu/degistir', { acik: false });
    assert.equal(kapat.durum, 200);
    const satir = kapat.govde.satirlar.find((s) => s.tur === 'istasyonlar.makine-durdu');
    assert.deepEqual([satir?.acik, satir?.varsayilan], [false, false]);
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', yol: '/istasyonlar' });
    assert.deepEqual(await kuyruk(), [], 'kapatılan tür sinyal üretmez');
    const ac = await istek<BildirimPushTurleriCevabi>('yonetici', 'POST', '/bildirimler/push/turler/istasyonlar.makine-durdu/degistir', { acik: true });
    assert.equal(ac.govde.satirlar.find((s) => s.tur === 'istasyonlar.makine-durdu')?.varsayilan, true);
    assert.equal((await o().vt.sorgu('SELECT 1 FROM bildirim_push_turu')).length, 0, 'varsayılana dönen satır silinir');
  });

  test('iş: kişinin bütün cihazlarına tek sinyal, dakikada en çok bir; 410 aboneliği siler', async () => {
    await sifirla();
    await abone('bakim', UC_BAKIM);
    await abone('bakim', UC_BAKIM_2);
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu 1', kaynakKimlik: '1', yol: '/istasyonlar' });
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu 2', kaynakKimlik: '2', yol: '/istasyonlar' });
    const ilk = kayitliGetir();
    assert.deepEqual(await tur(ilk.getir), { kisi: 1, tamam: 2, silinen: 0, hata: 0 });
    assert.deepEqual(ilk.adresler.sort(), [UC_BAKIM, UC_BAKIM_2].sort());
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu 3', kaynakKimlik: '3', yol: '/istasyonlar' });
    const ikinci = kayitliGetir();
    assert.deepEqual(await tur(ikinci.getir), { kisi: 0, tamam: 0, silinen: 0, hata: 0 }, 'bir dakika dolmadan ikinci sinyal yok');
    assert.deepEqual(await kuyruk(), [{ kisiId: kim('bakim') }], 'bekleyen kaybolmaz');
    await o().vt.sorgu("UPDATE bildirim_push_kuyruk SET son_gonderim = now() - interval '61 seconds'");
    const bitti = kayitliGetir(410);
    assert.deepEqual(await tur(bitti.getir), { kisi: 1, tamam: 0, silinen: 2, hata: 0 });
    assert.deepEqual(await abonelikler(), []);
    assert.deepEqual(await kuyruk(), []);
  });
});
