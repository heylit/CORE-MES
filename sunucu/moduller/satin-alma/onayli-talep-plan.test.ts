import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { onayliTalepGelisleri } from './disari.ts';
import { onayliTalepGelisi } from './kurallar.ts';
import { talepGelisleriOku } from './sorgular.ts';
import { degisenMalzemeler } from './termin-olayi.ts';

// 3256-2: onaylanmış, siparişi verilmemiş talep plana gelecek malzeme olarak girer. Veriler uydurmadır.
describe('satin-alma onaylı talebin plana gelişi (3256-2)', () => {
  test('geliş bugün + teklifin termin günüdür; termin günü yoksa ya da geçersizse boştur', () => {
    assert.equal(onayliTalepGelisi('2099-01-30', 14), '2099-02-13');
    assert.equal(onayliTalepGelisi('2099-01-30', 0), '2099-01-30');
    assert.equal(onayliTalepGelisi('2099-01-30', null), null);
    assert.equal(onayliTalepGelisi('2099-01-30', -1), null);
  });
});

describe('satin-alma onaylı talep okuması (3256-2, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  after(async () => { await ortam?.kaldir(); });

  test('yalnız son onayı "onay" olan, karardaki teklifi bulunan, siparişe geçmemiş malzeme kalemi gelir', async () => {
    ortam = await testVeritabaniKur('satin_alma_onayli_talep_plan');
    const s = ortam.sahip;
    const kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await s.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('OT-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (sira: number) => (await s.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'OT-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`ot-dnm-${sira}`, sira, JSON.stringify({ id: `ot-dnm-${sira}`, com: { ad: 'Deneme çubuk' } }), kisiId]))!.no;
    const [m1, m2, m3] = [await kart(1), await kart(2), await kart(3)];
    const im = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('OTM', 'Deneme Merkezi') RETURNING id"))!.id;
    const ist = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('OTI', 'Deneme istasyon', $1) RETURNING id", [im]))!.id;
    const emir = (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ('P-OT', 'Deneme parça', 5, $1, $2, 'planli') RETURNING id", [ist, kisiId]))!.id;
    const tip = (await s.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('OT-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const isEmri = (await s.tek<{ id: number }>(
      "INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, 1, 10, $2, 'Deneme fason') RETURNING id", [emir, tip]))!.id;

    let sira = 0;
    interface Kalem { malzeme: number; miktar?: string; terminGun?: number | null; kararda?: boolean; isEmri?: number; siparis?: boolean }
    const talep = async (durum: string, mod: 'tek' | 'bolunmus', onaylar: ('onay' | 'ret')[], kalemler: Kalem[]) => {
      sira += 1;
      const t = randomUUID();
      await s.sorgu(`INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum)
                     VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, $4)`, [t, 81000 + sira, kisiId, durum]);
      const tek = randomUUID();
      await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, termin_gun) VALUES ($1, $2, 'TRY', current_date, 30)", [t, tek]);
      await s.sorgu('INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, $2, $3, current_date)', [t, mod, mod === 'tek' ? tek : null]);
      for (const [n, k] of kalemler.entries()) {
        const [kl, katalog, q] = [randomUUID(), randomUUID(), randomUUID()];
        await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, k.malzeme]);
        await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id, miktar, birim, is_emri_id) VALUES ($1, $2, $3, 'Deneme kalem', $4, $5, 'kg', $6)",
          [t, kl, n + 1, katalog, k.miktar ?? '12.5000', k.isEmri ?? null]);
        if (mod === 'tek') {
          if (k.terminGun !== undefined) await s.sorgu('UPDATE satin_alma_teklif SET termin_gun = $3 WHERE talep_id = $1 AND id = $2', [t, tek, k.terminGun]);
        } else {
          await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, sira, para_birimi, teklif_tarihi, termin_gun) VALUES ($1, $2, $3, 'TRY', current_date, $4)",
            [t, q, n + 1, k.terminGun ?? null]);
          if (k.kararda !== false) await s.sorgu('INSERT INTO satin_alma_karar_kalemi (talep_id, kalem_id, teklif_id) VALUES ($1, $2, $3)', [t, kl, q]);
        }
        if (k.siparis) {
          await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id, no) VALUES ($1, $2, $3)', [t, tek, `SP-2099-${String(sira)}`]);
          await s.sorgu("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, 10, 'kg')", [t, tek, kl]);
        }
      }
      for (const sonuc of onaylar) {
        await s.sorgu('INSERT INTO satin_alma_onay (id, talep_id, kisi_id, sonuc, notlar) VALUES ($1, $2, $3, $4, $5)',
          [randomUUID(), t, kisiId, sonuc, sonuc === 'ret' ? 'Deneme ret' : '']);
      }
      return (await s.tek<{ no: string }>('SELECT no FROM satin_alma_talep WHERE id = $1', [t]))!.no;
    };

    const tekli = await talep('onayda', 'tek', ['onay'], [{ malzeme: m1, terminGun: 14 }]);
    const bolunmus = await talep('onayda', 'bolunmus', ['ret', 'onay'], [{ malzeme: m1, terminGun: 5 }, { malzeme: m2, terminGun: null }, { malzeme: m3, kararda: false }]);
    await talep('onayda', 'tek', [], [{ malzeme: m2 }]);
    await talep('onayda', 'tek', ['onay', 'ret'], [{ malzeme: m2 }]);
    await talep('degerlendirme', 'tek', ['onay'], [{ malzeme: m2 }]);
    await talep('siparis_verildi', 'tek', ['onay'], [{ malzeme: m3, siparis: true }]);
    await talep('onayda', 'tek', ['onay'], [{ malzeme: m3, isEmri }]);
    await talep('onayda', 'tek', ['onay'], [{ malzeme: m3, siparis: true }]);

    await s.sorgu("UPDATE satin_alma_teklif SET tedarikci_adi = 'Deneme Tedarikçi' WHERE talep_id = (SELECT id FROM satin_alma_talep WHERE no = $1)", [tekli]);
    const g = await onayliTalepGelisleri(ortam.vt, [m1, m2, m3, m1], '2099-01-30');
    const anahtarsiz = (l: Awaited<ReturnType<typeof onayliTalepGelisleri>> extends Map<number, (infer G)[]> ? G[] | undefined : never) => l?.map(({ satirId: _, ...x }) => x);
    assert.deepEqual(anahtarsiz(g.get(m1)), [
      { tarih: '2099-02-13', miktar: '12.5', birim: 'kg', siparisNo: tekli, tedarikciAdi: 'Deneme Tedarikçi' },
      { tarih: '2099-02-04', miktar: '12.5', birim: 'kg', siparisNo: bolunmus, tedarikciAdi: null },
    ]);
    assert.deepEqual(anahtarsiz(g.get(m2)), [{ tarih: null, miktar: '12.5', birim: 'kg', siparisNo: bolunmus, tedarikciAdi: null }], 'termin günü olmayan teklif tarihsiz gelir');
    assert.equal(g.has(m3), false, 'karara girmemiş, sipariş satırı olan, fason ve sipariş verilmiş kalem gelmez');
    assert.equal((await onayliTalepGelisleri(ortam.vt, [], '2099-01-30')).size, 0);

    // Canlı planın eskime karşılaştırması (3258 kapsamı): onaylı talebin kalemi talebin gelişleri arasındadır; onay geri alınınca çıkar.
    const id = async (no: string) => (await s.tek<{ id: string }>('SELECT id FROM satin_alma_talep WHERE no = $1', [no]))!.id;
    const once = await talepGelisleriOku(ortam.vt, await id(bolunmus));
    assert.deepEqual(once.map((x) => [x.malzemeNo, x.tarih, x.miktar]).sort((a, b) => Number(a[0]) - Number(b[0])), [[m1, null, '12.5000'], [m2, null, '12.5000']]);
    assert.ok(once.every((x) => x.satirId < 0), 'talep kaleminin anahtarı sipariş satırı kimliğiyle karışmaz');
    const bolunmusAnahtarlari = [...g.values()].flat().filter((x) => x.siparisNo === bolunmus).map((x) => x.satirId).sort((a, b) => a - b);
    assert.deepEqual(bolunmusAnahtarlari, once.map((x) => x.satirId).sort((a, b) => a - b), 'plana giden gelişin anahtarı talebin geliş anahtarıyla aynıdır');
    assert.equal(new Set([...g.values()].flat().map((x) => x.satirId)).size, [...g.values()].flat().length, 'anahtar tekildir');
    await s.sorgu("INSERT INTO satin_alma_onay (id, talep_id, kisi_id, sonuc, notlar) VALUES ($1, $2, $3, 'ret', 'Deneme ret')", [randomUUID(), await id(bolunmus), kisiId]);
    const sonra = await talepGelisleriOku(ortam.vt, await id(bolunmus));
    assert.deepEqual(sonra, []);
    assert.deepEqual(degisenMalzemeler(once, sonra), [m1, m2].sort((a, b) => a - b));
  });
});
