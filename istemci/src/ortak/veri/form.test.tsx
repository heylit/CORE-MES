import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ESKI_SURUM_ILETISI, ESKI_SURUM_NEDENI, type HataGovdesi } from '#paylasilan/hata.ts';
import { Girdi } from '../arayuz/index.ts';
import { ApiHatasi } from './api.ts';
import { useForm, type FormSecenegi } from './form.ts';

interface Deger { ad: string; adet: string; adimlar: { ad: string }[]; aciklama?: string | null }
interface Cevap { id: number }
type Secenek = Partial<FormSecenegi<Deger, Cevap>>;

const ILK: Deger = { ad: 'Mil', adet: '5', adimlar: [{ ad: 'Torna' }, { ad: 'Freze' }] };

function Sonda(secenek: Secenek) {
  const form = useForm<Deger, Cevap>({ ilk: ILK, hataIletisi: 'Kaydedilemedi.', kaydet: async () => ({ id: 1 }), ...secenek });
  return (
    <form aria-label="Sonda" onSubmit={form.gonder}>
      <Girdi etiket="Ad" {...form.alan('ad')} />
      <Girdi etiket="Adet" {...form.alan('adet')} />
      {form.degerler.adimlar.map((adim, sira) => (
        <Girdi
          key={sira} etiket={`Adım ${sira + 1}`} value={adim.ad} hata={form.hata(`adimlar.${sira}.ad`)}
          onChange={(o) => { form.degistir({ adimlar: form.degerler.adimlar.map((a, i) => (i === sira ? { ad: o.target.value } : a)) }); }}
        />
      ))}
      <output data-testid="aciklama-hatasi">{form.hata('aciklama') ?? ''}</output>
      {form.genelHata !== null && <p data-testid="genel">{form.genelHata}</p>}
      {form.eskiSurum && <button type="button" onClick={() => { form.sifirla({ ...ILK, ad: 'Yeni mil' }); }}>Kaydı yenile</button>}
      <output data-testid="kilit">{form.gonderiliyor ? 'gönderiliyor' : 'boşta'}</output>
      <button type="submit">Kaydet</button>
    </form>
  );
}

const kutu = (etiket: string) => screen.getByLabelText(etiket) as HTMLInputElement;
// Alanın altındaki metin: hata, alana `aria-describedby` ile bağlıdır.
const altMetin = (etiket: string): string | null => {
  const alan = kutu(etiket);
  const kimlik = alan.getAttribute('aria-describedby');
  return alan.getAttribute('aria-invalid') === 'true' && kimlik ? document.getElementById(kimlik)?.textContent ?? null : null;
};
const gonder = () => fireEvent.submit(screen.getByRole('form', { name: 'Sonda' }));
const genel = () => screen.queryByTestId('genel')?.textContent ?? null;
const sunucuHatasi = (durum: number, govde: HataGovdesi) => vi.fn(async (): Promise<Cevap> => { throw new ApiHatasi(durum, govde); });
const bosta = () => waitFor(() => expect(screen.getByTestId('kilit').textContent).toBe('boşta'));

// Tip kanıtı: `alan` yalnız düz metin alanını bağlar; sabit seçenekli, sayı ve boş olabilen alan derlenmez.
function TipKaniti() {
  const form = useForm({
    ilk: { ad: '', tur: 'hammadde' as 'hammadde' | 'sarf', adet: 0, aciklama: null as string | null },
    hataIletisi: 'Kaydedilemedi.', kaydet: async () => null,
  });
  // @ts-expect-error sabit seçenekli alana girdi serbest metin yazardı
  form.alan('tur');
  // @ts-expect-error sayı alanı
  form.alan('adet');
  // @ts-expect-error boş olabilen alan
  form.alan('aciklama');
  const tur: 'hammadde' | 'sarf' = form.degerler.tur;
  return (
    <>
      <Girdi etiket="Ad" {...form.alan('ad')} />
      <button type="button" onClick={() => { form.degistir({ tur: 'sarf', adet: 3 }); }}>{tur}</button>
      <output data-testid="tur-hatasi">{form.hata('tur') ?? 'yok'}</output>
    </>
  );
}

describe('useForm', () => {
  it('metin olmayan alan degistir ve hata(yol) ile baglanir', () => {
    render(<TipKaniti />);
    fireEvent.click(screen.getByRole('button', { name: 'hammadde' }));
    expect(screen.getByRole('button', { name: 'sarf' })).toBeTruthy();
    expect(screen.getByTestId('tur-hatasi').textContent).toBe('yok');
  });

  it('alan degerini baglar ve gonderirken guncel degerleri verir', async () => {
    const kaydet = vi.fn(async (): Promise<Cevap> => ({ id: 7 }));
    const basarili = vi.fn();
    render(<Sonda kaydet={kaydet} basarili={basarili} />);
    expect(kutu('Ad').value).toBe('Mil');
    fireEvent.change(kutu('Ad'), { target: { value: 'Flanş' } });
    expect(kutu('Ad').value).toBe('Flanş');
    gonder();
    await waitFor(() => expect(basarili).toHaveBeenCalledTimes(1));
    const gonderilen = { ...ILK, ad: 'Flanş' };
    expect(kaydet).toHaveBeenCalledWith(gonderilen);
    expect(basarili).toHaveBeenCalledWith({ id: 7 }, gonderilen);
    expect(genel()).toBeNull();
  });

  it('istemci denetimi hataliyken istek gitmez; duzeltilen alanin hatasi silinir, otekininki kalir', () => {
    const kaydet = vi.fn(async (): Promise<Cevap> => ({ id: 1 }));
    const dogrula = (d: Deger) => ({ ...(d.ad.trim() === '' ? { ad: 'Ad zorunlu.' } : {}), ...(d.adet === '' ? { adet: 'Adet zorunlu.' } : {}) });
    render(<Sonda kaydet={kaydet} dogrula={dogrula} />);
    fireEvent.change(kutu('Ad'), { target: { value: ' ' } });
    fireEvent.change(kutu('Adet'), { target: { value: '' } });
    gonder();
    expect(altMetin('Ad')).toBe('Ad zorunlu.');
    expect(altMetin('Adet')).toBe('Adet zorunlu.');
    expect(kaydet).not.toHaveBeenCalled();
    fireEvent.change(kutu('Ad'), { target: { value: 'Mil' } });
    expect(altMetin('Ad')).toBeNull();
    expect(altMetin('Adet')).toBe('Adet zorunlu.');
  });

  it('sunucunun alan bilgili hatasini o alanin altina yazar, genel hata olarak tekrar etmez', async () => {
    render(<Sonda kaydet={sunucuHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Adet en az 1 olmalı.', alan: 'adet' })} />);
    gonder();
    await waitFor(() => expect(altMetin('Adet')).toBe('Adet en az 1 olmalı.'));
    expect(altMetin('Ad')).toBeNull();
    expect(genel()).toBeNull();
  });

  it('ic ice alan yolunu ilgili satira dusurur', async () => {
    render(<Sonda kaydet={sunucuHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Adım adı boş olamaz.', alan: 'adimlar.1.ad' })} />);
    gonder();
    await waitFor(() => expect(altMetin('Adım 2')).toBe('Adım adı boş olamaz.'));
    expect(altMetin('Adım 1')).toBeNull();
    expect(genel()).toBeNull();
  });

  it('alanEsle sunucunun yolunu formun yoluna cevirir; null donerse hata geneldir', async () => {
    const hata = { kod: 'DOGRULAMA', mesaj: 'Adım adı boş olamaz.', alan: 'adimlar.0.ad' } satisfies HataGovdesi;
    const esle = vi.fn((alan: string) => (alan === 'adimlar.0.ad' ? 'adimlar.1.ad' : null));
    const { unmount } = render(<Sonda kaydet={sunucuHatasi(400, hata)} alanEsle={esle} />);
    gonder();
    await waitFor(() => expect(altMetin('Adım 2')).toBe('Adım adı boş olamaz.'));
    expect(altMetin('Adım 1')).toBeNull();
    expect(esle).toHaveBeenCalledWith('adimlar.0.ad', ILK);
    unmount();
    render(<Sonda kaydet={sunucuHatasi(400, hata)} alanEsle={() => null} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Adım adı boş olamaz.'));
    expect(altMetin('Adım 1')).toBeNull();
  });

  it('formda olmayan alanin hatasi kaybolmaz, genel hata olur', async () => {
    render(<Sonda kaydet={sunucuHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Sicil no geçersiz.', alan: 'sicilNo' })} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Sicil no geçersiz.'));
  });

  it('secmeli alanin hatasi, alan ilk degerde varsa alana, yoksa genel hataya duser', async () => {
    const hata = { kod: 'DOGRULAMA', mesaj: 'Açıklama çok uzun.', alan: 'aciklama' } satisfies HataGovdesi;
    const alanHatasi = () => screen.getByTestId('aciklama-hatasi').textContent;
    const { unmount } = render(<Sonda ilk={{ ...ILK, aciklama: null }} kaydet={sunucuHatasi(400, hata)} />);
    gonder();
    await waitFor(() => expect(alanHatasi()).toBe('Açıklama çok uzun.'));
    expect(genel()).toBeNull();
    unmount();
    render(<Sonda kaydet={sunucuHatasi(400, hata)} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Açıklama çok uzun.'));
    expect(alanHatasi()).toBe('');
  });

  it('ust alan degisince alt yolundaki hata silinir', async () => {
    render(<Sonda kaydet={sunucuHatasi(400, { kod: 'DOGRULAMA', mesaj: 'Adım adı boş olamaz.', alan: 'adimlar.1.ad' })} />);
    gonder();
    await waitFor(() => expect(altMetin('Adım 2')).toBe('Adım adı boş olamaz.'));
    fireEvent.change(kutu('Adım 2'), { target: { value: 'Taşlama' } });
    expect(altMetin('Adım 2')).toBeNull();
  });

  it('alan tasiyan eski surum hatasi alana dusmez, genel kalir', async () => {
    const eski = { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, alan: 'ad', ayrinti: { neden: ESKI_SURUM_NEDENI } } satisfies HataGovdesi;
    render(<Sonda kaydet={sunucuHatasi(409, eski)} />);
    gonder();
    await waitFor(() => expect(genel()).toBe(ESKI_SURUM_ILETISI));
    expect(altMetin('Ad')).toBeNull();
    expect(screen.getByRole('button', { name: 'Kaydı yenile' })).toBeTruthy();
  });

  it('ekran ayrildiktan sonra gelen cevapta basarili ve hatada cagrilmaz', async () => {
    for (const sonuc of ['cevap', 'hata'] as const) {
      let bitir: () => void = () => {};
      const kaydet = vi.fn(() => new Promise<Cevap>((coz, reddet) => {
        bitir = () => { if (sonuc === 'cevap') coz({ id: 1 }); else reddet(new ApiHatasi(422, { kod: 'GECERSIZ', mesaj: 'Emir kapalı.' })); };
      }));
      const basarili = vi.fn();
      const hatada = vi.fn();
      const { unmount } = render(<Sonda kaydet={kaydet} basarili={basarili} hatada={hatada} />);
      gonder();
      expect(kaydet).toHaveBeenCalledTimes(1);
      unmount();
      await act(async () => { bitir(); await Promise.resolve(); await Promise.resolve(); });
      expect(basarili).not.toHaveBeenCalled();
      expect(hatada).not.toHaveBeenCalled();
    }
  });

  it('alansiz hatada sunucunun iletisini, sunucuya ulasilamayinca ekranin iletisini genel hata yapar', async () => {
    const { unmount } = render(<Sonda kaydet={sunucuHatasi(422, { kod: 'GECERSIZ', mesaj: 'Emir kapalı.' })} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Emir kapalı.'));
    expect(screen.queryByRole('button', { name: 'Kaydı yenile' })).toBeNull();
    unmount();
    render(<Sonda kaydet={vi.fn(async (): Promise<Cevap> => { throw new TypeError('Failed to fetch'); })} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Kaydedilemedi.'));
  });

  it('eski surum cakismasini ayirir: ekran kaydi yeniler, sifirla hatayi ve degerleri temizler', async () => {
    const hatada = vi.fn();
    const eski = { kod: 'CAKISMA', mesaj: ESKI_SURUM_ILETISI, ayrinti: { neden: ESKI_SURUM_NEDENI } } satisfies HataGovdesi;
    render(<Sonda kaydet={sunucuHatasi(409, eski)} hatada={hatada} />);
    gonder();
    await waitFor(() => expect(genel()).toBe(ESKI_SURUM_ILETISI));
    expect(hatada).toHaveBeenCalledTimes(1);
    expect(hatada.mock.calls[0]?.[0]).toBeInstanceOf(ApiHatasi);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydı yenile' }));
    expect(kutu('Ad').value).toBe('Yeni mil');
    expect(genel()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kaydı yenile' })).toBeNull();
  });

  it('baska cakisma eski surum sayilmaz', async () => {
    render(<Sonda kaydet={sunucuHatasi(409, { kod: 'CAKISMA', mesaj: 'Bu kod kullanılıyor.' })} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Bu kod kullanılıyor.'));
    expect(screen.queryByRole('button', { name: 'Kaydı yenile' })).toBeNull();
  });

  it('cevap gelmeden ikinci gonderim istek atmaz; cevap gelince kilit acilir', async () => {
    let coz: (c: Cevap) => void = () => {};
    const kaydet = vi.fn(() => new Promise<Cevap>((c) => { coz = c; }));
    const basarili = vi.fn();
    render(<Sonda kaydet={kaydet} basarili={basarili} />);
    // Aynı dokunuşun iki olayı: arada yeniden çizim yok, durum henüz güncellenmedi.
    const form = screen.getByRole('form', { name: 'Sonda' });
    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(kaydet).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('kilit').textContent).toBe('gönderiliyor');
    gonder();
    expect(kaydet).toHaveBeenCalledTimes(1);
    await act(async () => { coz({ id: 3 }); await Promise.resolve(); });
    await bosta();
    expect(basarili).toHaveBeenCalledTimes(1);
    gonder();
    expect(kaydet).toHaveBeenCalledTimes(2);
  });

  it('siki kipte de geri cagrilar bir kez calisir ve kilit acilir', async () => {
    const basarili = vi.fn();
    const { unmount } = render(<StrictMode><Sonda kaydet={vi.fn(async (): Promise<Cevap> => ({ id: 4 }))} basarili={basarili} /></StrictMode>);
    gonder();
    await waitFor(() => expect(basarili).toHaveBeenCalledTimes(1));
    await bosta();
    unmount();
    const hatada = vi.fn();
    render(<StrictMode><Sonda kaydet={sunucuHatasi(422, { kod: 'GECERSIZ', mesaj: 'Emir kapalı.' })} hatada={hatada} /></StrictMode>);
    gonder();
    await waitFor(() => expect(genel()).toBe('Emir kapalı.'));
    await bosta();
    expect(hatada).toHaveBeenCalledTimes(1);
  });

  it('hatadan sonra kilit acilir ve yeni gonderim onceki hatayi siler', async () => {
    const kaydet = vi.fn<() => Promise<Cevap>>()
      .mockRejectedValueOnce(new ApiHatasi(422, { kod: 'GECERSIZ', mesaj: 'Emir kapalı.' }))
      .mockResolvedValueOnce({ id: 9 });
    const basarili = vi.fn();
    render(<Sonda kaydet={kaydet} basarili={basarili} />);
    gonder();
    await waitFor(() => expect(genel()).toBe('Emir kapalı.'));
    await bosta();
    gonder();
    await waitFor(() => expect(basarili).toHaveBeenCalledTimes(1));
    expect(kaydet).toHaveBeenCalledTimes(2);
    expect(genel()).toBeNull();
  });
});
