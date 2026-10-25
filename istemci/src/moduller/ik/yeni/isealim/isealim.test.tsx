import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IkKayit, IkVeriCevabi } from '#paylasilan/sozlesme/ik.ts';
import { YENI_EKRAN_ISLEMI } from '../../../../ortak/rota/yeni-ekran.tsx';
import type * as MotorModulu_ from '../motor.ts';
import type { MotorKancasi } from '../motor.ts';
import { IK_OKUYAN, IK_YONETICI, ikAc, ornekVeri } from '../test-ortak.tsx';
import type { Kayit } from '../tipler.ts';

type MotorModulu = typeof MotorModulu_;

// Ekranlar gerçek motorla (paylasilan/ik-motor) sınanır; motorun yokluğu da ayrıca sınanır.
const durum = vi.hoisted(() => ({ motorVar: true }));

vi.mock('../motor.ts', async (asil) => {
  const m = await asil<MotorModulu>();
  const kaynak = () => (durum.motorVar ? m.motorKaynagi : null);
  return {
    ...m,
    motorKur: (k: readonly Kayit[], a: Parameters<MotorModulu['motorKur']>[1], kanca?: MotorKancasi) => m.motorKur(k, a, kanca, kaynak()),
    ikSabitleri: () => m.ikSabitleri(kaynak()),
  };
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); durum.motorVar = true; });

// Onaycı: pozisyonu açabilir, işe alım kaydı yazamaz.
const ONAYCI: Kullanici = { id: 6, ad: 'Deneme Onayci', islemler: ['ik.oku', 'sayfa.ik', 'ik.pozisyon-onay', YENI_EKRAN_ISLEMI] };

const kayit = (tur: IkKayit['tur'], kimlik: string, govde: Record<string, unknown>, surum = 1): IkKayit =>
  ({ kimlik, tur, surum, govde: { id: kimlik, kind: tur, ...govde } });

function veri(): IkVeriCevabi {
  const v = ornekVeri();
  return {
    ...v,
    ayarlar: { govde: { ...v.ayarlar.govde, soruSetleri: [{ id: 'q_1', ad: 'Deneme seti', kategori: 'Genel', odak: '', sorular: 'Birinci soru\nİkinci soru' }] }, surum: 7 },
    kayitlar: [
      ...v.kayitlar.filter((k) => k.kimlik !== 'job_1'),
      kayit('job', 'job_1', { baslik: 'Deneme pozisyonu', durum: 'Onay bekliyor', departmanId: 'dept_u', ilanKodu: 'ILN-1' }, 4),
      kayit('cand', 'cand_1', { ad: 'Deneme', soyad: 'Aday', jobId: 'job_1', asama: 'Başvuru', kaynak: 'Deneme kanalı', basvuruTarihi: '2026-10-01' }, 2),
      kayit('intv', 'intv_1', { candId: 'cand_1', tur: 'İK mülakatı', tarih: '2026-10-10', saat: '10:00', durum: 'Tamamlandı', oneri: 'Alınsın', skorlar: { İletişim: 4 } }),
      kayit('perf', 'perf_1', { empId: 'emp_b', donem: '2026', skorlar: { Kalite: 4, Verimlilik: 3 } }),
      kayit('train', 'train_1', { ad: 'Deneme eğitimi', tur: 'Teknik', tarih: '2026-09-01', sure: 4, katilimcilar: ['emp_b'], durum: 'Tamamlandı' }),
    ],
  };
}

const ac = (adres: string, kullanici: Kullanici = IK_YONETICI) => ikAc(adres, { kullanici, veri: veri() });
const dugme = (ad: string) => screen.queryByRole('button', { name: ad });

describe('P4: motor yokken', () => {
  it('beş ekran da hesap motorunun hazırlandığını söyler; boş liste uydurmaz', async () => {
    durum.motorVar = false;
    for (const adres of ['/ik/yeni/performans', '/ik/yeni/egitim', '/ik/yeni/ise-alim', '/ik/yeni/aday/cand_1', '/ik/yeni/pozisyon/job_1']) {
      ac(adres);
      expect(await screen.findByText('Hesap motoru hazırlanıyor')).toBeTruthy();
      cleanup();
    }
  });
});

describe('P4: performans ve eğitim', () => {
  it('yazabilen ekler ve satırdan düzenleyip kaydeder', async () => {
    const { yazmalar } = ac('/ik/yeni/performans');
    expect(await screen.findByRole('button', { name: 'Değerlendirme ekle' })).toBeTruthy();
    fireEvent.click(await screen.findByText('Mehmet Deneme'));
    fireEvent.click(await screen.findByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toContain('/ik/performans/perf_1/kaydet'); });
  });

  it('okuyan kayıtları görür, ekleme düğmesi yoktur', async () => {
    ac('/ik/yeni/performans', IK_OKUYAN);
    expect(await screen.findByText('Mehmet Deneme')).toBeTruthy();
    expect(dugme('Değerlendirme ekle')).toBeNull();
  });

  it('eğitim: yazabilen ekler, okuyan eklemez', async () => {
    ac('/ik/yeni/egitim');
    expect(await screen.findByRole('button', { name: 'Eğitim ekle' })).toBeTruthy();
    cleanup();
    ac('/ik/yeni/egitim', IK_OKUYAN);
    expect(await screen.findByText('Deneme eğitimi')).toBeTruthy();
    expect(dugme('Eğitim ekle')).toBeNull();
  });
});

describe('P4: işe alım ve aday', () => {
  it('süreçte aday sonraki aşamaya taşınır', async () => {
    const { yazmalar } = ac('/ik/yeni/ise-alim');
    fireEvent.click(await screen.findByRole('button', { name: 'Sonraki aşamaya taşı' }));
    await waitFor(() => { expect(yazmalar.find((y) => y.yol === '/ik/adaylar/cand_1/kaydet')).toBeTruthy(); });
    const y = yazmalar.find((x) => x.yol === '/ik/adaylar/cand_1/kaydet');
    expect((y?.govde as { govde: { asama: string } }).govde.asama).toBe('Ön görüşme');
  });

  it('okuyan süreci görür, taşıma ve ekleme düğmeleri yoktur', async () => {
    ac('/ik/yeni/ise-alim', IK_OKUYAN);
    expect(await screen.findByText('Deneme Aday')).toBeTruthy();
    expect(dugme('Aday ekle')).toBeNull();
    expect(dugme('Sonraki aşamaya taşı')).toBeNull();
  });

  it('sekme adreste tutulur', async () => {
    ac('/ik/yeni/ise-alim?sekme=sorular');
    expect(await screen.findByRole('tab', { name: 'Soru bankası', selected: true })).toBeTruthy();
    expect(screen.getByText('Deneme seti')).toBeTruthy();
  });

  it('aday dosyası: yazabilen görüşme planlar, okuyan planlayamaz', async () => {
    ac('/ik/yeni/aday/cand_1');
    expect(await screen.findByRole('button', { name: 'Görüşme planla' })).toBeTruthy();
    cleanup();
    ac('/ik/yeni/aday/cand_1', IK_OKUYAN);
    expect(await screen.findByRole('heading', { name: 'Deneme Aday' })).toBeTruthy();
    expect(dugme('Görüşme planla')).toBeNull();
  });
});

describe('P4: pozisyon', () => {
  it('onaycı onay bekleyen pozisyonu onay ucuyla açar', async () => {
    const { yazmalar } = ac('/ik/yeni/pozisyon/job_1', ONAYCI);
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla ve yayına hazırla' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toContain('/ik/pozisyonlar/job_1/onayla'); });
  });

  it('okuyan pozisyonu görür, durum düğmesi yoktur', async () => {
    ac('/ik/yeni/pozisyon/job_1', IK_OKUYAN);
    expect(await screen.findByRole('heading', { name: 'Deneme pozisyonu' })).toBeTruthy();
    expect(dugme('Onayla ve yayına hazırla')).toBeNull();
  });

  it('silme iptal ucuyla gider; Geri al aynı kaydı yeniden yazar', async () => {
    const { yazmalar } = ac('/ik/yeni/pozisyon/job_1');
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme pozisyonu: diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sil' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pozisyonu sil' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toContain('/ik/pozisyonlar/job_1/iptal'); });
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toContain('/ik/pozisyonlar/job_1/kaydet'); });
  });

  it('ilan metni sekmesi motorun metnini gösterir', async () => {
    ac('/ik/yeni/pozisyon/job_1');
    fireEvent.click(await screen.findByRole('tab', { name: 'İlan metni' }));
    const alan = await screen.findByLabelText('İlan metni');
    expect((alan as HTMLTextAreaElement).value).toContain('DENEME POZİSYONU');
    expect(within(document.body).getByRole('button', { name: 'Metni kopyala' })).toBeTruthy();
  });
});
