import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AyniDosyaCevabi } from '#paylasilan/sozlesme/dosya.ts';
import type { Klasor, OrtakDosya, YetkiCevabi } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// Aynı dosya uyarısı (kart 3468-1): Ortak Dosyalar ve Çizim Merkezi uçları aynı içeriğin yerlerini verir. İki modülün kaynağı
// kablolamada bağlanır (testi kablolama önyüklemesiyle koşulur). Kişi yalnız gördüğü yeri görür; uyarı yüklemeyi engellemez.

const PAROLA = 'dogru-parola-1';
interface Oturum { cerez: string; id: number }
// Sentetik PDF: imza türü belirler, gerisi rastgele; gerçek belge yok.
const pdf = (): Buffer => Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
const ozetOf = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('aynı dosya uyarısı (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici: Oturum;
  let ikisi: Oturum;
  let yalnizOrtak: Oturum;
  let yalnizCizim: Oturum;
  const rolId = new Map<string, number>();
  let sayac = 0;
  let ortak: Klasor;
  let gizli: Klasor;
  let belgeId: number;
  let dosya: OrtakDosya;
  const icerik = pdf();
  const ozet = ozetOf(icerik);

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function rolAc(kod: string, islemler: readonly string[]): Promise<void> {
    const r = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    assert.ok(r);
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [r.id, i]);
    rolId.set(kod, r.id);
  }

  async function girisYap(rolKodu: string): Promise<Oturum> {
    const kullaniciAdi = `ayni-${(sayac += 1)}`;
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAta(db, yonetici.id, yeni, rolId.get(rolKodu) ?? 0);
      await rolAl(db, yonetici.id, yeni, yon?.id ?? 0);
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (o: Oturum, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: o.cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } });
  const oku = (o: Oturum, yol: string): Promise<LightMyRequestResponse> => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: o.cerez } });

  async function icerikGonder(o: Oturum, b: Buffer): Promise<string> {
    const c = await app.inject({
      method: 'POST', url: `/api/dosyalar/${ozetOf(b)}/parca`, payload: { sira: 0, toplam: 1, veri: b.toString('base64') }, headers: { cookie: o.cerez },
    });
    assert.equal(c.statusCode, 200, c.body);
    return ozetOf(b);
  }

  async function klasorAc(ustId: number | null, ad: string, satirlar: Record<string, 'gorur' | 'ekler'>): Promise<Klasor> {
    const c = await gonder(yonetici, '/ortak-dosyalar/klasorler', { ustId, ad });
    assert.equal(c.statusCode, 200, c.body);
    const k = c.json<Klasor>();
    const once = (await oku(yonetici, `/ortak-dosyalar/klasorler/${k.id}/yetki`)).json<YetkiCevabi>();
    const y = await gonder(yonetici, `/ortak-dosyalar/klasorler/${k.id}/yetki`, {
      surum: once.surum, ozelYetki: true, satirlar: Object.entries(satirlar).map(([kod, duzey]) => ({ rolId: rolId.get(kod) ?? 0, duzey })),
    });
    assert.equal(y.statusCode, 200, y.body);
    return k;
  }

  async function yukle(klasorId: number, ad: string, b: Buffer): Promise<LightMyRequestResponse> {
    return gonder(yonetici, `/ortak-dosyalar/klasorler/${klasorId}/yukle`, { ad, ozet: await icerikGonder(yonetici, b) });
  }

  const yerler = async (o: Oturum, uc: 'cizimler' | 'ortak-dosyalar', oz = ozet): Promise<AyniDosyaCevabi['yerler']> => {
    const c = await oku(o, `/${uc}/ayni-dosya?ozet=${oz}`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<AyniDosyaCevabi>().yerler;
  };

  before(async () => {
    ortam = await testVeritabaniKur('ayni_dosya');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const ilkId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'ayni-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'ayni-yonetici', parola: PAROLA } });
    yonetici = { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id: ilkId };
    await rolAc('deneme_ikisi', ['sayfa.ortak-dosyalar', 'sayfa.cizimler', 'belge-merkezi.yaz']);
    await rolAc('deneme_ortak', ['sayfa.ortak-dosyalar']);
    await rolAc('deneme_cizim', ['sayfa.cizimler']);
    ikisi = await girisYap('deneme_ikisi');
    yalnizOrtak = await girisYap('deneme_ortak');
    yalnizCizim = await girisYap('deneme_cizim');
    ortak = await klasorAc(null, 'ORN-Ortak', { deneme_ikisi: 'gorur', deneme_ortak: 'gorur' });
    gizli = await klasorAc(ortak.id, 'ORN-Gizli', {});
    const d = await yukle(ortak.id, 'ORN-flans.pdf', icerik);
    assert.equal(d.statusCode, 200, d.body);
    dosya = d.json<OrtakDosya>();
    assert.equal((await yukle(gizli.id, 'ORN-gizli.pdf', icerik)).statusCode, 200);
    const b = await gonder(yonetici, '/cizimler', { ad: 'ORN-Flanş 120', tur: 'teknik-resim', ozet, dosyaAdi: 'ORN-flans.pdf', resimNo: 'ORN-TR-1' });
    assert.equal(b.statusCode, 200, b.body);
    belgeId = b.json<{ id: number }>().id;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('AD-1 iki yeri de gören kişi Ortak Dosyalar ve çizim kopyasını alır; görmediği klasördeki kopya ne satırıyla ne sayısıyla gelir', async () => {
    const ortaktan = await yerler(ikisi, 'ortak-dosyalar');
    assert.deepEqual(ortaktan, [
      { kaynak: 'ortak-dosyalar', baslik: 'ORN-Ortak', ayrinti: 'Ortak dosyalar · ORN-flans.pdf · sürüm 1', yol: `/ortak-dosyalar?klasor=${ortak.id}`, durum: 'Son sürüm' },
      { kaynak: 'cizimler', baslik: 'ORN-Flanş 120', ayrinti: 'Çizim merkezi · Rev A · ORN-TR-1', yol: `/cizimler/belge/${belgeId}`, durum: 'Taslak' },
    ]);
    const cizimden = await yerler(ikisi, 'cizimler');
    assert.deepEqual(cizimden.map((y) => y.kaynak), ['cizimler', 'ortak-dosyalar']);
    assert.ok(!JSON.stringify(cizimden).includes('ORN-Gizli'));
  });

  test('AD-2 çizimleri okuyamayan çizim kopyasını görmez ve çizim ucuna giremez; Ortak Dosyalar sayfası olmayan klasör kopyasını görmez', async () => {
    assert.deepEqual((await yerler(yalnizOrtak, 'ortak-dosyalar')).map((y) => y.kaynak), ['ortak-dosyalar']);
    assert.equal((await oku(yalnizOrtak, `/cizimler/ayni-dosya?ozet=${ozet}`)).statusCode, 403);
    assert.ok(!(await yerler(yalnizCizim, 'cizimler')).some((y) => y.kaynak === 'ortak-dosyalar'));
    assert.equal((await oku(yalnizCizim, `/ortak-dosyalar/ayni-dosya?ozet=${ozet}`)).statusCode, 403);
  });

  test('AD-3 bilinmeyen içerik boş döner; bozuk özet 400', async () => {
    assert.deepEqual(await yerler(ikisi, 'ortak-dosyalar', ozetOf(pdf())), []);
    assert.equal((await oku(ikisi, '/ortak-dosyalar/ayni-dosya?ozet=abc')).statusCode, 400);
  });

  test('AD-4 uyarı yüklemeyi engellemez: aynı içerik başka adla yüklenir; yeni sürüm gelince eski sürüm "Eski sürüm" yazar', async () => {
    const ikinci = await yukle(ortak.id, 'ORN-kopya.pdf', icerik);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal((await yukle(ortak.id, 'ORN-flans.pdf', pdf())).statusCode, 200);
    const y = (await yerler(ikisi, 'ortak-dosyalar')).filter((s) => s.kaynak === 'ortak-dosyalar');
    assert.deepEqual(y.map((s) => [s.ayrinti, s.durum]), [
      ['Ortak dosyalar · ORN-flans.pdf · sürüm 1', 'Eski sürüm'],
      ['Ortak dosyalar · ORN-kopya.pdf · sürüm 1', 'Son sürüm'],
    ]);
    assert.ok(dosya.id > 0);
  });

  test('AD-5 arşivdeki dosya ve belge: dosya listelenmez, belge "Arşivde" yazar', async () => {
    const d = await yukle(ortak.id, 'ORN-arsiv.pdf', icerik);
    const od = d.json<OrtakDosya>();
    assert.equal((await gonder(yonetici, `/ortak-dosyalar/klasorler/${ortak.id}/dosyalar/${od.id}/arsivle`, { surum: od.surum })).statusCode, 200);
    assert.ok(!(await yerler(ikisi, 'ortak-dosyalar')).some((s) => s.ayrinti.includes('ORN-arsiv.pdf')));
    const b = (await oku(yonetici, `/cizimler/${belgeId}`)).json<{ surum: number }>();
    const a = await gonder(yonetici, `/cizimler/${belgeId}/arsivle`, { surum: b.surum });
    assert.equal(a.statusCode, 200, a.body);
    assert.equal((await yerler(ikisi, 'cizimler')).find((s) => s.kaynak === 'cizimler')?.durum, 'Arşivde');
  });

  test('AD-6 çizimi yalnız okuyan taslak revizyonu görmez (1885 b); yayına girince görür', async () => {
    const yeni = pdf();
    const yeniOzet = ozetOf(yeni);
    const b = await gonder(yonetici, '/cizimler', { ad: 'ORN-Taslak çizim', tur: 'teknik-resim', ozet: await icerikGonder(yonetici, yeni), dosyaAdi: 'ORN-t.pdf' });
    assert.equal(b.statusCode, 200, b.body);
    const belge = b.json<{ id: number; surum: number; revizyonlar: { id: number }[] }>();
    assert.deepEqual(await yerler(yalnizCizim, 'cizimler', yeniOzet), []);
    assert.deepEqual((await yerler(ikisi, 'cizimler', yeniOzet)).map((y) => y.durum), ['Taslak'], 'yazan taslağı görür');
    const y = await gonder(yonetici, `/cizimler/${belge.id}/revizyonlar/${belge.revizyonlar[0]!.id}/yayinla`, { surum: belge.surum });
    assert.equal(y.statusCode, 200, y.body);
    assert.deepEqual((await yerler(yalnizCizim, 'cizimler', yeniOzet)).map((x) => [x.baslik, x.durum]), [['ORN-Taslak çizim', 'Yayında']]);
  });

  test('AD-7 yayındaki çizim de çizim okuma işlemi olmayana Ortak Dosyalar ucundan görünmez', async () => {
    const yeni = pdf();
    const yeniOzet = ozetOf(yeni);
    assert.equal((await yukle(ortak.id, 'ORN-yayinda.pdf', yeni)).statusCode, 200);
    const b = await gonder(yonetici, '/cizimler', { ad: 'ORN-Yayında çizim', tur: 'teknik-resim', ozet: yeniOzet, dosyaAdi: 'ORN-y.pdf' });
    assert.equal(b.statusCode, 200, b.body);
    const belge = b.json<{ id: number; surum: number; revizyonlar: { id: number }[] }>();
    const y = await gonder(yonetici, `/cizimler/${belge.id}/revizyonlar/${belge.revizyonlar[0]!.id}/yayinla`, { surum: belge.surum });
    assert.equal(y.statusCode, 200, y.body);
    assert.deepEqual((await yerler(ikisi, 'ortak-dosyalar', yeniOzet)).map((x) => x.kaynak).sort(), ['cizimler', 'ortak-dosyalar']);
    assert.deepEqual((await yerler(yalnizOrtak, 'ortak-dosyalar', yeniOzet)).map((x) => x.kaynak), ['ortak-dosyalar']);
  });
});
