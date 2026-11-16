import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { TmiAdim } from '../veri/depo.ts';
import { TalimatListesi, acikGrup, grubu, zorunluEksikler, type Talimatlar } from './Talimatlar.tsx';

// 3338-4 a: talimatlar üç grupta; açık grup işin durumundan; ölçüm ve seçim değerle işaretlenir. Veriler uydurmadır (ORN-).
const madde = (id: number, ad: string, asama: TmiAdim['asama'], ek: Partial<TmiAdim> = {}): TmiAdim => ({ id, sira: id, ad, aciklama: null, tamam: false, asama, ...ek });
const L: TmiAdim[] = [
  madde(1, 'ORN aparatı bağla', 'on_hazirlik', { zorunlu: true }),
  madde(2, 'Sıfırı probla', 'hazirlik', { zorunlu: true, kontrol: { tur: 'olcum', ad: 'Z', alt: -0.02, ust: 0.02, birim: 'mm' } }),
  madde(3, 'Takım boyuna bak', 'hazirlik', { tamam: true }),
  madde(4, 'İlk parçayı bildir', 'uretim', { zorunlu: true }),
  madde(5, 'Yüzey', 'uretim', { kontrol: { tur: 'secim', secenekler: ['İyi', 'Çizik'] } }),
  madde(6, 'Aparatı sök', 'bitis', { zorunlu: true }),
  madde(7, 'Eski madde', undefined),
];
const t = (isaretle: Talimatlar['isaretle'] = () => undefined, liste: TmiAdim[] = L): Talimatlar => ({ liste, hata: null, isaretle });
afterEach(cleanup);

describe('operatör talimatları (3338-4 a)', () => {
  it('ön hazırlık ve hazırlık "Başlamadan önce", aşamasız eski madde üretimdir; açık grup işin durumundan gelir', () => {
    expect(L.map(grubu)).toEqual(['once', 'once', 'once', 'sira', 'sira', 'son', 'sira']);
    expect(['queued', 'setup', 'running', 'paused', 'stopped', 'done'].map(acikGrup)).toEqual(['once', 'once', 'sira', 'sira', 'sira', 'son']);
    expect(zorunluEksikler(L, 'once').map((x) => x.id)).toEqual([1, 2]);
    expect(zorunluEksikler(L, 'son').map((x) => x.id)).toEqual([6]);
    expect(zorunluEksikler([{ ...L[0]!, tamam: true }], 'once')).toEqual([]);
  });

  it('sıradaki işte yalnız "Başlamadan önce" açık; başlıkta zorunlu eksik ve sayı; öteki grup dokununca açılır', () => {
    render(<TalimatListesi t={t()} durum="queued" kapali={false} adimlar={undefined} isEmriId={null} />);
    const basliklar = screen.getAllByRole('button', { expanded: true }).concat(screen.getAllByRole('button', { expanded: false }));
    expect(basliklar.map((b) => b.textContent)).toEqual(['Başlamadan önceKurulum ve ilk kontrol2 zorunlu eksik1/3', 'Üretim sırasındaİş sürerken1 zorunlu eksik0/3', 'Bitinceİş bittikten sonra1 zorunlu eksik0/1']);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Bitince/ }));
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('onay maddesi dokununca işaretlenir; işaretli madde geri alınır; kapalıyken dokunulmaz', () => {
    const isaretle = vi.fn<Talimatlar['isaretle']>();
    const { rerender } = render(<TalimatListesi t={t(isaretle)} durum="setup" kapali={false} adimlar={undefined} isEmriId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'ORN aparatı bağla · zorunlu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Takım boyuna bak · işareti kaldır' }));
    expect(isaretle.mock.calls).toEqual([[1, true], [3, false]]);
    rerender(<TalimatListesi t={t(isaretle)} durum="setup" kapali adimlar={undefined} isEmriId={null} />);
    expect(screen.getByRole('button', { name: 'ORN aparatı bağla · zorunlu' })).toHaveProperty('disabled', true);
  });

  it('ölçüm maddesi değer ister: sınır yazılır, sayı olmadan Tamam kapalı, alttan ve üstten sınır dışı değer uyarılır, virgüllü değer sayı olarak gider', () => {
    const isaretle = vi.fn<Talimatlar['isaretle']>();
    render(<TalimatListesi t={t(isaretle)} durum="setup" kapali={false} adimlar={undefined} isEmriId={null} />);
    const satir = screen.getByRole('button', { name: 'Sıfırı probla · zorunlu' }).closest('li')!;
    expect(satir.textContent).toContain('Ölçüm · Z · -0,02–0,02 mm');
    fireEvent.click(within(satir).getByRole('button', { name: 'Sıfırı probla · zorunlu' }));
    expect(isaretle).not.toHaveBeenCalled();
    const tamam = within(satir).getByRole('button', { name: 'Tamam' });
    expect(tamam).toHaveProperty('disabled', true);
    const kutu = within(satir).getByRole('textbox', { name: 'Sıfırı probla · Z' });
    fireEvent.change(kutu, { target: { value: '0,05' } });
    expect(within(satir).getByRole('status').textContent).toBe('Sınır dışı (-0,02–0,02 mm) · yine kaydedilir');
    fireEvent.change(kutu, { target: { value: '-0,05' } });
    expect(within(satir).getByRole('status').textContent).toBe('Sınır dışı (-0,02–0,02 mm) · yine kaydedilir');
    fireEvent.change(kutu, { target: { value: '0,015' } });
    expect(within(satir).queryByRole('status')).toBeNull();
    fireEvent.click(tamam);
    expect(isaretle.mock.calls).toEqual([[2, true, { olcum: 0.015 }]]);
  });

  it('seçim maddesi seçenekle işaretlenir; işaretli maddenin kanıtı satırda okunur', () => {
    const isaretle = vi.fn<Talimatlar['isaretle']>();
    const liste = L.map((a) => (a.id === 4 ? { ...a, tamam: true } : a.id === 2 ? { ...a, tamam: true, kanit: { olcum: 0.015, secim: null, foto: null } } : a));
    render(<TalimatListesi t={t(isaretle, liste)} durum="running" kapali={false} adimlar={undefined} isEmriId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yüzey' }));
    fireEvent.click(screen.getByRole('button', { name: 'Çizik' }));
    expect(isaretle.mock.calls).toEqual([[5, true, { secim: 'Çizik' }]]);
    fireEvent.click(screen.getByRole('button', { name: /Başlamadan önce/ }));
    expect(screen.getByRole('button', { name: 'Sıfırı probla · zorunlu · işareti kaldır' }).closest('li')!.textContent).toContain('0,015 mm');
  });

  it('talimatı olmayan iş bunu söyler; okuma hatası görünür', () => {
    render(<TalimatListesi t={{ liste: [], hata: null, isaretle: () => undefined }} durum="queued" kapali={false} adimlar={undefined} isEmriId={null} />);
    expect(screen.getByText('Bu işin talimatı yok')).toBeTruthy();
    cleanup();
    render(<TalimatListesi t={{ liste: [], hata: 'Talimatlar alınamadı', isaretle: () => undefined }} durum="queued" kapali={false} adimlar={undefined} isEmriId={null} />);
    expect(screen.getByRole('alert').textContent).toBe('Talimatlar alınamadı');
  });
});
