import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimSayimiYansitUyarili } from '../stok/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { adimAraHalleri, adimStatusu } from './disari.ts';
import { anaKayitYaz } from './test-ortak.ts';

// 2634 (Mimar N2, 2610-a): statünün taşıdığı kart iki yoldan çözülür. Önizleme (adimAraHalleri) belgeden ve stok koduyla, stok sayımı emrin
// adımlarından ve kimlikle. Bu dosya aynı revizyonla açılmış emirde iki yolun aynı kartı ve aynı statüyü verdiğini sabitler. Stok sayımı
// sunucudaki bağlarla koşar (test koşucusu kablolama'yı yükler; sahte çözücü yok). Revizyondan sonra açık kalan emir eski revizyonuyla sayılır;
// orada ayrışma beklenir ve ayrıca yazılmıştır. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('2634: önizlemenin ara hâl kartı stok sayımıyla aynı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operatorId = 0;
  let projeId = 0;
  let surum: number | null = null;
  let sira = 0;
  const harfler = new Map<number, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function kart(tur: 'hammadde' | 'yarimamul' | 'mamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['AHE-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'AHE-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`ahe-${String(sira)}`, tur, sira, JSON.stringify({ id: `ahe-${String(sira)}`, com: { ad: `Eşlik deneme ${String(sira)}`, birim: 'adet' } }), yoneticiId],
    ))!.no;
  }
  async function makine(): Promise<{ istasyon: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`AHM${String(sira)}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`AHI${String(sira)}`, `Deneme istasyon ${String(sira)}`, im!.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`AHK-${String(ist!.id)}`, 'Tezgah', ist!.id]);
    return { istasyon: ist!.id, makine: m!.id };
  }
  async function revizyon(urun: number, harf: string, adimlar: readonly Adim[]): Promise<number> {
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Torna', 'TAL') RETURNING id", [`AHT${String(++sira)}`]))!.id;
    const id = (await o().sahip.tek<{ id: number }>("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', $2, $3) RETURNING id", [urun, harf, yoneticiId]))!.id;
    // Rota modülünün tabloları sayımın ve önizlemenin okuduğu kaynaktır: adım, bileşen (ilk girdi), dal ve birleşen dallar.
    for (const [i, a] of adimlar.entries()) {
      await o().sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [urun, a.op, id]);
      const adim = (await o().sahip.tek<{ id: number }>(
        'INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id', [id, urun, a.op, i + 1, tip, `Adım ${String(a.op)}`]))!.id;
      if (a.girdi !== undefined) await o().sahip.sorgu('INSERT INTO rota_bileseni (adim_id, malzeme_id, miktar) VALUES ($1, $2, 1)', [adim, a.girdi]);
      const birlesen = (a.onculler ?? []).map((x) => adimlar.find((y) => y.op === x)?.dal).filter((d): d is string => d !== undefined);
      if (a.dal !== undefined || birlesen.length > 1) {
        await o().sahip.sorgu('INSERT INTO rota_adim_dali (adim_id, dal, birlesen) VALUES ($1, $2, $3)', [adim, a.dal ?? null, birlesen.length > 1 ? birlesen : []]);
      }
    }
    await o().sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onay_bekliyor', gonderen_kisi_id = $2, gonderme = now() WHERE id = $1", [id, yoneticiId]);
    await o().sahip.sorgu("UPDATE rota_revizyonu SET durum = 'onayli', onaylayan_kisi_id = $2, onaylama = now(), dort_gozsuz_onay = true WHERE id = $1", [id, yoneticiId]);
    await o().sahip.sorgu(
      "UPDATE rota_revizyonu SET durum = 'onayli' WHERE malzeme_id = $1 AND durum = 'yururlukte'", [urun]);
    await o().sahip.sorgu("UPDATE rota_revizyonu SET durum = 'yururlukte', yururluge_alan_kisi_id = $2, yururluge_alma = now() WHERE id = $1", [id, yoneticiId]);
    return id;
  }

  // Belgede ve emirde aynı rota: adım başına girdiler (ilk girdi taşınandır), çıktı kartı, dal ve öncüller.
  interface Adim { op: number; girdi?: number; cikti?: number; dal?: string; onculler?: number[] }
  async function kur(urun: number, adimlar: readonly Adim[], kartlar: readonly { id: number; tur: 'ham' | 'yari' | 'mamul' }[]) {
    const k = String(urun);
    const seq = new Map(adimlar.map((a, i) => [a.op, i + 1]));
    const belgeAdimi = (a: Adim) => ({
      id: `${k}-o${String(a.op)}`, opNo: a.op, seq: seq.get(a.op),
      ...(a.girdi === undefined ? {} : { ins: [{ itemId: String(a.girdi), qty: 1 }] }),
      ...(a.cikti === undefined ? {} : { outItem: String(a.cikti) }),
      ...(a.dal === undefined ? {} : { dal: a.dal }),
      ...(a.onculler === undefined ? {} : { onculler: a.onculler.map((x) => ({ seq: seq.get(x) })) }),
    });
    const harf = String.fromCharCode(65 + (harfler.get(urun) ?? 0));
    harfler.set(urun, (harfler.get(urun) ?? 0) + 1);
    const rev = await revizyon(urun, harf, adimlar);
    surum = await anaKayitYaz(o().vt, {
      items: [{ id: k, code: `AHE-U${k}`, type: 'mamul' }, ...kartlar.map((x) => ({ id: String(x.id), code: `AHE-K${String(x.id)}`, type: x.tur }))],
      opdefs: [{ id: 'op1', name: 'Torna' }],
      routes: { [k]: { steps: adimlar.map(belgeAdimi) } },
      routeRevs: [{ id: String(rev), itemId: k, status: 'yururlukte', data: { steps: adimlar.filter((a) => a.cikti !== undefined).map(belgeAdimi) } }],
    }, surum);
    return rev;
  }
  async function emirAc(urun: number, rev: number, adimlar: readonly Adim[]) {
    const m = await makine();
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`AHE${String(++sira)}`]))!.id;
    const isEmirleri: IsEmriGirdisi[] = adimlar.map((a, i) => ({
      sira: i + 1, opNo: a.op, ad: `Adım ${String(a.op)}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: m.makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      bilesenler: a.girdi === undefined ? [] : [{ malzemeNo: a.girdi, miktar: '1' }],
      ...(a.dal === undefined && a.onculler === undefined ? {} : {
        dal: a.dal ?? null, onculler: (a.onculler ?? []).map((x) => ({ opNo: x, tur: 'bekleyen' as const, devirAdedi: null })),
      }),
    }));
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, planlamaci, { projeId, malzemeNo: urun, adet: 1, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri }));
    const ie = new Map((await o().vt.sorgu<{ id: number; op_no: number }>('SELECT id, op_no FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [uretimEmriId])).map((x) => [x.op_no, x.id]));
    return { e: uretimEmriId, ie, istasyon: m.istasyon };
  }
  // Stok sayımının yolu: adımın bir sağlam sayımı; statülü adımda artı bakiyesi o statüde açılan malzeme taşınandır.
  async function stoktakiKart(em: Awaited<ReturnType<typeof emirAc>>, urun: number, op: number): Promise<{ kart: number | null; statu: number | null }> {
    await o().vt.tx((db) => uretimSayimiYansitUyarili(db, { uretimEmriId: em.e, isEmriId: em.ie.get(op)!, istasyonId: em.istasyon, kisiId: operatorId, fark: '1' }));
    const statu = await o().vt.tx((db) => adimStatusu(db, { malzemeNo: urun, opNo: op, uretimEmriId: em.e }));
    if (statu === null) return { kart: null, statu: null };
    const satir = await o().vt.tek<{ malzeme_id: number }>('SELECT malzeme_id FROM stok_bakiye WHERE statu_id = $1 AND miktar > 0', [statu]);
    return { kart: satir?.malzeme_id ?? null, statu };
  }
  async function onizlemedekiKart(urun: number, rev: number, op: number): Promise<{ kart: number | null; statu: number | null }> {
    const h = (await o().vt.tx((db) => adimAraHalleri(db, { malzemeNo: urun, revizyonId: rev, opNolari: [op] }))).get(op);
    return { kart: h?.kartId ?? null, statu: h?.statu?.id ?? null };
  }
  // Statülü ara adımlar sırayla sayılır (önceki adımın çıktısı ya da statüsü sonrakinin girdisidir); karşılaştırma her statülü adımda.
  async function karsilastir(urun: number, adimlar: readonly Adim[], beklenen: Record<number, number>) {
    const rev = await kur(urun, adimlar, kartlarOf(adimlar));
    const em = await emirAc(urun, rev, adimlar);
    for (const a of adimlar.slice(0, -1)) {
      const stok = await stoktakiKart(em, urun, a.op);
      if (a.cikti !== undefined) continue;
      const onizleme = await onizlemedekiKart(urun, rev, a.op);
      assert.deepEqual(onizleme, stok, `OP ${String(a.op)}: önizleme ve stok sayımı aynı kartı ve statüyü verir`);
      assert.equal(stok.kart, beklenen[a.op], `OP ${String(a.op)}: taşınan kart`);
    }
  }
  const turler = new Map<number, 'ham' | 'yari' | 'mamul'>();
  const kartlarOf = (adimlar: readonly Adim[]) =>
    [...new Set(adimlar.flatMap((a) => [a.girdi, a.cikti]).filter((x): x is number => x !== undefined))].map((id) => ({ id, tur: turler.get(id)! }));
  const yeniKart = async (tur: 'hammadde' | 'yarimamul'): Promise<number> => {
    const id = await kart(tur);
    turler.set(id, tur === 'hammadde' ? 'ham' : 'yari');
    return id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_ara_hal_eslik');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    operatorId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Operatör', kullaniciAdi: 'operator', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('AHE.ESLIK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('düz rota: ilk adım ilk girdiyi taşır; kartlı adımdan sonraki statülü adım o kartı taşır (Atölye d)', async () => {
    const [urun, hm, ym] = [await kart('mamul'), await yeniKart('hammadde'), await yeniKart('yarimamul')];
    await karsilastir(urun, [{ op: 10, girdi: hm }, { op: 20, cikti: ym }, { op: 30 }, { op: 40 }], { 10: hm, 30: ym });
  });

  test('yarı mamulle başlayan adım o yarı mamulü taşır (Atölye c)', async () => {
    const [urun, ym] = [await kart('mamul'), await yeniKart('yarimamul')];
    await karsilastir(urun, [{ op: 10, girdi: ym }, { op: 20 }, { op: 30 }], { 10: ym, 20: ym });
  });

  test('aynı hammaddeyle başlayan paralel dallar ikisi de o hammaddeyi taşır; birleştirme ürünü taşır (Atölye a, 2549)', async () => {
    const [urun, hm] = [await kart('mamul'), await yeniKart('hammadde')];
    await karsilastir(urun, [
      { op: 10, girdi: hm, dal: 'A', onculler: [] }, { op: 20, girdi: hm, dal: 'B', onculler: [] },
      { op: 30, onculler: [10, 20] }, { op: 40, onculler: [30] },
    ], { 10: hm, 20: hm, 30: urun });
  });

  test('birleşmeden önceki ara adım dalının hammaddesini taşır (Atölye b, 2554)', async () => {
    const [urun, hm1, hm2] = [await kart('mamul'), await yeniKart('hammadde'), await yeniKart('hammadde')];
    await karsilastir(urun, [
      { op: 10, girdi: hm1, dal: 'A', onculler: [] }, { op: 15, dal: 'A', onculler: [10] }, { op: 20, girdi: hm2, dal: 'B', onculler: [] },
      { op: 30, onculler: [15, 20] }, { op: 40, onculler: [30] },
    ], { 10: hm1, 15: hm1, 20: hm2, 30: urun });
  });

  test('revizyondan sonra açık kalan emir: stok emrin eski revizyonuyla sayar, önizleme yeniyi gösterir; ayrışma beklenir (Mimar T2)', async () => {
    const [urun, hm1, hm2] = [await kart('mamul'), await yeniKart('hammadde'), await yeniKart('hammadde')];
    const eski = [{ op: 10, girdi: hm1 }, { op: 20 }] as const;
    const revA = await kur(urun, eski, kartlarOf(eski));
    const em = await emirAc(urun, revA, eski);
    const yeni = [{ op: 10, girdi: hm2 }, { op: 20 }] as const;
    const revB = await kur(urun, yeni, kartlarOf(yeni));
    const stok = await stoktakiKart(em, urun, 10);
    const onizleme = await onizlemedekiKart(urun, revB, 10);
    assert.equal(stok.kart, hm1, 'açık emir donmuş revizyonunun girdisini taşır');
    assert.equal(onizleme.kart, hm2, 'önizleme yürürlükteki revizyonu gösterir');
  });
});
