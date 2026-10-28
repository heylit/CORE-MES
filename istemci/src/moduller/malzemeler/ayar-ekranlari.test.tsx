import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { ayarEkranlari } from './ayar-ekranlari.tsx';
import { SORUMLU, ac, json, sunucuKur } from './test-ortak.tsx';
import { ORNEK_AYAR, ORNEK_KARTLAR, ORNEK_SABLONLAR } from './yeni/ornek-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

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

  it('menünün Malzeme ayarları ekranı açılır; bölüm geçişi Sistem Ayarları adresinde kalır; Logo karşılıkları aynı uçtan altında', async () => {
    sunucuKur(SORUMLU, {
      'GET /malzeme-katalogu-ayarlari': () => json(200, ORNEK_AYAR),
      'GET /malzeme-katalogu-kartlari': () => json(200, ORNEK_KARTLAR),
      'GET /malzeme-katalogu-sablonlari': () => json(200, ORNEK_SABLONLAR),
      'GET /malzeme-logo-durumu': () => json(200, LOGO),
    });
    const Ekran = ayarEkranlari[0]!.ekran;
    const Sayfa = () => <><Ekran /><p>Adres {useLocation().pathname}{useLocation().search}</p></>;
    ac([{ yol: '/ayarlar', ekran: Sayfa }], '/ayarlar');
    const menu = await screen.findByRole('navigation', { name: 'Malzeme ayarları bölümleri' }, { timeout: 5000 });
    expect(screen.queryByTitle('Malzeme Kataloğu')).toBeNull();
    fireEvent.click(within(menu).getByRole('button', { name: 'Sertifikalar' }));
    expect(await screen.findByText('Adres /ayarlar?bolum=sertifika')).toBeTruthy();
    expect(await screen.findByText('Logo karşılıkları')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Tür karşılıkları' })).toBeTruthy();
  });
});
