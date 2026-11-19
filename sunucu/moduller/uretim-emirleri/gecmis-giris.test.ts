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
import { adimliEmirCevabi, gecmisGirisCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { aralikAdetleri, emirBaslat, emirBitir, hurdaSayimDinle, saglamSayimDinle, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import {
  GECMIS_ADET_ASIMI, GECMIS_FASON, GECMIS_GERI_SONRAKI, GECMIS_HURDA_NEDENI, GECMIS_SIRA, GECMIS_SON_ADIM, GECMIS_TARIH_ILERI,
} from './gecmis-giris-kurallar.ts';
import { ozetGetir } from './sorgular/kullanim/sorgular.ts';
import { kisininGunlukIsEmirleriGetir, kisininHurdalariGetir, kisininIsEmirleriGetir } from './sorgular/sureler/sorgular.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
const GUN_MS = 86_400_000;

describe('3455-1 geçmiş adım girişi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  let nedenId = 0;
  let firma = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();
  const bugun = tesisGunu(Date.now());
  const gunOnce = (n: number): string => tesisGunu(Date.now() - n * GUN_MS);

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

  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function girisYap(kullaniciAdi: string): Promise<void> {
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
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
    await girisYap(kullaniciAdi);
  }
  async function makine(): Promise<{ makine: number; istasyon: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`GGM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`GGI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, 'talasli']))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    const m = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`GGMK${sayac}`, 'Tezgah', ist]))!.id;
    return { makine: m, istasyon: ist };
  }
  const adim = (sira: number, kaynak: IsEmriGirdisi['kaynak']): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak,
    ayarSuresiDk: kaynak?.tur === 'fason' ? null : '10', birimSureDk: kaynak?.tur === 'fason' ? null : '1.5',
    terminGun: kaynak?.tur === 'fason' ? 5 : null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  // Üç makine adımı; fasonlu verilirse ikinci adım fasondur.
  async function emirAc(adet = 120, fasonlu = false): Promise<{ id: number; istasyonlar: number[] }> {
    const yerler = [await makine(), await makine(), await makine()];
    const kaynaklar: IsEmriGirdisi['kaynak'][] = yerler.map((y, i) => (fasonlu && i === 1 ? { tur: 'fason', id: firma } : { tur: 'makine', id: y.makine }));
    const r = await tx((db) => uretimEmriAc(db, kim('planlama'), {
      malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: kaynaklar.map((k, i) => adim(i + 1, k)), projeId: null, emirTuru: 'stok',
    }));
    return { id: r.uretimEmriId, istasyonlar: yerler.map((y) => y.istasyon) };
  }
  async function ayrinti(id: number): Promise<AdimliEmirAyrintisi> {
    const c = await istek('yonetici', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir;
  }
  const girisGovdesi = (surum: number, ek: Record<string, unknown> = {}) => ({
    surum, baslama: gunOnce(10), bitis: gunOnce(5), stokaYaz: false,
    adimlar: [
      { opNo: 10, baslama: null, bitis: gunOnce(8), saglam: 120, hurda: 0, hurdaNedeniId: null, operatorId: null },
      { opNo: 20, baslama: null, bitis: null, saglam: 118, hurda: 2, hurdaNedeniId: nedenId, operatorId: kim('operator').id },
    ],
    ...ek,
  });
  const gir = (id: number, govde: unknown, ad = 'yonetici') => istek<{ mesaj?: string; alan?: string }>(ad, 'POST', `/adimli-emirler/${id}/gecmis-giris`, govde);
  const geriAl = (id: number, surum: number) => istek<{ mesaj?: string }>('yonetici', 'POST', `/adimli-emirler/${id}/gecmis-giris/geri-al`, { surum });

  before(async () => {
    ortam = await testVeritabaniKur('uretim_gecmis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisYap('yonetici');
    await kisiEkle('planlama', 'planlama_proje');
    await kisiEkle('operator', 'operator');
    firma = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id, fason) VALUES ('Deneme Fasoncu', 'tedarikci', $1, true) RETURNING id", [yoneticiId]))!.id;
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('GG-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    nedenId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('GG-TK', 'Deneme takım kırılması', 900) RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('GG-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('gg-dnm-1', 'mamul', 'GG-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'gg-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('yetki: işlemi olmayan planlama 403 alır ve emir değişmez; yönetici girer', async () => {
    const { id } = await emirAc();
    const e = await ayrinti(id);
    const red = await gir(id, girisGovdesi(e.surum), 'planlama');
    assert.equal(red.durum, 403, JSON.stringify(red.govde));
    assert.equal((await ayrinti(id)).surum, e.surum);
    const kabul = await gir(id, girisGovdesi(e.surum));
    assert.equal(kabul.durum, 200, JSON.stringify(kabul.govde));
  });

  test('giriş: adımlar biter, rozet görünür, sayım geçmiş kaynaklı; sıradaki adım terminalde olağan başlar ve girdisi önceki sağlamdır', async () => {
    const { id, istasyonlar } = await emirAc();
    const e = await ayrinti(id);
    const r = await gir(id, girisGovdesi(e.surum));
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const c = gecmisGirisCevabi.parse(r.govde);
    const [a1, a2, a3] = c.emir.isEmirleri;
    assert.deepEqual([a1?.durum, a2?.durum, a3?.durum], ['tamam', 'tamam', 'bekliyor']);
    assert.deepEqual([a1?.saglamAdet, a2?.saglamAdet], [120, 118]);
    assert.equal(a1?.gecmisGiris?.giren.id, yoneticiId);
    assert.deepEqual([a1?.gecmisGiris?.operator, a1?.gecmisGiris?.baslama, a1?.gecmisGiris?.bitis], [null, null, gunOnce(8)], 'girilmeyen değer uydurulmaz');
    assert.equal(a2?.gecmisGiris?.operator?.id, kim('operator').id);
    assert.equal(a2?.gecmisGiris?.stokYazildi, false);
    assert.equal(a3?.gecmisGiris ?? null, null);
    assert.deepEqual([a1?.gecmisGiris?.hurda, a1?.gecmisGiris?.hurdaNedeni, a2?.gecmisGiris?.hurda, typeof a2?.gecmisGiris?.hurdaNedeni?.ad], [0, null, 2, 'string']);
    assert.ok(c.emir.surum > e.surum);
    const ozet = await istek('yonetici', 'GET', `/uretim-emirleri/${String(id)}`);
    const il = (ozet.govde as { ilerleme?: { adimlar: { durum: string }[] } | null }).ilerleme;
    assert.deepEqual(il?.adimlar.map((a) => a.durum), ['tamam', 'tamam', 'bekliyor'], 'emir özetinin rota ilerlemesi geçmiş girişi görür');
    const kaynaklar = await o().sahip.sorgu<{ kaynak: string | null; tur: string; adet: number }>(
      'SELECT kaynak, tur, adet FROM uretim_sayimi WHERE emir_id = $1 ORDER BY id', [id]);
    assert.deepEqual(kaynaklar, [{ kaynak: 'gecmis', tur: 'saglam', adet: 120 }, { kaynak: 'gecmis', tur: 'saglam', adet: 118 }, { kaynak: 'gecmis', tur: 'hurda', adet: 2 }]);
    const kayit = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_kaydi WHERE emir_id = $1', [id]);
    assert.equal(kayit?.n, 0, 'terminal başlatma ve bitirme kaydı yazılmaz');
    const sonuc = await tx((db) => emirBaslat(db, kim('operator'), id));
    assert.equal(sonuc.emir.durum, 'basladi');
    assert.equal(sonuc.emir.istasyon.id, istasyonlar[2]);
    await tx((db) => emirBitir(db, kim('operator'), id, 118));
    const son = await ayrinti(id);
    assert.equal(son.isEmirleri[2]?.saglamAdet, 118);
  });

  test('süre, OEE ve gün toplamları geçmiş sayımı görmez; adet akışı görür', async () => {
    const { id, istasyonlar } = await emirAc();
    const e = await ayrinti(id);
    const adimlar = e.isEmirleri.map((a) => a.id);
    const bas = new Date(Date.now() - GUN_MS).toISOString();
    const bit = new Date(Date.now() + GUN_MS).toISOString();
    // Kişi ve gün toplamı başka testlerin terminal sayımını da taşır: girişten önceki ve sonraki değer aynı kalmalıdır.
    const kisiAdedi = async (): Promise<number> =>
      (await tx((db) => aralikAdetleri(db, 'kisi', [kim('operator').id], bas, bit))).get(kim('operator').id)?.saglam ?? 0;
    const gunAdedi = async (): Promise<number> => {
      const c = await istek<{ gunler: { gun: string; saglam: number }[] }>('yonetici', 'GET', '/uretim-emirleri/gunluk-uretim?gun=1');
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde.gunler.find((g) => g.gun === bugun)?.saglam ?? 0;
    };
    // Sayım giriş anında yazılır (zaman = şimdi), bu yüzden pencere bugünü kapsar. Operatörlü adım OP20'de 2 hurda vardır.
    const op = kim('operator').id;
    const istasyonAdedi = async () => [...(await tx((db) => aralikAdetleri(db, 'istasyon', istasyonlar, bas, bit))).values()];
    const kisiEkrani = async () => tx(async (db) => ({
      bugun: (await ozetGetir(db, op, [])).bugunSaglam,
      hurdalar: await kisininHurdalariGetir(db, op, bas, bit),
      isEmirleri: (await kisininIsEmirleriGetir(db, op, bas, bit)).filter((r) => r.uretimEmriId === id).length,
      gunluk: (await kisininGunlukIsEmirleriGetir(db, op, [bas, bit])).filter((r) => r.uretimEmriId === id).length,
    }));
    const [kisiOnce, gunOnceki, istasyonOnce, ekranOnce] = [await kisiAdedi(), await gunAdedi(), await istasyonAdedi(), await kisiEkrani()];
    assert.equal((await gir(id, girisGovdesi(e.surum))).durum, 200);
    assert.deepEqual(await istasyonAdedi(), istasyonOnce, 'istasyon kırılımı');
    assert.deepEqual(await kisiEkrani(), ekranOnce, 'kişi özeti, iş emirleri, günlük iş emirleri ve hurdalar');
    // Makine kırılımı ve OEE makine kullanımı satırına bağlanır; geçmiş giriş makine kullanımı yazmadığı için oraya da düşmez.
    const kullanim = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1', [id]);
    assert.equal(kullanim?.n, 0);
    const adetler = await tx((db) => aralikAdetleri(db, 'is_emri', adimlar, bas, bit));
    assert.equal(adetler.size, 0, 'giriş anına sayılmaz');
    assert.equal(await kisiAdedi(), kisiOnce);
    assert.equal(await gunAdedi(), gunOnceki);
    const sayim = await o().sahip.tek<{ n: number }>("SELECT count(*)::int AS n FROM uretim_sayimi WHERE emir_id = $1 AND kaynak = 'gecmis'", [id]);
    assert.equal(sayim?.n, 3, 'sayım yazılmıştır; yalnız canlı toplamların dışındadır');
  });

  test('stok: seçilmezse sayım dinleyicisi çağrılmaz; seçilirse sağlam ve hurda dinleyiciye gider', async () => {
    const olaylar: string[] = [];
    const b1 = saglamSayimDinle((_db, x) => { olaylar.push(`s${x.fark}`); return Promise.resolve(); });
    const b2 = hurdaSayimDinle((_db, x) => { olaylar.push(`h${x.fark}`); return Promise.resolve(); });
    try {
      const a = await emirAc();
      assert.equal((await gir(a.id, girisGovdesi((await ayrinti(a.id)).surum))).durum, 200);
      assert.deepEqual(olaylar, []);
      const b = await emirAc();
      const r = await gir(b.id, girisGovdesi((await ayrinti(b.id)).surum, { stokaYaz: true }));
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      assert.deepEqual(olaylar, ['s120', 's118', 'h2']);
      assert.equal(gecmisGirisCevabi.parse(r.govde).emir.isEmirleri[0]?.gecmisGiris?.stokYazildi, true);
    } finally {
      b1();
      b2();
    }
  });

  test('ret: son adım, adım atlama, fason, ileri tarih, adet aşımı, nedensiz hurda, eski sürüm; hiçbiri emri değiştirmez', async () => {
    const { id } = await emirAc();
    const e = await ayrinti(id);
    const tek = (opNo: number, ek: Record<string, unknown> = {}) => ({ opNo, baslama: null, bitis: null, saglam: 10, hurda: 0, hurdaNedeniId: null, operatorId: null, ...ek });
    const dene = async (govde: unknown, kod: number, ileti: string): Promise<void> => {
      const r = await gir(id, govde);
      assert.equal(r.durum, kod, JSON.stringify(r.govde));
      assert.equal(r.govde.mesaj, ileti);
    };
    await dene(girisGovdesi(e.surum, { adimlar: [tek(10), tek(20), tek(30)] }), 409, GECMIS_SON_ADIM);
    await dene(girisGovdesi(e.surum, { adimlar: [tek(20)] }), 409, GECMIS_SIRA);
    await dene(girisGovdesi(e.surum, { bitis: tesisGunu(Date.now() + 2 * GUN_MS) }), 400, GECMIS_TARIH_ILERI);
    await dene(girisGovdesi(e.surum, { adimlar: [tek(10, { saglam: 5 }), tek(20, { saglam: 6 })] }), 400, GECMIS_ADET_ASIMI);
    await dene(girisGovdesi(e.surum, { adimlar: [tek(10, { hurda: 1 })] }), 400, GECMIS_HURDA_NEDENI);
    assert.equal((await gir(id, girisGovdesi(e.surum + 1))).durum, 409);
    const f = await emirAc(120, true);
    const fe = await ayrinti(f.id);
    const rf = await gir(f.id, girisGovdesi(fe.surum));
    assert.equal(rf.govde.mesaj, GECMIS_FASON);
    const sonra = await ayrinti(id);
    assert.equal(sonra.surum, e.surum);
    assert.ok(sonra.isEmirleri.every((a) => a.durum === 'bekliyor'));
  });

  test('geri alma: son girilen adım bekler, sayım netlenir, rozet kalkar; sonraki adım başladıysa geri alınmaz', async () => {
    const { id } = await emirAc();
    assert.equal((await gir(id, girisGovdesi((await ayrinti(id)).surum))).durum, 200);
    const r = await geriAl(id, (await ayrinti(id)).surum);
    assert.equal(r.durum, 200, JSON.stringify(r.govde));
    const e = gecmisGirisCevabi.parse(r.govde).emir;
    assert.deepEqual(e.isEmirleri.map((a) => a.durum), ['tamam', 'bekliyor', 'bekliyor']);
    assert.equal(e.isEmirleri[1]?.gecmisGiris ?? null, null);
    assert.ok(e.isEmirleri[0]?.gecmisGiris);
    const net = await o().sahip.tek<{ s: number; h: number }>(
      "SELECT COALESCE(sum(adet) FILTER (WHERE tur = 'saglam'), 0)::int AS s, COALESCE(sum(adet) FILTER (WHERE tur = 'hurda'), 0)::int AS h FROM uretim_sayimi WHERE is_emri_id = $1",
      [e.isEmirleri[1]?.id]);
    assert.deepEqual(net, { s: 0, h: 0 });
    const defter = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_gecmis_giris WHERE uretim_emri_id = $1', [id]);
    assert.equal(defter?.n, 3, 'defter silinmez; geri alma ayrı satırdır');
    await tx((db) => emirBaslat(db, kim('operator'), id));
    const red = await geriAl(id, (await ayrinti(id)).surum);
    assert.equal(red.durum, 409, JSON.stringify(red.govde));
    assert.notEqual(red.govde.mesaj, undefined);
  });

  test('geri alma sonraki adımda sayım varsa reddedilir', async () => {
    const { id } = await emirAc();
    assert.equal((await gir(id, girisGovdesi((await ayrinti(id)).surum, {
      adimlar: [{ opNo: 10, baslama: null, bitis: null, saglam: 120, hurda: 0, hurdaNedeniId: null, operatorId: null }],
    }))).durum, 200);
    await tx((db) => emirBaslat(db, kim('operator'), id));
    await tx((db) => emirBitir(db, kim('operator'), id, 50));
    const red = await geriAl(id, (await ayrinti(id)).surum);
    assert.equal(red.govde.mesaj, GECMIS_GERI_SONRAKI);
  });

  test('eşzamanlı iki giriş aynı emre: biri yazar, öteki 409 alır; adım bir kez biter, sayım çiftlenmez', async () => {
    const { id } = await emirAc();
    const e = await ayrinti(id);
    const [r1, r2] = await Promise.all([gir(id, girisGovdesi(e.surum)), gir(id, girisGovdesi(e.surum))]);
    assert.deepEqual([r1.durum, r2.durum].sort(), [200, 409], JSON.stringify([r1.govde, r2.govde]));
    const defter = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_gecmis_giris WHERE uretim_emri_id = $1', [id]);
    assert.equal(defter?.n, 2);
    const sayim = await o().sahip.tek<{ s: number }>("SELECT COALESCE(sum(adet), 0)::int AS s FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'saglam'", [id]);
    assert.equal(sayim?.s, 238);
  });

  test('eşzamanlı iki geri alma: biri geri alır, öteki 409 alır; defterde tek geri satırı', async () => {
    const { id } = await emirAc();
    assert.equal((await gir(id, girisGovdesi((await ayrinti(id)).surum))).durum, 200);
    const surum = (await ayrinti(id)).surum;
    const [r1, r2] = await Promise.all([geriAl(id, surum), geriAl(id, surum)]);
    assert.deepEqual([r1.durum, r2.durum].sort(), [200, 409], JSON.stringify([r1.govde, r2.govde]));
    const geri = await o().sahip.tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM uretim_emirleri_gecmis_giris WHERE uretim_emri_id = $1 AND geri_alinan_id IS NOT NULL', [id]);
    assert.equal(geri?.n, 1);
  });
});
