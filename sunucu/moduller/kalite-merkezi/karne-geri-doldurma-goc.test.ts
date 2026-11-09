import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { kmGirisBekleyenCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { malKabulCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { GIRIS_KARNE_ANAHTARI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const GOC = '20261109053712_kalite_merkezi_karne_geri_doldurma.sql';

// Kart 2406: geri doldurma göçünden önceki şemada giriş kontrolü kararları verilir ve sunucunun yazdığı karne olayları silinir (kural
// gelmeden verilmiş kararların eşi); göç aynı olayları üretmeli, karar bekleyen ve firmasız lota olay yazmamalı. Veriler uydurmadır.
describe('Kalite Merkezi karne geri doldurma göçü (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance | undefined;
  let klasor = '';
  const cerezler = new Map<string, string>();
  let yoneticiId = 0;
  let sira = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown) => app!.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    ...(govde === undefined ? {} : { payload: govde as object }),
  });
  async function giris(kullaniciAdi: string): Promise<void> {
    const r = await app!.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerezler.set(kullaniciAdi, String(r.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kart(): Promise<number> {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'KGD-', $2, 'aktif', $3, $4, $4, true) RETURNING no`,
      [`kgd-${sira}`, sira, JSON.stringify({ id: `kgd-${sira}`, com: { ad: `Deneme ${sira}` } }), yoneticiId],
    ))!.no;
  }
  async function siparisSatiri(miktar: string, firmaId: number | null): Promise<number> {
    sira += 1;
    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')",
      [t, 81000 + sira, yoneticiId]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad) VALUES ($1, $2, 1, 'Deneme kalem')", [t, kl]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi, firma_id) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikçi', $3)", [t, tk, firmaId]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id",
      [t, tk, kl, miktar]))!.id;
  }
  async function lot(firmaId: number | null): Promise<number> {
    const r = await istek('yonetici', 'POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: await kart(), miktar: '2', siparisSatirId: await siparisSatiri('2', firmaId) }] });
    assert.equal(r.statusCode, 200, r.body);
    const no = malKabulCevabi.parse(r.json()).belge.no;
    const b = await istek('kaliteci', 'GET', '/kalite-merkezi/giris/bekleyenler');
    const k = kmGirisBekleyenCevabi.parse(b.json()).kayitlar.find((x) => x.malKabulNo === no);
    assert.ok(k, 'GKK satırı bekleyenlerde');
    return k.malKabulSatirId;
  }
  const gkk = async (id: number, kabul: string, hatali: string) =>
    assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/gkk`, { kabul, hatali })).statusCode, 200);
  const karar = async (id: number, k: string) => assert.equal((await istek('kaliteci', 'POST', `/kalite-merkezi/giris/${id}/karar`, {
    karar: k, ncrKimlik: `ncr-kgd-${id}`, ncrNo: `NCR-KGD-${id}`, ciddiyet: 'Minör', not: 'deneme şartı',
  })).statusCode, 200);
  const olaylar = async () => o().sahip.sorgu<{ anahtar: string; firma: number; karar: string; zaman: string }>(
    `SELECT anahtar, firma_id AS firma, lot_karari AS karar, zaman::text AS zaman FROM musteri_tedarikci_karne_olayi
      WHERE kaynak = 'kalite-merkezi' AND tur = 'lot' ORDER BY anahtar`);

  before(async () => {
    ortam = await testSemasiAc('kmkgd');
    klasor = await mkdtemp(join(tmpdir(), 'km-karne-goc-'));
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    assert.ok(hepsi.includes(GOC), 'göç bulunamadı');
    for (const ad of hepsi.filter((a) => a < GOC)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    // Hedeften sonra gelen göçler güncel kodun beklediği şemayı kurar (ör. 2417 vade_baslangici sütunu). Göç aracı ada göre sırayı
    // denetlediği için hedefin hemen önüne sıralanan adla kopyalanır (aralarındaki sıra korunur); hedef göç sonra yine araçla uygulanır.
    // Hedefin verisine dayanan sonraki göç yoktur.
    const onune = `${String(BigInt(GOC.slice(0, 14)) - 1n)}_`;
    for (const ad of hepsi.filter((a) => a > GOC)) await copyFile(join(GOC_KLASORU, ad), join(klasor, `${onune}${ad}`));
    await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    const kalite = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'"))!.id;
    const yonetici = (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    await ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme kaliteci', kullaniciAdi: 'kaliteci', parola: PAROLA });
      await rolAta(db, yoneticiId, k, kalite);
      await rolAl(db, yoneticiId, k, yonetici);
    });
    await giris('kaliteci');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KGD-', 0) ON CONFLICT (onek) DO NOTHING");
    if ((await ortam.sahip.tek("SELECT 1 FROM stok_konum WHERE tur = 'karantina' AND aktif")) === null) {
      await ortam.sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'KRN-KGD', 'karantina' FROM stok_depo WHERE kod = 'ANA'");
    }
  });
  after(async () => {
    await app?.close();
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('göç sunucunun yazacağı olayları doldurur; bekleyen ve firmasız lot atlanır; yeniden koşmak satır eklemez', async () => {
    const firmaId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Karne Deneme Göç', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    await o().sahip.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firmaId]);
    const [temiz, red, sartli, hatali, bekleyen, firmasiz] = [
      await lot(firmaId), await lot(firmaId), await lot(firmaId), await lot(firmaId), await lot(firmaId), await lot(null),
    ];
    await gkk(temiz, '2', '0');
    for (const id of [red, sartli, hatali, bekleyen]) await gkk(id, '1', '1');
    await gkk(firmasiz, '2', '0');
    await karar(red, 'red');
    await karar(sartli, 'sartli_kabul');
    await karar(hatali, 'kabul');

    const yazilan = await olaylar();
    const beklenen = ([[temiz, 'kabul'], [red, 'red'], [sartli, 'sartli_kabul'], [hatali, 'hatali_kabul']] as const)
      .map(([id, k]) => [GIRIS_KARNE_ANAHTARI(id), k]).sort((a, b) => a[0]!.localeCompare(b[0]!));
    assert.deepEqual(yazilan.map((x) => [x.anahtar, x.karar]), beklenen);

    await o().sahip.sorgu("DELETE FROM musteri_tedarikci_karne_olayi WHERE kaynak = 'kalite-merkezi'");
    await copyFile(join(GOC_KLASORU, GOC), join(klasor, GOC));
    assert.deepEqual(await gocleriUygula(o().ayar, klasor, { sema: o().sema }), [GOC]);
    assert.deepEqual(await olaylar(), yazilan, 'göç sunucunun yazdığıyla aynı firma, karar ve zamanı üretir');

    await o().sahip.sorgu(`DELETE FROM musteri_tedarikci_karne_olayi WHERE kaynak = 'kalite-merkezi' AND anahtar = $1`, [GIRIS_KARNE_ANAHTARI(red)]);
    await karar(bekleyen, 'kabul');
    const sonraki = await olaylar();
    assert.equal(sonraki.length, 4, 'göçten sonra verilen karar sunucudan yazılır');
  });
});
