import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, KAPI, OKUYAN, rrAc, sunucuKur, type Istek } from '../test-ortak.tsx';
import { agacSirasi, dugumAdedi, onizlemeMiktari, onizlemeOzeti } from './kurallar.ts';
import { onizlemeOrnegi } from './onizleme-ornegi.ts';
import { rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const PLANLAMA: Kullanici = { id: 7, ad: 'Deneme 7', islemler: [KAPI, 'sayfa.recete-rota', 'recete-rota.oku', 'rota.emre-kopyala'] as Kullanici['islemler'] };
const ONIZLEME = '/rota/revizyonlar/71/patlatma-onizleme';
const yazmalar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem !== 'GET');
const bolumAc = () => screen.findByRole('region', { name: 'Ürün ve rotalar' });

describe('1476-F patlamış rota kuralları', () => {
  it('ağaç sırası kök önce ve yol sırasıyla; özet katman, parça ve adım sayar; adet kök başına x miktar', () => {
    const d = onizlemeOrnegi().dugumler;
    expect(agacSirasi(d).map((x) => x.dugum)).toEqual(['0', '0.1', '0.1.1']);
    expect(agacSirasi([{ ...d[0]!, dugum: '0.10' }, { ...d[0]!, dugum: '0.2' }]).map((x) => x.dugum)).toEqual(['0.2', '0.10']);
    expect(onizlemeOzeti(d)).toEqual({ katman: 3, parca: 3, adim: 3 });
    expect(dugumAdedi({ kokBasina: '0.5' }, 25)).toBe(12.5);
  });
});

describe('1476-F patlamış rota görünümü: izinli', () => {
  it('emri açabilen yürürlükteki revizyonun önizlemesini görür: emir numarası, dal, tüketen adım; yazma yok', async () => {
    const istekler = sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, onizlemeOrnegi()) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: /Patlamış rota/ }));
    const tablo = await within(bolge).findByRole('table');
    expect(within(tablo).getByText('1010')).toBeTruthy();
    expect(within(tablo).getByText('K1 OP 1020 adımına girer, stoğa girmez')).toBeTruthy();
    expect(within(tablo).getAllByText('K1.1').length).toBeGreaterThan(0);
    expect(within(tablo).getByText(/bekler: K1.1 son adımı/)).toBeTruthy();
    expect(istekler.some((i) => i.yol === ONIZLEME)).toBe(true);
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('kesirli kök başına adet engeli düğümlerle birlikte gösterilir', async () => {
    sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, onizlemeOrnegi({ engel: '0.1 düğümünün kök başına adedi (0.5) 1-1000 arası tam sayı olmalı.' })) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: /Patlamış rota/ }));
    expect((await within(bolge).findByRole('alert')).textContent).toMatch(/Çok katmanlı emir açılamaz/);
    expect(within(bolge).getByRole('table')).toBeTruthy();
  });
});

describe('1476-F patlamış rota görünümü: reddedilen', () => {
  it('rota.emre-kopyala olmayan görünüm düğmesini görmez, önizleme sorulmaz; kalmış tercih şemaya düşer', async () => {
    localStorage.setItem('tc-rr1-gorunum', 'patlamis');
    const istekler = sunucuKur(OKUYAN, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: /Akış şeması/ });
    expect(within(bolge).queryByRole('button', { name: /Patlamış rota/ })).toBeNull();
    expect(istekler.some((i) => i.yol.endsWith('/patlatma-onizleme'))).toBe(false);
  });
});

// 2557 a/a: adım sayıları, girenler, yan ürün ve stoktan gelen malzeme toplamı sunucudan gelir; ekran hesaplamaz, yalnız gösterir.
const oz = (id: number, kod: string, ad: string, tur: string, birim = 'adet') => ({ id, stokKodu: kod, ad, tur, stokBirimi: birim, onayDurumu: 'onayli' });
const m = (kokBasina: string, siparis: string) => ({ kokBasina, siparis });
function malzemeliOrnek(miktar: string) {
  const o = onizlemeOrnegi({ miktar, hammaddeToplami: [{ malzeme: oz(51, 'HM-0051', 'Örnek çubuk', 'hammadde', 'kg'), toplam: m('1.2', '30') }] });
  const kok = o.dugumler[2]!;
  kok.adimlar = [{ ...kok.adimlar[0]!, hedef: m('1', '25'), adet: m('1.25', '31.25'), cikanAdet: m('1', '25'),
    girenler: [
      { malzeme: oz(13, 'YM-0013', 'Örnek mil', 'yari'), altDugum: '0.1', miktar: '2', fireYuzde: '0', toplam: m('2.5', '62.5') },
      { malzeme: oz(51, 'HM-0051', 'Örnek çubuk', 'hammadde', 'kg'), altDugum: null, miktar: '0.8', fireYuzde: '20', toplam: m('1.2', '30') },
    ],
    yanUrunler: [{ malzeme: oz(61, 'YU-0061', 'Örnek talaş', 'hurda', 'kg'), miktar: '0.1', toplam: m('0.125', '3.125') }] }];
  return o;
}
const adresler = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0])).filter((a) => a.includes('/patlatma-onizleme'));

describe('2557 patlamış rotada malzemeler', () => {
  it('önizleme miktarı: baz, 1, kesirli ve sınır üstü gönderilmez; geçerli tam sayı gönderilir', () => {
    expect(onizlemeMiktari(true, 25)).toEqual({ gonderilen: null, kesirli: false });
    expect(onizlemeMiktari(false, 1)).toEqual({ gonderilen: null, kesirli: false });
    expect(onizlemeMiktari(false, 25)).toEqual({ gonderilen: 25, kesirli: false });
    expect(onizlemeMiktari(false, 2.5)).toEqual({ gonderilen: null, kesirli: true });
    expect(onizlemeMiktari(false, 1_000_001)).toEqual({ gonderilen: null, kesirli: true });
  });

  it('sipariş kipinde miktar sorguya gider; giren, çıkan, adım malzemeleri ve stoktan gelen toplam sipariş için gösterilir', async () => {
    localStorage.setItem('tc-rr1-gorunum', 'patlamis');
    localStorage.setItem('tc-rr1-miktar-kipi', 'siparis');
    localStorage.setItem('tc-rr1-siparis', '25');
    const istekler = sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, malzemeliOrnek('25')) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const toplam = await within(bolge).findByRole('region', { name: 'Stoktan gelen malzeme toplamı' });
    expect(within(toplam).getByRole('columnheader', { name: 'Sipariş (25)' })).toBeTruthy();
    expect(within(toplam).getByText('30 kg')).toBeTruthy();
    const malz = within(bolge).getByRole('list', { name: 'OP 10 malzemeleri' });
    expect(within(malz).getByText(/alt parça \(K1\), stoktan gelmez/)).toBeTruthy();
    expect(within(malz).getByText('62,5 adet')).toBeTruthy();
    expect(within(malz).getByText(/0,8 kg \/ adet · fire %20/)).toBeTruthy();
    expect(within(malz).getByText(/yan ürün/)).toBeTruthy();
    expect(within(malz).getByText('3,125 kg')).toBeTruthy();
    const satir = within(malz).getByText(/yan ürün/).closest('tr')!;
    // 2605 a: ana sayı planlı hedef (firesiz), fire payıyla giren altında; çıkan aynı.
    expect(within(satir).getAllByText('25')).toHaveLength(2);
    expect(within(satir).getByText('fire payıyla 31,25')).toBeTruthy();
    expect(within(bolge).getByRole('columnheader', { name: 'Planlı hedef' })).toBeTruthy();
    expect(within(satir).getByText('mamul çıkar')).toBeTruthy();
    expect(adresler().every((a) => a.endsWith('/patlatma-onizleme?miktar=25'))).toBe(true);
    expect(yazmalar(istekler)).toEqual([]);
  });

  it('baz kipte miktar parametresi hiç gönderilmez, sayılar kök başınadır ve sipariş sütunu yoktur', async () => {
    localStorage.setItem('tc-rr1-gorunum', 'patlamis');
    localStorage.setItem('tc-rr1-miktar-kipi', 'baz');
    localStorage.setItem('tc-rr1-siparis', '25');
    sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, malzemeliOrnek('1')) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const toplam = await within(bolge).findByRole('region', { name: 'Stoktan gelen malzeme toplamı' });
    expect(within(toplam).queryByRole('columnheader', { name: /Sipariş/ })).toBeNull();
    expect(within(toplam).getByText('1,2 kg')).toBeTruthy();
    expect(within(bolge).getByText('2,5 adet')).toBeTruthy();
    expect(adresler().length).toBeGreaterThan(0);
    expect(adresler().some((a) => a.includes('?'))).toBe(false);
  });

  it('kesirli sipariş miktarı gönderilmez; ekran sayıların 1 adet için olduğunu söyler', async () => {
    localStorage.setItem('tc-rr1-gorunum', 'patlamis');
    localStorage.setItem('tc-rr1-miktar-kipi', 'siparis');
    localStorage.setItem('tc-rr1-siparis', '2.5');
    sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, malzemeliOrnek('1')) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    expect(await within(bolge).findByText(/sayılar kök ürünün 1 adedi içindir/)).toBeTruthy();
    expect(adresler().some((a) => a.includes('?'))).toBe(false);
  });

  it('emir açılamıyorsa (engel) adım sayıları ve toplamlar boş (—) kalır, sıfır yazılmaz', async () => {
    localStorage.setItem('tc-rr1-gorunum', 'patlamis');
    const o = malzemeliOrnek('1');
    const kok = o.dugumler[2]!;
    kok.adimlar = [{ ...kok.adimlar[0]!, hedef: null, adet: null, cikanAdet: null, girenler: kok.adimlar[0]!.girenler.map((g) => ({ ...g, toplam: null })) }];
    sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, { ...o, engel: 'Kesirli kök başına adet.', hammaddeToplami: [] }) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const malz = await within(bolge).findByRole('list', { name: 'OP 10 malzemeleri' });
    const satir = malz.closest('tr')!;
    expect(within(satir).getAllByTitle('Emir açılamadığı için hesaplanmadı')).toHaveLength(2);
    expect(within(bolge).queryByRole('region', { name: 'Stoktan gelen malzeme toplamı' })).toBeNull();
    expect(within(malz).getAllByText('—')).toHaveLength(2);
  });
});

describe('2605 a planlı hedef', () => {
  it('fire payı yoksa alt satır çıkmaz; baz kipte kök başına hedef gösterilir', async () => {
    localStorage.setItem('tc-rr1-gorunum', 'patlamis');
    localStorage.setItem('tc-rr1-miktar-kipi', 'baz');
    sunucuKur(PLANLAMA, { durum: rotaDurumu(), yazmalar: { [`GET ${ONIZLEME}`]: () => json(200, onizlemeOrnegi()) } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const tablo = await within(bolge).findByRole('table');
    expect(within(tablo).queryByText(/fire payıyla/)).toBeNull();
    const satir = within(tablo).getByText('1010').closest('tr')!;
    expect(within(satir).getAllByText('6')).toHaveLength(2);
  });
});
