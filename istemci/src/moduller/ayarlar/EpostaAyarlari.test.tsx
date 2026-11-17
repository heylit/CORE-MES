import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  EpostaDefterCevabi, EpostaDurumuCevabi, EpostaSablonDegistirGovdesi, EpostaSablonlariCevabi, EpostaTetikleyiciDegistirGovdesi, EpostaTetikleyicileriCevabi,
} from '#paylasilan/sozlesme/bildirim-eposta.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { EpostaAyarlari } from './EpostaAyarlari.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const DURUM = {
  ortam: 'hazir', ayarAcik: false, kip: 'kurum-ici', adres: '10.0.0.25:25', guvenlik: 'starttls', alanAdlari: ['ornek.local'], gonderen: 'mes@ornek.local',
  kuyrukta: 3, son24Gonderilen: 12, son24Hata: 1, epostasizKisi: 2, sonGonderim: '2026-11-17T09:00:00.000+03:00',
} satisfies EpostaDurumuCevabi;

const TETIK = {
  satirlar: [
    {
      tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', sinif: 'gorev', konu: 'satin-alma', eposta: true,
      zaman: 'hemen', tekrarGun: null, tekrarEnCok: null, yukseltGun: null, yukseltRolIdleri: [], yukseltKisiIdleri: [], surum: null,
    },
    {
      tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', onem: 'acil', sinif: 'bilgi', konu: 'uretim', eposta: false,
      zaman: 'hemen', tekrarGun: 2, tekrarEnCok: 3, yukseltGun: 1, yukseltRolIdleri: [2], yukseltKisiIdleri: [], surum: 4,
    },
  ],
  roller: [{ id: 1, ad: 'Bakım' }, { id: 2, ad: 'Müdür' }],
  kisiler: [{ id: 7, ad: 'Deneme Kalite' }],
} satisfies EpostaTetikleyicileriCevabi;

const SABLONLAR = {
  satirlar: [
    {
      konu: 'satin-alma', simge: 'cart', konuKalibi: '[CORE MES] {olay} · {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.', tabloAlanlari: ['kayit_no', 'tarih'],
      surum: null, degistirildi: null,
    },
    { konu: 'genel', simge: 'bell', konuKalibi: '[CORE MES] {olay}', govde: 'Merhaba {alici_adi}', tabloAlanlari: [], surum: 2, degistirildi: '2026-11-17T09:00:00.000+03:00' },
  ],
} satisfies EpostaSablonlariCevabi;

const DEFTER = {
  satirlar: [
    { id: 5, zaman: '2026-11-17T09:00:00.000+03:00', kisiId: 7, kisiAdi: 'Deneme Kalite', tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', kayitNo: 'ORN-TLP-0042', sonuc: 'gonderildi', neden: null },
    { id: 4, zaman: '2026-11-17T08:00:00.000+03:00', kisiId: 8, kisiAdi: 'Deneme Adressiz', tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', kayitNo: null, sonuc: 'atlandi', neden: 'İK\'da iş e-postası yok' },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
} satisfies EpostaDefterCevabi;

function sunucuKur() {
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
      if (yol.startsWith('/bildirimler/eposta/sablonlar/')) return json(200, SABLONLAR);
    }
    okunanlar.push(yol);
    if (yol === '/bildirimler/eposta/durum') return json(200, DURUM);
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
}
const sekme = (ad: string) => { fireEvent.click(screen.getByRole('tab', { name: new RegExp(ad) })); };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('E-posta ayarları (3397)', () => {
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

  it('tetikleyici: satıra dokununca panel açılır; tekrar ve kademe birlikte kaydedilir', async () => {
    const { yazilanlar } = sunucuKur();
    ac();
    sekme('Tetikleyiciler');
    fireEvent.click(await screen.findByText('Satın alma talebi onay bekliyor'));
    const panel = await screen.findByRole('dialog', { name: 'Satın alma talebi onay bekliyor' });
    fireEvent.click(within(panel).getByLabelText('İş açık kaldıkça tekrarla'));
    fireEvent.change(within(panel).getByLabelText('Kaç günde bir'), { target: { value: '2' } });
    fireEvent.click(within(panel).getByLabelText('İş açık kalırsa üst kademeye de gönder'));
    const kaydet = within(panel).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(kaydet.disabled).toBe(true);
    expect(within(panel).getByText('En az bir rol ya da kişi seçin.')).toBeTruthy();
    fireEvent.click(within(panel).getByLabelText('Müdür'));
    expect(kaydet.disabled).toBe(false);
    fireEvent.click(kaydet);
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toEqual({
      yol: '/bildirimler/eposta/tetikleyiciler/satin-alma.talep-onay-bekliyor/degistir',
      govde: {
        eposta: true, zaman: 'hemen', tekrarGun: 2, tekrarEnCok: 3, yukseltGun: 2, yukseltRolIdleri: [2], yukseltKisiIdleri: [], surum: null,
      } satisfies EpostaTetikleyiciDegistirGovdesi,
    });
  });

  it('tetikleyici tablosu konuya göre süzülür ve özetleri yazar', async () => {
    sunucuKur();
    ac();
    sekme('Tetikleyiciler');
    expect(await screen.findAllByText('2 günde bir, en çok 3 kez')).not.toHaveLength(0);
    expect(screen.getAllByText('1 gün sonra 1 rol')).not.toHaveLength(0);
    fireEvent.click(within(screen.getByRole('group', { name: 'Konu' })).getByRole('button', { name: 'Üretim devir alma' }));
    await waitFor(() => { expect(screen.queryByText('Satın alma talebi onay bekliyor')).toBeNull(); });
    expect(screen.getAllByText('Makine durdu')).not.toHaveLength(0);
  });

  it('şablon: ön izleme canlıdır; bilinmeyen alan kaydı kapatır; kayıt seçili alanlarla gider', async () => {
    const { yazilanlar } = sunucuKur();
    ac();
    sekme('Şablonlar');
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
      simge: 'clipboard-check', konuKalibi: 'Onay: {kayit_no}', govde: 'Merhaba {alici_adi},\n\n{olay}.', tabloAlanlari: ['kayit_no', 'tarih', 'istasyon'], surum: null,
    } satisfies EpostaSablonDegistirGovdesi);
    expect(screen.queryByRole('button', { name: 'Varsayılana dön' })).toBeNull();
  });

  it('değiştirilmiş şablonda varsayılana dönülür', async () => {
    const { yazilanlar } = sunucuKur();
    ac();
    sekme('Şablonlar');
    fireEvent.change(await screen.findByLabelText('Konu'), { target: { value: 'genel' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Varsayılana dön' }));
    await waitFor(() => { expect(yazilanlar).toHaveLength(1); });
    expect(yazilanlar[0]).toMatchObject({ yol: '/bildirimler/eposta/sablonlar/genel/degistir', govde: { varsayilan: true, surum: 2 } });
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
