import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Ayar } from '#paylasilan/sozlesme/ayarlar.ts';
import { Lsv2MakineListesi } from './Lsv2MakineListesi.tsx';

// Kart 3757: Heidenhain makine listesi satır satır. Kodlar ve adresler uydurmadır.
const ayar = (deger: string): Extract<Ayar, { tur: 'metin' }> => ({
  anahtar: 'tezgah-baglantisi.lsv2-makineleri', baslik: 'Heidenhain makineleri', aciklama: 'Deneme açıklaması', tur: 'metin', deger,
  enUzun: 2000, bosOlabilir: true, bicim: 'lsv2-makineleri',
});
const ac = (deger: string, degistir = vi.fn()) => {
  render(<ul><Lsv2MakineListesi ayar={ayar(deger)} mesgul={false} degistir={degistir} /></ul>);
  return degistir;
};

afterEach(cleanup);

describe('Heidenhain makine listesi (Sistem Ayarları)', () => {
  it('kayıtlı liste satır satır açılır; sayaç yoksa kutu boştur', () => {
    ac('ORN-H01=10.250.0.11;D10000,ORN-H02=10.250.0.12');
    expect(screen.getAllByLabelText('Makine kodu').map((g) => (g as HTMLInputElement).value)).toEqual(['ORN-H01', 'ORN-H02']);
    expect(screen.getAllByLabelText('Sayaç adresi').map((g) => (g as HTMLInputElement).value)).toEqual(['D10000', '']);
  });

  it('hata ilgili kutunun altında yazar; hatalı listede Kaydet kapalıdır', () => {
    const degistir = ac('ORN-H01=10.250.0.11;D10000');
    fireEvent.click(screen.getByRole('button', { name: /Makine ekle/ }));
    const kod = screen.getAllByLabelText('Makine kodu')[1]!;
    fireEvent.change(kod, { target: { value: 'ORN-H03' } });
    fireEvent.change(screen.getAllByLabelText('IP adresi')[1]!, { target: { value: '203.0.113.5' } });
    fireEvent.change(screen.getAllByLabelText('Sayaç adresi')[1]!, { target: { value: 'd10002' } });
    expect(screen.getByText(/Kurum içi adres değil/)).toBeTruthy();
    expect(screen.getByText(/4'ün katı/)).toBeTruthy();
    const kaydet = screen.getByRole('button', { name: /Kaydet \(2 hata\)/ });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(kaydet.closest('form')!);
    expect(degistir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /İlk hataya git/ }));
    expect(document.activeElement).toBe(screen.getAllByLabelText('IP adresi')[1]);
    expect(screen.getByText(/Kaydedilmemiş değişiklik/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Vazgeç/ }));
    expect(screen.getAllByLabelText('Makine kodu')).toHaveLength(1);
    expect(screen.queryByText(/Kaydedilmemiş değişiklik/)).toBeNull();
  });

  it('geçerli liste tek metin olarak kaydedilir; silinen satır çıkar, boş satır yok sayılır', () => {
    const degistir = ac('ORN-H01=10.250.0.11;D10000,ORN-H02=10.250.0.12');
    fireEvent.click(screen.getByRole('button', { name: 'Sil: ORN-H01' }));
    fireEvent.click(screen.getByRole('button', { name: /Makine ekle/ }));
    fireEvent.change(screen.getAllByLabelText('Sayaç adresi')[0]!, { target: { value: 'd10004' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(degistir).toHaveBeenCalledWith('ORN-H02=10.250.0.12;D10004');
  });
});
