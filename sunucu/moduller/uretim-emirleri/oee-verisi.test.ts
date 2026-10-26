import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { aralikAdetleri, kirilimStandartSureleri, makineKullanimAraliklari, makineSayimAnlari, makineSureleri, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';

// OEE'nin zamanlı okumaları (643, 644): kullanım parçaları ve an an sayım, mevcut toplam okumalarla aynı yere ve aynı toplama düşer.
describe('uretim-emirleri OEE okumaları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let istasyonId = 0;
  let hurdaNedeni = 0;
  let sayac = 0;
  let planlamaci: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function makineKur(): Promise<number> {
    sayac += 1;
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`OEV${sayac}`, 'Tezgah', istasyonId]))!.id;
  }
  const adim = (sira: number, makineId: number, birimSureDk: string | null): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk, terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = (...adimlar: IsEmriGirdisi[]) => o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
    malzemeNo: urunNo, adet: 100, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: adimlar,
  }));
  const kullanim = (emirId: number, isEmriId: number, makineId: number, baslama: string, bitis: string | null) => o().sahip.sorgu(
    `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, CASE WHEN $7::timestamptz IS NULL THEN NULL ELSE $5::int END)`,
    [emirId, isEmriId, istasyonId, makineId, yoneticiId, baslama, bitis],
  );
  const sayim = (emirId: number, isEmriId: number, tur: 'saglam' | 'hurda' | 'karar_bekliyor' | 'red', adet: number, zaman: string) => o().sahip.sorgu(
    `INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme, zaman, is_emri_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9)`,
    [emirId, yoneticiId, istasyonId, tur, adet, tur === 'hurda' ? hurdaNedeni : null, adet < 0 || tur === 'red', zaman, isEmriId],
  );
  const ms = (x: string) => Date.parse(x);

  before(async () => {
    ortam = await testVeritabaniKur('uretim_oee_verisi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.OEV', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    planlamaci = (await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Planlama', kullaniciAdi: 'planlama_proje', parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
      return kullaniciYukle(db, yeni);
    }))!;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('OEV-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('OEV-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('oev-dnm-1', 'mamul', 'OEV-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'oev-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('OEVM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('OEVI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    hurdaNedeni = (await ortam.sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('OEV-H1', 'Ölçü dışı', 971) RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('kullanım parçaları pencereyle kesilir, sırayla gelir; toplamı makineSureleri ile aynıdır; açık kullanım şimdiye kadardır', async () => {
    const m1 = await makineKur();
    const m2 = await makineKur();
    const bos = await makineKur();
    const { uretimEmriId: e1, isEmriIdleri: [i1] } = await ac(adim(1, m1, '2'));
    const { uretimEmriId: e2, isEmriIdleri: [i2] } = await ac(adim(1, m2, '2'));
    await kullanim(e1, i1!, m1, '2026-04-01T07:00:00+03:00', '2026-04-01T09:00:00+03:00');
    await kullanim(e1, i1!, m1, '2026-04-01T13:00:00+03:00', '2026-04-01T14:30:00+03:00');
    await kullanim(e1, i1!, m1, '2026-04-01T20:00:00+03:00', '2026-04-02T01:00:00+03:00');
    const acikBas = new Date(Date.now() - 3_600_000).toISOString();
    await kullanim(e2, i2!, m2, acikBas, null);

    const bas = '2026-04-01T08:00:00+03:00';
    const bit = '2026-04-01T23:00:00+03:00';
    const parcalar = await makineKullanimAraliklari(o().vt, [m1, bos, m1], bas, bit);
    assert.deepEqual([...parcalar.keys()], [m1], 'kullanımı olmayan makine yok, kimlik tekilleşir');
    assert.deepEqual(parcalar.get(m1)!.map((a) => [ms(a.baslangic), ms(a.bitis)]), [
      [ms('2026-04-01T08:00:00+03:00'), ms('2026-04-01T09:00:00+03:00')],
      [ms('2026-04-01T13:00:00+03:00'), ms('2026-04-01T14:30:00+03:00')],
      [ms('2026-04-01T20:00:00+03:00'), ms('2026-04-01T23:00:00+03:00')],
    ]);
    const toplam = parcalar.get(m1)!.reduce((t, a) => t + (ms(a.bitis) - ms(a.baslangic)) / 1000, 0);
    assert.equal(toplam, (await makineSureleri(o().vt, [m1], bas, bit)).get(m1));

    const yarin = new Date(Date.now() + 86_400_000).toISOString();
    const acik = (await makineKullanimAraliklari(o().vt, [m2], acikBas, yarin)).get(m2)!;
    assert.equal(acik.length, 1);
    assert.ok(ms(acik[0]!.bitis) <= Date.now() && ms(acik[0]!.bitis) > Date.now() - 60_000, 'açık kullanım okuma anında biter');
    assert.equal((await makineKullanimAraliklari(o().vt, [], bas, bit)).size, 0);
  });

  test('an an sayım: red ayrı, karar bekleyen yok, düzeltme düşer; toplamlar aralikAdetleri ve kirilimStandartSureleri ile aynı', async () => {
    const m1 = await makineKur();
    const m2 = await makineKur();
    const { uretimEmriId: e1, isEmriIdleri: [sureli, suresiz] } = await ac(adim(1, m1, '1.5'), adim(2, m2, null));
    await kullanim(e1, sureli!, m1, '2026-04-03T08:00:00+03:00', '2026-04-03T12:00:00+03:00');
    await kullanim(e1, suresiz!, m2, '2026-04-03T08:00:00+03:00', '2026-04-03T12:00:00+03:00');
    await sayim(e1, sureli!, 'saglam', 10, '2026-04-03T09:00:00+03:00');
    await sayim(e1, sureli!, 'hurda', 2, '2026-04-03T09:00:00+03:00');
    await sayim(e1, sureli!, 'karar_bekliyor', 4, '2026-04-03T10:00:00+03:00');
    await sayim(e1, sureli!, 'karar_bekliyor', -4, '2026-04-03T11:00:00+03:00');
    await sayim(e1, sureli!, 'red', 4, '2026-04-03T11:00:00+03:00');
    await sayim(e1, sureli!, 'saglam', -1, '2026-04-03T11:30:00+03:00');
    await sayim(e1, suresiz!, 'saglam', 3, '2026-04-03T10:00:00+03:00');
    await sayim(e1, sureli!, 'saglam', 99, '2026-04-04T09:00:00+03:00');

    const bas = '2026-04-03T00:00:00+03:00';
    const bit = '2026-04-04T00:00:00+03:00';
    const anlar = await makineSayimAnlari(o().vt, [m1, m2], bas, bit);
    assert.deepEqual(anlar.get(m1)!.map((a) => ({ ...a, zaman: ms(a.zaman) })), [
      { zaman: ms('2026-04-03T09:00:00+03:00'), saglam: 10, hurda: 2, red: 0, standartSaniye: 900, suresizSaglam: 0 },
      { zaman: ms('2026-04-03T11:00:00+03:00'), saglam: 0, hurda: 0, red: 4, standartSaniye: 0, suresizSaglam: 0 },
      { zaman: ms('2026-04-03T11:30:00+03:00'), saglam: -1, hurda: 0, red: 0, standartSaniye: -90, suresizSaglam: 0 },
    ], 'karar bekleyen satırı gelmez; pencere dışı sayım yok');
    assert.deepEqual(anlar.get(m2)!.map((a) => [a.saglam, a.standartSaniye, a.suresizSaglam]), [[3, 0, 3]], 'birim süresiz sağlam ayrı');

    const adet = await aralikAdetleri(o().vt, 'makine', [m1, m2], bas, bit);
    const standart = await kirilimStandartSureleri(o().vt, 'makine', [m1, m2], bas, bit);
    for (const m of [m1, m2]) {
      const l = anlar.get(m)!;
      const topla = (f: (a: (typeof l)[number]) => number) => l.reduce((t, a) => t + f(a), 0);
      assert.deepEqual({ saglam: topla((a) => a.saglam), hurda: topla((a) => a.hurda) }, adet.get(m));
      assert.deepEqual({ standartSaniye: Math.round(topla((a) => a.standartSaniye)), suresizSaglam: topla((a) => a.suresizSaglam) }, standart.get(m));
    }
    assert.equal((await makineSayimAnlari(o().vt, [], bas, bit)).size, 0);
  });
});
