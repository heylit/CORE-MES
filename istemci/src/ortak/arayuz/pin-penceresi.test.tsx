import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OTURUM_BITTI } from '../veri/api.ts';
import { PinPenceresi } from './PinPenceresi.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function sunucu(durum: number, govde: unknown) {
  const sahte = vi.fn(async (_yol: string, _ayar: RequestInit) => new Response(JSON.stringify(govde), { status: durum }));
  vi.stubGlobal('fetch', sahte);
  return sahte;
}

function doldurGonder(eski: string, yeni: string, tekrar = yeni) {
  fireEvent.change(screen.getByLabelText(/Eski PIN ya da parola/), { target: { value: eski } });
  fireEvent.change(screen.getByLabelText(/^Yeni PIN \(6 rakam\)/), { target: { value: yeni } });
  fireEvent.change(screen.getByLabelText(/^Yeni PIN \(tekrar\)/), { target: { value: tekrar } });
  fireEvent.click(screen.getByRole('button', { name: "PIN'i değiştir" }));
}

describe('PIN\'imi değiştir', () => {
  it('istek kendi ucuna eski ve yeni PIN\'le gider; sonuç pencerede kalır', async () => {
    const sahte = sunucu(200, { tamam: true });
    render(<PinPenceresi kapat={() => undefined} />);
    doldurGonder('730514', '615203');
    expect((await screen.findByRole('status')).textContent).toContain('PIN değiştirildi');
    const [yol, ayar] = sahte.mock.calls[0]!;
    expect(yol).toBe('/api/hesabim/pin-degistir');
    expect(JSON.parse(String(ayar.body))).toEqual({ eski: '730514', yeniPin: '615203' });
  });

  it('bekleme 401 iletisini gösterir, oturumu bitirmez', async () => {
    sunucu(401, { kod: 'OTURUM_YOK', mesaj: 'Çok sık deneme. 1 sn sonra yeniden deneyin.' });
    const bitti = vi.fn();
    window.addEventListener(OTURUM_BITTI, bitti);
    render(<PinPenceresi kapat={() => undefined} />);
    doldurGonder('730514', '615203');
    await waitFor(() => expect(screen.getByText(/Çok sık deneme/)).toBeTruthy());
    expect(bitti).not.toHaveBeenCalled();
    window.removeEventListener(OTURUM_BITTI, bitti);
  });

  it('reddedilen: tekrar uyuşmazsa ya da yeni PIN eskisiyle aynıysa istek gitmez, alan nedenini söyler; tekrar sunucuya gitmez', async () => {
    const sahte = sunucu(200, { tamam: true });
    render(<PinPenceresi kapat={() => undefined} />);
    doldurGonder('730514', '615203', '615204');
    expect(screen.getByText('Yeni PIN ile tekrarı aynı değil.')).toBeTruthy();
    doldurGonder('730514', '730514');
    expect(screen.getByText('Yeni PIN eskisiyle aynı olamaz.')).toBeTruthy();
    expect(sahte).not.toHaveBeenCalled();
    doldurGonder('730514', '615203');
    await screen.findByRole('status');
    expect(Object.keys(JSON.parse(String(sahte.mock.calls[0]![1].body)))).toEqual(['eski', 'yeniPin']);
  });

  it('boş alanla istek gitmez', () => {
    const sahte = sunucu(200, { tamam: true });
    render(<PinPenceresi kapat={() => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: "PIN'i değiştir" }));
    expect(sahte).not.toHaveBeenCalled();
  });
});
