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
import { adimliEmirCevabi, hataliCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi, HataliCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirBitir, emirSayim, isEmriKopyalandiDinle, kararliSayimiSonuclandir, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import type { IsEmriKopyalandiOlayi } from './emir-olaylari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('uretim-emirleri iş emri kopyalandı olayı (1203 b; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let kaliteIst = 0;
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
  const op = (): Kullanici => kim('operator');
  const adimlari = async (id: number) => (await o().sahip.sorgu<{ id: number; op: number; tur: string; durum: string; saglam: number | null; ist: number | null; bag: string }>(
    `SELECT id, op_no AS op, tur, durum, saglam_adet AS saglam, istasyon_id AS ist, bagimlilik AS bag FROM uretim_emirleri_is_emri
      WHERE uretim_emri_id = $1 ORDER BY sira`, [id]));
  const hatali = (id: number, govde: Record<string, unknown>) => istek<HataliCevabi>('operator', 'POST', `/uretim-emirleri/${id}/hatali`, govde);
  // İlk adımı bitirip ikinci adımı başlatır; ilk parça (327 a) onaylanır.
  async function ikinciAdimda(adet: number, makineler: number[]): Promise<{ id: number; adimlar: number[] }> {
    const e = await ac(adet, makineler);
    await tx((db) => emirBaslat(db, op(), e.id));
    await tx((db) => emirSayim(db, op(), e.id, { tur: 'saglam', adet: 1 }));
    await tx((db) => kararliSayimiSonuclandir(db, yoneticiId, e.id, 'onay'));
    await tx((db) => emirSayim(db, op(), e.id, { tur: 'saglam', adet: adet - 1 }));
    await tx((db) => emirBitir(db, op(), e.id));
    await tx((db) => emirBaslat(db, op(), e.id));
    return e;
  }

  before(async () => {
    ortam = await testVeritabaniKur('uretim_kol_kopya');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.KOPYA', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KK-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('KK-TK', 'Deneme takım kırılması', 900), ('KK-PAS', 'Deneme pasif', 901)");
    await ortam.sahip.sorgu("UPDATE hurda_nedeni SET aktif = false WHERE kod = 'KK-PAS'");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KK-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kk-dnm-1', 'mamul', 'KK-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kk-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    kaliteIst = (await istasyon('kalite')).ist;
  });
  after(async () => { await ortam?.kaldir(); });

  // Olay komutla aynı işlemdedir: dinleyici kaydı her testte kurulur ve bırakılır.
  async function olaylarla<T>(is: () => Promise<T>): Promise<{ sonuc: T; olaylar: IsEmriKopyalandiOlayi[] }> {
    const olaylar: IsEmriKopyalandiOlayi[] = [];
    const birak = isEmriKopyalandiDinle(async (_db, olay) => { olaylar.push(olay); });
    try {
      return { sonuc: await is(), olaylar };
    } finally {
      birak();
    }
  }
  const ciftler = (olay: IsEmriKopyalandiOlayi | undefined) => olay?.isEmirleri.map((x) => [x.kaynakIsEmriId, x.yeniIsEmriId, x.kaynakOpNo, x.rotaAdimi]);

  test('bölmede kolun her kopya adımı kaynağıyla bildirilir; kola konan ek adım kopya değildir', async () => {
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const e = await ac(4, [a.makine, b.makine, c.makine]);
    const surum = (await ayrinti(e.id)).surum;
    const ek = {
      oncekiOpNo: null, opNo: 15, tur: 'rework', ad: 'Ek işlem', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: a.makine },
      ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, aciklama: null,
    };
    const { sonuc, olaylar } = await olaylarla(() => istek<{ altEmirId: number }>('planlama_proje', 'POST', `/adimli-emirler/${e.id}/bol`, { adimSira: 2, adet: 1, surum, ekAdimlar: [ek] }));
    assert.equal(sonuc.durum, 200, JSON.stringify(sonuc.govde));
    const kol = sonuc.govde.altEmirId;
    const kolAdimlari = await adimlari(kol);
    const yeni = (opNo: number) => kolAdimlari.find((x) => x.op === opNo)!.id;
    assert.equal(olaylar.length, 1);
    assert.deepEqual([olaylar[0]?.uretimEmriId, olaylar[0]?.kisiId], [kol, kim('planlama_proje').id]);
    assert.deepEqual(ciftler(olaylar[0]), [[e.adimlar[1], yeni(20), 20, true], [e.adimlar[2], yeni(30), 30, true]]);
  });

  test('terminalde hatalı: kol yolunda kopyalanan adım, bütün adette tekrar adımı kaynak op numarasıyla bildirilir', async () => {
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const e = await ikinciAdimda(10, [a.makine, b.makine, c.makine]);
    const kolYolu = await olaylarla(() => hatali(e.id, { hurdaNedeniKodu: 'KK-TK', adet: 2 }));
    assert.equal(kolYolu.sonuc.durum, 200, JSON.stringify(kolYolu.sonuc.govde));
    const h = hataliCevabi.parse(kolYolu.sonuc.govde);
    const op20 = (await adimlari(h.hedefEmir.id)).find((x) => x.op === 20)!.id;
    assert.deepEqual([kolYolu.olaylar.length, kolYolu.olaylar[0]?.uretimEmriId, kolYolu.olaylar[0]?.kisiId], [1, h.hedefEmir.id, op().id]);
    assert.deepEqual(ciftler(kolYolu.olaylar[0]), [[e.adimlar[1], op20, 20, true]], 'kalite ve rework adımları kopya değildir');

    const t = await ac(1, [a.makine, b.makine]);
    await tx((db) => emirBaslat(db, op(), t.id));
    const tekrarYolu = await olaylarla(() => hatali(t.id, { isEmriId: t.adimlar[0], hurdaNedeniKodu: 'KK-TK', adet: 1 }));
    assert.equal(tekrarYolu.sonuc.durum, 200, JSON.stringify(tekrarYolu.sonuc.govde));
    const tekrar = (await adimlari(t.id)).find((x) => x.op === 17)!;
    assert.equal(tekrar.tur, 'rework');
    assert.deepEqual(tekrarYolu.olaylar.map((x) => [x.uretimEmriId, ciftler(x)]), [[t.id, [[t.adimlar[0], tekrar.id, 10, true]]]]);
  });

  test('dinleyici reddederse bölme bütünüyle geri alınır', async () => {
    const [a, b] = [await istasyon(), await istasyon()];
    const e = await ac(4, [a.makine, b.makine]);
    const once = await ayrinti(e.id);
    const birak = isEmriKopyalandiDinle(async () => { throw new Error('deneme reddi'); });
    try {
      const c = await istek('planlama_proje', 'POST', `/adimli-emirler/${e.id}/bol`, { adimSira: 2, adet: 1, surum: once.surum });
      assert.equal(c.durum, 500);
    } finally {
      birak();
    }
    const sonra = await ayrinti(e.id);
    assert.deepEqual([sonra.adet, sonra.surum], [once.adet, once.surum]);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri WHERE ust_emir_id = $1', [e.id]))?.n, 0);
  });
});
