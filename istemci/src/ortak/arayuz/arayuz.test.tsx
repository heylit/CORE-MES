import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import {
  AcKapa, BildirimSaglayici, Girdi, OnayPenceresi, Pencere, Secim, Sekmeler, Simge, Tablo, useBildirim, type Sutun,
} from './index.ts';
import { BILDIRIM_SURESI_MS } from './Bildirim.tsx';

describe('Simge', () => {
  it('yukari ve asagi oklari cizgi olarak ve birbirinden farkli cizer', () => {
    const { container } = render(<><Simge ad="up" /><Simge ad="down" /></>);
    const [yukari, asagi] = [...container.querySelectorAll('svg')];
    expect(yukari!.getAttribute('fill')).toBe('none');
    expect(asagi!.getAttribute('stroke')).toBe('currentColor');
    const cizim = (s: Element) => s.querySelector('path')!.getAttribute('d') ?? '';
    expect(cizim(yukari!)).not.toBe('');
    expect(cizim(asagi!)).not.toBe('');
    expect(cizim(yukari!)).not.toBe(cizim(asagi!));
  });
});

interface Satir { no: number; ad: string; adet: number | null }

const SUTUNLAR: Sutun<Satir>[] = [
  { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad },
  { anahtar: 'adet', baslik: 'Adet', hucre: (s) => s.adet, hizala: 'sag', mono: true },
];

describe('Tablo', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('satir yoksa tablo yerine bos durumu gosterir', () => {
    render(<Tablo etiket="Liste" sutunlar={SUTUNLAR} satirlar={[]} satirAnahtari={(s) => s.no} bosMesaj="Kayıt yok" />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Kayıt yok');
  });

  it('bos hucreye sifir degil yok yazar ve basligi karta tasir', () => {
    render(<Tablo etiket="Liste" sutunlar={SUTUNLAR} satirlar={[{ no: 1, ad: 'A', adet: null }, { no: 2, ad: 'B', adet: 0 }]} satirAnahtari={(s) => s.no} />);
    const hucreler = screen.getAllByRole('cell');
    expect(hucreler.map((h) => h.textContent)).toEqual(['A', 'yok', 'B', '0']);
    expect(hucreler[1]?.getAttribute('data-baslik')).toBe('Adet');
  });

  it('kirilmaz sutunun hucreleri isaretlenir, digerleri isaretlenmez', () => {
    const sutunlar: Sutun<Satir>[] = [SUTUNLAR[0] as Sutun<Satir>, { ...(SUTUNLAR[1] as Sutun<Satir>), kirilmaz: true }];
    render(<Tablo etiket="Liste" sutunlar={sutunlar} satirlar={[{ no: 1, ad: 'A', adet: 3 }]} satirAnahtari={(s) => s.no} />);
    const [ad, adet] = screen.getAllByRole('cell');
    expect(adet?.classList.contains('tc-tablo-kirilmaz')).toBe(true);
    expect(ad?.classList.contains('tc-tablo-kirilmaz')).toBe(false);
  });

  it('kabina sigmayan tablo kart kipine gecer, kap genisleyince tabloya doner', () => {
    // jsdom yerlesim yapmaz: kabin ve icerigin genisligi buradan verilir.
    const olcu = { kap: 600, icerik: 836 };
    const izleyenler: (() => void)[] = [];
    vi.stubGlobal('ResizeObserver', class { constructor(geri: () => void) { izleyenler.push(geri); } observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => olcu.kap);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => Math.max(olcu.kap, olcu.icerik));
    render(<Tablo etiket="Liste" sutunlar={SUTUNLAR} satirlar={[{ no: 1, ad: 'A', adet: 3 }]} satirAnahtari={(s) => s.no} />);
    const kap = screen.getByRole('table').parentElement as HTMLElement;
    expect(kap.getAttribute('data-kip')).toBe('kart');

    olcu.kap = 836;
    act(() => { izleyenler.forEach((geri) => { geri(); }); });
    expect(kap.hasAttribute('data-kip')).toBe(false);

    olcu.kap = 835;
    act(() => { izleyenler.forEach((geri) => { geri(); }); });
    expect(kap.getAttribute('data-kip')).toBe('kart');
  });

  it('kart kipinde sigma tablo kipinde olculur; kap genisligi degismedikce kip ozniteligine dokunulmaz', () => {
    // Kart kipinde icerik kaba her zaman sigar: olcum kart kipinde yapilirsa tablo sigiyor sanilir ve kip salinir.
    const olcu = { kap: 600, icerik: 836 };
    const izleyenler: (() => void)[] = [];
    vi.stubGlobal('ResizeObserver', class { constructor(geri: () => void) { izleyenler.push(geri); } observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => olcu.kap);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function olc(this: HTMLElement) {
      return this.hasAttribute('data-kip') ? olcu.kap : Math.max(olcu.kap, olcu.icerik);
    });
    render(<Tablo etiket="Liste" sutunlar={SUTUNLAR} satirlar={[{ no: 1, ad: 'A', adet: 3 }]} satirAnahtari={(s) => s.no} />);
    const kap = screen.getByRole('table').parentElement as HTMLElement;
    expect(kap.getAttribute('data-kip')).toBe('kart');

    olcu.kap = 700;
    act(() => { izleyenler.forEach((geri) => { geri(); }); });
    expect(kap.getAttribute('data-kip')).toBe('kart');

    // Yalniz yukseklik degisti (satir suzuldu): kipten cikip olcmek kaydirma yerini oynatir.
    const kaldir = vi.spyOn(kap, 'removeAttribute');
    act(() => { izleyenler.forEach((geri) => { geri(); }); });
    expect(kaldir).not.toHaveBeenCalled();
    expect(kap.getAttribute('data-kip')).toBe('kart');
  });

  it('satir tiklama ve Enter ile secilir', () => {
    const sec = vi.fn();
    render(<Tablo etiket="Liste" sutunlar={SUTUNLAR} satirlar={[{ no: 7, ad: 'A', adet: 3 }]} satirAnahtari={(s) => s.no} satirSec={sec} />);
    const satir = screen.getAllByRole('row')[1] as HTMLElement;
    fireEvent.click(satir);
    fireEvent.keyDown(satir, { key: 'Enter' });
    expect(sec.mock.calls.map((c) => (c[0] as Satir).no)).toEqual([7, 7]);
  });
});

describe('form alanlari', () => {
  it('hata alana baglanir ve gecersiz isaretlenir', () => {
    render(<Girdi etiket="Sicil" hata="Sicil zorunlu" required />);
    const girdi = screen.getByLabelText(/Sicil/);
    expect(girdi.getAttribute('aria-invalid')).toBe('true');
    const hata = screen.getByRole('alert');
    expect(hata.textContent).toBe('Sicil zorunlu');
    expect(girdi.getAttribute('aria-describedby')).toBe(hata.id);
  });

  it('secim bos secenegi ilk sirada gosterir', () => {
    render(<Secim etiket="Tür" bosSecenek="Seçiniz" secenekler={[{ deger: 'a', baslik: 'A' }]} defaultValue="" />);
    const secenekler = within(screen.getByLabelText('Tür')).getAllByRole('option');
    expect(secenekler.map((s) => s.textContent)).toEqual(['Seçiniz', 'A']);
  });
});

function PencereDeneme() {
  const [acik, acikYaz] = useState(false);
  return (
    <>
      <button type="button" onClick={() => acikYaz(true)}>Aç</button>
      <Pencere acik={acik} kapat={() => acikYaz(false)} baslik="Yeni kayıt" alt={<button type="button">Kaydet</button>}>
        <Girdi etiket="Ad" />
      </Pencere>
    </>
  );
}

describe('Pencere', () => {
  it('acilinca odagi icine alir, Tab ile disari cikmaz, Esc ile kapanip odagi geri verir', () => {
    render(<PencereDeneme />);
    const ac = screen.getByRole('button', { name: 'Aç' });
    ac.focus();
    fireEvent.click(ac);

    const pencere = screen.getByRole('dialog', { name: 'Yeni kayıt' });
    const kapat = within(pencere).getByRole('button', { name: 'Kapat' });
    const kaydet = within(pencere).getByRole('button', { name: 'Kaydet' });
    expect(document.activeElement).toBe(kapat);

    kaydet.focus();
    fireEvent.keyDown(kaydet, { key: 'Tab' });
    expect(document.activeElement).toBe(kapat);
    fireEvent.keyDown(kapat, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(kaydet);

    fireEvent.keyDown(kaydet, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(ac);
  });

  // Açıkken bağlanan pencere: ekranlar pencereyi çoğu zaman `{acik && <Pencere acik />}` diye çizer.
  function AcikBaglanan() {
    const [acik, acikYaz] = useState(false);
    return (
      <>
        <button onClick={() => acikYaz(true)}>Aç</button>
        <button>Dışarıdaki</button>
        {acik && <Pencere acik kapat={() => acikYaz(false)} baslik="Yeni kayıt">içerik</Pencere>}
      </>
    );
  }

  it('siki kipte acik baglanan pencere kapaninca odagi acan ogeye geri verir', () => {
    render(<StrictMode><AcikBaglanan /></StrictMode>);
    const ac = screen.getByRole('button', { name: 'Aç' });
    ac.focus();
    fireEvent.click(ac);
    const pencere = screen.getByRole('dialog');
    expect(pencere.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(ac);
  });

  it('odak disaridaki ogeye gecmisken kapanan pencere odagi geri cekmez', () => {
    render(<AcikBaglanan />);
    const ac = screen.getByRole('button', { name: 'Aç' });
    ac.focus();
    fireEvent.click(ac);
    const disaridaki = screen.getByRole('button', { name: 'Dışarıdaki' });
    disaridaki.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(disaridaki);
  });

  it('perdeye basinca kapanir, pencerenin icine basinca kapanmaz', () => {
    render(<PencereDeneme />);
    fireEvent.click(screen.getByRole('button', { name: 'Aç' }));
    const pencere = screen.getByRole('dialog');
    fireEvent.mouseDown(pencere);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.mouseDown(pencere.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('OnayPenceresi', () => {
  it('odak Vazgec ile baslar; onay ve vazgec ayri cagrilir', () => {
    const onayla = vi.fn();
    const vazgec = vi.fn();
    render(<OnayPenceresi acik baslik="Silinsin mi?" onayMetni="Sil" tehlikeli onayla={onayla} vazgec={vazgec}>Geri alınamaz.</OnayPenceresi>);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(vazgec).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(vazgec).toHaveBeenCalledTimes(1);
  });
});

describe('Sekmeler', () => {
  it('ok tuslari secimi dondurur ve odagi tasir', () => {
    function Deneme() {
      const [secili, sec] = useState<'a' | 'b' | 'c'>('a');
      return <Sekmeler etiket="Görünüm" secili={secili} sec={sec} sekmeler={[{ anahtar: 'a', baslik: 'A' }, { anahtar: 'b', baslik: 'B' }, { anahtar: 'c', baslik: 'C' }]} />;
    }
    render(<Deneme />);
    const secili = () => screen.getByRole('tab', { selected: true });
    fireEvent.keyDown(secili(), { key: 'ArrowLeft' });
    expect(secili().textContent).toBe('C');
    expect(document.activeElement).toBe(secili());
    fireEvent.keyDown(secili(), { key: 'ArrowRight' });
    expect(secili().textContent).toBe('A');
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));
    expect(secili().textContent).toBe('B');
    expect(screen.getByRole('tab', { name: 'A' }).tabIndex).toBe(-1);
  });
});

describe('AcKapa', () => {
  it('durumu anahtar rolu, isaret ve yaziyla bildirir; dokununca tersini ister', () => {
    const degistir = vi.fn();
    const { rerender } = render(<AcKapa etiket="Deneme ayarı" acik degistir={degistir} />);
    const anahtar = screen.getByRole('switch', { name: 'Deneme ayarı' });
    expect(anahtar.getAttribute('aria-checked')).toBe('true');
    const acikYazisi = anahtar.textContent ?? '';
    expect(acikYazisi.trim()).not.toBe('');
    fireEvent.click(anahtar);
    expect(degistir.mock.calls).toEqual([[false]]);
    // Bileşen kendi durumunu tutmaz: değer dışarıdan gelene kadar yerinde kalır.
    expect(anahtar.getAttribute('aria-checked')).toBe('true');

    rerender(<AcKapa etiket="Deneme ayarı" acik={false} degistir={degistir} />);
    expect(anahtar.getAttribute('aria-checked')).toBe('false');
    // Durum yalnız işaretle anlatılmaz: iki durumun yazısı da ayrıdır.
    expect((anahtar.textContent ?? '').trim()).not.toBe('');
    expect(anahtar.textContent).not.toBe(acikYazisi);
    fireEvent.click(anahtar);
    expect(degistir.mock.calls).toEqual([[false], [true]]);
  });

  it('kilitliyken dokunus degisiklik istemez', () => {
    const degistir = vi.fn();
    render(<AcKapa etiket="Deneme ayarı" acik degistir={degistir} disabled />);
    fireEvent.click(screen.getByRole('switch', { name: 'Deneme ayarı' }));
    expect(degistir).not.toHaveBeenCalled();
  });
});

describe('Bildirim', () => {
  afterEach(() => { vi.useRealTimers(); });

  function Tetik() {
    const { bildir } = useBildirim();
    return (
      <>
        <button type="button" onClick={() => bildir('tamam', 'Kaydedildi')}>tamam</button>
        <button type="button" onClick={() => bildir('hata', 'Kaydedilemedi')}>hata</button>
      </>
    );
  }

  it('basari bildirimi suresi dolunca kalkar; hata kapatilana kadar kalir', () => {
    vi.useFakeTimers();
    render(<BildirimSaglayici><Tetik /></BildirimSaglayici>);
    fireEvent.click(screen.getByRole('button', { name: 'tamam' }));
    fireEvent.click(screen.getByRole('button', { name: 'hata' }));
    expect(screen.getByRole('status').textContent).toContain('Kaydedildi');

    act(() => { vi.advanceTimersByTime(BILDIRIM_SURESI_MS); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Kaydedilemedi');

    fireEvent.click(screen.getByRole('button', { name: 'Bildirimi kapat' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
