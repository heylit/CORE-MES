import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type { Belge, BeklenenOdemelerCevabi, FinansOzetiCevabi, Odeme } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { alisBelgeleri, belgeSiparisBagla } from './disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Akış D uçtan uca: firma kartı -> fatura ve masraf -> tahsilat ve ödeme -> raporlar, göçün verdiği gerçek rollerle (kart #223).
// Firmalar, hesaplar ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const TEKRARLI = /\/(ekle|dagit|ciro|esitle|odendi|toplu-ice-aktar)$/;
const TARIH = '2026-10-05';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Liste<T> { satirlar: T[] }
interface Hesap { id: number; bakiye: string }
interface Mahsup { id: number; caprazKur: string | null; satisTutari: string; alisTutari: string }
type AyarCevabi = { ayar: Record<string, unknown> & { surum: number; caprazKurPayi: string } };

describe('akış D: finans uçtan uca, gerçek rollerle (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (yontem === 'POST' && TEKRARLI.test(yol)) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const oku = <T = unknown>(kim: string, yol: string) => istek<T>(kim, 'GET', yol);
  const yaz = <T = unknown>(kim: string, yol: string, govde: unknown) => istek<T>(kim, 'POST', yol, govde);
  const tamam = <T>(c: Cevap<T>): T => { assert.ok(c.durum === 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const bul = async <T extends { id: number }>(kim: string, yol: string, id: number): Promise<T> => {
    const s = tamam(await oku<Liste<T>>(kim, `${yol}?sayfaBoyu=200&iptalDahil=true`)).satirlar.find((x) => x.id === id);
    if (!s) throw new Error(`${yol} ${id} yok`);
    return s;
  };

  // Göçün açtığı rol (kisiler_finans_islemleri); yönetici rolü alınır, kişi yalnız o rolün işlemlerini taşır.
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error(`rol yok: ${rolKodu}`);
    await vt().tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol.id);
      await rolAl(db, yoneticiId, k, yr.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, `giriş ${kullaniciAdi}`);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  // Ayar cevabındaki sayı metinleri gövdede sayıdır; sürüm ve okumaya özgü alan gövdeye girmez.
  function ayarGovdesi(a: AyarCevabi['ayar'], ek: Record<string, unknown> = {}): Record<string, unknown> {
    const g: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a)) if (k !== 'caprazKurPayi') g[k] = typeof v === 'string' && k !== 'sirketAdi' && k !== 'sektor' ? Number(v) : v;
    return { ...g, ...ek };
  }

  const kisit = async (sql: string, p: unknown[]): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
  };

  before(async () => {
    ortam = await testVeritabaniKur('finansakisd');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await rolluKisi('muhasebe', 'muhasebe_finans');
    await rolluKisi('mudur', 'mudur');
    await rolluKisi('satinalma', 'satin_alma');
    await rolluKisi('depo', 'depo');
  });
  after(async () => { await ortam?.kaldir(); });

  test('muhasebe akışı yürütür: firma, iki satış ve bir alış faturası, tahsilat, ödeme, mahsup; kapanış ve bakiye doğru', async () => {
    const firma = tamam(await yaz<{ firma: { id: number } }>('muhasebe', '/musteri-tedarikci/firmalar/ekle', { ad: 'Akış D Deneme Firma', tur: 'ikisi' })).firma.id;
    const hesap = tamam(await yaz<{ hesap: { id: number } }>('muhasebe', '/finans/hesaplar/ekle', { ad: 'Akış D Banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 0, acilisTarihi: '2026-01-01' })).hesap.id;
    const fatura = async (yon: 'gelir' | 'gider', kategori: string, tutar: number) => tamam(await yaz<{ belge: Belge }>('muhasebe', '/finans/belgeler/ekle', {
      yon, kategori, firmaId: firma, belgeTarihi: TARIH, vade: '2026-11-05', tutar, kdvOrani: 20,
    })).belge;
    const satis1 = await fatura('gelir', 'urun_satisi', 1000);
    const satis2 = await fatura('gelir', 'urun_satisi', 1000);
    const alis = await fatura('gider', 'mal_alimi', 500);
    assert.deepEqual([satis1.toplam, alis.toplam, satis1.durum], ['1200.00', '600.00', 'acik']);

    const odeme = (yon: 'gelir' | 'gider', tutar: number, belgeId: number) => yaz<{ odeme: Odeme }>('muhasebe', '/finans/odemeler/ekle', {
      yon, firmaId: firma, tarih: TARIH, yontem: 'banka', hesapId: hesap, tutar, dagitimlar: [{ belgeId, belgeTutari: tutar }],
    });
    tamam(await odeme('gelir', 1200, satis1.id));
    tamam(await odeme('gider', 300, alis.id));
    const m = tamam(await yaz<{ mahsup: Mahsup }>('muhasebe', '/finans/mahsuplar/ekle', { firmaId: firma, satisBelgeId: satis2.id, alisBelgeId: alis.id, satisTutari: 300, tarih: TARIH })).mahsup;

    const durum = async (id: number) => { const b = await bul<Belge>('muhasebe', '/finans/belgeler', id); return [b.durum, b.kalan]; };
    assert.deepEqual(await durum(satis1.id), ['kapandi', '0.00']);
    assert.deepEqual(await durum(alis.id), ['kapandi', '0.00']);
    assert.deepEqual(await durum(satis2.id), ['acik', '900.00']);
    assert.equal((await bul<Hesap>('muhasebe', '/finans/hesaplar', hesap)).bakiye, '900.00');
    // CEKIRDEK-ISTEKLERI 8: mahsubun kuru okumada görünür (aynı para biriminde 1).
    assert.equal(Number((await bul<Mahsup>('muhasebe', '/finans/mahsuplar', m.id)).caprazKur), 1);

    // Raporların okuduğu her liste müdürde aynı rakamla açılır; müdür hiçbir şey yazamaz.
    assert.equal((await bul<Hesap>('mudur', '/finans/hesaplar', hesap)).bakiye, '900.00');
    assert.equal((await bul<Belge>('mudur', '/finans/belgeler', satis2.id)).kalan, '900.00');
    for (const yol of ['/finans/odemeler', '/finans/dagitimlar', '/finans/mahsuplar', '/finans/cekler', '/finans/kurlar', '/finans/butce', '/finans/ayar']) {
      assert.equal((await oku('mudur', yol)).durum, 200, yol);
    }
    assert.equal((await yaz('mudur', '/finans/belgeler/ekle', { yon: 'gelir', kategori: 'urun_satisi', firmaId: firma, belgeTarihi: TARIH, vade: TARIH, tutar: 1, kdvOrani: 20 })).durum, 403);
    assert.equal((await yaz('mudur', '/musteri-tedarikci/firmalar/ekle', { ad: 'Müdürün firması', tur: 'musteri' })).durum, 403);
    assert.equal((await yaz('mudur', `/finans/mahsuplar/${m.id}/iptal`, { surum: 1 })).durum, 403);
    const sayac = tamam(await oku<Record<string, unknown>>('mudur', '/finans/menu-sayaclari'));
    assert.equal(typeof sayac['firmalar'], 'number');
  });

  test('satın alma ve depo firma kartında kalır: satın alma firma açar ve okur, depo yalnız okur; ikisi de rakam görmez', async () => {
    const f = tamam(await yaz<{ firma: { id: number } }>('satinalma', '/musteri-tedarikci/firmalar/ekle', { ad: 'Satın Almanın Tedarikçisi', tur: 'tedarikci' })).firma.id;
    assert.equal((await oku('satinalma', `/musteri-tedarikci/firmalar/${f}`)).durum, 200);
    assert.equal((await oku('depo', `/musteri-tedarikci/firmalar/${f}`)).durum, 200);
    assert.equal((await yaz('depo', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deponun firması', tur: 'tedarikci' })).durum, 403);
    for (const kim of ['satinalma', 'depo']) {
      for (const yol of ['/finans/belgeler', '/finans/odemeler', '/finans/hesaplar', '/finans/ayar']) assert.equal((await oku(kim, yol)).durum, 403, `${kim} ${yol}`);
    }
    assert.deepEqual(tamam(await oku('satinalma', '/finans/menu-sayaclari')), { firmalar: null, cekler: null });
  });

  test('CEKIRDEK-ISTEKLERI 8: ödeme iptal nedeni okumada görünür, açıklama değişmez', async () => {
    const firma = tamam(await yaz<{ firma: { id: number } }>('muhasebe', '/musteri-tedarikci/firmalar/ekle', { ad: 'İptal Deneme Firma', tur: 'musteri' })).firma.id;
    const hesap = tamam(await yaz<{ hesap: { id: number } }>('muhasebe', '/finans/hesaplar/ekle', { ad: 'İptal Kasa', tur: 'kasa', acilisTarihi: '2026-01-01' })).hesap.id;
    const o = tamam(await yaz<{ odeme: Odeme }>('muhasebe', '/finans/odemeler/ekle', { yon: 'gelir', firmaId: firma, tarih: TARIH, yontem: 'nakit', hesapId: hesap, tutar: 50, aciklama: 'Peşin avans' })).odeme;
    assert.equal(o.iptalNedeni, null);
    tamam(await yaz('muhasebe', `/finans/odemeler/${o.id}/iptal`, { surum: o.surum, neden: 'Yanlış firmaya girildi' }));
    const okunan = await bul<Odeme>('mudur', '/finans/odemeler', o.id);
    assert.deepEqual([okunan.iptal, okunan.aciklama, okunan.iptalNedeni], [true, 'Peşin avans', 'Yanlış firmaya girildi']);
  });

  test('CEKIRDEK-ISTEKLERI 8, FK1: çapraz kur payı ayarda okunur ve yalnız finans.yonet ile değişir; gönderilmezse korunur', async () => {
    const ilk = tamam(await oku<AyarCevabi>('muhasebe', '/finans/ayar')).ayar;
    assert.equal(ilk.caprazKurPayi, '20.00');
    const ikinci = tamam(await yaz<AyarCevabi>('muhasebe', '/finans/ayar/guncelle', ayarGovdesi(ilk, { caprazKurPayi: 35 }))).ayar;
    assert.equal(ikinci.caprazKurPayi, '35.00');
    assert.equal((await vt().tek<{ p: string }>('SELECT (finans_capraz_kur_payi() * 100)::numeric(5,2)::text AS p'))?.p, '35.00');
    const ucuncu = tamam(await yaz<AyarCevabi>('muhasebe', '/finans/ayar/guncelle', ayarGovdesi(ikinci, { nakitEsigi: 1000 }))).ayar;
    assert.equal(ucuncu.caprazKurPayi, '35.00');
    assert.equal((await yaz('muhasebe', '/finans/ayar/guncelle', ayarGovdesi(ucuncu, { caprazKurPayi: 0 }))).durum, 400);
    assert.equal((await yaz('muhasebe', '/finans/ayar/guncelle', ayarGovdesi(ucuncu, { caprazKurPayi: 101 }))).durum, 400);
    assert.equal((await yaz('mudur', '/finans/ayar/guncelle', ayarGovdesi(ucuncu, { caprazKurPayi: 50 }))).durum, 403);
    assert.equal(tamam(await oku<AyarCevabi>('mudur', '/finans/ayar')).ayar.caprazKurPayi, '35.00');
  });

  test('FNS-62 (D6 b): alış faturası satın alma siparişine bağlanır; yalnız alış, iptal edilmemiş ve siparişin tedarikçisinin faturası', async () => {
    // Satın almanın tabloları fikstürdür; siparişi satın almanın kendi akışı açar.
    const [talepId, teklifId] = [randomUUID(), randomUUID()];
    await vt().sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, 1, 'Deneme talep', $2, $2, 'siparis_verildi')", [talepId, yoneticiId]);
    await vt().sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [talepId, teklifId]);
    await vt().sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [talepId]);
    await vt().sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [talepId, teklifId]);
    const siparis = { talepId, teklifId };

    const firma = tamam(await yaz<{ firma: { id: number } }>('muhasebe', '/musteri-tedarikci/firmalar/ekle', { ad: 'Sipariş Deneme Tedarikçi', tur: 'ikisi' })).firma.id;
    const baska = tamam(await yaz<{ firma: { id: number } }>('muhasebe', '/musteri-tedarikci/firmalar/ekle', { ad: 'Sipariş Başka Firma', tur: 'tedarikci' })).firma.id;
    const fatura = async (yon: 'gelir' | 'gider', kategori: string) => tamam(await yaz<{ belge: Belge }>('muhasebe', '/finans/belgeler/ekle', {
      yon, kategori, firmaId: firma, belgeTarihi: TARIH, vade: TARIH, tutar: 100, kdvOrani: 20,
    })).belge;
    const alis = await fatura('gider', 'mal_alimi');
    const satis = await fatura('gelir', 'urun_satisi');
    const bagla = (belgeId: number, siparisFirmaId: number, s: typeof siparis | null = siparis) =>
      vt().tx((db) => belgeSiparisBagla(db, yoneticiId, { belgeId, siparisFirmaId, siparis: s }));
    const hata = async (p: Promise<unknown>) => { try { await p; return null; } catch (h) { return (h as Error).message; } };

    assert.equal(await hata(bagla(satis.id, firma)), 'Siparişe yalnız alış faturası bağlanır.');
    assert.equal(await hata(bagla(alis.id, baska)), 'Faturanın firması siparişin tedarikçisi değil.');
    assert.equal(await hata(bagla(alis.id, firma, { talepId, teklifId: randomUUID() })), 'Satın alma siparişi bulunamadı.');
    assert.deepEqual(await bagla(alis.id, firma), { id: alis.id, surum: alis.surum + 1 });

    const okunan = await bul<Belge>('mudur', '/finans/belgeler', alis.id);
    assert.deepEqual(okunan.satinAlmaSiparisi, siparis);
    const secim = await vt().tx((db) => alisBelgeleri(db, firma));
    assert.deepEqual(secim.map((b) => [b.id, b.satinAlmaSiparisi]), [[alis.id, siparis]]);
    assert.ok(!('toplam' in (secim[0] ?? {})), 'seçici rakam taşımaz');
    assert.equal(secim[0]?.belgeTarihi, TARIH, 'tarih YYYY-AA-GG metni');

    // Bağlı faturanın firması değişmez; bağ kaldırılınca değişebilir.
    const duzelt = (b: Belge, firmaId: number) => yaz('muhasebe', `/finans/belgeler/${b.id}/duzelt`, {
      kategori: b.kategori, firmaId, belgeNo: b.belgeNo, aciklama: b.aciklama, belgeTarihi: b.belgeTarihi, vade: b.vade, paraBirimi: b.paraBirimi,
      kur: Number(b.kur), tutar: Number(b.tutar), kdvOrani: Number(b.kdvOrani), surum: b.surum,
    });
    assert.equal((await duzelt(okunan, baska)).durum, 422);
    await bagla(alis.id, firma, null);
    assert.equal((await bul<Belge>('muhasebe', '/finans/belgeler', alis.id)).satinAlmaSiparisi, null);

    // Veritabanı ikinci kez tutar: satış satırına sipariş yazılamaz; sipariş satırı silinirse bağ boşalır, belge kalır.
    assert.equal(await kisit('UPDATE finans_belge SET satin_alma_talep_id = $2, satin_alma_teklif_id = $3 WHERE id = $1', [satis.id, talepId, teklifId]), 'finans_belge_siparis_alis');
    assert.equal(await kisit('UPDATE finans_belge SET satin_alma_talep_id = $2 WHERE id = $1', [alis.id, talepId]), 'finans_belge_siparis_butun');
    await bagla(alis.id, firma);
    await vt().sorgu('DELETE FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [talepId, teklifId]);
    assert.equal((await bul<Belge>('muhasebe', '/finans/belgeler', alis.id)).satinAlmaSiparisi, null);
  });
  test('#162: siparişten beklenen ödeme TL karşılığı ve 7 gün penceresi; açık belge sayılarına eklenmez; kur yoksa null', async () => {
    const bugun = tesisGunu(new Date());
    const gun = (n: number): string => new Date(Date.parse(`${bugun}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const [talepId, teklifId] = [randomUUID(), randomUUID()];
    await vt().sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, 2, 'Deneme talep', $2, $2, 'siparis_verildi')", [talepId, yoneticiId]);
    await vt().sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [talepId, teklifId]);
    await vt().sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [talepId]);
    await vt().sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [talepId, teklifId]);
    const firma = tamam(await yaz<{ firma: { id: number } }>('muhasebe', '/musteri-tedarikci/firmalar/ekle', { ad: 'Plan Deneme Tedarikçi', tur: 'tedarikci' })).firma.id;
    const plan = async (sira: number, vade: string, paraBirimi: string, tutar: string) => vt().sorgu(
      `INSERT INTO finans_siparis_odemesi (satin_alma_talep_id, satin_alma_teklif_id, siparis_no, sira, tur, vade, yontem, firma_id, para_birimi, tutar, olusturan_id)
       VALUES ($1, $2, 'SA-DENEME', $3, 'vade', $4, 'banka', $5, $6, $7, $8)`, [talepId, teklifId, sira, vade, firma, paraBirimi, tutar, yoneticiId]);
    tamam(await yaz('muhasebe', '/finans/kurlar/ekle', { paraBirimi: 'GBP', tarih: gun(-3), kur: 40 }));
    tamam(await yaz('muhasebe', '/finans/kurlar/ekle', { paraBirimi: 'GBP', tarih: gun(5), kur: 99 }));
    const ozet = async (): Promise<FinansOzetiCevabi> => tamam(await oku<FinansOzetiCevabi>('mudur', '/finans/ozet'));
    const once = await ozet();
    assert.deepEqual(once.yaklasanSiparis, { sayi: 0, tutarTl: '0.00' });

    await plan(1, gun(-1), 'TRY', '50.00');
    await plan(2, bugun, 'TRY', '100.00');
    await plan(3, gun(7), 'GBP', '10.00');
    await plan(4, gun(8), 'TRY', '1000.00');
    const sonra = await ozet();
    // Vadesi geçen ve 8. gün pencere dışı; ileri tarihli kur kullanılmaz (10 x 40). Açık belge sayısı ve borç değişmez.
    assert.deepEqual(sonra.yaklasanSiparis, { sayi: 2, tutarTl: '500.00' });
    assert.deepEqual([sonra.yaklasanOdeme, sonra.borcTl], [once.yaklasanOdeme, once.borcTl]);
    const liste = async () => tamam(await oku<BeklenenOdemelerCevabi>('mudur', '/finans/beklenen-odemeler')).odemeler
      .filter((o) => o.talepId === talepId).map((o) => [o.sira, o.tutar, o.tutarTl]);
    assert.deepEqual(await liste(), [[1, '50.00', '50.00'], [2, '100.00', '100.00'], [3, '10.00', '400.00'], [4, '1000.00', '1000.00']]);

    await plan(5, gun(2), 'SEK', '10.00');
    assert.deepEqual((await ozet()).yaklasanSiparis, { sayi: 3, tutarTl: null });
    assert.deepEqual((await liste()).find((x) => x[0] === 5), [5, '10.00', null]);
    assert.equal((await istek('depo', 'GET', '/finans/ozet')).durum, 403);
    await vt().sorgu('DELETE FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [talepId, teklifId]);
    assert.deepEqual((await ozet()).yaklasanSiparis, { sayi: 0, tutarTl: '0.00' });
  });
  test('B15: vadesi geçen plan satırı tahmine girmez, ödenmiş avans düşülür, siparişe bağlanmamış fatura uyarı olur', async () => {
    const bugun = tesisGunu(new Date());
    const gun = (n: number): string => new Date(Date.parse(`${bugun}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const [talepId, teklifId] = [randomUUID(), randomUUID()];
    await vt().sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, 3, 'Deneme talep', $2, $2, 'siparis_verildi')", [talepId, yoneticiId]);
    await vt().sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [talepId, teklifId]);
    await vt().sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [talepId]);
    await vt().sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [talepId, teklifId]);
    const firma = tamam(await yaz<{ firma: { id: number } }>('muhasebe', '/musteri-tedarikci/firmalar/ekle', { ad: 'B15 Deneme Tedarikçi', tur: 'tedarikci' })).firma.id;
    const hesap = tamam(await yaz<{ hesap: { id: number } }>('muhasebe', '/finans/hesaplar/ekle', { ad: 'B15 Banka', tur: 'banka', paraBirimi: 'TRY', acilisBakiyesi: 10000, acilisTarihi: '2026-01-01' })).hesap.id;
    const plan = async (sira: number, tur: 'avans' | 'vade', vade: string, tutar: string) => vt().sorgu(
      `INSERT INTO finans_siparis_odemesi (satin_alma_talep_id, satin_alma_teklif_id, siparis_no, sira, tur, vade, yontem, firma_id, para_birimi, tutar, olusturan_id)
       VALUES ($1, $2, 'SA-B15', $3, $4, $5, 'banka', $6, 'TRY', $7, $8)`, [talepId, teklifId, sira, tur, vade, firma, tutar, yoneticiId]);
    await plan(1, 'avans', gun(-2), '300.00');
    await plan(2, 'avans', gun(3), '500.00');
    await plan(3, 'vade', gun(5), '1000.00');
    const liste = async () => tamam(await oku<BeklenenOdemelerCevabi>('mudur', '/finans/beklenen-odemeler')).odemeler
      .filter((o) => o.talepId === talepId).map((o) => [o.sira, o.tahminTl, o.avansDusulenTl, o.gecikmis, o.bagsizFatura]);
    const ozet = async (): Promise<FinansOzetiCevabi['yaklasanSiparis']> => tamam(await oku<FinansOzetiCevabi>('mudur', '/finans/ozet')).yaklasanSiparis;
    assert.deepEqual(await liste(), [[1, '300.00', '0.00', true, false], [2, '500.00', '0.00', false, false], [3, '1000.00', '0.00', false, false]]);
    assert.deepEqual(await ozet(), { sayi: 2, tutarTl: '1500.00' });

    // Faturaya dağıtılmamış 450 TL ödeme: önce vadesi geçen avans kapanır, kalan 150 ikinci avanstan düşer; vadeli satır değişmez.
    const odeme = tamam(await yaz<{ odeme: Odeme }>('muhasebe', '/finans/odemeler/ekle', { yon: 'gider', firmaId: firma, tarih: bugun, yontem: 'banka', hesapId: hesap, tutar: 450, aciklama: 'Sipariş avansı' })).odeme;
    assert.deepEqual(await liste(), [[1, '0.00', '300.00', true, false], [2, '350.00', '150.00', false, false], [3, '1000.00', '0.00', false, false]]);
    assert.deepEqual(await ozet(), { sayi: 2, tutarTl: '1350.00' });

    // Siparişe bağlanmamış alış faturası: tutar düşülmez, satırlar uyarı taşır. Bağlanınca sipariş listeden düşer.
    const fatura = tamam(await yaz<{ belge: Belge }>('muhasebe', '/finans/belgeler/ekle', {
      yon: 'gider', kategori: 'mal_alimi', firmaId: firma, belgeTarihi: bugun, vade: gun(30), tutar: 800, kdvOrani: 20,
    })).belge;
    assert.deepEqual(await liste(), [[1, '0.00', '300.00', true, true], [2, '350.00', '150.00', false, true], [3, '1000.00', '0.00', false, true]]);
    assert.deepEqual(await ozet(), { sayi: 2, tutarTl: '1350.00' });
    // İptal edilen ödeme avans sayılmaz.
    tamam(await yaz('muhasebe', `/finans/odemeler/${odeme.id}/iptal`, { surum: odeme.surum, neden: 'Deneme' }));
    assert.deepEqual((await liste()).map((x) => x[2]), ['0.00', '0.00', '0.00']);
    await vt().tx((db) => belgeSiparisBagla(db, yoneticiId, { belgeId: fatura.id, siparis: { talepId, teklifId }, siparisFirmaId: firma }));
    assert.deepEqual(await liste(), []);
    assert.deepEqual(await ozet(), { sayi: 0, tutarTl: '0.00' });
    await vt().sorgu('DELETE FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [talepId, teklifId]);
  });
});
