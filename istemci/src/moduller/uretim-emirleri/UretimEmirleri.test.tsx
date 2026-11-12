import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { KucukResimlerCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { BitenEmirlerCevabi, Emir, EmirAyrintiCevabi, EmirlerCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';
import { OKUYUCU, YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

const ACAN = { id: 7, ad: 'Deneme Planlamaci' };
const IST = { id: 3, ad: 'Deneme Tezgah 1' };
const TEMEL = {
  parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: IST, acan: ACAN,
  acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null,
};
// Fikstürler sözleşme tipine uyar (satisfies).
const PLANLI = { ...TEMEL, id: 1, emirNo: 'EM-1', durum: 'planli' } satisfies Emir;
const BASLAMIS = { ...TEMEL, id: 2, emirNo: 'EM-2', durum: 'basladi', baslama: '2026-10-06T09:00:00+00:00' } satisfies Emir;
const BITMIS = {
  ...TEMEL, id: 3, emirNo: 'EM-3', durum: 'bitti', baslama: '2026-10-06T09:00:00+00:00', bitis: '2026-10-06T11:00:00+00:00', saglamAdet: 8,
} satisfies Emir;

const liste = (emirler: Emir[]) => ({ emirler }) satisfies EmirlerCevabi;
const ekran = [{ yol: '/uretim-emirleri', ekran: UretimEmirleri }, { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('UretimEmirleri liste', () => {
  it('emirleri gosterir; bitmemis emirde saglam adet "yok", bitmiste sayi', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI, BITMIS])) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('EM-1')).toBeTruthy();
    const satirlar = screen.getAllByRole('row');
    const planli = satirlar.find((s) => within(s).queryByText('EM-1'))!;
    const bitmis = satirlar.find((s) => within(s).queryByText('EM-3'))!;
    // 3039: sağlam ve emir adedi tek sütundadır.
    expect(planli.querySelector('td[data-baslik="Sağlam / adet"]')?.textContent).toBe('— / 10');
    expect(bitmis.querySelector('td[data-baslik="Sağlam / adet"]')?.textContent).toBe('8 / 10');
    expect(within(bitmis).getByText('Üretimi bitti')).toBeTruthy();
    expect(within(planli).getByText('DNM-001')).toBeTruthy();
  });

  it('liste yana kayan tablodur; Emir no sütunu solda sabit kalır', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI])) });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('EM-1');
    const tablo = screen.getByRole('table', { name: 'Üretim emirleri' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    const ilkBaslik = within(tablo).getAllByRole('columnheader')[0]!;
    expect(ilkBaslik.textContent).toBe('Emir no');
    expect(ilkBaslik.classList.contains('tc-tablo-sabit-sol')).toBe(true);
  });

  it('3039: durum çipleri sayılarıyla listeyi süzer; liste tek okumadır; "Şu an" çalışan ya da sıradaki adımı yazar', async () => {
    const CALISAN = { ...BASLAMIS, canli: { calisma: 'calisiyor', saglam: 2, hurda: 0, durusNedeni: null, durusBaslangic: null, isEmri: { id: 70, opNo: 20, ad: 'Frezeleme', makineId: null } } } satisfies Emir;
    const DURAN = { ...BASLAMIS, id: 5, emirNo: 'EM-5', canli: { calisma: 'durdu', saglam: 1, hurda: 0, durusNedeni: { id: 1, ad: 'Arıza' }, durusBaslangic: '2026-10-06T10:00:00+00:00', isEmri: { id: 71, opNo: 10, ad: 'Tornalama', makineId: null } } } satisfies Emir;
    const SIRADA = { ...PLANLI, acikAdimlar: [{ isEmriId: 72, opNo: 10, ad: 'Tornalama', istasyon: null, durum: 'bekliyor', calisma: null }] } as Emir;
    const istekler = sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([SIRADA, CALISAN, DURAN])) });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('EM-1');
    const cipler = screen.getByRole('group', { name: 'Duruma göre süz' });
    expect(within(cipler).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tümü 3', 'Taslak 0', 'Planlı 1', 'Üretimde 2', 'Duran 1']);
    const suAn = (no: string) => screen.getByText(no).closest('tr')!.querySelector('td[data-baslik="Şu an"]')?.textContent;
    expect(suAn('EM-1')).toBe('Sırada: OP 10 Tornalama');
    expect(suAn('EM-2')).toBe('OP 20 FrezelemeDeneme Tezgah 1');
    expect(suAn('EM-5')).toBe('OP 10 Tornalama · Durdu: ArızaDeneme Tezgah 1');
    fireEvent.click(within(cipler).getByRole('button', { name: 'Duran 1' }));
    expect(within(cipler).getByRole('button', { name: 'Duran 1' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('EM-5')).toBeTruthy();
    expect(screen.queryByText('EM-1')).toBeNull();
    expect(screen.queryByText('EM-2')).toBeNull();
    expect(istekler.filter((i) => i.yol.startsWith('/uretim-emirleri?')).map((i) => i.yol)).toEqual(['/uretim-emirleri?istasyonsuz=1']);
  });

  it('3039: "Kapanış bekliyor" sayısı kapanış kuyruğundandır ve Kapanış onaylarını açar; kuyruk okunamazsa çip yok', async () => {
    sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([PLANLI])),
      'GET /kapanislar': () => json(200, { satirlar: [], toplam: 4, sayfa: 1, sayfaBoyu: 50 }),
    });
    const Kapanis = () => <p>Kapanış sayfası</p>;
    ac([{ yol: '/uretim-emirleri/kapanis', ekran: Kapanis }, ...ekran], '/uretim-emirleri');
    fireEvent.click(await screen.findByRole('button', { name: 'Kapanış bekliyor 4' }));
    expect(await screen.findByText('Kapanış sayfası')).toBeTruthy();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI])), 'GET /kapanislar': () => json(403, { kod: 'YETKI', mesaj: 'Yetki yok.' }) });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('EM-1');
    expect(screen.queryByRole('button', { name: /Kapanış bekliyor/ })).toBeNull();
  });

  it('bos liste ve sunucu hatasi gosterilir', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([])) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('Açık emir yok')).toBeTruthy();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(503, { kod: 'MESGUL', mesaj: 'Sunucu meşgul.' }) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('Sunucu meşgul.')).toBeTruthy();
  });

  it('3039: "Yeni üretim emri" yalnız açabilene görünür ve pencereyi açar; ?yeni=1 pencereyi ürünle açar; ?ara= listeyi süzer', async () => {
    const pencere = (yeni: { urun: string | null } | null) => (yeni ? <p>Pencere açık: {yeni.urun ?? 'ürün yok'}</p> : null);
    sunucuKur(YAZAR, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI, BITMIS])) });
    ac(ekran, '/uretim-emirleri?ara=EM-3');
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(screen.queryByText('EM-1')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni üretim emri' })).toBeNull();
    cleanup();
    sunucuKur(YAZAR, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI])) });
    const Acan = () => <UretimEmirleri emirAcma={{ acabilir: true, ciz: pencere }} />;
    ac([{ yol: '/uretim-emirleri', ekran: Acan }], '/uretim-emirleri');
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni üretim emri' }));
    expect(screen.getByText('Pencere açık: ürün yok')).toBeTruthy();
    cleanup();
    sunucuKur(YAZAR, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI])) });
    ac([{ yol: '/uretim-emirleri', ekran: Acan }], '/uretim-emirleri?yeni=1&urun=11');
    expect(await screen.findByText('Pencere açık: 11')).toBeTruthy();
    cleanup();
    sunucuKur(YAZAR, { 'GET /uretim-emirleri': () => json(200, liste([PLANLI])) });
    const Acamayan = () => <UretimEmirleri emirAcma={{ acabilir: false, ciz: pencere }} />;
    ac([{ yol: '/uretim-emirleri', ekran: Acamayan }], '/uretim-emirleri?yeni=1');
    await screen.findByText('EM-1');
    expect(screen.queryByText(/Pencere açık/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni üretim emri' })).toBeNull();
  });
});

describe('UretimEmirleri bitenler (kart #1323)', () => {
  const sayfa = (satirlar: Emir[], no: number, toplam: number) => ({ satirlar, toplam, sayfa: no, sayfaBoyu: 1 }) satisfies BitenEmirlerCevabi;

  it('Bitenler sekmesi biten emirleri sunucudan sayfa sayfa ister; çipler yalnız kapalı durumları sayısıyla sunar (3039)', async () => {
    const IPTAL = { ...TEMEL, id: 4, emirNo: 'EM-4', durum: 'iptal', iptal: '2026-10-06T10:00:00+00:00' } satisfies Emir;
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([PLANLI])),
      'GET /uretim-emirleri/bitenler': () => {
        const yol = istekler.at(-1)?.yol ?? '';
        if (yol.includes('durum=iptal')) return json(200, sayfa([IPTAL], 1, 1));
        if (yol.includes('durum=bitti')) return json(200, sayfa([BITMIS], 1, 1));
        return json(200, yol.includes('sayfa=2') ? sayfa([IPTAL], 2, 2) : sayfa([BITMIS], 1, 2));
      },
    });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('EM-1');
    fireEvent.click(screen.getByRole('tab', { name: /Bitenler/ }));
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(screen.queryByText('EM-1')).toBeNull();
    const cipler = screen.getByRole('group', { name: 'Duruma göre süz' });
    await waitFor(() => { expect(within(cipler).getAllByRole('button').map((b) => b.textContent)).toEqual(['Tümü 2', 'Bitti 1', 'İptal 1']); });
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Sonraki/ }));
    expect(await screen.findByText('EM-4')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=2')).toBe(true);
    fireEvent.click(within(cipler).getByRole('button', { name: 'Bitti 1' }));
    await screen.findByText('EM-3');
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1&durum=bitti')).toBe(true);
  });

  it('?ara= açık emirlerde yoksa "Bitenlerde ara" aramayı sunucuya taşır', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([PLANLI])),
      'GET /uretim-emirleri/bitenler': () => json(200, sayfa([BITMIS], 1, 1)),
    });
    ac(ekran, '/uretim-emirleri?ara=EM-3');
    fireEvent.click(await screen.findByRole('button', { name: 'Bitenlerde ara' }));
    expect(await screen.findByText('EM-3')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/uretim-emirleri/bitenler?istasyonsuz=1&sayfa=1&ara=EM-3')).toBe(true);
  });
});

describe('EmirAyrintisi', () => {
  const ayrinti = (emir: Emir, kayitlar: EmirAyrintiCevabi['kayitlar'] = []) => json(200, { emir, kayitlar } satisfies EmirAyrintiCevabi);

  it('bitmis emirde fark, ham zamanlar ve kayit defteri gorunur', async () => {
    sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri/3': () => ayrinti(BITMIS, [
        { id: 1, emirId: 3, kisi: { id: 5, ad: 'Deneme Operator' }, istasyon: IST, olay: 'baslat', saglamAdet: null, zaman: '2026-10-06T09:00:00+00:00' },
        { id: 2, emirId: 3, kisi: { id: 5, ad: 'Deneme Operator' }, istasyon: IST, olay: 'bitir', saglamAdet: 8, zaman: '2026-10-06T11:00:00+00:00' },
      ]),
    });
    // 3039: kayıt defteri "Kayıtlar" sekmesindedir; bitmiş emir "Stok ve kapanış" ile açılır, fark özet kutusundadır.
    ac(ekran, '/uretim-emirleri/3');
    expect(await screen.findByText('Emir adedinden 2 eksik')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Kayıtlar' }));
    const kayit = within(screen.getByRole('table', { name: 'Kayıt defteri' }));
    const baslat = kayit.getByText('Başlatıldı').closest('tr')!;
    expect(baslat.querySelector('td[data-baslik="Adet"]')?.textContent).toBe('—Girilmemiş');
    const bitir = kayit.getByText('Bitirildi').closest('tr')!;
    expect(bitir.querySelector('td[data-baslik="Adet"]')?.textContent).toBe('8');
    expect(within(bitir).getByText('Deneme Operator')).toBeTruthy();
  });

  it('3039: planlı emirde yaşam şeridi "Planlı"da durur, açılış tarihi Taslak\'ta; fark yok; kayıt yoksa "Henüz kayıt yok"', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    ac(ekran, '/uretim-emirleri/1');
    const serit = await screen.findByRole('list', { name: 'Emrin yaşam döngüsü' });
    const asamalar = within(serit).getAllByRole('listitem');
    expect(asamalar.map((li) => li.getAttribute('data-hal'))).toEqual(['gecti', 'simdi', 'bekliyor', 'bekliyor', 'bekliyor', 'bekliyor']);
    expect(asamalar[1]?.getAttribute('aria-current')).toBe('step');
    expect(within(asamalar[0]!).getByText(new Date(PLANLI.acilma).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }))).toBeTruthy();
    expect(screen.queryByText(/Emir adedinden/)).toBeNull();
    expect(screen.getByText('Henüz kayıt yok')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Adımlar' }).getAttribute('aria-selected')).toBe('true');
  });

  it('3039: ayrıntıda iptal düğmesi yok; Reçete ve Rota bağlantısı "Bağlantılar" menüsünde, sayfa yetkisine bağlı', async () => {
    sunucuKur({ ...YAZAR, islemler: [...YAZAR.islemler, 'sayfa.recete-rota'] }, { 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    const Ev = () => <p>Ev: {useLocation().search}</p>;
    ac([...ekran, { yol: '/recete-rota', ekran: Ev }], '/uretim-emirleri/1');
    await screen.findByRole('heading', { name: 'EM-1' });
    expect(screen.queryByRole('button', { name: 'İptal et' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Emri başka ekranda aç' }));
    fireEvent.click(screen.getByRole('menuitem', { name: "Reçete ve Rota'da gör" }));
    expect(await screen.findByText(`Ev: ?kayit=${String(PLANLI.id)}`)).toBeTruthy();
    cleanup();
    sunucuKur(YAZAR, { 'GET /uretim-emirleri/1': () => ayrinti(PLANLI) });
    ac(ekran, '/uretim-emirleri/1');
    await screen.findByRole('heading', { name: 'EM-1' });
    expect(screen.queryByRole('button', { name: 'Emri başka ekranda aç' })).toBeNull();
  });

  it('bulunamayan emirde sunucu iletisi gosterilir', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/99': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Emir bulunamadı.' }) });
    ac(ekran, '/uretim-emirleri/99');
    expect(await screen.findByText('Emir bulunamadı.')).toBeTruthy();
  });
});

describe('malzeme resmi (kart #688)', () => {
  const KARTLI = { ...PLANLI, malzemeNo: 40 } satisfies Emir;
  const KARTSIZ = { ...BASLAMIS, malzemeNo: null } satisfies Emir;
  const resimler = (r: KucukResimlerCevabi['resimler']) => json(200, { resimler: r } satisfies KucukResimlerCevabi);

  it('liste kartli emirlerin resmini tek istekte alir; resim yoksa ya da cizim merkezi okunamazsa liste yine gorunur', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri': () => json(200, liste([KARTLI, KARTSIZ])),
      'GET /cizimler/kucuk-resimler': () => resimler([{ hedefId: 40, belgeId: 2, revizyonId: 6, harf: 'B', kareSayisi: 1, revUyumu: false }]),
    });
    ac(ekran, '/uretim-emirleri');
    const resim = await screen.findByRole('img', { name: 'Deneme mil' });
    expect(resim.getAttribute('src')).toBe('/api/cizimler/kucuk-resim/6/0');
    expect(screen.getByRole('img', { name: 'Revizyon uyuşmuyor' })).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith('/cizimler/')).map((i) => i.yol)).toEqual(['/cizimler/kucuk-resimler?hedefModul=malzemeler&idler=40']);
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, liste([KARTLI])) });
    ac(ekran, '/uretim-emirleri');
    expect(await screen.findByText('EM-1')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Deneme mil' })).toBeNull();
  });

  it('ayrinti kartli emirde malzeme resmini gosterir, kartsiz emirde satir yok ve istek atilmaz', async () => {
    sunucuKur(OKUYUCU, {
      'GET /uretim-emirleri/1': () => json(200, { emir: KARTLI, kayitlar: [] } satisfies EmirAyrintiCevabi),
      'GET /cizimler/kucuk-resimler': () => resimler([{ hedefId: 40, belgeId: 2, revizyonId: 6, harf: 'A', kareSayisi: 8, revUyumu: true }]),
    });
    ac(ekran, '/uretim-emirleri/1');
    // 3039: resim emrin kimlik satırındadır.
    expect((await screen.findByRole('img', { name: 'Deneme mil' })).getAttribute('src')).toBe('/api/cizimler/kucuk-resim/6/0');
    cleanup();
    const istekler = sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/2': () => json(200, { emir: KARTSIZ, kayitlar: [] } satisfies EmirAyrintiCevabi) });
    ac(ekran, '/uretim-emirleri/2');
    expect(await screen.findByRole('heading', { name: 'EM-2' })).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Deneme mil' })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/cizimler/'))).toBe(false);
  });
});
