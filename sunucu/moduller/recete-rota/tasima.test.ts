import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { bagFarklari, jsondanSatirlar, sayimBelgesi, sayimBelgesiTablodan } from './kurallar.ts';
import { adimCiktisi, adimStatusu, yaz } from './servis.ts';

// Geçiş planı adım 3-4: JSON'da yalnız duran parçalar tablolara taşındı, sayım çıktı ve statü bağını tablodan okur. Bu dosya taşımadan önceki
// davranışın aynı kaldığını (sayımın statüsü ve çıktısı) ve JSON'dan tablo satırı çıkarma kuralını sınar.

const PAROLA = 'dogru-parola-1';

describe('JSON\'dan tablo satırları (kural)', () => {
  test('statü tanımları sırasıyla; adım bağı ve giren statüsü revizyonunda, OP başına bir kez (yürürlükteki revizyonda önce routes)', () => {
    const s = jsondanSatirlar({
      statuses: [{ id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' }, { id: 'S6', code: 'S6', name: 'Yeni statü', kind: 'uretim', color: '#2F6FDE' }, null],
      routes: { 7: { steps: [{ id: '7-o10', opNo: 10, outStatus: 'KKB' }, { id: '7-o20', opNo: 20, ins: [{ itemId: '9', status: 'step:9-o30' }, { itemId: '8', status: 'S6' }, { itemId: '5', status: '' }] }] } },
      routeRevs: [
        { id: '101', itemId: '7', status: 'onayli', data: { steps: [{ id: '7-o30', opNo: 30, outItem: '99' }, { id: '7-o40', opNo: 40, outItem: '41' }] } },
        { id: '102', itemId: '7', status: 'yururlukte', data: { steps: [{ id: '7-o10', opNo: 10, outItem: '55' }, { id: '7-o30', opNo: 30, outItem: '8' }] } },
      ],
      statusCards: [{ id: 'c1', itemId: '7', status: 'KKB' }, { id: 'c2', itemId: '7', status: 'KKB' }, { id: 'c3', itemId: '8', status: 'S6' }],
    });
    assert.deepEqual(s.statuTanimlari.map((x) => [x.kimlik, x.ad, x.tur, x.sira]), [['KKB', 'Kalite bekliyor', 'kalite', 0], ['S6', 'Yeni statü', 'uretim', 1]]);
    assert.deepEqual(s.adimBaglari, [
      { revizyonId: 101, malzemeId: 7, opNo: 30, ciktiMalzemeId: 99, ciktiStatu: null },
      { revizyonId: 101, malzemeId: 7, opNo: 40, ciktiMalzemeId: 41, ciktiStatu: null },
      { revizyonId: 102, malzemeId: 7, opNo: 10, ciktiMalzemeId: null, ciktiStatu: 'KKB' },
      { revizyonId: 102, malzemeId: 7, opNo: 30, ciktiMalzemeId: 8, ciktiStatu: null },
    ], 'onaylı revizyon kendi bağıyla; yürürlükteki revizyonda OP 10 routes\'tan (revizyon verisindeki 55 okunmaz)');
    assert.deepEqual(s.girenStatuleri, [
      { revizyonId: 102, malzemeId: 7, opNo: 20, girenMalzemeId: 9, statu: null, girenOpNo: 30 },
      { revizyonId: 102, malzemeId: 7, opNo: 20, girenMalzemeId: 8, statu: 'S6', girenOpNo: null },
    ], 'routes yürürlükteki revizyonundur');
    assert.deepEqual(s.statuKartlari, [{ malzemeId: 7, statu: 'KKB' }, { malzemeId: 8, statu: 'S6' }], 'yinelenen statülü kart tek satır');
    assert.deepEqual(s.atlananlar, []);
  });

  test('eski kimlikli adım (o<opNo>) OP\'sini kimliğinden alır; sayı olmayan kart ve çözülemeyen değer atlananlara yazılır, sessiz düşmez', () => {
    const s = jsondanSatirlar({
      routes: {
        6: { steps: [{ id: 'o10', outStatus: 'KKB' }, { id: 'o20', outStatus: 'KKB' }] },
        7: { steps: [{ id: 'o10', outItem: 'yerel-kart' }, { id: 'o20', outStatus: 'KKB', ins: [{ itemId: '9', status: 'step:8-o10' }] }, { id: 'x', outItem: '5' }] },
        'yerel-urun': { steps: [{ id: 'o10', outStatus: 'KKB' }] },
      },
      routeRevs: [
        { id: '100', itemId: '7', status: 'yururlukte', data: { steps: [] } },
        { id: 'r-yerel', itemId: '7', status: 'taslak', data: { steps: [{ id: 'o10', outStatus: 'KKB' }, { id: 'o30', outStatus: 'KKB' }] } },
      ],
      statusCards: [{ itemId: 'yerel-urun', status: 'KKB' }],
    });
    assert.deepEqual(s.adimBaglari, [{ revizyonId: 100, malzemeId: 7, opNo: 20, ciktiMalzemeId: null, ciktiStatu: 'KKB' }]);
    assert.equal(s.girenStatuleri.length, 0);
    assert.deepEqual(s.atlananlar, [
      '6: sunucuda olmayan rota revizyonu (yürürlükteki revizyon yok)',
      '7 OP 10: çıktı kartı sayı değil (yerel-kart)',
      '7 OP 20: giren statüsü çözülemedi (step:8-o10)',
      '7: OP numarası çözülemeyen adım x',
      '7: sunucuda olmayan rota revizyonu (r-yerel)',
      'yerel-urun: kart kimliği sayı değil',
      'statülü kart: kart kimliği sayı değil (yerel-urun)',
    ]);
  });

  test('bozuk belge boş satır verir', () => {
    for (const b of [null, 'metin', [], { routes: 'x', statuses: {}, routeRevs: 3 }]) {
      assert.deepEqual(jsondanSatirlar(b), { statuTanimlari: [], adimBaglari: [], girenStatuleri: [], statuKartlari: [], atlananlar: [] });
    }
  });

  test('gölge karşılaştırmanın temeli: yürürlükteki rotanın her adımında tablo satırı, sayımın okuduğu çıktı ve statü bağıyla aynıdır', () => {
    const belge = {
      routes: { 7: { steps: [{ id: '7-o10', outStatus: 'KKB' }, { id: 'o20', outItem: '8' }] } },
      routeRevs: [{ id: '100', itemId: '7', status: 'yururlukte', data: { steps: [{ id: '7-o30', outItem: '9' }, { id: '7-o10', outItem: '5' }] } }],
    };
    const yururlukteki = { steps: [10, 20, 30, 40].map((opNo) => ({ id: `7-o${String(opNo)}`, opNo })) };
    const okunan = sayimBelgesi(belge, 7, yururlukteki) as { routes: Record<string, { steps: { opNo: number; outItem?: string; outStatus?: string }[] }> };
    const satirlar = new Map(jsondanSatirlar(belge).adimBaglari.map((x) => [x.opNo, x]));
    for (const a of okunan.routes['7']?.steps ?? []) {
      const t = satirlar.get(a.opNo);
      assert.deepEqual([t?.ciktiMalzemeId ?? null, t?.ciktiStatu ?? null], [a.outItem === undefined ? null : Number(a.outItem), a.outStatus ?? null], `OP ${String(a.opNo)}`);
    }
    assert.deepEqual(sayimBelgesiTablodan(belge, 7, yururlukteki, jsondanSatirlar(belge).adimBaglari), okunan, 'tablodan okunan belge JSON\'dan okunanla aynı');
    assert.deepEqual(bagFarklari(jsondanSatirlar(belge), jsondanSatirlar(belge).adimBaglari), []);
  });

  test('sayım bağı tablodan okur: belgedeki bağ yok sayılır; yürürlükte rota yoksa adımlar belgeden, bağ yine tablodan; fark listelenir', () => {
    const belge = {
      items: [], routes: { 7: { steps: [{ id: '7-o10', opNo: 10, outItem: '55' }, null, { id: 'o20', outStatus: 'YOK' }] } },
      routeRevs: [{ id: '100', itemId: '7', status: 'yururlukte', data: { steps: [] } }],
    };
    const bag = [{ revizyonId: 100, malzemeId: 7, opNo: 20, ciktiMalzemeId: 8, ciktiStatu: null }, { revizyonId: 200, malzemeId: 9, opNo: 10, ciktiMalzemeId: null, ciktiStatu: 'KKB' }];
    const okunan = (sayimBelgesiTablodan(belge, 7, undefined, bag) as { routes: Record<string, { steps: unknown[] }> }).routes['7']?.steps;
    assert.deepEqual(okunan, [{ id: '7-o10', opNo: 10 }, null, { id: 'o20', outItem: '8' }], 'sırası ve bozuk adımı korunur');
    const yururlukte = (sayimBelgesiTablodan(belge, 7, { steps: [{ id: '7-o10', opNo: 10 }] }, [{ revizyonId: 100, malzemeId: 7, opNo: 10, ciktiMalzemeId: null, ciktiStatu: 'KKB' }]) as
      { routes: Record<string, { steps: unknown[] }> }).routes['7']?.steps;
    assert.deepEqual(yururlukte, [{ id: '7-o10', opNo: 10, outStatus: 'KKB' }]);
    assert.equal(sayimBelgesiTablodan('bozuk', 7, undefined, bag), 'bozuk');
    assert.deepEqual(sayimBelgesiTablodan({ routes: {} }, 7, undefined, bag), { routes: {} });
    assert.deepEqual(bagFarklari(jsondanSatirlar(belge), [{ revizyonId: 100, malzemeId: 7, opNo: 10, ciktiMalzemeId: 55, ciktiStatu: null }]),
      ['7 revizyon 100 OP 20: belgede çıktı -, statü YOK, tabloda bağ yok']);
  });
});

describe('taşıma tabloları ve bugünkü sayım davranışı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerez = '';
  let surum: number | null = null;
  let sira = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  const kaydet = async (deger: unknown) => {
    const c = await app.inject({
      method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: cerez },
      payload: { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: surum },
    });
    assert.equal(c.statusCode, 200, c.body);
    surum = (c.json() as { kayit: { surum: number } }).kayit.surum;
  };

  const kartAc = async (tur: 'mamul' | 'yarimamul' | 'hammadde'): Promise<number> => {
    sira += 1;
    return (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'TSM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`tsm-${String(sira)}`, tur, sira, JSON.stringify({ id: `tsm-${String(sira)}`, com: { ad: 'Taşıma deneme' } }), yoneticiId]))!.no;
  };

  const yururlukteRota = async (kart: number, oplar: number[]): Promise<number> => {
    const tip = (await vt().tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Torna', 'TAL') RETURNING id", [`TS${String(kart)}`]))!.id;
    const id = (await vt().tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [kart, yoneticiId]))!.id;
    for (const [i, op] of oplar.entries()) {
      await vt().sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3)', [kart, op, id]);
      await vt().sorgu('INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5, $6)', [id, kart, op, i + 1, tip, `Adım ${String(op)}`]);
    }
    await vt().sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [id, yoneticiId]);
    await vt().sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true WHERE id = $1", [id, yoneticiId]);
    await vt().sorgu("UPDATE rota_revizyonu SET durum = 'yururlukte', yururluge_alan_kisi_id = $2, yururluge_alma = now() WHERE id = $1", [id, yoneticiId]);
    return id;
  };
  const taslakRevizyon = async (kart: number, harf: string): Promise<number> =>
    (await vt().tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', $2, $3) RETURNING id", [kart, harf, yoneticiId]))!.id;

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_tasima');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TSM-', 0) ON CONFLICT (onek) DO NOTHING");
  });

  after(async () => { await ortam?.kaldir(); });

  test('göç: tablolar boş açılır; geçerli satır kabul edilir, kısıtlar adıyla reddeder', async () => {
    for (const t of ['recete_rota_statu_tanimi', 'recete_rota_adim_bagi', 'recete_rota_giren_statusu', 'recete_rota_statu_karti']) {
      assert.equal((await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`))?.n, 0, t);
    }
    const mm = await kartAc('mamul');
    const hm = await kartAc('hammadde');
    const rev = await taslakRevizyon(mm, 'A');
    const baskaRev = await taslakRevizyon(await kartAc('mamul'), 'A');
    const red = async (sql: string, args: unknown[], kisit: string) => {
      await assert.rejects(vt().sorgu(sql, args), (e: { constraint?: string; message?: string }) => (e.constraint ?? e.message ?? '').includes(kisit), kisit);
    };
    const tanim = 'INSERT INTO recete_rota_statu_tanimi (kimlik, kod, ad, tur, renk, sira, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $5, 0, $6)';
    await vt().sorgu(tanim, ['KKB', 'KKB', 'Kalite bekliyor', 'kalite', '#9A7400', yoneticiId]);
    await red(tanim, ['S 1', 'S1', 'Ad', 'uretim', '#2F6FDE', yoneticiId], 'recete_rota_statu_tanimi_kimlik_bicimi');
    await red(tanim, ['S2', 'UZUNKOD', 'Ad', 'uretim', '#2F6FDE', yoneticiId], 'recete_rota_statu_tanimi_kod_dolu');
    await red(tanim, ['S3', 'S3', ' ', 'uretim', '#2F6FDE', yoneticiId], 'recete_rota_statu_tanimi_ad_dolu');
    await red(tanim, ['S4', 'S4', 'Ad', 'baska', '#2F6FDE', yoneticiId], 'recete_rota_statu_tanimi_tur');
    await red(tanim, ['S5', 'S5', 'Ad', 'uretim', 'mavi', yoneticiId], 'recete_rota_statu_tanimi_renk_bicimi');

    const bag = 'INSERT INTO recete_rota_adim_bagi (malzeme_id, op_no, cikti_malzeme_id, cikti_statu, guncelleyen_kisi_id, rota_revizyonu_id) VALUES ($1, $2, $3, $4, $5, $6)';
    await vt().sorgu(bag, [mm, 10, null, 'KKB', yoneticiId, rev]);
    await vt().sorgu(bag, [mm, 20, hm, null, yoneticiId, rev]);
    await red(bag, [mm, 30, null, null, yoneticiId, rev], 'recete_rota_adim_bagi_dolu');
    await red(bag, [mm, 0, hm, null, yoneticiId, rev], 'recete_rota_adim_bagi_op_pozitif');
    await red(bag, [mm, 40, null, 'YOK', yoneticiId, rev], 'recete_rota_adim_bagi_cikti_statu_fkey');
    await red(bag, [mm, 10, hm, null, yoneticiId, rev], 'recete_rota_adim_bagi_revizyon_op_tekil');
    await red(bag, [mm, 50, hm, null, yoneticiId, baskaRev], 'recete_rota_adim_bagi_revizyon_fkey');

    const giren = 'INSERT INTO recete_rota_giren_statusu (malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no, guncelleyen_kisi_id, rota_revizyonu_id) VALUES ($1, $2, $3, $4, $5, $6, $7)';
    await vt().sorgu(giren, [mm, 10, hm, 'KKB', null, yoneticiId, rev]);
    await vt().sorgu(giren, [mm, 20, hm, null, 30, yoneticiId, rev]);
    await red(giren, [mm, 30, hm, 'KKB', 30, yoneticiId, rev], 'recete_rota_giren_statusu_tek_kaynak');
    await red(giren, [mm, 40, hm, null, null, yoneticiId, rev], 'recete_rota_giren_statusu_tek_kaynak');
    await red(giren, [mm, 50, hm, null, 0, yoneticiId, rev], 'recete_rota_giren_statusu_op_pozitif');
    await red(giren, [mm, 10, hm, 'KKB', null, yoneticiId, rev], 'recete_rota_giren_statusu_revizyon_tekil');
    await red(giren, [mm, 60, hm, 'KKB', null, yoneticiId, baskaRev], 'recete_rota_giren_statusu_revizyon_fkey');

    const kart = 'INSERT INTO recete_rota_statu_karti (malzeme_id, statu, guncelleyen_kisi_id) VALUES ($1, $2, $3)';
    await vt().sorgu(kart, [mm, 'KKB', yoneticiId]);
    await red(kart, [mm, 'KKB', yoneticiId], 'recete_rota_statu_karti_pkey');
    await red(kart, [mm, 'YOK', yoneticiId], 'recete_rota_statu_karti_statu_fkey');
  });

  test('davranış korunur: sayımın statüsü ve çıktısı taşımadan öncekiyle aynı; yürürlükteki rotada olmayan alan revizyondan, eski kimlikli adım OP\'siyle eşlenir', async () => {
    const mm = await kartAc('mamul');
    const ym = await kartAc('yarimamul');
    const rev = await yururlukteRota(mm, [10, 20, 30, 40]);
    const k = String(mm);
    await kaydet({
      items: [{ id: k, code: 'TSM-MM', type: 'mamul' }, { id: String(ym), code: 'TSM-YM', type: 'yari' }],
      opdefs: [{ id: 'op1', name: 'Torna' }],
      statuses: [{ id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' }],
      routes: { [k]: { steps: [{ id: `${k}-o10`, opNo: 10, outStatus: 'KKB' }, { id: 'o20', outItem: '' }] } },
      routeRevs: [{ id: String(rev), itemId: k, status: 'yururlukte', data: { steps: [{ id: `${k}-o30`, opNo: 30, outItem: String(ym) }] } }],
    });
    const statuler = [];
    const ciktilar = [];
    for (const opNo of [10, 20, 30, 40]) {
      statuler.push(await adimStatusu(vt(), { malzemeNo: mm, opNo }));
      ciktilar.push(await adimCiktisi(vt(), { malzemeNo: mm, opNo }));
    }
    assert.equal(statuler[0], null, 'OP 10 tanımlı statüye bağlı: OP statüsü açmaz');
    assert.ok(statuler[1] !== null, 'OP 20 ara adım: OP statüsü açar');
    assert.deepEqual([statuler[2], statuler[3]], [null, null], 'OP 30 karta dönüşür, OP 40 son adım');
    assert.deepEqual(ciktilar, [null, null, ym, null], 'çıktı yalnız OP 30 (revizyondaki outItem)');
    const ad = await vt().tek<{ ad: string; malzeme_no: string }>('SELECT ad, malzeme_no FROM recete_rota_statu WHERE id = $1', [statuler[1]]);
    const kod = (await vt().tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = $1', [mm]))!.kod;
    assert.deepEqual(ad, { ad: 'OP 20 Torna', malzeme_no: kod }, 'kod ve operasyon adı belgedeki eski kopyadan değil sunucudan');
  });

  test('belgede ürün kartı ve operasyon tanımı yokken de sayım statüyü sunucu kataloğundan açar', async () => {
    const mm = await kartAc('mamul');
    await yururlukteRota(mm, [10, 20]);
    await kaydet({ items: [], opdefs: [], statuses: [], routes: {}, routeRevs: [] });
    const statu = await adimStatusu(vt(), { malzemeNo: mm, opNo: 10 });
    assert.ok(statu !== null, 'ara adım OP statüsü açar');
    const satir = await vt().tek<{ ad: string }>('SELECT ad FROM recete_rota_statu WHERE id = $1', [statu]);
    assert.equal(satir?.ad, 'OP 10 Torna');
  });


  const tablolar = async () => ({
    tanim: await vt().sorgu('SELECT kimlik, kod, ad, tur, renk, sira FROM recete_rota_statu_tanimi ORDER BY kimlik'),
    bag: await vt().sorgu('SELECT rota_revizyonu_id AS rev, malzeme_id, op_no, cikti_malzeme_id, cikti_statu FROM recete_rota_adim_bagi ORDER BY 2, 1, 3'),
    giren: await vt().sorgu('SELECT rota_revizyonu_id AS rev, malzeme_id, op_no, giren_malzeme_id, statu, giren_op_no FROM recete_rota_giren_statusu ORDER BY 2, 1, 3, 4'),
    kart: await vt().sorgu('SELECT malzeme_id, statu FROM recete_rota_statu_karti ORDER BY 1, 2'),
  });

  // Bütün yolları bir arada sınayan belge: geçersiz statü, routes ve revizyon önceliği, eski kimlik, yinelenen girdi, katalogda olmayan kart,
  // tanımsız statü ve başında sıfır olan kimlik. Veriler uydurmadır.
  const karisikBelge = (mm: number, ym: number, hm: number, yur: number, taslak: number) => {
    const k = String(mm);
    return {
      statuses: [
        { id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' }, { id: 'S6', code: 'S6', name: 'Yeni statü', kind: 'uretim', color: '#2F6FDE' },
        { id: 'BOZ', code: 'COKUZUN', name: 'Bozuk', kind: 'uretim', color: '#2F6FDE' }, { id: 'KKB', code: 'KKB', name: 'İkinci', kind: 'kalite', color: '#9A7400' },
      ],
      routes: {
        [k]: { steps: [
          { id: `${k}-o10`, opNo: 10, outStatus: 'KKB', ins: [{ itemId: String(hm), status: 'S6' }, { itemId: String(hm), status: 'KKB' }, { itemId: '999999', status: 'S6' }] },
          { id: 'o20', outItem: String(ym), ins: [{ itemId: String(ym), status: `step:${String(ym)}-o30` }, { itemId: '0' + String(hm), status: 'S6' }] },
          { id: `${k}-o30`, outStatus: 'YOK' },
          { id: `${k}-o40`, outItem: '999999', outStatus: 'S6' },
        ] },
        '999999': { steps: [{ id: '999999-o10', outStatus: 'KKB' }] },
      },
      routeRevs: [
        { id: String(taslak), itemId: k, status: 'taslak', data: { steps: [{ id: `${k}-o50`, outItem: String(hm) }] } },
        { id: String(yur), itemId: k, status: 'yururlukte', data: { steps: [{ id: `${k}-o10`, outItem: String(ym) }, { id: `${k}-o50`, outItem: String(ym) }] } },
      ],
      statusCards: [{ itemId: k, status: 'KKB' }, { itemId: k, status: 'KKB' }, { itemId: String(hm), status: 'YOK' }, { itemId: '0' + String(hm), status: 'S6' }],
    };
  };

  test('eşitleme: ana kayıt yazılınca tablolar belgeyle aynı transaction\'da eşitlenir; tanımsız statü ve katalogda olmayan kart yazılmaz, kayıt yine yazılır', async () => {
    const mm = await kartAc('mamul');
    const ym = await kartAc('yarimamul');
    const hm = await kartAc('hammadde');
    const yur = await yururlukteRota(mm, [10, 20, 30, 40, 50]);
    const taslak = await taslakRevizyon(mm, 'B');
    await kaydet(karisikBelge(mm, ym, hm, yur, taslak));
    const t = await tablolar();
    assert.deepEqual(t.tanim.map((x) => (x as { kimlik: string }).kimlik), ['KKB', 'S6'], 'kısıta uymayan BOZ yazılmaz, yinelenen KKB tek');
    assert.deepEqual(t.bag, [
      { rev: yur, malzeme_id: mm, op_no: 10, cikti_malzeme_id: null, cikti_statu: 'KKB' },
      { rev: yur, malzeme_id: mm, op_no: 20, cikti_malzeme_id: ym, cikti_statu: null },
      { rev: yur, malzeme_id: mm, op_no: 40, cikti_malzeme_id: null, cikti_statu: 'S6' },
      { rev: yur, malzeme_id: mm, op_no: 50, cikti_malzeme_id: ym, cikti_statu: null },
      { rev: taslak, malzeme_id: mm, op_no: 50, cikti_malzeme_id: hm, cikti_statu: null },
    ], 'OP 10 routes\'tan; OP 30 tanımsız statü; OP 40 katalogda olmayan çıktı düşer, statüsü kalır; taslak revizyon kendi OP 50 bağıyla');
    assert.deepEqual(t.giren, [
      { rev: yur, malzeme_id: mm, op_no: 10, giren_malzeme_id: hm, statu: 'S6', giren_op_no: null },
      { rev: yur, malzeme_id: mm, op_no: 20, giren_malzeme_id: ym, statu: null, giren_op_no: 30 },
    ], 'aynı girenin ilk girdisi; katalogda olmayan ve başında sıfır olan giren yazılmaz');
    assert.deepEqual(t.kart.filter((x) => (x as { malzeme_id: number }).malzeme_id === mm), [{ malzeme_id: mm, statu: 'KKB' }]);

    const surumler = async () => vt().sorgu<{ op_no: number; surum: number }>('SELECT op_no, surum FROM recete_rota_adim_bagi WHERE rota_revizyonu_id = $1 ORDER BY op_no', [yur]);
    const ilk = await surumler();
    const sonraki = karisikBelge(mm, ym, hm, yur, taslak);
    sonraki.statuses = sonraki.statuses.filter((x) => x.id !== 'S6');
    const adimlar = sonraki.routes[String(mm)]?.steps ?? [];
    adimlar[0] = { id: `${String(mm)}-o10`, opNo: 10, outStatus: 'KKB', ins: [] };
    adimlar[1] = { id: 'o20', outItem: String(hm), ins: [] };
    sonraki.statusCards = [];
    await kaydet(sonraki);
    const u = await tablolar();
    // Statü tanımında tablo tek kaynaktır: belgeden kalkan statü silinmez (silme komutladır), bağı da kalır.
    assert.deepEqual(u.tanim.map((x) => (x as { kimlik: string }).kimlik), ['KKB', 'S6'], 'belgeden kalkan statü tabloda kalır');
    assert.deepEqual(u.bag.map((x) => { const b = x as { rev: number; op_no: number; cikti_malzeme_id: number | null }; return [b.rev, b.op_no, b.cikti_malzeme_id]; }),
      [[yur, 10, null], [yur, 20, hm], [yur, 40, null], [yur, 50, ym], [taslak, 50, hm]], 'OP 40 statü bağı kalır; OP 20 çıktısı değişir');
    assert.deepEqual(u.giren, []);
    // Statülü kartta da tablo tek kaynaktır: belgeden kalkan kart silinmez (kaldırma komutladır).
    assert.deepEqual(u.kart.filter((x) => (x as { malzeme_id: number }).malzeme_id === mm), [{ malzeme_id: mm, statu: 'KKB' }], 'belgeden kalkan kart tabloda kalır');
    const son = await surumler();
    assert.deepEqual(son.map((x) => [x.op_no, x.surum - (ilk.find((y) => y.op_no === x.op_no)?.surum ?? 0)]), [[10, 0], [20, 1], [40, 0], [50, 0]], 'yalnız değişen satırın sürümü artar');
  });

  test('sayım tablodan okur: tablodaki bağ değişince sayım onu izler; belgede olup tabloya yazılamayan bağ günlüğe uyarı olarak düşer', async () => {
    const mm = await kartAc('mamul');
    const ym = await kartAc('yarimamul');
    const rev = await yururlukteRota(mm, [10, 20, 30]);
    const k = String(mm);
    const belge = {
      items: [{ id: k, code: 'TSM-MM2', type: 'mamul' }, { id: String(ym), code: 'TSM-YM2', type: 'yari' }],
      opdefs: [{ id: 'op1', name: 'Torna' }],
      routes: { [k]: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(ym) }, { id: `${k}-o20`, opNo: 20, outItem: '999999' }] } },
      routeRevs: [{ id: String(rev), itemId: k, status: 'yururlukte', data: { steps: [] } }],
    };
    const uyarilar: string[] = [];
    const gunluk: Gunluk = { uyar: (m) => { uyarilar.push(m); }, hata: () => undefined };
    await vt().tx(async (db) => {
      const kullanici = await kullaniciYukle(db, yoneticiId);
      assert.ok(kullanici);
      surum = (await yaz(db, kullanici, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: belge, beklenenSurum: surum }, gunluk)).kayit.surum;
    });
    assert.equal(uyarilar.length, 1);
    assert.match(uyarilar[0] ?? '', new RegExp(`${k} revizyon ${String(rev)} OP 20: belgede çıktı 999999, statü -, tabloda bağ yok`));
    assert.deepEqual([await adimCiktisi(vt(), { malzemeNo: mm, opNo: 10 }), await adimStatusu(vt(), { malzemeNo: mm, opNo: 10 })], [ym, null]);
    assert.notEqual(await adimStatusu(vt(), { malzemeNo: mm, opNo: 20 }), null, 'katalogda olmayan çıktı tabloda yok: OP 20 statü açar');
    await vt().sorgu('DELETE FROM recete_rota_adim_bagi WHERE malzeme_id = $1 AND op_no = 10', [mm]);
    assert.equal(await adimCiktisi(vt(), { malzemeNo: mm, opNo: 10 }), null, 'bağ tablodan kalkınca belgede dursa da okunmaz');
    assert.notEqual(await adimStatusu(vt(), { malzemeNo: mm, opNo: 10 }), null);
  });

  test('yazma ürün sayısıyla sorgu çoğaltmaz: statülerin yürürlükteki revizyonu tek sorguda okunur (yol haritası 0.2.5)', async () => {
    const urunler = [];
    for (let i = 0; i < 4; i += 1) { const kart = await kartAc('mamul'); await yururlukteRota(kart, [10, 20]); urunler.push(String(kart)); }
    const belge = (liste: string[]) => ({
      items: liste.map((k) => ({ id: k, code: `TSM-S${k}`, type: 'mamul' })),
      routes: Object.fromEntries(liste.map((k) => [k, { steps: [{ id: `${k}-o10`, opNo: 10 }, { id: `${k}-o20`, opNo: 20 }] }])),
    });
    const sayarak = async (deger: object): Promise<number> => vt().tx(async (db) => {
      let n = 0;
      const sayan: Db = { sorgu: (q, p) => { n += 1; return db.sorgu(q, p); }, tek: (q, p) => { n += 1; return db.tek(q, p); } };
      const kullanici = await kullaniciYukle(db, yoneticiId);
      assert.ok(kullanici);
      surum = (await yaz(sayan, kullanici, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: surum })).kayit.surum;
      return n;
    });
    // Her ölçümden önce belge boşaltılır: iki ölçümde de belgede yeni olan ürünler aynı yoldan geçer.
    await sayarak(belge([]));
    const tek = await sayarak(belge(urunler.slice(0, 1)));
    await sayarak(belge([]));
    const dort = await sayarak(belge(urunler));
    assert.equal(dort, tek, 'dört ürünlü belge tek ürünlüyle aynı sayıda sorgu atar');
    const statuler = await vt().sorgu<{ k: string; r: number | null }>('SELECT kaynak_adim AS k, rota_revizyonu_id AS r FROM recete_rota_statu WHERE kaynak_adim = ANY($1::text[]) ORDER BY id', [urunler.map((k) => `${k}-o10`)]);
    assert.equal(statuler.length, 4);
    assert.ok(statuler.every((x) => x.r !== null), 'her statü kendi ürününün yürürlükteki revizyonuna açılır');
  });

  test('gölge karşılaştırma yalnız belgede değişen ürüne bakar: değişmeyen ürünün farkı her yazmada yinelenmez', async () => {
    const a = await kartAc('mamul');
    const ym = await kartAc('yarimamul');
    const b = await kartAc('mamul');
    const revA = await yururlukteRota(a, [10, 20, 30]);
    const revB = await yururlukteRota(b, [10, 20]);
    const [ka, kb] = [String(a), String(b)];
    const belge = (bCikti: string | null) => ({
      items: [{ id: ka, code: 'TSM-GA', type: 'mamul' }, { id: kb, code: 'TSM-GB', type: 'mamul' }, { id: String(ym), code: 'TSM-GY', type: 'yari' }],
      routes: {
        [ka]: { steps: [{ id: `${ka}-o10`, opNo: 10 }, { id: `${ka}-o20`, opNo: 20, outItem: '999999' }, { id: `${ka}-o30`, opNo: 30 }] },
        [kb]: { steps: [{ id: `${kb}-o10`, opNo: 10, ...(bCikti === null ? {} : { outItem: bCikti }) }, { id: `${kb}-o20`, opNo: 20 }] },
      },
      routeRevs: [{ id: String(revA), itemId: ka, status: 'yururlukte', data: { steps: [] } }, { id: String(revB), itemId: kb, status: 'yururlukte', data: { steps: [] } }],
    });
    const uyarilar: string[] = [];
    const gunluk: Gunluk = { uyar: (m) => { uyarilar.push(m); }, hata: () => undefined };
    const yazGunluklu = (deger: object) => vt().tx(async (db) => {
      const kullanici = await kullaniciYukle(db, yoneticiId);
      assert.ok(kullanici);
      surum = (await yaz(db, kullanici, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: surum }, gunluk)).kayit.surum;
    });
    await yazGunluklu(belge(String(ym)));
    assert.equal(uyarilar.length, 1);
    assert.match(uyarilar[0] ?? '', new RegExp(`${ka} revizyon ${String(revA)} OP 20: belgede çıktı 999999`));
    assert.equal(await adimCiktisi(vt(), { malzemeNo: b, opNo: 10 }), ym);
    await yazGunluklu(belge(null));
    assert.equal(uyarilar.length, 1, 'yalnız B değişti; A\'nın bilinen farkı yeniden yazılmaz');
    assert.equal(await adimCiktisi(vt(), { malzemeNo: b, opNo: 10 }), null, 'B\'nin değişikliği tabloya eşitlenir');
  });

  test('bağ revizyonundadır: taslak revizyondaki bağ yürürlükteki sayımı değiştirmez; sunucuda olmayan ya da başka ürünün revizyonu yazılmaz', async () => {
    const mm = await kartAc('mamul');
    const ym = await kartAc('yarimamul');
    const hm = await kartAc('hammadde');
    const yur = await yururlukteRota(mm, [10, 20, 30]);
    const taslak = await taslakRevizyon(mm, 'B');
    const baskaRev = await taslakRevizyon(await kartAc('mamul'), 'A');
    const revsiz = await kartAc('mamul');
    // Göçte revizyonsuz kalan eski satır (revizyonu olmayan ürün): eşitleme silmez.
    await vt().sorgu('INSERT INTO recete_rota_adim_bagi (malzeme_id, op_no, cikti_malzeme_id, guncelleyen_kisi_id) VALUES ($1, 10, $2, $3)', [revsiz, hm, yoneticiId]);
    const k = String(mm);
    await kaydet({
      statuses: [{ id: 'KKB', code: 'KKB', name: 'Kalite bekliyor', kind: 'kalite', color: '#9A7400' }],
      routeRevs: [
        { id: String(yur), itemId: k, status: 'yururlukte', data: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(ym) }] } },
        { id: String(taslak), itemId: k, status: 'taslak', data: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(hm) }, { id: `${k}-o20`, opNo: 20, outStatus: 'KKB' }] } },
        { id: String(baskaRev), itemId: k, status: 'taslak', data: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(hm) }] } },
        { id: '999999', itemId: k, status: 'taslak', data: { steps: [{ id: `${k}-o10`, opNo: 10, outItem: String(hm) }] } },
      ],
    });
    assert.deepEqual((await tablolar()).bag.filter((x) => (x as { malzeme_id: number }).malzeme_id === mm).map((x) => { const b = x as { rev: number; op_no: number; cikti_malzeme_id: number | null; cikti_statu: string | null }; return [b.rev, b.op_no, b.cikti_malzeme_id, b.cikti_statu]; }),
      [[yur, 10, ym, null], [taslak, 10, hm, null], [taslak, 20, null, 'KKB']], 'başka ürünün ve sunucuda olmayan revizyonun satırı yok');
    assert.deepEqual(await vt().sorgu('SELECT rota_revizyonu_id AS r, cikti_malzeme_id AS c FROM recete_rota_adim_bagi WHERE malzeme_id = $1', [revsiz]), [{ r: null, c: hm }], 'revizyonsuz eski satır kalır');
    assert.equal(await adimCiktisi(vt(), { malzemeNo: mm, opNo: 10 }), ym, 'yürürlükteki bağ; taslaktaki hm okunmaz');
    assert.notEqual(await adimStatusu(vt(), { malzemeNo: mm, opNo: 20 }), null, 'yürürlükte OP 20 son adım değil ve bağsız; taslaktaki KKB bağı okunmaz');
  });
});
