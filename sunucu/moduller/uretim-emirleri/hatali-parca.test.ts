import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { adimliEmirCevabi, hataliCevabi, hataliListeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi, HataliCevabi, ReworkAdimiGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirBitir, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { hataliKarariVer } from './hatali-parca.ts';
import { reworkAdimiYaz } from './is-emri-servis.ts';
import {
  ADIM_ACIK_DEGIL, HATALI_ADET, HATALI_EMIR_DURDU, HATALI_KALITE_ADIMI, HATALI_KARAR_VERILMIS, HATALI_NEDEN_YOK, REWORK_KARARSIZ,
} from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('uretim-emirleri hatalı parça (1034, 1036 a, 4 a; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Kullanici;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let kaliteIst = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);
  const red = async (is: Promise<unknown>, ileti: string): Promise<void> => {
    await assert.rejects(is, (h: unknown) => h instanceof UygulamaHatasi && h.message === ileti);
  };

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function istasyon(tip = 'talasli'): Promise<{ ist: number; makine: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`HPM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`HPI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, tip]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`HPMK${sayac}`, 'Tezgah', ist]))!.id;
    return { ist, makine };
  }

  const adim = (sira: number, makine: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (adet: number, makineler: number[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: makineler.map((m, i) => adim(i + 1, m)), projeId,
    }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir as AdimliEmirAyrintisi;
  };
  const op = (): Kullanici => kim('operator');
  const adimlari = async (id: number) => (await o().sahip.sorgu<{ id: number; op: number; tur: string; durum: string; saglam: number | null; ist: number | null; bag: string }>(
    `SELECT id, op_no AS op, tur, durum, saglam_adet AS saglam, istasyon_id AS ist, bagimlilik AS bag FROM uretim_emirleri_is_emri
      WHERE uretim_emri_id = $1 ORDER BY sira`, [id]));
  const hatali = (id: number, govde: Record<string, unknown>) => istek<HataliCevabi>('operator', 'POST', `/uretim-emirleri/${id}/hatali`, govde);
  // İlk adımı bitirip ikinci adımı başlatır; ilk parça (327 a) onaylanır.
  async function ikinciAdimda(adet: number, makineler: number[]): Promise<{ id: number; adimlar: number[] }> {
    const e = await ac(adet, makineler);
    await tx((db) => emirBaslat(db, op(), e.id));
    await tx((db) => emirSayim(db, op(), e.id, { tur: 'saglam', adet: 1 }));
    await tx((db) => kararliSayimiSonuclandir(db, yoneticiId, e.id, 'onay'));
    await tx((db) => emirSayim(db, op(), e.id, { tur: 'saglam', adet: adet - 1 }));
    await tx((db) => emirBitir(db, op(), e.id));
    await tx((db) => emirBaslat(db, op(), e.id));
    return e;
  }
  const rework = (surum: number, makine: number): ReworkAdimiGovdesi => ({
    ad: 'Takım izi giderme', operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, surum,
  });

  before(async () => {
    ortam = await testVeritabaniKur('uretim_hatali_parca');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.HATALI', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('HP-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('HP-TK', 'Deneme takım kırılması', 900), ('HP-PAS', 'Deneme pasif', 901)");
    await ortam.sahip.sorgu("UPDATE hurda_nedeni SET aktif = false WHERE kod = 'HP-PAS'");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HP-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('hp-dnm-1', 'mamul', 'HP-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'hp-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    kaliteIst = (await istasyon('kalite')).ist;
  });
  after(async () => { await ortam?.kaldir(); });

  test('kol: hatalı adet kola ayrılır, kalite adımı terminalden başlamaz, rework kararıyla planlama ikinci adımı doldurur', async () => {
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const { id, adimlar: [, ie2] } = await ikinciAdimda(10, [a.makine, b.makine, c.makine]);
    await tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: 3 }));

    const cevap = await hatali(id, { hurdaNedeniKodu: 'HP-TK', adet: 2, aciklama: 'uç kırıldı' });
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    const h = hataliCevabi.parse(cevap.govde);
    assert.equal(h.kolAcildi, true);
    assert.notEqual(h.hedefEmir.id, id);
    const kol = await o().sahip.tek<{ adet: number; ust: number; birlesme: number; ist: number | null }>(
      'SELECT adet, ust_emir_id AS ust, birlesme_op_no AS birlesme, istasyon_id AS ist FROM uretim_emri WHERE id = $1', [h.hedefEmir.id]);
    assert.deepEqual(kol, { adet: 2, ust: id, birlesme: 30, ist: kaliteIst }, 'kol sonraki adımda (OP 30) katılır, kalite istasyonunda bekler');
    assert.equal((await o().sahip.tek<{ adet: number }>('SELECT adet FROM uretim_emri WHERE id = $1', [id]))?.adet, 8);
    const kolAdimlari = await adimlari(h.hedefEmir.id);
    assert.deepEqual(kolAdimlari.map((x) => [x.op, x.tur, x.durum, x.ist]), [[15, 'ek', 'bekliyor', kaliteIst], [16, 'rework', 'bekliyor', null], [20, 'rota', 'bekliyor', null]]);
    const [kalite, rw] = kolAdimlari as unknown as [{ id: number }, { id: number }];
    assert.deepEqual((await adimlari(id)).map((x) => [x.id === ie2, x.durum]), [[false, 'tamam'], [true, 'calisiyor'], [false, 'bekliyor']], 'ana partinin adımı sürer');

    await red(tx((db) => emirBaslat(db, op(), h.hedefEmir.id)), HATALI_KALITE_ADIMI);
    const ilkSurum = (await ayrinti(h.hedefEmir.id)).surum;
    await red(tx((db) => reworkAdimiYaz(db, kim('planlama_proje'), h.hedefEmir.id, rw.id, rework(ilkSurum, a.makine))), REWORK_KARARSIZ);
    const liste = await istek('planlama_proje', 'GET', '/hatali-parcalar?acik=1');
    assert.equal(liste.durum, 200, JSON.stringify(liste.govde));
    const acik = hataliListeCevabi.parse(liste.govde).kayitlar.find((k) => k.id === h.kayitId);
    assert.deepEqual([acik?.adet, acik?.hurdaNedeni.kod, acik?.isEmri.opNo, acik?.kisi.id, acik?.karar], [2, 'HP-TK', 20, op().id, null]);

    await red(tx((db) => hataliKarariVer(db, op(), h.kayitId, { karar: 'rework', not: null, ncrKimlik: null })), 'Bu işlem için yetkiniz yok.');
    const karar = await tx((db) => hataliKarariVer(db, yonetici, h.kayitId, { karar: 'rework', not: 'sökülüp yeniden işlenir', ncrKimlik: 'ncr-1' }));
    assert.deepEqual([karar.kayit.karar, karar.kayit.kararKisi?.id, karar.kayit.ncrKimlik], ['rework', yoneticiId, 'ncr-1']);
    assert.deepEqual((await adimlari(h.hedefEmir.id)).map((x) => [x.op, x.durum, x.saglam]), [[15, 'tamam', 2], [16, 'bekliyor', null], [20, 'bekliyor', null]]);
    await red(tx((db) => hataliKarariVer(db, yonetici, h.kayitId, { karar: 'hurda', not: null, ncrKimlik: null })), HATALI_KARAR_VERILMIS);

    const surum = (await ayrinti(h.hedefEmir.id)).surum;
    const yaz = await istek('planlama_proje', 'POST', `/adimli-emirler/${h.hedefEmir.id}/is-emirleri/${rw.id}/rework-adimi`, rework(surum, a.makine));
    assert.equal(yaz.durum, 200, JSON.stringify(yaz.govde));
    const doldu = (await ayrinti(h.hedefEmir.id)).isEmirleri.find((i) => i.id === rw.id);
    assert.deepEqual([doldu?.ad, doldu?.opNo, doldu?.tur], ['Takım izi giderme', 16, 'rework']);
    assert.equal((await o().sahip.tek<{ ist: number | null }>('SELECT istasyon_id AS ist FROM uretim_emri WHERE id = $1', [h.hedefEmir.id]))?.ist, a.ist);
    assert.equal(kalite.id > 0, true);
  });

  test('kol hurda kararıyla kapanır ve adedi üste katılır; fason rework termini girilmezse 7 gün', async () => {
    const [a, b, c] = [await istasyon(), await istasyon(), await istasyon()];
    const { id } = await ikinciAdimda(10, [a.makine, b.makine, c.makine]);
    const h = hataliCevabi.parse((await hatali(id, { hurdaNedeniKodu: 'HP-TK', adet: 1 })).govde);
    await tx((db) => hataliKarariVer(db, yonetici, h.kayitId, { karar: 'hurda', not: null, ncrKimlik: null }));
    const kol = await o().sahip.tek<{ durum: string; birlesti: number | null }>('SELECT durum, birlestigi_emir_id AS birlesti FROM uretim_emri WHERE id = $1', [h.hedefEmir.id]);
    assert.deepEqual(kol, { durum: 'iptal', birlesti: id });
    assert.equal((await o().sahip.tek<{ adet: number }>('SELECT adet FROM uretim_emri WHERE id = $1', [id]))?.adet, 10, 'PB-K5: adet üste döner, hurda kolda kalır');
    assert.deepEqual((await adimlari(h.hedefEmir.id)).map((x) => [x.op, x.durum, x.saglam]), [[15, 'tamam', 0]]);
    const hurda = await o().sahip.tek<{ adet: number }>(
      "SELECT sum(adet)::int AS adet FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'hurda'", [h.hedefEmir.id]);
    assert.equal(hurda?.adet, 1);
    const kayit = await o().sahip.tek<{ rw: number | null }>('SELECT rework_is_emri_id AS rw FROM uretim_emirleri_hatali_kaydi WHERE id = $1', [h.kayitId]);
    assert.equal(kayit?.rw, null);

    const firma = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    const h2 = hataliCevabi.parse((await hatali(id, { hurdaNedeniKodu: 'HP-TK', adet: 1 })).govde);
    await tx((db) => hataliKarariVer(db, yonetici, h2.kayitId, { karar: 'rework', not: null, ncrKimlik: null }));
    const rwId = (await adimlari(h2.hedefEmir.id))[1]!.id;
    const surum = (await ayrinti(h2.hedefEmir.id)).surum;
    await tx((db) => reworkAdimiYaz(db, kim('planlama_proje'), h2.hedefEmir.id, rwId, {
      ad: 'Fasonda taşlama', operasyonTipiId: tipId, kaynak: { tur: 'fason', id: firma }, ayarSuresiDk: null, birimSureDk: null, terminGun: null, surum,
    }));
    assert.equal((await o().sahip.tek<{ gun: number }>('SELECT termin_gun AS gun FROM uretim_emirleri_is_emri WHERE id = $1', [rwId]))?.gun, 7);
  });

  test('4 a: adımdaki bütün parça hatalıysa adımlar emrin kendisine girer; red kararında rework ve tekrar kalkar', async () => {
    const [a, b] = [await istasyon(), await istasyon()];
    const { id, adimlar: [ie1] } = await ac(1, [a.makine, b.makine]);
    await tx((db) => emirBaslat(db, op(), id));
    const cevap = await hatali(id, { isEmriId: ie1, hurdaNedeniKodu: 'HP-TK', adet: 1 });
    assert.equal(cevap.durum, 200, JSON.stringify(cevap.govde));
    const h = hataliCevabi.parse(cevap.govde);
    assert.deepEqual([h.kolAcildi, h.hedefEmir.id], [false, id]);
    assert.deepEqual((await adimlari(id)).map((x) => [x.op, x.tur, x.durum, x.saglam, x.bag]), [
      [10, 'rota', 'tamam', 0, 'bekleyen'], [15, 'ek', 'bekliyor', null, 'bagimsiz'], [16, 'rework', 'bekliyor', null, 'bekleyen'],
      [17, 'rework', 'bekliyor', null, 'bekleyen'], [20, 'rota', 'bekliyor', null, 'bekleyen'],
    ]);
    const emir = await o().sahip.tek<{ durum: string; ist: number | null }>('SELECT durum, istasyon_id AS ist FROM uretim_emri WHERE id = $1', [id]);
    assert.deepEqual(emir, { durum: 'planli', ist: kaliteIst });

    const karar = await tx((db) => hataliKarariVer(db, yonetici, h.kayitId, { karar: 'red', not: null, ncrKimlik: null }));
    assert.equal(karar.uyari, HATALI_EMIR_DURDU);
    assert.deepEqual((await adimlari(id)).map((x) => [x.op, x.durum, x.saglam]), [[10, 'tamam', 0], [15, 'tamam', 0], [20, 'bekliyor', null]]);
    // 1045 b: emir durur; sonraki adım terminalden başlamaz.
    const ie20 = (await adimlari(id))[2]!.id;
    await red(tx((db) => emirBaslat(db, op(), id, [b.makine], undefined, ie20)), HATALI_EMIR_DURDU);
    const red_ = await o().sahip.tek<{ adet: number }>("SELECT sum(adet)::int AS adet FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'red'", [id]);
    assert.equal(red_?.adet, 1);
  });

  test('reddedilen: sayılmış parçadan fazlası, pasif ya da olmayan neden, çalışmayan adım, yinelenen istek', async () => {
    const [a, b] = [await istasyon(), await istasyon()];
    const { id, adimlar: [, ie2] } = await ikinciAdimda(5, [a.makine, b.makine]);
    await tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: 4 }, { isEmriId: ie2 }));
    const fazla = await hatali(id, { hurdaNedeniKodu: 'HP-TK', adet: 2 });
    assert.deepEqual([fazla.durum, (fazla.govde as { mesaj?: string }).mesaj], [400, HATALI_ADET]);
    for (const kod of ['HP-PAS', 'YOK-1']) {
      const r = await hatali(id, { hurdaNedeniKodu: kod, adet: 1 });
      assert.equal(r.durum, 400, kod);
      assert.match(JSON.stringify(r.govde), new RegExp(HATALI_NEDEN_YOK.slice(0, 20)), kod);
    }
    assert.equal((await hatali(id, { hurdaNedeniKodu: 'HP-TK', adet: 0 })).durum, 400);
    const bekleyen = await ac(3, [a.makine, b.makine]);
    const r = await hatali(bekleyen.id, { isEmriId: bekleyen.adimlar[0], hurdaNedeniKodu: 'HP-TK', adet: 1 });
    assert.equal(r.durum, 409);
    assert.match(JSON.stringify(r.govde), new RegExp(ADIM_ACIK_DEGIL.slice(0, 20)));
    const kimlik = randomUUID();
    const yolla = () => app.inject({
      method: 'POST', url: `/api/uretim-emirleri/${id}/hatali`, headers: { cookie: cerezler.get('operator') ?? '', [ISTEK_KIMLIGI_BASLIGI]: kimlik },
      payload: { hurdaNedeniKodu: 'HP-TK', adet: 1 },
    });
    const [ilk, ikinci] = [await yolla(), await yolla()];
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.deepEqual(ikinci.json(), ilk.json(), 'aynı istek kimliği ikinci kolu açmaz');
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri WHERE ust_emir_id = $1', [id]))?.n, 1);
  });
});
