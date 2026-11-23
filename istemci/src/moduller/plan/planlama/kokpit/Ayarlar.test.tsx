import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { planKurSifirla } from '../motor/coz.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { Ayarlar } from './Ayarlar.tsx';
import { sahteTaslak } from './taslak-test-yardim.ts';

// Çalışma uydurmadır; sunucu yerine taslak sahtedir (3282 1d-2b: değişiklik kişinin taslağına komut olarak yazılır).
// Plan ayarlarının geri kalanı Planlama ayarları sayfasındadır (3561, ayarlar/Sayfa.test.tsx); burada yalnız yön paneli sınanır.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

function kur(c: PlanlamaCalismasi, yazabilir = true, yon: 'ileri' | 'geri' = 'geri', etkiBekliyor?: (b: boolean) => void) {
  const { t, yazilan } = sahteTaslak(c.dataVer);
  const kapat = vi.fn();
  render(<MemoryRouter><Ayarlar c={c} taslak={t} yazabilir={yazabilir} kapat={kapat} yon={yon} etkiBekliyor={etkiBekliyor} /></MemoryRouter>);
  return { t, kapat, yazilan };
}

describe('Kokpit yön paneli (3304 a)', () => {
  it('üst şeritteki yön düğmesinden açılınca taslak o yönle başlar ve etkisi sorulmadan hesaplanır; Vazgeç geri alır', async () => {
    const bekliyor = vi.fn();
    const { t, yazilan, kapat } = kur(ornekCalisma(), true, 'geri', bekliyor);
    // Yön seçiminden açılan panel yalnız yönün etkisini taşır; öteki ayarlar çizilmez.
    const panel = screen.getByRole('complementary', { name: 'Tüm planın yönü' });
    expect(panel.textContent).toContain('İleriye → Teslimden geriye');
    expect(screen.queryByLabelText('Planlama yönü')).toBeNull();
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    expect(yazilan).toEqual([{ tur: 'ayar', ayar: { w: { yon: 'geri' }, param: {}, ac: [], kapat: [] }, ayrinti: 'Planlama yönü: İleri: hemen başla → Geri: teslimden geriye' }]);
    expect(t.yaz).toHaveBeenCalledTimes(1);
    // Etki ekrandayken sayfaya haber verilir (taslak çubuğundaki birincil kapanır), Vazgeç'ten sonra kalkar.
    // Bildirim etkinin çizilmesinden bir efekt sonra gelir: bölge görününce henüz gitmemiş olabilir, beklenir.
    await waitFor(() => { expect(bekliyor).toHaveBeenLastCalledWith(true); });
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false, false); });
    await waitFor(() => { expect(bekliyor).toHaveBeenLastCalledWith(false); });
    // Vazgeçince panel kapanır: yön yalnız üst şeritten seçilir.
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
  });

  it('Uygula dizmeyi taslağa yazar ve paneli kapatır', async () => {
    const { t, kapat } = kur(ornekCalisma());
    const etki = await screen.findByRole('region', { name: 'Ayarın etkisi' });
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
    expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is');
  });

  it('başlık komut taslağa girip plan yeni yönü gösterince de "eski → yeni" kalır', () => {
    const c = ornekCalisma(), { t } = sahteTaslak(c.dataVer);
    const ciz = (x: PlanlamaCalismasi) => <MemoryRouter><Ayarlar c={x} taslak={t} yazabilir kapat={() => {}} yon="geri" /></MemoryRouter>;
    const { rerender } = render(ciz(c));
    rerender(ciz({ ...c, w: { ...c.w, yon: 'geri' } }));
    expect(screen.getByRole('complementary', { name: 'Tüm planın yönü' }).textContent).toContain('İleriye → Teslimden geriye');
  });

  it('etki beklerken panel kapanırsa (kaldırılırsa) bekleme bildirimi düşer: Canlıya al kilitli kalmaz', async () => {
    const bekliyor = vi.fn();
    kur(ornekCalisma(), true, 'geri', bekliyor);
    await waitFor(() => { expect(bekliyor).toHaveBeenLastCalledWith(true); });
    cleanup();
    expect(bekliyor).toHaveBeenLastCalledWith(false);
  });

  it('yön planınkiyle aynıysa ya da kişi yazamıyorsa kendiliğinden hesap istenmez', () => {
    const a = kur(ornekCalisma(), true, 'ileri');
    expect(a.t.yaz).not.toHaveBeenCalled();
    cleanup();
    const b = kur(ornekCalisma(), false, 'geri');
    expect(b.t.yaz).not.toHaveBeenCalled();
  });
});
