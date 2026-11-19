import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { TerminOnerisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmrinTerminOnerisi } from './TerminOnerisi.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

const ONERI: TerminOnerisi = { emirId: 5, emirNo: 'ORN-EMR-5', siparisSatiriId: 41, kalemSira: 2, teslim: '2027-01-20', termin: '2027-02-10', baslamis: false, surum: 4 };
const Emir = () => <EmrinTerminOnerisi emirId={5} />;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kalem termini farkı önerisi (3429-3 G)', () => {
  it('emirde fark görünür; Uygula ekranın gördüğü termin ve sürümle gider, öneri kalkar', async () => {
    let oneri: TerminOnerisi | null = ONERI;
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/5/termin-onerisi': () => json(200, { oneri }),
      'POST /adimli-emirler/5/termin-onerisi/uygula': () => { oneri = null; return json(200, { emir: {} }); },
    });
    ac([{ yol: '/e', ekran: Emir }], '/e');
    expect(await screen.findByText('Sipariş termini 10.02.2027, emrin teslimi 20.01.2027 (teslim 21 gün erken)')).toBeTruthy();
    expect(screen.queryByText(/Emir başladı/)).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /Teslimi 10\.02\.2027 yap/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')).toMatchObject({ yol: '/adimli-emirler/5/termin-onerisi/uygula', govde: { surum: 4, termin: '2027-02-10' } }));
    expect(istekler.find((i) => i.yontem === 'POST')?.kimlik).toBeTruthy();
    expect(await screen.findByText('Emrin teslimi sipariş terminine yazıldı.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Termin farkı')).toBeNull());
  });

  it('Yoksay kendi ucuna gider; 409 iletisi gösterilir ve öneri yeniden okunur', async () => {
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/5/termin-onerisi': () => json(200, { oneri: ONERI }),
      'POST /adimli-emirler/5/termin-onerisi/yoksay': () => json(409, { kod: 'CAKISMA', mesaj: 'Termin önerisi artık geçerli değil.' }),
    });
    ac([{ yol: '/e', ekran: Emir }], '/e');
    fireEvent.click(await screen.findByRole('button', { name: /Yoksay/ }));
    expect(await screen.findByText(/termini için öneri bir daha gösterilmez/)).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yoksay' }));
    expect(await screen.findByText('Termin önerisi artık geçerli değil.')).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/adimli-emirler/5/termin-onerisi').length).toBeGreaterThan(1);
  });

  it('okuyan farkı görür ama karar veremez; başlamış emir işaretlenir; öneri yoksa görünmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /adimli-emirler/5/termin-onerisi': () => json(200, { oneri: { ...ONERI, baslamis: true, teslim: '2027-02-15' } }) });
    ac([{ yol: '/e', ekran: Emir }], '/e');
    expect(await screen.findByText(/Emir başladı/)).toBeTruthy();
    expect(screen.getByText(/\(teslim 5 gün geç\)/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Teslimi 10\.02\.2027 yap/ })).toBeNull();
    cleanup();
    const istekler = sunucuKur(YAZAR, { 'GET /adimli-emirler/5/termin-onerisi': () => json(200, { oneri: null }) });
    ac([{ yol: '/e', ekran: Emir }], '/e');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/adimli-emirler/5/termin-onerisi')).toBe(true));
    await new Promise((coz) => setTimeout(coz, 20));
    expect(screen.queryByText('Termin farkı')).toBeNull();
  });
});
