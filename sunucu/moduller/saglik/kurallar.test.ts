import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { UcSayaci } from '#cekirdek/istek-olcumu.ts';
import {
  commitSec, diskDurumu, kovaYuzdeligi, makineIslemciYuzdesi, metrikDakikasi, sayacFarki, surecIslemciYuzdesi, ucOzetleri, uyarilar, vtOzeti,
} from './kurallar.ts';
import type { VtIstatistigi } from './sorgular.ts';
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

const sayac = (yol: string | null, sinif: UcSayaci['sinif'], sayi: number, kovalar: number[], mesgul = 0): UcSayaci => ({
  yontem: 'GET', yol, sinif, sayi, toplamMs: sayi * 10, kovalar: [...kovalar, ...Array.from({ length: 12 - kovalar.length }, () => 0)], mesgul,
});

test('sayaç farkı: iki okuma arasını verir, değişmeyen ve yeni olmayan satırı atar, yeni uç baştan sayılır', () => {
  const onceki = [sayac('/a', '2xx', 10, [10]), sayac('/b', '2xx', 5, [5])];
  const simdiki = [sayac('/a', '2xx', 13, [12, 1]), sayac('/b', '2xx', 5, [5]), sayac('/c', '5xx', 2, [0, 0, 0, 2], 2)];
  const fark = sayacFarki(onceki, simdiki);
  assert.deepEqual(fark.map((f) => [f.yol, f.sinif, f.sayi, f.kovalar.slice(0, 4), f.mesgul]), [['/a', '2xx', 3, [2, 1, 0, 0], 0], ['/c', '5xx', 2, [0, 0, 0, 2], 2]]);
});

test('kova yüzdeliği: kovanın üst sınırı; örnek yoksa ve en üst kovadaysa null', () => {
  assert.equal(kovaYuzdeligi([0, 0, 0], 95), null);
  const kovalar = [90, 5, 4, 1, 0, 0, 0, 0, 0, 0, 0, 0];
  assert.equal(kovaYuzdeligi(kovalar, 50), 25);
  assert.equal(kovaYuzdeligi(kovalar, 95), 50);
  assert.equal(kovaYuzdeligi(kovalar, 99), 100);
  assert.equal(kovaYuzdeligi(kovalar, 100), 250);
  assert.equal(kovaYuzdeligi([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 50), null);
});

test('uç özetleri: durum sınıfları uç başına birleşir, en çok istek alan önce, liste kısaltılır', () => {
  const fark = [sayac('/a', '2xx', 3, [3]), sayac('/a', '4xx', 1, [1]), sayac('/b', '2xx', 9, [9]), sayac(null, '4xx', 2, [2])];
  const o = ucOzetleri(fark, 60, 2);
  assert.deepEqual(o.map((u) => [u.yol, u.sayi, u.istemciHatasi]), [['/b', 9, 0], ['/a', 4, 1]]);
});

test('işlemci yüzdeleri: fark yoksa ya da taban yoksa null; süreç yüzdesi çekirdek sayısına bölünür ve 100\'de kesilir', () => {
  assert.equal(makineIslemciYuzdesi(null, { bosta: 1, toplam: 2 }), null);
  assert.equal(makineIslemciYuzdesi({ bosta: 5, toplam: 10 }, { bosta: 5, toplam: 10 }), null);
  assert.equal(makineIslemciYuzdesi({ bosta: 0, toplam: 0 }, { bosta: 600, toplam: 1000 }), 40);
  assert.equal(surecIslemciYuzdesi(null, 60_000, 4), null);
  assert.equal(surecIslemciYuzdesi(60_000_000, 60_000, 4), 25);
  assert.equal(surecIslemciYuzdesi(10_000_000_000, 60_000, 4), 100);
  assert.equal(surecIslemciYuzdesi(1, 0, 4), null);
});

test('metrik dakikası: havuz reddi tabana göre fark, havuz yoksa null; istek yoksa yüzdelikler null', () => {
  const temel = {
    an: new Date('2026-11-01T10:00:00Z'), aralikMs: 60_000, istekFarki: [], surecIslemciYuzde: null, makineIslemciYuzde: null,
    bellek: { rss: 1, heapUsed: 1 }, makineBos: 1, makineToplam: 2, olayDongusuP99Ms: null,
  };
  const d = metrikDakikasi({ ...temel, havuz: { boyut: 30, kullanimda: 1, bekleyen: 0, mesgulToplam: 7 }, oncekiMesgulToplam: 4 });
  assert.deepEqual(d.havuz, { boyut: 30, kullanimda: 1, bekleyen: 0, mesgul: 3 });
  assert.deepEqual(d.istek, { sayi: 0, saniyede: 0, p50Ms: null, p95Ms: null, p99Ms: null, istemciHatasi: 0, sunucuHatasi: 0, mesgul: 0 });
  assert.equal(metrikDakikasi({ ...temel, havuz: null, oncekiMesgulToplam: null }).havuz, null);
});

const vtOlcusu = (y: Partial<VtIstatistigi> = {}): VtIstatistigi => ({
  boyutBayt: 1000, xidYasi: 50, islem: 100, geriAlma: 2, deadlock: 0, blokIsabet: 900, blokOkuma: 100, geciciBayt: 0,
  baglanti: { toplam: 5, aktif: 1, bosta: 3, bosTx: 1, kilitBekleyen: 0, gorunmeyen: 0 }, enUzunTxSn: 1.234, ...y,
});

test('veritabanı özeti: sayaçlar farkla, anlık değerler son ölçüden; taban yoksa null', () => {
  assert.equal(vtOzeti(null, vtOlcusu(), 60), null);
  assert.equal(vtOzeti(vtOlcusu(), null, 60), null);
  const o = vtOzeti(vtOlcusu(), vtOlcusu({ islem: 154, geriAlma: 8, deadlock: 1, blokIsabet: 1890, blokOkuma: 110, geciciBayt: 4096, boyutBayt: 2000 }), 60);
  assert.deepEqual(o, {
    boyutBayt: 2000, xidYasi: 50, saniyedeIslem: 1, geriAlma: 6, deadlock: 1, onbellekIsabetiYuzde: 99, geciciBayt: 4096,
    baglanti: { toplam: 5, aktif: 1, bosta: 3, bosTx: 1, kilitBekleyen: 0, gorunmeyen: 0 }, enUzunTxSn: 1.2,
  });
});

test('veritabanı özeti: istatistik sıfırlanırsa aralık sıfırdan sayılır; blok okunmadıysa isabet yüzdesi null, uydurulmaz', () => {
  const o = vtOzeti(vtOlcusu({ islem: 5000, deadlock: 3 }), vtOlcusu({ islem: 30, geriAlma: 0, deadlock: 0, enUzunTxSn: null }), 60);
  assert.equal(o?.saniyedeIslem, 0.5);
  assert.equal(o?.deadlock, 0);
  assert.equal(o?.geriAlma, 0);
  assert.equal(o?.enUzunTxSn, null);
  assert.equal(vtOzeti(vtOlcusu(), vtOlcusu(), 60)?.onbellekIsabetiYuzde, null);
  assert.equal(metrikDakikasi({
    an: new Date('2026-11-01T10:00:00Z'), aralikMs: 60_000, istekFarki: [], surecIslemciYuzde: null, makineIslemciYuzde: null,
    bellek: { rss: 1, heapUsed: 1 }, makineBos: 1, makineToplam: 2, olayDongusuP99Ms: null, havuz: null, oncekiMesgulToplam: null,
  }).veritabani, null);
});
