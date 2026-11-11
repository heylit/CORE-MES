import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SAYFALAR, menudeGorunur } from '#paylasilan/sayfalar.ts';
import { MENU_SIK_SINIRI } from '#paylasilan/rol-gorunumleri.ts';
import { api } from '../veri/api.ts';
import { MenuDuzenle } from './MenuDuzenle.tsx';

const sayfalar = SAYFALAR.filter(menudeGorunur).slice(0, MENU_SIK_SINIRI + 1);
const gruplar = [{ grup: 'Hepsi', sayfalar }];

function ciz(secili: readonly string[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MenuDuzenle kapat={() => undefined} gruplar={gruplar} secili={secili} surum={1} oneri={[]} />
    </QueryClientProvider>,
  );
}

describe('MenuDuzenle', () => {
  it('liste dolunca nedeni yazar ve isaretsiz kutular kapanir; yer acilinca not kalkar (2951 N4)', () => {
    ciz(sayfalar.slice(0, MENU_SIK_SINIRI).map((s) => s.yol));
    const pencere = within(screen.getByRole('dialog', { name: 'Menüyü düzenle' }));
    expect(pencere.getByRole('status').textContent).toContain(`En çok ${String(MENU_SIK_SINIRI)} sayfa`);
    const son = sayfalar[MENU_SIK_SINIRI];
    expect((pencere.getByRole('checkbox', { name: son?.baslik ?? '' }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(pencere.getByRole('button', { name: `${sayfalar[0]?.baslik ?? ''} çıkar` }));
    expect(pencere.queryByRole('status')).toBeNull();
    expect((pencere.getByRole('checkbox', { name: son?.baslik ?? '' }) as HTMLInputElement).disabled).toBe(false);
  });

  it('kaydedilemeyince hata secimin altinda, sayfa gruplarindan once cizilir; pencere acik kalir (2951 N1)', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('sunucu yok'));
    ciz([]);
    const pencere = within(screen.getByRole('dialog', { name: 'Menüyü düzenle' }));
    await act(async () => { fireEvent.click(pencere.getByRole('button', { name: 'Kaydet' })); });
    const hata = await pencere.findByRole('alert');
    expect(hata.textContent).toContain('Menü kaydedilemedi.');
    const ilkGrup = pencere.getByRole('group', { name: 'Hepsi' });
    expect(hata.compareDocumentPosition(ilkGrup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Menüyü düzenle' })).toBeTruthy();
    post.mockRestore();
  });
});
