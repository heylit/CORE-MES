import { describe, expect, it } from 'vitest';
import { planDisiEki } from './kurallar.ts';

// Gönderim kartının plan dışı eki "Operatöre gönder" penceresiyle aynı şeyi söyler.
describe('plan dışı işin gönderim kartı eki', () => {
  const paket = (plan: { canli: boolean; eslesiyor: boolean; zorunlu?: boolean }) => ({ tmi: { isEmriId: 1, plan: { sira: null, ...plan } } });

  it('ayar kapalıyken plan dışı iş operatöre düşer, kart da bunu söyler', () => {
    expect(planDisiEki(paket({ canli: false, eslesiyor: false, zorunlu: false }))).toBe(' · plan dışı: operatöre düşer, plansız başlatılabilir');
  });

  it('ayar açıkken iş plan canlıya alınınca düşer', () => {
    expect(planDisiEki(paket({ canli: false, eslesiyor: false, zorunlu: true }))).toBe(' · operatöre plan canlıya alınınca düşer');
    expect(planDisiEki(paket({ canli: true, eslesiyor: false, zorunlu: true }))).toBe(' · operatöre plan canlıya alınınca düşer');
  });

  it('canlı planda ve kaynağı eşleşen işte ek yok; plansız (rotasız) işte ek yok', () => {
    expect(planDisiEki(paket({ canli: true, eslesiyor: true, zorunlu: true }))).toBe('');
    expect(planDisiEki({ tmi: null })).toBe('');
  });
});
