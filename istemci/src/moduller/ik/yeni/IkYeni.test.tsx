import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { rotalariTopla } from '../../../ortak/rota/kesif.ts';
import { rotalar } from '../rotalar.tsx';
import { GORUNUMLER, adrestenGorunum, gorunumAdresi } from './gorunumler.ts';
import { ikBicimi, ikSabitleri, motorKur } from './motor.ts';
import { CALISAN, IK_OKUYAN, IK_YONETICI, MUDUR, ikAc, ornekVeri } from './test-ortak.tsx';

// IkYeni parçayı tembel yükler; ilk testin findBy beklemesi (1 sn) soğuk dönüşümü de ödemesin diye
// modüller testlerden önce yüklenir.
beforeAll(async () => { await Promise.all([import('./IkYeni.tsx'), import('./personel/index.tsx'), import('./izin-devam/index.tsx'), import('./bordro/index.tsx'), import('./islemlerim/index.tsx')]); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const sekme = (ad: string) => screen.queryByRole('tab', { name: ad });

describe('İK yeni ekran: rotalar ve adresler', () => {
  it('yollar birbiriyle ve PDKS yoluyla çakışmaz', () => {
    expect(() => rotalariTopla({ 'ik/rotalar.tsx': { rotalar } })).not.toThrow();
  });

  it('her görünümün adresi geri aynı görünüme çözülür; kök adres Pano ve Benim sayfam', () => {
    for (const g of Object.keys(GORUNUMLER) as (keyof typeof GORUNUMLER)[]) {
      const t = GORUNUMLER[g];
      expect(adrestenGorunum(t.kok, t.adres === '' ? undefined : t.adres)).toBe(g);
    }
    expect(gorunumAdresi('pano')).toBe('/ik');
    expect(gorunumAdresi('calisan', 'emp_b')).toBe('/ik/calisan/emp_b');
    expect(gorunumAdresi('ekiptakvim')).toBe('/ik-islemlerim/ekip-takvimi');
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

describe('İK yeni ekran: gezinme', () => {
  it('İK sayfası ikinci menünün maddelerini sekme olarak verir; PDKS Nizamiye ekranına gider', async () => {
    ikAc('/ik/izinler');
    expect(await screen.findByRole('tab', { name: 'İzinler', selected: true })).toBeTruthy();
    for (const ad of ['Pano', 'Yapılacaklar', 'Personel', 'Bordro', 'İşe alım', 'Değişiklik günlüğü', 'Ayarlar', 'PDKS aktar']) expect(sekme(ad)).toBeTruthy();
    fireEvent.click(sekme('Bordro') as HTMLElement);
    expect(await screen.findByRole('tab', { name: 'Bordro', selected: true })).toBeTruthy();
  });

  it('ayrıntı sayfasında üst madde seçili görünür', async () => {
    ikAc('/ik/calisan/emp_b');
    expect(await screen.findByRole('tab', { name: 'Personel', selected: true })).toBeTruthy();
  });

  it('İK okuması olmayan kişi İK sayfasının görünümlerini açamaz', async () => {
    ikAc('/ik/bordro', { kullanici: CALISAN, veri: ornekVeri({ rol: 'calisan', personelKimlik: 'emp_c' }) });
    expect(await screen.findByText('Bu görünüm bulunamadı ya da size açık değil.')).toBeTruthy();
  });
});

describe('İK yeni ekran: İK İşlemlerim ve 214 a', () => {
  it('çalışan ekip maddelerini görmez', async () => {
    ikAc('/ik-islemlerim', { kullanici: CALISAN, veri: ornekVeri({ rol: 'calisan', personelKimlik: 'emp_c' }) });
    expect(await screen.findByRole('tab', { name: 'Benim sayfam', selected: true })).toBeTruthy();
    expect(sekme('Mesailerim')).toBeTruthy();
    expect(sekme('Onaylar')).toBeNull();
    expect(sekme('Ekip')).toBeNull();
  });

  it('izin onayı olan yönetici ekip maddelerini görür', async () => {
    ikAc('/ik-islemlerim/onaylar', { kullanici: MUDUR, veri: ornekVeri({ rol: 'yonetici', personelKimlik: 'emp_a' }) });
    expect(await screen.findByRole('tab', { name: 'Onaylar', selected: true })).toBeTruthy();
    expect(sekme('İzin takvimi')).toBeTruthy();
  });

  it('ekibi olan ama izin onayı olmayan kişi Onaylar adresini açamaz', async () => {
    ikAc('/ik-islemlerim/onaylar', { kullanici: CALISAN, veri: ornekVeri({ rol: 'yonetici', personelKimlik: 'emp_a' }) });
    expect(await screen.findByText('Bu görünüm bulunamadı ya da size açık değil.')).toBeTruthy();
  });
});

describe('İK yeni ekran: salt okunur', () => {
  it('yazma işlemi olmayan kişiye salt okunur şeridi çıkar', async () => {
    ikAc('/ik', { kullanici: IK_OKUYAN, veri: ornekVeri({ saltOkunur: true }) });
    expect(await screen.findByText('Bu kayıtları yalnızca görüntüleyebilirsiniz.')).toBeTruthy();
  });
  it('yazabilen kişide şerit yok', async () => {
    ikAc('/ik', { kullanici: IK_YONETICI });
    expect(await screen.findByRole('tab', { name: 'Pano', selected: true })).toBeTruthy();
    expect(screen.queryByText('Bu kayıtları yalnızca görüntüleyebilirsiniz.')).toBeNull();
  });
});

describe('İK yeni ekran: eski ekrandan taşınan araçlar (1614)', () => {
  it('kişi sayfasındaki izin talebi gerçek formu açar, yer tutucu kalmadı', async () => {
    ikAc('/ik/calisan/emp_b');
    fireEvent.click(await screen.findByRole('button', { name: 'İzin talebi' }));
    const pencere = await screen.findByRole('dialog', { name: 'Yeni izin' });
    expect(within(pencere).queryByText('Bu görünüm hazırlanıyor')).toBeNull();
    expect(await within(pencere).findByLabelText(/İzin türü/)).toBeTruthy();
  });

  it('Ara kişiyi bulur, Enter kişi sayfasını açar', async () => {
    ikAc('/ik');
    fireEvent.click(await screen.findByRole('button', { name: 'Ara' }));
    const kutu = within(await screen.findByRole('dialog', { name: 'Ara' })).getByRole('combobox');
    fireEvent.change(kutu, { target: { value: 'mehmet' } });
    expect(screen.getByRole('option', { name: /Mehmet Deneme/ })).toBeTruthy();
    fireEvent.keyDown(kutu, { key: 'Enter' });
    expect(await screen.findByRole('tab', { name: 'Personel', selected: true })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Ara' })).toBeNull();
  });

  it('reddedilen: salt okuyan aramada personel ekle görmez', async () => {
    ikAc('/ik', { kullanici: IK_OKUYAN, veri: ornekVeri({ saltOkunur: true }) });
    fireEvent.click(await screen.findByRole('button', { name: 'Ara' }));
    fireEvent.change(within(await screen.findByRole('dialog', { name: 'Ara' })).getByRole('combobox'), { target: { value: 'ekle' } });
    const islemler = screen.getAllByRole('option').map((o) => o.textContent).filter((t) => t?.startsWith('İşlem'));
    expect(islemler).toEqual(['İşlemAday ekle']);
  });

  it('Yardım ve F1 kılavuzu açar; görünümün konusu başta gelir', async () => {
    ikAc('/ik/yapilacaklar');
    fireEvent.click(await screen.findByRole('button', { name: /Yardım/ }));
    const kilavuz = await screen.findByRole('dialog', { name: 'Kullanım kılavuzu' });
    expect(within(kilavuz).getByText('Bu sayfa hakkında')).toBeTruthy();
    fireEvent.click(within(kilavuz).getByRole('button', { name: 'Kılavuzu kapat' }));
    expect(screen.queryByRole('dialog', { name: 'Kullanım kılavuzu' })).toBeNull();
    fireEvent.keyDown(window, { key: 'F1' });
    expect(await screen.findByRole('dialog', { name: 'Kullanım kılavuzu' })).toBeTruthy();
  });
});
