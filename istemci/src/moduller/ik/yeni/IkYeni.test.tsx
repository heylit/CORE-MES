import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalariTopla } from '../../../ortak/rota/kesif.ts';
import { rotalar } from '../rotalar.tsx';
import { GORUNUMLER, adrestenGorunum, gorunumAdresi } from './gorunumler.ts';
import { motorKur, ikSabitleri } from './motor.ts';
import { YER_TUTUCU_ILETISI } from './ortak/YerTutucu.tsx';
import { CALISAN, IK_OKUYAN, IK_YONETICI, KAPISIZ, MUDUR, ikAc, ornekVeri } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const sekme = (ad: string) => screen.queryByRole('tab', { name: ad });

describe('İK yeni ekran: rotalar ve adresler', () => {
  it('yeni yollar eski çerçeve yollarıyla çakışmaz', () => {
    expect(() => rotalariTopla({ 'ik/rotalar.tsx': { rotalar } })).not.toThrow();
  });

  it('her görünümün adresi geri aynı görünüme çözülür; kök adres Pano ve Benim sayfam', () => {
    for (const g of Object.keys(GORUNUMLER) as (keyof typeof GORUNUMLER)[]) {
      const t = GORUNUMLER[g];
      expect(adrestenGorunum(t.kok, t.adres === '' ? undefined : t.adres)).toBe(g);
    }
    expect(gorunumAdresi('pano')).toBe('/ik/yeni');
    expect(gorunumAdresi('calisan', 'emp_b')).toBe('/ik/yeni/calisan/emp_b');
    expect(gorunumAdresi('ekiptakvim')).toBe('/ik-islemlerim/yeni/ekip-takvimi');
    expect(adrestenGorunum('/ik', 'yok')).toBeNull();
  });

  it('motor kararı gelene kadar motor ve sabitler yoktur; ekranda kopya hesap yazılmaz', () => {
    expect(motorKur([], null)).toBeNull();
    expect(ikSabitleri()).toBeNull();
  });
});

describe('İK yeni ekran: kapı ve gezinme', () => {
  it('kapı işlemi olmayan kişide açılmaz', async () => {
    ikAc('/ik/yeni', { kullanici: KAPISIZ });
    expect(await screen.findByText(YENI_EKRAN_ILETISI)).toBeTruthy();
    expect(sekme('Pano')).toBeNull();
  });

  it('İK sayfası ikinci menünün maddelerini sekme olarak verir; PDKS Nizamiye ekranına gider', async () => {
    ikAc('/ik/yeni/izinler');
    expect(await screen.findByRole('tab', { name: 'İzinler', selected: true })).toBeTruthy();
    for (const ad of ['Pano', 'Yapılacaklar', 'Personel', 'Bordro', 'İşe alım', 'Değişiklik günlüğü', 'Ayarlar', 'PDKS aktar']) expect(sekme(ad)).toBeTruthy();
    expect(screen.getByText(YER_TUTUCU_ILETISI)).toBeTruthy();
    fireEvent.click(sekme('Bordro') as HTMLElement);
    expect(await screen.findByRole('tab', { name: 'Bordro', selected: true })).toBeTruthy();
  });

  it('ayrıntı sayfasında üst madde seçili görünür', async () => {
    ikAc('/ik/yeni/calisan/emp_b');
    expect(await screen.findByRole('tab', { name: 'Personel', selected: true })).toBeTruthy();
  });

  it('İK okuması olmayan kişi İK sayfasının görünümlerini açamaz', async () => {
    ikAc('/ik/yeni/bordro', { kullanici: CALISAN, veri: ornekVeri({ rol: 'calisan', personelKimlik: 'emp_c' }) });
    expect(await screen.findByText('Bu görünüm bulunamadı ya da size açık değil.')).toBeTruthy();
  });
});

describe('İK yeni ekran: İK İşlemlerim ve 214 a', () => {
  it('çalışan ekip maddelerini görmez', async () => {
    ikAc('/ik-islemlerim/yeni', { kullanici: CALISAN, veri: ornekVeri({ rol: 'calisan', personelKimlik: 'emp_c' }) });
    expect(await screen.findByRole('tab', { name: 'Benim sayfam', selected: true })).toBeTruthy();
    expect(sekme('Mesailerim')).toBeTruthy();
    expect(sekme('Onaylar')).toBeNull();
    expect(sekme('Ekip')).toBeNull();
  });

  it('izin onayı olan yönetici ekip maddelerini görür', async () => {
    ikAc('/ik-islemlerim/yeni/onaylar', { kullanici: MUDUR, veri: ornekVeri({ rol: 'yonetici', personelKimlik: 'emp_a' }) });
    expect(await screen.findByRole('tab', { name: 'Onaylar', selected: true })).toBeTruthy();
    expect(sekme('İzin takvimi')).toBeTruthy();
  });

  it('ekibi olan ama izin onayı olmayan kişi Onaylar adresini açamaz', async () => {
    ikAc('/ik-islemlerim/yeni/onaylar', { kullanici: CALISAN, veri: ornekVeri({ rol: 'yonetici', personelKimlik: 'emp_a' }) });
    expect(await screen.findByText('Bu görünüm bulunamadı ya da size açık değil.')).toBeTruthy();
  });
});

describe('İK yeni ekran: salt okunur', () => {
  it('yazma işlemi olmayan kişiye salt okunur şeridi çıkar', async () => {
    ikAc('/ik/yeni', { kullanici: IK_OKUYAN, veri: ornekVeri({ saltOkunur: true }) });
    expect(await screen.findByText('Bu kayıtları yalnızca görüntüleyebilirsiniz.')).toBeTruthy();
  });
  it('yazabilen kişide şerit yok', async () => {
    ikAc('/ik/yeni', { kullanici: IK_YONETICI });
    expect(await screen.findByRole('tab', { name: 'Pano', selected: true })).toBeTruthy();
    expect(screen.queryByText('Bu kayıtları yalnızca görüntüleyebilirsiniz.')).toBeNull();
  });
});
