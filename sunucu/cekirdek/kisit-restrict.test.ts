import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import { z } from 'zod';
import { kisitIhlali } from './db.ts';
import type { Veritabani } from './db.ts';
import { testVeritabaniKur } from './test-vt.ts';
import { uc, uclariKaydet } from './uc.ts';
import { hataYonetiminiKur } from './uygulama.ts';

// RESTRICT eylemli yabancı anahtar PostgreSQL 18'de 23001, öncekilerde 23503 bildirir. Bu listedeki her anahtar sınır katmanında
// 409 BAGIMLI_KAYIT olur; yeni RESTRICT anahtar eklenince liste ve aşağıdaki gerçek ihlal testi birlikte güncellenir. Modül kendi
// servisinde `pgKodu === '23503'` diye bakıyorsa RESTRICT anahtarında bu ret onu ıskalar: `hata.kod === 'BAGIMLI_KAYIT'` ile bakılır.
const RESTRICT_ANAHTARLARI = [
  // 2540: tedarikçi alacağı olan sipariş silinmez; silinse para kaydı sessizce kaybolurdu (satın alma karar kaydını önceden 409 ile reddeder).
  'finans_tedarikci_alacagi.satin_alma_talep_id -> satin_alma_siparis',
  'finans_tedarikci_alacagi.satin_alma_teklif_id -> satin_alma_siparis',
  'kalibrasyon_kaydi.alet_id -> olcu_aleti',
  // 3320 a: ara adımın çıktısı olan malzeme kartı silinmez; silinse rota adımı çıktısını sessizce yitirirdi.
  'rota_adim_ciktisi.cikti_malzeme_id -> malzeme_katalog_karti',
  // 2642 b (Veri 2): faturaya eşlenmiş sipariş satırı (kaldırılmış eşleme dahil) silinmez; silinse eşlemenin oranı sessizce kaybolurdu.
  'satin_alma_fatura_eslemesi.siparis_satiri_id -> satin_alma_siparis_satiri',
  // 2397 b: onay basamağında kullanılan rol silinmez; silinse basamak rolsüz kalır ve denetim sessizce gevşerdi.
  'satin_alma_onay_limiti.rol_id -> rol',
  // 3442-7b a: onay basamağına yazılı kişi silinmez; silinse basamak sessizce gevşerdi.
  'satin_alma_onay_limiti_kisi.kisi_id -> kisi',
  // 3574-1: bekleyen sipariş önerisini yazan kişi silinmez; silinse onay bekleyen para kararı sahipsiz kalır ve dört göz denetimi (öneren onaylayamaz) boşalırdı.
  // 3574-2a: sipariş değişikliği geçmişini yapan ve onaylayan kişi silinmez; silinse geçmiş satırı sahipsiz kalır, dört göz izi kaybolurdu.
  'satin_alma_siparis_degisikligi.onaylayan_kisi_id -> kisi',
  'satin_alma_siparis_degisikligi.yapan_kisi_id -> kisi',
  'satin_alma_siparis_onerisi.oneren_kisi_id -> kisi',
  // 2414 a: birleşmiş kaynak ve kalemi kaynakta olan talep silinmez; silinse birleşik talep kaynağını, kalem geri döneceği yeri yitirirdi.
  // 3590: kısmi onayda kalanı ayrılan talep silinmez; silinse ayrılan talep kaynağını yitirirdi.
  'satin_alma_talep.ayrildigi_talep_id -> satin_alma_talep',
  'satin_alma_talep.birlesen_talep_id -> satin_alma_talep',
  // 2876: güncellemesi olan kök talep silinmez; silinse güncelleme talebi grubunu ve otomatik iptalin bağını yitirirdi (servis önce 409 ile reddeder).
  'satin_alma_talep.guncellenen_talep_id -> satin_alma_talep',
  'satin_alma_talep_kalemi.kaynak_talep_id -> satin_alma_talep',
  // Gerçek ihlal testi stokta: `stok.test.ts` DEP-14/12/13, DEP-09/13 ve DEP-57 bakiyeli konumu kapatmayı uçtan 409 BAGIMLI_KAYIT ile sınar.
  'stok_bakiye.konum_aktif -> stok_konum',
  'stok_bakiye.konum_id -> stok_konum',
];

describe('RESTRICT yabancı anahtar (bütün göçler, gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let sahip: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;
  const acik = (): { vt: Veritabani; sahip: Veritabani } => {
    if (!vt || !sahip) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return { vt, sahip };
  };

  before(async () => {
    const ortam = await testVeritabaniKur('kisitr');
    ({ vt, sahip, kaldir } = ortam);
  });
  after(async () => { await kaldir?.(); });

  test('şemadaki RESTRICT anahtarlar bilinen listedir: yenisi bu dosyada gerçek ihlal testiyle eklenir', async () => {
    const satirlar = await acik().sahip.sorgu<{ anahtar: string }>(
      `SELECT c.conrelid::regclass::text || '.' || a.attname || ' -> ' || c.confrelid::regclass::text AS anahtar
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f' AND (c.confdeltype = 'r' OR c.confupdtype = 'r')
          AND c.connamespace = current_schema()::regnamespace
        ORDER BY 1`,
    );
    assert.deepEqual(satirlar.map((s) => s.anahtar), RESTRICT_ANAHTARLARI);
  });

  test('kalibrasyon: kaydı olan aletin SQL ile silinmesi bu sunucuda hangi kodla düşerse düşsün 409 BAGIMLI_KAYIT; kaydı olmayan silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id");
    const alet = async (no: string): Promise<number> => (await s.tek<{ id: number }>(
      'INSERT INTO olcu_aleti (no, tur_id) SELECT $1, min(id) FROM olcu_aleti_turu RETURNING id', [no]))?.id ?? 0;
    const kayitli = await alet('R-KAYITLI');
    const bos = await alet('R-BOS');
    await s.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, '2026-10-01', $2, 'uygun')", [kayitli, kisi?.id]);

    const ham = await uygulama.tx((db) => db.sorgu('DELETE FROM olcu_aleti WHERE id = $1', [kayitli])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(ham);
    assert.notEqual(ihlal, null, 'sunucu kodu tanınmadı');
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.hata.durum, 409);
    assert.equal(ihlal?.iz.kisit, 'kalibrasyon_kaydi_alet_id_fkey');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));

    // Sınır katmanı: kural denetimi atlanmış bir yazma ucunda bile 500 değil 409.
    const app = Fastify();
    hataYonetiminiKur(app);
    uclariKaydet(app, [uc({
      yontem: 'POST', yol: '/aletler/:id/sil', yetki: 'acik',
      parametre: z.object({ id: z.coerce.number<number>().int() }), cevap: z.object({ tamam: z.literal(true) }),
      isle: async ({ db, parametre }) => { await db.sorgu('DELETE FROM olcu_aleti WHERE id = $1', [parametre.id]); return { tamam: true as const }; },
    })], { vt: uygulama, kimlik: async () => null });
    const red = await app.inject({ method: 'POST', url: `/api/aletler/${kayitli}/sil` });
    assert.equal(red.statusCode, 409, red.body);
    assert.equal(red.json().kod, 'BAGIMLI_KAYIT');
    assert.equal((await app.inject({ method: 'POST', url: `/api/aletler/${bos}/sil` })).statusCode, 200);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM olcu_aleti WHERE id = ANY($1)', [[kayitli, bos]]))?.n, 1);
    await app.close();
  });

  test('2397 b: onay basamağında kullanılan rolün silinmesi 409 BAGIMLI_KAYIT; basamaksız rol silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const rol = async (kod: string): Promise<number> => (await s.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]))!.id;
    const kullanilan = await rol('deneme_basamak_rolu');
    const bos = await rol('deneme_bos_rol');
    await s.sorgu("INSERT INTO satin_alma_onay_limiti (sira, azami_tutar, seviye, rol_id) VALUES (1, NULL, 'Deneme basamak', $1)", [kullanilan]);
    const ham = await uygulama.tx((db) => db.sorgu('DELETE FROM rol WHERE id = $1', [kullanilan])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(ham);
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.iz.kisit, 'satin_alma_onay_limiti_rol_id_fkey');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    await uygulama.tx((db) => db.sorgu('DELETE FROM rol WHERE id = $1', [bos]));
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM rol WHERE id = ANY($1)', [[kullanilan, bos]]))?.n, 1);
  });

  test('3442-7b a: onay basamağına yazılı kişinin silinmesi 409 BAGIMLI_KAYIT; basamaksız kişi silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = async (ad: string): Promise<number> => (await s.tek<{ id: number }>('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [ad]))!.id;
    const yazili = await kisi('Deneme Basamak Kişisi');
    const bos = await kisi('Deneme Boş Kişi');
    await s.sorgu("INSERT INTO satin_alma_onay_limiti (sira, azami_tutar, seviye) VALUES (9, NULL, 'Deneme kişili basamak')");
    await s.sorgu('INSERT INTO satin_alma_onay_limiti_kisi (sira, kisi_id) VALUES (9, $1)', [yazili]);
    const ham = await uygulama.tx((db) => db.sorgu('DELETE FROM kisi WHERE id = $1', [yazili])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(ham);
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.iz.kisit, 'satin_alma_onay_limiti_kisi_kisi_id_fkey');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    await uygulama.tx((db) => db.sorgu('DELETE FROM kisi WHERE id = $1', [bos]));
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM kisi WHERE id = ANY($1)', [[yazili, bos]]))?.n, 1);
  });

  test('3574-2a: sipariş değişikliği geçmişini yapan ya da onaylayan kişinin silinmesi 409 BAGIMLI_KAYIT; geçmişsiz kişi silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = async (ad: string): Promise<number> => (await s.tek<{ id: number }>('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [ad]))!.id;
    const yapan = await kisi('Deneme Değiştiren Kişi');
    const onaylayan = await kisi('Deneme Onaylayan Kişi');
    const bos = await kisi('Deneme Geçmişsiz Kişi');
    const talep = (await s.tek<{ id: string }>(
      "INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id) VALUES (gen_random_uuid(), 'RT-DEGISIK', $1, 'Deneme', $1) RETURNING id", [bos]))!.id;
    await s.sorgu(
      `INSERT INTO satin_alma_siparis_degisikligi (id, talep_id, teklif_id, degisiklik_no, sonuc, ozet, gerekce, yapan_kisi_id, onaylayan_kisi_id)
       VALUES (gen_random_uuid(), $1, gen_random_uuid(), 1, 'onaylandi', '[]'::jsonb, 'Deneme gerekçe', $2, $3)`, [talep, yapan, onaylayan]);
    for (const [id, ad] of [[yapan, 'satin_alma_siparis_degisikligi_yapan'], [onaylayan, 'satin_alma_siparis_degisikligi_onaylayan']] as const) {
      const ham = await uygulama.tx((db) => db.sorgu('DELETE FROM kisi WHERE id = $1', [id])).catch((h: unknown) => h);
      const ihlal = kisitIhlali(ham);
      assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
      assert.equal(ihlal?.iz.kisit, ad);
    }
    await s.sorgu('DELETE FROM satin_alma_talep WHERE id = $1', [talep]);
    await uygulama.tx((db) => db.sorgu('DELETE FROM kisi WHERE id = $1', [bos]));
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM kisi WHERE id = ANY($1)', [[yapan, onaylayan, bos]]))?.n, 2);
  });

  test('3574-1: bekleyen sipariş önerisini yazan kişinin silinmesi 409 BAGIMLI_KAYIT; önerisiz kişi silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = async (ad: string): Promise<number> => (await s.tek<{ id: number }>('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [ad]))!.id;
    const oneren = await kisi('Deneme Öneren Kişi');
    const bos = await kisi('Deneme Önerisiz Kişi');
    const talep = (await s.tek<{ id: string }>(
      "INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id) VALUES (gen_random_uuid(), 'RT-ONERI', $1, 'Deneme', $1) RETURNING id", [bos]))!.id;
    await s.sorgu("INSERT INTO satin_alma_siparis_onerisi (talep_id, govde, gerekce, oneren_kisi_id) VALUES ($1, '{}'::jsonb, 'Deneme gerekçe', $2)", [talep, oneren]);
    const ham = await uygulama.tx((db) => db.sorgu('DELETE FROM kisi WHERE id = $1', [oneren])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(ham);
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.iz.kisit, 'satin_alma_siparis_onerisi_oneren');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    await s.sorgu('DELETE FROM satin_alma_siparis_onerisi WHERE talep_id = $1', [talep]);
    await s.sorgu('DELETE FROM satin_alma_talep WHERE id = $1', [talep]);
    await uygulama.tx((db) => db.sorgu('DELETE FROM kisi WHERE id = $1', [bos]));
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM kisi WHERE id = ANY($1)', [[oneren, bos]]))?.n, 1);
  });

  test('2414 a: birleşik talebi ya da kalemi birleşikte olan kaynak talebi silmek 409 BAGIMLI_KAYIT; bağsız talep silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    let sayac = 0;
    const talep = async (birlesen: string | null = null): Promise<string> => (await s.tek<{ id: string }>(
      `INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id, birlesen_talep_id) VALUES (gen_random_uuid(), $3, $1, 'Deneme', $1, $2) RETURNING id`,
      [kisi, birlesen, `RT-${++sayac}`]))!.id;
    const birlesik = await talep();
    const kaynak = await talep(birlesik);
    const kalemKaynagi = await talep();
    const bos = await talep();
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, kaynak_talep_id, kaynak_sira) VALUES ($1, gen_random_uuid(), 1, 'Deneme kalem', $2, 1)", [birlesik, kalemKaynagi]);
    const sil = (id: string) => uygulama.tx((db) => db.sorgu('DELETE FROM satin_alma_talep WHERE id = $1', [id])).catch((h: unknown) => h);
    for (const [id, kisit] of [[birlesik, 'satin_alma_talep_birlesen'], [kalemKaynagi, 'satin_alma_talep_kalemi_kaynak']] as const) {
      const ihlal = kisitIhlali(await sil(id));
      assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT', kisit);
      assert.equal(ihlal?.iz.kisit, kisit);
      assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    }
    await sil(bos);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep WHERE id = ANY($1)', [[birlesik, kaynak, kalemKaynagi, bos]]))?.n, 3);
  });

  test('2876: güncellemesi olan kök talebi silmek 409 BAGIMLI_KAYIT; güncelleme talebi ve bağsız talep silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    let sayac = 0;
    const talep = async (guncellenen: string | null = null): Promise<string> => (await s.tek<{ id: string }>(
      `INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id, guncellenen_talep_id) VALUES (gen_random_uuid(), $3, $1, 'Deneme', $1, $2) RETURNING id`,
      [kisi, guncellenen, `RG-${++sayac}`]))!.id;
    const kok = await talep();
    const guncelleme = await talep(kok);
    const bos = await talep();
    const sil = (id: string) => uygulama.tx((db) => db.sorgu('DELETE FROM satin_alma_talep WHERE id = $1', [id])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(await sil(kok));
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.hata.durum, 409);
    assert.equal(ihlal?.iz.kisit, 'satin_alma_talep_guncellenen');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    await sil(guncelleme);
    await sil(bos);
    assert.deepEqual((await s.sorgu<{ id: string }>('SELECT id FROM satin_alma_talep WHERE id = ANY($1)', [[kok, guncelleme, bos]])).map((x) => x.id), [kok]);
    // Güncellemesi silinen kök artık bağsızdır, silinir.
    await sil(kok);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep WHERE id = $1', [kok]))?.n, 0);
  });

  test('3590: kalanı ayrılan talebi silmek 409 BAGIMLI_KAYIT; ayrılan talep ve bağsız talep silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    let sayac = 0;
    const talep = async (ayrildigi: string | null = null): Promise<string> => (await s.tek<{ id: string }>(
      `INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id, ayrildigi_talep_id) VALUES (gen_random_uuid(), $3, $1, 'Deneme', $1, $2) RETURNING id`,
      [kisi, ayrildigi, `RA-${++sayac}`]))!.id;
    const kok = await talep();
    const ayrilan = await talep(kok);
    const sil = (id: string) => uygulama.tx((db) => db.sorgu('DELETE FROM satin_alma_talep WHERE id = $1', [id])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(await sil(kok));
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.hata.durum, 409);
    assert.equal(ihlal?.iz.kisit, 'satin_alma_talep_ayrildigi');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    await sil(ayrilan);
    await sil(kok);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_talep WHERE id = ANY($1)', [[kok, ayrilan]]))?.n, 0);
  });

  test('2540: tedarikçi alacağı olan siparişi silmek 409 BAGIMLI_KAYIT (düşüldü alacak da); alacağı olmayan sipariş silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    const firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Tedarikçi', 'tedarikci', $1) RETURNING id", [kisi]))!.id;
    const talep = (await s.tek<{ id: string }>(
      "INSERT INTO satin_alma_talep (id, no, acan_kisi_id, baslik, talep_eden_kisi_id) VALUES (gen_random_uuid(), 'RT-2540', $1, 'Deneme', $1) RETURNING id", [kisi]))!.id;
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [talep]);
    const siparis = async (): Promise<string> => {
      const teklif = (await s.tek<{ id: string }>("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi) VALUES ($1, gen_random_uuid(), 'TRY', current_date) RETURNING id", [talep]))!.id;
      await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [talep, teklif]);
      return teklif;
    };
    const [alacakli, dusulmus, bos] = [await siparis(), await siparis(), await siparis()];
    const alacak = (teklif: string, durum: string) => s.sorgu(
      `INSERT INTO finans_tedarikci_alacagi (satin_alma_talep_id, satin_alma_teklif_id, siparis_no, firma_id, para_birimi, tutar, olusturan_id, durum, aciklama, durum_degistiren_id, durum_zamani)
       VALUES ($1, $2, 'DENEME', $3, 'TRY', 10, $4::int, $5::text, CASE WHEN $5::text = 'teyit_bekliyor' THEN NULL ELSE 'Deneme' END,
               CASE WHEN $5::text = 'teyit_bekliyor' THEN NULL ELSE $4::int END, CASE WHEN $5::text = 'teyit_bekliyor' THEN NULL ELSE now() END)`,
      [talep, teklif, firma, kisi, durum]);
    await alacak(alacakli, 'teyit_bekliyor');
    await alacak(dusulmus, 'dusuldu');
    const sil = (teklif: string) => uygulama.tx((db) => db.sorgu('DELETE FROM satin_alma_siparis WHERE talep_id = $1 AND teklif_id = $2', [talep, teklif])).catch((h: unknown) => h);
    for (const teklif of [alacakli, dusulmus]) {
      const ihlal = kisitIhlali(await sil(teklif));
      assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
      assert.equal(ihlal?.hata.durum, 409);
      assert.equal(ihlal?.iz.kisit, 'finans_tedarikci_alacagi_siparis');
      assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    }
    await sil(bos);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_siparis WHERE talep_id = $1', [talep]))?.n, 2);
  });

  test('3320 a: ara adımın çıktısı olan malzeme kartını silmek 409 BAGIMLI_KAYIT; çıktısız kart silinir', async () => {
    const { vt: uygulama, sahip: s } = acik();
    const kisi = (await s.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id"))!.id;
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek) VALUES ('RRR-') ON CONFLICT (onek) DO NOTHING");
    let sira = 0;
    const kart = async (tur: string): Promise<number> => {
      const kimlik = `rrr-${String(++sira)}`;
      return (await s.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, $2, 'RRR-', $3, 'aktif', $4, $5, $5) RETURNING no`,
        [kimlik, tur, sira, JSON.stringify({ id: kimlik, com: { ad: `Deneme ${String(sira)}`, birim: 'adet' } }), kisi]))!.no;
    };
    const mamul = await kart('mamul');
    const ym = await kart('yarimamul');
    const bos = await kart('yarimamul');
    const rev = (await s.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2) RETURNING id", [mamul, kisi]))!.id;
    await s.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, 10, $2)', [mamul, rev]);
    const adim = (await s.tek<{ id: number }>(
      "INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad) VALUES ($1, $2, 10, 1, 1, 'Deneme') RETURNING id", [rev, mamul]))!.id;
    await s.sorgu('INSERT INTO rota_adim_ciktisi (adim_id, cikti_malzeme_id) VALUES ($1, $2)', [adim, ym]);

    const sil = (no: number) => uygulama.tx((db) => db.sorgu('DELETE FROM malzeme_katalog_karti WHERE no = $1', [no])).catch((h: unknown) => h);
    const ihlal = kisitIhlali(await sil(ym));
    assert.equal(ihlal?.hata.kod, 'BAGIMLI_KAYIT');
    assert.equal(ihlal?.hata.durum, 409);
    assert.equal(ihlal?.iz.kisit, 'rota_adim_ciktisi_cikti_malzeme_id_fkey');
    assert.ok(['23503', '23001'].includes(String(ihlal?.iz.pgKodu)));
    await sil(bos);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM malzeme_katalog_karti WHERE no = ANY($1)', [[ym, bos]]))?.n, 1);
    assert.equal((await s.tek<{ n: number }>('SELECT count(*)::int AS n FROM rota_adim_ciktisi WHERE adim_id = $1 AND cikti_malzeme_id = $2', [adim, ym]))?.n, 1);
  });
});
