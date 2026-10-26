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
import { adimliEmirCevabi, asimlarCevabi, emirCevabi, katilimCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { AdimliEmirAyrintisi, AsimlarCevabi, Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { acikEmir, emirBaslat, emirBitir, emirDevam, emirDuraklat, emirSayim, kararliSayimiSonuclandir, uretimEmriAc } from './disari.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { ADIM_ACIK_DEGIL, ADIM_BASLAMIS, ADIM_SECILMELI, IS_EMRI_YOK, MAKINE_DOLU } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('uretim-emirleri paralel adım (kart 639, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
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

  async function makineliIstasyon(): Promise<{ ist: number; makine: number }> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`PAM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ($1, $2, $3) RETURNING id', [`PAI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist]);
    const makine = (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`PAMK${sayac}`, 'Tezgah', ist]))!.id;
    return { ist, makine };
  }

  const adim = (sira: number, makine: number, ek: Partial<IsEmriGirdisi> = {}): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: makine },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], ...ek,
  });
  const ac = async (isEmirleri: IsEmriGirdisi[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, kim('planlama_proje'), {
      malzemeNo: urunNo, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri, projeId,
    }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };
  const ayrinti = async (id: number): Promise<AdimliEmirAyrintisi> => {
    const c = await istek<{ emir: AdimliEmirAyrintisi }>('planlama_proje', 'GET', `/adimli-emirler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return adimliEmirCevabi.parse(c.govde).emir as AdimliEmirAyrintisi;
  };
  const op = kim.bind(null, 'operator');
  const sayim = (id: number, adet: number, isEmriId?: number) =>
    tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet }, isEmriId === undefined ? {} : { isEmriId }));
  // 327 a: ilk sağlam sayım kalite kararını bekler; akışı ölçen test ilk parçayı onaylar.
  const ilkParcaOnay = (id: number) => tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
  const adimYolu = (id: number, isEmriId: number, komut: string) => `/adimli-emirler/${id}/is-emirleri/${isEmriId}/${komut}`;

  before(async () => {
    ortam = await testVeritabaniKur('uretim_paralel_adim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.PARALEL', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    for (const [ad, rol] of [['planlama_proje', 'planlama_proje'], ['operator', 'operator'], ['operator2', 'operator']] as const) await kisiEkle(ad, rol);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('PA-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PA-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('pa-dnm-1', 'mamul', 'PA-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'pa-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('akışlı adım önceki sürerken başlar; komut adımı yoldan ya da gövdeden alır; aşım uyarır ve iz bırakır; önceki bitmeden sonraki bitmez', async () => {
    const a = await makineliIstasyon();
    const b = await makineliIstasyon();
    const { id, adimlar: [ie1, ie2] } = await ac([adim(1, a.makine), adim(2, b.makine, { bagimlilik: 'akisli', devirAdedi: 2 })]) as { id: number; adimlar: [number, number] };

    assert.equal((await tx((db) => emirBaslat(db, op(), id))).uyari, null, 'eski yol: sıradaki adım başlar');
    await sayim(id, 1);
    await ilkParcaOnay(id);
    await sayim(id, 2);
    let e = (await tx((db) => acikEmir(db, id)))!;
    assert.deepEqual(e.baslatilabilirAdimlar, [ie2], 'devir adedi (2) geldi: akışlı adım kuralı tutuyor');

    const ikinci = await tx((db) => emirBaslat(db, kim('operator2'), id, undefined, undefined, ie2));
    assert.equal(ikinci.uyari, null);
    e = (await tx((db) => acikEmir(db, id)))!;
    assert.deepEqual(e.acikAdimlar?.map((x) => [x.isEmriId, x.istasyon?.id, x.calisma, x.eksik]), [[ie1, a.ist, 'calisiyor', null], [ie2, b.ist, 'calisiyor', 3]]);
    assert.equal(e.istasyon.id, a.ist, 'emrin istasyonu öncü adımda kalır');
    assert.deepEqual(e.baslatilabilirAdimlar, []);

    await red(tx((db) => emirDuraklat(db, op(), id)), ADIM_SECILMELI);
    await red(tx((db) => emirBaslat(db, op(), id, undefined, undefined, ie2)), ADIM_BASLAMIS);
    const durak = await istek<Emir>('operator', 'POST', adimYolu(id, ie1, 'duraklat'));
    assert.equal(durak.durum, 200, JSON.stringify(durak.govde));
    emirCevabi.parse(durak.govde);
    e = (await tx((db) => acikEmir(db, id)))!;
    assert.deepEqual(e.acikAdimlar?.map((x) => x.calisma), ['durakli', 'calisiyor']);
    assert.equal((await o().sahip.tek<{ calisma: string }>('SELECT calisma FROM uretim_emri WHERE id = $1', [id]))?.calisma, 'calisiyor', 'bir adım sürüyor');
    assert.equal((await istek('operator', 'POST', adimYolu(id, ie1, 'duraklat'))).durum, 409, 'duraklamış adım yeniden duraklamaz');

    // İkinci adım ilk adımın teslim ettiğinden fazla sayar: reddedilmez, uyarır; eksi önceki adımda kalır.
    const asim = await sayim(id, 5, ie2);
    assert.match(asim.uyari ?? '', /sayılan 5, önceki adımdan gelen 3; 2 fazla \(OP 20\)/);
    assert.equal((await ayrinti(id)).isEmirleri.find((i) => i.id === ie2)?.eksik, -2);
    const iz = await istek<AsimlarCevabi>('operator', 'GET', adimYolu(id, ie2, 'asimlar'));
    assert.equal(iz.durum, 200, JSON.stringify(iz.govde));
    assert.deepEqual(asimlarCevabi.parse(iz.govde).asimlar.map((x) => [x.isEmriId, x.opNo, x.kisi.id, x.adet, x.oncekiSaglam]), [[ie2, 20, op().id, 2, 3]]);
    assert.deepEqual((await istek<AsimlarCevabi>('operator', 'GET', adimYolu(id, ie1, 'asimlar'))).govde.asimlar, [], 'ilk adımda aşım yok');
    assert.equal((await istek('operator', 'GET', `/adimli-emirler/${id}/is-emirleri/2147483647/asimlar`)).durum, 404);

    await red(tx((db) => emirBitir(db, kim('operator2'), id, undefined, undefined, ie2)), 'OP 10 bitmeden OP 20 bitirilemez; önce OP 10 bitirilmeli.');
    await red(tx((db) => emirSayim(db, op(), id, { tur: 'saglam', adet: 1 }, { isEmriId: 2147483647 })), IS_EMRI_YOK);

    // İlk adım saydıkça eksi kapanır; ilk adım bitince emir sürer ve istasyonu sürene geçer.
    await tx((db) => emirDevam(db, op(), id, undefined, undefined, ie1));
    await sayim(id, 3, ie1);
    assert.equal((await ayrinti(id)).isEmirleri.find((i) => i.id === ie2)?.eksik, 1);
    const ilk = await tx((db) => emirBitir(db, op(), id, undefined, undefined, ie1));
    assert.equal(ilk.uyari, null);
    assert.equal(ilk.emir.durum, 'basladi');
    e = (await tx((db) => acikEmir(db, id)))!;
    assert.equal(e.istasyon.id, b.ist, 'emir öncü adımın istasyonuna geçti');
    assert.deepEqual(e.acikAdimlar?.map((x) => x.isEmriId), [ie2]);

    const son = await tx((db) => emirBitir(db, kim('operator2'), id, 6));
    assert.equal(son.emir.durum, 'bitti');
    assert.equal(son.emir.saglamAdet, 6);
    assert.equal(son.uyari, null);
  });

  test('bekleyen adım sıra dışı uyarıyla başlar; aynı kişi iki adımda katılımlıdır; adım verilen komut çalışmayan adımda reddedilir', async () => {
    const a = await makineliIstasyon();
    const b = await makineliIstasyon();
    const { id, adimlar: [ie1, ie2] } = await ac([adim(1, a.makine), adim(2, b.makine)]) as { id: number; adimlar: [number, number] };
    await red(tx((db) => emirDuraklat(db, op(), id, undefined, ie2)), ADIM_ACIK_DEGIL);
    await tx((db) => emirBaslat(db, op(), id));
    assert.deepEqual((await tx((db) => acikEmir(db, id)))!.baslatilabilirAdimlar, [], 'bekleyen adım önceki bitmeden kuralı tutmaz');
    const ikinci = await tx((db) => emirBaslat(db, op(), id, undefined, undefined, ie2));
    assert.equal(ikinci.uyari, 'OP 10 bitmeden OP 20 başlatıldı.');
    const acik = await o().sahip.sorgu<{ is_emri_id: number }>('SELECT is_emri_id FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL ORDER BY is_emri_id', [id]);
    assert.deepEqual(acik.map((k) => k.is_emri_id), [ie1, ie2], '648 a: kişi iki adımda açık katılımlı');
    assert.equal((await istek('planlama_proje', 'POST', adimYolu(id, ie2, 'katilim/ayril'))).durum, 403, 'terminal işlemi olmayan kişi');
    const ayril = await istek('operator', 'POST', adimYolu(id, ie2, 'katilim/ayril'));
    assert.equal(ayril.durum, 200, JSON.stringify(ayril.govde));
    katilimCevabi.parse(ayril.govde);
    const kalan = await o().sahip.sorgu<{ is_emri_id: number }>('SELECT is_emri_id FROM uretim_emirleri_katilim WHERE emir_id = $1 AND cikis IS NULL', [id]);
    assert.deepEqual(kalan.map((k) => k.is_emri_id), [ie1], 'yalnız o adımın katılımı kapandı');
    const baska = await ac([adim(1, a.makine)]);
    assert.equal((await istek('operator', 'POST', adimYolu(baska.id, ie1, 'duraklat'))).durum, 404, 'adım başka emrin');
  });

  test('aynı makinede emrin öteki adımı yeri doldurur; devralma öteki adımı duraklatır', async () => {
    const a = await makineliIstasyon();
    const { id, adimlar: [ie1, ie2] } = await ac([adim(1, a.makine), adim(2, a.makine, { bagimlilik: 'bagimsiz' })]) as { id: number; adimlar: [number, number] };
    await tx((db) => emirBaslat(db, op(), id));
    await red(tx((db) => emirBaslat(db, op(), id, undefined, undefined, ie2)), MAKINE_DOLU);
    const kullanim = (await o().sahip.tek<{ id: number }>('SELECT id FROM uretim_emirleri_makine_kullanimi WHERE emir_id = $1 AND bitis IS NULL', [id]))!.id;
    const devral = await istek<Emir>('operator', 'POST', adimYolu(id, ie2, 'makine-devral'), { kullanimId: kullanim });
    assert.equal(devral.durum, 200, JSON.stringify(devral.govde));
    const e = (await tx((db) => acikEmir(db, id)))!;
    assert.deepEqual(e.acikAdimlar?.map((x) => [x.isEmriId, x.calisma, x.eksik]), [[ie1, 'durakli', null], [ie2, 'calisiyor', null]], 'bağımsız adımda eksik yok');

    // Bağımsız adım önce biter; emrin sağlamı en büyük sıralı adımın sağlamıdır.
    await sayim(id, 1, ie2);
    await ilkParcaOnay(id);
    await sayim(id, 3, ie2);
    assert.equal((await tx((db) => emirBitir(db, op(), id, undefined, undefined, ie2))).emir.durum, 'basladi');
    await tx((db) => emirDevam(db, op(), id, undefined, undefined, ie1));
    await sayim(id, 6, ie1);
    const son = await tx((db) => emirBitir(db, op(), id));
    assert.equal(son.emir.durum, 'bitti');
    assert.equal(son.emir.saglamAdet, 4, 'OP 20 (en büyük sıra) 4 sağlam verdi');
  });

  test('654 a: önceki adım sonrakinin saydığından az sağlamla biterse uyarır, reddetmez', async () => {
    const a = await makineliIstasyon();
    const b = await makineliIstasyon();
    const { id, adimlar: [ie1, ie2] } = await ac([adim(1, a.makine), adim(2, b.makine, { bagimlilik: 'akisli', devirAdedi: 1 })]) as { id: number; adimlar: [number, number] };
    await tx((db) => emirBaslat(db, op(), id));
    await sayim(id, 1);
    await ilkParcaOnay(id);
    await tx((db) => emirBaslat(db, op(), id, undefined, undefined, ie2));
    await sayim(id, 4, ie2);
    const bitis = await tx((db) => emirBitir(db, op(), id, 2, undefined, ie1));
    assert.equal(bitis.uyari, "OP 20'de bu adımdan 2 fazla parça sayıldı; eksi 2 kaldı.");
    const son = await tx((db) => emirBitir(db, op(), id, undefined, undefined, ie2));
    assert.equal(son.emir.durum, 'bitti');
    assert.equal(son.uyari, "Emir eksi bakiyeyle bitti: OP 20'de 2 fazla sayıldı.");
  });
});
