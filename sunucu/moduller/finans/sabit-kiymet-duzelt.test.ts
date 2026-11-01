import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MakineSabitKiymetleriCevabi, SabitKiymetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Tutarlar ve makine adları uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 1595 (1596 teyit a, 1598 a, 1599 a): makine demirbaşının fiyatı ve amortismanı finansın sabit kıymet kaydındadır; kart ona makine kimliğiyle ulaşır.
describe('finans sabit kıymet düzeltmesi ve makineye göre okuma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (yontem === 'POST' && yol.endsWith('/ekle')) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const tamam = <T>(c: Cevap<T>): T => { assert.ok(c.durum === 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const ekle = async (g: Record<string, unknown>): Promise<SabitKiymetSatiri> =>
    tamam(await istek<{ sabitKiymet: SabitKiymetSatiri }>('yonetim', 'POST', '/finans/sabit-kiymetler/ekle', { ad: 'Deneme Tezgah', ...g })).sabitKiymet;
  const duzelt = (k: SabitKiymetSatiri, ek: Record<string, unknown>, kim = 'yonetim') => istek<{ sabitKiymet: SabitKiymetSatiri }>(kim, 'POST', `/finans/sabit-kiymetler/${k.id}/guncelle`, {
    ad: k.ad, makineKodu: k.makineKodu, makineId: k.makineId, paraBirimi: k.paraBirimi, bedel: Number(k.bedel), kur: Number(k.kur), alisTarihi: k.alisTarihi,
    omurAy: k.omurAy, yontem: k.yontem, kalintiDegeri: Number(k.kalintiDegeri), devirTarihi: k.devirTarihi,
    devirBirikmisTl: k.devirBirikmisTl === null ? null : Number(k.devirBirikmisTl), aciklama: k.aciklama, surum: k.surum, ...ek,
  });
  const makine = async (kod: string): Promise<number> =>
    (await vt().tek<{ id: number }>('INSERT INTO makine (kod, ad) VALUES ($1, $2) RETURNING id', [kod, `Deneme ${kod}`]))!.id;
  const buAy = (): string => tesisGunu(new Date()).slice(0, 7);
  const ay = (n: number): string => {
    const b = buAy();
    const t = Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7)) - 1 + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };

  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    await vt().tx(async (db) => { const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }); await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id); });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('finanskiymet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('yonetim', ['sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.yonet']);
    await girisliKisi('okuyan', ['sayfa.finans', 'finans.oku']);
    await girisliKisi('malzemeci', ['sayfa.malzemeler', 'malzemeler.yaz']);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('makine kimliğiyle eklenen kıymet makinenin kodunu alır; makineye göre okuma yalnız o makinenin kıymetlerini hesaplanmış döner', async () => {
    const m1 = await makine('DZ-M1');
    const m2 = await makine('DZ-M2');
    const k = await ekle({ makineId: m1, bedel: 120000, alisTarihi: `${ay(-24)}-15`, omurAy: 120 });
    assert.deepEqual([k.makineId, k.makineKodu, k.buAyTl, k.birikmisTl, k.netTl], [m1, 'DZ-M1', '1000.00', '25000.00', '95000.00']);
    await ekle({ makineId: m2, bedel: 5000, alisTarihi: `${buAy()}-01`, omurAy: 10 });
    const liste = tamam(await istek<MakineSabitKiymetleriCevabi>('okuyan', 'GET', `/finans/sabit-kiymetler/makine/${m1}`)).sabitKiymetler;
    assert.deepEqual(liste.map((x) => x.id), [k.id]);
    assert.deepEqual(tamam(await istek<MakineSabitKiymetleriCevabi>('okuyan', 'GET', '/finans/sabit-kiymetler/makine/999999')).sabitKiymetler, []);
    // Kod ile kimlik çelişirse ve kimlik olmayan makineyi gösterirse yazılmaz.
    const celiski = await istek('yonetim', 'POST', '/finans/sabit-kiymetler/ekle', { ad: 'X', makineId: m1, makineKodu: 'DZ-M2', bedel: 1, alisTarihi: '2026-01-01', omurAy: 10 });
    assert.deepEqual([celiski.durum, (celiski.govde as { alan?: string }).alan], [400, 'makineKodu']);
    const yok = await istek('yonetim', 'POST', '/finans/sabit-kiymetler/ekle', { ad: 'X', makineId: 999999, bedel: 1, alisTarihi: '2026-01-01', omurAy: 10 });
    assert.deepEqual([yok.durum, (yok.govde as { alan?: string }).alan], [400, 'makineId']);
  });

  test('düzeltme: bedel, ömür ve yöntem değişince amortisman baştan hesaplanır, sürüm artar; eski sürüm 409, pasif kıymet 422', async () => {
    const m = await makine('DZ-M3');
    const k = await ekle({ makineId: m, bedel: 120000, alisTarihi: `${ay(-24)}-15`, omurAy: 120 });
    const d = tamam(await duzelt(k, { bedel: 240000, kalintiDegeri: 0 })).sabitKiymet;
    assert.deepEqual([d.surum, d.bedelTl, d.buAyTl, d.birikmisTl], [k.surum + 1, '240000.00', '2000.00', '50000.00']);
    const azalan = tamam(await duzelt(d, { yontem: 'azalan', omurAy: 60, alisTarihi: `${buAy()}-01`, bedel: 60000 })).sabitKiymet;
    assert.equal(azalan.buAyTl, '2000.00');
    assert.equal((await duzelt(k, { bedel: 1 })).durum, 409);
    const devirsiz = await duzelt(azalan, { devirTarihi: `${buAy()}-01` });
    assert.deepEqual([devirsiz.durum, (devirsiz.govde as { alan?: string }).alan], [400, 'devirBirikmisTl']);
    const pasif = tamam(await istek<{ sabitKiymet: SabitKiymetSatiri }>('yonetim', 'POST', `/finans/sabit-kiymetler/${k.id}/pasif`, { pasifTarihi: `${buAy()}-01`, surum: azalan.surum })).sabitKiymet;
    assert.equal((await duzelt(pasif, { bedel: 1000 })).durum, 422);
    assert.equal((await istek('yonetim', 'POST', '/finans/sabit-kiymetler/999999/guncelle', { ...{ ad: 'X', bedel: 1, alisTarihi: '2026-01-01', omurAy: 10 }, surum: 1 })).durum, 404);
  });

  test('düzeltme gövdesi para yazar: bilinmeyen alan reddedilir (ADR 0025 kural 10); kayıt değişmez', async () => {
    const k = await ekle({ bedel: 1000, alisTarihi: '2026-01-01', omurAy: 10 });
    assert.equal((await duzelt(k, { pasifTarihi: '2026-02-01' })).durum, 400);
    assert.equal((await duzelt(k, { birikmisTl: '999' })).durum, 400);
    const liste = tamam(await istek<{ satirlar: SabitKiymetSatiri[] }>('okuyan', 'GET', '/finans/sabit-kiymetler?sayfaBoyu=200')).satirlar;
    assert.equal(liste.find((x) => x.id === k.id)?.surum, k.surum);
  });

  test('yetki (1599 a): fiyat ve amortismanı yalnız finansı okuyan görür, yalnız finansı yöneten düzeltir', async () => {
    const m = await makine('DZ-M4');
    const k = await ekle({ makineId: m, bedel: 1000, alisTarihi: '2026-01-01', omurAy: 10 });
    assert.equal((await istek('malzemeci', 'GET', `/finans/sabit-kiymetler/makine/${m}`)).durum, 403);
    assert.equal((await istek('okuyan', 'GET', `/finans/sabit-kiymetler/makine/${m}`)).durum, 200);
    assert.equal((await duzelt(k, { bedel: 2000 }, 'okuyan')).durum, 403);
    assert.equal((await duzelt(k, { bedel: 2000 }, 'malzemeci')).durum, 403);
    assert.equal(tamam(await duzelt(k, { bedel: 2000 })).sabitKiymet.bedel, '2000.00');
  });

  test('eşzamanlı iki düzeltmeden yalnız biri yazar; öteki eski sürümle 409 alır', async () => {
    const k = await ekle({ bedel: 1000, alisTarihi: '2026-01-01', omurAy: 10 });
    const [a, b] = await Promise.all([duzelt(k, { bedel: 3000 }), duzelt(k, { bedel: 4000 })]);
    assert.deepEqual([a.durum, b.durum].sort(), [200, 409]);
    const kazanan = a.durum === 200 ? '3000.00' : '4000.00';
    const liste = tamam(await istek<{ satirlar: SabitKiymetSatiri[] }>('okuyan', 'GET', '/finans/sabit-kiymetler?sayfaBoyu=200')).satirlar;
    const son = liste.find((x) => x.id === k.id)!;
    assert.deepEqual([son.bedel, son.surum], [kazanan, k.surum + 1]);
  });
});
