import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { artikParcaCevabi, artikParcalarCevabi, ayirmaCevabi, ayirmaIstekleriCevabi, ihtiyaclarCevabi, olcuAramaCevabi } from '#paylasilan/sozlesme/stok-kontrol.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { binde } from './kurallar.ts';
import { stoktanKarsila } from './servis/kontrol.ts';
import { bakiyeDegistir } from './servis/ortak.ts';

// 3398 (surum 4 a): ölçüyle arama ve artık parça uçları, gerçek PostgreSQL ile. Kartlar ORN- uydurma.
const PAROLA = 'dogru-parola-1';

describe('stok kontrol: ölçüyle arama ve artık parça (3398, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  let kisi = 0;
  let raf = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const al = async (kim: string | null, yol: string) => {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: kim === null ? {} : { cookie: cerezler.get(kim) ?? '' } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  const gonder = async (kim: string, yol: string, payload: unknown) => {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, payload: payload as object,
      headers: { cookie: cerezler.get(kim) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
    return { durum: c.statusCode, govde: c.json() as unknown };
  };
  async function kart(kalite: string, form: string, dims: Record<string, number>, birim = 'adet', onay = 'aktif'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['ORN-HM-']);
    const kimlik = `orn-hm-${sira}`;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'ORN-HM-', $2, $3, $4, (SELECT min(id) FROM kisi), (SELECT min(id) FROM kisi)) RETURNING no`,
      [kimlik, sira, onay, JSON.stringify({ id: kimlik, form, grade: kalite, dims, com: { ad: `ORN ${form} ${sira}`, birim } })],
    ))!.no;
  }
  async function giris(m: number, miktar: string, konum = raf): Promise<void> {
    await o().vt.tx(async (db: Db) => {
      await db.sorgu(
        `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES ('giris', pg_current_xact_id(), $4) RETURNING id),
           h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, hedef_konum_id, miktar, kisi_id, giris_kaynagi)
                 VALUES (now(), 'giris', $1, $2, $3, $4, 'mal_kabul') RETURNING id)
         INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f`, [m, konum, miktar, kisi]);
      await bakiyeDegistir(db, { malzemeId: m, konumId: konum, partiId: null, kaliteDurumu: 'serbest', fark: binde(miktar) });
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('stok_olcu_arama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'operator', 'satin_alma', 'planlama_muduru']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol.replaceAll('_', '-'), parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol.replaceAll('_', '-'), parola: PAROLA } });
      assert.equal(g.statusCode, 200, g.body);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
    kisi = (await ortam.vt.tek<{ id: number }>('SELECT min(id)::int AS id FROM kisi'))!.id;
    raf = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-R1', 'depo_zemini', 'Deneme zemini') RETURNING id",
    ))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: girişsiz 401, operatör 403; depo, satın alma ve planlama okur; artığı yalnız stok çıkışı yazan kaydeder', async () => {
    const yol = '/stok/olcu-arama?form=cubuk&d=50';
    assert.equal((await al(null, yol)).durum, 401);
    assert.equal((await al('operator', yol)).durum, 403);
    for (const k of ['depo', 'satin_alma', 'planlama_muduru']) assert.equal((await al(k, yol)).durum, 200, k);
    const m = await kart('ORN-K1', 'cubuk', { d: 50, l: 3000 });
    const govde = { malzemeNo: m, konumId: raf, boy: 1250 };
    assert.equal((await gonder('satin_alma', '/stok/artik-parcalar', govde)).durum, 403);
    const y2 = await gonder('depo', '/stok/artik-parcalar', govde); assert.equal(y2.durum, 200, JSON.stringify(y2.govde));
  });

  test('arama: aynı form ve kalite; artık, tam, yakın sırası; pay dışı sonda, küçük ve başka kalite yok; karşılanan gerekende', async () => {
    const tam = await kart('ORN-C45', 'cubuk', { d: 60, l: 3000 });
    const yakin = await kart('ORN-C45', 'cubuk', { d: 65, l: 3000 });
    const disi = await kart('ORN-C45', 'cubuk', { d: 90, l: 3000 });
    const kucuk = await kart('ORN-C45', 'cubuk', { d: 55, l: 3000 });
    const baska = await kart('ORN-S235', 'cubuk', { d: 60, l: 3000 });
    const olcusuz = await kart('ORN-C45', 'cubuk', { l: 3000 });
    const stoksuz = await kart('ORN-C45', 'cubuk', { d: 60, l: 6000 });
    for (const m of [disi, kucuk, baska, olcusuz]) await giris(m, '1');
    await giris(yakin, '3');
    await giris(tam, '3');
    const artik = await gonder('depo', '/stok/artik-parcalar', { malzemeNo: tam, konumId: raf, boy: 1250 });
    assert.equal(artik.durum, 200, JSON.stringify(artik.govde));
    const c = await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-C45&d=60&parcaBoyu=180&adet=40');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const g = olcuAramaCevabi.parse(c.govde);
    assert.deepEqual(g.adaylar.map((a) => [a.malzemeNo, a.kaynak, a.durum, a.parcaSayisi]), [
      [tam, 'artik', 'tam', 6], [tam, 'stok', 'tam', 32], [yakin, 'stok', 'yakin', 48], [disi, 'stok', 'pay-disi', 16],
    ]);
    assert.ok(!g.adaylar.some((a) => a.malzemeNo === kucuk || a.malzemeNo === baska || a.malzemeNo === stoksuz));
    assert.equal(g.karsilanan, 40);
    assert.equal(g.gereken, 40);
    assert.equal(g.olcusuzKart, 1);
    assert.ok(g.kaliteler.includes('ORN-C45') && g.kaliteler.includes('ORN-S235'));
    assert.deepEqual(g.adaylar[2]?.konumlar, ['ORN-R1']);
    // Artık bakiyenin içindedir: 3 boyun biri artık sayılır, stok adayı 2 boy (çift sayılmaz).
    assert.equal(g.adaylar[1]?.miktar, '2');
    // Yalnız tam ölçü: yakın da pay dışına düşer.
    const t = olcuAramaCevabi.parse((await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-C45&d=60&parcaBoyu=180&adet=40&pay=tam')).govde);
    assert.equal(t.karsilanan, 38);
    // Artıksız arama
    const a = olcuAramaCevabi.parse((await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-C45&d=60&artik=hayir')).govde);
    assert.ok(!a.adaylar.some((x) => x.kaynak === 'artik'));
    assert.equal(a.karsilanan, null);
  });

  test('girdi: kesitsiz arama 400, levhada parça eni zorunlu', async () => {
    assert.equal((await al('depo', '/stok/olcu-arama?form=cubuk&l=100')).durum, 400);
    assert.equal((await al('depo', '/stok/olcu-arama?form=levha&t=20&parcaBoyu=400')).durum, 400);
  });

  test('artık: kart boyunu aşan ya da ölçüsüz kartta reddedilir; listelenir; kapatılınca aramadan düşer; eski sürüm 409', async () => {
    const m = await kart('ORN-K2', 'cubuk', { d: 40, l: 3000 });
    const olcusuz = await kart('ORN-K2', 'cubuk', { l: 3000 });
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: m, konumId: raf, boy: 3500 })).durum, 400);
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: olcusuz, konumId: raf, boy: 500 })).durum, 400);
    await giris(m, '1');
    const y = await gonder('depo', '/stok/artik-parcalar', { malzemeNo: m, konumId: raf, boy: 900, aciklama: 'ORN kesim' });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const { id, surum } = artikParcaCevabi.parse(y.govde);
    const l = artikParcalarCevabi.parse((await al('satin_alma', `/stok/artik-parcalar?malzemeNo=${m}`)).govde);
    assert.deepEqual(l.satirlar.map((r) => [r.id, r.olcu, r.konumKod, r.form, r.kaydeden]), [[id, { d: 40, l: 900 }, 'ORN-R1', 'cubuk', 'Deneme depo']]);
    const ara = () => al('depo', '/stok/olcu-arama?form=cubuk&kalite=ORN-K2&d=40&parcaBoyu=100');
    // Tek boy bakiyenin artığa dönmüş hâli: yalnız artık önerilir.
    assert.deepEqual(olcuAramaCevabi.parse((await ara()).govde).adaylar.map((a) => a.kaynak), ['artik']);
    assert.equal((await gonder('depo', `/stok/artik-parcalar/${id}/kapat`, { durum: 'kullanildi', surum: surum + 1 })).durum, 409);
    assert.equal((await gonder('depo', `/stok/artik-parcalar/${id}/kapat`, { durum: 'kullanildi', surum })).durum, 200);
    assert.equal((await gonder('depo', `/stok/artik-parcalar/${id}/kapat`, { durum: 'hurda', surum: surum + 1 })).durum, 422);
    assert.deepEqual(olcuAramaCevabi.parse((await ara()).govde).adaylar.map((a) => a.kaynak), ['stok']);
    // Konumda bakiyesi kalmamış malzemenin açık artığı önerilmez.
    const bakiyesiz = await kart('ORN-K2', 'cubuk', { d: 45, l: 3000 });
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: bakiyesiz, konumId: raf, boy: 900 })).durum, 200);
    assert.equal(olcuAramaCevabi.parse((await al('depo', '/stok/olcu-arama?form=cubuk&kalite=ORN-K2&d=45&parcaBoyu=100')).govde).adaylar.length, 0);
    const kapali = artikParcalarCevabi.parse((await al('depo', `/stok/artik-parcalar?malzemeNo=${m}&durum=kullanildi`)).govde);
    assert.equal(kapali.satirlar.length, 1);
  });

  test('yalnız kullanılabilir stok: başka tür konumdaki miktar aday olmaz; pasif konuma artık yazılmaz', async () => {
    const m = await kart('ORN-K3', 'cubuk', { d: 30, l: 3000 });
    const araAlan = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-A1', 'ara_alan', 'Deneme ara alan') RETURNING id"))!.id;
    await giris(m, '5', araAlan);
    const ara = async () => olcuAramaCevabi.parse((await al('depo', '/stok/olcu-arama?form=cubuk&kalite=ORN-K3&d=30&parcaBoyu=100')).govde).adaylar;
    assert.deepEqual(await ara(), []);
    const zemin = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-Z2', 'depo_zemini', 'Deneme zemini 2') RETURNING id"))!.id;
    await giris(m, '2', zemin);
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: m, konumId: zemin, boy: 800 })).durum, 200);
    assert.deepEqual((await ara()).map((a) => [a.kaynak, a.miktar]), [['artik', '1'], ['stok', '1']]);
    // Bakiyeli konum pasifleşemez (stok_bakiye_aktif_konumda); pasif konuma artık yazılmaz.
    const pasif = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur, ad, aktif) VALUES ((SELECT depo_id FROM stok_konum WHERE kod = 'KABUL'), 'ORN-Z3', 'depo_zemini', 'Deneme pasif', false) RETURNING id"))!.id;
    assert.equal((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: m, konumId: pasif, boy: 700 })).durum, 400);
  });

  test('ihtiyaç kuyruğu (3398-2): taslak talebin kartlı kalemi stokla karşılaştırılır; teklifteki ve kartı ölçüsüz kalem; yetki', async () => {
    const m = await kart('ORN-K4', 'cubuk', { d: 25, l: 3000 });
    const olcusuz = await kart('ORN-K4', 'cubuk', { l: 3000 });
    await giris(m, '2');
    await giris(olcusuz, '1');
    let katalog = 0;
    const kalemli = async (durum: string, malzemeNo: number, miktar: string) => {
      katalog += 1;
      const kat = randomUUID();
      await o().sahip.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [kat, malzemeNo]);
      const t = randomUUID();
      await o().sahip.sorgu(
        `INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $2, 'ORN talep', $3, $3, $4)`,
        [t, 900 + katalog, kisi, durum]);
      await o().sahip.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, katalog_id, ad, miktar, birim) VALUES ($1, $2, 1, $3, 'ORN kalem', $4, 'adet')",
        [t, randomUUID(), kat, miktar]);
      return t;
    };
    const taslak = await kalemli('taslak', m, '3');
    await kalemli('teklif_isteniyor', m, '1');
    const olcusuzTalep = await kalemli('taslak', olcusuz, '1');
    assert.equal((await al('operator', '/stok/kontrol-ihtiyaclari')).durum, 403);
    const c = await al('satin_alma', '/stok/kontrol-ihtiyaclari');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const g = ihtiyaclarCevabi.parse(c.govde);
    assert.deepEqual(g.satirlar.map((x) => [x.talepId, x.durum, x.karsilanan, x.enIyi?.malzemeNo ?? null]),
      [[taslak, 'kismen', 2, m], [olcusuzTalep, 'karsilanir', 1, null]]);
    assert.equal((await al('planlama_muduru', '/stok/kontrol-ihtiyaclari')).durum, 200);
  });

  test('stoktan karşıla (3398-2 a): ayırma isteği açılır, kalem azalır, ayrılan stok yeniden önerilmez; tamamı karşılanınca kalem çıkar, iptalde geri gelir', async () => {
    const m = await kart('ORN-K5', 'cubuk', { d: 20, l: 3000 });
    const olcusuz = await kart('ORN-K5', 'cubuk', { l: 3000 });
    await giris(m, '5');
    await giris(olcusuz, '2');
    let s2 = 0;
    const talep = async (malzemeNo: number, miktar: string) => {
      s2 += 1;
      const kat = randomUUID();
      await o().sahip.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [kat, malzemeNo]);
      const t = randomUUID();
      const k = randomUUID();
      await o().sahip.sorgu(
        `INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $2, 'ORN talep', $3, $3, 'taslak')`,
        [t, 950 + s2, kisi]);
      await o().sahip.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, katalog_id, ad, miktar, birim) VALUES ($1, $2, 1, $3, 'ORN kalem', $4, 'adet')",
        [t, k, kat, miktar]);
      return { talepId: t, kalemId: k };
    };
    const kalemMiktari = async (kalemId: string) => (await o().sahip.tek<{ miktar: string }>('SELECT miktar::text AS miktar FROM satin_alma_talep_kalemi WHERE id = $1', [kalemId]))?.miktar ?? null;
    const satir = async (kalemId: string) => ihtiyaclarCevabi.parse((await al('satin_alma', '/stok/kontrol-ihtiyaclari')).govde).satirlar.find((x) => x.kalemId === kalemId);
    const a = await talep(m, '8');
    assert.equal((await satir(a.kalemId))?.karsilanan, 5);
    // Yetki: depo ve operatör stoktan karşılayamaz; fazlası ve kesirli parça reddedilir.
    assert.equal((await gonder('depo', '/stok/kontrol-ihtiyaclari/karsila', { ...a, miktar: '3' })).durum, 403);
    assert.equal((await gonder('operator', '/stok/kontrol-ihtiyaclari/karsila', { ...a, miktar: '3' })).durum, 403);
    assert.equal((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...a, miktar: '6' })).durum, 400);
    assert.equal((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...a, miktar: '1.5' })).durum, 400);
    const y = await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...a, miktar: '3' });
    assert.equal(y.durum, 200, JSON.stringify(y.govde));
    const istek = ayirmaCevabi.parse(y.govde);
    assert.equal(await kalemMiktari(a.kalemId), '5.0000');
    // Ayrılan 3 çubuk ne ihtiyaç kuyruğunda ne ölçüyle aramada yeniden sayılır.
    assert.equal((await satir(a.kalemId))?.karsilanan, 2);
    const ara = olcuAramaCevabi.parse((await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-K5&d=20')).govde);
    assert.deepEqual(ara.adaylar.map((x) => [x.malzemeNo, x.miktar]), [[m, '2']]);
    // İkinci kalem aynı stoğa: iki istek aynı anda en çok kalan kadar alır.
    const b = await talep(m, '2');
    const c = await talep(m, '2');
    // 3437-2: kalemin kabul sınırı geri yüklemede korunur.
    await o().sahip.sorgu('UPDATE satin_alma_talep_kalemi SET kabul_pay_mm = 2, sartli_kabul = true WHERE id = ANY($1::uuid[])', [[b.kalemId, c.kalemId]]);
    const ikisi = await Promise.all([b, c].map((x) => gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...x, miktar: '2' })));
    assert.deepEqual(ikisi.map((x) => x.durum).sort(), [200, 400], JSON.stringify(ikisi.map((x) => x.govde)));
    // Tamamı karşılanan kalem talepten çıkar (teklife gitmez); depo listesinde görünür.
    const tamam = ikisi[0]!.durum === 200 ? b : c;
    assert.equal(await kalemMiktari(tamam.kalemId), null);
    const l = ayirmaIstekleriCevabi.parse((await al('depo', '/stok/ayirma-istekleri')).govde);
    const ilk = l.satirlar.find((x) => x.id === istek.id)!;
    assert.deepEqual([ilk.durum, ilk.miktar, ilk.kaynaklar.map((x) => [x.malzemeNo, x.stokMiktari, x.karsilanan])], ['bekliyor', '3.0000', [[m, 3, 3]]]);
    // Depo ayırır, sonra teslim eder; eski sürüm 409; satın alma ilerletemez; teslim edilen iptal edilemez.
    assert.equal((await gonder('satin_alma', `/stok/ayirma-istekleri/${istek.id}/ilerlet`, { durum: 'ayrildi', surum: 1 })).durum, 403);
    assert.equal((await gonder('depo', `/stok/ayirma-istekleri/${istek.id}/ilerlet`, { durum: 'teslim', surum: 1 })).durum, 422);
    const ay = ayirmaCevabi.parse((await gonder('depo', `/stok/ayirma-istekleri/${istek.id}/ilerlet`, { durum: 'ayrildi', surum: 1 })).govde);
    assert.equal((await gonder('depo', `/stok/ayirma-istekleri/${istek.id}/ilerlet`, { durum: 'teslim', surum: 1 })).durum, 409);
    assert.equal((await gonder('depo', `/stok/ayirma-istekleri/${istek.id}/ilerlet`, { durum: 'teslim', surum: ay.surum })).durum, 200);
    assert.equal((await gonder('satin_alma', `/stok/ayirma-istekleri/${istek.id}/iptal`, { neden: 'ORN', surum: ay.surum + 1 })).durum, 422);
    // Teslimle istek kapanır: stok çıkışı ayrıca yazılır, istek artık stok tutmaz.
    assert.equal((await satir(a.kalemId))?.karsilanan, 3);
    // İptal: silinen kalem aynı kimlikle geri gelir; ayrılan stok serbest kalır.
    const acik = ayirmaIstekleriCevabi.parse((await al('satin_alma', '/stok/ayirma-istekleri')).govde).satirlar.find((x) => x.kalemId === tamam.kalemId)!;
    const ip = await gonder('satin_alma', `/stok/ayirma-istekleri/${acik.id}/iptal`, { neden: 'ORN vazgeçildi', surum: acik.surum });
    assert.equal(ip.durum, 200, JSON.stringify(ip.govde));
    assert.equal(ayirmaCevabi.parse(ip.govde).geriEklendi, true);
    assert.equal(await kalemMiktari(tamam.kalemId), '2.0000');
    assert.deepEqual(await o().sahip.tek('SELECT kabul_pay_mm::text AS pay, sartli_kabul AS sartli FROM satin_alma_talep_kalemi WHERE id = $1', [tamam.kalemId]), { pay: '2.000', sartli: true });
    // Ölçüsüz kart: aynı kartın stoğu, kalem birimiyle; talep teklif aşamasına geçince iptal miktarı geri eklemez.
    const d = await talep(olcusuz, '2');
    const yd = ayirmaCevabi.parse((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...d, miktar: '1' })).govde);
    assert.equal(await kalemMiktari(d.kalemId), '1.0000');
    // Ölçüsüz kartta da ayrılan düşülür: 2 stoktan 1'i ayrıldı, aynı kartın başka kalemi en çok 1 alır.
    const f = await talep(olcusuz, '2');
    assert.deepEqual([(await satir(f.kalemId))?.karsilanan, (await satir(f.kalemId))?.durum], [1, 'kismen']);
    assert.equal((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...f, miktar: '2' })).durum, 400);
    await o().sahip.sorgu("UPDATE satin_alma_talep SET durum = 'teklif_isteniyor' WHERE id = $1", [d.talepId]);
    const ipd = ayirmaCevabi.parse((await gonder('depo', `/stok/ayirma-istekleri/${yd.id}/iptal`, { neden: 'ORN', surum: yd.surum })).govde);
    assert.deepEqual([ipd.durum, ipd.geriEklendi, await kalemMiktari(d.kalemId)], ['iptal', false, '1.0000']);
    const kapali = ayirmaIstekleriCevabi.parse((await al('depo', '/stok/ayirma-istekleri?durum=kapali')).govde);
    assert.deepEqual(kapali.satirlar.filter((x) => x.id === yd.id).map((x) => [x.iptalNedeni, x.geriEklendi]), [['ORN', false]]);
    assert.equal((await al('operator', '/stok/ayirma-istekleri')).durum, 403);
    // Talep hareketine yazılır: karşılama ve iki iptal.
    const hareketler = async (t: string) => (await o().sahip.sorgu<{ metin: string }>('SELECT metin FROM satin_alma_hareket WHERE talep_id = $1 ORDER BY zaman, id', [t])).map((h) => h.metin);
    assert.deepEqual((await hareketler(tamam.talepId)).map((m) => m.split(':')[0]), ['Stoktan karşılandı', 'Stoktan karşılama iptal edildi']);
    assert.match((await hareketler(d.talepId)).at(-1)!, /geri eklenemedi/);
    // Geri yükleme sütun listesiyle yazar: kaleme yeni sütun eklenirse buradan haber verir (sayi_id kimliktir, yeniden üretilir).
    const sutunlar = (await o().sahip.sorgu<{ c: string }>("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'satin_alma_talep_kalemi' ORDER BY column_name COLLATE \"C\"")).map((r) => r.c);
    assert.deepEqual(sutunlar, ['ad', 'birim', 'die_id', 'id', 'is_emri_id', 'kabul_durumlari', 'kabul_kaliteleri', 'kabul_pay_mm', 'katalog_id', 'kategori', 'kaynak_birim',
      'kaynak_ihtiyac_tarihi', 'kaynak_sira', 'kaynak_talep_id', 'logo_satir_ref', 'miktar', 'ozellik', 'sartli_kabul', 'sayi_id', 'sira', 'talep_id', 'uygulanan_malzeme_no',
      'yalniz_ayni']);
    // Logo'ya gitmiş kalem: neden kuyrukta görünür, karşılama 422.
    const e = await talep(olcusuz, '1');
    await o().sahip.sorgu("UPDATE satin_alma_talep_kalemi SET logo_satir_ref = 'ORN-1' WHERE id = $1", [e.kalemId]);
    assert.equal((await satir(e.kalemId))?.engel, 'logo');
    assert.equal((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...e, miktar: '1' })).durum, 422);
  });

  test('stoktan karşıla (3398-2 a): kilit, artık kaynaklı istek, bağlı kalem engelleri, birimi tutmayan kalem', async () => {
    let s3 = 0;
    const talep = async (malzemeNo: number, miktar: string, birim = 'adet') => {
      s3 += 1;
      const kat = randomUUID();
      await o().sahip.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [kat, malzemeNo]);
      const t = randomUUID();
      const k = randomUUID();
      await o().sahip.sorgu(
        `INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $2, 'ORN talep', $3, $3, 'taslak')`,
        [t, 990 + s3, kisi]);
      await o().sahip.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, katalog_id, ad, miktar, birim) VALUES ($1, $2, 1, $3, 'ORN kalem', $4, $5)",
        [t, k, kat, miktar, birim]);
      return { talepId: t, kalemId: k };
    };
    const satir = async (kalemId: string) => ihtiyaclarCevabi.parse((await al('satin_alma', '/stok/kontrol-ihtiyaclari')).govde).satirlar.find((x) => x.kalemId === kalemId);
    const kul = { id: kisi, ad: 'Deneme', islemler: [] };
    // Kilit: ilk istek kapanmadan ikinci başlarsa bekler, sonra kalanı görür; kilitsiz ikisi de aynı stoğu alırdı.
    const m = await kart('ORN-K6', 'cubuk', { d: 18, l: 3000 });
    await giris(m, '2');
    const a = await talep(m, '2');
    const b = await talep(m, '2');
    let birak = (): void => undefined;
    const engel = new Promise<void>((r) => { birak = r; });
    const ilk = o().vt.tx(async (db) => { const r = await stoktanKarsila(db, kul, { ...a, miktar: '2' }); await engel; return r; });
    await new Promise((r) => setTimeout(r, 150));
    const ikinci = o().vt.tx((db) => stoktanKarsila(db, kul, { ...b, miktar: '2' })).then(() => 'tamam', (h: unknown) => (h as { durum?: number }).durum ?? 'hata');
    await new Promise((r) => setTimeout(r, 300));
    birak();
    await ilk;
    assert.equal(await ikinci, 400);
    // Artık kaynaklı istek: artık aramadan düşer, "ayrıldı"da da düşük kalır, iptalde geri gelir.
    const uzun = await kart('ORN-K7', 'cubuk', { d: 16, l: 3000 });
    const kisa = await kart('ORN-K7', 'cubuk', { d: 16, l: 1000 });
    await giris(uzun, '2');
    const art = artikParcaCevabi.parse((await gonder('depo', '/stok/artik-parcalar', { malzemeNo: uzun, konumId: raf, boy: 1200 })).govde);
    const ara = async () => olcuAramaCevabi.parse((await al('satin_alma', '/stok/olcu-arama?form=cubuk&kalite=ORN-K7&d=16')).govde).adaylar.map((x) => [x.kaynak, x.artikId]);
    assert.deepEqual(await ara(), [['artik', art.id], ['stok', null]]);
    const c = await talep(kisa, '1');
    const ac = ayirmaCevabi.parse((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...c, miktar: '1' })).govde);
    const istek = ayirmaIstekleriCevabi.parse((await al('depo', '/stok/ayirma-istekleri')).govde).satirlar.find((x) => x.id === ac.id)!;
    assert.deepEqual(istek.kaynaklar.map((x) => [x.artikId, x.stokMiktari]), [[art.id, null]]);
    assert.deepEqual(await ara(), [['stok', null]]);
    const ay = ayirmaCevabi.parse((await gonder('depo', `/stok/ayirma-istekleri/${ac.id}/ilerlet`, { durum: 'ayrildi', surum: ac.surum })).govde);
    assert.deepEqual(await ara(), [['stok', null]]);
    assert.equal((await gonder('depo', `/stok/ayirma-istekleri/${ac.id}/iptal`, { neden: 'ORN', surum: ay.surum })).durum, 200);
    assert.deepEqual(await ara(), [['artik', art.id], ['stok', null]]);
    // Senaryoya girmiş kalem: neden "teklif", karşılama 422.
    const sen = await talep(m, '1');
    const senaryo = randomUUID();
    await o().sahip.sorgu("INSERT INTO satin_alma_senaryo (talep_id, id, ad) VALUES ($1, $2, 'ORN')", [sen.talepId, senaryo]);
    await o().sahip.sorgu('INSERT INTO satin_alma_senaryo_kalemi (talep_id, senaryo_id, kalem_id) VALUES ($1, $2, $3)', [sen.talepId, senaryo, sen.kalemId]);
    assert.equal((await satir(sen.kalemId))?.engel, 'teklif');
    assert.equal((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...sen, miktar: '1' })).durum, 422);
    // Kartın birimi kg, kalem adet: karşılık hesaplanamaz, karşılama 400.
    const kg = await kart('ORN-K8', 'cubuk', { l: 3000 }, 'kg');
    await giris(kg, '10');
    const d = await talep(kg, '2');
    assert.deepEqual([(await satir(d.kalemId))?.durum, (await satir(d.kalemId))?.karsilanan], ['bilinmiyor', null]);
    assert.equal((await gonder('satin_alma', '/stok/kontrol-ihtiyaclari/karsila', { ...d, miktar: '1' })).durum, 400);
  });
});

