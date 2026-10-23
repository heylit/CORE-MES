import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { hammaddeTanimHatasi, kartZorunluAlanEksigi, katalogSunucuAnahtari } from './kurallar.ts';

type Nesne = Record<string, unknown>;
const PAROLA = 'dogru-parola-1';

test('157 a: hammaddede aile ve kalite yeni kartta zorunlu; kayıtlı kartta yalnız alan değişince bakılır, talebin önerdiği kart da denetlenir', () => {
  const hm = (ek: Nesne = {}): Nesne => ({ tur: 'hammadde', fam: 'metal', grade: 'C45', ...ek });
  assert.equal(hammaddeTanimHatasi(null, hm()), null);
  assert.equal(hammaddeTanimHatasi(null, { fam: 'metal', grade: 'C45' }), null, 'türsüz kart hammaddedir');
  assert.deepEqual(hammaddeTanimHatasi(null, hm({ fam: '' })), { alan: 'kayit.fam', mesaj: 'Malzeme ailesini seçin.' });
  assert.deepEqual(hammaddeTanimHatasi(null, hm({ grade: null })), { alan: 'kayit.grade', mesaj: 'Kaliteyi seçin.' });
  assert.deepEqual(hammaddeTanimHatasi(null, hm({ grade: '  ' })), { alan: 'kayit.grade', mesaj: 'Kaliteyi seçin.' });
  // Özel kalite adıyla seçilmiş sayılır (ekranın `grade`).
  assert.deepEqual(hammaddeTanimHatasi(null, hm({ grade: '__ozel', custom: { kod: 'X1' } }))?.alan, 'kayit.grade');
  assert.equal(hammaddeTanimHatasi(null, hm({ grade: '__ozel', custom: { ad: 'Özel kalite' } })), null);
  // Kayıtlı eksik kart, alan değişmedikçe kaydolur; dolu alanı silmek reddedilir.
  const eski = { tur: 'hammadde', fam: 'metal' };
  assert.equal(hammaddeTanimHatasi(eski, { ...eski, com: { ad: 'Yeni ad' } }), null);
  assert.equal(hammaddeTanimHatasi(eski, { ...eski, grade: '' }), null, 'boş metin değişiklik sayılmaz');
  assert.equal(hammaddeTanimHatasi(hm(), hm({ fam: null }))?.alan, 'kayit.fam');
  assert.equal(hammaddeTanimHatasi(hm(), hm({ grade: '__ozel', custom: {} }))?.alan, 'kayit.grade');
  // Başka türden hammaddeye dönen kart yeni kart gibi denetlenir.
  assert.equal(hammaddeTanimHatasi({ tur: 'sarf' }, eski)?.alan, 'kayit.grade');
  assert.equal(hammaddeTanimHatasi(null, { tur: 'sarf' }), null);
  assert.equal(hammaddeTanimHatasi(hm(), { ...hm(), talep: { yeni: hm({ grade: '' }) } })?.alan, 'kayit.grade');
});

test('B11: yerleşik zorunlu alanlar ve kategori; ayar adı dışındaki alanı kapatabilir; kayıtlı kartta yalnız değişen alan, tür ya da kategori değişince yeni kart gibi', () => {
  const kart = (tur: string, g: Nesne): Nesne => ({ tur, g });
  const bak = (tur: string, g: Nesne, kayitli: { kayit: Nesne; tur: string } | null = null, ayar: Nesne | null = null) =>
    kartZorunluAlanEksigi(kayitli, kart(tur, g), tur, ayar);
  assert.equal(bak('yarimamul', { ad: 'Braket', tip: 'Talaşlı işlenmiş parça' }), null);
  assert.deepEqual(bak('yarimamul', { ad: 'Braket' }), { alan: 'kayit.g.tip', mesaj: 'Zorunlu alan boş: parça tipi.' });
  assert.deepEqual(bak('mamul', { ad: '  ' })?.alan, 'kayit.g.ad');
  assert.deepEqual(bak('ticari_mal', {})?.alan, 'kayit.g.ad');
  assert.deepEqual(bak('demirbas', { kat: 'olcu', ad: 'Kumpas' }), { alan: 'kayit.g.alis', mesaj: 'Zorunlu alan boş: alış tarihi.' });
  assert.equal(bak('demirbas', { kat: 'olcu', ad: 'Kumpas', alis: '2026-01-02' }), null);
  // Kategori: sarf, demirbaş ve hizmet kategorisiz kaydolmaz.
  for (const tur of ['sarf', 'demirbas', 'hizmet']) assert.deepEqual(bak(tur, { ad: 'x', alis: '2026-01-02', yon: 'Alınan', cesit: 'Eğitim' }), { alan: 'kayit.g.kat', mesaj: 'Kategori seçin.' }, tur);
  // Sarfın zorunlusu kategoriye göredir; hizmette yön ve çeşit, "Diğer" çeşitte çeşit adı.
  assert.equal(bak('sarf', { kat: 'takim', tur: 'Matkap' }), null);
  assert.equal(bak('sarf', { kat: 'takim' })?.alan, 'kayit.g.tur');
  assert.deepEqual(bak('sarf', { kat: 'kaynak', tur: 'TIG çubuğu' })?.alan, 'kayit.g.sinif');
  assert.equal(bak('sarf', { kat: 'ozel-kategori' }), null, 'ekranın tablosunda olmayan kategoride yerleşik alan yok');
  assert.equal(bak('hizmet', { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' }), null);
  assert.equal(bak('hizmet', { kat: 'fason', yon: 'Alınan' })?.alan, 'kayit.g.cesit');
  assert.equal(bak('hizmet', { kat: 'fason', yon: 'Alınan', cesit: 'Diğer' })?.alan, 'kayit.g.cesitAd');
  // Ayar `zorunlu` false yerleşik alanı kapatır; adı kapatamaz.
  const ayar = { kurallar: { yarimamul: { zorunlu: { tip: false, ad: false } } } };
  assert.equal(bak('yarimamul', { ad: 'Braket' }, null, ayar), null);
  assert.equal(bak('yarimamul', { tip: 'x' }, null, ayar)?.alan, 'kayit.g.ad');
  // Kayıtlı kart: aynı türde aynı kategoriyle duran eksik alan sorulmaz, silinen alan reddedilir.
  const eski = { kayit: kart('yarimamul', { ad: 'Braket' }), tur: 'yarimamul' };
  assert.equal(bak('yarimamul', { ad: 'Braket', not: 'yeni' }, eski), null);
  assert.equal(bak('yarimamul', { tip: 'x' }, eski)?.alan, 'kayit.g.ad');
  const eskiSarf = { kayit: kart('sarf', {}), tur: 'sarf' };
  assert.equal(bak('sarf', {}, eskiSarf), null, 'kuraldan önce kategorisiz kaydolmuş sarf');
  assert.equal(bak('sarf', { kat: 'kaynak', tur: 'TIG çubuğu' }, { kayit: kart('sarf', { kat: 'takim', tur: 'Matkap' }), tur: 'sarf' })?.alan, 'kayit.g.sinif');
  assert.equal(bak('yarimamul', { ad: 'Braket' }, { kayit: kart('mamul', { ad: 'Braket' }), tur: 'mamul' })?.alan, 'kayit.g.tip');
  // Bekleyen talebin önerdiği kart da denetlenir.
  const talepli = { tur: 'mamul', g: { ad: 'Mil' }, talep: { yeni: { tur: 'mamul', g: { ad: '' } } } };
  assert.equal(kartZorunluAlanEksigi({ kayit: { tur: 'mamul', g: { ad: 'Mil' } }, tur: 'mamul' }, talepli, 'mamul', null)?.alan, 'kayit.g.ad');
});

test('B11: benzersiz anahtar ekranın `kartAnahtari` kuralıyla sunucuda kurulur (örnekler ekranın işlevinden); hizmette ekranın anahtarı kalır', () => {
  assert.equal(katalogSunucuAnahtari('hammadde', { fam: 'metal', grade: 'C45', form: 'boru', dims: { D: 48.3, t: 2.6, l: 6000 }, opts: { durum: 'Islah (+QT)', yuzey: '' } }),
    'HM|metal|c45|boru|48.3x2.6x6000|ıslahqt|');
  assert.equal(katalogSunucuAnahtari('hammadde', { fam: 'plastik', grade: '__ozel', custom: { ad: 'Özel PA6 Şerit' }, form: 'levha', dims: { t: 1.23456, w: 1000, l: 2000 }, opts: {} }),
    'HM|plastik|özelpa6şerit|levha|1.235x1000x2000||');
  assert.equal(katalogSunucuAnahtari('sarf', { g: { kat: 'takim', tur: 'Matkap', cap: 'Ø 8,5', marka: 'X', kaplama: ['TiN', 'AlTiN'] } }),
    'SF|takim|[["cap","85"],["kaplama",["AlTiN","TiN"]],["kat","takim"],["tur","matkap"]]');
  assert.equal(katalogSunucuAnahtari('yarimamul', { g: { resim: 'TR-2045 01', rev: 'B' } }), 'YM|R|tr204501|b');
  assert.equal(katalogSunucuAnahtari('mamul', { g: { musteri: 'Müşteri A' } }), 'MM|M|müşteria');
  assert.equal(katalogSunucuAnahtari('ticari_mal', { g: { urunKodu: 'ABC-12 X', marka: 'Deneme' } }), 'TM|deneme|abc12x');
  assert.equal(katalogSunucuAnahtari('demirbas', { g: { plaka: 'DENEME 01' } }), 'DB|P|deneme01');
  // Kurulamayan anahtar null; hizmet undefined (ekranın anahtarı).
  assert.equal(katalogSunucuAnahtari('hammadde', { fam: 'metal', grade: 'C45' }), null);
  assert.equal(katalogSunucuAnahtari('hammadde', { fam: 'metal', form: 'cubuk', dims: { d: 1, l: 1 } }), null);
  assert.equal(katalogSunucuAnahtari('sarf', { g: {} }), null);
  assert.equal(katalogSunucuAnahtari('mamul', { g: {} }), null);
  assert.equal(katalogSunucuAnahtari('hizmet', { g: { kat: 'fason' } }), undefined);
});

describe('B11 ve 157 a: kart kaydı sihirbazın zorunlu adımlarını ve sunucunun anahtarını uygular (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Gövde tamamlanmadan, ekranın göndereceği biçimde doğrudan gider.
  const kaydet = (kimlik: string, kayit: Nesne, surum: number | null = null, anahtar: string | null = `ekran|${kimlik}`) =>
    app.inject({
      method: 'POST', url: `/api/malzeme-katalogu-kartlari/${kimlik}/kaydet`, headers: { cookie: yonetici },
      payload: { kayit: { id: kimlik, com: { kod: 'HM-KRL-00000', ad: `Kural ${kimlik}`, birim: 'adet' }, onay: { durum: 'taslak' }, ...kayit }, ozet: { benzersiz_anahtar: anahtar, mukerrer_gerekcesi: null }, surum },
    });
  const satir = (kimlik: string) => vt().tek<{ kayit: Nesne; surum: number; benzersiz_anahtar: string | null; varsayilan_anahtar: string | null }>(
    'SELECT kayit, surum, benzersiz_anahtar, varsayilan_anahtar FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
  const HM = { tur: 'hammadde', fam: 'metal', grade: 'C45', form: 'cubuk' };

  before(async () => {
    ortam = await testVeritabaniKur('malzemekartkurali');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme kural', kullaniciAdi: 'krl-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'krl-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('ret: ailesiz, kalitesiz ya da ölçüsüz hammadde ve zorunlu alanı ya da kategorisi boş kart 400, kart yazılmaz', async () => {
    for (const [kimlik, kayit, alan] of [
      ['r1', { ...HM, fam: null, dims: { d: 20, l: 100 } }, 'kayit.fam'],
      ['r2', { ...HM, grade: '', dims: { d: 20, l: 100 } }, 'kayit.grade'],
      ['r3', { tur: 'hammadde', fam: 'metal', grade: 'C45' }, 'kayit.dims'],
      ['r4', { tur: 'yarimamul', com: { kod: 'YM-KRL-00000', birim: 'adet' }, g: { ad: 'Braket' } }, 'kayit.g.tip'],
      ['r5', { tur: 'sarf', com: { kod: 'SF-KRL-00000', birim: 'adet' }, g: {} }, 'kayit.g.kat'],
      ['r6', { tur: 'hizmet', com: { kod: 'HZ-FSN-00000', birim: 'saat' }, g: { kat: 'fason', yon: 'Alınan' } }, 'kayit.g.cesit'],
    ] as const) {
      const c = await kaydet(kimlik, kayit);
      assert.equal(c.statusCode, 400, `${kimlik}: ${c.body}`);
      assert.equal((c.json() as { alan: string }).alan, alan, kimlik);
      assert.equal(await satir(kimlik), null, kimlik);
    }
  });

  test('izinli: tam kart kaydolur; anahtar sunucunundur, ekranın gönderdiği okunmaz', async () => {
    const c = await kaydet('i1', { ...HM, dims: { d: 20, l: 3000 } }, null, 'sahte|anahtar');
    assert.equal(c.statusCode, 200, c.body);
    const s = await satir('i1');
    assert.deepEqual([s?.benzersiz_anahtar, s?.varsayilan_anahtar], ['HM|metal|c45|cubuk|20x3000||', 'HM|metal|c45|cubuk|20x3000||']);
  });

  test('ret: aynı malzemeyi farklı ekran anahtarıyla açmak mükerrer denetimini atlatamaz (409); gerekçeyle açılır', async () => {
    const c = await kaydet('m1', { ...HM, dims: { d: 25, l: 3000 } }, null, 'birinci');
    assert.equal(c.statusCode, 200, c.body);
    const ikinci = await kaydet('m2', { ...HM, dims: { d: 25, l: 3000 } }, null, 'baska-bir-anahtar');
    assert.equal(ikinci.statusCode, 409, ikinci.body);
    assert.equal(await satir('m2'), null);
    const bos = await kaydet('m3', { ...HM, dims: { d: 25, l: 3000 } }, null, null);
    assert.equal(bos.statusCode, 409, bos.body);
  });

  test('izinli: hizmette ekranın anahtarı kalır (çeşit tablosu ekranda)', async () => {
    const c = await kaydet('h1', { tur: 'hizmet', com: { kod: 'HZ-FSN-00000', birim: 'saat' }, g: { kat: 'fason', yon: 'Alınan', cesit: 'Talaşlı imalat' } }, null, 'HZ|alinan|fason|talasli');
    assert.equal(c.statusCode, 200, c.body);
    assert.equal((await satir('h1'))?.benzersiz_anahtar, 'HZ|alinan|fason|talasli');
  });

  test('izinli: kuraldan önce eksik kaydolmuş kart değişmeyen alanla kaydolur ve anahtarını korur; eksik alanı değiştirmek denetlenir', async () => {
    assert.equal((await kaydet('e1', { tur: 'yarimamul', com: { kod: 'YM-KRL-00000', birim: 'adet' }, g: { ad: 'Braket', tip: 'Talaşlı işlenmiş parça' } })).statusCode, 200);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{g}', (kayit->'g') - 'tip') WHERE kimlik = 'e1'");
    let s = (await satir('e1'))!;
    const not = await kaydet('e1', { ...s.kayit, com: { ...(s.kayit['com'] as Nesne), not: 'Yalnız not' } }, s.surum);
    assert.equal(not.statusCode, 200, not.body);
    s = (await satir('e1'))!;
    const adsiz = await kaydet('e1', { ...s.kayit, g: {} }, s.surum);
    assert.equal(adsiz.statusCode, 400, adsiz.body);

    assert.equal((await kaydet('e2', { ...HM, dims: { d: 30, l: 3000 } }, null)).statusCode, 200);
    const once = (await satir('e2'))!;
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = kayit - 'form' - 'dims' - 'grade' WHERE kimlik = 'e2'");
    s = (await satir('e2'))!;
    const yeniden = await kaydet('e2', { ...s.kayit, com: { ...(s.kayit['com'] as Nesne), not: 'Yalnız not' } }, s.surum, null);
    assert.equal(yeniden.statusCode, 200, yeniden.body);
    assert.equal((await satir('e2'))?.benzersiz_anahtar, once.benzersiz_anahtar, 'kurulamayan anahtar kayıtlı anahtarı silmez');
    s = (await satir('e2'))!;
    const bosKalite = await kaydet('e2', { ...s.kayit, grade: '' }, s.surum, null);
    assert.equal(bosKalite.statusCode, 200, `boş metin değişiklik sayılmaz: ${bosKalite.body}`);
    s = (await satir('e2'))!;
    const ailesiz = await kaydet('e2', { ...s.kayit, fam: '' }, s.surum, null);
    assert.equal(ailesiz.statusCode, 400, ailesiz.body);
    assert.equal((ailesiz.json() as { alan: string }).alan, 'kayit.fam');
  });
});
