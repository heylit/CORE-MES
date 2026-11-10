import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { MesaiSayfasi } from './asil/MesaiSayfasi.tsx';
import { takvimKur } from './kurallar.ts';
import { ornekCalisma } from './test-verisi.ts';

afterEach(cleanup);

// 2742-1b: grup saat maliyeti istemciye gelmez; kişi bazlı seçiliyken de sayfadaki tutar yalın ücretledir ve bu yazılır.
describe('Ek mesai planı: yalın ücrete düşüş görünür', () => {
  const ciz = (kisiBazli: boolean, mesaiUcret: number | null, para = true) => {
    const c = ornekCalisma({ D: { mesaiSis: { kisiBazli }, ayarlar: mesaiUcret === null ? {} : { mesaiUcret } } });
    return render(<QueryClientProvider client={new QueryClient()}><BildirimSaglayici><MemoryRouter><MesaiSayfasi c={c} T={takvimKur(c)} para={para} yaz={null} /></MemoryRouter></BildirimSaglayici></QueryClientProvider>).container.textContent ?? '';
  };
  it('kişi bazlı: yalın ücret ve çarpan, grup değerinin planın değerlendirmesinde olduğu', () => {
    expect(ciz(true, 200)).toContain('yalın ücretle (200 TL/sa, ek mesai ×1,5); grup saat maliyeti planın değerlendirmesinde');
  });
  it('tek mesai ücreti: yalnız ücret ve çarpan; ücret yoksa girilmediği', () => {
    const t = ciz(false, 200);
    expect(t).toContain('200 TL/sa, ek mesai ×1,5');
    expect(t).not.toContain('yalın ücretle');
    expect(ciz(true, null)).toContain('yalın ücretle (mesai ücreti girilmemiş)');
  });
  // Arayüz/Güvenlik K1 (2742-1b): maliyet görmeyen rolde iki kipte de ücret tutarı yazılmaz.
  it('maliyet görmeyen rolde alt metinde TL/sa ve ücret değeri yok', () => {
    for (const kisiBazli of [true, false]) {
      const t = ciz(kisiBazli, 237, false);
      expect(t).not.toContain('TL/sa');
      expect(t).not.toContain('237');
      expect(t).toContain('ek mesai ×1,5');
      cleanup();
    }
  });
});
