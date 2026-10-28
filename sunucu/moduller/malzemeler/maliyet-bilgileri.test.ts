import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kullanilanKaliteler, malzemeMaliyetBilgileri, malzemeSatinAlmaAyrintilari } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Kg fiyatı için kalite, form ve stok birimi (satın alma isteği 19.10.2026, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  // Hammadde kaydı ekranın ölçü kuralından geçer (UYUM-BORCU 4); form verilen kartta geçerli ölçü de gönderilir.
  const OLCU = { cubuk: { d: 50, l: 6000 }, levha: { t: 2, w: 1000, l: 2000 }, boru: { D: 48.3, t: 2.6, l: 6000 } };
  let sira = 0;
  // Kart onay akışı kapalıyken doğrudan istenen durumda kaydolur; dönen sayı kartın no'su.
  const kaydet = async (ek: Record<string, unknown>, durum = 'aktif', tur = 'hammadde', ozetEki: Record<string, unknown> = {}): Promise<number> => {
    sira += 1;
    const kimlik = `mb${sira}`;
    const onek = { hammadde: 'HM-MLB', sarf: 'SF-MLB', mamul: 'MM-MLB', yarimamul: 'YM-MLB' }[tur] ?? 'HM-MLB';
    // Boy sıradan: aynı kalite ve formlu kartlar ayrı malzemedir (sunucunun benzersiz anahtarı, B11).
    const dims = ek['dims'] !== null && typeof ek['dims'] === 'object' ? { dims: { ...(ek['dims'] as object), l: 1000 + sira } } : {};
    const { com, ...geri } = ek as { com?: object };
    const kayit = { id: kimlik, tur, fam: 'metal', com: { kod: `${onek}-0000${sira}`, birim: 'adet', ...com }, onay: { durum }, ...geri, ...dims };
    await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit, ozet: { benzersiz_anahtar: `${tur}|mb|${kimlik}`, mukerrer_gerekcesi: null, ...ozetEki }, surum: null,
    });
    return (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  };
  // Kayıtlı kartı aynı içerikle, verilen özet ekiyle yeniden kaydeder.
  const yenidenKaydet = async (no: number, ozetEki: Record<string, unknown>): Promise<void> => {
    const r = (await vt().tek<{ kimlik: string; tur: string; kayit: Record<string, unknown>; surum: number }>('SELECT kimlik, tur, kayit, surum FROM malzeme_katalog_karti WHERE no = $1', [no]))!;
    await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${r.kimlik}/kaydet`, {
      kayit: r.kayit, ozet: { benzersiz_anahtar: `${r.tur}|mb|${r.kimlik}`, mukerrer_gerekcesi: null, ...ozetEki }, surum: r.surum,
    });
  };

  before(async () => {
    ortam = await testVeritabaniKur('malzememaliyet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme maliyet', kullaniciAdi: 'mb-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'mb-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('1104 a: satın almanın kart ayrıntısı: kalite, standartlar, tolerans, durum, yüzey, sertifikalar, en az sipariş; boş metin null, olmayan kart yok', async () => {
    const hm = await kaydet({
      grade: 'S235JR', form: 'cubuk', dims: OLCU.cubuk, stds: ['EN 10025-2', ' '], tol: 'h9', opts: { durum: 'Normalize', yuzey: ' ' },
      com: { std: 'EN 10025-2', sertifika: ['EN 10204 3.1', ''], moq: 25, ted: 'Deneme Tedarik', not: 'Deneme not' },
    }, 'aktif', 'hammadde', { kalite_adi: 'S235JR (1.0038)', form_adi: 'Yuvarlak çubuk', aciklama_1: 'Ø50', aciklama_2: ' ' });
    const sarf = await kaydet({ g: { urunKodu: 'DNM-123', mensei: 'TR', gtip: '8207' }, com: { moq: 0 } }, 'aktif', 'sarf');
    const m = await vt().tx((db) => malzemeSatinAlmaAyrintilari(db, [hm, sarf, hm, 2147483000]));
    assert.deepEqual([...m.keys()].sort((a, b) => a - b), [hm, sarf].sort((a, b) => a - b));
    const { surum, ...a } = m.get(hm)!;
    assert.ok(surum >= 1);
    assert.deepEqual(a, {
      tur: 'hammadde', kaliteAdi: 'S235JR (1.0038)', formAdi: 'Yuvarlak çubuk', aciklamalar: ['Ø50'], standartlar: ['EN 10025-2'], tolerans: 'h9',
      durum: 'Normalize', yuzey: null, sertifikalar: ['EN 10204 3.1'], ureticiUrunKodu: null, mensei: null, gtip: null, enAzSiparis: '25',
      tercihTedarikci: 'Deneme Tedarik', not: 'Deneme not',
    });
    const b = m.get(sarf)!;
    assert.deepEqual([b.kaliteAdi, b.ureticiUrunKodu, b.mensei, b.gtip, b.enAzSiparis, b.sertifikalar, b.standartlar], [null, 'DNM-123', 'TR', '8207', null, [], []]);
    assert.equal((await vt().tx((db) => malzemeSatinAlmaAyrintilari(db, []))).size, 0);
  });

  test('kalite (hazır ya da özel), aile, form ve stok birimi karttan; hammadde dışında kalite ve form yok; birim ağırlık null; olmayan kart haritada yok', async () => {
    const hazir = await kaydet({ grade: 'S235JR', form: 'cubuk', dims: OLCU.cubuk });
    const ozel = await kaydet({ grade: '__ozel', custom: { kod: 'ORNEK-K1', ad: 'Örnek kalite' }, form: 'levha', dims: OLCU.levha });
    const ozelAdli = await kaydet({ grade: '__ozel', custom: { kod: ' ', ad: 'Örnek ad' }, form: 'boru', dims: OLCU.boru });
    const sarf = await kaydet({ grade: 'S235JR', form: 'cubuk' }, 'aktif', 'sarf');
    const m = await vt().tx((db) => malzemeMaliyetBilgileri(db, [hazir, ozel, ozelAdli, sarf, hazir, 2147483000]));
    assert.deepEqual([...m.keys()].sort((a, b) => a - b), [hazir, ozel, ozelAdli, sarf].sort((a, b) => a - b));
    const bos = { kaliteAdi: null, formAdi: null, birimKg: null, netKg: null, stokBirimi: 'adet' };
    assert.deepEqual(m.get(hazir), { ...bos, kaliteKodu: 'S235JR', aile: 'metal', form: 'cubuk' });
    assert.deepEqual(m.get(ozel), { ...bos, kaliteKodu: 'ORNEK-K1', aile: 'metal', form: 'levha' });
    assert.deepEqual(m.get(ozelAdli), { ...bos, kaliteKodu: 'Örnek ad', aile: 'metal', form: 'boru' });
    assert.deepEqual(m.get(sarf), { ...bos, kaliteKodu: null, aile: null, form: null });
    assert.equal((await vt().tx((db) => malzemeMaliyetBilgileri(db, []))).size, 0);
  });

  test('kullanılan kaliteler: yalnız aktif hammadde, kalite + form başına kart sayısı; taslak, sarf ve kalitesiz kart sayılmaz', async () => {
    const once = await vt().tx((db) => kullanilanKaliteler(db));
    await kaydet({ grade: 'ORNEK-Z9', form: 'cubuk', dims: OLCU.cubuk });
    await kaydet({ grade: 'ORNEK-Z9', form: 'cubuk', dims: OLCU.cubuk });
    await kaydet({ grade: 'ORNEK-Z9', form: 'levha', dims: OLCU.levha }, 'taslak');
    // Kuraldan (157 a) önce kaydolmuş formsuz ve kalitesiz kartlar: yeni kart olarak açılamazlar, veride durabilirler.
    const formsuz = await kaydet({ grade: 'ORNEK-Z9', form: 'cubuk', dims: OLCU.cubuk });
    const kalitesiz = await kaydet({ grade: 'ORNEK-Z8', form: 'cubuk', dims: OLCU.cubuk });
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = kayit - 'form' - 'dims' WHERE no = $1", [formsuz]);
    await vt().sorgu("UPDATE malzeme_katalog_karti SET kayit = kayit - 'grade' WHERE no = $1", [kalitesiz]);
    const sonra = await vt().tx((db) => kullanilanKaliteler(db));
    const z9 = sonra.filter((k) => k.kaliteKodu === 'ORNEK-Z9');
    assert.deepEqual(z9, [
      { kaliteKodu: 'ORNEK-Z9', aile: 'metal', form: 'cubuk', kartSayisi: 2 },
      { kaliteKodu: 'ORNEK-Z9', aile: 'metal', form: null, kartSayisi: 1 },
    ]);
    assert.equal(sonra.filter((k) => k.kaliteKodu !== 'ORNEK-Z9').length, once.length);
    assert.ok(sonra.every((k) => k.kaliteKodu !== null));
  });

  test('ekranın hesapladığı birim ağırlık, kalite adı ve form adı kayıtta karta yazılır (208 a); gönderilmeyen alan korunur, null siler', async () => {
    const ozet = { birim_agirlik_kg: 2.4567, kalite_adi: ' Örnek kalite adı ', form_adi: 'Yuvarlak çubuk' };
    const no = await kaydet({ grade: 'S235JR', form: 'cubuk', dims: OLCU.cubuk }, 'aktif', 'hammadde', ozet);
    const oku = async () => (await vt().tx((db) => malzemeMaliyetBilgileri(db, [no]))).get(no);
    assert.deepEqual(await oku(), {
      kaliteKodu: 'S235JR', kaliteAdi: 'Örnek kalite adı', aile: 'metal', form: 'cubuk', formAdi: 'Yuvarlak çubuk', stokBirimi: 'adet', birimKg: 2.4567, netKg: null,
    });
    await yenidenKaydet(no, {});
    assert.equal((await oku())?.birimKg, 2.4567);
    await yenidenKaydet(no, { birim_agirlik_kg: null, kalite_adi: '', form_adi: null });
    assert.deepEqual(await oku(), { kaliteKodu: 'S235JR', kaliteAdi: null, aile: 'metal', form: 'cubuk', formAdi: null, stokBirimi: 'adet', birimKg: null, netKg: null });
  });

  test('hammadde dışındaki kartta ağırlık ve adlar yazılmaz; sıfır ya da eksi ağırlık 400', async () => {
    const sarf = await kaydet({ grade: 'S235JR', form: 'cubuk' }, 'aktif', 'sarf', { birim_agirlik_kg: 1.5, kalite_adi: 'x', form_adi: 'y' });
    const m = await vt().tx((db) => malzemeMaliyetBilgileri(db, [sarf]));
    assert.deepEqual(m.get(sarf), { kaliteKodu: null, kaliteAdi: null, aile: null, form: null, formAdi: null, stokBirimi: 'adet', birimKg: null, netKg: null });
    for (const birim_agirlik_kg of [0, -1]) {
      const kayit = { id: 'mb-sifir', tur: 'hammadde', fam: 'metal', com: { kod: 'HM-MLB-09999', birim: 'adet' }, onay: { durum: 'aktif' } };
      const c = await app.inject({
        method: 'POST', url: '/api/malzeme-katalogu-kartlari/mb-sifir/kaydet', headers: { cookie: yonetici },
        payload: tamGovde('/malzeme-katalogu-kartlari/mb-sifir/kaydet', { kayit, ozet: { benzersiz_anahtar: 'hammadde|mb|sifir', mukerrer_gerekcesi: null, birim_agirlik_kg }, surum: null }) as object,
      });
      assert.equal(c.statusCode, 400, c.body);
    }
  });

  test('net parça ağırlığı (214 a): mamul ve yarı mamulde kartın net ağırlık alanından her kayıtta yazılır; alan silinince null', async () => {
    const mamul = await kaydet({ g: { net: 1.25 } }, 'aktif', 'mamul');
    const yari = await kaydet({ g: { net: '0,5' } }, 'aktif', 'yarimamul');
    const ham = await kaydet({ grade: 'S235JR', form: 'cubuk', dims: OLCU.cubuk, g: { net: 3 } });
    const oku = async (no: number) => (await vt().tx((db) => malzemeMaliyetBilgileri(db, [no]))).get(no)?.netKg;
    assert.deepEqual([await oku(mamul), await oku(yari), await oku(ham)], [1.25, 0.5, null]);
    const r = (await vt().tek<{ kimlik: string; kayit: Record<string, unknown>; surum: number }>('SELECT kimlik, kayit, surum FROM malzeme_katalog_karti WHERE no = $1', [mamul]))!;
    await tamam<KatalogKartiKaydetCevabi>('POST', `/malzeme-katalogu-kartlari/${r.kimlik}/kaydet`, {
      kayit: { ...r.kayit, g: {} }, ozet: { benzersiz_anahtar: `mamul|mb|${r.kimlik}`, mukerrer_gerekcesi: null }, surum: r.surum,
    });
    assert.equal(await oku(mamul), null);
  });
});
