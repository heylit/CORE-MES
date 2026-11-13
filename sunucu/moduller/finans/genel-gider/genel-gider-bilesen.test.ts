import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Db } from '#cekirdek/db.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { tekrarDeposu } from '../../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { belgelerinSiparisleri, dolayliPersonelCozucusu, emilmeyenDogrudanCozucusu, genelGiderOraniCozucusu, projeMasrafiCozucusu, stokCikisiCozucusu } from '../disari.ts';
import { genelGiderOnerisi } from './servis.ts';
import type { GenelGiderOnerisi } from './servis.ts';

// Tutarlar ve adlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const AY = '2026-10';
interface Cevap<T = unknown> { durum: number; govde: T }

function cozuculeriKaldir(): void {
  genelGiderOraniCozucusu(null); projeMasrafiCozucusu(null); dolayliPersonelCozucusu(null); emilmeyenDogrudanCozucusu(null); stokCikisiCozucusu(null);
}

describe('2594 b genel gider bileşenleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let firmaId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const b: Record<string, number> = {};
  const cagri = { oran: 0, proje: 0, oranIdleri: [] as number[] };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (yontem === 'POST' && yol.endsWith('/belgeden-ekle')) basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    await vt().tx(async (db) => { const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }); await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id); });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const belge = async (ad: string, kategori: string, tutar: number, o: { kur?: number; tarih?: string; siparis?: { talepId: string; teklifId: string }; iptal?: boolean } = {}) => {
    const r = await vt().tek<{ id: number }>(
      `INSERT INTO finans_belge (yon, tur, kategori, firma_id, belge_no, belge_tarihi, vade, para_birimi, kur, tutar, kdv_orani, olusturan_id, satin_alma_talep_id, satin_alma_teklif_id)
       VALUES ('gider', 'fatura', $1, $2, $3, $4, $4, $5, $6, $7, 20, $8, $9, $10) RETURNING id`,
      [kategori, firmaId, ad, o.tarih ?? `${AY}-10`, (o.kur ?? 1) === 1 ? 'TRY' : 'EUR', o.kur ?? 1, tutar, yoneticiId, o.siparis?.talepId ?? null, o.siparis?.teklifId ?? null]);
    if (o.iptal) await vt().sorgu("UPDATE finans_belge SET durum = 'iptal', iptal_eden_id = $2, iptal_zamani = now(), iptal_nedeni = 'deneme' WHERE id = $1", [r!.id, yoneticiId]);
    b[ad] = r!.id;
  };
  const siparis = async (sira: number) => {
    const [talepId, teklifId] = [randomUUID(), randomUUID()];
    await vt().sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $3, 'Deneme talep', $2, $2, 'siparis_verildi')", [talepId, yoneticiId, sira]);
    await vt().sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, $2, 'TRY', current_date)", [talepId, teklifId]);
    await vt().sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [talepId]);
    await vt().sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [talepId, teklifId]);
    return { talepId, teklifId };
  };
  const hepsiniKaydet = (o: { dolayli?: number | null; kucuk?: boolean; emilmeyen?: number; emilmeyenKucuk?: boolean } = {}): void => {
    genelGiderOraniCozucusu(async (_db: Db, idler) => {
      cagri.oran += 1; cagri.oranIdleri = [...idler];
      return new Map(idler.filter((i) => i !== b.sip_bilinmiyor).map((i) => [i, { oran: i === b.sip_karisik ? 80 / 180 : i === b.sip_bos ? null : 0, esleme: i === b.sip_karisik ? 'kismi' as const : 'tam' as const }]));
    });
    projeMasrafiCozucusu(async (_db: Db, idler) => { cagri.proje += 1; return new Set(idler.filter((i) => i === b.proje_lojistik)); });
    dolayliPersonelCozucusu(async () => ({ tutar: o.dolayli === undefined ? 5000 : o.dolayli, kucuk: o.kucuk === true, eksik: o.dolayli === null ? ['işaretlenmemiş departman: Kalite'] : [] }));
    // Fazla emilim: eksi değer kırpılmaz (2659, Maliyet 2).
    emilmeyenDogrudanCozucusu(async () => ({ tutar: o.emilmeyen ?? -250.004, kucuk: o.emilmeyenKucuk === true, eksik: [] }));
    stokCikisiCozucusu(async () => ({ tutar: 300, eksik: [] }));
  };

  before(async () => {
    ortam = await testVeritabaniKur('finansgenelgiderbilesen');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('yonetim', ['finans.oran-yaz', 'finans.maliyet-oku']);
    await girisliKisi('okuyan', ['finans.maliyet-oku']);
    firmaId = (await vt().tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Firma', 'ikisi', $1) RETURNING id", [yoneticiId]))!.id;
    // 2643 b: eşikten önce açılan siparişli belge eski.
    await belge('sip_eski', 'mal_alimi', 900, { siparis: await siparis(1) });
    await vt().sorgu("UPDATE finans_ayar SET genel_gider_belge_esigi = now() + interval '1 millisecond' WHERE id = 1");
    await new Promise((r) => setTimeout(r, 5));
    await belge('kira', 'kira', 10000);
    await belge('kira_iptal', 'kira', 7777, { iptal: true });
    await belge('enerji', 'enerji', 2000);
    await belge('lojistik_eur', 'lojistik', 100, { kur: 35 });
    await belge('elle_mal', 'mal_alimi', 400);
    await belge('proje_lojistik', 'lojistik', 1500);
    await belge('faiz', 'faiz', 600);
    await belge('baska_ay', 'kira', 4444, { tarih: '2026-09-30' });
    await belge('sip_karisik', 'mal_alimi', 180, { siparis: await siparis(2) });
    await belge('sip_uretim', 'mal_alimi', 1000, { siparis: await siparis(3) });
    await belge('sip_bos', 'mal_alimi', 50, { siparis: await siparis(4) });
    await belge('sip_bilinmiyor', 'mal_alimi', 70, { siparis: await siparis(5) });
    // Amortisman: TL, 120 ay, kalıntısız 120.000 -> aylık 1.000.
    await vt().sorgu(
      `INSERT INTO finans_sabit_kiymet (ad, para_birimi, bedel, kur, alis_tarihi, omur_ay, yontem, kalinti_degeri, olusturan_id)
       VALUES ('Deneme tezgah', 'TRY', 120000, 1, '2026-01-01', 120, 'normal', 0, $1)`, [yoneticiId]);
  });
  afterEach(() => { cozuculeriKaldir(); cagri.oran = 0; cagri.proje = 0; });
  after(async () => { cozuculeriKaldir(); await ortam?.kaldir(); });

  test('2594 b: bileşenler belgelerden; iptal, başka ay ve kategori dışı girmez; siparişli belge oranla; çözücüler birer kez', async () => {
    hepsiniKaydet();
    const o = await vt().tx((db) => genelGiderOnerisi(db, AY));
    assert.deepEqual(o.bilesenler, {
      // kira 10.000 (iptal ve eylül hariç); amortisman 1.000; diğer = enerji 2.000 + lojistik 100 x 35 + elle mal alımı 400 (2621 2/3 b)
      // + stok 300 (araç bileşeni yok, 2711 b); proje masrafı lojistik dışarıda. Siparişli: 180 x 80/180 = 80; 1.000 x 0 = 0.
      kira: 10000, amortisman: 1000, dolayliPersonel: 5000, emilmeyenDogrudan: -250, diger: 6200, projesizSatinAlma: 80,
    });
    assert.equal(o.toplam, 22030);
    assert.equal(cagri.oran, 1);
    assert.equal(cagri.proje, 1);
    assert.deepEqual([...cagri.oranIdleri].sort((x, y) => x - y), [b.sip_karisik!, b.sip_uretim!, b.sip_bos!, b.sip_bilinmiyor!].sort((x, y) => x - y),
      'çözücüye yalnız eşikten sonraki, iptal olmayan siparişli belgeler sorulur');
    const neden = (n: string, k: string | null = null) => o.disarida.find((d) => d.neden === n && d.kategori === k);
    assert.deepEqual(neden('eski_belge'), { neden: 'eski_belge', kategori: null, tutar: 900, adet: 1 });
    assert.deepEqual(neden('uretime_giden_pay'), { neden: 'uretime_giden_pay', kategori: null, tutar: 1100, adet: 2 });
    assert.deepEqual(neden('oran_bilinmiyor'), { neden: 'oran_bilinmiyor', kategori: null, tutar: 120, adet: 2 });
    assert.deepEqual(neden('proje_masrafi', 'lojistik'), { neden: 'proje_masrafi', kategori: 'lojistik', tutar: 1500, adet: 1 });
    assert.deepEqual(neden('kategori', 'faiz'), { neden: 'kategori', kategori: 'faiz', tutar: 600, adet: 1 });
    assert.deepEqual(o.oraniBilinmeyen.sort(), ['sip_bilinmiyor', 'sip_bos']);
    assert.deepEqual(o.eksik, []);
    assert.deepEqual(o.uyarilar, []);
    assert.deepEqual(o.enAz, []);
    assert.equal(o.gizli, false);
    // Kira tek belge; diğerde döviz lojistik 3.500, belge toplamı 5.900'ün yarısından fazla (stok sayılmaz).
    assert.deepEqual(o.baskinBelgeler, [{ bilesen: 'kira', belge: 'kira', tutar: 10000 }, { bilesen: 'diger', belge: 'lojistik_eur', tutar: 3500 }]);
  });

  test('2626 2/2 a: çözücüsü olmayan kaynak bilinmiyor; sıfır sayılmaz, toplam null ve eksik listesi', async () => {
    const o: GenelGiderOnerisi = await vt().tx((db) => genelGiderOnerisi(db, AY));
    assert.equal(o.bilesenler.kira, null);
    assert.equal(o.bilesenler.diger, null);
    assert.equal(o.bilesenler.dolayliPersonel, null);
    assert.equal(o.bilesenler.projesizSatinAlma, null);
    assert.equal(o.bilesenler.amortisman, 1000);
    assert.equal(o.toplam, null);
    assert.equal(o.eksik.length, 5);
    assert.ok(!o.eksik.some((e) => e.includes('araç')), '2711 b: araç bileşeni yok');
    hepsiniKaydet({ dolayli: null });
    const o2 = await vt().tx((db) => genelGiderOnerisi(db, AY));
    assert.equal(o2.bilesenler.dolayliPersonel, null);
    assert.equal(o2.toplam, null);
  });

  test('2594 b uçları: öneri okunur; belgeden kayıt bileşenleri sunucuda hesaplar, bilinmeyen bileşende 422, elle ek açıklamasız 400', async () => {
    hepsiniKaydet();
    const oneri = await istek<GenelGiderOnerisi>('okuyan', 'GET', `/finans/genel-gider-oranlari/oneri?ay=${AY}`);
    assert.equal(oneri.durum, 200);
    assert.equal(oneri.govde.toplam, 22030);
    assert.equal((await istek('okuyan', 'POST', '/finans/genel-gider-oranlari/belgeden-ekle', { gecerlilikBaslangic: '2026-11-01', ay: AY, aylikMakineSaati: 400 })).durum, 403);
    assert.equal((await istek('yonetim', 'POST', '/finans/genel-gider-oranlari/belgeden-ekle', { gecerlilikBaslangic: '2026-11-01', ay: AY, aylikMakineSaati: 400, elleEk: 100 })).durum, 400, 'elle ek açıklamasız');
    const kayit = await istek<{ id: number }>('yonetim', 'POST', '/finans/genel-gider-oranlari/belgeden-ekle', { gecerlilikBaslangic: '2026-11-01', ay: AY, aylikMakineSaati: 400, elleEk: 20, aciklama: 'Belgesiz kalem' });
    assert.equal(kayit.durum, 200);
    const satir = await vt().tek<Record<string, unknown>>(
      `SELECT kaynak, aylik_genel_gider::text AS t, kira::text, amortisman::text, dolayli_personel::text AS d, diger::text, projesiz_satin_alma::text AS p, elle_ek::text AS e,
              emilmeyen_dogrudan::text AS em, amortisman_dahil AS ad, donem_baslangic::text AS bas, donem_bitis::text AS bit, eksik FROM finans_genel_gider_orani WHERE id = $1`, [kayit.govde.id]);
    assert.deepEqual(satir, { kaynak: 'belge', t: '22050.00', kira: '10000.00', amortisman: '1000.00', d: '5000.00', diger: '6200.00', p: '80.00', e: '20.00', em: '-250.00', ad: true,
      bas: '2026-10-01', bit: '2026-10-31', eksik: ['oranı bilinmeyen belge sip_bos', 'oranı bilinmeyen belge sip_bilinmiyor'] });
    // Fotoğraf: oran sonradan değişse de satır değişmez (yalnız ekleme).
    genelGiderOraniCozucusu(async (_db: Db, idler) => new Map(idler.map((i) => [i, { oran: 1, esleme: 'tam' as const }])));
    assert.equal((await vt().tek<{ t: string }>('SELECT aylik_genel_gider::text AS t FROM finans_genel_gider_orani WHERE id = $1', [kayit.govde.id]))?.t, '22050.00');
    const liste = await istek<{ satirlar: { id: number; kaynak: string; projesizSatinAlma: string | null }[] }>('okuyan', 'GET', '/finans/genel-gider-oranlari');
    assert.deepEqual(liste.govde.satirlar.filter((s) => s.id === kayit.govde.id).map((s) => [s.kaynak, s.projesizSatinAlma]), [['belge', '80.00']]);
    cozuculeriKaldir();
    hepsiniKaydet({ dolayli: null });
    const red = await istek<{ hata?: { ileti?: string } }>('yonetim', 'POST', '/finans/genel-gider-oranlari/belgeden-ekle', { gecerlilikBaslangic: '2026-11-02', ay: AY, aylikMakineSaati: 400 });
    assert.equal(red.durum, 422);
    assert.match(JSON.stringify(red.govde), /işaretlenmemiş departman: Kalite/);
  });

  test('2710 b: fiyatsız stok çıkışı tutarı düşürmez, öneride uyarı olur ve kaydı durdurmaz', async () => {
    hepsiniKaydet();
    stokCikisiCozucusu(async () => ({ tutar: 300, eksik: ['fiyatı bilinmeyen 2 çıkış'] }));
    const o = (await istek<GenelGiderOnerisi>('okuyan', 'GET', `/finans/genel-gider-oranlari/oneri?ay=${AY}`)).govde;
    assert.equal(o.bilesenler.diger, 6200);
    assert.equal(o.ayrinti.stokCikisi, 300);
    assert.equal(o.toplam, 22030);
    assert.deepEqual(o.eksik, []);
    assert.deepEqual(o.uyarilar, ['emirsiz stok çıkışı: fiyatı bilinmeyen 2 çıkış']);
    assert.deepEqual(o.enAz, ['diger'], 'tutar alt sınırdır');
    const kayit = await istek<{ id: number }>('yonetim', 'POST', '/finans/genel-gider-oranlari/belgeden-ekle', { gecerlilikBaslangic: '2026-11-04', ay: AY, aylikMakineSaati: 400 });
    assert.equal(kayit.durum, 200);
    const satir = await vt().tek<{ eksik: string[] }>('SELECT eksik FROM finans_genel_gider_orani WHERE id = $1', [kayit.govde.id]);
    assert.ok(satir!.eksik.includes('emirsiz stok çıkışı: fiyatı bilinmeyen 2 çıkış'), 'uyarı kayda yazılır');
    // Sağlayıcı tutarı bilemezse bileşen null, kayıt yine reddedilir (sıfır uydurulmaz).
    stokCikisiCozucusu(async () => ({ tutar: null, eksik: [] }));
    assert.equal((await vt().tx((db) => genelGiderOnerisi(db, AY))).bilesenler.diger, null);
  });

  test('2652 a, 2659: personel bileşenlerinden biri küçük grupsa ikisi ve toplam ekranda gizli; görünen iki sayının farkı dolaylı tutarı vermez; kayıt ayrı alan tutmaz, listede tutar gizli', async () => {
    const DOLAYLI = 4321.5;
    hepsiniKaydet({ dolayli: DOLAYLI, kucuk: true });
    const o = (await istek<GenelGiderOnerisi>('okuyan', 'GET', `/finans/genel-gider-oranlari/oneri?ay=${AY}`)).govde;
    assert.equal(o.gizli, true);
    assert.equal(o.bilesenler.dolayliPersonel, null);
    assert.equal(o.bilesenler.emilmeyenDogrudan, null, 'iki personel bileşeni birlikte gizlenir');
    assert.equal(o.toplam, null);
    const sayilar: number[] = [];
    const topla = (v: unknown): void => {
      if (typeof v === 'number') sayilar.push(v);
      else if (Array.isArray(v)) v.forEach(topla);
      else if (v !== null && typeof v === 'object') Object.values(v).forEach(topla);
    };
    topla(o);
    const GIZLILER = [DOLAYLI, -250, DOLAYLI - 250].map((v) => Math.round(v * 100));
    for (const x of sayilar) for (const y of sayilar) assert.ok(!GIZLILER.includes(Math.round((x - y) * 100)), `${x} - ${y}`);
    assert.ok(!sayilar.some((x) => GIZLILER.includes(Math.round(x * 100))));
    // Güvenlik 2659 K2: görünen bileşenlerin hiçbir alt kümesinin toplamı gizli değere eşit değil.
    const gorunen = [...Object.values(o.bilesenler), ...Object.values(o.ayrinti)].filter((v): v is number => v !== null);
    for (let m = 1; m < 1 << gorunen.length; m += 1) {
      const t = gorunen.reduce((a, v, i) => ((m >> i) & 1 ? a + v : a), 0);
      assert.ok(!GIZLILER.includes(Math.round(t * 100)));
    }
    const kayit = await istek<{ id: number }>('yonetim', 'POST', '/finans/genel-gider-oranlari/belgeden-ekle', { gecerlilikBaslangic: '2026-11-03', ay: AY, aylikMakineSaati: 400 });
    assert.equal(kayit.durum, 200);
    const satir = await vt().tek<{ t: string; d: string | null; g: boolean }>(
      'SELECT aylik_genel_gider::text AS t, dolayli_personel::text AS d, emilmeyen_dogrudan::text AS e, personel_gizli AS g FROM finans_genel_gider_orani WHERE id = $1', [kayit.govde.id]);
    assert.deepEqual(satir, { t: (17280 - 250 + DOLAYLI).toFixed(2), d: null, e: null, g: true }, 'hesapta gerçek değer kullanılır, ayrı alan yok');
    const liste = await istek<{ satirlar: { id: number; aylikGenelGider: string | null; saatBasi: string | null; gizli: boolean; dolayliPersonel: string | null }[] }>('okuyan', 'GET', '/finans/genel-gider-oranlari');
    assert.deepEqual(liste.govde.satirlar.filter((r) => r.id === kayit.govde.id).map((r) => [r.aylikGenelGider, r.saatBasi, r.gizli, r.dolayliPersonel]), [[null, null, true, null]]);
  });

  test('2642 b belgelerinSiparisleri: yalnız siparişli gider belgesi; kilitle aynı belgeye ikinci kilitli okumayı bekletir, kilitsiz okuma beklemez', async () => {
    const m = await vt().tx((db) => belgelerinSiparisleri(db, [b.sip_karisik!, b.kira!, b.sip_eski!]));
    assert.deepEqual([...m.keys()].sort((x, y) => x - y), [b.sip_eski!, b.sip_karisik!].sort((x, y) => x - y));
    assert.deepEqual({ ...m.get(b.sip_karisik!), talepId: '', teklifId: '' }, { id: b.sip_karisik, belgeNo: 'sip_karisik', firmaId, talepId: '', teklifId: '', kdvHaricTutar: '180.00', paraBirimi: 'TRY', iptal: false });
    let birakan: () => void = () => undefined;
    const bekle = new Promise<void>((r) => { birakan = r; });
    let kilitAlindi: () => void = () => undefined;
    const alindi = new Promise<void>((r) => { kilitAlindi = r; });
    const ilk = vt().tx(async (db) => { await belgelerinSiparisleri(db, [b.sip_karisik!], { kilitle: true }); kilitAlindi(); await bekle; });
    await alindi;
    try {
      const ikinci = await vt().tx(async (db) => {
        await db.sorgu("SET LOCAL lock_timeout = '300ms'");
        await belgelerinSiparisleri(db, [b.sip_karisik!], { kilitle: true });
        return 'alindi';
      }).catch((h: { code?: string; cause?: { code?: string } }) => h.code ?? h.cause?.code ?? String(h));
      assert.equal(ikinci, '55P03', 'ikinci kilitli okuma ilk işlem bitene kadar bekler (sıraya girer)');
      const kilitsiz = await vt().tx(async (db) => { await db.sorgu("SET LOCAL lock_timeout = '300ms'"); return (await belgelerinSiparisleri(db, [b.sip_karisik!])).size; });
      assert.equal(kilitsiz, 1, 'oran okuması kilitsizdir, beklemez');
    } finally { birakan(); await ilk; }
  });

  test('göç kısıtları: kaynak listesi, belge satırında toplam ve bileşenler, dönem sırası, elle ek açıklaması', async () => {
    const kisit = async (sql: string): Promise<string | null> => {
      try { await vt().sorgu(sql, [yoneticiId]); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String(h); }
    };
    const ekle = (alanlar: string, degerler: string) => kisit(
      `INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id${alanlar})
       VALUES ('2026-12-01', 100, 10, false, $1${degerler})`);
    assert.equal(await ekle(', kaynak', ", 'baska'"), 'finans_genel_gider_orani_kaynak');
    assert.equal(await ekle(', kaynak', ", 'belge'"), 'finans_genel_gider_orani_belge');
    const tam = ", kaynak, donem_baslangic, donem_bitis, kira, amortisman, dolayli_personel, diger, projesiz_satin_alma, elle_ek, emilmeyen_dogrudan";
    assert.equal(await ekle(tam, ", 'belge', '2026-10-01', '2026-10-31', 50, 0, 20, 20, 10, 0, 0"), null);
    assert.equal(await ekle(tam, ", 'belge', '2026-10-01', '2026-10-31', 50, 0, 20, 30, 10, 0, -10"), null, 'emilmeyen eksi olabilir');
    assert.equal(await ekle(tam, ", 'belge', '2026-10-01', '2026-10-31', 50, 0, 20, 20, 9, 0, 0"), 'finans_genel_gider_orani_belge', 'toplam tutmalı');
    assert.equal(await ekle(tam, ", 'belge', '2026-10-01', '2026-10-31', 50, 0, NULL, 40, 10, 0, 0"), 'finans_genel_gider_orani_belge', 'bilinmeyen bileşen sıfır sayılmaz');
    assert.equal(await ekle(tam + ', personel_gizli', ", 'belge', '2026-10-01', '2026-10-31', 50, 0, NULL, 40, 10, 0, 0, true"), 'finans_genel_gider_orani_belge', 'gizlide iki personel alanı da boş');
    assert.equal(await ekle(tam + ', personel_gizli', ", 'belge', '2026-10-01', '2026-10-31', 50, 0, NULL, 40, 10, 0, NULL, true"), null);
    assert.equal(await ekle(', personel_gizli', ', true'), 'finans_genel_gider_orani_gizli');
    assert.equal(await ekle(tam, ", 'belge', '2026-10-31', '2026-10-01', 50, 0, 20, 20, 10, 0, 0"), 'finans_genel_gider_orani_donem');
    assert.equal(await ekle(', elle_ek', ', 5'), 'finans_genel_gider_orani_elle_ek_aciklama');
    assert.equal(await ekle('', ''), null, 'eski elle satır biçimi geçerli kalır');
  });
});
