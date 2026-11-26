import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';

// 3494-3 a: Üretim Hazırlık'ın ek maddeleri dolu tabloda emrin hazırlık listesine taşınır. Ekleyen ve zaman korunur, tamamlanmış madde
// tamamlayanı ve zamanıyla tamam kalır, geri alınmış açık kalır, kaldırılmış taşınmaz; sıra iş emrinin var olan listesinin sonundan sürer.
// "Ek madde" sütunu kapanır; 'kaldir' olayı göçten sonra yazılabilir. Kişi, parça ve emir verisi uydurmadır.
const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const EK_MADDE_GOCU = '_uretim_emirleri_ek_madde_listeye.sql';

describe('ek madde göçü dolu tabloda (3494-3 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let klasor = '';

  before(async () => {
    ortam = await testSemasiAc('ueekmadde');
    klasor = await mkdtemp(join(tmpdir(), 'tmiv2-ueekmadde-'));
  });
  after(async () => {
    if (klasor) await rm(klasor, { recursive: true, force: true });
    await ortam?.kaldir();
  });

  test('madde listeye taşınır; tamam, açık, kaldırılmış ayrımı ve sıra korunur; Ek madde sütunu kapanır', async () => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    const { ayar, sema, vt, sahip } = ortam;
    const hepsi = (await readdir(GOC_KLASORU)).filter((ad) => ad.endsWith('.sql')).sort();
    const goc = hepsi.find((ad) => ad.endsWith(EK_MADDE_GOCU));
    assert.ok(goc, 'ek madde göçü bulunamadı');
    for (const ad of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, ad), join(klasor, ad));
    await gocleriUygula(ayar, klasor, { sema });

    const yonetici = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ueekmadde', parola: 'dogru-parola-1' }));
    const cam = await vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Hazırlık', kullaniciAdi: 'ueekmadde_cam', parola: 'dogru-parola-1' }));
    const kullanici = await vt.tx((db) => kullaniciYukle(db, yonetici));
    if (kullanici === null) throw new Error('kullanıcı yüklenemedi');
    const projeId = (await sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.EKM', 'Deneme proje', $1) RETURNING id", [yonetici]))!.id;
    const tipId = (await sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('EKM-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('EKM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const urunNo = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ekm-dnm-1', 'mamul', 'EKM-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ekm-dnm-1', com: { ad: 'Deneme mamul' } }), yonetici]))!.no;
    const im = (await sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('EKMM', 'Deneme Merkezi') RETURNING id"))!.id;
    const istasyon = (await sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('EKMI', 'Deneme İstasyonu', $1) RETURNING id", [im]))!.id;
    const makine = (await sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('EKM1', 'Tezgah', $1) RETURNING id", [istasyon]))!.id;
    // Eski şemada uygulama kodu (uretimEmriAc) kullanılmaz: sonraki göçlerin sütunlarını yazar. Emir ve iş emirleri doğrudan eklenir.
    const emir = (await sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, acan_id, malzeme_no, proje_id) VALUES ('P-EKM', 'Deneme', 10, $1, $2, $3) RETURNING id", [yonetici, urunNo, projeId]))!.id;
    const isEmri = async (sira: number): Promise<number> => (await sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, makine_id, ayar_suresi_dk, birim_sure_dk)
       VALUES ($1, $2, $3, $4, $5, $6, 10, 1.5) RETURNING id`, [emir, sira, sira * 10, tipId, `Adım ${String(sira)}`, makine]))!.id;
    const ie1 = await isEmri(1);
    const ie2 = await isEmri(2);
    // İlk iş emrinde göçten önce Adım Durumu'ndan eklenmiş bir liste maddesi vardır (sıra 1); ikincinin listesi boştur.
    const varOlan = (await sahip.tek<{ id: number }>(
      "INSERT INTO emir_adimi (emir_id, is_emri_id, sira, ad, asama, ekleyen_id, eklenme) VALUES ($1, $2, 1, 'Var olan liste maddesi', 'hazirlik', $3, '2026-10-30T08:00:00Z') RETURNING id",
      [emir, ie1, yonetici]))!.id;
    await assert.rejects(sahip.sorgu("INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay) VALUES ($1, $2, 'kaldir')", [varOlan, yonetici]),
      (e: { constraint?: string }) => e.constraint === 'emir_adimi_olayi_olay_degeri', 'göçten önce kaldır olayı yoktur');
    const ekle = async (ie: number | undefined, ad: string, olaylar: string[]) => {
      const id = (await sahip.tek<{ id: number }>(
        "INSERT INTO arkon_hazirlik_maddesi (is_emri_id, ad, kisi_id, zaman) VALUES ($1, $2, $3, '2026-11-01T08:00:00Z') RETURNING id", [ie, ad, cam]))!.id;
      for (const olay of olaylar) {
        await sahip.sorgu("INSERT INTO arkon_hazirlik_maddesi_olayi (madde_id, olay, kisi_id, zaman) VALUES ($1, $2, $3, '2026-11-02T09:00:00Z')", [id, olay, yonetici]);
      }
    };
    await ekle(ie1, 'Eski açık madde', []);
    await ekle(ie1, 'Eski tamam madde', ['tamamla']);
    await ekle(ie1, 'Eski kaldırılan madde', ['kaldir']);
    await ekle(ie1, 'Eski geri alınan madde', ['tamamla', 'geri-al']);
    await ekle(ie2, 'İkinci adımın maddesi', ['tamamla']);

    await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
    assert.deepEqual(await gocleriUygula(ayar, klasor, { sema }), [goc]);

    const satirlar = await sahip.sorgu<{ ie: number; sira: number; ad: string; asama: string; ekleyen: number; eklenme: string; kontrol: unknown; olaylar: unknown }>(
      `SELECT a.is_emri_id AS ie, a.sira, a.ad, a.asama, a.ekleyen_id AS ekleyen, to_char(a.eklenme AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') AS eklenme, a.kontrol,
              (SELECT coalesce(json_agg(json_build_object('olay', o.olay, 'kisi', o.kisi_id, 'kaynak', o.kaynak,
                        'zaman', to_char(o.zaman AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI')) ORDER BY o.id), '[]') FROM emir_adimi_olayi o WHERE o.adim_id = a.id) AS olaylar
         FROM emir_adimi a WHERE a.emir_id = $1 AND a.asama IN ('on_hazirlik', 'hazirlik') ORDER BY a.is_emri_id, a.sira`, [emir]);
    const tamam = [{ olay: 'tamamla', kisi: yonetici, kaynak: 'adim-durumu', zaman: '2026-11-02T09:00' }];
    assert.deepEqual(satirlar, [
      { ie: ie1, sira: 1, ad: 'Var olan liste maddesi', asama: 'hazirlik', ekleyen: yonetici, eklenme: '2026-10-30T08:00', kontrol: null, olaylar: [] },
      { ie: ie1, sira: 2, ad: 'Eski açık madde', asama: 'hazirlik', ekleyen: cam, eklenme: '2026-11-01T08:00', kontrol: null, olaylar: [] },
      { ie: ie1, sira: 3, ad: 'Eski tamam madde', asama: 'hazirlik', ekleyen: cam, eklenme: '2026-11-01T08:00', kontrol: null, olaylar: tamam },
      { ie: ie1, sira: 4, ad: 'Eski geri alınan madde', asama: 'hazirlik', ekleyen: cam, eklenme: '2026-11-01T08:00', kontrol: null, olaylar: [] },
      { ie: ie2, sira: 1, ad: 'İkinci adımın maddesi', asama: 'hazirlik', ekleyen: cam, eklenme: '2026-11-01T08:00', kontrol: null, olaylar: tamam },
    ], 'kaldırılan taşınmaz; sıra iş emri başına listenin sonundan sürer');

    const sutun = await sahip.tek<{ acik: boolean; surum: number }>("SELECT acik, surum FROM uretim_emirleri_hazirlik_maddesi WHERE kod = 'ek-madde'");
    assert.deepEqual(sutun, { acik: false, surum: 2 }, 'Ek madde sütunu kapanır, sürümü artar');
    await sahip.sorgu("INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay, kaynak) VALUES ($1, $2, 'kaldir', 'adim-durumu')", [varOlan, yonetici]);
    assert.equal((await sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM arkon_hazirlik_maddesi'))?.n, 5, 'eski tablo silinmez, salt okunur kalır');
  });
});
