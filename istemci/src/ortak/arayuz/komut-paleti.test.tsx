import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SAYFALAR, type Sayfa } from '#paylasilan/sayfalar.ts';
import type { IkinciMenu } from '../rota/ikinci-menu.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Komut } from '../rota/komutlar.ts';
import { CERCEVE_KANALI, CERCEVE_SURUMU } from '../rota/cerceve-iletisi.ts';
import { KOMUT_METNI_BEKLEME_MS, useYalitilmisGorunum } from '../rota/cerceve-gorunumu.ts';
import { useSayfaKomutlari, type SayfaKomutu } from '../rota/sayfa-komutlari.ts';
import { Kabuk } from './Kabuk.tsx';
import { YalitilmisCerceve } from './YalitilmisCerceve.tsx';

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

afterEach(() => { cleanup(); vi.useRealTimers(); });

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

describe('Ctrl K: değer alan komutlar (çerçeve önerileri)', () => {
  const BAS = { kanal: CERCEVE_KANALI, surum: CERCEVE_SURUMU } as const;

  function CerceveliSayfa() {
    const gorunumIletisi = useYalitilmisGorunum('/stok', [MENU]);
    return (
      <YalitilmisCerceve
        baslik="Pano"
        sayfa="<!doctype html><html><head></head><body></body></html>"
        iletiGeldi={(veri, yanitla) => { gorunumIletisi(veri, yanitla); }}
      />
    );
  }

  function kur() {
    vi.useFakeTimers();
    ciz(<CerceveliSayfa />);
    const cerceve = (screen.getByTitle('Pano') as HTMLIFrameElement).contentWindow as Window;
    const gonderilen = vi.spyOn(cerceve, 'postMessage').mockImplementation(() => undefined);
    const ilet = (veri: unknown, koken = 'null') => {
      act(() => { window.dispatchEvent(new MessageEvent('message', { data: veri, origin: koken, source: cerceve })); });
    };
    const bekle = () => { act(() => { vi.advanceTimersByTime(KOMUT_METNI_BEKLEME_MS); }); };
    const metinler = () => gonderilen.mock.calls.map(([v]) => v as { tip: string; metin?: string; sira?: number; anahtar?: string });
    return { ilet, bekle, metinler };
  }

  it('izinli: yazım durunca metin çerçeveye gider; son sıranın önerileri "Bu sayfa"da görünür, Enter seçileni çerçeveye yollar', () => {
    const { ilet, bekle, metinler } = kur();
    ilet({ ...BAS, tip: 'komutlar', komutlar: [{ anahtar: 'gun-ozeti', baslik: 'Gün özeti' }] });
    yaz('116');
    yaz('116 o');
    expect(metinler().filter((m) => m.tip === 'komut-metni')).toEqual([]);
    bekle();
    const sorular = metinler().filter((m) => m.tip === 'komut-metni');
    expect(sorular.map((m) => m.metin)).toEqual(['116 o']);
    const sira = sorular[0]!.sira;
    ilet({ ...BAS, tip: 'komut-onerileri', sira: (sira ?? 0) + 1, komutlar: [{ anahtar: 'yanlis', baslik: 'Yanlış sıra' }] });
    ilet({ ...BAS, tip: 'komut-onerileri', sira, komutlar: [{ anahtar: 'sp-116-one-al', baslik: 'SP-116 öne al', aciklama: '434,1 sa -> 376,1 sa' }] });
    expect(secenekler()[0]).toBe('SP-116 öne al 434,1 sa -> 376,1 sa Bu sayfa');
    expect(secenekler()).not.toContain('Yanlış sıra Bu sayfa');
    fireEvent.keyDown(kutu(), { key: 'Enter' });
    expect(metinler().at(-1)).toEqual({ ...BAS, tip: 'komut-calistir', anahtar: 'sp-116-one-al' });
  });

  it('reddedilen: yeni harf eski öneriyi siler; komut bildirmemiş çerçeveye metin gitmez; palet kapanınca öneri kalmaz', () => {
    const { ilet, bekle, metinler } = kur();
    yaz('116');
    bekle();
    expect(metinler().filter((m) => m.tip === 'komut-metni')).toEqual([]);
    ilet({ ...BAS, tip: 'komutlar', komutlar: [{ anahtar: 'gun-ozeti', baslik: 'Gün özeti' }] });
    bekle();
    const sira = metinler().filter((m) => m.tip === 'komut-metni').at(-1)?.sira;
    ilet({ ...BAS, tip: 'komut-onerileri', sira, komutlar: [{ anahtar: 'sp-116-one-al', baslik: 'SP-116 öne al' }] });
    expect(secenekler()).toContain('SP-116 öne al Bu sayfa');
    yaz('117');
    expect(secenekler()).not.toContain('SP-116 öne al Bu sayfa');
    ilet({ ...BAS, tip: 'komut-onerileri', sira, komutlar: [{ anahtar: 'sp-116-one-al', baslik: 'SP-116 öne al' }] });
    expect(secenekler()).not.toContain('SP-116 öne al Bu sayfa');
    fireEvent.keyDown(kutu(), { key: 'Escape' });
    ac();
    expect(secenekler()).toEqual(['Gün özeti Bu sayfa']);
  });
});
