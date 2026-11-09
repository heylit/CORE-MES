import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { UretimHazirligiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { adimKalanIhtiyaci, baslatmaEksikleri, tasinanMahsubu } from './kurallar.ts';
import { adimStatusuCozucusuKaydet, uretimSayimiYansit } from './servis.ts';

// 2522 a: elle sarf edilen taşınan statü zincirinin dışında kalır.
// B-2501-3 (2493-10): adım başlarken açılan depo isteği emrin kalan ihtiyacıdır: kopyanın fire payı eklenir, emre verilmiş sarf düşülür.
// Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('adım kalan ihtiyacı (saf, B-2501-3)', () => {
  test('brüt kopyadan; verilen önce önceki adımın brütüne, artanı bu adıma düşülür; eksiye inmez; binde yukarı yuvarlanır', () => {
    const ihtiyac = [{ malzemeNo: 1, opNo: 10, brut: '102.0000' }, { malzemeNo: 2, opNo: 10, brut: '0.0005' }, { malzemeNo: 1, opNo: 20, brut: '50.0000' }];
    assert.deepEqual([...adimKalanIhtiyaci(ihtiyac, 10, new Map([[1, 40000n]]))], [[1, 62000n], [2, 1n]]);
    assert.deepEqual([...adimKalanIhtiyaci(ihtiyac, 20, new Map([[1, 120000n]]))], [[1, 32000n]], '102 OP 10a, 18 OP 20ye');
    assert.deepEqual([...adimKalanIhtiyaci(ihtiyac, 20, new Map([[1, 200000n]]))], [[1, 0n]]);
    assert.deepEqual([...adimKalanIhtiyaci(ihtiyac, 30, new Map())], []);
  });
  test('kalan verilince istek ondan açılır; kalanı olmayan malzemede adet x miktar; bir adetlik varsa istek yok', () => {
    const girdiler = [{ malzemeNo: 1, miktar: '1' }, { malzemeNo: 2, miktar: '2' }];
    assert.deepEqual(baslatmaEksikleri(girdiler, new Map(), 100000n, new Map([[1, 62000n]])).map((e) => [e.malzemeId, e.istenecek]), [[1, 62000n], [2, 200000n]]);
    assert.deepEqual(baslatmaEksikleri(girdiler, new Map([[1, 1000n], [2, 2000n]]), 100000n, new Map([[1, 62000n]])), []);
  });
  test('2522 a: taşınan mahsubu: tek sayımda elle verilen kadar; parça parça sayımda elle verilen sona sayılır; elle yoksa ya da ihtiyaç bilinmiyorsa yok', () => {
    const m = (istenen: bigint, elle: bigint, oncekiTasinan: bigint, ihtiyac: bigint | null = 6000n) => tasinanMahsubu({ istenen, elle, oncekiTasinan, ihtiyac });
    assert.deepEqual([m(6000n, 4000n, 0n), m(6000n, 6000n, 0n), m(3000n, 4000n, 0n), m(3000n, 4000n, 3000n)], [4000n, 6000n, 1000n, 3000n]);
    assert.deepEqual([m(6000n, 0n, 0n), m(6000n, 4000n, 0n, null)], [0n, 0n]);
  });
});

describe('stok: adım başı depo isteğinin miktarı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let projeId = 0;
  let sira = 0;
  // Emrin kaynak rotası gerçek bir revizyondur; ürün başına bir kez, iptal durumunda açılır.
  const revizyonlar = new Map<number, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function giris(ad: string): Promise<void> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kisiEkle(ad: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [ad]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    kisiler.set(ad, await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    }));
    await giris(ad);
  }
  async function kart(tur: 'hammadde' | 'yarimamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['BIS-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'BIS-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`bis-dnm-${sira}`, tur, sira, JSON.stringify({ id: `bis-dnm-${sira}`, com: { ad: `İstek deneme ${sira}`, birim: 'kg' } }), kisiler.get('yonetici')],
    ))!.no;
  }
  async function istasyon(): Promise<{ id: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`BIM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`BIS${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    const makine = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`BM-${ist!.id}`, 'Tezgah', ist!.id]);
    return { id: ist!.id, makine: makine!.id };
  }
  // İki adımlı emir; OP 10'un bileşeni adet başına 1 kg, kopyada fire payıyla.
  async function emir(ym: number, hm: number, a: number, b: number, adet: number, fireYuzde: string): Promise<number> {
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`BIS${String(++sira)}`]))!.id;
    const adim = (s: number, makine: number, bilesenler: { malzemeNo: number; miktar: string; fireYuzde?: string }[]): IsEmriGirdisi => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    const rev = revizyonlar.get(ym) ?? (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       SELECT $1, 'yarimamul', 'ZZ', 'iptal', p.id, p.id, now() FROM (SELECT min(id) AS id FROM kisi) p RETURNING id`, [ym]))!.id;
    revizyonlar.set(ym, rev);
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    return (await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: ym, adet, teslim: null, kaynakRotaRevizyonId: rev,
      isEmirleri: [adim(1, a, [{ malzemeNo: hm, miktar: '1', fireYuzde }]), adim(2, b, [])],
    }))).uretimEmriId;
  }
  const sayim = (e: number, isEmriId: number, istasyonId: number, fark: string) =>
    o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId, kisiId: kisiler.get('operator')!, fark }));
  const hareketToplami = async (e: number, malzemeId: number, tur: string): Promise<number> => Number((await o().vt.tek<{ m: string }>(
    'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_hareketi WHERE uretim_emri_id = $1 AND malzeme_id = $2 AND tur = $3', [e, malzemeId, tur]))!.m);
  const statuBakiyesi = async (malzemeId: number, statuId: number): Promise<number> => Number((await o().vt.tek<{ m: string }>(
    'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND statu_id = $2', [malzemeId, statuId]))!.m);
  const kabulKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = async (malzemeId: number, miktar: string): Promise<void> => {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  const istekMiktari = async (e: number, malzemeId: number): Promise<number | null> => {
    const r = await o().vt.tek<{ m: string }>('SELECT miktar::text AS m FROM stok_malzeme_istegi WHERE uretim_emri_id = $1 AND malzeme_id = $2 ORDER BY id DESC LIMIT 1', [e, malzemeId]);
    return r === null ? null : Number(r.m);
  };
  const hazirlik = async (e: number, istasyonId: number) => {
    const h = await istek<UretimHazirligiCevabi>('operator', 'POST', '/stok/uretim-hazirligi', { uretimEmriId: e, istasyonId });
    assert.equal(h.durum, 200, JSON.stringify(h.govde));
    return h.govde;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_bis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    await giris('yonetici');
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.BIS', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol);
  });
  after(async () => { adimStatusuCozucusuKaydet(async () => null); await ortam?.kaldir(); });

  test('B-2501-3: 100 adet x 1 kg, fire %2: istek 102 kg; emre 40 kg sarf verilmişse 62 kg', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    const ilk = await emir(ym, hm, a.makine, b.makine, 100, '2');
    const h = await hazirlik(ilk, a.id);
    assert.equal(h.hazir, false);
    assert.equal(await istekMiktari(ilk, hm), 102, 'kopyanın fire payı istekte');

    const ikinci = await emir(ym, hm, a.makine, b.makine, 100, '2');
    await malKabul(hm, '40');
    const sarf = await istek('yonetici', 'POST', '/stok/cikis', { malzemeId: hm, konumId: await kabulKonumu(), miktar: '40', cikisNedeni: 'uretime_sarf', uretimEmriId: ikinci });
    assert.equal(sarf.durum, 200, JSON.stringify(sarf.govde));
    await hazirlik(ikinci, a.id);
    assert.equal(await istekMiktari(ikinci, hm), 62, 'verilen sarf düşülür');
  });

  test('firesiz ve sarfsız emirde istek adet x miktardır (önceki davranış)', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    const e = await emir(ym, hm, a.makine, b.makine, 10, '0');
    await hazirlik(e, a.id);
    assert.equal(await istekMiktari(e, hm), 10);
  });

  test('2522 a: OP 10 hammaddeyi statüye çevirirken elle sarf edilen kısım zincir dışında kalır: hammadde bir kez düşer, statüde eksi kalmaz', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const e = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`zincir-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '10');
    const sarf = await istek('yonetici', 'POST', '/stok/cikis', { malzemeId: hm, konumId: await kabulKonumu(), miktar: '4', cikisNedeni: 'uretime_sarf', uretimEmriId: e });
    assert.equal(sarf.durum, 200, JSON.stringify(sarf.govde));
    // 10 adet x 1 kg: 4 kg elle verildi; zincire 6 kg girer. Parça parça sayımın birikimi saf testtedir (sayım satırı uretim-emirlerinindir).
    await sayim(e, op10!, a.id, '10');
    assert.equal(await statuBakiyesi(hm, s10), 6, 'OP 10 statüsüne elle verilmeyen 6 kg çevrildi');
    await sayim(e, op20!, a.id, '10');
    assert.equal(await hareketToplami(e, hm, 'cikis'), 10, 'hammadde bir kez düşer: 4 elle + 6 zincirden');
    assert.equal(await statuBakiyesi(hm, s10), 0, 'statüde eksi ya da artık kalmaz');
    const toplam = Number((await o().vt.tek<{ m: string }>('SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [hm]))!.m);
    assert.equal(toplam, 0, '10 kg kabul, 10 kg düştü');
  });
});
