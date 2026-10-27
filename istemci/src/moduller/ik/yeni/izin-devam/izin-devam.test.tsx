import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { IkPuantajCevabi } from '#paylasilan/sozlesme/ik.ts';
import { IK_OKUYAN, IK_YONETICI, ikAc, ornekVeri, type Yazma } from '../test-ortak.tsx';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Puantaj ve izin gunu uclari ortak sinama duzeninde yok; yalniz bu testte, ortak cevabin onune konur.
function puantajSun(veri: IkPuantajCevabi): Yazma[] {
  const yazmalar: Yazma[] = [];
  const asil = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = new URL(adres, 'http://yerel').pathname.replace(/^\/api/, '');
    if (yol === '/ik/puantaj') return new Response(JSON.stringify(veri), { status: 200 });
    if (yol === '/ik/puantaj/yaz') {
      yazmalar.push({ yol, govde: JSON.parse(String(istek?.body ?? 'null')) as unknown });
      return new Response(JSON.stringify({ kayitlar: [], silinen: [] }), { status: 200 });
    }
    return asil(adres, istek);
  }));
  return yazmalar;
}

const ekim: IkPuantajCevabi = {
  ay: '2026-10',
  gunler: Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`),
  kisiler: [
    {
      personel: 'emp_b', kilitli: false, plan: null,
      kayitlar: [{ tarih: '2026-10-01', durum: 'calisti', giris: '08:00', cikis: '18:00', aciklama: null, surum: 4, yazan: 'x', yazildi: '2026-10-01T18:00:00Z', calismaDakika: 540, fazlaDakika: 60, fazlaTuru: 'Fazla mesai' }],
    },
    { personel: 'emp_a', kilitli: true, plan: null, kayitlar: [] },
  ],
};

describe('P2 izinler', () => {
  it('İK yöneticisi bekleyen talebi görür ve onaylar (izin yazma ucu, bugünkü köprü kuralı)', async () => {
    const { yazmalar } = ikAc('/ik/yeni/izinler');
    const satir = (await screen.findByText('Mehmet Deneme')).closest('tr') as HTMLElement;
    expect(within(satir).getByText('Beklemede')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'İzin talebi' })).toBeTruthy();
    fireEvent.click(within(satir).getByRole('button', { name: 'Onayla' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/izinler/leave_1/kaydet']); });
    expect(await screen.findByText('İzin onaylandı.')).toBeTruthy();
  });

  it('okuyan kişi listeyi görür; talep, onay ve düzenleme düğmesi yoktur', async () => {
    const { yazmalar } = ikAc('/ik/yeni/izinler', { kullanici: IK_OKUYAN });
    const satir = (await screen.findByText('Mehmet Deneme')).closest('tr') as HTMLElement;
    expect(screen.queryByRole('button', { name: 'İzin talebi' })).toBeNull();
    expect(within(satir).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(within(satir).getByRole('button', { name: /Form/ })).toBeTruthy();
    fireEvent.click(satir);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(yazmalar).toEqual([]);
  });

  it('onay yetkisi olmayan izin yazan Onayla ve Reddet görmez (Soru 854 b)', async () => {
    ikAc('/ik/yeni/izinler', { kullanici: { id: 5, ad: 'Deneme Yazan', islemler: ['ik.oku', 'ik.izin-yaz', 'sayfa.ik', YENI_EKRAN_ISLEMI] } });
    const satir = (await screen.findByText('Mehmet Deneme')).closest('tr') as HTMLElement;
    expect(within(satir).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(within(satir).queryByRole('button', { name: 'Reddet' })).toBeNull();
  });

  it('salt okunur oturumda yazma düğmesi yoktur (210.6)', async () => {
    ikAc('/ik/yeni/izinler', { veri: ornekVeri({ saltOkunur: true }) });
    const satir = (await screen.findByText('Mehmet Deneme')).closest('tr') as HTMLElement;
    expect(within(satir).queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İzin talebi' })).toBeNull();
  });

  it('durum süzgeci ve ad araması listeyi daraltır; not satırı sayar', async () => {
    ikAc('/ik/yeni/izinler');
    await screen.findByText('Mehmet Deneme');
    expect(screen.getByText('1 kayıt, onaylanan toplam 0 gün.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Çalışan ara'), { target: { value: 'ayşe' } });
    expect(await screen.findByText('0 kayıt, onaylanan toplam 0 gün.')).toBeTruthy();
  });

  it('bakiye sekmesi motorun hak edişini gösterir; ayrılan kişi listede yoktur', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00'));
    try {
      ikAc('/ik/yeni/izinler');
      await screen.findByText('Mehmet Deneme');
      fireEvent.click(screen.getByRole('tab', { name: 'Bakiyeler' }));
      const tablo = await screen.findByRole('table', { name: 'İzin bakiyeleri' });
      const satir = within(tablo).getByText('Mehmet Deneme').closest('tr') as HTMLElement;
      const hucreler = within(satir).getAllByRole('cell').map((h) => h.textContent);
      // 01.03.2023 girişli kişi 20.10.2026'da 3 tam yıl çalışmış: 3 x 14 gün. Bekleyen talepte gün yazılı değil, sayılmaz.
      expect(hucreler.slice(2, 8)).toEqual(['3', '42', '0', '0', '0', '42']);
      expect(within(tablo).queryByText('Can Sınama')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('izin formu kalan izni ve iş günü sayısını motordan önerir', async () => {
    ikAc('/ik/yeni/izinler');
    await screen.findByText('Mehmet Deneme');
    fireEvent.click(screen.getByRole('button', { name: 'İzin talebi' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Çalışan/), { target: { value: 'emp_b' } });
    expect(within(pencere).getByText(/Kalan yıllık izin: \d/)).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Başlangıç/), { target: { value: '2026-12-07' } });
    fireEvent.change(within(pencere).getByLabelText(/Bitiş/), { target: { value: '2026-12-13' } });
    expect((within(pencere).getByLabelText(/Gün sayısı/) as HTMLInputElement).value).toBe('5');
  });

  it('takvim sekmesi ayla kesişen izni gösterir', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-03T09:00:00'));
    try {
      ikAc('/ik/yeni/izinler');
      await screen.findByText('Mehmet Deneme');
      fireEvent.click(screen.getByRole('tab', { name: 'Takvim' }));
      const tablo = await screen.findByRole('table', { name: /2026-11 izin takvimi/ });
      expect(within(tablo).getByText('Mehmet Deneme')).toBeTruthy();
      expect(within(tablo).getAllByRole('button', { name: /Yıllık izin, Beklemede/ })).toHaveLength(5);
    } finally { vi.useRealTimers(); }
  });
});

describe('P2 devam ve mesai', () => {
  it('ayın kayıtları ve toplamları; yazabilen satırı düzenler, okuyan düzenleyemez', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00'));
    try {
      ikAc('/ik/yeni/devam');
      const satir = within(await screen.findByRole('table', { name: 'Devam ve mesai kayıtları' })).getByText('Mehmet Deneme').closest('tr') as HTMLElement;
      expect(within(satir).getByText('Beklemede')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Kayıt ekle' })).toBeTruthy();
      cleanup();
      ikAc('/ik/yeni/devam', { kullanici: IK_OKUYAN });
      const satir2 = within(await screen.findByRole('table', { name: 'Devam ve mesai kayıtları' })).getByText('Mehmet Deneme').closest('tr') as HTMLElement;
      expect(screen.queryByRole('button', { name: 'Kayıt ekle' })).toBeNull();
      fireEvent.click(satir2);
      expect(screen.queryByRole('dialog')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('puantaj matrisi: yazabilen günü yazar (tek gün penceresi), kilitli kişinin hücresi tıklanmaz', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00'));
    try {
      ikAc('/ik/yeni/devam');
      const yazmalar = puantajSun(ekim);
      await screen.findByRole('table', { name: 'Devam ve mesai kayıtları' });
      fireEvent.click(screen.getByRole('tab', { name: 'Puantaj' }));
      const tablo = await screen.findByRole('table', { name: /2026-10 puantajı/ });
      expect(within(tablo).getByRole('button', { name: /Mehmet Deneme, 01\.10\.2026: 08:00–18:00, 9 sa/ })).toBeTruthy();
      expect(within(tablo).queryAllByRole('button', { name: /^Ayşe Örnek, / })).toHaveLength(0);
      expect(screen.getByText('Fazla mesai önerileri')).toBeTruthy();
      fireEvent.click(within(tablo).getByRole('button', { name: /Mehmet Deneme, 02\.10\.2026/ }));
      const pencere = await screen.findByRole('dialog');
      fireEvent.change(within(pencere).getByLabelText('Giriş'), { target: { value: '07:30' } });
      fireEvent.change(within(pencere).getByLabelText('Çıkış'), { target: { value: '16:30' } });
      fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
      await waitFor(() => { expect(yazmalar).toHaveLength(1); });
      expect(yazmalar[0]!.govde).toEqual({ gunler: [{ personel: 'emp_b', tarih: '2026-10-02', durum: 'calisti', giris: '07:30', cikis: '16:30', aciklama: null, surum: null }] });
    } finally { vi.useRealTimers(); }
  });

  it('puantaj: okuyan matrisi görür, yazamaz; öneri ve toplu giriş yoktur', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00'));
    try {
      ikAc('/ik/yeni/devam', { kullanici: IK_OKUYAN });
      puantajSun(ekim);
      await screen.findByRole('table', { name: 'Devam ve mesai kayıtları' });
      fireEvent.click(screen.getByRole('tab', { name: 'Puantaj' }));
      const tablo = await screen.findByRole('table', { name: /2026-10 puantajı/ });
      expect(within(tablo).queryAllByRole('button', { name: /, \d\d\.10\.2026/ })).toHaveLength(0);
      expect(screen.queryByText('Fazla mesai önerileri')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Toplu giriş' })).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('salt okunur oturumda puantaj yazılmaz (210.6)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T09:00:00'));
    try {
      ikAc('/ik/yeni/devam', { kullanici: IK_YONETICI, veri: ornekVeri({ saltOkunur: true }) });
      puantajSun(ekim);
      await screen.findByRole('table', { name: 'Devam ve mesai kayıtları' });
      fireEvent.click(screen.getByRole('tab', { name: 'Puantaj' }));
      await screen.findByRole('table', { name: /2026-10 puantajı/ });
      expect(screen.queryByRole('button', { name: 'Toplu giriş' })).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
