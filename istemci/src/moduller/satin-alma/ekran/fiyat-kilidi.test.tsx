import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '../../../ortak/arayuz/index.ts';
import type { PurchaseRequest, Supplier } from '../merkez/tipler.ts';
import { DEFAULT_SETTINGS } from '../merkez/constants.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import { S, V, bump } from '../merkez/store.ts';
import { KILIT_YETKISI, kilitPaneli, money, setFiyatKilidi, short } from '../merkez/util.ts';
import { FIYAT_GOREN_ISLEMLER, biriVarMi } from '../fiyat-yetkisi.ts';
import { Siparisler } from './Siparisler.tsx';
import { Talepler } from './Talepler.tsx';

// 3401-1 a: yalnız satin-alma.oku (planlama) fiyat görmez; tutar sütunu çizilmez, tutar yerine sıfır ya da tire değil kilit yazısı çıkar.
function talep(): PurchaseRequest {
  return {
    id: 't1', no: 'T-1', title: 'Deneme talep', department: 'Bakım', requester: '', priority: 'normal', needDate: '', notes: '', status: 'ordered',
    items: [{ id: 'k1', materialId: null, name: 'Deneme kalem', spec: '', qty: 10, unit: 'adet' }],
    rfqs: [], quotes: [], log: [], createdAt: 1, award: null,
  };
}
beforeEach(() => {
  S.requests = { t1: talep() };
  S.materials = {};
  S.suppliers = { f1: { id: 'f1', name: 'Deneme Tedarikçi' } as Supplier };
  S.settings = { ...DEFAULT_SETTINGS };
  V.status = 'all'; V.view = 'list';
  bump();
});
afterEach(() => { cleanup(); setFiyatKilidi(false); });

describe('satın alma merkezi: fiyat kilidi (3401-1 a)', () => {
  it('kilitliyken tutar ve kısa tutar "Yetkiniz yok" yazar, sıfır ya da tire yazmaz; kilitli değilken biçimlenir', () => {
    expect(money(1250.5)).toBe('1.250,50 ₺');
    setFiyatKilidi(true);
    expect([money(1250.5), money(null), short(2_500_000)]).toEqual(['Yetkiniz yok', 'Yetkiniz yok', 'Yetkiniz yok']);
    expect(kilitPaneli('Rapor')).toContain('Yetkiniz yok');
  });

  it('Talepler: kilitliyken Tutar sütunu çizilmez ve kilit notu durur; yetkiliyse sütun var', () => {
    setFiyatKilidi(true);
    render(<MemoryRouter><Talepler /></MemoryRouter>);
    expect(screen.getByText('Deneme talep')).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: /Tutar/ })).toBeNull();
    expect(screen.getByText(/Fiyat sütunları yetkinizde değil/)).toBeTruthy();
    cleanup();
    setFiyatKilidi(false);
    render(<MemoryRouter><Talepler /></MemoryRouter>);
    expect(screen.getByRole('columnheader', { name: /Tutar/ })).toBeTruthy();
    expect(screen.queryByText(/Fiyat sütunları yetkinizde değil/)).toBeNull();
  });

  it('Siparişler: kilitliyken tutar sütunu çizilmez ve kilit notu durur', () => {
    setFiyatKilidi(true);
    render(<MemoryRouter><Siparisler /></MemoryRouter>);
    expect(screen.queryByRole('columnheader', { name: /Tutar/ })).toBeNull();
    expect(screen.getByText(/Fiyat sütunları yetkinizde değil/)).toBeTruthy();
  });

  // Test T2: SatinAlma.tsx kilidi oturum işlemlerinden `!biriVarMi(islemler, FIYAT_GOREN_ISLEMLER)` ile kurar. Planlamanın oturumu yalnız
  // satin-alma.oku taşır (kurulum/yetki-matrisi.md); listeye oku girerse planlama fiyatı görür ve bu test düşer.
  it('planlama oturumu (yalnız satin-alma.oku): teklif fiyatı yerinde "Yetkiniz yok" ve yetki adı; satın almacıda değer', () => {
    const kilitle = (islemler: readonly string[]) => setFiyatKilidi(!biriVarMi(islemler, FIYAT_GOREN_ISLEMLER));
    kilitle(['satin-alma.oku']);
    expect(money(1250.5)).toBe('Yetkiniz yok');
    const panel = kilitPaneli('Teklif ve karar fiyatları');
    expect(panel).toContain('Yetkiniz yok');
    expect(panel).toContain(KILIT_YETKISI);
    render(<MemoryRouter><Talepler /></MemoryRouter>);
    expect(screen.queryByRole('columnheader', { name: /Tutar/ })).toBeNull();
    cleanup();
    for (const islemler of [['satin-alma.oku', 'satin-alma.fiyat-oku'], ['satin-alma.oku', 'satin-alma.yaz'], ['satin-alma.oku', 'satin-alma.onayla']]) {
      kilitle(islemler);
      expect(money(1250.5)).toBe('1.250,50 ₺');
    }
  });
});
