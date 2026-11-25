import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IrsaliyeGonderimDurumuCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { GunPlaniCevabi, Is, SoforKimligiDurumu, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { GUN_PLANI } from './test-verisi.ts';
import { logoIrsaliyeGorunumu } from './LogoIrsaliyeDurumu.tsx';
import { kimlikGirdisi, kimlikHatasi } from './SoforKimligiAlani.tsx';
import { YukleAdimi } from './YukleAdimi.tsx';

// Kart 3694 ekran dilimi: Logo irsaliye durumu ve şoför kimlik alanı. Veri uydurma (DENEME-); kimlik numaraları sentetik ve sağlaması tutar ya da tutmaz diye seçilmiştir.
const GECERLI = '10000000146';
const GECERSIZ = '10000000147';
const kullanici = (ek: Kullanici['islemler']): Kullanici => ({ id: 5, ad: 'Deneme Depocu', islemler: ['sayfa.sevkiyat', 'sevkiyat.oku', 'sevkiyat.is-yaz', 'stok.cikis', ...ek] });
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const kalem = (k: Partial<TumIsSatiri>): TumIsSatiri => ({
  anahtar: 'kalem:31', kalemId: 31, kaynak: 'urun', yon: 'gidis', asama: 'depoda', hazirTarihi: null, istenenTarih: null, uretimEmriId: null, emirNo: null,
  isEmriId: null, opNo: null, adim: null, ilerleme: null, siparisNo: null, malzemeNo: null, malzemeAd: 'Deneme mamul', adet: '3.0000', firmaId: null, firmaAd: null,
  noktaId: null, tasima: 'biz', elleTuru: null, aciklama: null, is: { id: 1, tarih: GUN_PLANI.tarih, durum: 'yolda', tetiklendi: '2026-10-08T08:00:00+03:00' },
  depo: null, erken: null, sonYazan: null, bagliAnahtar: null, ...k,
}) as TumIsSatiri;
const satir = (durum: IrsaliyeGonderimDurumuCevabi['satirlar'][number]['durum'], ek: Partial<IrsaliyeGonderimDurumuCevabi['satirlar'][number]> = {}) =>
  ({ belgeTuru: 'satis-irsaliyesi' as const, belgeNo: 1, durum, kayitNo: null, hata: null, sonrakiDeneme: null, ...ek });

function kur(o: { logo: IrsaliyeGonderimDurumuCevabi; kimlik?: SoforKimligiDurumu; ek?: Kullanici['islemler'] }) {
  const istekler: { yontem: string; yol: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: ayar?.method ?? 'GET', yol });
    if (yol === '/oturum') return json(200, { kullanici: kullanici(o.ek ?? []) } satisfies OturumCevabi);
    if (yol.startsWith('/logo/irsaliye-gonderim-durumu')) return json(200, o.logo);
    if (yol === '/sevkiyat/isler/1/sofor-kimligi' && (ayar?.method ?? 'GET') === 'GET') return json(200, o.kimlik ?? { acik: true, var: false, maskeli: null, yazilma: null });
    if (yol === '/sevkiyat/isler/1/sofor-kimligi') return json(200, { acik: true, var: true, maskeli: '********146', yazilma: '2026-11-25T09:00:00+03:00' });
    if (yol === '/sevkiyat/isler/1/sofor-kimligi/oku') return json(200, { kimlik: GECERLI });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const isler = new Map(GUN_PLANI.isler.map((x) => [x.id, { ...x, durum: x.id === 3 ? 'tamamlandi' as const : 'yolda' as const }]));
  const veri = { ...GUN_PLANI, onaylandi: '2026-10-08T07:00:00+03:00' } as GunPlaniCevabi;
  const noktalar = new Map(GUN_PLANI.noktalar.map((n) => [n.id, n]));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sonuc = render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>
    <YukleAdimi veri={veri} isler={isler as ReadonlyMap<number, Is>} noktalar={noktalar} kalemler={new Map([[1, [kalem({})]]])} aracsiz={[]} onayli isYazabilir />
  </MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return { istemci, sonuc };
}
// Tam kimlik hiçbir önbellekte (sorgu ya da mutation: durum, gövde, cevap) durmamalı.
const onbellekteKimlik = (istemci: QueryClient, deger: string): boolean =>
  JSON.stringify([...istemci.getMutationCache().getAll().map((m) => m.state), ...istemci.getQueryCache().getAll().map((q) => q.state)]).includes(deger);
const teslimDuragi = async () => {
  const arac = await screen.findByRole('region', { name: 'Kamyonet 1' });
  return within(arac).getAllByRole('listitem')[2]!;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo irsaliye durumu ve şoför kimlik alanı (3694)', () => {
  it('ayar kapalıyken (acik=false) ne rozet ne açıklama ne kimlik alanı çizilir', async () => {
    kur({ logo: { acik: false, satirlar: [] } });
    ac();
    const durak = await teslimDuragi();
    await waitFor(() => expect(durak.textContent).toContain('Çıkış bekliyor'));
    expect(durak.textContent).not.toMatch(/Logo/);
    fireEvent.click(within(durak).getByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).queryByText('Neden isteniyor')).toBeNull();
  });

  it('açıkken satır yoksa "Logo\'ya gitmedi", hatada rozet ve metin satırın altında yazar, belirsizde yeniden gönder yoktur', async () => {
    kur({ logo: { acik: true, satirlar: [] } });
    ac();
    expect(await within(await teslimDuragi()).findByText("Logo'ya gitmedi")).toBeTruthy();
    cleanup(); vi.unstubAllGlobals();
    kur({ logo: { acik: true, satirlar: [satir('hata', { hata: 'ORN cari kodu bulunamadı.' })] } });
    ac();
    const hataDuragi = await teslimDuragi();
    expect(await within(hataDuragi).findByText('Gönderilemedi')).toBeTruthy();
    expect(within(hataDuragi).getByRole('alert').textContent).toContain('ORN cari kodu bulunamadı.');
    cleanup(); vi.unstubAllGlobals();
    kur({ logo: { acik: true, satirlar: [satir('belirsiz')] } });
    ac();
    const belirsiz = await teslimDuragi();
    expect(await within(belirsiz).findByText('Sonucu belirsiz')).toBeTruthy();
    expect(belirsiz.textContent).toContain("Önce Logo'da kontrol edin, yeniden göndermeyin.");
    expect(within(belirsiz).queryByRole('button', { name: /gönder/i })).toBeNull();
  });

  it('kimlik alanı: boş, yazılıyor, geçersiz ve geçerli; geçersizde Kaydet kapalı', async () => {
    const istekler = kur({ logo: { acik: true, satirlar: [] } });
    ac();
    fireEvent.click(within(await teslimDuragi()).getByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    const alan = await within(pencere).findByLabelText('Şoför kimlik no');
    const kaydet = within(pencere).getByRole('button', { name: 'Kimliği kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(alan, { target: { value: '1000000014' } });
    expect(within(pencere).getByText('10 / 11 hane')).toBeTruthy();
    fireEvent.change(alan, { target: { value: GECERSIZ } });
    expect(within(pencere).getByRole('alert').textContent).toContain('Geçersiz kimlik numarası');
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(alan, { target: { value: GECERLI } });
    expect(kaydet.disabled).toBe(false);
    expect(istekler.some((i) => i.yol.endsWith('/oku'))).toBe(false);
  });

  it('kayıtlı kimlik maskelidir; "Kimliği göster" yalnız okuma yetkisinde çıkar ve tam değeri yalnız basınca ister', async () => {
    const kimlik = { acik: true, var: true, maskeli: '********146', yazilma: '2026-11-25T09:00:00+03:00' };
    kur({ logo: { acik: true, satirlar: [] }, kimlik });
    ac();
    fireEvent.click(within(await teslimDuragi()).getByRole('button', { name: 'Değiştir' }));
    let pencere = await screen.findByRole('dialog');
    expect(((await within(pencere).findByLabelText('Şoför kimlik no')) as HTMLInputElement).value).toBe('********146');
    expect(within(pencere).queryByRole('button', { name: 'Kimliği göster' })).toBeNull();
    expect(pencere.textContent).toContain('sizde yok, yalnız son üç hane görünür');
    expect(pencere.textContent).not.toContain('sofor-kimlik-oku');
    expect(pencere.textContent).toContain('Sevk tarihinden 90 gün sonra kendiliğinden silinir.');
    cleanup(); vi.unstubAllGlobals();
    const istekler = kur({ logo: { acik: true, satirlar: [] }, kimlik, ek: ['sevkiyat.sofor-kimlik-oku'] });
    const { istemci, sonuc } = ac();
    fireEvent.click(within(await teslimDuragi()).getByRole('button', { name: 'Değiştir' }));
    pencere = await screen.findByRole('dialog');
    await within(pencere).findByLabelText('Şoför kimlik no');
    expect(istekler.some((i) => i.yol.endsWith('/oku'))).toBe(false);
    fireEvent.click(await within(pencere).findByRole('button', { name: 'Kimliği göster' }));
    await waitFor(() => expect(((within(pencere).getByLabelText('Şoför kimlik no')) as HTMLInputElement).value).toBe(GECERLI));
    // N1: gösterilirken bile cevap sorgu önbelleğinde durmaz; mutation önbelleği işlem sürerken tutar, Gizle ve kapatmada boşalır.
    expect(istemci.getQueryCache().getAll().some((q) => JSON.stringify(q.state).includes(GECERLI))).toBe(false);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sil' }));
    // Silme onayı açılınca tam değer maskelenir.
    expect(((within(pencere).getByLabelText('Şoför kimlik no')) as HTMLInputElement).value).toBe('********146');
    expect(within(pencere).getByText('Kimlik numarası silinsin mi?')).toBeTruthy();
    expect(istekler.some((i) => i.yol.endsWith('/sil'))).toBe(false);
    fireEvent.click(within(within(pencere).getByRole('alertdialog')).getByRole('button', { name: 'Vazgeç' }));
    expect(within(pencere).queryByText('Kimlik numarası silinsin mi?')).toBeNull();
    await waitFor(() => expect(onbellekteKimlik(istemci, GECERLI)).toBe(false));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kimliği göster' }));
    await waitFor(() => expect(((within(pencere).getByLabelText('Şoför kimlik no')) as HTMLInputElement).value).toBe(GECERLI));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Gizle' }));
    expect(((within(pencere).getByLabelText('Şoför kimlik no')) as HTMLInputElement).value).toBe('********146');
    await waitFor(() => expect(onbellekteKimlik(istemci, GECERLI)).toBe(false));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kimliği göster' }));
    await waitFor(() => expect(((within(pencere).getByLabelText('Şoför kimlik no')) as HTMLInputElement).value).toBe(GECERLI));
    sonuc.unmount();
    await waitFor(() => expect(onbellekteKimlik(istemci, GECERLI)).toBe(false));
  });

  it('kaydedilmemiş kimlikle alttaki Kaydet irsaliyeyi yazmaz ve uyarır; alan boşalınca yazar', async () => {
    const istekler = kur({ logo: { acik: true, satirlar: [] } });
    ac();
    fireEvent.click(within(await teslimDuragi()).getByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    const alan = await within(pencere).findByLabelText('Şoför kimlik no');
    fireEvent.change(alan, { target: { value: GECERLI } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText(/henüz kaydedilmedi/)).toBeTruthy();
    expect(istekler.some((i) => i.yol.endsWith('/belge-no'))).toBe(false);
    expect(within(pencere).getByText("Kimlik, irsaliye no'dan ayrı kaydedilir.")).toBeTruthy();
  });

  it('N1: kimlik kaydedilince yazılan değer ve cevap mutation önbelleğinde kalmaz', async () => {
    kur({ logo: { acik: true, satirlar: [] } });
    const { istemci } = ac();
    fireEvent.click(within(await teslimDuragi()).getByRole('button', { name: 'Değiştir' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(await within(pencere).findByLabelText('Şoför kimlik no'), { target: { value: GECERLI } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kimliği kaydet' }));
    await waitFor(() => expect(within(pencere).queryByRole('button', { name: 'Kimliği kaydet' })).toBeTruthy());
    await waitFor(() => expect(onbellekteKimlik(istemci, GECERLI)).toBe(false));
  });
});

describe('Logo irsaliye görünümü ve kimlik girdisi (saf kurallar)', () => {
  it('görünüm: satır yoksa gitmedi; gitti kayıt no yazar; hata ve belirsiz açıklama taşır, diğerleri taşımaz', () => {
    expect(logoIrsaliyeGorunumu(undefined)).toMatchObject({ metin: "Logo'ya gitmedi", aciklama: null });
    expect(logoIrsaliyeGorunumu(satir('gitti', { kayitNo: '501' })).metin).toBe("Logo'da · 501");
    expect(logoIrsaliyeGorunumu(satir('sirada')).aciklama).not.toBeNull();
    expect(logoIrsaliyeGorunumu(satir('hata', { hata: null })).aciklama).toContain('Logo cevabı alınamadı.');
    expect(logoIrsaliyeGorunumu(satir('hata', { hata: 'ORN', sonrakiDeneme: '2026-11-25T10:00:00+03:00' })).aciklama).toContain('kendiliğinden yeniden deneyecek');
    expect(logoIrsaliyeGorunumu(satir('hata', { hata: 'ORN' })).aciklama).toContain('Kendiliğinden yeniden gönderilmez');
    expect(logoIrsaliyeGorunumu(satir('belirsiz')).ton).toBe('uyari');
  });
  it('girdi: rakam dışı atılır, 11 haneye kesilir; hata mesajı hane sayısı ve sağlama için', () => {
    expect(kimlikGirdisi('100 000-00.146 99')).toBe(GECERLI);
    expect(kimlikHatasi('')).toBeNull();
    expect(kimlikHatasi('123')).toBe('3 / 11 hane');
    expect(kimlikHatasi(GECERSIZ)).toContain('Geçersiz');
    expect(kimlikHatasi(GECERLI)).toBeNull();
  });
});
