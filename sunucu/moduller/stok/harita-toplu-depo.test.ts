import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { haritaOzetiCevabi, topluBolumDeposuCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { HaritaOzetiCevabi, TopluBolumDeposuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { deposuzBolumler } from './kurallar.ts';

// 2902: "Bütün bölümleri depo yap". Deposu olmayan (ya da depodan çıkarılmış) her bölüm tek komutta stok deposu olur, ardından eşleme
// koşar; sonuç sayılarla döner. Uç tek transaction'dır: bir bölümde hata olursa hiçbir depo ve konum kalmaz.
const PAROLA = 'dogru-parola-1';

describe('stok toplu bölüm deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const iste = async <T = unknown>(kim: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> => {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { ...(kim === null ? {} : { cookie: cerezler.get(kim) ?? '' }), ...(yontem === 'POST' ? { 'istek-kimligi': randomUUID() } : {}) }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: c.json() as T };
  };
  const salon = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>(
    'INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, kaydeden_kisi_id) VALUES ($1, $1, 20, 20, 4, (SELECT min(id) FROM kisi)) RETURNING id', [kod]))!.id;
  const raf = async (salonId: number, kod: string, bolme: number): Promise<void> => {
    const r = (await o().vt.tek<{ id: number }>(
      `INSERT INTO atolye_raf (salon_id, kod, ad, tur, bolme_sayisi, kat_sayisi, goz_sayisi, bolme_genisligi, derinlik, yukseklik, x, z, donus)
       VALUES ($1, $2, 'Deneme rafı', 'palet', $3, 1, 1, 2, 1, 2, 5, 5, 0) RETURNING id`, [salonId, kod, bolme]))!.id;
    for (let b = 1; b <= bolme; b++) await o().vt.sorgu('INSERT INTO atolye_goz (raf_id, bolme, kat, goz) VALUES ($1, $2, 1, 1)', [r, b]);
  };
  const alan = async (salonId: number, tur: string): Promise<void> => {
    await o().vt.sorgu('INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, $2, $3, 2, 2, 0, 2, 2)', [salonId, tur, `Deneme ${tur}`]);
  };
  const depoKodu = async (salonId: number): Promise<{ kod: string; aktif: boolean } | null> =>
    (await o().vt.tek<{ kod: string; aktif: boolean }>('SELECT kod, aktif FROM stok_depo WHERE atolye_salon_id = $1', [salonId])) ?? null;
  const konumSayisi = async (): Promise<number> => (await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_konum WHERE aktif'))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('stok_toplu_depo');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const yon = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    for (const rol of ['depo', 'kalite']) {
      const r = (await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]))!.id;
      await ortam.vt.tx(async (db) => {
        const k = await yoneticiOlustur(db, { ad: `Deneme ${rol}`, kullaniciAdi: rol, parola: PAROLA });
        await rolAta(db, yonetici, k, r);
        await rolAl(db, yonetici, k, yon);
      });
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: rol, parola: PAROLA } });
      assert.equal(g.statusCode, 200);
      cerezler.set(rol, String(g.headers['set-cookie']).split(';')[0] ?? '');
    }
  });
  after(async () => { await ortam?.kaldir(); });

  test('kural: deposuz bölüm ve konum olamayan yer; fabrika geneli alan sayılmaz, aktif depolu bölüm listede yok, pasif depo kimliğiyle döner', () => {
    const goz = (id: number, salonId: number) => ({ id, adres: `R-${id}`, salonId, salonKodu: `S${salonId}`, bolme: 1, kat: 1, rafAktif: true });
    const sonuc = deposuzBolumler({
      gozler: [goz(1, 10), goz(2, 10), goz(3, 20), goz(4, 30)],
      alanlar: [{ id: 1, salonId: 10, tur: 'kabul', ad: 'k' }, { id: 2, salonId: 40, tur: 'fason', ad: 'f' }, { id: 3, salonId: 40, tur: 'yuruyus_yolu', ad: 'y' }],
      depolar: [{ id: 1, kod: 'ANA', salonId: null, aktif: true }, { id: 2, kod: 'S20', salonId: 20, aktif: true }, { id: 3, kod: 'S30', salonId: 30, aktif: false }],
    });
    assert.deepEqual(sonuc, [
      { salonId: 10, kod: 'S10', depoId: null, yer: 3 },
      { salonId: 30, kod: 'S30', depoId: 3, yer: 1 },
      { salonId: 40, kod: 'BOLUM40', depoId: null, yer: 0 },
    ]);
  });

  test('yetki: girişsiz 401, stok.harita-yaz olmayan 403; hiçbir şey yazılmaz', async () => {
    const once = await konumSayisi();
    assert.equal((await iste(null, 'POST', '/stok/harita-bolumleri/toplu-depo')).durum, 401);
    assert.equal((await iste('kalite', 'POST', '/stok/harita-bolumleri/toplu-depo')).durum, 403);
    assert.equal(await konumSayisi(), once);
  });

  test('bütün deposuz bölümler depo olur, eşleme koşar; sayılar doğru, ikinci komut boş geçer', async () => {
    const a = await salon('TD-A');
    await raf(a, 'TA', 2);
    await alan(a, 'kabul');
    await alan(a, 'yuruyus_yolu');
    const b = await salon('TD-B');
    await alan(b, 'depo_zemini');
    await alan(b, 'fason');
    // Elle depodan çıkarılmış bölüm (pasif depo kaydı) bilerek kapatılmıştır: toplu komut açmaz, ayrı listeler (Güvenlik ve Atölye N1).
    const c = await salon('TD-C');
    await raf(c, 'TC', 1);
    assert.equal((await iste('depo', 'POST', `/stok/harita-bolumleri/${c}/depo`, { depo: true })).durum, 200);
    assert.equal((await iste('depo', 'POST', `/stok/harita-bolumleri/${c}/depo`, { depo: false })).durum, 200);
    assert.deepEqual(await depoKodu(c), { kod: 'TDC', aktif: false });
    // Fason alanı deposuz bölümde de ANA'da konum olur; toplu komut onu bölümün deposuna taşır (yeni konum sayılmaz).
    assert.equal((await iste('depo', 'POST', '/stok/konumlar/haritadan-esle')).durum, 200);

    const oz = await iste<HaritaOzetiCevabi>('depo', 'GET', '/stok/harita-ozeti');
    haritaOzetiCevabi.parse(oz.govde);
    assert.equal(oz.govde.deposuzYer, 2 + 1 + 1, 'A: iki göz ve kabul; B: depo zemini; C pasif depolu, sayılmaz');
    const once = await konumSayisi();

    const t = await iste<TopluBolumDeposuCevabi>('depo', 'POST', '/stok/harita-bolumleri/toplu-depo');
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    topluBolumDeposuCevabi.parse(t.govde);
    assert.equal(t.govde.acilanDepo, 2);
    assert.equal(t.govde.eklenen, 4, 'A: iki göz ve kabul; B: depo zemini');
    assert.deepEqual(t.govde.atlanan, []);
    assert.deepEqual(t.govde.atlananPasifDepolar, ['TDC']);
    assert.equal(await konumSayisi(), once + 4);
    assert.deepEqual(await depoKodu(a), { kod: 'TDA', aktif: true });
    // Yalnız alanı olan bölümün kodu harita alanında yoktur; tek tek "Depo yap" gibi BOLUM<no> olur.
    assert.deepEqual(await depoKodu(b), { kod: `BOLUM${b}`, aktif: true });
    assert.deepEqual(await depoKodu(c), { kod: 'TDC', aktif: false });
    assert.equal(t.govde.ozet.deposuzYer, 0);
    assert.ok(t.govde.ozet.bolumler.filter((x) => [a, b].includes(x.salonId)).every((x) => x.depoKod !== null));
    assert.equal(t.govde.ozet.bolumler.find((x) => x.salonId === c)?.depoKod, null);
    const fason = await o().vt.tek<{ depo: string }>(
      "SELECT d.kod AS depo FROM stok_konum k JOIN stok_depo d ON d.id = k.depo_id JOIN atolye_alan a ON a.id = k.atolye_alan_id WHERE a.salon_id = $1 AND a.tur = 'fason'", [b]);
    assert.equal(fason?.depo, `BOLUM${b}`);

    const ikinci = await iste<TopluBolumDeposuCevabi>('depo', 'POST', '/stok/harita-bolumleri/toplu-depo');
    assert.equal(ikinci.durum, 200);
    assert.deepEqual([ikinci.govde.acilanDepo, ikinci.govde.eklenen, ikinci.govde.atlanan.length], [0, 0, 0]);
    assert.deepEqual(ikinci.govde.atlananPasifDepolar, ['TDC']);
  });

  test('bir bölümde hata olursa hiçbir depo ve konum yazılmaz', async () => {
    const d = await salon('TD-D');
    await raf(d, 'TD', 2);
    const e = await salon('TD-E');
    await raf(e, 'TE', 1);
    const once = await konumSayisi();
    const depoSayisi = async () => (await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_depo'))!.n;
    const onceDepo = await depoSayisi();
    // İkinci bölümün deposu açılırken veritabanı reddeder (ilk bölüm o ana kadar yazılmıştır).
    await o().sahip.sorgu(`CREATE FUNCTION deneme_depo_reddi() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.kod = 'TDE' THEN RAISE EXCEPTION 'deneme reddi'; END IF; RETURN NEW; END $$`);
    await o().sahip.sorgu('CREATE TRIGGER deneme_depo_reddi BEFORE INSERT ON stok_depo FOR EACH ROW EXECUTE FUNCTION deneme_depo_reddi()');
    try {
      assert.notEqual((await iste('depo', 'POST', '/stok/harita-bolumleri/toplu-depo')).durum, 200);
    } finally {
      await o().sahip.sorgu('DROP TRIGGER deneme_depo_reddi ON stok_depo');
      await o().sahip.sorgu('DROP FUNCTION deneme_depo_reddi()');
    }
    assert.equal(await depoSayisi(), onceDepo, 'ilk bölümün deposu da geri alındı');
    assert.equal(await konumSayisi(), once);
    assert.equal(await depoKodu(d), null);
    const t = await iste<TopluBolumDeposuCevabi>('depo', 'POST', '/stok/harita-bolumleri/toplu-depo');
    assert.deepEqual([t.durum, t.govde.acilanDepo, t.govde.eklenen], [200, 2, 3]);
  });
});
