import { describe, expect, it, vi } from 'vitest';
import type { IkGecmis, IkKayit, IkTopluCevabi, IkVeriCevabi, IkYazCevabi } from '#paylasilan/sozlesme/ik.ts';
import { ApiHatasi } from '../../ortak/veri/api.ts';
import { bordroGirdisi, kopruKur, type Istemci, type Yama } from './kopru.ts';

const kayit = (kimlik: string, tur: IkKayit['tur'], ek: Record<string, unknown> = {}, surum = 1): IkKayit =>
  ({ kimlik, tur, surum, govde: { id: kimlik, kind: tur, ...ek } });
const gecmis = (rid: string): IkGecmis => ({
  id: `gecmis_${rid}`, kind: 'log', t: '2026-10-07T10:00:00+03:00', by: { id: 1, name: 'Deneme', role: '' }, op: 'guncelle', rk: 'emp', rid, label: rid, changes: [], snap: null,
});
const VERI = {
  ben: { kisi: { id: 1, ad: 'Deneme' }, rol: 'calisan', personelKimlik: 'emp_a', saltOkunur: false, secenekler: { kisiler: [], isMerkezleri: [] } },
  kayitlar: [kayit('emp_a', 'emp', { ad: 'A', soyad: 'B' }, 3), kayit('leave_1', 'leave', { empId: 'emp_b', durum: 'Beklemede' }, 2), kayit('job_1', 'job', { durum: 'Onay bekliyor' }, 4)],
  ayarlar: { govde: { sirket: 'X' }, surum: 5 },
  gecmis: [gecmis('emp_a')],
} satisfies IkVeriCevabi;

function kur(islemler: string[], yaz?: (yol: string, govde: unknown) => unknown) {
  const yamalar: Yama[] = [];
  const post = vi.fn(async (yol: string, govde?: unknown) => (yaz ? yaz(yol, govde) : { kayit: kayit('x', 'emp'), gecmis: [] } satisfies IkYazCevabi));
  const get = vi.fn(async () => VERI);
  const istemci = { get, post } as unknown as Istemci;
  const kopru = kopruKur(istemci, islemler, (y) => yamalar.push(y));
  return { kopru, post, get, yamalar };
}

describe('İK köprüsü', () => {
  it('yükleme kayıtları ve sunucunun geçmişini verir; yazma okunan sürümü taşır', async () => {
    const { kopru, post } = kur(['ik.personel-yaz']);
    const v = await kopru.isle('yukle', undefined) as { records: { id: string; kind: string }[]; settings: unknown };
    expect(v.records.map((r) => r.id)).toEqual(['emp_a', 'leave_1', 'job_1', 'gecmis_emp_a']);
    expect(v.settings).toEqual({ sirket: 'X' });
    await kopru.isle('kaydet', { id: 'emp_a', kind: 'emp', ad: 'A', soyad: 'C' });
    expect(post).toHaveBeenCalledWith('/ik/personel/emp_a/kaydet', { govde: { id: 'emp_a', kind: 'emp', ad: 'A', soyad: 'C' }, surum: 3 });
  });

  it('IK-74 (karar 168 c): kayıt cevabındaki uyarı kullanıcıya iletilir, yazma yine tamam döner', async () => {
    const uyarilar: string[] = [];
    const post = vi.fn(async (_yol: string, g: { govde: Record<string, unknown> }): Promise<IkYazCevabi> => ({
      kayit: kayit('emp_a', 'emp', {}, 4), gecmis: [],
      ...(g.govde['cikisTarihi'] ? { uyari: 'Çıkış kaydedildi; kişinin üzerinde iade edilmemiş 1 zimmet var: DB-00007 Deneme dizüstü.' } : {}),
    }));
    const istemci = { get: vi.fn(async () => VERI), post } as unknown as Istemci;
    const kopru = kopruKur(istemci, ['ik.personel-yaz'], () => undefined, (m) => uyarilar.push(m));
    await kopru.isle('yukle', undefined);
    expect(await kopru.isle('kaydet', { id: 'emp_a', kind: 'emp', cikisTarihi: '2026-10-31' })).toEqual({ tamam: true });
    expect(uyarilar).toEqual(['Çıkış kaydedildi; kişinin üzerinde iade edilmemiş 1 zimmet var: DB-00007 Deneme dizüstü.']);
    await kopru.isle('kaydet', { id: 'emp_a', kind: 'emp', telefon: '1' });
    expect(uyarilar).toHaveLength(1);
  });

  it('uygulamanın kendi günlük kaydı gönderilmez (geçmişi sunucu yazar)', async () => {
    const { kopru, post } = kur(['ik.personel-yaz']);
    await kopru.isle('yukle', undefined);
    await kopru.isle('kaydet', { id: 'log_1', kind: 'log' });
    await kopru.isle('toplu-kaydet', [{ id: 'log_2', kind: 'log' }]);
    expect(post).not.toHaveBeenCalled();
  });

  it('izin yazamayan kişinin talebi talep ucuna, onaycının kararı karar ucuna gider', async () => {
    const { kopru, post } = kur(['ik.izin-talep', 'ik.izin-onay']);
    await kopru.isle('yukle', undefined);
    await kopru.isle('kaydet', { id: 'leave_1', kind: 'leave', empId: 'emp_b', durum: 'Onaylandı' });
    expect(post).toHaveBeenLastCalledWith('/ik/izinler/leave_1/karar', { durum: 'Onaylandı', surum: 2 });
    await kopru.isle('kaydet', { id: 'leave_2', kind: 'leave', empId: 'emp_a', durum: 'Beklemede' });
    expect(post).toHaveBeenLastCalledWith('/ik/izinler/leave_2/talep', { govde: { id: 'leave_2', kind: 'leave', empId: 'emp_a', durum: 'Beklemede' }, surum: null });
  });

  it('IK-78: devam yazamayan onaycının onayı onay ucuna gider, tek tek ve okunan sürümle; devam yazan kaydet ucunu kullanır', async () => {
    const veri = { ...VERI, kayitlar: [...VERI.kayitlar, kayit('att_1', 'att', { empId: 'emp_b', saat: 2, onay: 'Beklemede' }, 6)] } satisfies IkVeriCevabi;
    const post = vi.fn(async (): Promise<IkYazCevabi> => ({ kayit: kayit('att_1', 'att', { onay: 'Onaylandı' }, 7), gecmis: [] }));
    const kopru = kopruKur({ get: vi.fn(async () => veri), post } as unknown as Istemci, ['ik.devam-onay'], () => undefined);
    await kopru.isle('yukle', undefined);
    await kopru.isle('toplu-kaydet', [{ id: 'att_1', kind: 'att', empId: 'emp_b', saat: 9, onay: 'Onaylandı' }]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenLastCalledWith('/ik/devam/att_1/onay', { durum: 'Onaylandı', surum: 6 });
    const yazan = kur(['ik.devam-yaz', 'ik.devam-onay']);
    await yazan.kopru.isle('yukle', undefined);
    await yazan.kopru.isle('kaydet', { id: 'att_2', kind: 'att', empId: 'emp_b', onay: 'Onaylandı' });
    expect(yazan.post).toHaveBeenLastCalledWith('/ik/devam/att_2/kaydet', { govde: { id: 'att_2', kind: 'att', empId: 'emp_b', onay: 'Onaylandı' }, surum: null });
  });

  it('pozisyonu açan onaycı onay ucuna, iletişimini güncelleyen çalışan iletişim ucuna gider', async () => {
    const { kopru, post } = kur(['ik.pozisyon-onay']);
    await kopru.isle('yukle', undefined);
    await kopru.isle('kaydet', { id: 'job_1', kind: 'job', durum: 'Açık' });
    expect(post).toHaveBeenLastCalledWith('/ik/pozisyonlar/job_1/onayla', { surum: 4 });
    await kopru.isle('kaydet', { id: 'emp_a', kind: 'emp', ad: 'A', soyad: 'B', telefon: '0555', brutMaas: 1 });
    expect(post).toHaveBeenLastCalledWith('/ik/personel/emp_a/iletisim', {
      alanlar: { telefon: '0555', eposta: '', adres: '', acilKisi: '', acilYakinlik: '', acilTelefon: '' }, surum: 3,
    });
  });

  it('bordro kaydı kurulmaz: aylara göre yalnız girdiler gider', async () => {
    const { kopru, post } = kur(['ik.bordro-kesinlestir'], () => ({ kayitlar: [], gecmis: [] } satisfies IkTopluCevabi));
    await kopru.isle('yukle', undefined);
    const pay = (emp: string, donem: string) => ({ id: `pay_${emp}_${donem}`, kind: 'pay', empId: emp, donem, brut: 50000, gun: 30, ek: 0, mesaiSaat: 2, tatilSaat: 0, kesinti: 0, net: 1, gv: 1, snap: {} });
    await kopru.isle('toplu-kaydet', [pay('emp_a', '2026-09'), pay('emp_b', '2026-09'), pay('emp_a', '2026-10')]);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenNthCalledWith(1, '/ik/bordro/2026-09/kesinlestir', { girdiler: {
      emp_a: { brut: 50000, gun: 30, ek: 0, mesaiSaat: 2, tatilSaat: 0, kesinti: 0 }, emp_b: { brut: 50000, gun: 30, ek: 0, mesaiSaat: 2, tatilSaat: 0, kesinti: 0 },
    } }, expect.objectContaining({ istekKimligi: expect.any(String) }));
    const kimlikler = post.mock.calls.map((c) => (c as unknown[])[2] as { istekKimligi: string }).map((o) => o.istekKimligi);
    expect(new Set(kimlikler).size).toBe(2);
    expect(bordroGirdisi({ id: 'p', kind: 'pay', brut: '10' })).toEqual({ brut: 10, ek: 0, mesaiSaat: 0, tatilSaat: 0, kesinti: 0 });
  });

  it('bordro onayı okunan sürümle onay ucuna gider; cevaptaki onay zamanı çerçeveye yazılır; bordro olmayan kayıt gitmez (İK v3)', async () => {
    const onayli = kayit('pay_emp_a_2026-09', 'pay', { empId: 'emp_a', donem: '2026-09', gordum: '2026-10-12T10:15:00+03:00' }, 2);
    const { kopru, post, get, yamalar } = kur(['ik.bordro-gordum'], () => ({ kayit: onayli, gecmis: [] } satisfies IkYazCevabi));
    get.mockResolvedValueOnce({ ...VERI, kayitlar: [...VERI.kayitlar, kayit('pay_emp_a_2026-09', 'pay', { empId: 'emp_a', donem: '2026-09' }, 2)] });
    await kopru.isle('yukle', undefined);
    await kopru.isle('bordro-gordum', 'pay_emp_a_2026-09');
    expect(post).toHaveBeenCalledWith('/ik/bordrolar/pay_emp_a_2026-09/gordum', { surum: 2 });
    expect(yamalar.at(-1)?.kayitlar).toEqual([onayli.govde]);
    await expect(kopru.isle('bordro-gordum', 'emp_a')).rejects.toThrow('Bordro bulunamadı');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('puantaj ay ay okunur ve günler yazma ucuna olduğu gibi gider; eksik istek uca gitmez (kart #1571)', async () => {
    const { kopru, post, get } = kur(['ik.devam-yaz'], () => ({ kayitlar: [], silinen: [] }));
    await kopru.isle('puantaj-oku', { ay: '2026-09' });
    expect(get).toHaveBeenLastCalledWith('/ik/puantaj?ay=2026-09');
    await kopru.isle('puantaj-oku', { ay: '2026-09', personel: 'emp_a' });
    expect(get).toHaveBeenLastCalledWith('/ik/puantaj?ay=2026-09&personel=emp_a');
    const gun = { personel: 'emp_a', tarih: '2026-09-01', durum: 'calisti', giris: '08:00', cikis: '17:00', aciklama: null, surum: null };
    await kopru.isle('puantaj-yaz', [gun]);
    expect(post).toHaveBeenLastCalledWith('/ik/puantaj/yaz', { gunler: [gun] });
    await expect(kopru.isle('puantaj-oku', {})).rejects.toThrow('Puantaj ayı eksik');
    await kopru.isle('izin-gunu', { personel: 'emp_a', baslangic: '2026-09-11', bitis: '2026-09-15' });
    expect(get).toHaveBeenLastCalledWith('/ik/izin-gunu?personel=emp_a&baslangic=2026-09-11&bitis=2026-09-15');
    await expect(kopru.isle('izin-gunu', { personel: 'emp_a' })).rejects.toThrow('İzin aralığı eksik');
    await kopru.isle('kisi-vardiyasi', { personel: 'emp_a' });
    expect(get).toHaveBeenLastCalledWith('/ik/kisi-vardiyasi?personel=emp_a');
    await expect(kopru.isle('kisi-vardiyasi', {})).rejects.toThrow('Personel eksik');
    await expect(kopru.isle('puantaj-yaz', [])).rejects.toThrow('Yazılacak gün yok');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('toplu yazma türe göre ve 100lük paketlerle gider', async () => {
    const { kopru, post } = kur(['ik.personel-yaz'], () => ({ kayitlar: [], gecmis: [] } satisfies IkTopluCevabi));
    await kopru.isle('yukle', undefined);
    const kisiler = Array.from({ length: 150 }, (_, i) => ({ id: `emp_n${i}`, kind: 'emp', ad: 'A', soyad: 'B' }));
    await kopru.isle('toplu-kaydet', [...kisiler, { id: 'dept_1', kind: 'dept', ad: 'X' }]);
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/ik/personel/toplu-kaydet', '/ik/personel/toplu-kaydet', '/ik/departmanlar/toplu-kaydet']);
  });

  it('silme sürümle iptal ucuna gider ve çerçeveden kaldırılır', async () => {
    const { kopru, post, yamalar } = kur(['ik.personel-yaz'], () => ({ kayit: kayit('emp_a', 'emp', {}, 4), gecmis: [gecmis('emp_a')] } satisfies IkYazCevabi));
    await kopru.isle('yukle', undefined);
    await kopru.isle('sil', 'emp_a');
    expect(post).toHaveBeenCalledWith('/ik/personel/emp_a/iptal', { surum: 3 });
    expect(yamalar.at(-1)?.silinen).toEqual(['emp_a']);
  });

  it('eski sürüm hatasında çerçeve güncel hale yenilenir ve hata iletilir', async () => {
    const { kopru, get, yamalar } = kur(['ik.personel-yaz'], () => {
      throw new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka biri tarafından değiştirildi.', ayrinti: { neden: 'eski-surum' } });
    });
    await kopru.isle('yukle', undefined);
    await expect(kopru.isle('kaydet', { id: 'emp_a', kind: 'emp' })).rejects.toThrow('başka biri');
    expect(get).toHaveBeenCalledTimes(2);
    expect(yamalar.at(-1)?.tam).toBe(true);
  });

  it('ayarlar okunan sürümle yazılır', async () => {
    const { kopru, post } = kur(['ik.ayar-yaz'], () => ({ ayarlar: { govde: { a: 1 }, surum: 6 }, gecmis: [] }));
    await kopru.isle('yukle', undefined);
    await kopru.isle('ayar-kaydet', { a: 1 });
    await kopru.isle('ayar-kaydet', { a: 2 });
    expect(post.mock.calls.map((c) => (c[1] as { surum: number }).surum)).toEqual([5, 6]);
  });
});
