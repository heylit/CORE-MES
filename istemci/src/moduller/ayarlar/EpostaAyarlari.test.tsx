import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  EpostaDefterCevabi, EpostaDurumuCevabi, EpostaSablonDegistirGovdesi, EpostaSablonlariCevabi, EpostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { EpostaAyarlari, EpostaSablonlari } from './EpostaAyarlari.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const DURUM = {
  ortam: 'hazir', ayarAcik: false, kip: 'kurum-ici', adres: '10.0.0.25:25', guvenlik: 'starttls', alanAdlari: ['ornek.local'], gonderen: 'mes@ornek.local',
  kuyrukta: 3, son24Gonderilen: 12, son24Hata: 1, epostasizKisi: 2, sonGonderim: '2026-11-17T09:00:00.000+03:00',
} satisfies EpostaDurumuCevabi;

const TETIK = {
  satirlar: [
    {
      tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', sinif: 'gorev', konu: 'satin-alma', eposta: true,
      zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [], sablonId: null, surum: null,
    },
    {
      tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', onem: 'acil', sinif: 'bilgi', konu: 'uretim', eposta: false,
      zaman: 'hemen', tekrarGun: 2, tekrarEnCok: 3, yukseltGun: 1, yukseltRolIdleri: [2], yukseltKisiIdleri: [], sablonId: 9, surum: 4,
    },
  ],
  roller: [{ id: 1, ad: 'Bakım' }, { id: 2, ad: 'Müdür' }],
  kisiler: [{ id: 7, ad: 'Deneme Kalite' }],
} satisfies EpostaTetikleyicileriCevabi;

const DUZEN = { ustBant: null, onemRozeti: true, altSatir: null, tabloAdlari: {}, dugmeRengi: 'koyu' } as const;
const EK = { baslikKalibi: null, dugmeYazisi: null, onayDugmesi: true, altBilgi: null, serit: 'onem', logo: false, duzen: DUZEN } as const;
const SABLONLAR = {
  satirlar: [
    {
      konu: 'satin-alma', simge: 'cart', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.', tabloAlanlari: ['kayit_no', 'tarih'],
      ...EK, olaySayisi: 1, surum: null, degistirildi: null,
    },
    {
      konu: 'genel', simge: 'bell', konuKalibi: '[CORE MES] {olay}', govde: 'Merhaba {alici_adi}', tabloAlanlari: [], ...EK, olaySayisi: 0, surum: 2,
      degistirildi: '2026-11-17T09:00:00.000+03:00',
    },
  ],
  ozel: [
    {
      id: 9, ad: 'ORN Acil durus', simge: 'alert', konuKalibi: 'Acil: {olay}', baslikKalibi: '{onem} · {olay}', govde: 'Merhaba {alici_adi}', tabloAlanlari: ['kademe'],
      dugmeYazisi: 'Tezgahı aç', onayDugmesi: false, altBilgi: 'Bakım birimi', serit: 'kirmizi', logo: true, duzen: DUZEN, olaySayisi: 1, surum: 3, degistirildi: '2026-11-18T09:00:00.000+03:00',
    },
  ],
} satisfies EpostaSablonlariCevabi;

const DEFTER = {
  satirlar: [
    { id: 5, zaman: '2026-11-17T09:00:00.000+03:00', kisiId: 7, kisiAdi: 'Deneme Kalite', tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', kayitNo: 'ORN-TLP-0042', sonuc: 'gonderildi', neden: null },
    { id: 4, zaman: '2026-11-17T08:00:00.000+03:00', kisiId: 8, kisiAdi: 'Deneme Adressiz', tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', kayitNo: null, sonuc: 'atlandi', neden: 'İK\'da iş e-postası yok' },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
} satisfies EpostaDefterCevabi;

function sunucuKur(kurumLogosu: string | null = null) {
  const yazilanlar: { yol: string; govde: unknown }[] = [];
  const okunanlar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (secenek.method === 'POST') {
      const govde = JSON.parse(secenek.body ?? '{}') as unknown;
      yazilanlar.push({ yol, govde });
      if (yol === '/bildirimler/eposta/deneme') return json(200, { sonuc: 'gonderildi', neden: null });
      if (yol === '/bildirimler/eposta/sina') return json(200, { tamam: false, neden: 'Sunucu STARTTLS sunmuyor' });
      if (yol.startsWith('/bildirimler/eposta/tetikleyiciler/')) return json(200, TETIK);
      if (yol.startsWith('/bildirimler/eposta/sablonlar/') || yol.startsWith('/bildirimler/eposta/ozel-sablonlar/')) return json(200, SABLONLAR);
    }
    okunanlar.push(yol);
    if (yol === '/bildirimler/eposta/durum') return json(200, DURUM);
    if (yol === '/kurum-logosu') return json(200, { logo: kurumLogosu });
    if (yol === '/bildirimler/eposta/tetikleyiciler') return json(200, TETIK);
    if (yol === '/bildirimler/eposta/sablonlar') return json(200, SABLONLAR);
    if (yol.startsWith('/bildirimler/eposta/defter')) return json(200, DEFTER);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return { yazilanlar, okunanlar };
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><EpostaAyarlari gonderimAyarlari={() => <p>Gönderim ayarları listesi</p>} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
  // 3456: ilk sekme Şablonlar; sunucu sınamaları Sunucu sekmesinden başlar.
  fireEvent.click(screen.getByRole('tab', { name: /Sunucu/ }));
}
function sablonAc() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><EpostaSablonlari /></BildirimSaglayici>
    </QueryClientProvider>,
  );
}
const sekme = (ad: string) => { fireEvent.click(screen.getByRole('tab', { name: new RegExp(ad) })); };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('E-posta ayarları (3397, 3435-3)', () => {
  it('sunucu: durum, sayılar ve ortam ayarındaki kilitli değerler görünür; gönderim ayarları altta', async () => {
    sunucuKur();
    ac();
    expect(await screen.findByText('Kapalı')).toBeTruthy();
    expect(screen.getByText('10.0.0.25:25')).toBeTruthy();
    expect(screen.getByText('STARTTLS')).toBeTruthy();
    expect(screen.getByText('mes@ornek.local')).toBeTruthy();
    expect(screen.getByText(/kuyrukta bekler/)).toBeTruthy();
    expect(screen.getByText('Gönderim ayarları listesi')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Sunucu adresi/ })).toBeNull();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Şablonlar', 'Sunucu', 'Gönderim defteri']);
  });

  it('deneme e-postası ve sınama uçlarını çağırır, sonucu bildirir', async () => {
    const { yazilanlar } = sunucuKur();
    ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kendime deneme gönder' }));
    expect(await screen.findByText('Deneme e-postası iş adresinize gönderildi.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bağlantıyı sına' }));
    expect(await screen.findByText(/Sunucu STARTTLS sunmuyor/)).toBeTruthy();
    expect(yazilanlar.map((y) => y.yol)).toEqual(['/bildirimler/eposta/deneme', '/bildirimler/eposta/sina']);
  });

  it('tanımsız sunucuda düğmeler kapalıdır ve neden yazılır', async () => {
    sunucuKur();
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { ...DURUM, ortam: 'tanimsiz', kip: 'dis-servis', adres: null, guvenlik: null, alanAdlari: [], gonderen: null })));
    ac();
    expect(await screen.findByText(/TMIV2_POSTA_DIS_SUNUCUSU/)).toBeTruthy();
    expect(screen.getAllByText('Dış posta servisi').length).toBeGreaterThan(0);
    expect((screen.getByRole('button', { name: 'Kendime deneme gönder' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('şablon: ön izleme canlıdır; bilinmeyen alan kaydı kapatır; kayıt seçili alanlarla gider', async () => {
    const { yazilanlar } = sunucuKur();
    sablonAc();
    const konu = await screen.findByLabelText('Konu satırı');
    const onizleme = screen.getByRole('region', { name: 'Ön izleme' });
    expect(within(onizleme).getByText(/Satın alma talebi onay bekliyor · ORN-0042/)).toBeTruthy();
    fireEvent.change(konu, { target: { value: 'Onay {musteri_adi}' } });
    expect(screen.getByText('Bilinmeyen alan: {musteri_adi}')).toBeTruthy();
    const kaydet = screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    fireEvent.change(konu, { target: { value: 'Onay: {kayit_no}' } });
    expect(within(onizleme).getByText('Onay: ORN-0042')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('İstasyon'));
    fireEvent.click(screen.getByRole('radio', { name: 'Onaylı liste' }));
    expect(kaydet.disabled).toBe(false);
    fireEvent.click(kaydet);
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]?.govde).toEqual({
      simge: 'clipboard-check', konuKalibi: 'Onay: {kayit_no}', baslikKalibi: '', govde: 'Merhaba {alici_adi},\n\n{olay}.', tabloAlanlari: ['kayit_no', 'tarih', 'istasyon'],
      dugmeYazisi: '', onayDugmesi: true, altBilgi: '', serit: 'onem', logo: false, surum: null,
      duzen: { ustBant: '', onemRozeti: true, altSatir: '', tabloAdlari: {}, dugmeRengi: 'koyu' },
    } satisfies EpostaSablonDegistirGovdesi);
    expect(screen.queryByRole('button', { name: 'Varsayılana dön' })).toBeNull();
  });

  it('3639: üst bant, önem rozeti, başlık altı satırı, satır adı ve sırası, düğme rengi ön izlemeye ve kayda yansır', async () => {
    const { yazilanlar } = sunucuKur();
    sablonAc();
    await screen.findByLabelText('Konu satırı');
    const onizleme = screen.getByRole('region', { name: 'Ön izleme' });
    expect(within(onizleme).getByText('CORE MES')).toBeTruthy();
    expect(within(onizleme).getByText('Uyarı')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Üst bant metni'), { target: { value: 'CORE MES Satış' } });
    expect(within(onizleme).getByText('CORE MES Satış')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Üst bantta önem rozeti (Bilgi, Uyarı, Acil)'));
    expect(within(onizleme).queryByText('Uyarı')).toBeNull();
    fireEvent.change(screen.getByLabelText('Başlık altı satırı'), { target: { value: '{olay} · {kayit_no}' } });
    expect(within(onizleme).getByText('Satın alma talebi onay bekliyor · ORN-0042')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Başlık altı satırı'), { target: { value: '{musteri}' } });
    expect(screen.getByText('Bilinmeyen alan: {musteri}')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Başlık altı satırı'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Satır adı: Kayıt no'), { target: { value: 'Sipariş no' } });
    expect(within(onizleme).getByText('Sipariş no')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kayıt no satırını aşağı al' }));
    const adlar = within(onizleme).getAllByRole('term').map((x) => x.textContent);
    expect(adlar).toEqual(['Tarih', 'Sipariş no']);
    fireEvent.change(screen.getByLabelText('Düğme rengi'), { target: { value: 'yesil' } });
    expect(within(onizleme).getByText('Kayda git').className).toContain('tc-eposta-dugme-yesil');
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]?.govde).toMatchObject({
      tabloAlanlari: ['tarih', 'kayit_no'],
      duzen: { ustBant: 'CORE MES Satış', onemRozeti: false, altSatir: '', tabloAdlari: { kayit_no: 'Sipariş no' }, dugmeRengi: 'yesil' },
    });
  });

  it('değiştirilmiş şablonda varsayılana dönülür', async () => {
    const { yazilanlar } = sunucuKur();
    sablonAc();
    fireEvent.click(await screen.findByRole('button', { name: /^Genel/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Varsayılana dön' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toMatchObject({ yol: '/bildirimler/eposta/sablonlar/genel/degistir', govde: { varsayilan: true, surum: 2 } });
  });

  it('3435-2: yeni şablon adıyla açılır; boş ad kaydı kapatır; başlık, düğme ve alt bilgi ön izlemede', async () => {
    const { yazilanlar } = sunucuKur();
    sablonAc();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeni şablon' }));
    const ac_ = screen.getByRole('button', { name: 'Şablonu aç' }) as HTMLButtonElement;
    expect(ac_.disabled).toBe(true);
    expect(screen.getByText('Şablon adı boş olamaz.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Şablon adı'), { target: { value: 'ORN Gecikme' } });
    fireEvent.change(screen.getByLabelText('Başlık'), { target: { value: '{onem}: {olay}' } });
    fireEvent.change(screen.getByLabelText('Düğme yazısı'), { target: { value: 'Talebi aç' } });
    fireEvent.change(screen.getByLabelText('Alt bilgi'), { target: { value: '{fiyat}' } });
    expect(screen.getByText('Bilinmeyen alan: {fiyat}')).toBeTruthy();
    expect(ac_.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Alt bilgi'), { target: { value: 'Satın alma birimi' } });
    fireEvent.change(screen.getByLabelText('Renk şeridi'), { target: { value: 'yesil' } });
    const onizleme = screen.getByRole('region', { name: 'Ön izleme' });
    expect(within(onizleme).getByText('Uyarı: Örnek olay')).toBeTruthy();
    expect(within(onizleme).getByText('Talebi aç')).toBeTruthy();
    expect(within(onizleme).getByText(/Satın alma birimi/)).toBeTruthy();
    fireEvent.click(ac_);
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({
      yol: '/bildirimler/eposta/ozel-sablonlar/yeni',
      govde: {
        ad: 'ORN Gecikme', simge: 'bell', konuKalibi: '[CORE MES] {olay}', baslikKalibi: '{onem}: {olay}', govde: 'Merhaba {alici_adi}', tabloAlanlari: [],
        dugmeYazisi: 'Talebi aç', onayDugmesi: true, altBilgi: 'Satın alma birimi', serit: 'yesil', logo: false,
        duzen: { ustBant: '', onemRozeti: true, altSatir: '', tabloAdlari: {}, dugmeRengi: 'koyu' },
      },
    });
  });

  it('3435-2: yönetici şablonu kopyalanır, kaydedilir ve onayla silinir', async () => {
    const { yazilanlar } = sunucuKur();
    sablonAc();
    fireEvent.click(await screen.findByRole('button', { name: /^ORN Acil durus/ }));
    expect((screen.getByLabelText('Şablon adı') as HTMLInputElement).value).toBe('ORN Acil durus');
    expect(screen.getByText(/Bu şablonu kullanan olaylar: Makine durdu/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kopyala' }));
    expect((screen.getByLabelText('Şablon adı') as HTMLInputElement).value).toBe('ORN Acil durus (kopya)');
    expect((screen.getByLabelText('Düğme yazısı') as HTMLInputElement).value).toBe('Tezgahı aç');
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(await screen.findByRole('button', { name: /^ORN Acil durus/ }));
    fireEvent.change(screen.getByLabelText('Şablon adı'), { target: { value: 'ORN Acil' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toMatchObject({ yol: '/bildirimler/eposta/ozel-sablonlar/9/degistir', govde: { ad: 'ORN Acil', serit: 'kirmizi', onayDugmesi: false, surum: 3 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    const onay = await screen.findByRole('dialog', { name: /silinsin mi/ });
    fireEvent.click(within(onay).getByRole('button', { name: 'Sil' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(2); });
    expect(yazilanlar[1]).toEqual({ yol: '/bildirimler/eposta/ozel-sablonlar/9/sil', govde: { surum: 3 } });
  });

  it('3435-2 logo: şablon kurum logosunu açar; logo yoksa uyarır, varsa ön izlemede görünür; kayıt logo ile gider', async () => {
    const { yazilanlar } = sunucuKur();
    sablonAc();
    const kutu = await screen.findByLabelText('Kurum logosunu üst bilgiye koy');
    fireEvent.click(kutu);
    expect(await screen.findByText(/Kurum logosu yüklü değil/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]?.govde).toMatchObject({ logo: true });
    cleanup();
    sunucuKur('data:image/png;base64,iVBORw0KGgo=');
    sablonAc();
    fireEvent.click(await screen.findByRole('button', { name: /^ORN Acil durus/ }));
    const onizleme = screen.getByRole('region', { name: 'Ön izleme' });
    expect((await within(onizleme).findByRole('img', { name: 'Kurum logosu' })).getAttribute('src')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(screen.queryByText(/Kurum logosu yüklü değil/)).toBeNull();
  });

  it('defter sonuçları ve nedenleri gösterir; süzgeç sunucuya gider', async () => {
    const { okunanlar } = sunucuKur();
    ac();
    sekme('Gönderim defteri');
    expect(await screen.findAllByText('ORN-TLP-0042')).not.toHaveLength(0);
    expect(screen.getAllByText('İK\'da iş e-postası yok')).not.toHaveLength(0);
    fireEvent.click(within(screen.getByRole('group', { name: 'Sonuç' })).getByRole('button', { name: 'Atlandı' }));
    await waitFor(() => { expect(okunanlar).toContain('/bildirimler/eposta/defter?sayfa=1&sonuc=atlandi'); });
  });
});
