import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DisIslemEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { dieAc, dieDonusuYaz, dieGidisYaz, dieListesi, dieOku, dieTamamla, uretimEmriAc } from './disari.ts';
import type { DieAcGirdisi, IsEmriGirdisi } from './disari.ts';
import {
  DIE_ADIM_FASON_DEGIL, DIE_DISARIDA, DIE_DONUS_ASIMI, DIE_DONUSSUZ, DIE_EMRE_BAGLI, DIE_GIDIS_ASIMI, DIE_GIDISLI_IPTAL, DIE_ISLEM_YOK, DIE_KAPALI,
  DIE_TERMIN_ONCE, dieDonusIhlali, dieDurumu, dieGidisIhlali, dieIptalIhlali, diePartiGirdisiIhlali, dieTamamIhlali,
} from './dis-islem-emri-kurallar.ts';
import { fasonDonusuKaydet, fasonGidis, uretimYeriDegistir } from './is-emri-servis.ts';
import { emirBitir } from './disari.ts';

// Dış işlem emri (2428). Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('UE-DIE kuralları (saf)', () => {
  const bos = { emreBagli: false, isEmriDurumu: null, emirDurumu: null, adimFason: false, tamamlandi: false, iptal: false, gonderilen: 0, donen: 0, hurda: 0, firmadaHatali: 0, hedef: 10 };
  test('UE-DIE-2 durum: parti belgesi hareketlerden ve kapanıştan, emre bağlı belge iş emrinden türer', () => {
    assert.equal(dieDurumu(bos), 'acik');
    assert.equal(dieDurumu({ ...bos, gonderilen: 10 }), 'disarida');
    assert.equal(dieDurumu({ ...bos, gonderilen: 10, donen: 4 }), 'kismi_dondu');
    assert.equal(dieDurumu({ ...bos, gonderilen: 10, donen: 8, hurda: 2 }), 'dondu');
    assert.equal(dieDurumu({ ...bos, gonderilen: 10, donen: 10, tamamlandi: true }), 'tamamlandi');
    assert.equal(dieDurumu({ ...bos, iptal: true }), 'iptal');
    const emre = { ...bos, emreBagli: true, adimFason: true, isEmriDurumu: 'bekliyor', emirDurumu: 'planli' };
    assert.equal(dieDurumu(emre), 'acik');
    assert.equal(dieDurumu({ ...emre, gonderilen: 5 }), 'disarida');
    assert.equal(dieDurumu({ ...emre, isEmriDurumu: 'tamam' }), 'tamamlandi');
    assert.equal(dieDurumu({ ...emre, emirDurumu: 'bitti' }), 'tamamlandi');
    assert.equal(dieDurumu({ ...emre, emirDurumu: 'iptal' }), 'iptal');
    // Adım içeri alındıysa belge kalır, iptal görünür; emre bağlı belgenin kendi kapanış alanı okunmaz.
    assert.equal(dieDurumu({ ...emre, adimFason: false }), 'iptal');
    assert.equal(dieDurumu({ ...emre, iptal: true, tamamlandi: true }), 'acik');
  });

  test('UE-DIE-2 (Mimar K1, K2): hedefin hepsi gitmeden "döndü" olmaz; GKK firmada hatalı hesabı kapatır', () => {
    // 100 adetten 50 gidip 50 döndü: kalan 50 daha gidecek.
    assert.equal(dieDurumu({ ...bos, hedef: 100, gonderilen: 50, donen: 50 }), 'kismi_dondu');
    assert.equal(dieDurumu({ ...bos, hedef: 100, gonderilen: 100, donen: 98, hurda: 2 }), 'dondu');
    assert.equal(dieDurumu({ ...bos, hedef: null, gonderilen: 50, donen: 50 }), 'dondu');
    // İş emrinin fason kuralıyla aynı: dönen + hurda + firmada hatalı (1207 c).
    assert.equal(dieDurumu({ ...bos, gonderilen: 10, donen: 7, firmadaHatali: 3 }), 'dondu');
    assert.equal(dieDurumu({ ...bos, gonderilen: 10, firmadaHatali: 2 }), 'kismi_dondu');
  });

  test('UE-DIE-4 hareketler: emre bağlı ve kapalı belgede reddedilir; gidiş adedi, dönüş gönderileni aşmaz; tamamlama dışarıda parça yokken', () => {
    const d = { emreBagli: false, kapali: false, adet: 10, gonderilen: 6, donen: 2, hurda: 1 };
    assert.equal(dieGidisIhlali(d, 4), null);
    assert.equal(dieGidisIhlali(d, 5), DIE_GIDIS_ASIMI);
    assert.equal(dieGidisIhlali({ ...d, emreBagli: true }, 1), DIE_EMRE_BAGLI);
    assert.equal(dieGidisIhlali({ ...d, kapali: true }, 1), DIE_KAPALI);
    assert.equal(dieDonusIhlali(d, 2, 1), null);
    assert.equal(dieDonusIhlali(d, 3, 1), DIE_DONUS_ASIMI);
    assert.equal(dieTamamIhlali(d), DIE_DISARIDA);
    assert.equal(dieTamamIhlali({ ...d, donen: 0, hurda: 0 }), DIE_DONUSSUZ);
    assert.equal(dieTamamIhlali({ ...d, donen: 5 }), null);
    assert.equal(dieTamamIhlali({ ...d, donen: 5, emreBagli: true }), DIE_EMRE_BAGLI);
  });

  test('UE-DIE-5 iptal yalnız gidişsiz parti belgesinde; UE-DIE-3 parti girdisi işlem ister, termin gidişten önce olmaz', () => {
    const d = { emreBagli: false, kapali: false, adet: 10, gonderilen: 0, donen: 0, hurda: 0 };
    assert.equal(dieIptalIhlali(d), null);
    assert.equal(dieIptalIhlali({ ...d, gonderilen: 1 }), DIE_GIDISLI_IPTAL);
    assert.equal(dieIptalIhlali({ ...d, emreBagli: true }), DIE_EMRE_BAGLI);
    assert.equal(dieIptalIhlali({ ...d, kapali: true }), DIE_KAPALI);
    const g = { operasyonTipiId: 1, hizmetNo: null, planlananGidis: '2026-11-10', termin: '2026-11-12' };
    assert.equal(diePartiGirdisiIhlali(g), null);
    assert.equal(diePartiGirdisiIhlali({ ...g, operasyonTipiId: null, hizmetNo: 3 }), null);
    assert.equal(diePartiGirdisiIhlali({ ...g, operasyonTipiId: null })?.ileti, DIE_ISLEM_YOK);
    assert.equal(diePartiGirdisiIhlali({ ...g, termin: '2026-11-09' })?.ileti, DIE_TERMIN_ONCE);
  });
});

describe('UE-DIE dış işlem emri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yonetici: Kullanici;
  let projeId = 0;
  let tipId = 0;
  let makineId = 0;
  let urunNo = 0;
  let rev = 0;
  let firma = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`,
      headers: { cookie: cerezler.get(ad) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
    });
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  const ic = (op: number): IsEmriGirdisi => ({
    sira: op / 10, opNo: op, ad: `Adım ${op}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makineId },
    ayarSuresiDk: '10', birimSureDk: '1', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const fason = (op: number): IsEmriGirdisi => ({ ...ic(op), ad: `Fason ${op}`, kaynak: { tur: 'fason', id: firma }, ayarSuresiDk: null, birimSureDk: null, terminGun: 3 });
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, yonetici, { malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri, projeId }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };
  const belgeler = (isEmriIdleri: number[]) => o().sahip.sorgu<{ isEmriId: number; acilis: string; no: string }>(
    'SELECT is_emri_id AS "isEmriId", acilis, no FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = ANY($1::int[]) ORDER BY is_emri_id', [isEmriIdleri]);
  const parti = (ek: Partial<Extract<DieAcGirdisi, { kaynak: 'parti' }>> = {}): DieAcGirdisi => ({
    kaynak: 'parti', malzemeNo: urunNo, partiId: 9001, konumId: null, operasyonTipiId: tipId, hizmetNo: null, adet: 10, firmaId: firma,
    planlananGidis: '2026-11-10', termin: '2026-11-13', aciklama: null, ...ek,
  });
  const reddedilir = async (is: Promise<unknown>, ileti: string): Promise<void> => {
    await assert.rejects(is, (h: unknown) => String((h as { message?: string }).message).includes(ileti));
  };

  before(async () => {
    ortam = await testVeritabaniKur('uretim_die');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    yonetici = (await ortam.vt.tx((db) => kullaniciYukle(db, yoneticiId)))!;
    for (const [ad, rol] of [['satinalma', 'satin_alma'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.DIE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('DIEM', 'Deneme Merkezi') RETURNING id");
    const ist = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('DIEI', 'Deneme İstasyonu', $1) RETURNING id", [im?.id]))!.id;
    makineId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('DIEMK', 'Tezgah', $1) RETURNING id", [ist]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('DIE-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('DIE-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('die-1', 'mamul', 'DIE-', 1, 'aktif', $1, $2, $2) RETURNING no`, [JSON.stringify({ id: 'die-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('UE-DIE-1 plandaki fason adımın belgesi kendiliğinden açılır (plan); iç adımın belgesi olmaz; numara DIE- kalıbında', async () => {
    const e = await ac([ic(10), fason(20), ic(30)]);
    const b = await belgeler(e.adimlar);
    assert.deepEqual(b.map((x) => [x.isEmriId, x.acilis]), [[e.adimlar[1], 'plan']]);
    assert.match(b[0]!.no, /^DIE-\d{6}$/);
  });

  test('UE-DIE-1/2 adım fasona alınınca belge açılır; içeri alınınca belge kalır ve iptal görünür; yeniden fasona alınınca aynı belge sürer', async () => {
    const e = await ac([ic(10), ic(20)]);
    const surum = async () => (await o().sahip.tek<{ surum: number }>('SELECT surum FROM uretim_emri WHERE id = $1', [e.id]))!.surum;
    assert.equal((await belgeler(e.adimlar)).length, 0);
    await tx(async (db) => uretimYeriDegistir(db, yonetici, e.id, { opNo: 20, yer: 'fason', firmaId: firma, terminGun: 2, surum: await surum() }));
    const [ilk] = await belgeler(e.adimlar);
    assert.equal(ilk?.isEmriId, e.adimlar[1]);
    assert.equal(ilk?.acilis, 'plan');
    await tx(async (db) => uretimYeriDegistir(db, yonetici, e.id, { opNo: 20, yer: 'ic', firmaId: null, terminGun: null, surum: await surum() }));
    const [sonra] = await belgeler(e.adimlar);
    assert.equal(sonra?.no, ilk?.no);
    const id = (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [e.adimlar[1]]))!.id;
    assert.equal((await tx((db) => dieOku(db, id))).durum, 'iptal');
    await tx(async (db) => uretimYeriDegistir(db, yonetici, e.id, { opNo: 20, yer: 'fason', firmaId: firma, terminGun: 2, surum: await surum() }));
    assert.deepEqual((await belgeler(e.adimlar)).map((x) => x.no), [ilk?.no]);
    assert.equal((await tx((db) => dieOku(db, id))).durum, 'acik');
  });

  test('emre bağlı belge: gidiş iş emrinden okunur, kaynak, firma ve adet emirden gelir; listede açık görünür', async () => {
    const e = await ac([fason(10), ic(20)]);
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[0]!, 6));
    const id = (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [e.adimlar[0]]))!.id;
    const d = await tx((db) => dieOku(db, id));
    assert.equal(d.kaynak.tur, 'emir');
    assert.equal(d.durum, 'disarida');
    assert.equal(d.gonderilen, 6);
    assert.equal(d.firmaId, firma);
    assert.equal(d.adet, 10);
    assert.equal(d.malzeme?.no, urunNo);
    assert.equal(d.hareketler.length, 1);
    assert.match(d.termin ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.ok((await tx((db) => dieListesi(db))).some((x) => x.id === id));
    // Emre bağlı belge parti komutlarını almaz: gidiş iş emrinin fason ucundan girer.
    await reddedilir(tx((db) => dieGidisYaz(db, yoneticiId, { dieId: id, adet: 1 })), DIE_EMRE_BAGLI);
  });

  test('Mimar K1: emre bağlı belgede adıma girenin bir kısmı gidip döndüyse kısmi döndü; hepsi gidip dönünce döndü', async () => {
    const e = await ac([fason(10), ic(20)]);
    const id = (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [e.adimlar[0]]))!.id;
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[0]!, 5));
    await tx((db) => fasonDonusuKaydet(db, yoneticiId, e.id, e.adimlar[0]!, 5, 0));
    assert.equal((await tx((db) => dieOku(db, id))).durum, 'kismi_dondu');
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[0]!, 5));
    await tx((db) => fasonDonusuKaydet(db, yoneticiId, e.id, e.adimlar[0]!, 4, 1));
    assert.equal((await tx((db) => dieOku(db, id))).durum, 'dondu');
  });

  test('Mimar N1: parça fasondayken emir terminalden bitirilemez (adımlı ve adımsız komut); belge dışarıda kalır', async () => {
    const e = await ac([fason(10), ic(20)]);
    const id = (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [e.adimlar[0]]))!.id;
    await tx((db) => fasonGidis(db, yonetici, e.id, e.adimlar[0]!, 10));
    await assert.rejects(tx((db) => emirBitir(db, yonetici, e.id)));
    await assert.rejects(tx((db) => emirBitir(db, yonetici, e.id, undefined, undefined, e.adimlar[0]!)));
    assert.notEqual((await o().sahip.tek<{ durum: string }>('SELECT durum FROM uretim_emri WHERE id = $1', [e.id]))!.durum, 'bitti');
    assert.equal((await tx((db) => dieOku(db, id))).durum, 'disarida');
  });

  test('izinli ve reddedilen: elle açma fason yetkisiyle; belgesi olan adım ve fason olmayan adım reddedilir, yetkisiz 403', async () => {
    const e = await ac([ic(10), fason(20)]);
    const icAdim = await istek<Hata>('satinalma', 'POST', '/dis-islem-emirleri', { isEmriId: e.adimlar[0], aciklama: null });
    assert.equal(icAdim.durum, 409, JSON.stringify(icAdim.govde));
    assert.equal(icAdim.govde.mesaj, DIE_ADIM_FASON_DEGIL);
    const varOlan = await istek<Hata>('satinalma', 'POST', '/dis-islem-emirleri', { isEmriId: e.adimlar[1], aciklama: null });
    assert.equal(varOlan.durum, 409);
    const yetkisiz = await istek<Hata>('operator', 'POST', '/dis-islem-emirleri', { isEmriId: e.adimlar[1], aciklama: null });
    assert.equal(yetkisiz.durum, 403);
    // Belgesi olmayan fason adım (canlıya geçişten önce kapanmış iş) elle açılır; kişi ve açılış yolu yazılır.
    await o().sahip.sorgu('DELETE FROM uretim_emirleri_dis_islem_emri WHERE is_emri_id = $1', [e.adimlar[1]]);
    const elle = await istek<{ disIslemEmri: DisIslemEmri }>('satinalma', 'POST', '/dis-islem-emirleri', { isEmriId: e.adimlar[1], aciklama: 'Özel istek' });
    assert.equal(elle.durum, 200, JSON.stringify(elle.govde));
    assert.equal(elle.govde.disIslemEmri.acilis, 'elle');
    assert.equal(elle.govde.disIslemEmri.aciklama, 'Özel istek');
    assert.equal(elle.govde.disIslemEmri.olusturan?.ad, 'Deneme satinalma');
    const oku = await istek<{ disIslemEmri: DisIslemEmri }>('operator', 'GET', `/dis-islem-emirleri/${elle.govde.disIslemEmri.id}`);
    assert.equal(oku.durum, 403);
  });

  test('talepten açma (varsaVer): emre bağlı adımın var olan belgesi döner, ikincisi açılmaz', async () => {
    const e = await ac([fason(10)]);
    const [b] = await belgeler(e.adimlar);
    const r = await tx((db) => dieAc(db, yoneticiId, { kaynak: 'emir', isEmriId: e.adimlar[0]!, aciklama: null }, { acilis: 'talep', varsaVer: true }));
    assert.equal(r.yeni, false);
    assert.deepEqual((await belgeler(e.adimlar)).map((x) => x.no), [b?.no]);
  });

  test('parti belgesi: açılır, gidiş adedi aşamaz, dönüş gönderileni aşamaz, dışarıda parça varken tamamlanmaz, gidişli iptal reddedilir', async () => {
    const { id } = await tx((db) => dieAc(db, yoneticiId, parti(), { acilis: 'talep' }));
    let d = await tx((db) => dieOku(db, id));
    assert.deepEqual([d.kaynak.tur, d.durum, d.acilis, d.adet], ['parti', 'acik', 'talep', 10]);
    await reddedilir(tx((db) => dieGidisYaz(db, yoneticiId, { dieId: id, adet: 11 })), DIE_GIDIS_ASIMI);
    await tx((db) => dieGidisYaz(db, yoneticiId, { dieId: id, adet: 8 }));
    await reddedilir(tx((db) => dieDonusuYaz(db, yoneticiId, { dieId: id, saglam: 8, hurda: 1 })), DIE_DONUS_ASIMI);
    await tx((db) => dieDonusuYaz(db, yoneticiId, { dieId: id, saglam: 5, hurda: 1 }));
    d = await tx((db) => dieOku(db, id));
    assert.deepEqual([d.durum, d.gonderilen, d.donen, d.hurda], ['kismi_dondu', 8, 5, 1]);
    await reddedilir(tx((db) => dieTamamla(db, yoneticiId, id)), DIE_DISARIDA);
    const iptal = await istek<Hata>('satinalma', 'POST', `/dis-islem-emirleri/${id}/iptal`, { surum: d.surum });
    assert.equal(iptal.durum, 409);
    assert.equal(iptal.govde.mesaj, DIE_GIDISLI_IPTAL);
    await tx((db) => dieDonusuYaz(db, yoneticiId, { dieId: id, saglam: 2, hurda: 0 }));
    assert.deepEqual(await tx((db) => dieTamamla(db, yoneticiId, id)), { saglam: 7 });
    assert.equal((await tx((db) => dieOku(db, id))).durum, 'tamamlandi');
    await reddedilir(tx((db) => dieGidisYaz(db, yoneticiId, { dieId: id, adet: 1 })), DIE_KAPALI);
  });

  test('parti belgesi iptal: gidişsiz belge fason yetkisiyle ve güncel sürümle iptal edilir; eski sürüm 409, yetkisiz 403', async () => {
    const { id } = await tx((db) => dieAc(db, yoneticiId, parti({ partiId: 9002 }), { acilis: 'elle' }));
    const d = await tx((db) => dieOku(db, id));
    assert.equal((await istek('operator', 'POST', `/dis-islem-emirleri/${id}/iptal`, { surum: d.surum })).durum, 403);
    assert.equal((await istek('satinalma', 'POST', `/dis-islem-emirleri/${id}/iptal`, { surum: d.surum + 1 })).durum, 409);
    const c = await istek<{ disIslemEmri: DisIslemEmri }>('satinalma', 'POST', `/dis-islem-emirleri/${id}/iptal`, { surum: d.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.disIslemEmri.durum, 'iptal');
    assert.ok(!(await tx((db) => dieListesi(db))).some((x) => x.id === id));
    assert.ok((await tx((db) => dieListesi(db, { hepsi: true }))).some((x) => x.id === id));
  });

  test('UE-DIE-3 parti girdisi: işlemsiz ve termini gidişten önce olan belge açılmaz', async () => {
    await reddedilir(tx((db) => dieAc(db, yoneticiId, parti({ operasyonTipiId: null }), { acilis: 'elle' })), DIE_ISLEM_YOK);
    await reddedilir(tx((db) => dieAc(db, yoneticiId, parti({ termin: '2026-11-01' }), { acilis: 'elle' })), DIE_TERMIN_ONCE);
  });

  test('eşzamanlı iki dönüş aynı belgede gönderileni birlikte aşamaz (belge satırı kilitli)', async () => {
    const { id } = await tx((db) => dieAc(db, yoneticiId, parti({ partiId: 9003 }), { acilis: 'elle' }));
    await tx((db) => dieGidisYaz(db, yoneticiId, { dieId: id, adet: 10 }));
    const sonuc = await Promise.allSettled([
      tx((db) => dieDonusuYaz(db, yoneticiId, { dieId: id, saglam: 6, hurda: 0 })),
      tx((db) => dieDonusuYaz(db, yoneticiId, { dieId: id, saglam: 6, hurda: 0 })),
    ]);
    assert.equal(sonuc.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal((await tx((db) => dieOku(db, id))).donen, 6);
  });

  test('kısıtlar: kaynak tek; emre bağlı belge alan kopyası taşımaz; sistem parti belgesi açamaz; hareket tek bağlı', async () => {
    const e = await ac([fason(10)]);
    const sahip = o().sahip;
    const reddet = (sql: string, p: unknown[], kisit: string) =>
      assert.rejects(sahip.sorgu(sql, p), (h: unknown) => (h as { constraint?: string }).constraint === kisit, kisit);
    await reddet("INSERT INTO uretim_emirleri_dis_islem_emri (acilis) VALUES ('plan')", [], 'uretim_emirleri_dis_islem_emri_kaynak_tek');
    await reddet('UPDATE uretim_emirleri_dis_islem_emri SET adet = 3 WHERE is_emri_id = $1', [e.adimlar[0]], 'uretim_emirleri_dis_islem_emri_emirde_sade');
    await reddet("INSERT INTO uretim_emirleri_dis_islem_emri (parti_id, malzeme_no, operasyon_tipi_id, adet, acilis) VALUES (1, $1, $2, 1, 'plan')",
      [urunNo, tipId], 'uretim_emirleri_dis_islem_emri_partiyi_kisi_acar');
    await reddet("INSERT INTO uretim_emirleri_dis_islem_emri (parti_id, malzeme_no, operasyon_tipi_id, adet, acilis) VALUES (1, $1, $2, 1, 'elle')",
      [urunNo, tipId], 'uretim_emirleri_dis_islem_emri_acan');
    await reddet("INSERT INTO uretim_emirleri_dis_islem_emri (parti_id, malzeme_no, adet, acilis, olusturan_kisi_id) VALUES (1, $1, 1, 'elle', $2)",
      [urunNo, yoneticiId], 'uretim_emirleri_dis_islem_emri_partide_tam');
    await reddet("INSERT INTO uretim_emirleri_fason_hareketi (yon, adet, kisi_id) VALUES ('gidis', 1, $1)", [yoneticiId], 'uretim_emirleri_fason_hareketi_tek_bag');
  });
});
