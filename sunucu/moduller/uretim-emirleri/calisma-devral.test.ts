import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { calismaDevral, emirBaslat, katilimDuraklat, katilimlar, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';

// ARK-5 b: makineli istasyonda başkasının açık çalışmasıyla süren iş devralınır; iş durmaz, çalışma ve makine kullanımı devralana geçer. Adlar uydurmadır.
describe('uretim-emirleri çalışma devralma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  let planlama: Kullanici;
  let ali: Kullanici;
  let veli: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);
  const reddeder = async (is: Promise<unknown>, mesaj: RegExp): Promise<void> => {
    await assert.rejects(is, (h: unknown) => h instanceof UygulamaHatasi && mesaj.test(h.mesaj));
  };

  async function kisi(kullaniciAdi: string, rolKodu: string): Promise<Kullanici> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    return k;
  }

  async function makine(): Promise<{ makineId: number; istasyonId: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`CDV${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`CDVI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makineId = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`CDVM${sayac}`, 'Tezgah', ist]))!.id;
    return { makineId, istasyonId: ist };
  }

  const adim = (makineId: number): IsEmriGirdisi => ({
    sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });

  // İstasyonun ekibine kişi ekler (devralma katılım gibi ekip ister).
  async function ekibe(istasyonId: number, kisiId: number): Promise<void> {
    sayac += 1;
    const ekip = (await o().sahip.tek<{ id: number }>('INSERT INTO ekip (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`CDVE${sayac}`, 'Deneme ekibi', istasyonId]))!.id;
    await o().sahip.sorgu('INSERT INTO ekip_uye (ekip_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, current_date, 10)', [ekip, kisiId]);
  }

  // Ali (ekipte değil) tek adımlı işi makinede başlatır; Veli istasyonun ekibindedir (ekipli: false ise değil).
  async function calisanIs(ekipli = true): Promise<{ id: number; ie: number; makineId: number; istasyonId: number }> {
    const { makineId, istasyonId } = await makine();
    if (ekipli) await ekibe(istasyonId, veli.id);
    const r = await tx((db) => uretimEmriAc(db, planlama, {
      malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(makineId)], projeId,
    }));
    const [ie] = r.isEmriIdleri as [number];
    await tx((db) => emirBaslat(db, ali, r.uretimEmriId, [makineId], undefined, ie));
    return { id: r.uretimEmriId, ie, makineId, istasyonId };
  }
  const acikKullanim = (id: number) => o().sahip.sorgu<{ kisiId: number; makineId: number | null }>(
    'SELECT kisi_id AS "kisiId", makine_id AS "makineId" FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL', [id]);
  const adimDurumu = async (ie: number) => (await o().sahip.tek<{ durum: string }>('SELECT durum FROM uretim_emirleri_is_emri WHERE id = $1', [ie]))?.durum;

  before(async () => {
    ortam = await testVeritabaniKur('ue_calisma_devral');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.CDV', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlama = await kisi('planlama_proje', 'planlama_proje');
    ali = await kisi('ali', 'operator');
    veli = await kisi('veli', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('CDV-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('CDV-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('cdv-dnm-1', 'mamul', 'CDV-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'cdv-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('Veli, Ali\'nin açık çalışmasını devralır: Ali duraklatılmış kapanır, Veli açık, makine Veli\'de, adım sürer', async () => {
    const { id, ie, makineId } = await calisanIs();
    const cevap = await tx((db) => calismaDevral(db, veli, id, undefined, ie));
    const acik = cevap.katilimlar.filter((k) => k.cikis === null);
    assert.deepEqual(acik.map((k) => k.kisi.id), [veli.id]);
    assert.equal(cevap.katilimlar.find((k) => k.kisi.id === ali.id)?.kapanis, 'duraklat');
    assert.deepEqual(await acikKullanim(id), [{ kisiId: veli.id, makineId }]);
    assert.equal(await adimDurumu(ie), 'calisiyor');
    await reddeder(tx((db) => calismaDevral(db, veli, id, undefined, ie)), /zaten çalışıyorsunuz/);
    // Ali ekipte değil ama bu işte duraklatılmış çalışması var: geri devralabilir (katılımdaki dönüş gibi); iş yine durmaz.
    const geri = await tx((db) => calismaDevral(db, ali, id, undefined, ie));
    assert.deepEqual(geri.katilimlar.filter((k) => k.cikis === null).map((k) => k.kisi.id), [ali.id]);
    assert.deepEqual(await acikKullanim(id), [{ kisiId: ali.id, makineId }]);
  });

  test('istasyon ekibinde olmayan kişi devralamaz; hiçbir şey değişmez, ekibe girince devralır', async () => {
    const { id, ie, makineId, istasyonId } = await calisanIs(false);
    await reddeder(tx((db) => calismaDevral(db, veli, id, undefined, ie)), /ekibinde değilsiniz/);
    const sonra = await tx((db) => katilimlar(db, id));
    assert.deepEqual(sonra.katilimlar.filter((k) => k.cikis === null).map((k) => k.kisi.id), [ali.id]);
    assert.deepEqual(await acikKullanim(id), [{ kisiId: ali.id, makineId }]);
    await ekibe(istasyonId, veli.id);
    const ok = await tx((db) => calismaDevral(db, veli, id, undefined, ie));
    assert.deepEqual(ok.katilimlar.filter((k) => k.cikis === null).map((k) => k.kisi.id), [veli.id]);
  });

  test('işte başka açık çalışma yoksa devralma reddedilir', async () => {
    const { id, ie } = await calisanIs();
    await tx((db) => katilimDuraklat(db, ali, id, undefined, ie));
    await reddeder(tx((db) => calismaDevral(db, veli, id, undefined, ie)), /devralınacak başka bir çalışma yok/);
    assert.deepEqual((await tx((db) => katilimlar(db, id))).katilimlar.filter((k) => k.cikis === null), []);
  });
});
