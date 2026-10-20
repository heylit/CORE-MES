import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Belge } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { siparisFaturalari } from './disari.ts';

// 260 a: satış faturası siparişe ve sevke bağlanır; iade faturası asıl faturanın ters yönündedir. Firmalar ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const TARIH = '2026-10-05';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string; alan?: string }

describe('finans satış faturası bağı ve iade (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let firma = 0;
  let baskaFirma = 0;
  let sayac = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get('muhasebe') ?? '' };
    if (yontem === 'POST' && /\/ekle$/.test(yol)) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const tamam = <T>(c: Cevap<T>): T => { assert.ok(c.durum === 200, `${c.durum} ${JSON.stringify(c.govde)}`); return c.govde; };
  const ekle = (g: Record<string, unknown>) => istek<{ belge: Belge } & Hata>('POST', '/finans/belgeler/ekle', {
    yon: 'gelir', kategori: 'urun_satisi', firmaId: firma, belgeTarihi: TARIH, vade: '2026-11-05', tutar: 1000, kdvOrani: 20, ...g,
  });
  const reddet = async (g: Record<string, unknown>, ileti: RegExp, alan?: string) => {
    const c = await ekle(g);
    assert.ok(c.durum === 400 || c.durum === 422, `${c.durum} ${JSON.stringify(c.govde)}`);
    assert.match(c.govde.mesaj, ileti);
    if (alan) assert.equal(c.govde.alan, alan);
  };
  const kisit = async (sql: string, p: unknown[] = []): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
  };
  const tek = async (sql: string, p: unknown[]): Promise<number> => {
    const s = await vt().tek<{ id: number }>(sql, p);
    if (!s) throw new Error(sql);
    return s.id;
  };
  const siparis = (durum: 'taslak' | 'onayli' | 'kapandi' | 'iptal', firmaId = firma): Promise<number> => {
    sayac += 1;
    const onayli = durum === 'onayli' || durum === 'kapandi';
    return tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani, iptal_nedeni)
       VALUES ($1, $2, $3, current_date, current_date + 30, 20, $4, $5, $6, $7) RETURNING id`,
      [`SS-2026-${String(sayac).padStart(3, '0')}`, durum, firmaId, yoneticiId, onayli ? yoneticiId : null, onayli ? new Date().toISOString() : null,
        durum === 'iptal' ? 'Deneme' : null]);
  };

  before(async () => {
    ortam = await testVeritabaniKur('finanssatisbagi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'muhasebe_finans'");
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    await vt().tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme Muhasebe', kullaniciAdi: 'muhasebe', parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol.id);
      await rolAl(db, yoneticiId, k, yr.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'muhasebe', parola: PAROLA } });
    cerez.set('muhasebe', String(c.headers['set-cookie']).split(';')[0] ?? '');
    firma = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'ikisi', $1) RETURNING id", [yoneticiId]);
    baskaFirma = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Öteki', 'ikisi', $1) RETURNING id", [yoneticiId]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('göç: eski belge bağsız kalır; iade, satış bağı ve sevk kısıtları geçersiz satırı reddeder', async () => {
    const eski = tamam(await ekle({})).belge;
    assert.deepEqual([eski.siparisId, eski.sevkiyatIsiId, eski.iadeBelgeId], [null, null, null]);
    const ekleSql = (tur: string, yon: string, kategori: string, siparisId: number | null, sevkId: number | null, iadeId: number | null) => kisit(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, siparis_id, sevkiyat_isi_id, iade_belge_id, olusturan_id)
       VALUES ($1, $2, $3, $4, '2026-10-05', '2026-10-05', 'TRY', 1, 10, 20, $5, $6, $7, $8)`, [yon, tur, kategori, firma, siparisId, sevkId, iadeId, yoneticiId]);
    const s = await siparis('onayli');
    assert.equal(await ekleSql('iade', 'gider', 'satis_iadesi', null, null, null), 'finans_belge_iade');
    assert.equal(await ekleSql('fatura', 'gider', 'satis_iadesi', null, null, eski.id), 'finans_belge_iade');
    assert.equal(await ekleSql('fatura', 'gider', 'mal_alimi', s, null, null), 'finans_belge_satis_bagi');
    assert.equal(await ekleSql('fatura', 'gelir', 'urun_satisi', null, 1, null), 'finans_belge_sevk_siparisli');
    assert.equal(await ekleSql('fatura', 'gelir', 'urun_satisi', s, 999999, null), 'finans_belge_sevk');
    assert.equal(await ekleSql('fatura', 'gelir', 'urun_satisi', 999999, null, null), 'finans_belge_satis_siparisi');
    assert.equal(await ekleSql('iade', 'gider', 'alis_iadesi', null, null, eski.id), 'finans_belge_kategori');
    assert.equal(await kisit(
      `INSERT INTO finans_belge (id, yon, tur, kategori, firma_id, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, iade_belge_id, olusturan_id)
       OVERRIDING SYSTEM VALUE VALUES (999998, 'gider', 'iade', 'satis_iadesi', $1, '2026-10-05', '2026-10-05', 'TRY', 1, 10, 20, 999998, $2)`, [firma, yoneticiId]),
    'finans_belge_iade_kendisi');
  });

  test('FNS-66: satış faturası aynı firmanın onaylı ya da kapanmış siparişine ve sevkine bağlanır; öteki bağlar reddedilir', async () => {
    const onayli = await siparis('onayli');
    const nokta = await tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Deneme Müşteri Noktası', 'musteri', 40, 29) RETURNING id", []);
    const sevk = await tek("INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi) VALUES ($1, $1, 'teslimat', $2, 10, 1) RETURNING id", [TARIH, nokta]);
    const b = tamam(await ekle({ siparisId: onayli, sevkiyatIsiId: sevk })).belge;
    assert.deepEqual([b.siparisId, b.sevkiyatIsiId, b.iadeBelgeId], [onayli, sevk, null]);
    assert.equal(tamam(await ekle({ siparisId: await siparis('kapandi') })).belge.tur, 'fatura');
    await reddet({ siparisId: await siparis('taslak') }, /onaylı ya da kapanmış/, 'siparisId');
    await reddet({ siparisId: await siparis('iptal') }, /onaylı ya da kapanmış/, 'siparisId');
    await reddet({ siparisId: await siparis('onayli', baskaFirma) }, /müşterisi değil/, 'siparisId');
    await reddet({ siparisId: 999999 }, /Sipariş bulunamadı/, 'siparisId');
    await reddet({ yon: 'gider', kategori: 'mal_alimi', siparisId: onayli }, /yalnız satış faturası/, 'siparisId');
    await reddet({ sevkiyatIsiId: sevk }, /yalnız siparişle/, 'sevkiyatIsiId');
    await reddet({ iadeBelgeId: b.id }, /yalnız iade türünde/, 'iadeBelgeId');
    await reddet({ kategori: 'satis_iadesi' }, /yönüne uymuyor/, 'kategori');
    await reddet({ yon: 'gider', kategori: 'satis_iadesi' }, /yalnız iade faturasında/, 'kategori');
    // Siparişe bağlı faturanın firması düzeltmede değişmez.
    const duzelt = await istek<Hata>('POST', `/finans/belgeler/${b.id}/duzelt`, {
      kategori: 'urun_satisi', firmaId: baskaFirma, belgeTarihi: TARIH, vade: '2026-11-05', tutar: 1000, kdvOrani: 20, surum: b.surum,
    });
    assert.equal(duzelt.durum, 422, JSON.stringify(duzelt.govde));
    assert.match(duzelt.govde.mesaj, /firması değişmez/);
  });

  test('FNS-68: sevk iptal edilmemiş teslimattır ve bilinen müşterisi faturanın firmasıdır', async () => {
    const onayli = await siparis('onayli');
    const nokta = (firmaId: number) => tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam, firma_id) VALUES ($1, 'musteri', 40, 29, $2) RETURNING id", [`Deneme Nokta ${firmaId}`, firmaId]);
    const tedarikci = await tek("INSERT INTO sevkiyat_noktasi (ad, tur, enlem, boylam) VALUES ('Deneme Tedarikçi Noktası', 'tedarikci', 40, 29) RETURNING id", []);
    const teslimat = (birakis: number) => tek("INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, birakis_noktasi_id, agirlik_kilogram, palet_sayisi) VALUES ($1, $1, 'teslimat', $2, 10, 1) RETURNING id", [TARIH, birakis]);
    const kendi = await nokta(firma);
    const sevk = await teslimat(kendi);
    assert.equal(tamam(await ekle({ siparisId: onayli, sevkiyatIsiId: sevk })).belge.sevkiyatIsiId, sevk);
    await reddet({ siparisId: onayli, sevkiyatIsiId: await teslimat(await nokta(baskaFirma)) }, /sevkin müşterisi değil/, 'sevkiyatIsiId');
    const alim = await tek("INSERT INTO sevkiyat_isi (tarih, istenen_tarih, tur, alis_noktasi_id, agirlik_kilogram, palet_sayisi) VALUES ($1, $1, 'alim', $2, 10, 1) RETURNING id", [TARIH, tedarikci]);
    await reddet({ siparisId: onayli, sevkiyatIsiId: alim }, /yalnız teslimat/, 'sevkiyatIsiId');
    const iptal = await teslimat(kendi);
    await vt().sorgu('UPDATE sevkiyat_isi SET iptal_edildi = now() WHERE id = $1', [iptal]);
    await reddet({ siparisId: onayli, sevkiyatIsiId: iptal }, /İptal edilmiş sevk/, 'sevkiyatIsiId');
    await reddet({ siparisId: onayli, sevkiyatIsiId: 999999 }, /Sevk işi bulunamadı/, 'sevkiyatIsiId');
  });

  test('FNS-67: iade ters yönde, aynı firma ve para biriminde; sipariş ve sevki asıldan alır; toplamı asılı geçmez', async () => {
    const s = await siparis('onayli');
    const asil = tamam(await ekle({ siparisId: s })).belge;
    const iade = (g: Record<string, unknown> = {}) => ekle({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: asil.id, tutar: 400, ...g });
    const i1 = tamam(await iade()).belge;
    assert.deepEqual([i1.yon, i1.tur, i1.siparisId, i1.iadeBelgeId, i1.toplam], ['gider', 'iade', s, asil.id, '480.00']);
    await reddet({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: asil.id, tutar: 600.01 }, /toplamını geçemez/, 'tutar');
    tamam(await iade({ tutar: 600 }));
    await reddet({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: asil.id, tutar: 0.01 }, /toplamını geçemez/, 'tutar');
    await reddet({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: i1.id, tutar: 1 }, /Yalnız faturanın/, 'iadeBelgeId');
    await reddet({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: null, tutar: 1 }, /iade edilen fatura seçilir/, 'iadeBelgeId');
    await reddet({ yon: 'gelir', tur: 'iade', kategori: 'alis_iadesi', iadeBelgeId: asil.id, tutar: 1 }, /ters yön/, 'iadeBelgeId');
    await reddet({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: asil.id, firmaId: baskaFirma, tutar: 1 }, /firması/, 'iadeBelgeId');
    await reddet({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: asil.id, siparisId: await siparis('onayli'), tutar: 1 }, /asıl faturanınkidir/, 'siparisId');

    // Alış faturasının iadesi gelir yönündedir.
    const alis = tamam(await ekle({ yon: 'gider', kategori: 'mal_alimi', tutar: 100 })).belge;
    const alisIadesi = tamam(await ekle({ yon: 'gelir', tur: 'iade', kategori: 'alis_iadesi', iadeBelgeId: alis.id, tutar: 100 })).belge;
    assert.deepEqual([alisIadesi.yon, alisIadesi.siparisId], ['gelir', null]);

    // İadesi olan fatura iptal edilmez; iptal edilmiş faturanın iadesi girilmez.
    const iptal = await istek<Hata>('POST', `/finans/belgeler/${alis.id}/iptal`, { surum: alis.surum, neden: 'Deneme' });
    assert.equal(iptal.durum, 422, JSON.stringify(iptal.govde));
    assert.match(iptal.govde.mesaj, /önce iadeleri iptal edin/);
    const bos = tamam(await ekle({ yon: 'gider', kategori: 'mal_alimi', tutar: 50 })).belge;
    tamam(await istek('POST', `/finans/belgeler/${bos.id}/iptal`, { surum: bos.surum, neden: 'Deneme' }));
    await reddet({ yon: 'gelir', tur: 'iade', kategori: 'alis_iadesi', iadeBelgeId: bos.id, tutar: 1 }, /İptal edilmiş/, 'iadeBelgeId');

    // Düzeltmede de iadeler asıl faturayı geçmez.
    const buyut = await istek<Hata>('POST', `/finans/belgeler/${i1.id}/duzelt`, {
      kategori: 'satis_iadesi', firmaId: firma, belgeTarihi: TARIH, vade: '2026-11-05', tutar: 401, kdvOrani: 20, surum: i1.surum,
    });
    assert.equal(buyut.durum, 400, JSON.stringify(buyut.govde));
    const kucult = await istek<Hata>('POST', `/finans/belgeler/${asil.id}/duzelt`, {
      kategori: 'urun_satisi', firmaId: firma, belgeTarihi: TARIH, vade: '2026-11-05', tutar: 999, kdvOrani: 20, surum: asil.surum,
    });
    assert.equal(kucult.durum, 400, JSON.stringify(kucult.govde));
  });

  test('satış formu siparişleri: firmanın yalnız onaylı ve kapanmış siparişleri, yeniden eskiye; firma zorunlu; yetki finans.yaz', async () => {
    const f = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Seçim', 'musteri', $1) RETURNING id", [yoneticiId]);
    const onayli = await siparis('onayli', f);
    const kapandi = await siparis('kapandi', f);
    await siparis('taslak', f);
    await siparis('iptal', f);
    await siparis('onayli', baskaFirma);
    const c = tamam(await istek<{ siparisler: { id: number; durum: string }[] }>('GET', `/finans/satis-siparisleri?firmaId=${f}`));
    assert.deepEqual(c.siparisler.map((x) => [x.id, x.durum]).sort((x, y) => Number(x[0]) - Number(y[0])), [[onayli, 'onayli'], [kapandi, 'kapandi']]);
    assert.equal((await istek('GET', '/finans/satis-siparisleri')).durum, 400);
    // 302 a: siparişin sevkleri Sevkiyat'tan gelir; emri olmayan siparişte liste boştur, sipariş zorunludur.
    assert.deepEqual(tamam(await istek<{ sevkler: unknown[] }>('GET', `/finans/satis-sevkleri?siparisId=${onayli}`)), { sevkler: [] });
    assert.equal((await istek('GET', '/finans/satis-sevkleri')).durum, 400);
    assert.equal((await app.inject({ method: 'GET', url: `/api/finans/satis-sevkleri?siparisId=${onayli}` })).statusCode, 401);
    const yetkisiz = await app.inject({ method: 'GET', url: `/api/finans/satis-siparisleri?firmaId=${f}` });
    assert.equal(yetkisiz.statusCode, 401);
  });

  test('disari.siparisFaturalari: siparişe göre gruplar, net TL kur ile, iptal edilmiş belge girmez, faturasız sipariş haritada yok', async () => {
    const s = await siparis('onayli');
    const bos = await siparis('onayli');
    const f1 = tamam(await ekle({ siparisId: s, paraBirimi: 'EUR', kur: 35.5, tutar: 100 })).belge;
    const f2 = tamam(await ekle({ siparisId: s, tutar: 50 })).belge;
    tamam(await istek('POST', `/finans/belgeler/${f2.id}/iptal`, { surum: f2.surum, neden: 'Deneme' }));
    const iade = tamam(await ekle({ yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', iadeBelgeId: f1.id, paraBirimi: 'EUR', kur: 36, tutar: 10 })).belge;
    const harita = await vt().tx((db) => siparisFaturalari(db, [s, bos, s]));
    assert.equal(harita.has(bos), false);
    const satirlar = harita.get(s) ?? [];
    assert.deepEqual(satirlar.map((x) => [x.id, x.tur, x.paraBirimi, x.tutar, x.netTl]), [
      [f1.id, 'fatura', 'EUR', '100.00', '3550.00'],
      [iade.id, 'iade', 'EUR', '10.00', '360.00'],
    ]);
    assert.equal(satirlar[1]?.iadeBelgeId, f1.id);
  });
});
