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
import { emirMalzemeIhtiyaci, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { adimCiktisiCozucusuKaydet, adimStatusuCozucusuKaydet, uretimSayimiYansit } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 1476-C: çok katmanlı emirde alt düğümün adımı statüsünü ve çıktısını düğümün malzemesi ve rotadaki op numarasıyla alır; düğümün son
// adımı alt parçayı verir, tüketen üst adım alt parçayı kök başına adediyle tüketir (1482 a).
// Senaryo: kök URUN; alt düğüm 0.1 ALT (kök başına 2). ALT: OP1010 (rotada 10, HM2 x1), OP1020 (rotada 20, son). URUN: OP10 (HM1 x0.5,
// ALT'ı tüketir), OP20 (son). 10 adet.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('stok: çok katmanlı emir (gerçek PostgreSQL)', () => {
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
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['SDG-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'SDG-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`sdg-dnm-${sira}`, tur, sira, JSON.stringify({ id: `sdg-dnm-${sira}`, com: { ad: `Düğüm deneme ${sira}`, birim: 'adet' } }), kisiler.get('yonetici')],
    ))!.no;
  }
  async function istasyon(): Promise<{ id: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`SGM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`SGI${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    const makine = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`SGK-${ist!.id}`, 'Tezgah', ist!.id]);
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
    "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('DNM', $1, $2, '#2F6FDE', 'HM') RETURNING id", [ad, `dugum-${randomBytes(4).toString('hex')}`]))!.id;
  const revizyon = async (malzemeId: number): Promise<number> => (await o().sahip.tek<{ id: number }>(
    `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
     SELECT $1, 'yarimamul', 'ZZ', 'iptal', p.id, p.id, now() FROM (SELECT min(id) AS id FROM kisi) p RETURNING id`, [malzemeId]))!.id;

  interface Kurulum { e: number; ie: Record<number, number>; urun: number; alt: number; hm1: number; hm2: number; ist: { a: number; b: number; c: number }; s: { kok: number; alt: number } }
  async function kur(): Promise<Kurulum> {
    const [urun, alt, hm1, hm2] = [await kart('yarimamul'), await kart('yarimamul'), await kart('hammadde'), await kart('hammadde')];
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`SGT${String(++sira)}`]))!.id;
    const bekle = (opNo: number) => ({ opNo, tur: 'bekleyen' as const, devirAdedi: null });
    const adim = (s: number, opNo: number, makine: number, ek: Partial<IsEmriGirdisi>): IsEmriGirdisi => ({
      sira: s, opNo, ad: `Adım ${opNo}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [], ...ek,
    });
    const rev = await revizyon(urun);
    const patlatma = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO rota_patlatma (kok_malzeme_id, kok_rota_revizyonu_id, ozet, kisi_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [urun, rev, `deneme-${randomBytes(4).toString('hex')}`, kisiler.get('yonetici')]))!.id;
    const altDugum = (kaynakOpNo: number) => ({ dugum: { ad: '0.1', malzemeNo: alt, kaynakOpNo, birimCarpani: '2' } });
    const kokDugum = (kaynakOpNo: number) => ({ dugum: { ad: '0', malzemeNo: urun, kaynakOpNo, birimCarpani: '1' } });
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    // Taslak değil: 1476-C sonrası çok katmanlı emir doğrudan planlı açılabilir.
    const { uretimEmriId: e } = await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: urun, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, patlatmaId: patlatma, isEmirleri: [
        adim(1, 1010, b.makine, { dal: 'K1', adetCarpani: 2, onculler: [], bilesenler: [{ malzemeNo: hm2, miktar: '1' }], ...altDugum(10) }),
        adim(2, 1020, b.makine, { dal: 'K1', adetCarpani: 2, onculler: [bekle(1010)], ...altDugum(20) }),
        adim(3, 10, c.makine, { onculler: [bekle(1020)], bilesenler: [{ malzemeNo: hm1, miktar: '0.5' }], ...kokDugum(10) }),
        adim(4, 20, c.makine, { onculler: [bekle(10)], ...kokDugum(20) }),
      ],
    }));
    const ie = Object.fromEntries((await o().vt.sorgu<{ id: number; op_no: number }>('SELECT id, op_no FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [e])).map((x) => [x.op_no, x.id]));
    const s = { kok: await statu('URUN OP 10'), alt: await statu('ALT OP 10') };
    // Çözücü Reçete ve Rota'nın yerine geçer: kök adım emrin revizyonuyla (emir verilir), alt düğüm adımı kendi malzemesi ve rotadaki
    // numarasıyla ve emirle sorulmalı (1558 a: donmuş revizyon emrin patlatmasındadır); başka her soru statüsüz.
    adimStatusuCozucusuKaydet(async (_db, g) => {
      if (g.malzemeNo === urun && g.opNo === 10 && g.uretimEmriId === e) return s.kok;
      if (g.malzemeNo === alt && g.opNo === 10 && g.uretimEmriId === e) return s.alt;
      return null;
    });
    return { e, ie, urun, alt, hm1, hm2, ist: { a: a.id, b: b.id, c: c.id }, s };
  }
  const sayim = (k: Kurulum, opNo: number, istasyonId: number, fark: string) =>
    o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: k.e, isEmriId: k.ie[opNo]!, istasyonId, kisiId: kisiler.get('operator')!, fark }));
  const bakiye = async (malzemeId: number, istasyonId: number, statuId: number | null): Promise<number> =>
    Number((await o().vt.tek<{ m: string }>(
      'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3',
      [malzemeId, await konumu(istasyonId), statuId]))!.m);
  const eksiSatir = async (k: Kurulum): Promise<number> => Number((await o().vt.tek<{ n: string }>(
    'SELECT count(*)::text AS n FROM stok_bakiye WHERE malzeme_id = ANY($1) AND miktar < 0', [[k.urun, k.alt, k.hm1, k.hm2]]))!.n);

  before(async () => {
    ortam = await testVeritabaniKur('stok_dugumlu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.DUGUM', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol, rol);
    adimCiktisiCozucusuKaydet(async () => null);
  });
  after(async () => { adimStatusuCozucusuKaydet(async () => null); await ortam?.kaldir(); });

  test('izinli: alt düğüm kendi statüsüyle işler, son adımı alt parçayı verir; tüketen kök adım alt parçayı kök başına 2 adetle tüketir; emir eksisiz biter', async () => {
    const k = await kur();
    await malKabul(k.hm2, '20');
    await teslimEt({ malzemeId: k.hm2, miktar: '20', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.b } });
    assert.equal((await sayim(k, 1010, k.ist.b, '20')).uyari, null);
    assert.equal(await bakiye(k.hm2, k.ist.b, k.s.alt), 20, 'alt düğüm adımı statüsünü ALT rotasındaki OP 10\'dan alır');
    assert.equal((await sayim(k, 1020, k.ist.b, '20')).uyari, null);
    assert.deepEqual([await bakiye(k.hm2, k.ist.b, k.s.alt), await bakiye(k.alt, k.ist.b, null)], [0, 20], 'düğümün son adımı ALT parçasını girer');

    await malKabul(k.hm1, '5');
    await teslimEt({ malzemeId: k.hm1, miktar: '5', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: k.ist.c } });
    await teslimEt({ malzemeId: k.alt, miktar: '20', kaynak: { istasyonId: k.ist.b }, hedef: { istasyonId: k.ist.c } });
    assert.equal((await sayim(k, 10, k.ist.c, '10')).uyari, null);
    assert.deepEqual(
      [await bakiye(k.alt, k.ist.c, null), await bakiye(k.hm1, k.ist.c, null), await bakiye(k.urun, k.ist.c, k.s.kok)], [0, 0, 10],
      'tüketen adım 20 ALT ve 5 HM1 tüketir, ürün kendi statüsüne girer',
    );
    assert.equal((await sayim(k, 20, k.ist.c, '10')).uyari, null);
    assert.deepEqual([await bakiye(k.urun, k.ist.c, k.s.kok), await bakiye(k.urun, k.ist.c, null)], [0, 10]);
    assert.equal(await eksiSatir(k), 0);

    // Düzeltme geri alır: ürün statüden düşer, ALT ve HM1 geri gelir.
    await sayim(k, 20, k.ist.c, '-10');
    await sayim(k, 10, k.ist.c, '-4');
    assert.deepEqual([await bakiye(k.alt, k.ist.c, null), await bakiye(k.hm1, k.ist.c, null), await bakiye(k.urun, k.ist.c, k.s.kok)], [8, 2, 6]);
  });

  test('izinli: malzeme ihtiyacı alt düğümün hammaddesini kök başına adetle sayar', async () => {
    const k = await kur();
    const ihtiyac = await o().vt.tx((db) => emirMalzemeIhtiyaci(db, k.e));
    assert.deepEqual(ihtiyac?.map((m) => [m.opNo, m.malzemeNo, m.brut]), [[10, k.hm1, '5.0000'], [1010, k.hm2, '20.0000']]);
  });

  test('reddedilen: çok katmanlı emirde düğümsüz adım, tek katmanlı emirde düğümlü adım açılmaz', async () => {
    const k = await kur();
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const tip = (await o().vt.tek<{ id: number }>('SELECT operasyon_tipi_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [k.ie[10]]))!.id;
    const girdi = (ek: Partial<IsEmriGirdisi>): IsEmriGirdisi => ({
      sira: 1, opNo: 10, ad: 'Adım', operasyonTipiId: tip, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1', terminGun: null,
      bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [], ...ek,
    });
    const { p: patlatma, r: rev } = (await o().vt.tek<{ p: number; r: number }>(
      'SELECT patlatma_id AS p, kaynak_rota_revizyonu_id AS r FROM uretim_emri WHERE id = $1', [k.e]))!;
    await assert.rejects(o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: k.urun, adet: 1, teslim: null, kaynakRotaRevizyonId: rev, patlatmaId: patlatma, isEmirleri: [girdi({})],
    })), /düğüm bilgisi/);
    await assert.rejects(o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: k.urun, adet: 1, teslim: null, kaynakRotaRevizyonId: rev,
      isEmirleri: [girdi({ dugum: { ad: '0', malzemeNo: k.urun, kaynakOpNo: 10, birimCarpani: '1' } })],
    })), /düğüm bilgisi/);
  });
});
