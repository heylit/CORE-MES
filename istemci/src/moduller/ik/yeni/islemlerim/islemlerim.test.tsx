import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { IkBen, IkKayit, IkVeriCevabi } from '#paylasilan/sozlesme/ik.ts';
import { MOTOR_HAZIRLANIYOR, ikSabitleri } from '../motor.ts';
import { CALISAN, IK_OKUYAN, IK_YONETICI, MUDUR, ikAc, ornekVeri } from '../test-ortak.tsx';

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 23, 10, 0)); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// Motor bağlanınca (M0) motorlu, bağlanmadan önce "hazırlanıyor" yolu sınanır; testler iki birleşme sırasında da geçer.
const motorVar = ikSabitleri() !== null;

// Örnek veriye kesinleşmiş bir bordro eklenir (uydurma tutarlar).
function veri(ben: Partial<IkBen>, ek: IkKayit[] = []): IkVeriCevabi {
  const v = ornekVeri(ben);
  return {
    ...v,
    kayitlar: [
      ...v.kayitlar.filter((k) => k.kimlik !== 'pay_emp_b_2026-09'),
      {
        kimlik: 'pay_emp_b_2026-09', tur: 'pay', surum: 5,
        govde: { id: 'pay_emp_b_2026-09', kind: 'pay', empId: 'emp_b', donem: '2026-09', brut: 40000, snap: { toplam: 40000, net: 31000, sgk: 5600, iss: 400, gv: 2900, dv: 100, gun: 30 } },
      },
      ...ek,
    ],
  };
}
const calisan = () => veri({ rol: 'calisan', personelKimlik: 'emp_b', kisi: { id: 4, ad: 'Deneme Calisan' } });
const mudur = () => veri({ rol: 'yonetici', personelKimlik: 'emp_a', kisi: { id: 3, ad: 'Deneme Mudur' } });

describe('P6 Benim sayfam', () => {
  it('çalışan kendi özetini görür; bakiye motordan (yoksa "hazırlanıyor"), ekip kartı yok', async () => {
    ikAc('/ik-islemlerim/yeni', { kullanici: CALISAN, veri: calisan() });
    expect(await screen.findByRole('heading', { name: 'Merhaba, Mehmet' })).toBeTruthy();
    expect(screen.queryByText(MOTOR_HAZIRLANIYOR) === null).toBe(motorVar);
    expect(screen.getByRole('button', { name: 'İzin talep et' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Güncelle' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Ekibim' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Görünüm' })).toBeNull();
  });

  it('personel kaydına bağlı olmayan hesap uyarı görür', async () => {
    ikAc('/ik-islemlerim/yeni', { kullanici: CALISAN, veri: veri({ rol: 'calisan', personelKimlik: null }) });
    expect(await screen.findByText('Hesabınız bir personel kaydıyla eşleşmedi')).toBeTruthy();
  });

  it('izin onayı olan yönetici ekibini ve bekleyen talebi görür', async () => {
    ikAc('/ik-islemlerim/yeni', { kullanici: MUDUR, veri: mudur() });
    expect(await screen.findByRole('heading', { name: 'Ekibim' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 talep onay bekliyor' })).toBeTruthy();
  });

  it('iletişim bilgisini kendi ucuyla yazar (IK-14)', async () => {
    const { yazmalar } = ikAc('/ik-islemlerim/yeni', { kullanici: CALISAN, veri: calisan() });
    fireEvent.click(await screen.findByRole('button', { name: 'Güncelle' }));
    const pencere = await screen.findByRole('dialog', { name: 'İletişim bilgilerim' });
    fireEvent.change(within(pencere).getByLabelText('Telefon'), { target: { value: '0000 000 00 00' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/personel/emp_b/iletisim']); });
    expect(yazmalar[0]?.govde).toMatchObject({ alanlar: { telefon: '0000 000 00 00' }, surum: 1 });
  });

  it('İK için de başka bir gözle görüntüleme yok (Soru 856)', async () => {
    ikAc('/ik-islemlerim/yeni', { kullanici: IK_YONETICI });
    expect(await screen.findByRole('tab', { name: 'Benim sayfam', selected: true })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Görünüm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Önizlemeden çık' })).toBeNull();
  });
});

describe('P6 İzinlerim', () => {
  it('çalışan bekleyen talebini talep ucuyla geri çeker', async () => {
    const { yazmalar } = ikAc('/ik-islemlerim/yeni/izinlerim', { kullanici: CALISAN, veri: calisan() });
    fireEvent.click(await screen.findByRole('button', { name: 'Talebi geri çek' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/izinler/leave_1/talep']); });
    expect(yazmalar[0]?.govde).toMatchObject({ govde: { durum: 'İptal', karar: '2026-10-23' }, surum: 3 });
    expect(await screen.findByText('Talebiniz geri çekildi.')).toBeTruthy();
  });

  it('talep yetkisi olmayan kişi talep açamaz ve geri çekemez', async () => {
    ikAc('/ik-islemlerim/yeni/izinlerim', { kullanici: IK_OKUYAN, veri: veri({ rol: 'ik', personelKimlik: 'emp_b' }) });
    expect(await screen.findByRole('cell', { name: 'Yıllık izin' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Talebi geri çek' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İzin talep et' })).toBeNull();
  });

  it('izin talebi talep ucuyla beklemede gider; motor yoksa pencere "hazırlanıyor" der', async () => {
    const { yazmalar } = ikAc('/ik-islemlerim/yeni/izinlerim', { kullanici: CALISAN, veri: calisan() });
    fireEvent.click(await screen.findByRole('button', { name: 'İzin talep et' }));
    const pencere = await screen.findByRole('dialog', { name: 'İzin talebi' });
    if (!motorVar) {
      expect(within(pencere).getByText(MOTOR_HAZIRLANIYOR)).toBeTruthy();
      return;
    }
    fireEvent.change(within(pencere).getByLabelText('İzin türü'), { target: { value: 'Hastalık / rapor' } });
    fireEvent.change(within(pencere).getByLabelText('Başlangıç'), { target: { value: '2026-12-07' } });
    fireEvent.change(within(pencere).getByLabelText('Bitiş'), { target: { value: '2026-12-08' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Talebi gönder' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual([expect.stringMatching(/^\/ik\/izinler\/leave_[^/]+\/talep$/)]); });
    expect(yazmalar[0]?.govde).toMatchObject({ govde: { empId: 'emp_b', tur: 'Hastalık / rapor', gun: 2, durum: 'Beklemede' } });
  });

  it('çakışan tarihte talep gönderilmez', async () => {
    const { yazmalar } = ikAc('/ik-islemlerim/yeni/izinlerim', { kullanici: CALISAN, veri: calisan() });
    fireEvent.click(await screen.findByRole('button', { name: 'İzin talep et' }));
    const pencere = await screen.findByRole('dialog', { name: 'İzin talebi' });
    if (!motorVar) return;
    fireEvent.change(within(pencere).getByLabelText('Başlangıç'), { target: { value: '2026-11-03' } });
    fireEvent.change(within(pencere).getByLabelText('Bitiş'), { target: { value: '2026-11-04' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Talebi gönder' }));
    expect(await within(pencere).findByText('Seçtiğiniz tarihlerde başka bir izniniz var.')).toBeTruthy();
    expect(yazmalar).toEqual([]);
  });
});

describe('P6 Bordrolarım', () => {
  it('yalnız kesinleşmiş ay görünür; çalışan "Gördüm, onaylıyorum" ile okunan sürümü onaylar', async () => {
    const { yazmalar } = ikAc('/ik-islemlerim/yeni/bordrolarim', { kullanici: CALISAN, veri: calisan() });
    expect(await screen.findByRole('cell', { name: 'Eylül 2026' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gördüm, onaylıyorum' }));
    const onay = await screen.findByRole('dialog', { name: 'Bordronuzu onaylıyor musunuz?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Gördüm, onaylıyorum' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/bordrolar/pay_emp_b_2026-09/gordum']); });
    expect(yazmalar[0]?.govde).toEqual({ surum: 5 });
  });

  it('onay yetkisi olmayan kişi düğme yerine "Onay bekliyor" görür; pusula açılır', async () => {
    ikAc('/ik-islemlerim/yeni/bordrolarim', { kullanici: IK_OKUYAN, veri: veri({ rol: 'ik', personelKimlik: 'emp_b' }) });
    expect(await screen.findByText('Onay bekliyor')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gördüm, onaylıyorum' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pusula' }));
    expect(await screen.findByRole('dialog', { name: 'Ücret bordrosu (pusula)' })).toBeTruthy();
  });

  it('kesinleşmiş bordro yoksa boş liste iletisi', async () => {
    ikAc('/ik-islemlerim/yeni/bordrolarim', { kullanici: CALISAN, veri: ornekVeri({ rol: 'calisan', personelKimlik: 'emp_b' }) });
    expect(await screen.findByText(/Kesinleşmiş bordronuz yok/)).toBeTruthy();
  });
});

describe('P6 Mesailerim', () => {
  it('ayın devam kayıtları salt okunur; puantaj okunamazsa takvim hata gösterir', async () => {
    // Varsayılan puantaj cevabı test-ortak'ta (Y0c); burada okuma bilerek düşürülür.
    const okumalar = { '/ik/puantaj': () => { throw new Error('puantaj okunamadı'); } };
    ikAc('/ik-islemlerim/yeni/mesailerim', { kullanici: CALISAN, veri: calisan(), okumalar });
    expect(await screen.findByRole('cell', { name: 'Fazla mesai' })).toBeTruthy();
    expect(screen.getByText('Beklemede')).toBeTruthy();
    expect(await screen.findByText('Puantaj yüklenemedi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Kaydet|Düzenle/ })).toBeNull();
  });
});

describe('P6 Onaylar, Ekip ve İzin takvimi', () => {
  it('yönetici bekleyen talebi karar ucuyla onaylar', async () => {
    const { yazmalar } = ikAc('/ik-islemlerim/yeni/onaylar', { kullanici: MUDUR, veri: mudur() });
    fireEvent.click(await screen.findByRole('button', { name: 'Onayla' }));
    await waitFor(() => { expect(yazmalar.map((y) => y.yol)).toEqual(['/ik/izinler/leave_1/karar']); });
    expect(yazmalar[0]?.govde).toEqual({ durum: 'Onaylandı', surum: 3 });
  });

  it.runIf(motorVar)('onaylanırsa kalan izin bekleyen talebin gününü düşer (413/3 b)', async () => {
    const kalan = async (gun: number): Promise<number> => {
      const v = mudur();
      const kayitlar = v.kayitlar.map((k) => (k.kimlik === 'leave_1' ? { ...k, govde: { ...k.govde, gun } } : k));
      ikAc('/ik-islemlerim/yeni/onaylar', { kullanici: MUDUR, veri: { ...v, kayitlar } });
      const metin = (await screen.findByText(/Onaylanırsa kalan yıllık izin/)).textContent ?? '';
      cleanup();
      return Number(/izin (-?[\d.,]+) gün/.exec(metin)?.[1]?.replace(',', '.'));
    };
    expect((await kalan(0)) - (await kalan(5))).toBe(5);
  });

  it('izin onayı olmayan kişi ekip görünümlerini açamaz (214 a)', async () => {
    ikAc('/ik-islemlerim/yeni/onaylar', { kullanici: CALISAN, veri: veri({ rol: 'yonetici', personelKimlik: 'emp_b' }) });
    expect(await screen.findByText('Bu görünüm bulunamadı ya da size açık değil.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
  });

  it('ekip listesi ayrılanı göstermez; üye sayfasında ücret ve kimlik yok', async () => {
    ikAc('/ik-islemlerim/yeni/ekip', { kullanici: MUDUR, veri: mudur() });
    fireEvent.click(await screen.findByText('Mehmet Deneme'));
    expect(screen.queryByText('Can Sınama')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'İletişim' })).toBeTruthy();
    expect(screen.queryByText(/40\.000|T\.C\./)).toBeNull();
  });

  it('ekipte olmayan kişinin üye sayfası ekip listesine döner', async () => {
    ikAc('/ik-islemlerim/yeni/uye/emp_c', { kullanici: MUDUR, veri: mudur() });
    expect(await screen.findByRole('table', { name: 'Ekip' })).toBeTruthy();
  });

  it('izin takvimi yöneticiyi ve ekibini ayın günleriyle gösterir', async () => {
    ikAc('/ik-islemlerim/yeni/ekip-takvimi', { kullanici: MUDUR, veri: mudur() });
    expect(await screen.findByRole('rowheader', { name: 'Ayşe Örnek (siz)' })).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: 'Mehmet Deneme' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(32);
  });
});
