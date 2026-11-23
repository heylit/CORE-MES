import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { GecikenlerimCevabi } from '#paylasilan/sozlesme/bildirim-kademe.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import type { GorevlerimCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { kademeleriIlerlet } from '../bildirim/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kapananEmirlerinGorevleri, kapaliEmirCozucusuKaydet, projeBitisKademeKayitlari } from './hazirlik-kademe.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';
// 3405 a: hazırlık görevi ortak kademeli uyarı motorunun kaynağıdır (bildirim). Kademe kuralının saf testleri bildirim modülündedir;
// burada kaynağın alıcıları, kapanışı ve 3396'nın korunan davranışı ölçülür. Emir kapanışı projelerin işidir, motordan önce koşar.
const ilerlet1 = async (db: Parameters<typeof kademeleriIlerlet>[0], simdi?: Date) => {
  const kapanan = await kapananEmirlerinGorevleri(db);
  const r = await kademeleriIlerlet(db, simdi);
  return { ...r, kapanan: r.kapanan + kapanan };
};

describe('projeler hazırlık kademesi (3396, 3405 ortak motor, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  const rol = new Map<string, number>();
  let sayac = 0;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  interface Kisi { cerez: string; id: number }
  async function kisi(rolKodu: string, ekIslem: string | null = null): Promise<Kisi> {
    const ad = `hk-${(sayac += 1)}`;
    const rolId = rol.get(rolKodu) ?? 0;
    if (ekIslem !== null) await ortam!.sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rolId, ekIslem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rolId);
      await rolAl(db, yoneticiId, yeni, rol.get('yonetici') ?? 0);
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (k: Kisi, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: k.cerez, 'istek-kimligi': randomUUID() } });
  const oku = (k: Kisi, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: k.cerez } });
  // Emir bağı yabancı anahtarsızdır (katman): testte uydurma emir kimliği yeter.
  const kapaliEmirler = new Set<number>();
  async function gorev(sonGunFarki: number, ek: { sorumlu?: number | null; kontrolRol?: number | null } = {}): Promise<number> {
    const s = await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, sorumlu_kisi_id, kontrol_rol_id, hazirlik_maddesi, hazirlik_emri_id)
       VALUES ($1, $2, current_date - 30, current_date + $3::int, $4, $5, $6, 'cnc', $7) RETURNING id`,
      [projeId, `CNC kurulumu · ORN-UE-${String(sayac += 1)}`, sonGunFarki, yoneticiId, ek.sorumlu ?? null, ek.kontrolRol ?? null, 900 + sayac],
    );
    return s?.id ?? 0;
  }
  const defter = async (gorevId: number) => (await vt().sorgu<{ kademe: number; bildirildi: boolean }>(
    "SELECT kademe, bildirildi FROM bildirim_kademe_defteri WHERE kaynak = 'projeler.hazirlik' AND kayit = $1 ORDER BY kademe", [String(gorevId)])).map((x) => `${String(x.kademe)}${x.bildirildi ? '!' : ''}`);
  const bildirimler = async (kisiId: number, tur: string, acik = true) => (await vt().tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = $2${acik ? ' AND okundu IS NULL' : ''}`, [kisiId, tur]))?.n ?? -1;

  before(async () => {
    ortam = await testVeritabaniKur('projeler_hazirlik_kademe');
    // 3478: olaylar varsayılan kapalıdır; bu dosya 3478'den önceki gibi açık olaylarla çalışır.
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    // Uydurma emir kimlikleri üretim emirlerinde yoktur; gerçek çözücü onları kapalı sayardı. Testte kapalı emirleri kendimiz veririz.
    kapaliEmirCozucusuKaydet(async (_db, idler) => new Set(idler.filter((i) => kapaliEmirler.has(i))));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const r of await ortam.vt.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')) rol.set(r.kod, r.id);
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('HK.1', 'Kademe', $1) RETURNING id", [yoneticiId]))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('uzun gecikmede bütün kademeler deftere girer, yalnız devret bildirilir; ikinci çalışma hiçbir şey yazmaz; bitince kapanır', async () => {
    const yapan = await kisi('kalite');
    const kontrol = await kisi('operator', 'projeler.gorev-kontrol');
    const g = await gorev(-10, { sorumlu: yapan.id, kontrolRol: rol.get('operator') ?? null });
    const ilk = await vt().tx((db) => ilerlet1(db));
    assert.ok(ilk.bildirilen >= 1);
    assert.deepEqual(await defter(g), ['1', '2', '3', '4', '5!']);
    assert.equal(await bildirimler(kontrol.id, 'projeler.hazirlik-devret'), 1, 'kontrol eden rolü devret önerisini alır');
    assert.equal(await bildirimler(yapan.id, 'projeler.hazirlik-gecikti'), 0, 'atlanan kademe gönderilmez');
    await vt().tx((db) => ilerlet1(db));
    assert.deepEqual(await defter(g), ['1', '2', '3', '4', '5!']);
    assert.equal(await bildirimler(kontrol.id, 'projeler.hazirlik-devret', false), 1, 'tekrar yok');
    await assert.rejects(ortam!.sahip.sorgu("DELETE FROM bildirim_kademe_defteri WHERE kaynak = 'projeler.hazirlik' AND kayit = $1", [String(g)]), /yalnız ekleme/);
    const yonetici = { cerez: String((await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } })).headers['set-cookie']).split(';')[0] ?? '', id: yoneticiId };
    const gecmis = (await oku(yonetici, `/projeler/gorevler/${String(g)}/kademeler`)).json<{ kademeler: { kademe: number; bildirildi: boolean; aliciSayisi: number }[] }>();
    assert.deepEqual(gecmis.kademeler.map((k) => [k.kademe, k.bildirildi]), [[1, false], [2, false], [3, false], [4, false], [5, true]]);
    assert.ok((gecmis.kademeler.at(-1)?.aliciSayisi ?? 0) >= 1);

    const s = (await vt().tek<{ surum: number }>('SELECT surum FROM projeler_gorev WHERE id = $1', [g]))?.surum;
    assert.equal((await gonder(yapan, `/projeler/gorevler/${String(g)}/bitir`, { surum: s })).statusCode, 200);
    assert.equal(await bildirimler(kontrol.id, 'projeler.hazirlik-devret'), 0, 'görev kontrole düşünce kademe bildirimi kapanır');
  });

  test('yarın biten görevde K2 yapana gider; şerit yalnız geciken görevi gösterir; Görevlerim kademeyi taşır', async () => {
    const yapan = await kisi('kalite');
    const yarin = await gorev(1, { sorumlu: yapan.id });
    const gecmis = await gorev(-1, { sorumlu: yapan.id });
    await vt().tx((db) => ilerlet1(db));
    assert.deepEqual(await defter(yarin), ['1', '2!']);
    assert.equal(await bildirimler(yapan.id, 'projeler.hazirlik-hatirlatma'), 1);
    const serit = (await oku(yapan, '/bildirim-kademe/seridim')).json<GecikenlerimCevabi>();
    assert.deepEqual(serit.kayitlar.filter((x) => x.kaynak === 'projeler.hazirlik').map((x) => x.kayit), [String(gecmis)]);
    assert.equal(serit.kayitlar[0]?.gecikmeGun !== null, true, 'gecikme iş günüdür (hafta sonu günü 0 olabilir)');
    const baska = await kisi('operator');
    assert.deepEqual((await oku(baska, '/bildirim-kademe/seridim')).json<GecikenlerimCevabi>().kayitlar, []);
    const liste = (await oku(yapan, '/projeler/gorevlerim/liste')).json<GorevlerimCevabi>().gorevler;
    assert.equal(liste.find((x) => x.id === yarin)?.kademe, 2);
  });

  test('emri kapanan görev iptal olur ve kademesi kapanır (Risk K-A); alıcısız gecikme yalnız dağıtanlara gider (Risk K-B)', async () => {
    const yapan = await kisi('kalite');
    const izleyen = await kisi('operator', 'projeler.gorev-kontrol');
    const g = await gorev(-3, { sorumlu: yapan.id, kontrolRol: rol.get('operator') ?? null });
    await vt().tx((db) => ilerlet1(db));
    const acikKademeZili = async () => (await vt().tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tekil_anahtar LIKE $2 AND okundu IS NULL', [izleyen.id, `%:${String(g)}:k%`]))?.n;
    assert.ok((await acikKademeZili() ?? 0) >= 1, 'üç takvim günü gecikme en az K4: kontrol eden alır');
    assert.equal(await bildirimler(yapan.id, 'projeler.hazirlik-gecikti') + await bildirimler(yapan.id, 'projeler.hazirlik-devret'), 0, 'yapan K5 almaz');
    const emir = (await vt().tek<{ e: number }>('SELECT hazirlik_emri_id AS e FROM projeler_gorev WHERE id = $1', [g]))!.e;
    kapaliEmirler.add(emir);
    const sonuc = await vt().tx((db) => ilerlet1(db));
    assert.ok(sonuc.kapanan >= 1);
    assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM projeler_gorev WHERE id = $1', [g]))?.durum, 'iptal');
    assert.equal(await acikKademeZili(), 0, 'emri kapanınca açık kademe zili kapanır');
    const once = await defter(g);
    await vt().tx((db) => ilerlet1(db));
    assert.deepEqual(await defter(g), once, 'kapanan göreve kademe yazılmaz');

    // Kontroldeki görev de iptal olur ve kontrol bekliyor bildirimi kapanır.
    const kontrolcu = await kisi('operator', 'projeler.gorev-kontrol');
    const kg = await gorev(2, { sorumlu: yapan.id, kontrolRol: rol.get('operator') ?? null });
    const ks = (await vt().tek<{ surum: number }>('SELECT surum FROM projeler_gorev WHERE id = $1', [kg]))?.surum;
    assert.equal((await gonder(yapan, `/projeler/gorevler/${String(kg)}/bitir`, { surum: ks })).statusCode, 200);
    const kontrolZili = async () => (await vt().tek<{ n: number }>(
      "SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'projeler.gorev-kontrol-bekliyor' AND okundu IS NULL", [kontrolcu.id]))?.n;
    assert.equal(await kontrolZili(), 1);
    // Çözücü bağlı değilken emir kapanışı hiçbir şeyi değiştirmez.
    const kEmir = (await vt().tek<{ e: number }>('SELECT hazirlik_emri_id AS e FROM projeler_gorev WHERE id = $1', [kg]))!.e;
    kapaliEmirler.add(kEmir);
    kapaliEmirCozucusuKaydet(null);
    try {
      assert.equal((await vt().tx((db) => ilerlet1(db))).kapanan, 0);
      assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM projeler_gorev WHERE id = $1', [kg]))?.durum, 'kontrolde');
    } finally {
      kapaliEmirCozucusuKaydet(async (_db, idler) => new Set(idler.filter((i) => kapaliEmirler.has(i))));
    }
    await vt().tx((db) => ilerlet1(db));
    assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM projeler_gorev WHERE id = $1', [kg]))?.durum, 'iptal');
    assert.equal(await kontrolZili(), 0, 'kontrol bekliyor bildirimi kapanır');

    // Kontrol edeni ve rolü olmayan görev: devret yalnız hazırlık dağıtanlara; projeyi yalnız okuyan almaz.
    const okuyan = await kisi('operator', 'projeler.oku');
    const dagitan = await kisi('cam', 'projeler.hazirlik-dagit');
    await gorev(-10, { sorumlu: yapan.id });
    await vt().tx((db) => ilerlet1(db));
    assert.equal(await bildirimler(okuyan.id, 'projeler.hazirlik-devret'), 0, 'yalnız okuyan almaz');
    assert.ok(await bildirimler(dagitan.id, 'projeler.hazirlik-devret') >= 1, 'dağıtan alır');
  });

  // --- Test incelemesi T1-T3, T5, T6 (3396) ---
  async function ayarla(hatirlat: number, yonetici: number, devret: number, rolId: number | null): Promise<void> {
    await ortam!.sahip.sorgu(
      `INSERT INTO bildirim_kademe_ayari (kaynak, acik, k2_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz, yonetici_rol_id)
       VALUES ('projeler.hazirlik', true, $1, $2, $3, 2, true, true, $4)
       ON CONFLICT (kaynak) DO UPDATE SET k2_gun = $1, k4_gun = $2, k5_gun = $3, yonetici_rol_id = $4, surum = bildirim_kademe_ayari.surum + 1`,
      [hatirlat, yonetici, devret, rolId]);
  }
  interface GorevEki { sorumlu?: number | null; yapanRol?: number | null; kontrolKisi?: number | null; kontrolRol?: number | null; yedekKisi?: number | null }
  async function gorevEk(sonGunFarki: number, e: GorevEki): Promise<number> {
    const s = await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, sorumlu_kisi_id, yapan_rol_id, kontrol_kisi_id, kontrol_rol_id,
                                   yedek_kontrol_kisi_id, hazirlik_maddesi, hazirlik_emri_id)
       VALUES ($1, $2, current_date - 30, current_date + $3::int, $4, $5, $6, $7, $8, $9, 'cnc', $10) RETURNING id`,
      [projeId, `CNC kurulumu · ORN-UE-${String(sayac += 1)}`, sonGunFarki, yoneticiId, e.sorumlu ?? null, e.yapanRol ?? null, e.kontrolKisi ?? null,
        e.kontrolRol ?? null, e.yedekKisi ?? null, 900 + sayac],
    );
    return s?.id ?? 0;
  }
  const ilerlet = () => vt().tx((db) => ilerlet1(db));
  const aldi = async (k: Kisi, tur: string, gorevId: number, kademe: number, acik = true) => (await vt().tek<{ n: number }>(
    `SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tekil_anahtar = $2${acik ? ' AND okundu IS NULL' : ''}`,
    [k.id, `${tur}:${String(gorevId)}:k${String(kademe)}`]))?.n ?? -1;
  const bitir = async (k: Kisi, gorevId: number) => {
    const s = (await vt().tek<{ surum: number }>('SELECT surum FROM projeler_gorev WHERE id = $1', [gorevId]))?.surum;
    const c = await gonder(k, `/projeler/gorevler/${String(gorevId)}/bitir`, { surum: s });
    assert.equal(c.statusCode, 200, c.body);
  };

  test('T1 alıcılar: K4 kontrol eden ve yönetici rolüne, K5 bunlara ek yedeğe; yapan ve dağıtan almaz; rolle atanmış görev K2 alır', async () => {
    const yonetimRolu = rol.get('bakim') ?? null;
    try {
      await ayarla(1, 1, 60, yonetimRolu);
      // Yapan da tür alanı işlemi taşır: kayda bağlı seçim olmasa alırdı.
      const yapan = await kisi('vardiya_sorumlusu', 'projeler.gorev-kontrol');
      const kontrol = await kisi('sevkiyat', 'projeler.gorev-kontrol');
      const yonetici = await kisi('bakim', 'projeler.gorev-kontrol');
      const yedek = await kisi('satis', 'projeler.gorev-kontrol');
      const dagitan = await kisi('cam', 'projeler.hazirlik-dagit');
      const g = await gorevEk(-10, { sorumlu: yapan.id, kontrolKisi: kontrol.id, yedekKisi: yedek.id });
      await ilerlet();
      assert.deepEqual(await defter(g), ['1', '2', '3', '4!']);
      const t4 = 'projeler.hazirlik-yoneticiye';
      assert.deepEqual([await aldi(kontrol, t4, g, 4), await aldi(yonetici, t4, g, 4), await aldi(yapan, t4, g, 4), await aldi(yedek, t4, g, 4), await aldi(dagitan, t4, g, 4)],
        [1, 1, 0, 0, 0], 'K4: kontrol eden, yönetici rolü; yapan, yedek ve dağıtan değil');
      await ayarla(1, 1, 2, yonetimRolu);
      await ilerlet();
      const t5 = 'projeler.hazirlik-devret';
      assert.deepEqual([await aldi(kontrol, t5, g, 5), await aldi(yonetici, t5, g, 5), await aldi(yedek, t5, g, 5), await aldi(yapan, t5, g, 5), await aldi(dagitan, t5, g, 5)],
        [1, 1, 1, 0, 0], 'K5: yedek kontrol de alır');

      const rolUyesi = await kisi('markalama_gorevlisi', 'projeler.gorev-isle');
      const r = await gorevEk(1, { yapanRol: rol.get('markalama_gorevlisi') ?? null });
      await ilerlet();
      assert.deepEqual(await defter(r), ['1', '2!'], 'rolle atanmış görev yapanı olan görevdir');
      assert.equal(await aldi(rolUyesi, 'projeler.hazirlik-hatirlatma', r, 2), 1);
    } finally {
      await ayarla(1, 1, 2, null);
    }
  });

  test('T3 görev kontrole düşünce K2 hatırlatma ve K3 gecikme bildirimi de kapanır', async () => {
    try {
      await ayarla(1, 30, 60, null);
      const yapan = await kisi('kalite');
      const k2 = await gorevEk(1, { sorumlu: yapan.id, kontrolRol: rol.get('operator') ?? null });
      const k3 = await gorevEk(-1, { sorumlu: yapan.id, kontrolRol: rol.get('operator') ?? null });
      await ilerlet();
      assert.equal(await aldi(yapan, 'projeler.hazirlik-hatirlatma', k2, 2), 1);
      assert.equal(await aldi(yapan, 'projeler.hazirlik-gecikti', k3, 3), 1);
      await bitir(yapan, k2);
      await bitir(yapan, k3);
      assert.equal(await aldi(yapan, 'projeler.hazirlik-hatirlatma', k2, 2), 0);
      assert.equal(await aldi(yapan, 'projeler.hazirlik-gecikti', k3, 3), 0);
    } finally {
      await ayarla(1, 1, 2, null);
    }
  });

  test('T2 günlük özet: 08:00 öncesi gitmez; günde bir kez; yalnız devret kademesindeki görevleri sayar', async () => {
    const dagitan = await kisi('cam', 'projeler.hazirlik-dagit');
    await gorevEk(1, { sorumlu: dagitan.id });
    await ilerlet();
    // İleri bir gün: bütün açık görevler gecikir; özet o günün satırına yazılır.
    const gun = '2030-01-07';
    const an = (saat: number) => new Date(tesisGunBasi(gun) + saat * 3_600_000);
    const satir = () => vt().tek<{ n: number }>("SELECT kayit_sayisi AS n FROM bildirim_kademe_ozet WHERE kaynak = 'projeler.hazirlik' AND gun = $1", [gun]);
    const zil = async () => (await vt().tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tekil_anahtar = $2', [dagitan.id, `projeler.hazirlik-ozet:ozet:${gun}`]))?.n;
    await vt().tx((db) => ilerlet1(db, an(7)));
    assert.equal(await satir(), null, '08:00 öncesi');
    await vt().tx((db) => ilerlet1(db, an(9)));
    const devret = (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kademe_takip WHERE kaynak = 'projeler.hazirlik' AND kademe = 5"))?.n ?? 0;
    assert.ok(devret >= 1);
    // Okunan özet tekil anahtarı serbest bırakır: ikinci gönderimi yalnız gün satırı durdurur.
    await ortam!.sahip.sorgu('UPDATE bildirim_kaydi SET okundu = now() WHERE kisi_id = $1 AND tekil_anahtar = $2', [dagitan.id, `projeler.hazirlik-ozet:ozet:${gun}`]);
    await vt().tx((db) => ilerlet1(db, an(10)));
    assert.equal((await satir())?.n, devret, 'yalnız devret kademesi');
    assert.equal(await zil(), 1, 'günde bir kez');
  });

  test('T5 yetki: dağıtan kişi ve rol seçicilerini açar; kademe ayarı yalnız kademe yöneticisinindir (3405-3 a)', async () => {
    const rolId = rol.get('guvenlik_gorevlisi') ?? 0;
    await ortam!.sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'projeler.oku') ON CONFLICT DO NOTHING", [rolId]);
    const k = await kisi('guvenlik_gorevlisi', 'projeler.hazirlik-dagit');
    assert.equal((await oku(k, '/bildirim-kademe/kaynaklar')).statusCode, 403);
    for (const yol of ['/projeler/sorumlu-secenekleri', '/projeler/rol-secenekleri', '/projeler/sablon-secenekleri']) {
      assert.equal((await oku(k, yol)).statusCode, 200, yol);
    }
  });

  test('T6 göç: hazırlık yetkileri rollerde (3396-2 a, 3396-4 a)', async () => {
    const satirlar = await ortam!.sahip.sorgu<{ s: string }>(
      "SELECT r.kod || ' ' || ri.islem AS s FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem IN ('projeler.hazirlik-dagit', 'uretim-emirleri.hazirlik-ayar', 'projeler.oku', 'sayfa.projeler') AND r.kod IN ('planlama_muduru', 'planlama_proje', 'uretim_muduru', 'proses_muhendisi')");
    const var_ = new Set(satirlar.map((x) => x.s));
    for (const s of ['planlama_muduru projeler.hazirlik-dagit', 'planlama_proje projeler.hazirlik-dagit', 'uretim_muduru projeler.hazirlik-dagit',
      'uretim_muduru uretim-emirleri.hazirlik-ayar', 'uretim_muduru projeler.oku', 'uretim_muduru sayfa.projeler', 'proses_muhendisi projeler.hazirlik-dagit',
      'proses_muhendisi projeler.oku', 'proses_muhendisi sayfa.projeler']) assert.ok(var_.has(s), s);
  });

  test('3588: proje bitişi kaynağı yalnız bitişi olan aktif projeyi verir; açan kişi sahiptir; gecikince takibe girer', async () => {
    const ac = async (kod: string, bitis: string | null, durum = 'aktif') => (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO projeler_proje (kod, ad, olusturan_id, bitis, durum) VALUES ($1, 'Bitiş deneme', $2, ${bitis === null ? 'NULL' : `current_date + ${bitis}`}, $3) RETURNING id`,
      [kod, yoneticiId, durum]))!.id;
    const gecmis = await ac('PB.GEC', '-10');
    await ac('PB.TARIHSIZ', null);
    await ac('PB.BITTI', '-10', 'tamamlandi');
    const kayitlar = (await vt().tx((db) => projeBitisKademeKayitlari(db))).filter((k) => k.no.startsWith('PB.'));
    assert.deepEqual(kayitlar.map((k) => [k.no, k.sahip, k.yol]), [['PB.GEC', yoneticiId, `/projeler/${String(gecmis)}`]], 'tarihsiz ve kapanmış proje takipte değil');
    await ortam!.sahip.sorgu(
      `INSERT INTO bildirim_kademe_ayari (kaynak, acik, k2_gun, k3_gun, k4_gun, k5_gun, eposta_kademe, serit, kapatilamaz, k3_birim, surum)
       VALUES ('projeler.proje-bitis', true, 1, NULL, 1, 3, 3, true, true, 'gun', 2) ON CONFLICT (kaynak) DO UPDATE SET acik = true`);
    await vt().tx((db) => kademeleriIlerlet(db));
    const takip = await vt().sorgu<{ kayit: string; kademe: number }>("SELECT kayit, kademe FROM bildirim_kademe_takip WHERE kaynak = 'projeler.proje-bitis' AND kayit LIKE $1", [`${String(gecmis)}:%`]);
    assert.equal(takip.length, 1);
    assert.ok((takip[0]?.kademe ?? 0) >= 3, 'bitişi geçmiş proje geciken kademededir');
  });
});
