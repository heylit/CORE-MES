import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { UygulamaHatasi } from '#cekirdek/hata.ts';
import { modulOrnekVerileriniKesfet, ornekVeriYukle } from '#cekirdek/ornek-veri.ts';
import type { OrnekVeriTanimi } from '#cekirdek/ornek-veri.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KmNumune, KmNumunePlani, KmOlcum, KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { ornekMalzemeNo } from '../malzemeler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { numuneIste, olcumYaz, studyoParcasi } from './disari.ts';
import {
  STUDYO_ILETILER, balonPlaniReddi, numuneKarariReddi, numunePlaniReddi, olcumSonucu, ondalikKarsilastir, sonOlcumler, studyoResimTuru,
} from './kurallar.ts';
import { resimMerkezdenEkle } from './studyo.ts';

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

describe('Kalite Merkezi stüdyo kuralları (saf)', () => {
  test('KM-S20 ondalık karşılaştırma basamakla yapılır; sınırdaki değer uygundur', () => {
    assert.equal(ondalikKarsilastir('10.05', '10.050'), 0);
    assert.equal(ondalikKarsilastir('-0', '0.000'), 0);
    assert.equal(ondalikKarsilastir('9.949999', '9.95'), -1);
    assert.equal(ondalikKarsilastir('-1.5', '-1.25'), -1);
    assert.equal(ondalikKarsilastir('100', '99.999999'), 1);
    assert.equal(ondalikKarsilastir('0.1', '-0.1'), 1);
    const b = { alt: '9.95', ust: '10.05' };
    assert.deepEqual([olcumSonucu(b, { deger: '9.95' }), olcumSonucu(b, { deger: '10.05' }), olcumSonucu(b, { deger: '10.050001' })],
      [{ uygun: true }, { uygun: true }, { uygun: false }]);
    assert.deepEqual(olcumSonucu(b, { nitel: 'gecer' }), { ret: 'olcumSayisal' });
    assert.deepEqual(olcumSonucu({ alt: null, ust: null }, { deger: '1' }), { ret: 'olcumNitel' });
    assert.deepEqual(olcumSonucu({ alt: null, ust: null }, { nitel: 'gecmez' }), { uygun: false });
  });

  test('KM-S21 numune kararı: red ölçü ve gerekçe ister; onay ve sapma bütün balonların son ölçüsüne bakar', () => {
    const o = (balonId: number, id: number, uygun: boolean) => ({ balonId, id, uygun, zaman: '2026-10-26T08:00:00.000Z' });
    assert.equal(numuneKarariReddi('ret', 'gerekçe', [1], []), 'redOlcusuz');
    assert.equal(numuneKarariReddi('ret', '  ', [1], [o(1, 1, false)]), 'redGerekcesiz');
    assert.equal(numuneKarariReddi('ret', 'çapak', [1, 2], [o(1, 1, false)]), null);
    assert.equal(numuneKarariReddi('onay', null, [1, 2], [o(1, 1, true)]), 'kararEksikOlcum');
    assert.equal(numuneKarariReddi('onay', null, [1, 2], [o(1, 1, true), o(2, 2, false)]), 'onayUygunsuz');
    // Düzeltme yeni ölçümdür: son ölçü uygunsa onay verilir.
    assert.equal(numuneKarariReddi('onay', null, [1, 2], [o(1, 1, true), o(2, 2, false), o(2, 3, true)]), null);
    assert.equal(numuneKarariReddi('sapma', null, [1, 2], [o(1, 1, true), o(2, 2, true)]), 'sapmaGereksiz');
    assert.equal(numuneKarariReddi('sapma', null, [1, 2], [o(1, 1, true), o(2, 2, false)]), null);
    assert.deepEqual([...sonOlcumler([o(1, 5, false), o(1, 4, true)]).values()].map((x) => x.id), [5]);
    assert.deepEqual(['pdf', 'step', 'stl', 'iges', 'png', 'dxf', 'glb'].map(studyoResimTuru), ['resim', 'model', 'model', 'model', null, null, null]);
  });

  test('KM-S22 kontrol planı ve numune planı kuralları', () => {
    const p = (girdiler: Parameters<typeof balonPlaniReddi>[0]['girdiler'], acik: number[] = []) =>
      balonPlaniReddi({ girdiler, etkinler: [1, 2], acikNumunedekiler: new Set(acik) });
    assert.equal(p([{ id: 1, no: 2 }, { id: 2, no: 1 }, { no: 3, alt: '1', ust: '1', x: 1, y: 2 }]), null);
    assert.equal(p([{ id: 1, no: 1 }, { no: 1 }]), 'balonNoTekrar');
    assert.equal(p([{ id: 3, no: 1 }]), 'balonResimDisi');
    assert.equal(p([{ id: 1, no: 1 }, { id: 1, no: 2 }]), 'balonResimDisi');
    assert.equal(p([{ no: 1, alt: '1' }]), 'balonSinirEksik');
    assert.equal(p([{ no: 1, alt: '10.1', ust: '10.05' }]), 'balonSinirTers');
    assert.equal(p([{ no: 1, x: 5 }]), 'balonKonumEksik');
    assert.equal(p([{ id: 1, no: 1 }], [2]), 'balonAcikNumunede');
    assert.equal(p([{ id: 1, no: 1 }], [1]), null);
    const k = (kimlik: string, balonlar: 'hepsi' | 'kritik' | number[]) => ({ kimlik, balonlar });
    assert.equal(numunePlaniReddi([k('a', 'hepsi'), k('b', [1, 2])], new Set([1, 2])), null);
    assert.equal(numunePlaniReddi([k('a', 'hepsi'), k('a', 'kritik')], new Set([1])), 'kuralKimlikTekrar');
    assert.equal(numunePlaniReddi([k('a', [3])], new Set([1, 2])), 'kuralBalonYok');
  });
});

// 595 1 b, 597 a, 600 a: resim, balon, numune planı, numune ve ölçümün sahibi Kalite Merkezi'dir; Arkon disari.ts ile okur ve yazar.
describe('Kalite Merkezi stüdyo (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonId = 0;
  let yonetici = '';
  let kalite = '';
  let kaliteId = 0;
  let mudur = '';
  let operator = '';
  let yazar = '';
  let flans = 0;
  let mil = 0;
  let flansEmri = 0;
  let resimId = 0;
  let baskaBalon = 0;
  const balon: Record<'olcu' | 'mastar', number> = { olcu: 0, mastar: 0 };
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const oku = (cerez: string | null, url: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${url}`, headers: cerez === null ? {} : { cookie: cerez } });
  const yaz = (cerez: string, url: string, govde: unknown, kimlik: string | null = randomUUID()): Promise<LightMyRequestResponse> => app.inject({
    method: 'POST', url: `/api${url}`, payload: govde as object, headers: { cookie: cerez, ...(kimlik === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: kimlik }) },
  });

  async function girisYap(kullaniciAdi: string, rolKodu: string | null): Promise<{ id: number; cerez: string }> {
    const rol = async (kod: string) => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const id = rolKodu === null ? yonId : await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yonId, yeni, await rol(rolKodu));
      await rolAl(db, yonId, yeni, await rol('yonetici'));
      return yeni;
    });
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return { id, cerez: String(r.headers['set-cookie']).split(';')[0] ?? '' };
  }

  async function merkez<T>(yol: string, govde: unknown): Promise<T> {
    const c = await yaz(yonetici, yol, govde);
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as T;
  }
  async function merkezDosyasi(icerik: Buffer): Promise<string> {
    const ozet = createHash('sha256').update(icerik).digest('hex');
    await merkez(`/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') });
    return ozet;
  }
  interface MerkezBelgesi { id: number; surum: number; revizyonlar: { id: number; harf: string }[] }
  async function belgeAc(ad: string, icerik: Buffer, dosyaAdi: string, yayinla = true): Promise<number> {
    const b = await merkez<MerkezBelgesi>('/cizimler', { ad, tur: 'teknik-resim', ozet: await merkezDosyasi(icerik), dosyaAdi });
    if (yayinla) await merkez(`/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    return b.id;
  }
  const pdf = (not: string): Buffer => Buffer.from(`%PDF-1.4\n% ${not}\n%%EOF\n`);
  const png = (not: string): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(not)]);

  async function balonEkle(resim: number, no: number, sinir: [string, string] | null, kritik = false): Promise<number> {
    return (await o().sahip.tek<{ id: number }>(
      `INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, kritik, guncelleyen_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [resim, no, sinir === null ? 'Mastar' : `Ø${sinir[0]}`, sinir?.[0] ?? null, sinir?.[1] ?? null, kritik, yonId],
    ))!.id;
  }
  const hataKodu = (r: LightMyRequestResponse): unknown => (r.json() as { kod?: unknown }).kod;
  const ileti = (r: LightMyRequestResponse): unknown => (r.json() as { mesaj?: unknown }).mesaj;

  before(async () => {
    ortam = await testVeritabaniKur('km_studyo');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'kms-yon', parola: PAROLA }));
    const yukle = await ornekVeriYukle(ortam.vt, await zincir('uretim-emirleri'), { ortam: 'test', bildir: () => undefined });
    assert.equal(yukle.durum, 'yuklendi');
    yonetici = (await girisYap('kms-yon', null)).cerez;
    const k = await girisYap('kms-kalite', 'kalite');
    kalite = k.cerez;
    kaliteId = k.id;
    mudur = (await girisYap('kms-mudur', 'mudur')).cerez;
    operator = (await girisYap('kms-operator', 'operator')).cerez;
    // Yazar: kalite kaydı girer ama onaylamaz (603 a: plan, balon ve resim alma onaydır).
    const yazarRolu = (await o().vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('kms_yazar', 'Deneme yazar') RETURNING id"))!.id;
    for (const islem of ['sayfa.kalite-merkezi', 'kalite-merkezi.oku', 'kalite-merkezi.yaz']) {
      await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [yazarRolu, islem]);
    }
    yazar = (await girisYap('kms-yazar', 'kms_yazar')).cerez;

    await o().vt.tx(async (db) => {
      flans = (await ornekMalzemeNo(db, 'flans'))!;
      mil = (await ornekMalzemeNo(db, 'mil'))!;
      flansEmri = (await db.tek<{ id: number }>('SELECT id FROM uretim_emri WHERE malzeme_no = $1', [flans]))!.id;
    });
    const belge = await belgeAc('Flanş resmi', pdf('flans'), 'flans.pdf');
    resimId = (await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: belge, revizyon: 'C' }))).id;
    balon.olcu = await balonEkle(resimId, 1, ['9.95', '10.05'], true);
    balon.mastar = await balonEkle(resimId, 2, null);
    const milResmi = (await o().vt.tx(async (db) => resimMerkezdenEkle(db, yonId, { malzemeNo: mil, merkezBelgeId: await belgeAc('Mil resmi', pdf('mil'), 'mil.pdf') }))).id;
    baskaBalon = await balonEkle(milResmi, 1, ['1', '2']);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KM-S10 parça okuma: resim, balonlar ve plan gelir; okuma yetkisi olmayan 403, oturumsuz 401', async () => {
    const r = await oku(kalite, `/kalite-merkezi/studyo/parcalar/${flans}`);
    assert.equal(r.statusCode, 200, r.body);
    const cevap = r.json() as KmStudyoParcaCevabi;
    assert.deepEqual(cevap.resimler.map((x) => ({ id: x.id, tur: x.tur, ad: x.ad, revizyon: x.revizyon, balonlar: x.balonlar.map((b) => [b.no, b.alt, b.ust, b.kritik]) })), [
      { id: resimId, tur: 'resim', ad: 'Flanş resmi', revizyon: 'C', balonlar: [[1, '9.95', '10.05', true], [2, null, null, false]] },
    ]);
    assert.deepEqual(cevap.numunePlanlari, []);
    assert.equal((await oku(operator, `/kalite-merkezi/studyo/parcalar/${flans}`)).statusCode, 403);
    assert.equal((await oku(null, `/kalite-merkezi/studyo/parcalar/${flans}`)).statusCode, 401);
    // Arkon aynı okumayı disari.ts ile yapar.
    assert.deepEqual((await o().vt.tx((db) => studyoParcasi(db, flans))).resimler.map((x) => x.id), [resimId]);
  });

  test('KM-S11 resim dosyası belge merkezinden akar; belge yeni revizyona geçince alınan revizyon 409 olur; yetkisiz 403', async () => {
    const icerik = pdf('revizyon-a');
    const belge = await belgeAc('Revizyonlu resim', icerik, 'rev.pdf');
    const id = (await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: belge }))).id;
    const dosya = await oku(kalite, `/kalite-merkezi/studyo/resimler/${id}/dosya`);
    assert.equal(dosya.statusCode, 200, dosya.body);
    assert.equal(dosya.rawPayload.equals(icerik), true);
    assert.equal((await oku(operator, `/kalite-merkezi/studyo/resimler/${id}/dosya`)).statusCode, 403);

    const b = (await oku(yonetici, `/cizimler/${belge}`)).json() as MerkezBelgesi;
    const r = await merkez<MerkezBelgesi>(`/cizimler/${belge}/revizyon-ekle`, { ozet: await merkezDosyasi(pdf('revizyon-b')), dosyaAdi: 'rev.pdf', surum: b.surum });
    await merkez(`/cizimler/${belge}/revizyonlar/${r.revizyonlar.find((x) => x.harf === 'B')?.id}/yayinla`, { surum: r.surum });
    const eski = await oku(kalite, `/kalite-merkezi/studyo/resimler/${id}/dosya`);
    assert.deepEqual([eski.statusCode, ileti(eski)], [409, STUDYO_ILETILER.revizyonDegisti]);
    assert.equal((await oku(kalite, '/kalite-merkezi/studyo/resimler/999999/dosya')).statusCode, 404);
  });

  test('KM-S12 resim alma: aynı revizyon ikinci satır açmaz; kartsız parça, taslak belge ve stüdyonun açmadığı tür reddedilir', async () => {
    const belge = await belgeAc('İkinci alım', pdf('iki'), 'iki.pdf');
    const ilk = await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: belge }));
    const ikinci = await o().vt.tx((db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: belge }));
    assert.equal(ikinci.id, ilk.id);
    const red = async (g: { malzemeNo: number; merkezBelgeId: number }, ileti: string) => assert.rejects(
      o().vt.tx((db) => resimMerkezdenEkle(db, yonId, g)), (h: UygulamaHatasi) => h.kod === 'DOGRULAMA' && h.message === ileti,
    );
    await red({ malzemeNo: 999999, merkezBelgeId: belge }, STUDYO_ILETILER.parcaYok);
    await red({ malzemeNo: flans, merkezBelgeId: await belgeAc('Taslak', pdf('taslak'), 'taslak.pdf', false) }, STUDYO_ILETILER.belgeYok);
    await red({ malzemeNo: flans, merkezBelgeId: await belgeAc('Fotoğraf', png('foto'), 'foto.png') }, STUDYO_ILETILER.belgeTuru);
  });

  test('KM-S13 numune isteği: kalite yazar; yazma yetkisi olmayan 403; başka parçanın balonu ve yinelenen balon 400; kimliksiz istek 400', async () => {
    const govde = { uretimEmriId: flansEmri, opNo: 10, balonlar: [balon.olcu, balon.mastar], neden: 'İlk parça' };
    assert.equal((await yaz(mudur, '/kalite-merkezi/studyo/numuneler/iste', govde)).statusCode, 403);
    assert.equal((await yaz(operator, '/kalite-merkezi/studyo/numuneler/iste', govde)).statusCode, 403);
    assert.equal((await yaz(kalite, '/kalite-merkezi/studyo/numuneler/iste', govde, null)).statusCode, 400);
    const baska = await yaz(kalite, '/kalite-merkezi/studyo/numuneler/iste', { ...govde, balonlar: [balon.olcu, baskaBalon] });
    assert.deepEqual([baska.statusCode, ileti(baska)], [400, STUDYO_ILETILER.balonEmirDisi]);
    const yinelenen = await yaz(kalite, '/kalite-merkezi/studyo/numuneler/iste', { ...govde, balonlar: [balon.olcu, balon.olcu] });
    assert.deepEqual([yinelenen.statusCode, ileti(yinelenen)], [400, STUDYO_ILETILER.numuneBalonYinelenen]);

    const kimlik = randomUUID();
    const r = await yaz(kalite, '/kalite-merkezi/studyo/numuneler/iste', govde, kimlik);
    assert.equal(r.statusCode, 200, r.body);
    const n = (r.json() as { numune: KmNumune }).numune;
    assert.deepEqual({ durum: n.durum, kritik: n.kritik, isteyen: n.isteyen, karar: n.karar, balonlar: n.balonlar }, {
      durum: 'bekliyor', kritik: true, isteyen: 'Deneme kms-kalite', karar: null, balonlar: [balon.olcu, balon.mastar],
    });
    const yineleme = await yaz(kalite, '/kalite-merkezi/studyo/numuneler/iste', govde, kimlik);
    assert.equal((yineleme.json() as { numune: KmNumune }).numune.id, n.id, 'yineleme ikinci numune açmaz');
    const acik = await oku(kalite, '/kalite-merkezi/studyo/numuneler');
    assert.equal(acik.statusCode, 200, acik.body);
    assert.deepEqual((acik.json() as { numuneler: KmNumune[] }).numuneler.filter((x) => x.id === n.id).length, 1);
    assert.equal((await oku(operator, '/kalite-merkezi/studyo/numuneler')).statusCode, 403);
  });

  test('KM-S14 ölçüm ve karar: uygunluk sunucuda; onay uygunsuzla verilmez, sapma verilir; ikinci karar 409; kararlı numuneye ölçüm girilmez', async () => {
    const n = await o().vt.tx((db) => numuneIste(db, yonId, { uretimEmriId: flansEmri, opNo: 20, balonlar: [balon.olcu, balon.mastar], neden: 'Her 20 parça' }));
    const olcumYolu = '/kalite-merkezi/studyo/olcumler/yaz';
    const tersNitel = await yaz(kalite, olcumYolu, { uretimEmriId: flansEmri, numuneId: n.id, olcumler: [{ balonId: balon.olcu, nitel: 'gecer' }] });
    assert.deepEqual([tersNitel.statusCode, ileti(tersNitel)], [400, STUDYO_ILETILER.olcumSayisal]);
    assert.equal((await yaz(mudur, olcumYolu, { uretimEmriId: flansEmri, olcumler: [{ balonId: balon.olcu, deger: '10' }] })).statusCode, 403);
    const numunedeYok = await yaz(kalite, olcumYolu, { uretimEmriId: flansEmri, numuneId: n.id, olcumler: [{ balonId: baskaBalon, deger: '1.5' }] });
    assert.deepEqual([numunedeYok.statusCode, ileti(numunedeYok)], [400, STUDYO_ILETILER.balonEmirDisi]);

    const r = await yaz(kalite, olcumYolu, {
      uretimEmriId: flansEmri, numuneId: n.id, parcaSayisi: 20, olcumler: [{ balonId: balon.olcu, deger: '10,06' }, { balonId: balon.mastar, nitel: 'gecer' }],
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual((r.json() as { olcumler: KmOlcum[] }).olcumler.map((x) => [x.balonId, x.deger, x.nitel, x.uygun, x.kaynak, x.kisi]).sort(), [
      [balon.olcu, '10.06', null, false, 'kalite', 'Deneme kms-kalite'], [balon.mastar, null, 'gecer', true, 'kalite', 'Deneme kms-kalite'],
    ].sort());
    // Arkon operatör ölçümünü disari.ts ile yazar; numunesiz ölçüm emre bağlıdır.
    await o().vt.tx((db) => olcumYaz(db, kaliteId, 'operator', { uretimEmriId: flansEmri, olcumler: [{ balonId: balon.olcu, deger: '10.01' }] }));

    const kararYolu = `/kalite-merkezi/studyo/numuneler/${n.id}/karar`;
    const onay = await yaz(kalite, kararYolu, { karar: 'onay' });
    assert.deepEqual([onay.statusCode, ileti(onay)], [400, STUDYO_ILETILER.onayUygunsuz]);
    const gerekcesiz = await yaz(kalite, kararYolu, { karar: 'ret' });
    assert.deepEqual([gerekcesiz.statusCode, ileti(gerekcesiz)], [400, STUDYO_ILETILER.redGerekcesiz]);
    assert.equal((await yaz(operator, kararYolu, { karar: 'sapma' })).statusCode, 403);
    const sapma = await yaz(mudur, kararYolu, { karar: 'sapma', not: 'Müşteri sapma izni' });
    assert.equal(sapma.statusCode, 200, sapma.body);
    const karar = (sapma.json() as { numune: KmNumune }).numune;
    assert.deepEqual([karar.durum, karar.karar?.karar, karar.karar?.kisi, karar.olcumler.length], ['sapma', 'sapma', 'Deneme kms-mudur', 2]);
    const ikinci = await yaz(kalite, kararYolu, { karar: 'ret', not: 'geç kaldı' });
    assert.deepEqual([ikinci.statusCode, hataKodu(ikinci)], [409, 'CAKISMA']);
    const kararli = await yaz(kalite, olcumYolu, { uretimEmriId: flansEmri, numuneId: n.id, olcumler: [{ balonId: balon.olcu, deger: '10' }] });
    assert.deepEqual([kararli.statusCode, ileti(kararli)], [400, STUDYO_ILETILER.numuneKararli]);

    const emirOlcumleri = await oku(kalite, `/kalite-merkezi/studyo/emirler/${flansEmri}/olcumler`);
    assert.equal(emirOlcumleri.statusCode, 200, emirOlcumleri.body);
    assert.equal((emirOlcumleri.json() as { olcumler: KmOlcum[] }).olcumler.some((x) => x.kaynak === 'operator' && x.numuneId === null && x.uygun), true);
    const emirNumuneleri = await oku(kalite, `/kalite-merkezi/studyo/emirler/${flansEmri}/numuneler`);
    assert.equal((emirNumuneleri.json() as { numuneler: KmNumune[] }).numuneler.find((x) => x.id === n.id)?.durum, 'sapma');
    assert.equal((await oku(kalite, `/kalite-merkezi/studyo/numuneler/${n.id}`)).statusCode, 200);
    assert.equal((await oku(operator, `/kalite-merkezi/studyo/emirler/${flansEmri}/olcumler`)).statusCode, 403);
    assert.equal((await oku(kalite, '/kalite-merkezi/studyo/emirler/999999/olcumler')).statusCode, 404);
  });

  test('KM-S16 resim alma ve kaldırma kalite onayıdır; yazar ve operatör 403; eski sürüm 409; kaldırılan resim yeniden alınınca balonlarıyla döner', async () => {
    const belge = await belgeAc('Alınacak resim', pdf('al'), 'al.pdf');
    const govde = { malzemeNo: flans, merkezBelgeId: belge, revizyon: 'A' };
    assert.equal((await yaz(yazar, '/kalite-merkezi/studyo/resimler/al', govde)).statusCode, 403);
    assert.equal((await yaz(operator, '/kalite-merkezi/studyo/resimler/al', govde)).statusCode, 403);
    assert.equal((await yaz(kalite, '/kalite-merkezi/studyo/resimler/al', govde, null)).statusCode, 400);
    const r = await yaz(kalite, '/kalite-merkezi/studyo/resimler/al', govde);
    assert.equal(r.statusCode, 200, r.body);
    const resim = (r.json() as { resim: KmResim }).resim;
    assert.deepEqual([resim.ad, resim.revizyon, resim.aktif, resim.tur], ['Alınacak resim', 'A', true, 'resim']);
    const b = await balonEkle(resim.id, 1, ['1', '2']);

    const kaldirYolu = `/kalite-merkezi/studyo/resimler/${resim.id}/kaldir`;
    assert.equal((await yaz(yazar, kaldirYolu, { surum: resim.surum })).statusCode, 403);
    const eski = await yaz(mudur, kaldirYolu, { surum: resim.surum + 5 });
    assert.deepEqual([eski.statusCode, ileti(eski)], [409, STUDYO_ILETILER.surumDegisti]);
    const k = await yaz(mudur, kaldirYolu, { surum: resim.surum });
    assert.equal(k.statusCode, 200, k.body);
    const kaldirilan = (k.json() as { resim: KmResim }).resim;
    assert.equal(kaldirilan.aktif, false);
    const parca = (await oku(kalite, `/kalite-merkezi/studyo/parcalar/${flans}`)).json() as KmStudyoParcaCevabi;
    assert.equal(parca.resimler.some((x) => x.id === resim.id), false);
    const ikinci = await yaz(mudur, kaldirYolu, { surum: kaldirilan.surum });
    assert.deepEqual([ikinci.statusCode, ileti(ikinci)], [409, STUDYO_ILETILER.resimPasif]);
    assert.equal((await yaz(mudur, '/kalite-merkezi/studyo/resimler/999999/kaldir', { surum: 1 })).statusCode, 404);

    const geri = await yaz(kalite, '/kalite-merkezi/studyo/resimler/al', govde);
    const donen = (geri.json() as { resim: KmResim }).resim;
    assert.deepEqual([donen.id, donen.aktif, donen.balonlar.map((x) => x.id)], [resim.id, true, [b]]);
  });

  test('KM-S17 kontrol planı bütün yazılır: güncelle, numara değiş, ekle, kaldır; yazar 403; eski sürüm 409; kuralsız plan 400; açık numunedeki balon kaldırılmaz', async () => {
    const id = (await o().vt.tx(async (db) => resimMerkezdenEkle(db, yonId, { malzemeNo: flans, merkezBelgeId: await belgeAc('Plan resmi', pdf('plan'), 'plan.pdf') }))).id;
    const b1 = await balonEkle(id, 1, ['9.9', '10.1']);
    const b2 = await balonEkle(id, 2, null);
    const b3 = await balonEkle(id, 3, ['5', '6']);
    const yol = `/kalite-merkezi/studyo/resimler/${id}/balonlar`;
    const okuResim = async () => ((await oku(kalite, `/kalite-merkezi/studyo/parcalar/${flans}`)).json() as KmStudyoParcaCevabi).resimler.find((x) => x.id === id)!;
    const tam = (o_: { id?: number; no: number; nominal: string; alt?: string | null; ust?: string | null }) => ({
      kritik: false, olcuAletiGerekir: false, ...o_,
    });
    const ilk = await okuResim();
    const govde = {
      surum: ilk.surum,
      balonlar: [
        tam({ id: b1, no: 2, nominal: 'Ø10', alt: '9,95', ust: '10.05' }),
        tam({ id: b2, no: 1, nominal: 'Mastar' }),
        tam({ no: 3, nominal: 'Ø6', alt: '5.9', ust: '6.1' }),
      ],
    };
    assert.equal((await yaz(yazar, yol, govde)).statusCode, 403);
    assert.equal((await yaz(operator, yol, govde)).statusCode, 403);
    const r = await yaz(kalite, yol, govde);
    assert.equal(r.statusCode, 200, r.body);
    const yeni = (r.json() as { resim: KmResim }).resim;
    assert.equal(yeni.surum, ilk.surum + 1);
    assert.deepEqual(yeni.balonlar.map((x) => [x.no, x.nominal, x.alt, x.ust]), [[1, 'Mastar', null, null], [2, 'Ø10', '9.95', '10.05'], [3, 'Ø6', '5.9', '6.1']]);
    assert.equal(yeni.balonlar.some((x) => x.id === b3), false, 'listede olmayan balon kaldırıldı');
    assert.equal((await o().vt.tek<{ aktif: boolean }>('SELECT aktif FROM kalite_merkezi_balon WHERE id = $1', [b3]))?.aktif, false);
    const eski = await yaz(kalite, yol, govde);
    assert.deepEqual([eski.statusCode, ileti(eski)], [409, STUDYO_ILETILER.surumDegisti]);

    const red = async (balonlar: unknown[], beklenen: string) => {
      const c = await yaz(kalite, yol, { surum: (await okuResim()).surum, balonlar });
      assert.deepEqual([c.statusCode, ileti(c)], [400, beklenen]);
    };
    await red([tam({ no: 1, nominal: 'a' }), tam({ no: 1, nominal: 'b' })], STUDYO_ILETILER.balonNoTekrar);
    await red([tam({ id: baskaBalon, no: 1, nominal: 'a' })], STUDYO_ILETILER.balonResimDisi);
    await red([tam({ no: 1, nominal: 'a', alt: '2', ust: '1' })], STUDYO_ILETILER.balonSinirTers);
    await red([tam({ no: 1, nominal: 'a', alt: '2' })], STUDYO_ILETILER.balonSinirEksik);

    const kalanlar = yeni.balonlar.map((x) => x.id);
    await o().vt.tx((db) => numuneIste(db, yonId, { uretimEmriId: flansEmri, opNo: 30, balonlar: [kalanlar[0]!], neden: 'Plan denemesi' }));
    await red(yeni.balonlar.slice(1).map((x) => tam({ id: x.id, no: x.no, nominal: x.nominal, alt: x.alt, ust: x.ust })), STUDYO_ILETILER.balonAcikNumunede);
  });

  test('KM-S18 numune planı kalite onayıdır; yeni plan sürümsüz, ikinci yeni 409; güncelleme sürümle; bilinmeyen balon ve yinelenen kural 400', async () => {
    const yol = `/kalite-merkezi/studyo/parcalar/${flans}/numune-planlari/40`;
    const kurallar = [{ kimlik: 'ilk', ne: 'ilk', kim: ['kalite'], balonlar: 'hepsi', kapi: true }];
    assert.equal((await yaz(yazar, yol, { surum: null, kurallar })).statusCode, 403);
    assert.equal((await yaz(operator, yol, { surum: null, kurallar })).statusCode, 403);
    const r = await yaz(kalite, yol, { surum: null, kurallar });
    assert.equal(r.statusCode, 200, r.body);
    const plan = (r.json() as { plan: KmNumunePlani }).plan;
    assert.deepEqual([plan.opNo, plan.surum, plan.kurallar.length], [40, 1, 1]);
    const ikinciYeni = await yaz(kalite, yol, { surum: null, kurallar });
    assert.deepEqual([ikinciYeni.statusCode, ileti(ikinciYeni)], [409, STUDYO_ILETILER.surumDegisti]);
    const g = await yaz(mudur, yol, { surum: 1, kurallar: [...kurallar, { kimlik: 'her', ne: 'her', n: 20, kim: ['operator'], balonlar: [1] }] });
    assert.equal(g.statusCode, 200, g.body);
    assert.equal((g.json() as { plan: KmNumunePlani }).plan.surum, 2);
    const parca = (await oku(kalite, `/kalite-merkezi/studyo/parcalar/${flans}`)).json() as KmStudyoParcaCevabi;
    assert.deepEqual(parca.numunePlanlari.find((p) => p.opNo === 40)?.kurallar.map((k) => k.kimlik), ['ilk', 'her']);

    const yok = await yaz(kalite, yol, { surum: 2, kurallar: [{ kimlik: 'x', ne: 'son', kim: ['kalite'], balonlar: [999] }] });
    assert.deepEqual([yok.statusCode, ileti(yok)], [400, STUDYO_ILETILER.kuralBalonYok]);
    const tekrar = await yaz(kalite, yol, { surum: 2, kurallar: [...kurallar, ...kurallar] });
    assert.deepEqual([tekrar.statusCode, ileti(tekrar)], [400, STUDYO_ILETILER.kuralKimlikTekrar]);
    const kartsiz = await yaz(kalite, '/kalite-merkezi/studyo/parcalar/999999/numune-planlari/10', { surum: null, kurallar });
    assert.deepEqual([kartsiz.statusCode, ileti(kartsiz)], [400, STUDYO_ILETILER.parcaYok]);
  });

  test('KM-S15 numune, karar ve ölçüm yalnız eklenir; sonsuz ya da NaN sınır yazılamaz', async () => {
    await assert.rejects(o().sahip.sorgu('UPDATE kalite_merkezi_olcum SET uygun = NOT uygun'));
    await assert.rejects(o().sahip.sorgu('DELETE FROM kalite_merkezi_numune_karari'));
    await assert.rejects(o().sahip.sorgu('DELETE FROM kalite_merkezi_numune'));
    await assert.rejects(o().sahip.sorgu(
      "INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, guncelleyen_id) VALUES ($1, 90, 'x', 'NaN', 'NaN', $2)", [resimId, yonId],
    ));
    await assert.rejects(o().sahip.sorgu(
      "INSERT INTO kalite_merkezi_balon (resim_id, no, nominal, alt, ust, guncelleyen_id) VALUES ($1, 91, 'x', '1', 'Infinity', $2)", [resimId, yonId],
    ));
  });
});
