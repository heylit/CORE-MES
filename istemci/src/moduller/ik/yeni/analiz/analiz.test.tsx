import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { IkGecmis } from '#paylasilan/sozlesme/ik.ts';
import { IK_OKUYAN, ikAc, ornekVeri } from '../test-ortak.tsx';
import type { Personel } from '../tipler.ts';

// Motor kararı (211 a) gelene kadar motor yoktur; parçanın ekranı sahte motor ve sabitlerle sınanır.
const durum = vi.hoisted(() => ({ motorVar: true }));
vi.mock('../motor.ts', async (asil) => {
  const m = await asil<object>();
  const yaka = (p: Personel) => (p.departmanId === 'dept_u' ? 'Mavi yaka' : 'Beyaz yaka');
  const sabitler = { COLLARS: ['Beyaz yaka', 'Mavi yaka'], LEVELS: ['Uzman'], collarOf: yaka, levelOf: () => 'Uzman' };
  const islevler: Record<string, (...a: never[]) => unknown> = {
    isActive: (p: Personel) => !p.cikisTarihi, leaveBalance: () => ({ kalan: 5, nextDays: 14 }), missingDocs: () => [], curBrut: (p: Personel) => p.brutMaas ?? 0,
    employedInMonth: (p: Personel) => !p.cikisTarihi, periods: () => [{ baslangic: '2026-01-01' }], S: () => ({}),
  };
  return {
    ...m,
    motorKur: () => (durum.motorVar ? islevler : null),
    ikSabitleri: () => (durum.motorVar ? sabitler : null),
  };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); durum.motorVar = true; });

const dugme = (ad: string) => screen.queryByRole('button', { name: ad });

describe('P5 Pano', () => {
  it('sayılar, bekleyen izin ve karar düğmesi; onay izin kaydını yazar', async () => {
    const { yazmalar } = ikAc('/ik/yeni');
    expect(await screen.findByText('Aktif çalışan')).toBeTruthy();
    expect(screen.getByText('Onay bekleyen izinler')).toBeTruthy();
    fireEvent.click(dugme('Onayla') as HTMLElement);
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toBe('/ik/izinler/leave_1/kaydet');
    expect(yazmalar[0]?.govde).toMatchObject({ govde: { durum: 'Onaylandı' }, surum: 3 });
  });

  it('salt okuyan karar ve ekleme düğmesi görmez', async () => {
    ikAc('/ik/yeni', { kullanici: IK_OKUYAN });
    expect(await screen.findByText('Aktif çalışan')).toBeTruthy();
    expect(dugme('Onayla')).toBeNull();
    expect(dugme('Personel ekle')).toBeNull();
  });

  it('motor yokken hesap yeri "hazırlanıyor" der, sıfır uydurmaz', async () => {
    durum.motorVar = false;
    ikAc('/ik/yeni');
    expect(await screen.findByText('Hesap motoru hazırlanıyor')).toBeTruthy();
    expect(screen.queryByText('Aktif çalışan')).toBeNull();
  });
});

describe('P5 Yapılacaklar', () => {
  it('ertele ayarlara yazar; okuyan ertele ve gizle görmez', async () => {
    const { yazmalar } = ikAc('/ik/yeni/yapilacaklar');
    expect(await screen.findByText(/Yıllık izin talebi/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ertele' })[0] as HTMLElement);
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toBe('/ik/ayarlar/kaydet');
    expect(yazmalar[0]?.govde).toMatchObject({ surum: 7 });
    cleanup();
    ikAc('/ik/yeni/yapilacaklar', { kullanici: IK_OKUYAN });
    expect(await screen.findByText(/Yıllık izin talebi/)).toBeTruthy();
    expect(dugme('Ertele')).toBeNull();
    expect(dugme('Onayla')).toBeNull();
  });
});

describe('P5 Raporlar', () => {
  it('dağılımlar ve 12 aylık giriş çıkış tablosu çizilir', async () => {
    ikAc('/ik/yeni/raporlar');
    expect(await screen.findByText('Son 12 ay işe giriş ve çıkış')).toBeTruthy();
    expect(screen.getByText('Departmana göre çalışan')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});

describe('P5 Değişiklik günlüğü', () => {
  const satir = (ek: Partial<IkGecmis>): IkGecmis => ({
    id: 'gecmis_1', kind: 'log', t: new Date().toISOString(), by: { id: 1, name: 'Deneme Yonetici', role: '' }, op: 'guncelle', rk: 'emp', rid: 'emp_b',
    label: 'Mehmet Deneme', changes: [{ f: 'pozisyon', from: 'Usta', to: null }], snap: null, ...ek,
  });
  const veri = () => ({ ...ornekVeri(), gecmis: [satir({}), satir({ id: 'gecmis_2', op: 'sil', rk: 'emp', rid: 'emp_z', label: 'Silinen Kişi', changes: [], snap: { id: 'emp_z', kind: 'emp', ad: 'Silinen' } })] });

  it('güncelleme geri alınır, silinen kayıt geri getirilir', async () => {
    const { yazmalar } = ikAc('/ik/yeni/gunluk', { veri: veri() });
    expect(await screen.findByText('Mehmet Deneme')).toBeTruthy();
    fireEvent.click(dugme('Bu değişikliği geri al') as HTMLElement);
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]).toMatchObject({ yol: '/ik/personel/emp_b/kaydet', govde: { govde: { id: 'emp_b', pozisyon: 'Usta' }, surum: 1 } });
    fireEvent.click(dugme('Silinen kaydı geri getir') as HTMLElement);
    await waitFor(() => { expect(yazmalar).toHaveLength(2); });
    expect(yazmalar[1]).toMatchObject({ yol: '/ik/personel/emp_z/kaydet', govde: { govde: { id: 'emp_z', ad: 'Silinen' } } });
  });

  it('yazma yetkisi olmayan geri alma düğmesi görmez; süzgeç boş sonuç söyler', async () => {
    ikAc('/ik/yeni/gunluk', { kullanici: IK_OKUYAN, veri: veri() });
    expect(await screen.findByText('Mehmet Deneme')).toBeTruthy();
    expect(dugme('Bu değişikliği geri al')).toBeNull();
    expect(dugme('Silinen kaydı geri getir')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Günlükte ara' }), { target: { value: 'olmayan şey' } });
    expect(screen.getByText(/Bu ölçütlerde değişiklik yok/)).toBeTruthy();
  });

  it('alan sonradan yeniden değiştiyse geri alma onay sorar', async () => {
    const { yazmalar } = ikAc('/ik/yeni/gunluk', { veri: { ...ornekVeri(), gecmis: [satir({ changes: [{ f: 'pozisyon', from: 'Usta', to: 'Şef' }] })] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Bu değişikliği geri al' }));
    expect(await screen.findByText('Kayıt sonradan yeniden değişmiş')).toBeTruthy();
    expect(yazmalar).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
  });
});
