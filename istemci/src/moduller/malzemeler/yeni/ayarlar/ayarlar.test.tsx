import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import { OKUYAN, YONETICI, json, sunucuKur, yeniEkranAc, type Istek } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KOK = '/malzemeler/ayarlar';
const yaz = (anahtar: string) => `POST /malzeme-katalogu-ayarlari/${anahtar}/kaydet`;
const kayitlar = (istekler: Istek[], anahtar: string) => istekler.filter((i) => i.yontem === 'POST' && i.yol === `/malzeme-katalogu-ayarlari/${anahtar}/kaydet`);
const tamam = () => json(200, { surum: 4 });
// Ayar yazamayan (213 a: sunucu `ayarYazabilir` false der).
const SALT_OKUR = { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, rol: 'talep', ayarYazabilir: false }) };

describe('Malzeme ayarları: bölümler ve gezinme', () => {
  test('Genel bakış açılır; menü prototipin sırasındadır, Değişiklik kaydı yoktur (210.3)', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(KOK);
    expect(await screen.findByRole('heading', { name: 'Malzeme ayarları', level: 3 })).toBeTruthy();
    const menu = screen.getByRole('navigation', { name: 'Malzeme ayarları bölümleri' });
    const adlar = within(menu).getAllByRole('button').map((b) => b.textContent);
    expect(adlar).toEqual([
      'Genel bakış', 'Aileler ve sınıflar', 'Kaliteler', 'Teknik özellikler', 'Durum ve işlem seçenekleri', 'Sınıf varsayılanları', 'Tolerans normları',
      'Ad, açıklama ve zorunlu alanlar', 'Yarı mamul alanları', 'Mamul alanları', 'Sarf kategorileri', 'Demirbaş kategorileri',
      'Sertifikalar', 'Stok birimleri', 'Belge türleri', 'Roller ve yetkiler',
    ]);
    expect(within(menu).getByRole('button', { name: 'Genel bakış' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByText(/Değişiklik kaydı/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Dışa aktar' })).toBeTruthy();
  });

  test('menü bölümü adrese yazar; bilinmeyen bölüm Genel bakış açar', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(`${KOK}?bolum=bilinmeyen`);
    const menu = await screen.findByRole('navigation', { name: 'Malzeme ayarları bölümleri' });
    expect(within(menu).getByRole('button', { name: 'Genel bakış' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(menu).getByRole('button', { name: 'Sertifikalar' }));
    expect(await screen.findByRole('heading', { name: 'Sertifikalar' })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Sertifikalar' }).getAttribute('aria-current')).toBe('page');
  });

  test('sihirbazdan gelince "Karta dön" bandı görünür', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(`${KOK}?bolum=sarf&don=kart`);
    fireEvent.click(await screen.findByRole('button', { name: 'Karta dön' }));
    expect(await screen.findByRole('heading', { name: 'Tür ve aile' })).toBeTruthy();
  });
});

describe('Malzeme ayarları: yazma (izinli)', () => {
  test('sertifika listesine değer eklenir; ayar son okunan sürümle yazılır', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=sertifika`);
    const kutu = await screen.findByLabelText('Sertifika ve uygunluk: yeni değer');
    fireEvent.change(kutu, { target: { value: 'Örnek sertifika' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
    const govde = kayitlar(istekler, 'malzeme')[0]?.govde as { deger: { listeler: Record<string, unknown>; favoriler: string[] }; surum: number };
    expect(govde.surum).toBe(3);
    expect(govde.deger.listeler['sertifika']).toEqual({ ekle: ['Örnek sertifika'], gizle: [] });
    expect(govde.deger.favoriler).toEqual(['metal|islah|C45']);
    expect(await screen.findByText('"Örnek sertifika" eklendi.')).toBeTruthy();
  });

  test('listede olan değer yeniden eklenmez, sunucuya gidilmez', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=sertifika`);
    fireEvent.change(await screen.findByLabelText('Sertifika ve uygunluk: yeni değer'), { target: { value: 'EN 10204 3.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText('"EN 10204 3.1" zaten listede.')).toBeTruthy();
    expect(kayitlar(istekler, 'malzeme')).toHaveLength(0);
  });

  test('aile kapatılır', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=aile`);
    fireEvent.click(await screen.findByRole('switch', { name: 'Plastik: kullanımda, gizlemek için kapat' }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
    expect((kayitlar(istekler, 'malzeme')[0]?.govde as { deger: { gizliAileler: string[] } }).deger.gizliAileler).toEqual(['plastik']);
  });

  test('sınıfa yeni kalite eklenir; yoğunluk yoksa uyarı verilir', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=kalite`);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni kalite' }));
    fireEvent.change(screen.getByLabelText('Kalite kodu'), { target: { value: 'ör-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaliteyi ekle' }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
    const k = (kayitlar(istekler, 'malzeme')[0]?.govde as { deger: { kaliteler: { fam: string; kod: string }[] } }).deger.kaliteler;
    expect(k.map((x) => [x.fam, x.kod])).toEqual([['metal', 'OR-1']]);
    expect(await screen.findByText('Uyarı: yoğunluk girilmedi; bu kalitede ağırlık hesaplanamaz.')).toBeTruthy();
  });

  test('sunucu reddederse kendi iletisi gösterilir ve ekran kayıtlı ayara döner', async () => {
    sunucuKur(YONETICI, { [yaz('malzeme')]: () => json(409, { kod: 'CAKISMA', mesaj: 'Ayar başkası tarafından değiştirildi; sayfayı yenile.' }) });
    yeniEkranAc(`${KOK}?bolum=aile`);
    const anahtar = await screen.findByRole('switch', { name: 'Plastik: kullanımda, gizlemek için kapat' });
    fireEvent.click(anahtar);
    expect(await screen.findByText('Ayar başkası tarafından değiştirildi; sayfayı yenile.')).toBeTruthy();
    expect((await screen.findByRole('switch', { name: 'Plastik: kullanımda, gizlemek için kapat' })).getAttribute('aria-checked')).toBe('true');
  });

  test('yeni aile rengi tasarım değişkenleri arasından seçilir (465/2 b); aile kaydedilir', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=aile`);
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni aile' }));
    const renkler = screen.getByRole('radiogroup', { name: 'Renk' });
    expect(within(renkler).getAllByRole('radio')).toHaveLength(8);
    fireEvent.click(within(renkler).getByRole('radio', { name: 'Turuncu' }));
    expect(within(renkler).getByRole('radio', { name: 'Turuncu' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByLabelText('Aile adı'), { target: { value: 'Deneme ailesi' } });
    fireEvent.change(screen.getByLabelText('Kod (3 harf)'), { target: { value: 'DNA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aileyi ekle' }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
  });

  test('firma kodu biçimi denetlenir; geçerli kod genel ayara yazılır', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('genel')]: tamam });
    yeniEkranAc(`${KOK}?bolum=kural`);
    const kutu = await screen.findByLabelText('Firma kodu (firma kodlu türlerde kodun başı)');
    fireEvent.change(kutu, { target: { value: 'MM' } });
    fireEvent.blur(kutu);
    expect(await screen.findByText(/Firma kodu 2-5 harf ya da rakam olmalı/)).toBeTruthy();
    expect(kayitlar(istekler, 'genel')).toHaveLength(0);
    fireEvent.change(kutu, { target: { value: 'abc' } });
    fireEvent.blur(kutu);
    await waitFor(() => expect(kayitlar(istekler, 'genel')).toHaveLength(1));
    expect((kayitlar(istekler, 'genel')[0]?.govde as { deger: Record<string, unknown> }).deger).toMatchObject({ firmaKodu: 'ABC', kodYapisi: 'standart', acUzunluk: 40 });
  });

  test('1879: hammaddede kalite, form, ölçü, durum ve yüzey çakışma alanı olarak seçilebilir; varsayılan kural seçili görünür', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=kural`);
    await screen.findByRole('textbox', { name: 'Kart adı' });
    fireEvent.click(screen.getByRole('button', { name: 'Hammadde' }));
    const bolge = within(screen.getByRole('region', { name: 'Çakışma kontrolü' }));
    const adlar = bolge.getAllByRole('checkbox').map((x) => x.getAttribute('aria-label') ?? x.closest('label')?.textContent ?? '');
    expect(adlar[0]).toMatch(/^Varsayılan kural \(önerilen\): aynı kalite .*form ve ölçü/);
    for (const ad of ['Kart adı', 'Açıklama 1, 2, 3', 'Kalite', 'Form', 'Ölçü (formuyla)', 'Durum', 'Yüzey']) expect(adlar).toContain(ad);
    fireEvent.click(bolge.getByRole('checkbox', { name: 'Kalite' }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
    expect((kayitlar(istekler, 'malzeme')[0]?.govde as { deger: { kurallar: Record<string, { cakisma?: string[] }> } }).deger.kurallar['hammadde']?.cakisma).toEqual(['_varsayilan', '_kalite']);
  });

  test('tür kuralı: ad kalıbı, zorunlu alan ve çakışma alanı türün kuralına yazılır', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=kural`);
    const kalip = await screen.findByRole('textbox', { name: 'Kart adı' });
    fireEvent.change(kalip, { target: { value: '{OTO}; {musteri}' } });
    fireEvent.blur(kalip);
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
    const kural = (i: number) => (kayitlar(istekler, 'malzeme')[i]?.govde as { deger: { kurallar: Record<string, Record<string, unknown>> } }).deger.kurallar['mamul'];
    expect(kural(0)).toMatchObject({ ad: '{OTO}; {musteri}' });

    const zorunlu = screen.getAllByRole('checkbox', { name: / zorunlu$/ }).find((x) => !(x as HTMLInputElement).disabled && !(x as HTMLInputElement).checked);
    if (!zorunlu) throw new Error('isteğe bağlı alan yok');
    fireEvent.click(zorunlu);
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(2));
    expect(Object.values(kural(1)?.['zorunlu'] as Record<string, boolean>)).toEqual([true]);

    // 1879: varsayılan kural listenin başında seçili durur; alan seçilince kapanır ve ekran bunu söyler.
    const bolge = within(screen.getByRole('region', { name: 'Çakışma kontrolü' }));
    const varsayilan = bolge.getByRole('checkbox', { name: /^Varsayılan kural \(önerilen\)/ }) as HTMLInputElement;
    expect(varsayilan.checked).toBe(true);
    expect(bolge.queryByRole('status')).toBeNull();
    const cakisma = bolge.getAllByRole('checkbox')[1];
    if (!cakisma) throw new Error('çakışma alanı yok');
    fireEvent.click(cakisma);
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(3));
    expect(kural(2)?.['cakisma']).toEqual(['_varsayilan', '_ad']);
    await waitFor(() => expect(bolge.getByRole('status').textContent).toMatch(/Varsayılan kural ve Kart adı birlikte aranır.*boş olan kart hiç denetlenmez/));
    expect((bolge.getByRole('checkbox', { name: /^Varsayılan kural/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(bolge.getByRole('checkbox', { name: /^Varsayılan kural/ }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(4));
    expect(kural(3)?.['cakisma']).toEqual(['_ad']);
    await waitFor(() => expect(bolge.getByRole('status').textContent).toMatch(/Varsayılan kural kapalı: yalnız Kart adı/));
  });

  test('1948 a: yer tutucu tıklanınca son odaklanan kalıbın sonuna eklenir; yazılıp kaydedilmemiş metin kaybolmaz', async () => {
    const istekler = sunucuKur(YONETICI, { [yaz('malzeme')]: tamam });
    yeniEkranAc(`${KOK}?bolum=kural`);
    const kural = (i: number) => (kayitlar(istekler, 'malzeme')[i]?.govde as { deger: { kurallar: Record<string, { ad?: string; ac?: string[] }> } }).deger.kurallar['mamul'];
    const grup = within(await screen.findByRole('group', { name: 'Yer tutucular' }));

    // Odak yoksa hedef Kart adı.
    fireEvent.click(grup.getByRole('button', { name: /^\{AD\} .*: Kart adı kalıbına ekle$/ }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(1));
    expect(kural(0)?.ad).toBe('{AD}');

    // Açıklama 2'ye yazılır, kutudan çıkılmadan yer tutucu tıklanır: önce yazılan kaydedilir, yer tutucu onun sonuna eklenir.
    const ac2 = screen.getByRole('textbox', { name: 'Açıklama 2' });
    fireEvent.focus(ac2);
    fireEvent.change(ac2, { target: { value: 'Ek' } });
    fireEvent.blur(ac2);
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(2));
    fireEvent.click(grup.getByRole('button', { name: /^\{OTO\} .*: Açıklama 2 kalıbına ekle$/ }));
    await waitFor(() => expect(kayitlar(istekler, 'malzeme')).toHaveLength(3));
    expect(kural(2)?.ac?.[1]).toBe('Ek {OTO}');
    expect(kural(2)?.ad).toBe('{AD}');
    expect(((await screen.findByRole('textbox', { name: 'Açıklama 2' })) as HTMLInputElement).value).toBe('Ek {OTO}');
  });

  test('üst baştaki Ayarlar penceresi sunucunun ayarlarını kilitli gösterir; mükerrer tarama yapılır', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(KOK);
    fireEvent.click(await screen.findByRole('button', { name: 'Ayarlar' }));
    const pencere = await screen.findByRole('dialog', { name: 'Ayarlar' });
    const onay = within(pencere).getByLabelText('Yeni ve değişen kartlar onaydan sonra aktif olsun');
    expect((onay as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Firma kodu (firma kodlu türlerde kodun başı)') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kataloğu tara' }));
    expect(await screen.findByText('Mükerrer kart bulunamadı.')).toBeTruthy();
  });
});

describe('Malzeme ayarları: yalnız görme (reddedilen)', () => {
  test('ayar yazamayan değiştirme düğmelerini görmez; anahtarlar kilitlidir', async () => {
    const istekler = sunucuKur(OKUYAN, SALT_OKUR);
    yeniEkranAc(`${KOK}?bolum=aile`);
    expect(await screen.findByText('Malzeme ayarlarını yalnız yetkili kişi değiştirebilir; burada yalnız görüntülenir.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Yeni aile' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yeni sınıf' })).toBeNull();
    const anahtar = screen.getByRole('switch', { name: 'Plastik: kullanımda, gizlemek için kapat' }) as HTMLButtonElement;
    expect(anahtar.disabled).toBe(true);
    fireEvent.click(anahtar);
    expect(kayitlar(istekler, 'malzeme')).toHaveLength(0);
  });

  test('yazamayan Genel bakışta yedek kutusunu, listede ekleme kutusunu görmez', async () => {
    sunucuKur(OKUYAN, SALT_OKUR);
    yeniEkranAc(KOK);
    expect(await screen.findByRole('heading', { name: 'Malzeme ayarları', level: 3 })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Dışa aktar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tüm ayarları sıfırla' })).toBeNull();
    cleanup();
    sunucuKur(OKUYAN, SALT_OKUR);
    yeniEkranAc(`${KOK}?bolum=sertifika`);
    expect(await screen.findByRole('heading', { name: 'Sertifikalar' })).toBeTruthy();
    expect(screen.queryByLabelText('Sertifika ve uygunluk: yeni değer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hiçbirini kullanma' })).toBeNull();
  });

  test('yazamayan tür kurallarını değiştiremez', async () => {
    sunucuKur(OKUYAN, SALT_OKUR);
    yeniEkranAc(`${KOK}?bolum=kural`);
    expect(((await screen.findByLabelText('Şirket kodu + tür + numara')) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('textbox', { name: 'Kart adı' }) as HTMLInputElement).disabled).toBe(true);
    const jetonlar = within(screen.getByRole('group', { name: 'Yer tutucular' })).getAllByRole('button') as HTMLButtonElement[];
    expect(jetonlar.length).toBeGreaterThan(2);
    expect(jetonlar.every((j) => j.disabled), 'yer tutucu düğmeleri kapalı').toBe(true);
    expect(screen.queryByRole('button', { name: 'Bu türü varsayılana döndür' })).toBeNull();
  });
});
