import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SayiKarti } from './SayiKarti.tsx';
import type { GidisatOlcusu, IsKalemi } from '#paylasilan/sozlesme/pano.ts';
import type { AnaSayfaKaynagi, AnaSayfaKarti } from '../rota/ana-sayfa.ts';
import { AnaSayfa } from './AnaSayfa.tsx';
import { kiyasYonu } from './GidisatKarti.tsx';
import { useKaynakBildir, type KaynakVerisi } from './pano-baglami.ts';

afterEach(cleanup);

const ekran = (metin: string) => () => <section aria-label={metin}>{metin}</section>;
const KARTLAR: AnaSayfaKarti[] = [
  { anahtar: 'sistem', sira: 900, genis: true, ekran: ekran('Sistem kartı') },
  { anahtar: 'talep', sira: 100, islem: 'satin-alma.talep-ac', ekran: ekran('Talep kartı') },
];
const bolgeler = () => screen.queryAllByRole('region').map((b) => b.getAttribute('aria-label'));

describe('AnaSayfa', () => {
  it('yetkisi olana kartlari siraya gore cizer; olmayana yalniz herkese acik karti', () => {
    render(<AnaSayfa kartlar={KARTLAR} islemler={['satin-alma.talep-ac']} />);
    expect(bolgeler()).toEqual(['Talep kartı', 'Sistem kartı']);
    cleanup();

    render(<AnaSayfa kartlar={KARTLAR} islemler={[]} />);
    expect(bolgeler()).toEqual(['Sistem kartı']);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('bolum bildiren kartlari basligiyla bolumlere ayirir; yetkisi olmayanin bolumu hic cizilmez', () => {
    const kartlar: AnaSayfaKarti[] = [
      ...KARTLAR,
      { anahtar: 'kuyruk', sira: 10, bolum: 'is', islem: 'sayfa.kuyruk', ekran: ekran('Kuyruk kartı') },
      { anahtar: 'dusuk-stok', sira: 20, bolum: 'uyari', islem: 'sayfa.stok', ekran: ekran('Düşük stok kartı') },
    ];
    render(<AnaSayfa kartlar={kartlar} islemler={['sayfa.kuyruk', 'sayfa.stok']} />);
    const bolumler = screen.getAllByRole('heading', { level: 2 }).map((b) => b.textContent);
    expect(bolumler).toEqual(['Bana düşen işler', 'Uyarılar']);
    expect(within(screen.getByRole('region', { name: 'Uyarılar' })).getByRole('region', { name: 'Düşük stok kartı' })).toBeTruthy();
    // Bölümün adı başlığından gelir (aria-labelledby); kart sırası bölüm sırasıdır.
    expect(bolgeler()).toEqual([null, 'Kuyruk kartı', null, 'Düşük stok kartı', 'Sistem kartı']);
    cleanup();

    render(<AnaSayfa kartlar={kartlar} islemler={['sayfa.kuyruk']} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((b) => b.textContent)).toEqual(['Bana düşen işler']);
    expect(screen.queryByRole('region', { name: 'Uyarılar' })).toBeNull();
  });

  it('gorunecek karti olmayana bos sayfa yerine bos durum metni gosterir', () => {
    render(<AnaSayfa kartlar={[KARTLAR[1]!]} islemler={['satin-alma.talep-ac']} />);
    expect(bolgeler()).toEqual(['Talep kartı']);
    cleanup();

    render(<AnaSayfa kartlar={[KARTLAR[1]!]} islemler={['saglik.ayrinti-oku']} />);
    expect(bolgeler()).toEqual([]);
    expect(screen.getByRole('status').textContent).toContain('size açık bir kart yok');
  });

  it('islerde ve uyarilarda sayisi sifir olan kart gizlenir; hepsi sifirsa bolum bos metnini gosterir', () => {
    const sayiKarti = (baslik: string, sayi: number | null) => () => <SayiKarti baslik={baslik} simge="flag" sayi={sayi} />;
    const kartlar: AnaSayfaKarti[] = [
      { anahtar: 'kuyruk', sira: 10, bolum: 'is', ekran: sayiKarti('Kuyruk', 0) },
      { anahtar: 'onay', sira: 11, bolum: 'is', ekran: sayiKarti('Onay', 3) },
      { anahtar: 'stok', sira: 20, bolum: 'uyari', ekran: sayiKarti('Düşük stok', 0) },
      { anahtar: 'kalibrasyon', sira: 21, bolum: 'uyari', ekran: sayiKarti('Kalibrasyon', null) },
      { anahtar: 'acik', sira: 30, bolum: 'ozet', ekran: sayiKarti('Açık emir', 0) },
    ];
    render(<MemoryRouter><AnaSayfa kartlar={kartlar} islemler={[]} /></MemoryRouter>);
    const gorunen = () => [...document.querySelectorAll('[data-kart]')].filter((k) => !k.closest('[hidden]')).map((k) => k.getAttribute('data-kart'));
    // Veri yok sıfır değildir; özet sıfırı da gösterir.
    expect(gorunen()).toEqual(['onay', 'kalibrasyon', 'acik']);
    expect(screen.queryByText('Bekleyen işiniz yok.')).toBeNull();
    cleanup();

    render(<MemoryRouter><AnaSayfa kartlar={kartlar.filter((k) => k.anahtar !== 'onay')} islemler={[]} /></MemoryRouter>);
    expect(within(screen.getByRole('region', { name: 'Bana düşen işler' })).getByText('Bekleyen işiniz yok.')).toBeTruthy();
    expect(gorunen()).toEqual(['kalibrasyon', 'acik']);
  });

  it('ozet ilk alti kartla baslar; dugme hepsini acar ve kapatir', () => {
    const kartlar: AnaSayfaKarti[] = Array.from({ length: 8 }, (_, i) => (
      { anahtar: `ozet-${i}`, sira: i, bolum: 'ozet' as const, ekran: ekran(`Özet ${i}`) }
    ));
    render(<AnaSayfa kartlar={kartlar} islemler={[]} />);
    expect(bolgeler().filter((b) => b?.startsWith('Özet '))).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Tüm özet (8)' }));
    expect(bolgeler().filter((b) => b?.startsWith('Özet '))).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: 'Daha az göster' }));
    expect(bolgeler().filter((b) => b?.startsWith('Özet '))).toHaveLength(6);
  });

  it('ad verilince kisiyi adiyla karsilar', () => {
    render(<AnaSayfa kartlar={KARTLAR} islemler={[]} ad="Deneme Kişi" />);
    expect(screen.getByText(/, Deneme Kişi$/)).toBeTruthy();
  });
});

const kalem = (anahtar: string, aciliyet: IsKalemi['aciliyet'], ek: Partial<IsKalemi> = {}): IsKalemi =>
  ({ anahtar, baslik: `İş ${anahtar}`, ayrinti: null, aciliyet, sonTarih: null, yol: `/kayit/${anahtar}`, eylem: 'Aç', neden: null, ...ek });
const olcu = (ek: Partial<GidisatOlcusu> = {}): GidisatOlcusu =>
  ({ anahtar: 'uretim', ad: 'Bugün ürettiğim', deger: 46, birim: 'adet', kiyas: null, plan: null, seri: [], dagilim: [], ...ek });
// Her çizimde yeni dizi verir: kabuk aynı içerikte döngüye girmemeli.
const bildiren = (veri: () => KaynakVerisi) => function Kaynak() { useKaynakBildir(veri()); return null; };
const isKaynagi = (anahtar: string, baslik: string, veri: () => KaynakVerisi, ek: Partial<AnaSayfaKaynagi> = {}): AnaSayfaKaynagi =>
  ({ anahtar, tur: 'is', baslik, simge: 'list', sira: 100, kaynak: bildiren(veri), ...ek });
const satirBasliklari = () => screen.queryAllByRole('listitem').map((l) => l.querySelector('.tc-is-baslik')?.textContent).filter(Boolean);

describe('AnaSayfa rol panosu (kart 1585)', () => {
  it('kaynak yoksa ya da islemi yoksa eski kart panosu kalir', () => {
    const k = isKaynagi('plan-is', 'Plan', () => [kalem('a', 'bugun')], { islem: 'plan.yaz' });
    render(<MemoryRouter><AnaSayfa kartlar={KARTLAR} kaynaklar={[k]} islemler={[]} /></MemoryRouter>);
    expect(screen.queryByRole('region', { name: 'Yönlendirme' })).toBeNull();
    expect(bolgeler()).toEqual(['Sistem kartı']);
  });

  it('en acil isi yonlendirmeye cikarir, kalanlari moduller arasi aciliyet sirasiyla listeler; satir kaydi acar', () => {
    const kaynaklar = [
      isKaynagi('plan-is', 'Plan', () => [kalem('p1', 'hafta'), kalem('p2', 'bugun')]),
      isKaynagi('kalite-is', 'Kalite', () => [kalem('k1', 'bekliyor', { neden: 'Tezgah onay bekliyor' }), kalem('k2', 'gecikmis')]),
    ];
    render(<MemoryRouter><AnaSayfa kartlar={[]} kaynaklar={kaynaklar} islemler={[]} /></MemoryRouter>);
    const serit = screen.getByRole('region', { name: 'Yönlendirme' });
    expect(within(serit).getByText('İş k2')).toBeTruthy();
    expect(within(serit).getByText(/Hemen bak/)).toBeTruthy();
    expect(within(serit).getByRole('link', { name: /Aç/ }).getAttribute('href')).toBe('/kayit/k2');
    expect(satirBasliklari()).toEqual(['İş k1', 'İş p2', 'İş p1']);
    const liste = screen.getByRole('region', { name: /İşlerim/ });
    expect(within(liste).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/kayit/k1', '/kayit/p2', '/kayit/p1']);
  });

  it('tur suzgeci yalniz secilen turu gosterir; tek turde suzgec cizilmez', () => {
    const kaynaklar = [
      isKaynagi('plan-is', 'Plan', () => [kalem('p0', 'gecikmis'), kalem('p1', 'bugun')]),
      isKaynagi('stok-is', 'Malzeme', () => [kalem('s1', 'hafta')]),
    ];
    render(<MemoryRouter><AnaSayfa kartlar={[]} kaynaklar={kaynaklar} islemler={[]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /^Malzeme/ }));
    expect(satirBasliklari()).toEqual(['İş s1']);
    fireEvent.click(screen.getByRole('button', { name: /^Tümü/ }));
    expect(satirBasliklari()).toEqual(['İş p1', 'İş s1']);
    cleanup();

    render(<MemoryRouter><AnaSayfa kartlar={[]} kaynaklar={[kaynaklar[0]!]} islemler={[]} /></MemoryRouter>);
    expect(screen.queryByRole('group', { name: 'İş türü' })).toBeNull();
  });

  it('bos kaynak yolunda satirina duser; alinamayan kaynak is yok sayilmaz, adiyla yazilir', () => {
    const kaynaklar = [
      isKaynagi('rota-is', 'Rota', () => [], { yolunda: 'Rota onayı bekleyen yok' }),
      isKaynagi('stok-is', 'Malzeme', () => null),
    ];
    render(<MemoryRouter><AnaSayfa kartlar={[]} kaynaklar={kaynaklar} islemler={[]} /></MemoryRouter>);
    expect(within(screen.getByRole('list', { name: 'Sorunsuz alanlar' })).getByText('Rota onayı bekleyen yok')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Alınamadı: Malzeme');
    expect(screen.getByText('Bekleyen işiniz yok.')).toBeTruthy();
  });

  it('yukleniyorken is yok demez', () => {
    render(<MemoryRouter><AnaSayfa kartlar={[]} kaynaklar={[isKaynagi('plan-is', 'Plan', () => undefined)]} islemler={[]} /></MemoryRouter>);
    expect(screen.queryByText('Bekleyen işiniz yok.')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('…');
  });

  it('gidisat olcusunu kiyas ve planla cizer; veri yoksa sifir yazmaz', () => {
    const g: AnaSayfaKaynagi = { anahtar: 'uretim-olcu', tur: 'gidisat', baslik: 'Üretim', simge: 'gauge', sira: 1, kaynak: bildiren(() => [
      olcu({ plan: 60, kiyas: { etiket: 'dün', deger: 40, iyiYon: 'artis' } }),
      olcu({ anahtar: 'hurda', ad: 'Hurda', deger: null }),
    ]) };
    render(<MemoryRouter><AnaSayfa kartlar={[]} kaynaklar={[g]} islemler={[]} /></MemoryRouter>);
    const gidisat = screen.getByRole('region', { name: 'Gidişat' });
    expect(within(gidisat).getByText('46 adet')).toBeTruthy();
    expect(within(gidisat).getByText('dün 40 adet').getAttribute('data-yon')).toBe('iyi');
    expect(within(gidisat).getByRole('img').getAttribute('aria-label')).toContain('Plan 60 adet');
    expect(within(gidisat).getByText('Veri yok')).toBeTruthy();
  });

  it('eski is, uyari ve ozet bolumleri cizilmez (1594 a); sirket ozeti altta kapali, bolumsuz kart yerinde', () => {
    const kartlar: AnaSayfaKarti[] = [
      ...KARTLAR,
      { anahtar: 'eski-is', sira: 10, bolum: 'is', ekran: ekran('Eski iş kartı') },
      { anahtar: 'eski-ozet', sira: 20, bolum: 'ozet', ekran: ekran('Eski özet kartı') },
      { anahtar: 'yonetim-kart', sira: 30, bolum: 'yonetim', ekran: ekran('Yönetim kartı') },
    ];
    const k = isKaynagi('plan-is', 'Plan', () => [kalem('a', 'bugun')]);
    render(<MemoryRouter><AnaSayfa kartlar={kartlar} kaynaklar={[k]} islemler={['pano.sirket-ozeti']} /></MemoryRouter>);
    expect(screen.queryByText('Eski iş kartı')).toBeNull();
    expect(screen.queryByText('Eski özet kartı')).toBeNull();
    const ozet = screen.getByText('Şirket özeti').closest('details');
    expect(ozet?.open).toBe(false);
    expect(ozet?.textContent).toContain('Yönetim kartı');
    expect(screen.getByRole('region', { name: 'Sistem kartı' })).toBeTruthy();
  });
});

describe('kiyasYonu', () => {
  it('iyi yon artis ya da azalis olabilir; veri, kiyas ya da yon yoksa notr', () => {
    expect(kiyasYonu(olcu({ deger: 5, kiyas: { etiket: 'dün', deger: 3, iyiYon: 'artis' } }))).toBe('iyi');
    expect(kiyasYonu(olcu({ deger: 5, kiyas: { etiket: 'dün', deger: 3, iyiYon: 'azalis' } }))).toBe('kotu');
    expect(kiyasYonu(olcu({ deger: 2, kiyas: { etiket: 'dün', deger: 3, iyiYon: 'azalis' } }))).toBe('iyi');
    expect(kiyasYonu(olcu({ deger: null, kiyas: { etiket: 'dün', deger: 3, iyiYon: 'artis' } }))).toBe('notr');
    expect(kiyasYonu(olcu({ deger: 5, kiyas: { etiket: 'dün', deger: 3, iyiYon: null } }))).toBe('notr');
    expect(kiyasYonu(olcu({ deger: 3, kiyas: { etiket: 'dün', deger: 3, iyiYon: 'artis' } }))).toBe('notr');
  });
});
