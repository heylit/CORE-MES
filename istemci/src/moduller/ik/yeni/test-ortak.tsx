import { Suspense } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { IkBen, IkKayit, IkVeriCevabi } from '#paylasilan/sozlesme/ik.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { YENI_EKRAN_ISLEMI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';

// Parçaların ortak sınama düzeni. Örnek veri uydurmadır: ad, kimlik ve tutarların gerçek kişiyle ilgisi yoktur.

const IK_TUM: Islem[] = [
  'ik.oku', 'ik.personel-yaz', 'ik.ucret-yaz', 'ik.izin-yaz', 'ik.izin-onay', 'ik.devam-yaz', 'ik.devam-onay', 'ik.bordro-kesinlestir',
  'ik.bordro-kilit-ac', 'ik.performans-yaz', 'ik.egitim-yaz', 'ik.ise-alim-yaz', 'ik.pozisyon-onay', 'ik.ayar-yaz', 'ik.ozel-veri-oku',
  'sayfa.ik', 'sayfa.ik-islemlerim', 'nizamiye.pdks-aktar',
];
export const IK_YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: [...IK_TUM, YENI_EKRAN_ISLEMI] };
// Bütün kayıtları görür, hiçbir şey yazamaz.
export const IK_OKUYAN: Kullanici = { id: 2, ad: 'Deneme Okuyan', islemler: ['ik.oku', 'sayfa.ik', 'sayfa.ik-islemlerim', YENI_EKRAN_ISLEMI] };
export const MUDUR: Kullanici = { id: 3, ad: 'Deneme Mudur', islemler: ['sayfa.ik-islemlerim', 'ik.izin-talep', 'ik.izin-onay', 'ik.bordro-gordum', YENI_EKRAN_ISLEMI] };
export const CALISAN: Kullanici = { id: 4, ad: 'Deneme Calisan', islemler: ['sayfa.ik-islemlerim', 'ik.izin-talep', 'ik.bordro-gordum', YENI_EKRAN_ISLEMI] };
// Kapı işlemi yok: yeni ekran açılmaz.
export const KAPISIZ: Kullanici = { id: 5, ad: 'Deneme Kapisiz', islemler: IK_TUM };

const kayit = (tur: IkKayit['tur'], kimlik: string, govde: Record<string, unknown>, surum = 1): IkKayit =>
  ({ kimlik, tur, surum, govde: { id: kimlik, kind: tur, ...govde } });

export function ornekVeri(ben: Partial<IkBen> = {}): IkVeriCevabi {
  return {
    ben: {
      kisi: { id: 1, ad: 'Deneme Yonetici' }, rol: 'ik', personelKimlik: 'emp_a', saltOkunur: false,
      secenekler: { kisiler: [], isMerkezleri: [] }, ...ben,
    },
    kayitlar: [
      kayit('dept', 'dept_u', { ad: 'Üretim', yoneticiId: 'emp_a' }),
      kayit('emp', 'emp_a', { ad: 'Ayşe', soyad: 'Örnek', departmanId: 'dept_u', iseGiris: '2020-01-06', brutMaas: 50000, kisiId: 1 }),
      kayit('emp', 'emp_b', { ad: 'Mehmet', soyad: 'Deneme', departmanId: 'dept_u', yoneticiId: 'emp_a', iseGiris: '2023-03-01', brutMaas: 40000 }),
      kayit('emp', 'emp_c', { ad: 'Can', soyad: 'Sınama', yoneticiId: 'emp_b', iseGiris: '2024-05-01', cikisTarihi: '2026-01-31' }),
      kayit('leave', 'leave_1', { empId: 'emp_b', tur: 'Yıllık izin', baslangic: '2026-11-02', bitis: '2026-11-06', durum: 'Beklemede' }, 3),
      kayit('att', 'att_1', { empId: 'emp_b', tarih: '2026-10-05', tur: 'Fazla mesai', saat: 2, onay: 'Beklemede' }, 2),
      kayit('job', 'job_1', { baslik: 'CNC operatörü', durum: 'Onay bekliyor' }, 4),
      kayit('pay', 'pay_emp_b_2026-09', { empId: 'emp_b', donem: '2026-09', brut: 40000 }, 5),
    ],
    ayarlar: { govde: { sirket: 'Örnek Atölye' }, surum: 7 },
    gecmis: [],
  };
}

export interface Yazma { yol: string; govde: unknown }

// Uçları taklit eder: oturum, /ik/veri ve yazmalar. Yazma cevabı gönderilen gövdeyi bir sürüm artırıp döner.
export function sunucuKur(kullanici: Kullanici, veri: IkVeriCevabi = ornekVeri()): Yazma[] {
  const yazmalar: Yazma[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = new URL(adres, 'http://yerel').pathname.replace(/^\/api/, '');
    const json = (g: unknown, durum = 200) => new Response(JSON.stringify(g), { status: durum });
    if (yol === '/oturum') return json({ kullanici } satisfies OturumCevabi);
    if (yol === '/ik/veri') return json(veri);
    if (istek?.method === 'POST') {
      const govde: unknown = JSON.parse(String(istek.body ?? 'null'));
      yazmalar.push({ yol, govde });
      const m = /^\/ik\/([a-z]+)\/([^/]+)\/[a-z]+$/.exec(yol);
      const onceki = veri.kayitlar.find((k) => k.kimlik === decodeURIComponent(m?.[2] ?? ''));
      const yeni = onceki ? { ...onceki, surum: onceki.surum + 1 } : kayit('emp', decodeURIComponent(m?.[2] ?? 'emp_x'), {});
      return json({ kayit: yeni, gecmis: [] });
    }
    return json({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404);
  }));
  return yazmalar;
}

export function ikAc(adres: string, { kullanici = IK_YONETICI, veri }: { kullanici?: Kullanici; veri?: IkVeriCevabi } = {}) {
  const yazmalar = sunucuKur(kullanici, veri);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sonuc = render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={[adres]}>
          <Suspense fallback={null}>
            <Routes>{rotalar.map((r) => <Route key={r.yol} path={r.yol} element={<r.ekran />} />)}</Routes>
          </Suspense>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return { ...sonuc, yazmalar, istemci };
}
