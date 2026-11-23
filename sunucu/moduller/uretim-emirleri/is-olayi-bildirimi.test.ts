import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, emirBitir, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';

// 3596: adım bitince sıradaki adımın istasyonuna atanmış kişilere, emir bitince planlamaya bildirim; ikisi de varsayılan kapalı,
// bitiren kendisi almaz. Adlar uydurmadır (ORN-).
interface Satir { tur: string; kisiId: number; baslik: string; metin: string | null }

describe('uretim-emirleri gerçekleşen iş olayları bildirimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0, projeId = 0, tipId = 0, urunNo = 0, rev = 0, sayac = 0, taban = 0;
  let planlama: Kullanici;
  let operator: Kullanici;
  let sonrakiOperator: Kullanici;
  let baskaOperator: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);
  const tabanAl = async (): Promise<void> => { taban = (await o().vt.tek<{ n: number }>('SELECT coalesce(max(id), 0)::int AS n FROM bildirim_kaydi'))!.n; };
  const satirlar = (tur: string): Promise<Satir[]> => o().vt.sorgu<Satir>(
    'SELECT tur, kisi_id AS "kisiId", baslik, metin FROM bildirim_kaydi WHERE tur = $1 AND id > $2 ORDER BY id', [tur, taban]);

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]))!.id;
    const yon = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `ORN ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol);
      await rolAl(db, yoneticiId, yeni, yon);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    return k;
  }
  // İstasyon, makinesi ve bugün atanmış kişileri.
  async function makine(atananlar: readonly number[]): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`IOB${sayac}`, 'ORN Merkez']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`IOBI${sayac}`, `ORN-Istasyon ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    for (const k of atananlar) await o().sahip.sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2020-01-01', 100)", [ist, k]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`IOBM${sayac}`, 'ORN Tezgah', ist]))!.id;
  }
  const adim = (sira: number, makineId: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `ORN Adim ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    onculler: sira === 1 ? [] : [{ opNo: (sira - 1) * 10, tur: 'bekleyen', devirAdedi: null }],
  });
  async function emir(): Promise<{ id: number; ie1: number; ie2: number }> {
    const r = await tx(async (db) => uretimEmriAc(db, planlama, {
      malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: rev, projeId,
      isEmirleri: [adim(1, await makine([operator.id])), adim(2, await makine([sonrakiOperator.id]))],
    }));
    const [ie1, ie2] = r.isEmriIdleri as [number, number];
    return { id: r.uretimEmriId, ie1, ie2 };
  }

  before(async () => {
    ortam = await testVeritabaniKur('ue_is_olayi_bildirimi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Yonetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.IOB', 'ORN proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlama = await kisi('planlama_proje', 'planlama_proje');
    operator = await kisi('operator', 'operator');
    sonrakiOperator = await kisi('operator2', 'operator');
    baskaOperator = await kisi('operator3', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('IOB-T', 'ORN tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('IOB-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('iob-dnm-1', 'mamul', 'IOB-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'iob-dnm-1', com: { ad: 'ORN mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('olay kapalıyken adım ve emir bitişi bildirim yazmaz (3478-2 a)', async () => {
    await tabanAl();
    const e = await emir();
    await tx((db) => emirBaslat(db, operator, e.id, undefined, undefined, e.ie1));
    await tx((db) => emirBitir(db, operator, e.id, undefined, undefined, e.ie1));
    assert.deepEqual(await satirlar('uretim-emirleri.adim-tamamlandi'), []);
  });

  test('açıkken: adım bitince yalnız sıradaki istasyona atanan alır; son adımda emir tamamlandı planlamaya gider', async () => {
    await tx((db) => butunOlaylariVeEskiKademeleriAc(db, yoneticiId));
    await tabanAl();
    const e = await emir();
    await tx((db) => emirBaslat(db, operator, e.id, undefined, undefined, e.ie1));
    await tx((db) => emirBitir(db, operator, e.id, 5, undefined, e.ie1));
    const adimlar = await satirlar('uretim-emirleri.adim-tamamlandi');
    assert.deepEqual(adimlar.map((x) => x.kisiId), [sonrakiOperator.id], 'bitiren, başka istasyonun operatörü ve planlama almaz');
    assert.match(adimlar[0]!.baslik, /: op 10 bitti, sıra op 20$/);
    assert.match(adimlar[0]!.metin ?? '', /5 sağlam\. Sıradaki adım: ORN Adim 2, ORN-Istasyon \d+\.$/);
    assert.deepEqual(await satirlar('uretim-emirleri.emir-tamamlandi'), []);

    await tx((db) => emirBaslat(db, sonrakiOperator, e.id, undefined, undefined, e.ie2));
    await tx((db) => emirBitir(db, sonrakiOperator, e.id, 5, undefined, e.ie2));
    assert.equal((await satirlar('uretim-emirleri.adim-tamamlandi')).length, 1, 'son adım adım bildirimi vermez');
    const emirler = await satirlar('uretim-emirleri.emir-tamamlandi');
    assert.ok(emirler.some((x) => x.kisiId === planlama.id), JSON.stringify(emirler));
    assert.ok(!emirler.some((x) => [operator.id, sonrakiOperator.id, baskaOperator.id].includes(x.kisiId)));
    assert.match(emirler[0]!.metin ?? '', /^5 \/ 5 sağlam, proje ORN\.IOB\.$/);
  });
});
