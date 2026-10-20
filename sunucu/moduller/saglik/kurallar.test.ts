import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import { commitSec, diskDurumu, uyarilar } from './kurallar.ts';
import type { UyariGirdisi } from './kurallar.ts';

const GIT = 'a'.repeat(40);

test('commit kaynağı: git değeri önce, yoksa ortam, ikisi de yoksa null', () => {
  assert.equal(commitSec(GIT, 'ortamdan'), GIT);
  assert.equal(commitSec(null, 'ortamdan'), 'ortamdan');
  assert.equal(commitSec('', ' ortamdan '), 'ortamdan');
  assert.equal(commitSec('git-degil', 'ortamdan'), 'ortamdan');
  assert.equal(commitSec(null, null), null);
  assert.equal(commitSec('', '  '), null);
});

const GB = 1024 ** 3;

// Eşik 5 GB ya da yüzde 10 (hangisi önce gelirse): küçük diskte 5 GB, büyük diskte oran erken uyarır.
test('disk durumu: boş yer 5 GB altında ya da yüzde 10 altındaysa az; bayt değerleri aynen taşınır', () => {
  assert.deepEqual(diskDurumu(50 * GB, 100 * GB), { bosBayt: 50 * GB, toplamBayt: 100 * GB, az: false });
  assert.equal(diskDurumu(4 * GB, 20 * GB).az, true);
  assert.equal(diskDurumu(5 * GB, 20 * GB).az, false);
  assert.equal(diskDurumu(60 * GB, 1000 * GB).az, true);
  assert.equal(diskDurumu(100 * GB, 1000 * GB).az, false);
  assert.equal(diskDurumu(0, 0).az, true);
});

const SIMDI = new Date('2026-10-19T12:00:00Z');
const once = (dk: number): Date => new Date(SIMDI.getTime() - dk * 60_000);
const is = (ad: string, alanlar: Partial<IsDurumu> = {}): IsDurumu => ({
  ad, aralikMs: 60_000, sonBaslama: once(1), sonBitis: once(1), sonSonuc: 'tamam', sonHata: null, sonNeden: null, sonSaglikliBitis: once(1), ...alanlar,
});
const temiz: UyariGirdisi = {
  simdi: SIMDI, surecBaslangici: once(24 * 60), isler: [is('a')], yedek: { durum: 'acik', sonYedek: once(10 * 60) },
  yedekDiski: diskDurumu(50 * GB, 100 * GB), veritabaniDiski: diskDurumu(50 * GB, 100 * GB),
};

test('uyarı: her şey yolundayken boş', () => {
  assert.deepEqual(uyarilar(temiz), []);
});

test('uyarı (yedek): 26 saatten eski, hiç yok, kapalı ya da okunamadı; tam 26 saat uyarmaz', () => {
  const yedek = (y: UyariGirdisi['yedek']) => uyarilar({ ...temiz, yedek: y });
  assert.deepEqual(yedek({ durum: 'acik', sonYedek: once(26 * 60) }), []);
  assert.deepEqual(yedek({ durum: 'acik', sonYedek: once(26 * 60 + 1) }), [{ tur: 'yedek', ileti: 'Son yedek 26 saat önce alındı.' }]);
  assert.deepEqual(yedek({ durum: 'acik', sonYedek: once(50 * 60) }), [{ tur: 'yedek', ileti: 'Son yedek 50 saat önce alındı.' }]);
  assert.deepEqual(yedek({ durum: 'acik', sonYedek: null }), [{ tur: 'yedek', ileti: 'Hiç yedek alınmamış.' }]);
  assert.deepEqual(yedek({ durum: 'dizin-yok', sonYedek: null }), [{ tur: 'yedek', ileti: 'Yedek kapalı: yedek klasörü seçilmemiş ya da erişilemiyor.' }]);
  assert.deepEqual(yedek({ durum: 'anahtar-yok', sonYedek: once(60) }), [{ tur: 'yedek', ileti: 'Yedek kapalı: yedek şifreleme anahtarı yok.' }]);
  assert.deepEqual(yedek(null), [{ tur: 'yedek', ileti: 'Yedek durumu okunamadı.' }]);
});

test('uyarı (iş): son tur hata, 30 dakikadan uzun süren tur, aralığın 3 katından (en az 30 dk) eski sağlıklı bitiş; iş başına tek uyarı', () => {
  const isle = (...isler: IsDurumu[]) => uyarilar({ ...temiz, isler });
  assert.deepEqual(isle(is('a', { sonSonuc: 'hata', sonHata: 'Uygulama hatası X', sonSaglikliBitis: once(500) })),
    [{ tur: 'is', ileti: 'a işi son turda hata verdi (Uygulama hatası X).' }]);
  assert.deepEqual(isle(is('a', { sonBaslama: once(31), sonBitis: once(40) })), [{ tur: 'is', ileti: 'a işi 31 dakikadır sürüyor.' }]);
  assert.deepEqual(isle(is('a', { sonBaslama: once(29), sonBitis: once(40) })), []);
  // 1 dakikalık işte eşik 30 dakikadır; 10 dakikalık işte 30, 1 saatlik işte 3 saat.
  assert.deepEqual(isle(is('a', { sonSaglikliBitis: once(30) })), []);
  assert.deepEqual(isle(is('a', { sonSaglikliBitis: once(31) })), [{ tur: 'is', ileti: 'a işi 31 dakikadır sağlıklı tamamlanmadı.' }]);
  assert.deepEqual(isle(is('b', { aralikMs: 3_600_000, sonSaglikliBitis: once(179) })), []);
  assert.deepEqual(isle(is('b', { aralikMs: 3_600_000, sonSaglikliBitis: once(181) })), [{ tur: 'is', ileti: 'b işi 181 dakikadır sağlıklı tamamlanmadı.' }]);
  // Bekleyen (ayarı kapalı) iş sağlıklıdır; hiç koşmamış iş süreç açılışından sayılır.
  assert.deepEqual(isle(is('a', { sonSonuc: 'bekliyor', sonNeden: 'Kapalı' })), []);
  const yeni = is('c', { sonBaslama: null, sonBitis: null, sonSonuc: null, sonSaglikliBitis: null });
  assert.deepEqual(uyarilar({ ...temiz, surecBaslangici: once(5), isler: [yeni] }), []);
  assert.deepEqual(uyarilar({ ...temiz, surecBaslangici: once(45), isler: [yeni] }), [{ tur: 'is', ileti: 'c işi 45 dakikadır sağlıklı tamamlanmadı.' }]);
  // Uzun kapalı kalan sunucu açılınca eski bitiş, açılıştan sonraki ilk turlara kadar uyarı vermez.
  assert.deepEqual(uyarilar({ ...temiz, surecBaslangici: once(2), isler: [is('a', { sonSaglikliBitis: once(600) })] }), []);
});

test('uyarı (disk): yedek ya da veritabanı diski az; bilinmeyen disk uyarmaz', () => {
  assert.deepEqual(uyarilar({ ...temiz, yedekDiski: diskDurumu(2.5 * GB, 100 * GB), veritabaniDiski: null }),
    [{ tur: 'disk', ileti: 'Yedek diskinde 2,5 GB boş yer kaldı.' }]);
  assert.deepEqual(uyarilar({ ...temiz, veritabaniDiski: diskDurumu(1 * GB, 100 * GB) }),
    [{ tur: 'disk', ileti: 'Veritabanı diskinde 1,0 GB boş yer kaldı.' }]);
});
