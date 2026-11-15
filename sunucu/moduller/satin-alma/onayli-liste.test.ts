import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KmOnayliListeSatiri } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { onayliListeCozucusu } from './disari.ts';
import { onayliListeCozucusuKaydet } from './servis.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';

// 3279 a: onaylı liste yalnız okur; Kalite parçası kablolamadan gelir (burada sahte çözücü). Kalite bağlı değilse kimse onaylı sayılmaz.
describe('satin-alma onaylı tedarikçi listesi (3279 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerezOkur = '';
  let cerezTalep = '';
  const f = { ted: 0, kaliteli: 0 };
  let malzemeNo = 0;

  const giris = async (k: string): Promise<string> => {
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: k, parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    return String(r.headers['set-cookie']).split(';')[0] ?? '';
  };
  const kisiKur = async (kullaniciAdi: string, islemler: readonly string[]): Promise<string> => {
    const sahip = ortam!.sahip;
    const yoneticiRolu = (await sahip.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!;
    const gecici = (await sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`gecici_${kullaniciAdi}`, kullaniciAdi]))!;
    for (const islem of islemler) await sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [gecici.id, islem]);
    await ortam!.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, gecici.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
    });
    return giris(kullaniciAdi);
  };
  const liste = async (cerez = cerezOkur): Promise<OnayliListeCevabi> => {
    const r = await app.inject({ method: 'GET', url: '/api/satin-alma-onayli-liste', headers: { cookie: cerez } });
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };
  const firma = async (ad: string): Promise<number> =>
    (await ortam!.sahip.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, aktif, olusturan_id) VALUES ($1, 'tedarikci', true, $2) RETURNING id",
      [ad, yoneticiId]))!.id;
  const kaliteSatiri = (k: Partial<KmOnayliListeSatiri>): KmOnayliListeSatiri => ({
    durum: 'Onaylı', firmaAskida: null, adIleEslendi: false, kritiklik: null, sertifikalar: [], sertifikaBitisi: null, sonDenetim: null, kategoriler: [], ...k,
  });

  before(async () => {
    ortam = await testVeritabaniKur('satin_alma_onayli_liste');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    cerezOkur = await kisiKur('okur', ['satin-alma.oku']);
    cerezTalep = await kisiKur('talep', ['satin-alma.talep-ac']);
    f.ted = await firma('Deneme Tedarik');
    f.kaliteli = await firma('Deneme Kaliteli');
    await ortam.sahip.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [f.ted]);
    const cerezYonetici = await giris('yonetici');
    const ayar = await app.inject({
      method: 'POST', url: '/api/malzeme-katalogu-ayarlari/genel/kaydet', headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() }, payload: { deger: { onayAkisi: false } },
    });
    assert.equal(ayar.statusCode, 200, ayar.body);
    const kart = await app.inject({
      method: 'POST', url: '/api/malzeme-katalogu-kartlari/ol-kart-1/kaydet', headers: { cookie: cerezYonetici, 'istek-kimligi': crypto.randomUUID() },
      payload: {
        kayit: { id: 'ol-kart-1', tur: 'hammadde', fam: 'metal', grade: 'S235', form: 'cubuk', dims: { d: 20, l: 1000 }, com: { kod: 'HM-SAT-00001', ad: 'Deneme mil', birim: 'adet' }, onay: { durum: 'aktif' } },
        ozet: { benzersiz_anahtar: 'hammadde|onayli-liste|ol-kart-1', mukerrer_gerekcesi: null }, surum: null,
      },
    });
    assert.equal(kart.statusCode, 200, kart.body);
    malzemeNo = (await ortam.sahip.tek<{ no: number }>("SELECT no FROM malzeme_katalog_karti WHERE kimlik = 'ol-kart-1'"))!.no;
    await ortam.sahip.sorgu("INSERT INTO satin_alma_katalog (id, kategori, ozellik, notlar, malzeme_no) VALUES ($1, 'Hammadde', '', '', $2)", [crypto.randomUUID(), malzemeNo]);
  });
  after(async () => {
    onayliListeCozucusuKaydet(null);
    await app?.close();
    await ortam?.kaldir();
  });

  test('yetki: Satın Alma ekranını gören görür (yeni işlem yok); yalnız talep açan 403, kimliksiz 401', async () => {
    const u = uclar.find((x) => x.yol === '/satin-alma-onayli-liste')!;
    assert.deepEqual(u.yetki, { biri: ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.onayla', 'satin-alma.ayar'] });
    const r = await app.inject({ method: 'GET', url: '/api/satin-alma-onayli-liste', headers: { cookie: cerezTalep } });
    assert.equal(r.statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/satin-alma-onayli-liste' })).statusCode, 401);
  });

  test('Kalite bağlı değilse kaliteBagli false; firma yine listede, Kalite satırı yok (kimse onaylı sayılmaz)', async () => {
    onayliListeCozucusuKaydet(null);
    const l = await liste();
    assert.equal(l.kaliteBagli, false);
    assert.deepEqual(l.firmalar.map((x) => [x.firmaId, x.kalite]), [[f.ted, null]]);
  });

  test('Kalite bağlı ve kaydı yoksa: satın alma tedarikçisi Kalite kaydı yok (null) gelir; kategori eşlemesi kartın (tür, kod) anahtarı', async () => {
    onayliListeCozucusu(async () => new Map());
    const l = await liste();
    assert.equal(l.kaliteBagli, true);
    assert.deepEqual(l.firmalar, [{ firmaId: f.ted, ad: 'Deneme Tedarik', satinAlmaTedarikcisi: true, kalite: null, sonYil: { siparis: 0, teslim: 0, zamanindaYuzde: null, yetersizVeri: true } }]);
    assert.deepEqual(l.malzemeKategorileri, [{ malzemeNo, tur: 'hammadde', kod: 'metal' }]);
    assert.ok(l.kategoriler.some((k) => k.tur === 'hammadde' && k.kod === 'metal'));
  });

  test('Son 12 ay: firmanın son 12 ayda verilen siparişleri sayılır; 12 aydan eski, iptal talepli ve gelecek tarihli sayılmaz', async () => {
    const s = ortam!.sahip;
    const bugun = tesisGunu(Date.now());
    const gun = async (fark: string) => (await s.tek<{ g: string }>(`SELECT to_char(($1::date + $2::interval)::date, 'YYYY-MM-DD') AS g`, [bugun, fark]))!.g;
    let sira = 9000;
    const siparis = async (tarih: string, durum = 'siparis_verildi') => {
      sira += 1;
      const talep = crypto.randomUUID();
      const teklif = crypto.randomUUID();
      await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum, iptal_nedeni) VALUES ($1, 2026, $2, 'Deneme talep', $3, $3, $4, $5)",
        [talep, sira, yoneticiId, durum, durum === 'iptal' ? 'Deneme iptal' : '']);
      await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, tedarikci_adi, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, 'Deneme tedarik', $4, 'TRY')", [talep, teklif, f.ted, tarih]);
      await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, $3)", [talep, teklif, tarih]);
      await s.sorgu("INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_no, siparis_tarihi) VALUES ($1, $2, $3, $3, $4)", [talep, teklif, `SA-OL-${sira}`, tarih]);
    };
    await siparis(bugun);
    await siparis(await gun('-12 months'));
    await siparis(await gun('-11 months'));
    await siparis(await gun('-1 month'), 'iptal');
    await siparis(await gun('-13 months'));
    await siparis(await gun('+1 month'));
    onayliListeCozucusuKaydet(null);
    const t = (await liste()).firmalar.find((x) => x.firmaId === f.ted)!;
    assert.equal(t.sonYil.siparis, 2);
    assert.equal(t.sonYil.yetersizVeri, true);
  });

  test('Kalite kaydı olan firma satın alma tedarikçisi olmasa da listede; bilinmeyen firma kimliği atlanır', async () => {
    const satir = kaliteSatiri({ kritiklik: 'Kritik', kategoriler: [{ kategoriTuru: 'hammadde', kategoriKodu: 'metal', durum: 'sartli', aciklama: 'Deneme şart', tarih: '2026-11-01T08:00:00.000Z', kisiAd: 'Deneme Kalite' }] });
    onayliListeCozucusu(async () => new Map([[f.kaliteli, satir], [f.ted, kaliteSatiri({ durum: 'Askıda' })], [2147483000, satir]]));
    const l = await liste();
    assert.deepEqual(l.firmalar.map((x) => [x.ad, x.satinAlmaTedarikcisi, x.kalite?.durum ?? null]), [['Deneme Kaliteli', false, 'Onaylı'], ['Deneme Tedarik', true, 'Askıda']]);
    assert.deepEqual(l.firmalar[0]!.kalite, satir);
  });
});
