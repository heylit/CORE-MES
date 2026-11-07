import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ayarDegerSemasi } from './sozlesme/ayarlar.ts';
import { tarihAraligiHatasi, tarihAraliginiCoz } from './tarih-araligi.ts';

test('gün aralığı: iki gün ISO güne çevrilir; tek gün başlangıç ve bitiş olur; boş aralık değildir, hata da değildir', () => {
  assert.deepEqual(tarihAraliginiCoz('20.03.2026 - 22.03.2026'), { aralik: { bas: '2026-03-20', bit: '2026-03-22' }, hata: null });
  assert.deepEqual(tarihAraliginiCoz(' 9.3.2027-11.3.2027 '), { aralik: { bas: '2027-03-09', bit: '2027-03-11' }, hata: null });
  assert.deepEqual(tarihAraliginiCoz('27.05.2026'), { aralik: { bas: '2026-05-27', bit: '2026-05-27' }, hata: null });
  assert.deepEqual(tarihAraliginiCoz('  '), { aralik: null, hata: null });
});

test('gün aralığı: olmayan gün, ters sıra, uzun aralık ve başka biçim iletisiyle reddedilir', () => {
  assert.match(tarihAraligiHatasi('31.02.2026') ?? '', /gg\.aa\.yyyy/);
  assert.match(tarihAraligiHatasi('2026-03-20') ?? '', /gg\.aa\.yyyy/);
  assert.match(tarihAraligiHatasi('22.03.2026 - 20.03.2026') ?? '', /önce olamaz/);
  assert.match(tarihAraligiHatasi('20.03.2026 - 20.04.2026') ?? '', /en çok 7 gün/);
  assert.match(tarihAraligiHatasi('1.1.2026 - 2.1.2026 - 3.1.2026') ?? '', /biçiminde yazın/);
});

test('tarih-araligi biçimli ayar: boş geçer, geçerli aralık geçer, hatalı aralık iletisiyle reddedilir', () => {
  const sema = ayarDegerSemasi({ modul: 'deneme', tur: 'metin', varsayilan: '', enUzun: 40, bosOlabilir: true, bicim: 'tarih-araligi', baslik: 'B', aciklama: 'A' });
  assert.equal(sema.safeParse('').success, true);
  assert.equal(sema.safeParse('20.03.2026 - 22.03.2026').success, true);
  const sonuc = sema.safeParse('32.03.2026');
  assert.match(sonuc.success ? '' : sonuc.error.issues[0]?.message ?? '', /gg\.aa\.yyyy/);
});
