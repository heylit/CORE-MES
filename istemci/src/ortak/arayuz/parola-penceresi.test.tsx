import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SAYFALAR } from '#paylasilan/sayfalar.ts';
import { OTURUM_BITTI } from '../veri/api.ts';
import { Kabuk } from './Kabuk.tsx';

// Yönetici olmayan kullanıcı: yalnız operatör sayfası; Personel sayfasını görmez.
const OPERATOR_SAYFALARI = SAYFALAR.filter((s) => s.yol === '/arkon');

function ciz() {
  return render(
    <MemoryRouter initialEntries={['/arkon']}>
      <Kabuk sayfalar={OPERATOR_SAYFALARI} kullaniciAdi="Deneme Operatör" cikis={() => undefined}><p>icerik</p></Kabuk>
    </MemoryRouter>,
  );
}

function sunucu(durum: number, govde: unknown) {
  const sahte = vi.fn(async (_yol: string, _ayar: RequestInit) => new Response(JSON.stringify(govde), { status: durum }));
  vi.stubGlobal('fetch', sahte);
  return sahte;
}

const pencere = () => screen.getByRole('dialog', { name: 'Parolamı değiştir' });

function doldurGonder(eski: string, yeni: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Hesap' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Parolamı değiştir' }));
  fireEvent.change(within(pencere()).getByLabelText(/Eski parola/), { target: { value: eski } });
  fireEvent.change(within(pencere()).getByLabelText(/Yeni parola/), { target: { value: yeni } });
  fireEvent.click(within(pencere()).getByRole('button', { name: 'Parolayı değiştir' }));
}

let oturumBitti: Mock<(olay: Event) => void>;
beforeEach(() => {
  localStorage.clear();
  oturumBitti = vi.fn();
  window.addEventListener(OTURUM_BITTI, oturumBitti);
});
afterEach(() => {
  window.removeEventListener(OTURUM_BITTI, oturumBitti);
  vi.unstubAllGlobals();
});

describe('Kabuk: Parolamı değiştir', () => {
  it('sağ üstteki ad, baş harfleriyle Hesap menüsünü açar; Profilim oradan açılır', () => {
    ciz();
    const hesap = screen.getByRole('button', { name: 'Hesap' });
    expect(hesap.textContent).toContain('DO');
    expect(hesap.getAttribute('title')).toBe('Hesap: Deneme Operatör');
    fireEvent.click(hesap);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Profilim' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Profilim');
  });

  it('izinli: Personel sayfasını görmeyen kullanıcı kendi parolasını değiştirir; istek kendi ucuna eski ve yeni parolayla gider', async () => {
    const sahte = sunucu(200, { tamam: true });
    ciz();
    doldurGonder('eski-parola-1', 'yeni-parola-1');

    expect(await within(pencere()).findByRole('status')).toHaveProperty('textContent', expect.stringContaining('Parola değiştirildi'));
    expect(sahte).toHaveBeenCalledTimes(1);
    const [yol, ayar] = sahte.mock.calls[0]!;
    expect(yol).toBe('/api/hesabim/parola-degistir');
    expect(ayar.method).toBe('POST');
    expect(JSON.parse(String(ayar.body))).toEqual({ eskiParola: 'eski-parola-1', yeniParola: 'yeni-parola-1' });
    // Başlıktaki kapatma düğmesi de "Kapat" adını taşır; alttaki sonuç düğmesine basılır.
    fireEvent.click(within(pencere()).getAllByRole('button', { name: 'Kapat' }).at(-1)!);
    expect(screen.queryByRole('dialog', { name: 'Parolamı değiştir' })).toBeNull();
  });

  it('reddedilen: yanlış eski parola alanın altında gösterilir, parola değişti denmez ve oturum bitmez', async () => {
    sunucu(400, { kod: 'DOGRULAMA', mesaj: 'Eski parola yanlış.', alan: 'eskiParola' });
    ciz();
    doldurGonder('yanlis-parola', 'yeni-parola-1');

    const eski = within(pencere()).getByLabelText(/Eski parola/);
    await waitFor(() => expect(eski.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById(eski.getAttribute('aria-describedby')!)?.textContent).toBe('Eski parola yanlış.');
    expect(within(pencere()).queryByRole('status')).toBeNull();
    expect(oturumBitti).not.toHaveBeenCalled();
  });

  it('reddedilen: bekleme süresindeki 401 oturumu bitirmez, sunucu iletisi pencerede kalır', async () => {
    sunucu(401, { kod: 'OTURUM_YOK', mesaj: 'Çok sık deneme. 3 sn sonra yeniden deneyin.' });
    ciz();
    doldurGonder('eski-parola-1', 'yeni-parola-1');

    expect(await within(pencere()).findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Çok sık deneme'));
    expect(oturumBitti).not.toHaveBeenCalled();
  });

  it.each([
    ['ikisi', '', '', ['Eski parola zorunlu.', 'Yeni parola zorunlu.']],
    ['eski', '', 'yeni-parola-1', ['Eski parola zorunlu.']],
    ['yeni', 'eski-parola-1', '', ['Yeni parola zorunlu.']],
  ])('reddedilen: boş alanla istek gitmez (%s boş)', (_ad, eski, yeni, iletiler) => {
    const sahte = sunucu(200, { tamam: true });
    ciz();
    doldurGonder(eski, yeni);

    expect(sahte).not.toHaveBeenCalled();
    for (const ileti of iletiler) expect(within(pencere()).getByText(ileti)).toBeTruthy();
  });
});
