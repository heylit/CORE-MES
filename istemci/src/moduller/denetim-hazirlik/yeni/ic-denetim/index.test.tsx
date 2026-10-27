import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ornekProfil } from '../kurallar/profil.ts';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import type { Depo } from '../tipler.ts';
import { IcDenetim } from './index.tsx';

// jsdom kaydırmayı uygulamaz.
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); window.localStorage.clear(); });

// Sentetik örnek profil: süreçler, roller ve denetimler örnek veridir.
const dolu = (): Depo => {
  const d = ornekDepo();
  d.data[d.active] = ornekProfil();
  return d;
};

describe('İç denetim (izinli)', () => {
  it('süreç yoksa tipik süreçler eklenir ve yıllık plan çizilir; otomatik plan ayları işaretler', async () => {
    sahteSunucu({ depo: ornekDepo() });
    await baglamlaAc(<IcDenetim />, 'icd');
    expect(await screen.findByText('Önce süreçlerinizi tanımlayın')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tipik süreçleri ekle' }));
    expect(await screen.findByRole('table', { name: 'İç denetim programı' })).toBeTruthy();
    expect(screen.queryAllByRole('button', { name: /: planlandı$/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Otomatik planla' }));
    expect(screen.getAllByRole('button', { name: /: (planlandı|gecikti)$/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Plan oluşturuldu: ana süreçler yılda iki, diğerleri bir kez')).toBeTruthy();
  });

  it('plansız denetim yürütülür; bütün maddeler cevaplanınca tamamlanır', async () => {
    sahteSunucu({ depo: dolu() });
    await baglamlaAc(<IcDenetim />, 'icd');
    fireEvent.click(await screen.findByRole('tab', { name: 'Denetimler' }));
    const secim = screen.getByLabelText('Süreç');
    const ilk = within(secim).getAllByRole('option')[1] as HTMLOptionElement;
    fireEvent.change(secim, { target: { value: ilk.value } });
    const tamamla = await screen.findByRole('button', { name: 'Denetimi tamamla' });
    expect((tamamla as HTMLButtonElement).disabled).toBe(true);
    const uygunlar = screen.getAllByRole('button', { name: 'Uygun' });
    uygunlar.slice(1).forEach((b) => { fireEvent.click(b); });
    fireEvent.click(screen.getAllByRole('button', { name: 'Minör' })[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText('1. madde bulgusu'), { target: { value: 'Süreç kartında sahip yok' } });
    expect((screen.getByRole('button', { name: 'Denetimi tamamla' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Denetimi tamamla' }));
    expect(await screen.findByText(/Bulgular takvime ve Performans sayfasına işlendi/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Raporu kopyala' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Listeye dön' }));
    expect(screen.getByText(/1 minör · 14 uygun/)).toBeTruthy();
  });

  it('saha turu kaydedilir; uygunsuzluk açık kalır, "Düzeltildi" ile kapanır', async () => {
    sahteSunucu({ depo: dolu() });
    await baglamlaAc(<IcDenetim />, 'icd');
    fireEvent.click(await screen.findByRole('tab', { name: 'Saha kontrolleri' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Başlat' })[0] as HTMLElement);
    const kaydet = await screen.findByRole('button', { name: 'Turu kaydet' });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Uygun değil' })[0] as HTMLElement);
    screen.getAllByRole('button', { name: 'Uygun' }).slice(1).forEach((b) => { fireEvent.click(b); });
    fireEvent.click(screen.getByRole('button', { name: 'Turu kaydet' }));
    expect(await screen.findByText('Açık uygunsuzluklar')).toBeTruthy();
    expect(screen.getByText('Son turlar')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltildi' }));
    expect(screen.queryByText('Açık uygunsuzluklar')).toBeNull();
  });
});

describe('İç denetim (reddedilen: yazma yetkisi yok)', () => {
  it('plan, yürütme ve saha düğmeleri gizli; hücreler pasif; bitmiş denetim görüntülenir', async () => {
    const depo = dolu();
    const p = depo.data[depo.active];
    if (!p) throw new Error('profil yok');
    const proc = p.kys.procs[0];
    if (!proc) throw new Error('süreç yok');
    p.ic.runs.push({ id: 'ic1', pid: proc.id, pname: proc.name, date: '2026-01-10', aud: 'Deneme Denetçi', done: true, audId: '', items: [{ t: 'Madde', c: '4.4', g: '4', h: '', r: 'u', n: '' }] });
    sahteSunucu({ depo, yazabilir: false, yonetici: false });
    await baglamlaAc(<IcDenetim />, 'icd');
    await screen.findByRole('table', { name: 'İç denetim programı' });
    expect(screen.queryByRole('button', { name: 'Otomatik planla' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /: plan yok$/ }).every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByRole('textbox', { name: /denetçisi$/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Denetimler' }));
    expect(screen.queryByText('Plansız denetim başlat')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Görüntüle' }));
    expect(await screen.findByRole('button', { name: 'Raporu kopyala' })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Uygun' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Saha kontrolleri' }));
    expect(screen.queryByRole('button', { name: 'Başlat' })).toBeNull();
  });
});
