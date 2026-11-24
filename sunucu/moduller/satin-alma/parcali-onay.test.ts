import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AcilisCevabi, MalzemeSecenekleriCevabi, Talep, TalepGovdesi, Tedarikci } from '#paylasilan/sozlesme/satin-alma.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kablola } from '../../kablolama.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { ILETILER } from './kurallar.ts';

// 3590 (P1): seçilen kalemler onaya gider, kalanlar teklif fiyatlarıyla yeni talebe ayrılır (S1-S9).
const PAROLA = 'dogru-parola-1';
type Cevap = Awaited<ReturnType<FastifyInstance['inject']>>;
describe('satin-alma parçalı onaya gönderme 3590 (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const c = { yonetici: '', sa: '', mudur: '', talep: '' };
  const kisi: Record<string, number> = {};
  let firmaA = 0;
  let firmaB = 0;
  let KATALOG = '';

  const vt = () => ortam!.vt;
  const giris = async (k: string) => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<Cevap> =>
    app.inject({
      method: yontem, url: `/api${url}`, payload: payload as object | undefined,
      headers: yontem === 'POST' ? { cookie: cerez, 'istek-kimligi': randomUUID() } : { cookie: cerez },
    });
  const tamam = <T>(r: Cevap): T => { assert.equal(r.statusCode, 200, r.body); return r.json() as T; };
  async function rolluKisi(kullaniciAdi: string, rolKodu: string): Promise<string> {
    const rol = (await vt().tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])))!;
    kisi[kullaniciAdi] = await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const k = await rolAta(db, yoneticiId, id, rol.id);
      for (const r of k.roller) if (r.id !== rol.id) await rolAl(db, yoneticiId, id, r.id);
      return id;
    });
    return giris(kullaniciAdi);
  }
  const govde = (t: Talep) => {
    const { no: _n, talepEdenAdi: _a, acanKisiId: _k, olusturma: _o, guncelleme: _g, ...g } = t;
    return g;
  };
  const kaydet = (cerez: string, t: Record<string, unknown> & { id: string }) => istek(cerez, 'POST', `/satin-alma-talepleri/${t.id}/kaydet`, t);
  const kalem = (ad: string, miktar: string) => ({ id: randomUUID(), katalogId: KATALOG, ad, ozellik: '', miktar, birim: 'adet', kategori: '' });
  const teklif = (firmaId: number, ad: string, fiyatlar: [string, string][]) => ({
    id: randomUUID(), firmaId, tedarikciAdi: ad, teklifTarihi: '2026-11-05', gecerlilik: null, paraBirimi: 'TRY' as const, kur: null, iskontoYuzdesi: '0',
    nakliye: '0', digerMasraf: '0', teslimSekli: '', nakliyeDahil: true, terminGun: 7, vadeGun: 30, avansYuzdesi: '0', garantiAy: null, teknikUygun: true,
    notlar: '', ilkToplam: null, revizyon: 0, fiyatlar: fiyatlar.map(([kalemId, birimFiyat]) => ({ kalemId, birimFiyat })),
  });

  // Değerlendirmedeki talep: K1 10, K2 4, K3 6 adet; A 10/5/3 TL, B 12/5/2 TL. A pazarlıkla K1'i 9'a indirdi (ilk toplam 138, şimdi 128, revizyon 1).
  async function degerlendirmede(): Promise<{ t: Talep; k: [string, string, string]; a: string; b: string }> {
    const g = {
      id: randomUUID(), baslik: 'ORN parçalı talep', birim: null, talepEdenKisiId: null, oncelik: 'normal', ihtiyacTarihi: '2026-12-30', notlar: '', durum: 'taslak',
      iptalNedeni: '', agirliklar: null, kalemler: [kalem('ORN-MIL-20', '10'), kalem('ORN-PUL-8', '4'), kalem('ORN-VIDA-6', '6')], teklifIstekleri: [], teklifler: [],
      karar: null, onaylar: [], hareketler: [{ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, metin: 'Talep açıldı' }], senaryolar: [],
    } as unknown as TalepGovdesi;
    const t = tamam<Talep>(await istek(c.talep, 'POST', '/satin-alma-talepleri/ac', g));
    const k = t.kalemler.map((x) => x.id) as [string, string, string];
    const a = teklif(firmaA, 'ORN Tedarik A', [[k[0], '10'], [k[1], '5'], [k[2], '3']]);
    const b = teklif(firmaB, 'ORN Tedarik B', [[k[0], '12'], [k[1], '5'], [k[2], '2']]);
    const ilk = tamam<Talep>(await kaydet(c.sa, { ...govde(t), durum: 'degerlendirme', teklifler: [a, b] }));
    const pazarlik = { ...a, fiyatlar: [{ kalemId: k[0], birimFiyat: '9' }, { kalemId: k[1], birimFiyat: '5' }, { kalemId: k[2], birimFiyat: '3' }] };
    const deg = tamam<Talep>(await kaydet(c.sa, { ...govde(ilk), teklifler: [pazarlik, ilk.teklifler.find((q) => q.id === b.id)!] }));
    return { t: deg, k, a: a.id, b: b.id };
  }
  const kararTek = (teklifId: string) =>
    ({ mod: 'tek', teklifId, bolunme: [], gerekce: '', kararVerenKisiId: kisi.satinalma!, kararTarihi: '2026-11-24', ogrenilenler: '', sabitKurlar: [], siparisler: [] });
  const parcali = (kim: string, t: Talep, kalan: string[], karar: unknown, ayrilanTalepId = randomUUID(), surum = t.surum) =>
    istek(kim, 'POST', `/satin-alma-talepleri/${t.id}/parcali-onaya-gonder`, { ayrilanTalepId, kalanKalemIdleri: kalan, karar, surum });

  test('SAT-3590-1: seçilenler onaya gider; kalan kalem kimliğiyle, teklif fiyatlarıyla yeni talebe geçer; bağ iki yönde görünür', async () => {
    const { t, k, a, b } = await degerlendirmede();
    const yeniId = randomUUID();
    const r = tamam<{ kaynak: Talep; ayrilan: Talep }>(await parcali(c.sa, t, [k[2]], kararTek(a), yeniId));
    assert.equal(r.kaynak.durum, 'onayda');
    assert.deepEqual(r.kaynak.kalemler.map((x) => x.id), [k[0], k[1]]);
    assert.equal(r.kaynak.karar?.teklifId, a);
    assert.equal(r.ayrilan.id, yeniId);
    assert.equal(r.ayrilan.durum, 'degerlendirme');
    assert.deepEqual(r.ayrilan.kalemler.map((x) => x.id), [k[2]]);
    assert.equal(r.ayrilan.karar, null);
    assert.deepEqual(r.ayrilan.teklifler.map((q) => [q.firmaId, q.fiyatlar.map((f) => [f.kalemId, Number(f.birimFiyat)])]), [[firmaA, [[k[2], 3]]], [firmaB, [[k[2], 2]]]]);
    assert.ok(r.ayrilan.teklifler.every((q) => q.id !== a && q.id !== b), 'teklif başlığı yeni kimlikle kopyalanır');
    assert.deepEqual(r.kaynak.teklifler.map((q) => q.fiyatlar.map((f) => f.kalemId)), [[k[0], k[1]], [k[0], k[1]]]);
    assert.deepEqual(r.kaynak.ayrilma, { ayrildigi: null, ayrilanlar: [{ id: yeniId, no: r.ayrilan.no, kalemSayisi: 1 }] });
    assert.deepEqual(r.ayrilan.ayrilma, { ayrildigi: { id: t.id, no: t.no }, ayrilanlar: [] });
    assert.notEqual(r.ayrilan.no, t.no);
    // S4: ilk toplam kalem payıyla bölünür, revizyon artmaz (A: ilk 138; şimdi 110 kaynakta, 18 ayrılanda).
    const qa = r.kaynak.teklifler.find((q) => q.id === a)!, ya = r.ayrilan.teklifler.find((q) => q.firmaId === firmaA)!;
    assert.deepEqual([qa.revizyon, ya.revizyon], [1, 1]);
    assert.ok(Math.abs(Number(qa.ilkToplam) + Number(ya.ilkToplam) - 138) < 0.001);
    assert.ok(Math.abs(Number(qa.ilkToplam) - 138 * 110 / 128) < 0.001, `kaynak ilk toplam ${qa.ilkToplam}`);
    // S6: dört göz yeni talepte de; açan ve talep eden kaynaktan.
    assert.equal(r.ayrilan.acanKisiId, t.acanKisiId);
    const gecmis = await vt().tx((db) => db.sorgu<{ k: number }>('SELECT kisi_id AS k FROM satin_alma_talep_eden_gecmisi WHERE talep_id = $1', [yeniId]));
    assert.ok(gecmis.some((x) => x.k === kisi.talep));
    assert.ok(r.kaynak.hareketler.some((h) => h.metin.includes(r.ayrilan.no)) && r.ayrilan.hareketler.some((h) => h.metin.includes(t.no)));
  });

  test('SAT-3590-2: ön koşullar sunucuda: hepsi seçilemez, kalan kaleme karar atanamaz, eski sürüm 409, bilinmeyen kalem 422', async () => {
    const { t, k, a, b } = await degerlendirmede();
    const mesaj = (r: Cevap) => [r.statusCode, (JSON.parse(r.body) as { mesaj?: string }).mesaj];
    assert.deepEqual(mesaj(await parcali(c.sa, t, [k[0], k[1], k[2]], kararTek(a))), [422, ILETILER.parcaliHepsi]);
    assert.deepEqual(mesaj(await parcali(c.sa, t, [randomUUID()], kararTek(a))), [422, ILETILER.parcaliKalemYok]);
    const bolunmus = { ...kararTek(a), mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: k[0], teklifId: a }, { kalemId: k[2], teklifId: b }] };
    assert.deepEqual(mesaj(await parcali(c.sa, t, [k[2]], bolunmus)), [422, ILETILER.parcaliKararKalemi]);
    assert.equal((await parcali(c.sa, t, [k[2]], kararTek(a), randomUUID(), t.surum - 1)).statusCode, 409);
    assert.equal((await parcali(c.talep, t, [k[2]], kararTek(a))).statusCode, 403);
    // Reddedilen komut hiçbir şey yazmaz: talep değişmemiş, kalem yerinde.
    const son = (await vt().tx((db) => db.tek<{ durum: string; surum: number; n: number }>(
      'SELECT durum, surum, (SELECT count(*)::int FROM satin_alma_talep_kalemi WHERE talep_id = t.id) AS n FROM satin_alma_talep t WHERE id = $1', [t.id])))!;
    assert.deepEqual([son.durum, son.surum, son.n], ['degerlendirme', t.surum, 3]);
    // Onaya gitmiş talep bölünmez.
    const gonderildi = tamam<{ kaynak: Talep }>(await parcali(c.sa, t, [k[2]], kararTek(a))).kaynak;
    assert.deepEqual(mesaj(await parcali(c.sa, gonderildi, [k[1]], kararTek(a))), [422, ILETILER.parcaliDurum]);
  });

  test('SAT-3590-3: bölünmüş kararla seçilenler onaya gider; ayrılan talep kendi kararıyla olağan yoldan onaya gider', async () => {
    const { t, k, a, b } = await degerlendirmede();
    const bolunmus = { ...kararTek(a), mod: 'bolunmus', teklifId: null, bolunme: [{ kalemId: k[0], teklifId: a }, { kalemId: k[1], teklifId: b }] };
    const r = tamam<{ kaynak: Talep; ayrilan: Talep }>(await parcali(c.sa, t, [k[2]], bolunmus));
    assert.equal(r.kaynak.karar?.mod, 'bolunmus');
    assert.deepEqual(r.kaynak.karar?.bolunme.map((x) => x.kalemId).sort(), [k[0], k[1]].sort());
    const yb = r.ayrilan.teklifler.find((q) => q.firmaId === firmaB)!;
    const ikinci = tamam<Talep>(await kaydet(c.sa, { ...govde(r.ayrilan), durum: 'onayda', karar: kararTek(yb.id) }));
    assert.equal(ikinci.durum, 'onayda');
    assert.equal(ikinci.karar?.teklifId, yb.id);
  });
  test('SAT-3590-4 (S5, N1 b): eşik altı iki parça, toplamı eşiği aşıyor: ilk parçadan itibaren üst basamak istenir', async () => {
    const samuduru = await rolluKisi('samuduru', 'satin_alma_muduru');
    const rolId = async (kod: string) => (await vt().tx((db) => db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod])))!.id;
    const limitler = async (l: object[]) => {
      const a = tamam<AcilisCevabi>(await istek(c.sa, 'GET', '/satin-alma-acilis')).ayarlar;
      tamam(await istek(c.yonetici, 'POST', '/satin-alma-ayarlari/kaydet', {
        agirliklar: a.agirliklar, gecerlilikGun: a.gecerlilikGun, enAzTeklif: a.enAzTeklif, fiyatUyariYuzdesi: a.fiyatUyariYuzdesi,
        kurlar: a.kurlar.map((k) => ({ paraBirimi: k.paraBirimi })), kategoriler: a.kategoriler, birimler: a.birimler, onayLimitleri: l, surum: a.surum,
      }));
    };
    const kademe = async (deger: boolean) => tamam(await istek(c.yonetici, 'POST', '/ayarlar/satin-alma.onay-kademesi/degistir', { deger }));
    const onay = () => ({ id: randomUUID(), zaman: '', kisiId: null, kisiAdi: null, sonuc: 'onay' as const, dortGozsuz: false, notlar: '' });
    await limitler([{ azamiTutar: '100', seviye: 'Deneme alt', rolId: await rolId('mudur') }, { azamiTutar: null, seviye: 'Deneme üst', rolId: await rolId('satin_alma_muduru') }]);
    await kademe(true);
    try {
      const { t, k, a } = await degerlendirmede();
      // Parça 1: K1, A'dan 10 x 9 = 90 TL (eşik altı). Kalan K2 + K3 henüz kararsız; en düşük teklifle yaklaşık 32 TL. Aile eşik (100) üstü.
      const r = tamam<{ kaynak: Talep; ayrilan: Talep }>(await parcali(c.sa, t, [k[1], k[2]], kararTek(a)));
      const ust = /Deneme üst/;
      const red1 = await kaydet(c.mudur, { ...govde(r.kaynak), onaylar: [onay()] });
      assert.equal(red1.statusCode, 403, red1.body);
      assert.match((JSON.parse(red1.body) as { mesaj: string }).mesaj, ust);
      tamam(await kaydet(samuduru, { ...govde(r.kaynak), onaylar: [onay()] }));
      // Parça 2: K2 + K3, B'den 4 x 5 + 6 x 2 = 32 TL (eşik altı); aile 122 TL.
      const yb = r.ayrilan.teklifler.find((q) => q.firmaId === firmaB)!;
      const ikinci = tamam<Talep>(await kaydet(c.sa, { ...govde(r.ayrilan), durum: 'onayda', karar: kararTek(yb.id) }));
      const red2 = await kaydet(c.mudur, { ...govde(ikinci), onaylar: [onay()] });
      assert.equal(red2.statusCode, 403, red2.body);
      assert.match((JSON.parse(red2.body) as { mesaj: string }).mesaj, ust);
      tamam(await kaydet(samuduru, { ...govde(ikinci), onaylar: [onay()] }));
    } finally {
      await kademe(false);
      await limitler([]);
    }
  });
  before(async () => {
    kablola();
    ortam = await testVeritabaniKur('satin_alma_parcali_onay');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    c.yonetici = await giris('yonetici');
    c.sa = await rolluKisi('satinalma', 'satin_alma');
    c.mudur = await rolluKisi('mudur', 'mudur');
    c.talep = await rolluKisi('talep', 'kalite');
    const firmaAc = async (ad: string): Promise<number> => {
      const f = tamam<{ firma: { id: number } }>(await istek(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur: 'tedarikci' })).firma;
      tamam<Tedarikci>(await istek(c.sa, 'POST', '/satin-alma-tedarikcileri/kaydet', { firmaId: f.id, puan: 4, notlar: '', kategoriler: [], degerlendirmeler: [], surum: null }));
      return f.id;
    };
    firmaA = await firmaAc('ORN Tedarik A');
    firmaB = await firmaAc('ORN Tedarik B');
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } }));
    tamam(await istek(c.yonetici, 'POST', '/malzeme-katalogu-kartlari/sa-sp-1/kaydet', {
      kayit: { id: 'sa-sp-1', tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 }, com: { kod: 'HM-SPS-00001', ad: 'ORN çubuk', birim: 'adet' }, onay: { durum: 'aktif' } },
      ozet: { benzersiz_anahtar: 'hammadde|satin-alma|sa-sp-1', mukerrer_gerekcesi: null }, surum: null,
    }));
    const MALZEME = tamam<MalzemeSecenekleriCevabi>(await istek(c.sa, 'GET', '/satin-alma-malzeme-secenekleri?ara=HM-SPS-00001')).malzemeler.find((m) => m.kod === 'HM-SPS-00001')!.no;
    KATALOG = tamam<{ id: string }>(await istek(c.sa, 'POST', '/satin-alma-katalogu/kaydet', {
      id: randomUUID(), malzemeNo: MALZEME, ozellik: '', notlar: '', takmaAdlari: [], surum: null,
    })).id;
  });
  after(async () => { await ortam?.kaldir(); });
});
