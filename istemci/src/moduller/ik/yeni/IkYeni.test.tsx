import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalariTopla } from '../../../ortak/rota/kesif.ts';
import { rotalar } from '../rotalar.tsx';
import { GORUNUMLER, adrestenGorunum, gorunumAdresi } from './gorunumler.ts';
import { ikBicimi, ikSabitleri, motorKur } from './motor.ts';
import { CALISAN, IK_OKUYAN, IK_YONETICI, KAPISIZ, MUDUR, ikAc, ornekVeri } from './test-ortak.tsx';

// Rota IkYeni'yi, IkYeni de parçayı tembel yükler; ilk testin findBy beklemesi (1 sn) soğuk dönüşümü de ödemesin diye
// modüller testlerden önce yüklenir.
beforeAll(async () => { await Promise.all([import('./IkYeni.tsx'), import('./personel/index.tsx'), import('./izin-devam/index.tsx'), import('./bordro/index.tsx'), import('./islemlerim/index.tsx')]); });
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

  it('motor ve sabitler ortak kaynaktan gelir (211 a); kaynak yoksa null döner', () => {
    const motor = motorKur([{ id: 'emp_a', kind: 'emp', ad: 'Ayşe', soyad: 'Örnek', iseGiris: '2020-01-06', brutMaas: 50000 }], null);
    expect(motor?.fullName(motor.activeEmps()[0])).toBe('Ayşe Örnek');
    expect(ikSabitleri()?.STAGES).toContain('İşe alındı');
    expect(ikBicimi()?.validIBAN('TR00')).toBe(false);
    expect(motorKur([], null, undefined, null)).toBeNull();
    expect(ikSabitleri(null)).toBeNull();
  });

  it('tipli yüzün dönüş biçimi motorla aynı (ISTEK-P1)', () => {
    const motor = motorKur([{ id: 'emp_a', kind: 'emp', ad: 'Ayşe', soyad: 'Örnek', iseGiris: '2020-01-06', brutMaas: 50000 }], null);
    const ayse = motor?.activeEmps()[0];
    if (!motor || !ayse) throw new Error('motor yok');
    const bakiye = motor.leaveBalance(ayse, new Date(2026, 4, 1));
    expect(bakiye.rows.map((r) => r.k)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(bakiye.rows[0]?.ann).toBeInstanceOf(Date);
    expect(typeof bakiye.rows[0]?.note).toBe('string');
    expect(motor.settingsList('primler').every((p) => typeof p.id === 'string' && typeof p.kidem === 'boolean')).toBe(true);
    expect(motor.tesvikById('t0')?.tur).toBe('yok');
    for (const p of motor.settingsList('primler')) expect(motor.primDesc(p)).toMatch(/;/);
    expect(Array.isArray(motor.empPrims(ayse))).toBe(true);
    expect(motor.curBrut(ayse)).toBe(50000);
    expect(Object.keys(motor.benefitCfg(ayse, 'yemek')).sort()).toEqual(['deger', 'hesap', 'kisisel', 'yontem']);
    expect(motor.docList().length).toBeGreaterThan(0);
    expect(motor.missingDocs(ayse)).toEqual(motor.docList());
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
