import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { turListesiCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { TurListesiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { cikisOnerisi, sktGecmisMi, sktGirisEngeli } from './kurallar.ts';

// 2099: lotun son kullanma tarihi (2099-2 c ayrı tablo, 2099-3 b kart işareti, 2099-4 a FEFO, 2099-5 a müdür onayı) ve tür listeleri (2099-6 a).
const s = (bakiyeId: number, ilkGiris: string, sonKullanma: string | null, miktar = '5') => ({
  bakiyeId, konumId: 1, konumKod: 'R1', konumTur: 'raf', partiId: bakiyeId, partiEtiketi: null, miktar, ilkGiris, sonKullanma,
});

describe('stok SKT kuralları (saf)', () => {
  test('FEFO: tarihli lot önce, önce bozulan önce; tarihsiz lot sonra ilk giriş sırasıyla; geçmiş lot önerilmez', () => {
    const o = cikisOnerisi([
      s(1, '2026-01-01T00:00:00Z', null), s(2, '2026-03-01T00:00:00Z', '2027-06-01'), s(3, '2026-05-01T00:00:00Z', '2027-01-01'), s(4, '2025-01-01T00:00:00Z', '2026-10-01'),
    ], '12', '2026-11-04');
    assert.deepEqual(o.oneriler.map((x) => [x.bakiyeId, x.miktar]), [[3, '5'], [2, '5'], [1, '2']]);
    assert.equal(o.mevcut, '15', 'geçmiş lot mevcuda sayılmaz');
  });
  test('tarih verilmezse sıra ilk girişe göredir (SKT takipsiz kart FIFO kalır)', () => {
    const o = cikisOnerisi([s(1, '2026-05-01T00:00:00Z', null), s(2, '2026-01-01T00:00:00Z', null)], '1');
    assert.deepEqual(o.oneriler.map((x) => x.bakiyeId), [2]);
  });
  test('geçmiş: bugünden önceki tarih; bugün geçerli; tarihsiz geçmiş sayılmaz', () => {
    assert.equal(sktGecmisMi('2026-11-03', '2026-11-04'), true);
    assert.equal(sktGecmisMi('2026-11-04', '2026-11-04'), false);
    assert.equal(sktGecmisMi(null, '2026-11-04'), false);
  });
  test('mal kabul engeli: takipli kartta tarih zorunlu; var olan lotun tarihi farklıysa red', () => {
    assert.match(sktGirisEngeli({ takipli: true, sonKullanma: null, lotunki: null }) ?? '', /takipli/);
    assert.equal(sktGirisEngeli({ takipli: true, sonKullanma: null, lotunki: '2027-01-01' }), null, 'tarihli lota eklenen satır');
    assert.equal(sktGirisEngeli({ takipli: false, sonKullanma: null, lotunki: null }), null);
    assert.match(sktGirisEngeli({ takipli: true, sonKullanma: '2027-02-01', lotunki: '2027-01-01' }) ?? '', /2027-01-01/);
    assert.equal(sktGirisEngeli({ takipli: true, sonKullanma: '2027-01-01', lotunki: '2027-01-01' }), null);
  });
});

const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.cikis'], mudur: ['stok.giris', 'stok.cikis'] };
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; ayrinti?: { sonKullanma?: string | null; sktOnayi?: boolean } }

describe('stok SKT ve tür listeleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  let sira = 0;
  async function kart(g: Record<string, unknown>, skt: boolean): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['SKT-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'SKT-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`skt-dnm-${sira}`, sira, JSON.stringify({ id: `skt-dnm-${sira}`, com: { ad: `SKT deneme ${sira}`, ...(skt ? { skt: true } : {}) }, g }), kisiler.get('yonetici')],
    );
    return r!.no;
  }
  const kabul = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const sonParti = async (malzemeId: number): Promise<number> =>
    (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [malzemeId]))!.id;
  const tarih = async (partiId: number): Promise<string | null> =>
    (await o().vt.tek<{ t: string }>('SELECT son_kullanma AS t FROM stok_parti_son_kullanma WHERE parti_id = $1', [partiId]))?.t ?? null;
  const malKabul = (kim: string, malzemeId: number, miktar: string, sonKullanma?: string) =>
    istek<Hata>(kim, 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar, ...(sonKullanma ? { sonKullanma } : {}) }] });

  before(async () => {
    ortam = await testVeritabaniKur('stok_skt');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'mudur']) await kisiEkle(rol, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('göç: stok.skt-onayla yalnız müdür rolündedir', async () => {
    const r = await o().vt.sorgu<{ kod: string }>("SELECT r.kod FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE ri.islem = 'stok.skt-onayla' ORDER BY r.kod");
    assert.deepEqual(r.map((x) => x.kod), ['genel_mudur', 'genel_mudur_yardimcisi', 'mudur']);
  });

  test('mal kabul: takipli kart tarihsiz girmez; tarihle lot açılır ve tarih lota yazılır; takipsiz kart tarihsiz girer', async () => {
    const k = await kart({ kat: 'kimyasal', marka: 'Deneme marka' }, true);
    const red = await malKabul('depo', k, '2');
    assert.equal(red.durum, 400, JSON.stringify(red.govde));
    const ok = await malKabul('depo', k, '2', '2027-03-01');
    assert.equal(ok.durum, 200, JSON.stringify(ok.govde));
    assert.equal(await tarih(await sonParti(k)), '2027-03-01');
    const t = await kart({ kat: 'takim', cap: 10 }, false);
    assert.equal((await malKabul('depo', t, '1')).durum, 200);
  });

  test('geçmiş SKT: onaysız çıkış ONAY_GEREKLI; depocunun onayı 403; müdür onayıyla çıkar ve not harekette kalır', async () => {
    const k = await kart({ kat: 'kimyasal' }, true);
    assert.equal((await malKabul('depo', k, '3', '2020-01-01')).durum, 200);
    const parti = await sonParti(k);
    const govde = { malzemeId: k, konumId: await kabul(), partiId: parti, miktar: '1', cikisNedeni: 'numune' };
    const red = await istek<Hata>('depo', 'POST', '/stok/cikis', govde);
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.equal(red.govde.kod, 'ONAY_GEREKLI');
    assert.deepEqual([red.govde.ayrinti?.sktOnayi, red.govde.ayrinti?.sonKullanma], [true, '2020-01-01']);
    assert.equal((await istek('depo', 'POST', '/stok/cikis', { ...govde, sktOnay: true })).durum, 403);
    const onay = await istek<{ hareketIdler?: number[] }>('mudur', 'POST', '/stok/cikis', { ...govde, sktOnay: true });
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    const h = await o().vt.tek<{ aciklama: string | null }>("SELECT aciklama FROM stok_hareketi WHERE parti_id = $1 AND tur = 'cikis' ORDER BY id DESC LIMIT 1", [parti]);
    assert.match(h?.aciklama ?? '', /SKT 2020-01-01 geçmiş/);
  });

  test('SKT düzeltmesi: yalnız müdür; ilk kayıt ve sürümlü düzeltme; eski ve yeni tarih defterde', async () => {
    const k = await kart({ kat: 'kimyasal' }, true);
    assert.equal((await malKabul('depo', k, '1', '2027-05-01')).durum, 200);
    const parti = await sonParti(k);
    const yol = `/stok/partiler/${parti}/son-kullanma`;
    assert.equal((await istek('depo', 'POST', yol, { sonKullanma: '2027-06-01', surum: 1 })).durum, 403);
    assert.equal((await istek('mudur', 'POST', yol, { sonKullanma: '2027-06-01', surum: null })).durum, 409, 'kaydı olan lotta sürümsüz düzeltme çakışır');
    const d = await istek<{ surum: number }>('mudur', 'POST', yol, { sonKullanma: '2027-06-01', surum: 1 });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(d.govde.surum, 2);
    assert.equal(await tarih(parti), '2027-06-01');
    assert.equal((await istek('mudur', 'POST', yol, { sonKullanma: '2027-07-01', surum: 1 })).durum, 409, 'eski sürüm');
    // Tekrar koruması: aynı istek kimliğiyle yinelenen düzeltme ikinci kez uygulanmaz, ilk cevap döner; kimliksiz yazma 400.
    const kimlik = randomUUID();
    const gonder = (istekKimligi: string | null) => app.inject({
      method: 'POST', url: `/api${yol}`, payload: { sonKullanma: '2027-08-01', surum: 2 },
      headers: { cookie: cerezler.get('mudur') ?? '', ...(istekKimligi === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi }) },
    });
    const ilk = await gonder(kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.deepEqual((await gonder(kimlik)).json(), ilk.json());
    assert.equal(await o().vt.tek<{ surum: number }>('SELECT surum FROM stok_parti_son_kullanma WHERE parti_id = $1', [parti]).then((r) => r?.surum), 3);
    assert.equal((await gonder(null)).statusCode, 400);
    const defter = await o().sahip.sorgu<{ alanlar: Record<string, { eski: unknown; yeni: unknown }>; kisi_id: number | null }>(
      "SELECT alanlar, kisi_id FROM denetim_degisiklik WHERE tablo = 'stok_parti_son_kullanma' AND anahtar = $1::jsonb", [JSON.stringify({ parti_id: parti })]);
    assert.equal(defter.length, 2, 'iki düzeltme, yinelenen yazılmaz');
    assert.deepEqual(defter[0]?.alanlar.son_kullanma, { eski: '2027-05-01', yeni: '2027-06-01' });
    const takipsiz = await kart({ kat: 'kimyasal' }, false);
    assert.equal((await malKabul('depo', takipsiz, '1', '2027-01-01')).durum, 200);
    assert.equal((await istek('mudur', 'POST', `/stok/partiler/${await sonParti(takipsiz)}/son-kullanma`, { sonKullanma: '2027-02-01', surum: 1 })).durum, 422, 'takipsiz kart');
  });

  test('tür listesi: kategoriyle süzülür; kartın alanları, SKT özeti ve stok gelir; bilinmeyen liste 400', async () => {
    const k = await kart({ kat: 'kimyasal', marka: 'Liste marka', ambalaj: ['bidon'] }, true);
    assert.equal((await malKabul('depo', k, '4', '2020-02-01')).durum, 200);
    assert.equal((await malKabul('depo', k, '6', '2028-01-01')).durum, 200);
    const t = await kart({ kat: 'takim', cap: 12 }, false);
    const l = await istek<TurListesiCevabi>('depo', 'GET', '/stok/tur-listeleri/kimyasal');
    assert.equal(l.durum, 200, JSON.stringify(l.govde));
    turListesiCevabi.parse(l.govde);
    assert.equal(l.govde.bugun, tesisGunu(Date.now()));
    const satir = l.govde.satirlar.find((x) => x.malzemeId === k);
    assert.ok(satir, 'kimyasal kart listede');
    assert.deepEqual([satir.alanlar.marka, satir.alanlar.ambalaj, satir.sktTakipli, satir.enYakinSkt, satir.sktGecmisMiktar], ['Liste marka', ['bidon'], true, '2020-02-01', '4']);
    assert.ok(!l.govde.satirlar.some((x) => x.malzemeId === t), 'takım kartı kimyasal listesinde yok');
    const tl = await istek<TurListesiCevabi>('depo', 'GET', '/stok/tur-listeleri/takim');
    assert.equal(tl.govde.satirlar.find((x) => x.malzemeId === t)?.alanlar.cap, 12);
    assert.equal((await istek('depo', 'GET', '/stok/tur-listeleri/bilinmeyen')).durum, 400);
    assert.equal((await istek('oturumsuz', 'GET', '/stok/tur-listeleri/kimyasal')).durum, 401);
  });
});
