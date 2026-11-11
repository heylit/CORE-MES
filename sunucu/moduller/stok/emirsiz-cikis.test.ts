import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { TESIS_SAAT_DILIMI } from '#paylasilan/zaman.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { emirlerinNetSarfi, emirSarfSonAlisTutarlari, emirsizCikisTutari } from './disari.ts';
import { emirsizCikisTutari as tutarKurali } from './kurallar.ts';

// 2623 a, 2594 b: finansın genel gider "diğer" bileşenine giden emirsiz stok çıkışı. Hareketler ve satın alma fiyatı tablo sahibiyle
// yazılır (defter eşitliği ve satın alma akışı kendi testlerinde); burada seçim, ay sınırı, geri alma ve çıkış anındaki son alış sınanır.
// Veriler uydurmadır.
describe('stok emirsiz çıkış tutarı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0, zemin = 0, emir = 0, ist = 0, talepSira = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kartlar: number[] = [];
  async function kart(): Promise<number> {
    const sira = kartlar.length + 1;
    const no = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'EC-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`ec-${sira}`, sira, JSON.stringify({ id: `ec-${sira}`, com: { ad: `Deneme ${sira}` } }), kisi]))!.no;
    kartlar.push(no);
    return no;
  }
  async function hareket(h: { tur: 'giris' | 'cikis' | 'geri_alma' | 'sayim_fazla' | 'sayim_eksik'; kart: number; zaman: string; miktar: number; neden?: string; emir?: number; geriAlinan?: number }): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      `WITH f AS (INSERT INTO stok_hareket_fisi (tur, islem_kimligi, kisi_id) VALUES (CASE WHEN $1 LIKE 'sayim%' THEN 'sayim' ELSE $1 END, pg_current_xact_id(), $7) RETURNING id),
         h AS (INSERT INTO stok_hareketi (zaman, tur, malzeme_id, kaynak_konum_id, hedef_konum_id, miktar, giris_kaynagi, cikis_nedeni, uretim_emri_id, geri_alinan_id, kisi_id, aciklama)
               VALUES ($2, $1, $3, CASE WHEN $1 NOT IN ('giris', 'sayim_fazla') THEN $4::int END, CASE WHEN $1 IN ('giris', 'sayim_fazla') THEN $4::int END, $5,
                       CASE WHEN $1 = 'giris' THEN 'mal_kabul' END, $6, $8, $9, $7, 'Deneme') RETURNING id),
         s AS (INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id) SELECT h.id, f.id FROM h, f)
       SELECT id::int FROM h`,
      [h.tur, h.zaman, h.kart, zemin, h.miktar, h.tur === 'cikis' ? h.neden ?? 'diger' : null, kisi, h.emir ?? null, h.geriAlinan ?? null]))!.id;
  }
  // Fiyatlı mal kabul: TRY teklifli sipariş satırı, stok mal kabul satırı ve satın almanın teslim kaydı.
  // Döviz: `kur` teklif günündeki kur, `sabit` siparişin sabit kuru (satın almanın TRY karşılığı önce sabit kuru, sonra teklif kurunu alır).
  async function alis(no: number, zaman: string, miktar: number, fiyat: number, doviz: { paraBirimi: 'USD'; kur: number | null; sabit?: number } | null = null): Promise<void> {
    talepSira += 1;
    const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu('INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, $3, $4, $4, \'siparis_verildi\')',
      [t, 91000 + talepSira, `Deneme talep ${talepSira}`, kisi]);
    await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, no]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
    await s.sorgu('INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, kur, teklif_tarihi) VALUES ($1, $2, $3, $4, current_date)',
      [t, tk, doviz?.paraBirimi ?? 'TRY', doviz === null ? null : doviz.kur]);
    await s.sorgu('INSERT INTO satin_alma_teklif_satiri (talep_id, teklif_id, kalem_id, birim_fiyat) VALUES ($1, $2, $3, $4)', [t, tk, kl, fiyat]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    if (doviz?.sabit !== undefined) await s.sorgu('INSERT INTO satin_alma_sabit_kur (talep_id, para_birimi, kur) VALUES ($1, $2, $3)', [t, doviz.paraBirimi, doviz.sabit]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    const ss = (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id", [t, tk, kl, miktar]))!.id;
    const h = await hareket({ tur: 'giris', kart: no, zaman, miktar });
    const mk = (await s.tek<{ id: number }>("INSERT INTO stok_mal_kabul (no, tur, zaman, kisi_id) VALUES ($1, 'satin_alma', $2, $3) RETURNING id", [`EC-MK-${talepSira}`, zaman, kisi]))!.id;
    const satir = (await s.tek<{ id: number }>(
      'INSERT INTO stok_mal_kabul_satiri (mal_kabul_id, sira, malzeme_id, sayilan_miktar, konum_id, hareket_id, siparis_satir_id) VALUES ($1, 1, $2, $3, $4, $5, $6) RETURNING id',
      [mk, no, miktar, zemin, h, ss]))!.id;
    await s.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, $2, $3, $4)', [ss, satir, miktar, kisi]);
  }
  // Tesis saatiyle bu ayın ya da önceki ayların bir anı.
  const an = async (ayGeri: number, gun: number, saat = 0): Promise<string> => (await o().vt.tek<{ z: string }>(
    `SELECT ((date_trunc('month', now() AT TIME ZONE '${TESIS_SAAT_DILIMI}') - make_interval(months => $1) + make_interval(days => $2, hours => $3))
       AT TIME ZONE '${TESIS_SAAT_DILIMI}')::text AS z`, [ayGeri, gun, saat]))!.z;
  const ayi = async (ayGeri: number): Promise<string> => (await o().vt.tek<{ a: string }>(
    `SELECT to_char(date_trunc('month', now() AT TIME ZONE '${TESIS_SAAT_DILIMI}') - make_interval(months => $1), 'YYYY-MM') AS a`, [ayGeri]))!.a;
  const sonuc = (ay: string) => o().vt.tx((db) => emirsizCikisTutari(db, ay));
  const tutar = async (ay: string): Promise<number> => { const r = await sonuc(ay); assert.deepEqual(r.eksik, [], ay); return r.tutar; };

  before(async () => {
    ortam = await testVeritabaniKur('stok_emirsiz_cikis');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Emirsiz Cikis', kullaniciAdi: 'emirsiz-cikis', parola: 'dogru-parola-1' }));
    const s = o().sahip;
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('EC-', 0)");
    await s.sorgu("INSERT INTO satin_alma_kur (para_birimi, sira) VALUES ('USD', 1) ON CONFLICT DO NOTHING");
    const depo = (await s.tek<{ id: number }>("INSERT INTO stok_depo (kod, ad) VALUES ('EC', 'Deneme') RETURNING id"))!.id;
    zemin = (await s.tek<{ id: number }>("INSERT INTO stok_konum (depo_id, kod, tur, ad) VALUES ($1, 'EC-01', 'depo_zemini', 'Zemin') RETURNING id", [depo]))!.id;
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('ECM', 'Deneme Merkezi') RETURNING id"))!.id;
    ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('ECI', 'Deneme', $1, true) RETURNING id", [im]))!.id;
    emir = (await s.tek<{ id: number }>("INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ('EC-P', 'Deneme', 10, $1, $2) RETURNING id", [ist, kisi]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('kural: miktar x fiyat kuruşa yarım yukarı; çıkış yoksa sıfır; fiyatı bilinmeyen çıkış toplama girmez, sayılır', () => {
    assert.deepEqual(tutarKurali([]), { tutar: '0.00', fiyatsizCikis: 0 });
    assert.deepEqual(tutarKurali([{ miktar: '2.5', fiyat: '10.0002' }, { miktar: '1', fiyat: '0.005' }]), { tutar: '25.01', fiyatsizCikis: 0 });
    assert.deepEqual(tutarKurali([{ miktar: '3', fiyat: '100' }, { miktar: '1', fiyat: null }, { miktar: '2', fiyat: null }]), { tutar: '300.00', fiyatsizCikis: 2 });
  });

  test('ayda çıkış yoksa 0; ay biçimi denetlenir', async () => {
    assert.equal(await tutar(await ayi(5)), 0);
    await assert.rejects(tutar('2026-13'), /Ay biçimi/);
  });

  test('yalnız emirsiz diğer, numune, fire ve sayım eksiği; fiyat çıkış anındaki son alış; geri alınan çıkış sayılmaz; ay sınırı tesis saatiyle', async () => {
    const [a, b] = [await kart(), await kart()];
    const ay = await ayi(2);
    await alis(a, await an(3, 10), 100, 50);
    await alis(a, await an(2, 10), 100, 80);
    await alis(b, await an(3, 12), 100, 20);
    // Sayılanlar: 2 x 50 (ikinci alıştan önce), 3 x 80 numune, 1 x 20 emirsiz fire.
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 0), miktar: 2, neden: 'diger' });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 20), miktar: 3, neden: 'numune' });
    await hareket({ tur: 'cikis', kart: b, zaman: await an(2, 15), miktar: 1, neden: 'fire' });
    // 2709 c: sayım eksiği de sayılır (4 x 20); aynı ayın sayım fazlası düşülmez.
    await hareket({ tur: 'sayim_eksik', kart: b, zaman: await an(2, 16), miktar: 4 });
    await hareket({ tur: 'sayim_fazla', kart: b, zaman: await an(2, 17), miktar: 4 });
    // Sayılmayanlar: emirli çıkış, sevk, tedarikçiye iade, üretime sarf, geri alınan çıkış, ay dışı (bir saat önce ve tam sonraki ay başı).
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 5), miktar: 7, neden: 'fire', emir });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 5), miktar: 7, neden: 'diger', emir });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 6), miktar: 5, neden: 'uretime_sarf', emir });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 6), miktar: 5, neden: 'sevk' });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 6), miktar: 5, neden: 'tedarikci_iade' });
    const geri = await hareket({ tur: 'cikis', kart: b, zaman: await an(2, 7), miktar: 9, neden: 'diger' });
    await hareket({ tur: 'geri_alma', kart: b, zaman: await an(1, 2), miktar: 9, geriAlinan: geri });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(2, 0, -1), miktar: 11, neden: 'diger' });
    await hareket({ tur: 'cikis', kart: a, zaman: await an(1, 0), miktar: 13, neden: 'diger' });
    assert.equal(await tutar(ay), 440);
    // Önceki ayın son saati ve sonraki ayın ilk anı kendi aylarında sayılır (fiyat: o anki son alış).
    assert.equal(await tutar(await ayi(3)), 11 * 50 + 0);
    assert.equal(await tutar(await ayi(1)), 13 * 80);
  });

  test('dövizli alış TL\'ye çevrilir: siparişin sabit kuru, yoksa teklif kuru (stok değeriyle aynı); dövizli teklif kursuz yazılamaz', async () => {
    const [e, f, g] = [await kart(), await kart(), await kart()];
    await alis(e, await an(6, 1), 10, 2.5, { paraBirimi: 'USD', kur: 32, sabit: 34 });
    await alis(f, await an(6, 1), 10, 3, { paraBirimi: 'USD', kur: 32 });
    await alis(g, await an(6, 1), 10, 70);
    await alis(g, await an(6, 2), 10, 2, { paraBirimi: 'USD', kur: 33 });
    for (const [k, miktar] of [[e, 2], [f, 1], [g, 1]] as const) await hareket({ tur: 'cikis', kart: k, zaman: await an(6, 3), miktar, neden: 'diger' });
    // e: 2 x 2.5 x 34 = 170; f: 3 x 32 = 96; g: son alış USD, 2 x 33 = 66.
    assert.equal(await tutar(await ayi(6)), 332);
    // Kuru bilinmeyen dövizli alış oluşamaz: çıkış bu yüzden fiyatsız kalmaz.
    await assert.rejects(alis(g, await an(6, 4), 1, 2, { paraBirimi: 'USD', kur: null }), /satin_alma_teklif_doviz_kuru/);
  });

  test('2710 b: son alışı bilinmeyen çıkış tutara girmez, eksik listesinde bildirilir (sıfır fiyat uydurulmaz)', async () => {
    const [c, d] = [await kart(), await kart()];
    await alis(c, await an(4, 1), 10, 5);
    await hareket({ tur: 'cikis', kart: c, zaman: await an(4, 3), miktar: 1, neden: 'diger' });
    assert.equal(await tutar(await ayi(4)), 5);
    // Fiyat çıkıştan sonra gelirse o çıkışın son alışı yoktur; hiç alışı olmayan kartın sayım eksiği de fiyatsızdır.
    await hareket({ tur: 'cikis', kart: d, zaman: await an(4, 4), miktar: 1, neden: 'numune' });
    await alis(d, await an(4, 6), 10, 7);
    await hareket({ tur: 'sayim_eksik', kart: await kart(), zaman: await an(4, 7), miktar: 2 });
    assert.deepEqual(await sonuc(await ayi(4)), { tutar: 5, eksik: ['2 stok çıkışının son alış fiyatı yok; tutara girmedi'] });
  });

  // 2727-1: proje maliyetinin siparişsiz sarfı aynı fiyat tanımıyla.
  test('2727-1 emir sarfı: emirlerinNetSarfi ile aynı çift ve miktar; tutar her çıkış x anındaki son alış; geri alınan çift dışarıda; fiyatsız çıkış tutarı null yapar', async () => {
    const yeniEmir = async (no: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, 'Deneme', 10, $2, $3) RETURNING id", [no, ist, kisi]))!.id;
    const [e1, e2] = [await yeniEmir('EC-P1'), await yeniEmir('EC-P2')];
    const [m, n, r] = [await kart(), await kart(), await kart()];
    await alis(m, await an(8, 1), 100, 10);
    await alis(m, await an(8, 5), 100, 12);
    await alis(r, await an(8, 1), 100, 3);
    // e1, m: 2 x 10 (ikinci alıştan önce) + 3 x 12 sarf + 1 x 12 fire = 68; 4'lük sarf geri alındı (fiyatsız olsa da sayılmaz).
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 2), miktar: 2, neden: 'uretime_sarf', emir: e1 });
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 6), miktar: 3, neden: 'uretime_sarf', emir: e1 });
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 7), miktar: 1, neden: 'fire', emir: e1 });
    const geri = await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 8), miktar: 4, neden: 'uretime_sarf', emir: e1 });
    await hareket({ tur: 'geri_alma', kart: m, zaman: await an(8, 9), miktar: 4, geriAlinan: geri, emir: e1 });
    // e1, n: alışı olmayan kartın sarfı -> null. e1, r: tamamı geri alınan çift -> net 0, tutar 0.00.
    await hareket({ tur: 'cikis', kart: n, zaman: await an(8, 3), miktar: 1, neden: 'uretime_sarf', emir: e1 });
    const rGeri = await hareket({ tur: 'cikis', kart: r, zaman: await an(8, 3), miktar: 5, neden: 'uretime_sarf', emir: e1 });
    await hareket({ tur: 'geri_alma', kart: r, zaman: await an(8, 4), miktar: 5, geriAlinan: rGeri, emir: e1 });
    // e2, m: 2.5 x 12 = 30; emirsiz çıkış ve "diğer" nedenli emirli çıkış kapsam dışı.
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 10), miktar: 2.5, neden: 'uretime_sarf', emir: e2 });
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 10), miktar: 9, neden: 'diger', emir: e2 });
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 10), miktar: 9, neden: 'diger' });
    const sonucu = await o().vt.tx((db) => emirSarfSonAlisTutarlari(db, [e1, e2, e1]));
    const net = await o().vt.tx((db) => emirlerinNetSarfi(db, [e1, e2]));
    const sirala = <T extends { emirId: number; malzemeId: number }>(l: T[]) => [...l].sort((a, b) => a.emirId - b.emirId || a.malzemeId - b.malzemeId);
    assert.deepEqual(sirala(sonucu).map((x) => [x.emirId, x.malzemeId, x.miktar]), sirala(net).map((x) => [x.emirId, x.malzemeId, x.miktar]));
    assert.deepEqual(sirala(sonucu).map((x) => [x.emirId, x.malzemeId, Number(x.miktar), x.tutar]),
      [[e1, m, 6, '68.00'], [e1, n, 1, null], [e1, r, 0, '0.00'], [e2, m, 2.5, '30.00']]);
    // 2739-2: ilk geri alınmamış sarf ya da fire anı; tamamı geri alınan çiftte null. Geri alınan erken çıkış ilk sayılmaz.
    const ilk = new Map(sonucu.map((x) => [`${x.emirId}|${x.malzemeId}`, x.ilkZaman === null ? null : Date.parse(x.ilkZaman)]));
    assert.equal(ilk.get(`${e1}|${m}`), Date.parse(await an(8, 2)));
    assert.equal(ilk.get(`${e1}|${n}`), Date.parse(await an(8, 3)));
    assert.equal(ilk.get(`${e1}|${r}`), null);
    assert.equal(ilk.get(`${e2}|${m}`), Date.parse(await an(8, 10)));
    // Geri alınan çıkış çiftin en erken çıkışıysa sonraki geri alınmamış çıkış ilk olur.
    const e3 = await yeniEmir('EC-P3');
    const erken = await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 11), miktar: 1, neden: 'uretime_sarf', emir: e3 });
    await hareket({ tur: 'geri_alma', kart: m, zaman: await an(8, 12), miktar: 1, geriAlinan: erken, emir: e3 });
    await hareket({ tur: 'cikis', kart: m, zaman: await an(8, 13), miktar: 1, neden: 'fire', emir: e3 });
    const [s3] = await o().vt.tx((db) => emirSarfSonAlisTutarlari(db, [e3]));
    assert.equal(Date.parse(s3!.ilkZaman!), Date.parse(await an(8, 13)));
    assert.deepEqual(await o().vt.tx((db) => emirSarfSonAlisTutarlari(db, [])), []);
  });
});
