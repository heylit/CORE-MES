import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { baglamlaAc, ornekDepo, sahteSunucu } from '../test-ortak.tsx';
import { Kys } from './index.tsx';

// KYS görünüm testleri: yazabilen ve salt okur. Veri sentetiktir.

// Yazdırma penceresi jsdom'da yoktur.
window.print = () => undefined;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); document.querySelectorAll('.tc-dhy-yazdirma-alani').forEach((x) => { x.remove(); }); });

const ac = async (yazabilir = true) => {
  sahteSunucu({ depo: ornekDepo(), yazabilir, yonetici: yazabilir });
  await baglamlaAc(<Kys />, 'kys');
  await screen.findByRole('tablist', { name: 'KYS bölümleri' });
};
const sekme = (ad: string) => { fireEvent.click(screen.getByRole('tab', { name: ad })); };

describe('KYS (yazabilen)', () => {
  it('dokuz alt sekme ve olgunluk; yapı taşının durumu değişir', async () => {
    await ac();
    expect(screen.getAllByRole('tab').filter((t) => t.closest('[aria-label="KYS bölümleri"]'))).toHaveLength(9);
    expect(screen.getByText(/KYS olgunluğu ·/)).toBeTruthy();
    sekme('Yapı taşları');
    const ust = screen.getAllByRole('button', { expanded: false })[0];
    if (!ust) throw new Error('yapı taşı yok');
    fireEvent.click(ust);
    const grup = screen.getByRole('group', { name: 'Durum' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Yürürlükte' }));
    expect(within(grup).getByRole('button', { name: 'Yürürlükte' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bugün gözden geçirildi' })).toBeTruthy();
  });

  it('süreç şablonları eklenir, süreç formu açılır', async () => {
    await ac();
    sekme('Süreçler');
    fireEvent.click(screen.getByRole('button', { name: 'Tipik üretim süreçlerini ekle' }));
    expect(await screen.findByText('Süreç göstergeleri')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süreç ekle' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('doküman üretici: kod verilir, açılan doküman yürürlüğe alınır ve revizyon yapılır; yazdırma alanı dolar', async () => {
    await ac();
    sekme('Doküman üretici');
    expect((await screen.findAllByText('KYS-PR-001')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Doküman ve kayıt kontrol prosedürü/ }));
    expect(await screen.findByRole('button', { name: 'Kütüphane' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Doküman kontrol akışı' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yürürlüğe al' }));
    expect(await screen.findByText('Yürürlükte · Rev. 00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revizyon yap' }));
    fireEvent.change(screen.getByLabelText('Revizyon açıklaması'), { target: { value: 'Akış güncellendi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Revizyonu yayınla' }));
    expect(await screen.findByText('Yürürlükte · Rev. 01')).toBeTruthy();
    expect(screen.getByText('Akış güncellendi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yazdır / PDF' }));
    const alan = document.querySelector('.tc-dhy-yazdirma-alani');
    expect(alan?.textContent).toContain('DOKÜMAN VE KAYIT KONTROL PROSEDÜRÜ');
    expect(alan?.querySelector('[data-theme="light"]')).toBeTruthy();
  });

  it('bölüm düzenlenir ve varsayılana döner', async () => {
    await ac();
    sekme('Doküman üretici');
    fireEvent.click(await screen.findByRole('button', { name: /Kalite politikası/ }));
    const duzenle = (await screen.findAllByRole('button', { name: /: düzenle$/ }))[0];
    if (!duzenle) throw new Error('bölüm yok');
    fireEvent.click(duzenle);
    const metin = screen.getByRole('textbox', { name: /metni$/ });
    fireEvent.change(metin, { target: { value: 'Deneme metni' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bitti' }));
    expect(screen.getByText('Deneme metni')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tüm bölümleri varsayılana döndür' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tüm bölümleri varsayılana döndür' }));
    expect(screen.queryByText('Deneme metni')).toBeNull();
  });

  it('dosyalamada elle doküman eklenir; görevli atanır; rutin görev işaretlenir', async () => {
    await ac();
    sekme('Dosyalama');
    fireEvent.change(screen.getByLabelText('Doküman adı'), { target: { value: 'Tezgâh talimatı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText('Tezgâh talimatı')).toBeTruthy();
    expect(screen.getAllByText('KYS-TL-001').length).toBeGreaterThan(0);
    sekme('Görev tanımları');
    const gorevli = screen.getAllByLabelText('Görevli')[0];
    if (!gorevli) throw new Error('rol yok');
    fireEvent.change(gorevli, { target: { value: 'Deneme Kişi' } });
    expect((screen.getAllByLabelText('Görevli')[0] as HTMLInputElement).value).toBe('Deneme Kişi');
    sekme('Rutin görevler');
    const kutu = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
    fireEvent.click(kutu);
    expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
  });

  it('şemalar: pano, akış şeması, kaplumbağa boş durumu ve dosya ağacı', async () => {
    await ac();
    sekme('Şemalar ve grafikler');
    expect(screen.getByText('KYS olgunluğu: PUKÖ')).toBeTruthy();
    sekme('Akış şemaları');
    expect(screen.getByRole('img', { name: 'Doküman kontrol akışı' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Akış şeması'), { target: { value: 'dof' } });
    expect(screen.getByRole('img', { name: /Uygunsuz çıktı ve düzeltici/ })).toBeTruthy();
    sekme('Kaplumbağa');
    expect(screen.getByText('Önce süreç tanımlayın')).toBeTruthy();
    sekme('Dosya ağacı');
    expect(screen.getByText('0 doküman')).toBeTruthy();
  });
});

describe('KYS (salt okur)', () => {
  it('yazma düğmeleri gizli, alanlar salt okunur, işaretler kapalı', async () => {
    await ac(false);
    sekme('Yapı taşları');
    const ust = screen.getAllByRole('button', { expanded: false })[0];
    if (!ust) throw new Error('yapı taşı yok');
    fireEvent.click(ust);
    expect(screen.queryByRole('button', { name: 'Bugün gözden geçirildi' })).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Durum' })).getByRole('button', { name: 'Yürürlükte' }).hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('Revizyon') as HTMLInputElement).readOnly).toBe(true);
    sekme('Süreçler');
    expect(screen.queryByRole('button', { name: 'Süreç ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tipik üretim süreçlerini ekle' })).toBeNull();
    sekme('Doküman üretici');
    expect(screen.queryByRole('button', { name: 'Logo yükle' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kalite politikası/ }));
    expect(await screen.findByRole('button', { name: 'Kütüphane' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yürürlüğe al' })).toBeNull();
    expect(screen.queryByRole('button', { name: /: düzenle$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Yazdır / PDF' })).toBeTruthy();
    expect(screen.getByText('Oluşturulmadı')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kütüphane' }));
    sekme('Dosyalama');
    expect(screen.queryByRole('form', { name: 'Doküman ekle' })).toBeNull();
    sekme('Rutin görevler');
    expect(screen.getAllByRole('checkbox').every((k) => (k as HTMLInputElement).disabled)).toBe(true);
    sekme('Görev tanımları');
    expect((screen.getAllByLabelText('Görevli')[0] as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Kopyala' }).length).toBeGreaterThan(0);
  });
});
