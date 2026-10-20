import { useLayoutEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import {
  AdimListesi, CamYuzey, Dugme, GrupluSecim, Kadran, KadranEtiketi, KuyrukKarti, KuyrukListesi, Orb, OzetKatmani, Pencere,
  SayimDugmeleri, Sekmeler, TerminalYerlesimi, TusTakimi,
  type ListeAdimi, type SecimGrubu,
} from './index.ts';
import { ORB_ONAY_SURESI_MS } from './Orb.tsx';

const tus = (ad: string) => screen.getByRole('button', { name: ad });
const gosterge = () => screen.getByRole('status').textContent;

describe('TusTakimi', () => {
  it('bos baslar ve bosken onay kapalidir; rakam yazilir, silinir, onaylanir', () => {
    const onayla = vi.fn();
    render(<TusTakimi acik baslik="Sağlam adet" onayla={onayla} kapat={() => {}} />);
    expect(gosterge()).toBe('');
    expect(tus('Onayla')).toHaveProperty('disabled', true);
    fireEvent.click(tus('Onayla'));
    expect(onayla).not.toHaveBeenCalled();

    fireEvent.click(tus('1'));
    fireEvent.click(tus('2'));
    expect(gosterge()).toBe('12');
    fireEvent.click(tus('Sil'));
    expect(gosterge()).toBe('1');
    expect(tus('Onayla')).toHaveProperty('disabled', false);
    fireEvent.click(tus('Onayla'));
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(onayla).toHaveBeenCalledWith(1);
  });

  it('son hane silinince yeniden bos olur ve onay kapanir', () => {
    render(<TusTakimi acik baslik="Sağlam adet" ilkDeger={7} onayla={() => {}} kapat={() => {}} />);
    expect(gosterge()).toBe('7');
    fireEvent.click(tus('Sil'));
    expect(gosterge()).toBe('');
    expect(tus('Onayla')).toHaveProperty('disabled', true);
  });

  it('en cok degeri ve hane sinirini asan tusu yok sayar; bastaki sifirin yerine yazar', () => {
    const { unmount } = render(<TusTakimi acik baslik="Adet" enCok={40} onayla={() => {}} kapat={() => {}} />);
    fireEvent.click(tus('0'));
    fireEvent.click(tus('4'));
    expect(gosterge()).toBe('4');
    fireEvent.click(tus('0'));
    expect(gosterge()).toBe('40');
    fireEvent.click(tus('Sil'));
    fireEvent.click(tus('1'));
    expect(gosterge()).toBe('4');
    unmount();

    render(<TusTakimi acik baslik="Adet" enCokHane={2} onayla={() => {}} kapat={() => {}} />);
    fireEvent.click(tus('9'));
    fireEvent.click(tus('8'));
    fireEvent.click(tus('7'));
    expect(gosterge()).toBe('98');
  });

  it('klavyeden rakam, geri silme ve Enter calisir; Esc vazgecer', () => {
    const onayla = vi.fn();
    const kapat = vi.fn();
    render(<TusTakimi acik baslik="Adet" onayla={onayla} kapat={kapat} />);
    const pencere = screen.getByRole('dialog', { name: 'Adet' });
    fireEvent.keyDown(pencere, { key: '3' });
    fireEvent.keyDown(pencere, { key: '5' });
    fireEvent.keyDown(pencere, { key: 'Backspace' });
    fireEvent.keyDown(pencere, { key: '8' });
    expect(gosterge()).toBe('38');
    // Odak rakam tuşundayken Enter rakamı yinelemez, onaylar.
    fireEvent.keyDown(tus('8'), { key: 'Enter' });
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(onayla).toHaveBeenCalledWith(38);
    expect(kapat).not.toHaveBeenCalled();
    fireEvent.keyDown(pencere, { key: 'Escape' });
    expect(kapat).toHaveBeenCalledTimes(1);
  });

  it('buyuk degisimde ilk onay yalniz uyarir, ikinci onay kaydeder; deger degisince uyari sifirlanir', () => {
    const onayla = vi.fn();
    const buyuk = (d: number) => (d > 100 ? `Büyük değişiklik: ${d}` : null);
    render(<TusTakimi acik baslik="Adet" buyukDegisim={buyuk} onayla={onayla} kapat={() => {}} />);
    for (const t of ['2', '5', '0']) fireEvent.click(tus(t));
    fireEvent.click(tus('Onayla'));
    expect(onayla).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Büyük değişiklik: 250');

    fireEvent.click(tus('1'));
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(tus('Onayla'));
    expect(onayla).not.toHaveBeenCalled();
    fireEvent.click(tus('Onayla'));
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(onayla).toHaveBeenCalledWith(2501);
  });

  it('pencere acikken ilk deger degisirse yazilan sayi silinmez; yeniden acilinca yeni ilk degerle baslar', () => {
    const onayla = vi.fn();
    const ciz = (acik: boolean, ilk: number) => <TusTakimi acik={acik} baslik="Adet" ilkDeger={ilk} onayla={onayla} kapat={() => {}} />;
    const { rerender } = render(ciz(true, 5));
    fireEvent.click(tus('7'));
    expect(gosterge()).toBe('57');
    rerender(ciz(true, 9));
    expect(gosterge()).toBe('57');
    fireEvent.click(tus('Onayla'));
    expect(onayla).toHaveBeenCalledWith(57);
    rerender(ciz(false, 9));
    rerender(ciz(true, 9));
    expect(gosterge()).toBe('9');
  });

  it('siniri asan ilk deger silinebilir ve dokunulmadan onaylanamaz', () => {
    const onayla = vi.fn();
    const { unmount } = render(<TusTakimi acik baslik="Adet" ilkDeger={12345678} enCokHane={6} onayla={onayla} kapat={() => {}} />);
    // Silindikten sonra da sınırın üstünde kalan sayı yine silinebilmeli.
    fireEvent.click(tus('Sil'));
    expect(gosterge()).toBe('1.234.567');
    fireEvent.click(tus('Sil'));
    expect(gosterge()).toBe('123.456');
    unmount();

    render(<TusTakimi acik baslik="Adet" ilkDeger={50} enCok={40} onayla={onayla} kapat={() => {}} />);
    expect(gosterge()).toBe('50');
    expect(tus('Onayla')).toHaveProperty('disabled', true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' });
    expect(onayla).not.toHaveBeenCalled();
    fireEvent.click(tus('Sil'));
    expect(gosterge()).toBe('5');
    fireEvent.click(tus('Onayla'));
    expect(onayla).toHaveBeenCalledTimes(1);
    expect(onayla).toHaveBeenCalledWith(5);
  });

  it('esik altindaki deger ikinci onay istemez; kapaliyken hic cizilmez', () => {
    const onayla = vi.fn();
    const { rerender } = render(<TusTakimi acik baslik="Adet" buyukDegisim={() => null} onayla={onayla} kapat={() => {}} />);
    fireEvent.click(tus('5'));
    fireEvent.click(tus('Onayla'));
    expect(onayla).toHaveBeenCalledWith(5);
    rerender(<TusTakimi acik={false} baslik="Adet" onayla={onayla} kapat={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Orb', () => {
  const SURE = 1200;
  const sahteZaman = () => vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'],
  });
  const ilerle = (ms: number) => { act(() => { vi.advanceTimersByTime(ms); }); };
  // jsdom isaretci olayinda konumu tasimaz; ayni adla fare olayi konumu tasir ve React ayni dinleyiciye verir.
  const oynat = (o: HTMLElement, x: number, y: number) => {
    fireEvent(o, new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }));
  };
  afterEach(() => { vi.useRealTimers(); });

  it('basili tut istenmeyen dugme dokunusla tetiklenir; pasifken tetiklenmez', () => {
    const tetikle = vi.fn();
    const { rerender } = render(<Orb simge="play" etiket="Başlat" ton="calisiyor" ana tetikle={tetikle} />);
    fireEvent.click(tus('Başlat'));
    expect(tetikle).toHaveBeenCalledTimes(1);
    rerender(<Orb simge="play" etiket="Başlat" ton="calisiyor" ana disabled tetikle={tetikle} />);
    fireEvent.click(tus('Başlat'));
    expect(tetikle).toHaveBeenCalledTimes(1);
  });

  it('sure dolmadan birakilirsa olay yoktur ve erken birakma bildirilir', () => {
    sahteZaman();
    const tetikle = vi.fn();
    const erken = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" ton="bitti" basiliTutMs={SURE} tetikle={tetikle} erkenBirakinca={erken} />);
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.pointerDown(dugme);
    ilerle(SURE - 200);
    expect(dugme.textContent).toContain('sn');
    fireEvent.pointerUp(dugme);
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
    expect(erken).toHaveBeenCalledTimes(1);
    expect(dugme.textContent).toContain('Basılı tut');
  });

  it('sure dolunca tek olay verir; birakma ve duz dokunus ikinci olay uretmez', () => {
    sahteZaman();
    const tetikle = vi.fn();
    const erken = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={tetikle} erkenBirakinca={erken} />);
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.click(dugme, { detail: 1 });
    expect(tetikle).not.toHaveBeenCalled();

    fireEvent.pointerDown(dugme);
    ilerle(SURE + 100);
    expect(tetikle).toHaveBeenCalledTimes(1);
    ilerle(SURE * 2);
    fireEvent.pointerUp(dugme);
    fireEvent.pointerLeave(dugme);
    fireEvent.click(dugme, { detail: 1 });
    expect(tetikle).toHaveBeenCalledTimes(1);
    expect(erken).not.toHaveBeenCalled();
  });

  it('parmak dugmeden ayrilinca basili tutma iptal olur', () => {
    sahteZaman();
    const tetikle = vi.fn();
    render(<Orb simge="stop" etiket="Durdur" basiliTutMs={SURE} tetikle={tetikle} />);
    const dugme = tus('Durdur, basılı tutun');
    fireEvent.pointerDown(dugme);
    ilerle(SURE / 2);
    fireEvent.pointerLeave(dugme);
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
  });

  it.each([' ', 'Enter'])('klavyede "%s" basili tutulunca tek olay verir, erken birakilinca vermez', (anahtar) => {
    sahteZaman();
    const tetikle = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={tetikle} />);
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.keyDown(dugme, { key: anahtar });
    ilerle(SURE / 2);
    fireEvent.keyUp(dugme, { key: anahtar });
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();

    fireEvent.keyDown(dugme, { key: anahtar });
    // İşletim sisteminin tuş yinelemesi sayacı baştan başlatmaz.
    ilerle(SURE / 2);
    fireEvent.keyDown(dugme, { key: anahtar, repeat: true });
    ilerle(SURE / 2 + 100);
    expect(tetikle).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(dugme, { key: anahtar });
    expect(tetikle).toHaveBeenCalledTimes(1);
  });

  it('basiliyken pasiflesen dugme sure dolunca tetiklemez', () => {
    sahteZaman();
    const tetikle = vi.fn();
    const ciz = (pasif: boolean) => <Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} disabled={pasif} tetikle={tetikle} />;
    const { rerender } = render(ciz(false));
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.pointerDown(dugme);
    ilerle(SURE / 2);
    rerender(ciz(true));
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
    expect(dugme.textContent).toContain('Basılı tut');
    // Yeniden etkinleşince eski basış sürmez; yeni basış baştan sayar.
    rerender(ciz(false));
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
    fireEvent.pointerDown(dugme);
    ilerle(SURE + 100);
    expect(tetikle).toHaveBeenCalledTimes(1);
  });

  it('basiliyken ekrandan kaldirilan dugme sonradan tetiklemez', () => {
    sahteZaman();
    const tetikle = vi.fn();
    const { unmount } = render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={tetikle} />);
    fireEvent.pointerDown(tus('Bitir, basılı tutun'));
    ilerle(SURE / 2);
    unmount();
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
  });

  it('isaretci yakalanmisken dugmenin disina kayarsa iptal olur; icinde oynarsa surer', () => {
    sahteZaman();
    const tetikle = vi.fn();
    const erken = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={tetikle} erkenBirakinca={erken} />);
    const dugme = tus('Bitir, basılı tutun');
    // jsdom yerleşim yapmaz: düğmenin kutusu buradan verilir.
    vi.spyOn(dugme, 'getBoundingClientRect').mockReturnValue({ left: 100, right: 200, top: 100, bottom: 200 } as DOMRect);
    fireEvent.pointerDown(dugme, { clientX: 150, clientY: 150 });
    ilerle(SURE / 3);
    oynat(dugme, 190, 110);
    ilerle(SURE / 3);
    expect(erken).not.toHaveBeenCalled();
    oynat(dugme, 260, 150);
    expect(erken).toHaveBeenCalledTimes(1);
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();

    fireEvent.pointerUp(dugme);
    fireEvent.pointerDown(dugme, { clientX: 150, clientY: 150 });
    ilerle(SURE / 2);
    oynat(dugme, 160, 160);
    ilerle(SURE / 2 + 100);
    expect(tetikle).toHaveBeenCalledTimes(1);
  });

  it('yalniz tiklama ureten yardimci teknoloji iki etkinlestirmeyle tetikler; tek tiklama ve dokunus tetiklemez', () => {
    sahteZaman();
    const tetikle = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={tetikle} />);
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.click(dugme, { detail: 0 });
    expect(tetikle).not.toHaveBeenCalled();
    expect(dugme.getAttribute('aria-label')).toBe('Bitir, onaylamak için yeniden etkinleştirin');
    // Dokunuş ve fare tıklaması onay sayılmaz.
    fireEvent.click(dugme, { detail: 1 });
    expect(tetikle).not.toHaveBeenCalled();
    fireEvent.click(dugme, { detail: 0 });
    expect(tetikle).toHaveBeenCalledTimes(1);
    expect(dugme.getAttribute('aria-label')).toBe('Bitir, basılı tutun');

    // Onay süresi geçerse ilk etkinleştirme unutulur.
    fireEvent.click(dugme, { detail: 0 });
    ilerle(ORB_ONAY_SURESI_MS + 1);
    expect(dugme.getAttribute('aria-label')).toBe('Bitir, basılı tutun');
    fireEvent.click(dugme, { detail: 0 });
    expect(tetikle).toHaveBeenCalledTimes(1);
  });

  it('kisa tus basisinin urettigi tiklama yardimci teknoloji tiklamasi sayilmaz', () => {
    sahteZaman();
    const tetikle = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={tetikle} />);
    const dugme = tus('Bitir, basılı tutun');
    for (let i = 0; i < 2; i++) {
      fireEvent.keyDown(dugme, { key: ' ' });
      ilerle(50);
      fireEvent.keyUp(dugme, { key: ' ' });
      fireEvent.click(dugme, { detail: 0 });
      ilerle(500);
    }
    expect(dugme.getAttribute('aria-label')).toBe('Bitir, basılı tutun');
    expect(tetikle).not.toHaveBeenCalled();
  });

  it('pasif dugme basili tutulsa da tetiklenmez', () => {
    sahteZaman();
    const tetikle = vi.fn();
    render(<Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} disabled tetikle={tetikle} />);
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.pointerDown(dugme);
    fireEvent.keyDown(dugme, { key: ' ' });
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
  });

  it('pasiflesme ile surenin dolmasi ayni kareye duserse tetiklemez', () => {
    sahteZaman();
    const tetikle = vi.fn();
    // Yerleşim etkisi, düğmenin kendi iptal etkisinden önce koşar: süre tam o arada dolar.
    function Sarmal({ pasif }: { pasif: boolean }) {
      useLayoutEffect(() => { if (pasif) vi.advanceTimersByTime(SURE * 2); }, [pasif]);
      return <Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} disabled={pasif} tetikle={tetikle} />;
    }
    const { rerender } = render(<Sarmal pasif={false} />);
    const dugme = tus('Bitir, basılı tutun');
    fireEvent.pointerDown(dugme);
    ilerle(SURE / 2);
    expect(dugme.textContent).toContain('sn');
    rerender(<Sarmal pasif />);
    ilerle(SURE * 2);
    expect(tetikle).not.toHaveBeenCalled();
    expect(dugme.textContent).toContain('Basılı tut');
  });

  it('yalniz basili tutulan dugme kaydirma hareketini kapatan sinifi tasir', () => {
    render(
      <>
        <Orb simge="flag" etiket="Bitir" basiliTutMs={SURE} tetikle={() => {}} />
        <Orb simge="play" etiket="Başlat" tetikle={() => {}} />
      </>,
    );
    expect(tus('Bitir, basılı tutun').classList.contains('tc-orb-tut')).toBe(true);
    expect(tus('Başlat').classList.contains('tc-orb-tut')).toBe(false);
  });
});

describe('SayimDugmeleri', () => {
  const kur = (ek: { pasif?: boolean; azaltPasif?: boolean } = {}) => {
    const olay = { arttir: vi.fn(), azalt: vi.fn(), hurda: vi.fn() };
    render(<SayimDugmeleri {...olay} {...ek} />);
    return olay;
  };

  it('uc dugme ayri olay verir; art arda her dokunus bir olaydir', () => {
    const olay = kur();
    expect(within(screen.getByRole('group', { name: 'Sayım' })).getAllByRole('button')).toHaveLength(3);
    for (let i = 0; i < 5; i++) fireEvent.click(tus('Sağlam artı bir'));
    expect(olay.arttir).toHaveBeenCalledTimes(5);
    fireEvent.click(tus('Sağlam eksi bir'));
    fireEvent.click(tus('Sağlam eksi bir'));
    expect(olay.azalt).toHaveBeenCalledTimes(2);
    fireEvent.click(tus('Hurda artı bir'));
    expect(olay.hurda).toHaveBeenCalledTimes(1);
    expect(olay.arttir).toHaveBeenCalledTimes(5);
  });

  it('eksiltme tek basina kapanir; obur ikisi calisir', () => {
    const olay = kur({ azaltPasif: true });
    expect(tus('Sağlam eksi bir')).toHaveProperty('disabled', true);
    fireEvent.click(tus('Sağlam eksi bir'));
    fireEvent.click(tus('Sağlam artı bir'));
    fireEvent.click(tus('Hurda artı bir'));
    expect(olay.azalt).not.toHaveBeenCalled();
    expect(olay.arttir).toHaveBeenCalledTimes(1);
    expect(olay.hurda).toHaveBeenCalledTimes(1);
  });

  it('pasifken hicbir dugme olay vermez', () => {
    const olay = kur({ pasif: true });
    for (const ad of ['Sağlam artı bir', 'Sağlam eksi bir', 'Hurda artı bir']) {
      expect(tus(ad)).toHaveProperty('disabled', true);
      fireEvent.click(tus(ad));
    }
    expect(olay.arttir).not.toHaveBeenCalled();
    expect(olay.azalt).not.toHaveBeenCalled();
    expect(olay.hurda).not.toHaveBeenCalled();
  });
});

describe('AdimListesi', () => {
  const ADIMLAR: ListeAdimi[] = [
    { id: 11, ad: 'İlk parçayı ölç', aciklama: 'Kumpasla', tamam: true, not: 'Deneme Kişi · 09:12' },
    { id: 12, ad: 'Çapak al', aciklama: null, tamam: false },
    { id: 13, ad: 'Kasaya diz', aciklama: 'Kat arasına karton', tamam: false },
  ];
  const kutu = (ad: RegExp) => screen.getByRole('checkbox', { name: ad });

  it('adimlari sirayla numaralar; aciklamayi, notu, isareti ve n/N sayacini gosterir', () => {
    render(<AdimListesi adimlar={ADIMLAR} degistir={() => {}} />);
    const liste = screen.getByRole('group', { name: 'Talimat adımları' });
    expect(liste.textContent).toContain('1 / 3 tamamlandı');
    expect(within(liste).getAllByRole('checkbox').map((k) => k.textContent)).toEqual([
      '1. İlk parçayı ölçKumpaslaDeneme Kişi · 09:12', '2. Çapak al', '3. Kasaya dizKat arasına karton',
    ]);
    expect(within(liste).getAllByRole('checkbox').map((k) => k.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(liste.textContent).not.toContain('Zorunlu');
  });

  it('isaretsiz adima basinca isaretle, isaretliye basinca geri al olayi verir', () => {
    const degistir = vi.fn();
    render(<AdimListesi adimlar={ADIMLAR} degistir={degistir} />);
    fireEvent.click(kutu(/Çapak al/));
    expect(degistir).toHaveBeenLastCalledWith(12, true);
    fireEvent.click(kutu(/İlk parçayı ölç/));
    expect(degistir).toHaveBeenLastCalledWith(11, false);
    expect(degistir).toHaveBeenCalledTimes(2);
  });

  it('salt okunur kipte isaretler gorunur ama olay verilmez; olay verilmediginde de salt okunurdur', () => {
    const degistir = vi.fn();
    const { rerender } = render(<AdimListesi adimlar={ADIMLAR} degistir={degistir} />);
    // Önce etkin olduğunu gör: kilit sınaması boş listede de geçmesin.
    expect(kutu(/Çapak al/).hasAttribute('aria-disabled')).toBe(false);
    rerender(<AdimListesi adimlar={ADIMLAR} degistir={degistir} saltOkunur />);
    expect(kutu(/İlk parçayı ölç/).getAttribute('aria-checked')).toBe('true');
    expect(kutu(/Çapak al/).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(kutu(/Çapak al/));
    fireEvent.click(kutu(/İlk parçayı ölç/));
    expect(degistir).not.toHaveBeenCalled();
    rerender(<AdimListesi adimlar={ADIMLAR} />);
    expect(kutu(/Kasaya diz/).getAttribute('aria-disabled')).toBe('true');
  });

  it('adim yoksa sayac ve oran uydurmaz, bos durumu gosterir', () => {
    render(<AdimListesi adimlar={[]} degistir={() => {}} />);
    expect(screen.getByRole('status').textContent).toContain('Bu emirde adım yok');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.body.textContent).not.toContain('tamamlandı');
  });
});

// Neden seçimi için ayrı parça yok: pencere + gruplu seçim + pencerenin alt düğmeleri yetiyor.
describe('Neden secimi (Pencere + GrupluSecim)', () => {
  const NEDENLER: SecimGrubu<number>[] = [
    { anahtar: 'plansiz', baslik: 'Plansız duruş', secenekler: [{ deger: 1, baslik: 'Arıza', alt: 'D-01', simge: 'wrench' }, { deger: 2, baslik: 'Malzeme bekleme', alt: 'D-02', simge: 'truck' }] },
    { anahtar: 'planli', baslik: 'Planlı duruş', secenekler: [{ deger: 3, baslik: 'Mola', alt: 'D-10', simge: 'coffee' }] },
  ];
  function NedenPenceresi({ kaydet, kapat }: { kaydet: (id: number) => void; kapat: () => void }) {
    const [secili, sec] = useState<number | null>(null);
    return (
      <Pencere
        acik kapat={kapat} baslik="Neden durdu?"
        alt={<><Dugme onClick={kapat}>Vazgeç</Dugme><Dugme tur="tehlike" simge="stop" disabled={secili === null} onClick={() => { if (secili !== null) kaydet(secili); }}>Duruşu kaydet</Dugme></>}
      >
        <GrupluSecim etiket="Duruş nedeni" gruplar={NEDENLER} secili={secili} sec={sec} />
      </Pencere>
    );
  }

  it('nedenler gruplu karolardir; secmeden onay pasiftir, secince secilen nedenle kaydeder', () => {
    const kaydet = vi.fn();
    render(<NedenPenceresi kaydet={kaydet} kapat={() => {}} />);
    const pencere = screen.getByRole('dialog', { name: 'Neden durdu?' });
    expect(within(within(pencere).getByRole('group', { name: 'Plansız duruş' })).getAllByRole('button')).toHaveLength(2);
    expect(within(within(pencere).getByRole('group', { name: 'Planlı duruş' })).getAllByRole('button')).toHaveLength(1);
    const onay = within(pencere).getByRole('button', { name: 'Duruşu kaydet' });
    expect(onay).toHaveProperty('disabled', true);
    fireEvent.click(onay);
    expect(kaydet).not.toHaveBeenCalled();
    fireEvent.click(within(pencere).getByRole('button', { name: /Mola/ }));
    fireEvent.click(within(pencere).getByRole('button', { name: /Malzeme bekleme/ }));
    expect(within(pencere).getByRole('button', { name: /Malzeme bekleme/ }).getAttribute('aria-pressed')).toBe('true');
    expect(within(pencere).getByRole('button', { name: /Mola/ }).getAttribute('aria-pressed')).toBe('false');
    expect(onay).toHaveProperty('disabled', false);
    fireEvent.click(onay);
    expect(kaydet).toHaveBeenCalledTimes(1);
    expect(kaydet).toHaveBeenCalledWith(2);
  });

  it('vazgec, kapat ve Esc kaydetmeden kapatir', () => {
    const kaydet = vi.fn();
    const kapat = vi.fn();
    render(<NedenPenceresi kaydet={kaydet} kapat={kapat} />);
    const pencere = screen.getByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: /Arıza/ }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kapat' }));
    fireEvent.keyDown(pencere, { key: 'Escape' });
    expect(kapat).toHaveBeenCalledTimes(3);
    expect(kaydet).not.toHaveBeenCalled();
  });
});

describe('Kadran', () => {
  it('degeri, hedefi, yuzdeyi ve kalani yazar; cekirdege dokununca olay verir', () => {
    const dokun = vi.fn();
    render(
      <Kadran
        deger={30} hedef={40} durum="calisiyor" dokun={dokun}
        sol={<KadranEtiketi baslik="Başlama">08:05</KadranEtiketi>}
      />,
    );
    const cekirdek = screen.getByRole('button', { name: /Sağlam.*Sayıyı düzelt/ });
    expect(cekirdek.textContent).toContain('30');
    expect(cekirdek.textContent).toContain('/ 40 adet');
    expect(cekirdek.textContent).toContain('%75 · 10 kaldı');
    expect(screen.getByText('08:05')).toBeTruthy();
    fireEvent.click(cekirdek);
    expect(dokun).toHaveBeenCalledTimes(1);
  });

  it('hedef yoksa yuzde ve kalan uydurmaz; dokunma verilmezse dugme olmaz', () => {
    const { container } = render(<Kadran deger={12} hedef={null} />);
    expect(container.textContent).toContain('12');
    expect(container.textContent).not.toContain('%');
    expect(container.textContent).not.toContain('kaldı');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('deger girilmediyse sifir degil tire gosterir; yuzde ve kalan yazmaz, halka bos kalir, dokunma calisir', () => {
    const dokun = vi.fn();
    const { container, rerender } = render(<Kadran deger={null} hedef={40} dokun={dokun} />);
    const cekirdek = screen.getByRole('button', { name: /Sağlam.*girilmedi/ });
    // Hedef göründükten sonra yokluk sınanır: boş ekranda da geçmesin.
    expect(cekirdek.textContent).toBe('Sağlam—girilmedi/ 40 adet, Sayıyı düzelt');
    expect(container.querySelectorAll('.tc-kadran-cizgi-yanik, .tc-kadran-yay')).toHaveLength(0);
    fireEvent.click(cekirdek);
    expect(dokun).toHaveBeenCalledTimes(1);

    rerender(<Kadran deger={0} hedef={40} dokun={dokun} />);
    const sifir = screen.getByRole('button', { name: /Sağlam/ });
    expect(sifir.textContent).toContain('%0 · 40 kaldı');
    expect(container.querySelectorAll('.tc-kadran-yay')).toHaveLength(1);
    expect(sifir.textContent).not.toContain('—');
    expect(sifir.textContent).not.toContain('girilmedi');
  });

  it('hedef asilinca yuzde 100 de kalir ve kalan eksiye dusmez', () => {
    const { container } = render(<Kadran deger={45} hedef={40} />);
    expect(container.textContent).toContain('%100 · 0 kaldı');
  });
});

describe('GrupluSecim', () => {
  const GRUPLAR: SecimGrubu<number>[] = [
    { anahtar: 1, baslik: 'Birinci hat', secenekler: [{ deger: 10, baslik: 'A-01', alt: 'İlk tezgah' }, { deger: 11, baslik: 'A-02' }] },
    { anahtar: 2, baslik: 'İkinci hat', secenekler: [{ deger: 20, baslik: 'B-01', simge: 'cpu' }] },
    { anahtar: 3, baslik: 'Boş hat', secenekler: [] },
  ];

  it('dugmeleri basliklarinin altinda gosterir, secileni isaretler, bos grubu cizmez', () => {
    render(<GrupluSecim etiket="İstasyon" gruplar={GRUPLAR} secili={11} sec={() => {}} />);
    const ilk = screen.getByRole('group', { name: 'Birinci hat' });
    expect(within(ilk).getAllByRole('button').map((d) => d.textContent)).toEqual(['A-01İlk tezgah', 'A-02']);
    expect(within(ilk).getByRole('button', { name: 'A-02' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(ilk).getByRole('button', { name: /A-01/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('group', { name: 'Boş hat' })).toBeNull();
  });

  it('dugmeye basinca o dugmenin degeriyle secer', () => {
    const sec = vi.fn();
    render(<GrupluSecim etiket="İstasyon" gruplar={GRUPLAR} sec={sec} />);
    fireEvent.click(screen.getByRole('button', { name: 'B-01' }));
    expect(sec).toHaveBeenCalledTimes(1);
    expect(sec).toHaveBeenCalledWith(20);
  });

  it('hic secenek yoksa bos durumu gosterir', () => {
    render(<GrupluSecim etiket="İstasyon" gruplar={[GRUPLAR[2] as SecimGrubu<number>]} sec={() => {}} bosMesaj="Tanımlı istasyon yok" />);
    expect(screen.getByRole('status').textContent).toContain('Tanımlı istasyon yok');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('KuyrukKarti', () => {
  it('no, parca, adet, durum ve isareti gosterir; secili karti isaretler; basinca secer', () => {
    const sec = vi.fn();
    render(
      <KuyrukListesi baslik="İşler" sayac="2 açık">
        <KuyrukKarti no="E-1" parca="Deneme parça" adet="40 adet" durum="calisiyor" durumMetni="Çalışıyor" ilerleme={0.5} secili sec={() => {}} />
        <KuyrukKarti no="E-2" parca="Öbür parça" adet="15 adet" durum="sirada" durumMetni="Sırada" isaret={<span>Sıradaki</span>} sec={sec} />
      </KuyrukListesi>,
    );
    const liste = screen.getByRole('region', { name: 'İşler' });
    expect(liste.textContent).toContain('2 açık');
    const [ilk, ikinci] = within(liste).getAllByRole('button');
    expect(ilk?.getAttribute('aria-current')).toBe('true');
    expect(ilk?.textContent).toContain('%50');
    expect(ilk?.textContent).toContain('Çalışıyor');
    expect(ikinci?.hasAttribute('aria-current')).toBe(false);
    // İlerleme bilinmiyorsa yüzde yazılmaz.
    expect(ikinci?.textContent).toBe('E-2Öbür parça15 adetSıradaSıradaki');
    fireEvent.click(ikinci as HTMLElement);
    expect(sec).toHaveBeenCalledTimes(1);
  });
});

describe('OzetKatmani', () => {
  const SATIRLAR = [{ etiket: 'Sağlam', deger: '38' }, { etiket: 'Fark', deger: '2', ton: 'durdu' as const }];

  it('basligi ve satirlari gosterir; odak birincil eyleme duser; eylemler ayri calisir', () => {
    const sonraki = vi.fn();
    const kapat = vi.fn();
    render(
      <OzetKatmani
        acik ustYazi="E-1" baslik="İş tamamlandı" satirlar={SATIRLAR}
        birincil={{ metin: 'Sıradaki işe geç', simge: 'next', tikla: sonraki }} kapat={kapat}
      />,
    );
    const pencere = screen.getByRole('dialog', { name: 'İş tamamlandı' });
    expect(within(pencere).getAllByRole('term').map((t) => t.textContent)).toEqual(['Sağlam', 'Fark']);
    expect(within(pencere).getAllByRole('definition').map((t) => t.textContent)).toEqual(['38', '2']);
    const birincil = within(pencere).getByRole('button', { name: 'Sıradaki işe geç' });
    expect(document.activeElement).toBe(birincil);
    fireEvent.click(birincil);
    expect(sonraki).toHaveBeenCalledTimes(1);
    expect(kapat).not.toHaveBeenCalled();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kapat' }));
    fireEvent.keyDown(pencere, { key: 'Escape' });
    expect(kapat).toHaveBeenCalledTimes(2);
    expect(sonraki).toHaveBeenCalledTimes(1);
  });

  it('birincil eylem yoksa yalniz kapat vardir; kapaliyken cizilmez', () => {
    const { rerender } = render(<OzetKatmani acik baslik="Bitti" satirlar={SATIRLAR} kapat={() => {}} />);
    expect(screen.getAllByRole('button').map((d) => d.textContent)).toEqual(['Kapat']);
    rerender(<OzetKatmani acik={false} baslik="Bitti" satirlar={SATIRLAR} kapat={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('CamYuzey', () => {
  it('etiket verilirse adli bolge olur, verilmezse bolge olmaz; icerigi cizer', () => {
    const { rerender } = render(<CamYuzey duzen="sahne" etiket="Üretim"><p>icerik</p></CamYuzey>);
    expect(screen.getByRole('region', { name: 'Üretim' }).textContent).toBe('icerik');
    rerender(<CamYuzey><p>icerik</p></CamYuzey>);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText('icerik')).toBeTruthy();
  });

  it('siki secenegi iki duzende de dar bosluk sinifini ekler; verilmezse eklemez', () => {
    const { container, rerender } = render(<CamYuzey duzen="sahne"><p>icerik</p></CamYuzey>);
    const yuzey = () => container.firstElementChild as HTMLElement;
    expect(yuzey().classList.contains('tc-cam-siki')).toBe(false);
    rerender(<CamYuzey duzen="sahne" siki><p>icerik</p></CamYuzey>);
    expect([...yuzey().classList].sort()).toEqual(['tc-cam', 'tc-cam-sahne', 'tc-cam-siki']);
    rerender(<CamYuzey siki><p>icerik</p></CamYuzey>);
    expect([...yuzey().classList].sort()).toEqual(['tc-cam', 'tc-cam-duz', 'tc-cam-siki']);
    rerender(<CamYuzey siki={false}><p>icerik</p></CamYuzey>);
    expect([...yuzey().classList].sort()).toEqual(['tc-cam', 'tc-cam-duz']);
  });
});

describe('TerminalYerlesimi', () => {
  it('oran verilmezse ya da dengeli ise sutun orani degismez; orta-genis genis orta sinifini ekler', () => {
    const bolmeler = { sol: <p>kuyruk</p>, orta: <p>aktif</p>, sag: <p>adimlar</p> };
    const { container, rerender } = render(<TerminalYerlesimi {...bolmeler} />);
    const kok = () => container.firstElementChild as HTMLElement;
    expect([...kok().classList].sort()).toEqual(['tc-terminal', 'tc-terminal-uclu']);
    rerender(<TerminalYerlesimi {...bolmeler} oran="dengeli" />);
    expect([...kok().classList].sort()).toEqual(['tc-terminal', 'tc-terminal-uclu']);
    rerender(<TerminalYerlesimi {...bolmeler} oran="orta-genis" />);
    expect([...kok().classList].sort()).toEqual(['tc-terminal', 'tc-terminal-orta-genis', 'tc-terminal-uclu']);
    expect(kok().children).toHaveLength(3);
  });

  it('bolmeleri cizer ve durumu altindakilere verir; sag bolme istege baglidir', () => {
    const { container, rerender } = render(<TerminalYerlesimi durum="durakli" sol={<p>kuyruk</p>} orta={<p>aktif</p>} />);
    const kok = container.firstElementChild as HTMLElement;
    expect(kok.getAttribute('data-durum')).toBe('durakli');
    expect(kok.children).toHaveLength(2);
    rerender(<TerminalYerlesimi sol={<p>kuyruk</p>} orta={<p>aktif</p>} sag={<p>sekmeler</p>} />);
    expect(kok.children).toHaveLength(3);
    expect(kok.textContent).toBe('kuyrukaktifsekmeler');
  });

  it('sag bolme sekmeleri ve adim listesini tasir; sekme degisince icerik degisir', () => {
    function Sag() {
      const [secili, sec] = useState<'adimlar' | 'bilgi'>('adimlar');
      return (
        <>
          <Sekmeler etiket="İş ayrıntısı" sekmeler={[{ anahtar: 'adimlar', baslik: 'Adımlar', simge: 'list' }, { anahtar: 'bilgi', baslik: 'Bilgi' }]} secili={secili} sec={sec} />
          {secili === 'adimlar'
            ? <AdimListesi adimlar={[{ id: 1, ad: 'Ölç', aciklama: null, tamam: false }]} degistir={() => {}} />
            : <p>emir bilgisi</p>}
        </>
      );
    }
    const { container } = render(<TerminalYerlesimi durum="calisiyor" sol={<p>kuyruk</p>} orta={<p>aktif</p>} sag={<Sag />} />);
    const sag = (container.firstElementChild as HTMLElement).children[2] as HTMLElement;
    expect(within(sag).getByRole('tab', { name: 'Adımlar' }).getAttribute('aria-selected')).toBe('true');
    expect(within(sag).getByRole('checkbox', { name: /Ölç/ })).toBeTruthy();
    fireEvent.click(within(sag).getByRole('tab', { name: 'Bilgi' }));
    expect(within(sag).queryByRole('checkbox')).toBeNull();
    expect(sag.textContent).toContain('emir bilgisi');
  });
});
