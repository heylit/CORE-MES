import { describe, expect, it, vi } from 'vitest';
import type { IkKayit } from '#paylasilan/sozlesme/ik.ts';
import { ornekVeri } from './test-ortak.tsx';
import type { Kayit } from './tipler.ts';
import { bordroGirdisi, depoKur, depoyaYaz, komutlariKur, yazmaHedefi, yeniKimlik, type DepoYamasi, type IkDeposu, type Istemci } from './veri.ts';
import type { YazmaYetkisi } from './yetki.ts';

const TAM: YazmaYetkisi = { izinYaz: true, devamYaz: true, iseAlimYaz: true, personelYaz: true };
const DAR: YazmaYetkisi = { izinYaz: false, devamYaz: false, iseAlimYaz: false, personelYaz: false };

function kur(yetki: YazmaYetkisi) {
  let depo: IkDeposu = depoKur(ornekVeri());
  const istekler: { yol: string; govde: unknown }[] = [];
  const istemci: Istemci = {
    get: vi.fn(),
    post: vi.fn(async (yol: string, govde?: unknown) => {
      istekler.push({ yol, govde });
      const kimlik = decodeURIComponent(yol.split('/')[3] ?? '');
      const onceki = depo.al(kimlik);
      const kayit: IkKayit = { kimlik, tur: onceki?.kind ?? 'emp', surum: (depo.surumler.get(kimlik) ?? 0) + 1, govde: { ...(onceki ?? {}), id: kimlik } };
      return { kayit, kayitlar: [kayit], gecmis: [], ayarlar: { govde: { sirket: 'Yeni' }, surum: 8 } } as never;
    }) as Istemci['post'],
  };
  const uyarilar: string[] = [];
  const k = komutlariKur(istemci, () => depo, (y: DepoYamasi) => { depo = depoyaYaz(depo, y); }, yetki, (m) => { uyarilar.push(m); });
  return { k, istekler, depo: () => depo, uyarilar };
}

describe('İK yeni ekran: depo', () => {
  it('GET /ik/veri kayıtları türe göre ve sürümleriyle tutar', () => {
    const d = depoKur(ornekVeri());
    expect(d.tur('emp').map((e) => e.id)).toEqual(['emp_a', 'emp_b', 'emp_c']);
    expect(d.surumler.get('leave_1')).toBe(3);
    expect(d.al('job_1')?.kind).toBe('job');
    expect(d.al(null)).toBeNull();
    expect(d.ayarlar.sirket).toBe('Örnek Atölye');
    expect(d.ayarSurumu).toBe(7);
  });

  it('yazma cevabı depoyu değiştirmeden yeni depo verir; iptal edilen kaydın sürümü saklanır', () => {
    const d = depoKur(ornekVeri());
    const y = depoyaYaz(d, { kayitlar: [{ kimlik: 'emp_b', tur: 'emp', surum: 9, govde: { id: 'emp_b', kind: 'emp', ad: 'Yeni' } }] });
    expect(y.al('emp_b')?.['ad']).toBe('Yeni');
    expect(d.al('emp_b')?.['ad']).toBe('Mehmet');
    const s = depoyaYaz(y, { silinen: [{ kimlik: 'emp_b', surum: 10 }] });
    expect(s.al('emp_b')).toBeNull();
    expect(s.surumler.get('emp_b')).toBe(10);
    expect(s.tur('emp').map((e) => e.id)).toEqual(['emp_a', 'emp_c']);
  });
});

describe('İK yeni ekran: yazma ucu yetkiye göre (bugünkü köprü kuralları)', () => {
  const d = depoKur(ornekVeri());
  const izin = d.al('leave_1') as Kayit;

  it('izni yazabilen kaydet ucuna okunan sürümle yazar', () => {
    expect(yazmaHedefi({ ...izin, durum: 'Onaylandı' }, izin, 3, TAM)).toEqual({ yol: '/ik/izinler/leave_1/kaydet', govde: { govde: { ...izin, durum: 'Onaylandı' }, surum: 3 } });
  });
  it('izni yazamayan onaycı karar ucuna yalnız kararı yollar', () => {
    expect(yazmaHedefi({ ...izin, durum: 'Reddedildi' }, izin, 3, DAR)).toEqual({ yol: '/ik/izinler/leave_1/karar', govde: { durum: 'Reddedildi', surum: 3 } });
  });
  it('yeni izin talebi talep ucuna gider', () => {
    const yeni: Kayit = { id: 'leave_y', kind: 'leave', empId: 'emp_b', durum: 'Beklemede' };
    expect(yazmaHedefi(yeni, null, null, DAR).yol).toBe('/ik/izinler/leave_y/talep');
  });
  it('devamı yazamayan yalnız onayı değiştirir (IK-78)', () => {
    const att = d.al('att_1') as Kayit;
    expect(yazmaHedefi({ ...att, onay: 'Onaylandı', saat: 9 }, att, 2, DAR)).toEqual({ yol: '/ik/devam/att_1/onay', govde: { durum: 'Onaylandı', surum: 2 } });
  });
  it('işe alım yazamayan onaycı pozisyonu yalnız onaylar', () => {
    const job = d.al('job_1') as Kayit;
    expect(yazmaHedefi({ ...job, durum: 'Açık' }, job, 4, DAR)).toEqual({ yol: '/ik/pozisyonlar/job_1/onayla', govde: { surum: 4 } });
  });
  it('personeli yazamayan yalnız iletişim alanlarını yollar', () => {
    const emp = d.al('emp_b') as Kayit;
    const h = yazmaHedefi({ ...emp, telefon: '0500', brutMaas: 1 }, emp, 1, DAR);
    expect(h.yol).toBe('/ik/personel/emp_b/iletisim');
    expect(h.govde).toEqual({ alanlar: { telefon: '0500', eposta: '', adres: '', acilKisi: '', acilYakinlik: '', acilTelefon: '' }, surum: 1 });
  });
  it('bordro bu yoldan yazılmaz', () => {
    expect(() => yazmaHedefi(d.al('pay_emp_b_2026-09') as Kayit, null, null, TAM)).toThrow();
  });
});

describe('İK yeni ekran: komutlar', () => {
  it('kaydet cevabı depoya yazar', async () => {
    const { k, istekler, depo } = kur(TAM);
    await k.kaydet({ ...(depo().al('emp_b') as Kayit), ad: 'Değişti' });
    expect(istekler[0]?.yol).toBe('/ik/personel/emp_b/kaydet');
    expect(depo().surumler.get('emp_b')).toBe(2);
  });

  it('iptal kaydı depodan çıkarır, sürümünü saklar', async () => {
    const { k, istekler, depo } = kur(TAM);
    await k.iptal('job_1');
    expect(istekler[0]).toEqual({ yol: '/ik/pozisyonlar/job_1/iptal', govde: { surum: 4 } });
    expect(depo().al('job_1')).toBeNull();
    expect(depo().surumler.get('job_1')).toBe(5);
  });

  it('toplu kaydet: izni yazamayanın talepleri tek tek kendi ucuna gider', async () => {
    const { k, istekler } = kur(DAR);
    await k.topluKaydet([
      { id: 'leave_x', kind: 'leave', durum: 'Beklemede' },
      { id: 'leave_z', kind: 'leave', durum: 'Beklemede' },
    ]);
    expect(istekler.map((i) => i.yol)).toEqual(['/ik/izinler/leave_x/talep', '/ik/izinler/leave_z/talep']);
  });

  it('bordro kesinleştirme aya göre yalnız girdileri yollar', async () => {
    const { k, istekler } = kur(TAM);
    await k.bordroKesinlestir([{ id: 'pay_emp_b_2026-10', kind: 'pay', empId: 'emp_b', donem: '2026-10', brut: 40000, gun: 29.6, net: 99 }]);
    expect(istekler[0]?.yol).toBe('/ik/bordro/2026-10/kesinlestir');
    expect(istekler[0]?.govde).toEqual({ girdiler: { emp_b: { brut: 40000, gun: 30, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 } } });
  });

  it('ayar kaydı okunan ayar sürümüyle gider ve yeni sürümü tutar', async () => {
    const { k, istekler, depo } = kur(TAM);
    await k.ayarKaydet({ sirket: 'Yeni' });
    expect(istekler[0]).toEqual({ yol: '/ik/ayarlar/kaydet', govde: { govde: { sirket: 'Yeni' }, surum: 7 } });
    expect(depo().ayarSurumu).toBe(8);
  });

  it('bordro onayı okunan sürümü taşır (IK-43); bordro olmayan kayıtta reddedilir', async () => {
    const { k, istekler } = kur(DAR);
    await k.bordroGordum('pay_emp_b_2026-09');
    expect(istekler[0]).toEqual({ yol: '/ik/bordrolar/pay_emp_b_2026-09/gordum', govde: { surum: 5 } });
    await expect(k.bordroGordum('emp_b')).rejects.toThrow('Bordro bulunamadı.');
  });
});

describe('İK yeni ekran: yardımcılar', () => {
  it('bordro girdisi sayıya çevrilir, gün tam sayıya yuvarlanır', () => {
    expect(bordroGirdisi({ id: 'p', kind: 'pay', brut: '100' as unknown as number, ek: Number.NaN })).toEqual({ brut: 100, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 });
  });
  it('yeni kimlik sözleşmenin biçimindedir', () => {
    const k = yeniKimlik('emp');
    expect(k).toMatch(/^emp_[a-z0-9]{12}$/);
    expect(k).not.toBe(yeniKimlik('emp'));
  });
});
