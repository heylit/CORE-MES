import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import type { KatalogAyarlariCevabi, LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { ayarEkranlari } from './ayar-ekranlari.tsx';
import { SORUMLU, ac, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

const AYARLAR = { surumler: { malzeme: null, operasyonlar: null, genel: null }, malzeme: null, operasyonlar: null, operasyonTipleri: [], genel: null, dortGoz: true, rol: 'sorumlu', ayarYazabilir: true } satisfies KatalogAyarlariCevabi;
const LOGO = {
  kartlar: [],
  karsiliklar: [{ cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' }, { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: 'KG' }],
  kartTuruSecenekleri: [{ kod: '10', ad: 'Hammadde' }],
  karsilikYazabilir: true,
} satisfies LogoDurumuCevabi;

describe('Sistem Ayarları: malzemeler bölümü', () => {
  it('tek bölüm, sayfayı gören herkese (yazma uçta); işlem menü maddesininki', () => {
    expect(ayarEkranlari.map((e) => [e.anahtar, e.baslik, e.islem])).toEqual([['malzemeler', 'Malzemeler ve Hizmetler', 'sayfa.malzemeler']]);
  });

  it('prototip çerçevesi ayar görünümüyle açılır, adresten bağımsız; Logo karşılıkları aynı uçtan altında', async () => {
    sunucuKur(SORUMLU, { 'GET /malzeme-katalogu-ayarlari': () => json(200, AYARLAR), 'GET /malzeme-logo-durumu': () => json(200, LOGO) });
    const Ekran = ayarEkranlari[0]!.ekran;
    ac([{ yol: '/ayarlar', ekran: Ekran }], '/ayarlar');
    const cerceve = await screen.findByTitle('Malzeme Kataloğu', {}, { timeout: 5000 }) as HTMLIFrameElement;
    expect(cerceve.className).toContain('tc-malzeme-ayar-cerceve');
    const pencere = cerceve.contentWindow as Window;
    const gonderilen = vi.spyOn(pencere, 'postMessage').mockImplementation(() => undefined);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { kanal: 'hammadde', yon: 'istek', id: 1, tip: 'hazir', veri: {} }, origin: 'null', source: pencere }));
    });
    await waitFor(() => { expect(gonderilen).toHaveBeenCalledTimes(1); });
    expect(gonderilen.mock.calls[0]![0]).toMatchObject({ id: 1, ok: true, veri: { gorunum: 'mayar', ayarKaydedilir: true } });
    expect(await screen.findByText('Logo karşılıkları')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Tür karşılıkları' })).toBeTruthy();
  });
});
