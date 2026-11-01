import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { IkKayit, IkVeriCevabi } from '#paylasilan/sozlesme/ik.ts';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import { IK_OKUYAN, ikAc, ornekVeri } from '../test-ortak.tsx';

// Rota IkYeni'yi, IkYeni de bu parçayı tembel yükler; ilk testin findBy beklemesi (1 sn) soğuk dönüşümü de ödemesin diye
// ikisi testlerden önce yüklenir.
beforeAll(async () => { await Promise.all([import('../IkYeni.tsx'), import('./index.tsx')]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Uydurma örnek: aday, görüşme, değerlendirme ve eğitim kayıtları gerçek kişiyle ilgisizdir.
const kayit = (tur: IkKayit['tur'], kimlik: string, govde: Record<string, unknown>, surum = 1): IkKayit =>
  ({ kimlik, tur, surum, govde: { id: kimlik, kind: tur, ...govde } });
function veri(): IkVeriCevabi {
  const v = ornekVeri();
  return {
    ...v,
    kayitlar: [
      ...v.kayitlar,
      kayit('job', 'job_2', { baslik: 'Kalite teknisyeni', durum: 'Açık', ilanKodu: 'IK-2026-002', acilis: '2026-10-01', isMerkeziId: 1 }),
      kayit('cand', 'cand_a', { ad: 'Deniz', soyad: 'Aday', jobId: 'job_2', asama: 'Mülakat', basvuruTarihi: '2026-10-10', kaynak: 'İç ilan' }),
      kayit('intv', 'intv_1', { candId: 'cand_a', tur: 'İK mülakatı', tarih: '2099-01-10', saat: '10:00', durum: 'Planlandı' }),
      kayit('perf', 'perf_1', { empId: 'emp_b', donem: '2025 Yıllık', tarih: '2025-12-20', skorlar: { 'İş bilgisi': 4 } }),
      kayit('train', 'train_1', { ad: 'Tezgah güvenliği', tur: 'İSG (zorunlu)', durum: 'Tamamlandı', tarih: '2026-02-01', katilimcilar: ['emp_a'], gecerlilik: '2099-01-01' }),
    ],
  };
}
const ONAYCI = { id: 6, ad: 'Deneme Onayci', islemler: ['ik.oku', 'ik.pozisyon-onay', 'sayfa.ik', YENI_EKRAN_ISLEMI] as never[] };

describe('P4 işe alım', () => {
  it('yönetici sayıları, sekmeleri ve yazma düğmelerini görür', async () => {
    ikAc('/ik/yeni/ise-alim', { veri: veri() });
    expect(await screen.findByRole('heading', { name: /İşe alım/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Aday süreci' }));
    expect(screen.getByRole('button', { name: 'Aday ekle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pozisyon aç' })).toBeTruthy();
    expect(screen.getByText('Deniz Aday')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Pozisyonlar' }));
    expect(await screen.findByText('Kalite teknisyeni')).toBeTruthy();
  });

  it('okuyan kişi süreci görür; yazma düğmesi ve aşama okları yoktur', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ise-alim', { kullanici: IK_OKUYAN, veri: veri() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Aday süreci' }));
    expect(await screen.findByText('Deniz Aday')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aday ekle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sonraki aşamaya taşı' })).toBeNull();
    expect(yazmalar).toEqual([]);
  });

  it('kanban oku adayı sonraki aşamaya yazar', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ise-alim', { veri: veri() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Aday süreci' }));
    await screen.findByText('Deniz Aday');
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki aşamaya taşı' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/adaylar/cand_a/kaydet']); });
    expect((yazmalar[0]?.govde as { govde: { asama: string } }).govde.asama).toBe('Teklif');
  });
});

describe('P4 pozisyon', () => {
  it('yalnız onay yetkisi olan kadro talebini onaylar; onay ucuna gider, düzenleme görmez', async () => {
    const { yazmalar } = ikAc('/ik/yeni/pozisyon/job_1', { kullanici: ONAYCI, veri: veri() });
    const dugme = await screen.findByRole('button', { name: 'Onayla ve yayına hazırla' });
    expect(screen.queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Taslağa geri al' })).toBeNull();
    fireEvent.click(dugme);
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/pozisyonlar/job_1/onayla']); });
  });

  it('okuyan kişi durum düğmesi görmez', async () => {
    ikAc('/ik/yeni/pozisyon/job_1', { kullanici: IK_OKUYAN, veri: veri() });
    expect(await screen.findByRole('heading', { name: /CNC operatörü/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla ve yayına hazırla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
  });

  it('yönetici kanalı yayında işaretler; taslak olmayan açık pozisyon açık kalır', async () => {
    const { yazmalar } = ikAc('/ik/yeni/pozisyon/job_2', { veri: veri() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Yayın kanalları' }));
    const kanal = (await screen.findByText('İç ilan')).closest('.tc-ika-kanal') as HTMLElement;
    fireEvent.click(within(kanal).getByRole('button', { name: 'Yayında olarak işaretle' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Yayında olarak kaydet' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/pozisyonlar/job_2/kaydet']); });
    const g = (yazmalar[0]?.govde as { govde: { durum: string; yayinlar: Record<string, { durum: string }> } }).govde;
    expect(g.durum).toBe('Açık');
    expect(Object.values(g.yayinlar).map((y) => y.durum)).toEqual(['Yayında']);
  });
});

describe('P4 aday', () => {
  it('ret adayı reddeder ve planlı görüşmeyi iptal eder', async () => {
    const { yazmalar } = ikAc('/ik/yeni/aday/cand_a', { veri: veri() });
    fireEvent.click(await screen.findByRole('button', { name: 'Reddet' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adayı reddet' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/adaylar/cand_a/kaydet', '/ik/gorusmeler/intv_1/kaydet']); });
    expect((yazmalar[0]?.govde as { govde: { asama: string } }).govde.asama).toBe('Reddedildi');
    expect((yazmalar[1]?.govde as { govde: { durum: string } }).govde.durum).toBe('İptal');
  });

  it('okuyan aday dosyasında yazma düğmesi görmez', async () => {
    ikAc('/ik/yeni/aday/cand_a', { kullanici: IK_OKUYAN, veri: veri() });
    expect(await screen.findByRole('heading', { name: /Deniz Aday/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Görüşme planla' })).toBeNull();
  });
});

describe('P4 performans ve eğitim', () => {
  it('yönetici değerlendirme ekler; puanlar performans ucuna gider', async () => {
    const { yazmalar } = ikAc('/ik/yeni/performans', { veri: veri() });
    fireEvent.click(await screen.findByRole('button', { name: 'Değerlendirme ekle' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Çalışan/), { target: { value: 'emp_b' } });
    const radyo = within(pencere).getAllByRole('radio').find((r) => (r as HTMLInputElement).value === '4');
    if (radyo) fireEvent.click(radyo);
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar).toHaveLength(1); });
    expect(yazmalar[0]?.yol).toMatch(/^\/ik\/performans\/perf_[a-z0-9]+\/kaydet$/);
    expect((yazmalar[0]?.govde as { govde: { empId: string } }).govde.empId).toBe('emp_b');
  });

  it('okuyan değerlendirme ekleyemez ve satır formu açmaz', async () => {
    ikAc('/ik/yeni/performans', { kullanici: IK_OKUYAN, veri: veri() });
    await screen.findByRole('heading', { name: /Performans/ });
    const satir = screen.getAllByText('2025 Yıllık').map((e) => e.closest('tr')).find(Boolean) as HTMLElement;
    expect(screen.queryByRole('button', { name: 'Değerlendirme ekle' })).toBeNull();
    fireEvent.click(satir);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('eğitim listesi ve geçerli İSG eğitimi olmayan aktif çalışanlar', async () => {
    ikAc('/ik/yeni/egitim', { kullanici: IK_OKUYAN, veri: veri() });
    expect(await screen.findByText('Tezgah güvenliği')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eğitim ekle' })).toBeNull();
    expect(screen.getByText('Geçerli İSG eğitimi olmayan çalışanlar (1)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mehmet Deneme' })).toBeTruthy();
  });
});

describe('P4 soru bankası', () => {
  it('ayar yazan seti kopyalar (ayar ucu); okuyan yalnız görür', async () => {
    const { yazmalar } = ikAc('/ik/yeni/ise-alim', { veri: veri() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Soru bankası' }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Kopyala' }))[0] as HTMLElement);
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/ayarlar/kaydet']); });
    cleanup();
    ikAc('/ik/yeni/ise-alim', { kullanici: IK_OKUYAN, veri: veri() });
    fireEvent.click(await screen.findByRole('tab', { name: 'Soru bankası' }));
    expect((await screen.findAllByRole('button', { name: 'Tümünü gör' })).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Yeni soru seti' })).toBeNull();
  });
});
