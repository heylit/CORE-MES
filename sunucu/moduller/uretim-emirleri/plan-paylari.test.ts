import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { emirBaslat, uretimEmriAc } from './disari.ts';
import * as servis from './servis.ts';
import type { PlanPayi } from './kurallar.ts';
import type { IsEmriGirdisi } from './disari.ts';

// 1979 (2003 c): plandaki pay terminalde izindir. Payı olan kişi ekip dışından katılır, payı olan makine çalışan adıma eklenir; pay
// ilerlemesi kişinin adımdaki sağlamıdır. Plan çözücüsü testte sahtedir. Adlar uydurmadır.
describe('uretim-emirleri plan payları terminalde (gerçek PostgreSQL)', () => {
  let paylar: PlanPayi[] = [];
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

  async function makine(): Promise<{ makineId: number; istasyonId: number; ikinci: number; ucuncu: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`PPY${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`PPYI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makineId = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`PPYM${sayac}`, 'Tezgah', ist]))!.id;
    const ikinci = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`PPYN${sayac}`, 'Tezgah 2', ist]))!.id;
    const ucuncu = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`PPYU${sayac}`, 'Tezgah 3', ist]))!.id;
    return { makineId, istasyonId: ist, ikinci, ucuncu };
  }

  const adim = (makineId: number): IsEmriGirdisi => ({
    sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });

  // İstasyonun ekibine kişi ekler (devralma katılım gibi ekip ister).
  async function ekibe(istasyonId: number, kisiId: number): Promise<void> {
    sayac += 1;
    const ekip = (await o().sahip.tek<{ id: number }>('INSERT INTO ekip (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`PPYE${sayac}`, 'Deneme ekibi', istasyonId]))!.id;
    await o().sahip.sorgu('INSERT INTO ekip_uye (ekip_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, current_date, 10)', [ekip, kisiId]);
  }

  // Ali (ekipte değil) tek adımlı işi makinede başlatır; Veli istasyonun ekibindedir (ekipli: false ise değil).
  async function calisanIs(ekipli = true): Promise<{ id: number; ie: number; makineId: number; istasyonId: number; ikinci: number; ucuncu: number }> {
    const { makineId, istasyonId, ikinci, ucuncu } = await makine();
    if (ekipli) await ekibe(istasyonId, veli.id);
    const r = await tx((db) => uretimEmriAc(db, planlama, {
      malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: [adim(makineId)], projeId,
    }));
    const [ie] = r.isEmriIdleri as [number];
    await tx((db) => emirBaslat(db, ali, r.uretimEmriId, [makineId], undefined, ie));
    return { id: r.uretimEmriId, ie, makineId, istasyonId, ikinci, ucuncu };
  }
  const acikKullanim = (id: number) => o().sahip.sorgu<{ kisiId: number; makineId: number | null }>(
    'SELECT kisi_id AS "kisiId", makine_id AS "makineId" FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL', [id]);
  const adimDurumu = async (ie: number) => (await o().sahip.tek<{ durum: string }>('SELECT durum FROM uretim_emirleri_is_emri WHERE id = $1', [ie]))?.durum;

  before(async () => {
    ortam = await testVeritabaniKur('ue_plan_paylari');
    servis.planPaylariCozucusuKaydet(async () => paylar);
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.PPY', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    planlama = await kisi('planlama_proje', 'planlama_proje');
    ali = await kisi('ali', 'operator');
    veli = await kisi('veli', 'operator');
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('PPY-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PPY-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('cdv-dnm-1', 'mamul', 'PPY-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'cdv-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { servis.planPaylariCozucusuKaydet(null); await ortam?.kaldir(); });

  test('payı olan kişi ekip dışından katılır; payı olmayan ekip dışı kişi yine reddedilir', async () => {
    const { id, ie, makineId } = await calisanIs(false);
    paylar = [{ no: 1, adet: 6, makineId, kisiId: null }, { no: 2, adet: 4, makineId: null, kisiId: veli.id }];
    await reddeder(tx((db) => servis.katil(db, planlama.id, id, ie)), /ekibinde değilsiniz/);
    const c = await tx((db) => servis.katil(db, veli.id, id, ie));
    assert.ok(c.katilimlar.some((k) => k.kisi.id === veli.id && k.cikis === null));
  });

  test('çalışan adıma payı olan makine eklenir, iş durmaz; payı olmayan ya da zaten çalışan makine reddedilir', async () => {
    const { id, ie, makineId, ikinci, ucuncu } = await calisanIs();
    paylar = [{ no: 1, adet: 5, makineId, kisiId: null }, { no: 2, adet: 5, makineId: ikinci, kisiId: null }];
    await reddeder(tx((db) => servis.makineEkle(db, ali.id, id, ie, ucuncu)), /planda payı yok/);
    await reddeder(tx((db) => servis.makineEkle(db, ali.id, id, ie, makineId)), /zaten çalışıyor/);
    await tx((db) => servis.makineEkle(db, ali.id, id, ie, ikinci));
    assert.deepEqual((await acikKullanim(id)).map((k) => k.makineId).sort(), [makineId, ikinci].sort());
    assert.equal(await adimDurumu(ie), 'calisiyor');
  });

  test('pay ilerlemesi kişinin adımdaki sağlamıdır; payı aşan fazla görünür; bölünmemiş adımda liste boş', async () => {
    const { id, ie, makineId } = await calisanIs(false);
    paylar = [{ no: 1, adet: 6, makineId, kisiId: null }, { no: 2, adet: 2, makineId: null, kisiId: veli.id }];
    await tx((db) => servis.katil(db, veli.id, id, ie));
    await tx((db) => servis.emirSayim(db, veli.id, id, { tur: 'saglam', adet: 3 }, { isEmriId: ie }));
    const p = (await tx((db) => servis.adimPaylari(db, id, ie))).paylar;
    assert.deepEqual(p.map((x) => [x.no, x.adet, x.sayilan, x.fazla]), [[1, 6, null, null], [2, 2, 3, 1]]);
    assert.equal(p[0]!.makine?.id, makineId);
    paylar = [];
    assert.deepEqual((await tx((db) => servis.adimPaylari(db, id, ie))).paylar, []);
  });
});
