import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Komut } from '../rota/komutlar.ts';
import { useSayfaKomutlari, type SayfaKomutu } from '../rota/sayfa-komutlari.ts';
import { Kabuk } from './Kabuk.tsx';

const MENU: IkinciMenu = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  gruplar: [{ maddeler: [
    { anahtar: 'is', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'ornek.oku' },
    { anahtar: 'okut', baslik: 'Okut', yol: '/stok/okut', simge: 'scan', islem: 'ornek.oku' },
  ] }],
};

// Kayıt araması sunucuya gider; burada yalnız sayfa, menü ve komut ölçülür.
const SAYFALAR_ARAMASIZ = SAYFALAR.map((s) => {
  const { aramaUcu: _uc, ...kalan } = s as Sayfa & { aramaUcu?: string };
  return kalan;
}) as readonly Sayfa[];

const KOMUTLAR: readonly Komut[] = [
  { anahtar: 'okut-ac', sira: 10, baslik: 'Etiket okut', aciklama: 'Okut ekranını açar.', sozcukler: ['barkod'], simge: 'scan', yol: '/stok/okut', islem: 'ornek.oku' as Islem },
  { anahtar: 'yazma-ister', sira: 20, baslik: 'Etiket sil', aciklama: 'Yazma işlemi ister.', simge: 'trash', yol: '/stok/okut', islem: 'ornek.yaz' as Islem },
];

function Konum() {
  return <p data-testid="konum">{useLocation().pathname}</p>;
}

function KomutluSayfa({ komutlar }: { komutlar: readonly SayfaKomutu[] }) {
  useSayfaKomutlari('/stok', komutlar);
  return <p>Pano</p>;
}

const sayfaKomutu = (anahtar: string, baslik: string, calistir: () => void): SayfaKomutu => ({
  anahtar, baslik, simge: 'bolt', aciklama: null, sozcukler: [], calistir,
});

function ciz(icerik: React.ReactNode, islemler: string[] = ['ornek.oku'], adres = '/stok') {
  return render(
    <MemoryRouter initialEntries={[adres]}>
      <Kabuk sayfalar={SAYFALAR_ARAMASIZ} kullaniciAdi="Deneme Kişi" cikis={() => undefined} islemler={islemler} ikinciMenuler={[MENU]} komutlar={KOMUTLAR}>
        <Konum />
        <Routes><Route path="/stok/*" element={icerik} /><Route path="*" element={<p>Başka</p>} /></Routes>
      </Kabuk>
    </MemoryRouter>,
  );
}

const kutu = () => within(screen.getByRole('banner')).getByRole('combobox');
const ac = () => { fireEvent.focus(kutu()); };
const yaz = (metin: string) => { ac(); fireEvent.change(kutu(), { target: { value: metin } }); };
const secenekler = () => screen.queryAllByRole('option').map((o) => o.getAttribute('aria-label'));

afterEach(() => { cleanup(); });

describe('Ctrl K komutları', () => {
  it('bu sayfanın komutları boş sorguda en üstte listelenir; Enter seçili komutu çalıştırır ve paleti kapatır', () => {
    const gunOzeti = vi.fn();
    ciz(<KomutluSayfa komutlar={[sayfaKomutu('gun-ozeti', 'Gün özeti', gunOzeti), sayfaKomutu('geri-al', 'Geri al', () => undefined)]} />);
    ac();
    expect(secenekler()).toEqual(['Gün özeti Bu sayfa', 'Geri al Bu sayfa']);
    expect(kutu().getAttribute('aria-label')).toBe('Sayfa ya da komut ara');
    fireEvent.keyDown(kutu(), { key: 'Enter' });
    expect(gunOzeti).toHaveBeenCalledTimes(1);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByTestId('konum').textContent).toBe('/stok');
  });

  it('yazınca sayfa komutu, sayfa ve genel komut birlikte süzülür; genel komut ekranını açar (yazma yapmaz)', () => {
    ciz(<KomutluSayfa komutlar={[sayfaKomutu('okut-say', 'Okutulanı say', () => undefined)]} />);
    yaz('okut');
    expect(secenekler()).toEqual(['Okutulanı say Bu sayfa', 'Stok Merkezi › Okut', 'Etiket okut Okut ekranını açar. Komut']);
    yaz('barkod');
    fireEvent.keyDown(kutu(), { key: 'Enter' });
    expect(screen.getByTestId('konum').textContent).toBe('/stok/okut');
  });

  it('reddedilen: işlemi olmayan genel komut görünmez; sayfa kalkınca komutları paletten düşer', () => {
    ciz(<KomutluSayfa komutlar={[sayfaKomutu('gun-ozeti', 'Gün özeti', () => undefined)]} />);
    yaz('etiket');
    expect(secenekler()).toContain('Etiket okut Okut ekranını açar. Komut');
    expect(secenekler().some((s) => s?.startsWith('Etiket sil'))).toBe(false);
    cleanup();
    ciz(<p>Komutsuz</p>, ['ornek.oku'], '/baska');
    ac();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    yaz('gun');
    expect(secenekler()).toEqual([]);
  });

  it('sayfa komutu fareyle seçilince de çalışır', () => {
    const calis = vi.fn();
    ciz(<KomutluSayfa komutlar={[sayfaKomutu('brifing', 'Sabah brifingi', calis)]} />);
    ac();
    act(() => { fireEvent.click(screen.getByRole('option', { name: 'Sabah brifingi Bu sayfa' })); });
    expect(calis).toHaveBeenCalledTimes(1);
  });
});
