import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirNolari, emirSayim, kararSayaclari, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { ilkParcaKarari, ilkParcaKararlari, kalibrasyonHazirlikDurumlari } from './disari.ts';
import * as sorgular from './sorgular.ts';

// 229 a: ilk parça kararı Kalite Merkezi'nden çıkar; emrin karar bekleyen sayımı onayda sağlama, retde redde geçer.
describe('Kalite Merkezi ilk parça kararı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let operator: Kullanici;
  let planlama: Kullanici;
  let tipId = 0;
  let urunNo = 0;
  let sayac = 0;
  let revizyonId = 0;
  let denemeProjeId = 0;
  let app: FastifyInstance;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    });
    return k!;
  }

  async function baslamisEmir(): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`KMF${sayac}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`KMFI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id],
    );
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist?.id]);
    const m = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`KMFM${sayac}`, 'Tezgah', ist?.id]);
    const { uretimEmriId } = await o().vt.tx((db) => uretimEmriAc(db, planlama, {
      projeId: denemeProjeId, malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyonId,
      isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: m!.id }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      }],
    }));
    await o().vt.tx((db) => emirBaslat(db, operator, uretimEmriId));
    return uretimEmriId;
  }

  const kararBekleyen = (id: number, adet: number) =>
    o().vt.tx((db) => emirSayim(db, operator, id, { tur: 'saglam', adet }, { kararBekliyor: true }));
  const sayaclar = (id: number) => o().vt.tx(async (db) => (await kararSayaclari(db, [id])).get(id));

  before(async () => {
    ortam = await testVeritabaniKur('km_ilk_parca');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('KALITE.IPK', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    operator = await kisi('operator', 'operator');
    planlama = await kisi('planlama', 'planlama_proje');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('KMF-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KMF-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('kmf-dnm-1', 'mamul', 'KMF-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'kmf-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId],
    ))!.no;
    // Emrin kaynak revizyonu gerçek bir rota revizyonu olmalıdır; iptal durumu açık revizyonun tekil dizinine çakışmaz.
    revizyonId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId],
    ))!.id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KM-K229 onay karar bekleyeni sağlama, ret redde geçirir; bekleyen yoksa adet sıfırdır', async () => {
    const onaylanan = await baslamisEmir();
    await kararBekleyen(onaylanan, 4);
    assert.deepEqual(await sayaclar(onaylanan), { kararBekliyor: 4, red: 0 });
    assert.deepEqual(await o().vt.tx((db) => ilkParcaKarari(db, yoneticiId, onaylanan, 'onay')), { adet: 4 });
    assert.deepEqual(await sayaclar(onaylanan), { kararBekliyor: 0, red: 0 });
    assert.deepEqual(await o().vt.tx((db) => ilkParcaKarari(db, yoneticiId, onaylanan, 'onay')), { adet: 0 }, 'bekleyen kalmadı');

    const reddedilen = await baslamisEmir();
    await kararBekleyen(reddedilen, 3);
    assert.deepEqual(await o().vt.tx((db) => ilkParcaKarari(db, yoneticiId, reddedilen, 'ret')), { adet: 3 });
    assert.deepEqual(await sayaclar(reddedilen), { kararBekliyor: 0, red: 3 });
  });

  // Karar ucu (denetim #12): ilk parça kararını Kalite Merkezi'nde onay yetkisi olan verir; operatörün kendi sayımı karar değildir.
  test('KM-K229 karar ucu: onay yetkisi olan kararı verir, yetkisiz 403; geçersiz karar 400', async () => {
    const cerez = async (kullaniciAdi: string): Promise<string> => {
      const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: 'dogru-parola-1' } });
      assert.equal(r.statusCode, 200, r.body);
      return String(r.headers['set-cookie']).split(';')[0] ?? '';
    };
    await kisi('kaliteci', 'kalite');
    const kalite = await cerez('kaliteci');
    const opr = await cerez('operator');
    const emir = await baslamisEmir();
    await kararBekleyen(emir, 2);
    const karar = (c: string, govde: unknown) => app.inject({ method: 'POST', url: `/api/kalite-merkezi/ilk-parca/${emir}/karar`, headers: { cookie: c }, payload: govde as object });

    assert.equal((await karar(opr, { karar: 'onay' })).statusCode, 403);
    assert.equal((await karar(kalite, { karar: 'belki' })).statusCode, 400);
    assert.deepEqual(await sayaclar(emir), { kararBekliyor: 2, red: 0 }, 'reddedilen istek sayımı değiştirmez');
    const r = await karar(kalite, { karar: 'ret' });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { adet: 2 });
    assert.deepEqual(await sayaclar(emir), { kararBekliyor: 0, red: 2 });
  });

  // Arkon'un kapısı KM'nin kararını okur (denetim #12): emir başına son karar; kararsız emir haritada yoktur.
  test('KM-K229 karar defteri: her karar yazılır, okuyucu emir başına son kararı verir; bekleyen olmasa da karar tutulur', async () => {
    const emir = await baslamisEmir();
    const kararsiz = await baslamisEmir();
    assert.deepEqual(await o().vt.tx((db) => ilkParcaKararlari(db, [])), new Map());
    await o().vt.tx((db) => ilkParcaKarari(db, yoneticiId, emir, 'ret'));
    await o().vt.tx((db) => ilkParcaKarari(db, yoneticiId, emir, 'onay'));
    const kararlar = await o().vt.tx((db) => ilkParcaKararlari(db, [emir, kararsiz]));
    assert.deepEqual([...kararlar.keys()], [emir]);
    const son = kararlar.get(emir)!;
    assert.deepEqual({ karar: son.karar, kisiId: son.kisiId }, { karar: 'onay', kisiId: yoneticiId });
    assert.ok(!Number.isNaN(Date.parse(son.zaman)), son.zaman);
    assert.equal((await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM kalite_merkezi_ilk_parca_karari WHERE uretim_emri_id = $1', [emir]))!.n, 2);
  });

  // 325 a: Kalite Merkezi ekranı karar bekleyen emirleri bu uçtan listeler; karar verilince emir listeden düşer.
  test('KM-K325 bekleyenler: karar bekleyen sayımı olan açık emirler adetle gelir, karar verilince düşer; yetkisiz 403', async () => {
    const cerez = async (kullaniciAdi: string): Promise<string> => {
      const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: 'dogru-parola-1' } });
      assert.equal(r.statusCode, 200, r.body);
      return String(r.headers['set-cookie']).split(';')[0] ?? '';
    };
    await kisi('kaliteci325', 'kalite');
    const kalite = await cerez('kaliteci325');
    const opr = await cerez('operator');
    const bekleyenler = async (c: string) => app.inject({ method: 'GET', url: '/api/kalite-merkezi/ilk-parca/bekleyenler', headers: { cookie: c } });
    const bos = await bekleyenler(kalite);
    assert.equal(bos.statusCode, 200, bos.body);
    const onceki = (bos.json() as { emirler: { uretimEmriId: number }[] }).emirler.length;

    const bekleyen = await baslamisEmir();
    const sayimsiz = await baslamisEmir();
    await kararBekleyen(bekleyen, 4);
    const no = (await o().vt.tx((db) => emirNolari(db, [bekleyen]))).get(bekleyen)!;
    const r = await bekleyenler(kalite);
    assert.equal(r.statusCode, 200, r.body);
    const liste = (r.json() as { emirler: { uretimEmriId: number; emirNo: string; adet: number; kararBekleyenAdet: number }[] }).emirler;
    assert.equal(liste.length, onceki + 1, 'yalnız karar bekleyen emir eklenir');
    assert.ok(!liste.some((e) => e.uretimEmriId === sayimsiz), 'sayımı olmayan emir listede yok');
    const satir = liste.find((e) => e.uretimEmriId === bekleyen);
    assert.deepEqual(satir && { emirNo: satir.emirNo, adet: satir.adet, kararBekleyenAdet: satir.kararBekleyenAdet }, { emirNo: no, adet: 10, kararBekleyenAdet: 4 });

    assert.equal((await bekleyenler(opr)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/kalite-merkezi/ilk-parca/bekleyenler' })).statusCode, 401);
    const karar = await app.inject({ method: 'POST', url: `/api/kalite-merkezi/ilk-parca/${bekleyen}/karar`, headers: { cookie: kalite }, payload: { karar: 'onay' } });
    assert.equal(karar.statusCode, 200, karar.body);
    const sonra = (await bekleyenler(kalite)).json() as { emirler: { uretimEmriId: number }[] };
    assert.ok(!sonra.emirler.some((e) => e.uretimEmriId === bekleyen), 'karar verilen emir listeden düştü');
    assert.equal(sonra.emirler.length, onceki);
  });

  // 262 a: Üretim emirlerinin hazırlık kapısı kalibrasyonu emir başına buradan okur; emrin cihazları emrin muayenelerindedir.
  test('KM-K88 kalibrasyon hazırlığı: emrin muayenelerindeki her cihaz kalibrasyonda geçerliyse tamam; cihazsız emir seçili değil', async () => {
    const emir = await baslamisEmir();
    const cihazsiz = await baslamisEmir();
    const no = (await o().vt.tx((db) => emirNolari(db, [emir]))).get(emir)!;
    const tur = (await o().sahip.tek<{ id: number }>("SELECT id FROM olcu_aleti_turu WHERE ad = 'Kumpas'"))!.id;
    for (const [aletNo, tarih] of [['K88-1', 'current_date'], ['K88-2', "current_date - 400"]] as const) {
      const a = await o().sahip.tek<{ id: number }>('INSERT INTO olcu_aleti (no, tur_id, periyot_gun) VALUES ($1, $2, 365) RETURNING id', [aletNo, tur]);
      await o().sahip.sorgu(`INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, ${tarih}, $2, 'uygun')`, [a!.id, yoneticiId]);
    }
    const yaz = (koleksiyon: string, kimlik: string, govde: Record<string, unknown>) =>
      o().vt.tx((db) => sorgular.yaz(db, koleksiyon, kimlik, govde, yoneticiId));
    await yaz('dev', 'dev_k88_1', { kod: 'K88-1' });
    await yaz('dev', 'dev_k88_2', { kod: 'K88-2' });
    const okur = async () => o().vt.tx((db) => kalibrasyonHazirlikDurumlari(db, [emir, cihazsiz]));
    const bos = { durum: 'yok', zaman: null, secildi: false };
    assert.deepEqual(await okur(), new Map([[emir, bos], [cihazsiz, bos]]));
    assert.deepEqual(await o().vt.tx((db) => kalibrasyonHazirlikDurumlari(db, [])), new Map());
    await yaz('insp', 'insp_k88', { no: 'MUA-K88', emir: ` ${no} `, chars: [{ ad: 'Çap', cihaz: 'dev_k88_1' }] });
    await yaz('insp', 'insp_k88_baska', { no: 'MUA-K88B', emir: 'BASKA-EMIR', chars: [{ ad: 'Çap', cihaz: 'dev_k88_2' }] });
    assert.deepEqual((await okur()).get(emir), { durum: 'tamam', zaman: null, secildi: true });
    assert.deepEqual((await okur()).get(cihazsiz), bos, 'başka emrin muayenesi sayılmaz');
    await yaz('insp', 'insp_k88_2', { no: 'MUA-K88-2', emir: no, chars: [{ ad: 'Boy', cihaz: 'dev_k88_2' }] });
    assert.deepEqual((await okur()).get(emir), { durum: 'yok', zaman: null, secildi: true }, 'süresi dolmuş alet');
  });
});
