import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { adimliEmirCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { isEmirleriDegistiDinle, isEmirleriniYenile, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import type { IsEmirleriDegistiOlayi } from './emir-olaylari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// 2327-1 a: açık emrin adımı eklenince, çıkarılınca ya da değişince olay bildirilir; değişmeyen uygulama bildirmez. Veriler uydurmadır.
describe('uretim-emirleri iş emirleri değişti olayı (2327-1 a; gerçek PostgreSQL)', () => {
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

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await tx(async (db) => {
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
  }

  async function istasyon(tip = 'talasli'): Promise<{ ist: number; makine: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KKM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`KKI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, tip]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KKMK${sayac}`, 'Tezgah', ist]))!.id;
    return { ist, makine };
  }

  const adim = (sira: number, makine: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (adet: number, makineler: number[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: makineler.map((m, i) => adim(i + 1, m)), projeId,
    }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir as AdimliEmirAyrintisi;
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_adim_degisti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ADIMD', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kk-dnm-1', 'mamul', 'KK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kk-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    await istasyon('kalite');
  });
  after(async () => { await ortam?.kaldir(); });

  async function olaylarla<T>(is: () => Promise<T>): Promise<{ sonuc: T; olaylar: IsEmirleriDegistiOlayi[] }> {
    const olaylar: IsEmirleriDegistiOlayi[] = [];
    const birak = isEmirleriDegistiDinle(async (_db, olay) => { olaylar.push(olay); });
    try {
      return { sonuc: await is(), olaylar };
    } finally {
      birak();
    }
  }

  test('rota uygulanınca adım değişirse bir olay; aynı rota yeniden uygulanınca olay yok', async () => {
    const a = await istasyon();
    const e = await ac(4, [a.makine, a.makine]);
    const yeni = [{ ...adim(1, a.makine), birimSureDk: '2.5' }, adim(2, a.makine), adim(3, a.makine)];
    const ilk = await olaylarla(() => tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), e.id, { kaynakRotaRevizyonId: rev, isEmirleri: yeni })));
    assert.ok(ilk.sonuc.degisenler.length > 0, JSON.stringify(ilk.sonuc));
    assert.deepEqual(ilk.olaylar, [{ uretimEmriId: e.id, kisiId: kim('planlama_proje').id }]);
    const ikinci = await olaylarla(() => tx((db) => isEmirleriniYenile(db, kim('planlama_proje'), e.id, { kaynakRotaRevizyonId: rev, isEmirleri: yeni })));
    assert.deepEqual(ikinci.olaylar, [], JSON.stringify(ikinci.sonuc));
  });

  test('kola ek adım konunca ve kaldırılınca kolun olayı', async () => {
    const [a, b] = [await istasyon(), await istasyon()];
    const e = await ac(4, [a.makine, b.makine]);
    const bol = await istek<{ altEmirId: number }>('planlama_proje', 'POST', `/adimli-emirler/${e.id}/bol`, { adimSira: 2, adet: 1, surum: (await ayrinti(e.id)).surum });
    assert.equal(bol.durum, 200, JSON.stringify(bol.govde));
    const kol = bol.govde.altEmirId;
    const ek = {
      oncekiOpNo: null, opNo: 15, tur: 'rework', ad: 'Ek işlem', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: a.makine },
      ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, aciklama: null,
    };
    const surum = (await ayrinti(kol)).surum;
    const konan = await olaylarla(() => istek('planlama_proje', 'POST', `/adimli-emirler/${kol}/ek-adim`, { ...ek, surum }));
    assert.equal(konan.sonuc.durum, 200, JSON.stringify(konan.sonuc.govde));
    assert.deepEqual(konan.olaylar, [{ uretimEmriId: kol, kisiId: kim('planlama_proje').id }]);
    const sonSurum = (await ayrinti(kol)).surum;
    const kalkan = await olaylarla(() => istek('planlama_proje', 'POST', `/adimli-emirler/${kol}/ek-adim-kaldir`, { opNo: 15, surum: sonSurum }));
    assert.equal(kalkan.sonuc.durum, 200, JSON.stringify(kalkan.sonuc.govde));
    assert.deepEqual(kalkan.olaylar.map((o) => o.uretimEmriId), [kol]);
  });
});
