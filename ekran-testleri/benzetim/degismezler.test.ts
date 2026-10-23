import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  adimSaglamDenetimi, binde, emirOzetiDenetimi, gunSonuDenetle, hareketIzDenetimi, malKabulIzDenetimi, sayimIzDenetimi, stokEksiDenetimi,
  stokToplamDenetimi, ucAdi, ucSureleri, yavasUcDenetimi, yuzdelik,
} from './degismezler.ts';
import { KosuKaydi } from './kayit.ts';
import { DOSYA, adimSatiriOku } from './sozlesme.ts';
import type { Cevap, RolIstemcisi } from './senaryo.ts';
import type { AdimSatiri } from './sozlesme.ts';

const gecici = mkdtempSync(join(tmpdir(), 'tmiv2-degismez-test-'));
after(() => { rmSync(gecici, { recursive: true, force: true }); });

const isEmri = (id: number, sira: number, saglamAdet: number | null, ek: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ id, opNo: sira * 10, sira, bagimlilik: 'bekleyen', saglamAdet, fason: null, ...ek });

describe('saf denetimler', () => {
  it('miktar binde birlik tam sayıdır; sayı olmayan null', () => {
    assert.equal(binde('12.5'), 12500);
    assert.equal(binde('-0.001'), -1);
    assert.equal(binde('abc'), null);
    assert.equal(binde(3), null);
  });

  it('eksi stok onaylı eksi hareketi yoksa ihlaldir', () => {
    const satirlar = [
      { malzemeId: 1, toplam: '5.000', serbest: '5.000', durum: 'yeterli' },
      { malzemeId: 2, toplam: '-2.000', serbest: '-2.000', durum: 'eksi' },
      { malzemeId: 3, toplam: '1.000', serbest: '-1.000', durum: 'yeterli' },
    ];
    const d = stokEksiDenetimi(satirlar, new Set([3]));
    assert.deepEqual(d.ihlaller.map((i) => i.yer), ['malzeme 2']);
    assert.equal(d.izinli, 1);
  });

  it('adımın sağlamı önceki adımın sağlamını aşamaz; bağımsız adım ve bölünmüş emir denetlenmez', () => {
    const emir = { id: 1, emirNo: 'BNZ-EMIR-1', isEmirleri: [isEmri(12, 2, 8), isEmri(11, 1, 5), isEmri(13, 3, 9, { bagimlilik: 'bagimsiz' })] };
    const d = adimSaglamDenetimi(emir);
    assert.equal(d.ihlaller.length, 1);
    assert.match(d.ihlaller[0]?.neden ?? '', /sağlam 8 > giren 5/);
    assert.equal(adimSaglamDenetimi({ ...emir, isEmirleri: [isEmri(11, 1, 5), isEmri(12, 2, 5), isEmri(14, 3, null)] }).ihlaller.length, 0);
    const bolunmus = adimSaglamDenetimi({ ...emir, parti: { ustEmirId: null, birlestigiEmirId: null, altEmirIdleri: [7] } });
    assert.deepEqual(bolunmus, { ihlaller: [], atlandi: true });
  });

  it('fasondan dönen gönderileni aşamaz', () => {
    const fason = { gonderilen: 4, donenSaglam: 4, donenHurda: 1 };
    assert.match(adimSaglamDenetimi({ id: 1, emirNo: 'E', isEmirleri: [isEmri(11, 1, null, { fason })] }).ihlaller[0]?.neden ?? '', /dönen 5 > gönderilen 4/);
  });

  it('isEmirleri listesi yoksa sessizce geçmez', () => {
    assert.throws(() => adimSaglamDenetimi({ id: 1 }), /isEmirleri/);
  });

  it('sayım iş emrine, iş emri sayımın emrine bağlıdır', () => {
    const isler = new Map([[1, new Set([11, 12])], [2, new Set<number>()]]);
    const olay = (id: string, emirId: number, isEmriId: number | null, olayTuru = 'saglam'): Record<string, unknown> =>
      ({ id, olay: olayTuru, emir: { id: emirId, emirNo: `E${String(emirId)}` }, isEmri: isEmriId === null ? null : { id: isEmriId } });
    const ihlaller = sayimIzDenetimi([
      olay('a', 1, 11), olay('b', 1, null), olay('c', 1, 99), olay('d', 2, null), olay('e', 3, null), olay('f', 1, null, 'baslatma'),
    ], isler);
    assert.deepEqual(ihlaller.map((i) => i.yer), ['sayım b (E1)', 'sayım c (E1)']);
  });

  it('satın alma kabulü siparişe bağlıdır, başka tür bağlı olamaz', () => {
    assert.equal(malKabulIzDenetimi({ no: 'MK1', tur: 'satin_alma' }, [{ sira: 1, siparisSatirId: 5 }]).length, 0);
    assert.equal(malKabulIzDenetimi({ no: 'MK1', tur: 'satin_alma' }, [{ sira: 1, siparisSatirId: null }]).length, 1);
    assert.equal(malKabulIzDenetimi({ no: 'MK2', tur: 'diger' }, [{ sira: 1, siparisSatirId: 5 }]).length, 1);
    assert.equal(malKabulIzDenetimi({ no: 'MK2', tur: 'iade' }, [{ sira: 1, siparisSatirId: null }]).length, 0);
  });

  it('hareketin belgesi: geri alma, çıkış nedeni, üretim emri', () => {
    const ihlaller = hareketIzDenetimi([
      { id: 1, tur: 'giris', girisKaynagi: null, cikisNedeni: null, uretimEmriId: null, geriAlinanId: null },
      { id: 2, tur: 'geri_alma', geriAlinanId: null },
      { id: 3, tur: 'cikis', cikisNedeni: null },
      { id: 4, tur: 'cikis', cikisNedeni: 'uretime_sarf', uretimEmriId: null },
      { id: 5, tur: 'giris', girisKaynagi: 'uretim', uretimEmriId: 9 },
    ]);
    assert.deepEqual(ihlaller.map((i) => i.yer), ['hareket 2 (geri_alma)', 'hareket 3 (cikis)', 'hareket 4 (cikis)']);
  });

  it('stok satırının toplamı bakiyelerin toplamıdır; serbest ve rezerve toplamı aşmaz', () => {
    const satir = { malzemeId: 1, toplam: '10.500', serbest: '6.000', rezerve: '4.500' };
    assert.equal(stokToplamDenetimi(satir, [{ miktar: '10.000' }, { miktar: '0.500' }]).length, 0);
    assert.match(stokToplamDenetimi(satir, [{ miktar: '10.000' }])[0]?.neden ?? '', /bakiyeler 10 != toplam 10.500/);
    assert.equal(stokToplamDenetimi({ ...satir, serbest: '11.000' }, null).length, 2);
    assert.equal(stokToplamDenetimi({ ...satir, rezerve: null }, null).length, 1);
  });

  it('emir özeti kendi içinde tutarlıdır', () => {
    assert.equal(emirOzetiDenetimi({ acik: 6, taslak: 1, planli: 2, basladi: 3 }).length, 0);
    assert.equal(emirOzetiDenetimi({ acik: 7, taslak: 1, planli: 2, basladi: 3 }).length, 1);
    assert.equal(emirOzetiDenetimi({ acik: 6 }).length, 1);
  });
});

describe('yavaş uç', () => {
  const satir = (gun: number, yol: string | null, sureMs: number, tur: AdimSatiri['tur'] = 'api'): AdimSatiri => ({
    zaman: '2026-10-23T10:00:00.000Z', gun, rol: 'ornek.depo', senaryo: 's', adim: 'a', tur, sonuc: 'gecti', sureMs,
    yontem: yol === null ? null : 'GET', yol, beklenen: null, gelen: null, ileti: null, ek: [],
  });

  it('kimlik parçaları tek uçta toplanır, sorgu atılır', () => {
    assert.equal(ucAdi('GET', '/stok/malzemeler/12/ozet?x=1'), 'GET /stok/malzemeler/:id/ozet');
    assert.equal(ucAdi('POST', '/adimli-emirler/5'), 'POST /adimli-emirler/:id');
  });

  it('yüzdelik ölçülmüş bir değer döner; boş listede null', () => {
    assert.equal(yuzdelik([], 50), null);
    assert.equal(yuzdelik([30, 10, 20], 50), 20);
    assert.equal(yuzdelik(Array.from({ length: 20 }, (_, i) => i + 1), 95), 19);
  });

  it('yalnız o günün api adımları ölçülür; eşiği aşan uç düşer', () => {
    const adimlar = [satir(1, '/a/1', 100), satir(1, '/a/2', 300), satir(1, '/b', 3000), satir(2, '/a/3', 9000), satir(1, null, 9000), satir(1, '/c', 9000, 'degismez')];
    const s = ucSureleri(adimlar, 1);
    assert.deepEqual(s.map((x) => [x.uc, x.sayi, x.p50, x.p95]), [['GET /b', 1, 3000, 3000], ['GET /a/:id', 2, 100, 300]]);
    assert.equal(yavasUcDenetimi(s).sonuc, 'dustu');
    assert.equal(yavasUcDenetimi(s, 5000).sonuc, 'gecti');
    assert.equal(yavasUcDenetimi([]).gelen, 'ölçülen uç yok');
  });
});

describe('gün sonu', () => {
  const kayitAc = (kosuId: string): KosuKaydi => new KosuKaydi({
    kok: gecici, kosuId, taban: null, tohum: 1, gunSayisi: 1, roller: ['ornek.yonetici'], senaryolar: ['s'],
    model: { kip: 'kapali', ustSinir: 0 }, simdi: () => new Date('2026-10-23T10:00:00Z'),
  });
  const satirlar = (k: KosuKaydi): AdimSatiri[] => readFileSync(join(k.klasor, DOSYA.adimlar), 'utf8').split('\n')
    .filter((s) => s !== '').map((s) => adimSatiriOku(s) as AdimSatiri);
  const liste = (satirlar: unknown[]): unknown => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 200 });

  // Sahte sunucu: yalnız GET okunur; denetim yazma isteği atarsa test düşer.
  const sahte = (cevaplar: Record<string, unknown>, okunan: string[]): RolIstemcisi => ({
    istek(yontem, yol): Promise<Cevap> {
      assert.equal(yontem, 'GET', `denetim yazmamalı: ${yontem} ${yol}`);
      assert.ok(yol.startsWith('/api/'), yol);
      okunan.push(yol.slice(4));
      const anahtar = yol.slice(4).split('?')[0] ?? yol;
      return Promise.resolve(anahtar in cevaplar ? { durum: 200, govde: cevaplar[anahtar] } : { durum: 404, govde: null });
    },
  });

  const temiz = {
    '/stok/malzemeler': liste([{ malzemeId: 1, toplam: '3.000', serbest: '3.000', rezerve: '0.000', durum: 'yeterli', konumSayisi: 1 }]),
    '/stok/malzemeler/1': { bakiyeler: [{ miktar: '3.000' }] },
    '/adimli-emirler': { emirler: [{ id: 7 }] },
    '/adimli-emirler/bitenler': liste([]),
    '/adimli-emirler/7': { emir: { id: 7, emirNo: 'BNZ-EMIR-7', isEmirleri: [isEmri(71, 1, 4), isEmri(72, 2, 4)] } },
    '/adimli-emirler/ozet': { acik: 1, taslak: 0, planli: 0, basladi: 1, geciken: 0, biten: 0 },
    '/uretim-emirleri/son-olaylar': { olaylar: [{ id: 'x', olay: 'saglam', emir: { id: 7, emirNo: 'BNZ-EMIR-7' }, isEmri: { id: 72 } }] },
    '/stok/mal-kabuller': liste([{ id: 3, no: 'MK3', tur: 'satin_alma', duzeltenId: null }]),
    '/stok/mal-kabuller/3': { belge: { id: 3, no: 'MK3', tur: 'satin_alma' }, satirlar: [{ sira: 1, siparisSatirId: 9 }] },
    '/stok/hareketler': liste([{ id: 1, tur: 'cikis', cikisNedeni: 'sevk', uretimEmriId: null, geriAlinanId: null }]),
  };

  it('temiz veride her değişmez geçer; satırlar degismez türüyle yazılır, yalnız GET atılır', async () => {
    const k = kayitAc('temiz');
    k.adim({ gun: 1, rol: 'ornek.depo', senaryo: 's', adim: 'a', tur: 'api', sonuc: 'gecti', sureMs: 50, yontem: 'GET', yol: '/stok/ozet', beklenen: '200', gelen: '200', ileti: null, ek: [] });
    const okunan: string[] = [];
    const sonuclar = await gunSonuDenetle({ kayit: k, istemci: () => sahte(temiz, okunan), gun: 1, saat: () => 0 });
    assert.deepEqual(sonuclar.map((s) => [s.ad, s.sonuc]), [
      ['stok eksiye inmez', 'gecti'], ['adım sağlamı girenden fazla değil', 'gecti'], ['iz: sayım - iş emri - emir', 'gecti'],
      ['iz: mal kabul - sipariş', 'gecti'], ['iz: hareket - belge', 'gecti'], ['toplamlar tutarlı', 'gecti'], ['yavaş uçlar p50/p95', 'gecti'],
    ]);
    const yazilan = satirlar(k).filter((s) => s.tur === 'degismez');
    assert.equal(yazilan.length, 7);
    assert.ok(yazilan.every((s) => s.gun === 1 && s.rol === 'ornek.yonetici' && s.senaryo === 'degismez'));
    assert.match(yazilan[6]?.ileti ?? '', /GET \/stok\/ozet: p50 50 ms/);
    assert.equal(okunan.filter((y) => y.startsWith('/stok/malzemeler?')).length, 1, 'stok listesi bir kez okunur');
  });

  it('bozuk veri ilgili değişmezi düşürür, okunamayan uç yalnız kendi adımını düşürür', async () => {
    const k = kayitAc('bozuk');
    const bozuk = {
      ...temiz,
      '/stok/malzemeler': liste([{ malzemeId: 1, toplam: '-1.000', serbest: '-1.000', rezerve: '0.000', durum: 'eksi', konumSayisi: 1 }]),
      '/stok/malzemeler/1': { bakiyeler: [{ miktar: '-1.000' }] },
      '/adimli-emirler/7': { emir: { id: 7, emirNo: 'BNZ-EMIR-7', isEmirleri: [isEmri(71, 1, 4), isEmri(72, 2, 6)] } },
    } as Record<string, unknown>;
    delete bozuk['/stok/hareketler'];
    const sonuclar = await gunSonuDenetle({ kayit: k, istemci: () => sahte(bozuk, []), gun: 1 });
    const sonuc = Object.fromEntries(sonuclar.map((s) => [s.ad, s]));
    assert.equal(sonuc['stok eksiye inmez']?.sonuc, 'dustu');
    assert.equal(sonuc['adım sağlamı girenden fazla değil']?.sonuc, 'dustu');
    assert.equal(sonuc['iz: hareket - belge']?.gelen, 'okunamadı');
    assert.match(sonuc['iz: hareket - belge']?.ileti ?? '', /404/);
    assert.equal(sonuc['iz: mal kabul - sipariş']?.sonuc, 'gecti');
    assert.equal(k.ozet.sayac.dustu, 3);
  });

  it('onaylı eksi hareketi olan malzeme ihlal sayılmaz', async () => {
    const cevaplar = {
      ...temiz,
      '/stok/malzemeler': liste([{ malzemeId: 1, toplam: '-1.000', serbest: '-1.000', rezerve: '0.000', durum: 'eksi', konumSayisi: 0 }]),
      '/stok/hareketler': liste([{ id: 1, tur: 'cikis', cikisNedeni: 'sevk', onayliEksi: true, geriAlindi: false }]),
    };
    const sonuclar = await gunSonuDenetle({ kayit: kayitAc('onayli'), istemci: () => sahte(cevaplar, []), gun: 1 });
    assert.equal(sonuclar[0]?.sonuc, 'gecti');
    assert.match(sonuclar[0]?.ileti ?? '', /1 malzeme onaylı eksi/);
  });

  it('okuyucu hesap koşuda yoksa değişmez bağlanmamış sayılır, hata sayılmaz', async () => {
    const k = kayitAc('rolsuz');
    const yok: RolIstemcisi = { istek: () => Promise.reject(new Error('ornek.yonetici senaryonun rol listesinde yok')) };
    const sonuclar = await gunSonuDenetle({ kayit: k, istemci: () => yok, gun: 1 });
    assert.equal(sonuclar.filter((s) => s.sonuc === 'baglanmamis').length, 6);
    assert.equal(k.ozet.sayac.dustu, 0);
  });

  it('sayfalı liste son sayfaya kadar okunur', async () => {
    const tamSayfa = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, tur: 'cikis', cikisNedeni: 'sevk' }));
    const okunan: string[] = [];
    const r: RolIstemcisi = {
      istek(_y, yol) {
        okunan.push(yol);
        if (yol.startsWith('/api/stok/hareketler')) {
          const ikinci = yol.includes('sayfa=2');
          return Promise.resolve({ durum: 200, govde: liste(ikinci ? [{ id: 999, tur: 'cikis', cikisNedeni: null }] : tamSayfa) });
        }
        const anahtar = yol.slice(4).split('?')[0] ?? yol;
        return Promise.resolve({ durum: 200, govde: (temiz as Record<string, unknown>)[anahtar] });
      },
    };
    const sonuclar = await gunSonuDenetle({ kayit: kayitAc('sayfali'), istemci: () => r, gun: 1 });
    assert.equal(okunan.filter((y) => y.startsWith('/api/stok/hareketler')).length, 2);
    assert.match(sonuclar.find((s) => s.ad === 'iz: hareket - belge')?.ileti ?? '', /hareket 999/);
  });
});
