import { describe, expect, it } from 'vitest';
import { ESKI_CIZIM, MERKEZDEN_EKLENIR, eskiCizim, eskiCizimGorevi, merkezBagi, merkezDosyasiniKoy, merkezKontrolIstegi, merkezUyarilari } from '../../ortak/cizim/cekirdek/cizim-merkezi.ts';
import { cevapla } from './baglanti.ts';
import type { Istemci, IstekGirdisi } from './baglanti.ts';

const O1 = 'a'.repeat(64);
const O2 = 'b'.repeat(64);

describe('Arkon dosyaları Çizim Merkezi\'nden (kart #800)', () => {
  it('merkez bağı yalnız geçerli belge no ve özet taşıyan kayıttadır; yerel yükleme bağsızdır', () => {
    expect(merkezBagi({ kind: 'pdf', name: 'a.pdf', merkez: 12, merkezOzet: O1 })).toEqual({ belgeId: 12, ozet: O1 });
    expect(merkezBagi({ kind: 'pdf', name: 'a.pdf' })).toBeNull();
    expect(merkezBagi({ kind: 'pdf', name: 'a.pdf', merkez: 12, merkezOzet: 'kisa' })).toBeNull();
    expect(merkezBagi({ kind: 'pdf', name: 'a.pdf', merkez: '12', merkezOzet: O1 })).toBeNull();
    expect(merkezBagi({ kind: 'pdf', name: 'a.pdf', merkez: 0, merkezOzet: O1 })).toBeNull();
  });

  it('kontrol isteği yalnız merkez bağlı dosyaları, belge başına bir kez sorar', () => {
    const files = [
      { kind: 'pdf', name: 'a.pdf', merkez: 3, merkezOzet: O1 },
      { kind: 'model', name: 'y.step' },
      { kind: 'model', name: 'b.step', merkez: 3, merkezOzet: O1 },
      { kind: 'model', name: 'c.step', merkez: 4, merkezOzet: O2 },
    ];
    expect(merkezKontrolIstegi(files)).toEqual([{ belgeId: 3, ozet: O1 }, { belgeId: 4, ozet: O2 }]);
    expect(merkezKontrolIstegi([])).toEqual([]);
  });

  it('uyarı: yeni revizyon ve yayından kalkan görünür, güncel olan görünmez', () => {
    expect(merkezUyarilari([
      { belgeId: 1, durum: 'guncel', ozet: O1 },
      { belgeId: 2, durum: 'yeni-revizyon', ozet: O2 },
      { belgeId: 3, durum: 'yayindan-kalkti', ozet: null },
    ])).toEqual({ 2: 'yeni-revizyon', 3: 'yayindan-kalkti' });
  });

  it('güncelleme aynı dosya kaydının yerine geçer: sıra, ana resim ve plan korunur; ad değişirse ana resim yeni ada taşınır', () => {
    const paket = {
      files: [{ kind: 'pdf', name: 'Flans.pdf', merkez: 5, merkezOzet: O1 }, { kind: 'model', name: 'yerel.step' }],
      primary: 'Flans.pdf',
    };
    const yeni = { kind: 'pdf', name: 'Flans.pdf', merkez: 5, merkezOzet: O2 };
    const r = merkezDosyasiniKoy(paket, yeni);
    expect(r).toEqual({ files: [yeni, paket.files[1]], primary: 'Flans.pdf', planSifirla: false, yerineGecti: true });
    expect(merkezDosyasiniKoy(paket, { ...yeni, name: 'Flans-B.pdf' }).primary).toBe('Flans-B.pdf');
    // Ana resim başka dosyadaysa güncellenen dosya onu değiştirmez.
    expect(merkezDosyasiniKoy({ ...paket, primary: 'yerel.step' }, yeni).primary).toBe('yerel.step');
  });

  it('ilk ekleme yerel yüklemedeki gibi aynı türdekinin yerini alır; PDF ana resim olur ve plan sıfırlanır', () => {
    const paket = { files: [{ kind: 'pdf', name: 'eski.pdf' }, { kind: 'model', name: 'm.step' }], primary: 'm.step' };
    const yeni = { kind: 'pdf', name: 'Yeni.pdf', merkez: 9, merkezOzet: O1 };
    expect(merkezDosyasiniKoy(paket, yeni)).toEqual({ files: [paket.files[1], yeni], primary: 'Yeni.pdf', planSifirla: true, yerineGecti: false });
    const model = { kind: 'model', name: 'Mil.step', merkez: 10, merkezOzet: O2 };
    const bos = merkezDosyasiniKoy({ files: [], primary: null }, model);
    expect([bos.primary, bos.planSifirla]).toEqual(['Mil.step', true]);
  });

  it('köprü: seçici listesi, alma ve kontrol TMI Çizim Merkezi uçlarına gider', async () => {
    const cagrilar: { yontem: string; yol: string; govde?: unknown }[] = [];
    const belge = { id: 3, ad: 'Flans', tur: 'teknik-resim', harf: 'A', tip: 'pdf', dosyaAdi: 'Flans.pdf', ozet: O1 };
    const ekle = { ozet: O1, boyut: 10, kayit: { kind: 'pdf', name: 'Flans.pdf', merkez: 3, merkezOzet: O1 } };
    const durumlar = [{ belgeId: 3, durum: 'yeni-revizyon', ozet: O2 }];
    const istemci = {
      get: async (yol: string) => { cagrilar.push({ yontem: 'GET', yol }); return yol.includes('/kontrol') ? { durumlar } : { belgeler: [belge] }; },
      post: async (yol: string, govde?: unknown) => { cagrilar.push({ yontem: 'POST', yol, govde }); return ekle; },
    } as unknown as Istemci;
    const g = (yontem: string, yol: string, sorgu = ''): IstekGirdisi => ({ yontem, yol, sorgu: new URLSearchParams(sorgu), govde: undefined });
    expect((await cevapla(istemci, g('GET', '/merkez/belgeler', 'q=fl%C4%B1ns'))).govde).toEqual([belge]);
    expect((await cevapla(istemci, g('POST', '/merkez/belgeler/3/al'))).govde).toEqual(ekle);
    expect((await cevapla(istemci, g('GET', '/merkez/kontrol', `d=3:${O1}`))).govde).toEqual(durumlar);
    expect(cagrilar.map((c) => `${c.yontem} ${c.yol}`)).toEqual([
      `GET /arkon/cizim-merkezi/belgeler?ara=${encodeURIComponent('flıns')}`,
      'POST /arkon/cizim-merkezi/belgeler/3/ekle',
      `GET /arkon/cizim-merkezi/kontrol?dosyalar=${encodeURIComponent(`3:${O1}`)}`,
    ]);
  });
});

describe('Dosya ekleme yolu (Terminal kural 2/5)', () => {
  it('boş dosya alanı dosyanın yalnız belge merkezinden eklendiğini söyler', () => {
    expect(MERKEZDEN_EKLENIR).toBe('Dosyalar TMI belge merkezinden eklenir');
  });
});

// 19.1: yeni revizyon yayındayken terminal eski çizimi "KALİTE ONAYLI" göstermez; başlatma görevi uyarıya döner.
describe('Terminalde eski çizim', () => {
  const oz = (c: string) => c.repeat(64);
  const files = [{ kind: 'pdf', name: 'a.pdf', merkez: 3, merkezOzet: oz('a') }, { kind: 'step', name: 'b.step', merkez: 4, merkezOzet: oz('b') }, { kind: 'pdf', name: 'yerel.pdf' }];

  it('merkez dosyalarından biri eskiyse durumu döner; yeni revizyon yayından kalkmaya üstündür; güncel ya da yerel dosyada null', () => {
    expect(eskiCizim(files, {})).toBeNull();
    expect(eskiCizim(files, { 4: 'yayindan-kalkti' })).toBe('yayindan-kalkti');
    expect(eskiCizim(files, { 4: 'yayindan-kalkti', 3: 'yeni-revizyon' })).toBe('yeni-revizyon');
    expect(eskiCizim(files, { 9: 'yeni-revizyon' })).toBeNull();
    expect(eskiCizim(null, { 3: 'yeni-revizyon' })).toBeNull();
    expect(ESKI_CIZIM['yeni-revizyon'].rozet).toBe('ESKİ REVİZYON');
  });

  it('başlatan görev (başlat, devam, yeniden başlat) uyarıya ve çağrıya döner; öteki görevler ve güncel çizim değişmez', () => {
    const baslat = { act: 'start', t: 'İşi başlat' };
    expect(eskiCizimGorevi(baslat, null)).toBe(baslat);
    for (const act of ['start', 'resume', 'restart']) {
      expect(eskiCizimGorevi({ act }, 'yeni-revizyon')).toMatchObject({ t: 'Çizimin yeni revizyonu yayında', act: 'call', tone: 'var(--stop)' });
    }
    const say = { act: 'sample' };
    expect(eskiCizimGorevi(say, 'yeni-revizyon')).toBe(say);
    expect(eskiCizimGorevi(null, 'yeni-revizyon')).toBeNull();
  });
});
