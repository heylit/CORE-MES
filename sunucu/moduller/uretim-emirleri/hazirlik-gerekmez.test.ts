import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirlerinAcikHazirlikSayisi, hazirlikGorevleri } from '../projeler/disari.ts';
import { uretimEmriAc } from './disari.ts';
import { hazirlikGerekmezIsaretle } from '../projeler/disari.ts';
import { hazirlik, hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import type { HazirlikCevabi, HazirlikMatrisiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 3642: emirde ya da matris hücresinde gerekçeli "Bu emirde gerekmez" işareti. Başlamamış görev iptal olur (silinmez), sürüyorsa gerekçeyle,
// kontrolde ya da bitmişse değişmez; durduran madde işaretlenmez; işaret varken dağıtım görevi yeniden açmaz; kaldırınca açar.
const eksikCozucu: HazirlikCozucusu = async (_db, idler) => new Map(idler.map((i) => [i, { durum: 'yok' as const, secildi: true }]));
describe('uretim-emirleri "bu emirde gerekmez" işareti (3642, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let sablonId = 0;
  let planlamaRolId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let makineId = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function istek<T = unknown>(ad: string, yol: string, govde: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: 'POST', url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object,
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(kullaniciAdi: string, rolKodu: string, ekIslem: string | null = null): Promise<number> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    if (ekIslem !== null) await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rol.id, ekIslem]);
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
    return k.id;
  }
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  // Emir projeye bağlı açılır: dağıtılmış şablonun görevleri emirle birlikte doğar.
  const emirAc = async () => (await o().vt.tx((db) => uretimEmriAc(db, kullanicilar.get('planlama_proje')!, {
    malzemeNo: urunNo, adet: 3, teslim: null, kaynakRotaRevizyonId: rev, projeId, isEmirleri: [adim(1), adim(2)],
  }))).uretimEmriId;
  const gorevler = (emirId: number) => o().vt.okumaTx((db) => hazirlikGorevleri(db, [emirId]));
  const ozet = async (emirId: number) => (await gorevler(emirId)).map((g) => g.madde).sort();
  const durumYaz = (emirId: number, madde: string, durum: string) =>
    o().sahip.sorgu("UPDATE projeler_gorev SET durum = $3, kontrol_kisi_id = $4, gercek_baslangic = CASE WHEN $3 = 'bitti' THEN current_date END, gercek_bitis = CASE WHEN $3 = 'bitti' THEN current_date END, ilerleme = CASE WHEN $3 = 'bitti' THEN 100 ELSE ilerleme END WHERE hazirlik_emri_id = $1 AND hazirlik_maddesi = $2 AND durum <> 'iptal'", [emirId, madde, durum, yoneticiId]);
  const gerekmez = (ad: string, emirId: number, madde: string, gerekce = 'Bu emirde aparat kullanılmaz') =>
    istek<{ iptalEdilen: number }>(ad, `/adimli-emirler/${String(emirId)}/hazirlik-gerekmez`, { madde, gerekce });
  const kaldir = (ad: string, emirId: number, madde: string) => istek<{ iptalEdilen: number }>(ad, `/adimli-emirler/${String(emirId)}/hazirlik-gerekmez-kaldir`, { madde });
  const matris = async (ad: string) => {
    const m = await app.inject({ method: 'GET', url: `/api/hazirlik-matrisi?projeId=${String(projeId)}`, headers: { cookie: cerezler.get(ad) ?? '' } });
    assert.equal(m.statusCode, 200, m.body);
    return m.json<HazirlikMatrisiCevabi>();
  };
  const sistemHali = async (emirId: number, madde: string) =>
    (await o().vt.okumaTx((db) => hazirlik(db, emirId)) as HazirlikCevabi).maddeler.find((x) => x.madde === madde)?.durum;
  const defter = (emirId: number) => o().sahip.sorgu<{ madde: string; olay: string; gerekce: string | null }>(
    'SELECT madde, olay, gerekce FROM projeler_hazirlik_gerekmez WHERE emri_id = $1 ORDER BY id', [emirId]);

  // Kablolama yüklüyse gerçek çözücüler kayıtlıdır; sonuç ortama bağlı olmasın diye üç madde sahte "eksik" çözücüyle koşar.
  const onceki: (readonly ['aparat' | 'cnc' | 'olcu-aleti', HazirlikCozucusu | null])[] = [];
  before(async () => {
    for (const m of ['aparat', 'cnc', 'olcu-aleti'] as const) onceki.push([m, hazirlikCozucusuKaydet(m, eksikCozucu)]);
    ortam = await testVeritabaniKur('uretim_hazirlik_gerekmez');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.GRK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama_proje', 'planlama_proje');
    await kisiEkle('yetkisiz', 'cam');
    await kisiEkle('okur', 'satis');
    await kisiEkle('dagitici', 'kalite', 'projeler.hazirlik-dagit');
    await kisiEkle('mudur', 'mudur');
    planlamaRolId = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'"))!.id;
    await ortam.sahip.sorgu("INSERT INTO uretim_emirleri_hazirlik_maddesi (kod, ad, kisa, sira, sistem) VALUES ('ozel-a', 'Boya onayı', 'Boya', 130, false)");
    sablonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_gorev_sablonu (ad, olusturan_id) VALUES ('Hazırlık', $1) RETURNING id", [yoneticiId]))!.id;
    const kalem = (sira: number, madde: string) => ortam!.sahip.sorgu(
      `INSERT INTO projeler_gorev_sablon_kalemi (sablon_id, sira, ad, dayanak, gun, sure_gun, yapan_rol_id, hazirlik_maddesi)
       VALUES ($1, $2, $3, 'baslangic', 0, 2, $4, $5)`, [sablonId, sira, `Kalem ${madde}`, planlamaRolId, madde]);
    await kalem(1, 'cnc');
    await kalem(2, 'cizim');
    await kalem(3, 'aparat');
    await kalem(4, 'olcu-aleti');
    await kalem(5, 'ozel-a');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('GRK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GRK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('grk-dnm-1', 'mamul', 'GRK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'grk-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('GRKM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('GRKI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('GRK1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
    const pd = await istek('mudur', `/projeler/${String(projeId)}/dagit`, { sablonId });
    assert.equal(pd.durum, 200, JSON.stringify(pd.govde));
  });
  after(async () => {
    for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
    await ortam?.kaldir();
  });

  test('yetkisiz kişi işaretleyemez (403); matris yazma yetkisini ayrı söyler', async () => {
    const emir = await emirAc();
    assert.equal((await gerekmez('yetkisiz', emir, 'aparat')).durum, 403);
    assert.equal((await kaldir('yetkisiz', emir, 'aparat')).durum, 403);
    assert.equal((await ozet(emir)).includes('aparat'), true, 'reddedilen işaret görevi değiştirmez');
    assert.equal((await defter(emir)).length, 0);
    assert.equal((await matris('dagitici')).gerekmezYazar, true);
    assert.equal((await matris('okur')).gerekmezYazar, false);
  });

  test('başlamamış görev: işaret görevi iptal eder (silmez), emrin sistem hâli "gerekmez" olur, geçmişe gerekçe ve kişi yazılır; kaldırınca eski hâle döner', async () => {
    const emir = await emirAc();
    assert.deepEqual(await ozet(emir), ['aparat', 'cizim', 'cnc', 'olcu-aleti', 'ozel-a']);
    const once = await sistemHali(emir, 'aparat');
    assert.notEqual(once, 'gerekmez');
    const sayiOnce = await o().vt.okumaTx((db) => emirlerinAcikHazirlikSayisi(db, [emir]));
    const c = await gerekmez('dagitici', emir, 'aparat', '  Parça aparatsız işlenir  ');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.iptalEdilen, 1);
    assert.deepEqual(await ozet(emir), ['cizim', 'cnc', 'olcu-aleti', 'ozel-a'], 'iptal görev listelerden çıkar (ilerleme ve gecikme sayımına girmez)');
    assert.equal(await o().vt.okumaTx((db) => emirlerinAcikHazirlikSayisi(db, [emir])), sayiOnce - 1);
    const satir = await o().sahip.tek<{ id: number; durum: string; guncelleyen_id: number }>(
      "SELECT id, durum, guncelleyen_id FROM projeler_gorev WHERE hazirlik_emri_id = $1 AND hazirlik_maddesi = 'aparat'", [emir]);
    assert.equal(satir?.durum, 'iptal', 'görev silinmedi, iptal oldu');
    assert.equal(satir?.guncelleyen_id, kullanicilar.get('dagitici')?.id);
    const olay = await o().sahip.tek<{ olay: string; kisi_id: number; gerekce: string }>('SELECT olay, kisi_id, gerekce FROM projeler_gorev_olayi WHERE gorev_id = $1', [satir?.id]);
    assert.deepEqual([olay?.olay, olay?.kisi_id, olay?.gerekce], ['iptal', kullanicilar.get('dagitici')?.id, 'Bu emirde gerekmez: Parça aparatsız işlenir']);
    assert.deepEqual(await defter(emir), [{ madde: 'aparat', olay: 'isaretle', gerekce: 'Parça aparatsız işlenir' }]);
    assert.equal(await sistemHali(emir, 'aparat'), 'gerekmez');
    const v = await o().vt.okumaTx((db) => hazirlik(db, emir));
    assert.equal(v.isEmirleri.every((i) => i.maddeler.find((x) => x.madde === 'aparat')?.durum === 'gerekmez'), true, 'iş emri satırları da gerekmez');
    assert.equal(v.maddeler.find((x) => x.madde === 'olcu-aleti')?.durum !== 'gerekmez', true, 'öteki madde etkilenmez');
    const m = await matris('okur');
    const kayit = m.gerekmezler.find((x) => x.emriId === emir);
    assert.deepEqual([kayit?.madde, kayit?.gerekce, kayit?.kisiAdi], ['aparat', 'Parça aparatsız işlenir', 'Deneme dagitici']);
    assert.equal(m.maddeler.some((x) => x.kod === 'aparat'), true, 'görevi kalmasa da işaretli madde sütunda görünür');
    assert.equal(m.gorevler.some((g) => g.emriId === emir && g.madde === 'aparat'), false);

    assert.equal((await gerekmez('dagitici', emir, 'aparat')).durum, 409, 'ikinci işaret çakışır');
    const k = await kaldir('dagitici', emir, 'aparat');
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(await sistemHali(emir, 'aparat'), once);
    assert.deepEqual((await defter(emir)).map((x) => x.olay), ['isaretle', 'kaldir']);
    assert.equal((await kaldir('dagitici', emir, 'aparat')).durum, 409, 'işaretsiz maddede kaldırma çakışır');
    assert.equal((await matris('okur')).gerekmezler.some((x) => x.emriId === emir), false);
  });

  test('işaret varken dağıtım görevi yeniden açmaz (deneme de saymaz); kaldırınca bir sonraki dağıtım açar', async () => {
    const emir = await emirAc();
    assert.equal((await gerekmez('dagitici', emir, 'olcu-aleti', 'Ölçü aleti gerekmez')).durum, 200);
    const yol = `/adimli-emirler/${String(emir)}/hazirlik-projesi`;
    const bos = await istek<{ eklenen: number }>('dagitici', yol, { projeId, sablonId: null });
    assert.equal(bos.govde.eklenen, 0);
    const deneme = await istek<{ gorevSayisi: number }>('dagitici', '/hazirlik-matrisi/dagit', { projeId, sablonId, deneme: true });
    assert.equal(deneme.durum, 200, JSON.stringify(deneme.govde));
    assert.equal((await ozet(emir)).includes('olcu-aleti'), false);
    assert.equal((await kaldir('dagitici', emir, 'olcu-aleti')).durum, 200);
    const yeni = await istek<{ eklenen: number }>('dagitici', yol, { projeId, sablonId: null });
    assert.equal(yeni.govde.eklenen, 1, 'iptal görevin yerine yenisi açılır');
    assert.equal((await ozet(emir)).includes('olcu-aleti'), true);
  });

  test('sürüyorsa aynı yetkiyle gerekçeyle iptal olur; gerekçesiz ya da boş gerekçe reddedilir', async () => {
    const emir = await emirAc();
    await durumYaz(emir, 'ozel-a', 'suruyor');
    for (const gerekce of ['', '   ']) assert.equal((await gerekmez('dagitici', emir, 'ozel-a', gerekce)).durum, 400);
    assert.equal((await istek('dagitici', `/adimli-emirler/${String(emir)}/hazirlik-gerekmez`, { madde: 'ozel-a' })).durum, 400);
    assert.equal((await ozet(emir)).includes('ozel-a'), true, 'gerekçesiz istek görevi değiştirmez');
    const c = await gerekmez('dagitici', emir, 'ozel-a', 'Boyasız teslim');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.iptalEdilen, 1);
    assert.equal((await ozet(emir)).includes('ozel-a'), false);
    assert.equal((await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM projeler_gorev WHERE hazirlik_emri_id = $1 AND hazirlik_maddesi = 'ozel-a' AND durum = 'iptal'", [emir]))?.n, 1);
  });

  test('kontrolde ya da bitmiş görev değişmez: işaret reddedilir, defter ve görev aynı kalır', async () => {
    const emir = await emirAc();
    for (const [madde, durum] of [['aparat', 'kontrolde'], ['olcu-aleti', 'bitti']] as const) {
      await durumYaz(emir, madde, durum);
      const c = await gerekmez('dagitici', emir, madde);
      assert.equal(c.durum, 400, `${durum}: ${JSON.stringify(c.govde)}`);
      assert.match(JSON.stringify(c.govde), /kontrolde ya da bitmiş/);
      assert.equal((await gerekmez('dagitici', emir, madde)).durum, 400);
      assert.equal((await gorevler(emir)).find((g) => g.madde === madde)?.durum, durum);
    }
    assert.equal((await defter(emir)).length, 0);
  });

  test('durduran madde (CNC, çizim) ve bilinmeyen madde işaretlenemez', async () => {
    const emir = await emirAc();
    for (const madde of ['cnc', 'cizim', 'yayin']) {
      const c = await gerekmez('dagitici', emir, madde);
      assert.equal(c.durum, 400, `${madde}: ${JSON.stringify(c.govde)}`);
    }
    assert.equal((await gerekmez('dagitici', emir, 'olmayan-madde')).durum, 400);
    assert.deepEqual(await ozet(emir), ['aparat', 'cizim', 'cnc', 'olcu-aleti', 'ozel-a']);
    assert.equal((await defter(emir)).length, 0);
    // Kayıt elle yazılsa bile durduran madde okunurken yok sayılır (fail-closed).
    await o().sahip.sorgu("INSERT INTO projeler_hazirlik_gerekmez (emri_id, madde, olay, kisi_id, gerekce) VALUES ($1, 'cnc', 'isaretle', $2, 'elle')", [emir, yoneticiId]);
    assert.notEqual(await sistemHali(emir, 'cnc'), 'gerekmez');
  });

  test('kapalı emirde işaret konmaz (409); emir yoksa 404; defter yalnız eklenir', async () => {
    const emir = await emirAc();
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [emir]);
    assert.equal((await gerekmez('dagitici', emir, 'aparat')).durum, 409);
    assert.equal((await gerekmez('dagitici', 2147000000, 'aparat')).durum, 404);
    const acik = await emirAc();
    assert.equal((await gerekmez('dagitici', acik, 'aparat')).durum, 200);
    await assert.rejects(o().sahip.sorgu("UPDATE projeler_hazirlik_gerekmez SET gerekce = 'x' WHERE emri_id = $1", [acik]));
    await assert.rejects(o().sahip.sorgu('DELETE FROM projeler_hazirlik_gerekmez WHERE emri_id = $1', [acik]));
    await assert.rejects(o().sahip.sorgu("INSERT INTO projeler_hazirlik_gerekmez (emri_id, madde, olay, kisi_id) VALUES ($1, 'aparat', 'isaretle', $2)", [acik, yoneticiId]), /gerekceli/);
  });

  test('işaretle eşzamanlı dağıtım: dağıtım işaret işleminin bitmesini bekler ve görevi açmaz (Risk N1)', async () => {
    const emir = await emirAc();
    await o().sahip.sorgu("UPDATE projeler_gorev SET durum = 'iptal' WHERE hazirlik_emri_id = $1 AND hazirlik_maddesi = 'olcu-aleti'", [emir]);
    let birak: () => void = () => undefined;
    const bekle = new Promise<void>((coz) => { birak = coz; });
    let isaretlendi: () => void = () => undefined;
    const hazir = new Promise<void>((coz) => { isaretlendi = coz; });
    const a = o().vt.tx(async (db) => {
      await hazirlikGerekmezIsaretle(db, kullanicilar.get('dagitici')!.id, { emriId: emir, madde: 'olcu-aleti', gerekce: 'Eşzamanlı deneme' });
      isaretlendi();
      await bekle;
    });
    await hazir;
    const b = istek<{ eklenen: number }>('dagitici', `/adimli-emirler/${String(emir)}/hazirlik-projesi`, { projeId, sablonId: null });
    await new Promise((r) => setTimeout(r, 400));
    birak();
    await a;
    const c = await b;
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.eklenen, 0, 'işaret işlemi bitince dağıtım işareti görür');
    assert.equal((await ozet(emir)).includes('olcu-aleti'), false);
  });
});
