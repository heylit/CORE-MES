import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { json, KAPI, OKUYAN, rrAc, sunucuKur, type Istek } from '../test-ortak.tsx';
import { agacSirasi, dugumAdedi, onizlemeOzeti } from './kurallar.ts';
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
