import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { EksikIslerimCevabi, OperatorOzetiCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { arkonAc, OPERATOR, sunucuKur } from '../test-ortak.tsx';

// Girilmemiş işlerim (kart 2421 c): Özetim'de operatörün kendi tezgahlarının açık eksikleri. Veri uydurmadır.
const OZET = {
  kisi: { id: 3, ad: 'Deneme Operator' }, donem: 'gun', baslangic: '2026-11-09', bitis: '2026-11-09', hesaplama: '2026-11-09T09:00:00.000Z',
  saglam: 0, hurda: 0, kalite: null, calismaSn: null, saatlikSaglam: null, basari: null, verim: null,
  emekVerimi: { oran: null, standartSn: 0, mesaiSn: null }, isler: [], hurdaNedenleri: [], ekipOrtalamasi: null, gunler: [], rozetler: [],
  yetkiler: { istasyonlar: [], makineler: [] }, mesailer: null, fazlaMesai: null, izinler: null, ekip: [],
} satisfies OperatorOzetiCevabi;
const EKSIK = {
  hesaplama: '2026-11-09T09:00:00.000Z',
  olaylar: [
    {
      id: 1, tur: 'plan-gerisi', konu: 'is_emri', isEmriId: 5, uretimEmriId: 4, emirNo: 'E-1', opNo: 10, istasyon: { id: 2, ad: 'Torna' }, kaynak: { tur: 'makine', id: 3, ad: 'Tezgah' },
      deger: 150, kalanAdet: 4, planaGore: false, dayanakAni: '2026-11-09T06:00:00.000Z', nedenler: [], acilis: '2026-11-09T07:00:00.000Z', kapanis: null,
    },
    {
      id: 2, tur: 'kayitsiz-gun', konu: 'istasyon', isEmriId: null, uretimEmriId: null, emirNo: null, opNo: null, istasyon: { id: 2, ad: 'Torna' }, kaynak: null,
      deger: 2, kalanAdet: null, planaGore: false, dayanakAni: null, nedenler: [], acilis: '2026-11-09T07:00:00.000Z', kapanis: null,
    },
    {
      id: 3, tur: 'olcumsuz-is', konu: 'is_emri', isEmriId: 7, uretimEmriId: 6, emirNo: 'E-2', opNo: 20, istasyon: { id: 2, ad: 'Torna' }, kaynak: { tur: 'makine', id: 3, ad: 'Tezgah' },
      deger: 1, kalanAdet: null, planaGore: false, dayanakAni: '2026-11-08T12:00:00.000Z', nedenler: ['ayar-yok', 'sayim-yok'], acilis: '2026-11-09T07:00:00.000Z', kapanis: null,
    },
  ],
} satisfies EksikIslerimCevabi;

describe('Özetim: Girilmemiş işlerim (2421 c)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('operatör kendi açık eksiklerini değer ve kalan adetle görür; yoksa boş metin', async () => {
    sunucuKur(OPERATOR, { uclar: { 'GET /arkon/operator-ozeti': OZET, 'GET /arkon/eksik-islerim': EKSIK } });
    arkonAc('/uretim-terminali');
    fireEvent.click(await screen.findByRole('button', { name: 'Özetim' }, { timeout: 10000 }));
    const kart = await screen.findByLabelText('Girilmemiş işlerim', {}, { timeout: 10000 });
    expect(within(kart).getByText('E-1 · OP 10')).toBeTruthy();
    expect(kart.textContent).toContain('Plan gerisi');
    expect(kart.textContent).toContain('2 sa 30 dk');
    expect(kart.textContent).toContain('4 adet kaldı');
    expect(kart.textContent).toContain('Kayıtsız gün');
    expect(kart.textContent).toContain('2 iş günü');
    // 2567: ölçülmeyen süre nedenleriyle görünür.
    expect(kart.textContent).toContain('Süre ölçülmedi');
    expect(kart.textContent).toContain('Ayar basılmadı: hazırlık ölçülmedi, Sayım yok: işlem süresi ölçülmedi');
    expect(kart.textContent).toContain('1 gün önce');
    cleanup();
    sunucuKur(OPERATOR, { uclar: { 'GET /arkon/operator-ozeti': OZET, 'GET /arkon/eksik-islerim': { ...EKSIK, olaylar: [] } } });
    arkonAc('/uretim-terminali');
    fireEvent.click(await screen.findByRole('button', { name: 'Özetim' }, { timeout: 10000 }));
    expect((await screen.findByLabelText('Girilmemiş işlerim', {}, { timeout: 10000 })).textContent).toContain('girilmemiş ya da geride kalan iş yok');
  }, 30000);
});
