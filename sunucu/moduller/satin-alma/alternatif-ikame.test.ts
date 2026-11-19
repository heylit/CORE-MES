import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AcilisCevabi, Talebim, Talep } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emrinRezerveleri, emirIptalYansit } from '../stok/disari.ts';
import { emirMalzemeIhtiyaci, emirNolari, ikameIcinEmriKilitle } from '../uretim-emirleri/disari.ts';
import { kablola } from '../../kablolama.ts';
import { emirTedarikDurumlari } from './disari.ts';
import { ILETILER, alternatifSiparisReddi } from './kurallar.ts';
import * as s from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

// 3437-3b-3b (Risk plan 2): alternatifle verilen sipariş emrin bileşenini alternatif karta geçirir (ikame). Kosullar: emre bağlı, fasonsuz
// kalem; aktif alternatif kart; aynı stok birimi; emirde istenen karttan sarf ve ayırma yok; sipariş emrin bütün ihtiyacını karşılar.
describe('3437-3b-3b: alternatifli siparişin ret sırası (saf)', () => {
  const g = (ek: Partial<Parameters<typeof alternatifSiparisReddi>[0]> = {}) => alternatifSiparisReddi({
    ad: 'Deneme çubuk', emirNo: 'E-1', fason: false, emirVar: true, kart: { kod: 'HM-1', onayDurumu: 'aktif', birim: 'adet' },
    anaBirim: 'adet', siparisBirimi: 'adet', miktar: '10', ihtiyac: '10', kullanilan: '0', ...ek,
  });
  test('izinli: koşullar sağlanınca ret yok; fazla miktar ve birimin yazımı (büyük harf, boşluk) engellemez', () => {
    assert.equal(g(), null);
    assert.equal(g({ miktar: '12', siparisBirimi: ' Adet ' }), null);
  });
  test('yasak: fason, emirsiz, kartsız, iptal ve onaydaki kart, birim farkı, emirde olmayan malzeme, kullanılmış ihtiyaç, kısmi miktar', () => {
    assert.equal(g({ fason: true, emirVar: false }), ILETILER.alternatifFason('Deneme çubuk'));
    assert.equal(g({ emirVar: false }), ILETILER.alternatifEmirsiz('Deneme çubuk'));
    assert.equal(g({ kart: undefined }), ILETILER.alternatifSiparis('Deneme çubuk'));
    assert.equal(g({ kart: { kod: 'HM-1', onayDurumu: 'iptal', birim: 'adet' } }), ILETILER.alternatifKartIptal('Deneme çubuk', 'HM-1'));
    assert.equal(g({ kart: { kod: 'HM-1', onayDurumu: 'onayda', birim: 'adet' } }), ILETILER.alternatifKartOnayda('Deneme çubuk', 'HM-1'));
    assert.equal(g({ kart: { kod: 'HM-1', onayDurumu: 'aktif', birim: 'kg' } }), ILETILER.alternatifBirim('Deneme çubuk', 'kg', 'adet'));
    assert.equal(g({ siparisBirimi: 'kg' }), ILETILER.alternatifSiparisBirimi('Deneme çubuk', 'kg', 'adet'));
    assert.equal(g({ kart: { kod: 'HM-1', onayDurumu: 'aktif', birim: null }, anaBirim: null, siparisBirimi: '' }), ILETILER.alternatifBirim('Deneme çubuk', null, null));
    assert.equal(ILETILER.alternatifBirim('Deneme çubuk', 'kg', null), 'Deneme çubuk: istenen malzemenin stok birimi tanımlı değil; bu alternatifle sipariş verilemez.');
    assert.equal(g({ ihtiyac: null }), ILETILER.alternatifEmirdeYok('Deneme çubuk', 'E-1'));
    assert.equal(g({ kullanilan: '0.5' }), ILETILER.alternatifEmirdeKullanildi('Deneme çubuk', 'E-1'));
    assert.equal(g({ miktar: '9.5' }), ILETILER.alternatifEksik('Deneme çubuk', 'E-1', '10 adet'));
  });
});

describe('3437-3b-3b: alternatifli sipariş emrin bileşenini ikame eder (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '', sa: '', mudur: '' };
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const get = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await o().vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  let sira = 0;
  const kartAc = async (kayit: Record<string, unknown>, tur = 'hammadde'): Promise<number> => {
    sira += 1;
    const kimlik = `aik-${String(sira)}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, $2, 'HM-AIK-', $3, 'aktif', $4, $5, $5, false) RETURNING no`,
      [kimlik, tur, sira, JSON.stringify({ id: kimlik, com: { ad: `Örnek ${kimlik}`, birim: 'adet' }, fam: 'metal', cls: 'aluminyum', ...kayit }), yoneticiId]))!.no;
  };
  let ana = 0;
  let urun = 0;
  let rev = 0;

  // Emir fikstürü (stok.test.ts rotaliEmir): uretim-emirleri tablolarına sahip bağlantısıyla; iş emri başına [sıra, malzeme, birim miktar].
  async function emir(adet: number, bilesenler: [number, number, string][]): Promise<{ id: number; isEmirleri: number[] }> {
    sira += 1;
    const v = o().sahip;
    const im = (await v.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`AIK${sira}`, 'Deneme Merkezi']))!.id;
    const ist = (await v.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`AIS${sira}`, `Deneme ${sira}`, im]))!.id;
    const tip = (await v.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`AT-${sira}`]))!.id;
    const e = (await v.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [`P-AIK-${sira}`, 'Deneme', adet, ist, yoneticiId, urun, rev]))!.id;
    const isEmirleri = new Map<number, number>();
    for (const [sr, malzeme, miktar] of bilesenler) {
      if (!isEmirleri.has(sr)) {
        isEmirleri.set(sr, (await v.tek<{ id: number }>('INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [e, sr, sr * 10, tip, `OP ${sr * 10}`]))!.id);
      }
      await v.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar) VALUES ($1, $2, $3)', [isEmirleri.get(sr), malzeme, miktar]);
    }
    return { id: e, isEmirleri: [...isEmirleri.values()] };
  }
  const bilesenKartlari = async (emirId: number) => (await o().sahip.sorgu<{ no: number }>(
    `SELECT b.malzeme_no AS no FROM uretim_emirleri_is_emri_bileseni b JOIN uretim_emirleri_is_emri i ON i.id = b.is_emri_id
      WHERE i.uretim_emri_id = $1 ORDER BY i.sira, b.malzeme_no`, [emirId])).map((x) => x.no);
  const ikameler = (emirId: number) => o().sahip.sorgu<{ ana: number; alt: number; kaynak: string }>(
    'SELECT ana_malzeme_no AS ana, alternatif_malzeme_no AS alt, kaynak FROM uretim_emirleri_bilesen_ikamesi WHERE uretim_emri_id = $1', [emirId]);

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_alternatif_ikame');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.mudur = await rolluKisi('mudur', 'mudur');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-AIK-', 100) ON CONFLICT (onek) DO NOTHING");
    ana = await kartAc({ grade: '6082', form: 'cubuk', dims: { d: 50, l: 3000 }, opts: { durum: 'T6', yuzey: 'Ham' } });
    urun = await kartAc({ com: { ad: 'Örnek mamul', birim: 'adet' } }, 'mamul');
    rev = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [urun, yoneticiId]))!.id;
    const kural = await post(c.yonetici, '/malzeme-alternatifleri/kurallar/kaydet', {
      kapsamTuru: 'sinif', kapsam: 'metal/aluminyum', kaliteAcik: null, durumAcik: null, sartliAcik: null, boyUzunKesilir: null, yuzeySerbest: null,
      payTuru: 'mm', payDeger: 5, payEnAzMm: null, kapali: null, gerekce: null,
    });
    assert.equal(kural.statusCode, 200, kural.body);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t;
    return g;
  };
  const satinAlmaGorur = async (id: string) => ((await get(c.sa, '/satin-alma-acilis')).json() as AcilisCevabi).talepler.find((x) => x.id === id)!;
  const kaydet = (t: Record<string, unknown> & { id: string }) => post(c.sa, `/satin-alma-talepleri/${t.id}/kaydet`, t);
  const teklif = (fiyatlar: Record<string, unknown>[]) => ({
    id: randomUUID(), firmaId: null, tedarikciAdi: 'Deneme Tedarik', teklifTarihi: '2026-11-19', gecerlilik: null,
    paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7,
    vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar,
  });
  const karar = (teklifId: string) => ({ mod: 'tek', teklifId, bolunme: [], gerekce: '', kararVerenKisiId: 1, kararTarihi: '2026-11-19', ogrenilenler: '', sabitKurlar: [], siparisler: [] });

  // Emre bağlı talep, sınır içindeki alternatifle (d 52) onaylanır; alternatifin kartı ONAYDA açılır. l, alternatif kartı ayırır (aynı l aynı kart).
  async function onayli(emirId: number | null, l: number, miktar = '10'): Promise<{ t: Talep; q: string; kartNo: number }> {
    const a = (await post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ malzemeNo: ana, miktar }] })).json() as Talebim;
    if (emirId !== null) await o().sahip.sorgu('UPDATE satin_alma_talep SET uretim_emri_id = $2 WHERE id = $1', [a.id, emirId]);
    const d = await kaydet({ ...govde(await satinAlmaGorur(a.id)), durum: 'degerlendirme' });
    assert.equal(d.statusCode, 200, d.body);
    const t1 = d.json() as Talep;
    const q = teklif([{ kalemId: t1.kalemler[0]!.id, birimFiyat: '12', alternatif: { kalite: null, durum: null, yuzey: null, olcu: { d: 52, l } } }]);
    const t2 = (await kaydet({ ...govde(t1), teklifler: [q] })).json() as Talep;
    const g = await kaydet({ ...govde(t2), durum: 'onayda', karar: karar(q.id) });
    assert.equal(g.statusCode, 200, g.body);
    const r = await post(c.mudur, `/satin-alma-talepleri/${a.id}/kaydet`, { ...govde(g.json() as Talep), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] });
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talep;
    return { t, q: q.id, kartNo: t.teklifler[0]!.fiyatlar[0]!.alternatifSonucu!.kartNo! };
  }
  const kartiOnayla = (no: number) => o().sahip.sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'aktif', gkk_gerekli = false WHERE no = $1", [no]);
  const siparisVer = (x: { t: Talep; q: string }) => kaydet({ ...govde(x.t), durum: 'siparis_verildi', karar: { ...x.t.karar!, siparisler: [{ teklifId: x.q, siparisNo: `AIK-${String(++sira)}`, siparisTarihi: '2026-11-19', beklenenTeslim: '2026-11-26' }] } });
  const mesaj = (r: { statusCode: number; body: string }) => [r.statusCode, (JSON.parse(r.body) as { mesaj?: string }).mesaj];
  const satirId = async (talepId: string) => (await o().sahip.tek<{ id: number }>('SELECT id FROM satin_alma_siparis_satiri WHERE talep_id = $1', [talepId]))!.id;
  const kabul = (malzemeId: number, siparisSatirId: number, miktar = '10') => post(c.yonetici, '/stok/mal-kabul', {
    tur: 'satin_alma', irsaliyeNo: `AIK-IRS-${String(++sira)}`, satirlar: [{ malzemeId, miktar, siparisSatirId, parti: { tedarikciPartiNo: `AIK-TP-${String(sira)}` } }],
  });

  test('izinli: kart onayda iken sipariş verilmez; kart aktif olunca emrin bileşeni alternatife geçer; ihtiyaç, yolda ve tedarik alternatif kartta; '
    + 'mal kabul emre ayrılır, alternatif karttan sarf yapılır, emir iptalinde ayırma kalkar', async () => {
    const e = await emir(5, [[1, ana, '2']]);
    const x = await onayli(e.id, 3200);
    const kod = (await o().sahip.tek<{ kod: string }>("SELECT kayit->'com'->>'kod' AS kod FROM malzeme_katalog_karti WHERE no = $1", [x.kartNo]))!.kod;
    assert.deepEqual(mesaj(await siparisVer(x)), [422, ILETILER.alternatifKartOnayda(x.t.kalemler[0]!.ad, kod)]);
    assert.deepEqual(await bilesenKartlari(e.id), [ana], 'reddedilen sipariş bileşene dokunmaz');
    await kartiOnayla(x.kartNo);
    const r = await siparisVer(x);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(await bilesenKartlari(e.id), [x.kartNo]);
    const t = r.json() as Talep;
    assert.deepEqual(await ikameler(e.id), [{ ana, alt: x.kartNo, kaynak: `Satın alma ${t.no}` }]);
    assert.ok(t.hareketler.some((h) => h.metin.includes(`yerine alternatif ${kod} kullanılır`)), JSON.stringify(t.hareketler.map((h) => h.metin)));
    // K1, C2: emir istenen kartı artık beklemez; tek kart (alternatif) ihtiyaçta, yolda ve tedarik durumunda görünür.
    assert.deepEqual(((await o().vt.tx((db) => emirMalzemeIhtiyaci(db, e.id))) ?? []).map((m) => [m.malzemeNo, Number(m.brut)]), [[x.kartNo, 10]]);
    assert.deepEqual((await s.malzemeGelisleriOku(o().vt, [ana, x.kartNo])).map((m) => [m.malzemeNo, Number(m.miktar)]), [[x.kartNo, 10]]);
    assert.deepEqual((await o().vt.tx((db) => emirTedarikDurumlari(db, [e.id], []))).map((d) => [d.malzemeNo, d.asama]), [[x.kartNo, 'siparis']]);
    // Aynı siparişi yeniden kaydetmek ikameyi değiştirmez.
    const y = await kaydet({ ...govde(t) });
    assert.equal(y.statusCode, 200, y.body);
    assert.equal((await ikameler(e.id)).length, 1);
    // Mal kabul: alternatif kart bu emre ayrılır (bekleyen alternatif kart üzerinden), sipariş kapanır (K3).
    const sid = await satirId(x.t.id);
    const k = await kabul(x.kartNo, sid);
    assert.equal(k.statusCode, 200, k.body);
    assert.equal(Number((await o().vt.tx((db) => emrinRezerveleri(db, e.id))).get(x.kartNo)), 10);
    assert.equal((await o().vt.tx((db) => emrinRezerveleri(db, e.id))).has(ana), false);
    assert.deepEqual(await o().vt.tx((db) => emirTedarikDurumlari(db, [e.id], [])), []);
    assert.deepEqual(await s.malzemeGelisleriOku(o().vt, [ana, x.kartNo]), []);
    // C4: sarf alternatif karttan, emre ayrılmış miktardan düşer.
    const konum = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const parti = (await o().sahip.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1', [x.kartNo]))!.id;
    const sarf = await post(c.yonetici, '/stok/cikis', { malzemeId: x.kartNo, konumId: konum, partiId: parti, miktar: '4', cikisNedeni: 'uretime_sarf', uretimEmriId: e.id });
    assert.equal(sarf.statusCode, 200, sarf.body);
    assert.equal(Number((await o().vt.tx((db) => emrinRezerveleri(db, e.id))).get(x.kartNo)), 6);
    // C3: emir iptalinde ayırma bugünkü kuralla kalkar; kart fark etmez.
    await o().vt.tx((db) => emirIptalYansit(db, { uretimEmriId: e.id, kisiId: yoneticiId }));
    assert.equal((await o().vt.tx((db) => emrinRezerveleri(db, e.id))).size, 0);
  });

  test('P3: iki emir aynı alternatif kartı beklerken mal sipariş satırının emrine ayrılır, öteki emre dağıtılmaz', async () => {
    const e1 = await emir(5, [[1, ana, '2']]);
    const e2 = await emir(5, [[1, ana, '2']]);
    const x1 = await onayli(e1.id, 3300);
    await kartiOnayla(x1.kartNo);
    const x2 = await onayli(e2.id, 3300);
    assert.equal(x2.kartNo, x1.kartNo, 'aynı nitelik aynı kartı kullanır');
    assert.equal((await siparisVer(x2)).statusCode, 200);
    assert.equal((await siparisVer(x1)).statusCode, 200);
    assert.equal((await kabul(x1.kartNo, await satirId(x1.t.id))).statusCode, 200);
    assert.equal(Number((await o().vt.tx((db) => emrinRezerveleri(db, e1.id))).get(x1.kartNo)), 10);
    assert.equal((await o().vt.tx((db) => emrinRezerveleri(db, e2.id))).has(x1.kartNo), false);
  });

  test('yasak: emirsiz, fason, emirde istenen karttan ayırma, kısmi miktar, emirde olmayan malzeme ve birim farkı 422; bileşen değişmez', async () => {
    const emirsiz = await onayli(null, 3400);
    await kartiOnayla(emirsiz.kartNo);
    assert.deepEqual(mesaj(await siparisVer(emirsiz)), [422, ILETILER.alternatifEmirsiz(emirsiz.t.kalemler[0]!.ad)]);

    const ef = await emir(5, [[1, ana, '2']]);
    const fason = await onayli(ef.id, 3400);
    await o().sahip.sorgu('UPDATE satin_alma_talep_kalemi SET is_emri_id = $2 WHERE talep_id = $1', [fason.t.id, ef.isEmirleri[0]]);
    assert.deepEqual(mesaj(await siparisVer(fason)), [422, ILETILER.alternatifFason(fason.t.kalemler[0]!.ad)]);
    await o().sahip.sorgu('UPDATE satin_alma_talep_kalemi SET is_emri_id = NULL WHERE talep_id = $1', [fason.t.id]);

    const ad = fason.t.kalemler[0]!.ad;
    const no = (await o().vt.tx((db) => emirNolari(db, [ef.id]))).get(ef.id)!;
    await o().sahip.sorgu('INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, NULL, $2, 3)', [ana, ef.id]);
    assert.deepEqual(mesaj(await siparisVer(fason)), [422, ILETILER.alternatifEmirdeKullanildi(ad, no)]);
    await o().sahip.sorgu('DELETE FROM stok_rezerve WHERE uretim_emri_id = $1', [ef.id]);

    const eb = await emir(6, [[1, ana, '2']]);
    const kismi = await onayli(eb.id, 3400);
    const nob = (await o().vt.tx((db) => emirNolari(db, [eb.id]))).get(eb.id)!;
    assert.deepEqual(mesaj(await siparisVer(kismi)), [422, ILETILER.alternatifEksik(ad, nob, '12 adet')]);

    const baska = await kartAc({ com: { ad: 'Örnek başka', birim: 'adet' } });
    const ey = await emir(5, [[1, baska, '2']]);
    const yok = await onayli(ey.id, 3400);
    const noy = (await o().vt.tx((db) => emirNolari(db, [ey.id]))).get(ey.id)!;
    assert.deepEqual(mesaj(await siparisVer(yok)), [422, ILETILER.alternatifEmirdeYok(ad, noy)]);

    const ek = await emir(5, [[1, ana, '2']]);
    const birim = await onayli(ek.id, 3400);
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,birim}', '\"kg\"') WHERE no = $1", [birim.kartNo]);
    assert.deepEqual(mesaj(await siparisVer(birim)), [422, ILETILER.alternatifBirim(ad, 'kg', 'adet')]);
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,birim}', '\"adet\"') WHERE no = $1", [birim.kartNo]);
    for (const e of [ef, eb, ey, ek]) assert.equal((await ikameler(e.id)).length, 0);
    assert.deepEqual(await bilesenKartlari(ef.id), [ana]);
    // Engel kalkınca aynı sipariş verilir (fazla miktar engellemez).
    assert.equal((await siparisVer(fason)).statusCode, 200);
    assert.deepEqual(await bilesenKartlari(ef.id), [fason.kartNo]);
  });

  test('yasak (Test T1, T2): emre istenen karttan net sarf yapılmışsa ve sipariş birimi stok birimi değilse 422; bileşen değişmez', async () => {
    const e = await emir(5, [[1, ana, '2']]);
    const x = await onayli(e.id, 3800);
    await kartiOnayla(x.kartNo);
    const ad = x.t.kalemler[0]!.ad;
    const no = (await o().vt.tx((db) => emirNolari(db, [e.id]))).get(e.id)!;
    const giris = await post(c.yonetici, '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: ana, miktar: '2', parti: { tedarikciPartiNo: `AIK-TP-${String(++sira)}` } }] });
    assert.equal(giris.statusCode, 200, giris.body);
    const konum = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const parti = (await o().sahip.tek<{ id: number }>('SELECT max(id) AS id FROM stok_parti WHERE malzeme_id = $1', [ana]))!.id;
    const sarf = await post(c.yonetici, '/stok/cikis', { malzemeId: ana, konumId: konum, partiId: parti, miktar: '1', cikisNedeni: 'uretime_sarf', uretimEmriId: e.id });
    assert.equal(sarf.statusCode, 200, sarf.body);
    assert.deepEqual(mesaj(await siparisVer(x)), [422, ILETILER.alternatifEmirdeKullanildi(ad, no)]);
    assert.deepEqual(await bilesenKartlari(e.id), [ana]);

    const e2 = await emir(5, [[1, ana, '2']]);
    const y = await onayli(e2.id, 3800);
    await o().sahip.sorgu("UPDATE satin_alma_talep_kalemi SET birim = 'kg' WHERE talep_id = $1", [y.t.id]);
    const yeni = (await satinAlmaGorur(y.t.id)) as unknown as Talep;
    assert.deepEqual(mesaj(await siparisVer({ t: yeni, q: y.q })), [422, ILETILER.alternatifSiparisBirimi(ad, 'kg', 'adet')]);
    assert.deepEqual(await bilesenKartlari(e2.id), [ana]);
  });

  test('Risk D1: kullanım emir kilidinden sonra okunur; kilidi tutan işlem ayırma yazarsa sipariş onu görür ve 422 döner', async () => {
    const e = await emir(5, [[1, ana, '2']]);
    const x = await onayli(e.id, 3700);
    await kartiOnayla(x.kartNo);
    const no = (await o().vt.tx((db) => emirNolari(db, [e.id]))).get(e.id)!;
    let kilitli: () => void = () => undefined;
    const kilitAlindi = new Promise<void>((r) => { kilitli = r; });
    let birak: () => void = () => undefined;
    const bekle = new Promise<void>((r) => { birak = r; });
    const tutan = o().sahip.tx(async (db) => {
      await ikameIcinEmriKilitle(db, e.id);
      await db.sorgu('INSERT INTO stok_rezerve (malzeme_id, statu_id, uretim_emri_id, miktar) VALUES ($1, NULL, $2, 3)', [ana, e.id]);
      kilitli();
      await bekle;
    });
    await kilitAlindi;
    const siparis = siparisVer(x);
    await new Promise((r) => setTimeout(r, 300));
    birak();
    await tutan;
    assert.deepEqual(mesaj(await siparis), [422, ILETILER.alternatifEmirdeKullanildi(x.t.kalemler[0]!.ad, no)]);
    assert.deepEqual(await bilesenKartlari(e.id), [ana]);
  });

  test('N1: alternatif kartı iptal edilmişse sipariş 422; karar yeniden onaylanınca yeni kart açılır ve sipariş onunla verilir', async () => {
    const e = await emir(5, [[1, ana, '2']]);
    const x = await onayli(e.id, 3500);
    await o().sahip.sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'iptal' WHERE no = $1", [x.kartNo]);
    const kod = (await o().sahip.tek<{ kod: string }>("SELECT kayit->'com'->>'kod' AS kod FROM malzeme_katalog_karti WHERE no = $1", [x.kartNo]))!.kod;
    assert.deepEqual(mesaj(await siparisVer(x)), [422, ILETILER.alternatifKartIptal(x.t.kalemler[0]!.ad, kod)]);
    const geri = await kaydet({ ...govde(x.t), durum: 'degerlendirme' });
    assert.equal(geri.statusCode, 200, geri.body);
    const g = await kaydet({ ...govde(geri.json() as Talep), durum: 'onayda' });
    assert.equal(g.statusCode, 200, g.body);
    const r = await post(c.mudur, `/satin-alma-talepleri/${x.t.id}/kaydet`, { ...govde(g.json() as Talep), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] });
    assert.equal(r.statusCode, 200, r.body);
    const t = r.json() as Talep;
    const yeni = t.teklifler[0]!.fiyatlar[0]!.alternatifSonucu!.kartNo!;
    assert.notEqual(yeni, x.kartNo);
    await kartiOnayla(yeni);
    assert.equal((await siparisVer({ t, q: x.q })).statusCode, 200);
    assert.deepEqual(await bilesenKartlari(e.id), [yeni]);
  });

  test('C3: teslimsiz iptalde bileşen istenen karta döner, emir yeniden onu bekler; teslimden sonra iptalde ikame kalır', async () => {
    const e = await emir(5, [[1, ana, '2']]);
    const x = await onayli(e.id, 3600);
    await kartiOnayla(x.kartNo);
    const r = await siparisVer(x);
    assert.equal(r.statusCode, 200, r.body);
    const iptal = await kaydet({ ...govde(r.json() as Talep), durum: 'iptal', iptalNedeni: 'Deneme iptal' });
    assert.equal(iptal.statusCode, 200, iptal.body);
    assert.deepEqual(await bilesenKartlari(e.id), [ana]);
    assert.deepEqual(await ikameler(e.id), []);
    assert.ok((iptal.json() as Talep).hareketler.some((h) => h.metin.includes('alternatif sipariş iptal edildi;') && h.metin.includes('malzemesini bekler')));
    assert.deepEqual(((await o().vt.tx((db) => emirMalzemeIhtiyaci(db, e.id))) ?? []).map((m) => m.malzemeNo), [ana]);

    const e2 = await emir(5, [[1, ana, '2']]);
    const x2 = await onayli(e2.id, 3600);
    const r2 = await siparisVer(x2);
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal((await kabul(x2.kartNo, await satirId(x2.t.id), '4')).statusCode, 200);
    const iptal2 = await kaydet({ ...govde(r2.json() as Talep), durum: 'iptal', iptalNedeni: 'Deneme iptal' });
    assert.equal(iptal2.statusCode, 200, iptal2.body);
    assert.deepEqual(await bilesenKartlari(e2.id), [x2.kartNo], 'teslim varken ikame kalır (varsayım)');
  });
});
