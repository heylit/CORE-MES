import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import type { DurumCevabi, KapasiteCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI, receteRotaDurumu } from './disari.ts';
import { durum } from './servis.ts';
import type { MalzemeSiniri } from './servis.ts';

const PAROLA = 'dogru-parola-1';

type Dolu = { [K in keyof DurumCevabi]: NonNullable<DurumCevabi[K]> };
// Tam yetkili kullanıcıda hiçbir dilim null değildir.
function dolu(c: DurumCevabi): Dolu {
  for (const [ad, deger] of Object.entries(c)) assert.notEqual(deger, null, `${ad} null geldi`);
  return c as Dolu;
}

interface Kayit { anahtar: string; bicim: 'json' | 'metin'; deger: unknown; surum: number }

describe('recete-rota kayıt deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazar = '';
  let yazarId = 0;
  let ikinci = '';
  let okur = '';
  let sayfali = '';
  let yetkisiz = '';
  let tam = '';
  let sayac = 0;
  // Her test kendi anahtarında çalışır; ötekinin bıraktığına yaslanmaz.
  const yeniAnahtar = (): string => `recete-rota-motoru-v1:deneme${String(++sayac)}`;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, payload: payload as object | undefined });

  // Kişi yönetici rolüyle doğar; istenen işlemleri taşıyan geçici rol uygulamanın atama işleviyle verilir.
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/recete-rota/kayitlar/yaz', govde);
  const kayitlar = async (cerez: string): Promise<Kayit[]> => {
    const cevap = await istek(cerez, 'GET', '/recete-rota/kayitlar');
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { kayitlar: Kayit[] }).kayitlar;
  };
  const kayit = async (cerez: string, anahtar: string): Promise<Kayit | undefined> => (await kayitlar(cerez)).find((k) => k.anahtar === anahtar);

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    ({ cerez: yazar, id: yazarId } = await islemliKisi('yazar', ['recete-rota.yaz']));
    ({ cerez: ikinci } = await islemliKisi('ikinci', ['recete-rota.yaz']));
    ({ cerez: okur } = await islemliKisi('okur', ['recete-rota.oku']));
    ({ cerez: sayfali } = await islemliKisi('sayfali', ['sayfa.recete-rota']));
    ({ cerez: yetkisiz } = await islemliKisi('yetkisiz', ['sayfa.ayarlar']));
    tam = await girisCerezi('yonetici');
  });

  after(async () => { await ortam?.kaldir(); });

  test('RR-01: prototipin durumu yazılır ve aynen okunur; her yazma sürümü ilerletir', async () => {
    const a = yeniAnahtar();
    const durum = { version: 7, name: 'Deneme fabrika', items: [{ id: 'i1', code: 'HM-1', stock: 3 }], routes: {}, orders: [], savedAt: 1 };
    const ilk = await yaz(yazar, { anahtar: a, bicim: 'json', deger: durum, beklenenSurum: null });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const k1 = (ilk.json() as { kayit: Kayit }).kayit;
    assert.deepEqual({ ...k1, surum: 0 }, { anahtar: a, bicim: 'json', deger: durum, surum: 0 });
    const ikinciYazma = await yaz(yazar, { anahtar: a, bicim: 'json', deger: { ...durum, name: 'Deneme 2' }, beklenenSurum: k1.surum });
    const k2 = (ikinciYazma.json() as { kayit: Kayit }).kayit;
    assert.equal(k2.surum > k1.surum, true);
    assert.deepEqual(await kayit(okur, a), k2);
  });

  test('RR-02: sürüm tutmazsa yazma 409 ve kayıt değişmez; ikinci kişi birincinin üstüne yazamaz', async () => {
    const a = yeniAnahtar();
    const k = ((await yaz(yazar, { anahtar: a, bicim: 'json', deger: { v: 1 }, beklenenSurum: null })).json() as { kayit: Kayit }).kayit;
    assert.equal((await yaz(ikinci, { anahtar: a, bicim: 'json', deger: { v: 2 }, beklenenSurum: null })).statusCode, 409);
    assert.equal((await yaz(ikinci, { anahtar: a, bicim: 'json', deger: { v: 3 }, beklenenSurum: k.surum - 1 })).statusCode, 409);
    assert.deepEqual((await kayit(okur, a))?.deger, { v: 1 });
    assert.equal((await yaz(ikinci, { anahtar: a, bicim: 'json', deger: { v: 4 }, beklenenSurum: k.surum })).statusCode, 200);
    assert.deepEqual((await kayit(okur, a))?.deger, { v: 4 });
  });

  test('RR-03: aynı anda gelen iki ilk yazmadan yalnız biri geçer', async () => {
    const a = yeniAnahtar();
    const sonuc = await Promise.all([
      yaz(yazar, { anahtar: a, bicim: 'json', deger: { k: 'yazar' }, beklenenSurum: null }),
      yaz(ikinci, { anahtar: a, bicim: 'json', deger: { k: 'ikinci' }, beklenenSurum: null }),
    ]);
    assert.deepEqual(sonuc.map((c) => c.statusCode).sort(), [200, 409]);
    const kazanan = sonuc.find((c) => c.statusCode === 200)?.json() as { kayit: Kayit };
    assert.deepEqual((await kayit(okur, a))?.deger, kazanan.kayit.deger);
  });

  test('RR-04: metin biçimi dize olarak saklanır; dize olmayan metin ve U+0000 400 alır', async () => {
    const a = yeniAnahtar();
    const c = await yaz(yazar, { anahtar: a, bicim: 'metin', deger: 'düz metin {', beklenenSurum: null });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(await kayit(okur, a), { anahtar: a, bicim: 'metin', deger: 'düz metin {', surum: (c.json() as { kayit: Kayit }).kayit.surum });
    assert.equal((await yaz(yazar, { anahtar: yeniAnahtar(), bicim: 'metin', deger: { a: 1 }, beklenenSurum: null })).statusCode, 400);
    assert.equal((await yaz(yazar, { anahtar: yeniAnahtar(), bicim: 'json', deger: { t: 'a\u0000b' }, beklenenSurum: null })).statusCode, 400);
  });

  // Sızma testi B3: köprü yazma ucunda değerin boyutu sunucuda sınırlıdır; sınır köprünün gönderdiği üst sınırla (1 MB) aynıdır.
  test('RR-04b: 1 MB değer yazılır; 1 MB üstü değer 413 ve anlaşılır iletiyle reddedilir, kayıt açılmaz', async () => {
    const sinirda = yeniAnahtar();
    // JSON metni {"t":"..."} 8 bayt zarf taşır.
    const izinli = await yaz(yazar, { anahtar: sinirda, bicim: 'json', deger: { t: 'x'.repeat(1_000_000 - 8) }, beklenenSurum: null });
    assert.equal(izinli.statusCode, 200, izinli.body.slice(0, 200));
    const buyuk = yeniAnahtar();
    const red = await yaz(yazar, { anahtar: buyuk, bicim: 'json', deger: { t: 'x'.repeat(1_000_000 - 7) }, beklenenSurum: null });
    assert.equal(red.statusCode, 413, red.body.slice(0, 200));
    assert.match((red.json() as { mesaj: string }).mesaj, /1 MB/);
    assert.equal(await kayit(okur, buyuk), undefined);
    // Çok baytlı karakter bayt olarak sayılır (karakter değil).
    assert.equal((await yaz(yazar, { anahtar: yeniAnahtar(), bicim: 'metin', deger: 'ş'.repeat(500_001), beklenenSurum: null })).statusCode, 413);
  });

  test('RR-05: öneksiz ya da yol karakterli anahtar 400 alır; tabloda kısıt da durdurur', async () => {
    assert.equal((await yaz(yazar, { anahtar: 'mesai:x', bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 400);
    assert.equal((await yaz(yazar, { anahtar: 'recete-rota-motoru-v1:a/b', bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 400);
    await assert.rejects(vt().sorgu(
      "INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ('baska', 'json', '{}', 1, 1)",
    ));
  });

  test('RR-06: silme sürüm ister; yanlış sürüm 409, doğru sürüm siler, olmayan kayıt silindi: false', async () => {
    const a = yeniAnahtar();
    const k = ((await yaz(yazar, { anahtar: a, bicim: 'json', deger: { v: 1 }, beklenenSurum: null })).json() as { kayit: Kayit }).kayit;
    assert.equal((await istek(yazar, 'POST', '/recete-rota/kayitlar/sil', { anahtar: a, beklenenSurum: k.surum - 1 })).statusCode, 409);
    const sil = await istek(yazar, 'POST', '/recete-rota/kayitlar/sil', { anahtar: a, beklenenSurum: k.surum });
    assert.deepEqual(sil.json(), { silindi: true });
    assert.equal(await kayit(okur, a), undefined);
    assert.deepEqual((await istek(yazar, 'POST', '/recete-rota/kayitlar/sil', { anahtar: a, beklenenSurum: k.surum })).json(), { silindi: false });
  });

  test('RR-07: okuma oku, yaz ya da sayfa işlemiyle; yazma ve silme yalnız yaz ile; yetkisiz okuyamaz', async () => {
    const a = yeniAnahtar();
    assert.equal((await istek(sayfali, 'GET', '/recete-rota/kayitlar')).statusCode, 200);
    assert.equal((await istek(yazar, 'GET', '/recete-rota/kayitlar')).statusCode, 200);
    assert.equal((await istek(yetkisiz, 'GET', '/recete-rota/kayitlar')).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', '/recete-rota/ben')).statusCode, 403);
    assert.equal((await yaz(okur, { anahtar: a, bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 403);
    assert.equal((await yaz(sayfali, { anahtar: a, bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 403);
    assert.equal((await istek(okur, 'POST', '/recete-rota/kayitlar/sil', { anahtar: a, beklenenSurum: 1 })).statusCode, 403);
  });

  test('RR-08: ben kişiyi ve yazma bayrağını döner', async () => {
    assert.deepEqual((await istek(yazar, 'GET', '/recete-rota/ben')).json(), { kisi: { id: yazarId, ad: 'Deneme yazar' }, yazabilir: true });
    assert.equal(((await istek(okur, 'GET', '/recete-rota/ben')).json() as { yazabilir: boolean }).yazabilir, false);
  });

  test('RR-09: yazma deftere gövdesiz girer: anahtar, biçim ve beklenen sürüm yazılır, durum gövdesi yazılmaz', async () => {
    const a = yeniAnahtar();
    const gizli = 'GOVDE-DEFTERE-GIRMEMELI';
    assert.equal((await yaz(yazar, { anahtar: a, bicim: 'json', deger: { not: gizli }, beklenenSurum: null })).statusCode, 200);
    const satirlar = await vt().sorgu<{ metin: string }>(
      "SELECT row_to_json(d)::text AS metin FROM denetim_kaydi d WHERE yol LIKE '%/recete-rota/kayitlar/yaz' ORDER BY id DESC LIMIT 1",
    );
    assert.equal(satirlar.length, 1);
    assert.equal(satirlar[0]?.metin.includes(gizli), false);
    assert.equal(satirlar[0]?.metin.includes(a), true);
  });

  test('RR-10: disari.ts prototipin durum kaydını salt okunur verir', async () => {
    const yok = await vt().tx((db) => receteRotaDurumu(db));
    assert.equal(yok, null);
    await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { name: 'Deneme fabrika' }, beklenenSurum: null });
    assert.deepEqual((await vt().tx((db) => receteRotaDurumu(db)))?.deger, { name: 'Deneme fabrika' });
  });

  test('RR-11: durum ucu oku, yaz ya da sayfa işlemiyle açık; yetkisiz 403; kaynak boşken koleksiyonlar boş, sıfır uydurulmaz', async () => {
    for (const cerez of [okur, yazar, sayfali]) assert.equal((await istek(cerez, 'GET', '/recete-rota/durum')).statusCode, 200);
    assert.equal((await istek(yetkisiz, 'GET', '/recete-rota/durum')).statusCode, 403);
    const bos = dolu((await istek(tam, 'GET', '/recete-rota/durum')).json() as DurumCevabi);
    assert.deepEqual([bos.items, bos.wcs, bos.stations, bos.machines], [[], [], [], []]);
    assert.equal(bos.malzemeKesildi, false);
    // Plan ayarı planın sahibinden (kart #1186): prototipin settings alan adlarıyla, canlı ayar.
    assert.deepEqual(bos.settings, { rule: 'oncelik', dir: 'ileri', buffer: 2, freezeDays: 2, peopleLimit: false, planDrafts: false });
    assert.deepEqual(bos.moves, [], 'tam yetkili kullanıcıya stok hareketi dilimi gelir; henüz hareket yok');
    assert.equal(bos.people.some((k) => k.id === String(yazarId)), true);
    assert.deepEqual(bos.people.find((k) => k.id === String(yazarId)), {
      id: String(yazarId), name: 'Deneme yazar', code: null, role: null, stationId: null, stationAtama: false, wcId: null, shiftId: null, skills: [], cost: null, active: true,
    });
  });

  test('RR-12: durum ucu iş merkezi, istasyon, makine ve operasyon tipini sahibinin kaydından prototipin biçiminde verir', async () => {
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ('RRD-IM', 'Durum merkezi', NULL, true) RETURNING id");
    const istasyon = await vt().tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id, tip, uretim_alani, aktif) VALUES ('RRD-IS', 'Durum istasyonu', $1, 'talasli', false, true) RETURNING id", [merkez?.id]);
    const makine = await vt().tek<{ id: number }>(
      "INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('RRD-MK', 'Durum makinesi', $1, true) RETURNING id", [istasyon?.id]);
    await vt().sorgu(
      "INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, aktif, kisaltma, varsayilan_ayar_dk, varsayilan_birim_dk, varsayilan_istasyon_id) VALUES ('RRD-OP', 'Durum operasyonu', 'KES', true, 'DOP', '12.5', NULL, $1)",
      [istasyon?.id]);
    const d = dolu((await istek(tam, 'GET', '/recete-rota/durum')).json() as DurumCevabi);
    assert.deepEqual(d.wcs.find((w) => w.code === 'RRD-IM'), { id: String(merkez?.id), code: 'RRD-IM', name: 'Durum merkezi', week: null, aktif: true });
    assert.deepEqual(d.stations.find((s) => s.code === 'RRD-IS'), {
      id: String(istasyon?.id), code: 'RRD-IS', name: 'Durum istasyonu', wcId: String(merkez?.id), eff: 100, opPer: 1, count: 1, cost: null, aktif: true,
    });
    assert.deepEqual(d.machines.find((m) => m.code === 'RRD-MK'), {
      id: String(makine?.id), code: 'RRD-MK', name: 'Durum makinesi', stationId: String(istasyon?.id), status: 'aktif', aktif: true,
    });
    assert.deepEqual(d.opdefs.find((o) => o.code === 'RRD-OP'), {
      id: d.opdefs.find((o) => o.code === 'RRD-OP')?.id, code: 'RRD-OP', abbr: 'DOP', name: 'Durum operasyonu', group: 'KES', groupName: 'Kesim',
      stationId: String(istasyon?.id), setup: 12.5, cycle: null, aktif: true,
    });
    await vt().sorgu("INSERT INTO istasyonlar_makine_durumu (makine_id, durum, degistiren_kisi_id) VALUES ($1, 'ariza', $2)", [makine?.id, yoneticiId]);
    const sonra = dolu((await istek(tam, 'GET', '/recete-rota/durum')).json() as DurumCevabi);
    assert.equal(sonra.machines.find((m) => m.code === 'RRD-MK')?.status, 'ariza');
  });

  // Dolu veri: malzeme kartı, stok, birim, kişi ataması ve yetkinliği, vardiya ve tatil sahibinin tablosundan gelir.
  let kartSira = 0;
  async function kart(tur: string, durum: string, ad: string, birim: string): Promise<number> {
    kartSira += 1;
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RRD-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RRD-', $3, $4, $5, $6, $6) RETURNING no`,
      [`rrd-${String(kartSira)}`, tur, kartSira, durum, JSON.stringify({ id: `rrd-${String(kartSira)}`, com: { ad, birim } }), yoneticiId],
    );
    return r?.no ?? 0;
  }

  test('RR-13: durum ucu dolu veride malzeme ve stok eşlemesini, birimleri, kişinin iş merkezi ve yetkinliklerini, vardiya ve tatilleri verir', async () => {
    const hammadde = await kart('hammadde', 'aktif', 'RRD hammadde', 'kg');
    const yari = await kart('yarimamul', 'aktif', 'RRD yarı mamul', 'adet');
    await kart('mamul', 'taslak', 'RRD taslak', 'adet');
    const kabul = await vt().tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'");
    await vt().sorgu("INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, '12.5', now())", [hammadde, kabul?.id]);
    await vt().sorgu('INSERT INTO stok_malzeme_ayari (malzeme_id, kritik_seviye) VALUES ($1, 5), ($2, 2)', [hammadde, yari]);
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('RRD2-IM', 'Kişi merkezi') RETURNING id");
    const ist1 = await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('RRD2-1', 'Birinci', $1, true) RETURNING id", [merkez?.id]);
    const ist2 = await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('RRD2-2', 'İkinci', $1, true) RETURNING id", [merkez?.id]);
    await vt().sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2020-01-01', 100)", [ist1?.id, yazarId]);
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2), ($1, $3)', [yazarId, ist1?.id, ist2?.id]);
    const vardiya = await vt().tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('RRD sabah', '07:00', '15:00') RETURNING id");
    await vt().sorgu("INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) VALUES ($1, '12:00', '12:30')", [vardiya?.id]);
    await vt().sorgu("INSERT INTO vardiya_takvim_gunu (tarih, tur, ad) VALUES ('2026-05-01', 'tatil', 'Emek'), ('2026-05-02', 'kapali', 'Köprü')");

    const d = dolu((await istek(tam, 'GET', '/recete-rota/durum')).json() as DurumCevabi);
    assert.deepEqual(d.items.map((i) => i.name).sort(), ['RRD hammadde', 'RRD yarı mamul']);
    const h = d.items.find((i) => i.kayitNo === hammadde);
    assert.deepEqual({ tip: h?.type, birim: h?.unit, stok: h?.stock, min: h?.min, aktif: h?.aktif }, { tip: 'ham', birim: 'kg', stok: 12.5, min: 5, aktif: true });
    const y = d.items.find((i) => i.kayitNo === yari);
    assert.deepEqual({ tip: y?.type, stok: y?.stock, min: y?.min }, { tip: 'yari', stok: 0, min: 2 });
    assert.equal(d.units.some((b) => b.kod === 'kg' && b.aktif), true);
    const kisi = d.people.find((k) => k.id === String(yazarId));
    assert.deepEqual({ wcId: kisi?.wcId, skills: [...(kisi?.skills ?? [])].sort() }, { wcId: String(merkez?.id), skills: [String(ist1?.id), String(ist2?.id)].sort() });
    assert.deepEqual(d.cal.shifts.find((v) => v.name === 'RRD sabah'), {
      id: String(vardiya?.id), name: 'RRD sabah', start: '07:00', end: '15:00', breaks: [{ start: '12:00', end: '12:30' }], netDakika: 450,
    });
    assert.deepEqual(d.cal.holidays, ['2026-05-01']);
  });

  test('RR-14: malzeme okuması sayfa sınırında kesilir ve malzemeKesildi bunu bildirir; sınır yetiyorsa kesilmez', async () => {
    await kart('mamul', 'aktif', 'RRD sayfa 1', 'adet');
    await kart('mamul', 'aktif', 'RRD sayfa 2', 'adet');
    await kart('mamul', 'aktif', 'RRD sayfa 3', 'adet');
    const malzemeKullanicisi = { id: yoneticiId, ad: 'Deneme', islemler: ['sayfa.malzemeler', 'sayfa.stok'] } as const satisfies Kullanici;
    const say = async (sinir: MalzemeSiniri): Promise<[number, boolean]> => {
      const d = await vt().tx((db) => durum(db, malzemeKullanicisi, sinir));
      return [d.items?.length ?? 0, d.malzemeKesildi];
    };
    const hepsi = (await vt().tx((db) => durum(db, malzemeKullanicisi))).items?.length ?? 0;
    assert.equal(hepsi >= 5, true);
    assert.deepEqual(await say({ sayfaBoyu: 2, azamiSayfa: 2 }), [4, true]);
    assert.deepEqual(await say({ sayfaBoyu: 2, azamiSayfa: 1 }), [2, true]);
    assert.deepEqual(await say({ sayfaBoyu: 200, azamiSayfa: 1 }), [hepsi, false]);
    assert.deepEqual(await say({ sayfaBoyu: hepsi, azamiSayfa: 1 }), [hepsi, false]);
    assert.deepEqual(await say({ sayfaBoyu: 1, azamiSayfa: hepsi }), [hepsi, false]);
  });

  test('RR-15: her dilim sahibinin okuma yetkisini ister; yetkisi olmayana o dilim null gelir, tam yetkiliye dolu', async () => {
    const durumOku = async (cerez: string): Promise<DurumCevabi> => {
      const c = await istek(cerez, 'GET', '/recete-rota/durum');
      assert.equal(c.statusCode, 200, c.body);
      return c.json() as DurumCevabi;
    };
    const bosluk = (d: DurumCevabi) => ({
      items: d.items === null, units: d.units === null, opdefs: d.opdefs === null, wcs: d.wcs === null, stations: d.stations === null,
      machines: d.machines === null, people: d.people === null,
    });
    const hepsiNull = { items: true, units: true, opdefs: true, wcs: true, stations: true, machines: true, people: true };
    const yalniz = await durumOku(okur);
    assert.deepEqual(bosluk(yalniz), hepsiNull);
    // Vardiya takvimi sahibinde yalnız oturum ister: açık kalır.
    assert.equal(yalniz.cal.shifts.some((v) => v.name === 'RRD sabah'), true);

    const kisiyle = await islemliKisi('kisioku', ['recete-rota.oku', 'kisiler.oku']);
    const kisiDurumu = await durumOku(kisiyle.cerez);
    assert.deepEqual(bosluk(kisiDurumu), { ...hepsiNull, people: false });
    assert.equal(kisiDurumu.people?.some((k) => k.id === String(yazarId)), true);
    // Kişinin iş merkezi ve yetkinliği istasyon verisidir: istasyon yetkisi yoksa gelmez.
    assert.deepEqual(kisiDurumu.people?.find((k) => k.id === String(yazarId))?.skills, []);
    assert.equal(kisiDurumu.people?.find((k) => k.id === String(yazarId))?.wcId, null);

    const malzemeci = await islemliKisi('malzemeoku', ['recete-rota.oku', 'sayfa.malzemeler']);
    const malzemeDurumu = await durumOku(malzemeci.cerez);
    assert.deepEqual(bosluk(malzemeDurumu), { ...hepsiNull, items: false, units: false });
    assert.equal(malzemeDurumu.items?.some((i) => i.name === 'RRD hammadde'), true);
    // Stok yetkisi yoksa malzemenin stoku ve kritik seviyesi null.
    assert.deepEqual(malzemeDurumu.items?.map((i) => [i.stock, i.min]).filter(([s, m]) => s !== null || m !== null), []);

    const stoklu = await islemliKisi('stokoku', ['recete-rota.oku', 'sayfa.malzemeler', 'sayfa.stok']);
    assert.equal((await durumOku(stoklu.cerez)).items?.find((i) => i.name === 'RRD hammadde')?.stock, 12.5);

    const istasyoncu = await islemliKisi('istasyonoku', ['recete-rota.oku', 'sayfa.istasyonlar']);
    assert.deepEqual(bosluk(await durumOku(istasyoncu.cerez)), { ...hepsiNull, opdefs: false, wcs: false, stations: false, machines: false });

    assert.deepEqual(bosluk(await durumOku(tam)), { items: false, units: false, opdefs: false, wcs: false, stations: false, machines: false, people: false });
    const t = dolu(await durumOku(tam));
    assert.equal(t.people.find((k) => k.id === String(yazarId))?.wcId !== null, true);
  });

  test('RR-17: durum ucu adımın fason seçicisi için yalnız aktif fason firmaları verir; rota okuma yetkisi yoksa null (kart #1310)', async () => {
    const firma = async (ad: string, fason: boolean): Promise<number> => {
      const c = await app.inject({ method: 'POST', url: '/api/musteri-tedarikci/firmalar/ekle', headers: { cookie: tam, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: { ad, tur: 'tedarikci', fason } });
      assert.equal(c.statusCode, 200, c.body);
      return (c.json() as { firma: { id: number } }).firma.id;
    };
    const fasoncu = await firma('RRD fasoncu', true);
    const fasonsuz = await firma('RRD tedarikci', false);
    const d = (await istek(tam, 'GET', '/recete-rota/durum')).json() as DurumCevabi;
    assert.equal(d.fasonFirms?.find((f) => f.id === String(fasoncu))?.name, 'RRD fasoncu');
    assert.equal(d.fasonFirms?.some((f) => f.id === String(fasonsuz)), false);
    assert.equal(((await istek(okur, 'GET', '/recete-rota/durum')).json() as DurumCevabi).fasonFirms, null);
  });

  // Plan kapasitesi (kart #1324): Vardiya takviminden fazla mesai, onaylı izin ve iş merkezi başına atama payı.
  test('RR-18: kapasite ucu istasyona özel fazla mesaiyi yalnız o istasyonda, kişinin iznini, fazla mesaisini ve merkez başına payını verir', async () => {
    const komut = async (url: string, payload: unknown) => {
      const c = await app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: tam, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: payload as object });
      assert.equal(c.statusCode, 200, c.body);
    };
    const gun = (n: number) => tesisGunu(Date.now() + n * 86_400_000);
    const merkez = async (kod: string) => (await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ($1, $1, NULL, true) RETURNING id", [kod]))!.id;
    const istasyon = async (kod: string, m: number) => (await vt().tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id, tip, uretim_alani, aktif) VALUES ($1, $1, $2, 'talasli', false, true) RETURNING id", [kod, m]))!.id;
    const [a, b] = [await merkez('RRK-A'), await merkez('RRK-B')];
    const [a1, a2, b1] = [await istasyon('RRK-A1', a), await istasyon('RRK-A2', a), await istasyon('RRK-B1', b)];
    const kisi = await vt().tx((db) => yoneticiOlustur(db, { ad: 'RRK personel', kullaniciAdi: 'rrkpersonel', parola: PAROLA }));
    for (const i of [a1, b1]) assert.equal((await istek(tam, 'POST', `/istasyonlar/${i}/kisiler/ata`, { kisiId: kisi, yuzde: '50.00' })).statusCode, 200);
    await komut('/fazla-mesai', { tarih: gun(2), baslangic: '18:00', bitis: '20:00', kapsam: 'istasyon', istasyonId: a2, kisiIdleri: [kisi] });
    await komut('/ik/personel/emp_rrk/kaydet', { govde: { id: 'emp_rrk', kind: 'emp', ad: 'RRK', soyad: 'Personel', isMerkeziId: a, kisiId: kisi }, surum: null });
    // Gün bugüne göredir ve hafta sonuna düşebilir: takvim günüyle sayılan izin türü (yıllık izin iş günüyle sınırlı, soru 55).
    await komut('/ik/izinler/leave_rrk/kaydet',
      { govde: { id: 'leave_rrk', kind: 'leave', empId: 'emp_rrk', tur: 'Ücretsiz izin', baslangic: gun(3), bitis: gun(3), gun: 1, durum: 'Onaylandı' }, surum: null });

    const cevap = await istek(tam, 'GET', '/recete-rota/kapasite');
    assert.equal(cevap.statusCode, 200, cevap.body);
    const k = cevap.json() as KapasiteCevabi;
    assert.equal(k.baslangic, gun(0));
    assert.deepEqual(k.isMerkezleri?.find((m) => m.id === String(a)), { id: String(a), fazlaMesai: [] }, 'istasyona özel mesai merkeze yazılmaz');
    assert.deepEqual(k.istasyonlar?.filter((i) => [a1, a2, b1].map(String).includes(i.id)), [{ id: String(a2), fazlaMesai: [{ tarih: gun(2), dakika: 120 }] }]);
    const p = k.kisiler?.find((x) => x.id === String(kisi));
    assert.deepEqual(p && { ...p, paylar: [...p.paylar].sort((x, y) => Number(x.wcId) - Number(y.wcId)) }, {
      id: String(kisi), izinli: [gun(3)], fazlaMesai: [{ tarih: gun(2), dakika: 120 }], paylar: [{ wcId: String(a), pay: 0.5 }, { wcId: String(b), pay: 0.5 }],
    });
    // İstasyon ve kişi okuma yetkisi olmayana dilimler null; Reçete ve Rota okuma yetkisi olmayan okuyamaz.
    const okurun = (await istek(okur, 'GET', '/recete-rota/kapasite')).json() as KapasiteCevabi;
    assert.deepEqual([okurun.isMerkezleri, okurun.istasyonlar, okurun.kisiler], [null, null, null]);
    assert.equal((await istek(yetkisiz, 'GET', '/recete-rota/kapasite')).statusCode, 403);
  });

  // Birim maliyetler finanstadır (kart #1187): durum dilimi finans.maliyet-oku ister, yazma finans.yonet ister.
  test('RR-16: maliyet dilimi finans.maliyet-oku olana gelir, olmayana null; yazma finans.yonet ister ve dilimde sürümle görünür; satırı olmayan kalem haritada yoktur', async () => {
    const durumOku = async (cerez: string): Promise<DurumCevabi> => {
      const c = await istek(cerez, 'GET', '/recete-rota/durum');
      assert.equal(c.statusCode, 200, c.body);
      return c.json() as DurumCevabi;
    };
    const no = await kart('hammadde', 'aktif', 'RRM hammadde', 'kg');
    const bos = await kart('hammadde', 'aktif', 'RRM satırsız', 'kg');
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ('RRM-IM', 'Maliyet merkezi', NULL, true) RETURNING id");
    const istasyon = await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('RRM-IS', 'Maliyet istasyonu', $1, true) RETURNING id", [merkez?.id]);

    const goren = await islemliKisi('maliyetgoren', ['recete-rota.oku', 'finans.maliyet-oku']);
    const yazan = await islemliKisi('maliyetyazan', ['recete-rota.oku', 'finans.maliyet-oku', 'finans.yonet']);
    const yalniz = await islemliKisi('maliyetyalniz', ['recete-rota.oku', 'finans.yonet']);

    // Başlangıçta tablolar boştur: dilim vardır ama harita boştur (sıfır uydurulmaz).
    assert.deepEqual((await durumOku(goren.cerez)).maliyet, { yazabilir: false, malzeme: {}, istasyon: {}, kisi: {} });
    const yaz = (cerez: string, tur: string, govde: Record<string, unknown>) => istek(cerez, 'POST', `/finans/maliyetler/${tur}/yaz`, govde);
    assert.equal((await yaz(goren.cerez, 'malzeme', { anahtar: no, birimMaliyet: 5, surum: null })).statusCode, 403);
    assert.equal((await yaz(yazan.cerez, 'malzeme', { anahtar: no, birimMaliyet: 12.5, surum: null })).statusCode, 200);
    assert.equal((await yaz(yazan.cerez, 'istasyon', { anahtar: istasyon?.id, birimMaliyet: 450, surum: null })).statusCode, 200);
    assert.equal((await yaz(yazan.cerez, 'kisi', { anahtar: yazarId, birimMaliyet: 95.5, surum: null })).statusCode, 200);
    assert.equal((await yaz(yazan.cerez, 'malzeme', { anahtar: no, birimMaliyet: 13, surum: 1 })).statusCode, 200);

    const g = (await durumOku(goren.cerez)).maliyet;
    assert.deepEqual(g, {
      yazabilir: false,
      malzeme: { [String(no)]: { birimMaliyet: '13.0000', paraBirimi: 'TRY', surum: 2 } },
      istasyon: { [String(istasyon?.id)]: { birimMaliyet: '450.0000', paraBirimi: 'TRY', surum: 1 } },
      kisi: { [String(yazarId)]: { birimMaliyet: '95.5000', paraBirimi: 'TRY', surum: 1 } },
    });
    assert.equal(g?.malzeme[String(bos)], undefined);
    assert.equal((await durumOku(yazan.cerez)).maliyet?.yazabilir, true);
    // Okuma işlemi olmayan (yazma yetkisi tek başına görmek vermez), recete-rota okuyan ve tam yetkili.
    assert.equal((await durumOku(yalniz.cerez)).maliyet, null);
    assert.equal((await durumOku(okur)).maliyet, null);
    assert.equal((await durumOku(tam)).maliyet?.yazabilir, true);
    // Maliyet alanı başka dilimleri etkilemez: malzeme kartının kendi maliyet alanı null kalır.
    assert.equal((await durumOku(tam)).items?.find((i) => i.kayitNo === no)?.cost, null);
  });
});

