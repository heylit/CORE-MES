import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TaslakCevabi, TaslakUygulaCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { TaslakSatiri } from './taslak.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';
import { TaslakCubugu } from './TaslakCubugu.tsx';

// Taslak uydurmadır; sunucu yoktur, taslak sahtedir.
afterEach(() => { cleanup(); });

const satir = (komut: TaslakSatiri['komut'], ne: string, hata: string | null = null): TaslakSatiri => ({ komut, ne, t: 0, hata });
const TASI = { tur: 'tasi', emirId: 'ORN-e1', tezgahId: 'ORN-t2' } as unknown as TaslakSatiri['komut'];
const DIZ = { tur: 'diz', isler: ['*'] } as TaslakSatiri['komut'];
const cevap = (satirlar: TaslakSatiri[]): TaslakCevabi => ({ taslak: { surum: 3, tabanSurum: 1, satirlar }, calisma: null, surum: 1 });

function ac(satirlar: TaslakSatiri[] | null, uygula: (TaslakUygulaCevabi | null)[] = []) {
  const { t } = sahteTaslak(1);
  t.cevap = satirlar === null ? null : cevap(satirlar);
  const u = vi.fn(() => Promise.resolve(uygula.shift() ?? null));
  t.uygula = u;
  const yazildi = vi.fn();
  render(<TaslakCubugu taslak={t} ozet={<span>ORN özet</span>} yazildi={yazildi} />);
  return { t, u, yazildi };
}
const dugme = (ad: string, kok: HTMLElement = screen.getByRole('region', { name: 'Taslak' })) => within(kok).getByRole('button', { name: ad });

describe('TaslakCubugu', () => {
  it('taslak yoksa görünmez', () => {
    ac(null);
    expect(screen.queryByRole('region', { name: 'Taslak' })).toBeNull();
  });

  it('değişiklik sayısını dizmeler hariç gösterir; Geri al ve onaylı Vazgeç taslağa gider', async () => {
    const { t } = ac([satir(TASI, 'a'), satir(DIZ, 'd')]);
    expect(screen.getByText('Taslak · 1 değişiklik')).toBeTruthy();
    expect(screen.getByText('ORN özet')).toBeTruthy();
    fireEvent.click(dugme('Geri al'));
    expect(t.geriAl).toHaveBeenCalledTimes(1);
    fireEvent.click(dugme('Vazgeç'));
    const onay = await screen.findByRole('dialog', { name: 'Taslaktan vazgeçilsin mi?' });
    expect(within(onay).getByText('1 değişiklik silinir; ortak plan değişmez.')).toBeTruthy();
    expect(t.vazgec).not.toHaveBeenCalled();
    fireEvent.click(within(onay).getByRole('button', { name: 'Taslağı sil' }));
    expect(t.vazgec).toHaveBeenCalledTimes(1);
  });

  it('artık uygulanamayan değişiklik varken Plana yaz kapalıdır ve nedeni yazılır', () => {
    const { u } = ac([satir(TASI, '3.10 → T2', 'tezgâh yok')]);
    expect(screen.getByRole('alert').textContent).toBe('Artık uygulanamıyor: 3.10 → T2 (tezgâh yok)');
    const yaz = dugme('Plana yaz');
    expect([yaz.hasAttribute('disabled'), yaz.getAttribute('title')]).toEqual([true, 'Önce artık uygulanamayan değişikliği geri alın.']);
    fireEvent.click(yaz);
    expect(u).not.toHaveBeenCalled();
  });

  it('aynı adlı iki bozuk satır ikisi de gösterilir', () => {
    ac([satir(TASI, 'Plan ayarı', 'x'), satir(TASI, 'Plan ayarı', 'y')]);
    expect(screen.getAllByRole('alert').map((e) => e.textContent)).toEqual(['Artık uygulanamıyor: Plan ayarı (x)', 'Artık uygulanamıyor: Plan ayarı (y)']);
  });

  it('dizme bayatsa yeniden dizme önerilir; Plana yaz o zamana kadar kapalıdır', () => {
    const { t } = ac([satir(TASI, 'a'), satir(DIZ, 'd', 'Plan bu arada değişti')]);
    expect(screen.getByText(/Plan bu arada değişti; kararlarınız yeni plana göre yeniden dizilir\./)).toBeTruthy();
    expect(dugme('Plana yaz').getAttribute('title')).toBe('Önce taslağı yeniden dizin.');
    fireEvent.click(dugme('Yeniden diz'));
    expect(t.diz).toHaveBeenCalledTimes(1);
  });

  it('başkası da değiştirdiyse anahtar başına seçim ister; hepsi seçilince seçimle yazar', async () => {
    const catismalar = [{ anahtar: 'emir:ORN-e1', ad: 'ORN-E1', komutlar: ['3.10 → T2'] }, { anahtar: '*', ad: 'Plan ayarı', komutlar: ['Dondurma 7'] }];
    const { u, yazildi } = ac([satir(TASI, 'a')], [{ durum: 'secim', catismalar }, { durum: 'uygulandi', calismaSurumu: 5, uygulanan: 1, dusen: 1 }]);
    fireEvent.click(dugme('Plana yaz'));
    const p = await screen.findByRole('dialog', { name: 'Başkası da değiştirdi' });
    const yaz = within(p).getByRole('button', { name: 'Plana yaz' });
    expect(yaz.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(within(p).getByRole('group', { name: 'ORN-E1' })).getByRole('button', { name: 'Benimki' }));
    expect(yaz.hasAttribute('disabled')).toBe(true);
    const onunki = within(within(p).getByRole('group', { name: 'Plan ayarı' })).getByRole('button', { name: 'Onunki' });
    fireEvent.click(onunki);
    expect(onunki.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(yaz);
    await waitFor(() => { expect(yazildi).toHaveBeenCalledWith('Taslak plana yazıldı; 1 değişiklik başkasınınki seçildiği için düştü.'); });
    expect(u.mock.calls).toEqual([[undefined], [{ 'emir:ORN-e1': 'benim', '*': 'onun' }]]);
    expect(screen.queryByRole('dialog', { name: 'Başkası da değiştirdi' })).toBeNull();
  });
});
