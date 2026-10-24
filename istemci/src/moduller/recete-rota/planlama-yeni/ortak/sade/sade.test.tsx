import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SadeSayfa, alanHatalari, type SadeTanimi, type SihirbazTanimi } from './index.ts';

// Değerler uydurmadır.
afterEach(() => { cleanup(); });

function form(kaydet = vi.fn()): SihirbazTanimi {
  return {
    id: 'ayar', ad: 'Ayarları değiştir', simge: 'gear', ne: 'Hız ve sınır.',
    alanlar: () => [
      { k: 'tur', ad: 'Tür', tur: 'secim', zorunlu: true, secenekler: [['a', 'Birinci'], ['b', 'İkinci']] },
      { k: 'oran', ad: 'Oran (%)', tur: 'sayi', zorunlu: true, min: 0, max: 60 },
      { k: 'ay', ad: 'Ay', tur: 'sayi', zorunlu: true, min: 1, max: 12, tam: true },
    ],
    adimlar: [{ ad: 'Tür', ne: 'Hangisi olsun.', k: ['tur'] }, { ad: 'Sınırlar', k: ['oran', 'ay'] }],
    ilk: () => ({ tur: '', oran: '10', ay: '' }),
    ileri: (d, adim) => (adim === 0 ? { ...d, ay: '3' } : undefined),
    sonuc: 'ayarlar değişir.',
    kaydet, bitti: () => 'Ayarlar kaydedildi',
  };
}

function sayfa(formlar: SihirbazTanimi[]): SadeTanimi {
  return {
    ad: 'Deneme sayfası', simge: 'target', ne: 'Sayfanın açıklaması.',
    kutular: [{ simge: 'check', ad: 'Durum', deger: 'Hazır', ton: 'tamam' }, { simge: 'x', ad: 'Eksik', deger: null }],
    yapilacak: (g) => [{ simge: 'edit', metin: 'Ayarları girin', neden: 'Henüz yok.', dugme: { ad: 'Gir', simge: 'edit', yap: () => { g.form('ayar'); } } }],
    nasil: ['Birinci madde.'],
    formlar, tum: () => <p>Asıl sayfa</p>,
  };
}

const dugme = (ad: string) => screen.getByRole('button', { name: ad });

describe('Sade kabuk', () => {
  it('Özet: durum kutuları, yapılacaklar, Veri gir kartları ve açıklama; veri yoksa çizgi', () => {
    render(<SadeSayfa tanim={sayfa([form()])} />);
    expect(screen.getByRole('heading', { name: 'Deneme sayfası' })).toBeTruthy();
    const sekmeler = within(screen.getByRole('tablist', { name: 'Görünüm' })).getAllByRole('tab').map((s) => s.textContent);
    expect(sekmeler).toEqual(['Özet', 'Veri gir', 'Tüm ayrıntılar']);
    const durum = screen.getByRole('region', { name: 'Durum' });
    expect(durum.textContent).toContain('Hazır');
    expect(durum.textContent).toContain('—');
    expect(screen.getByRole('region', { name: 'Şimdi ne yapmalı' }).textContent).toContain('Ayarları girin');
    expect(within(screen.getByRole('region', { name: 'Veri gir' })).getByRole('button', { name: /Ayarları değiştir/ })).toBeTruthy();
    expect(screen.getByText('Bu sayfa nasıl çalışır?')).toBeTruthy();
  });

  it('formu olmayan kişide Veri gir sekmesi ve bölümü yok; yapılacak yoksa boş iletisi', () => {
    render(<SadeSayfa tanim={{ ...sayfa([]), yapilacak: () => [] }} />);
    const sekmeler = within(screen.getByRole('tablist', { name: 'Görünüm' })).getAllByRole('tab').map((s) => s.textContent);
    expect(sekmeler).toEqual(['Özet', 'Tüm ayrıntılar']);
    expect(screen.queryByRole('region', { name: 'Veri gir' })).toBeNull();
    expect(screen.getByText('Şu an bu sayfada yapılacak bir şey yok.')).toBeTruthy();
  });

  it('Tüm ayrıntılar asıl sayfayı çizer', () => {
    render(<SadeSayfa tanim={sayfa([form()])} />);
    fireEvent.click(screen.getByRole('tab', { name: /Tüm ayrıntılar/ }));
    expect(screen.getByText('Asıl sayfa')).toBeTruthy();
  });

  it('sihirbaz: adım denetimi, İleri ile dolan değer, Kontrol et özeti, Kaydet ve Kaydedildi kartı', () => {
    const kaydet = vi.fn();
    render(<SadeSayfa tanim={sayfa([form(kaydet)])} />);
    fireEvent.click(dugme('Gir'));
    const sihir = screen.getByRole('region', { name: 'Ayarları değiştir' });
    expect(within(sihir).getAllByRole('listitem').map((l) => l.textContent)).toEqual(['1Tür', '2Sınırlar', '3Kontrol et']);
    fireEvent.click(dugme('İleri'));
    expect(screen.getByRole('alert').textContent).toBe('Tür boş olamaz.');
    fireEvent.change(screen.getByLabelText(/Tür/), { target: { value: 'b' } });
    fireEvent.click(dugme('İleri'));
    expect((screen.getByRole('spinbutton', { name: /^Ay\b/ }) as HTMLInputElement).value).toBe('3');
    fireEvent.change(screen.getByLabelText(/Oran/), { target: { value: '70' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Ay\b/ }), { target: { value: '2.5' } });
    fireEvent.click(dugme('İleri'));
    expect(screen.getByRole('alert').textContent).toBe('Oran (%) en çok 60. Ay tam sayı olmalı.');
    fireEvent.click(dugme('Geri'));
    expect((screen.getByLabelText(/Tür/) as HTMLSelectElement).value).toBe('b');
    fireEvent.click(dugme('İleri'));
    fireEvent.change(screen.getByLabelText(/Oran/), { target: { value: '20' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: /^Ay\b/ }), { target: { value: '4' } });
    fireEvent.click(dugme('İleri'));
    expect(screen.getByText('Kontrol edin. Kaydet dediğinizde ayarlar değişir.')).toBeTruthy();
    const ozet = [...document.querySelectorAll('.tc-sade-ozet dd')].map((x) => x.textContent);
    expect(ozet).toEqual(['İkinci', '20', '4']);
    expect(kaydet).not.toHaveBeenCalled();
    fireEvent.click(dugme('Kaydet'));
    expect(kaydet).toHaveBeenCalledWith({ tur: 'b', oran: '20', ay: '4' });
    expect(screen.getByRole('status').textContent).toContain('Ayarlar kaydedildi');
    expect(screen.queryByRole('region', { name: 'Ayarları değiştir' })).toBeNull();
    fireEvent.click(dugme('Kapat'));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Veri gir sekmesi: form kartı sihirbazı açar, Vazgeç kaydetmeden kartlara döner', () => {
    const kaydet = vi.fn();
    render(<SadeSayfa tanim={sayfa([form(kaydet)])} />);
    fireEvent.click(screen.getByRole('tab', { name: /Veri gir/ }));
    expect(screen.getByRole('heading', { name: 'Ne girmek istiyorsunuz?' })).toBeTruthy();
    fireEvent.click(dugme('Ayarları değiştir Hız ve sınır.'));
    expect(screen.getByRole('form', { name: 'Ayarları değiştir' })).toBeTruthy();
    fireEvent.click(dugme('Vazgeç'));
    expect(kaydet).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Ne girmek istiyorsunuz?' })).toBeTruthy();
  });

  it('kayıtta ek kontrol iletisi kaydı durdurur', () => {
    const kaydet = vi.fn();
    const f: SihirbazTanimi = { ...form(kaydet), ilk: () => ({ tur: 'a', oran: '1', ay: '1' }), kontrol: (_d, adim) => (adim === -1 ? 'Hiçbir şey değişmedi.' : null) };
    render(<SadeSayfa tanim={sayfa([f])} />);
    fireEvent.click(dugme('Gir'));
    fireEvent.click(dugme('İleri'));
    fireEvent.click(dugme('İleri'));
    fireEvent.click(dugme('Kaydet'));
    expect(screen.getByRole('alert').textContent).toBe('Hiçbir şey değişmedi.');
    expect(kaydet).not.toHaveBeenCalled();
  });
});

describe('alanHatalari', () => {
  it('eski formOku iletileri; boş zorunlu olmayan ve evet alanı geçer; virgül ondalık sayılır', () => {
    expect(alanHatalari([
      { k: 'a', ad: 'A', tur: 'sayi', zorunlu: true },
      { k: 'b', ad: 'B', tur: 'sayi' },
      { k: 'c', ad: 'C', tur: 'sayi', min: 1 },
      { k: 'd', ad: 'D', tur: 'sayi' },
      { k: 'e', ad: 'E', tur: 'evet', zorunlu: true },
      { k: 'f', ad: 'F', tur: 'sayi', max: 2 },
    ], { a: ' ', b: '', c: '0,5', d: 'x', f: '1,5' })).toEqual(['A boş olamaz.', 'C en az 1.', 'D sayı olmalı.']);
  });
});
