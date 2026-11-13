import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BekleyenPenceresi, SayacCipi, bekleyenSayilari, cozumYollari, islemAdi, kesinlesenleriKat, kesinlesmeOzeti, type Bekleyen } from './BekleyenIslemler.tsx';

// Bağlantı yokken bekleyen işlemler (3158 a, 3167 b). Emir numaraları uydurmadır (ORN-).

afterEach(() => { cleanup(); });

const kayit = (ek: Partial<Bekleyen> = {}): Bekleyen => ({
  anahtar: 1, tur: 'counts', satir: { cid: 'c1', kind: 'good', delta: 3, orderNo: 'ORN-UE-1' }, zaman: null, durum: 'bekliyor', neden: null, yenidenDenenir: false, ...ek,
});

describe('bekleyen işlem kuralları', () => {
  it('işlem adı: sayım yönüyle, durum değişikliği adıyla', () => {
    expect(islemAdi(kayit())).toBe('İyi +3');
    expect(islemAdi(kayit({ satir: { kind: 'scrap', delta: -2 } }))).toBe('Hurda −2');
    expect(islemAdi(kayit({ tur: 'events', satir: { state: 'paused' } }))).toBe('Duraklatıldı');
  });

  it('çözüm yolları: yeniden dene yalnız hakkı varsa; düzelterek gönder yalnız sayımda; vazgeç her kararda', () => {
    expect(cozumYollari(kayit())).toEqual([]);
    expect(cozumYollari(kayit({ durum: 'karar', yenidenDenenir: true }))).toEqual(['yeniden', 'duzelt', 'vazgec']);
    expect(cozumYollari(kayit({ durum: 'karar' }))).toEqual(['duzelt', 'vazgec']);
    expect(cozumYollari(kayit({ durum: 'karar', tur: 'events', yenidenDenenir: true }))).toEqual(['yeniden', 'vazgec']);
  });

  it('sayılar ve kesinleşme özeti', () => {
    expect(bekleyenSayilari([kayit(), kayit({ durum: 'gonderiliyor' }), kayit({ durum: 'karar' }), kayit({ durum: 'vazgecildi' })])).toEqual({ bekliyor: 2, karar: 1 });
    expect(kesinlesmeOzeti({ kesin: 0, karar: 0 })).toBeNull();
    expect(kesinlesmeOzeti({ kesin: 3, karar: 0 })).toBe('3 işlem kesinleşti');
    expect(kesinlesmeOzeti({ kesin: 0, karar: 2 })).toBe('2 işlem karar bekliyor');
  });

  it('kuyruktan karar beklemeden düşen kayıt "kesin" olur; vazgeçilen iz ve karar bekleyen olduğu gibi kalır', () => {
    const onceki = [kayit({ anahtar: 1 }), kayit({ anahtar: 2, durum: 'vazgecildi' }), kayit({ anahtar: 3, durum: 'karar' })];
    const sonra = kesinlesenleriKat(onceki, [kayit({ anahtar: 3, durum: 'karar' })]);
    expect(sonra.map((k) => [k.anahtar, k.durum])).toEqual([[1, 'kesin'], [3, 'karar']]);
    expect(kesinlesenleriKat(sonra, []).map((k) => [k.anahtar, k.durum])).toEqual([[1, 'kesin'], [3, 'kesin']]);
    expect(bekleyenSayilari(sonra)).toEqual({ bekliyor: 0, karar: 1 });
  });
});

describe('sayaç çipi ve pencere', () => {
  it('çip yalnız bekleyen varken görünür; karar bekleyen öne geçer', () => {
    const { rerender, container } = render(<SayacCipi liste={[]} kopuk ac={() => undefined} />);
    expect(container.textContent).toBe('');
    rerender(<SayacCipi liste={[kayit(), kayit({ anahtar: 2 })]} kopuk ac={() => undefined} />);
    expect(screen.getByRole('button', { name: '2 işlem bekliyor' })).toBeTruthy();
    rerender(<SayacCipi liste={[kayit(), kayit({ anahtar: 2, durum: 'karar' })]} kopuk={false} ac={() => undefined} />);
    expect(screen.getByRole('button', { name: '1 işlem karar bekliyor' })).toBeTruthy();
  });

  it('pencerede karar bekleyen nedenini ve yollarını gösterir; düzelterek gönder adet sorar', async () => {
    const coz = vi.fn(async () => undefined);
    render(<BekleyenPenceresi acik kapat={() => undefined} kopuk={false} coz={coz}
      liste={[kayit({ durum: 'karar', neden: 'Hedef aşılıyor.', yenidenDenenir: false }), kayit({ anahtar: 2, durum: 'vazgecildi' }), kayit({ anahtar: 3, durum: 'kesin' })]} />);
    const pencere = await screen.findByRole('dialog', { name: 'Bekleyen işlemlerim' });
    expect(within(pencere).getByText('Hedef aşılıyor.')).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: /Yeniden dene/ })).toBeNull();
    expect(within(pencere).getAllByRole('listitem')).toHaveLength(2);
    expect(within(pencere).getByText('Kesinleşti')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: /Düzelterek gönder/ }));
    fireEvent.change(within(pencere).getByLabelText(/Gönderilecek adet/), { target: { value: '2' } });
    fireEvent.click(within(pencere).getByRole('button', { name: /Gönder$/ }));
    await waitFor(() => { expect(coz).toHaveBeenCalledWith(expect.objectContaining({ anahtar: 1 }), 'duzelt', 2); });
  });
});
