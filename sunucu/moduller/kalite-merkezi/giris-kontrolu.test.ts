import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kmGirisBekleyenCevabi, kmGirisCevabi, kmGirisKayitlariCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { KmGirisKaydi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { malKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { karneOzetleri } from '../musteri-tedarikci/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { GIRIS_KARNE_ANAHTARI, GIRIS_NCR_KAYNAGI } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

const PAROLA = 'dogru-parola-1';

// 1246 (1247 d, 1251 a, 1252, 1253 a): kartı GKK isteyen satın alma lotu karantinaya karar bekliyor girer; GKK kabul ve hatalı verir,
// hatalının kalite kararı NCR açar ve kabul, şartlı kabul ya da tedarikçiye iade yazar. Her kural için izinli ve reddedilen durum.
describe('Kalite Merkezi giriş kontrolü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sira = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function giris(kullaniciAdi: string): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerezler.set(kullaniciAdi, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
    });
    await giris(kullaniciAdi);
  }

  const istek = (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    ...(govde === undefined ? {} : { payload: govde as object }),
  });

  async function kart(tur: 'hammadde' | 'sarf', gkk: boolean | null = null): Promise<number> {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, $2, 'GKK-DNM-', $3, 'aktif', $4, $5, $5, $6) RETURNING no`,
      [`gkk-dnm-${sira}`, tur, sira, JSON.stringify({ id: `gkk-dnm-${sira}`, com: { ad: `Deneme ${tur} ${sira}` } }), yoneticiId, gkk],
    ))!.no;
  }

  async function siparisSatiri(miktar: string, firmaId: number | null = null): Promise<number> {
    sira += 1;
    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')",
      [t, 80000 + sira, yoneticiId]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad) VALUES ($1, $2, 1, 'Deneme kalem')", [t, kl]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi, firma_id) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikçi', $3)", [t, tk, firmaId]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id",
      [t, tk, kl, miktar]))!.id;
  }

  const malKabul = async (malzemeId: number, miktar: string, firmaId: number | null = null) =>
    istek('yonetici', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId, miktar, siparisSatirId: await siparisSatiri(miktar, firmaId) }] });

  async function kabulEt(malzemeId: number, miktar: string, firmaId: number | null = null): Promise<KmGirisKaydi> {
    const r = await malKabul(malzemeId, miktar, firmaId);
    assert.equal(r.statusCode, 200, r.body);
    const no = malKabulCevabi.parse(r.json()).belge.no;
    const k = (await bekleyenler()).find((x) => x.malKabulNo === no);
    assert.ok(k, 'GKK satırı bekleyenlerde');
    return k;
  }

  const bekleyenler = async (): Promise<KmGirisKaydi[]> => {
    const r = await istek('kaliteci', 'GET', '/kalite-merkezi/giris/bekleyenler');
    assert.equal(r.statusCode, 200, r.body);
    return kmGirisBekleyenCevabi.parse(r.json()).kayitlar;
  };

  // Partinin bakiyesi konum türü ve kalite durumuna göre: 'karantina:red' -> '3.000'.
  const bakiye = async (partiId: number): Promise<Record<string, string>> => Object.fromEntries((await o().sahip.sorgu<{ a: string; m: string }>(
    `SELECT k.tur || ':' || b.kalite_durumu AS a, sum(b.miktar)::text AS m FROM stok_bakiye b JOIN stok_konum k ON k.id = b.konum_id
      WHERE b.parti_id = $1 AND b.miktar <> 0 GROUP BY 1 ORDER BY 1`, [partiId])).map((r) => [r.a, r.m]));

  before(async () => {
    ortam = await testVeritabaniKur('km_giris_kontrolu');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisi('kaliteci', 'kalite');
    await kisi('operator', 'operator');
    await kisi('planlama', 'planlama_proje');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GKK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('kabul: GKK kartı karantina konumu yoksa girmez; varsa karar bekliyor girer, GKK\'sız kart ve sarf serbest girer', async () => {
    await o().sahip.sorgu("UPDATE stok_konum SET aktif = false WHERE tur = 'karantina'");
    const ham = await kart('hammadde');
    const yok = await malKabul(ham, '5');
    assert.equal(yok.statusCode, 400, yok.body);
    assert.match(yok.json().mesaj, /Karantina konumu yok/);
    await o().sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'KRN-GKK', 'karantina' FROM stok_depo WHERE kod = 'ANA'");

    const k = await kabulEt(ham, '5');
    assert.deepEqual([k.durum, k.miktar, k.tedarikciAdi, k.kabulMiktar], ['gkk_bekliyor', '5', 'Deneme Tedarikçi', null]);
    assert.deepEqual(await bakiye(k.partiId), { 'karantina:karar_bekliyor': '5.000' });

    for (const [m, gkk] of [[await kart('hammadde', false), false], [await kart('sarf'), null]] as const) {
      const r = await malKabul(m, '2');
      assert.equal(r.statusCode, 200, `${gkk}: ${r.body}`);
      const no = malKabulCevabi.parse(r.json()).belge.no;
      assert.ok(!(await bekleyenler()).some((x) => x.malKabulNo === no));
      const kalite = await o().sahip.tek<{ k: string; t: string }>(
        `SELECT b.kalite_durumu AS k, s.tur AS t FROM stok_mal_kabul_satiri ms JOIN stok_mal_kabul mk ON mk.id = ms.mal_kabul_id
           JOIN stok_bakiye b ON b.malzeme_id = ms.malzeme_id JOIN stok_konum s ON s.id = b.konum_id WHERE mk.no = $1`, [no]);
      assert.deepEqual([kalite?.k, kalite?.t], ['serbest', 'kabul']);
    }
  });

  test('GKK: kabul ve hatalı toplamı bekleyene eşittir; yetkisiz 403; kabul mal kabul alanına serbest, hatalı karantinada red; ikinci kez 409', async () => {
    const k = await kabulEt(await kart('hammadde'), '10');
    const yol = `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`;
    assert.equal((await istek('operator', 'POST', yol, { kabul: '7', hatali: '3' })).statusCode, 403);
    const eksik = await istek('kaliteci', 'POST', yol, { kabul: '5', hatali: '4' });
    assert.equal(eksik.statusCode, 400, eksik.body);
    assert.match(eksik.json().mesaj, /bekleyen miktara eşit/);
    assert.equal((await istek('kaliteci', 'POST', yol, { kabul: '0', hatali: '0' })).statusCode, 400);
    assert.deepEqual(await bakiye(k.partiId), { 'karantina:karar_bekliyor': '10.000' });

    const r = await istek('kaliteci', 'POST', yol, { kabul: '7', hatali: '3', not: 'yüzey çizik' });
    assert.equal(r.statusCode, 200, r.body);
    const c = kmGirisCevabi.parse(r.json()).kayit;
    assert.deepEqual([c.durum, c.kabulMiktar, c.hataliMiktar, c.gkkKisiAd], ['karar_bekliyor', '7.000', '3.000', 'Deneme kaliteci']);
    assert.deepEqual(await bakiye(k.partiId), { 'kabul:serbest': '7.000', 'karantina:red': '3.000' });
    assert.equal((await istek('kaliteci', 'POST', yol, { kabul: '0', hatali: '3' })).statusCode, 409);
    assert.ok((await bekleyenler()).some((x) => x.malKabulSatirId === k.malKabulSatirId && x.durum === 'karar_bekliyor'));
  });

  test('karar: GKK\'sız ya da hatalısız satırda 409; şartlı kabul şart ister; red NCR açar ve tedarikçiye iade çıkışı yazar', async () => {
    const k = await kabulEt(await kart('hammadde'), '4');
    const karar = (id: number, g: object) => istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/karar`, { ncrKimlik: `ncr-gkk-${id}`, ncrNo: `NCR-GKK-${id}`, ciddiyet: 'Majör', ...g });
    assert.equal((await karar(k.malKabulSatirId, { karar: 'red' })).statusCode, 409, 'GKK verilmeden');

    const temiz = await kabulEt(await kart('hammadde'), '2');
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${temiz.malKabulSatirId}/gkk`, { kabul: '2', hatali: '0' })).statusCode, 200);
    assert.equal((await karar(temiz.malKabulSatirId, { karar: 'kabul' })).statusCode, 409, 'hatalısız');
    assert.ok(!(await bekleyenler()).some((x) => x.malKabulSatirId === temiz.malKabulSatirId), 'hatalısız GKK kapanır');

    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`, { kabul: '1', hatali: '3' })).statusCode, 200);
    const sartsiz = await karar(k.malKabulSatirId, { karar: 'sartli_kabul' });
    assert.equal(sartsiz.statusCode, 400, sartsiz.body);
    assert.equal(sartsiz.json().alan, 'not');

    const r = await karar(k.malKabulSatirId, { karar: 'red', not: 'ölçü dışı' });
    assert.equal(r.statusCode, 200, r.body);
    const c = kmGirisCevabi.parse(r.json()).kayit;
    assert.deepEqual([c.durum, c.karar, c.ncrNo], ['kapandi', 'red', `NCR-GKK-${k.malKabulSatirId}`]);
    assert.deepEqual(await bakiye(k.partiId), { 'kabul:serbest': '1.000' });
    const iade = await o().sahip.tek<{ m: string; n: string }>(
      "SELECT miktar::text AS m, cikis_nedeni AS n FROM stok_hareketi WHERE parti_id = $1 AND tur = 'cikis'", [k.partiId]);
    assert.deepEqual([iade?.m, iade?.n], ['3.000', 'tedarikci_iade']);
    const ncr = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', `ncr-gkk-${k.malKabulSatirId}`));
    assert.deepEqual([ncr?.kaynak, ncr?.durum, ncr?.mrb, ncr?.miktar, ncr?.lot], [GIRIS_NCR_KAYNAGI, 'Açık', 'Tedarikçiye iade', 3, '']);
    assert.equal((await karar(k.malKabulSatirId, { karar: 'kabul' })).statusCode, 409, 'ikinci karar');
    assert.ok(!(await bekleyenler()).some((x) => x.malKabulSatirId === k.malKabulSatirId));
  });

  test('karar: şartlı kabul hatalıyı mal kabul alanına şartlı geçirir ve NCR\'yi kapatır; GKK verilen belge düzeltilemez; elle iade çıkışı yok', async () => {
    const k = await kabulEt(await kart('hammadde'), '2');
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`, { kabul: '0', hatali: '2' })).statusCode, 200);
    const r = await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/karar`, {
      karar: 'sartli_kabul', ncrKimlik: 'ncr-gkk-sartli', ncrNo: 'NCR-GKK-S', ciddiyet: 'Minör', not: 'yalnız kaba işlemede',
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(await bakiye(k.partiId), { 'kabul:sartli': '2.000' });
    const ncr = await o().vt.tx((db) => sorgular.kayitGovdesi(db, 'ncr', 'ncr-gkk-sartli'));
    assert.deepEqual([ncr?.durum, ncr?.mrb, ncr?.mrbGerekce], ['Kapalı', 'Şartlı kabul', 'yalnız kaba işlemede']);

    const belge = await o().sahip.tek<{ id: number; m: number }>(
      'SELECT m.id, s.malzeme_id AS m FROM stok_mal_kabul m JOIN stok_mal_kabul_satiri s ON s.mal_kabul_id = m.id WHERE s.id = $1', [k.malKabulSatirId]);
    const d = await istek('yonetici', 'POST', `/stok/mal-kabuller/${belge!.id}/duzelt`, { satirlar: [{ malzemeId: belge!.m, miktar: '1' }] });
    assert.equal(d.statusCode, 409, d.body);
    assert.match(d.json().mesaj, /giriş kontrolü kararı/);

    const elle = await istek('yonetici', 'POST', '/stok/cikis', { malzemeId: belge!.m, konumId: 1, miktar: '1', cikisNedeni: 'tedarikci_iade' });
    assert.equal(elle.statusCode, 400, elle.body);
    assert.equal(elle.json().alan, 'cikisNedeni');
  });
  test('rezerve: karantinadaki GKK lotu bekleyen emre ayrılmaz; GKK kabulünde serbest kalan miktar emre ayrılır', async () => {
    const hm = await kart('hammadde');
    sira += 1;
    const ym = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'yarimamul', 'GKK-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`gkk-dnm-${sira}`, sira, JSON.stringify({ id: `gkk-dnm-${sira}`, com: { ad: 'Deneme yarı mamul' } }), yoneticiId],
    ))!.no;
    const s = o().sahip;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('GKKIM', 'Deneme Merkezi') RETURNING id"))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('GKKIS', 'Deneme istasyon', $1) RETURNING id", [im]))!.id;
    const makine = (await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('GKKM', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    const tip = (await s.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('GKK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const proje = (await s.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.GKK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    const revizyon = (await s.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'yarimamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [ym, yoneticiId]))!.id;
    const planlamaId = (await s.tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'planlama'"))!.id;
    const emir = await o().vt.tx(async (db) => (await uretimEmriAc(db, (await kullaniciYukle(db, planlamaId))!, {
      projeId: proje, malzemeNo: ym, adet: 2, teslim: null, kaynakRotaRevizyonId: revizyon, stoktanRezerve: true,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '2' }],
      }],
    })).uretimEmriId);
    const ayrilan = async () => (await s.sorgu<{ m: string }>('SELECT miktar::text AS m FROM stok_rezerve WHERE malzeme_id = $1 AND uretim_emri_id = $2', [hm, emir])).map((x) => Number(x.m));

    const k = await kabulEt(hm, '5');
    assert.deepEqual(await ayrilan(), [], 'karar bekleyen lot ayrılmaz');
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${k.malKabulSatirId}/gkk`, { kabul: '3', hatali: '2' })).statusCode, 200);
    assert.deepEqual(await ayrilan(), [3], 'serbest kalan kabul miktarı emre ayrılır, hatalı ayrılmaz');
  });
  // Kart 2406 (1259 c): lotu kapatan aşama tedarikçi karnesine lot olayı yazar; geri doldurma göçü karne-geri-doldurma-goc.test.ts'te.
  test('karne: hatalısız GKK kabul, hatalı lot kararıyla (hatalı kabul, şartlı kabul, red) olay yazar; bekleyen ve firmasız yazmaz; karne puanı hesaplanır', async () => {
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Karne Deneme GKK', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    await o().sahip.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firmaId]);
    const olaylar = async () => o().sahip.sorgu<{ anahtar: string; firma: number; karar: string; zaman: string }>(
      `SELECT anahtar, firma_id AS firma, lot_karari AS karar, zaman::text AS zaman FROM musteri_tedarikci_karne_olayi
        WHERE kaynak = 'kalite-merkezi' AND tur = 'lot' ORDER BY anahtar`);
    const gkk = (id: number, kabul: string, hatali: string) => istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/gkk`, { kabul, hatali });
    const karar = (id: number, k: string) => istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/karar`, {
      karar: k, ncrKimlik: `ncr-karne-${id}`, ncrNo: `NCR-KRN-${id}`, ciddiyet: 'Minör', not: 'deneme şartı',
    });
    const anahtarlar = async () => (await olaylar()).map((x) => [x.anahtar, x.karar]);

    const temiz = await kabulEt(await kart('hammadde'), '2', firmaId);
    const red = await kabulEt(await kart('hammadde'), '2', firmaId);
    const sartli = await kabulEt(await kart('hammadde'), '2', firmaId);
    const hatali = await kabulEt(await kart('hammadde'), '2', firmaId);
    const firmasiz = await kabulEt(await kart('hammadde'), '2');
    assert.deepEqual(await anahtarlar(), [], 'GKK verilmeden olay yok');

    assert.equal((await gkk(temiz.malKabulSatirId, '2', '0')).statusCode, 200);
    for (const k of [red, sartli, hatali]) assert.equal((await gkk(k.malKabulSatirId, '1', '1')).statusCode, 200);
    assert.equal((await gkk(firmasiz.malKabulSatirId, '2', '0')).statusCode, 200);
    const ana = (k: KmGirisKaydi) => GIRIS_KARNE_ANAHTARI(k.malKabulSatirId);
    assert.deepEqual(await anahtarlar(), [[ana(temiz), 'kabul']], 'karar bekleyen ve firmasız lot olay yazmaz');

    assert.equal((await karar(red.malKabulSatirId, 'red')).statusCode, 200);
    assert.equal((await karar(sartli.malKabulSatirId, 'sartli_kabul')).statusCode, 200);
    assert.equal((await karar(hatali.malKabulSatirId, 'kabul')).statusCode, 200);
    const beklenen = [[ana(temiz), 'kabul'], [ana(red), 'red'], [ana(sartli), 'sartli_kabul'], [ana(hatali), 'hatali_kabul']]
      .sort((a, b) => a[0]!.localeCompare(b[0]!));
    assert.deepEqual(await anahtarlar(), beklenen);
    assert.ok((await olaylar()).every((x) => x.firma === firmaId));
    const ozet = (await o().vt.tx((db) => karneOzetleri(db, [firmaId]))).get(firmaId);
    assert.equal(ozet?.kalite.lot, 4);
    assert.equal(ozet?.kalite.puan, 50, 'kabul 1 + şartlı 0,5 + hatalı kabul 0,5 + red 0 = 2 / 4');
  });
  // 3117: Yapılan sekmesi kapanan GKK'ları gün aralığıyla, en yeni üstte verir; karar bekleyen girmez. Form tek satırı okur.
  test('kayıtlar: kapanan GKK aralıkta, karar bekleyen yok, aralık dışı yok; tek satır okunur; yetkisiz 403, ters aralık 400', async () => {
    const ilk = await kabulEt(await kart('hammadde'), '2');
    const ikinci = await kabulEt(await kart('hammadde'), '3');
    const acik = await kabulEt(await kart('hammadde'), '2');
    const gkk = (id: number, kabul: string, hatali: string) => istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/gkk`, { kabul, hatali });
    assert.equal((await gkk(ilk.malKabulSatirId, '2', '0')).statusCode, 200);
    assert.equal((await gkk(ikinci.malKabulSatirId, '3', '0')).statusCode, 200);
    assert.equal((await gkk(acik.malKabulSatirId, '1', '1')).statusCode, 200);
    const gun = tesisGunu(Date.now());
    const liste = async (baslangic: string, bitis: string, ad = 'kaliteci') => istek(ad, 'GET', `/kalite-merkezi/giris/kayitlar?baslangic=${baslangic}&bitis=${bitis}`);

    const r = await liste(gun, gun);
    assert.equal(r.statusCode, 200, r.body);
    const c = kmGirisKayitlariCevabi.parse(r.json());
    const idler = c.kayitlar.map((k) => k.malKabulSatirId);
    assert.ok(idler.indexOf(ikinci.malKabulSatirId) < idler.indexOf(ilk.malKabulSatirId) && idler.includes(ilk.malKabulSatirId), 'en yeni üstte');
    assert.ok(!idler.includes(acik.malKabulSatirId), 'karar bekleyen Yapılan\'da yok');
    assert.ok(c.kayitlar.every((k) => k.durum === 'kapandi'));
    assert.equal(c.sinirda, false);
    assert.deepEqual(kmGirisKayitlariCevabi.parse((await liste('2000-01-01', '2000-01-31')).json()).kayitlar, []);
    assert.equal((await liste(gun, '2000-01-01')).statusCode, 400);
    assert.equal((await liste(gun, gun, 'operator')).statusCode, 403);

    const tek = await istek('kaliteci', 'GET', `/kalite-merkezi/giris/${acik.malKabulSatirId}`);
    assert.equal(tek.statusCode, 200, tek.body);
    assert.deepEqual([kmGirisCevabi.parse(tek.json()).kayit.durum, kmGirisCevabi.parse(tek.json()).kayit.hataliMiktar], ['karar_bekliyor', '1.000']);
    assert.equal((await istek('operator', 'GET', `/kalite-merkezi/giris/${acik.malKabulSatirId}`)).statusCode, 403);
    assert.equal((await istek('kaliteci', 'GET', '/kalite-merkezi/giris/2147483000')).statusCode, 404);
  });
});
