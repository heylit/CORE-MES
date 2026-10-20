import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ikinciMenuSayacSemasi, kayitAramaCevapSemasi, kayitAramaSorguSemasi } from './ikinci-menu.ts';
import { aramaUcuGecerliMi, ikinciMenuHatalari, ikinciMenulerinHatalari, maddeGorunurMu } from './sayfa-tanimi.ts';
import type { IkinciMenuBaglami, IkinciMenuTanimi } from './sayfa-tanimi.ts';

const BAGLAM: IkinciMenuBaglami = {
  sayfaYollari: ['/ornek', '/baska'],
  islemMi: (i) => ['sayfa.ornek', 'ornek.oku', 'ornek.yaz'].includes(i),
  simgeMi: (s) => ['box', 'list', 'cube'].includes(s),
};

const GECERLI = {
  kok: '/ornek',
  baslik: 'Örnek Modül',
  simge: 'cube',
  sayacUcu: '/ornek/menu-sayaclari',
  gruplar: [
    { maddeler: [{ anahtar: 'liste', baslik: 'Liste', yol: '/ornek', simge: 'list', islem: 'sayfa.ornek' }] },
    { baslik: 'Tanımlar', maddeler: [{ anahtar: 'kutular', baslik: 'Kutular', yol: '/ornek/kutular', simge: 'box', islem: 'ornek.oku' }] },
  ],
} as const satisfies IkinciMenuTanimi;

type Madde = IkinciMenuTanimi['gruplar'][number]['maddeler'][number];
// İkinci grubun maddesini değiştirir; gerisi geçerli kalır: her sınama tek kuralı bozar.
const maddeyle = (degisen: Partial<Madde>): IkinciMenuTanimi => ({
  ...GECERLI,
  gruplar: [GECERLI.gruplar[0], { baslik: 'Tanımlar', maddeler: [{ ...GECERLI.gruplar[1].maddeler[0], ...degisen }] }],
});
const hatalar = (tanim: IkinciMenuTanimi, baglam: IkinciMenuBaglami = BAGLAM): string => ikinciMenuHatalari(tanim, baglam).join(' | ');

test('geçerli tanımda hata yok; madde yolu kök yolun kendisi de olabilir', () => {
  assert.deepEqual(ikinciMenuHatalari(GECERLI, BAGLAM), []);
});

test('alt yol modülün kök yolunun altında olmalı; benzer önek ve başka sayfanın yolu reddedilir', () => {
  assert.match(hatalar(maddeyle({ yol: '/baska/kutular' })), /kök yolun altında değil: \/baska\/kutular/);
  assert.match(hatalar(maddeyle({ yol: '/ornekler' })), /kök yolun altında değil: \/ornekler/);
  assert.match(hatalar(maddeyle({ yol: '/ornek/Kutu' })), /biçime uymuyor: \/ornek\/Kutu/);
  assert.match(hatalar({ ...GECERLI, kok: '/yok' }), /kök yol kayıtlı bir sayfa değil: \/yok/);
});

test('yinelenen yol ve yinelenen anahtar reddedilir', () => {
  assert.match(hatalar(maddeyle({ yol: '/ornek' })), /madde yolu yineleniyor: \/ornek/);
  assert.match(hatalar(maddeyle({ anahtar: 'liste' })), /madde anahtarı yineleniyor: liste/);
  assert.match(hatalar(maddeyle({ anahtar: 'Kutu lar' })), /madde anahtarı biçime uymuyor/);
});

test('işlem kayıtlı olmalı', () => {
  assert.match(hatalar(maddeyle({ islem: 'ornek.sil' })), /madde işlemi kayıtlı değil: ornek\.sil/);
  assert.equal(hatalar(maddeyle({ islem: 'ornek.yaz' })), '');
});

test('veya listesi: her işlem kayıtlı olmalı, liste boş yazılmaz', () => {
  assert.equal(hatalar(maddeyle({ veya: ['ornek.yaz', 'sayfa.ornek'] })), '');
  assert.match(hatalar(maddeyle({ veya: ['ornek.yaz', 'ornek.sil'] })), /madde işlemi kayıtlı değil: ornek\.sil \(\/ornek\/kutular\)/);
  assert.match(hatalar(maddeyle({ veya: [] })), /madde veya listesi boş/);
});

test('sade görünüm: tercih adı biçimli, en az bir madde, maddeler menüde olmalı', () => {
  assert.equal(hatalar({ ...GECERLI, sade: { tercih: 'ornek-depocu', maddeler: ['kutular'] } }), '');
  assert.match(hatalar({ ...GECERLI, sade: { tercih: 'ornek-depocu', maddeler: ['kutular', 'yok'] } }), /sade görünümdeki madde menüde yok: yok/);
  assert.match(hatalar({ ...GECERLI, sade: { tercih: 'ornek-depocu', maddeler: [] } }), /sade görünümde madde yok/);
  assert.match(hatalar({ ...GECERLI, sade: { tercih: 'Depocu Modu', maddeler: ['liste'] } }), /tercih adı biçime uymuyor/);
});

test('madde görünürlüğü: işlemi ya da veya listesinden biri yeter; hiçbiri yoksa görünmez', () => {
  assert.equal(maddeGorunurMu({ islem: 'ornek.oku' }, ['ornek.oku']), true);
  assert.equal(maddeGorunurMu({ islem: 'ornek.oku' }, ['ornek.yaz']), false);
  assert.equal(maddeGorunurMu({ islem: 'ornek.oku', veya: ['ornek.yaz'] }, ['ornek.yaz']), true);
  assert.equal(maddeGorunurMu({ islem: 'ornek.oku', veya: ['ornek.yaz'] }, ['sayfa.ornek']), false);
});

test('simge setteki bir simge olmalı; seti bilmeyen tarafta dolu olması yeter', () => {
  assert.match(hatalar(maddeyle({ simge: 'yok' })), /madde simgesi geçersiz: "yok"/);
  assert.match(hatalar({ ...GECERLI, simge: 'yok' }), /menü simgesi geçersiz: "yok"/);
  const setsiz: IkinciMenuBaglami = { sayfaYollari: BAGLAM.sayfaYollari, islemMi: BAGLAM.islemMi };
  assert.equal(hatalar(maddeyle({ simge: 'yok' }), setsiz), '');
  assert.match(hatalar(maddeyle({ simge: ' ' }), setsiz), /madde simgesi geçersiz/);
});

test('boş başlık, boş grup, grupsuz menü ve biçimsiz sayaç ucu reddedilir', () => {
  assert.match(hatalar(maddeyle({ baslik: ' ' })), /madde başlığı boş/);
  assert.match(hatalar({ ...GECERLI, baslik: '' }), /menü başlığı boş/);
  assert.match(hatalar({ ...GECERLI, gruplar: [] }), /menüde grup yok/);
  assert.match(hatalar({ ...GECERLI, gruplar: [GECERLI.gruplar[0], { baslik: 'Boş', maddeler: [] }] }), /grupta madde yok: "Boş"/);
  assert.match(hatalar({ ...GECERLI, gruplar: [GECERLI.gruplar[1], { ...GECERLI.gruplar[0], baslik: 'Tanımlar' }] }), /grup yineleniyor: "Tanımlar"/);
  assert.match(hatalar({ ...GECERLI, sayacUcu: '/Ornek sayac' }), /sayaç ucu yol biçiminde değil/);
});


test('bir sayfaya iki ikinci menü verilemez; hata hangi menüde olduğunu söyler', () => {
  assert.deepEqual(ikinciMenulerinHatalari([GECERLI], BAGLAM), []);
  assert.deepEqual(ikinciMenulerinHatalari([GECERLI, GECERLI], BAGLAM), ['aynı sayfaya iki ikinci menü: /ornek']);
  assert.deepEqual(ikinciMenulerinHatalari([maddeyle({ islem: 'ornek.sil' })], BAGLAM), ['/ornek: madde işlemi kayıtlı değil: ornek.sil (/ornek/kutular)']);
});

test('sayaç cevabı: anahtar -> eksi olmayan tam sayı ya da null; başka değer reddedilir', () => {
  assert.deepEqual(ikinciMenuSayacSemasi.parse({ kutular: 3, liste: null, bos: 0 }), { kutular: 3, liste: null, bos: 0 });
  assert.equal(ikinciMenuSayacSemasi.safeParse({ kutular: '3' }).success, false);
  assert.equal(ikinciMenuSayacSemasi.safeParse({ kutular: -1 }).success, false);
  assert.equal(ikinciMenuSayacSemasi.safeParse({ kutular: 1.5 }).success, false);
  assert.equal(ikinciMenuSayacSemasi.safeParse([1]).success, false);
});

test('kayıt arama: uygulama içi adresli cevap ve sınırdaki sorgu geçer', () => {
  const cevap = { sonuclar: [{ anahtar: 'e1', baslik: 'UE-0001', aciklama: null, yol: '/uretim-emirleri/1' }, { anahtar: 'm1', baslik: 'Mil', aciklama: 'Mamul', yol: '/malzemeler?ara=MIL-01' }] };
  assert.deepEqual(kayitAramaCevapSemasi.parse(cevap), cevap);
  assert.equal(kayitAramaSorguSemasi.parse({ q: '  ue ' }).q, 'ue');
});

test('reddedilen kayıt arama: dış adres, protokol, üst klasör, fazla sonuç, kısa ve uzun sorgu', () => {
  const tek = (yol: string) => ({ sonuclar: [{ anahtar: 'x', baslik: 'x', aciklama: null, yol }] });
  for (const yol of ['//dis.example/x', 'https://dis.example', 'ornek:x', '/a/../b', '/a/..', '/a b']) {
    assert.equal(kayitAramaCevapSemasi.safeParse(tek(yol)).success, false, yol);
  }
  const alti = { sonuclar: Array.from({ length: 6 }, (_, i) => ({ anahtar: `k${i}`, baslik: 'x', aciklama: null, yol: '/a' })) };
  assert.equal(kayitAramaCevapSemasi.safeParse(alti).success, false);
  assert.equal(kayitAramaSorguSemasi.safeParse({ q: ' u ' }).success, false);
  assert.equal(kayitAramaSorguSemasi.safeParse({ q: 'x'.repeat(61) }).success, false);
});

test('arama ucu düz api yoludur; sorgulu, büyük harfli ya da boşluklu yol reddedilir', () => {
  assert.equal(aramaUcuGecerliMi('/uretim-emirleri/ara'), true);
  for (const uc of ['/ornek/ara?q=', '/Ornek/ara', '/ornek ara', 'ornek/ara', '//ornek']) assert.equal(aramaUcuGecerliMi(uc), false, uc);
});
