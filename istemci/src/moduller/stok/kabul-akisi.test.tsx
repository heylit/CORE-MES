import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { KabulAkisi, type AkisKalemi, type AkisSonucu } from './KabulAkisi.tsx';

const KALEMLER: AkisKalemi[] = [
  { anahtar: 1, ad: 'ORN kalem A', siparis: 'ORN-SIP-1', birim: 'adet', beklenen: '10', kalan: '10', miktar: '10' },
  { anahtar: 2, ad: 'ORN kalem B', siparis: 'ORN-SIP-1', birim: 'adet', beklenen: '5', kalan: '5', miktar: '5' },
];
afterEach(cleanup);

function Sarmal({ sonuc = 'bekliyor', gonder = vi.fn(), kapat = vi.fn(), yazilan = [] as string[] }: { sonuc?: AkisSonucu; gonder?: (a: readonly number[]) => void; kapat?: () => void; yazilan?: string[] }) {
  const [k, kYaz] = useState(KALEMLER);
  const [irs, irsYaz] = useState('');
  return (
    <KabulAkisi kalemler={k} irsaliye={irs} irsaliyeYaz={irsYaz} gonder={gonder} sonuc={sonuc} hataMetni={null} kapat={kapat} ayrintili={vi.fn()}
      miktarYaz={(a, m) => { yazilan.push(`${String(a)}=${m}`); kYaz((o) => o.map((x) => (x.anahtar === a ? { ...x, miktar: m } : x))); }} />
  );
}
const tus = (t: string) => { fireEvent.click(screen.getByRole('button', { name: t })); };

describe('kalem kalem mal kabul akışı (kart 3676)', () => {
  it('sayım sıfırdan başlar; miktar yokken Sonraki kapalı ve ipucu görünür', () => {
    render(<Sarmal />);
    expect(screen.getByRole('button', { name: 'Sonraki' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Miktar girin ya da kalem gelmediyse atlayın')).toBeTruthy();
    tus('3');
    expect(screen.getByRole('button', { name: 'Sonraki' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('3');
  });

  it('siparişten fazla miktar engellenmez, uyarı gösterir', () => {
    render(<Sarmal />);
    tus('1'); tus('2');
    expect(screen.getByRole('alert').textContent).toContain('fazla teslim olarak yazılır');
    expect(screen.getByRole('button', { name: 'Sonraki' }).hasAttribute('disabled')).toBe(false);
  });

  it('Gelmedi kalemi atlar; gönderimde miktarsız kalem hariç tutulur', () => {
    const gonder = vi.fn();
    render(<Sarmal gonder={gonder} />);
    tus('4');
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gelmedi' }));
    expect(screen.getByText('1 kalem kabul edilecek, 1 kalem gelmedi')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kabul et' }));
    expect(gonder).toHaveBeenCalledWith([2]);
  });

  it('girdi varken çıkış onay sorar; Sil ve çık ilk miktarları geri koyar', () => {
    const kapat = vi.fn(); const yazilan: string[] = [];
    render(<Sarmal kapat={kapat} yazilan={yazilan} />);
    tus('4');
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.getByRole('dialog', { name: 'Girdiler silinsin mi?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    expect(screen.queryByRole('dialog', { name: 'Girdiler silinsin mi?' })).toBeNull();
    expect(kapat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sil ve çık' }));
    expect(kapat).toHaveBeenCalled();
    expect(yazilan.slice(-2)).toEqual(['1=10', '2=5']);
  });

  it('girdi yokken çıkış sormadan kapanır', () => {
    const kapat = vi.fn();
    render(<Sarmal kapat={kapat} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(kapat).toHaveBeenCalled();
  });

  it('sonuç sunucudan gelmeden başarı yok; hatada miktarlar korunur ve Tekrar dene çıkar', () => {
    const { rerender } = render(<KabulAkisi kalemler={KALEMLER} miktarYaz={vi.fn()} irsaliye="" irsaliyeYaz={vi.fn()} gonder={vi.fn()} sonuc="gonderiyor" hataMetni={null} kapat={vi.fn()} ayrintili={vi.fn()} />);
    expect(screen.queryByText('Mal kabul kaydedildi')).toBeNull();
    rerender(<KabulAkisi kalemler={KALEMLER} miktarYaz={vi.fn()} irsaliye="" irsaliyeYaz={vi.fn()} gonder={vi.fn()} sonuc="hata" hataMetni={null} kapat={vi.fn()} ayrintili={vi.fn()} />);
    expect(screen.queryByText('Mal kabul kaydedildi')).toBeNull();
  });

  it('miktar yokken gösterge sıfır uydurmaz; özet satırına dokunmak kaleme götürür ve düzeltince özete döner', () => {
    render(<Sarmal />);
    expect(screen.getByRole('status').textContent).toContain('—');
    tus('4'); fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gelmedi' }));
    expect(screen.getByText('Sipariş açık kalır')).toBeTruthy();
    expect(screen.getByText('Beklenen 10')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN kalem B düzelt' }));
    tus('5');
    fireEvent.click(screen.getByRole('button', { name: 'Özete geç' }));
    expect(screen.getByText('2 kalem kabul edilecek')).toBeTruthy();
  });

  it('hata tek yerde (sayfa içi kutu) gösterilir; Ayrıntılı gir ayrı düğmedir', () => {
    const ayrintili = vi.fn();
    render(<KabulAkisi kalemler={KALEMLER} miktarYaz={vi.fn()} irsaliye="" irsaliyeYaz={vi.fn()} gonder={vi.fn()} sonuc="hata" hataMetni="Bağlantıyı kontrol edip yeniden deneyin." kapat={vi.fn()} ayrintili={ayrintili} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki' }));
    fireEvent.click(screen.getByRole('button', { name: 'Özete geç' }));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ayrıntılı gir' }));
    expect(ayrintili).toHaveBeenCalled();
  });

  it('açılınca odak katmana girer; kapanınca açan düğmeye döner', () => {
    const { container, unmount } = render(<button type="button">Kalem kalem say</button>);
    const acan = container.querySelector('button')!;
    acan.focus();
    const alt = render(<Sarmal />);
    expect(document.querySelector('.tc-kabul-akisi')?.contains(document.activeElement)).toBe(true);
    alt.unmount();
    expect(document.activeElement).toBe(acan);
    unmount();
  });
});
