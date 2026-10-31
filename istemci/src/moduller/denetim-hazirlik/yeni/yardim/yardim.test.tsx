import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Bugun } from '../bugun/index.tsx';
import { ekranAnahtari } from '../ekran-durumu.ts';
import { ornekMi, ornekProfil, profilEkle } from '../kurallar/profil.ts';
import { depoOku } from '../normalize.ts';
import { OrnekFirmaBandi } from '../ornek-firma.tsx';
import { TerimDugmesi } from './index.tsx';
import { baglamlaAc, ornekDepo, sahteSunucu, YONETICI } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import { SAYFA_YARDIMI, TERIMLER } from './icerik.ts';
import { terimSuz, UZMAN_ILETISI, YardimSaglayici } from './index.tsx';

// D1-D3 (1418): yardım paneli, terimler, "?" tuşu, Başlarken'e dönüş, sade görünüm ve örnek firma bandı. Kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); window.localStorage.clear(); });

const tus = (key: string) => { fireEvent.keyDown(window, { key }); };

describe('yardım paneli', () => {
  it('"?" açık görünümün yardımını açar; yazı alanındayken açmaz', async () => {
    sahteSunucu();
    await baglamlaAc(<YardimSaglayici><input aria-label="not" /></YardimSaglayici>, 'kalib');
    const kutu = await screen.findByRole('textbox', { name: 'not' });
    fireEvent.keyDown(kutu, { key: '?' });
    expect(screen.queryByRole('dialog')).toBeNull();
    tus('?');
    const panel = await screen.findByRole('dialog', { name: 'Yardım: Kalibrasyon' });
    expect(panel.textContent).toContain(SAYFA_YARDIMI.kalib?.a);
    expect(panel.textContent).toContain('Sık yapılan hata');
  });

  it('yardımı olmayan görünüm Genel bakış yardımını, simülasyon puanlama örneğini gösterir', async () => {
    sahteSunucu();
    await baglamlaAc(<YardimSaglayici />, 'home');
    tus('?');
    expect((await screen.findByRole('dialog', { name: 'Yardım: Bugün' })).textContent).toContain(SAYFA_YARDIMI.dash?.a);
    cleanup();
    sahteSunucu();
    await baglamlaAc(<YardimSaglayici />, 'sim');
    tus('?');
    expect(await screen.findByText('Puanlama nasıl? Örnekle')).toBeTruthy();
  });

  it('terim bağlantısı sözlüğü o terimle süzülmüş açar; arama ad, tanım ve örnekte geçer', async () => {
    sahteSunucu();
    await baglamlaAc(<YardimSaglayici><TerimDugmesi terim="bulgu" /></YardimSaglayici>, 'dash');
    fireEvent.click(await screen.findByRole('button', { name: 'Terimler: bulgu' }));
    expect(await screen.findByText('Majör bulgu')).toBeTruthy();
    expect(screen.queryByText('PUKÖ')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Terim ara' }), { target: { value: 'zzz' } });
    expect(screen.getByText('Eşleşen terim yok.')).toBeTruthy();
    expect(terimSuz('')).toHaveLength(TERIMLER.length);
    expect(terimSuz('kılçığı').map((t) => t[0])).toEqual(['Kök neden']);
  });

  it('Başlarken rehberini göster gizlenen paneli geri getirir; kayda yazmaz', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<YardimSaglayici><Bugun /></YardimSaglayici>, 'home');
    fireEvent.click(await screen.findByRole('button', { name: 'Gizle' }));
    await waitFor(() => { expect(screen.queryByText('Başlarken')).toBeNull(); });
    tus('?');
    fireEvent.click(await screen.findByRole('button', { name: /Başlarken rehberini göster/ }));
    expect(await screen.findByText('Başlarken')).toBeTruthy();
    expect(s.yazilanlar).toHaveLength(0);
  });

  it('örnek firmayla dene yalnız yöneticide', async () => {
    sahteSunucu({ yonetici: false });
    await baglamlaAc(<YardimSaglayici />, 'dash');
    tus('?');
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: /Örnek firmayla dene/ })).toBeNull();
    cleanup();
    sahteSunucu();
    await baglamlaAc(<YardimSaglayici />, 'dash');
    tus('?');
    expect(await screen.findByRole('button', { name: /Örnek firmayla dene/ })).toBeTruthy();
  });
});

describe('sade görünüm', () => {
  it('Başlarken panelindeki düğme sade görünümü açar; ekran durumuna yazılır, kayda yazılmaz; yardımdan geri dönülür', async () => {
    const s = sahteSunucu();
    await baglamlaAc(<YardimSaglayici><Bugun /></YardimSaglayici>, 'home');
    fireEvent.click(await screen.findByRole('button', { name: 'Deneyimliyim: sade görünüm' }));
    expect(await screen.findByText(UZMAN_ILETISI)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Deneyimliyim: sade görünüm' })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(ekranAnahtari(YONETICI.id)) ?? '{}')).toMatchObject({ ux: 'uzman' });
    tus('?');
    fireEvent.click(await screen.findByRole('button', { name: /Rehberli görünüme dön/ }));
    expect(JSON.parse(window.localStorage.getItem(ekranAnahtari(YONETICI.id)) ?? '{}')).toMatchObject({ ux: 'rehber' });
    expect(s.yazilanlar).toHaveLength(0);
  });
});

const ornekliDepo = (): { depo: Depo; kendi: string } => {
  const depo = ornekDepo();
  const kendi = depo.active;
  depo.active = profilEkle(depo, ornekProfil());
  return { depo, kendi };
};

describe('örnek firma bandı', () => {
  it('örnek firmada görünür; "Kendi profilime dön" örnek olmayan profili açar', async () => {
    const { depo, kendi } = ornekliDepo();
    const s = sahteSunucu({ depo });
    await baglamlaAc(<OrnekFirmaBandi />, 'dash');
    expect(await screen.findByText('Örnek firmadasınız.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kendi profilime dön/ }));
    await waitFor(() => { expect(s.yazilanlar.length).toBeGreaterThan(0); }, { timeout: 3000 });
    const d = depoOku(s.yazilanlar.at(-1)?.deger ?? null);
    expect(d.active).toBe(kendi);
    expect(ornekMi(d.data[d.active])).toBe(false);
    await waitFor(() => { expect(screen.queryByText('Örnek firmadasınız.')).toBeNull(); });
  });

  it('yazma yetkisi olmayana bant görünür, dönüş düğmesi görünmez; kendi profilinde bant yok', async () => {
    sahteSunucu({ depo: ornekliDepo().depo, yazabilir: false, yonetici: false });
    await baglamlaAc(<OrnekFirmaBandi />, 'dash');
    expect(await screen.findByText('Örnek firmadasınız.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kendi profilime dön/ })).toBeNull();
    cleanup();
    sahteSunucu({ depo: ornekDepo() });
    const { container } = await baglamlaAc(<OrnekFirmaBandi />, 'dash');
    expect(container.textContent).toBe('');
  });
});
