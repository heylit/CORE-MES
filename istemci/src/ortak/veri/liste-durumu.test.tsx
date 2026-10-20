import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import type { EmirDurumu, EmirlerSorgusu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { sonrakiSiralama, sorguMetni, useListeDurumu, type ListeDurumu, type ListeDurumuSecenegi, type Siralama } from './liste-durumu.ts';

type Suzgec = { metin: string; durum: string; kaliteId: number | ''; arsiv: boolean | '' };
type Ozellik = Partial<ListeDurumuSecenegi<Suzgec>> & { no?: string };
const BOS: Suzgec = { metin: '', durum: '', kaliteId: '', arsiv: '' };
// Düğmesi olmayan çağrılar (fırlatan, iki parametreli) için kancanın son hali.
const son: { liste: ListeDurumu<Suzgec> | null } = { liste: null };
const kanca = () => son.liste as ListeDurumu<Suzgec>;

function Sonda({ no = '', ...secenek }: Ozellik) {
  const liste = useListeDurumu({ suzgecler: BOS, suzgecTurleri: { kaliteId: 'sayi', arsiv: 'mantik' }, siralamaAlanlari: ['ad', 'adet'], ...secenek });
  son.liste = liste;
  const konum = useLocation();
  const git = useNavigate();
  const dugme = (ad: string, bas: () => void) => <button onClick={bas}>{ad + no}</button>;
  return (
    <>
      <output data-testid={`sorgu${no}`}>{JSON.stringify(liste.sorgu)}</output>
      <output data-testid="adres">{konum.search}</output>
      {dugme('ileri', () => liste.sayfaDegistir(liste.sayfa + 1))}
      {dugme('süz', () => liste.suzgecDegistir({ durum: 'acik' }))}
      {dugme('sırala', () => liste.siralamaDegistir(sonrakiSiralama(liste.siralama, 'ad')))}
      {dugme('boy', () => liste.sayfaBoyuDegistir(100))}
      {dugme('sıfırla', () => liste.sifirla())}
      {dugme('bozuk sayfa', () => liste.sayfaDegistir(Number.NaN))}
      {dugme('eksi sayfa', () => liste.sayfaDegistir(-3))}
      {dugme('ara ve sırala', () => { liste.suzgecDegistir({ metin: 'mil' }); liste.siralamaDegistir({ alan: 'adet', yon: 'azalan' }); liste.suzgecDegistir({ durum: 'acik' }); })}
      {dugme('geri', () => { void git(-1); })}
    </>
  );
}

const ac = (yol: string, ozellik: Ozellik = {}) => render(<MemoryRouter initialEntries={[yol]}><Sonda {...ozellik} /></MemoryRouter>);
const bas = (ad: string) => fireEvent.click(screen.getByRole('button', { name: ad }));
const sorgu = (no = '') => JSON.parse(screen.getByTestId(`sorgu${no}`).textContent ?? '') as Record<string, unknown>;
const adres = () => screen.getAllByTestId('adres')[0]?.textContent;

describe('sonrakiSiralama ve sorguMetni', () => {
  it('ayni sutunda artan, azalan, sirasiz diye doner; baska sutun artandan baslar', () => {
    const artan = sonrakiSiralama(null, 'ad');
    expect(artan).toEqual({ alan: 'ad', yon: 'artan' });
    const azalan = sonrakiSiralama(artan, 'ad');
    expect(azalan).toEqual({ alan: 'ad', yon: 'azalan' });
    expect(sonrakiSiralama(azalan, 'ad')).toBeNull();
    expect(sonrakiSiralama(azalan, 'adet')).toEqual({ alan: 'adet', yon: 'artan' });
  });

  it('bos ve tanimsiz degeri yazmaz, metni kacislar', () => {
    expect(sorguMetni({ metin: 'a b&c', durum: '', tur: undefined, sayfa: 2 })).toBe('?metin=a+b%26c&sayfa=2');
    expect(sorguMetni({ durum: '' })).toBe('');
  });
});

// Tip kanıtı: kancanın sorgusu gerçek sözleşme sorgu tiplerine atanır; süzgecin dar tipi genişlerse derleme kırılır.
type MalzemeTuru = 'hammadde' | 'sarf';
function TipKaniti() {
  const malzemeler = useListeDurumu({
    suzgecler: { metin: '', tur: '' as '' | MalzemeTuru, kaliteId: '' as number | '' },
    suzgecDegerleri: { tur: ['hammadde', 'sarf'] }, suzgecTurleri: { kaliteId: 'sayi' }, siralamaAlanlari: ['ad', 'stokKodu'] as const,
  });
  const kaliteId: number | undefined = malzemeler.sorgu.kaliteId;
  const emirler = useListeDurumu({ suzgecler: { durum: '' as '' | EmirDurumu } });
  const malzemeSorgusu = malzemeler.sorgu;
  const emirSorgusu: EmirlerSorgusu = emirler.sorgu;
  const alan: 'ad' | 'stokKodu' | undefined = malzemeler.sorgu.sirala;
  return <output data-testid="tip">{JSON.stringify([malzemeSorgusu, emirSorgusu, alan ?? null, kaliteId ?? null])}</output>;
}

describe('useListeDurumu', () => {
  it('sorgusu sozlesmedeki liste sorgusu tiplerine atanir', () => {
    render(<MemoryRouter><TipKaniti /></MemoryRouter>);
    expect(JSON.parse(screen.getByTestId('tip').textContent ?? '')).toEqual([{ sayfa: 1 }, { sayfa: 1 }, null, null]);
  });

  it('ilk durumda yalniz sayfa gider; bos suzgec ve secilmemis siralama sorguya yazilmaz', () => {
    ac('/liste');
    expect(sorgu()).toEqual({ sayfa: 1 });
  });

  it('suzgec, siralama ve sayfa boyu degisince ilk sayfaya doner', () => {
    ac('/liste', { sayfaBoyuSecenekleri: [50, 100] });
    bas('ileri'); bas('ileri');
    expect(sorgu()).toEqual({ sayfa: 3 });
    bas('süz');
    expect(sorgu()).toEqual({ durum: 'acik', sayfa: 1 });
    bas('ileri');
    bas('sırala');
    expect(sorgu()).toEqual({ durum: 'acik', sayfa: 1, sirala: 'ad', yon: 'artan' });
    bas('ileri');
    bas('boy');
    expect(sorgu()).toEqual({ durum: 'acik', sayfa: 1, sayfaBoyu: 100, sirala: 'ad', yon: 'artan' });
    bas('ileri');
    bas('sıfırla');
    expect(sorgu()).toEqual({ sayfa: 1 });
  });

  it('gecersiz sayfa ilk sayfaya cekilir', () => {
    ac('/liste');
    bas('ileri');
    bas('bozuk sayfa');
    expect(sorgu()).toEqual({ sayfa: 1 });
    bas('ileri');
    bas('eksi sayfa');
    expect(sorgu()).toEqual({ sayfa: 1 });
  });

  it('ekranin bildirmedigi siralama alani ya da sayfa boyu ile cagri firlatir, durum degismez', () => {
    ac('/liste', { sayfaBoyuSecenekleri: [50] });
    bas('ileri');
    expect(() => kanca().siralamaDegistir({ alan: 'parola', yon: 'artan' })).toThrow('Sıralama alanı izinli değil: parola');
    expect(() => kanca().sayfaBoyuDegistir(100)).toThrow('Sayfa boyu izinli değil: 100');
    expect(sorgu()).toEqual({ sayfa: 2 });
    act(() => { kanca().siralamaDegistir({ alan: 'adet', yon: 'artan' }); });
    act(() => { kanca().sayfaBoyuDegistir(50); });
    expect(sorgu()).toEqual({ sayfa: 1, sayfaBoyu: 50, sirala: 'adet', yon: 'artan' });
  });

  it('tasan sayfa guncel cevapla duzeltilir; tutulan eski sayfanin cevabi kullaniciyi geri atmaz', () => {
    ac('/liste');
    bas('ileri'); bas('ileri'); bas('ileri');
    // Sayfa 4 istendi; ekranda hâlâ sayfa 3 için gelmiş (uygulanan 2) eski cevap duruyor.
    act(() => { kanca().sayfaEsitle(2, 3); });
    expect(sorgu()).toEqual({ sayfa: 4 });
    act(() => { kanca().sayfaEsitle(undefined, 4); });
    act(() => { kanca().sayfaEsitle(4, 4); });
    act(() => { kanca().sayfaEsitle(6, 4); });
    expect(sorgu()).toEqual({ sayfa: 4 });
    act(() => { kanca().sayfaEsitle(2, 4); });
    expect(sorgu()).toEqual({ sayfa: 2 });
    bas('ileri');
    expect(sorgu()).toEqual({ sayfa: 3 });
  });

  it('adresteki suzgec degeri turune cevrilir; ture ya da izinli degerlere uymayan baslangica doner', () => {
    const { unmount } = ac('/liste?kaliteId=12&arsiv=false&durum=acik', { adres: true, suzgecDegerleri: { durum: ['acik', 'kapali'] } });
    expect(sorgu()).toEqual({ durum: 'acik', kaliteId: 12, arsiv: false, sayfa: 1 });
    unmount();
    ac('/liste?kaliteId=on-iki&arsiv=belki&durum=xyz&metin=mil', { adres: true, suzgecDegerleri: { durum: ['acik', 'kapali'] } });
    expect(sorgu()).toEqual({ metin: 'mil', sayfa: 1 });
  });

  it('sayi ve mantiksal suzgec adrese yazilir, bosaltilinca adresten kalkar', () => {
    ac('/liste', { adres: true });
    act(() => { kanca().suzgecDegistir({ kaliteId: 7, arsiv: true }); });
    expect(adres()).toBe('?kaliteId=7&arsiv=true');
    expect(sorgu()).toEqual({ kaliteId: 7, arsiv: true, sayfa: 1 });
    act(() => { kanca().suzgecDegistir({ kaliteId: '' }); });
    expect(adres()).toBe('?arsiv=true');
  });

  it('adres esitleme kapaliyken adres cubuguna dokunmaz ve adresteki degeri okumaz', () => {
    ac('/liste?sayfa=4&durum=kapali');
    expect(sorgu()).toEqual({ sayfa: 1 });
    bas('ileri'); bas('süz'); bas('sırala');
    expect(sorgu()).toEqual({ durum: 'acik', sayfa: 1, sirala: 'ad', yon: 'artan' });
    expect(adres()).toBe('?sayfa=4&durum=kapali');
  });

  it('adres esitleme acikken durumu adresten okur', () => {
    ac('/liste?sayfa=3&durum=kapali&sirala=ad&yon=azalan&sayfaBoyu=20', { adres: true, sayfaBoyuSecenekleri: [20, 50] });
    expect(sorgu()).toEqual({ durum: 'kapali', sayfa: 3, sayfaBoyu: 20, sirala: 'ad', yon: 'azalan' });
  });

  it('adresten gelen izinsiz siralama alani ve secenekte olmayan sayfa boyu sunucuya gitmez', () => {
    ac('/liste?sayfa=2&sirala=parola&yon=azalan&sayfaBoyu=100000', { adres: true });
    expect(sorgu()).toEqual({ sayfa: 2 });
  });

  it('adres acikken sayfa degisimi gecmise girer, baska parametreye dokunmaz; geri tusu onceki sayfayi getirir', () => {
    ac('/liste?sekme=acik', { adres: true });
    bas('ileri');
    expect(adres()).toBe('?sekme=acik&sayfa=2');
    bas('ileri');
    expect(sorgu()).toEqual({ sayfa: 3 });
    bas('geri');
    expect(sorgu()).toEqual({ sayfa: 2 });
    expect(adres()).toBe('?sekme=acik&sayfa=2');
  });

  it('adres acikken suzgec ve siralama gecmise yeni giris eklemez', () => {
    ac('/liste?sekme=acik', { adres: true });
    bas('ileri');
    bas('süz');
    expect(adres()).toBe('?sekme=acik&durum=acik');
    bas('sırala');
    expect(adres()).toBe('?sekme=acik&durum=acik&sirala=ad&yon=artan');
    // Süzgeç ve sıralama ikinci sayfanın girişini değiştirdi: tek geri basışı açılış adresine döner.
    bas('geri');
    expect(adres()).toBe('?sekme=acik');
    expect(sorgu()).toEqual({ sayfa: 1 });
  });

  it('adres acikken ayni olaydaki art arda degisikliklerin hicbiri kaybolmaz', () => {
    ac('/liste', { adres: true });
    bas('ara ve sırala');
    expect(sorgu()).toEqual({ metin: 'mil', durum: 'acik', sayfa: 1, sirala: 'adet', yon: 'azalan' });
    bas('ileri');
    expect(sorgu()).toEqual({ metin: 'mil', durum: 'acik', sayfa: 2, sirala: 'adet', yon: 'azalan' });
  });

  it('ayni sayfadaki iki liste onekle ayrilir, birbirinin durumunu bozmaz', () => {
    render(
      <MemoryRouter initialEntries={['/emir?kayit.sayfa=4']}>
        <Sonda adres={{ onek: 'emir' }} no=" 1" />
        <Sonda adres={{ onek: 'kayit' }} no=" 2" />
      </MemoryRouter>,
    );
    expect([sorgu(' 1'), sorgu(' 2')]).toEqual([{ sayfa: 1 }, { sayfa: 4 }]);
    bas('ileri 1');
    bas('süz 2');
    expect([sorgu(' 1'), sorgu(' 2')]).toEqual([{ sayfa: 2 }, { durum: 'acik', sayfa: 1 }]);
    expect(adres()).toBe('?emir.sayfa=2&kayit.durum=acik');
  });

  it('adresteki bozuk sayfa ilk sayfa sayilir; taninmayan yon artandir', () => {
    ac('/liste?sayfa=-2&sirala=ad&yon=ters', { adres: true });
    expect(sorgu()).toEqual({ sayfa: 1, sirala: 'ad', yon: 'artan' });
  });

  it('baslangic siralamasi adrese yazilmaz; kaldirilinca bos deger olarak tasinir', () => {
    const siralama: Siralama = { alan: 'ad', yon: 'azalan' };
    ac('/liste', { adres: true, siralama });
    expect(sorgu()).toEqual({ sayfa: 1, sirala: 'ad', yon: 'azalan' });
    expect(adres()).toBe('');
    bas('sırala');
    expect(sorgu()).toEqual({ sayfa: 1 });
    expect(adres()).toBe('?sirala=');
  });
});
