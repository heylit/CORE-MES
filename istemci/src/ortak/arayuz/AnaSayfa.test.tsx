import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SayiKarti } from './SayiKarti.tsx';
import type { AnaSayfaKarti } from '../rota/ana-sayfa.ts';
import { AnaSayfa } from './AnaSayfa.tsx';

afterEach(cleanup);

const ekran = (metin: string) => () => <section aria-label={metin}>{metin}</section>;
const KARTLAR: AnaSayfaKarti[] = [
  { anahtar: 'sistem', sira: 900, genis: true, ekran: ekran('Sistem kartı') },
  { anahtar: 'talep', sira: 100, islem: 'satin-alma.talep-ac', ekran: ekran('Talep kartı') },
];
const bolgeler = () => screen.queryAllByRole('region').map((b) => b.getAttribute('aria-label'));

describe('AnaSayfa', () => {
  it('yetkisi olana kartlari siraya gore cizer; olmayana yalniz herkese acik karti', () => {
    render(<AnaSayfa kartlar={KARTLAR} islemler={['satin-alma.talep-ac']} />);
    expect(bolgeler()).toEqual(['Talep kartı', 'Sistem kartı']);
    cleanup();

    render(<AnaSayfa kartlar={KARTLAR} islemler={[]} />);
    expect(bolgeler()).toEqual(['Sistem kartı']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('bolum bildiren kartlari basligiyla bolumlere ayirir; yetkisi olmayanin bolumu hic cizilmez', () => {
    const kartlar: AnaSayfaKarti[] = [
      ...KARTLAR,
      { anahtar: 'kuyruk', sira: 10, bolum: 'is', islem: 'sayfa.kuyruk', ekran: ekran('Kuyruk kartı') },
      { anahtar: 'dusuk-stok', sira: 20, bolum: 'uyari', islem: 'sayfa.stok', ekran: ekran('Düşük stok kartı') },
    ];
    render(<AnaSayfa kartlar={kartlar} islemler={['sayfa.kuyruk', 'sayfa.stok']} />);
    const bolumler = screen.getAllByRole('heading', { level: 2 }).map((b) => b.textContent);
    expect(bolumler).toEqual(['Bana düşen işler', 'Uyarılar']);
    expect(within(screen.getByRole('region', { name: 'Uyarılar' })).getByRole('region', { name: 'Düşük stok kartı' })).toBeTruthy();
    // Bölümün adı başlığından gelir (aria-labelledby); kart sırası bölüm sırasıdır.
    expect(bolgeler()).toEqual([null, 'Kuyruk kartı', null, 'Düşük stok kartı', 'Sistem kartı']);
    cleanup();

    render(<AnaSayfa kartlar={kartlar} islemler={['sayfa.kuyruk']} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((b) => b.textContent)).toEqual(['Bana düşen işler']);
    expect(screen.queryByRole('region', { name: 'Uyarılar' })).toBeNull();
  });

  it('gorunecek karti olmayana bos sayfa yerine bos durum metni gosterir', () => {
    render(<AnaSayfa kartlar={[KARTLAR[1]!]} islemler={['satin-alma.talep-ac']} />);
    expect(bolgeler()).toEqual(['Talep kartı']);
    cleanup();

    render(<AnaSayfa kartlar={[KARTLAR[1]!]} islemler={['saglik.ayrinti-oku']} />);
    expect(bolgeler()).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('size açık bir kart yok');
  });

  it('islerde ve uyarilarda sayisi sifir olan kart gizlenir; hepsi sifirsa bolum bos metnini gosterir', () => {
    const sayiKarti = (baslik: string, sayi: number | null) => () => <SayiKarti baslik={baslik} simge="flag" sayi={sayi} />;
    const kartlar: AnaSayfaKarti[] = [
      { anahtar: 'kuyruk', sira: 10, bolum: 'is', ekran: sayiKarti('Kuyruk', 0) },
      { anahtar: 'onay', sira: 11, bolum: 'is', ekran: sayiKarti('Onay', 3) },
      { anahtar: 'stok', sira: 20, bolum: 'uyari', ekran: sayiKarti('Düşük stok', 0) },
      { anahtar: 'kalibrasyon', sira: 21, bolum: 'uyari', ekran: sayiKarti('Kalibrasyon', null) },
      { anahtar: 'acik', sira: 30, bolum: 'ozet', ekran: sayiKarti('Açık emir', 0) },
    ];
    render(<MemoryRouter><AnaSayfa kartlar={kartlar} islemler={[]} /></MemoryRouter>);
    const gorunen = () => [...document.querySelectorAll('[data-kart]')].filter((k) => !k.closest('[hidden]')).map((k) => k.getAttribute('data-kart'));
    // Veri yok sıfır değildir; özet sıfırı da gösterir.
    expect(gorunen()).toEqual(['onay', 'kalibrasyon', 'acik']);
    expect(screen.queryByText('Bekleyen işiniz yok.')).toBeNull();
    cleanup();

    render(<MemoryRouter><AnaSayfa kartlar={kartlar.filter((k) => k.anahtar !== 'onay')} islemler={[]} /></MemoryRouter>);
    expect(within(screen.getByRole('region', { name: 'Bana düşen işler' })).getByText('Bekleyen işiniz yok.')).toBeTruthy();
    expect(gorunen()).toEqual(['kalibrasyon', 'acik']);
  });

  it('ozet ilk alti kartla baslar; dugme hepsini acar ve kapatir', () => {
    const kartlar: AnaSayfaKarti[] = Array.from({ length: 8 }, (_, i) => (
      { anahtar: `ozet-${i}`, sira: i, bolum: 'ozet' as const, ekran: ekran(`Özet ${i}`) }
    ));
    render(<AnaSayfa kartlar={kartlar} islemler={[]} />);
    expect(bolgeler().filter((b) => b?.startsWith('Özet '))).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Tüm özet (8)' }));
    expect(bolgeler().filter((b) => b?.startsWith('Özet '))).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Daha az göster' }));
    expect(bolgeler().filter((b) => b?.startsWith('Özet '))).toHaveLength(6);
  });

  it('ad verilince kisiyi adiyla karsilar', () => {
    render(<AnaSayfa kartlar={KARTLAR} islemler={[]} ad="Deneme Kişi" />);
    expect(screen.getByText(/, Deneme Kişi$/)).toBeTruthy();
  });
});
