import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { OKUYAN, rrAc, sunucuKur } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// 2555 a: akış tablosunda işlem süresi boş adımın satırı uyarı rengi ve yazısını taşır; fason adım ve süresi olan adım taşımaz. Veriler uydurmadır.
describe('2555 akış tablosunda süresi boş adım', () => {
  it('süresi boş adım uyarı rengi ve yazısıyla görünür, süresi olan ve fason adım görünmez', async () => {
    sunucuKur(OKUYAN, { durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, [
      adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, proc: null, ins: [] }), adimOrnegi({ id: 'o30', seq: 30, opNo: 30, proc: null, fasonId: '5', stationId: null, ins: [] }),
    ])]) });
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    fireEvent.click(await within(bolge).findByRole('button', { name: /Akış tablosu/ }));
    const tablo = await within(bolge).findByRole('region', { name: 'MM-0001 rotası' });
    const uyarilar = tablo.querySelectorAll('.tc-rr1-fstep-uyari');
    expect(uyarilar.length).toBe(1);
    expect(uyarilar[0]?.querySelector('.tc-rr1-fsop')?.textContent).toBe('TOP 20');
    expect(within(tablo).getAllByText('İşlem süresi girilmedi: plan bu adımı süresiz sayar, onaya gönderilemez.')).toHaveLength(1);
  }, 30000);
});
