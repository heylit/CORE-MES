import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { kayitYazmalari, kmAc, MUAYENECI, OKUYAN, type TestKayitlari, type TestKullanicisi } from '../test-ortak.tsx';
import type { Lot, Muayene } from '../tipler.ts';
import { muayeneSatirlari, parcaKimligi } from './parca.ts';

// Parça numaraları ve adları sentetiktir.
const KAYITLAR: TestKayitlari = {
  sup: [{ _id: 's1', kod: 'T01', ad: 'Deneme Tedarik' }],
  parca: [{ _id: parcaKimligi('DNM-01'), parcaNo: 'DNM-01', ad: 'Deneme mili', malzeme: 'Deneme alaşımı', tedarikci: 's1' }],
  insp: [
    { _id: 'i1', no: 'MU-1', tur: 'Final', parcaNo: 'DNM-01 ', tarih: '2026-10-01', sonuc: 'Kabul' },
    { _id: 'i2', no: 'MU-2', tur: 'Final', parcaNo: 'DNM-01', tarih: '2026-10-05', adimli: true, sonuc: 'Devam ediyor' },
  ],
  lot: [{ _id: 'l1', no: 'LOT-1', parcaNo: 'dnm-01', tarih: '2026-10-03', karar: 'Ret', N: 50 }],
  ncr: [{ _id: 'n1', no: 'NCR-1', parcaNo: 'DNM-01', tarih: '2026-10-04', durum: 'Açık', ciddiyet: 'Majör', hataTipi: 'Ölçü' }],
  cizim: [{ _id: 'r1', parcaNo: 'DNM-02', parcaAdi: 'Deneme flanşı', dosyaAdi: 'flans.pdf', tarih: '2026-09-01', balonlar: [{ sinif: 'Kritik' }] }],
};
const ac = (k: TestKullanicisi, kayitlar = KAYITLAR) => kmAc('parcalar', k, kayitlar);
const satir = (ad: RegExp) => screen.findByRole('row', { name: ad });
const secili = (ad: RegExp) => screen.getAllByRole('tab', { name: ad }).find((t) => t.getAttribute('aria-selected') === 'true');

// jsdom tuval çizmez; FAI paketindeki grafik kurulmaz, geri kalanı sınanır.
beforeAll(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Parçalar listesi', () => {
  it('parçalar kayıtlardan birleşir (büyük-küçük harf aynı parça); durum açık NCR\'dir', async () => {
    ac(MUAYENECI);
    const s = await satir(/DNM-01/);
    expect(within(s).getByText('Açık NCR')).toBeTruthy();
    expect(within(s).getByText('Deneme mili')).toBeTruthy();
    expect(screen.getByText('2 parça')).toBeTruthy();
  });

  it('arama parça no ve adda yapılır', async () => {
    ac(MUAYENECI);
    await satir(/DNM-01/);
    fireEvent.change(screen.getByLabelText('Parça ara'), { target: { value: 'flanş' } });
    expect(screen.getByText('1 parça')).toBeTruthy();
    expect(screen.queryByRole('row', { name: /DNM-01/ })).toBeNull();
  });

  it('kayıt yokken açıklama; okuyan yükleme ve ekleme görmez', async () => {
    ac(OKUYAN, {});
    expect(await screen.findByText('Henüz parça yok')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resim / model yükle' })).toBeNull();
    expect(screen.queryByRole('button', { name: /diğer işlemler/ })).toBeNull();
  });

  it('parça ekleme formu parça numarasından türeyen kimlikle yazar ve parçayı açar', async () => {
    const s = ac(MUAYENECI);
    await satir(/DNM-01/);
    fireEvent.click(screen.getByRole('button', { name: /diğer işlemler/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Parça ekle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Parça ekle' });
    fireEvent.change(within(pencere).getByLabelText(/Parça no/), { target: { value: 'dnm-03' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(kayitYazmalari(s.yazmalar, 'parca')).toHaveLength(1); });
    const y = kayitYazmalari(s.yazmalar, 'parca')[0];
    expect(y?.yol).toContain('/kayitlar/parca/p-DNM-03/');
    expect(y?.govde).toMatchObject({ govde: { parcaNo: 'dnm-03' } });
  });
});

describe('Parça sayfası', () => {
  const parcayiAc = async (k: TestKullanicisi) => {
    const s = ac(k);
    fireEvent.click(await satir(/DNM-01/));
    await screen.findByRole('heading', { level: 2, name: /DNM-01/ });
    return s;
  };

  it('başlıkta bilgiler, yarım ölçüm notu ve sekmeler görünür', async () => {
    await parcayiAc(MUAYENECI);
    expect(screen.getByText(/Tedarikçi: Deneme Tedarik \| Malzeme: Deneme alaşımı/)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('MU-2');
    expect(screen.getByRole('tab', { name: 'Muayeneler 3' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Uygunsuzluklar 1' })).toBeTruthy();
  });

  it('balonlu resmi olmayan parçada ölçüm uyarır ve Karakteristikler sekmesine döner', async () => {
    await parcayiAc(MUAYENECI);
    fireEvent.click(screen.getByRole('tab', { name: 'Muayeneler 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ölçüm yap' }));
    expect(await screen.findByText('Bu parça için önce resim veya model yükleyip balonlayın.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Karakteristikler' }).getAttribute('aria-selected')).toBe('true');
  });

  it('lot kabul parça bilgisiyle yeni kayıt görünümünü açar', async () => {
    await parcayiAc(MUAYENECI);
    fireEvent.click(screen.getByRole('button', { name: 'Lot kabul' }));
    await waitFor(() => { expect(secili(/Lot kabul/)).toBeTruthy(); });
  });

  it('muayene satırı kendi görünümünü açar; yarım ölçüm stüdyoya (eski ekrana) gider', async () => {
    await parcayiAc(MUAYENECI);
    fireEvent.click(screen.getByRole('tab', { name: 'Muayeneler 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ölçüme devam' }));
    expect(await screen.findByText('eski ekran')).toBeTruthy();
  });

  it('satırdaki Rapor ve FAI paketi önizlemeyi açar (Soru 275: bugünkü gibi)', async () => {
    const s = ac(MUAYENECI, { ...KAYITLAR, insp: [...(KAYITLAR.insp ?? []), { _id: 'i3', no: 'MU-3', tur: 'FAI', parcaNo: 'DNM-01', tarih: '2026-10-06', sonuc: 'Kabul' }] });
    fireEvent.click(await satir(/DNM-01/));
    fireEvent.click(await screen.findByRole('tab', { name: 'Muayeneler 4' }));
    const satiri = (ad: RegExp) => within(screen.getByRole('table', { name: 'Muayeneler' })).getByRole('row', { name: ad });
    expect(within(satiri(/MU-1/)).queryByRole('button', { name: 'FAI paketi' })).toBeNull();
    fireEvent.click(within(satiri(/LOT-1/)).getByRole('button', { name: 'Rapor' }));
    expect(await screen.findByRole('dialog', { name: 'LOT-1 lot kabul kaydı' })).toBeTruthy();
    expect(s.yazmalar).toEqual([]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'LOT-1 lot kabul kaydı' })).getByRole('button', { name: 'Kapat' }));
    fireEvent.click(within(satiri(/MU-3/)).getByRole('button', { name: 'FAI paketi' }));
    expect(await screen.findByRole('dialog', { name: 'FAI paketi: MU-3' })).toBeTruthy();
  });

  it('okuyan parça sayfasında yazma düğmelerini görmez', async () => {
    await parcayiAc(OKUYAN);
    for (const ad of ['Ölçüm yap', 'Lot kabul', 'Uygunsuzluk bildir', 'Düzenle']) expect(screen.queryByRole('button', { name: ad })).toBeNull();
  });

  it('Belgeler sekmesi ortak ek bölümünü taşır; okuyan belge ekleyemez', async () => {
    await parcayiAc(MUAYENECI);
    fireEvent.click(screen.getByRole('tab', { name: 'Belgeler' }));
    expect(screen.getByRole('button', { name: 'Belge ekle' })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    await parcayiAc(OKUYAN);
    fireEvent.click(screen.getByRole('tab', { name: 'Belgeler' }));
    expect(screen.queryByRole('button', { name: 'Belge ekle' })).toBeNull();
  });

  it('Parçalar düğmesi listeye döner', async () => {
    await parcayiAc(MUAYENECI);
    fireEvent.click(screen.getByRole('button', { name: 'Parçalar' }));
    await waitFor(() => { expect(screen.getByText('2 parça')).toBeTruthy(); });
  });
});

describe('Muayene satırları', () => {
  it('muayene ve lot birlikte yeniden eskiye dizilir', () => {
    const s = muayeneSatirlari(KAYITLAR.insp as Muayene[], KAYITLAR.lot as Lot[]);
    expect(s.map((r) => r.no)).toEqual(['MU-2', 'LOT-1', 'MU-1']);
    expect(s[1]?.tur).toBe('Lot kabul (N 50)');
    expect(s[0]?.tur).toBe('Final (adım adım)');
  });
});
