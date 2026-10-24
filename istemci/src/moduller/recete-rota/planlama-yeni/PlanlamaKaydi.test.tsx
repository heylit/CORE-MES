import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Islem } from '#paylasilan/islemler.ts';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { PlanlamaEkranOzellikleri } from './gorunumler.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from './test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from './veri.ts';

// P1'in giriş dosyası yerine sınama görünümü: iskeletin görünüme verdiği çalışma ve komut, yer tutucuya bağlı olmadan denenir.
vi.mock('./motor/index.tsx', () => ({
  PlanlamaMotoru: ({ calisma, komut }: PlanlamaEkranOzellikleri) => (
    <div>
      <output data-testid="surum">{calisma === null ? 'yok' : String(calisma.dataVer)}</output>
      <output data-testid="komut">{komut === null ? 'yok' : 'var'}</output>
      {komut && <button type="button" onClick={() => { komut.degistir('Ağırlık değişti', (t) => { t.w.sure = 3; }); }}>Değiştir</button>}
    </div>
  ),
  PlanlamaAtolyesi: () => null,
}));

const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: { surum: 2, D: { siparisler: [], tezgahlar: [], urunler: [] }, dataVer: 1 }, surum: 4 }];
// Plan yazma işlemi olan, yönetici olmayan planlamacı (223 a: planlamacı yönetici olmadan plan yazar). Ad uydurmadır.
const PLANLAMACI = { ...MALIYETSIZ, islemler: [...MALIYETSIZ.islemler, 'plan.yaz' as Islem] };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Planlama çalışmasının kaydı', () => {
  it('plan.yaz ve kayıt izni olan kişi değiştirir; ekran yeni çalışmayı görür, kayıt sürüm denetimiyle yalnız planlama anahtarına gider', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, KAYIT, { govdeler });
    ac('/recete-rota/planlama-yeni/plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Değiştir' }, { timeout: 10000 }));
    expect(screen.getByTestId('surum').textContent).toBe('2');
    expect(await screen.findByText('Ağırlık değişti.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Geri al' })).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, beklenenSurum: 4, deger: { w: { sure: 3 } } });
  }, 20000);

  it('plan.yaz işlemi olmayan kişide komut yoktur (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, KAYIT);
    ac('/recete-rota/planlama-yeni/plan');
    expect((await screen.findByTestId('komut', {}, { timeout: 10000 })).textContent).toBe('yok');
    expect(screen.getByTestId('surum').textContent).toBe('1');
  }, 20000);

  it('sunucu kayıt yazmayı vermiyorsa (ben.yazabilir false) komut yoktur', async () => {
    sunucuKur(YONETICI, KAYIT, { yazabilir: false });
    ac('/recete-rota/planlama-yeni/plan');
    expect((await screen.findByTestId('komut', {}, { timeout: 10000 })).textContent).toBe('yok');
  }, 20000);

  it('çalışma kaydı yoksa komut yoktur, çalışma null gelir', async () => {
    sunucuKur(YONETICI, []);
    ac('/recete-rota/planlama-yeni/plan');
    expect((await screen.findByTestId('komut', {}, { timeout: 10000 })).textContent).toBe('yok');
    expect(screen.getByTestId('surum').textContent).toBe('yok');
  }, 20000);
});
