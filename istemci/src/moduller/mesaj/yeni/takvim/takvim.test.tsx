import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { BEN, KISI_A, KISI_B, ornekBelgeler } from '../ornek-veri.ts';
import { OKUYAN, YAZAN, mesajAc, sunucuKur, type SahteSunucu } from '../test-ortak.tsx';
import { takvimOlaylari } from './Takvim.tsx';
import { icsTakvimi, toplantiOlayi } from './ics.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const yazilan = (s: SahteSunucu, yol: string) => s.yazmalar.filter((y) => y.govde['yol'] === yol);
// Örnek veri sabit bir güne bağlıdır; ajandanın "bugünden sonra" süzgecine takılmasın diye toplantı şimdiye göre kurulur.
const yakinToplanti = (ek: Record<string, unknown> = {}) => ({
  'toplantilar/mt9': { title: 'Yakın toplantı', start: Date.now() + 2 * 36e5, dur: 30, attendees: [BEN, KISI_A], by: KISI_A, rsvp: {}, createdAt: 1, ...ek },
});
const takvimAc = async () => {
  mesajAc('/mesaj/yeni/takvim');
  await screen.findByRole('heading', { name: 'Takvim' });
  fireEvent.click(screen.getByRole('button', { name: 'Ajanda' }));
};

describe('M2 Takvim', () => {
  it('takvimOlaylari: "Benim" katıldığım toplantı ve bana verilen görevi, "Herkes" hepsini; sevk edilen sipariş görünmez', () => {
    const t = Date.UTC(2026, 9, 23, 9);
    const toplantilar = [
      { id: 'a', title: 'A', start: t, attendees: [BEN], by: KISI_A, createdAt: 1, surum: 1 },
      { id: 'b', title: 'B', start: t + 36e5, attendees: [KISI_B], by: KISI_A, createdAt: 1, surum: 1 },
    ];
    const gorevler = [
      { id: 'g1', title: 'G1', to: BEN, by: KISI_A, status: 'todo' as const, due: t, createdAt: 1, surum: 1 },
      { id: 'g2', title: 'G2', to: KISI_B, by: KISI_A, status: 'todo' as const, due: t, createdAt: 1, surum: 1 },
    ];
    const siparisler = [
      { id: '1', no: 'S-1', musteri: '', urun: '', hedef: null, birim: '', teslim: t, durum: 'sirada' as const, uretilen: null },
      { id: '2', no: 'S-2', musteri: '', urun: '', hedef: null, birim: '', teslim: t, durum: 'sevk' as const, uretilen: null },
    ];
    const benim = Object.values(takvimOlaylari({ kapsam: 'me', ben: BEN, toplantilar, gorevler, siparisler })).flat();
    expect(benim.map((e) => `${e.k}${e.r.id}`)).toEqual(['ma', 'tg1', 'o1']);
    const herkes = Object.values(takvimOlaylari({ kapsam: 'all', ben: BEN, toplantilar, gorevler, siparisler })).flat();
    expect(herkes.map((e) => `${e.k}${e.r.id}`)).toEqual(['ma', 'mb', 'tg1', 'tg2', 'o1']);
  });

  it('takvim dosyası satırları CRLF ile ve hatırlatmayla kurulur', () => {
    const mt = { id: 'x', title: 'Konu; virgül, var', start: Date.UTC(2026, 0, 2, 7), dur: 45, remind: 10, attendees: [], by: BEN, createdAt: 1 };
    const metin = icsTakvimi([toplantiOlayi(mt, () => 'Örnek', Date.UTC(2026, 0, 1))]);
    expect(metin.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(metin).toContain('SUMMARY:Konu\\; virgül\\, var');
    expect(metin).toContain('DTSTART:20260102T070000Z');
    expect(metin).toContain('DTEND:20260102T074500Z');
    expect(metin).toContain('TRIGGER:-PT10M');
  });

  it('izinli: katılımcı "Katılıyor" der; yanıt kendi anahtarına birleştirilerek yazılır, kip kişiye özel saklanır', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: { ...ornekBelgeler(), ...yakinToplanti() } });
    await takvimAc();
    const satir = (await screen.findByText('Yakın toplantı')).closest('.tc-mi-satir') as HTMLElement;
    fireEvent.click(within(satir).getByRole('button', { name: 'Katılıyor' }));
    await waitFor(() => { expect(yazilan(s, 'toplantilar/mt9')).toHaveLength(1); });
    const g = yazilan(s, 'toplantilar/mt9')[0]?.govde;
    expect(g?.['kip']).toBe('birlestir');
    expect(g?.['veri']).toMatchObject({ rsvp: { [BEN]: { u: BEN, r: 'yes' } }, last: { t: 'katılacağını bildirdi' } });
    expect(await screen.findByText('Katılıyor olarak yanıtladın.')).toBeTruthy();
    expect(s.yazmalar.some((y) => String(y.govde['yol']).includes('mesai%3AcalMode'))).toBe(true);
  });

  it('reddedilen: salt okur kişide katılım düğmeleri ve "Toplantı" düğmesi yok', async () => {
    const s = sunucuKur({ ben: OKUYAN, belgeler: { ...ornekBelgeler(), ...yakinToplanti() } });
    await takvimAc();
    const satir = (await screen.findByText('Yakın toplantı')).closest('.tc-mi-satir') as HTMLElement;
    expect(within(satir).queryByRole('group', { name: 'Katılım yanıtı' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toplantı' })).toBeNull();
    expect(s.yazmalar.filter((y) => String(y.govde['yol']).startsWith('toplantilar/'))).toHaveLength(0);
  });

  it('reddedilen: düzenleyen kendi toplantısına yanıt vermez', async () => {
    sunucuKur({ ben: YAZAN, belgeler: { ...ornekBelgeler(), ...yakinToplanti({ by: BEN }) } });
    await takvimAc();
    const satir = (await screen.findByText('Yakın toplantı')).closest('.tc-mi-satir') as HTMLElement;
    expect(within(satir).queryByRole('group', { name: 'Katılım yanıtı' })).toBeNull();
  });

  it('izinli: "Toplantı" formu konusuz göndermez, konuyla düzenleyeni ben olan toplantı yazar', async () => {
    const s = sunucuKur({ ben: YAZAN, belgeler: ornekBelgeler() });
    await takvimAc();
    fireEvent.click(screen.getByRole('button', { name: 'Toplantı' }));
    const form = await screen.findByRole('dialog', { name: 'Toplantı planla' });
    fireEvent.click(within(form).getByRole('button', { name: 'Toplantıyı oluştur' }));
    expect(await within(form).findByText('Konuyu yaz.')).toBeTruthy();
    fireEvent.change(within(form).getByLabelText(/Konu/), { target: { value: 'Planlama toplantısı' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Toplantıyı oluştur' }));
    await waitFor(() => {
      expect(s.yazmalar.some((y) => (y.govde['veri'] as Record<string, unknown> | undefined)?.['title'] === 'Planlama toplantısı')).toBe(true);
    });
    const yeni = s.yazmalar.find((y) => (y.govde['veri'] as Record<string, unknown>)['title'] === 'Planlama toplantısı');
    expect(String(yeni?.govde['yol'])).toMatch(/^toplantilar\//);
    expect(yeni?.govde['veri']).toMatchObject({ by: BEN, dur: 30, rsvp: {}, last: { t: 'toplantı planladı' } });
    expect(await screen.findByText('Toplantı oluşturuldu.')).toBeTruthy();
  });
});
