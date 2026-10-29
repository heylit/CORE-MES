import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { KAPISIZ, MUHENDIS, OKUYAN, YETKISIZ, YONETICI, kmAc, kmAdresi } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kalite Merkezi yeni ekran kabuğu', () => {
  it('yeni ekran kapısı olmayan kalite kullanıcısına da açılır (582)', async () => {
    kmAc('', KAPISIZ);
    expect(await screen.findByRole('button', { name: 'Yeni kayıt' })).toBeTruthy();
    expect(screen.queryByText('Bu ekran hazırlanıyor')).toBeNull();
  });

  it('okuma işlemi olmayana yetki iletisini gösterir', async () => {
    kmAc('', YETKISIZ);
    expect(await screen.findByText("Kalite Merkezi'ni görme yetkiniz yok.")).toBeTruthy();
  });

  it('bölüm sekmesi çizmez, gezinme kabuğun şeridindedir (553 1 a); yazana Yeni menüsü', async () => {
    kmAc('', YONETICI);
    expect(await screen.findByRole('button', { name: 'Yeni kayıt' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Uygunsuzluk/ })).toBeNull();
  });

  it('yalnız okuyana Yeni menüsü çıkmaz', async () => {
    kmAc('', OKUYAN);
    expect(await screen.findByRole('button', { name: 'Atölye modu' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeni kayıt' })).toBeNull();
  });

  it('ayar yetkisi olmayana Ayarlar açılmaz, Bugün açılır (eski sayfadaki gibi)', async () => {
    kmAc('ayarlar', MUHENDIS);
    expect(await screen.findByText('Bu işlem için yetkiniz yok (ayarları değiştirme).')).toBeTruthy();
    await vi.waitFor(() => { expect(kmAdresi()).toBe('/kalite-merkezi'); });
  });

  it('bilinmeyen görünümde iletiyi gösterir', async () => {
    kmAc('olmayan', YONETICI);
    expect(await screen.findByText('Böyle bir görünüm yok.')).toBeTruthy();
  });

  it('balonlama Resim ve modeller listesinde açılır, parça oradan seçilir (597 a, 799)', async () => {
    kmAc('', YONETICI);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni kayıt' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Teknik resim balonla' }));
    expect(await screen.findByRole('heading', { name: 'Resim ve modeller' })).toBeTruthy();
    expect(kmAdresi()).toBe('/kalite-merkezi/resimler');
  });

  it('Yeni menüsünden kayıt görünümüne gider', async () => {
    kmAc('', YONETICI);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni kayıt' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Uygunsuzluk (NCR)' }));
    await vi.waitFor(() => { expect(kmAdresi()).toBe('/kalite-merkezi/uygunsuzluklar'); });
  });

  it('Ctrl K kaydı adresle açar (1238): ?ac= NCR düzenleme penceresini açar, adres sorgusuz kalır', async () => {
    kmAc('uygunsuzluklar?ac=n1', YONETICI, { ncr: [{ _id: 'n1', no: 'NCR-2026-0001', tarih: '2026-10-01', durum: 'Açık', parcaNo: 'P-1', mrb: 'Karar bekliyor' }] });
    expect(await screen.findByText('NCR-2026-0001 düzenle')).toBeTruthy();
    expect(kmAdresi()).toBe('/kalite-merkezi/uygunsuzluklar');
  });

  it('Ctrl K komutu yeni kaydı adresle açar (1230 a); yalnız okuyana pencere açılmaz', async () => {
    kmAc('uygunsuzluklar?yeni=1', YONETICI);
    expect(await screen.findByText('Uygunsuzluk kaydet')).toBeTruthy();
    cleanup();
    kmAc('uygunsuzluklar?yeni=1', OKUYAN);
    expect(await screen.findByRole('button', { name: 'Atölye modu' })).toBeTruthy();
    expect(screen.queryByText('Uygunsuzluk kaydet')).toBeNull();
  });
});
