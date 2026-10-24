import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Islem } from '#paylasilan/islemler.ts';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, ac, sunucuKur } from '../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../veri.ts';
import { ornekCalisma } from './ornek.ts';

// Planlama motoru ve atölyenin tezgâh panosu: kayıttaki plan görünür; karar alanları (arıza, sabit) yalnız plan.yaz ile yazılır.
const PLANLAMACI = { ...MALIYETSIZ, islemler: [...MALIYETSIZ.islemler, 'plan.yaz' as Islem] };
const kayit = (deger: unknown) => [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger, surum: 4 }];
const BEKLE = { timeout: 10000 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Planlama motoru', () => {
  it('özet sayıları, tezgâh haritası ve yapılacaklar kayıttaki plandan gelir; motor düğmesi kapalıdır', async () => {
    sunucuKur(PLANLAMACI, kayit(ornekCalisma()));
    ac('/recete-rota/planlama-yeni/plan');
    expect(await screen.findByRole('heading', { name: 'Plan nasıl gidiyor?' }, BEKLE)).toBeTruthy();
    expect(screen.getByText('Güncel')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Torna grubu' })).toBeTruthy();
    const iyilestir = screen.getByRole('button', { name: 'Planı iyileştir' }) as HTMLButtonElement;
    expect(iyilestir.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Yapılacaklar/ }));
    const yap = screen.getByRole('region', { name: 'Yapılacaklar' });
    expect(within(yap).getByText('1 işlem planlanamadı')).toBeTruthy();
    fireEvent.click(within(yap).getByRole('button', { name: 'Yolunu göster' }));
    expect(screen.getByRole('region', { name: 'S2 siparişinin yolu' })).toBeTruthy();
  }, 20000);

  it('plan.yaz olan kişi tezgâha arıza ekler ve işi sabitler; kayıt yalnız planlama anahtarına gider (izinli)', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, kayit(ornekCalisma()), { govdeler });
    ac('/recete-rota/planlama-yeni/plan');
    fireEvent.click(await screen.findByRole('button', { name: /^T1 Torna bir/ }, BEKLE));
    const panel = screen.getByRole('region', { name: 'Tezgâh T1' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Arıza ya da bakım ekle' }));
    fireEvent.change(within(panel).getByLabelText(/^Başlangıç/), { target: { value: '2026-10-20T08:00' } });
    fireEvent.change(within(panel).getByLabelText(/^Bitiş/), { target: { value: '2026-10-20T12:00' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText(/Arıza\/bakım eklendi/)).toBeTruthy();
    fireEvent.click(within(panel).getAllByRole('button', { name: /^\d/ })[0] as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'S1.10 adımını bu yerde sabitle' }));
    await waitFor(() => { expect(govdeler.length).toBeGreaterThan(0); }, { timeout: 5000 });
    expect(govdeler.at(-1)).toMatchObject({
      anahtar: PLANLAMA_ANAHTARI, deger: { down: [{ m: 'T1', from: 32, to: 36 }], locks: { 'S1.10': { m: 'T1', S: 9 } } },
    });
  }, 20000);

  it('plan.yaz olmayan kişi görür ama arıza ekleyemez, sabitleyemez; yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(MALIYETSIZ, kayit(ornekCalisma()));
    ac('/recete-rota/planlama-yeni/plan');
    fireEvent.click(await screen.findByRole('button', { name: /^T1 Torna bir/ }, BEKLE));
    const panel = screen.getByRole('region', { name: 'Tezgâh T1' });
    expect(within(panel).queryByRole('button', { name: 'Arıza ya da bakım ekle' })).toBeNull();
    fireEvent.click(within(panel).getAllByRole('button', { name: /^\d/ })[0] as HTMLElement);
    expect(screen.queryByRole('button', { name: /sabitle/ })).toBeNull();
    expect(istekler.filter((x) => x.startsWith('POST'))).toEqual([]);
  }, 20000);

  it('plan yoksa boş durum ve kapalı Planı kur', async () => {
    const c = ornekCalisma();
    sunucuKur(PLANLAMACI, kayit({ ...c, plan: null }));
    ac('/recete-rota/planlama-yeni/plan');
    expect(await screen.findByRole('heading', { name: 'Plan henüz kurulmadı' }, BEKLE)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Planı kur' }) as HTMLButtonElement).disabled).toBe(true);
  }, 20000);

  it('çizelge görünümü tezgâh başına satır çizer; çubuk siparişi seçer', async () => {
    sunucuKur(PLANLAMACI, kayit(ornekCalisma()));
    ac('/recete-rota/planlama-yeni/plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Çizelge' }, BEKLE));
    const cz = screen.getByRole('group', { name: 'Tezgâh çizelgesi' });
    fireEvent.click(within(cz).getAllByRole('button', { name: 'S1' })[0] as Element);
    expect(screen.getByRole('region', { name: 'S1 siparişinin yolu' })).toBeTruthy();
  }, 20000);
});

describe('Planlama atölyesi', () => {
  it('sipariş listesi gecikene göre gruplu; sipariş açılınca yolu ve kapalı çözüm yolları görünür', async () => {
    sunucuKur(PLANLAMACI, kayit(ornekCalisma()));
    ac('/recete-rota/planlama-yeni/studio');
    const ray = await screen.findByRole('complementary', { name: 'Siparişler' }, BEKLE);
    expect(within(ray).getByRole('region', { name: 'Geciken' })).toBeTruthy();
    expect(within(ray).getByRole('region', { name: 'Riskli · 8 sa’ten az pay' })).toBeTruthy();
    fireEvent.click(within(ray).getByRole('button', { name: /^S2/ }));
    expect(screen.getByRole('region', { name: 'S2 siparişinin yolu' })).toBeTruthy();
    expect(screen.getByText(/Çözüm yolları/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'İyileştir' }) as HTMLButtonElement).disabled).toBe(true);
  }, 20000);

  it('senaryolar okunamazsa onay sekmesi hata ve yenile gösterir', async () => {
    sunucuKur(PLANLAMACI, kayit(ornekCalisma()));
    ac('/recete-rota/planlama-yeni/studio');
    fireEvent.click(await screen.findByRole('tab', { name: 'Onay ve canlı' }, BEKLE));
    expect(screen.getByText('Plan senaryoları okunamadı.')).toBeTruthy();
  }, 20000);
});
