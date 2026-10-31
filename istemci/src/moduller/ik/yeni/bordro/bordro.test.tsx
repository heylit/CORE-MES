import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { IK_OKUYAN, ikAc } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const dugme = (ad: string | RegExp) => screen.queryByRole('button', { name: ad });
const govdesi = (g: unknown) => g as Record<string, unknown>;

describe('P3 bordro', () => {
  it('ayın çalışanları listelenir; çıkmış kişi yoktur', async () => {
    ikAc('/ik/yeni/bordro/2026-09');
    const tablo = await screen.findByRole('table', { name: 'Eylül 2026 bordrosu' });
    expect(within(tablo).getByText('Mehmet Deneme')).toBeTruthy();
    expect(within(tablo).getByText('Ayşe Örnek')).toBeTruthy();
    expect(within(tablo).queryByText('Can Sınama')).toBeNull();
    expect(screen.queryByText(MOTOR_HAZIRLANIYOR)).toBeNull();
  });

  it('izinli: kesinleştirmede yalnız girdiler sunucuya gider', async () => {
    const { yazmalar } = ikAc('/ik/yeni/bordro/2026-09');
    fireEvent.click(await screen.findByRole('button', { name: 'Dönemi kesinleştir' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toBe('/ik/bordro/2026-09/kesinlestir');
    const girdiler = govdesi(yazmalar[0]?.govde)['girdiler'] as Record<string, Record<string, unknown>>;
    expect(Object.keys(girdiler).sort()).toEqual(['emp_a', 'emp_b']);
    expect(girdiler['emp_b']?.['brut']).toBe(40000);
    expect(Object.keys(girdiler['emp_b'] ?? {})).not.toContain('net');
  });

  it('izinli: hücre değişince taslak rozeti çıkar, geri alınca kalkar', async () => {
    ikAc('/ik/yeni/bordro/2026-09');
    const hucre = await screen.findByRole('spinbutton', { name: 'Mehmet Deneme ek ödeme' });
    fireEvent.change(hucre, { target: { value: '1000' } });
    fireEvent.blur(hucre);
    expect(await screen.findByText('Kaydedilmemiş değişiklik var')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri geri al' }));
    await waitFor(() => { expect(screen.queryByText('Kaydedilmemiş değişiklik var')).toBeNull(); });
  });

  it('reddedilen: salt okuyan yazma düğmelerini görmez, hücreler kapalıdır', async () => {
    const { yazmalar } = ikAc('/ik/yeni/bordro/2026-09', { kullanici: IK_OKUYAN });
    expect(await screen.findByRole('table', { name: 'Eylül 2026 bordrosu' })).toBeTruthy();
    expect(dugme('Dönemi kesinleştir')).toBeNull();
    expect(dugme('Toplu ücret güncelle')).toBeNull();
    expect((screen.getByRole('spinbutton', { name: 'Mehmet Deneme ek ödeme' }) as HTMLInputElement).disabled).toBe(true);
    expect(yazmalar).toHaveLength(0);
  });
});

describe('P3 hesaplamalar ve maliyet planı', () => {
  it('brüt → net sonucu motordan gelir; sekme adresten açılır', async () => {
    ikAc('/ik/yeni/hesaplamalar/netbrut');
    expect(await screen.findByRole('button', { name: 'Net → brüt', pressed: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Brüt → net' }));
    expect(await screen.findAllByText('Toplam işveren maliyeti')).not.toHaveLength(0);
  });

  it('maliyet planı kişileri ve yükümlülükleri gösterir', async () => {
    ikAc('/ik/yeni/maliyet-plani');
    expect(await screen.findByRole('heading', { name: 'Maliyet planı', level: 2 })).toBeTruthy();
    expect(await screen.findByText('Kıdem tazminatı karşılığı')).toBeTruthy();
  });
});

describe('P3 ayarlar', () => {
  it('izinli: genel ayar kaydı sürümle gider', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ayarlar');
    const alan = await screen.findByRole('textbox', { name: 'Şirket adı' });
    fireEvent.change(alan, { target: { value: 'Yeni Atölye' } });
    expect(screen.getByText('1 kaydedilmemiş değişiklik')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ayarları kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toBe('/ik/ayarlar/kaydet');
    const g = govdesi(yazmalar[0]?.govde);
    expect(g['surum']).toBe(7);
    expect(govdesi(g['govde'])['sirket']).toBe('Yeni Atölye');
  });

  it('izinli: dönemli değer seçili dönemin parametresine yazılır', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ayarlar');
    fireEvent.click(await screen.findByRole('button', { name: 'Ücret, vergi ve SGK' }));
    fireEvent.change(await screen.findByRole('spinbutton', { name: /Brüt asgari ücret/ }), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ayarları kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    const govde = govdesi(govdesi(yazmalar[0]?.govde)['govde']);
    const donemler = govde['donemler'] as { params: Record<string, unknown> }[];
    expect(donemler.some((d) => d.params['asgariBrut'] === 12345)).toBe(true);
  });

  it('reddedilen: salt okuyan kaydet ve dönem düğmelerini görmez, alanlar kapalıdır', async () => {
    ikAc('/ik/yeni/ayarlar', { kullanici: IK_OKUYAN });
    expect((await screen.findByRole('textbox', { name: 'Şirket adı' }) as HTMLInputElement).disabled).toBe(true);
    expect(dugme('Ayarları kaydet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ücret, vergi ve SGK' }));
    expect(await screen.findByRole('button', { name: 'Bu dönemle hesap dene' })).toBeTruthy();
    expect(dugme('Yeni dönem')).toBeNull();
    expect(dugme('Dönemleri yönet')).toBeNull();
  });
});

describe('P3 kişi sayfası parçaları', () => {
  it('ücret sekmesinde bu ayın bordro tahmini görünür', async () => {
    ikAc('/ik/yeni/calisan/emp_b');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ücret' }));
    expect(await screen.findByRole('region', { name: /bordro tahmini$/ })).toBeTruthy();
  });
});
