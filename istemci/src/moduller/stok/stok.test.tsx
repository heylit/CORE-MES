import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type {
  AcikSiparisSatirlariCevabi, PartiIziCevabi, LotEtiketi, LotEtiketleriCevabi, SonPartilerCevabi, BakiyeSatiri, EmirTamamlamaCevabi, KonumAyrintiCevabi, MalKabulAyrintiCevabi, HareketlerCevabi, IsKutusuCevabi, KonumlarCevabi, MalKabullerCevabi, MalzemeAyrintiCevabi, MalzemelerCevabi, MalzemeOzetiCevabi, MalzemeStokSatiri, PanelCevabi, RafMatrisiCevabi, RaflarCevabi, ZeminCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, MUDUR, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';
import { ApiHatasi, ISTEK_KIMLIGI_BASLIGI } from '../../ortak/veri/api.ts';
import { korumaliPost } from './ortak.tsx';
import { lotEtiketHtml, lotEtiketSatirlari } from './LotEtiketi.tsx';

// Arama seçicide yazıp listeden seçer (konum seçici: liste etiketi "<etiket> için bulunanlar").
async function konumSec(kap: HTMLElement, etiket: string, yaz: string, secenek: string) {
  fireEvent.change(within(kap).getByRole('combobox', { name: new RegExp(etiket) }), { target: { value: yaz } });
  fireEvent.click(await within(await within(kap).findByRole('listbox', { name: `${etiket} için bulunanlar` })).findByRole('option', { name: new RegExp(secenek) }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BOS_KUTU = { kabuldeBekleyen: 0, eksiBakiye: 0, kritik: 0, sayimBekleyen: null, logoFarki: 0, logoHatasi: 0, fasondaEksik: 0, fasonEksikGonderimi: 0 } satisfies IsKutusuCevabi;
const bosListe = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
const BAKIYE = {
  id: 11, malzemeId: 901, malzemeAd: 'Deneme sac', konumId: 3, konumKod: 'A-01-02', partiId: 4, partiEtiketi: 'TP-1 · döküm D-7',
  miktar: '3.000', ilkGiris: '2026-10-01T08:00:00+03:00', ambalaj: null, statuId: null,
} satisfies BakiyeSatiri;
const SATIR: MalzemeStokSatiri = { malzemeId: 901, ad: 'Deneme sac', stokKodu: 'HM-001', tur: 'hammadde', birim: 'kg', toplam: '3', serbest: '3', rezerve: '0', kritikSeviye: null, durum: 'tanimsiz', konumSayisi: 4, konumlar: [{ kod: 'A-01-02', katNo: 2, miktar: '3' }] };
const PANEL = {
  malzemeCesidi: 8, gozDolu: 6, gozToplam: 28, kritik: 1, eksi: 1, kabulde: 2, toplamaBekleyen: 3,
  gunluk: [{ gun: '2026-10-06', giris: 2, cikis: 1 }, { gun: '2026-10-07', giris: 5, cikis: 3 }],
  kritikListe: [{ malzemeId: 5, ad: 'İş eldiveni', kod: 'SR-00002', toplam: '37', kritikSeviye: '50' }],
  raflar: [{ rafId: 1, kod: 'A', tur: 'palet', dolu: 4, toplam: 12 }], sonHareketler: [], stokDegeri: null, fiyatsizKart: 0, guncelDeger: null, guncelFiyatsizKart: 0, guncelAyri: { kalite: null, hurda: null, fason: null, yolda: null, diger: null, toplam: null }, degerGorunur: false,
} satisfies PanelCevabi;
const AYRINTI = {
  satir: SATIR, bakiyeler: [BAKIYE], ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [], statuKirilimi: [], rezerveler: [], bekleyenler: [],
} satisfies MalzemeAyrintiCevabi;

describe('İş kutusu', () => {
  it('bekleyen iş yoksa Her şey yolunda der; sayım süresi tanımsızsa sayı uydurmaz, söyler', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok');
    expect(await screen.findByText('Her şey yolunda')).toBeTruthy();
    expect(screen.getByText(/Sayım süresi tanımlı değil/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mal kabul/ })).toBeNull();
  });
  it('önizlemedeki gösterge kartlarını, kritik stoğu ve raf doluluğunu gösterir; stok değerini uydurmaz', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, { ...PANEL, degerGorunur: true } satisfies PanelCevabi) });
    ac('/stok');
    expect(await screen.findByText('Malzeme çeşidi')).toBeTruthy();
    expect(screen.getByText('%21')).toBeTruthy();
    expect(screen.getByText('Veri yok')).toBeTruthy();
    expect(screen.getByText('37 / 50')).toBeTruthy();
    expect(screen.getByText('Raf A')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Son yedi günün/ })).toBeTruthy();
  });
  it('stok değeri ortalama alış fiyatıyla TRY gösterilir; fiyatı olmayan kart sayısı söylenir', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, { ...PANEL, stokDegeri: '1234567.50', fiyatsizKart: 2, degerGorunur: true } satisfies PanelCevabi) });
    ac('/stok');
    expect(await screen.findByText('1.234.567,50 ₺')).toBeTruthy();
    expect(screen.getByText('Ortalama alış fiyatıyla · 2 kartın fiyatı yok')).toBeTruthy();
  });
  it('güncel stok değeri satın alma kg fiyatıyla ayrı gösterilir; fiyatı yoksa sıfır değil "—", fiyatsız kart sayısı söylenir', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, { ...PANEL, guncelDeger: '600', guncelFiyatsizKart: 3, degerGorunur: true } satisfies PanelCevabi) });
    ac('/stok');
    const kutu = (await screen.findByText('Güncel stok değeri')).closest('div')!;
    expect(within(kutu).getByText('600,00 ₺')).toBeTruthy();
    expect(within(kutu).getByText('Satın alma kg fiyatıyla · 3 kartın fiyatı yok')).toBeTruthy();
    expect(within(kutu).getByText('Yalnız kullanılabilir · Kalite bekleyen / red — · Hurda — · Fason — · Yolda — · Üretimde ve diğer — · Toplam —')).toBeTruthy();
    expect(screen.getByText('Stok değeri')).toBeTruthy();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, { ...PANEL, degerGorunur: true } satisfies PanelCevabi) });
    ac('/stok');
    expect(within((await screen.findByText('Güncel stok değeri')).closest('div')!).getByText('—')).toBeTruthy();
    cleanup();
    // 228 a: hurda, fason ve yoldaki değer güncel değerin dışında, kendi satırında.
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, { ...PANEL, guncelDeger: '600', guncelAyri: { kalite: '30', hurda: '150', fason: null, yolda: '20.5', diger: null, toplam: '800.5' }, degerGorunur: true } satisfies PanelCevabi) });
    ac('/stok');
    const ayri = (await screen.findByText('Güncel stok değeri')).closest('div')!;
    expect(within(ayri).getByText('Yalnız kullanılabilir · Kalite bekleyen / red 30,00 ₺ · Hurda 150,00 ₺ · Fason — · Yolda 20,50 ₺ · Üretimde ve diğer — · Toplam 800,50 ₺')).toBeTruthy();
  });
  it('stok değeri finans rakamıdır: değeri görmeyen (degerGorunur false) göstergeyi hiç görmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok');
    await screen.findByText('Malzeme çeşidi');
    expect(screen.queryByText('Stok değeri')).toBeNull();
    expect(screen.queryByText('Güncel stok değeri')).toBeNull();
  });
  it('sayı şeridi mal kabul ve toplama bekleyenleri kendi listelerine bağlar', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok');
    const kabul = (await screen.findByText('Mal kabul bekleyen')).closest('a')!;
    expect([kabul.textContent, kabul.getAttribute('href')]).toEqual(['2Mal kabul bekleyen', '/stok/malzemeler?durum=kabulde']);
    const toplama = screen.getByText('Toplama bekleyen').closest('a')!;
    expect([toplama.textContent, toplama.getAttribute('href')]).toEqual(['3Toplama bekleyen', '/stok/hazirlik']);
  });
  it('veri olan işleri satır olarak gösterir; mal kabul düğmesi yalnız giriş işlemiyle', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, { ...BOS_KUTU, eksiBakiye: 2, logoFarki: 1 } satisfies IsKutusuCevabi) });
    ac('/stok');
    expect(await screen.findByText('2 bakiye satırı eksiye düştü')).toBeTruthy();
    expect(screen.getByText(/Logo irsaliyesiyle fark var/)).toBeTruthy();
    expect(screen.getByText(/Sizi bekleyen 2 iş var/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Mal kabul/ })).toBeTruthy();
  });
  it('Akış A provası D1: teslim bekleyen malzeme isteği iş satırıdır ve Hazırlık\'a götürür', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, { ...BOS_KUTU, teslimBekleyenIstek: 2 } satisfies IsKutusuCevabi) });
    ac('/stok');
    const satir = (await screen.findByText('2 malzeme isteği teslim bekliyor')).closest('li, div')!;
    expect(satir).toBeTruthy();
    expect(screen.getByText(/Sizi bekleyen 1 iş var/)).toBeTruthy();
  });
  it('fason eksik gönderim satırı sayı varken görünür', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, { ...BOS_KUTU, fasonEksikGonderimi: 2 } satisfies IsKutusuCevabi) });
    ac('/stok');
    expect(await screen.findByText('2 fason gönderiminde parça eksik gitti')).toBeTruthy();
    expect(screen.getByText('İstasyonda yeterli parça yoktu; olan kadar gönderildi.')).toBeTruthy();
  });
  it('fason eksik gönderim sıfırken satır yok', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU) });
    ac('/stok');
    expect(await screen.findByText(/Her şey yolunda/)).toBeTruthy();
    expect(screen.queryByText(/fason gönderiminde parça eksik gitti/)).toBeNull();
  });
  it('kritik satırı serbest stoğa göre konuşur', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/is-kutusu': () => json(200, { ...BOS_KUTU, kritik: 4 } satisfies IsKutusuCevabi) });
    ac('/stok');
    expect(await screen.findByText('4 malzeme kritik seviyede')).toBeTruthy();
    expect(screen.getByText('Serbest stok tanımlı kritik seviyeye indi.')).toBeTruthy();
    expect(screen.queryByText(/Toplam stok/)).toBeNull();
  });
});

describe('Malzemeler', () => {
  it('malzeme başına stoğu ve durumu gösterir; sekme süzgeci sorguya yazılır', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, { satirlar: [SATIR], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies MalzemelerCevabi), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    expect(await screen.findByText('Deneme sac')).toBeTruthy();
    expect(screen.getByText('A-01-02')).toBeTruthy();
    expect(screen.getByText('3 kg')).toBeTruthy();
    expect(screen.getByText('+3')).toBeTruthy();
    fireEvent.click(await screen.findByRole('tab', { name: 'Eksi bakiye 1' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('durum=eksi'))).toBe(true));
  });
  it('satırın yanında taşı, çıkış, sepete ve QR: ayrıntıya girmeden; tek gözde form doğrudan açılır, satır seçilmez', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, { satirlar: [SATIR], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies MalzemelerCevabi), 'GET /stok/panel': () => json(200, PANEL),
      'GET /stok/malzemeler/901': () => json(200, AYRINTI), 'GET /stok/konumlar': () => json(200, bosListe),
      'POST /stok/cikis': () => json(200, { hareketIdler: [99], onayliEksi: false }),
    });
    ac('/stok/malzemeler');
    fireEvent.click(await screen.findByRole('button', { name: 'Çıkış: Deneme sac' }));
    expect(await screen.findByText('Çıkış: A-01-02')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Taşı: Deneme sac' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sepete ekle: Deneme sac' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'QR etiketi: Deneme sac' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stoktan düş' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ malzemeId: 901, konumId: 3, miktar: '2' }));
    expect(istekler.some((i) => i.yol === '/stok/malzemeler/901' && i.yontem === 'GET')).toBe(true);
  });
  it('Bütün kartlar sekmesi stoğu olmayan kartları ister (kapsam=kartlar); durum süzgeci kalkar', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, { satirlar: [{ ...SATIR, toplam: '0', serbest: '0', konumSayisi: 0, konumlar: [] }], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies MalzemelerCevabi), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler?durum=kritik');
    fireEvent.click(await screen.findByRole('tab', { name: 'Bütün kartlar' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('kapsam=kartlar') && !i.yol.includes('durum='))).toBe(true));
    expect(await screen.findByText(/stoklanır malzeme kartı; stoğu olmayanlar 0 görünür/)).toBeTruthy();
  });
  it('statülü stokta emirlere ayrılan (rezerve) statüdekinin yanında yazılır', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, { satirlar: [{ ...SATIR, toplam: '5', serbest: '3', rezerve: '1.5' }], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies MalzemelerCevabi), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    expect(await screen.findByText(/statüde 2 kg · rezerve 1,5 kg · toplam 5 kg/)).toBeTruthy();
  });
  it('çok gözde önce göz sorulur; stoğu olmayan satırda yalnız QR, okuyucuya taşı ve çıkış yok', async () => {
    const ikinci = { ...BAKIYE, id: 12, konumId: 8, konumKod: 'B-02-01', miktar: '5.000' };
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, { satirlar: [SATIR, { ...SATIR, malzemeId: 902, ad: 'Bos kart', toplam: '0', serbest: '0' }], toplam: 2, sayfa: 1, sayfaBoyu: 50 } satisfies MalzemelerCevabi),
      'GET /stok/panel': () => json(200, PANEL), 'GET /stok/konumlar': () => json(200, bosListe),
      'GET /stok/malzemeler/901': () => json(200, { ...AYRINTI, bakiyeler: [BAKIYE, ikinci] } satisfies MalzemeAyrintiCevabi),
    });
    ac('/stok/malzemeler');
    fireEvent.click(await screen.findByRole('button', { name: 'Taşı: Deneme sac' }));
    fireEvent.click(await screen.findByRole('button', { name: /B-02-01/ }));
    expect(await screen.findByText('Taşı: B-02-01')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Taşı: Bos kart' })).toBeNull();
    expect(screen.getByRole('button', { name: 'QR etiketi: Bos kart' })).toBeTruthy();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, { satirlar: [SATIR], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies MalzemelerCevabi), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    expect(await screen.findByRole('button', { name: 'QR etiketi: Deneme sac' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Çıkış: Deneme sac' })).toBeNull();
  });
});

describe('Üretim emri seçimi', () => {
  it('üretimden girişte emir kimliği yazılmaz, açık emirlerden seçilir; kapalı emir listede yok', async () => {
    const emir = (id: number, durum: string) => ({ id, emirNo: `UE-${id}`, parcaNo: 'P-1', parcaAd: 'Mil', adet: 10, istasyon: { id: 1, ad: 'T1' }, durum, acan: { id: 1, ad: 'A' }, acilma: '2026-10-01T08:00:00+03:00', baslama: null, bitis: null, iptal: null, saglamAdet: null });
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/malzemeler/901': () => json(200, { ...AYRINTI, satir: { ...SATIR, tur: 'mamul' } } satisfies MalzemeAyrintiCevabi),
      'GET /uretim-emirleri': () => json(200, { emirler: [emir(41, 'basladi'), emir(42, 'bitti')] }),
      'POST /stok/uretim-girisi': () => json(200, { hareketIdler: [5], onayliEksi: false }),
    });
    ac('/stok/malzemeler/901');
    fireEvent.click(await screen.findByRole('button', { name: 'Üretimden giriş' }));
    const secim = await screen.findByLabelText(/^Üretim emri/);
    await waitFor(() => expect(within(secim).getByRole('option', { name: /UE-41/ })).toBeTruthy());
    expect(within(secim).queryByRole('option', { name: /UE-42/ })).toBeNull();
    expect((screen.getByRole('button', { name: 'Girişi yaz' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(secim, { target: { value: '41' } });
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Girişi yaz' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ malzemeId: 901, uretimEmriId: 41, miktar: '4' }));
  });
});

describe('Partiler ve sertifikalar', () => {
  it('malzeme ayrıntısı son partileri ve bağlı sertifikayı stok ucundan açılan bağlantıyla gösterir (#1013)', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, AYRINTI),
      'GET /stok/malzemeler/901/son-partiler': () => json(200, { partiler: [
        { partiId: 12, lotNo: 'LT-000012', tedarikciPartiNo: 'TP-1', dokumNo: 'D-77', sertifikaNo: 'S-1', kayitZamani: '2026-10-13T09:00:00+03:00', belgeler: [{ id: 70, ad: 'Sertifika S-1 (HM-001)', tur: 'sertifika', harf: 'A' }] },
      ] } satisfies SonPartilerCevabi),
    });
    ac('/stok/malzemeler/901');
    const baglanti = await screen.findByRole('link', { name: /Sertifika S-1 \(HM-001\) \(A\)/ });
    expect(baglanti.getAttribute('href')).toBe('/api/stok/partiler/12/belgeler/70');
    expect(screen.getByText('D-77')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'LT-000012' }).getAttribute('href')).toBe('/stok/hareketler?partiId=12');
  });
  it('partinin izi emirleri ve o emirlerin sevklerini müşteriyle gösterir; sevk yoksa uydurmaz (bulgu 40)', async () => {
    const iz = (sevkler: PartiIziCevabi['sevkler']) => () => json(200, {
      parti: { id: 12, malzemeId: 901, lotNo: 'LT-000012' }, hareketler: [], emirler: [41], sevkler,
    } as unknown as PartiIziCevabi);
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, AYRINTI),
      'GET /stok/malzemeler/901/son-partiler': () => json(200, { partiler: [
        { partiId: 12, lotNo: 'LT-000012', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, kayitZamani: '2026-10-13T09:00:00+03:00', belgeler: [] },
      ] } satisfies SonPartilerCevabi),
      'GET /stok/partiler/12/iz': iz([{ emirId: 41, isId: 7, gun: '2026-10-15', durum: 'tamamlandi', adet: '10', firmaId: 3, firmaAdi: 'Deneme Müşteri' }]),
    });
    ac('/stok/malzemeler/901');
    fireEvent.click(await screen.findByRole('button', { name: 'İz' }));
    const pencere = await screen.findByRole('dialog', { name: 'LT-000012 izi' });
    const satir = (await within(pencere).findByText('Deneme Müşteri')).closest('tr')!;
    expect(within(satir).getByText('Teslim edildi')).toBeTruthy();
    expect(within(satir).getByText('10')).toBeTruthy();
    expect(within(satir).getByText('#7')).toBeTruthy();
    const emirBaglari = within(pencere).getAllByRole('link', { name: '#41' });
    expect(emirBaglari).toHaveLength(2);
    for (const bag of emirBaglari) expect(bag.getAttribute('href')).toBe('/uretim-emirleri/41');
  });
  it('partinin emirleri sevk edilmediyse iz penceresi bunu söyler', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, AYRINTI),
      'GET /stok/malzemeler/901/son-partiler': () => json(200, { partiler: [
        { partiId: 12, lotNo: 'LT-000012', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, kayitZamani: '2026-10-13T09:00:00+03:00', belgeler: [] },
      ] } satisfies SonPartilerCevabi),
      'GET /stok/partiler/12/iz': () => json(200, { parti: { id: 12 }, hareketler: [], emirler: [], sevkler: [] } as unknown as PartiIziCevabi),
    });
    ac('/stok/malzemeler/901');
    fireEvent.click(await screen.findByRole('button', { name: 'İz' }));
    const pencere = await screen.findByRole('dialog', { name: 'LT-000012 izi' });
    expect(await within(pencere).findByText('Bu partinin emirleri için sevk yok.')).toBeTruthy();
    expect(within(pencere).getByText('Bu parti bir üretim emrine bağlı değil.')).toBeTruthy();
  });
  it('134 a: red ve karar bekleyen bakiye rozetle görünür, taşı ve çıkış yalnız serbest satırda', async () => {
    const red = { ...BAKIYE, id: 13, konumId: 9, konumKod: 'C-01-01', kaliteDurumu: 'red' as const };
    const bekleyen = { ...BAKIYE, id: 14, konumId: 10, konumKod: 'C-01-02', kaliteDurumu: 'karar_bekliyor' as const };
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, { ...AYRINTI, bakiyeler: [BAKIYE, red, bekleyen] } satisfies MalzemeAyrintiCevabi),
      'GET /stok/malzemeler/901/son-partiler': () => json(200, { partiler: [] } satisfies SonPartilerCevabi),
    });
    ac('/stok/malzemeler/901');
    expect(await screen.findByText('Red')).toBeTruthy();
    expect(screen.getByText('Karar bekliyor')).toBeTruthy();
    const satir = (kod: string) => screen.getByRole('link', { name: kod }).closest('tr')!;
    expect(within(satir(BAKIYE.konumKod)).getByRole('button', { name: 'Taşı' })).toBeTruthy();
    expect(within(satir('C-01-01')).queryByRole('button', { name: 'Taşı' })).toBeNull();
    expect(within(satir('C-01-02')).queryByRole('button', { name: 'Çıkış' })).toBeNull();
  });
});

describe('Çıkış ve onaylı eksi', () => {
  it('yetersiz stokta onay ister, mevcut miktarı gösterir; onayla eksiOnay ile yeniden gönderir', async () => {
    let n = 0;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, AYRINTI),
      'POST /stok/cikis': () => (n++ === 0
        ? json(409, { kod: 'ONAY_GEREKLI', mesaj: 'Yetersiz stok. Mevcut: 3.000.', ayrinti: { mevcut: '3.000' } })
        : json(200, { hareketIdler: [99], onayliEksi: true })),
    });
    ac('/stok/malzemeler/901');
    fireEvent.click(await screen.findByRole('button', { name: 'Çıkış' }));
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Neden/), { target: { value: 'sevk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stoktan düş' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yetersiz stok' });
    expect(within(pencere).getByText('3')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yine de yaz' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/cikis')).toHaveLength(2));
    const son = istekler.filter((i) => i.yol === '/stok/cikis')[1]!.govde as { eksiOnay?: boolean; miktar: string; partiId: number };
    expect(son.eksiOnay).toBe(true);
    expect(son.miktar).toBe('5');
    expect(son.partiId).toBe(4);
  });
  it('virgülsüz ve noktadan sonra üç rakamlı miktar sunucuya gitmez, uyarıyla durur (soru 71)', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, AYRINTI),
      'POST /stok/cikis': () => json(200, { hareketIdler: [99], onayliEksi: false }),
    });
    ac('/stok/malzemeler/901');
    fireEvent.click(await screen.findByRole('button', { name: 'Çıkış' }));
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '1.250' } });
    fireEvent.change(screen.getByLabelText(/Neden/), { target: { value: 'sevk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stoktan düş' }));
    expect(await screen.findByText(/binlik mi ondalık mı belli değil/)).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/stok/cikis')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '1,250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stoktan düş' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/cikis')).toHaveLength(1));
    expect((istekler.find((i) => i.yol === '/stok/cikis')!.govde as { miktar: string }).miktar).toBe('1.250');
  });
  it('DEP-59: stok ayarında varsayılan konum seçilir ve gövdeye yazılır', async () => {
    const konumlar = { satirlar: [{ id: 5, kod: 'D-Z1', ad: null }], toplam: 1, sayfa: 1, sayfaBoyu: 200 } as unknown as KonumlarCevabi;
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/malzemeler/901': () => json(200, AYRINTI),
      'GET /stok/konumlar': () => json(200, konumlar),
      'POST /stok/malzemeler/901/ayar-duzenle': () => json(200, AYRINTI),
    });
    ac('/stok/malzemeler/901');
    fireEvent.click(await screen.findByRole('button', { name: 'Stok ayarı' }));
    const secim = await screen.findByLabelText(/Varsayılan konum/);
    await screen.findByRole('option', { name: 'D-Z1' });
    fireEvent.change(secim, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/malzemeler/901/ayar-duzenle')).toBe(true));
    expect((istekler.find((i) => i.yol === '/stok/malzemeler/901/ayar-duzenle')!.govde as { varsayilanKonumId: number | null }).varsayilanKonumId).toBe(5);
  });
  it('okuyucu bakiye satırında taşı ve çıkış düğmesi görmez', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzemeler/901': () => json(200, AYRINTI) });
    ac('/stok/malzemeler/901');
    expect(await screen.findByText('A-01-02')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Çıkış' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Taşı' })).toBeNull();
  });
  it('statülü stokta Serbest ve statü kırılımı görünür; statü hangi ürün için olduğunu konumla birlikte söyler; statülü satırda işlem düğmesi yok (STK-S3)', async () => {
    const statulu = { ...BAKIYE, id: 13, konumId: 9, konumKod: 'C-01-01', miktar: '2.000', statuId: 7 };
    sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'stok.statu-degistir'] }, {
      'GET /stok/malzemeler/901': () => json(200, { ...AYRINTI, bakiyeler: [BAKIYE, statulu], statuKirilimi: [
        { statuId: null, miktar: '3.000', ilkGiris: BAKIYE.ilkGiris }, { statuId: 7, miktar: '2.000', ilkGiris: '2026-10-05T08:00:00+03:00' },
      ], rezerveler: [{ statuId: 7, uretimEmriId: 41, emirNo: 'UE-0041', miktar: '1.500' }] } satisfies MalzemeAyrintiCevabi),
      'GET /stok/statuler': () => json(200, { statuler: [{ id: 7, malzemeNo: 'YM-900', ad: 'OP 10 Tornalama', kaynakAdim: '12-o10', urunKodu: 'MM-950', revizyon: 'B', renk: 'x', tur: 'YM', zaman: '2026-10-05T08:00:00+03:00' }] }),
    });
    ac('/stok/malzemeler/901');
    const kirilim = await screen.findByRole('table', { name: 'Statü kırılımı' });
    expect(within(kirilim).getByText('Serbest')).toBeTruthy();
    expect(await within(kirilim).findByText('YM-900 (MM-950 · Rev B · OP 10 Tornalama)')).toBeTruthy();
    const bakiye = screen.getByRole('table', { name: 'Bakiye satırları' });
    const satir = within(bakiye).getByText('C-01-01').closest('tr')!;
    expect(within(satir).getByText('YM-900 (MM-950 · Rev B · OP 10 Tornalama)')).toBeTruthy();
    expect(within(bakiye).getAllByRole('button', { name: 'Çıkış' })).toHaveLength(1);
    expect(within(bakiye).getAllByRole('button', { name: 'Taşı' })).toHaveLength(1);
    // Statüye geçen malzeme emre ayrılır: kırılımda rezerve toplamı, Rezerve kartında emir no ile; müdür kaldırabilir ve ayırabilir.
    const rezerve = screen.getByRole('table', { name: 'Rezerve' });
    expect(within(rezerve).getByText('UE-0041')).toBeTruthy();
    expect(within(rezerve).getByRole('button', { name: 'Rezerveyi kaldır' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Rezerve et' })).toBeTruthy();
  });
  it('statüsü yoksa kırılım kartı ve statü sütunu çıkmaz', async () => {
    sunucuKur(MUDUR, { 'GET /stok/malzemeler/901': () => json(200, { ...AYRINTI, statuKirilimi: [{ statuId: null, miktar: '3.000', ilkGiris: BAKIYE.ilkGiris }] } satisfies MalzemeAyrintiCevabi) });
    ac('/stok/malzemeler/901');
    expect(await screen.findByText('A-01-02')).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Statü kırılımı' })).toBeNull();
  });
});

describe('Mal kabul', () => {
  it('hammadde satırında parti alanlarını gösterir ve gövdeye partiyi yazar', async () => {
    const ozet = { ozet: { id: 901, tur: 'hammadde', kod: 'HM-001', ad: 'Deneme sac', onayDurumu: 'aktif', kullanilabilir: true, birim: 'kg' } } satisfies MalzemeOzetiCevabi;
    const ayrinti = { ...AYRINTI, ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null } };
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/malzemeler/901/ozet': () => json(200, ozet),
      'GET /stok/malzemeler/901': () => json(200, ayrinti),
      'GET /stok/malzemeler/901/goz-onerisi': () => json(200, { oneri: { konumId: 3, kod: 'A-02-01' } }),
      'POST /stok/mal-kabul': () => json(200, { belge: { id: 1, no: 'MK-000001', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-07T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [1] }),
    });
    ac('/stok/mal-kabul');
    fireEvent.change(await screen.findByLabelText('Malzeme'), { target: { value: '901' } });
    expect(await screen.findByText(/Deneme sac · Hammadde · HM-001 · kg/)).toBeTruthy();
    expect(await screen.findByLabelText(/Sayılan miktar \(toplam, kg\)/)).toBeTruthy();
    expect(await screen.findByText('A-02-01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Plastik kasa/ }));
    fireEvent.change(screen.getByLabelText('Ambalaj sayısı'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Ambalaj başına miktar'), { target: { value: '2,5' } });
    expect((screen.getByLabelText(/Sayılan miktar/) as HTMLInputElement).value).toBe('12,5');
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }));
    fireEvent.change(screen.getByLabelText('Döküm no'), { target: { value: 'D-7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const g = istekler.find((i) => i.yontem === 'POST')!.govde as { satirlar: { malzemeId: number; miktar: string; parti: { dokumNo: string } | null }[] };
    expect(g.satirlar[0]).toMatchObject({ malzemeId: 901, miktar: '12.5', konumId: 3, parti: { dokumNo: 'D-7' }, ambalaj: { tur: 'kasa', olcu: 'hop', adet: 5 } });
  });
  it('kart adıyla yazılınca katalogda eşleşen kartları listeler; seçilen kartın numarası gövdeye, adı alana yazılır', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/ara': () => json(200, { sonuclar: [{ tur: 'malzeme', malzemeId: 901, ad: 'Deneme sac', kod: 'HM-001', toplam: '3' }] }),
      'GET /stok/malzemeler/901/ozet': () => json(200, { ozet: { id: 901, tur: 'hammadde', kod: 'HM-001', ad: 'Deneme sac', onayDurumu: 'aktif', kullanilabilir: true, birim: null } } satisfies MalzemeOzetiCevabi),
    });
    ac('/stok/mal-kabul');
    const alan = await screen.findByLabelText('Malzeme') as HTMLInputElement;
    expect(alan.getAttribute('role')).toBe('combobox');
    fireEvent.change(alan, { target: { value: 'sac' } });
    fireEvent.click(await within(await screen.findByRole('listbox', { name: 'Malzeme için bulunanlar' })).findByRole('option', { name: /Deneme sac/ }));
    expect(await screen.findByText('Deneme sac · Hammadde · HM-001')).toBeTruthy();
    await waitFor(() => expect(alan.value).toBe('Deneme sac · HM-001'));
    expect(screen.queryByRole('listbox', { name: 'Malzeme için bulunanlar' })).toBeNull();
    expect(istekler.some((i) => i.yol.includes('/stok/ara?q=sac'))).toBe(true);
  });
  it('malzeme listesi okla gezilir, Enter formu göndermeden vurgulu kartı seçer; Escape listeyi kapatır', async () => {
    const kart = (malzemeId: number, ad: string) => ({ tur: 'malzeme', malzemeId, ad, kod: `HM-${malzemeId}`, toplam: '0' });
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] } satisfies AcikSiparisSatirlariCevabi),
      'GET /stok/ara': () => json(200, { sonuclar: [kart(901, 'Deneme sac'), { tur: 'konum', konumId: 9, kod: 'A-03-02', ad: null, satirSayisi: 2 }, kart(902, 'Deneme sac kalın')] }),
      'GET /stok/malzemeler/902/ozet': () => json(200, { ozet: { id: 902, tur: 'hammadde', kod: 'HM-902', ad: 'Deneme sac kalın', onayDurumu: 'aktif', kullanilabilir: true, birim: null } } satisfies MalzemeOzetiCevabi),
    });
    ac('/stok/mal-kabul');
    const alan = await screen.findByLabelText('Malzeme') as HTMLInputElement;
    fireEvent.change(alan, { target: { value: 'sac' } });
    const liste = () => screen.queryByRole('listbox', { name: 'Malzeme için bulunanlar' });
    await waitFor(() => expect(liste()).not.toBeNull());
    expect(within(liste()!).getAllByRole('option').map((x) => x.textContent)).toEqual(['Deneme sacHM-901 · #901Stok 0', 'Deneme sac kalınHM-902 · #902Stok 0']);
    fireEvent.keyDown(alan, { key: 'Escape' });
    await waitFor(() => expect(liste()).toBeNull());
    fireEvent.change(alan, { target: { value: 'sac ' } });
    await waitFor(() => expect(liste()).not.toBeNull());
    fireEvent.keyDown(alan, { key: 'ArrowDown' });
    expect(within(liste()!).getByRole('option', { selected: true }).textContent).toContain('Deneme sac kalın');
    fireEvent.keyDown(alan, { key: 'Enter' });
    expect(await screen.findByText(/Deneme sac kalın · Hammadde · HM-902/)).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });
  it('satın alma kabulünde açık sipariş satırı seçilince malzeme, kalan miktar ve bağ dolar; bağ gövdeye yazılır, kaldırılabilir', async () => {
    const ozet = { ozet: { id: 902, tur: 'sarf', kod: 'SR-002', ad: 'Deneme eldiven', onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } } satisfies MalzemeOzetiCevabi;
    const acik = { satirlar: [{ id: 41, siparisNo: 'SA-A', talepNo: 'ST-2026-001', tedarikciAdi: 'Deneme Tedarik', malzemeId: 902, malzemeTur: null, kalemAdi: 'Eldiven', miktar: '20', kalanMiktar: '12', birim: 'adet', beklenenTeslim: null }] } satisfies AcikSiparisSatirlariCevabi;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, acik),
      'GET /stok/malzemeler/902/ozet': () => json(200, ozet),
      'GET /stok/malzemeler/902': () => json(200, { ...AYRINTI, ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null } }),
      'GET /stok/malzemeler/902/goz-onerisi': () => json(200, { oneri: null }),
      'POST /stok/mal-kabul': () => json(200, { belge: { id: 2, no: 'MK-000002', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-09T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [2] }),
    });
    ac('/stok/mal-kabul');
    expect(await screen.findByText('20 adet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Seç' }));
    expect(await screen.findByText('SA-A · Deneme Tedarik · Eldiven')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Malzeme') as HTMLInputElement).value).toBe('Deneme eldiven · SR-002'));
    expect(screen.getByText('12 adet')).toBeTruthy();
    expect((screen.getByLabelText(/Sayılan miktar/) as HTMLInputElement).value).toBe('12');
    fireEvent.change(screen.getByLabelText(/Sayılan miktar/), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect((istekler.find((i) => i.yontem === 'POST')!.govde as { satirlar: unknown[] }).satirlar[0]).toMatchObject({ malzemeId: 902, miktar: '22', siparisSatirId: 41 });
    fireEvent.click(screen.getByRole('button', { name: 'Seç' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bağı kaldır' }));
    await waitFor(() => expect(screen.queryByText('SA-A · Deneme Tedarik · Eldiven')).toBeNull());
  });
  it('emirden açılınca eksik malzemeler satıra dolar (hizmet ve eksiği olmayan dolmaz); kabul olağan mal kabul gövdesiyle gider', async () => {
    const ozet = (id: number, ad: string) => ({ ozet: { id, tur: 'sarf', kod: `SR-${id}`, ad, onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } } satisfies MalzemeOzetiCevabi);
    const b = (malzemeId: number, eksik: string, hizmet = false) => ({ malzemeId, malzemeAd: null, hizmet, brut: '5', verilen: '0', kalan: '5', mevcut: '0', eksik });
    const tamamlama = {
      emir: { id: 12, emirNo: 'UE-2026-0012', durum: 'bitti', adet: 5, malzemeId: 950, malzemeAd: 'Deneme mil' },
      cikti: { girilen: '0', kalan: '5' }, bilesenler: [b(911, '2.5'), b(912, '0'), b(913, '1', true)], engel: 'Eksik malzeme var; önce eksikleri teslim alın.',
    } satisfies EmirTamamlamaCevabi;
    let okuma = 0;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] } satisfies AcikSiparisSatirlariCevabi),
      // Kayıttan sonraki okuma değişmiş eksik döner (kısmi teslim): satırlar yine de yeniden dolmamalı.
      'GET /stok/uretim-emirleri/12/tamamlama': () => json(200, (okuma += 1) === 1 ? tamamlama : { ...tamamlama, bilesenler: [b(911, '1')] }),
      'GET /stok/malzemeler/911/ozet': () => json(200, ozet(911, 'Deneme kesme yağı')),
      'GET /stok/malzemeler/911': () => json(200, { ...AYRINTI, ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null } }),
      'GET /stok/malzemeler/911/goz-onerisi': () => json(200, { oneri: null }),
      'POST /stok/mal-kabul': () => json(200, { belge: { id: 4, no: 'MK-000004', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-10T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [4] }),
    });
    ac('/stok/mal-kabul?emir=12');
    expect(await screen.findByText('1 eksik')).toBeTruthy();
    expect(screen.getByText('UE-2026-0012')).toBeTruthy();
    await waitFor(() => expect((screen.getAllByLabelText('Malzeme') as HTMLInputElement[]).map((k) => k.value)).toEqual(['Deneme kesme yağı · SR-911']));
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect((istekler.find((i) => i.yontem === 'POST')!.govde as { satirlar: unknown[] }).satirlar).toEqual([expect.objectContaining({ malzemeId: 911, miktar: '2.5' })]);
    // Kayıttan sonra önizleme yeniden okunur; eksikler ikinci kez dolmaz, form boş kalır.
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/uretim-emirleri/12/tamamlama').length).toBeGreaterThan(1));
    await waitFor(() => expect((screen.getAllByLabelText('Malzeme') as HTMLInputElement[]).map((k) => k.value)).toEqual(['']));
  });
  it('emir parametresi geçersizse önizleme istenmez; önizleme hata verirse görünür', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] } satisfies AcikSiparisSatirlariCevabi),
      'GET /stok/uretim-emirleri/7/tamamlama': () => json(404, { kod: 'BULUNAMADI', mesaj: 'Üretim emri bulunamadı.' }),
    });
    ac('/stok/mal-kabul?emir=abc');
    await screen.findByRole('button', { name: 'Teslim al' });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/acik-siparis-satirlari')).toBe(true));
    expect(istekler.some((i) => i.yol.includes('/tamamlama'))).toBe(false);
    cleanup();
    ac('/stok/mal-kabul?emir=7');
    expect(await screen.findByText('Üretim emri bulunamadı.')).toBeTruthy();
  });
  it('hizmet siparişi seçilince fason dönüşü sorulur: dönen ve giden kart, fason kutusu gövdeye yazılır; malzeme dönmediyse yalnız hizmet teslimi gider', async () => {
    const ozet = (id: number, tur: 'yarimamul' | 'hizmet', ad: string) => ({ ozet: { id, tur, kod: `K-${id}`, ad, onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } } satisfies MalzemeOzetiCevabi);
    const acik = { satirlar: [{ id: 51, siparisNo: 'SA-F', talepNo: 'ST-2026-009', tedarikciAdi: 'Deneme Kaplama', malzemeId: 903, malzemeTur: 'hizmet', kalemAdi: 'Kaplama', miktar: '20', kalanMiktar: '20', birim: 'adet', beklenenTeslim: null }] } satisfies AcikSiparisSatirlariCevabi;
    const fasonKutusu = { id: 77, kod: 'FSN-01', tur: 'fason', ad: 'Deneme fasoncu', depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 1, haritaGozId: null, haritaAlanId: null, surum: 1 } as const;
    const belge = { belge: { id: 3, no: 'MK-000003', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-09T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [] };
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, { satirlar: [fasonKutusu], toplam: 1, sayfa: 1, sayfaBoyu: 200 } satisfies KonumlarCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, acik),
      'GET /stok/malzemeler/903/ozet': () => json(200, ozet(903, 'hizmet', 'Deneme kaplama hizmeti')),
      'GET /stok/malzemeler/904/ozet': () => json(200, ozet(904, 'yarimamul', 'Deneme mil kaplamalı')),
      'GET /stok/malzemeler/905/ozet': () => json(200, ozet(905, 'yarimamul', 'Deneme mil ham')),
      'GET /stok/malzemeler/904': () => json(200, AYRINTI),
      'GET /stok/malzemeler/904/goz-onerisi': () => json(200, { oneri: null }),
      'POST /stok/mal-kabul': () => json(200, belge),
    });
    ac('/stok/mal-kabul');
    fireEvent.click(await screen.findByRole('button', { name: 'Seç' }));
    expect(await screen.findByRole('button', { name: 'Fasondan malzeme döndü', pressed: true })).toBeTruthy();
    expect((screen.getByLabelText('Dönen malzeme') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText('Dönen malzeme'), { target: { value: '904' } });
    fireEvent.change(screen.getByLabelText('Giden malzeme'), { target: { value: '905' } });
    await screen.findAllByRole('option', { name: /FSN-01/ });
    fireEvent.change(screen.getByLabelText('Fason kutusu'), { target: { value: '77' } });
    fireEvent.change(screen.getByLabelText('Giden miktar'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText(/Sayılan miktar/), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    const postlar = () => istekler.filter((i) => i.yontem === 'POST').map((i) => (i.govde as { satirlar: unknown[] }).satirlar[0]);
    await waitFor(() => expect(postlar()).toHaveLength(1));
    expect(postlar()[0]).toMatchObject({ malzemeId: 904, miktar: '18', siparisSatirId: 51, fason: { malzemeId: 905, konumId: 77, miktar: '20' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Seç' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Malzeme dönmedi (yalnız hizmet)' }));
    expect(screen.queryByLabelText('Fason kutusu')).toBeNull();
    expect(screen.queryByLabelText(/Konum/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Teslim alınan miktar/), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(postlar()).toHaveLength(2));
    expect(postlar()[1]).toEqual({ malzemeId: 903, miktar: '20', siparisSatirId: 51 });
  });
  it('fason kutusunda giden kartın birden çok partisi varsa giden parti sorulur ve gövdeye yazılır; tek partide sorulmaz', async () => {
    const ozet = (id: number, tur: 'yarimamul' | 'hizmet', ad: string) => ({ ozet: { id, tur, kod: `K-${id}`, ad, onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } } satisfies MalzemeOzetiCevabi);
    const acik = { satirlar: [{ id: 51, siparisNo: 'SA-F', talepNo: 'ST-2026-009', tedarikciAdi: 'Deneme Kaplama', malzemeId: 903, malzemeTur: 'hizmet', kalemAdi: 'Kaplama', miktar: '20', kalanMiktar: '20', birim: 'adet', beklenenTeslim: null }] } satisfies AcikSiparisSatirlariCevabi;
    const konum = { id: 77, kod: 'FSN-01', tur: 'fason', ad: 'Deneme fasoncu', depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 3, haritaGozId: null, haritaAlanId: null, surum: 1 } as const;
    const b = (id: number, malzemeId: number, partiId: number, etiket: string, miktar: string) => ({ ...BAKIYE, id, malzemeId, konumId: 77, konumKod: 'FSN-01', partiId, partiEtiketi: etiket, miktar });
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/konumlar': () => json(200, { satirlar: [konum], toplam: 1, sayfa: 1, sayfaBoyu: 200 } satisfies KonumlarCevabi),
      'GET /stok/konumlar/77': () => json(200, { konum, raf: null, bakiyeler: [b(1, 905, 7, 'FP-1', '10.000'), b(2, 905, 8, 'FP-2', '4.000'), b(3, 906, 9, 'FP-3', '1.000')], haritaYeri: null, zemin: null } satisfies KonumAyrintiCevabi),
      'GET /stok/mal-kabuller': () => json(200, bosListe satisfies MalKabullerCevabi),
      'GET /stok/acik-siparis-satirlari': () => json(200, acik),
      'GET /stok/malzemeler/903/ozet': () => json(200, ozet(903, 'hizmet', 'Deneme kaplama hizmeti')),
      'GET /stok/malzemeler/904/ozet': () => json(200, ozet(904, 'yarimamul', 'Deneme mil kaplamalı')),
      'GET /stok/malzemeler/905/ozet': () => json(200, ozet(905, 'yarimamul', 'Deneme mil ham')),
      'GET /stok/malzemeler/906/ozet': () => json(200, ozet(906, 'yarimamul', 'Deneme pim ham')),
      'GET /stok/malzemeler/904': () => json(200, AYRINTI),
      'GET /stok/malzemeler/904/goz-onerisi': () => json(200, { oneri: null }),
      'POST /stok/mal-kabul': () => json(200, { belge: { id: 3, no: 'MK-000003', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-09T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [] }),
    });
    ac('/stok/mal-kabul');
    fireEvent.click(await screen.findByRole('button', { name: 'Seç' }));
    fireEvent.change(await screen.findByLabelText('Dönen malzeme'), { target: { value: '904' } });
    await screen.findAllByRole('option', { name: /FSN-01/ });
    fireEvent.change(screen.getByLabelText('Fason kutusu'), { target: { value: '77' } });
    fireEvent.change(screen.getByLabelText('Giden malzeme'), { target: { value: '906' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/konumlar/77')).toBe(true));
    expect(screen.queryByLabelText(/Giden parti/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Giden malzeme'), { target: { value: '905' } });
    const parti = await screen.findByLabelText(/Giden parti/);
    expect(within(parti).getAllByRole('option').map((x) => x.textContent)).toEqual(['Seçin', 'FP-1 · 10', 'FP-2 · 4']);
    fireEvent.change(parti, { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText(/Sayılan miktar/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect((istekler.find((i) => i.yontem === 'POST')!.govde as { satirlar: unknown[] }).satirlar[0]).toMatchObject({ malzemeId: 904, fason: { malzemeId: 905, konumId: 77, partiId: 8 } });
  });
  it('fason dönüşü belgesi giden malzemeyi ve fason kutusunu gösterir; düzeltme satırı hizmet bağı, giden kart ve kutuyla yeniden kurar', async () => {
    const belge = { id: 4, no: 'MK-000004', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-09T09:00:00+03:00', kisiAd: 'Deneme Depocu', satirSayisi: 2, farkSayisi: 0, duzeltilenId: null, duzeltenId: null } as const;
    const ayrinti = { belge, satirlar: [
      { sira: 1, malzemeId: 904, malzemeAd: 'Deneme mil kaplamalı', sayilanMiktar: '18.000', partiId: 12, partiEtiketi: 'KP-1', partiBelgeleri: [{ id: 70, ad: 'Sertifika S-1 (HM-001)', tur: 'sertifika', harf: 'A' }], konumKod: 'KABUL', hareketId: 31, siparisSatirId: 51,
        fason: { malzemeId: 905, malzemeAd: 'Deneme mil ham', miktar: '20.000', konumId: 77, konumKod: 'FSN-01', hareketId: 32, hizmetMalzemeId: 903 }, logoDurumu: 'irsaliye_bekleniyor', logoIrsaliyeSatirNo: null, logoIrsaliyeMiktari: null },
      { sira: 2, malzemeId: 906, malzemeAd: 'Deneme kalibrasyon', sayilanMiktar: '1.000', partiId: null, partiEtiketi: null, partiBelgeleri: [], konumKod: null, hareketId: null, siparisSatirId: 52,
        fason: null, logoDurumu: 'irsaliye_bekleniyor', logoIrsaliyeSatirNo: null, logoIrsaliyeMiktari: null },
    ] } satisfies MalKabulAyrintiCevabi;
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/mal-kabuller/4': () => json(200, ayrinti),
      'GET /stok/konumlar': () => json(200, bosListe satisfies KonumlarCevabi),
      'POST /stok/mal-kabuller/4/duzelt': () => json(200, { belge: { ...belge, id: 5, no: 'MK-000005', duzeltilenId: 4 }, hareketIdler: [] }),
    });
    ac('/stok/mal-kabul/4');
    expect(await screen.findByText(/Fasondan dönüş · giden Deneme mil ham × 20 \(FSN-01\)/)).toBeTruthy();
    expect(screen.getByText('Hizmet: stoğa girmez')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Sertifika S-1 \(HM-001\) \(A\)/ }).getAttribute('href')).toBe('/api/stok/partiler/12/belgeler/70');
    fireEvent.click(screen.getByRole('button', { name: 'Düzelt' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Düzeltme belgesi aç' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const g = istekler.find((i) => i.yontem === 'POST')!.govde as { satirlar: unknown[] };
    expect(g.satirlar[0]).toMatchObject({ malzemeId: 904, miktar: '18', siparisSatirId: 51, fason: { malzemeId: 905, konumId: 77, miktar: '20' } });
    expect(g.satirlar[1]).toEqual({ malzemeId: 906, miktar: '1', siparisSatirId: 52 });
  });
  it('giriş işlemi olmayan kişi formu görmez, belge listesini görür', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/mal-kabuller': () => json(200, bosListe), 'GET /stok/konumlar': () => json(200, bosListe) });
    ac('/stok/mal-kabul');
    expect(await screen.findByText('Henüz mal kabul yok.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Teslim al' })).toBeNull();
  });
});

describe('Raf matrisi', () => {
  it('katları üstten alta, bölmeleri soldan sağa dizer; dolu göz malzeme ve miktar gösterir', async () => {
    const raf = { id: 1, depoId: 1, kod: 'A', tur: 'palet', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 2, katSayisi: 2, bolmeGenislikM: '2.70', derinlikM: '1.10', katAraligiM: '1.50', aktif: true, doluGoz: 1, toplamGoz: 4, surum: 1 } as const;
    const g = (konumId: number, bolmeNo: number, katNo: number, dolu = false) => ({ konumId, kod: `A-0${bolmeNo}-0${katNo}`, bolmeNo, katNo, aktif: true, satirSayisi: dolu ? 2 : 0, ilkMalzemeAd: dolu ? 'Deneme sac' : null, ilkMiktar: dolu ? '3.000' : null, sonSayim: null, ambalajlar: dolu ? [{ tur: 'palet' as const, olcu: 'eur1', adet: 2 }] : [] });
    sunucuKur(OKUYUCU, {
      'GET /stok/raflar': () => json(200, { satirlar: [raf], toplam: 1, sayfa: 1, sayfaBoyu: 200 } satisfies RaflarCevabi),
      'GET /stok/raflar/1': () => json(200, { raf, gozler: [g(1, 1, 2), g(2, 2, 2), g(3, 1, 1, true), g(4, 2, 1)] } satisfies RafMatrisiCevabi),
    });
    ac('/stok/raflar/1');
    expect(await screen.findByRole('button', { name: /Palet rafı · 2×2/ })).toBeTruthy();
    const satirlar = await screen.findAllByRole('row');
    expect(within(satirlar[1]!).getByText('Kat 2')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('Kat 1')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('Deneme sac')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('3 · +1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Doluluk' }));
    expect(screen.getByText('%66')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Sayım yaşı' }));
    expect(screen.getByText('Sayılmadı')).toBeTruthy();
  });
});

describe('Hareketler', () => {
  const H = {
    id: 5, zaman: '2026-10-07T10:00:00+03:00', tur: 'cikis', malzemeId: 901, malzemeAd: 'Deneme sac', partiId: null, partiEtiketi: null, kaynakKonumKod: 'KABUL',
    hedefKonumKod: null, miktar: '2.000', onayliEksi: true, girisKaynagi: null, cikisNedeni: 'sevk', uretimEmriId: null, geriAlinanId: null, geriAlindi: false, fisId: 4, fisNo: 'TF-000004', kisiAd: 'Deneme Depocu', aciklama: null, kaynakStatuId: null, hedefStatuId: null,
  } as const;
  it('onaylı eksiyi işaretler; geri al düğmesi yalnız geri alma işlemiyle; süzgeçsiz listede toplam yoksa sayfalama uydurmaz', async () => {
    sunucuKur(MUDUR, { 'GET /stok/hareketler': () => json(200, { satirlar: [H], toplam: null, sayfa: 1, sayfaBoyu: 50 } satisfies HareketlerCevabi) });
    ac('/stok/hareketler');
    expect(await screen.findByText('Onaylı eksi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Geri al' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fiş TF-000004' })).toBeTruthy();
  });
  it('emre bağlı hareket notunda emir numarasını yazar; numara yoksa kimliği yedek gösterir', async () => {
    const numarali = { ...H, id: 8, cikisNedeni: 'uretime_sarf', uretimEmriId: 41, emirNo: 'UE-0041' } as const;
    const numarasiz = { ...H, id: 9, cikisNedeni: 'uretime_sarf', uretimEmriId: 42, emirNo: null } as const;
    sunucuKur(MUDUR, { 'GET /stok/hareketler': () => json(200, { satirlar: [numarali, numarasiz], toplam: 2, sayfa: 1, sayfaBoyu: 50 } satisfies HareketlerCevabi) });
    ac('/stok/hareketler');
    expect(await screen.findByText(/Emir UE-0041/)).toBeTruthy();
    expect(screen.getByText(/Emir #42/)).toBeTruthy();
    expect(screen.queryByText(/Emir #41/)).toBeNull();
  });
  it('geri alma işlemi olmayan kişi düğmeyi görmez', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/hareketler': () => json(200, { satirlar: [H], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies HareketlerCevabi) });
    ac('/stok/hareketler');
    expect(await screen.findByText('Deneme sac')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull();
  });
  it('işaret yönden çıkar: sayım fazlasının geri alınması eksi, çıkışın geri alınması artı görünür', async () => {
    const fazlaGeri = { ...H, id: 6, tur: 'geri_alma', kaynakKonumKod: 'A-01-1', hedefKonumKod: null, miktar: '1.000', onayliEksi: false, cikisNedeni: null, geriAlinanId: 3, fisId: null, fisNo: null } as const;
    const cikisGeri = { ...fazlaGeri, id: 7, kaynakKonumKod: null, hedefKonumKod: 'KABUL', miktar: '4.000', geriAlinanId: 5 } as const;
    sunucuKur(MUDUR, { 'GET /stok/hareketler': () => json(200, { satirlar: [fazlaGeri, cikisGeri], toplam: 2, sayfa: 1, sayfaBoyu: 50 } satisfies HareketlerCevabi) });
    ac('/stok/hareketler');
    expect(await screen.findByText('−1')).toBeTruthy();
    expect(screen.getByText('+4')).toBeTruthy();
  });
  it('statü sütunu değişimi kaynak → hedef gösterir; statü adı okunamazsa kimlikle gösterir', async () => {
    const degisim = { ...H, id: 8, tur: 'transfer', kaynakKonumKod: 'A-01-02', hedefKonumKod: 'A-01-02', onayliEksi: false, cikisNedeni: null, kaynakStatuId: null, hedefStatuId: 7 } as const;
    sunucuKur(MUDUR, { 'GET /stok/hareketler': () => json(200, { satirlar: [degisim], toplam: 1, sayfa: 1, sayfaBoyu: 50 } satisfies HareketlerCevabi) });
    ac('/stok/hareketler');
    expect(await screen.findByText('Serbest → Statü #7')).toBeTruthy();
  });
});

describe('Okut', () => {
  const KOD = { tur: 'malzeme', ozet: { id: 901, tur: 'sarf', kod: 'SR-001', ad: 'Eldiven', onayDurumu: 'aktif', kullanilabilir: true }, toplam: '3', bakiyeler: [BAKIYE] } as const;
  it('el okuyucuyla girilen kodu çözer; sepet modunda pencere açar ve seçilen gözden sepete ekler', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/kod-coz': () => json(200, KOD),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [] }),
    });
    ac('/stok/okut?mod=sepet');
    fireEvent.change(await screen.findByLabelText('Kod'), { target: { value: 'MLZ:901' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    const pencere = await screen.findByRole('dialog', { name: /Sepete ekle: Eldiven/ });
    fireEvent.click(within(pencere).getByLabelText(/A-01-02/));
    fireEvent.click(within(pencere).getByRole('button', { name: '5' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sepete ekle' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sepet/satir-ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')!.govde).toMatchObject({ malzemeId: 901, miktar: '5', kaynakKonumId: 3, partiId: 4 });
    expect(istekler.some((i) => i.yol.startsWith('/stok/kod-coz?kod=MLZ%3A901'))).toBe(true);
  });
  it('tanınmayan kodu söyler, uydurmaz', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/kod-coz': () => json(200, { tur: 'bilinmiyor', kod: 'XYZ' }) });
    ac('/stok/okut');
    fireEvent.change(await screen.findByLabelText('Kod'), { target: { value: 'XYZ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    expect(await screen.findByText(/"XYZ" tanınmadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sepete ekle' })).toBeNull();
  });
});

describe('Taşı', () => {
  const SATIR_S = { id: 7, malzemeId: 901, malzemeAd: 'Eldiven', malzemeKod: 'SR-001', kaynakKonumId: null, kaynakKonumKod: null, partiId: null, partiEtiketi: null, miktar: '5', mevcut: '3', eklenme: '2026-10-07T10:00:00+03:00' };
  const FIS = { id: 12, no: 'TF-000012', zaman: '2026-10-07T10:00:00+03:00', hedefKonumId: 9, hedefKonumKod: 'D-C4', cikisNedeni: null, uretimEmriId: null, aciklama: null, kisiAd: 'Deneme', satirSayisi: 1 };
  it('yetersiz satırı işaretler; hepsi için seçilen yere taşırken onay ister, onayla yeniden gönderir ve fişe gider', async () => {
    let n = 0;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/sepet': () => json(200, { satirlar: [SATIR_S] }),
      'GET /stok/fisler': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 8 }),
      'GET /stok/ara': () => json(200, { sonuclar: [{ tur: 'konum', konumId: 9, kod: 'D-C4', ad: null, satirSayisi: 0 }, { tur: 'konum', konumId: 10, kod: 'D-C5', ad: 'Hat 2', satirSayisi: 0 }] }),
      'POST /stok/sepet/teslim-et': () => (n++ === 0
        ? json(409, { kod: 'ONAY_GEREKLI', mesaj: 'Yetersiz stok', ayrinti: { mevcut: '3' } })
        : json(200, { fis: FIS, fisler: [FIS] })),
      'GET /stok/fisler/12': () => json(200, { fis: { ...FIS, satirSayisi: 0 }, hareketler: [] }),
    });
    ac('/stok/sepet');
    expect(await screen.findByText('Yetersiz stok')).toBeTruthy();
    const tasi = screen.getByRole('button', { name: 'Hepsini taşı' }) as HTMLButtonElement;
    expect(tasi.disabled).toBe(true);
    await konumSec(document.body, 'Hepsi nereye', 'D-C', 'D-C4');
    await waitFor(() => expect(tasi.disabled).toBe(false));
    fireEvent.click(tasi);
    const onay = await screen.findByRole('dialog', { name: 'Yetersiz stok' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Yine de yaz' }));
    expect(await screen.findByText('Teslim fişi TF-000012')).toBeTruthy();
    const teslimler = istekler.filter((i) => i.yol === '/stok/sepet/teslim-et');
    expect(teslimler).toHaveLength(2);
    expect(teslimler[1]!.govde).toMatchObject({ hedefKonumId: 9, satirHedefleri: [], eksiOnay: true });
    expect(screen.getByRole('img', { name: 'QR: FIS:TF-000012' })).toBeTruthy();
  });
  it('fiş üretim emrini numarasıyla yazar; numara yoksa kimlikle (borç #419)', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/fisler/12': () => json(200, { fis: { ...FIS, uretimEmriId: 41, emirNo: 'UE-0041', satirSayisi: 0 }, hareketler: [] }),
      'GET /stok/fisler/13': () => json(200, { fis: { ...FIS, id: 13, no: 'TF-000013', uretimEmriId: 42, emirNo: null, satirSayisi: 0 }, hareketler: [] }),
    });
    ac('/stok/fisler/12');
    expect(await screen.findByText('UE-0041')).toBeTruthy();
    cleanup();
    ac('/stok/fisler/13');
    expect(await screen.findByText('#42')).toBeTruthy();
  });
  it('satıra seçilen yer hepsi için seçilenin önüne geçer; iki yere taşıyınca ekranda kalır', async () => {
    const IKINCI = { ...SATIR_S, id: 8, malzemeId: 902, malzemeAd: 'Kesme yağı', miktar: '1' };
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/sepet': () => json(200, { satirlar: [SATIR_S, IKINCI] }),
      'GET /stok/fisler': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 8 }),
      'GET /stok/ara': () => json(200, { sonuclar: [{ tur: 'konum', konumId: 9, kod: 'D-C4', ad: null, satirSayisi: 0 }, { tur: 'konum', konumId: 10, kod: 'D-C5', ad: 'Hat 2', satirSayisi: 0 }] }),
      'POST /stok/sepet/teslim-et': () => json(200, { fis: FIS, fisler: [FIS, { ...FIS, id: 13, no: 'TF-000013', hedefKonumId: 10, hedefKonumKod: 'D-C5' }] }),
    });
    ac('/stok/sepet');
    expect(await screen.findByText('Kesme yağı')).toBeTruthy();
    await konumSec(document.body, 'Nereye Kesme yağı', 'D-C', 'D-C5 · Hat 2');
    const tasi = screen.getByRole('button', { name: 'Hepsini taşı' }) as HTMLButtonElement;
    expect(tasi.disabled).toBe(true);
    expect(screen.getByText(/1 satırın yeri seçilmedi/)).toBeTruthy();
    await konumSec(document.body, 'Hepsi nereye', 'D-C', 'D-C4');
    fireEvent.click(tasi);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sepet/teslim-et')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/sepet/teslim-et')!.govde).toEqual({ hedefKonumId: 9, satirHedefleri: [{ satirId: 8, hedefKonumId: 10 }], aciklama: '' });
    expect(await screen.findByText('Taşındı; fiş yazıldı.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Taşı' })).toBeTruthy();
  });
});

describe('Hazırlık listesi', () => {
  const T = {
    toplama: { id: 3, no: 'TL-000003', ad: 'Sipariş 7781', durum: 'topluyor', acilis: '2026-10-07T10:00:00+03:00', kapanis: null, kisiAd: 'Deneme', kapatanKisiAd: null, adimSayisi: 2, toplanan: 0, eksikVar: true, surum: 1 },
    kalemler: [{ malzemeId: 901, malzemeAd: 'Eldiven', istenen: '5', eksik: '1' }],
    adimlar: [
      { id: 11, sira: 1, malzemeId: 901, malzemeAd: 'Eldiven', konumId: 3, konumKod: 'A-01-02', partiId: null, partiEtiketi: 'LT-000041', miktar: '2', toplandi: false, hareketId: null, toplanan: null },
      { id: 12, sira: 2, malzemeId: 901, malzemeAd: 'Eldiven', konumId: 4, konumKod: 'A-02-01', partiId: null, partiEtiketi: null, miktar: '2', toplandi: false, hareketId: null, toplanan: null },
    ],
    hedef: { konumId: 20, kod: 'IST-4', ad: 'Torna 1', istasyonId: 4 },
    istekler: [{ id: 31, no: 'MI-000031', malzemeId: 901, miktar: '5', karsilanan: null, durum: 'hazirlaniyor' }],
  } as const;
  it('sıradaki adımı büyük gösterir, eksiği ve teslim yerini söyler; Toplandı sürümle gönderilir', async () => {
    const istekler = sunucuKur(DEPOCU, { 'GET /stok/toplamalar/3': () => json(200, T), 'POST /stok/toplamalar/3/adimlar/11/topla': () => json(200, T) });
    ac('/stok/hazirlik/3');
    expect(await screen.findByText('Sıradaki adım 1')).toBeTruthy();
    expect(screen.getByText(/Eldiven 1 eksik/)).toBeTruthy();
    expect(screen.getByText('IST-4 · Torna 1')).toBeTruthy();
    expect(screen.getByText('MI-000031')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Toplandı' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/toplamalar/3/adimlar/11/topla')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/toplamalar/3/adimlar/11/topla')!.govde).toEqual({ surum: 1 });
  });
  it('azı kısmi toplamadır ve miktarla gider; okutulan kod gözle ya da lotla eşleşmezse toplanmaz', async () => {
    const istekler = sunucuKur(DEPOCU, { 'GET /stok/toplamalar/3': () => json(200, T), 'POST /stok/toplamalar/3/adimlar/11/topla': () => json(200, T) });
    ac('/stok/hazirlik/3');
    const dugme = await screen.findByRole('button', { name: 'Toplandı' }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText(/Okut/), { target: { value: 'A-09-09' } });
    expect(screen.getByText(/eşleşmiyor/)).toBeTruthy();
    expect(dugme.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Okut/), { target: { value: 'loc:a-01-02' } });
    expect(dugme.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Okut/), { target: { value: 'LT-000041' } });
    expect(dugme.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Alınan miktar/), { target: { value: '1,5' } });
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/toplamalar/3/adimlar/11/topla')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/toplamalar/3/adimlar/11/topla')!.govde).toEqual({ surum: 1, miktar: '1.5' });
  });
  it('eski sipariş toplama adresi hazırlığa yönlenir', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/toplamalar/3': () => json(200, T) });
    ac('/stok/toplama/3');
    expect(await screen.findByRole('heading', { name: 'Hazırlık TL-000003' })).toBeTruthy();
  });
});

// Depo sayfası haritanın depo görünümünü yalnız stok deposu bölümleriyle gösterir (kart #1304).
const harRaf = (id: number, kod: string) => ({ id, kod, ad: `${kod} rafı`, tur: 'palet' as const, bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1, bolmeGenisligi: '2.70', derinlik: '1.10', yukseklik: '4.00', x: '5.00', z: '5.00', donus: '0.0', aktif: true, genislik: '5.40', hucre: 'A1', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null });
const harBolum = (id: number, kod: string, raflar: ReturnType<typeof harRaf>[]) => ({
  salon: { id, kod, ad: `${kod} bölümü`, genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 1, fabrika: { x: '0.00', z: '0.00', donus: '0.0' }, giris: null, kaydeden: null, kaydedildi: null, sutunlar: ['A'], satirlar: ['1'] },
  istasyonYerleri: [], makineYerleri: [], raflar, alanlar: [], duvarlar: [], gecisler: [],
});
const HARITA_OZETI = (depo: boolean) => ({ bolum: depo ? 1 : 0, goz: 0, alan: 0, eslenmemis: 0, bagsizKonumlar: [], bolumler: [{ salonId: 1, kod: 'URT', gozSayisi: 0, depoKod: null }, { salonId: 2, kod: 'DEP', gozSayisi: 4, depoKod: depo ? 'DEP' : null }] });
const FABRIKA = { bolumler: [harBolum(1, 'URT', [harRaf(10, 'U1')]), harBolum(2, 'DEP', [harRaf(20, 'D1')])] };
describe('Depo', () => {
  const haritaYollari = (depo = true) => ({
    'GET /stok/harita-ozeti': () => json(200, HARITA_OZETI(depo)),
    'GET /atolye/fabrika': () => json(200, FABRIKA),
    'GET /atolye/goz-kalemleri': () => json(200, { kalemler: [] }),
    'GET /atolye/raflar/20/gozler': () => json(200, { raf: { id: 20, kod: 'D1', ad: 'D1 rafı', aktif: true }, satirlar: [{ id: 200, adres: 'D1-01-1-1', bolme: 1, kat: 1, goz: 1 }], toplam: 4, sayfaBoyu: 200 }),
    'GET /atolye/kalem-gorunumleri': () => json(200, { kalemler: [] }),
    'POST /stok/depo-goz-kalemleri/yaz': () => json(200, { id: 1, gozId: 200, adres: 'D1-01-1-1' }),
  });
  it('haritadaki depo bölümünün raflarını gösterir; depo olmayan bölümün rafı görünmez, okuyan düzenleyemez', async () => {
    const istekler = sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.atolye'] }, haritaYollari());
    ac('/stok/depo');
    expect(await screen.findByRole('button', { name: /D1 D1 rafı/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /U1/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Raf ekle ve düzenle' })).toBeNull();
    expect(istekler.some((i) => i.yol === '/atolye/goz-kalemleri?salonId=2')).toBe(true);
  });
  it('DEP-61 harita yetkisi olmayan tanım yetkilisi depo gözüne kalemi stok ucuyla koyar', async () => {
    const istekler = sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'sayfa.atolye'] }, haritaYollari());
    ac('/stok/depo');
    expect(await screen.findByRole('button', { name: 'Raf ekle ve düzenle' })).toBeTruthy();
    const cephe = await screen.findByRole('group', { name: 'D1 bölme 1 önden' });
    fireEvent.click(within(cephe).getByRole('button', { name: 'Kat 1 göz 1: boş' }));
    const panel = await screen.findByRole('region', { name: 'Göz D1-01-1-1' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Kalem koy' }));
    fireEvent.change(within(panel).getByLabelText('Kod (parça no ya da malzeme kodu)'), { target: { value: 'DENEME-9' } });
    fireEvent.change(within(panel).getByLabelText('Ad'), { target: { value: 'Deneme kalem' } });
    fireEvent.change(within(panel).getByLabelText('Doluluk %'), { target: { value: '30' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Göze koy' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/depo-goz-kalemleri/yaz')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/depo-goz-kalemleri/yaz')?.govde).toEqual({ gozId: 200, kod: 'DENEME-9', ad: 'Deneme kalem', doluluk: 30 });
    expect(istekler.some((i) => i.yol === '/atolye/goz-kalemleri/yaz')).toBe(false);
  });
  it('DEP-61 depo kipinde düzenleyici yalnız raf ekler ve yalnız rafları stok ucuna gönderir', async () => {
    const istekler = sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'sayfa.atolye'] }, {
      ...haritaYollari(),
      'POST /stok/depo-bolumleri/2/raflari-kaydet': () => json(200, { ...FABRIKA.bolumler[1], uyarilar: [] }),
      'POST /stok/konumlar/haritadan-esle': () => json(200, { eklenen: 0, guncellenen: 0, kapatilan: 0, atlanan: [], koduDegisenler: [] }),
    });
    ac('/stok/depo');
    fireEvent.click(await screen.findByRole('button', { name: 'Raf ekle ve düzenle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yerleşimi düzenle' });
    expect(within(pencere).queryByRole('button', { name: 'Kroki' })).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ekle' }));
    const palet = within(pencere).getByRole('complementary', { name: 'Öğe ekle' });
    expect(within(palet).queryByRole('button', { name: /Duvar/ })).toBeNull();
    fireEvent.click(within(palet).getByRole('button', { name: /Konsol raf/ }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/depo-bolumleri/2/raflari-kaydet')).toBe(true));
    const govde = istekler.find((i) => i.yol === '/stok/depo-bolumleri/2/raflari-kaydet')!.govde as { surum: number; raflar: { kod: string }[] };
    expect(Object.keys(govde).sort()).toEqual(['raflar', 'surum']);
    expect(govde.raflar.map((r) => r.kod)).toContain('D1');
    expect(govde.raflar).toHaveLength(2);
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol.startsWith('/atolye/'))).toBe(false);
  });
  it('depo bölümü yoksa söyler ve tanım yetkilisini Ayarlar\'a gönderir', async () => {
    sunucuKur(MUDUR, { 'GET /stok/harita-ozeti': () => json(200, HARITA_OZETI(false)) });
    ac('/stok/depo');
    expect(await screen.findByText(/stok deposu yapılmış bölüm yok/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /depo yap/ }).getAttribute('href')).toBe('/stok/ayarlar');
  });
});

const YERLESIM = {
  depo: { id: 1, kod: 'ANA', ad: 'Ana depo' },
  yerlesim: { bina: { x0: -10, x1: 30, z0: -30, z1: 10 }, kabul: { x: 10, z: 5, genislik: 12, derinlik: 5 }, kareBoyu: 5, sayimSuresiGun: 30, fason: { x: -8, z: 0, aci: 0 as const }, surum: 3 },
  raflar: [{ id: 1, surum: 2, kod: 'A', tur: 'palet' as const, numaralama: 'sirali' as const, ilkBolme: 1, bolmeSayisi: 4, katSayisi: 3, bolmeGenislikM: 2.7, derinlikM: 1.1, katAraligiM: 1.5, xM: 2, zM: 0, aci: 0 as const, onYuzTers: false, doluBolmeler: [1, 0, 0, 0], stokluGoz: 1 }],
};
describe('Yerleşim düzenleyici', () => {
  it('rafı listeler, seçince önizlemedeki paneli açar; döndürüp kaydedince sürüm ve yeni açıyla gönderir', async () => {
    const istekler = sunucuKur(MUDUR, { 'GET /stok/yerlesim': () => json(200, YERLESIM), 'POST /stok/yerlesim/kaydet': () => json(200, YERLESIM) });
    ac('/stok/yerlesim');
    fireEvent.click(await screen.findByRole('button', { name: /A Palet · 4×3/ }));
    expect(await screen.findByRole('heading', { name: 'Raf A' })).toBeTruthy();
    expect(screen.getByText((_, el) => el?.tagName === 'P' && /Bu rafta 1 dolu göz var/.test(el.textContent ?? ''))).toBeTruthy();
    expect(screen.getByText('A-01-01')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /⟲ 90°/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/yerlesim/kaydet')).toBe(true));
    const g = istekler.find((i) => i.yol === '/stok/yerlesim/kaydet')!.govde as { surum: number; raflar: { id: number; aci: number; surum: number }[] };
    expect(g.surum).toBe(3);
    expect(g.raflar[0]).toMatchObject({ id: 1, surum: 2, aci: 90 });
  });
  it('raf tanımı yetkisi olmayan kişiye açılmaz', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/yerlesim': () => json(200, YERLESIM) });
    ac('/stok/yerlesim');
    expect(await screen.findByText(/raf tanımı yetkisi gerekiyor/)).toBeTruthy();
  });
});

describe('Fabrika Haritası bağı (#686)', () => {
  it('tanım yetkilisi konumları haritadan eşler, eşlenemeyen adres bildirilir; raf açma haritaya gider', async () => {
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/yerlesim': () => json(200, YERLESIM),
      'GET /stok/konumlar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 }),
      'POST /stok/konumlar/haritadan-esle': () => json(200, { eklenen: 2, guncellenen: 0, kapatilan: 0, atlanan: ['A1-01-1-1'], koduDegisenler: [] }),
    });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('button', { name: /Haritadan eşle/ }));
    expect(await screen.findByText(/Eşlenemeyen yer: A1-01-1-1/)).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST' && i.yol === '/stok/konumlar/haritadan-esle')).toHaveLength(1);
    expect(screen.queryByText(/kodu değişti/)).toBeNull();
    cleanup();
    sunucuKur(MUDUR, { 'GET /stok/raflar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 }) });
    ac('/stok/raflar');
    expect((await screen.findByRole('link', { name: /Raf aç/ })).getAttribute('href')).toBe('/atolye');
  });
  it('94 a: eşlemede kodu değişen konum varsa uyarı çıkar, "Etiketleri bas" yeni kodla etiket açar', async () => {
    sunucuKur(MUDUR, {
      'GET /stok/yerlesim': () => json(200, YERLESIM),
      'GET /stok/konumlar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 }),
      'POST /stok/konumlar/haritadan-esle': () => json(200, { eklenen: 0, guncellenen: 1, kapatilan: 0, atlanan: [],
        koduDegisenler: [{ konumId: 7, eskiKod: 'H1-01-1-1', yeniKod: 'H2-01-1-1', tur: 'raf_gozu', ad: null, bolmeNo: 1, katNo: 1 }] }),
    });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('button', { name: /Haritadan eşle/ }));
    expect(await screen.findByText(/1 konumun kodu değişti; eski etiketler artık okunmaz/)).toBeTruthy();
    expect(screen.getByText('H2-01-1-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Etiketleri bas/ }));
    expect(await screen.findByText(/1 etiket · A4/)).toBeTruthy();
  });
  it("94 a: Etiket Merkezi sayfası olan, kodu değişen konumları Etiket Merkezi'nde açar", async () => {
    sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'sayfa.etiket-merkezi'] }, {
      'GET /stok/yerlesim': () => json(200, YERLESIM),
      'GET /stok/konumlar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 }),
      'POST /stok/konumlar/haritadan-esle': () => json(200, { eklenen: 0, guncellenen: 2, kapatilan: 0, atlanan: [], koduDegisenler: [
        { konumId: 7, eskiKod: 'H1-01-1-1', yeniKod: 'H2-01-1-1', tur: 'raf_gozu', ad: null, bolmeNo: 1, katNo: 1 },
        { konumId: 8, eskiKod: 'H1-02-1-1', yeniKod: 'H2-02-1-1', tur: 'raf_gozu', ad: null, bolmeNo: 2, katNo: 1 },
      ] }),
    });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('button', { name: /Haritadan eşle/ }));
    const bas = await screen.findByRole('link', { name: /Etiketleri bas/ });
    expect(bas.getAttribute('href')).toBe('/etiket-merkezi?tur=konum&id=7,8');
  });
  it('Ayarlar bölümleri listeler; depo olmayan bölüm "Depo yap" ile depo olur', async () => {
    const ozet = (depoKod: string | null) => ({ bolum: depoKod ? 2 : 1, goz: 6, alan: 1, eslenmemis: 0, bagsizKonumlar: [], bolumler: [
      { salonId: 1, kod: 'ANA', gozSayisi: 6, depoKod: 'ANA' }, { salonId: 2, kod: 'DENEME-AT1', gozSayisi: 84, depoKod } ] });
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/harita-ozeti': () => json(200, ozet(null)),
      'GET /stok/depolar': () => json(200, { depolar: [] }),
      'POST /stok/harita-bolumleri/2/depo': () => json(200, ozet('DENEMEAT1')),
    });
    ac('/stok/ayarlar');
    fireEvent.click(await screen.findByRole('button', { name: 'Depo yap: DENEME-AT1' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/harita-bolumleri/2/depo')?.govde).toEqual({ depo: true }));
    expect(screen.getByRole('button', { name: 'Depodan çıkar: ANA' })).toBeTruthy();
  });
  it('Stok Merkezi açılınca yazma çağrısı gitmez; eşlenmemiş harita yeri tanım yetkilisine iş olarak söylenir', async () => {
    const ozet = { bolum: 1, goz: 6, alan: 1, eslenmemis: 4, bagsizKonumlar: [], bolumler: [] };
    const yollar = { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, PANEL), 'GET /stok/harita-ozeti': () => json(200, ozet) };
    const istekler = sunucuKur(MUDUR, yollar);
    ac('/stok');
    const is = await screen.findByText('4 harita yeri stok konumu değil');
    expect(is.closest('.tc-stok-is')?.querySelector('a')?.getAttribute('href')).toBe('/stok/konumlar');
    expect(istekler.filter((i) => i.yontem !== 'GET')).toHaveLength(0);
    cleanup();
    const depocu = sunucuKur(DEPOCU, yollar);
    ac('/stok');
    await screen.findByText('Malzeme çeşidi');
    expect(screen.queryByText(/harita yeri stok konumu değil/)).toBeNull();
    expect(depocu.filter((i) => i.yol === '/stok/harita-ozeti' || i.yontem !== 'GET')).toHaveLength(0);
  });
  it('tanım yetkisi olmayana eşleme düğmesi görünmez', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/yerlesim': () => json(200, YERLESIM), 'GET /stok/konumlar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 }) });
    ac('/stok/konumlar');
    await screen.findByText('Konumlar');
    expect(screen.queryByRole('button', { name: /Haritadan eşle/ })).toBeNull();
  });
});

describe('Arama, depocu modu, etiketler', () => {
  it('Ctrl+K arama penceresini açar; ilk sonuç Enter ile açılır', async () => {
    sunucuKur(OKUYUCU, {
      'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, PANEL),
      'GET /stok/ara': () => json(200, { sonuclar: [{ tur: 'konum', konumId: 9, kod: 'A-03-02', ad: null, satirSayisi: 2 }] }),
      'GET /stok/konumlar/9': () => json(200, { konum: { id: 9, kod: 'A-03-02', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: 1, bolmeNo: 3, katNo: 2, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 1 }, raf: null, bakiyeler: [] }),
    });
    ac('/stok');
    await screen.findByText('Malzeme çeşidi');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    const p = await screen.findByRole('dialog', { name: 'Ara' });
    fireEvent.change(within(p).getByLabelText('Ara'), { target: { value: 'A-03' } });
    expect(await within(p).findByText('A-03-02')).toBeTruthy();
    fireEvent.submit(within(p).getByLabelText('Ara').closest('form')!);
    expect(await screen.findByRole('heading', { name: 'A-03-02' })).toBeTruthy();
  });
  it.each([['depocu', DEPOCU], ['müdür', MUDUR]])('Stok Merkezi %s için de depocu açılışıyla gelir; alt çubuk durur, mod seçimi yoktur', async (_ad, kisi) => {
    sunucuKur(kisi, { 'GET /stok/is-kutusu': () => json(200, BOS_KUTU), 'GET /stok/panel': () => json(200, PANEL), 'GET /stok/sepet': () => json(200, { satirlar: [] }), 'GET /stok/toplamalar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 5 }) });
    ac('/stok');
    expect(await screen.findByText('Ürün ya da raf kodunu okut')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Depocu kısayolları' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Ekran modu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yönetici' })).toBeNull();
  });
  it('raf matrisinden bütün gözlerin QR etiketleri; QR okutmanın tanıdığı LOC önekini taşır', async () => {
    const raf = { id: 1, depoId: 1, kod: 'A', tur: 'palet', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 2, katSayisi: 1, bolmeGenislikM: '2.70', derinlikM: '1.10', katAraligiM: '1.50', aktif: true, doluGoz: 0, toplamGoz: 2, surum: 1 } as const;
    const g = (konumId: number, bolmeNo: number) => ({ konumId, kod: `A-0${bolmeNo}-01`, bolmeNo, katNo: 1, aktif: true, satirSayisi: 0, ilkMalzemeAd: null, ilkMiktar: null, sonSayim: null, ambalajlar: [] });
    sunucuKur(OKUYUCU, { 'GET /stok/raflar': () => json(200, { satirlar: [raf], toplam: 1, sayfa: 1, sayfaBoyu: 200 }), 'GET /stok/raflar/1': () => json(200, { raf, gozler: [g(1, 1), g(2, 2)] }) });
    ac('/stok/raflar/1');
    fireEvent.click(await screen.findByRole('button', { name: 'Etiketler' }));
    const p = await screen.findByRole('dialog', { name: 'Raf A etiketleri' });
    expect(within(p).getByText(/2 etiket/)).toBeTruthy();
    expect(within(p).getAllByRole('img', { name: 'QR: LOC:A-01-01' }).length).toBeGreaterThan(0);
  });
});

describe('Okut: bekleyen giriş ve geri al', () => {
  const MLZ = { tur: 'malzeme', ozet: { id: 901, tur: 'sarf', kod: 'SR-001', ad: 'Eldiven', onayDurumu: 'aktif', kullanilabilir: true }, toplam: '3', bakiyeler: [BAKIYE] };
  const KNM = { tur: 'konum', konum: { id: 7, kod: 'A-02-01', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: 1, bolmeNo: 2, katNo: 1, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 1 }, bakiyeler: [] };
  it('mal kabulde ambalaj seçilir, Rafı okut bekler; okutulan konuma ambalajla birlikte girer', async () => {
    let n = 0;
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/kod-coz': () => json(200, n++ === 0 ? MLZ : KNM),
      'GET /stok/malzemeler/901/goz-onerisi': () => json(200, { oneri: { konumId: 7, kod: 'A-02-01' } }),
      'POST /stok/mal-kabul': () => json(200, { belge: { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-07T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null }, hareketIdler: [1] }),
    });
    ac('/stok/okut?mod=kabul');
    const kod = await screen.findByLabelText('Kod');
    fireEvent.change(kod, { target: { value: 'MLZ:901' } }); fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    fireEvent.click(await screen.findByRole('button', { name: /Karton koli/ }));
    fireEvent.change(screen.getByLabelText(/^Sayılan miktar/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Ambalaj sayısı'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rafı okut' }));
    expect(await screen.findByText(/için rafı okut/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Önerilen: A-02-01' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kod'), { target: { value: 'LOC:A-02-01' } }); fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde).toMatchObject({ satirlar: [{ malzemeId: 901, miktar: '12', konumId: 7, ambalaj: { tur: 'koli', olcu: 'm', adet: 2 } }] });
    expect(await screen.findByText(/rafa girdi \(MK-000012\)/)).toBeTruthy();
  });
  it('sepete eklemeyi geri alır: satır eski miktarına döner', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/kod-coz': () => json(200, MLZ),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [{ id: 5, malzemeId: 901, malzemeAd: 'Eldiven', malzemeKod: 'SR-001', kaynakKonumId: null, kaynakKonumKod: null, partiId: null, partiEtiketi: null, miktar: '8', mevcut: '3', eklenme: '2026-10-07T10:00:00+03:00' }] }),
      'POST /stok/sepet/satirlar/5/degistir': () => json(200, { satirlar: [] }),
    });
    ac('/stok/okut?mod=sepet');
    fireEvent.change(await screen.findByLabelText('Kod'), { target: { value: '901' } }); fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    const p = await screen.findByRole('dialog', { name: /Sepete ekle/ });
    fireEvent.click(within(p).getByRole('button', { name: '5' }));
    fireEvent.click(within(p).getByRole('button', { name: 'Sepete ekle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sepet/satirlar/5/degistir')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/sepet/satirlar/5/degistir')!.govde).toEqual({ miktar: '3' });
  });
});

describe('Önizleme ayrıntıları', () => {
  it('taşı ekranı son teslim yerlerini gösterir; dokununca hepsi için yer seçilir', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/sepet': () => json(200, { satirlar: [{ id: 7, malzemeId: 901, malzemeAd: 'Eldiven', malzemeKod: 'SR-001', kaynakKonumId: null, kaynakKonumKod: null, partiId: null, partiEtiketi: null, miktar: '1', mevcut: '3', eklenme: '2026-10-07T10:00:00+03:00' }] }),
      'GET /stok/fisler': () => json(200, { satirlar: [{ id: 3, no: 'TF-000003', zaman: '2026-10-07T09:00:00+03:00', hedefKonumId: 9, hedefKonumKod: 'D-C4', cikisNedeni: null, uretimEmriId: null, aciklama: null, kisiAd: 'D', satirSayisi: 1 }], toplam: 1, sayfa: 1, sayfaBoyu: 20 }),
    });
    ac('/stok/sepet');
    fireEvent.click(await within(await screen.findByRole('group', { name: 'Son teslim yerleri' })).findByRole('button', { name: 'D-C4' }));
    await waitFor(() => expect((screen.getByRole('combobox', { name: /Hepsi nereye/ }) as HTMLInputElement).value).toBe('D-C4'));
    expect((screen.getByRole('button', { name: 'Hepsini taşı' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('ambalaj kartları önizlemedeki çizim simgeleriyle gelir', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/konumlar': () => json(200, bosListe), 'GET /stok/mal-kabuller': () => json(200, bosListe) });
    ac('/stok/mal-kabul');
    const g = await screen.findByRole('group', { name: 'Ambalaj tipi' });
    expect(g.querySelectorAll('svg.tc-pk')).toHaveLength(6);
  });
});

describe('KD-010 elle yeniden gönderim', () => {
  it('sonucu bilinmeyen hatadan sonra aynı komut aynı istek kimliğiyle gider; başarıdan sonra ya da içerik değişince yeni kimlik', async () => {
    vi.useFakeTimers();
    try {
      const kimlikler: string[] = [];
      let durum = 503;
      vi.stubGlobal('fetch', vi.fn(async (_adres: string, secenek?: RequestInit) => {
        kimlikler.push(new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI) ?? '');
        return durum === 200 ? json(200, { tamam: true }) : json(durum, { kod: 'SUNUCU', mesaj: 'Sunucu hatası' });
      }));
      const govde = { malzemeId: 901, miktar: '2' };
      const ilk = korumaliPost('/stok/mal-kabul', govde).catch((h: unknown) => h);
      await vi.runAllTimersAsync();
      expect(await ilk).toBeInstanceOf(ApiHatasi);
      expect(kimlikler).toHaveLength(3);
      durum = 200;
      await korumaliPost('/stok/mal-kabul', govde);
      expect(new Set(kimlikler).size).toBe(1);
      await korumaliPost('/stok/mal-kabul', govde);
      expect(kimlikler.at(-1)).not.toBe(kimlikler[0]);
      durum = 422;
      await korumaliPost('/stok/mal-kabul', { ...govde, miktar: '3' }).catch(() => undefined);
      durum = 200;
      await korumaliPost('/stok/mal-kabul', { ...govde, miktar: '3' });
      expect(kimlikler.at(-1)).not.toBe(kimlikler.at(-2));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Lot etiketi ve LOT okutma (#1060)', () => {
  const ETIKET = {
    partiId: 4, lotNo: 'LT-000123', malzemeId: 901, malzemeAd: 'Deneme sac', malzemeKod: 'HM-001', malzemeTuru: 'hammadde', tedarikciPartiNo: null, dokumNo: 'D-7', sertifikaNo: null,
    giris: '2026-10-13T09:00:00+03:00', miktar: '12.000', birim: 'kg', belgeNo: 'MK-000012', sira: 1,
  } satisfies LotEtiketi;
  const LOT = { tur: 'lot', parti: { id: 4, lotNo: 'LT-000123', etiket: 'LT-000123 · döküm D-7' }, ozet: { id: 901, tur: 'hammadde', kod: 'HM-001', ad: 'Deneme sac', onayDurumu: 'aktif', kullanilabilir: true, birim: 'kg' }, toplam: '3', bakiyeler: [BAKIYE] } as const;

  it('etiket satırları yalnız dolu alanları basar; basım belgesi 100x50 mm ve her kopya bir sayfa', () => {
    const satirlar = lotEtiketSatirlari(ETIKET);
    expect(satirlar).toEqual(['Deneme sac · HM-001', 'Kart 901 · Hammadde', 'Döküm D-7', '13.10.2026 · 12 kg · MK-000012']);
    expect(satirlar.join(' ')).not.toMatch(/Parti|Sertifika|null/);
    const html = lotEtiketHtml([{ e: ETIKET, adet: 3 }]);
    expect(html).toContain('@page{size:100mm 50mm;margin:0}');
    expect(html.match(/class="e"/g)).toHaveLength(3);
  });
  it('sevkiyatta okutulan lot o lottan düşülür', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/kod-coz': () => json(200, LOT),
      'POST /stok/cikis': () => json(200, { hareketIdler: [77] }),
    });
    ac('/stok/okut?mod=sevkiyat');
    fireEvent.change(await screen.findByLabelText('Kod'), { target: { value: 'LOT:LT-000123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    expect(await screen.findByText('LT-000123')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Stoktan düş' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/cikis')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/cikis')!.govde).toMatchObject({ malzemeId: 901, konumId: 3, partiId: 4 });
  });
  it('sepette okutulan lotta en eski giriş seçeneği yoktur; lotun gözü seçili gelir', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/kod-coz': () => json(200, LOT),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [] }),
    });
    ac('/stok/okut?mod=sepet');
    fireEvent.change(await screen.findByLabelText('Kod'), { target: { value: 'LT-000123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bul' }));
    const pencere = await screen.findByRole('dialog', { name: /Sepete ekle: Deneme sac · LT-000123/ });
    expect(within(pencere).queryByText('Otomatik')).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sepete ekle' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/sepet/satir-ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')!.govde).toMatchObject({ malzemeId: 901, kaynakKonumId: 3, partiId: 4 });
  });
  it('mal kabul belgesinden lot etiketleri basılır', async () => {
    const belge = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-13T09:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null } as const;
    sunucuKur(DEPOCU, {
      'GET /stok/mal-kabuller/12': () => json(200, { belge, satirlar: [{ sira: 1, malzemeId: 901, malzemeAd: 'Deneme sac', sayilanMiktar: '12.000', partiId: 4, partiEtiketi: 'LT-000123 · döküm D-7', partiBelgeleri: [], konumKod: 'KABUL', hareketId: 31, siparisSatirId: null, fason: null, logoDurumu: 'irsaliye_bekleniyor', logoIrsaliyeSatirNo: null, logoIrsaliyeMiktari: null }] } satisfies MalKabulAyrintiCevabi),
      'GET /stok/mal-kabuller/12/lot-etiketleri': () => json(200, { etiketler: [ETIKET] } satisfies LotEtiketleriCevabi),
    });
    ac('/stok/mal-kabul/12');
    fireEvent.click(await screen.findByRole('button', { name: 'Lot etiketlerini bas' }));
    const p = await screen.findByRole('dialog', { name: 'MK-000012 lot etiketleri' });
    expect(await within(p).findByText('LT-000123')).toBeTruthy();
    expect(within(p).getByRole('img', { name: 'QR: LOT:LT-000123' })).toBeTruthy();
    expect(within(p).getByRole('button', { name: 'Yazdır (1)' })).toBeTruthy();
  });
  it("270 a: Etiket Merkezi sayfası olan, mal kabulün bütün lot etiketlerini Etiket Merkezi'nde açar", async () => {
    const belge = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-13T09:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null } as const;
    sunucuKur({ ...DEPOCU, islemler: [...DEPOCU.islemler, 'sayfa.etiket-merkezi'] }, {
      'GET /stok/mal-kabuller/12': () => json(200, { belge, satirlar: [{ sira: 1, malzemeId: 901, malzemeAd: 'Deneme sac', sayilanMiktar: '12.000', partiId: 4, partiEtiketi: 'LT-000123 · döküm D-7', partiBelgeleri: [], konumKod: 'KABUL', hareketId: 31, siparisSatirId: null, fason: null, logoDurumu: 'irsaliye_bekleniyor', logoIrsaliyeSatirNo: null, logoIrsaliyeMiktari: null }] } satisfies MalKabulAyrintiCevabi),
    });
    ac('/stok/mal-kabul/12');
    const bas = await screen.findByRole('link', { name: /Lot etiketlerini bas/ });
    expect(bas.getAttribute('href')).toBe('/etiket-merkezi?tur=mal-kabul&id=12');
  });
});

describe('Konum türü (#1304)', () => {
  const konum = (o: Partial<KonumAyrintiCevabi['konum']>): KonumAyrintiCevabi => ({
    konum: { id: 31, kod: 'HRD-01', tur: 'depo_zemini', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 3, ...o },
    raf: null, bakiyeler: [], haritaYeri: null, zemin: null,
  });
  it('DEP-62: elle açılan konumun türü hurdaya çevrilir ve gövdeye yazılır', async () => {
    const istekler = sunucuKur(MUDUR, { 'GET /stok/konumlar/31': () => json(200, konum({})), 'POST /stok/konumlar/31/duzenle': () => json(200, { konum: konum({ tur: 'hurda' }).konum }) });
    ac('/stok/konumlar/31');
    fireEvent.click(await screen.findByRole('button', { name: /Türü değiştir/ }));
    const p = await screen.findByRole('dialog', { name: 'Konum türü' });
    fireEvent.change(within(p).getByLabelText('Tür'), { target: { value: 'hurda' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/konumlar/31/duzenle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/konumlar/31/duzenle')!.govde).toEqual({ surum: 3, kod: 'HRD-01', ad: null, tur: 'hurda' });
  });
  it('DEP-62: haritaya bağlı konumda ve tanım yetkisi olmayanda tür düğmesi yok', async () => {
    sunucuKur(MUDUR, { 'GET /stok/konumlar/31': () => json(200, { ...konum({ haritaAlanId: 4 }), haritaYeri: 'Hurda kasası' }) });
    ac('/stok/konumlar/31');
    await screen.findByRole('heading', { name: 'HRD-01' });
    expect(screen.queryByRole('button', { name: /Türü değiştir/ })).toBeNull();
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /stok/konumlar/31': () => json(200, konum({})) });
    ac('/stok/konumlar/31');
    await screen.findByRole('heading', { name: 'HRD-01' });
    expect(screen.queryByRole('button', { name: /Türü değiştir/ })).toBeNull();
  });
});

describe('Zemin ızgarası (#1304)', () => {
  const ZEMIN = {
    bolumler: [{
      salonId: 4, kod: 'ZM-1', ad: 'Zemin', surum: 6, depoKod: null, sutunlar: ['A', 'B', 'C'], satirlar: ['1', '2'],
      nesneler: [{ tur: 'alan', id: 9, kod: null, ad: 'Hurda kasası', altTur: 'hurda', hucre: 'B2' }, { tur: 'istasyon', id: 3, kod: 'CNC-1', ad: 'Deneme torna', altTur: 'talasli', hucre: 'A1' }],
      konumlar: [{ id: 41, kod: 'ALAN-9', tur: 'hurda', hucre: 'B2', satirSayisi: 2 }],
    }],
    istasyonlar: [{ id: 3, kod: 'CNC-1', ad: 'Deneme torna', tip: 'talasli', salonId: 4 }, { id: 5, kod: 'CNC-2', ad: 'Deneme freze', tip: 'talasli', salonId: null }],
  } satisfies ZeminCevabi;
  const yollar = { 'GET /stok/zemin': () => json(200, ZEMIN), 'GET /stok/konumlar': () => json(200, bosListe) };

  it('kareler haritanın harf ve numarasıyla gelir; öğe simgesi ve stok sayısı karede, ayrıntısı panelde görünür; okuyucu atayamaz', async () => {
    sunucuKur(OKUYUCU, yollar);
    ac('/stok/konumlar');
    const tablo = await screen.findByRole('table', { name: 'ZM-1 zemin ızgarası' });
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['', 'A', 'B', 'C']);
    const b2 = within(tablo).getByRole('button', { name: 'Kare B2, 1 öğe, 2 stok satırı' });
    expect(b2.querySelector('[data-simge="hurda"]')).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: /Kare A1, 1 öğe/ }).querySelector('[data-simge="torna"]')).toBeTruthy();
    fireEvent.click(b2);
    expect(await screen.findByText('Hurda kasası')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ALAN-9' }).getAttribute('href')).toBe('/stok/konumlar/41');
    expect(screen.queryByLabelText('Kareye ata')).toBeNull();
  });

  it('haritayı düzenleyen kareye istasyon atar; atama haritaya yazılır, stok tanımı olan kişide ardından eşleme koşar', async () => {
    const istekler = sunucuKur({ ...MUDUR, islemler: [...MUDUR.islemler, 'atolye.yaz'] }, {
      ...yollar, 'GET /stok/sepet': () => json(200, { satirlar: [] }),
      'POST /atolye/salonlar/4/hucre-ata': () => json(200, {}), 'POST /stok/konumlar/haritadan-esle': () => json(200, { eklenen: 0, guncellenen: 0, kapatilan: 0, atlanan: [], koduDegisenler: [] }),
    });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('button', { name: /Kare C1/ }));
    fireEvent.change(await screen.findByLabelText('Kareye ata'), { target: { value: 'istasyon' } });
    fireEvent.change(screen.getByLabelText(/^İstasyon/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ata' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/konumlar/haritadan-esle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/atolye/salonlar/4/hucre-ata')!.govde).toEqual({ surum: 6, hucre: 'C1', atama: { tur: 'istasyon', istasyonId: 5 } });
  });
});
