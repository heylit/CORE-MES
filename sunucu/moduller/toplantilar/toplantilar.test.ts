import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { rolluGiris } from '#cekirdek/test-yetki.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Toplanti, ToplantiAcGovdesi, ToplantiListesiCevabi } from '#paylasilan/sozlesme/toplantilar.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { takvimKayitlari } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const GUN_MS = 86_400_000;
const gun = (fark: number): string => tesisGunu(Date.now() + fark * GUN_MS);
const an = (g: string, saat: string): string => `${g}T${saat}:00+03:00`;

interface Cevap<T> { durum: number; govde: T }
type Yontem = 'GET' | 'POST' | 'PUT';

describe('toplantılar (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani;
  let app: FastifyInstance;
  const c: Record<'yonetici' | 'katilimci' | 'yabanci', string> = { yonetici: '', katilimci: '', yabanci: '' };
  const kisi: Record<'yonetici' | 'katilimci' | 'yabanci', number> = { yonetici: 0, katilimci: 0, yabanci: 0 };
  let projeId = 0;

  async function istek<T>(cerez: string, yontem: Yontem, url: string, payload?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: { cookie: cerez, ...(yontem === 'GET' ? {} : { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }) },
    });
    return { durum: cevap.statusCode, govde: cevap.json() as T };
  }
  async function tamam<T>(cerez: string, yontem: Yontem, url: string, payload?: unknown): Promise<T> {
    const cevap = await istek<T>(cerez, yontem, url, payload);
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    return cevap.govde;
  }
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const bildirimler = (kisiId: number): Promise<{ tur: string; yol: string }[]> =>
    ortam.vt.tx((db) => db.sorgu<{ tur: string; yol: string }>(
      "SELECT tur, yol FROM bildirim_kaydi WHERE kisi_id = $1 AND tur LIKE 'toplantilar.%' ORDER BY id", [kisiId]));

  const govde = (ek: Partial<ToplantiAcGovdesi> = {}): ToplantiAcGovdesi => ({
    baslik: 'Haftalık üretim', tur: 'uretim', baslangic: an(gun(1), '09:30'), bitis: an(gun(1), '10:15'), yer: 'Toplantı salonu',
    konu: { tur: 'serbest' }, katilimcilar: [{ kisiId: kisi.katilimci, zorunlu: true }], gundem: ['Geciken emirler', 'Bakım planı'], epostaGonder: false,
    ...ek,
  });

  before(async () => {
    ortam = await testVeritabaniKur('toplantilar');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisi.yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await girisCerezi('yonetici');
    const roller = (await tamam<{ roller: { id: number; ad: string }[] }>(c.yonetici, 'GET', '/roller')).roller;
    const operatorRolu = roller.find((r) => r.ad === 'Operatör')!.id;
    for (const ad of ['katilimci', 'yabanci'] as const) {
      kisi[ad] = await ortam.vt.tx(async (db) => {
        const id = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
        const k = await rolAta(db, kisi.yonetici, id, operatorRolu);
        for (const r of k.roller) if (r.id !== operatorRolu) await rolAl(db, kisi.yonetici, id, r.id);
        return id;
      });
      c[ad] = await girisCerezi(ad);
    }
    projeId = (await ortam.vt.tx((db) => db.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.TOP', 'Deneme proje', $1) RETURNING id", [kisi.yonetici])))!.id;
  });

  after(async () => {
    await app.close();
    await ortam.kaldir();
  });

  test('açılan toplantıyı katılımcı görür ve davet alır; yabancı görmez, katılımcı yazamaz', async () => {
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde());
    assert.equal(t.durum, 'planlandi');
    assert.deepEqual(t.gundem, ['Geciken emirler', 'Bakım planı']);
    assert.deepEqual(t.katilimcilar.map((k) => [k.kisiId, k.zorunlu]), [[kisi.katilimci, true]]);
    assert.equal(t.konuTuru, 'serbest');
    assert.equal(t.konu, null);

    const kendi = await tamam<Toplanti>(c.katilimci, 'GET', `/toplantilar/${String(t.id)}`);
    assert.equal(kendi.izinler.yaz, false);
    assert.ok((await tamam<ToplantiListesiCevabi>(c.katilimci, 'GET', '/toplantilar')).toplantilar.some((x) => x.id === t.id));
    assert.deepEqual(await bildirimler(kisi.katilimci), [{ tur: 'toplantilar.davet', yol: `/profil/toplantilarim/${String(t.id)}` }]);
    assert.deepEqual(await bildirimler(kisi.yonetici), [], 'yapan kendi davetini almaz');

    // Yabancı: liste veri getirir ama bu toplantı yoktur; ayrıntı 403.
    assert.equal((await istek(c.yabanci, 'GET', `/toplantilar/${String(t.id)}`)).durum, 403);
    assert.ok(!(await tamam<ToplantiListesiCevabi>(c.yabanci, 'GET', '/toplantilar')).toplantilar.some((x) => x.id === t.id));
    assert.equal((await istek(c.katilimci, 'POST', `/toplantilar/${String(t.id)}/kararlar`, { metin: 'Karar' })).durum, 403);
  });

  test('toplantilar.yaz göremediği toplantıya yazamaz; düzenlediği ya da katıldığına yazar', async () => {
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde({ baslik: 'Yetki denemesi' }));
    const yazar = await rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur })(['sayfa.toplantilar', 'toplantilar.yaz']);
    const yol = `/toplantilar/${String(t.id)}`;
    const ret = [
      await istek(yazar, 'POST', `${yol}/kararlar`, { metin: 'Karar' }),
      await istek(yazar, 'POST', `${yol}/aksiyonlar`, { metin: 'Aksiyon', sorumluKisiId: kisi.katilimci, sonTarih: gun(3) }),
      await istek(yazar, 'PUT', yol, { ...govde({ baslik: 'Değişti' }), surum: t.surum }),
      await istek(yazar, 'POST', `${yol}/iptal`, { neden: 'Deneme', surum: t.surum }),
    ];
    assert.deepEqual(ret.map((r) => r.durum), [403, 403, 403, 403]);
    assert.equal((await tamam<Toplanti>(c.yonetici, 'GET', yol)).kararlar.length, 0, 'reddedilen yazma iz bırakmaz');

    // Kendi açtığına yazar (düzenleyen).
    const kendi = await tamam<Toplanti>(yazar, 'POST', '/toplantilar', govde({ baslik: 'Kendi toplantısı' }));
    assert.equal((await istek(yazar, 'POST', `/toplantilar/${String(kendi.id)}/kararlar`, { metin: 'Karar' })).durum, 200);
  });

  test('toplantı tek günlüktür; bitiş başlangıçtan sonra olur; olmayan konu reddedilir', async () => {
    const ertesi = await istek<{ alan?: string }>(c.yonetici, 'POST', '/toplantilar', govde({ baslangic: an(gun(1), '23:30'), bitis: an(gun(2), '00:30') }));
    assert.equal(ertesi.durum, 400);
    assert.equal(ertesi.govde.alan, 'bitis');
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde());
    const gece = await istek<{ alan?: string }>(c.yonetici, 'PUT', `/toplantilar/${String(t.id)}`,
      { ...govde({ baslangic: an(gun(1), '23:30'), bitis: an(gun(2), '00:30') }), surum: t.surum });
    assert.deepEqual([gece.durum, gece.govde.alan], [400, 'bitis'], 'değiştirmede de tek gün');
    const ters = await istek(c.yonetici, 'POST', '/toplantilar', govde({ bitis: an(gun(1), '09:00') }));
    assert.equal(ters.durum, 400);
    const yokProje = await istek(c.yonetici, 'POST', '/toplantilar', govde({ konu: { tur: 'proje', id: 999999 } }));
    assert.ok([409, 422].includes(yokProje.durum), String(yokProje.durum));
  });

  test('değişiklik: eklenen davet, kalan değişiklik, çıkan iptal bildirimi alır; eski sürüm 409', async () => {
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde({ katilimcilar: [{ kisiId: kisi.katilimci, zorunlu: true }] }));
    const once = (await bildirimler(kisi.katilimci)).length;
    const yeni = await tamam<Toplanti>(c.yonetici, 'PUT', `/toplantilar/${String(t.id)}`, {
      ...govde(), bitis: an(gun(1), '10:45'), katilimcilar: [{ kisiId: kisi.katilimci, zorunlu: false }, { kisiId: kisi.yabanci, zorunlu: true }], surum: t.surum,
    });
    assert.equal(yeni.surum, t.surum + 1);
    assert.deepEqual((await bildirimler(kisi.katilimci)).slice(once).map((b) => b.tur), ['toplantilar.degisti']);
    assert.deepEqual((await bildirimler(kisi.yabanci)).map((b) => b.tur), ['toplantilar.davet']);
    assert.equal((await tamam<Toplanti>(c.yabanci, 'GET', `/toplantilar/${String(t.id)}`)).id, t.id);

    await tamam(c.yonetici, 'PUT', `/toplantilar/${String(t.id)}`, { ...govde(), katilimcilar: [{ kisiId: kisi.yabanci, zorunlu: true }], surum: yeni.surum });
    assert.deepEqual((await bildirimler(kisi.katilimci)).slice(once).map((b) => b.tur), ['toplantilar.degisti', 'toplantilar.iptal']);
    assert.equal((await istek(c.katilimci, 'GET', `/toplantilar/${String(t.id)}`)).durum, 403, 'çıkarılan kişi artık görmez');

    assert.equal((await istek(c.yonetici, 'PUT', `/toplantilar/${String(t.id)}`, { ...govde(), surum: t.surum })).durum, 409);
  });

  test('yapıldı başlamadan işaretlenmez; işaretlenince değişmez ama karar ve aksiyon yazılır', async () => {
    const gelecek = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde());
    assert.equal((await istek(c.yonetici, 'POST', `/toplantilar/${String(gelecek.id)}/yapildi`, { surum: gelecek.surum })).durum, 400);

    const gecmis = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde({ baslangic: an(gun(-1), '09:30'), bitis: an(gun(-1), '10:00') }));
    const yapildi = await tamam<Toplanti>(c.yonetici, 'POST', `/toplantilar/${String(gecmis.id)}/yapildi`, { surum: gecmis.surum });
    assert.equal(yapildi.durum, 'yapildi');
    assert.equal((await istek(c.yonetici, 'PUT', `/toplantilar/${String(gecmis.id)}`, { ...govde(), surum: yapildi.surum })).durum, 409);
    await tamam(c.yonetici, 'POST', `/toplantilar/${String(gecmis.id)}/kararlar`, { metin: 'Bakım cumartesi yapılır.' });
    const son = await tamam<Toplanti>(c.yonetici, 'POST', `/toplantilar/${String(gecmis.id)}/aksiyonlar`, {
      metin: 'Bakım planını yayınla', sorumluKisiId: kisi.katilimci, sonTarih: gun(3),
    });
    assert.deepEqual(son.kararlar.map((k) => k.metin), ['Bakım cumartesi yapılır.']);
    assert.deepEqual(son.aksiyonlar.map((a) => [a.metin, a.durum, a.gorev]), [['Bakım planını yayınla', 'acik', null]]);
    // Serbest konulu toplantının aksiyonu göreve çevrilmez.
    const ret = await istek<{ hata: { mesaj: string } }>(c.yonetici, 'POST', `/toplantilar/${String(gecmis.id)}/aksiyonlar/${String(son.aksiyonlar[0]!.id)}/gorev`, { surum: son.aksiyonlar[0]!.surum });
    assert.equal(ret.durum, 409);
    const bitti = await tamam<Toplanti>(c.yonetici, 'POST', `/toplantilar/${String(gecmis.id)}/aksiyonlar/${String(son.aksiyonlar[0]!.id)}/durum`, {
      durum: 'bitti', surum: son.aksiyonlar[0]!.surum,
    });
    assert.equal(bitti.aksiyonlar[0]!.durum, 'bitti');
  });

  test('iptal nedenle olur, katılımcıya iptal gider; iptalden sonra karar yazılmaz', async () => {
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde({ katilimcilar: [{ kisiId: kisi.yabanci, zorunlu: true }] }));
    const iptal = await tamam<Toplanti>(c.yonetici, 'POST', `/toplantilar/${String(t.id)}/iptal`, { neden: 'Müşteri erteledi', surum: t.surum });
    assert.equal(iptal.durum, 'iptal');
    assert.equal(iptal.iptalNedeni, 'Müşteri erteledi');
    assert.equal((await bildirimler(kisi.yabanci)).at(-1)?.tur, 'toplantilar.iptal');
    assert.equal((await istek(c.yonetici, 'POST', `/toplantilar/${String(t.id)}/kararlar`, { metin: 'Karar' })).durum, 409);
    assert.equal((await istek(c.yonetici, 'POST', `/toplantilar/${String(t.id)}/iptal`, { neden: 'Yine', surum: iptal.surum })).durum, 409);
  });

  test('projeli toplantının aksiyonu projede görev olur; eşzamanlı iki çevirmeden biri geçer', async () => {
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde({ konu: { tur: 'proje', id: projeId } }));
    assert.deepEqual([t.konuTuru, t.konu?.no, t.konu?.durum], ['proje', 'ORN.TOP', 'aktif']);
    const a = (await tamam<Toplanti>(c.yonetici, 'POST', `/toplantilar/${String(t.id)}/aksiyonlar`, {
      metin: 'Fikstür çizimini hazırla', sorumluKisiId: kisi.katilimci, sonTarih: gun(5),
    })).aksiyonlar[0]!;
    const yol = `/toplantilar/${String(t.id)}/aksiyonlar/${String(a.id)}/gorev`;
    const [bir, iki] = await Promise.all([istek<Toplanti>(c.yonetici, 'POST', yol, { surum: a.surum }), istek<Toplanti>(c.yonetici, 'POST', yol, { surum: a.surum })]);
    assert.deepEqual([bir.durum, iki.durum].sort(), [200, 409]);
    const sonra = await tamam<Toplanti>(c.yonetici, 'GET', `/toplantilar/${String(t.id)}`);
    const gorev = sonra.aksiyonlar[0]!.gorev;
    assert.ok(gorev !== null);
    assert.equal(gorev.durum, 'yapilacak');
    const satir = await ortam.vt.tx((db) => db.tek<{ proje_id: number; ad: string; sorumlu_kisi_id: number; plan_baslangic: string; plan_bitis: string }>(
      'SELECT proje_id, ad, sorumlu_kisi_id, plan_baslangic, plan_bitis FROM projeler_gorev WHERE id = $1', [gorev.id]));
    assert.deepEqual(satir, { proje_id: projeId, ad: 'Fikstür çizimini hazırla', sorumlu_kisi_id: kisi.katilimci, plan_baslangic: gun(0), plan_bitis: gun(5) });
    // Görevi açık aksiyon yeniden çevrilmez.
    assert.equal((await istek(c.yonetici, 'POST', yol, { surum: sonra.aksiyonlar[0]!.surum })).durum, 409);
  });

  test('göreve çevirme projeler.gorev-yaz da ister: yalnız toplantilar.yaz 403 alır, düğmesi kapalı gelir', async () => {
    const giris = rolluGiris({ giris: app, vt: ortam.vt, kisiOlustur: yoneticiOlustur });
    const cevir = async (islemler: string[]): Promise<[number, boolean]> => {
      const cerez = await giris(['sayfa.toplantilar', 'toplantilar.yaz', ...islemler]);
      const t = await tamam<Toplanti>(cerez, 'POST', '/toplantilar', govde({ konu: { tur: 'proje', id: projeId } }));
      const sonra = await tamam<Toplanti>(cerez, 'POST', `/toplantilar/${String(t.id)}/aksiyonlar`, { metin: 'Aksiyon', sorumluKisiId: kisi.katilimci, sonTarih: gun(4) });
      const a = sonra.aksiyonlar[0]!;
      const r = await istek(cerez, 'POST', `/toplantilar/${String(t.id)}/aksiyonlar/${String(a.id)}/gorev`, { surum: a.surum });
      return [r.durum, sonra.izinler.gorevAc];
    };
    assert.deepEqual(await cevir([]), [403, false]);
    assert.deepEqual(await cevir(['projeler.gorev-yaz']), [200, true]);
  });

  test('takvim: kişi kendi toplantısını görür; toplantilar.oku hepsini', async () => {
    const t = await tamam<Toplanti>(c.yonetici, 'POST', '/toplantilar', govde({ baslik: 'Takvim denemesi', katilimcilar: [{ kisiId: kisi.katilimci, zorunlu: true }] }));
    const oku = (id: number, islemler: string[]) => ortam.vt.tx((db) => takvimKayitlari(db, gun(1), gun(1), { id, ad: 'x', islemler } as never));
    const kendi = (await oku(kisi.katilimci, [])).find((k) => k.kimlik === String(t.id));
    assert.deepEqual(kendi && { tarih: kendi.tarih, no: kendi.no, baslik: kendi.baslik, durum: kendi.durum, bitti: kendi.bitti },
      { tarih: gun(1), no: '09:30-10:15', baslik: 'Takvim denemesi', durum: 'Planlandı', bitti: false });
    assert.ok(!(await oku(kisi.yabanci, [])).some((k) => k.kimlik === String(t.id)));
    assert.ok((await oku(kisi.yabanci, ['toplantilar.oku'])).some((k) => k.kimlik === String(t.id)));
  });
});
