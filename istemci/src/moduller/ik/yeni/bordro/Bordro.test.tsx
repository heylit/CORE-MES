import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MOTOR_HAZIRLANIYOR } from '../motor.ts';
import { IK_OKUYAN, IK_YONETICI, ikAc, ornekVeri } from '../test-ortak.tsx';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { Hesaplamalar } from './index.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const dugme = (ad: string) => screen.queryByRole('button', { name: ad });
const baslik = (ad: string) => screen.findByRole('heading', { name: ad, level: 2 });

// Eylül 2026'da çalışan biri için kesinleşmiş bordro (uydurma tutar).
function kesinVeri() {
  const v = ornekVeri();
  v.kayitlar = v.kayitlar.map((k) => (k.kimlik === 'pay_emp_b_2026-09'
    ? { ...k, govde: { ...k.govde, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0, snap: { brut: 40000, toplam: 40000, net: 31000, gv: 1000, dv: 50, sgk: 5600, iss: 400, maliyet: 49500, matrah: 34000, aMat: 0, gun: 30 } } }
    : k));
  return v;
}

describe('Bordro', () => {
  it('izinli: yönetici dönemi kesinleştirir; sunucuya yalnız girdiler gider, hesap sonucu gitmez', async () => {
    const { yazmalar } = ikAc('/ik/yeni/bordro/2026-10');
    await baslik('Bordro');
    expect(screen.getByText('Ekim 2026')).toBeTruthy();
    fireEvent.click(dugme('Dönemi kesinleştir') as HTMLElement);
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/ik/bordro/2026-10/kesinlestir')).toBe(true); });
    const govde = yazmalar.find((y) => y.yol === '/ik/bordro/2026-10/kesinlestir')?.govde as { girdiler: Record<string, Record<string, unknown>> };
    expect(Object.keys(govde.girdiler).sort()).toEqual(['emp_a', 'emp_b']);
    expect(govde.girdiler['emp_a']).toMatchObject({ brut: 50000 });
    expect(govde.girdiler['emp_a']).not.toHaveProperty('net');
    expect(govde.girdiler['emp_a']).not.toHaveProperty('snap');
  });

  it('reddedilen: salt okuyan kesinleştiremez, girdileri değiştiremez', async () => {
    const { yazmalar } = ikAc('/ik/yeni/bordro/2026-10', { kullanici: IK_OKUYAN });
    await baslik('Bordro');
    expect(dugme('Dönemi kesinleştir')).toBeNull();
    expect((screen.getByLabelText('Ayşe Örnek aylık brüt') as HTMLInputElement).disabled).toBe(true);
    expect(yazmalar).toEqual([]);
  });

  it('taslak: hücre değişince hesap motorda yeniden yapılır ve kaydedilmemiş değişiklik görünür', async () => {
    ikAc('/ik/yeni/bordro/2026-10');
    await baslik('Bordro');
    const toplam = () => within(screen.getByText('Toplam brüt', { selector: 'p, span, div, dt, h3, strong' }).closest('article, section, div') as HTMLElement).queryAllByText(/₺/)[0]?.textContent;
    const once = toplam();
    const hucre = screen.getByLabelText('Ayşe Örnek ek ödeme');
    fireEvent.change(hucre, { target: { value: '10000' } });
    fireEvent.blur(hucre);
    expect(await screen.findByText('Kaydedilmemiş değişiklik var')).toBeTruthy();
    expect(toplam()).not.toBe(once);
  });

  it('kesinleşmiş ay: kilit açma yalnız kilit yetkisiyle; okuyan göremez', async () => {
    ikAc('/ik/yeni/bordro/2026-09', { kullanici: IK_OKUYAN, veri: kesinVeri() });
    await baslik('Bordro');
    expect(screen.getByText('1/2 kesinleşti')).toBeTruthy();
    expect(screen.queryByText('Düzeltme için kilidi aç')).toBeNull();
    expect((screen.getByLabelText('Mehmet Deneme aylık brüt') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('Hesaplamalar', () => {
  it('brüt → net sonucu motordan gelir ve adım adım gösterilir', async () => {
    ikAc('/ik/yeni/hesaplamalar', { kullanici: IK_OKUYAN });
    await baslik('Hesaplamalar');
    expect(screen.getByText('Ocak ayı adım adım')).toBeTruthy();
    expect(screen.getAllByText('₺50.000,00').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Fazla mesai ücreti' }));
    expect(await screen.findByText(/saatlik/i)).toBeTruthy();
  });

  it('motor yoksa hesap yapılmaz, hazırlanıyor iletisi çıkar', () => {
    render(<Hesaplamalar {...({ motor: null } as unknown as IkEkranOzellikleri)} />);
    expect(screen.getByText(MOTOR_HAZIRLANIYOR)).toBeTruthy();
  });
});

describe('Maliyet planı', () => {
  it('izinli: ayar yetkisiyle senaryo kaydedilir; plan genel ayara yazılır', async () => {
    const { yazmalar } = ikAc('/ik/yeni/maliyet-plani');
    await baslik('Maliyet planı');
    fireEvent.click(dugme('Senaryoyu kaydet') as HTMLElement);
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/ik/ayarlar/kaydet')).toBe(true); });
    const g = yazmalar.find((y) => y.yol === '/ik/ayarlar/kaydet')?.govde as { govde: Record<string, unknown>; surum: number };
    expect(g.govde['maliyetPlani']).toMatchObject({ zam1: 25, zam2: 10, acik: true, ekler: [] });
    expect(g.govde['sirket']).toBe('Örnek Atölye');
    expect(g.surum).toBe(7);
  });

  it('reddedilen: salt okuyan senaryoyu görür, kaydedemez', async () => {
    ikAc('/ik/yeni/maliyet-plani', { kullanici: IK_OKUYAN });
    await baslik('Maliyet planı');
    expect(dugme('Senaryoyu kaydet')).toBeNull();
    expect(screen.getByText('Bugünkü yükümlülükler')).toBeTruthy();
  });
});

describe('Ayarlar', () => {
  it('izinli: değişen genel ayar kaydedilir, öbür ayarlar korunur', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ayarlar');
    await baslik('Ayarlar');
    fireEvent.change(screen.getByLabelText('Şirket adı'), { target: { value: 'Deneme Atölye' } });
    fireEvent.click(dugme('Ayarları kaydet') as HTMLElement);
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/ik/ayarlar/kaydet')).toBe(true); });
    const g = yazmalar.find((y) => y.yol === '/ik/ayarlar/kaydet')?.govde as { govde: Record<string, unknown> };
    expect(g.govde['sirket']).toBe('Deneme Atölye');
    expect(Array.isArray(g.govde['donemler'])).toBe(true);
  });

  it('dönemli parametre seçili dönemin parametresine yazılır', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ayarlar');
    await baslik('Ayarlar');
    fireEvent.click(screen.getByRole('tab', { name: 'Ücret, vergi ve SGK' }));
    const alan = await screen.findByLabelText(/Brüt asgari ücret/);
    fireEvent.change(alan, { target: { value: '40000' } });
    fireEvent.click(dugme('Ayarları kaydet') as HTMLElement);
    await waitFor(() => { expect(yazmalar.some((y) => y.yol === '/ik/ayarlar/kaydet')).toBe(true); });
    const g = yazmalar.find((y) => y.yol === '/ik/ayarlar/kaydet')?.govde as { govde: { donemler: { params: Record<string, unknown> }[]; asgariBrut?: unknown } };
    expect(g.govde.asgariBrut).toBeUndefined();
    expect(g.govde.donemler.some((d) => d.params['asgariBrut'] === 40000)).toBe(true);
  });

  it('reddedilen: salt okuyan ayarları görür, kaydedemez ve alanlar kapalıdır', async () => {
    ikAc('/ik/yeni/ayarlar', { kullanici: IK_OKUYAN });
    await baslik('Ayarlar');
    expect(dugme('Ayarları kaydet')).toBeNull();
    expect((screen.getByLabelText('Şirket adı') as HTMLInputElement).disabled).toBe(true);
  });
});
