import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { BelgeAyrintisi, KucukResimlerCevabi, MalzemeBelgeleriCevabi } from '#paylasilan/sozlesme/cizimler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  belgeAcVeBagla, kaydaBagla, kaydaBagliBelgeler, kayitlaraBagliBelgeler, kayittakiBelgeDosyasi, kayittanKaldir, yayindakiBelgeDosyasi, yayindakiBelgeler,
  kayitlarinKucukResimleri, yayindakiOnizleme, yayindakiOnizlemeKaresi,
} from './disari.ts';

const PAROLA = 'dogru-parola-1';

interface Oturum { cerez: string; id: number }

// Sentetik içerik: imzası türü belirler (dosya modülü türü içerikten bulur), gerisi rastgele; gerçek çizim yok.
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2500)]);
const step = (): Buffer => Buffer.concat([Buffer.from('ISO-10303-21;\nHEADER;\n'), randomBytes(1500)]);
const glb = (): Buffer => Buffer.concat([Buffer.from('glTF'), randomBytes(1500)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('çizim merkezi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let ikinciYonetici: Oturum;
  let operator: Oturum;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisYap(rolKodu: string | null, yoneticiId: number | null): Promise<Oturum> {
    const kullaniciAdi = `cizim-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (rolKodu !== null && yoneticiId !== null) {
        const rol = await db.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (o: Oturum, yol: string, govde: unknown, istekKimligi: string | null = randomUUID()): Promise<LightMyRequestResponse> =>
    app.inject({
      method: 'POST', url: `/api${yol}`, payload: govde as object,
      headers: { cookie: o.cerez, ...(istekKimligi === null ? {} : { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi }) },
    });
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });

  async function yukle(o: Oturum, icerik: Buffer): Promise<string> {
    const ozet = ozetOf(icerik);
    const c = await gonder(o, `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: icerik.toString('base64') }, null);
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(c.json().tamam, true);
    return ozet;
  }

  async function belgeAc(o: Oturum, tur: string, icerik: Buffer, ad = 'Deneme belgesi'): Promise<BelgeAyrintisi> {
    const ozet = await yukle(o, icerik);
    const c = await gonder(o, '/cizimler', { ad, tur, ozet, dosyaAdi: 'deneme.dosya' });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<BelgeAyrintisi>();
  }

  async function revizyonEkle(o: Oturum, b: BelgeAyrintisi, icerik: Buffer): Promise<LightMyRequestResponse> {
    const ozet = await yukle(o, icerik);
    return gonder(o, `/cizimler/${b.id}/revizyon-ekle`, { ozet, dosyaAdi: 'rev.dosya', surum: b.surum });
  }

  before(async () => {
    ortam = await testVeritabaniKur('cizimler');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await girisYap(null, null);
    ikinciYonetici = await girisYap(null, null);
    operator = await girisYap('operator', yonetici.id);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('CZ-01 belgeyi yazma yetkisi olan açar (ilk revizyon A, taslak); yetkisiz kişi 403 alır ve belge açılmaz', async () => {
    const b = await belgeAc(yonetici, 'teknik-resim', pdf(), 'Flanş resmi');
    assert.equal(b.ad, 'Flanş resmi');
    assert.equal(b.revizyonlar.length, 1);
    assert.deepEqual([b.revizyonlar[0]?.harf, b.revizyonlar[0]?.durum, b.revizyonlar[0]?.dosyaTuru], ['A', 'taslak', 'pdf']);
    assert.equal(b.revizyonlar[0]?.yukleyenAd, `Deneme cizim-1`);

    const ozet = await yukle(operator, pdf());
    const once = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM cizimler_belge');
    const ret = await gonder(operator, '/cizimler', { ad: 'Yetkisiz', tur: 'teknik-resim', ozet, dosyaAdi: 'x.pdf' });
    assert.equal(ret.statusCode, 403, ret.body);
    assert.deepEqual(await vt().tek('SELECT count(*)::int AS n FROM cizimler_belge'), once);
  });

  test('CZ-02 sayfası ya da okuma işlemi olan listeler ve okur; olmayan 403 alır, menü sayacı boş döner', async () => {
    const b = await belgeAc(yonetici, 'kroki', pdf(), 'Okuma kroki');
    const liste = await oku(yonetici, '/cizimler?tur=kroki');
    assert.equal(liste.statusCode, 200, liste.body);
    assert.ok(liste.json().satirlar.some((s: { id: number }) => s.id === b.id));
    assert.equal((await oku(yonetici, `/cizimler/${b.id}`)).statusCode, 200);
    assert.equal((await oku(operator, '/cizimler')).statusCode, 403);
    assert.equal((await oku(operator, `/cizimler/${b.id}`)).statusCode, 403);
    assert.equal((await oku(operator, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/dosya`)).statusCode, 403);
    const sayac = await oku(yonetici, '/cizimler/menu-sayaclari');
    assert.equal(sayac.statusCode, 200);
    assert.ok((sayac.json().kroki as number) >= 1);
    assert.equal(typeof sayac.json()['model-3b'], 'number');
    assert.deepEqual((await oku(operator, '/cizimler/menu-sayaclari')).json(), {});
  });

  test('CZ-03 dosya türü belge türüne uymalı: 3B modele PDF reddedilir, STEP kabul edilir', async () => {
    const ozet = await yukle(yonetici, pdf());
    const ret = await gonder(yonetici, '/cizimler', { ad: 'Yanlış tür', tur: '3b-model', ozet, dosyaAdi: 'a.pdf' });
    assert.equal(ret.statusCode, 400, ret.body);
    assert.equal(ret.json().mesaj, 'Bu kayda bu türde dosya eklenemez.');
    const b = await belgeAc(yonetici, '3b-model', step(), 'Mil modeli');
    assert.equal(b.revizyonlar[0]?.dosyaTuru, 'step');
  });

  test('CZ-03 GLB 3B modele kabul edilir, teknik resme reddedilir', async () => {
    const ozet = await yukle(yonetici, glb());
    const ret = await gonder(yonetici, '/cizimler', { ad: 'Yanlış tür', tur: 'teknik-resim', ozet, dosyaAdi: 'a.glb' });
    assert.equal(ret.statusCode, 400, ret.body);
    assert.equal(ret.json().mesaj, 'Bu kayda bu türde dosya eklenemez.');
    const b = await belgeAc(yonetici, '3b-model', glb(), 'Makine modeli');
    assert.equal(b.revizyonlar[0]?.dosyaTuru, 'glb');
  });

  test('CZ-03 rapor PDF alır, 3B modeli reddeder; rapor stok partisine ve iş emrine bağlanır', async () => {
    const ozet = await yukle(yonetici, step());
    const ret = await gonder(yonetici, '/cizimler', { ad: 'Yanlış tür', tur: 'rapor', ozet, dosyaAdi: 'a.step' });
    assert.equal(ret.statusCode, 400, ret.body);
    const r = await belgeAc(yonetici, 'rapor', pdf(), 'Fason dönüş raporu');
    assert.equal(r.tur, 'rapor');
    const kullanici = { id: yonetici.id, ad: 'deneme', islemler: [] };
    await vt().tx(async (db) => {
      await kaydaBagla(db, kullanici, r.id, 'stok', 41);
      await kaydaBagla(db, kullanici, r.id, 'uretim-emirleri', 42);
    });
    assert.deepEqual((await vt().tx((db) => kaydaBagliBelgeler(db, 'stok', 41))).map((x) => x.id), [r.id]);
    assert.deepEqual((await vt().tx((db) => kaydaBagliBelgeler(db, 'uretim-emirleri', 42))).map((x) => x.id), [r.id]);
    const sayac = await oku(yonetici, '/cizimler/menu-sayaclari');
    assert.ok((sayac.json().rapor as number) >= 1);
  });

  test('CZ-13 disari: belgeAcVeBagla sertifikayı açar, yayınlar ve kayda bağlar; cizimler işlemi olmayan kişi de çağırabilir', async () => {
    const ozet = await yukle(operator, pdf());
    const kullanici = { id: operator.id, ad: 'deneme', islemler: [] };
    const denetim: unknown[] = [];
    const id = await vt().tx((db) => belgeAcVeBagla(
      db, kullanici, { ad: ' Parti sertifikası ', tur: 'sertifika', ozet, dosyaAdi: 'sertifika.pdf' }, 'stok', 51, (s) => { denetim.push(...s); },
    ));
    const bagli = await vt().tx((db) => kaydaBagliBelgeler(db, 'stok', 51));
    assert.deepEqual(bagli.map((x) => [x.id, x.ad, x.tur, x.harf, x.dosyaTuru]), [[id, 'Parti sertifikası', 'sertifika', 'A', 'pdf']]);
    assert.notEqual(await vt().tx((db) => kayittakiBelgeDosyasi(db, 'stok', 51, id)), null);
    assert.equal(denetim.length, 1);
  });

  test('CZ-13 disari: sertifika satın alma sipariş satırına da bağlanır', async () => {
    const ozet = await yukle(operator, pdf());
    const kullanici = { id: operator.id, ad: 'deneme', islemler: [] };
    const id = await vt().tx((db) => belgeAcVeBagla(
      db, kullanici, { ad: 'Sipariş sertifikası', tur: 'sertifika', ozet, dosyaAdi: 'sertifika.pdf' }, 'satin-alma', 61, () => {},
    ));
    assert.deepEqual((await vt().tx((db) => kaydaBagliBelgeler(db, 'satin-alma', 61))).map((x) => x.id), [id]);
  });

  test('CZ-13 disari: belgeAcVeBagla türe uymayan ya da kişinin yüklemediği dosyada hiçbir şey bırakmaz', async () => {
    const kullanici = { id: operator.id, ad: 'deneme', islemler: [] };
    const cad = await yukle(operator, step());
    await assert.rejects(vt().tx((db) => belgeAcVeBagla(
      db, kullanici, { ad: 'Yanlış tür', tur: 'rapor', ozet: cad, dosyaAdi: 'a.step' }, 'uretim-emirleri', 52, () => {},
    )));
    const baskasinin = await yukle(yonetici, pdf());
    await assert.rejects(vt().tx((db) => belgeAcVeBagla(
      db, kullanici, { ad: 'Başkasının', tur: 'rapor', ozet: baskasinin, dosyaAdi: 'a.pdf' }, 'uretim-emirleri', 52, () => {},
    )));
    assert.deepEqual(await vt().tx((db) => kaydaBagliBelgeler(db, 'uretim-emirleri', 52)), []);
    const kalan = await vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM cizimler_belge WHERE ad IN ('Yanlış tür', 'Başkasının')"));
    assert.equal(kalan?.n, 0);
  });

  test('CZ-04 içeriği kendisi yüklemeyen kişi dosyayı bağlayamaz (özeti bilmek yetmez)', async () => {
    const ozet = await yukle(yonetici, pdf());
    const ret = await gonder(ikinciYonetici, '/cizimler', { ad: 'Başkasının dosyası', tur: 'diger', ozet, dosyaAdi: 'a.pdf' });
    assert.equal(ret.statusCode, 400, ret.body);
    assert.equal(ret.json().mesaj, 'Dosya yüklenmemiş.');
  });

  test('CZ-05 yayın: taslak yayına geçer; yenisi yayınlanınca eskisi eski olur; yayındaki yeniden yayınlanmaz; eski yeniden yayınlanır', async () => {
    let b = await belgeAc(yonetici, 'teknik-resim', pdf());
    const a = b.revizyonlar[0];
    assert.ok(a);
    let c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${a.id}/yayinla`, { surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    b = c.json<BelgeAyrintisi>();
    assert.equal(b.revizyonlar[0]?.durum, 'yayinda');
    assert.notEqual(b.revizyonlar[0]?.yayinlandi, null);

    c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${a.id}/yayinla`, { surum: b.surum });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(c.json().mesaj, 'Bu revizyon zaten yayında.');

    c = await revizyonEkle(yonetici, b, pdf());
    assert.equal(c.statusCode, 200, c.body);
    b = c.json<BelgeAyrintisi>();
    const r2 = b.revizyonlar[0];
    assert.deepEqual([r2?.harf, r2?.durum], ['B', 'taslak']);
    c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${r2?.id}/yayinla`, { surum: b.surum });
    b = c.json<BelgeAyrintisi>();
    assert.deepEqual(b.revizyonlar.map((r) => [r.harf, r.durum]), [['B', 'yayinda'], ['A', 'eski']]);

    c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${a.id}/yayinla`, { surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<BelgeAyrintisi>().revizyonlar.map((r) => [r.harf, r.durum]), [['B', 'eski'], ['A', 'yayinda']]);
  });

  test('CZ-05 yayınlama ayrı işlemdir: yayınlama işlemi olmayan 403 alır', async () => {
    const b = await belgeAc(yonetici, 'teknik-resim', pdf());
    const c = await gonder(operator, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    assert.equal(c.statusCode, 403);
  });

  test('CZ-06 aynı dosya bir belgede iki revizyon olamaz; başka belgede olabilir', async () => {
    const icerik = pdf();
    const b = await belgeAc(yonetici, 'teknik-resim', icerik);
    const c = await revizyonEkle(yonetici, b, icerik);
    assert.equal(c.statusCode, 400, c.body);
    assert.equal(c.json().mesaj, 'Bu dosya bu belgede zaten bir revizyon.');
    const baska = await belgeAc(yonetici, 'teknik-resim', icerik, 'Aynı dosya başka belgede');
    assert.equal(baska.revizyonlar.length, 1);
  });

  test('CZ-07 yalnız taslak silinir; tek revizyon silinmez; silinen taslağın dosya bağı kalkar', async () => {
    let b = await belgeAc(yonetici, 'teknik-resim', pdf());
    const a = b.revizyonlar[0];
    let c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${a?.id}/sil`, { surum: b.surum });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(c.json().mesaj, 'Belgenin tek revizyonu silinemez; belgeyi arşivleyin.');

    b = (await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${a?.id}/yayinla`, { surum: b.surum })).json<BelgeAyrintisi>();
    b = (await revizyonEkle(yonetici, b, pdf())).json<BelgeAyrintisi>();
    const taslak = b.revizyonlar[0];
    c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${a?.id}/sil`, { surum: b.surum });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(c.json().mesaj, 'Yalnız taslak revizyon silinir.');

    c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${taslak?.id}/sil`, { surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<BelgeAyrintisi>().revizyonlar.map((r) => r.harf), ['A']);
    const bag = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM dosya_bagi WHERE modul = 'cizimler' AND kayit = $1 AND ozet = $2", [String(b.id), taslak?.ozet]);
    assert.equal(bag?.n, 0);
  });

  test('CZ-07 veritabanı: yayınlanmış revizyonun dosyası değişmez, kendisi silinmez, taslağa dönmez', async () => {
    let b = await belgeAc(yonetici, 'teknik-resim', pdf());
    b = (await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum })).json<BelgeAyrintisi>();
    const id = b.revizyonlar[0]?.id;
    await assert.rejects(vt().tx((db) => db.sorgu("UPDATE cizimler_revizyon SET dosya_turu = 'png' WHERE id = $1", [id])), /dosyası değişmez/);
    await assert.rejects(vt().tx((db) => db.sorgu('DELETE FROM cizimler_revizyon WHERE id = $1', [id])), /silinmez/);
    await assert.rejects(
      vt().tx((db) => db.sorgu("UPDATE cizimler_revizyon SET durum = 'taslak', yayinlayan_id = NULL, yayinlandi = NULL WHERE id = $1", [id])),
      /bu yöne geçmez/,
    );
    // Belgede ikinci yayındaki revizyon olmaz (dizin).
    b = (await revizyonEkle(yonetici, b, pdf())).json<BelgeAyrintisi>();
    await assert.rejects(
      vt().tx((db) => db.sorgu("UPDATE cizimler_revizyon SET durum = 'yayinda', yayinlayan_id = $2, yayinlandi = now() WHERE belge_id = $1 AND id <> $3", [b.id, yonetici.id, id])),
      /cizimler_revizyon_tek_yayinda/,
    );
  });

  test('CZ-08 arşivdeki belgeye revizyon eklenmez; arşivden çıkınca eklenir; arşiv ayrı listelenir', async () => {
    let b = await belgeAc(yonetici, 'sertifika', pdf(), 'Arşiv sertifikası');
    let c = await gonder(yonetici, `/cizimler/${b.id}/arsivle`, { surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    b = c.json<BelgeAyrintisi>();
    assert.equal(b.aktif, false);
    const arsiv = (await oku(yonetici, '/cizimler?arsiv=evet')).json();
    assert.ok(arsiv.satirlar.some((s: { id: number }) => s.id === b.id));
    assert.equal((await oku(yonetici, '/cizimler')).json().satirlar.some((s: { id: number }) => s.id === b.id), false);
    c = await revizyonEkle(yonetici, b, pdf());
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(c.json().mesaj, 'Arşivdeki belge değişmez; önce arşivden çıkarın.');
    b = (await gonder(yonetici, `/cizimler/${b.id}/arsivden-cikar`, { surum: b.surum })).json<BelgeAyrintisi>();
    c = await revizyonEkle(yonetici, b, pdf());
    assert.equal(c.statusCode, 200, c.body);
  });

  test('CZ-09 merkezden malzeme kartına bağ kurulur, ikinci kez kurulmaz; başka modüle merkezden bağ kurulmaz', async () => {
    let b = await belgeAc(yonetici, '3b-model', step(), 'Bağlı model');
    let c = await gonder(yonetici, `/cizimler/${b.id}/bag-ekle`, { hedefModul: 'malzemeler', hedefId: 41, surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    b = c.json<BelgeAyrintisi>();
    assert.deepEqual(b.baglar.map((g) => [g.hedefModul, g.hedefId]), [['malzemeler', 41]]);
    c = await gonder(yonetici, `/cizimler/${b.id}/bag-ekle`, { hedefModul: 'malzemeler', hedefId: 41, surum: b.surum });
    assert.equal(c.statusCode, 409, c.body);
    assert.equal(c.json().mesaj, 'Bu kayıt zaten bağlı.');
    c = await gonder(yonetici, `/cizimler/${b.id}/bag-ekle`, { hedefModul: 'stok', hedefId: 3, surum: b.surum });
    assert.equal(c.statusCode, 400, c.body);
    c = await gonder(yonetici, `/cizimler/${b.id}/bag-kaldir`, { hedefModul: 'malzemeler', hedefId: 41, surum: b.surum });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<BelgeAyrintisi>().baglar, []);
  });

  test('CZ-09 malzeme seçicisi stok kodu ya da adla arar, yalnız aktif kartları verir; bağ kuramayan rol seçiciyi açamaz', async () => {
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('CZ-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = async (durum: string, ad: string): Promise<number> => {
      sayac += 1;
      const r = await vt().tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'hammadde', 'CZ-DNM-', $2, $3, $4, $5, $5) RETURNING no`,
        [`cz-dnm-${sayac}`, sayac, durum, JSON.stringify({ id: `cz-dnm-${sayac}`, com: { ad } }), yonetici.id],
      );
      return r?.no ?? 0;
    };
    const aktif = await kart('aktif', 'Deneme seçim çubuğu');
    await kart('pasif', 'Deneme seçim pasif');
    await kart('taslak', 'Deneme seçim taslak');
    const ara = async (o: Oturum, metin: string) => oku(o, `/cizimler/malzeme-secimi?ara=${encodeURIComponent(metin)}`);
    let c = await ara(yonetici, 'CZ-DNM');
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json().malzemeler.map((m: { id: number }) => m.id), [aktif]);
    c = await ara(yonetici, 'seçim çubuğu');
    assert.deepEqual(c.json().malzemeler.map((m: { id: number; ad: string }) => [m.id, m.ad]), [[aktif, 'Deneme seçim çubuğu']]);
    c = await ara(operator, 'CZ-DNM');
    assert.equal(c.statusCode, 403, c.body);
  });

  // Test raporu: bağ listesi "Malzeme kartı #54" gibi iç numara gösteriyordu; bağ satırı sahibinden okunan adı taşır.
  test('bağ satırı kaydın okunur adını taşır: malzemede stok kodu ve ad, makinede istasyon adı; olmayan kayıtta ad uydurulmaz', async () => {
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('CZ-ADI-', 0) ON CONFLICT (onek) DO NOTHING");
    sayac += 1;
    const kart = await vt().tek<{ no: number; kod: string }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'CZ-ADI-', $2, 'aktif', $3, $4, $4) RETURNING no, stok_kodu AS kod`,
      [`cz-adi-${sayac}`, sayac, JSON.stringify({ id: `cz-adi-${sayac}`, com: { ad: 'Deneme bağlı mil' } }), yonetici.id],
    );
    const im = await vt().tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`CZIM${(sayac += 1)}`, 'Deneme Merkezi']);
    const ist = await vt().tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`CZIS${sayac}`, 'Deneme Adlı Tezgah', im?.id],
    );
    let b = await belgeAc(yonetici, '3b-model', glb(), 'Adlı bağ modeli');
    for (const [hedefModul, hedefId] of [['malzemeler', kart!.no], ['malzemeler', 2_000_000_001], ['istasyonlar', ist!.id]] as const) {
      const c = await gonder(yonetici, `/cizimler/${b.id}/bag-ekle`, { hedefModul, hedefId, surum: b.surum });
      assert.equal(c.statusCode, 200, c.body);
      b = c.json<BelgeAyrintisi>();
    }
    const ayrinti = (await oku(yonetici, `/cizimler/${b.id}`)).json<BelgeAyrintisi>();
    assert.deepEqual(ayrinti.baglar.map((g) => [g.hedefModul, g.hedefId, g.hedefAdi]).sort((x, y) => Number(x[1]) - Number(y[1])), [
      ['istasyonlar', ist!.id, 'Deneme Adlı Tezgah'],
      ['malzemeler', kart!.no, `${kart!.kod} Deneme bağlı mil`],
      ['malzemeler', 2_000_000_001, null],
    ].sort((x, y) => Number(x[1]) - Number(y[1])));
  });

  test('CZ-14 merkezden 3B model istasyona bağlanır ve istasyonun öbür 3B modelinin yerini alır; başka tür ve olmayan istasyon reddedilir', async () => {
    const im = await vt().tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`CZIM${(sayac += 1)}`, 'Deneme Merkezi']);
    const ist = await vt().tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`CZIS${sayac}`, 'Deneme Tezgahı', im?.id],
    );
    const istasyonId = ist?.id ?? 0;
    let ilk = await belgeAc(yonetici, '3b-model', glb(), 'Eski tezgah modeli');
    let c = await gonder(operator, `/cizimler/${ilk.id}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: istasyonId, surum: ilk.surum });
    assert.equal(c.statusCode, 403, c.body);
    c = await gonder(yonetici, `/cizimler/${ilk.id}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: istasyonId, surum: ilk.surum });
    assert.equal(c.statusCode, 200, c.body);
    ilk = c.json<BelgeAyrintisi>();
    const yeni = await belgeAc(yonetici, '3b-model', glb(), 'Yeni tezgah modeli');
    c = await gonder(yonetici, `/cizimler/${yeni.id}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: istasyonId, surum: yeni.surum });
    assert.equal(c.statusCode, 200, c.body);
    const bagli = await vt().tx((db) => kaydaBagliBelgeler(db, 'istasyonlar', istasyonId));
    assert.deepEqual(bagli.map((x) => x.id), [yeni.id], 'istasyon başına tek 3B model');
    assert.deepEqual((await oku(yonetici, `/cizimler/${ilk.id}`)).json<BelgeAyrintisi>().baglar, []);

    const resim = await belgeAc(yonetici, 'teknik-resim', pdf(), 'Tezgah resmi');
    c = await gonder(yonetici, `/cizimler/${resim.id}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: istasyonId, surum: resim.surum });
    assert.equal(c.statusCode, 400, c.body);
    assert.equal(c.json().mesaj, 'İstasyona merkezden yalnız 3B model belgesi bağlanır.');
    const b = await belgeAc(yonetici, '3b-model', glb(), 'Sahipsiz model');
    c = await gonder(yonetici, `/cizimler/${b.id}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: 2_000_000_000, surum: b.surum });
    assert.equal(c.statusCode, 400, c.body);
    assert.equal(c.json().mesaj, 'Bağlanacak kayıt bulunamadı.');
  });

  test('CZ-16 3B listesi makineye göre süzülür: istasyona bağlı model makine, bağsız ya da yalnız malzemeye bağlı model malzeme; süzgeçsiz liste değişmez', async () => {
    const im = await vt().tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`CZIM${(sayac += 1)}`, 'Deneme Merkezi']);
    const ist = await vt().tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`CZIS${sayac}`, 'Deneme Tezgahı', im?.id],
    );
    const makine = await belgeAc(yonetici, '3b-model', glb(), 'Ayrim tezgah modeli');
    assert.equal((await gonder(yonetici, `/cizimler/${makine.id}/bag-ekle`, { hedefModul: 'istasyonlar', hedefId: ist?.id, surum: makine.surum })).statusCode, 200);
    const bagsiz = await belgeAc(yonetici, '3b-model', glb(), 'Ayrim bagsiz model');
    const parca = await belgeAc(yonetici, '3b-model', glb(), 'Ayrim parca model');
    assert.equal((await gonder(yonetici, `/cizimler/${parca.id}/bag-ekle`, { hedefModul: 'malzemeler', hedefId: 41, surum: parca.surum })).statusCode, 200);
    const liste = async (ek: string): Promise<string[]> => {
      const c = await oku(yonetici, `/cizimler?tur=3b-model&ara=Ayrim${ek}&siralama=ad`);
      assert.equal(c.statusCode, 200, c.body);
      return (c.json() as { satirlar: { ad: string }[]; toplam: number }).satirlar.map((s) => s.ad).sort();
    };
    assert.deepEqual(await liste('&makine=evet'), ['Ayrim tezgah modeli']);
    assert.deepEqual(await liste('&makine=hayir'), ['Ayrim bagsiz model', 'Ayrim parca model']);
    assert.deepEqual(await liste(''), ['Ayrim bagsiz model', 'Ayrim parca model', 'Ayrim tezgah modeli']);
    const say = await oku(yonetici, '/cizimler?tur=3b-model&ara=Ayrim&makine=evet');
    assert.equal((say.json() as { toplam: number }).toplam, 1, 'toplam da süzülür');
    assert.equal((await oku(yonetici, '/cizimler?makine=belki')).statusCode, 400);
    assert.ok(bagsiz.id > 0);
  });

  test('CZ-09 disari: bağlayan modül belgeyi kendi kaydına bağlar; dosya yalnız o kayıttan ve yalnız yayındaysa akar', async () => {
    let b = await belgeAc(yonetici, 'makine', pdf(), 'Makine kılavuzu');
    const kullanici = { id: yonetici.id, ad: 'deneme', islemler: [] };
    await vt().tx((db) => kaydaBagla(db, kullanici, b.id, 'istasyonlar', 7));
    let bagli = await vt().tx((db) => kaydaBagliBelgeler(db, 'istasyonlar', 7));
    assert.deepEqual(bagli.map((x) => [x.id, x.revizyonId]), [[b.id, null]], 'yalnız taslak: revizyon yok');
    assert.equal(await vt().tx((db) => kayittakiBelgeDosyasi(db, 'istasyonlar', 7, b.id)), null);

    b = (await oku(yonetici, `/cizimler/${b.id}`)).json<BelgeAyrintisi>();
    await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    bagli = await vt().tx((db) => kaydaBagliBelgeler(db, 'istasyonlar', 7));
    assert.equal(bagli[0]?.harf, 'A');
    assert.notEqual(await vt().tx((db) => kayittakiBelgeDosyasi(db, 'istasyonlar', 7, b.id)), null);
    assert.equal(await vt().tx((db) => kayittakiBelgeDosyasi(db, 'istasyonlar', 8, b.id)), null, 'başka kayıt');
    assert.equal(await vt().tx((db) => kayittanKaldir(db, b.id, 'istasyonlar', 7)), true);
    assert.deepEqual(await vt().tx((db) => kaydaBagliBelgeler(db, 'istasyonlar', 7)), []);
  });

  test('CZ-09 disari: toplu okuma her kaydın bağlı belgelerini tek sorguda verir; bağsız kayıt ve başka modül yoktur', async () => {
    const a = await belgeAc(yonetici, '3b-model', glb(), 'Freze modeli');
    const c = await belgeAc(yonetici, '3b-model', glb(), 'Torna modeli');
    const kullanici = { id: yonetici.id, ad: 'deneme', islemler: [] };
    await vt().tx(async (db) => {
      await kaydaBagla(db, kullanici, a.id, 'istasyonlar', 101);
      await kaydaBagla(db, kullanici, a.id, 'istasyonlar', 102);
      await kaydaBagla(db, kullanici, c.id, 'istasyonlar', 102);
      await kaydaBagla(db, kullanici, c.id, 'atolye', 103);
    });
    const harita = await vt().tx((db) => kayitlaraBagliBelgeler(db, 'istasyonlar', [101, 102, 103, 104]));
    assert.deepEqual([...harita.keys()].sort(), [101, 102]);
    assert.deepEqual(harita.get(101)?.map((x) => x.id), [a.id]);
    assert.deepEqual(harita.get(102)?.map((x) => x.id), [a.id, c.id]);
    assert.deepEqual(harita.get(102), await vt().tx((db) => kaydaBagliBelgeler(db, 'istasyonlar', 102)), 'tekli okumayla aynı');
    assert.equal((await vt().tx((db) => kayitlaraBagliBelgeler(db, 'istasyonlar', []))).size, 0);
  });

  test('CZ-09 disari: seçici yalnız yayındaki etkin belgeleri verir; özet yayındaki revizyonu izler; dosya arşivde ve taslakta akmaz', async () => {
    let yayinda = await belgeAc(yonetici, 'kroki', pdf(), 'Salon planı');
    const taslak = await belgeAc(yonetici, 'kroki', pdf(), 'Salon taslağı');
    const baskaTur = await belgeAc(yonetici, 'teknik-resim', pdf(), 'Salon resmi');
    for (const b of [yayinda, baskaTur]) await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
    yayinda = (await oku(yonetici, `/cizimler/${yayinda.id}`)).json<BelgeAyrintisi>();

    let liste = await vt().tx((db) => yayindakiBelgeler(db, { tur: 'kroki', ara: 'salon' }));
    assert.deepEqual(liste.map((x) => [x.id, x.harf, x.ozet]), [[yayinda.id, 'A', yayinda.revizyonlar[0]?.ozet]]);
    assert.deepEqual((await vt().tx((db) => yayindakiBelgeler(db, { ara: 'SALON' }))).map((x) => x.id).sort(), [yayinda.id, baskaTur.id].sort());
    assert.deepEqual(await vt().tx((db) => yayindakiBelgeler(db, { ara: '%' })), [], 'joker düz metin');
    const dosya = await vt().tx((db) => yayindakiBelgeDosyasi(db, yayinda.id));
    assert.deepEqual([dosya?.ad, dosya?.tur, dosya?.ozet, dosya?.dosyaTuru, dosya?.dosya.tur], ['Salon planı', 'kroki', yayinda.revizyonlar[0]?.ozet, 'pdf', 'application/pdf']);
    assert.equal(await vt().tx((db) => yayindakiBelgeDosyasi(db, taslak.id)), null, 'yalnız taslak');
    assert.equal(await vt().tx((db) => yayindakiBelgeDosyasi(db, 999999)), null, 'yok');

    // Yeni revizyon yayınlanınca seçici ve bağlı kayıt yeni özeti görür.
    const kullanici = { id: yonetici.id, ad: 'deneme', islemler: [] };
    await vt().tx((db) => kaydaBagla(db, kullanici, yayinda.id, 'atolye', 3));
    yayinda = (await oku(yonetici, `/cizimler/${yayinda.id}`)).json<BelgeAyrintisi>();
    const r = (await revizyonEkle(yonetici, yayinda, pdf())).json<BelgeAyrintisi>();
    await gonder(yonetici, `/cizimler/${r.id}/revizyonlar/${r.revizyonlar.find((x) => x.harf === 'B')?.id}/yayinla`, { surum: r.surum });
    const yeniOzet = r.revizyonlar.find((x) => x.harf === 'B')?.ozet;
    liste = await vt().tx((db) => yayindakiBelgeler(db, { tur: 'kroki' }));
    assert.deepEqual(liste.map((x) => [x.harf, x.ozet]), [['B', yeniOzet]]);
    assert.equal((await vt().tx((db) => kaydaBagliBelgeler(db, 'atolye', 3)))[0]?.ozet, yeniOzet);

    const son = (await oku(yonetici, `/cizimler/${yayinda.id}`)).json<BelgeAyrintisi>();
    await gonder(yonetici, `/cizimler/${son.id}/arsivle`, { surum: son.surum });
    assert.equal(await vt().tx((db) => yayindakiBelgeDosyasi(db, yayinda.id)), null, 'arşivde');
    assert.deepEqual(await vt().tx((db) => yayindakiBelgeler(db, { tur: 'kroki' })), []);
  });

  test('CZ-10 eski sürümle yazma 409 alır; güncel sürümle geçer', async () => {
    const b = await belgeAc(yonetici, 'diger', pdf(), 'Sürüm');
    const ilk = await gonder(yonetici, `/cizimler/${b.id}/guncelle`, { ad: 'Sürüm 2', surum: b.surum });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const eski = await gonder(yonetici, `/cizimler/${b.id}/guncelle`, { ad: 'Sürüm 3', surum: b.surum });
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal(eski.json().ayrinti?.neden, 'eski-surum');
  });

  test('CZ-11 revizyonun dosyası içeriğiyle akar; başka belgenin revizyon kimliğiyle 404', async () => {
    const icerik = pdf();
    const b = await belgeAc(yonetici, 'teknik-resim', icerik);
    const baska = await belgeAc(yonetici, 'teknik-resim', pdf());
    const c = await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/dosya`);
    assert.equal(c.statusCode, 200);
    assert.equal(c.headers['content-type'], 'application/pdf');
    assert.deepEqual(c.rawPayload, icerik);
    assert.equal((await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${baska.revizyonlar[0]?.id}/dosya`)).statusCode, 404);
  });

  test('CZ-12 belge açma tekrar korumalıdır: aynı istek kimliği ikinci belge açmaz, başlıksız istek reddedilir', async () => {
    const ozet = await yukle(yonetici, pdf());
    const govde = { ad: 'Tekrar', tur: 'diger', ozet, dosyaAdi: 't.pdf' };
    const kimlik = randomUUID();
    const ilk = await gonder(yonetici, '/cizimler', govde, kimlik);
    const ikinci = await gonder(yonetici, '/cizimler', govde, kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ikinci.json().id, ilk.json().id);
    assert.equal((await gonder(yonetici, '/cizimler', govde, null)).statusCode, 400);
  });

  describe('CZ-15 önizleme kareleri', () => {
    const png = (boy = 1500): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(boy - 8)]);

    async function yayindaModel(ad: string, icerik: Buffer = step()): Promise<BelgeAyrintisi> {
      const b = await belgeAc(yonetici, '3b-model', icerik, ad);
      const c = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${b.revizyonlar[0]?.id}/yayinla`, { surum: b.surum });
      assert.equal(c.statusCode, 200, c.body);
      return c.json<BelgeAyrintisi>();
    }

    // Kareleri yükleyip özetleriyle bildirir.
    async function onizlemeGonder(o: Oturum, b: BelgeAyrintisi, icerikler: Buffer[], revizyonId = b.revizyonlar[0]?.id): Promise<LightMyRequestResponse> {
      const kareler: { kare: number; ozet: string }[] = [];
      for (const [kare, icerik] of icerikler.entries()) kareler.push({ kare, ozet: await yukle(o, icerik) });
      return gonder(o, `/cizimler/${b.id}/revizyonlar/${revizyonId}/onizleme`, { kareler });
    }

    const kareSayisi = async (revizyonId: number): Promise<number> =>
      (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM cizimler_onizleme WHERE revizyon_id = $1', [revizyonId]))?.n ?? -1;

    async function icerigi(db: Db, cevap: { akis: (db: Db) => AsyncIterable<Buffer> } | null): Promise<Buffer | null> {
      if (cevap === null) return null;
      const parcalar: Buffer[] = [];
      for await (const p of cevap.akis(db)) parcalar.push(p);
      return Buffer.concat(parcalar);
    }

    test('yayınlama yetkisi olan kareleri yazar; belge sürümü ilerlemez; kare PNG olarak okunur; yetkisiz 403 alır ve hiçbir şey yazılmaz', async () => {
      const b = await yayindaModel('Önizleme modeli');
      const rev = b.revizyonlar[0];
      assert.equal(rev?.onizlemeKareSayisi, 0);
      const kareler = [png(), png(), png()];

      const ret = await onizlemeGonder(operator, b, kareler);
      assert.equal(ret.statusCode, 403, ret.body);
      assert.equal(await kareSayisi(rev?.id ?? 0), 0);

      const c = await onizlemeGonder(yonetici, b, kareler);
      assert.equal(c.statusCode, 200, c.body);
      const yeni = c.json<BelgeAyrintisi>();
      assert.equal(yeni.surum, b.surum, 'önizleme belgeyi değiştirmez');
      assert.equal(yeni.revizyonlar[0]?.onizlemeKareSayisi, 3);
      assert.equal(yeni.revizyonlar[0]?.dosyaAdi, b.revizyonlar[0]?.dosyaAdi, 'revizyon-dosya eşlemesi bozulmaz');

      const kare = await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${rev?.id}/onizleme/1`);
      assert.equal(kare.statusCode, 200);
      assert.equal(kare.headers['content-type'], 'image/png');
      assert.deepEqual(kare.rawPayload, kareler[1]);
      assert.equal((await oku(operator, `/cizimler/${b.id}/revizyonlar/${rev?.id}/onizleme/1`)).statusCode, 403);
      assert.equal((await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${rev?.id}/onizleme/3`)).statusCode, 404);
      const dosya = await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${rev?.id}/dosya`);
      assert.equal(dosya.statusCode, 200, 'revizyon dosyası hâlâ okunur');
      assert.equal(dosya.headers['content-type'], 'model/step');
    });

    test('yazma yetkisi olup yayınlama yetkisi olmayan 403 alır; yayınlama yetkisi olan yazar', async () => {
      const yalnizYazar = await girisYap('cam', yonetici.id);
      const yalnizYayinci = await girisYap('kalite', yonetici.id);
      const b = await yayindaModel('Yetki modeli');
      const id = b.revizyonlar[0]?.id ?? 0;
      const ret = await onizlemeGonder(yalnizYazar, b, [png()]);
      assert.equal(ret.statusCode, 403, ret.body);
      assert.equal(await kareSayisi(id), 0);
      const c = await onizlemeGonder(yalnizYayinci, b, [png()]);
      assert.equal(c.statusCode, 200, c.body);
      assert.equal(await kareSayisi(id), 1);
    });

    test('kare ucu başka belge kimliğiyle aynı revizyon ve kareyi vermez', async () => {
      const b = await yayindaModel('Kare sahibi');
      const baska = await yayindaModel('Başka belge');
      const id = b.revizyonlar[0]?.id ?? 0;
      assert.equal((await onizlemeGonder(yonetici, b, [png()])).statusCode, 200);
      assert.equal((await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${id}/onizleme/0`)).statusCode, 200);
      assert.equal((await oku(yonetici, `/cizimler/${baska.id}/revizyonlar/${id}/onizleme/0`)).statusCode, 404);
    });

    test('taslak revizyona 409; yayındaki PDF, foto ve STL revizyonuna kare yazılır (kart #688)', async () => {
      const taslak = await belgeAc(yonetici, '3b-model', step(), 'Taslak model');
      let c = await onizlemeGonder(yonetici, taslak, [png()]);
      assert.equal(c.statusCode, 409, c.body);
      assert.equal(c.json().mesaj, 'Önizleme yalnız yayındaki revizyon için üretilir.');

      let resim = await belgeAc(yonetici, 'teknik-resim', pdf(), 'Resim önizlemeli');
      resim = (await gonder(yonetici, `/cizimler/${resim.id}/revizyonlar/${resim.revizyonlar[0]?.id}/yayinla`, { surum: resim.surum })).json<BelgeAyrintisi>();
      c = await onizlemeGonder(yonetici, resim, [png()]);
      assert.equal(c.statusCode, 200, c.body);
      assert.equal(await kareSayisi(resim.revizyonlar[0]?.id ?? 0), 1);

      const stl = Buffer.alloc(84 + 50); stl.writeUInt32LE(1, 80);
      const model = await yayindaModel('STL modeli', stl);
      assert.equal((await onizlemeGonder(yonetici, model, [png(), png()])).statusCode, 200);
      assert.equal(await kareSayisi(model.revizyonlar[0]?.id ?? 0), 2);

      const b = await yayindaModel('Olmayan revizyon');
      assert.equal((await onizlemeGonder(yonetici, b, [png()], 2_000_000_000)).statusCode, 404);
    });

    test('resim dışı dosya, 64 KiB üstü kare ve 512 KiB üstü toplam reddedilir; ret hiçbir kare bırakmaz', async () => {
      const b = await yayindaModel('Sınır modeli');
      const id = b.revizyonlar[0]?.id ?? 0;
      let c = await onizlemeGonder(yonetici, b, [png(), pdf()]);
      assert.equal(c.statusCode, 400, c.body);
      assert.equal(c.json().mesaj, 'Bu kayda bu türde dosya eklenemez.');

      c = await onizlemeGonder(yonetici, b, [png(), png(64 * 1024 + 1)]);
      assert.equal(c.statusCode, 413, c.body);

      // 9 kare x 60 KiB = 540 KiB: her kare sınırda, toplam sınırı aşar.
      c = await onizlemeGonder(yonetici, b, Array.from({ length: 9 }, () => png(60 * 1024)));
      assert.equal(c.statusCode, 400, c.body);
      assert.equal(c.json().mesaj, 'Önizleme kareleri toplamda 512 KiB sınırını aşıyor.');
      assert.equal(await kareSayisi(id), 0);

      // Sınırın tam üstü kabul edilir: 8 kare x 64 KiB = 512 KiB.
      c = await onizlemeGonder(yonetici, b, Array.from({ length: 8 }, () => png(64 * 1024)));
      assert.equal(c.statusCode, 200, c.body);
      assert.equal(await kareSayisi(id), 8);
    });

    test('kare sayısı 1..16 ve sıra 0..n-1 olmalı', async () => {
      const b = await yayindaModel('Sıra modeli');
      const id = b.revizyonlar[0]?.id ?? 0;
      const ozet = await yukle(yonetici, png());
      const yaz = (kareler: { kare: number; ozet: string }[]) => gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${id}/onizleme`, { kareler });
      assert.equal((await yaz([])).statusCode, 400);
      assert.equal((await yaz(Array.from({ length: 17 }, (_, kare) => ({ kare, ozet })))).statusCode, 400);
      const sira = await yaz([{ kare: 1, ozet }, { kare: 2, ozet }]);
      assert.equal(sira.statusCode, 400, sira.body);
      assert.equal(sira.json().mesaj, 'Önizleme kareleri 0\'dan başlayıp sırayla gelmeli.');
      assert.equal((await yaz([{ kare: 0, ozet }, { kare: 0, ozet }])).statusCode, 400);
      assert.equal(await kareSayisi(id), 0);
      // 16 kare (aynı içerik tek bağ olur) kabul edilir.
      const tam = await yaz(Array.from({ length: 16 }, (_, kare) => ({ kare, ozet })));
      assert.equal(tam.statusCode, 200, tam.body);
      assert.equal(await kareSayisi(id), 16);
    });

    test('yeniden üretim eski karelerin yerini alır; eski kare dosyalarının bağı kalkar', async () => {
      const b = await yayindaModel('Yeniden üretim');
      const id = b.revizyonlar[0]?.id ?? 0;
      const eski = [png(), png(), png()];
      assert.equal((await onizlemeGonder(yonetici, b, eski)).statusCode, 200);
      const kayit = `${b.id}/onizleme/${id}`;
      const bagSayisi = async (): Promise<number> =>
        (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM dosya_bagi WHERE modul = 'cizimler' AND kayit = $1", [kayit]))?.n ?? -1;
      assert.equal(await bagSayisi(), 3);

      const yeni = [png(), png()];
      const c = await onizlemeGonder(yonetici, b, yeni);
      assert.equal(c.statusCode, 200, c.body);
      assert.equal(c.json<BelgeAyrintisi>().revizyonlar[0]?.onizlemeKareSayisi, 2);
      assert.equal(await kareSayisi(id), 2);
      assert.equal(await bagSayisi(), 2);
      assert.deepEqual((await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${id}/onizleme/0`)).rawPayload, yeni[0]);
      assert.equal((await oku(yonetici, `/cizimler/${b.id}/revizyonlar/${id}/onizleme/2`)).statusCode, 404, 'eski üçüncü kare gitti');
      const eskiBag = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM dosya_bagi WHERE modul = 'cizimler' AND kayit = $1 AND ozet = $2", [kayit, ozetOf(eski[2] as Buffer)]);
      assert.equal(eskiBag?.n, 0);

      // Aynı kareler yeniden gönderilince de çalışır (bağ önce kalkar, sonra kurulur).
      assert.equal((await onizlemeGonder(yonetici, b, yeni)).statusCode, 200);
      assert.equal(await kareSayisi(id), 2);
    });

    test('disari: bağlı malzeme kaydından okunur; yayında olmayan revizyon ve olmayan kare null verir', async () => {
      let b = await yayindaModel('Malzeme önizleme modeli');
      const idA = b.revizyonlar[0]?.id ?? 0;
      const kareler = [png(), png()];
      assert.equal((await onizlemeGonder(yonetici, b, kareler)).statusCode, 200);
      const kullanici = { id: yonetici.id, ad: 'deneme', islemler: [] };
      const hedef = { hedefModul: 'malzemeler', hedefId: 8801 } as const;

      assert.equal(await vt().tx((db) => yayindakiOnizleme(db, hedef)), null, 'bağ yokken');
      await vt().tx((db) => kaydaBagla(db, kullanici, b.id, hedef.hedefModul, hedef.hedefId));
      assert.deepEqual(await vt().tx((db) => yayindakiOnizleme(db, hedef)), { belgeId: b.id, revizyonId: idA, kareler: [0, 1] });
      assert.equal(await vt().tx((db) => yayindakiOnizleme(db, { hedefModul: 'malzemeler', hedefId: 8802 })), null, 'başka kayıt');

      const kare = await vt().tx(async (db) => icerigi(db, await yayindakiOnizlemeKaresi(db, hedef, idA, 1)));
      assert.deepEqual(kare, kareler[1]);
      const cevap = await vt().tx((db) => yayindakiOnizlemeKaresi(db, hedef, idA, 0));
      assert.equal(cevap?.tur, 'image/png');
      assert.equal(await vt().tx((db) => yayindakiOnizlemeKaresi(db, hedef, idA, 2)), null, 'kare yok');
      assert.equal(await vt().tx((db) => yayindakiOnizlemeKaresi(db, hedef, 2_000_000_000, 0)), null, 'revizyon yok');
      assert.equal(await vt().tx((db) => yayindakiOnizlemeKaresi(db, { hedefModul: 'malzemeler', hedefId: 8802 }, idA, 0)), null, 'başka kayda bağlı belgenin revizyonu');
      assert.equal(await vt().tx((db) => yayindakiOnizlemeKaresi(db, { hedefModul: 'istasyonlar', hedefId: 8801 }, idA, 0)), null, 'başka modül aynı numara');

      // Karesiz taslak yayına alınınca eski revizyonun kareleri görünmez.
      b = (await oku(yonetici, `/cizimler/${b.id}`)).json<BelgeAyrintisi>();
      b = (await revizyonEkle(yonetici, b, step())).json<BelgeAyrintisi>();
      const idB = b.revizyonlar.find((r) => r.harf === 'B')?.id;
      const yayin = await gonder(yonetici, `/cizimler/${b.id}/revizyonlar/${idB}/yayinla`, { surum: b.surum });
      assert.equal(yayin.statusCode, 200, yayin.body);
      assert.equal(await vt().tx((db) => yayindakiOnizleme(db, hedef)), null, 'yeni yayındaki revizyonun karesi yok');
      assert.equal(await vt().tx((db) => yayindakiOnizlemeKaresi(db, hedef, idA, 0)), null, 'revizyon artık yayında değil');
    });

    test('disari: birden çok 3B model bağlıysa karesi olan ilk bağlanan belge seçilir; karesiz ve arşivdeki belge atlanır', async () => {
      const kullanici = { id: yonetici.id, ad: 'deneme', islemler: [] };
      const hedef = { hedefModul: 'malzemeler', hedefId: 8810 } as const;
      const karesiz = await yayindaModel('Karesiz model');
      const ilk = await yayindaModel('İlk model');
      const ikinci = await yayindaModel('İkinci model');
      for (const m of [ilk, ikinci]) assert.equal((await onizlemeGonder(yonetici, m, [png()])).statusCode, 200);
      await vt().tx(async (db) => {
        await kaydaBagla(db, kullanici, karesiz.id, hedef.hedefModul, hedef.hedefId);
        await kaydaBagla(db, kullanici, ikinci.id, hedef.hedefModul, hedef.hedefId);
      });
      await new Promise((coz) => setTimeout(coz, 5));
      await vt().tx((db) => kaydaBagla(db, kullanici, ilk.id, hedef.hedefModul, hedef.hedefId));
      assert.equal((await vt().tx((db) => yayindakiOnizleme(db, hedef)))?.belgeId, ikinci.id, 'bağ eklenme sırası: ikinci önce bağlandı');

      const arsiv = (await oku(yonetici, `/cizimler/${ikinci.id}`)).json<BelgeAyrintisi>();
      assert.equal((await gonder(yonetici, `/cizimler/${ikinci.id}/arsivle`, { surum: arsiv.surum })).statusCode, 200);
      assert.equal((await vt().tx((db) => yayindakiOnizleme(db, hedef)))?.belgeId, ilk.id, 'arşivdeki atlanır');
    });

    test('veritabanı: kare 0..15 aralığında, revizyon ve dosya var olmalı; geçerli satır kabul edilir', async () => {
      const b = await yayindaModel('Kısıt modeli');
      const id = b.revizyonlar[0]?.id ?? 0;
      const ozet = await yukle(yonetici, png());
      const ekle = (revizyon: number, kare: number, o: string) =>
        vt().tx((db) => db.sorgu('INSERT INTO cizimler_onizleme (revizyon_id, kare, ozet, kisi_id) VALUES ($1, $2, $3, $4)', [revizyon, kare, o, yonetici.id]));
      await assert.rejects(ekle(id, 16, ozet), /cizimler_onizleme_kare_araligi/);
      await assert.rejects(ekle(id, -1, ozet), /cizimler_onizleme_kare_araligi/);
      await assert.rejects(ekle(2_000_000_000, 0, ozet), /cizimler_onizleme_revizyon_fk/);
      await assert.rejects(ekle(id, 0, 'a'.repeat(64)), /cizimler_onizleme_ozet_fk/);
      await ekle(id, 15, ozet);
      await assert.rejects(ekle(id, 15, ozet), /cizimler_onizleme_pkey/);
      assert.equal(await kareSayisi(id), 1);
    });
  });

  describe('kart #688 malzeme kartından belge ve küçük resim', () => {
    const png = (boy = 1500): Buffer => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(boy - 8)]);
    const jpeg = (boy = 1500): Buffer => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(boy - 4)]);
    let malzemeci: Oturum;
    let kartSirasi = 0;

    before(async () => {
      malzemeci = await girisYap('satin_alma', yonetici.id);
      const islemler = await vt().sorgu<{ islem: string }>(
        "SELECT ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE r.kod = 'satin_alma' AND ri.islem LIKE ANY (ARRAY['cizimler.%', 'malzemeler.yaz'])");
      assert.deepEqual(islemler.map((i) => i.islem), ['malzemeler.yaz'], 'deneme rolü merkezde yazamaz, malzemede yazar');
      await ortam?.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('YM-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    });

    // Sentetik yarı mamul kartı: teknik resim no ve revizyon `kayit.g` içinde (malzeme ekranının yazdığı yer).
    async function kartAc(g: { resim?: string; rev?: string } = {}): Promise<number> {
      kartSirasi += 1;
      const kimlik = `cz688-${kartSirasi}-${randomUUID().slice(0, 8)}`;
      const satir = await ortam?.sahip.tek<{ no: number }>(
        `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
         VALUES ($1, 'yarimamul', 'YM-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
        [kimlik, 5000 + kartSirasi, JSON.stringify({ id: kimlik, g: { ad: `Deneme parça ${kartSirasi}`, ...g }, com: { birim: 'adet' } }), yonetici.id]);
      assert.ok(satir);
      return satir.no;
    }

    async function malzemeBelgesiEkle(o: Oturum, no: number, tur: string, icerik: Buffer, ek: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
      const ozet = await yukle(o, icerik);
      return gonder(o, `/cizimler/malzemeler/${no}/belge-ekle`, { ad: `Deneme ${tur}`, tur, ozet, dosyaAdi: 'deneme.dosya', ...ek });
    }

    async function kareYaz(o: Oturum, no: number, belgeId: number, revizyonId: number, kareler: Buffer[]): Promise<LightMyRequestResponse> {
      const govde: { kare: number; ozet: string }[] = [];
      for (const [kare, icerik] of kareler.entries()) govde.push({ kare, ozet: await yukle(o, icerik) });
      return gonder(o, `/cizimler/malzemeler/${no}/belgeler/${belgeId}/revizyonlar/${revizyonId}/onizleme`, { kareler: govde });
    }

    test('malzeme yazan foto açar (yayında) ve teknik resim açar (taslak); malzeme yazmayan 403 alır ve belge açılmaz', async () => {
      const no = await kartAc();
      const once = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM cizimler_belge');
      const ret = await malzemeBelgesiEkle(operator, no, 'fotograf', png());
      assert.equal(ret.statusCode, 403, ret.body);
      assert.deepEqual(await vt().tek('SELECT count(*)::int AS n FROM cizimler_belge'), once);

      let c = await malzemeBelgesiEkle(malzemeci, no, 'fotograf', jpeg(), { resimNo: ' TR-9 ', antetRev: '00' });
      assert.equal(c.statusCode, 200, c.body);
      let cevap = c.json<MalzemeBelgeleriCevabi>();
      assert.equal(cevap.belgeler.length, 1);
      assert.deepEqual([cevap.belgeler[0]?.tur, cevap.belgeler[0]?.resimNo, cevap.belgeler[0]?.revizyonlar[0]?.durum, cevap.belgeler[0]?.revizyonlar[0]?.antetRev],
        ['fotograf', 'TR-9', 'yayinda', '00']);

      c = await malzemeBelgesiEkle(malzemeci, no, 'teknik-resim', pdf());
      assert.equal(c.statusCode, 200, c.body);
      cevap = c.json<MalzemeBelgeleriCevabi>();
      assert.equal(cevap.belgeler.find((b) => b.tur === 'teknik-resim')?.revizyonlar[0]?.durum, 'taslak', 'çizim taslak girer; yayını merkez yapar');

      assert.equal((await malzemeBelgesiEkle(malzemeci, 2_000_000_000, 'fotograf', png())).statusCode, 404, 'olmayan kart');
      assert.equal((await malzemeBelgesiEkle(malzemeci, no, 'sertifika', pdf())).statusCode, 400, 'karttan yalnız foto, teknik resim, 3B model');
      assert.equal((await malzemeBelgesiEkle(malzemeci, no, 'fotograf', pdf())).statusCode, 400, 'foto belgesine PDF girmez');
    });

    test('malzeme yazan merkezde yazamaz ve başka kartın belgesine dokunamaz; okuma ucu kart kapsamındadır', async () => {
      const no = await kartAc();
      const baskaNo = await kartAc();
      const baska = (await malzemeBelgesiEkle(yonetici, baskaNo, 'fotograf', png())).json<MalzemeBelgeleriCevabi>().belgeler[0];
      assert.ok(baska);
      const merkez = await belgeAc(yonetici, 'teknik-resim', pdf(), 'Merkez belgesi');

      assert.equal((await gonder(malzemeci, '/cizimler', { ad: 'X', tur: 'fotograf', ozet: await yukle(malzemeci, png()), dosyaAdi: 'x.png' })).statusCode, 403);
      assert.equal((await gonder(malzemeci, `/cizimler/${merkez.id}/revizyon-ekle`, { ozet: await yukle(malzemeci, pdf()), dosyaAdi: 'x', surum: merkez.surum })).statusCode, 403);
      const r = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${baska.id}/revizyon-ekle`, { ozet: await yukle(malzemeci, png()), dosyaAdi: 'x', surum: baska.surum });
      assert.equal(r.statusCode, 404, r.body);
      assert.equal((await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${baska.id}/kapak`, { surum: baska.surum })).statusCode, 404);
      assert.equal((await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${merkez.id}/bagla`, { surum: merkez.surum })).statusCode, 404, 'öneri olmayan belge bağlanmaz');

      assert.equal((await oku(malzemeci, `/cizimler/malzemeler/${baskaNo}/belgeler`)).statusCode, 200);
      assert.equal((await oku(operator, `/cizimler/malzemeler/${baskaNo}/belgeler`)).statusCode, 403, 'yalnız sayfa.malzemeler okuyamaz');
    });

    test('foto belgesine yeni revizyon yayına girer; teknik resme yeni revizyon taslak kalır; sürüm denetlenir', async () => {
      const no = await kartAc();
      let foto = (await malzemeBelgesiEkle(malzemeci, no, 'fotograf', png())).json<MalzemeBelgeleriCevabi>().belgeler[0];
      assert.ok(foto);
      const eskiSurum = foto.surum;
      let c = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${foto.id}/revizyon-ekle`, { ozet: await yukle(malzemeci, png()), dosyaAdi: 'b.png', antetRev: 'B', surum: foto.surum });
      assert.equal(c.statusCode, 200, c.body);
      foto = c.json<MalzemeBelgeleriCevabi>().belgeler.find((b) => b.id === foto?.id);
      assert.deepEqual(foto?.revizyonlar.map((r) => [r.harf, r.durum, r.antetRev]), [['B', 'yayinda', 'B'], ['A', 'eski', null]]);
      c = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${foto?.id}/revizyon-ekle`, { ozet: await yukle(malzemeci, png()), dosyaAdi: 'c.png', surum: eskiSurum });
      assert.equal(c.statusCode, 409, c.body);

      let resim = (await malzemeBelgesiEkle(malzemeci, no, 'teknik-resim', pdf())).json<MalzemeBelgeleriCevabi>().belgeler.find((b) => b.tur === 'teknik-resim');
      c = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${resim?.id}/revizyon-ekle`, { ozet: await yukle(malzemeci, pdf()), dosyaAdi: 'b.pdf', surum: resim?.surum });
      assert.equal(c.statusCode, 200, c.body);
      resim = c.json<MalzemeBelgeleriCevabi>().belgeler.find((b) => b.id === resim?.id);
      assert.deepEqual(resim?.revizyonlar.map((r) => r.durum), ['taslak', 'taslak']);
    });

    test('kapak: taslak belge kapak olamaz; kayıt başına tek kapak; kapak küçük resmi belirler', async () => {
      const no = await kartAc();
      const foto = (await malzemeBelgesiEkle(malzemeci, no, 'fotograf', png())).json<MalzemeBelgeleriCevabi>().belgeler[0];
      const ikinci = (await malzemeBelgesiEkle(malzemeci, no, 'fotograf', png())).json<MalzemeBelgeleriCevabi>().belgeler.find((b) => b.id !== foto?.id);
      const resim = (await malzemeBelgesiEkle(malzemeci, no, 'teknik-resim', pdf())).json<MalzemeBelgeleriCevabi>().belgeler.find((b) => b.tur === 'teknik-resim');
      assert.ok(foto && ikinci && resim);
      for (const b of [foto, ikinci]) assert.equal((await kareYaz(malzemeci, no, b.id, b.revizyonlar[0]?.id ?? 0, [png()])).statusCode, 200);

      let c = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${resim.id}/kapak`, { surum: resim.surum });
      assert.equal(c.statusCode, 409, c.body);
      assert.equal(c.json().mesaj, 'Yayına girmiş revizyonu olmayan belge kapak olamaz.');

      let cevap = (await oku(malzemeci, `/cizimler/malzemeler/${no}/belgeler`)).json<MalzemeBelgeleriCevabi>();
      assert.equal(cevap.kucukResim?.belgeId, foto.id, 'kapak yokken ilk bağlanan foto');
      const ikinciGuncel = cevap.belgeler.find((b) => b.id === ikinci.id);
      c = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${ikinci.id}/kapak`, { surum: ikinciGuncel?.surum });
      assert.equal(c.statusCode, 200, c.body);
      cevap = c.json<MalzemeBelgeleriCevabi>();
      assert.deepEqual(cevap.belgeler.filter((b) => b.kapak).map((b) => b.id), [ikinci.id]);
      assert.equal(cevap.kucukResim?.belgeId, ikinci.id);
      const ilkGuncel = cevap.belgeler.find((b) => b.id === foto.id);
      cevap = (await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${foto.id}/kapak`, { surum: ilkGuncel?.surum })).json<MalzemeBelgeleriCevabi>();
      assert.deepEqual(cevap.belgeler.filter((b) => b.kapak).map((b) => b.id), [foto.id], 'eski kapak kalkar');

      await assert.rejects(vt().tx((db) => db.sorgu("UPDATE cizimler_bag SET kapak = true WHERE hedef_modul = 'malzemeler' AND hedef_id = $1", [no])), /cizimler_bag_tek_kapak/);
    });

    test('öneri: teknik resim numarası karta uyan bağsız belge önerilir ve malzeme yazan bağlar', async () => {
      const no = await kartAc({ resim: 'TR-688-1', rev: 'A' });
      const uyan = await belgeAc(yonetici, 'teknik-resim', pdf(), 'Uyan resim');
      const g = await gonder(yonetici, `/cizimler/${uyan.id}/guncelle`, { ad: uyan.ad, resimNo: 'tr-688-1', surum: uyan.surum });
      assert.equal(g.statusCode, 200, g.body);
      await belgeAc(yonetici, 'teknik-resim', pdf(), 'Uymayan resim');
      let cevap = (await oku(malzemeci, `/cizimler/malzemeler/${no}/belgeler`)).json<MalzemeBelgeleriCevabi>();
      assert.deepEqual(cevap.oneriler.map((o) => o.id), [uyan.id]);
      const c = await gonder(malzemeci, `/cizimler/malzemeler/${no}/belgeler/${uyan.id}/bagla`, { surum: cevap.oneriler[0]?.surum });
      assert.equal(c.statusCode, 200, c.body);
      cevap = c.json<MalzemeBelgeleriCevabi>();
      assert.deepEqual(cevap.belgeler.map((b) => b.id), [uyan.id]);
      assert.deepEqual(cevap.oneriler, []);
    });

    test('küçük resim: oturum açan herkes toplu okur; revizyon uyumu kartla karşılaştırılır; kare yalnız bağlı ve yayına girmiş revizyondan', async () => {
      const uyumlu = await kartAc({ resim: 'TR-77', rev: 'B' });
      const uyumsuz = await kartAc({ resim: 'TR-77', rev: 'C' });
      const revsiz = await kartAc();
      const resimsiz = await kartAc();
      const kareler = [png(), png()];
      const ilk = (await malzemeBelgesiEkle(malzemeci, uyumlu, 'fotograf', png(), { resimNo: 'TR-77', antetRev: 'A' })).json<MalzemeBelgeleriCevabi>().belgeler[0];
      assert.ok(ilk);
      const ikinci = (await gonder(malzemeci, `/cizimler/malzemeler/${uyumlu}/belgeler/${ilk.id}/revizyon-ekle`, { ozet: await yukle(malzemeci, png()), dosyaAdi: 'b.png', antetRev: 'B', surum: ilk.surum })).json<MalzemeBelgeleriCevabi>().belgeler[0];
      const revB = ikinci?.revizyonlar.find((r) => r.antetRev === 'B');
      const revA = ikinci?.revizyonlar.find((r) => r.antetRev === 'A');
      assert.ok(revA && revB);
      assert.equal((await kareYaz(malzemeci, uyumlu, ilk.id, revB.id, kareler)).statusCode, 200);
      for (const no of [uyumsuz, revsiz]) {
        const b = (await malzemeBelgesiEkle(malzemeci, no, 'fotograf', png(), { resimNo: 'TR-77', antetRev: 'B' })).json<MalzemeBelgeleriCevabi>().belgeler[0];
        assert.equal((await kareYaz(malzemeci, no, b?.id ?? 0, b?.revizyonlar[0]?.id ?? 0, [png()])).statusCode, 200);
      }

      const c = await oku(operator, `/cizimler/kucuk-resimler?hedefModul=malzemeler&idler=${uyumlu},${uyumsuz},${revsiz},${resimsiz}`);
      assert.equal(c.statusCode, 200, c.body);
      const resimler = new Map(c.json<KucukResimlerCevabi>().resimler.map((r) => [r.hedefId, r]));
      assert.deepEqual([resimler.get(uyumlu)?.revizyonId, resimler.get(uyumlu)?.revUyumu, resimler.get(uyumlu)?.kareSayisi], [revB.id, true, 2]);
      assert.equal(resimler.get(uyumsuz)?.revUyumu, false);
      assert.equal(resimler.get(revsiz)?.revUyumu, null);
      assert.equal(resimler.has(resimsiz), false);

      const kare = await oku(operator, `/cizimler/kucuk-resim/${revB.id}/1`);
      assert.equal(kare.statusCode, 200);
      assert.equal(kare.headers['content-type'], 'image/png');
      assert.deepEqual(kare.rawPayload, kareler[1]);
      assert.equal((await app.inject({ method: 'GET', url: `/api/cizimler/kucuk-resim/${revB.id}/1` })).statusCode, 401, 'oturumsuz okunmaz');

      const taslak = (await malzemeBelgesiEkle(malzemeci, resimsiz, 'teknik-resim', pdf())).json<MalzemeBelgeleriCevabi>().belgeler[0];
      await vt().tx((db) => db.sorgu('INSERT INTO cizimler_onizleme (revizyon_id, kare, ozet, kisi_id) VALUES ($1, 0, $2, $3)',
        [taslak?.revizyonlar[0]?.id, ozetOf(kareler[0] as Buffer), yonetici.id]));
      assert.equal((await oku(operator, `/cizimler/kucuk-resim/${taslak?.revizyonlar[0]?.id}/0`)).statusCode, 404, 'taslağın karesi verilmez');

      const bagsiz = await belgeAc(yonetici, '3b-model', step(), 'Bağsız model');
      const yayin = (await gonder(yonetici, `/cizimler/${bagsiz.id}/revizyonlar/${bagsiz.revizyonlar[0]?.id}/yayinla`, { surum: bagsiz.surum })).json<BelgeAyrintisi>();
      const ozet = await yukle(yonetici, png());
      assert.equal((await gonder(yonetici, `/cizimler/${yayin.id}/revizyonlar/${yayin.revizyonlar[0]?.id}/onizleme`, { kareler: [{ kare: 0, ozet }] })).statusCode, 200);
      assert.equal((await oku(operator, `/cizimler/kucuk-resim/${yayin.revizyonlar[0]?.id}/0`)).statusCode, 404, 'hiçbir kayda bağlı olmayan belge');

      assert.equal((await oku(operator, '/cizimler/kucuk-resimler?hedefModul=malzemeler&idler=0')).statusCode, 400);
      const cok = Array.from({ length: 201 }, (_, i) => i + 1).join(',');
      assert.equal((await oku(operator, `/cizimler/kucuk-resimler?hedefModul=malzemeler&idler=${cok}`)).statusCode, 400);

      const disari = await vt().tx((db) => kayitlarinKucukResimleri(db, 'malzemeler', [uyumlu, resimsiz]));
      assert.deepEqual([...disari.keys()], [uyumlu]);
    });

    test('malzeme yazan yalnız kartına bağlı belgenin yayındaki revizyonuna kare yazar', async () => {
      const no = await kartAc();
      const baskaNo = await kartAc();
      const foto = (await malzemeBelgesiEkle(malzemeci, baskaNo, 'fotograf', png())).json<MalzemeBelgeleriCevabi>().belgeler[0];
      assert.equal((await kareYaz(malzemeci, no, foto?.id ?? 0, foto?.revizyonlar[0]?.id ?? 0, [png()])).statusCode, 404);
      assert.equal((await kareYaz(operator, baskaNo, foto?.id ?? 0, foto?.revizyonlar[0]?.id ?? 0, [png()])).statusCode, 403);
      const resim = (await malzemeBelgesiEkle(malzemeci, no, 'teknik-resim', pdf())).json<MalzemeBelgeleriCevabi>().belgeler[0];
      assert.equal((await kareYaz(malzemeci, no, resim?.id ?? 0, resim?.revizyonlar[0]?.id ?? 0, [png()])).statusCode, 409, 'taslağa kare yazılmaz');
    });
  });
});
