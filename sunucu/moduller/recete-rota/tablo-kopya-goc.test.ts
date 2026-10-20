import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import type { Db } from '#cekirdek/db.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';

// Kopyalama göçü (kullanıcı onayı 15.10.2026) dolu kayıtta: JSON'daki statü tanımı, adım bağı, giren statüsü ve statülü kart taşıma
// tablolarına, sunucunun yazımda yaptığı eşitlemeyle aynı satırlarla geçer; JSON kaydı değişmez. Veriler uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const KOPYA_GOCU = '_recete_rota_tablo_kopya.sql';

const tablolar = async (db: Db) => ({
  tanim: await db.sorgu('SELECT kimlik, kod, ad, tur, renk, sira FROM recete_rota_statu_tanimi ORDER BY kimlik'),
  bag: await db.sorgu('SELECT malzeme_id, op_no, cikti_malzeme_id, cikti_statu FROM recete_rota_adim_bagi ORDER BY 1, 2'),
  giren: await db.sorgu('SELECT malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no FROM recete_rota_giren_statusu ORDER BY 1, 2, 3'),
  kart: await db.sorgu('SELECT malzeme_id, statu FROM recete_rota_statu_karti ORDER BY 1, 2'),
});

// Bütün yollar: geçersiz ve yinelenen statü, routes / yürürlükteki / öteki revizyon önceliği, eski kimlik, yinelenen girdi, katalogda
// olmayan kart, tanımsız statü, başında sıfır olan kimlik, sayı olmayan ürün anahtarı.
function belge(mm: number, ym: number, hm: number) {
  const k = String(mm);
  return {
    statuses: [
      { id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' }, { id: 'S6', code: 'S6', name: 'Yeni statü', kind: 'uretim', color: '#2F6FDE' },
      { id: 'BOZ', code: 'COKUZUN', name: 'Bozuk', kind: 'uretim', color: '#2F6FDE' }, { id: 'KKB', code: 'KKB', name: 'İkinci', kind: 'kalite', color: '#9A7400' }, null,
    ],
    routes: {
      [k]: { steps: [
        { id: `${k}-o10`, opNo: 10, outStatus: 'KKB', ins: [{ itemId: String(hm), status: 'S6' }, { itemId: String(hm), status: 'KKB' }, { itemId: '999999', status: 'S6' }] },
        { id: 'o20', outItem: String(ym), ins: [{ itemId: String(ym), status: `step:${String(ym)}-o30` }, { itemId: '0' + String(hm), status: 'S6' }, { itemId: String(mm), status: 'step:999998-o10' }] },
        { id: `${k}-o30`, outStatus: 'YOK' },
        { id: `${k}-o40`, outItem: '999999', outStatus: 'S6' },
        { id: 'adim-x', opNo: 60, outStatus: 'S6' },
        { id: `${k}-o0`, opNo: 70, outStatus: 'S6' },
      ] },
      '999999': { steps: [{ id: '999999-o10', outStatus: 'KKB' }] },
      'yerel-urun': { steps: [{ id: 'o10', outStatus: 'KKB' }] },
    },
    routeRevs: [
      { itemId: k, status: 'onayli', data: { steps: [{ id: `${k}-o50`, outItem: String(hm) }, { id: `${k}-o80`, outStatus: 'KKB' }] } },
      { itemId: k, status: 'yururlukte', data: { steps: [{ id: `${k}-o10`, outItem: String(ym) }, { id: `${k}-o50`, outItem: String(ym) }] } },
      { itemId: String(ym), status: 'taslak', data: { steps: [{ id: `${String(ym)}-o10`, opNo: 10, outStatus: 'S6', ins: [{ itemId: String(hm), status: 'KKB' }] }] } },
    ],
    statusCards: [{ itemId: k, status: 'KKB' }, { itemId: k, status: 'KKB' }, { itemId: String(hm), status: 'YOK' }, { itemId: '0' + String(hm), status: 'S6' }, { itemId: String(ym), status: 'S6' }],
  };
}

describe('Reçete ve Rota kopyalama göçü dolu kayıtta (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('rrkopya');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-rrkopya-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göç JSON\'dan eşitlemeyle aynı satırları çıkarır; tablonun kuralına ve yabancı anahtara uymayan değer kopyalanmaz; JSON değişmez', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(KOPYA_GOCU));
    assert.ok(goc, 'kopyalama göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const kisi = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'rrkopya', parola: 'dogru-parola-1' }));
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RRK-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number, tur: string): Promise<number> => (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RRK-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`rrk-${String(sira)}`, tur, sira, JSON.stringify({ id: `rrk-${String(sira)}`, com: { ad: 'Kopya deneme' } }), kisi]))!.no;
    const mm = await kart(1, 'mamul');
    const ym = await kart(2, 'yarimamul');
    const hm = await kart(3, 'hammadde');
    const deger = belge(mm, ym, hm);
    await sahip.sorgu("INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, 7, $3)",
      [DURUM_ANAHTARI, JSON.stringify(deger), kisi]);
    const once = await sahip.tek('SELECT deger, surum FROM recete_rota_kayit WHERE anahtar = $1', [DURUM_ANAHTARI]);

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);
    const kopya = await tablolar(sahip);

    assert.deepEqual(kopya.tanim.map((x) => (x as { kimlik: string }).kimlik), ['KKB', 'S6'], 'kısıta uymayan BOZ yok, yinelenen KKB tek');
    assert.deepEqual(kopya.bag, [
      { malzeme_id: mm, op_no: 10, cikti_malzeme_id: null, cikti_statu: 'KKB' },
      { malzeme_id: mm, op_no: 20, cikti_malzeme_id: ym, cikti_statu: null },
      { malzeme_id: mm, op_no: 40, cikti_malzeme_id: null, cikti_statu: 'S6' },
      { malzeme_id: mm, op_no: 50, cikti_malzeme_id: ym, cikti_statu: null },
      { malzeme_id: mm, op_no: 60, cikti_malzeme_id: null, cikti_statu: 'S6' },
      { malzeme_id: mm, op_no: 80, cikti_malzeme_id: null, cikti_statu: 'KKB' },
      { malzeme_id: ym, op_no: 10, cikti_malzeme_id: null, cikti_statu: 'S6' },
    ], 'OP 10 routes\'tan; OP 30 tanımsız statü; OP 40 katalogda olmayan çıktı düşer; OP 50 yürürlükteki revizyondan; OP 60 alanından; OP 0 yok');
    assert.deepEqual(kopya.giren, [
      { malzeme_id: mm, op_no: 10, giren_malzeme_id: hm, statu: 'S6', giren_op_no: null },
      { malzeme_id: mm, op_no: 20, giren_malzeme_id: ym, statu: null, giren_op_no: 30 },
      { malzeme_id: ym, op_no: 10, giren_malzeme_id: hm, statu: 'KKB', giren_op_no: null },
    ]);
    assert.deepEqual(kopya.kart, [{ malzeme_id: mm, statu: 'KKB' }, { malzeme_id: ym, statu: 'S6' }]);
    assert.deepEqual(await sahip.tek('SELECT deger, surum FROM recete_rota_kayit WHERE anahtar = $1', [DURUM_ANAHTARI]), once, 'JSON kaydı değişmez');
    // Sunucunun eşitlemesiyle karşılaştırma bu göçün şemasında yapılamaz: eşitleme artık bağı revizyonuna yazar (20261016074852 göçü,
    // bag-revizyon-goc.test.ts).
  });
});
