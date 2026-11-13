import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { hazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { HazirlikMaddesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hazirlik, hazirlikCozucusuKaydet, muafiyetVer } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import type { HazirlikBilgisi } from './kurallar.ts';

// 2060 a: hazırlık cevabı matris satırlarını (iş emri başına durum) da taşır. Emir görünümündeki madde hâli ve başlatma denetimi
// değişmez; biten iş emri satırda görünür ama emir hâlini etkilemez.
describe('uretim-emirleri hazırlık matrisi (2060, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let revId = 0;
  let makineId = 0;
  let planlamaci: Kullanici;
  let mudur: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    return k;
  }
  const adim = (sira: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hazirlik_matrisi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HZM', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlamaci = await kisiEkle('planlama_proje', 'planlama_proje');
    mudur = await kisiEkle('mudur', 'mudur');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HZM-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HZM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hzm-dnm-1', 'mamul', 'HZM-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'hzm-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    revId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('HZMM', 'Deneme Merkezi') RETURNING id");
    const istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('HZMI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('HZM1', 'Tezgah', $1) RETURNING id", [istasyonId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('iş emri düzeyindeki madde satır satır, emir geneli madde yalnız emir görünümünde; muafiyet yalnız kendi satırını değiştirir', async () => {
    const { uretimEmriId: id, isEmriIdleri: [ie1, ie2, ie3] } = await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(1), adim(2), adim(3)],
    }));
    const cnc = new Map<number, HazirlikBilgisi>([[ie1!, { durum: 'tamam', secildi: true }], [ie2!, { durum: 'yok', secildi: true }]]);
    const cozucu = (m: HazirlikMaddesi): HazirlikCozucusu => async (_db, idler) =>
      (m === 'cnc' ? new Map(idler.flatMap((x) => (cnc.has(x) ? [[x, cnc.get(x)!] as const] : [])))
        : new Map(idler.map((x) => [x, { durum: m === 'cizim' ? 'suruyor' : 'tamam', secildi: true } as const])));
    const onceki = (['cnc', 'cizim'] as const).map((m) => [m, hazirlikCozucusuKaydet(m, cozucu(m))] as const);
    try {
      const v = hazirlikCevabi.parse(await o().vt.okumaTx((db) => hazirlik(db, id)));
      // Özel proses matristen çıktı (2146-1 a); uyaran maddelerin hâli kendi testinde (hazirlik-uyari.test.ts), çözücüleri kablolamaya bağlı.
      assert.deepEqual(v.maddeler.map((m) => [m.madde, m.isEmriDuzeyi]), [
        ['cnc', true], ['cizim', false], ['yayin', true], ['rota', false], ['malzeme', true], ['takim-omru', true], ['takim-hazirla', true], ['makine', true], ['talimat', true], ['ek-madde', true], ['aparat', true], ['olcu-aleti', true],
      ]);
      assert.deepEqual(v.maddeler.slice(0, 2).map((m) => [m.madde, m.durum]), [['cnc', 'eksik'], ['cizim', 'eksik']]);
      assert.deepEqual(v.isEmirleri.map((s) => [s.isEmriId, s.opNo, s.bitti, s.maddeler.filter((m) => m.madde === 'cnc').map((m) => [m.madde, m.durum])]), [
        [ie1, 10, false, [['cnc', 'tamam']]],
        [ie2, 20, false, [['cnc', 'eksik']]],
        [ie3, 30, false, [['cnc', 'bilinmiyor']]],
      ], 'çözücünün bilmediği iş emri bilinmiyor kalır; emir geneli madde satıra konmaz');

      const sonra = await o().vt.tx((db) => muafiyetVer(db, mudur, id, { madde: 'cnc', isEmriId: ie2!, gerekce: 'Program elde denendi' }));
      assert.deepEqual(sonra.isEmirleri.map((s) => s.maddeler[0]?.durum), ['tamam', 'muaf', 'bilinmiyor'], 'iş emri muafiyeti yalnız kendi satırında');

      await o().sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = now(), bitis = now(), saglam_adet = 10 WHERE id = $1", [ie3]);
      cnc.set(ie3!, { durum: 'yok', secildi: true });
      const bitti = await o().vt.okumaTx((db) => hazirlik(db, id));
      assert.deepEqual(bitti.isEmirleri.map((s) => [s.isEmriId, s.bitti, s.maddeler[0]?.durum]), [[ie1, false, 'tamam'], [ie2, false, 'muaf'], [ie3, true, 'eksik']]);
      assert.equal(bitti.maddeler.find((m) => m.madde === 'cnc')?.durum, 'muaf', 'biten iş emrinin eksiği emir hâlini bozmaz');
    } finally {
      for (const [m, c] of onceki) hazirlikCozucusuKaydet(m, c);
    }
  });

  test('iş emri düzeyindeki maddenin çözücüsü kayıtsızsa satırlar bilinmiyor kalır', async () => {
    const { uretimEmriId: id } = await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      malzemeNo: urunNo, adet: 5, teslim: null, kaynakRotaRevizyonId: revId, projeId, isEmirleri: [adim(1)],
    }));
    const onceki = hazirlikCozucusuKaydet('cnc', null);
    try {
      const v = await o().vt.okumaTx((db) => hazirlik(db, id));
      assert.deepEqual(v.isEmirleri.map((s) => s.maddeler.filter((m) => m.madde === 'cnc').map((m) => m.durum)), [['bilinmiyor']]);
    } finally {
      hazirlikCozucusuKaydet('cnc', onceki);
    }
  });
});
