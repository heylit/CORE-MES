import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici } from '../../../ortak/arayuz/Bildirim.tsx';
import { AdimliForm, TASLAK_ONEKI, eksikler, ilkDegerler, taslakOku, type KmAlan } from './AdimliForm.tsx';
import { YONETICI, sunucuKur } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const ALANLAR: KmAlan[] = [
  { k: 'parcaNo', etiket: 'Parça no', zorunlu: true },
  { k: 'aciklama', etiket: 'Açıklama', tur: 'cokSatir' },
];

function ac(kaydet = vi.fn(), ozellik: Partial<Parameters<typeof AdimliForm>[0]> = {}) {
  sunucuKur(YONETICI);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <BildirimSaglayici>
        <AdimliForm baslik="Deneme" alanlar={ALANLAR} kaydet={kaydet} kapat={() => {}} {...ozellik} />
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return kaydet;
}

describe('AdimliForm yardımcıları', () => {
  it('varsayılanı ve ilk değeri birleştirir, boş zorunluyu bulur', () => {
    const d = ilkDegerler([{ k: 'a', etiket: 'A', varsayilan: () => 'v' }, { k: 'b', etiket: 'B', zorunlu: true }], { b: '' }, {});
    expect(d.a).toBe('v');
    expect(eksikler([{ k: 'b', etiket: 'B', zorunlu: true }], d).map((a) => a.k)).toEqual(['b']);
  });

  it('süresi geçmiş taslağı okumaz', () => {
    localStorage.setItem(`${TASLAK_ONEKI}x`, JSON.stringify({ t: 0, d: { a: 1 } }));
    expect(taslakOku('x', 8 * 24 * 3600 * 1000)).toBeNull();
  });
});

describe('AdimliForm', () => {
  it('zorunlu alan boşken kaydetmez, doluyken toplanan veriyle kaydeder', async () => {
    const kaydet = ac();
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    expect(kaydet).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Parça no/), { target: { value: 'P-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydet).toHaveBeenCalledTimes(1));
    expect(kaydet.mock.calls[0]?.[0]).toMatchObject({ parcaNo: 'P-1' });
  });

  it('tüm alanlar kipinde adımlı form İleri ile ilerler', async () => {
    localStorage.setItem('kym-me', JSON.stringify({ formMode: 'liste' }));
    ac(vi.fn(), { adimlar: [{ baslik: 'Birinci', alanlar: ['parcaNo'] }, { baslik: 'İkinci', alanlar: ['aciklama'] }] });
    fireEvent.click(await screen.findByRole('button', { name: 'İleri' }));
    expect(await screen.findByLabelText(/Açıklama/)).toBeTruthy();
  });
});

describe('AdimliForm tek tek sor', () => {
  const ADIMLAR = [{ baslik: 'Birinci', alanlar: ['parcaNo', 'karar'] }, { baslik: 'İkinci', alanlar: ['aciklama'] }];
  const UC: KmAlan[] = [...ALANLAR, { k: 'karar', etiket: 'Karar', tur: 'secim', secenekler: ['Kabul', 'Ret'] }];

  it('bugünkü gibi varsayılan açık: sorular sırayla, zorunlu atlanmaz, seçim düğmesi ilerletir, özetten kaydedilir', async () => {
    const kaydet = ac(vi.fn(), { alanlar: UC, adimlar: ADIMLAR });
    expect(await screen.findByText(/Soru 1 \/ 3/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Atla' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'İleri ›' }));
    expect(screen.getByText(/Soru 1 \/ 3/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Parça no/), { target: { value: 'P-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'İleri ›' }));
    expect(await screen.findByText(/Soru 2 \/ 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ret/ }));
    expect(await screen.findByText(/Soru 3 \/ 3/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Özete geç ›' }));
    expect(await screen.findByText(/Yanıtlarınız/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Karar\s*Ret/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydet).toHaveBeenCalledTimes(1));
    expect(kaydet.mock.calls[0]?.[0]).toMatchObject({ parcaNo: 'P-1', karar: 'Ret' });
  });

  it('düzenlemede özetle açılır; seçim kişiye özel saklanır', async () => {
    ac(vi.fn(), { alanlar: UC, adimlar: ADIMLAR, ilk: { _id: 'x', parcaNo: 'P-2' } });
    expect(await screen.findByText(/Yanıtlarınız/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tüm alanları göster' }));
    expect(JSON.parse(localStorage.getItem('kym-me') ?? '{}')).toMatchObject({ formMode: 'liste' });
    expect(screen.getByRole('button', { name: 'Tek tek sor' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Geri' })).toBeTruthy();
    expect(screen.getByText('Kontrol ve kaydet', { selector: 'h3' })).toBeTruthy();
  });
});

describe('AdimliForm kontrol maddeleri ve taslak', () => {
  const MADDELI = [{ baslik: 'Bilgi', alanlar: ['parcaNo'] }, { baslik: 'Kontrol', maddeler: [{ k: '0_0', metin: 'Etiket var mı' }, { k: '0_1', metin: 'Ambalaj sağlam mı' }] }];

  it('maddeler tek tek sorulur; Hayır not ister, Evet ilerler; yanıtlar liste ve listeNot olarak kaydedilir', async () => {
    const kaydet = ac(vi.fn(), { alanlar: [ALANLAR[0]!], adimlar: MADDELI, ilk: { parcaNo: 'P-1' } });
    expect(await screen.findByText('1. Etiket var mı')).toBeTruthy();
    expect(screen.getByText(/Soru 1 \/ 2/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio', { name: 'Hayır' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'İleri ›' }));
    expect(screen.getByText(/Soru 1 \/ 2/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Madde 1 açıklaması'), { target: { value: 'Etiket yırtık' } });
    fireEvent.click(screen.getByRole('button', { name: 'İleri ›' }));
    expect(await screen.findByText(/Soru 2 \/ 2/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio', { name: 'Evet' })[1]!);
    expect(await screen.findByText(/Yanıtlarınız/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Parça no\s*otomatik\s*P-1/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydet).toHaveBeenCalledTimes(1));
    expect(kaydet.mock.calls[0]?.[0]).toMatchObject({ liste: { '0_0': 'Hayır', '0_1': 'Evet' }, listeNot: { '0_0': 'Etiket yırtık' } });
  });

  it('yarım taslak sorulur; Devam et yükler, Yoksay siler', async () => {
    localStorage.setItem(`${TASLAK_ONEKI}t`, JSON.stringify({ t: Date.now(), d: { parcaNo: 'P-9' }, c: 1 }));
    ac(vi.fn(), { alanlar: [ALANLAR[0]!], adimlar: MADDELI, taslak: 't' });
    expect(await screen.findByText(/Yarım kalmış bir taslak var/)).toBeTruthy();
    expect((screen.getByLabelText(/Parça no/) as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    expect((screen.getByLabelText(/Parça no/) as HTMLInputElement).value).toBe('P-9');
    expect(screen.getByText(/Soru 2 \/ 3/)).toBeTruthy();
    cleanup();
    localStorage.setItem(`${TASLAK_ONEKI}t`, JSON.stringify({ t: Date.now(), d: { parcaNo: 'P-9' }, c: 1 }));
    ac(vi.fn(), { alanlar: [ALANLAR[0]!], adimlar: MADDELI, taslak: 't' });
    fireEvent.click(await screen.findByRole('button', { name: 'Yoksay' }));
    expect(localStorage.getItem(`${TASLAK_ONEKI}t`)).toBeNull();
  });

  it('tüm alanlar kipinde sayaç bugünkü gibi Soru 0 / N', async () => {
    localStorage.setItem('kym-me', JSON.stringify({ formMode: 'liste' }));
    ac(vi.fn(), { alanlar: [ALANLAR[0]!], adimlar: MADDELI });
    expect(await screen.findByText(/Soru 0 \/ 3/)).toBeTruthy();
  });
});

describe('AdimliForm ikinci kaydet ve pencere', () => {
  it('ikinci düğme zorunlu alanı denetlemeden kaydeder; kaydet etiketi değişir', async () => {
    const taslak = vi.fn();
    const kaydet = ac(vi.fn(), { ikinciKaydet: { etiket: 'Taslak kaydet', yap: taslak }, kaydetMetni: 'Kaydet ve onaya gönder', pencere: 'tam' });
    fireEvent.click(await screen.findByRole('button', { name: 'Taslak kaydet' }));
    await waitFor(() => expect(taslak).toHaveBeenCalledTimes(1));
    expect(kaydet).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Kaydet ve onaya gönder' })).toBeTruthy();
  });
});

describe('AdimliForm formun gizlediği alan', () => {
  it('gorunur false iken alan iki kipte de çizilmez ve zorunlu sayılmaz', async () => {
    localStorage.setItem('kym-me', JSON.stringify({ formMode: 'liste' }));
    const kaydet = ac(vi.fn(), {
      alanlar: [
        { k: 'tur', etiket: 'Tür', tur: 'secim', secenekler: ['Giriş', 'FAI'], zorunlu: true },
        { k: 'faiNeden', etiket: 'FAI nedeni', zorunlu: true, gorunur: (d) => d.tur === 'FAI' },
      ],
      ilk: { tur: 'Giriş' },
    });
    await screen.findByLabelText(/Tür/);
    expect(screen.queryByLabelText(/FAI nedeni/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Tür/), { target: { value: 'FAI' } });
    expect(screen.getByLabelText(/FAI nedeni/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Tür/), { target: { value: 'Giriş' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kaydet).toHaveBeenCalledTimes(1));
  });
});
