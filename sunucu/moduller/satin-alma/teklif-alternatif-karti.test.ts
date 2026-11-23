import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AcilisCevabi, AlternatifSonucu, KalemZarflariCevabi, Talebim, Talep, TeklifAlternatifi } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { dondurulmusUyum, teklifAdayi, zarfDegerlendir } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { ILETILER, alternatifIzi, alternatifSonucuHesapla, dondurulmusKart, kartliAlternatifSonucu } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const alt = (ek: Partial<TeklifAlternatifi> = {}): TeklifAlternatifi => ({ kalite: null, durum: null, yuzey: null, olcu: {}, ...ek });
type Kart = NonNullable<AlternatifSonucu['kart']>;
const ANA = { form: 'cubuk', kalite: '6082', durum: 'T6', yuzey: 'Ham', standartlar: [], islemler: [], olcu: { d: 50, l: 3000 } };
const AK1: Kart = {
  setId: 1, ad: 'ORN AK-1', tur: 'tam', ozet: 'ozet', ana: ANA,
  nitelikler: [
    { nitelik: 'kalite', kip: null, degerler: ['6082', '6061'], alt: null, ust: null, payAlt: null, payUst: null },
    { nitelik: 'd', kip: 'pay', degerler: null, alt: null, ust: null, payAlt: 0, payUst: 5 },
    { nitelik: 'l', kip: 'birebir', degerler: null, alt: null, ust: null, payAlt: null, payUst: null },
  ],
};
const uyum = (k: Kart, a: TeklifAlternatifi) => dondurulmusUyum(k, teklifAdayi(k.ana, a));

describe('3593 dilim 3: alternatif kartıyla teklif (saf)', () => {
  test('izinli: dondurulan sınırın içindeki değer "sınır içinde", şartlı kart "talep" izniyle; sınır dışı red iletisi döner', () => {
    const r = kartliAlternatifSonucu(AK1, alt({ kalite: '6061', olcu: { d: 52 }, kartId: 1 }), 'Deneme', uyum);
    assert.ok(typeof r !== 'string');
    assert.deepEqual([r.sonuc, r.izin, r.kart?.setId], ['icinde', null, 1]);
    const s = kartliAlternatifSonucu({ ...AK1, tur: 'sartli' }, alt({ olcu: { d: 51 }, kartId: 1 }), 'Deneme', uyum);
    assert.deepEqual(typeof s === 'string' ? s : [s.sonuc, s.izin], ['sartli', 'talep']);
    assert.equal(kartliAlternatifSonucu(AK1, alt({ olcu: { d: 56 }, kartId: 1 }), 'Deneme', uyum), ILETILER.alternatifKartiDisi('Deneme', 'ORN AK-1', 'd 56'));
    assert.equal(kartliAlternatifSonucu(AK1, alt({ olcu: { l: 2500 }, kartId: 1 }), 'Deneme', uyum), ILETILER.alternatifKartiDisi('Deneme', 'ORN AK-1', 'l 2.500'));
  });

  test('dondurulan sınır yalnız aynı alternatifte (nitelik, işlem, kart) kalır; set silinip kart boşalınca da kalır', () => {
    const a = alt({ olcu: { d: 52 }, kartId: 1 });
    const onceki = { alternatif: a, alternatifSonucu: { sonuc: 'icinde' as const, nedenler: [], izin: null, kart: AK1 } };
    assert.equal(dondurulmusKart({ ...a, olcu: { d: 52 } }, onceki), AK1);
    assert.equal(dondurulmusKart(alt({ olcu: { d: 53 }, kartId: 1 }), onceki), null);
    assert.equal(dondurulmusKart({ ...a, islem: ['eloksal'] }, onceki), null);
    const silinmis = { alternatif: { ...a, kartId: null }, alternatifSonucu: { ...onceki.alternatifSonucu, kart: { ...AK1, setId: null } } };
    assert.equal(dondurulmusKart({ ...a, kartId: null }, silinmis)?.setId, null);
    assert.notEqual(alternatifIzi(alt({ islem: ['a', 'b'] })), alternatifIzi(alt()));
    assert.equal(alternatifIzi(alt({ islem: ['b', 'a'] })), alternatifIzi(alt({ islem: ['a', 'b'] })));
  });

  test('S7: kabul sınırıyla gelen teklifte ana karttan farklı işlem sınır dışı; işlem gelmezse ana kartınki sayılır', () => {
    const zarf = {
      kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
      kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [], sinir: false }, durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [], sinir: false },
      form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }], pay: { tur: 'mm' as const, deger: 5, enAzMm: 0, kaynak: null },
      boy: null, yuzey: { istenen: 'Ham', serbest: false, kaynak: null, secenekler: [], sinir: false },
    };
    const r = alternatifSonucuHesapla(zarf, null, alt({ islem: ['eloksal'] }), zarfDegerlendir, null, []);
    assert.deepEqual([r.sonuc, r.nedenler[0]], ['disi', ILETILER.alternatifIslemFarki('eloksal')]);
    assert.equal(alternatifSonucuHesapla(zarf, null, alt({ olcu: { d: 52 } }), zarfDegerlendir, null, []).sonuc, 'icinde');
    assert.equal(alternatifSonucuHesapla(zarf, null, alt({ islem: [] }), zarfDegerlendir, null, []).sonuc, 'ayni');
  });
});

describe('3593 dilim 3: alternatif kartıyla teklif ve onayda kart açma (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', talep: '', sa: '', mudur: '' };
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const post = (cerez: string, url: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/api${url}`, payload: payload as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const get = (cerez: string, url: string) => app.inject({ method: 'GET', url: `/api${url}`, headers: { cookie: cerez } });
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await ortam!.vt.tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    await ortam!.vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
    });
    return giris(kullaniciAdi);
  }
  let kart = 0;
  const ak: number[] = [];
  const setAc = async (ad: string, tur: string, nitelikler: unknown[]): Promise<number> => {
    const r = await post(c.yonetici, '/malzeme-alternatifleri/setler/kaydet', { anaNo: kart, ad, tur, kullanimYerleri: ['talep', 'satin_alma'], notu: null, genisOnay: false, nitelikler });
    assert.equal(r.statusCode, 200, r.body);
    return (r.json() as { id: number }).id;
  };

  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('sa_teklif_alternatif_karti');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.talep = await rolluKisi('cam', 'cam');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.mudur = await rolluKisi('mudur', 'mudur');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-TAK-', 100) ON CONFLICT (onek) DO NOTHING");
    kart = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('tak-1', 'hammadde', 'HM-TAK-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'tak-1', com: { ad: 'Örnek çubuk', birim: 'adet' }, fam: 'metal', cls: 'aluminyum', grade: '6082', form: 'cubuk', dims: { d: 50, l: 3000 }, opts: { durum: 'T6', yuzey: 'Ham' } }), yoneticiId]))!.no;
    ak.push(await setAc('ORN AK-1', 'tam', [
      { nitelik: 'kalite', degerler: ['6082', '6061'], alt: null, ust: null },
      { nitelik: 'd', kip: 'pay', degerler: null, alt: null, ust: null, payAlt: 0, payUst: 5 },
      { nitelik: 'l', kip: 'birebir', degerler: null, alt: null, ust: null },
    ]));
    ak.push(await setAc('ORN AK-2', 'sartli', [{ nitelik: 'islem', degerler: ['eloksal'], alt: null, ust: null }]));
    ak.push(await setAc('ORN AK-3', 'tam', [{ nitelik: 'kalite', degerler: ['7075'], alt: null, ust: null }]));
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t;
    return g;
  };
  const kaydet = (t: Record<string, unknown> & { id: string }, cerez = c.sa) => post(cerez, `/satin-alma-talepleri/${t.id}/kaydet`, t);
  const teklif = (fiyatlar: Record<string, unknown>[]) => ({
    id: randomUUID(), firmaId: null, tedarikciAdi: 'Deneme Tedarik', teklifTarihi: '2026-11-23', gecerlilik: null,
    paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '0', nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7,
    vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true, notlar: '', ilkToplam: null, revizyon: 0, fiyatlar,
  });
  const karar = (teklifId: string) => ({ mod: 'tek', teklifId, bolunme: [], gerekce: '', kararVerenKisiId: 1, kararTarihi: '2026-11-23', ogrenilenler: '', sabitKurlar: [], siparisler: [] });
  // Talep eden AK-1 ve AK-2'yi işaretler; AK-3 işaretsiz.
  async function tekliflik(): Promise<Talep> {
    const t = (await post(c.talep, '/satin-alma-talepleri/hizli-ac', { id: randomUUID(), kalemler: [{ malzemeNo: kart, miktar: '4', alternatifKartlari: [ak[0], ak[1]] }] })).json() as Talebim;
    const sa = ((await get(c.sa, '/satin-alma-acilis')).json() as AcilisCevabi).talepler.find((x) => x.id === t.id)!;
    const r = await kaydet({ ...govde(sa), durum: 'degerlendirme' });
    assert.equal(r.statusCode, 200, r.body);
    return r.json() as Talep;
  }
  const hata = (r: { body: string }) => JSON.parse(r.body) as { alan?: string; mesaj?: string };

  test('kalem zarfları işaretli kartların çözülmüş sınırını verir (Pay ve Birebir ana ölçüden); ana kartın işlemi gelir', async () => {
    const t = await tekliflik();
    const k = ((await get(c.sa, `/satin-alma-talepleri/${t.id}/kalem-zarflari`)).json() as KalemZarflariCevabi).kalemler[0]!;
    assert.deepEqual(k.islem, []);
    assert.deepEqual(k.alternatifKartlari?.map((x) => [x.setId, x.degisti]), [[ak[0], false], [ak[1], false]]);
    assert.deepEqual(k.alternatifKartlari![0]!.sinir.filter((x) => x.degerler === null).map((x) => [x.nitelik, x.birebir, x.alt, x.ust]), [['d', false, 50, 55], ['l', true, 3000, 3000]]);
  });

  test('izinli: işaretli kartla teklif sınır içinde kaydedilir, sınır satıra dondurulur; kart jsonb\'de değil sütunda', async () => {
    const t = await tekliflik();
    const q = teklif([{ kalemId: t.kalemler[0]!.id, birimFiyat: '10', alternatif: alt({ kalite: '6061', olcu: { d: 52 }, kartId: ak[0]! }) }]);
    const r = await kaydet({ ...govde(t), teklifler: [q] });
    assert.equal(r.statusCode, 200, r.body);
    const f = (r.json() as Talep).teklifler[0]!.fiyatlar[0]!;
    assert.deepEqual([f.alternatif?.kartId, f.alternatifSonucu?.sonuc, f.alternatifSonucu?.kart?.setId, f.alternatifSonucu?.kart?.ana.olcu], [ak[0], 'icinde', ak[0], { d: 50, l: 3000 }]);
    const satir = (await ortam!.sahip.tek<{ s: number; j: Record<string, unknown> }>('SELECT alternatif_seti_id AS s, alternatif AS j FROM satin_alma_teklif_satiri WHERE talep_id = $1', [t.id]))!;
    assert.deepEqual([satir.s, 'kartId' in satir.j], [ak[0], false]);
  });

  test('yasak: sınır dışı değer, işaretsiz kart kaydedilmez (400, satır alanı); kabul sınırıyla işlem farkı sınır dışı', async () => {
    const t = await tekliflik();
    const k0 = t.kalemler[0]!.id;
    const r1 = await kaydet({ ...govde(t), teklifler: [teklif([{ kalemId: k0, birimFiyat: '10', alternatif: alt({ olcu: { d: 56 }, kartId: ak[0]! }) }])] });
    assert.deepEqual([r1.statusCode, hata(r1).alan, hata(r1).mesaj], [400, 'teklifler.0.fiyatlar.0.alternatif', ILETILER.alternatifKartiDisi('Örnek çubuk', 'ORN AK-1', 'd 56')]);
    const r2 = await kaydet({ ...govde(t), teklifler: [teklif([{ kalemId: k0, birimFiyat: '10', alternatif: alt({ kalite: '7075', kartId: ak[2]! }) }])] });
    assert.deepEqual([r2.statusCode, hata(r2).mesaj], [400, ILETILER.alternatifKartiIsaretsiz('Örnek çubuk')]);
    assert.equal((await ortam!.sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM satin_alma_teklif WHERE talep_id = $1', [t.id]))!.n, 0);
    const r3 = await kaydet({ ...govde(t), teklifler: [teklif([{ kalemId: k0, birimFiyat: '10', alternatif: alt({ islem: ['eloksal'] }) }])] });
    assert.equal(r3.statusCode, 200, r3.body);
    assert.equal((r3.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc, 'disi');
  });

  test('S3: ana ölçü değişince açık teklif dondurulan sınırla kalır; yeni seçim "kart değişti" ile reddedilir; set silinince sınır kalır', async () => {
    const t = await tekliflik();
    const k0 = t.kalemler[0]!.id;
    const q = teklif([{ kalemId: k0, birimFiyat: '10', alternatif: alt({ olcu: { d: 54 }, kartId: ak[0]! }) }]);
    const d = (await kaydet({ ...govde(t), teklifler: [q] })).json() as Talep;
    await ortam!.sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{dims,d}', '60') WHERE no = $1`, [kart]);
    try {
      const ayni = await kaydet({ ...govde(d) });
      assert.equal(ayni.statusCode, 200, ayni.body);
      assert.deepEqual([(ayni.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc, (ayni.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.kart?.ana.olcu.d], ['icinde', 50]);
      const yeni = await kaydet({ ...govde(ayni.json() as Talep), teklifler: [{ ...q, fiyatlar: [{ kalemId: k0, birimFiyat: '10', alternatif: alt({ olcu: { d: 62 }, kartId: ak[0]! }) }] }] });
      assert.deepEqual([yeni.statusCode, hata(yeni).mesaj], [400, ILETILER.alternatifKartiDegisti('Örnek çubuk', 'ORN AK-1')]);
    } finally {
      await ortam!.sahip.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{dims,d}', '50') WHERE no = $1`, [kart]);
    }
    const ikinci = await tekliflik();
    const q2 = teklif([{ kalemId: ikinci.kalemler[0]!.id, birimFiyat: '10', alternatif: alt({ islem: ['eloksal', 'boya'], kartId: ak[1]! }) }]);
    const d2 = (await kaydet({ ...govde(ikinci), teklifler: [q2] })).json() as Talep;
    await ortam!.sahip.sorgu('UPDATE satin_alma_teklif_satiri SET alternatif_seti_id = NULL WHERE talep_id = $1', [ikinci.id]);
    const okunan = ((await get(c.sa, '/satin-alma-acilis')).json() as AcilisCevabi).talepler.find((x) => x.id === ikinci.id)!;
    const f = okunan.teklifler[0]!.fiyatlar[0]!;
    assert.deepEqual([f.alternatif?.kartId, f.alternatifSonucu?.kart?.setId, f.alternatifSonucu?.kart?.ad], [null, null, 'ORN AK-2']);
    const yeniden = await kaydet({ ...govde(okunan) });
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.deepEqual([(yeniden.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc, d2.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc], ['sartli', 'sartli']);
  });

  test('S4, S5: işlemi farklı alternatif ana karta ya da işlemi farklı karta düşmez; yeni kart ONAYDA, işlemiyle açılır; aynı işlemli kart bulunur', async () => {
    const onayla = async (islem: string[]): Promise<number> => {
      const t = await tekliflik();
      const q = teklif([{ kalemId: t.kalemler[0]!.id, birimFiyat: '10', alternatif: alt({ islem, kartId: ak[1]! }) }]);
      const d = (await kaydet({ ...govde(t), teklifler: [q] })).json() as Talep;
      assert.deepEqual([d.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.sonuc, d.teklifler[0]!.fiyatlar[0]!.alternatifSonucu?.izin], ['sartli', 'talep']);
      const g = await kaydet({ ...govde(d), durum: 'onayda', karar: karar(q.id) });
      assert.equal(g.statusCode, 200, g.body);
      const o = await kaydet({ ...govde(g.json() as Talep), onaylar: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay', dortGozsuz: false, notlar: '' }] }, c.mudur);
      assert.equal(o.statusCode, 200, o.body);
      return (o.json() as Talep).teklifler[0]!.fiyatlar[0]!.alternatifSonucu!.kartNo!;
    };
    const oku = async (no: number) => (await ortam!.sahip.tek<{ d: string; islem: unknown; g: string | null }>(
      `SELECT onay_durumu AS d, kayit->'opts'->'islem' AS islem, mukerrer_gerekcesi AS g FROM malzeme_katalog_karti WHERE no = $1`, [no]))!;
    const x = await onayla(['eloksal']);
    assert.notEqual(x, kart, 'ana karta düşmemeli');
    assert.deepEqual(Object.values(await oku(x)).slice(0, 2), ['onayda', ['eloksal']]);
    // Ana kart aynı anahtarı taşısın (canlıdaki gibi; X o zaman gerekçeyle açılmış olurdu): anahtarı tutan ama işlemi tutmayan kartlar
    // (ana ve X) kullanılmaz, yeni kart gerekçeyle açılır.
    await ortam!.sahip.sorgu("UPDATE malzeme_katalog_karti SET mukerrer_gerekcesi = 'alternatif: islem farki' WHERE no = $1", [x]);
    await ortam!.sahip.sorgu('UPDATE malzeme_katalog_karti SET benzersiz_anahtar = (SELECT benzersiz_anahtar FROM malzeme_katalog_karti WHERE no = $2) WHERE no = $1', [kart, x]);
    const y = await onayla(['eloksal', 'boya']);
    assert.ok(![kart, x].includes(y));
    assert.deepEqual(Object.values(await oku(y)), ['onayda', ['eloksal', 'boya'], 'alternatif: islem farki']);
    assert.equal(await onayla(['eloksal']), x, 'aynı işlemli kart bulunur');
  });
});
