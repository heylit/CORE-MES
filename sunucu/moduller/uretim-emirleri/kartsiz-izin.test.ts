import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kartsizIzinCevabi } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import type { KartsizIzin } from '#paylasilan/sozlesme/kartsiz-izin.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { baslatmaDenetle, emirBaslat, uretimEmriAc } from './disari.ts';
import type { BaslatmaKarti, IsEmriGirdisi } from './disari.ts';
import { KARTSIZ_IZIN_BASKASI, KARTSIZ_IZIN_GECERSIZ, KARTSIZ_IZIN_GEREKCE_BIRDEN } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('kartsız başlatma izni (3771 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);
  const red = async (is: Promise<unknown>, ileti: string): Promise<void> => {
    await assert.rejects(is, (h: unknown) => h instanceof UygulamaHatasi && h.message === ileti);
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function izin(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<KartsizIzin> {
    const c = await istek<KartsizIzin>(ad, yontem, yol, govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return kartsizIzinCevabi.parse(c.govde);
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rol.id !== yoneticiRolu.id) {
        await rolAta(db, yoneticiId, yeni, rol.id);
        await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      }
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function makineliIstasyon(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KIM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KII${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KIMK${sayac}`, 'Tezgah', ist]))!.id;
  }
  const adim = (sira: number, makine: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (): Promise<{ id: number; ie: number }> => {
    const makine = await makineliIstasyon();
    const r = await tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(1, makine)], projeId,
    }));
    return { id: r.uretimEmriId, ie: r.isEmriIdleri[0]! };
  };
  const baslat = (ad: string, id: number, ie: number, kart: BaslatmaKarti) => tx((db) => emirBaslat(db, kim(ad), id, undefined, undefined, ie, kart));
  const bildirimSayisi = async (izinId: number, okunmamis: boolean): Promise<number> => Number((await o().sahip.tek<{ n: string }>(
    `SELECT count(*) AS n FROM bildirim_kaydi WHERE tur = 'uretim-emirleri.kartsiz-izin-istendi' AND yol = $1${okunmamis ? ' AND okundu IS NULL' : ''}`,
    [`/adim-durumu/kartsiz-izin/${izinId}`],
  ))!.n);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_kartsiz_izin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.KARTSIZ', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['operator2', 'operator'], ['mudur', 'uretim_muduru'], ['yetkili', 'yonetici']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KI-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KI-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ki-dnm-1', 'mamul', 'KI-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ki-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('operatör çağırır, yetkiliye bildirim gider; yetkili izin verir; iş izinle bir kez, yalnız o kişide başlar ve gerekçe izni verenle kayda geçer', async () => {
    const { id, ie } = await ac();
    const istenen = await izin('operator', 'POST', `/uretim-emirleri/${id}/kartsiz-izin-iste`, { isEmriId: ie });
    assert.equal(istenen.durum, 'bekliyor');
    assert.deepEqual([istenen.emir.id, istenen.adim?.id, istenen.isteyen.id], [id, ie, kim('operator').id]);
    assert.ok(istenen.gecerlilikBitis !== null && Date.parse(istenen.gecerlilikBitis) - Date.parse(istenen.istekAn) === 10 * 60_000, 'cevap süresi 10 dakika');
    assert.ok((await bildirimSayisi(istenen.id, true)) >= 1, 'izin verebilene bildirim');
    assert.equal(Number((await o().sahip.tek<{ n: string }>(
      "SELECT count(*) AS n FROM bildirim_kaydi WHERE tur = 'uretim-emirleri.kartsiz-izin-istendi' AND kisi_id = $1", [kim('operator').id]))!.n), 0, 'isteyen almaz');

    assert.equal((await istek('operator2', 'GET', `/uretim-emirleri/kartsiz-izinler/${istenen.id}`)).durum, 404, 'başkasının isteği görünmez');
    assert.equal((await istek('operator', 'POST', `/uretim-emirleri/kartsiz-izinler/${istenen.id}/karar`, { sonuc: 'izin', gerekce: 'x' })).durum, 403, 'operatör izin veremez');
    assert.equal((await istek('mudur', 'POST', `/uretim-emirleri/kartsiz-izinler/${istenen.id}/karar`, { sonuc: 'izin', gerekce: ' ' })).durum, 400, 'gerekçe zorunlu');
    const verilen = await izin('mudur', 'POST', `/uretim-emirleri/kartsiz-izinler/${istenen.id}/karar`, { sonuc: 'izin', gerekce: 'Kart basılmadı, ilk parti' });
    assert.deepEqual([verilen.durum, verilen.kararVeren, verilen.kararGerekce], ['izin', 'Deneme mudur', 'Kart basılmadı, ilk parti']);
    assert.equal(await bildirimSayisi(istenen.id, true), 0, 'karar verilince bildirim kapanır');
    assert.equal((await istek('mudur', 'POST', `/uretim-emirleri/kartsiz-izinler/${istenen.id}/karar`, { sonuc: 'ret', gerekce: 'geç' })).durum, 409, 'ikinci karar yok');
    assert.equal((await izin('operator', 'GET', `/uretim-emirleri/kartsiz-izinler/${istenen.id}`)).durum, 'izin', 'terminal okur');

    await red(baslat('operator', id, ie, { refakatPartisiId: null, gerekce: 'ek', izinId: istenen.id }), KARTSIZ_IZIN_GEREKCE_BIRDEN);
    await red(baslat('operator2', id, ie, { refakatPartisiId: null, gerekce: null, izinId: istenen.id }), KARTSIZ_IZIN_BASKASI);
    const gelen: (BaslatmaKarti | undefined)[] = [];
    const birak = baslatmaDenetle(async (_db, olay) => { gelen.push(olay.kart); return null; });
    try {
      await baslat('operator', id, ie, { refakatPartisiId: null, gerekce: null, izinId: istenen.id });
    } finally {
      birak();
    }
    assert.deepEqual(gelen, [{ refakatPartisiId: null, gerekce: 'Kart basılmadı, ilk parti (izin: Deneme mudur)' }], 'stok gerekçeyi görür');
    assert.equal((await izin('operator', 'GET', `/uretim-emirleri/kartsiz-izinler/${istenen.id}`)).durum, 'kullanildi');
  });

  test('izin başka işte kullanılmaz; süresi geçen istek ve izin düşer; ret ve iptal kapanır; yeniden çağırma eskisini iptal eder', async () => {
    const a = await ac();
    const b = await ac();
    const z = await izin('operator', 'POST', `/uretim-emirleri/${a.id}/kartsiz-izin-iste`, { isEmriId: a.ie });
    await izin('mudur', 'POST', `/uretim-emirleri/kartsiz-izinler/${z.id}/karar`, { sonuc: 'izin', gerekce: 'Deneme' });
    await red(baslat('operator', b.id, b.ie, { refakatPartisiId: null, gerekce: null, izinId: z.id }), KARTSIZ_IZIN_BASKASI);
    await o().sahip.sorgu("UPDATE uretim_emirleri_kartsiz_izin SET karar_an = karar_an - interval '11 minutes', istek_an = istek_an - interval '11 minutes' WHERE id = $1", [z.id]);
    assert.equal((await izin('operator', 'GET', `/uretim-emirleri/kartsiz-izinler/${z.id}`)).durum, 'sure-doldu');
    await red(baslat('operator', a.id, a.ie, { refakatPartisiId: null, gerekce: null, izinId: z.id }), KARTSIZ_IZIN_GECERSIZ);

    const eski = await izin('operator', 'POST', `/uretim-emirleri/${b.id}/kartsiz-izin-iste`, { isEmriId: b.ie });
    await o().sahip.sorgu("UPDATE uretim_emirleri_kartsiz_izin SET istek_an = istek_an - interval '11 minutes' WHERE id = $1", [eski.id]);
    assert.equal((await izin('mudur', 'GET', `/uretim-emirleri/kartsiz-izinler/${eski.id}`)).durum, 'sure-doldu');
    assert.equal((await istek('mudur', 'POST', `/uretim-emirleri/kartsiz-izinler/${eski.id}/karar`, { sonuc: 'izin', gerekce: 'Geç' })).durum, 409, 'düşen isteğe izin verilmez');

    const yeni = await izin('operator', 'POST', `/uretim-emirleri/${b.id}/kartsiz-izin-iste`, { isEmriId: b.ie });
    assert.equal((await izin('operator', 'GET', `/uretim-emirleri/kartsiz-izinler/${eski.id}`)).durum, 'iptal', 'yeniden çağırma eskisini iptal eder');
    const ret = await izin('mudur', 'POST', `/uretim-emirleri/kartsiz-izinler/${yeni.id}/karar`, { sonuc: 'ret', gerekce: 'Önce kartı basın' });
    assert.deepEqual([ret.durum, ret.gecerlilikBitis], ['ret', null]);
    await red(baslat('operator', b.id, b.ie, { refakatPartisiId: null, gerekce: null, izinId: yeni.id }), KARTSIZ_IZIN_GECERSIZ);

    const kendi = await izin('yetkili', 'POST', `/uretim-emirleri/${b.id}/kartsiz-izin-iste`, { isEmriId: b.ie });
    assert.equal((await istek('yetkili', 'POST', `/uretim-emirleri/kartsiz-izinler/${kendi.id}/karar`, { sonuc: 'izin', gerekce: 'Kendime' })).durum, 403, 'yetkili kendi isteğine izin veremez');
    assert.equal((await izin('yetkili', 'GET', `/uretim-emirleri/kartsiz-izinler/${kendi.id}`)).durum, 'bekliyor');

    const iptal = await izin('operator', 'POST', `/uretim-emirleri/${b.id}/kartsiz-izin-iste`, { isEmriId: b.ie });
    assert.equal((await istek('operator2', 'POST', `/uretim-emirleri/kartsiz-izinler/${iptal.id}/iptal`)).durum, 404, 'başkası iptal edemez');
    assert.equal((await izin('operator', 'POST', `/uretim-emirleri/kartsiz-izinler/${iptal.id}/iptal`)).durum, 'iptal');
    assert.equal(await bildirimSayisi(iptal.id, true), 0, 'iptal bildirimi kapatır');
    assert.equal((await istek('operator', 'POST', `/uretim-emirleri/${b.id}/kartsiz-izin-iste`, { isEmriId: 999999 })).durum, 404, 'adım emrin değil');
  });
});
