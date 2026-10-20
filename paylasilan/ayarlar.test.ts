import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AYAR_ANAHTARLARI, AYAR_TANIMLARI, ayarAnahtariMi, ayarTanimi } from './ayarlar.ts';
import type { AyarTanimi } from './ayar-tanimi.ts';
import { ACILIS_TURLERI, HAREKET_SEVIYELERI, SAYI_ONDALIK_EN_COK, ayarDegerSemasi, ayarSemasi } from './sozlesme/ayarlar.ts';

const KLASOR = fileURLToPath(new URL('./ayarlar/', import.meta.url));

test('her ayar anahtarı <modül>.<ad> biçimindedir ve okuyan modülün adıyla başlar', () => {
  assert.equal(AYAR_ANAHTARLARI.length > 0, true);
  for (const anahtar of AYAR_ANAHTARLARI) {
    assert.match(anahtar, /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
    assert.equal(anahtar.startsWith(`${AYAR_TANIMLARI[anahtar].modul}.`), true, anahtar);
  }
});

test('her tanımın varsayılanı kendi türünün şemasından geçer; başlığı ve açıklaması doludur; sayı sınırları tutarlıdır', () => {
  for (const anahtar of AYAR_ANAHTARLARI) {
    const tanim = ayarTanimi(anahtar);
    assert.equal(ayarDegerSemasi(tanim).safeParse(tanim.varsayilan).success, true, anahtar);
    if (tanim.tur === 'sayi') {
      assert.equal(Number.isFinite(tanim.enAz) && Number.isFinite(tanim.enCok) && tanim.enAz <= tanim.enCok, true, anahtar);
      assert.equal(Number.isInteger(tanim.ondalik) && tanim.ondalik >= 0 && tanim.ondalik <= SAYI_ONDALIK_EN_COK, true, anahtar);
    }
    assert.notEqual(tanim.baslik.trim(), '', anahtar);
    assert.notEqual(tanim.aciklama.trim(), '', anahtar);
  }
});

test('tanımsız anahtar ayar anahtarı değildir; nesnenin kalıtsal adları da değildir', () => {
  for (const anahtar of AYAR_ANAHTARLARI) assert.equal(ayarAnahtariMi(anahtar), true);
  for (const deger of ['malzemeler.yok', '', 'toString', 'constructor', '__proto__', 5, null, undefined]) {
    assert.equal(ayarAnahtariMi(deger), false, String(deger));
  }
});

test('modül dosyasındaki her ayar kayıtlıdır ve kendi modülünün adını taşır', async () => {
  const dosyalar = (await readdir(KLASOR)).filter((ad) => ad.endsWith('.ts')).sort();
  assert.equal(dosyalar.length > 0, true);
  const bulunan: [string, unknown][] = [];
  for (const dosya of dosyalar) {
    const modul = dosya.replace(/\.ts$/, '');
    const disari = (await import(pathToFileURL(`${KLASOR}${dosya}`).href)) as Record<string, Record<string, { modul: string }>>;
    const ayarlar = Object.values(disari).flatMap((tanimlar) => Object.entries(tanimlar));
    assert.equal(ayarlar.length > 0, true, dosya);
    for (const [anahtar, tanim] of ayarlar) {
      assert.equal(anahtar.startsWith(`${modul}.`), true, `${dosya}: ${anahtar}`);
      assert.equal(tanim.modul, modul, `${dosya}: ${anahtar}`);
    }
    bulunan.push(...ayarlar);
  }
  assert.deepEqual(Object.fromEntries(bulunan), AYAR_TANIMLARI);
  assert.equal(bulunan.length, AYAR_ANAHTARLARI.length);
});

test('sayı türü: boş (null) ve sınırlar içindeki değer geçer; sınır dışı, fazla basamak, metin ve sonsuz reddedilir', () => {
  const tanim: AyarTanimi = { modul: 'deneme', tur: 'sayi', varsayilan: null, enAz: 0, enCok: 100, ondalik: 2, baslik: 'B', aciklama: 'A' };
  const sema = ayarDegerSemasi(tanim);
  for (const iyi of [null, 0, 100, 20, 18.5, 0.01, 99.99]) assert.equal(sema.safeParse(iyi).success, true, String(iyi));
  const iletisi = (deger: unknown): string | undefined => {
    const sonuc = sema.safeParse(deger);
    return sonuc.success ? undefined : sonuc.error.issues[0]?.message;
  };
  assert.equal(iletisi(-0.01), 'En az 0 olabilir.');
  assert.equal(iletisi(100.01), 'En çok 100 olabilir.');
  assert.equal(iletisi(1.005), 'En çok 2 ondalık basamak olabilir.');
  for (const kotu of ['5', undefined, Number.NaN, Number.POSITIVE_INFINITY, true, {}]) assert.notEqual(iletisi(kotu), undefined, String(kotu));

  const tam = ayarDegerSemasi({ ...tanim, ondalik: 0, enAz: 1, enCok: 365, varsayilan: 30 });
  assert.equal(tam.safeParse(30).success, true);
  assert.equal(tam.safeParse(30.5).success, false);
});

test('sayı ayarının görünümü sınırlarını taşır; boolean görünümü sayı alanı almaz', () => {
  const ortak = { anahtar: 'deneme.sayi', baslik: 'B', aciklama: 'A' };
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'sayi', deger: null, enAz: 0, enCok: 100, ondalik: 2 }).success, true);
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'sayi', deger: 5 }).success, false);
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'boolean', deger: null }).success, false);
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'sayi', deger: 5, enAz: 0, enCok: 100, ondalik: 7 }).success, false);
});

test('metin türü: baştaki ve sondaki boşluk atılır; boş, sınırı aşan ve metin olmayan değer reddedilir', () => {
  const sema = ayarDegerSemasi({ modul: 'deneme', tur: 'metin', varsayilan: 'Merhaba', enUzun: 5, baslik: 'B', aciklama: 'A' });
  assert.deepEqual(sema.safeParse('  abc ').data, 'abc');
  assert.equal(sema.safeParse('abcde').success, true);
  const iletisi = (deger: unknown): string | undefined => {
    const sonuc = sema.safeParse(deger);
    return sonuc.success ? undefined : sonuc.error.issues[0]?.message;
  };
  assert.equal(iletisi('   '), 'Metin boş olamaz.');
  assert.equal(iletisi('abcdef'), 'En çok 5 karakter olabilir.');
  for (const kotu of [null, undefined, 5, true, {}]) assert.notEqual(iletisi(kotu), undefined, String(kotu));
  const ortak = { anahtar: 'deneme.metin', baslik: 'B', aciklama: 'A', tur: 'metin', enUzun: 5 };
  assert.equal(ayarSemasi.safeParse({ ...ortak, deger: 'abc' }).success, true);
  assert.equal(ayarSemasi.safeParse({ ...ortak, deger: null }).success, false);
  assert.equal(ayarSemasi.safeParse({ ...ortak, deger: null, gecersiz: true }).success, true);
});

test('boş olabilen ağ aralığı metni: boş geçer, geçerli liste geçer, hatalı aralık iletisiyle reddedilir; görünüm işaretleri taşır', () => {
  const sema = ayarDegerSemasi({ modul: 'deneme', tur: 'metin', varsayilan: '', enUzun: 200, bosOlabilir: true, bicim: 'ag-araligi', baslik: 'B', aciklama: 'A' });
  assert.equal(sema.safeParse('   ').data, '');
  assert.equal(sema.safeParse('10.30.0.0/16, fd00::/8').success, true);
  const sonuc = sema.safeParse('10.30.1.0/16');
  assert.match(sonuc.success ? '' : sonuc.error.issues[0]?.message ?? '', /ağ adresi değil/);
  const ortak = { anahtar: 'deneme.aralik', baslik: 'B', aciklama: 'A', tur: 'metin', enUzun: 200 };
  assert.equal(ayarSemasi.safeParse({ ...ortak, deger: '', bosOlabilir: true, bicim: 'ag-araligi' }).success, true);
  assert.equal(ayarSemasi.safeParse({ ...ortak, deger: '', bicim: 'baska' }).success, false);
});

test('seçim türü: yalnız listedeki değer geçer; boş, başka metin ve başka tür reddedilir', () => {
  const tanim: AyarTanimi = {
    modul: 'deneme', tur: 'secim', varsayilan: 'a', secenekler: [{ deger: 'a', etiket: 'A' }, { deger: 'b', etiket: 'B' }], baslik: 'B', aciklama: 'A',
  };
  const sema = ayarDegerSemasi(tanim);
  for (const iyi of ['a', 'b']) assert.equal(sema.safeParse(iyi).success, true, iyi);
  for (const kotu of ['', 'c', 'A', null, 1, true]) assert.equal(sema.safeParse(kotu).success, false, String(kotu));
  const ortak = { anahtar: 'deneme.secim', baslik: 'B', aciklama: 'A' };
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'secim', deger: 'a', secenekler: [{ deger: 'a', etiket: 'A' }] }).success, true);
  assert.equal(ayarSemasi.safeParse({ ...ortak, tur: 'secim', deger: null, secenekler: [] }).success, false);
});

test('her seçim ayarının değerleri tektir; hareket ve açılış seçenekleri kabuğun bildiği listeyle aynıdır', () => {
  for (const anahtar of AYAR_ANAHTARLARI) {
    const tanim = ayarTanimi(anahtar);
    if (tanim.tur !== 'secim') continue;
    const degerler = tanim.secenekler.map((s) => s.deger);
    assert.equal(new Set(degerler).size, degerler.length, anahtar);
  }
  assert.deepEqual(AYAR_TANIMLARI['kabuk.hareket'].secenekler.map((s) => s.deger), [...HAREKET_SEVIYELERI]);
  assert.deepEqual(AYAR_TANIMLARI['kabuk.acilis'].secenekler.map((s) => s.deger), [...ACILIS_TURLERI]);
});
