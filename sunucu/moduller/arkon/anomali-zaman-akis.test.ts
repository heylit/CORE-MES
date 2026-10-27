import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { anomaliOlaylariCevabi } from '#paylasilan/sozlesme/arkon.ts';
import type { AnomaliOlaylariCevabi, AnomaliOlayiSatiri } from '#paylasilan/sozlesme/arkon.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { gunEkle } from './kurallar.ts';
import { zamanOlaylariniYenile } from './anomali-zaman.ts';

const PAROLA = 'dogru-parola-1';
const SAAT = 3_600_000;

interface Cevap<T = unknown> { durum: number; govde: T }

// Kart 764: zaman olayları 15 dakikalık işte yazılır, sayfa ucundan okunur. Gün boyu açık vardiyada net dakika takvim dakikasıdır.
describe('arkon üretim anomalisi zaman olayları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let yonetici = '';
  let hazirlik = '';
  let operator = '';
  let sayac = 0;
  let gunBasi = 0;
  let merkezId = 0;
  let istasyonId = 0;
  let makineId = 0;
  let a10 = 0;
  let a20 = 0;
  let b10 = 0;
  let emirA = 0;
  let emirB = 0;

  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const an = (saat: number): number => gunBasi + saat * SAAT;
  const anMetni = (saat: number): string => new Date(an(saat)).toISOString();

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function istek<T = unknown>(cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const cevap = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { ...(cerez ? { cookie: cerez } : {}), ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  async function kisiKur(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const gecici = await o().vt.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]);
    for (const islem of islemler) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici!.id, islem]);
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }
  const ayarYaz = (anahtar: string, deger: number | null) => istek(yonetici, 'POST', `/ayarlar/${anahtar}/degistir`, { deger });

  // Rotalı emir; adımlar aynı makinede ve bekleyen. Canlı plana `yer` saatleriyle yerleşir.
  async function emirKur(yer: [number, number][]): Promise<{ emirId: number; adimlar: number[] }> {
    sayac += 1;
    const tip = (await o().sahip.tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`ZT${sayac}`, 'Deneme tipi', 'TAL']))!.id;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ANZ-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'ANZ-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`anz-${sayac}`, sayac, JSON.stringify({ id: `anz-${sayac}`, com: { ad: `Deneme ${sayac}` } }), yoneticiId],
    ))!.no;
    await o().sahip.sorgu("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2)", [kart, yoneticiId]);
    const revizyon = (await o().sahip.tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const { uretimEmriId } = await o().vt.tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId, malzemeNo: kart, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyon,
      isEmirleri: yer.map((_, n) => ({
        sira: n + 1, opNo: (n + 1) * 10, ad: `Adım ${n + 1}`, operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '0', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      })),
    }));
    const adimlar = (await o().sahip.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [uretimEmriId])).map((r) => r.id);
    for (const [n, [bas, bit]] of yer.entries()) await yerlestir(adimlar[n]!, bas, bit);
    return { emirId: uretimEmriId, adimlar };
  }
  const yerlestir = (isEmriId: number, bas: number, bit: number) => o().sahip.sorgu(
    `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id) VALUES ($1, $2, NULL, $3::timestamptz, $4::timestamptz, $5)
     ON CONFLICT (is_emri_id) DO UPDATE SET baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis`,
    [isEmriId, makineId, anMetni(bas), anMetni(bit), yoneticiId]);
  const ayar = (emirId: number, isEmriId: number, saat: number) => o().sahip.sorgu(
    "INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, zaman, is_emri_id) VALUES ($1, $2, $3, 'ayar', $4::timestamptz, $5)",
    [emirId, yoneticiId, istasyonId, anMetni(saat), isEmriId]);
  const yenile = (saat: number) => o().vt.tx((db) => zamanOlaylariniYenile(db, an(saat)));
  const olaylar = () => o().sahip.sorgu<{ tur: string; isEmriId: number; dakika: number; planAni: number; gercekAni: number | null; kapanis: string | null; kok: string | null }>(
    `SELECT o.tur, o.is_emri_id AS "isEmriId", o.dakika::float8 AS dakika, (extract(epoch FROM o.plan_ani) * 1000)::float8 AS "planAni",
            (extract(epoch FROM o.gercek_ani) * 1000)::float8 AS "gercekAni", o.kapanis::text AS kapanis, k.tur || ':' || k.is_emri_id AS kok
       FROM arkon_anomali_olayi o LEFT JOIN arkon_anomali_olayi k ON k.id = o.kok_olay_id ORDER BY o.id`);
  const bul = async (tur: string, isEmriId: number) => (await olaylar()).find((r) => r.tur === tur && r.isEmriId === isEmriId);

  before(async () => {
    ortam = await testVeritabaniKur('arkonzaman');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ARKON.AZ', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await girisCerezi('yonetici');
    hazirlik = (await kisiKur('hz1', ['arkon.hazirlik', 'sayfa.arkon'])).cerez;
    operator = (await kisiKur('op1', ['arkon.operator', 'sayfa.arkon', 'terminal.uret'])).cerez;
    gunBasi = tesisGunBasi(tesisGunu(Date.now()));
    const merkez = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: 'ZM1', ad: 'Zaman merkezi' });
    merkezId = merkez.govde.id;
    const ist = await istek<{ id: number }>(yonetici, 'POST', '/istasyonlar', { kod: 'ZI1', ad: 'Zaman istasyonu', isMerkeziId: merkezId, tip: 'talasli' });
    istasyonId = ist.govde.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('ZK1', 'Tezgah Z', $1) RETURNING id", [istasyonId]))!.id;
    const vardiya = (await ortam.sahip.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Gün Z', '00:00', '23:59') RETURNING id"))!.id;
    await ortam.sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [merkezId, vardiya]);
    // A: iki adım (6-8, 8-10), teslimi dün; B: tek adım (10-12), teslimsiz. Üçü aynı tezgahta.
    const a = await emirKur([[6, 8], [8, 10]]);
    emirA = a.emirId; a10 = a.adimlar[0]!; a20 = a.adimlar[1]!;
    await ortam.sahip.sorgu('UPDATE uretim_emri SET teslim = $2::date WHERE id = $1', [emirA, gunEkle(tesisGunu(gunBasi), -1)]);
    const b = await emirKur([[10, 12]]);
    emirB = b.emirId; b10 = b.adimlar[0]!;
  });
  after(async () => { await ortam?.kaldir(); });

  test('uç: hazırlık 200 ve sözleşmeye uyar; operatör 403, oturumsuz 401; eşikler boşken (770 b) iş olay yazmaz', async () => {
    await yenile(9);
    assert.deepEqual(await olaylar(), []);
    const cevap = await istek<AnomaliOlaylariCevabi>(hazirlik, 'GET', '/arkon/anomali-olaylari');
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    assert.equal(anomaliOlaylariCevabi.safeParse(cevap.govde).success, true);
    assert.deepEqual(cevap.govde.esikler, { gecGirisDk: null, gecTeslimDk: null, bitisKaymaDk: null, sureAsimYuzde: null });
    assert.deepEqual(cevap.govde.olaylar, []);
    assert.equal((await istek(operator, 'GET', '/arkon/anomali-olaylari')).durum, 403);
    assert.equal((await istek(null, 'GET', '/arkon/anomali-olaylari')).durum, 401);
  });

  test('AR-AN-13, 15, 16: geç giriş olayı açılır; bekleyen adıma ve tezgahtaki sonraki işe etkisi, emrin teslim riski kökle bağlanır', async () => {
    assert.equal((await ayarYaz('arkon.anomali-gec-giris-dk', 30)).durum, 200);
    await yenile(9);
    const gg10 = await bul('gec-giris', a10);
    assert.deepEqual([gg10?.dakika, gg10?.planAni, gg10?.kapanis], [180, an(6), null], '6:00 planlı, 9:00 hâlâ girilmedi');
    assert.equal((await bul('gec-giris', a20))?.dakika, 60);
    assert.equal(await bul('gec-giris', b10), undefined, 'B 10:00 planlı, vakti gelmedi');
    // A10 girmediği için tahmini bitişi 9:00 + 120 dk = 11:00; A20 8:00 planlı: 180 dk etki. A20 de geç: tezgahtaki B (10:00) 11:00'i bekler.
    const e20 = await bul('ardil-etkisi', a20);
    assert.deepEqual([e20?.dakika, e20?.kok], [180, `gec-giris:${a10}`]);
    const eb = await bul('ardil-etkisi', b10);
    assert.deepEqual([eb?.dakika, eb?.kok], [60, `gec-giris:${a20}`]);
    // Son adım A20'nin bitişi (10:00) en büyük etki kadar kayar: 13:00; teslim dün, gün sonu bugün 00:00: 780 dk.
    const r = await bul('teslim-riski', a20);
    assert.deepEqual([r?.dakika, r?.kok], [780, `gec-giris:${a10}`]);
    assert.equal(await bul('teslim-riski', b10), undefined, 'teslimsiz emirde risk yok');

    const cevap = await istek<AnomaliOlaylariCevabi>(hazirlik, 'GET', '/arkon/anomali-olaylari');
    assert.equal(anomaliOlaylariCevabi.safeParse(cevap.govde).success, true, JSON.stringify(cevap.govde));
    assert.deepEqual(cevap.govde.ozet, { acik: 5, aksatilanIs: 2, toplamEtkiDk: 240, riskliEmir: 1 });
    const ilk = cevap.govde.olaylar.find((x: AnomaliOlayiSatiri) => x.tur === 'gec-giris' && x.isEmriId === a10)!;
    assert.deepEqual([ilk.istasyon?.id, ilk.kaynak, ilk.opNo, ilk.uretimEmriId], [istasyonId, { tur: 'makine', id: makineId, ad: 'Tezgah Z' }, 10, emirA]);
  });

  test('AR-AN-17: giriş gelince geç giriş kapanır; yeniden plan donmuş plan anını değiştirmez; etki yeni sıraya göre güncellenir', async () => {
    await ayar(emirA, a10, 9.5);
    // Plancı A20'yi 12-14'e taşır: tezgahta A10'dan sonra artık B gelir.
    await yerlestir(a20, 12, 14);
    await yenile(10);
    const gg10 = await bul('gec-giris', a10);
    assert.equal(gg10?.dakika, 210);
    assert.equal(gg10?.gercekAni, an(9.5));
    assert.notEqual(gg10?.kapanis, null);
    const gg20 = await bul('gec-giris', a20);
    assert.deepEqual([gg20?.dakika, gg20?.planAni, gg20?.kapanis], [120, an(8), null], 'plan anı 8:00 kalır; yeni plana göre gecikme yok olmazdı');
    // A10 tahmini bitişi 9:30 + 120 dk = 11:30. A20'nin donmuş planı 8:00: 210 dk. B (10:00) artık A10'un ardılı: 90 dk.
    assert.equal((await bul('ardil-etkisi', a20))?.dakika, 210);
    const eb = await bul('ardil-etkisi', b10);
    assert.deepEqual([eb?.dakika, eb?.kok], [90, `gec-giris:${a10}`]);

    await yenile(10.25);
    assert.equal((await bul('gec-giris', a10))?.dakika, 210, 'kapanan olay bir daha değişmez');
  });

  test('ardıl girince etkisi son dakikasıyla kapanır, giriş anı yazılır', async () => {
    await ayar(emirA, a20, 10.5);
    await yenile(10.75);
    const e20 = await bul('ardil-etkisi', a20);
    assert.equal(e20?.gercekAni, an(10.5));
    assert.notEqual(e20?.kapanis, null);
    const gg20 = await bul('gec-giris', a20);
    assert.deepEqual([gg20?.dakika, gg20?.gercekAni], [150, an(10.5)]);
  });

  test('AR-AN-14: işin istasyonuna açık malzeme isteği plan başlangıcında gelmediyse geç teslim; gelince geliş anıyla kapanır', async () => {
    assert.equal((await ayarYaz('arkon.anomali-gec-teslim-dk', 0)).durum, 200);
    const malzeme = (await o().sahip.tek<{ no: number }>('SELECT malzeme_no AS no FROM uretim_emri WHERE id = $1', [emirB]))!.no;
    const istek = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO stok_malzeme_istegi (no, kaynak_kimligi, malzeme_id, miktar, istasyon_id, uretim_emri_id, durum, kisi_id, acilis, guncelleme)
       VALUES ('MI-ANZ-1', 'anz-istek-1', $1, 1, $2, $3, 'acik', $4, $5::timestamptz, $5::timestamptz) RETURNING id`,
      [malzeme, istasyonId, emirB, yoneticiId, anMetni(9)]))!.id;
    await yenile(10.5);
    const gt = await bul('gec-teslim', b10);
    assert.deepEqual([gt?.dakika, gt?.planAni, gt?.kapanis], [30, an(10), null]);
    await o().sahip.sorgu(
      "UPDATE stok_malzeme_istegi SET durum = 'teslim', karsilanan = 1, kapatan_kisi_id = $2, guncelleme = $3::timestamptz WHERE id = $1", [istek, yoneticiId, anMetni(10.67)]);
    await yenile(11);
    const kapali = await bul('gec-teslim', b10);
    assert.equal(kapali?.gercekAni, an(10.67));
    assert.ok(Math.abs((kapali?.dakika ?? 0) - 40.2) < 0.01, String(kapali?.dakika));
    assert.notEqual(kapali?.kapanis, null);
  });

  test('AR-AN-18 (784 a): toplu sağlam girişi önceki girişten bu yana net süreye sığmıyorsa kapalı uyarı olayı; sığan giriş ve ikinci tur olay açmaz', async () => {
    const kayit = (tur: 'counts' | 'events', saat: number, govde: Record<string, unknown>) => o().sahip.sorgu(
      'INSERT INTO arkon_kayit (tur, cid, zaman, makine, paket_id, emir_no, govde, kisi_id) VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8)',
      [tur, `anz-${(sayac += 1)}`, anMetni(saat), 'ZK1', `tmi-ie-${b10}`, 'ANZ-B', JSON.stringify(govde), yoneticiId]);
    await kayit('counts', 11, { kind: 'good', delta: 1 });
    await kayit('events', 11.1, { state: 'stopped' });
    await kayit('events', 11.3, { state: 'running' });
    // 11:00-11:30 arası 30 dk, 12 dk duruş: 18 dk net; 50 adet x 1 dk = 50 dk: 32 dk aşım. Aynı anda gelen hurda satırı aynı giriştir.
    await kayit('counts', 11.5, { kind: 'good', delta: 45, toplu: true });
    await kayit('counts', 11.5, { kind: 'scrap', delta: 5, toplu: true });
    // 11:30-11:45: 15 dk; 5 adet sığar.
    await kayit('counts', 11.75, { kind: 'good', delta: 5, toplu: true });
    await yenile(12);
    await yenile(12.25);
    const toplu = await o().sahip.sorgu<{ dakika: number; plan: string; gercek: string; kapanis: string | null; emirNo: string }>(
      `SELECT dakika::float8 AS dakika, plan_ani::text AS plan, gercek_ani::text AS gercek, kapanis::text AS kapanis, emir_no AS "emirNo"
         FROM arkon_anomali_olayi WHERE tur = 'toplu-tutarsiz' AND is_emri_id = $1`, [b10]);
    assert.equal(toplu.length, 1, JSON.stringify(toplu));
    assert.ok(Math.abs(toplu[0]!.dakika - 32) < 0.01, String(toplu[0]!.dakika));
    assert.equal(Date.parse(toplu[0]!.plan), an(11));
    assert.equal(Date.parse(toplu[0]!.gercek), an(11.5));
    assert.notEqual(toplu[0]!.kapanis, null);
    assert.equal(toplu[0]!.emirNo, 'ANZ-B');
  });

  test('veri kapsamı: başka iş merkezine kısıtlı kişi olayları görmez; kısıtsız kişi görür', async () => {
    const baska = await istek<{ id: number }>(yonetici, 'POST', '/is-merkezleri', { kod: 'ZM2', ad: 'Başka merkez' });
    const kisitli = await kisiKur('kapsamli1', ['arkon.hazirlik', 'sayfa.arkon']);
    await o().sahip.sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kisitli.id, baska.govde.id]);
    const disarida = await istek<AnomaliOlaylariCevabi>(kisitli.cerez, 'GET', '/arkon/anomali-olaylari');
    assert.equal(disarida.durum, 200);
    assert.deepEqual([disarida.govde.olaylar, disarida.govde.ozet.acik], [[], 0]);
    assert.ok((await istek<AnomaliOlaylariCevabi>(hazirlik, 'GET', '/arkon/anomali-olaylari')).govde.olaylar.length > 0);
  });
});
