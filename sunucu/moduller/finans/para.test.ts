import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge, Cek, FinansOzetiCevabi, Odeme, SabitKiymetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { faizGetir, makineAmortismani } from './disari.ts';
import { uclar } from './uclar.ts';

// Firmalar ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const TEKRARLI = /\/(ekle|dagit|ciro|esitle|odendi|toplu-ice-aktar)$/;
interface Cevap<T = unknown> { durum: number; govde: T }
const kod = (c: Cevap): unknown => (c.govde as { kod?: unknown } | undefined)?.kod;
const alan = (c: Cevap): unknown => (c.govde as { alan?: unknown } | undefined)?.alan;
const TARIH = '2026-10-01';

describe('finans para kuralları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = {};
    if (kim) basliklar['cookie'] = cerez.get(kim) ?? '';
    if (yontem === 'POST' && TEKRARLI.test(yol)) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const yaz = <T = unknown>(yol: string, govde: unknown, kim = 'yonetim') => istek<T>(kim, 'POST', yol, govde);
  const tamam = <T>(c: Cevap<T>): T => { assert.ok(c.durum === 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };

  let sayac = 0;
  async function firma(tur: 'musteri' | 'tedarikci' | 'ikisi' = 'ikisi'): Promise<number> {
    return tamam(await yaz<{ firma: { id: number } }>('/musteri-tedarikci/firmalar/ekle', { ad: `Deneme Firma ${(sayac += 1)}`, tur })).firma.id;
  }
  async function hesap(tur: 'kasa' | 'banka' | 'kredi_karti' = 'banka', paraBirimi = 'TRY', acilis = 0): Promise<number> {
    return tamam(await yaz<{ hesap: { id: number } }>('/finans/hesaplar/ekle', { ad: `Deneme Hesap ${(sayac += 1)}`, tur, paraBirimi, acilisBakiyesi: acilis, acilisTarihi: '2026-01-01' })).hesap.id;
  }
  const belgeGovdesi = (firmaId: number | null, ek: Record<string, unknown> = {}) => ({
    yon: 'gelir', kategori: 'urun_satisi', firmaId, belgeTarihi: TARIH, vade: '2026-10-31', tutar: 1000, kdvOrani: 20, ...ek,
  });
  async function belge(firmaId: number | null, ek: Record<string, unknown> = {}): Promise<Belge> {
    return tamam(await yaz<{ belge: Belge }>('/finans/belgeler/ekle', belgeGovdesi(firmaId, ek))).belge;
  }
  const belgeOku = async (id: number): Promise<Belge> => {
    const l = tamam(await istek<{ satirlar: Belge[] }>('yonetim', 'GET', '/finans/belgeler?sayfaBoyu=200&iptalDahil=true'));
    let b = l.satirlar.find((x) => x.id === id);
    for (let s = 2; !b && s < 50; s += 1) b = tamam(await istek<{ satirlar: Belge[] }>('yonetim', 'GET', `/finans/belgeler?sayfaBoyu=200&iptalDahil=true&sayfa=${s}`)).satirlar.find((x) => x.id === id);
    if (!b) throw new Error('belge yok');
    return b;
  };
  async function odeme(firmaId: number | null, hesapId: number, tutar: number, dagitimlar: unknown[] = [], ek: Record<string, unknown> = {}): Promise<Odeme> {
    return tamam(await yaz<{ odeme: Odeme }>('/finans/odemeler/ekle', { yon: 'gelir', firmaId, tarih: TARIH, yontem: 'banka', hesapId, tutar, dagitimlar, ...ek })).odeme;
  }
  const hesapBakiyesi = async (id: number): Promise<string> => (await vt().tek<{ b: string }>('SELECT finans_hesap_bakiyesi($1)::text AS b', [id]))?.b ?? '';
  const kisitAdi = async (sql: string, p: unknown[]): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
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
    ortam = await testVeritabaniKur('finanspara');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const firmaIslemleri = ['musteri-tedarikci.oku', 'musteri-tedarikci.yaz'];
    await girisliKisi('yonetim', ['sayfa.finans', 'finans.oku', 'finans.yaz', 'finans.yonet', 'finans.kur-yaz', ...firmaIslemleri]);
    await girisliKisi('yazan', ['sayfa.finans', 'finans.oku', 'finans.yaz', 'musteri-tedarikci.oku']);
    await girisliKisi('okuyan', ['sayfa.finans', 'finans.oku', 'musteri-tedarikci.oku']);
    await girisliKisi('firmaci', ['sayfa.finans', ...firmaIslemleri]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: okuma finans.oku, kayıt finans.yaz, iptal finans.yonet ister; firma yetkisi rakam açmaz', async () => {
    const f = await firma();
    assert.equal((await istek(null, 'GET', '/finans/belgeler')).durum, 401);
    assert.equal((await istek('firmaci', 'GET', '/finans/belgeler')).durum, 403);
    assert.equal((await istek('firmaci', 'GET', '/finans/hesaplar')).durum, 403);
    assert.equal((await istek('okuyan', 'GET', '/finans/belgeler')).durum, 200);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f), 'okuyan')).durum, 403);
    const b = tamam(await yaz<{ belge: Belge }>('/finans/belgeler/ekle', belgeGovdesi(f), 'yazan')).belge;
    assert.equal((await yaz(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum }, 'yazan')).durum, 403);
    assert.equal((await yaz('/finans/hesaplar/ekle', { ad: 'Yetkisiz', tur: 'kasa', acilisTarihi: TARIH }, 'yazan')).durum, 403);
    assert.equal((await yaz('/finans/ayar/guncelle', {}, 'yazan')).durum, 403);
    assert.equal((await yaz(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum })).durum, 200);
    const sayacFirmaci = tamam(await istek<Record<string, unknown>>('firmaci', 'GET', '/finans/menu-sayaclari'));
    assert.deepEqual(sayacFirmaci, { firmalar: null, cekler: null });
    const sayacOkuyan = tamam(await istek<Record<string, unknown>>('okuyan', 'GET', '/finans/menu-sayaclari'));
    assert.equal(typeof sayacOkuyan['firmalar'], 'number');
  });

  test('FNS-1 (D-5): KDV oranı belge tarihinde geçerli olmalı; tabloya eklenen eski oran geçmiş tarihli belgede kabul edilir', async () => {
    const f = await firma();
    const r = await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { kdvOrani: 18 }));
    assert.equal(r.durum, 400);
    assert.equal(alan(r), 'kdvOrani');
    tamam(await yaz('/finans/kdv-oranlari/ekle', { oran: 18, gecerlilikBaslangic: '2020-01-01' }));
    tamam(await yaz('/finans/kdv-oranlari/kapat', { oran: 18, gecerlilikBaslangic: '2020-01-01', gecerlilikBitis: '2023-07-10', surum: 1 }));
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { kdvOrani: 18, belgeTarihi: '2023-01-10', vade: '2023-02-10' }))).durum, 200);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { kdvOrani: 18 }))).durum, 400);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { kdvOrani: 101 }))).durum, 400);
  });

  test('FNS-2, FNS-11: faturalı belgede firma zorunlu; faturasız yalnız izinli kategoride, firmasız ve elle', async () => {
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(null))).durum, 422);
    const h = await hesap('kasa');
    const maas = await belge(null, { yon: 'gider', tur: 'faturasiz', kategori: 'personel', kdvOrani: 0, pesin: { yontem: 'nakit', hesapId: h, tarih: TARIH } });
    assert.equal(maas.durum, 'kapandi');
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(null, { yon: 'gider', tur: 'faturasiz', kategori: 'kira', kdvOrani: 0 }))).durum, 400);
    assert.equal(await kisitAdi("UPDATE finans_belge SET kaynak = 'logo' WHERE id = $1", [maas.id]), 'finans_belge_faturasiz_elle');
  });

  test('FNS-51: satış müşteri ya da ikisi, alış tedarikçi ya da ikisi firmasına; ters tür 422', async () => {
    const m = await firma('musteri');
    const t = await firma('tedarikci');
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(t))).durum, 422);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(m, { yon: 'gider', kategori: 'mal_alimi' }))).durum, 422);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(m))).durum, 200);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(t, { yon: 'gider', kategori: 'mal_alimi' }))).durum, 200);
  });

  test('FNS-46: pasif firmaya yeni belge, ödeme ve çek açılamaz; aktif yapılınca açılır', async () => {
    const f = await firma();
    const fk = tamam(await istek<{ firma: { surum: number } }>('yonetim', 'GET', `/musteri-tedarikci/firmalar/${f}`)).firma;
    tamam(await yaz(`/finans/firmalar/${f}/pasif`, { surum: fk.surum }));
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f))).durum, 422);
    assert.equal((await yaz('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-12-01', tutar: 10 })).durum, 422);
    const h = await hesap();
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 10 })).durum, 422);
    tamam(await yaz(`/finans/firmalar/${f}/aktif`, { surum: fk.surum + 1 }));
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f))).durum, 200);
  });

  test('FNS-4, FNS-5, FNS-6 (K-3, K-7): toplam, KDV, tevkifat ve TL karşılığı veritabanında hesaplanır; TRY kuru 1', async () => {
    const f = await firma();
    const b = await belge(f, { tutar: 1000, kdvOrani: 20, tevkifatPay: 2, tevkifatPayda: 10, paraBirimi: 'EUR', kur: 35.5 });
    assert.deepEqual([b.kdvTutari, b.tevkifatTutari, b.toplam, b.toplamTl], ['200.00', '40.00', '1160.00', '41180.00']);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { kur: 2 }))).durum, 422);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { tevkifatPay: 5, tevkifatPayda: 3 }))).durum, 422);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { tevkifatPay: 2 }))).durum, 422);
    assert.equal(await kisitAdi('UPDATE finans_belge SET toplam = 1 WHERE id = $1', [b.id]) !== null, true);
  });

  test('peşin belge kapanır ve hesaba girer; hesap para birimi tutmazsa hiçbir şey yazılmaz', async () => {
    const f = await firma();
    const h = await hesap('banka');
    const b = await belge(f, { pesin: { yontem: 'banka', hesapId: h, tarih: TARIH } });
    assert.equal(b.durum, 'kapandi');
    assert.equal(await hesapBakiyesi(h), '1200.00');
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n;
    const eur = await hesap('banka', 'EUR');
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { pesin: { yontem: 'banka', hesapId: eur, tarih: TARIH } }))).durum, 422);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { pesin: { yontem: 'nakit', hesapId: h, tarih: TARIH } }))).durum, 422);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n, once);
  });

  test('FNS-7, FNS-8, FNS-17: kısmi tahsilat belgeyi açık bırakır; kalanı aşan dağıtım reddedilir; dağıtılmayan kısım avanstır', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f);
    const o1 = await odeme(f, h, 1000, [{ belgeId: b.id, belgeTutari: 1000 }]);
    assert.equal(o1.kalan, '0.00');
    let g = await belgeOku(b.id);
    assert.deepEqual([g.durum, g.kalan], ['acik', '200.00']);
    const o2 = await odeme(f, h, 300);
    assert.equal(o2.kalan, '300.00');
    const asan = await yaz(`/finans/odemeler/${o2.id}/dagit`, { tarih: TARIH, dagitimlar: [{ belgeId: b.id, belgeTutari: 250 }] });
    assert.equal(asan.durum, 422);
    const d = tamam(await yaz<{ odeme: Odeme }>(`/finans/odemeler/${o2.id}/dagit`, { tarih: TARIH, dagitimlar: [{ belgeId: b.id, belgeTutari: 200 }] })).odeme;
    assert.equal(d.kalan, '100.00');
    g = await belgeOku(b.id);
    assert.deepEqual([g.durum, g.kalan], ['kapandi', '0.00']);
  });

  test('FNS-18 (D-2, K-13): avans sonraki belgeye mahsup edilir; ödemenin kalanını aşan mahsup reddedilir', async () => {
    const f = await firma();
    const h = await hesap();
    const o = await odeme(f, h, 500);
    const b1 = await belge(f, { tutar: 250, kdvOrani: 0 });
    const b2 = await belge(f, { tutar: 400, kdvOrani: 0 });
    tamam(await yaz(`/finans/odemeler/${o.id}/dagit`, { tarih: TARIH, dagitimlar: [{ belgeId: b1.id, belgeTutari: 250 }] }));
    assert.equal((await yaz(`/finans/odemeler/${o.id}/dagit`, { tarih: TARIH, dagitimlar: [{ belgeId: b2.id, belgeTutari: 300 }] })).durum, 422);
    const son = tamam(await yaz<{ odeme: Odeme }>(`/finans/odemeler/${o.id}/dagit`, { tarih: TARIH, dagitimlar: [{ belgeId: b2.id, belgeTutari: 250 }] })).odeme;
    assert.equal(son.kalan, '0.00');
  });

  test('FNS-19: başka firmanın ya da ters yönün belgesine dağıtım reddedilir', async () => {
    const f1 = await firma();
    const f2 = await firma();
    const h = await hesap();
    const b2 = await belge(f2);
    const gider = await belge(f1, { yon: 'gider', kategori: 'mal_alimi' });
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f1, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 10, dagitimlar: [{ belgeId: b2.id, belgeTutari: 10 }] })).durum, 422);
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f1, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 10, dagitimlar: [{ belgeId: gider.id, belgeTutari: 10 }] })).durum, 422);
  });

  test('FNS-20 (K-9, K-11): euro faturası TL ile kapanır; dağıtım iki tutar ve kuru taşır, kur farkı bilgi olarak saklanır; kursuz çapraz dağıtım 400', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f, { tutar: 100, kdvOrani: 0, paraBirimi: 'EUR', kur: 35 });
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 3600, dagitimlar: [{ belgeId: b.id, belgeTutari: 100 }] })).durum, 400);
    const o = await odeme(f, h, 3600, [{ belgeId: b.id, belgeTutari: 100, caprazKur: 36 }]);
    assert.equal(o.kalan, '0.00');
    const d = await vt().tek<{ belge_tutari: string; odeme_tutari: string; kur_farki_tl: string }>('SELECT belge_tutari, odeme_tutari, kur_farki_tl FROM finans_odeme_dagilimi WHERE odeme_id = $1', [o.id]);
    assert.deepEqual(d, { belge_tutari: '100.00', odeme_tutari: '3600.00', kur_farki_tl: '100.00' });
    assert.equal((await belgeOku(b.id)).durum, 'kapandi');
    const ayni = await belge(f, { tutar: 10, kdvOrani: 0 });
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 10, dagitimlar: [{ belgeId: ayni.id, belgeTutari: 10, caprazKur: 2 }] })).durum, 400);
  });

  test('FNS-9, FNS-39: açık belge düzeltilir; kısmen kapanmış belgenin tutarı değişmez ama açıklaması değişir; eski sürüm 409', async () => {
    const f = await firma();
    const h = await hesap();
    let b = await belge(f);
    const govde = (ek: Record<string, unknown>) => ({ ...belgeGovdesi(f), surum: b.surum, ...ek });
    b = tamam(await yaz<{ belge: Belge }>(`/finans/belgeler/${b.id}/duzelt`, govde({ tutar: 900 }))).belge;
    assert.equal(b.toplam, '1080.00');
    assert.equal((await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f), surum: b.surum - 1, tutar: 800 })).durum, 409);
    await odeme(f, h, 100, [{ belgeId: b.id, belgeTutari: 100 }]);
    b = await belgeOku(b.id);
    assert.equal((await yaz(`/finans/belgeler/${b.id}/duzelt`, govde({ tutar: 900, kdvOrani: 10 }))).durum, 422);
    assert.equal((await yaz(`/finans/belgeler/${b.id}/duzelt`, govde({ tutar: 900, aciklama: 'yeni açıklama' }))).durum, 200);
    assert.equal(await kisitAdi('UPDATE finans_belge SET tutar = 1 WHERE id = $1', [b.id]), 'finans_belge_kapali_kilit');
  });

  test('FNS-10 (K-1): Logo\'dan gelen ya da eşleşmiş belgenin parasal alanları elle değişmez; açıklaması değişir', async () => {
    const f = await firma();
    for (const ayar of ["kaynak = 'logo'", "logo_esleme = 'eslesti'"]) {
      const b = await belge(f);
      await vt().sorgu(`UPDATE finans_belge SET ${ayar} WHERE id = $1`, [b.id]);
      const g = await belgeOku(b.id);
      assert.equal((await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f), surum: g.surum, tutar: 999 })).durum, 422);
      assert.equal((await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f), surum: g.surum, aciklama: 'not' })).durum, 200);
    }
  });

  test('FNS-12: Logo kayıt numarası doluysa belge, ödeme ve çekte tekildir', async () => {
    const f = await firma();
    const a = await belge(f);
    const b = await belge(f);
    await vt().sorgu('UPDATE finans_belge SET logo_kayit_no = 501 WHERE id = $1', [a.id]);
    assert.equal(await kisitAdi('UPDATE finans_belge SET logo_kayit_no = 501 WHERE id = $1', [b.id]), 'finans_belge_logo_kayit_no_tekil');
    assert.equal(await kisitAdi('UPDATE finans_belge SET logo_kayit_no = 502 WHERE id = $1', [b.id]), null);
  });

  test('FNS-13, FNS-14 (D-1): belge iptali yalnız o belgenin dağıtımını kaldırır, tutar avansa döner; öteki belge kapalı kalır; silme yok', async () => {
    const f = await firma();
    const h = await hesap();
    const a = await belge(f, { tutar: 1000, kdvOrani: 0 });
    const b = await belge(f, { tutar: 1000, kdvOrani: 0 });
    const o = await odeme(f, h, 2000, [{ belgeId: a.id, belgeTutari: 1000 }, { belgeId: b.id, belgeTutari: 1000 }]);
    const ag = await belgeOku(a.id);
    tamam(await yaz(`/finans/belgeler/${a.id}/iptal`, { surum: ag.surum, neden: 'yanlış giriş' }));
    assert.equal((await yaz(`/finans/belgeler/${a.id}/iptal`, { surum: ag.surum + 5 })).durum, 409);
    assert.equal((await belgeOku(a.id)).durum, 'iptal');
    assert.equal((await belgeOku(b.id)).durum, 'kapandi');
    const og = tamam(await istek<{ satirlar: Odeme[] }>('yonetim', 'GET', '/finans/odemeler?sayfaBoyu=200')).satirlar.find((x) => x.id === o.id);
    assert.equal(og?.kalan, '1000.00');
    assert.equal(await hesapBakiyesi(h), '2000.00');
    assert.match(String(await kisitAdi('DELETE FROM finans_belge WHERE id = $1', [b.id])), /yalnız ekleme/);
  });

  test('FNS-21: ödeme iptali bütün dağıtımlarını kaldırır, belgeler açılır ve para hesaptan çıkar; ikinci iptal 422', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f);
    const o = await odeme(f, h, 1200, [{ belgeId: b.id, belgeTutari: 1200 }]);
    assert.equal((await belgeOku(b.id)).durum, 'kapandi');
    assert.equal((await yaz(`/finans/odemeler/${o.id}/iptal`, { surum: o.surum }, 'yazan')).durum, 403);
    tamam(await yaz(`/finans/odemeler/${o.id}/iptal`, { surum: o.surum }));
    assert.equal((await belgeOku(b.id)).durum, 'acik');
    assert.equal(await hesapBakiyesi(h), '0.00');
    assert.equal((await yaz(`/finans/odemeler/${o.id}/iptal`, { surum: o.surum + 1 })).durum, 422);
  });

  test('FNS-55, FNS-56 (K-12): mahsup aynı firmanın satış ve alışını parasız kapatır; aşan, başka firmaya ve iptal edilmiş belgeye mahsup reddedilir; iptal belgeyi açar', async () => {
    const f = await firma('ikisi');
    const f2 = await firma('ikisi');
    const h = await hesap();
    const s = await belge(f, { tutar: 500, kdvOrani: 0 });
    const a = await belge(f, { yon: 'gider', kategori: 'mal_alimi', tutar: 300, kdvOrani: 0 });
    const a2 = await belge(f2, { yon: 'gider', kategori: 'mal_alimi', tutar: 300, kdvOrani: 0 });
    assert.equal((await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 400, tarih: TARIH })).durum, 422);
    assert.equal((await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a2.id, satisTutari: 100, tarih: TARIH })).durum, 422);
    const m = tamam(await yaz<{ mahsup: { id: number; surum: number } }>('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 300, tarih: TARIH }, 'yazan')).mahsup;
    assert.equal((await belgeOku(a.id)).durum, 'kapandi');
    assert.equal((await belgeOku(s.id)).kalan, '200.00');
    assert.equal(await hesapBakiyesi(h), '0.00');
    assert.equal((await yaz(`/finans/mahsuplar/${m.id}/iptal`, { surum: m.surum }, 'yazan')).durum, 403);
    tamam(await yaz(`/finans/mahsuplar/${m.id}/iptal`, { surum: m.surum }));
    assert.equal((await belgeOku(a.id)).durum, 'acik');
    const sg = await belgeOku(s.id);
    tamam(await yaz(`/finans/belgeler/${s.id}/iptal`, { surum: sg.surum }));
    assert.equal((await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 100, tarih: TARIH })).durum, 422);
  });

  test('FNS-14 (K-12): belge iptali o belgenin mahsubunu da iptal eder, karşı belge yeniden açılır', async () => {
    const f = await firma('ikisi');
    const s = await belge(f, { tutar: 300, kdvOrani: 0 });
    const a = await belge(f, { yon: 'gider', kategori: 'mal_alimi', tutar: 300, kdvOrani: 0 });
    tamam(await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 300, tarih: TARIH }));
    const sg = await belgeOku(s.id);
    tamam(await yaz(`/finans/belgeler/${s.id}/iptal`, { surum: sg.surum }));
    assert.equal((await belgeOku(a.id)).durum, 'acik');
  });

  test('FNS-22, FNS-23, FNS-24: alınan çek belgeyi kapatır ama nakde çek tahsil olunca girer; yanlış geçiş ve yanlış hesap reddedilir', async () => {
    const f = await firma();
    const banka = await hesap('banka');
    const kasa = await hesap('kasa');
    const b = await belge(f);
    let c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b.id, belgeTutari: 1200 }] }, 'yazan')).cek;
    assert.equal((await belgeOku(b.id)).durum, 'kapandi');
    assert.equal(await hesapBakiyesi(banka), '0.00');
    assert.equal((await yaz(`/finans/cekler/${c.id}/odendi`, { surum: c.surum, hesapId: banka, tarih: TARIH })).durum, 422);
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/tahsile-ver`, { surum: c.surum }, 'yazan')).cek;
    assert.equal((await yaz(`/finans/cekler/${c.id}/tahsile-ver`, { surum: c.surum })).durum, 422);
    assert.equal((await yaz(`/finans/cekler/${c.id}/tahsil`, { surum: c.surum, hesapId: kasa, tarih: '2026-11-15' })).durum, 422);
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/tahsil`, { surum: c.surum, hesapId: banka, tarih: '2026-11-15' }, 'yazan')).cek;
    assert.equal(c.durum, 'tahsil');
    assert.equal(await hesapBakiyesi(banka), '1200.00');
    assert.equal((await yaz(`/finans/cekler/${c.id}/duzelt`, { surum: c.surum, vade: '2026-12-01' })).durum, 422);
    assert.equal(await kisitAdi('UPDATE finans_cek SET tutar = 1 WHERE id = $1', [c.id]), 'finans_cek_kilit');
  });

  test('FNS-25 (D-3): karşılıksız çek tahsilatı iptal eder, belge yeniden açılır; yalnız finans.yonet işaretler', async () => {
    const f = await firma();
    const b = await belge(f);
    const c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'senet', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b.id, belgeTutari: 1200 }] })).cek;
    assert.equal((await yaz(`/finans/cekler/${c.id}/karsiliksiz`, { surum: c.surum, tarih: '2026-11-16' }, 'yazan')).durum, 403);
    const k = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/karsiliksiz`, { surum: c.surum, tarih: '2026-11-16' })).cek;
    assert.deepEqual([k.durum, k.odemeId], ['karsiliksiz', null]);
    assert.equal((await belgeOku(b.id)).durum, 'acik');
    assert.equal((await yaz(`/finans/cekler/${c.id}/karsiliksiz`, { surum: k.surum, tarih: '2026-11-16' })).durum, 422);
  });

  test('FNS-26, FNS-54, FNS-27 (D-4, D-8): ciro ödeme doğurur ve tedarikçi faturasını kapatır; ikinci ciro ve müşteriye ciro reddedilir; geri alma ve karşılıksız ödemeleri iptal eder', async () => {
    const m = await firma('musteri');
    const t = await firma('tedarikci');
    const satis = await belge(m);
    const alis = await belge(t, { yon: 'gider', kategori: 'mal_alimi' });
    let c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: m, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: satis.id, belgeTutari: 1200 }] })).cek;
    assert.equal((await yaz(`/finans/cekler/${c.id}/ciro`, { surum: c.surum, firmaId: m, tarih: TARIH })).durum, 422);
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/ciro`, { surum: c.surum, firmaId: t, tarih: TARIH, dagitimlar: [{ belgeId: alis.id, belgeTutari: 1200 }] }, 'yazan')).cek;
    assert.equal(c.durum, 'ciro');
    assert.notEqual(c.ciroOdemeId, null);
    assert.equal((await belgeOku(alis.id)).durum, 'kapandi');
    assert.equal((await yaz(`/finans/cekler/${c.id}/ciro`, { surum: c.surum, firmaId: t, tarih: TARIH })).durum, 422);
    const ciroOdemeSayisi = async () => (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM finans_odeme WHERE cek_id = $1 AND yontem = 'ciro' AND iptal_zamani IS NULL", [c.id]))?.n;
    assert.equal(await ciroOdemeSayisi(), 1);
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/geri-al`, { surum: c.surum })).cek;
    assert.deepEqual([c.durum, c.ciroOdemeId], ['portfoy', null]);
    assert.equal((await belgeOku(alis.id)).durum, 'acik');
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/ciro`, { surum: c.surum, firmaId: t, tarih: TARIH, dagitimlar: [{ belgeId: alis.id, belgeTutari: 1200 }] })).cek;
    tamam(await yaz(`/finans/cekler/${c.id}/karsiliksiz`, { surum: c.surum, tarih: '2026-11-16' }));
    assert.equal((await belgeOku(alis.id)).durum, 'acik');
    assert.equal((await belgeOku(satis.id)).durum, 'acik');
    assert.equal(await ciroOdemeSayisi(), 0);
  });

  test('FNS-29, FNS-31, FNS-32, FNS-59: hesap bakiyesi hesap başına; eşitleme farkı yazar; bakiyeli ve hareketli hesap kuralları', async () => {
    const f = await firma();
    const h = await hesap('banka', 'TRY', 500);
    await belge(f, { yon: 'gider', kategori: 'mal_alimi', tutar: 100, kdvOrani: 0, pesin: { yontem: 'banka', hesapId: h, tarih: TARIH } });
    assert.equal(await hesapBakiyesi(h), '400.00');
    let hg = tamam(await istek<{ satirlar: { id: number; surum: number; bakiye: string }[] }>('yonetim', 'GET', '/finans/hesaplar?sayfaBoyu=200')).satirlar.find((x) => x.id === h);
    assert.equal(hg?.bakiye, '400.00');
    assert.equal((await yaz(`/finans/hesaplar/${h}/pasif`, { surum: hg?.surum })).durum, 422);
    assert.equal((await yaz(`/finans/hesaplar/${h}/guncelle`, { ad: 'Değişti', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 900, acilisTarihi: '2026-01-01', surum: hg?.surum })).durum, 422);
    assert.equal((await yaz(`/finans/hesaplar/${h}/guncelle`, { ad: 'Değişti', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 500, acilisTarihi: '2026-01-01', surum: hg?.surum })).durum, 200);
    tamam(await yaz(`/finans/hesaplar/${h}/esitle`, { tarih: TARIH, gercekBakiye: 0 }));
    assert.equal((await vt().tek<{ fark: string }>('SELECT fark FROM finans_bakiye_esitleme WHERE hesap_id = $1', [h]))?.fark, '-400.00');
    assert.match(String(await kisitAdi('UPDATE finans_bakiye_esitleme SET fark = 0 WHERE hesap_id = $1', [h])), /yalnız ekleme/);
    hg = tamam(await istek<{ satirlar: { id: number; surum: number; bakiye: string }[] }>('yonetim', 'GET', '/finans/hesaplar?sayfaBoyu=200')).satirlar.find((x) => x.id === h);
    tamam(await yaz(`/finans/hesaplar/${h}/pasif`, { surum: hg?.surum }));
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 10 })).durum, 422);
    assert.equal((await yaz('/finans/hesaplar/ekle', { ad: 'değişti', tur: 'kasa', acilisTarihi: TARIH })).durum, 409);
  });

  test('FNS-30: virman aynı para birimindeki iki ayrı hesap arasında; yazan açar, yönetici iptal eder', async () => {
    const a = await hesap('kasa', 'TRY', 100);
    const b = await hesap('banka');
    const e = await hesap('banka', 'EUR');
    const v = tamam(await yaz<{ virman: { id: number; surum: number } }>('/finans/virmanlar/ekle', { kaynakHesapId: a, hedefHesapId: b, tarih: TARIH, tutar: 60 }, 'yazan')).virman;
    assert.deepEqual([await hesapBakiyesi(a), await hesapBakiyesi(b)], ['40.00', '60.00']);
    assert.equal((await yaz('/finans/virmanlar/ekle', { kaynakHesapId: a, hedefHesapId: e, tarih: TARIH, tutar: 1 })).durum, 422);
    assert.equal((await yaz('/finans/virmanlar/ekle', { kaynakHesapId: a, hedefHesapId: a, tarih: TARIH, tutar: 1 })).durum, 422);
    assert.equal((await yaz(`/finans/virmanlar/${v.id}/iptal`, { surum: v.surum }, 'yazan')).durum, 403);
    tamam(await yaz(`/finans/virmanlar/${v.id}/iptal`, { surum: v.surum }));
    assert.equal(await hesapBakiyesi(a), '100.00');
  });

  test('S-01: aynı hesaba eşzamanlı eşitlemeler ve ödemeler bakiyeyi bozmaz', async () => {
    // Eşitleme kilidi beklerken başka işlem bakiyeyi değiştirir; fark bekleme öncesi bakiyeyle yazılırsa sonuç 800 olmaz.
    const k = await hesap('banka', 'TRY', 1000);
    let bekleyen: Promise<Cevap> | undefined;
    await vt().tx(async (d) => {
      await d.sorgu('SELECT 1 FROM finans_hesap WHERE id = $1 FOR UPDATE', [k]);
      bekleyen = yaz(`/finans/hesaplar/${k}/esitle`, { tarih: TARIH, gercekBakiye: 800 });
      for (let i = 0; i < 200 && Number((await vt().tek<{ n: string }>('SELECT count(*)::text AS n FROM pg_locks WHERE NOT granted'))?.n) === 0; i += 1) {
        await new Promise((r) => setTimeout(r, 10));
      }
      await d.sorgu('INSERT INTO finans_bakiye_esitleme (hesap_id, tarih, gercek_bakiye, fark, olusturan_id) VALUES ($1, $2, 1200, 200, $3)', [k, TARIH, yoneticiId]);
    });
    tamam(await (bekleyen as Promise<Cevap>));
    assert.equal(await hesapBakiyesi(k), '800.00');

    const h = await hesap('banka', 'TRY', 1000);
    const esitlemeler = await Promise.all(Array.from({ length: 10 }, () => yaz(`/finans/hesaplar/${h}/esitle`, { tarih: TARIH, gercekBakiye: 800 })));
    for (const c of esitlemeler) tamam(c);
    assert.equal(await hesapBakiyesi(h), '800.00');
    const f = await firma();
    const karisik = await Promise.all([
      ...Array.from({ length: 4 }, () => yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 50 })),
      yaz(`/finans/hesaplar/${h}/esitle`, { tarih: TARIH, gercekBakiye: 500 }),
    ]);
    for (const c of karisik) tamam(c);
    // Eşitlemeden önce yazılan ödeme eşitlemeye girer, sonra yazılan üstüne eklenir: sonuç 500 + 50 x (sonra yazılanlar).
    assert.ok(['500.00', '550.00', '600.00', '650.00', '700.00'].includes(await hesapBakiyesi(h)));
  });

  test('FNS-57 (K-10): günlük kur yönetici tarafından girilir; aynı gün ikinci kez 409, TRY kuru 400, eski sürüm 409', async () => {
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: TARIH, kur: 36.25 }));
    assert.equal((await yaz('/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: TARIH, kur: 36.3 })).durum, 409);
    assert.equal((await yaz('/finans/kurlar/ekle', { paraBirimi: 'TRY', tarih: TARIH, kur: 1 })).durum, 400);
    assert.equal((await yaz('/finans/kurlar/ekle', { paraBirimi: 'USD', tarih: TARIH, kur: 33 }, 'yazan')).durum, 403);
    tamam(await yaz('/finans/kurlar/guncelle', { paraBirimi: 'EUR', tarih: TARIH, kur: 36.3, surum: 1 }));
    assert.equal((await yaz('/finans/kurlar/guncelle', { paraBirimi: 'EUR', tarih: TARIH, kur: 36.4, surum: 1 })).durum, 409);
  });

  test('kur ve faiz özeti: bugüne kadar son kur ve faiz, son yazan ve zamanıyla; düzeltme son yazanı değiştirir; finans.oku ister', async () => {
    const bugun = tesisGunu(new Date());
    await girisliKisi('duzelten', ['finans.kur-yaz']);
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'GBP', tarih: bugun, kur: 50 }));
    type Ozet = {
      bugun: string; kurlar: { paraBirimi: string; kur: string; girenAd: string | null; giris: string; surum: number }[]; faizler: { paraBirimi: string; girenAd: string | null }[];
      sonGiris: { tur: string; girenAd: string | null } | null; gecmis: { tur: string; paraBirimi: string; deger: string; tarih: string; duzeltme: boolean; girenAd: string | null }[];
    };
    const oku = async (kim = 'okuyan') => tamam(await istek<Ozet>(kim, 'GET', '/finans/kur-ozeti'));
    let o = await oku();
    assert.equal(o.bugun, bugun);
    const gbp = () => o.kurlar.find((k) => k.paraBirimi === 'GBP');
    assert.equal(Number(gbp()?.kur), 50);
    assert.equal(gbp()?.girenAd, 'Deneme yonetim');
    assert.ok(gbp()?.giris);
    assert.deepEqual(o.sonGiris && { tur: o.sonGiris.tur, ad: o.sonGiris.girenAd }, { tur: 'kur', ad: 'Deneme yonetim' });
    tamam(await yaz('/finans/kurlar/guncelle', { paraBirimi: 'GBP', tarih: bugun, kur: 51, surum: 1 }, 'duzelten'));
    o = await oku();
    assert.equal(Number(gbp()?.kur), 51);
    assert.equal(gbp()?.girenAd, 'Deneme duzelten');
    assert.equal(gbp()?.surum, 2, 'şerit aynı günün kurunu sürümüyle düzeltir (939)');
    tamam(await yaz('/finans/faizler/ekle', { paraBirimi: 'GBP', gecerlilikBaslangic: bugun, aylikYuzde: 1 }));
    o = await oku();
    assert.equal(o.faizler.find((f) => f.paraBirimi === 'GBP')?.girenAd, 'Deneme yonetim');
    assert.equal(o.sonGiris?.tur, 'faiz');
    // 939: son girişler en yeni başta; düzeltilen kur düzeltme olarak, düzeltenin adıyla.
    assert.ok(o.gecmis.length <= 8);
    assert.deepEqual(o.gecmis.slice(0, 2).map((g) => [g.tur, g.paraBirimi, Number(g.deger), g.tarih, g.duzeltme, g.girenAd]), [
      ['faiz', 'GBP', 1, bugun, false, 'Deneme yonetim'],
      ['kur', 'GBP', 51, bugun, true, 'Deneme duzelten'],
    ]);
    // 952 a: şerit her sayfadadır; finans işlemi olmayan kişi de okur (yalnız kur, faiz ve giren kişi).
    assert.equal((await istek('firmaci', 'GET', '/finans/kur-ozeti')).durum, 200);
    assert.equal((await istek('firmaci', 'GET', '/finans/kurlar')).durum, 403);
    // finans.kur-yaz yalnız kur ve faiz açar (satın alma, kart #953): rakam okumaz, belge yazmaz, finans.yonet ucuna giremez.
    assert.equal((await istek('duzelten', 'GET', '/finans/kur-ozeti')).durum, 200);
    assert.equal((await istek('duzelten', 'GET', '/finans/belgeler')).durum, 403);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(null), 'duzelten')).durum, 403);
    assert.equal((await yaz('/finans/kdv-oranlari/ekle', { oran: 7, gecerlilikBaslangic: bugun }, 'duzelten')).durum, 403);
    assert.equal((await yaz('/finans/kurlar/ekle', { paraBirimi: 'CAD', tarih: bugun, kur: 30 }, 'yazan')).durum, 403);
  });

  test('faiz: tarihli girilir, yeni oran başlangıcından sonrasını etkiler; aynı güne ikinci giriş sonrakini geçerli kılar; eski oranlar silinmez ve değişmez', async () => {
    tamam(await yaz('/finans/faizler/ekle', { paraBirimi: 'try', gecerlilikBaslangic: '2026-09-01', aylikYuzde: 3.5 }));
    tamam(await yaz('/finans/faizler/ekle', { paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-05', aylikYuzde: 4 }));
    tamam(await yaz('/finans/faizler/ekle', { paraBirimi: 'TRY', gecerlilikBaslangic: '2026-10-05', aylikYuzde: 4.25 }));
    assert.equal((await yaz('/finans/faizler/ekle', { paraBirimi: 'TRY', gecerlilikBaslangic: TARIH, aylikYuzde: 101 })).durum, 400);
    assert.equal((await yaz('/finans/faizler/ekle', { paraBirimi: 'TRY', gecerlilikBaslangic: TARIH, aylikYuzde: 1 }, 'yazan')).durum, 403);
    assert.deepEqual(await faizGetir(vt(), 'TRY', '2026-10-04'), { aylikYuzde: '3.5000', gecerlilikBaslangic: '2026-09-01' });
    assert.deepEqual(await faizGetir(vt(), 'TRY', '2026-10-05'), { aylikYuzde: '4.2500', gecerlilikBaslangic: '2026-10-05' });
    assert.equal(await faizGetir(vt(), 'TRY', '2026-08-31'), null);
    const l = tamam(await istek<{ satirlar: { paraBirimi: string; aylikYuzde: string }[] }>('okuyan', 'GET', '/finans/faizler?sayfaBoyu=200'));
    assert.deepEqual(l.satirlar.filter((f) => f.paraBirimi === 'TRY').map((f) => f.aylikYuzde), ['3.5000', '4.0000', '4.2500']);
    assert.match(String(await kisitAdi("UPDATE finans_faiz SET aylik_yuzde = 1 WHERE para_birimi = 'TRY'", [])), /yalnız ekleme/);
    assert.match(String(await kisitAdi("DELETE FROM finans_faiz WHERE para_birimi = 'TRY'", [])), /yalnız ekleme/);
  });

  test('sabit kıymet: yönetim amaçlı amortisman normal, azalan ve devirli hesaplanır; dövizli bedel alış günü kuruyla; pasif deftere yazılır; kâr ve gelir tablosu amortismanı düşer', async () => {
    const buAy = tesisGunu(new Date()).slice(0, 7);
    const ay = (n: number): string => { const t = Number(buAy.slice(0, 4)) * 12 + Number(buAy.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
    const ekle = (g: Record<string, unknown>, kim = 'yonetim') => yaz<{ sabitKiymet: SabitKiymetSatiri }>('/finans/sabit-kiymetler/ekle', { ad: 'Deneme Tezgah', ...g }, kim);
    const ozetKar = async (): Promise<number> => Number(tamam(await istek<FinansOzetiCevabi>('okuyan', 'GET', '/finans/ozet')).aylikKarTl);
    const karOnce = await ozetKar();

    // 312 b: kod istasyonlardaki makineye karşılık geliyorsa makine_id yabancı anahtarla yazılır; karşılığı olmayan kodda boş kalır.
    const makine = await vt().tek<{ id: number }>("INSERT INTO makine (kod, ad) VALUES ('CNC-01', 'Deneme Tezgah') RETURNING id", []);
    const makineIdsi = async (id: number) => (await vt().tek<{ m: number | null }>('SELECT makine_id AS m FROM finans_sabit_kiymet WHERE id = $1', [id]))?.m;
    const normal = tamam(await ekle({ makineKodu: 'cnc-01', bedel: 120000, alisTarihi: `${ay(-24)}-15`, omurAy: 120 })).sabitKiymet;
    assert.deepEqual([normal.makineKodu, normal.kur, normal.buAyTl, normal.birikmisTl, normal.netTl], ['CNC-01', '1.000000', '1000.00', '25000.00', '95000.00']);
    assert.equal(await makineIdsi(normal.id), makine?.id);
    assert.equal(await makineIdsi(tamam(await ekle({ makineKodu: 'YOK-02', bedel: 1000, alisTarihi: TARIH, omurAy: 10 })).sabitKiymet.id), null);
    assert.equal(await kisitAdi('UPDATE finans_sabit_kiymet SET makine_id = 999999 WHERE id = $1', [normal.id]), 'finans_sabit_kiymet_makine');
    assert.ok(Math.abs((await ozetKar()) - (karOnce - 1000)) < 0.01);
    assert.equal(await makineAmortismani(vt(), 'CNC-01', buAy), '1000.00');
    assert.equal(await makineAmortismani(vt(), 'YOK-01', buAy), null);

    const azalan = tamam(await ekle({ bedel: 60000, alisTarihi: `${buAy}-01`, omurAy: 60, yontem: 'azalan' })).sabitKiymet;
    assert.equal(azalan.buAyTl, '2000.00');

    const devirli = tamam(await ekle({ bedel: 100000, alisTarihi: `${ay(-50)}-01`, omurAy: 100, devirTarihi: `${ay(-2)}-28`, devirBirikmisTl: 60000 })).sabitKiymet;
    assert.ok(Math.abs(Number(devirli.buAyTl) - 40000 / 51) < 0.02, devirli.buAyTl);
    assert.ok(Math.abs(Number(devirli.birikmisTl) - (60000 + 2 * 40000 / 51)) < 0.03, devirli.birikmisTl);

    // Dövizli bedel: kur verilmezse alış gününe kadar girilmiş son kur alınır ve kayıtta kalır; sonra girilen kur değiştirmez.
    assert.equal(alan(await ekle({ paraBirimi: 'CHF', bedel: 1000, alisTarihi: '2026-03-10', omurAy: 10 })), 'kur');
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'CHF', tarih: '2026-03-01', kur: 40 }));
    const dovizli = tamam(await ekle({ paraBirimi: 'CHF', bedel: 1000, alisTarihi: '2026-03-10', omurAy: 10 })).sabitKiymet;
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'CHF', tarih: '2026-03-05', kur: 45 }));
    assert.deepEqual([dovizli.kur, dovizli.bedelTl], ['40.000000', '40000.00']);

    assert.equal((await ekle({ bedel: 1000, alisTarihi: TARIH, omurAy: 10 }, 'yazan')).durum, 403);
    assert.equal(alan(await ekle({ bedel: 1000, alisTarihi: TARIH, omurAy: 10, devirTarihi: TARIH })), 'devirBirikmisTl');
    assert.equal(alan(await ekle({ bedel: 1000, alisTarihi: TARIH, omurAy: 10, kalintiDegeri: 1000 })), 'kalintiDegeri');
    assert.equal(alan(await ekle({ bedel: 1000, alisTarihi: TARIH, omurAy: 10, devirTarihi: TARIH, devirBirikmisTl: 1001 })), 'devirBirikmisTl');
    assert.equal((await ekle({ bedel: 1000, alisTarihi: TARIH, omurAy: 601 })).durum, 400);

    const yol = `/finans/sabit-kiymetler/${normal.id}/pasif`;
    const pasif = tamam(await yaz<{ sabitKiymet: SabitKiymetSatiri }>(yol, { pasifTarihi: `${ay(-1)}-10`, surum: normal.surum })).sabitKiymet;
    assert.deepEqual([pasif.pasifTarihi, pasif.buAyTl, pasif.birikmisTl], [`${ay(-1)}-10`, '0.00', '24000.00']);
    assert.deepEqual(satirBul(await sonEk('/finans/sabit-kiymetler/:id/pasif'), `sabit-kiymet:${normal.id}`, 'pasifTarihi'), { kayit: `sabit-kiymet:${normal.id}`, alan: 'pasifTarihi', onceki: null, yeni: `${ay(-1)}-10` });
    assert.equal((await yaz(yol, { pasifTarihi: `${ay(-1)}-10`, surum: pasif.surum })).durum, 422);
    assert.equal((await yaz(yol, { pasifTarihi: `${ay(-1)}-10`, surum: normal.surum })).durum, 409);

    const liste = tamam(await istek<{ satirlar: SabitKiymetSatiri[] }>('okuyan', 'GET', '/finans/sabit-kiymetler?sayfaBoyu=200'));
    assert.deepEqual(liste.satirlar.filter((k) => [normal.id, azalan.id, devirli.id, dovizli.id].includes(k.id)).map((k) => k.id), [normal.id, azalan.id, devirli.id, dovizli.id]);
    const aylar = tamam(await istek<{ aylar: { ay: string; tutarTl: string }[] }>('okuyan', 'GET', '/finans/amortisman')).aylar;
    assert.equal(aylar.length, 24);
    assert.equal(aylar.at(-1)?.ay, buAy);
    assert.equal((await istek('firmaci', 'GET', '/finans/sabit-kiymetler')).durum, 403);
  });

  test('FNS-35 (D-6): bütçe dönemlidir; yeni dönem eski dönemi değiştirmez; ay başı olmayan tarih 400', async () => {
    tamam(await yaz('/finans/butce/belirle', { kategori: 'kira', baslangicAyi: '2026-09-01', aylikTutar: 50000 }));
    tamam(await yaz('/finans/butce/belirle', { kategori: 'kira', baslangicAyi: '2026-10-01', aylikTutar: 55000 }));
    const satirlar = await vt().sorgu<{ b: string; t: string }>("SELECT baslangic_ayi::text AS b, aylik_tutar::text AS t FROM finans_butce WHERE kategori = 'kira' ORDER BY 1");
    assert.deepEqual(satirlar, [{ b: '2026-09-01', t: '50000.00' }, { b: '2026-10-01', t: '55000.00' }]);
    assert.equal((await yaz('/finans/butce/belirle', { kategori: 'kira', baslangicAyi: '2026-10-15', aylikTutar: 1 })).durum, 400);
  });

  test('FNS-33: düzenli ödeme ödendi yapılınca kapanmış belge ve hesaptan ödeme açılır; firmasız faturalı düzenli ödeme 400', async () => {
    const h = await hesap('banka', 'TRY', 1000);
    const d = tamam(await yaz<{ duzenli: { id: number } }>('/finans/duzenli-odemeler/ekle', { ad: 'Maaşlar', kategori: 'personel', tutar: 300, ayinGunu: 5 })).duzenli;
    const b = tamam(await yaz<{ belge: Belge }>(`/finans/duzenli-odemeler/${d.id}/odendi`, { tarih: TARIH, hesapId: h, yontem: 'banka' }, 'yazan')).belge;
    assert.deepEqual([b.durum, b.tur, b.duzenliOdemeId], ['kapandi', 'faturasiz', d.id]);
    assert.equal(await hesapBakiyesi(h), '700.00');
    const kira = tamam(await yaz<{ duzenli: { id: number } }>('/finans/duzenli-odemeler/ekle', { ad: 'Kira', kategori: 'kira', tutar: 120, kdvOrani: 20, ayinGunu: 1 })).duzenli;
    assert.equal((await yaz(`/finans/duzenli-odemeler/${kira.id}/odendi`, { tarih: TARIH, hesapId: h, yontem: 'banka' })).durum, 400);
  });

  test('S-10: düzenli ödeme bir ayda bir kez ödenir; eşzamanlı ikinci "ödendi" ve dizin reddeder, iptal ayı boşaltır', async () => {
    const h = await hesap('banka', 'TRY', 5000);
    const d = tamam(await yaz<{ duzenli: { id: number } }>('/finans/duzenli-odemeler/ekle', { ad: 'Kira', kategori: 'personel', tutar: 100, ayinGunu: 1 })).duzenli;
    const ode = (tarih: string) => yaz<{ belge: Belge }>(`/finans/duzenli-odemeler/${d.id}/odendi`, { tarih, hesapId: h, yontem: 'banka' });
    const ikisi = await Promise.all([ode(TARIH), ode('2026-10-20')]);
    assert.deepEqual(ikisi.map((c) => c.durum).sort(), [200, 409]);
    assert.equal(await hesapBakiyesi(h), '4900.00');
    tamam(await ode('2026-11-01'));
    const ilk = ikisi.find((c) => c.durum === 200)?.govde.belge;
    assert.ok(ilk);
    assert.match(String(await kisitAdi(`INSERT INTO finans_belge (yon, tur, kategori, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, duzenli_odeme_id, olusturan_id)
      VALUES ('gider', 'faturasiz', 'personel', '2026-10-31', '2026-10-31', 'TRY', 1, 1, 0, $1, $2)`, [d.id, yoneticiId])), /finans_belge_duzenli_donem/);
    const odeme = await vt().tek<{ id: number; surum: number }>(
      'SELECT o.id, o.surum FROM finans_odeme o JOIN finans_odeme_dagilimi g ON g.odeme_id = o.id WHERE g.belge_id = $1', [ilk.id]);
    tamam(await yaz(`/finans/odemeler/${odeme?.id}/iptal`, { surum: odeme?.surum, neden: 'yanlış giriş' }));
    const belgeSurumu = (await vt().tek<{ surum: number }>('SELECT surum FROM finans_belge WHERE id = $1', [ilk.id]))?.surum;
    tamam(await yaz(`/finans/belgeler/${ilk.id}/iptal`, { surum: belgeSurumu, neden: 'yanlış giriş' }));
    tamam(await ode('2026-10-05'));
  });

  test('FNS-41, FNS-50: toplu aktarım tek işlemdir; eşleşmeyen firma tümünü reddeder; denetime gövde yerine özet girer; sınır 1000', async () => {
    const f = await firma('musteri');
    const fk = tamam(await istek<{ firma: { ad: string } }>('yonetim', 'GET', `/musteri-tedarikci/firmalar/${f}`)).firma;
    const satir = (firma: string) => ({ belgeTarihi: TARIH, yon: 'gelir', kategori: 'urun_satisi', firma, tutar: 100, kdvOrani: 20, vade: '2026-11-01' });
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n ?? 0;
    const red = await yaz('/finans/toplu-ice-aktar', { satirlar: [satir(fk.ad), satir('Olmayan Firma')] });
    assert.equal(red.durum, 400);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_belge'))?.n, once);
    assert.equal((await yaz('/finans/toplu-ice-aktar', { satirlar: [satir(fk.ad)] }, 'yazan')).durum, 403);
    const ok = tamam(await yaz<{ eklenen: number }>('/finans/toplu-ice-aktar', { satirlar: [satir(fk.ad), satir(` ${fk.ad.toUpperCase()} `)] }));
    assert.equal(ok.eklenen, 2);
    const denetim = await vt().sorgu<{ govde: Record<string, unknown> | null }>("SELECT govde FROM denetim_kaydi WHERE yol = '/finans/toplu-ice-aktar'");
    assert.ok(denetim.length > 0);
    assert.ok(denetim.every((d) => d.govde !== null && '_ozet' in d.govde && !('satirlar' in d.govde)), JSON.stringify(denetim));
    assert.equal((await yaz('/finans/toplu-ice-aktar', { satirlar: Array.from({ length: 1001 }, () => satir(fk.ad)) })).durum, 400);
  });

  test('ayar, öneri, kapanış ve skor: kendi işlemini ister; sürüm ve aralık sunucuda denetlenir', async () => {
    const a = tamam(await istek<{ ayar: Record<string, unknown> & { surum: number } }>('okuyan', 'GET', '/finans/ayar')).ayar;
    const govde = { ...a, nakitEsigi: 250000, beklenenAylikSatis: null, cekKarsiliksizOlasiligi: 3, anomaliEsigi: 3.5, bilancoDonen: null, bilancoStok: null, bilancoKvb: null, bilancoToplamBorc: null, bilancoOzkaynak: null, bilancoBirikmisKar: null };
    tamam(await yaz('/finans/ayar/guncelle', govde));
    assert.equal((await yaz('/finans/ayar/guncelle', govde)).durum, 409);
    tamam(await yaz('/finans/oneriler/durum', { bulguKimligi: 'cash-neg', durum: 'ertelendi', erteleBitis: '2026-10-08' }, 'yazan'));
    assert.equal((await yaz('/finans/oneriler/durum', { bulguKimligi: 'cash-neg', durum: 'ertelendi' }, 'yazan')).durum, 400);
    assert.equal((await yaz('/finans/oneriler/durum', { bulguKimligi: 'x', durum: 'kapatildi' }, 'okuyan')).durum, 403);
    tamam(await yaz('/finans/kapanis/isaretle', { donem: '2026-09', madde: 'banka', isaretli: true }, 'yazan'));
    assert.equal((await yaz('/finans/kapanis/isaretle', { donem: '2026-13', madde: 'banka', isaretli: true }, 'yazan')).durum, 400);
    tamam(await yaz('/finans/skorlar/kaydet', { gun: TARIH, skor: 71, nakit: 100.5 }, 'yazan'));
    assert.equal((await yaz('/finans/skorlar/kaydet', { gun: TARIH, skor: 101 }, 'yazan')).durum, 400);
  });

  test('FNS-38, FNS-40: açan kişi ve zaman sunucudan; aynı istek kimliğiyle yinelenen belge ikinci kez açılmaz', async () => {
    const f = await firma();
    const kimlik = randomUUID();
    const govde = { ...belgeGovdesi(f), olusturanId: 1, olusturma: '2000-01-01T00:00:00Z', durum: 'kapandi', kaynak: 'logo' };
    const gonder = () => app.inject({ method: 'POST', url: '/api/finans/belgeler/ekle', headers: { cookie: cerez.get('yazan') ?? '', [ISTEK_KIMLIGI_BASLIGI]: kimlik }, payload: govde });
    const a = await gonder();
    const b = await gonder();
    assert.equal(a.statusCode, 200);
    assert.equal(b.json().belge.id, a.json().belge.id);
    const s = await vt().tek<{ durum: string; kaynak: string; yeni: boolean; n: number }>(
      "SELECT durum, kaynak, olusturma > now() - interval '1 minute' AS yeni, (SELECT count(*)::int FROM finans_belge WHERE aciklama IS NULL AND firma_id = $2) AS n FROM finans_belge WHERE id = $1", [a.json().belge.id, f]);
    assert.deepEqual(s, { durum: 'acik', kaynak: 'elle', yeni: true, n: 1 });
  });
  test('FNS-40: aynı istek kimliğiyle yinelenen faiz ve düzenli ödeme eklemesi ikinci satır açmaz; kimliksiz ekleme reddedilir', async () => {
    const gonder = (yol: string, govde: object, kimlik?: string) => app.inject({
      method: 'POST', url: `/api${yol}`, payload: govde,
      headers: { cookie: cerez.get('yonetim') ?? '', ...(kimlik === undefined ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }) },
    });
    const faiz = { paraBirimi: 'CHF', gecerlilikBaslangic: '2026-07-01', aylikYuzde: 2 };
    const faizKimligi = randomUUID();
    assert.equal((await gonder('/finans/faizler/ekle', faiz, faizKimligi)).statusCode, 200);
    assert.equal((await gonder('/finans/faizler/ekle', faiz, faizKimligi)).statusCode, 200);
    assert.equal((await gonder('/finans/faizler/ekle', faiz)).statusCode, 400);
    const faizSayisi = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM finans_faiz WHERE para_birimi = 'CHF'");
    assert.equal(faizSayisi?.n, 1);

    const duzenli = { ad: 'Yinelenen Abonelik', kategori: 'personel', tutar: 40, ayinGunu: 3 };
    const duzenliKimligi = randomUUID();
    const a = await gonder('/finans/duzenli-odemeler/ekle', duzenli, duzenliKimligi);
    const b = await gonder('/finans/duzenli-odemeler/ekle', duzenli, duzenliKimligi);
    assert.equal(a.statusCode, 200);
    assert.equal(b.json().duzenli.id, a.json().duzenli.id);
    assert.equal((await gonder('/finans/duzenli-odemeler/ekle', duzenli)).statusCode, 400);
    const duzenliSayisi = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM finans_duzenli_odeme WHERE ad = 'Yinelenen Abonelik'");
    assert.equal(duzenliSayisi?.n, 1);
  });
  test('FNS-3, FNS-34, FNS-37: belge no en çok 16; açılış belgesinde geçmiş vade serbest, faturada değil; olmayan firma reddedilir', async () => {
    const f = await firma();
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { belgeNo: 'A'.repeat(16) }))).durum, 200);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { belgeNo: 'A'.repeat(17) }))).durum, 400);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { tur: 'acilis', belgeTarihi: '2026-10-01', vade: '2026-08-01' }))).durum, 200);
    assert.equal((await yaz('/finans/belgeler/ekle', belgeGovdesi(f, { belgeTarihi: '2026-10-01', vade: '2026-08-01' }))).durum, 422);
    const yok = await yaz('/finans/belgeler/ekle', belgeGovdesi(999999));
    assert.equal(yok.durum, 400);
    assert.equal(alan(yok), 'firmaId');
  });

  test('FNS-56: farklı para birimli mahsupta alış tutarı zorunludur; verilince iki taraf kendi biriminde kapanır', async () => {
    const f = await firma('ikisi');
    const s = await belge(f, { tutar: 100, kdvOrani: 0, paraBirimi: 'EUR', kur: 35 });
    const a = await belge(f, { yon: 'gider', kategori: 'mal_alimi', tutar: 3500, kdvOrani: 0 });
    assert.equal((await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 100, tarih: TARIH })).durum, 400);
    tamam(await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 100, alisTutari: 3500, tarih: TARIH }));
    assert.deepEqual([(await belgeOku(s.id)).durum, (await belgeOku(a.id)).durum], ['kapandi', 'kapandi']);
  });
  test('FNS-60: açık faturası, avansı ya da çeki olan firma pasife alınamaz (uyarı nedenini yazar); hepsi kapanınca alınır', async () => {
    const f = await firma('ikisi');
    const h = await hesap();
    const durum = async () => tamam(await istek<{ firma: { surum: number; aktif: boolean } }>('yonetim', 'GET', `/musteri-tedarikci/firmalar/${f}`)).firma;
    const b = await belge(f, { tutar: 1000, kdvOrani: 0 });
    let fk = await durum();
    const r1 = await yaz<{ mesaj: string }>(`/finans/firmalar/${f}/pasif`, { surum: fk.surum });
    assert.equal(r1.durum, 422);
    assert.match(r1.govde.mesaj, /1 açık fatura \(1\.000,00 TL\)/);
    const r2 = await yaz<{ mesaj: string }>(`/finans/firmalar/${f}/pasif`, { surum: fk.surum }, 'firmaci');
    assert.equal(r2.durum, 422);
    assert.doesNotMatch(r2.govde.mesaj, /TL/);
    assert.equal((await durum()).aktif, true);
    await odeme(f, h, 1500, [{ belgeId: b.id, belgeTutari: 1000 }]);
    fk = await durum();
    assert.match((await yaz<{ mesaj: string }>(`/finans/firmalar/${f}/pasif`, { surum: fk.surum })).govde.mesaj, /dağıtılmamış ödeme/);
    const s2 = await belge(f, { tutar: 500, kdvOrani: 0 });
    const o = tamam(await istek<{ satirlar: Odeme[] }>('yonetim', 'GET', '/finans/odemeler?sayfaBoyu=200')).satirlar.filter((x) => x.firmaId === f && !x.iptal).at(-1) as Odeme;
    tamam(await yaz(`/finans/odemeler/${o.id}/dagit`, { tarih: TARIH, dagitimlar: [{ belgeId: s2.id, belgeTutari: 500 }] }));
    const c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'verilen', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-12-01', tutar: 300 })).cek;
    fk = await durum();
    assert.match((await yaz<{ mesaj: string }>(`/finans/firmalar/${f}/pasif`, { surum: fk.surum })).govde.mesaj, /sonuçlanmamış çek/);
    tamam(await yaz(`/finans/cekler/${c.id}/iptal`, { surum: c.surum }));
    fk = await durum();
    const son = tamam(await yaz<{ firma: { aktif: boolean } }>(`/finans/firmalar/${f}/pasif`, { surum: fk.surum }));
    assert.equal(son.firma.aktif, false);
  });

  // ---- Denetim bulguları (denetim/DURUM.md, main 21c2b9a): B-003, B-004, B-008, B-009, B-012 ----

  test('B-003: düzenli ödemede KDV dahil tutar tam kuruşla ayrılır; tek oranla oluşamayan toplam 400 ve hiçbir şey yazılmaz', async () => {
    const t = await firma('tedarikci');
    const h = await hesap('banka', 'TRY', 1000);
    const yeni = async (tutar: number) => tamam(await yaz<{ duzenli: { id: number } }>('/finans/duzenli-odemeler/ekle', { ad: 'Kira', kategori: 'kira', firmaId: t, tutar, kdvOrani: 20, ayinGunu: 1 })).duzenli.id;
    const tamKurus = await yeni(119.99);
    const b = tamam(await yaz<{ belge: Belge }>(`/finans/duzenli-odemeler/${tamKurus}/odendi`, { tarih: TARIH, hesapId: h, yontem: 'banka' })).belge;
    assert.deepEqual([b.toplam, b.durum], ['119.99', 'kapandi']);
    assert.equal(await hesapBakiyesi(h), '880.01');
    // %20 KDV ile 0,15 toplamı veren net tutar yoktur (0,12 + 0,02 = 0,14; 0,13 + 0,03 = 0,16).
    const olmaz = await yeni(0.15);
    const r = await yaz(`/finans/duzenli-odemeler/${olmaz}/odendi`, { tarih: TARIH, hesapId: h, yontem: 'banka' });
    assert.deepEqual([r.durum, alan(r)], [400, 'tutar']);
    assert.equal(await hesapBakiyesi(h), '880.01');
  });

  test('B-004: ödeme iptali açıklamayı korur, nedeni iptal nedenine yazar; karşılıksız çek ve çek iptali de nedenini yazar', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f);
    const o = await odeme(f, h, 1200, [{ belgeId: b.id, belgeTutari: 1200 }], { aciklama: 'Havale açıklaması' });
    tamam(await yaz(`/finans/odemeler/${o.id}/iptal`, { surum: o.surum, neden: 'Yanlış hesaba girildi' }));
    const cekOdemesi = async (cekId: number): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM finans_odeme WHERE cek_id = $1', [cekId]))?.id ?? 0;
    const satir = async (id: number) => vt().tek<{ aciklama: string | null; iptal_nedeni: string | null }>('SELECT aciklama, iptal_nedeni FROM finans_odeme WHERE id = $1', [id]);
    assert.deepEqual(await satir(o.id), { aciklama: 'Havale açıklaması', iptal_nedeni: 'Yanlış hesaba girildi' });
    const b2 = await belge(f);
    const c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b2.id, belgeTutari: 1200 }] })).cek;
    tamam(await yaz(`/finans/cekler/${c.id}/karsiliksiz`, { surum: c.surum, tarih: '2026-11-16' }));
    assert.deepEqual(await satir(await cekOdemesi(c.id)), { aciklama: null, iptal_nedeni: 'Karşılıksız çek' });
    const b3 = await belge(f);
    const c3 = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'senet', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b3.id, belgeTutari: 1200 }] })).cek;
    const o3 = await cekOdemesi(c3.id);
    tamam(await yaz(`/finans/cekler/${c3.id}/iptal`, { surum: c3.surum }));
    assert.deepEqual(await satir(o3), { aciklama: null, iptal_nedeni: 'Çek iptal' });
  });

  test('B-008 (FK1): çapraz kur günün kurundan en çok ayardaki pay (varsayılan %20) kadar sapar; 1000 EUR belge 0,01 TL ile kapanmaz; veritabanı da tutar ve sınırı denetler', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f, { tutar: 1000, kdvOrani: 0, paraBirimi: 'EUR', kur: 35 });
    const dene = (caprazKur: number, tutar: number) => yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar, dagitimlar: [{ belgeId: b.id, belgeTutari: 1000, caprazKur }] });
    const kucuk = await dene(0.00001, 0.01);
    assert.deepEqual([kucuk.durum, alan(kucuk)], [400, 'dagitimlar']);
    // TARIH için girilmiş günün kuru 36,30 (FNS-57 testi); ileti girilen kuru, referansı ve aralığı söyler.
    const buyuk = await dene(50, 50000);
    assert.equal(buyuk.durum, 400);
    const ileti = String((buyuk.govde as { mesaj?: unknown }).mesaj);
    for (const parca of ['50,0000', '36,3000', '29,0400', '43,5600', '±%20']) assert.ok(ileti.includes(parca), `${parca} iletide yok: ${ileti}`);
    assert.equal((await belgeOku(b.id)).durum, 'acik');
    // O gün için kur girilmemişse referans belgenin kendi kurudur (35): 2026-10-03'te 44 reddedilir.
    assert.equal((await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: '2026-10-03', yontem: 'banka', hesapId: h, tutar: 44000, dagitimlar: [{ belgeId: b.id, belgeTutari: 1000, caprazKur: 44 }] })).durum, 400);
    // Ödeme günü için kur girilince referans odur: 2026-10-02 için 45 girilince 44 kabul edilir.
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'EUR', tarih: '2026-10-02', kur: 45 }));
    tamam(await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: '2026-10-02', yontem: 'banka', hesapId: h, tutar: 44000, dagitimlar: [{ belgeId: b.id, belgeTutari: 1000, caprazKur: 44 }] }));
    assert.equal((await belgeOku(b.id)).durum, 'kapandi');
    const b2 = await belge(f, { tutar: 1000, kdvOrani: 0, paraBirimi: 'EUR', kur: 35 });
    const o = await odeme(f, h, 100);
    const ekle = (odemeTutari: string, capraz: string) => kisitAdi(
      'INSERT INTO finans_odeme_dagilimi (odeme_id, belge_id, belge_tutari, odeme_tutari, capraz_kur, tarih, olusturan_id) VALUES ($1, $2, 1, $3, $4, $5, $6)',
      [o.id, b2.id, odemeTutari, capraz, TARIH, yoneticiId]);
    assert.equal(await ekle('0.01', '0.01'), 'finans_dagilim_capraz_kur_sinir');
    assert.equal(await ekle('0.01', '35'), 'finans_dagilim_capraz_tutar');
    assert.equal(await ekle('35.00', '35'), null);
    // Pay finans ayarındadır (FK1): %50'ye çıkınca 50 kabul edilir; sunucu ve veritabanı aynı ayarı okur.
    await vt().sorgu('UPDATE finans_ayar SET capraz_kur_payi = 50 WHERE id = 1');
    try {
      const b3 = await belge(f, { tutar: 10, kdvOrani: 0, paraBirimi: 'EUR', kur: 35 });
      tamam(await yaz('/finans/odemeler/ekle', { yon: 'gelir', firmaId: f, tarih: TARIH, yontem: 'banka', hesapId: h, tutar: 500, dagitimlar: [{ belgeId: b3.id, belgeTutari: 10, caprazKur: 50 }] }));
    } finally {
      await vt().sorgu('UPDATE finans_ayar SET capraz_kur_payi = 20 WHERE id = 1');
    }
  });

  test('B-009: dövizli mahsupta aradaki kur saklanır ve günün kurundan en çok %20 sapar', async () => {
    const f = await firma('ikisi');
    const s = await belge(f, { tutar: 100, kdvOrani: 0, paraBirimi: 'EUR', kur: 35 });
    const a = await belge(f, { yon: 'gider', kategori: 'mal_alimi', tutar: 3500, kdvOrani: 0 });
    const r = await yaz('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 100, alisTutari: 1, tarih: TARIH });
    assert.deepEqual([r.durum, alan(r)], [400, 'alisTutari']);
    const m = tamam(await yaz<{ mahsup: { id: number } }>('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 50, alisTutari: 1800, tarih: TARIH })).mahsup;
    assert.equal((await vt().tek<{ k: string }>('SELECT capraz_kur::text AS k FROM finans_mahsup WHERE id = $1', [m.id]))?.k, '36.00000000');
    const asiri = await kisitAdi('INSERT INTO finans_mahsup (firma_id, satis_belge_id, alis_belge_id, satis_tutari, alis_tutari, tarih, olusturan_id) VALUES ($1, $2, $3, 10, 1, $4, $5)',
      [f, s.id, a.id, TARIH, yoneticiId]);
    assert.equal(asiri, 'finans_mahsup_capraz_kur_sinir');
  });

  test('B-012: dağıtım iptali yalnız finans.yonet; belge yeniden açılır, tutar ödemede avansa döner; ikinci iptal 422', async () => {
    const f = await firma();
    const h = await hesap();
    const b = await belge(f);
    const o = await odeme(f, h, 1200, [{ belgeId: b.id, belgeTutari: 1200 }]);
    const d = (await vt().tek<{ id: number }>('SELECT id FROM finans_odeme_dagilimi WHERE odeme_id = $1', [o.id]))?.id ?? 0;
    assert.equal((await yaz(`/finans/dagitimlar/${d}/iptal`, {}, 'yazan')).durum, 403);
    const c = tamam(await yaz<{ belge: Belge; odeme: Odeme }>(`/finans/dagitimlar/${d}/iptal`, {}));
    assert.deepEqual([c.belge.durum, c.odeme.kalan, c.odeme.iptal], ['acik', '1200.00', false]);
    assert.equal(await hesapBakiyesi(h), '1200.00');
    assert.equal((await yaz(`/finans/dagitimlar/${d}/iptal`, {})).durum, 422);
  });

  test('B-012: verilen çek ödendi olunca tutar hesaptan çıkar; geri alınca bekliyor olur ve tutar hesaba döner', async () => {
    const t = await firma('tedarikci');
    const h = await hesap('banka', 'TRY', 5000);
    const b = await belge(t, { yon: 'gider', kategori: 'mal_alimi' });
    let c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'verilen', tur: 'cek', firmaId: t, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b.id, belgeTutari: 1200 }] })).cek;
    assert.equal(c.durum, 'bekliyor');
    assert.equal((await belgeOku(b.id)).durum, 'kapandi');
    assert.equal(await hesapBakiyesi(h), '5000.00');
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/odendi`, { surum: c.surum, hesapId: h, tarih: '2026-11-15' }, 'yazan')).cek;
    assert.deepEqual([c.durum, c.sonucHesapId], ['odendi', h]);
    assert.equal(await hesapBakiyesi(h), '3800.00');
    assert.equal((await yaz(`/finans/cekler/${c.id}/geri-al`, { surum: c.surum }, 'yazan')).durum, 403);
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/geri-al`, { surum: c.surum })).cek;
    assert.equal(c.durum, 'bekliyor');
    assert.equal(await hesapBakiyesi(h), '5000.00');
  });

  test('B-012 (GUVENLIK B): finans.yaz olan kişi her finans.yonet ucunda, finans.oku olan kişi her finans.yaz ucunda 403 alır', async () => {
    const yollar = (yetki: string) => uclar.filter((u) => u.yontem === 'POST' && u.yetki === yetki).map((u) => u.yol.replace('/finans/', '').replace(':id', '1'));
    const YONET = yollar('finans.yonet');
    const YAZ = yollar('finans.yaz');
    assert.equal(YONET.length, 24);
    assert.equal(YAZ.length, 16);
    const sonuc = async (kim: string, yollar: string[]) => Promise.all(yollar.map(async (y) => `${y} ${(await yaz(`/finans/${y}`, {}, kim)).durum}`));
    assert.deepEqual(await sonuc('yazan', YONET), YONET.map((y) => `${y} 403`));
    assert.deepEqual(await sonuc('okuyan', YAZ), YAZ.map((y) => `${y} 403`));
  });

  // FNS-61: düzeltme ve iptal deftere değişen alanın önceki ve yeni değerini ek olarak bırakır; reddedilen komut defter satırı bırakmaz.
  interface EkSatiri { kayit: string; alan: string; onceki: unknown; yeni: unknown }
  const defterSayisi = async (yol: string): Promise<number> =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM denetim_kaydi WHERE yol = $1', [yol]))?.n ?? 0;
  const sonEk = async (yol: string): Promise<EkSatiri[] | null> =>
    (await vt().tek<{ ek: EkSatiri[] | null }>("SELECT govde->'_ek' AS ek FROM denetim_kaydi WHERE yol = $1 ORDER BY id DESC LIMIT 1", [yol]))?.ek ?? null;
  const satirBul = (ek: EkSatiri[] | null, kayit: string, alanAdi: string): EkSatiri | undefined => ek?.find((s) => s.kayit === kayit && s.alan === alanAdi);

  test('FNS-61: belge düzeltmesi deftere yalnız değişen alanı önceki ve yeni değeriyle yazar; eski sürümle reddedilen düzeltme defter satırı bırakmaz', async () => {
    const yol = '/finans/belgeler/:id/duzelt';
    const f = await firma();
    const b = await belge(f);
    const d = tamam(await yaz<{ belge: Belge }>(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f), surum: b.surum, aciklama: 'Düzeltilen açıklama', tutar: 900 })).belge;
    const ek = await sonEk(yol);
    assert.deepEqual(satirBul(ek, `belge:${b.id}`, 'aciklama'), { kayit: `belge:${b.id}`, alan: 'aciklama', onceki: null, yeni: 'Düzeltilen açıklama' });
    assert.deepEqual(satirBul(ek, `belge:${b.id}`, 'tutar'), { kayit: `belge:${b.id}`, alan: 'tutar', onceki: '1000.00', yeni: '900.00' });
    assert.equal(satirBul(ek, `belge:${b.id}`, 'surum'), undefined);
    assert.equal(satirBul(ek, `belge:${b.id}`, 'kategori'), undefined);
    const once = await defterSayisi(yol);
    assert.equal((await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f), surum: b.surum, aciklama: 'Eski sürümle' })).durum, 409);
    assert.equal(await defterSayisi(yol), once);
    tamam(await yaz(`/finans/belgeler/${b.id}/duzelt`, { ...belgeGovdesi(f), surum: d.surum, aciklama: 'Düzeltilen açıklama', tutar: 900 }));
    assert.equal(await defterSayisi(yol), once + 1);
    assert.equal(await sonEk(yol), null, 'değişmeyen düzeltme ek bırakmaz');
  });

  test('FNS-61: belge, ödeme, dağıtım, mahsup ve virman iptali deftere durumun önceki ve yeni değerini yazar; ikinci iptal satır bırakmaz', async () => {
    const f = await firma('ikisi');
    const h = await hesap('banka', 'TRY', 100);
    const b = await belge(f);
    tamam(await yaz(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum, neden: 'Hatalı giriş' }));
    let ek = await sonEk('/finans/belgeler/:id/iptal');
    assert.deepEqual(satirBul(ek, `belge:${b.id}`, 'durum'), { kayit: `belge:${b.id}`, alan: 'durum', onceki: 'acik', yeni: 'iptal' });
    assert.deepEqual(satirBul(ek, `belge:${b.id}`, 'iptalNedeni'), { kayit: `belge:${b.id}`, alan: 'iptalNedeni', onceki: null, yeni: 'Hatalı giriş' });
    const once = await defterSayisi('/finans/belgeler/:id/iptal');
    assert.equal((await yaz(`/finans/belgeler/${b.id}/iptal`, { surum: b.surum + 1 })).durum, 422);
    assert.equal(await defterSayisi('/finans/belgeler/:id/iptal'), once);

    const b2 = await belge(f);
    const o = await odeme(f, h, 1200, [{ belgeId: b2.id, belgeTutari: 1200 }]);
    tamam(await yaz(`/finans/odemeler/${o.id}/iptal`, { surum: o.surum, neden: 'Yanlış hesap' }));
    ek = await sonEk('/finans/odemeler/:id/iptal');
    assert.deepEqual(satirBul(ek, `odeme:${o.id}`, 'iptal'), { kayit: `odeme:${o.id}`, alan: 'iptal', onceki: false, yeni: true });

    const b3 = await belge(f);
    const o3 = await odeme(f, h, 1200, [{ belgeId: b3.id, belgeTutari: 1200 }]);
    const d = (await vt().tek<{ id: number }>('SELECT id FROM finans_odeme_dagilimi WHERE odeme_id = $1', [o3.id]))?.id ?? 0;
    tamam(await yaz(`/finans/dagitimlar/${d}/iptal`, {}));
    ek = await sonEk('/finans/dagitimlar/:id/iptal');
    assert.deepEqual(satirBul(ek, `dagitim:${d}`, 'iptal'), { kayit: `dagitim:${d}`, alan: 'iptal', onceki: false, yeni: true });
    assert.deepEqual(satirBul(ek, `belge:${b3.id}`, 'durum'), { kayit: `belge:${b3.id}`, alan: 'durum', onceki: 'kapandi', yeni: 'acik' });
    assert.deepEqual(satirBul(ek, `odeme:${o3.id}`, 'kalan'), { kayit: `odeme:${o3.id}`, alan: 'kalan', onceki: '0.00', yeni: '1200.00' });

    const s = await belge(f, { tutar: 500, kdvOrani: 0 });
    const a = await belge(f, { yon: 'gider', kategori: 'mal_alimi', tutar: 300, kdvOrani: 0 });
    const m = tamam(await yaz<{ mahsup: { id: number; surum: number } }>('/finans/mahsuplar/ekle', { firmaId: f, satisBelgeId: s.id, alisBelgeId: a.id, satisTutari: 300, tarih: TARIH })).mahsup;
    tamam(await yaz(`/finans/mahsuplar/${m.id}/iptal`, { surum: m.surum }));
    ek = await sonEk('/finans/mahsuplar/:id/iptal');
    assert.deepEqual(satirBul(ek, `mahsup:${m.id}`, 'iptal'), { kayit: `mahsup:${m.id}`, alan: 'iptal', onceki: false, yeni: true });

    const h2 = await hesap('banka');
    const v = tamam(await yaz<{ virman: { id: number; surum: number } }>('/finans/virmanlar/ekle', { kaynakHesapId: h, hedefHesapId: h2, tarih: TARIH, tutar: 10 })).virman;
    tamam(await yaz(`/finans/virmanlar/${v.id}/iptal`, { surum: v.surum }));
    ek = await sonEk('/finans/virmanlar/:id/iptal');
    assert.deepEqual(satirBul(ek, `virman:${v.id}`, 'iptal'), { kayit: `virman:${v.id}`, alan: 'iptal', onceki: false, yeni: true });
  });

  test('FNS-61: çek düzeltmesi ve iptali deftere önceki ve yeni değeri yazar; tahsile verme durum geçişidir, ek bırakmaz', async () => {
    const f = await firma();
    const b = await belge(f);
    let c = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b.id, belgeTutari: 1200 }] })).cek;
    c = tamam(await yaz<{ cek: Cek }>(`/finans/cekler/${c.id}/duzelt`, { surum: c.surum, banka: 'Deneme Bankası', seriNo: 'A-1', vade: '2026-11-20' })).cek;
    const ek = await sonEk('/finans/cekler/:id/duzelt');
    assert.deepEqual(satirBul(ek, `cek:${c.id}`, 'banka'), { kayit: `cek:${c.id}`, alan: 'banka', onceki: null, yeni: 'Deneme Bankası' });
    assert.deepEqual(satirBul(ek, `cek:${c.id}`, 'vade'), { kayit: `cek:${c.id}`, alan: 'vade', onceki: '2026-11-15', yeni: '2026-11-20' });
    tamam(await yaz(`/finans/cekler/${c.id}/iptal`, { surum: c.surum }));
    assert.deepEqual(satirBul(await sonEk('/finans/cekler/:id/iptal'), `cek:${c.id}`, 'durum'), { kayit: `cek:${c.id}`, alan: 'durum', onceki: 'portfoy', yeni: 'iptal' });
    const b2 = await belge(f);
    const c2 = tamam(await yaz<{ cek: Cek }>('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: TARIH, vade: '2026-11-15', tutar: 1200, dagitimlar: [{ belgeId: b2.id, belgeTutari: 1200 }] })).cek;
    tamam(await yaz(`/finans/cekler/${c2.id}/tahsile-ver`, { surum: c2.surum }));
    assert.equal(await sonEk('/finans/cekler/:id/tahsile-ver'), null);
  });

  test('FNS-61: firma, hesap, kur, düzenli ödeme ve ayar düzeltmesi deftere önceki ve yeni değeri yazar', async () => {
    const f = await firma();
    const fk = tamam(await istek<{ firma: Record<string, unknown> }>('yonetim', 'GET', `/musteri-tedarikci/firmalar/${f}`)).firma;
    tamam(await yaz(`/musteri-tedarikci/firmalar/${f}/guncelle`, { ...fk, telefon: '0212 000 00 00' }));
    assert.deepEqual(satirBul(await sonEk('/musteri-tedarikci/firmalar/:id/guncelle'), `firma:${f}`, 'telefon'), { kayit: `firma:${f}`, alan: 'telefon', onceki: null, yeni: '0212 000 00 00' });

    const h = await hesap('kasa');
    const hs = tamam(await istek<{ satirlar: { id: number; surum: number }[] }>('yonetim', 'GET', '/finans/hesaplar?sayfaBoyu=200')).satirlar.find((x) => x.id === h);
    tamam(await yaz(`/finans/hesaplar/${h}/guncelle`, { ad: 'Yeni Kasa Adı', tur: 'kasa', acilisTarihi: '2026-01-01', surum: hs?.surum }));
    assert.equal(satirBul(await sonEk('/finans/hesaplar/:id/guncelle'), `hesap:${h}`, 'ad')?.yeni, 'Yeni Kasa Adı');

    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'GBP', tarih: TARIH, kur: 42.5 }));
    tamam(await yaz('/finans/kurlar/guncelle', { paraBirimi: 'GBP', tarih: TARIH, kur: 42.75, surum: 1 }));
    assert.deepEqual(satirBul(await sonEk('/finans/kurlar/guncelle'), `kur:GBP:${TARIH}`, 'kur'), { kayit: `kur:GBP:${TARIH}`, alan: 'kur', onceki: '42.500000', yeni: '42.750000' });

    const d = tamam(await yaz<{ duzenli: { id: number; surum: number } }>('/finans/duzenli-odemeler/ekle', { ad: 'Defter Kirası', kategori: 'personel', tutar: 300, ayinGunu: 5 })).duzenli;
    tamam(await yaz(`/finans/duzenli-odemeler/${d.id}/guncelle`, { ad: 'Defter Kirası', kategori: 'personel', tutar: 350, ayinGunu: 5, surum: d.surum }));
    assert.deepEqual(satirBul(await sonEk('/finans/duzenli-odemeler/:id/guncelle'), `duzenli:${d.id}`, 'tutar'), { kayit: `duzenli:${d.id}`, alan: 'tutar', onceki: '300.00', yeni: '350.00' });

    const a = tamam(await istek<{ ayar: Record<string, unknown> }>('yonetim', 'GET', '/finans/ayar')).ayar;
    const sayilar = ['nakitEsigi', 'beklenenAylikSatis', 'cekKarsiliksizOlasiligi', 'anomaliEsigi', 'bilancoDonen', 'bilancoStok', 'bilancoKvb', 'bilancoToplamBorc', 'bilancoOzkaynak', 'bilancoBirikmisKar'];
    const ayarGovdesi = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, sayilar.includes(k) && v !== null ? Number(v) : v]));
    tamam(await yaz('/finans/ayar/guncelle', { ...ayarGovdesi, riskToleransi: Number(a['riskToleransi']) === 10 ? 11 : 10 }));
    const ayarSatiri = satirBul(await sonEk('/finans/ayar/guncelle'), 'ayar', 'riskToleransi');
    assert.ok(ayarSatiri && ayarSatiri.onceki === Number(a['riskToleransi']) && ayarSatiri.yeni !== ayarSatiri.onceki, JSON.stringify(ayarSatiri));
  });

  test('pano özeti: her dövizin bugüne kadarki son kuru; ileri tarihli kur ve TRY gelmez; finans.oku ister', async () => {
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'CHF', tarih: TARIH, kur: 38.5 }));
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'CHF', tarih: '2099-01-01', kur: 99 }));
    const o = tamam(await istek<{ kurlar: { paraBirimi: string; kur: string; tarih: string }[] }>('okuyan', 'GET', '/finans/ozet'));
    assert.deepEqual(o.kurlar.find((k) => k.paraBirimi === 'CHF'), { paraBirimi: 'CHF', kur: '38.500000', tarih: TARIH });
    assert.equal(o.kurlar.some((k) => k.paraBirimi === 'TRY'), false);
    assert.equal((await istek('firmaci', 'GET', '/finans/ozet')).durum, 403);
    assert.equal((await istek(null, 'GET', '/finans/ozet')).durum, 401);
  });

  test('pano rakamları: geciken tahsilat, 7 günde ödeme, portföydeki çek TL; nakit kuru eksik dövizli hesapta null', async () => {
    const bugun = tesisGunu(new Date());
    const gun = (n: number): string => new Date(Date.parse(`${bugun}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const ozet = async (): Promise<FinansOzetiCevabi> => tamam(await istek<FinansOzetiCevabi>('okuyan', 'GET', '/finans/ozet'));
    // Önceki testlerin dövizli hesaplarına kur verilir ki nakit toplamı hesaplanabilsin; kur zaten varsa çakışma yok sayılır.
    const dovizler = await vt().sorgu<{ pb: string }>("SELECT DISTINCT rtrim(para_birimi) AS pb FROM finans_hesap WHERE aktif AND para_birimi <> 'TRY'");
    for (const { pb } of dovizler) await yaz('/finans/kurlar/ekle', { paraBirimi: pb, tarih: gun(-30), kur: 10 });
    const once = await ozet();
    assert.notEqual(once.nakitTl, null);

    const f = await firma();
    await belge(f, { belgeTarihi: gun(-10), vade: gun(-1) });
    await belge(f, { belgeTarihi: gun(-10), vade: bugun });
    await belge(f, { yon: 'gider', kategori: 'mal_alimi', belgeTarihi: gun(-2), vade: gun(3) });
    await belge(f, { yon: 'gider', kategori: 'mal_alimi', belgeTarihi: gun(-2), vade: gun(8) });
    const cekBelgesi = await belge(f, { belgeTarihi: gun(-1), vade: gun(30) });
    tamam(await yaz('/finans/cekler/ekle', { yon: 'alinan', tur: 'cek', firmaId: f, duzenlemeTarihi: gun(-1), vade: gun(20), tutar: 600, dagitimlar: [{ belgeId: cekBelgesi.id, belgeTutari: 600 }] }));
    await hesap('banka', 'TRY', 500);
    const sonra = await ozet();
    const fark = (a: string, b: string): number => Math.round((Number(b) - Number(a)) * 100) / 100;
    assert.deepEqual([sonra.gecikenTahsilat.sayi - once.gecikenTahsilat.sayi, fark(once.gecikenTahsilat.tutarTl, sonra.gecikenTahsilat.tutarTl)], [1, 1200]);
    assert.deepEqual([sonra.yaklasanOdeme.sayi - once.yaklasanOdeme.sayi, fark(once.yaklasanOdeme.tutarTl, sonra.yaklasanOdeme.tutarTl)], [1, 1200]);
    assert.deepEqual([sonra.portfoyCek.sayi - once.portfoyCek.sayi, fark(once.portfoyCek.tutarTl, sonra.portfoyCek.tutarTl)], [1, 600]);
    assert.equal(fark(once.nakitTl ?? '', sonra.nakitTl ?? ''), 500);
    // Alacak: açık satış kalanı (1200 + 1200 + çekle kapanmayan 600) ve portföydeki çek (600); borç: açık alış (1200 + 1200).
    assert.equal(fark(once.alacakTl, sonra.alacakTl), 3600);
    assert.equal(fark(once.borcTl, sonra.borcTl), 2400);

    // Aylık ortalama kâr son üç tamamlanmış ayın KDV hariç tutarıdır; bu ay, iptal ve kredi anaparası girmez.
    const gecenAy = `${new Date(Date.parse(`${bugun.slice(0, 7)}-01T12:00:00Z`) - 86_400_000).toISOString().slice(0, 7)}-05`;
    const k1 = await ozet();
    await belge(f, { belgeTarihi: gecenAy, vade: gecenAy, tutar: 1000, kdvOrani: 20 });
    await belge(f, { yon: 'gider', kategori: 'kira', belgeTarihi: gecenAy, vade: gecenAy, tutar: 400, kdvOrani: 20 });
    await belge(null, { yon: 'gider', tur: 'faturasiz', kategori: 'kredi_anapara', belgeTarihi: gecenAy, vade: gecenAy, tutar: 900, kdvOrani: 0 });
    await belge(f, { belgeTarihi: bugun, vade: bugun, tutar: 5000, kdvOrani: 20 });
    const iptalEdilen = await belge(f, { belgeTarihi: gecenAy, vade: gecenAy, tutar: 3000, kdvOrani: 20 });
    tamam(await yaz(`/finans/belgeler/${iptalEdilen.id}/iptal`, { surum: iptalEdilen.surum }));
    assert.equal(fark(k1.aylikKarTl, (await ozet()).aylikKarTl), 200);

    await hesap('banka', 'NOK', 200);
    assert.equal((await ozet()).nakitTl, null);
    tamam(await yaz('/finans/kurlar/ekle', { paraBirimi: 'NOK', tarih: gun(-1), kur: 2.5 }));
    assert.equal(fark(sonra.nakitTl ?? '', (await ozet()).nakitTl ?? ''), 500);
  });

  test('aylık seri (#1080): son 6-12 ay gelir ve gider TL, eskiden yeniye; KDV, iptal sayılmaz; dövizli belge kurla; finans.oku ister', async () => {
    const buAy = tesisGunu(new Date()).slice(0, 7);
    const ay = (n: number): string => { const t = Number(buAy.slice(0, 4)) * 12 + Number(buAy.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
    type Seri = { aylar: { ay: string; gelirTl: string | null; giderTl: string | null }[] };
    const seri = async (sorgu = ''): Promise<Seri> => tamam(await istek<Seri>('okuyan', 'GET', `/finans/aylik-seri${sorgu}`));
    const satir = (s: Seri, a: string) => s.aylar.find((x) => x.ay === a);
    const once = await seri();
    assert.deepEqual(once.aylar.map((x) => x.ay), Array.from({ length: 12 }, (_, i) => ay(i - 11)));
    assert.deepEqual((await seri('?ay=6')).aylar.map((x) => x.ay), Array.from({ length: 6 }, (_, i) => ay(i - 5)));
    assert.equal((await istek('okuyan', 'GET', '/finans/aylik-seri?ay=5')).durum, 400);
    assert.equal((await istek('okuyan', 'GET', '/finans/aylik-seri?ay=13')).durum, 400);
    assert.equal((await istek('firmaci', 'GET', '/finans/aylik-seri')).durum, 403);
    assert.equal((await istek(null, 'GET', '/finans/aylik-seri')).durum, 401);

    const f = await firma();
    await belge(f, { belgeTarihi: `${ay(-2)}-15`, vade: `${ay(-1)}-15`, tutar: 1000 });
    await belge(f, { belgeTarihi: `${ay(-2)}-16`, vade: `${ay(-1)}-15`, tutar: 100, paraBirimi: 'USD', kur: 30 });
    await belge(f, { yon: 'gider', kategori: 'mal_alimi', belgeTarihi: `${ay(-1)}-10`, vade: `${ay(-1)}-20`, tutar: 400 });
    await belge(null, { yon: 'gider', tur: 'faturasiz', kategori: 'kdv_vergi', belgeTarihi: `${ay(-1)}-11`, vade: `${ay(-1)}-20`, tutar: 999, kdvOrani: 0 });
    const iptal = await belge(f, { belgeTarihi: `${ay(-1)}-12`, vade: `${ay(-1)}-20`, tutar: 5000 });
    tamam(await yaz(`/finans/belgeler/${iptal.id}/iptal`, { surum: iptal.surum, neden: 'deneme' }));

    const sonra = await seri();
    const fark = (a: string | null | undefined, b: string | null | undefined): number => Math.round((Number(b ?? 0) - Number(a ?? 0)) * 100) / 100;
    assert.equal(fark(satir(once, ay(-2))?.gelirTl, satir(sonra, ay(-2))?.gelirTl), 4000, 'KDV hariç: 1000 TL + 100 USD x 30');
    assert.equal(fark(satir(once, ay(-1))?.giderTl, satir(sonra, ay(-1))?.giderTl), 400, 'KDV ödemesi gider sayılmaz');
    assert.equal(fark(satir(once, ay(-1))?.gelirTl, satir(sonra, ay(-1))?.gelirTl), 0, 'iptal belge sayılmaz');

    // İlk belgeden önceki ay "veri yok"tur (null), sonrası belge olmasa da sıfırdır.
    const ilk = (await vt().tek<{ ay: string }>("SELECT to_char(min(belge_tarihi), 'YYYY-MM') AS ay FROM finans_belge WHERE durum <> 'iptal' AND tur <> 'acilis'"))?.ay ?? '';
    for (const x of sonra.aylar) assert.equal(x.gelirTl === null, x.ay < ilk, x.ay);
  });
});
