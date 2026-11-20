import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { DagitCevabi, DagitilmamisCevabi, DagitimCevabi, GorevAyrintisiCevabi, SablonListesiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { hazirlikHedefCozucusuKaydet } from './dagitim.ts';
import { SABLON_DAGITILMADI, hazirlikGorevleriAc } from './hazirlik-gorevleri.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Kisi { cerez: string; id: number }

// Görevin emri yabancı anahtarsızdır; çözücü sahte emir verir (Üretim Emirleri'nin gerçek bağı kendi testindedir).
const EMIR = 990301;

describe('3458 dilim 2 Görevleri dağıt (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kisi;
  let planlama: Kisi;
  let kalite: Kisi;
  const rol = new Map<string, number>();
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = (kod: string): number => {
    const id = rol.get(kod);
    if (id === undefined) throw new Error(`rol yok: ${kod}`);
    return id;
  };
  async function girisYap(rolKodu: string | null, yonetenId: number | null): Promise<Kisi> {
    const kullaniciAdi = `gdt-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yonetenId !== null) {
        await rolAta(db, yonetenId, yeni, rolId(rolKodu));
        await rolAl(db, yonetenId, yeni, rolId('yonetici'));
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }
  const gonder = (k: Kisi, yol: string, govde: unknown = {}): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: k.cerez, 'istek-kimligi': randomUUID() } });
  const oku = (k: Kisi, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: k.cerez } });

  async function projeAc(): Promise<number> {
    const s = await vt().tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, durum, baslangic, bitis, olusturan_id) VALUES ($1, 'Deneme dağıtım projesi', 'aktif', '2026-12-01', '2026-12-31', $2) RETURNING id",
      [`GD.${(sayac += 1)}`, yonetici.id],
    );
    return s?.id ?? 0;
  }
  async function sablonAc(ad: string, varsayilan: boolean): Promise<{ id: number; kalemler: { id: number; ad: string }[] }> {
    const c = await gonder(yonetici, '/projeler/sablonlar', {
      ad, varsayilan, etkin: true, kalemler: [
        { ad: 'Fikstür tasarımı', dayanak: 'baslangic', gun: 0, sureGun: 3, yapanRolId: rolId('kalite'), adimlar: ['Çizimi oku', 'Taslak çiz'], kanitZorunlu: true },
        { ad: 'İlk parça ölçümü', dayanak: 'baslangic', gun: 3, sureGun: 2, yapanRolId: rolId('kalite'), oncekiSira: 0 },
        { ad: 'Boru kesimi', dayanak: 'baslangic', gun: 0, sureGun: 1, yapanRolId: rolId('kalite') },
        { ad: 'CNC programı', dayanak: 'baslangic', gun: 0, sureGun: 2, yapanRolId: rolId('kalite'), hazirlikMaddesi: 'cnc', adimlar: ['Program yaz'] },
      ],
    });
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json<SablonListesiCevabi>().sablonlar.find((x) => x.ad === ad);
    if (!s) throw new Error('şablon yok');
    return { id: s.id, kalemler: s.kalemler.map((k) => ({ id: k.id, ad: k.ad })) };
  }
  const gorevler = (projeId: number) => vt().sorgu<{ id: number; ad: string; sorumlu_kisi_id: number | null; yapan_rol_id: number | null; plan_bitis: string; kanit_zorunlu: boolean; onceki_gorev_id: number | null; hazirlik_maddesi: string | null }>(
    'SELECT id, ad, sorumlu_kisi_id, yapan_rol_id, plan_bitis::text AS plan_bitis, kanit_zorunlu, onceki_gorev_id, hazirlik_maddesi FROM projeler_gorev WHERE proje_id = $1 ORDER BY id', [projeId]);

  before(async () => {
    ortam = await testVeritabaniKur('gorev_dagitimi');
    // 3478: olaylar varsayılan kapalıdır; bu dosya 3478'den önceki gibi açık olaylarla çalışır.
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    for (const r of await ortam.vt.sorgu<{ id: number; kod: string }>('SELECT id, kod FROM rol')) rol.set(r.kod, r.id);
    yonetici = await girisYap(null, null);
    planlama = await girisYap('planlama_proje', yonetici.id);
    kalite = await girisYap('kalite', yonetici.id);
    hazirlikHedefCozucusuKaydet(async (_db, projeId) => ({
      hedefler: projeId === hedefProjesi ? [{ hedef: { emriId: EMIR, emirNo: 'ORN-UE-1', isEmirleri: [{ id: 990311, opNo: 10 }, { id: 990312, opNo: 20 }] }, tarih: { baslangic: '2026-12-02', bitis: '2026-12-20' } }] : [],
      maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }]]),
    }));
  });
  after(async () => { hazirlikHedefCozucusuKaydet(null); await app?.close(); await ortam?.kaldir(); });
  let hedefProjesi = 0;

  test('şablon kalemi adımları ve kanıt zorunluluğunu taşır; önizleme yazmaz, varsayılanı seçili getirir, hazırlıkta doğacak görevi sayar', async () => {
    const s = await sablonAc('Yeni parça başlangıcı', true);
    const liste = (await oku(yonetici, '/projeler/sablonlar/liste')).json<SablonListesiCevabi>().sablonlar.find((x) => x.id === s.id);
    assert.deepEqual(liste?.kalemler.map((k) => [k.adimlar.length, k.kanitZorunlu]), [[2, true], [0, false], [0, false], [1, false]]);
    hedefProjesi = await projeAc();
    const bekleyen = (await oku(planlama, '/projeler/dagitim/bekleyenler')).json<DagitilmamisCevabi>().projeler;
    assert.ok(bekleyen.some((p) => p.id === hedefProjesi), 'dağıtılmamış proje şeritte');
    const c = await oku(planlama, `/projeler/${hedefProjesi}/dagitim`);
    assert.equal(c.statusCode, 200, c.body);
    const o = c.json<DagitimCevabi>();
    assert.deepEqual([o.sablonId, o.dagitildi, o.emirSayisi], [s.id, false, 1]);
    assert.deepEqual(o.satirlar.map((x) => [x.ad, x.planBaslangic, x.planBitis, x.dogacak]), [
      ['Fikstür tasarımı', '2026-12-01', '2026-12-03', 1], ['İlk parça ölçümü', '2026-12-04', '2026-12-05', 1], ['Boru kesimi', '2026-12-01', '2026-12-01', 1],
      ['CNC programı', '2026-12-01', '2026-12-02', 2],
    ]);
    assert.equal(o.satirlar[3]?.hazirlikAd, 'CNC kurulumu');
    assert.equal((await gorevler(hedefProjesi)).length, 0, 'önizleme görev açmaz');
    assert.equal((await oku(kalite, `/projeler/${hedefProjesi}/dagitim`)).statusCode, 403, 'görev yazmayan dağıtımı görmez');
  });

  test('dağıt: düzenlenen satırla proje görevi adım ve kanıtıyla açılır; dışarıda kalan açılmaz, öncülü boş; hazırlık iş emri başına; özel görev; ikinci kez 409', async () => {
    const o = (await oku(planlama, `/projeler/${hedefProjesi}/dagitim`)).json<DagitimCevabi>();
    const [fikstur, olcum, boru, cnc] = o.satirlar;
    if (!fikstur || !olcum || !boru || !cnc) throw new Error('satır yok');
    const satir = (x: typeof fikstur, ek: Record<string, unknown> = {}) => ({
      kalemId: x.kalemId, dahil: true, yapanKisiId: x.yapanKisiId, yapanRolId: x.yapanRolId, kontrolKisiId: x.kontrolKisiId,
      kontrolRolId: x.kontrolRolId, planBitis: x.planBitis, kanitZorunlu: x.kanitZorunlu, ...ek,
    });
    const govde = {
      sablonId: o.sablonId,
      satirlar: [
        satir(fikstur, { dahil: false }),
        satir(olcum, { yapanKisiId: kalite.id, yapanRolId: null, planBitis: '2026-12-10', kanitZorunlu: true }),
        satir(boru),
        satir(cnc, { yapanKisiId: kalite.id, yapanRolId: null, kontrolKisiId: planlama.id, kanitZorunlu: true }),
      ],
      ozel: [{ ad: 'Müşteri ile ön görüşme', yapanKisiId: null, yapanRolId: rolId('planlama_proje'), kontrolKisiId: null, kontrolRolId: null, planBitis: '2026-12-04', kanitZorunlu: false }],
    };
    assert.equal((await gonder(kalite, `/projeler/${hedefProjesi}/dagit`, govde)).statusCode, 403);
    const c = await gonder(planlama, `/projeler/${hedefProjesi}/dagit`, govde);
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<DagitCevabi>(), { projeGorevi: 3, hazirlikGorevi: 2 });
    const g = await gorevler(hedefProjesi);
    const bul = (ad: string) => g.find((x) => x.ad.startsWith(ad));
    assert.equal(bul('Fikstür'), undefined, 'dışarıda kalan satır açılmaz');
    assert.deepEqual([bul('İlk parça')?.sorumlu_kisi_id, bul('İlk parça')?.plan_bitis, bul('İlk parça')?.kanit_zorunlu, bul('İlk parça')?.onceki_gorev_id],
      [kalite.id, '2026-12-10', true, null], 'düzen uygulanır; öncülü dışarıda kaldığı için boş');
    assert.equal(bul('Müşteri')?.yapan_rol_id, rolId('planlama_proje'));
    const hazirlik = g.filter((x) => x.hazirlik_maddesi === 'cnc');
    assert.equal(hazirlik.length, 2, 'iş emri başına');
    assert.ok(hazirlik.every((x) => x.sorumlu_kisi_id === kalite.id && x.kanit_zorunlu), 'hazırlık görevi dağıtılan atama ve kanıtla');
    const ayrinti = (await oku(kalite, `/projeler/gorevler/${hazirlik[0]?.id ?? 0}/ayrinti`)).json<GorevAyrintisiCevabi>();
    assert.deepEqual(ayrinti.adimlar.map((a) => a.ad), ['Program yaz'], 'kalemin adımları hazırlık görevine geçer');
    const don = await vt().tek<{ kalemler: { ad: string; yapanKisiId: number | null; kanitZorunlu: boolean }[] }>('SELECT kalemler FROM projeler_proje_sablonu WHERE proje_id = $1', [hedefProjesi]);
    assert.deepEqual(don?.kalemler.map((k) => [k.ad, k.yapanKisiId, k.kanitZorunlu]), [
      ['İlk parça ölçümü', kalite.id, true], ['Boru kesimi', null, false], ['CNC programı', kalite.id, true],
    ], 'düzenlenen satırlar donar, dışarıda kalan donmaz');

    const tekrar = await gonder(planlama, `/projeler/${hedefProjesi}/dagit`, { sablonId: o.sablonId });
    assert.equal(tekrar.statusCode, 409, tekrar.body);
    const sonra = (await oku(planlama, `/projeler/${hedefProjesi}/dagitim`)).json<DagitimCevabi>();
    assert.equal(sonra.dagitildi, true);
    assert.equal(sonra.sablonlar.find((x) => x.id === o.sablonId)?.dagitildi, true);
    assert.equal(sonra.sablonId, null, 'dağıtılmış varsayılan yeniden önerilmez');
    assert.ok(!(await oku(planlama, '/projeler/dagitim/bekleyenler')).json<DagitilmamisCevabi>().projeler.some((p) => p.id === hedefProjesi));
    const zil = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = 'projeler.gorev-atandi'", [kalite.id]);
    assert.ok((zil?.n ?? 0) >= 1, 'atanan kişiye bildirim');
  });

  test('sonra gelen emirde hazırlık görevi dağıtılan hâliyle doğar; dağıtılmamış şablon hazırlık ekranından açılmaz (Risk K2)', async () => {
    const yeniEmir = { emriId: EMIR + 1, emirNo: 'ORN-UE-2', isEmirleri: [] };
    const r = await vt().tx((db) => hazirlikGorevleriAc(db, yonetici.id, {
      projeId: hedefProjesi, sablonId: null, hedefler: [yeniEmir], maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }]]), tarih: { baslangic: null, bitis: null },
    }));
    assert.equal(r.eklenen, 1);
    const g = await vt().tek<{ sorumlu_kisi_id: number | null; kanit_zorunlu: boolean }>('SELECT sorumlu_kisi_id, kanit_zorunlu FROM projeler_gorev WHERE hazirlik_emri_id = $1', [EMIR + 1]);
    assert.deepEqual([g?.sorumlu_kisi_id, g?.kanit_zorunlu], [kalite.id, true]);

    const baska = await sablonAc('Tekrar sipariş', false);
    const ac = (deneme: boolean) => vt().tx((db) => hazirlikGorevleriAc(db, yonetici.id, {
      projeId: hedefProjesi, sablonId: baska.id, hedefler: [{ emriId: EMIR + 2, emirNo: 'ORN-UE-3', isEmirleri: [] }],
      maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }]]), tarih: { baslangic: null, bitis: null },
    }, deneme));
    assert.equal((await ac(true)).plan.length, 1, 'deneme dağıtılmamış şablonu önizler');
    await assert.rejects(ac(false), (h: Error) => h.message === SABLON_DAGITILMADI);
  });

  test('Risk K1: yedek kontrollü satırda kontrol kaldırılınca yedek de düşer; proje görevi açılır, sonra gelen emirde hazırlık görevi doğar', async () => {
    const p = await projeAc();
    const c = await gonder(yonetici, '/projeler/sablonlar', {
      ad: 'Yedekli', varsayilan: false, etkin: true, kalemler: [
        { ad: 'Kontrollü iş', dayanak: 'baslangic', gun: 0, sureGun: 1, yapanRolId: rolId('kalite'), kontrolRolId: rolId('planlama_proje'), yedekKontrolKisiId: yonetici.id },
        { ad: 'Kontrollü CNC', dayanak: 'baslangic', gun: 0, sureGun: 1, yapanRolId: rolId('kalite'), kontrolRolId: rolId('planlama_proje'), yedekKontrolKisiId: yonetici.id, hazirlikMaddesi: 'cnc' },
      ],
    });
    assert.equal(c.statusCode, 200, c.body);
    const s = c.json<SablonListesiCevabi>().sablonlar.find((x) => x.ad === 'Yedekli')!;
    const satirlar = s.kalemler.map((k) => ({
      kalemId: k.id, dahil: true, yapanKisiId: null, yapanRolId: rolId('kalite'), kontrolKisiId: null, kontrolRolId: null, planBitis: '2026-12-03', kanitZorunlu: false,
    }));
    const hepsiDisarida = await gonder(planlama, `/projeler/${p}/dagit`, { sablonId: s.id, satirlar: satirlar.map((x) => ({ ...x, dahil: false })) });
    assert.equal(hepsiDisarida.statusCode, 400, 'bütün satırlar dışarıda ve özel görev yokken dağıtılmaz (şablon dağıtılmış sayılmaz)');
    const yabanci = await gonder(planlama, `/projeler/${p}/dagit`, { sablonId: s.id, satirlar: [{ ...satirlar[0]!, kalemId: 2147483000 }] });
    assert.equal(yabanci.statusCode, 400, 'şablonda olmayan satır');
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_proje_sablonu WHERE proje_id = $1', [p]))?.n, 0);
    const d = await gonder(planlama, `/projeler/${p}/dagit`, { sablonId: s.id, satirlar });
    assert.equal(d.statusCode, 200, d.body);
    const yedek = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM projeler_gorev WHERE proje_id = $1 AND yedek_kontrol_kisi_id IS NOT NULL', [p]);
    assert.equal(yedek?.n, 0);
    const r = await vt().tx((db) => hazirlikGorevleriAc(db, yonetici.id, {
      projeId: p, sablonId: null, hedefler: [{ emriId: EMIR + 9, emirNo: 'ORN-UE-9', isEmirleri: [] }],
      maddeler: new Map([['cnc', { ad: 'CNC kurulumu', isEmriDuzeyi: true }]]), tarih: { baslangic: null, bitis: null },
    }));
    assert.equal(r.eklenen, 1, 'donan satır emir açılışını durdurmaz');
  });

  test('şablonsuz yalnız özel görevle dağıtılır; boş dağıtım 400; kapalı projede 400', async () => {
    const p = await projeAc();
    assert.equal((await gonder(planlama, `/projeler/${p}/dagit`, { sablonId: null })).statusCode, 400);
    const c = await gonder(planlama, `/projeler/${p}/dagit`, {
      sablonId: null, ozel: [{ ad: 'Tek görev', yapanKisiId: kalite.id, yapanRolId: null, kontrolKisiId: null, kontrolRolId: null, planBitis: '2026-12-05', kanitZorunlu: false }],
    });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<DagitCevabi>(), { projeGorevi: 1, hazirlikGorevi: 0 });
    await vt().sorgu("UPDATE projeler_proje SET durum = 'tamamlandi' WHERE id = $1", [p]);
    assert.equal((await gonder(planlama, `/projeler/${p}/dagit`, { sablonId: null, ozel: [{ ad: 'Geç', yapanKisiId: null, yapanRolId: null, kontrolKisiId: null, kontrolRolId: null, planBitis: '2026-12-05', kanitZorunlu: false }] })).statusCode, 400);
  });
});
