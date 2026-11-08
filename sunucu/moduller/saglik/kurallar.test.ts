import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { IsDurumu } from '#cekirdek/zamanlayici.ts';
import type { UcSayaci } from '#cekirdek/istek-olcumu.ts';
import {
  commitSec, disKopyaDurumu, disKopyaUyarisi, diskDurumu, gunIciKoruma, walArsivUyarisi, kovaYuzdeligi, makineIslemciYuzdesi, ESIK_KURALLARI, anaIsParcacigiYuzdesi, denemeUyarisi, esikGecisleri, metrikDakikasi, ozetlenecekSaatler, saatOzeti, sayacFarki, surecIslemciYuzdesi, ucOzetleri, uyarilar, oluOraniYuzde, veritabaniBuyumesi, vtOzeti,
} from './kurallar.ts';
import type { VtIstatistigi } from './sorgular.ts';
import type { UyariGirdisi } from './kurallar.ts';
import type { DisKopyaKaydi, MetrikDakikasi, WalArsivi } from '#paylasilan/sozlesme/saglik.ts';

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

test('ana iş parçacığı yüzdesi: olay döngüsü kullanımı tek çekirdeğe göre; ölçü yoksa ya da bozuksa null', () => {
  assert.equal(anaIsParcacigiYuzdesi(0.9), 90);
  assert.equal(anaIsParcacigiYuzdesi(0.12345), 12.3);
  assert.equal(anaIsParcacigiYuzdesi(1.2), 100);
  assert.equal(anaIsParcacigiYuzdesi(null), null);
  assert.equal(anaIsParcacigiYuzdesi(Number.NaN), null);
  assert.equal(anaIsParcacigiYuzdesi(-0.1), null);
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

test('özetlenecek saatler: özetlenmemiş ilk dakikanın saatinden şimdiki saate dek; şimdiki saat bitmediği için yok; tur sınırlı', () => {
  const s = (iso: string) => new Date(iso);
  assert.deepEqual(ozetlenecekSaatler(null, s('2026-11-01T10:30:00Z')), []);
  assert.deepEqual(ozetlenecekSaatler(s('2026-11-01T10:05:00Z'), s('2026-11-01T10:59:00Z')), []);
  assert.deepEqual(ozetlenecekSaatler(s('2026-11-01T08:59:00Z'), s('2026-11-01T10:00:00Z')).map((d) => d.toISOString()),
    ['2026-11-01T08:00:00.000Z', '2026-11-01T09:00:00.000Z']);
  assert.equal(ozetlenecekSaatler(s('2026-10-01T00:00:00Z'), s('2026-11-01T00:00:00Z'), 48).length, 48);
});

const dakikaOrnegi = (y: Partial<MetrikDakikasi> = {}): MetrikDakikasi => ({
  an: '2026-11-01T10:01:00.000Z', aralikSn: 60,
  istek: { sayi: 60, saniyede: 1, p50Ms: 25, p95Ms: 100, p99Ms: 250, istemciHatasi: 1, sunucuHatasi: 0, mesgul: 0 },
  uclar: [], havuz: { boyut: 30, kullanimda: 2, bekleyen: 0, mesgul: 0 },
  surecIslemciYuzde: 10, makineIslemciYuzde: null,
  bellek: { rssBayt: 100, yiginBayt: 50, makineBosBayt: 1000, makineToplamBayt: 2000 }, olayDongusuP99Ms: null,
  veritabani: {
    boyutBayt: 500, xidYasi: 10, saniyedeIslem: 2, geriAlma: 1, deadlock: 0, onbellekIsabetiYuzde: 99, geciciBayt: 0,
    baglanti: { toplam: 5, aktif: 1, bosta: 4, bosTx: 0, kilitBekleyen: 0, gorunmeyen: 0 }, enUzunTxSn: null,
  },
  ...y,
});

test('saat özeti: toplamlar toplanır, uçlar en kötüsüyle, ortalamalar yalnız ölçülen dakikalardan; ölçü yoksa null', () => {
  const saat = new Date('2026-11-01T10:00:00Z');
  assert.equal(saatOzeti(saat, []), null);
  const o = saatOzeti(saat, [
    dakikaOrnegi(),
    dakikaOrnegi({
      istek: { sayi: 120, saniyede: 2, p50Ms: 25, p95Ms: 500, p99Ms: null, istemciHatasi: 0, sunucuHatasi: 2, mesgul: 3 },
      havuz: null, surecIslemciYuzde: 30, bellek: { rssBayt: 300, yiginBayt: 50, makineBosBayt: 400, makineToplamBayt: 2000 },
      veritabani: null,
    }),
    dakikaOrnegi({ surecIslemciYuzde: null, veritabani: { ...dakikaOrnegi().veritabani!, boyutBayt: 600, saniyedeIslem: 4, deadlock: 1, onbellekIsabetiYuzde: null } }),
  ]);
  assert.ok(o !== null);
  assert.equal(o.saat, '2026-11-01T10:00:00.000Z');
  assert.equal(o.dakikaSayisi, 3);
  assert.deepEqual(o.istek, { sayi: 240, saniyede: 1.33, p95MsEnCok: 500, p99MsEnCok: 250, istemciHatasi: 2, sunucuHatasi: 2, mesgul: 3 });
  assert.deepEqual(o.havuz, { kullanimdaEnCok: 2, bekleyenEnCok: 0, mesgul: 0 });
  assert.deepEqual(o.surecIslemciYuzde, { ort: 20, enCok: 30 });
  assert.equal(o.makineIslemciYuzde, null);
  assert.deepEqual(o.bellek, { rssBaytEnCok: 300, makineBosBaytEnAz: 400 });
  assert.equal(o.olayDongusuP99MsEnCok, null);
  assert.equal(o.veritabani?.boyutBayt, 600);
  assert.equal(o.veritabani?.saniyedeIslem, 3);
  assert.equal(o.veritabani?.deadlock, 1);
  assert.equal(o.veritabani?.onbellekIsabetiYuzdeEnAz, 99);
  assert.equal(saatOzeti(saat, [dakikaOrnegi({ veritabani: null })])?.veritabani, null);
});

test('saat özeti: ana iş parçacığı payı ortalama ve en çok; alan eklenmeden önce yazılmış dakikalar ölçüsüz sayılır', () => {
  const saat = new Date('2026-11-01T10:00:00Z');
  assert.equal(saatOzeti(saat, [dakikaOrnegi(), dakikaOrnegi()])?.anaIsParcacigiYuzde, null);
  assert.deepEqual(saatOzeti(saat, [dakikaOrnegi(), dakikaOrnegi({ anaIsParcacigiYuzde: 40 }), dakikaOrnegi({ anaIsParcacigiYuzde: 80 })])?.anaIsParcacigiYuzde,
    { ort: 60, enCok: 80 });
  assert.equal(metrikDakikasi({
    an: new Date('2026-11-01T10:00:00Z'), aralikMs: 60_000, istekFarki: [], surecIslemciYuzde: null, makineIslemciYuzde: null,
    bellek: { rss: 1, heapUsed: 1 }, makineBos: 1, makineToplam: 2, olayDongusuP99Ms: null, havuz: null, oncekiMesgulToplam: null,
    anaIsParcacigiYuzde: 75,
  }).anaIsParcacigiYuzde, 75);
});

test('eşik: son süre boyunca her dakika aşılınca açılır; ölçülemeyen ya da az istekli dakika açmaz; kapanış süre kadar, en az 3 temiz dakika ister', () => {
  const yavas = dakikaOrnegi({ istek: { ...dakikaOrnegi().istek, p95Ms: 2500 } });
  const hizli = dakikaOrnegi();
  const az = dakikaOrnegi({ istek: { ...dakikaOrnegi().istek, sayi: 5, p95Ms: 2500 } });
  const kodlar = (g: { acilan: { kod: string }[]; kapanan: { kod: string }[] }) => [g.acilan.map((k) => k.kod), g.kapanan.map((k) => k.kod)];
  assert.deepEqual(kodlar(esikGecisleri([yavas, yavas, yavas, yavas], new Set())), [[], []]);
  assert.deepEqual(kodlar(esikGecisleri([yavas, yavas, yavas, yavas, yavas], new Set())), [['yanit-suresi'], []]);
  assert.deepEqual(kodlar(esikGecisleri([yavas, yavas, az, yavas, yavas], new Set())), [[], []]);
  const acik = new Set(['yanit-suresi']);
  assert.deepEqual(kodlar(esikGecisleri([yavas, yavas, yavas, yavas, yavas], acik)), [[], []]);
  assert.deepEqual(kodlar(esikGecisleri([yavas, hizli, hizli, hizli, hizli], acik)), [[], []]);
  assert.deepEqual(kodlar(esikGecisleri([yavas, hizli, hizli, hizli, hizli, hizli], acik)), [[], ['yanit-suresi']]);
  // Tek dakikalık kural (deadlock) 3 temiz dakikada kapanır.
  const kilitli = dakikaOrnegi({ veritabani: { ...dakikaOrnegi().veritabani!, deadlock: 1 } });
  assert.deepEqual(kodlar(esikGecisleri([kilitli], new Set())), [['deadlock'], []]);
  assert.deepEqual(kodlar(esikGecisleri([kilitli, hizli, hizli, hizli], new Set(['deadlock']))), [[], ['deadlock']]);
  // Az istekli dakika ölçülemedi sayılır: kapatmaz.
  assert.deepEqual(kodlar(esikGecisleri([hizli, az, hizli], acik)), [[], []]);
});

test('eşik kuralları: her kural kendi alanına bakar; veri yoksa null, uydurulmaz', () => {
  const kural = (kod: string) => {
    const k = ESIK_KURALLARI.find((x) => x.kod === kod);
    assert.ok(k, kod);
    return k;
  };
  const vt = dakikaOrnegi().veritabani!;
  assert.equal(new Set(ESIK_KURALLARI.map((k) => k.kod)).size, ESIK_KURALLARI.length);
  assert.equal(kural('havuz-dolu').asildi(dakikaOrnegi({ havuz: null })), null);
  assert.equal(kural('havuz-dolu').asildi(dakikaOrnegi({ havuz: { boyut: 30, kullanimda: 30, bekleyen: 2, mesgul: 0 } })), true);
  assert.equal(kural('sunucu-hatasi').asildi(dakikaOrnegi({ istek: { ...dakikaOrnegi().istek, sunucuHatasi: 4 } })), false);
  assert.equal(kural('sunucu-hatasi').asildi(dakikaOrnegi({ istek: { ...dakikaOrnegi().istek, sunucuHatasi: 6 } })), true);
  assert.equal(kural('islemci').asildi(dakikaOrnegi({ makineIslemciYuzde: null })), null);
  assert.equal(kural('islemci').asildi(dakikaOrnegi({ makineIslemciYuzde: 95 })), true);
  assert.equal(kural('bellek').asildi(dakikaOrnegi({ bellek: { rssBayt: 1, yiginBayt: 1, makineBosBayt: 150, makineToplamBayt: 2000 } })), true);
  assert.equal(kural('olay-dongusu').asildi(dakikaOrnegi({ olayDongusuP99Ms: 800 })), true);
  assert.equal(kural('deadlock').asildi(dakikaOrnegi({ veritabani: null })), null);
  assert.equal(kural('deadlock').asildi(dakikaOrnegi({ veritabani: { ...vt, deadlock: 1 } })), true);
  assert.equal(kural('uzun-islem').asildi(dakikaOrnegi({ veritabani: { ...vt, enUzunTxSn: 900 } })), true);
  assert.equal(kural('uzun-islem').asildi(dakikaOrnegi({ veritabani: { ...vt, enUzunTxSn: null } })), false);
  assert.equal(kural('xid-yasi').asildi(dakikaOrnegi({ veritabani: { ...vt, xidYasi: null } })), null);
  assert.equal(kural('xid-yasi').asildi(dakikaOrnegi({ veritabani: { ...vt, xidYasi: 1_200_000_000 } })), true);
  assert.equal(kural('kilit-bekleme').asildi(dakikaOrnegi({ veritabani: { ...vt, baglanti: { ...vt.baglanti, kilitBekleyen: 5 } } })), true);
});

test('uyarılar: açık eşik iletileri esik türüyle listelenir', () => {
  const g: UyariGirdisi = {
    simdi: new Date('2026-11-01T10:00:00Z'), surecBaslangici: new Date('2026-11-01T09:00:00Z'), isler: [],
    yedek: { durum: 'acik', sonYedek: new Date('2026-11-01T09:30:00Z') }, yedekDiski: null, veritabaniDiski: null,
    esikler: ['Bellek az.'],
  };
  assert.deepEqual(uyarilar(g).filter((u) => u.tur === 'esik'), [{ tur: 'esik', ileti: 'Bellek az.' }]);
});

test('geri yükleme denemesi uyarısı: hiç yoksa, başarısızsa ya da 35 günden eskiyse; yedek kapalıyken ya da kayıt okunmadıysa yok', () => {
  const simdi = new Date('2026-11-01T10:00:00Z');
  const d = { zaman: '2026-10-20T10:00:00.000Z', yedek: 'a', sonuc: 'basarili' as const, sureSn: 1, kisiSayisi: 1, gocSayisi: 1, hata: null };
  assert.match(denemeUyarisi(null, simdi) ?? '', /hiç geri yüklenerek denenmemiş/);
  assert.equal(denemeUyarisi(d, simdi), null);
  assert.equal(denemeUyarisi({ ...d, zaman: '2026-09-20T10:00:00.000Z' }, simdi), 'Son geri yükleme denemesi 42 gün önce yapıldı.');
  assert.equal(denemeUyarisi({ ...d, sonuc: 'basarisiz', hata: 'x' }, simdi), 'Son geri yükleme denemesi başarısız oldu (x).');
  const g = (yedek: UyariGirdisi['yedek']): UyariGirdisi => ({
    simdi, surecBaslangici: simdi, isler: [], yedek, yedekDiski: null, veritabaniDiski: null,
  });
  const deneme = (u: ReturnType<typeof uyarilar>) => u.filter((x) => x.ileti.includes('geri yük') || x.ileti.includes('denenmemiş'));
  assert.equal(deneme(uyarilar(g({ durum: 'acik', sonYedek: simdi, sonDeneme: null }))).length, 1);
  assert.equal(deneme(uyarilar(g({ durum: 'acik', sonYedek: simdi }))).length, 0);
  assert.equal(deneme(uyarilar(g({ durum: 'dizin-yok', sonYedek: null, sonDeneme: null }))).length, 0);
});

test('veritabanı büyümesi: ölü satır oranı yüzde, boş tablo null; ölçü ya da tablo listesi yoksa bütün ölçü null', () => {
  assert.equal(oluOraniYuzde(75, 25), 25);
  assert.equal(oluOraniYuzde(2, 1), 33.3);
  assert.equal(oluOraniYuzde(0, 0), null);
  const vt: VtIstatistigi = {
    boyutBayt: 1024.4, xidYasi: 1200, islem: 0, geriAlma: 0, deadlock: 0, blokIsabet: 0, blokOkuma: 0, geciciBayt: 0,
    baglanti: { toplam: 1, aktif: 1, bosta: 0, bosTx: 0, kilitBekleyen: 0, gorunmeyen: 0 }, enUzunTxSn: 12.34,
  };
  const tablo = {
    ad: 'ornek', toplamBayt: 8192, dizinBayt: 4096, canliSatir: 0, oluSatir: 0,
    sonAutovacuum: new Date('2026-11-01T02:00:00Z'), sonAutoanalyze: null,
  };
  assert.deepEqual(veritabaniBuyumesi(vt, [tablo]), {
    boyutBayt: 1024, xidYasi: 1200, enUzunTxSn: 12.3,
    tablolar: [{
      ad: 'ornek', toplamBayt: 8192, dizinBayt: 4096, canliSatir: 0, oluSatir: 0, oluOraniYuzde: null,
      sonAutovacuum: '2026-11-01T02:00:00.000Z', sonAutoanalyze: null,
    }],
  });
  assert.equal(veritabaniBuyumesi(null, [tablo]), null);
  assert.equal(veritabaniBuyumesi(vt, null), null);
  assert.deepEqual(veritabaniBuyumesi({ ...vt, enUzunTxSn: null, xidYasi: null }, [])?.tablolar, []);
});

const kopya = (zaman: string, sonuc: DisKopyaKaydi['sonuc'] = 'basarili'): DisKopyaKaydi => (sonuc === 'basarili'
  ? { zaman, sonuc, hedef: 'F:\\', taban: '20261101', tabanBayt: 10, walAdet: 3, walBayt: 48, hata: null }
  : { zaman, sonuc, hedef: 'F:\\', taban: null, tabanBayt: null, walAdet: null, walBayt: null, hata: 'disk yok' });
const kopyaMi = (d: unknown): d is DisKopyaKaydi => typeof d === 'object' && d !== null && 'zaman' in d && 'sonuc' in d;

test('dış kopya kaydı: bozuk ve yarım satır atlanır; birden çok dosyada sıra zamandır; son başarılı ayrıca bulunur', () => {
  const a = `${JSON.stringify(kopya('2026-11-01T10:00:00.000Z'))}\n{"zaman":"2026-11-0\n`;
  const b = `${JSON.stringify(kopya('2026-11-08T10:00:00.000Z', 'basarisiz'))}\r\nbozuk\n${JSON.stringify(kopya('2026-10-25T10:00:00.000Z'))}\n`;
  const d = disKopyaDurumu([a, b], kopyaMi);
  assert.equal(d.son?.zaman, '2026-11-08T10:00:00.000Z');
  assert.equal(d.sonBasarili?.zaman, '2026-11-01T10:00:00.000Z');
  assert.deepEqual(disKopyaDurumu([], kopyaMi), { son: null, sonBasarili: null });
  assert.deepEqual(disKopyaDurumu(['', 'x\n'], kopyaMi), { son: null, sonBasarili: null });
});

const wal = (w: Partial<WalArsivi> = {}): WalArsivi => ({
  acik: true, sonArsivZamani: '2026-11-08T09:55:00.000Z', sonArsivWal: '000000010000000000000009', hataSayisi: 0, sonHataZamani: null, sonHataWal: null, ...w,
});

test('WAL arşivi uyarısı: hata son arşivden yeniyse takıldı, son arşiv bir saatten eskiyse yazılmadı; kapalı ya da okunamadıysa yok', () => {
  const simdi = new Date('2026-11-08T10:00:00Z');
  assert.equal(walArsivUyarisi(wal(), simdi), null);
  assert.equal(walArsivUyarisi(null, simdi), null);
  assert.equal(walArsivUyarisi(wal({ acik: false, sonArsivZamani: null, hataSayisi: 4, sonHataZamani: '2026-11-08T09:59:00.000Z' }), simdi), null);
  assert.match(walArsivUyarisi(wal({ hataSayisi: 7, sonHataZamani: '2026-11-08T09:59:00.000Z', sonHataWal: '00000001000000000000000A' }), simdi) ?? '',
    /^WAL arşivi takıldı: 00000001000000000000000A arşivlenemiyor/);
  assert.match(walArsivUyarisi(wal({ sonArsivZamani: null, hataSayisi: 1, sonHataZamani: '2026-11-08T09:59:00.000Z' }), simdi) ?? '', /takıldı/);
  // Eski hata yeni bir arşivle geçmişse uyarı yok.
  assert.equal(walArsivUyarisi(wal({ hataSayisi: 2, sonHataZamani: '2026-11-08T09:00:00.000Z' }), simdi), null);
  assert.equal(walArsivUyarisi(wal({ sonArsivZamani: '2026-11-08T09:00:00.000Z' }), simdi), null);
  assert.equal(walArsivUyarisi(wal({ sonArsivZamani: '2026-11-08T08:45:00.000Z' }), simdi), 'WAL arşivi 75 dakikadır yazılmadı.');
  assert.equal(walArsivUyarisi(wal({ sonArsivZamani: null }), simdi), null);
});

test('dış kopya uyarısı: 8 günden eski, hiç yok ya da son deneme başarısızsa; WAL arşivi kapalıyken ya da kayıt okunmadıysa yok', () => {
  const simdi = new Date('2026-11-08T10:00:00Z');
  const yedi = kopya('2026-11-01T09:00:00.000Z');
  assert.equal(disKopyaUyarisi(true, { son: yedi, sonBasarili: yedi }, simdi), null);
  const dokuz = kopya('2026-10-30T09:00:00.000Z');
  assert.equal(disKopyaUyarisi(true, { son: dokuz, sonBasarili: dokuz }, simdi), 'Son şifreli dış kopya 9 gün önce alındı; diski değiştirip yeni kopya alın.');
  assert.equal(disKopyaUyarisi(true, { son: null, sonBasarili: null }, simdi), 'WAL arşivinin şifreli dış kopyası hiç alınmamış (npm run yedek -- dis-kopya).');
  const kotu = kopya('2026-11-08T09:00:00.000Z', 'basarisiz');
  assert.equal(disKopyaUyarisi(true, { son: kotu, sonBasarili: yedi }, simdi), 'Son şifreli dış kopya başarısız oldu (disk yok).');
  assert.equal(disKopyaUyarisi(false, { son: null, sonBasarili: null }, simdi), null);
  assert.equal(disKopyaUyarisi(true, undefined, simdi), null);
});

test('gün içi koruma: ekran özeti ve genel uyarı listesi aynı metni taşır', () => {
  const simdi = new Date('2026-11-08T10:00:00Z');
  const w = wal({ hataSayisi: 1, sonHataZamani: '2026-11-08T09:59:00.000Z' });
  const d = { son: null, sonBasarili: null };
  const o = gunIciKoruma(w, d, simdi);
  assert.equal(o.walArsivi, w);
  assert.match(o.walUyarisi ?? '', /takıldı/);
  assert.match(o.disKopyaUyarisi ?? '', /hiç alınmamış/);
  const genel = uyarilar({
    simdi, surecBaslangici: simdi, isler: [], yedek: { durum: 'acik', sonYedek: simdi, disKopya: d }, yedekDiski: null, veritabaniDiski: null, walArsivi: w,
  });
  assert.deepEqual(genel.map((u) => u.ileti), [o.walUyarisi, o.disKopyaUyarisi]);
  assert.deepEqual(genel.map((u) => u.tur), ['yedek', 'yedek']);
  assert.deepEqual(gunIciKoruma(null, undefined, simdi), { walArsivi: null, sonDisKopya: null, sonBasariliDisKopya: null, walUyarisi: null, disKopyaUyarisi: null });
});
