import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { kapanisStokDurumu } from './disari.ts';
import { adimCiktisiCozucusuKaydet, adimStatusuCozucusuKaydet, hurdaSayimiYansit, uretimSayimiYansit } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 1344, 1348 a: dallı rotada her dal kendi malzemesini taşır; birleştirme dalların parçasını tüketir ve emrin ürünü adımın statüsüne girer.
// Senaryo (rapor Y-A): OP10 A dalı (HM1), OP20 B dalı (HM2), OP30 A ve B'yi birleştirir, OP40 son adım; 10 adet.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('stok: dallı rota (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let projeId = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    kisiler.set(ad, await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kart(tur: 'hammadde' | 'yarimamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['SDR-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'SDR-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`sdr-dnm-${sira}`, tur, sira, JSON.stringify({ id: `sdr-dnm-${sira}`, com: { ad: `Dallı deneme ${sira}`, birim: 'adet' } }), kisiler.get('yonetici')],
    ))!.no;
  }
  async function istasyon(): Promise<{ id: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SDM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`SDI${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    const makine = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`SDK-${ist!.id}`, 'Tezgah', ist!.id]);
    return { id: ist!.id, makine: makine!.id };
  }
  const konumu = async (istasyonId: number): Promise<number> => (await o().vt.tx((db) => sorgular.istasyonKonumu(db, istasyonId)))!;
  const kabulKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = async (malzemeId: number, miktar: string): Promise<void> => {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  async function teslimEt(g: Record<string, unknown>): Promise<void> {
    const t = await istek<TeslimCevabi>('depo', 'POST', '/stok/teslimler/gonder', { statuId: null, not: null, kaynakKimligi: randomUUID(), ...g });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const al = await istek('operator', 'POST', `/stok/teslimler/${t.govde.teslim.id}/teslim-al`, { surum: t.govde.teslim.surum, alinan: g.miktar });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
  }
  const statu = async (ad: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
    "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('DNM', $1, $2, '#2F6FDE', 'HM') RETURNING id", [ad, `dalli-${randomBytes(4).toString('hex')}`]))!.id;

  interface Kurulum { e: number; ie: Record<number, number>; urun: number; hm1: number; hm2: number; ist: { a: number; b: number; c: number }; s: Record<number, number> }
  async function kur(bCarpani: number | null = null): Promise<Kurulum> {
    const [urun, hm1, hm2] = [await kart('yarimamul'), await kart('hammadde'), await kart('hammadde')];
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`SDT${String(++sira)}`]))!.id;
    const bekle = (opNo: number) => ({ opNo, tur: 'bekleyen' as const, devirAdedi: null });
    const adim = (s: number, makine: number, ek: Partial<IsEmriGirdisi>): IsEmriGirdisi => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [], ...ek,
    });
    const rev = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       SELECT $1, 'yarimamul', 'ZZ', 'iptal', p.id, p.id, now() FROM (SELECT min(id) AS id FROM kisi) p RETURNING id`, [urun]))!.id;
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const { uretimEmriId: e } = await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: urun, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [
        adim(1, a.makine, { dal: 'A', onculler: [], bilesenler: [{ malzemeNo: hm1, miktar: '0.6' }] }),
        adim(2, b.makine, { dal: 'B', onculler: [], bilesenler: [{ malzemeNo: hm2, miktar: '1' }], adetCarpani: bCarpani }),
        adim(3, c.makine, { onculler: [bekle(10), bekle(20)] }),
        adim(4, c.makine, { onculler: [bekle(30)] }),
      ],
    }));
    const ie = Object.fromEntries((await o().vt.sorgu<{ id: number; op_no: number }>('SELECT id, op_no FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [e])).map((x) => [x.op_no, x.id]));
    const s = { 10: await statu('OP 10'), 20: await statu('OP 20'), 30: await statu('OP 30') };
    adimStatusuCozucusuKaydet(async (_db, g) => (g.uretimEmriId === e ? s[g.opNo as 10 | 20 | 30] ?? null : null));
    return { e, ie, urun, hm1, hm2, ist: { a: a.id, b: b.id, c: c.id }, s };
  }
  const sayim = (k: Kurulum, opNo: number, istasyonId: number, fark: string) =>
    o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: k.e, isEmriId: k.ie[opNo]!, istasyonId, kisiId: kisiler.get('operator')!, fark }));
  const bakiye = async (malzemeId: number, istasyonId: number, statuId: number | null): Promise<number> =>
    Number((await o().vt.tek<{ m: string }>(
      'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3',
      [malzemeId, await konumu(istasyonId), statuId]))!.m);
  const eksiSatir = async (k: Kurulum): Promise<number> => Number((await o().vt.tek<{ n: string }>(
    'SELECT count(*)::text AS n FROM stok_bakiye WHERE malzeme_id = ANY($1) AND miktar < 0', [[k.urun, k.hm1, k.hm2]]))!.n);

  before(async () => {
    ortam = await testVeritabaniKur('stok_dalli');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.DALLI', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol, rol);
    adimCiktisiCozucusuKaydet(async () => null);
  });
  after(async () => { adimStatusuCozucusuKaydet(async () => null); await ortam?.kaldir(); });

  test('Y-A: her dal kendi hammaddesini çevirir; birleştirme iki dalın parçasını tüketir, ürün birleştirme statüsüne girer; emir eksisiz kapanır', async () => {
    const k = await kur();
    await malKabul(k.hm1, '6');
    await malKabul(k.hm2, '10');
    await teslimEt({ malzemeId: k.hm1, miktar: '6', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.a } });
    await teslimEt({ malzemeId: k.hm2, miktar: '10', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.b } });
    assert.equal((await sayim(k, 10, k.ist.a, '10')).uyari, null);
    assert.equal((await sayim(k, 20, k.ist.b, '10')).uyari, null, 'B dalı A dalının parçasını beklemez, eksiden çevirmez');
    assert.deepEqual([await bakiye(k.hm1, k.ist.a, k.s[10]!), await bakiye(k.hm2, k.ist.b, k.s[20]!), await bakiye(k.hm1, k.ist.b, k.s[10]!)], [6, 10, 0]);

    await teslimEt({ malzemeId: k.hm1, miktar: '6', statuId: k.s[10], kaynak: { istasyonId: k.ist.a }, hedef: { istasyonId: k.ist.c } });
    await teslimEt({ malzemeId: k.hm2, miktar: '10', statuId: k.s[20], kaynak: { istasyonId: k.ist.b }, hedef: { istasyonId: k.ist.c } });
    assert.equal((await sayim(k, 30, k.ist.c, '10')).uyari, null);
    assert.deepEqual([await bakiye(k.hm1, k.ist.c, k.s[10]!), await bakiye(k.hm2, k.ist.c, k.s[20]!), await bakiye(k.urun, k.ist.c, k.s[30]!)], [0, 0, 10]);

    // Birleştirme düzeltmesi geri alır: ürün statüden düşer, dalların parçası geri gelir; sonra yeniden sayılır.
    await sayim(k, 30, k.ist.c, '-4');
    assert.deepEqual([await bakiye(k.hm1, k.ist.c, k.s[10]!), await bakiye(k.hm2, k.ist.c, k.s[20]!), await bakiye(k.urun, k.ist.c, k.s[30]!)], [2.4, 4, 6]);
    await sayim(k, 30, k.ist.c, '4');

    assert.equal((await sayim(k, 40, k.ist.c, '10')).uyari, null);
    assert.deepEqual([await bakiye(k.urun, k.ist.c, k.s[30]!), await bakiye(k.urun, k.ist.c, null)], [0, 10]);
    assert.equal(await eksiSatir(k), 0, 'hiçbir istasyonda eksi kalmaz');
    assert.notEqual((await o().vt.tx((db) => kapanisStokDurumu(db, k.e)))?.durum, 'eksik');
  });

  test('1360 (1257 a): B dalı ürün başına 2 parça verir; birleştirme 10 ürün için 20 B parçası, hurda 1 ürün için 2 B parçası düşer', async () => {
    const k = await kur(2);
    await malKabul(k.hm1, '6');
    await malKabul(k.hm2, '20');
    await teslimEt({ malzemeId: k.hm1, miktar: '6', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.a } });
    await teslimEt({ malzemeId: k.hm2, miktar: '20', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.b } });
    await sayim(k, 10, k.ist.a, '10');
    assert.equal((await sayim(k, 20, k.ist.b, '20')).uyari, null);
    await teslimEt({ malzemeId: k.hm1, miktar: '6', statuId: k.s[10], kaynak: { istasyonId: k.ist.a }, hedef: { istasyonId: k.ist.c } });
    await teslimEt({ malzemeId: k.hm2, miktar: '20', statuId: k.s[20], kaynak: { istasyonId: k.ist.b }, hedef: { istasyonId: k.ist.c } });
    assert.equal((await sayim(k, 30, k.ist.c, '9')).uyari, null);
    assert.deepEqual([await bakiye(k.hm1, k.ist.c, k.s[10]!), await bakiye(k.hm2, k.ist.c, k.s[20]!), await bakiye(k.urun, k.ist.c, k.s[30]!)], [0.6, 2, 9]);
    await o().vt.tx((db) => hurdaSayimiYansit(db, {
      uretimEmriId: k.e, isEmriId: k.ie[30]!, istasyonId: k.ist.c, kisiId: kisiler.get('operator')!, hurdaNedeniId: 1, fark: '1',
    }));
    assert.deepEqual([await bakiye(k.hm1, k.ist.c, k.s[10]!), await bakiye(k.hm2, k.ist.c, k.s[20]!)], [0, 0]);
    assert.equal(await eksiSatir(k), 0);
  });

  test('D-A: teslim edilmemiş B dalı hammaddesi "Hammadde" uyarısıyla eksiden çevrilir; birleştirmede hurda iki dalın parçasını fire düşer', async () => {
    const k = await kur();
    const b = await sayim(k, 20, k.ist.b, '2');
    assert.match(b.uyari ?? '', /^Hammadde bu istasyonda yok; 2 eksiden çevrildi/);
    await malKabul(k.hm1, '6');
    await teslimEt({ malzemeId: k.hm1, miktar: '6', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.a } });
    await sayim(k, 10, k.ist.a, '10');
    await teslimEt({ malzemeId: k.hm1, miktar: '6', statuId: k.s[10], kaynak: { istasyonId: k.ist.a }, hedef: { istasyonId: k.ist.c } });
    const h = await o().vt.tx((db) => hurdaSayimiYansit(db, {
      uretimEmriId: k.e, isEmriId: k.ie[30]!, istasyonId: k.ist.c, kisiId: kisiler.get('operator')!, hurdaNedeniId: 1, fark: '1',
    }));
    assert.match(h.uyari ?? '', /eksi/i, 'B dalının parçası birleştirme istasyonunda yok: eksiye fire');
    assert.deepEqual([await bakiye(k.hm1, k.ist.c, k.s[10]!), await bakiye(k.hm2, k.ist.c, k.s[20]!)], [5.4, -1]);
  });
});
