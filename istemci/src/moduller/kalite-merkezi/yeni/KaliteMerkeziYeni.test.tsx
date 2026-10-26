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

  it('balonlama Resim ve modeller stüdyosunda açılır (597 a)', async () => {
    kmAc('', YONETICI);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni kayıt' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Teknik resim balonla' }));
    expect(await screen.findByRole('region', { name: 'Teknik resim' })).toBeTruthy();
    expect(kmAdresi()).toBe('/kalite-merkezi/resimler');
  });

  it('Yeni menüsünden kayıt görünümüne gider', async () => {
    kmAc('', YONETICI);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni kayıt' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Uygunsuzluk (NCR)' }));
    await vi.waitFor(() => { expect(kmAdresi()).toBe('/kalite-merkezi/uygunsuzluklar'); });
  });
});
