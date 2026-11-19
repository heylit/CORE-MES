import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { SiparisAcilisiCevabi } from '#paylasilan/sozlesme/siparis-acilisi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  PROJE_KODU_KULLANILIYOR, ROTA_BEKLIYOR_PLANLANMAZ, acilacakPartiler, dokunulmamisMi, eksikAcmaIslemleri, projeKoduOnerisi,
  rotaBekliyorIhlali, yenidenEsle, yetkiEksikIletisi,
} from './siparis-acilisi-kurallar.ts';

// 3272: sipariş onayında proje ve emirler kendiliğinden açılır. Veriler uydurmadır (ORN- kodlu).
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('UE-SA kuralları (saf)', () => {
  test('UE-SA-01: proje no sipariş no; izinsiz karakter alt çizgi, Türkçe harf büyütülür; kullanılıyorsa _2, _3; uzunluk ekle korunur', () => {
    assert.equal(projeKoduOnerisi('orn-2026-001', () => false), 'ORN_2026_001');
    assert.equal(projeKoduOnerisi('sipariş.1', () => false), 'SIPARI_.1');
    const dolu = new Set(['ORN_1', 'ORN_1_2']);
    assert.equal(projeKoduOnerisi('ORN-1', (k) => dolu.has(k)), 'ORN_1_3');
    const uzun = 'A'.repeat(30);
    assert.equal(projeKoduOnerisi(uzun, () => false), 'A'.repeat(24));
    assert.equal(projeKoduOnerisi(uzun, (k) => k === 'A'.repeat(24)), `${'A'.repeat(22)}_2`);
    assert.equal(projeKoduOnerisi('', () => false), 'SIPARIS');
  });

  test('UE-SA-02: her parti bir emir; partisiz kalem tek seri parti; üretilmeyen ve tam sayı olmayan atlanır; teslim kalem termini yoksa sipariş termini', () => {
    const kalemler = [
      { id: 2, sira: 2, malzemeNo: 20, miktar: '5', termin: null, partiler: [] },
      { id: 1, sira: 1, malzemeNo: 10, miktar: '100', termin: '2026-12-01', partiler: [{ id: 7, emirTuru: 'fai' as const, adet: '10' }, { id: 8, emirTuru: 'seri' as const, adet: '90' }] },
      { id: 3, sira: 3, malzemeNo: 30, miktar: '2.5', termin: null, partiler: [] },
      { id: 4, sira: 4, malzemeNo: 40, miktar: '3', termin: null, partiler: [] },
    ];
    const p = acilacakPartiler(kalemler, '2026-12-20', (no) => no !== 40);
    assert.deepEqual(p.map((x) => [x.kalemId, x.partiId, x.emirTuru, x.adet, x.teslim, x.atlama]), [
      [1, 7, 'fai', 10, '2026-12-01', null],
      [1, 8, 'seri', 90, '2026-12-01', null],
      [2, null, 'seri', 5, '2026-12-20', null],
      [3, null, 'seri', null, '2026-12-20', 'tam-sayi-degil'],
      [4, null, 'seri', 3, '2026-12-20', 'uretilmez'],
    ]);
  });

  test('UE-SA-02 (3429-3 F): stoktan ya da satın alınarak karşılanan kalem emir açmaz; üretilmeyen malzemede de yol nedeni söylenir', () => {
    const kalemler = [
      { id: 1, sira: 1, malzemeNo: 10, miktar: '5', termin: null, partiler: [], karsilama: 'stok' as const },
      { id: 2, sira: 2, malzemeNo: 40, miktar: '3', termin: null, partiler: [], karsilama: 'satin-al' as const },
      { id: 3, sira: 3, malzemeNo: 10, miktar: '2', termin: null, partiler: [], karsilama: 'uret' as const },
    ];
    assert.deepEqual(acilacakPartiler(kalemler, '2026-12-20', (no) => no !== 40).map((x) => [x.kalemId, x.atlama]), [[1, 'stoktan'], [2, 'satin-alinir'], [3, null]]);
  });

  test('UE-SA-03: yalnız siparişten açılmış, taslak, arşivsiz ve satın alma siparişi ya da stok bağı olmayan emir dokunulmamıştır', () => {
    const e = { acilisKaynagi: 'siparis_onayi' as const, durum: 'taslak', arsiv: false, tedarikVar: false, stokVar: false };
    assert.equal(dokunulmamisMi(e), true);
    for (const d of [{ acilisKaynagi: null }, { durum: 'planli' }, { arsiv: true }, { tedarikVar: true }, { stokVar: true }]) {
      assert.equal(dokunulmamisMi({ ...e, ...d }), false, JSON.stringify(d));
    }
  });

  test('UE-SA-04: rota bekleyen emir planlanmaz', () => {
    assert.equal(rotaBekliyorIhlali(true), ROTA_BEKLIYOR_PLANLANMAZ);
    assert.equal(rotaBekliyorIhlali(false), null);
  });

  test('UE-SA-05: çözülmüş emir aynı malzeme ve türdeki eksik partiye açılış sırasıyla bağlanır; eşsiz emir iptal, eşsiz parti yeni emir', () => {
    const eksik = [{ malzemeNo: 1, emirTuru: 'seri' as const, k: 'a' }, { malzemeNo: 1, emirTuru: 'fai' as const, k: 'b' }, { malzemeNo: 2, emirTuru: 'seri' as const, k: 'c' }];
    const r = yenidenEsle(eksik, [{ id: 9, malzemeNo: 1, emirTuru: 'seri' }, { id: 5, malzemeNo: 1, emirTuru: 'seri' }, { id: 6, malzemeNo: 3, emirTuru: 'seri' }]);
    assert.deepEqual(r.bagla.map((x) => [x.parti.k, x.emirId]), [['a', 5]]);
    assert.deepEqual(r.ac.map((x) => x.k), ['b', 'c']);
    assert.deepEqual(r.iptal, [6, 9]);
  });

  test('UE-SA-06: proje yazma ve emir açma (ya da rotadan emir) yoksa eksik işlem adıyla söylenir', () => {
    assert.deepEqual(eksikAcmaIslemleri(() => true), []);
    assert.deepEqual(eksikAcmaIslemleri(() => false), ['projeler.yaz', 'uretim-emirleri.emir-ac']);
    assert.deepEqual(eksikAcmaIslemleri((i) => i === 'projeler.yaz' || i === 'rota.emre-kopyala'), []);
    assert.match(yetkiEksikIletisi(['projeler.yaz']), /projeler\.yaz/);
  });
});

describe('UE-SA sipariş onayında proje ve emir (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let firmaId = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;

  async function istek<T = unknown>(kisi: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(kisi) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerezler.set(kullaniciAdi, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }

  const malzeme = async (tur: 'mamul' | 'ticari_mal' = 'mamul'): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'ORN-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`ornsa-${sayac}`, tur, sayac, JSON.stringify({ id: `ornsa-${sayac}`, com: { ad: 'Deneme malzeme' } }), yoneticiId]))!.no;
  };
  interface Kalem { malzemeNo: number; miktar: number; partiler?: { tur: string; adet: number }[]; karsilama?: string }
  const siparis = async (kalemler: Kalem[]): Promise<{ id: number; no: string; satirlar: number[] }> => {
    sayac += 1;
    const no = `ORN-${String(sayac).padStart(4, '0')}`;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 30, 20, $3) RETURNING id`, [no, firmaId, yoneticiId]);
    const satirlar: number[] = [];
    for (const [i, k] of kalemler.entries()) {
      const satir = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, karsilama) VALUES ($1, $2, $3, $4, 5, $5) RETURNING id',
        [id, i + 1, k.malzemeNo, k.miktar, k.karsilama ?? 'uret']);
      for (const [j, p] of (k.partiler ?? []).entries()) {
        await o().sahip.sorgu('INSERT INTO siparisler_siparis_satiri_parti (satir_id, sira, emir_turu, adet) VALUES ($1, $2, $3, $4)', [satir, j + 1, p.tur, p.adet]);
      }
      satirlar.push(satir);
    }
    return { id, no, satirlar };
  };
  const surum = async (id: number): Promise<number> => (await o().sahip.tek<{ surum: number }>('SELECT surum FROM siparisler_siparis WHERE id = $1', [id]))!.surum;
  const onayla = async (kisi: string, id: number, ek: Record<string, unknown> = {}) =>
    istek<Hata>(kisi, 'POST', `/siparisler/${id}/onayla`, { surum: await surum(id), ...ek });
  const geriAl = async (id: number) => istek<Hata>('yonetici', 'POST', `/siparisler/${id}/onay-geri-al`, { surum: await surum(id), neden: 'Deneme geri alma' });
  const iptal = async (id: number) => istek<Hata>('yonetici', 'POST', `/siparisler/${id}/iptal`, { surum: await surum(id), neden: 'Deneme iptal' });
  const acilis = (id: number, kisi = 'yonetici') => istek<SiparisAcilisiCevabi>(kisi, 'GET', `/uretim-emirleri/siparis-acilisi/${id}`);
  interface EmirSatiri { id: number; durum: string; satir: number | null; parti: number | null; bekliyor: boolean; kaynak: string | null; proje: number | null; tur: string; adet: number }
  const emirler = (satirlar: readonly number[], projeId: number | null = null) => o().sahip.sorgu<EmirSatiri>(
    `SELECT id, durum, siparis_satiri_id AS satir, siparis_parti_id AS parti, rota_bekliyor AS bekliyor, acilis_kaynagi AS kaynak, proje_id AS proje,
            emir_turu AS tur, adet FROM uretim_emri WHERE siparis_satiri_id = ANY($1::int[]) OR proje_id = $2 ORDER BY id`, [[...satirlar], projeId]);
  const projesi = async (siparisId: number) => o().sahip.tek<{ id: number; kod: string; ad: string }>('SELECT id, kod, ad FROM projeler_proje WHERE siparis_id = $1', [siparisId]);
  const siparisDurumu = async (id: number) => (await o().sahip.tek<{ durum: string }>('SELECT durum FROM siparisler_siparis WHERE id = $1', [id]))!.durum;

  before(async () => {
    ortam = await testVeritabaniKur('uretim_siparis_acilisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    // Yalnız siparişi onaylayabilen kişi: proje ve emir açamaz (3272-1 b).
    const rol = await tek("INSERT INTO rol (kod, ad) VALUES ('gecici_onayci', 'Deneme onaycı') RETURNING id");
    await ortam.sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'siparisler.oku'), ($1, 'siparisler.onayla')", [rol]);
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme onaycı', kullaniciAdi: 'onayci', parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol);
      await rolAl(db, yoneticiId, k, yoneticiRolu!.id);
    });
    await giris('onayci');
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await ortam?.kaldir(); });

  test('3272: onayda proje (sipariş no) ve her parti için taslak emir açılır; rotası olmayan "rota bekliyor"; ticari mal ve kesirli adet atlanır', async () => {
    const m = await malzeme();
    const m2 = await malzeme();
    const tic = await malzeme('ticari_mal');
    const s = await siparis([{ malzemeNo: m, miktar: 100, partiler: [{ tur: 'fai', adet: 10 }, { tur: 'seri', adet: 90 }] }, { malzemeNo: m2, miktar: 2.5 }, { malzemeNo: tic, miktar: 4 }]);
    const once = await acilis(s.id);
    assert.equal(once.durum, 200, JSON.stringify(once.govde));
    assert.deepEqual([once.govde.acik, once.govde.proje.id, once.govde.proje.kod, once.govde.eksikIslemler], [true, null, s.no.replaceAll('-', '_'), []]);
    assert.deepEqual(once.govde.satirlar.map((x) => [x.emirTuru, x.adet, x.rota, x.emir, x.atlama]), [
      ['fai', 10, null, null, null], ['seri', 90, null, null, null], ['seri', null, null, null, 'tam-sayi-degil'], ['seri', 4, null, null, 'uretilmez'],
    ]);
    const c = await onayla('yonetici', s.id);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const p = await projesi(s.id);
    assert.equal(p?.kod, s.no.replaceAll('-', '_'));
    assert.match(p?.ad ?? '', /Deneme Müşteri/);
    const e = await emirler(s.satirlar);
    assert.deepEqual(e.map((x) => [x.durum, x.satir, x.tur, Number(x.adet), x.bekliyor, x.kaynak, x.proje]), [
      ['taslak', s.satirlar[0], 'fai', 10, true, 'siparis_onayi', p?.id], ['taslak', s.satirlar[0], 'seri', 90, true, 'siparis_onayi', p?.id],
    ]);
    const sonra = await acilis(s.id);
    assert.deepEqual(sonra.govde.satirlar.slice(0, 2).map((x) => x.emir?.rotaBekliyor), [true, true]);
    assert.equal(sonra.govde.proje.id, p?.id);
    // Elle açılış ikinci kez açmaz.
    const tekrar = await istek<{ acilan: number; baglanan: number }>('yonetici', 'POST', `/uretim-emirleri/siparis-acilisi/${s.id}/ac`, {});
    assert.deepEqual([tekrar.durum, tekrar.govde.acilan, tekrar.govde.baglanan], [200, 0, 0]);
    assert.equal((await emirler(s.satirlar)).length, 2);
  });

  test('3429-3 F: onayda yalnız "uret" kalemi emir açar; stoktan ve satın alınan kalem atlanır ve nedeni açılışta görünür', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 5 }, { malzemeNo: m, miktar: 3, karsilama: 'stok' }, { malzemeNo: m, miktar: 2, karsilama: 'satin-al' }]);
    const once = await acilis(s.id);
    assert.deepEqual(once.govde.satirlar.map((x) => [x.adet, x.atlama]), [[5, null], [3, 'stoktan'], [2, 'satin-alinir']]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    assert.deepEqual((await emirler(s.satirlar)).map((x) => [x.satir, Number(x.adet)]), [[s.satirlar[0], 5]]);
  });

  test('3272-2 a, Risk K3: rota bekleyen emir plana alınmaz (409, emir taslak kalır)', async () => {
    const s = await siparis([{ malzemeNo: await malzeme(), miktar: 3 }]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const [e] = await emirler(s.satirlar);
    const sur = (await o().sahip.tek<{ surum: number }>('SELECT surum FROM uretim_emri WHERE id = $1', [e!.id]))!.surum;
    const c = await istek<Hata>('yonetici', 'POST', `/adimli-emirler/${e!.id}/plana-al`, { surum: sur });
    assert.deepEqual([c.durum, c.govde.mesaj], [409, ROTA_BEKLIYOR_PLANLANMAZ]);
    assert.equal((await emirler(s.satirlar))[0]?.durum, 'taslak');
  });

  test('3272-1 b: onaylayanda proje ve emir açma yetkisi yoksa onay reddedilir (403, ileti eksik işlemi söyler); sipariş taslak kalır, proje ve emir açılmaz', async () => {
    const s = await siparis([{ malzemeNo: await malzeme(), miktar: 3 }]);
    const pencere = await acilis(s.id, 'onayci');
    assert.deepEqual([pencere.durum, pencere.govde.eksikIslemler], [200, ['projeler.yaz', 'uretim-emirleri.emir-ac']]);
    const c = await onayla('onayci', s.id);
    assert.equal(c.durum, 403);
    assert.equal(c.govde.mesaj, yetkiEksikIletisi(['projeler.yaz', 'uretim-emirleri.emir-ac']));
    assert.equal(await siparisDurumu(s.id), 'taslak');
    assert.equal(await projesi(s.id), null);
    assert.deepEqual(await emirler(s.satirlar), []);
  });

  test('ayar kapalıyken onay açmaz (yetkisiz onay geçer); elle "Proje ve emirleri aç" onaylı siparişte açar, taslakta 409', async () => {
    await o().sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.siparis-onayinda-ac', 'false', $1)", [yoneticiId]);
    try {
      const s = await siparis([{ malzemeNo: await malzeme(), miktar: 3 }]);
      assert.equal((await istek<Hata>('yonetici', 'POST', `/uretim-emirleri/siparis-acilisi/${s.id}/ac`, {})).durum, 409);
      assert.equal((await onayla('onayci', s.id)).durum, 200);
      assert.equal(await projesi(s.id), null);
      assert.equal((await acilis(s.id)).govde.acik, false);
      const c = await istek<{ projeId: number; acilan: number }>('yonetici', 'POST', `/uretim-emirleri/siparis-acilisi/${s.id}/ac`, { projeKodu: 'orn.elle_1' });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      assert.equal((await projesi(s.id))?.kod, 'ORN.ELLE_1');
      assert.equal(c.govde.acilan, 1);
    } finally {
      await o().sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'uretim-emirleri.siparis-onayinda-ac'");
    }
  });

  test('UE-SA-02 eşzamanlı: iki "Proje ve emirleri aç" aynı anda gelir; sipariş kilidiyle biri açar, öteki 0 açar, emir çiftlenmez', async () => {
    await o().sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.siparis-onayinda-ac', 'false', $1)", [yoneticiId]);
    try {
      const s = await siparis([{ malzemeNo: await malzeme(), miktar: 2 }, { malzemeNo: await malzeme(), miktar: 4 }]);
      assert.equal((await onayla('onayci', s.id)).durum, 200);
      const yol = `/uretim-emirleri/siparis-acilisi/${s.id}/ac`;
      const [a, b] = await Promise.all([
        istek<{ acilan: number; baglanan: number }>('yonetici', 'POST', yol, {}),
        istek<{ acilan: number; baglanan: number }>('yonetici', 'POST', yol, {}),
      ]);
      assert.deepEqual([a.durum, b.durum], [200, 200], JSON.stringify([a.govde, b.govde]));
      assert.deepEqual([a.govde.acilan + a.govde.baglanan, b.govde.acilan + b.govde.baglanan].sort(), [0, 2]);
      assert.equal((await emirler(s.satirlar)).length, 2);
    } finally {
      await o().sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'uretim-emirleri.siparis-onayinda-ac'");
    }
  });

  test('UE-SA-01: onayda verilen proje no kullanılır; kullanılan ya da geçersiz numarada onay reddedilir ve sipariş taslak kalır', async () => {
    const a = await siparis([{ malzemeNo: await malzeme(), miktar: 1 }]);
    assert.equal((await onayla('yonetici', a.id, { projeKodu: 'ORN_OZEL' })).durum, 200);
    assert.equal((await projesi(a.id))?.kod, 'ORN_OZEL');
    const b = await siparis([{ malzemeNo: await malzeme(), miktar: 1 }]);
    const kullanilan = await onayla('yonetici', b.id, { projeKodu: 'ORN_OZEL' });
    assert.deepEqual([kullanilan.durum, kullanilan.govde.mesaj], [409, PROJE_KODU_KULLANILIYOR]);
    assert.equal((await onayla('yonetici', b.id, { projeKodu: 'ORN OZEL' })).durum, 400);
    assert.equal(await siparisDurumu(b.id), 'taslak');
  });

  test('3272-3 a: onay geri alınınca dokunulmamış emir kalemden çözülür, kalem değişebilir; yeniden onayda eşine bağlanır, yeni emir açılmaz, adet kaleme uyar', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 5 }]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const p = (await projesi(s.id))!;
    const [ilk] = await emirler(s.satirlar);
    assert.equal((await geriAl(s.id)).durum, 200);
    const cozuk = await emirler([], p.id);
    assert.deepEqual(cozuk.map((x) => [x.id, x.satir, x.durum]), [[ilk!.id, null, 'taslak']]);
    // Kalem düzenlemesi kalemleri yeniden yazar; emir artık kaleme bağlı değildir.
    await o().sahip.sorgu('DELETE FROM siparisler_siparis_satiri WHERE siparis_id = $1', [s.id]);
    const yeniSatir = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 7, 5) RETURNING id', [s.id, m]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const sonra = await emirler([yeniSatir], p.id);
    assert.deepEqual(sonra.map((x) => [x.id, x.satir, Number(x.adet), x.durum]), [[ilk!.id, yeniSatir, 7, 'taslak']]);
  });

  test('3272-3 a: yeniden onayda eşi kalmayan çözülmüş emir iptal olur (silinmez); sipariş iptalinde dokunulmamış emir iptal olur ve iptali kilitlemez', async () => {
    const m = await malzeme();
    const s = await siparis([{ malzemeNo: m, miktar: 5 }]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const p = (await projesi(s.id))!;
    const [ilk] = await emirler(s.satirlar);
    assert.equal((await geriAl(s.id)).durum, 200);
    await o().sahip.sorgu('DELETE FROM siparisler_siparis_satiri WHERE siparis_id = $1', [s.id]);
    const baska = await malzeme();
    const yeni = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 2, 5) RETURNING id', [s.id, baska]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const hepsi = await emirler([yeni], p.id);
    assert.deepEqual(hepsi.map((x) => [x.id === ilk!.id, x.durum]), [[true, 'iptal'], [false, 'taslak']]);
    const ip = await iptal(s.id);
    assert.equal(ip.durum, 200, JSON.stringify(ip.govde));
    assert.deepEqual((await emirler([yeni], p.id)).map((x) => x.durum), ['iptal', 'iptal']);
    assert.ok(await projesi(s.id), 'proje kalır');
  });

  test('3272-2: dokunulmamış emirde malzeme talebi ya da tamamlanmış hazırlık uyarı olarak döner; geri alma ve iptal kilitlenmez', async () => {
    const s = await siparis([{ malzemeNo: await malzeme(), miktar: 3 }]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const [e] = await emirler(s.satirlar);
    assert.deepEqual((await acilis(s.id)).govde.geriAlmaUyarilari, []);
    const t = randomUUID();
    await o().sahip.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, iptal_nedeni, uretim_emri_id)
                           VALUES ($1, 2099, 93272, 'Deneme talep', $2, $2, 'onayda', '', $3)`, [t, yoneticiId, e!.id]);
    await o().sahip.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar, birim) VALUES ($1, $2, 1, 'Deneme kalem', 10, 'adet')", [t, randomUUID()]);
    const yalnizTalep = (await acilis(s.id)).govde.geriAlmaUyarilari;
    assert.deepEqual(yalnizTalep.map((u) => [u.emirId, u.nedenler]), [[e!.id, ['talep']]]);
    const adim = async (sira: number, asama: string) => tek('INSERT INTO emir_adimi (emir_id, sira, ad, asama) VALUES ($1, $2, $3, $4) RETURNING id', [e!.id, sira, `Deneme ${asama}`, asama]);
    const olay = (id: number, o2: 'tamamla' | 'geri-al') => o().sahip.sorgu('INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay) VALUES ($1, $2, $3)', [id, yoneticiId, o2]);
    const nedenler = async () => (await acilis(s.id)).govde.geriAlmaUyarilari.map((u) => u.nedenler);
    const uretim = await adim(89, 'uretim');
    await olay(uretim, 'tamamla');
    assert.deepEqual(await nedenler(), [['talep']], 'tamamlanmış üretim adımı hazırlık sayılmaz');
    const hazirlik = await adim(90, 'hazirlik');
    await olay(hazirlik, 'tamamla');
    assert.deepEqual(await nedenler(), [['talep', 'hazirlik']]);
    await olay(hazirlik, 'geri-al');
    assert.deepEqual(await nedenler(), [['talep']], 'geri alınmış madde tamamlanmış sayılmaz');
    const onHazirlik = await adim(91, 'on_hazirlik');
    await olay(onHazirlik, 'tamamla');
    assert.deepEqual(await nedenler(), [['talep', 'hazirlik']], 'ön hazırlık maddesi de hazırlıktır');
    const ip = await iptal(s.id);
    assert.equal(ip.durum, 200, JSON.stringify(ip.govde));
    assert.deepEqual((await emirler(s.satirlar)).map((x) => x.durum), ['iptal']);
  });

  test('3272-3 a, Risk K4: plana alınmış (dokunulmuş) emir sipariş iptalini kilitler', async () => {
    const s = await siparis([{ malzemeNo: await malzeme(), miktar: 2 }]);
    assert.equal((await onayla('yonetici', s.id)).durum, 200);
    const [e] = await emirler(s.satirlar);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'planli', rota_bekliyor = false WHERE id = $1", [e!.id]);
    const ip = await iptal(s.id);
    assert.equal(ip.durum, 409, JSON.stringify(ip.govde));
    assert.equal(await siparisDurumu(s.id), 'onayli');
  });
});
