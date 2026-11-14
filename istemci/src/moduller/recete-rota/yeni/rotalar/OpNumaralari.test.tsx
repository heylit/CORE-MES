import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { eklenecekNumara, rotadaOlmayanNumaralar, yeniAdimNumaralari, type OpNumaralari } from './opNumaralari.ts';
import type { Adim } from './kurallar.ts';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
// 3248: açılış yatay hattır; bu dosya dikey akış şemasını ("Akış şeması") sınar.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const adim = (id: string, seq: number, opNo: number | null): Adim => ({ ...adimOrnegi({ id, seq }), opNo });
const NUMARALAR: OpNumaralari = {
  kullanilmis: [{ opNo: 10, ilkRevizyonId: 71, ilkRevizyonHarfi: 'A' }, { opNo: 20, ilkRevizyonId: 71, ilkRevizyonHarfi: 'A' },
    { opNo: 30, ilkRevizyonId: 72, ilkRevizyonHarfi: 'B' }],
  siradaki: 40,
};

describe('OP numarası tahmini (RT-31, 2519 a)', () => {
  it('yeni adımlar sırayla sıradaki numaradan 10 artarak alır; rotadaki daha büyük numara tabanı yükseltir', () => {
    const l = [adim('o10', 10, 10), adim('n1', 20, null), adim('n2', 30, null)];
    expect([...yeniAdimNumaralari(l, 40)]).toEqual([['n1', 40], ['n2', 50]]);
    expect([...yeniAdimNumaralari([adim('o90', 10, 90), adim('n1', 20, null)], 40)]).toEqual([['n1', 100]]);
    expect(yeniAdimNumaralari([adim('o10', 10, 10)], 20).size).toBe(0);
    expect(eklenecekNumara(l, 40)).toBe(60);
    expect(eklenecekNumara([adim('o10', 10, 10)], 40)).toBe(40);
  });

  it('rotada olmayan verilmiş numaralar listelenir; rotadakiler listelenmez', () => {
    expect(rotadaOlmayanNumaralar(NUMARALAR, [adim('o10', 10, 10), adim('n1', 20, null)]).map((k) => k.opNo)).toEqual([20, 30]);
  });
});

describe('Ekranda OP numarası (B-2482-R4)', () => {
  const kur = () => {
    let durum = rotaDurumu();
    return sunucuKur(YONETICI, {
      durum: () => json(200, durum),
      yazmalar: {
        'GET /rota/urunler/11/op-numaralari': () => json(200, NUMARALAR),
        'POST /rota/urunler/11/taslak-ac': () => {
          durum = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 1)]);
          return json(200, { id: 72, durum: 'taslak', surum: 1 });
        },
        'POST /rota/revizyonlar/72/kaydet': () => json(200, { id: 72, durum: 'taslak', surum: 2 }),
      },
    });
  };
  const bolumAc = async () => {
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
    // 2558 b/5: sayfa görüntüleme kipinde açılır; yazma yetkisi olan test "Düzenle" ile düzenleme kipine geçer.
    await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
    const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
    if (duzenle) fireEvent.click(duzenle);
    return bolge;
  };

  it('yeni adımın panelinde sıradaki numara yazar, başlık sıra numarasını OP gibi göstermez', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Adım ekle' }));
    const palet = within(bolge).getByRole('complementary', { name: 'Operasyon paleti' });
    expect(await within(palet).findByText('Yeni adım OP 40 alır; numarayı sistem verir.')).toBeTruthy();
    fireEvent.click(within(palet).getByRole('button', { name: /Tornalama/ }));
    const yeni = await waitFor(() => {
      const d = within(bolge).getAllByRole('button', { name: /Tornalama$/ }).filter((b) => b.getAttribute('aria-label') !== 'OP 10 Tornalama');
      expect(d.length).toBeGreaterThan(0);
      return d[0] as HTMLElement;
    });
    fireEvent.click(yeni);
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    expect(await within(panel).findByText('Numarayı sistem verir: sıradaki OP 40.')).toBeTruthy();
    expect(within(panel).getByText('T · yeni adım')).toBeTruthy();
    expect(yeni.querySelector('.tc-rr1-oseq')?.textContent).toBe('yeni');
  });

  it('revizyon geçmişi rotada olmayan verilmiş numaraları ve sıradakini gösterir', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(await within(bolge).findByRole('button', { name: 'Revizyon' }));
    fireEvent.click(within(bolge).getByRole('button', { name: /^Geçmiş/ }));
    const p = await waitFor(() => {
      const e = bolge.querySelector('[data-parca="kullanilmis-op"]');
      expect(e).not.toBeNull();
      return e as HTMLElement;
    });
    expect(p.textContent).toContain('Sıradaki yeni adım OP 40 alır.');
    expect(p.textContent).toContain('OP 20 (ilk: Rev A), OP 30 (ilk: Rev B)');
  });
});
