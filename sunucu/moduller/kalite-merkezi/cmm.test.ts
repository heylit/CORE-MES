import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KmCmmOnizlemeCevabi, KmCmmPlaniCevabi, KmCmmYazCevabi } from '#paylasilan/sozlesme/kalite-merkezi-cmm.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { CMM_ILETILER } from './cmm-kurallar.ts';
import { numuneIste } from './disari.ts';
import { STUDYO_ILETILER } from './kurallar.ts';
import { resimMerkezdenEkle } from './studyo.ts';

// CMM sonuç dönüşü (1439 a): önizleme okur, yazma `cmm` kaynağıyla ölçüm ekler. Dosyalar sentetiktir.
const PAROLA = 'dogru-parola-1';

async function zincir(modul: string): Promise<OrnekVeriTanimi[]> {
  const hepsi = new Map((await modulOrnekVerileriniKesfet()).map((t) => [t.modul, t]));
  const secilen = new Map<string, OrnekVeriTanimi>();
  const ekle = (ad: string): void => {
    const t = hepsi.get(ad);
    if (!t || secilen.has(ad)) return;
    secilen.set(ad, t);
    t.gerekir.forEach(ekle);
  };
  ekle(modul);
  return [...secilen.values()];
}

describe('Kalite Merkezi CMM sonuç dönüşü (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let yonetici = '';
  let kalite = '';
  let mudur = '';
  let operator = '';
  let okur = '';
  let flans = 0;
  let flansEmri = 0;
  let milResmi = 0;
  let resimId = 0;
  const balon: Record<'cap' | 'mastar' | 'boy', number> = { cap: 0, mastar: 0, boy: 0 };
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const oku = (cerez: string | null, url: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez } });
  const yaz = (cerez: string | null, url: string, govde: unknown): Promise<LightMyRequestResponse> => app.inject({
    method: 'POST', url: `/api${url}`, payload: govde as object, headers: { ...(cerez === null ? {} : { cookie: cerez }), [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
  });
  const ileti = (r: LightMyRequestResponse): unknown => (r.json() as { mesaj?: unknown }).mesaj;

  async function girisYap(kullaniciAdi: string, rolKodu: string | null): Promise<string> {
    const rol = async (kod: string) => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    if (rolKodu !== null) {
      await o().vt.tx(async (db) => {
        const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
        await rolAta(db, yonId, yeni, await rol(rolKodu));
        await rolAl(db, yonId, yeni, await rol('yonetici'));
      });
    }
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function belgeAc(ad: string, icerik: Buffer, dosyaAdi: string): Promise<number> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    assert.equal((await yaz(yonetici, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') })).statusCode, 200);
    const b = (await yaz(yonetici, '/cizimler', { ad, tur: 'teknik-resim', ozet, dosyaAdi })).json() as { id: number; surum: number; revizyonlar: { id: number }[] };
    assert.equal((await yaz(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum })).statusCode, 200);
    return b.id;
  }
  async function balonEkle(resim: number, no: number, nominal: string, sinir: [string, string] | null, yontem: 'cmm' | null = null): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      `INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, kritik, yontem, guncelleyen_id) VALUES ($1, $2, $3, $4, $5, false, $6, $7) RETURNING id`,
      [resim, no, nominal, sinir?.[0] ?? null, sinir?.[1] ?? null, yontem, yonId],
    ))!.id;
  }
  const resimSurumu = async () => (await o().sahip.tek<{ surum: number }>('SELECT surum FROM kalite_merkezi_resim WHERE id = $1', [resimId]))!.surum;

  before(async () => {
    ortam = await testVeritabaniKur('km_cmm');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kmc-yon', parola: PAROLA }));
    const yukle = await ornekVeriYukle(ortam.vt, await zincir('uretim-emirleri'), { ortam: 'test', bildir: () => undefined });
    assert.equal(yukle.durum, 'yuklendi');
    yonetici = await girisYap('kmc-yon', null);
    kalite = await girisYap('kmc-kalite', 'kalite');
    mudur = await girisYap('kmc-mudur', 'mudur');
    operator = await girisYap('kmc-operator', 'operator');
    // Yalnız okuyan: önizler ve planı görür, yazamaz.
    const okurRolu = (await o().vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('kmc_okur', 'Deneme okur') RETURNING id"))!.id;
    for (const islem of ['sayfa.kalite-merkezi', 'kalite-merkezi.oku']) await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [okurRolu, islem]);
    okur = await girisYap('kmc-okur', 'kmc_okur');

    let mil = 0;
    await o().vt.tx(async (db) => {
      flans = (await ornekMalzemeNo(db, 'flans'))!;
      mil = (await ornekMalzemeNo(db, 'mil'))!;
      flansEmri = (await db.tek<{ id: number }>('SELECT id FROM uretim_emri WHERE malzeme_no = $1', [flans]))!.id;
    });
    const pdf = (not: string) => Buffer.from(`%PDF-1.4\n% ${not}\n%%EOF\n`);
    const belge = await belgeAc('Flanş resmi', pdf('flans-cmm'), 'flans.pdf');
    resimId = (await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: belge, revizyon: 'A' }))).id;
    balon.cap = await balonEkle(resimId, 1, 'Ø10', ['9.95', '10.05'], 'cmm');
    balon.mastar = await balonEkle(resimId, 2, 'M8', null);
    balon.boy = await balonEkle(resimId, 3, '25', ['24.9', '25.1'], 'cmm');
    const milBelge = await belgeAc('Mil resmi', pdf('mil-cmm'), 'mil.pdf');
    milResmi = (await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: mil, merkezBelgeId: milBelge }))).id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  const CSV = 'Karakteristik;Nominal;Ölçülen\nB1;10,000;10,012\nB2;8;8\nB3;26,000;25,05\nCIRCLE_7;5;5,01\n';

  test('KM-C10 önizleme: yazmaz, satır kararlarını döner; okuma yetkisi yeter; operatör 403, oturumsuz 401', async () => {
    const onceki = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM kalite_merkezi_olcum');
    const r = await yaz(okur, '/kalite-merkezi/studyo/olcumler/cmm-onizle', { uretimEmriId: flansEmri, resimId, metin: CSV });
    assert.equal(r.statusCode, 200, r.body);
    const c = r.json() as KmCmmOnizlemeCevabi;
    assert.deepEqual([c.bicim, c.ayirici, c.esleme, c.resimSurumu], ['csv', ';', { karakteristik: 0, olculen: 2, nominal: 1 }, await resimSurumu()]);
    assert.deepEqual(c.satirlar.map((s) => [s.satir, s.durum, s.olculen, s.uygun]), [
      [2, 'eslesti', '10.012', true], [3, 'nitelBalon', '8', null], [4, 'nominalFarki', '25.05', true], [5, 'eslesmedi', '5.01', null],
    ]);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM kalite_merkezi_olcum'))?.n, onceki?.n, 'önizleme yazmaz');
    assert.equal((await yaz(operator, '/kalite-merkezi/studyo/olcumler/cmm-onizle', { uretimEmriId: flansEmri, resimId, metin: CSV })).statusCode, 403);
    assert.equal((await yaz(null, '/kalite-merkezi/studyo/olcumler/cmm-onizle', { uretimEmriId: flansEmri, resimId, metin: CSV })).statusCode, 401);
    // Başka parçanın resmi bu emre eşlenmez.
    const baska = await yaz(kalite, '/kalite-merkezi/studyo/olcumler/cmm-onizle', { uretimEmriId: flansEmri, resimId: milResmi, metin: CSV });
    assert.deepEqual([baska.statusCode, ileti(baska)], [400, STUDYO_ILETILER.balonEmirDisi]);
    const bozuk = await yaz(kalite, '/kalite-merkezi/studyo/olcumler/cmm-onizle', { uretimEmriId: flansEmri, resimId, metin: '<!DOCTYPE x><x/>' });
    assert.deepEqual([bozuk.statusCode, ileti(bozuk)], [400, CMM_ILETILER.xmlTanim]);
    const cokBuyuk = await yaz(kalite, '/kalite-merkezi/studyo/olcumler/cmm-onizle', { uretimEmriId: flansEmri, resimId, metin: 'x'.repeat(900001) });
    assert.equal(cokBuyuk.statusCode, 400);
  });

  test('KM-C11 yazma: eşleşen satır cmm kaynağıyla yazılır; nominal farkı yalnız onayla; plan değiştiyse 409; okur ve müdür 403', async () => {
    const yol = '/kalite-merkezi/studyo/olcumler/cmm-yaz';
    const temel = { uretimEmriId: flansEmri, resimId, metin: CSV, resimSurumu: await resimSurumu() };
    assert.equal((await yaz(okur, yol, temel)).statusCode, 403);
    assert.equal((await yaz(mudur, yol, temel)).statusCode, 403);
    assert.equal((await yaz(null, yol, temel)).statusCode, 401);
    const yanlisOnay = await yaz(kalite, yol, { ...temel, onaylananlar: [2] });
    assert.deepEqual([yanlisOnay.statusCode, ileti(yanlisOnay)], [400, CMM_ILETILER.onayDisi]);
    const eski = await yaz(kalite, yol, { ...temel, resimSurumu: temel.resimSurumu + 1 });
    assert.deepEqual([eski.statusCode, ileti(eski)], [409, STUDYO_ILETILER.surumDegisti]);

    const r = await yaz(kalite, yol, temel);
    assert.equal(r.statusCode, 200, r.body);
    const c = r.json() as KmCmmYazCevabi;
    assert.deepEqual(c.olcumler.map((x) => [x.balonId, x.deger, x.uygun, x.kaynak]), [[balon.cap, '10.012', true, 'cmm']]);
    assert.equal(c.atlanan, 3);
    const onayli = await yaz(kalite, yol, { ...temel, onaylananlar: [4] });
    assert.equal(onayli.statusCode, 200, onayli.body);
    assert.deepEqual((onayli.json() as KmCmmYazCevabi).olcumler.map((x) => [x.balonId, x.deger, x.kaynak]).sort(), [[balon.cap, '10.012', 'cmm'], [balon.boy, '25.05', 'cmm']].sort());
    const hic = await yaz(kalite, yol, { ...temel, metin: 'Karakteristik;Ölçülen\nB9;1\n' });
    assert.deepEqual([hic.statusCode, ileti(hic)], [400, CMM_ILETILER.yazilacakYok]);
  });

  test('KM-C12 QIF Results yazılır; kararlı numuneye CMM sonucu girmez', async () => {
    const qif = '<QIFDocument><Characteristics><CharacteristicItems><LengthCharacteristicItem id="1"><Name>B3</Name></LengthCharacteristicItem></CharacteristicItems></Characteristics>'
      + '<Results><LengthCharacteristicMeasurement id="2"><Value>25.2</Value><CharacteristicItemId>1</CharacteristicItemId></LengthCharacteristicMeasurement></Results></QIFDocument>';
    const temel = { uretimEmriId: flansEmri, resimId, metin: qif, resimSurumu: await resimSurumu() };
    const r = await yaz(kalite, '/kalite-merkezi/studyo/olcumler/cmm-yaz', temel);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual((r.json() as KmCmmYazCevabi).olcumler.map((x) => [x.balonId, x.deger, x.uygun, x.kaynak]), [[balon.boy, '25.2', false, 'cmm']]);
    const n = await o().vt.tx((db) => numuneIste(db, yonId, { uretimEmriId: flansEmri, opNo: 10, balonlar: [balon.boy], neden: 'CMM' }));
    await o().sahip.sorgu(`INSERT INTO kalite_merkezi_numune_karari (numune_id, karar, "not", kisi_id) VALUES ($1, 'ret', 'deneme', $2)`, [n.id, yonId]);
    const kararli = await yaz(kalite, '/kalite-merkezi/studyo/olcumler/cmm-yaz', { ...temel, numuneId: n.id });
    assert.deepEqual([kararli.statusCode, ileti(kararli)], [400, STUDYO_ILETILER.numuneKararli]);
  });

  test('KM-C13 ölçüm planı raporu: yöntemi CMM olan balonlar; okuma yetkisi yeter, operatör 403', async () => {
    const r = await oku(okur, `/kalite-merkezi/studyo/resimler/${resimId}/cmm-plani`);
    assert.equal(r.statusCode, 200, r.body);
    const c = r.json() as KmCmmPlaniCevabi;
    assert.deepEqual([c.kapsam, c.resim.revizyon], ['cmm', 'A']);
    assert.deepEqual(c.satirlar.map((s) => [s.no, s.ozellik, s.enAzNokta]), [[1, 'Silindir / delik', 8], [3, 'Uzunluk / mesafe (iki özellik arası)', 6]]);
    assert.equal((await oku(operator, `/kalite-merkezi/studyo/resimler/${resimId}/cmm-plani`)).statusCode, 403);
    assert.equal((await oku(okur, '/kalite-merkezi/studyo/resimler/999999/cmm-plani')).statusCode, 404);
  });
});
