import { describe, expect, it } from 'vitest';
import type { Izin, Personel } from '../tipler.ts';
import {
  aktifMi, ayEkle, BOS_SUZGEC, cikisAdimi, cikisIlerlemesi, cikistanSonrakiIzinler, denemeBitisi, hareketleriIzle, ibanBicimi, ibanGecerli,
  kidemMetni, notEkle, notSil, orgAgaci, personelDogrula, personelDurumu, personelKayitOncesi, personelSirala, personelSuz,
  siraliPersonel, sonrakiSicil, sureMetni, tcknGecerli, ucretDegisimi, ucretGecmisi, ucretSil, ucretTarihte, ucretUygula, yillikFazlaMesai,
  zamanCizelgesi, type KayitBaglami,
} from './kurallar.ts';

const GUN = '2026-10-23';
const p = (id: string, ek: Partial<Personel> = {}): Personel => ({ id, kind: 'emp', ad: id.toUpperCase(), soyad: 'Deneme', iseGiris: '2020-01-01', ...ek });

describe('süre ve durum', () => {
  it('ay eklerken ayın son gününü aşmaz', () => {
    expect(ayEkle('2026-01-31', 1)).toBe('2026-02-28');
    expect(denemeBitisi('2026-03-01', 2)).toBe('2026-04-30');
  });
  it('kıdem yıl ve ay yazar, bir aydan kısa süre gün yazar', () => {
    expect(sureMetni('2020-01-01', '2026-10-23')).toBe('6 yıl 9 ay');
    expect(sureMetni('2026-10-01', '2026-10-23')).toBe('22 gün');
    expect(kidemMetni(p('a', { iseGiris: undefined }), GUN)).toBeNull();
    expect(kidemMetni(p('a', { cikisTarihi: '2021-01-01' }), GUN)).toBe('1 yıl');
  });
  it('aktiflik: başlamamış, çıkmış ve çıkış tarihsiz ayrılmış kişi aktif değil', () => {
    expect(aktifMi(p('a'), GUN)).toBe(true);
    expect(aktifMi(p('a', { iseGiris: '2026-11-01' }), GUN)).toBe(false);
    expect(aktifMi(p('a', { cikisTarihi: '2026-10-22' }), GUN)).toBe(false);
    expect(aktifMi(p('a', { cikisTarihi: GUN }), GUN)).toBe(true);
    expect(aktifMi(p('a', { durum: 'Ayrıldı' }), GUN)).toBe(false);
  });
  it('durum çipi: izinde, deneme, başlayacak, ücretsiz izin', () => {
    const izin: Izin = { id: 'l', kind: 'leave', empId: 'a', durum: 'Onaylandı', baslangic: '2026-10-20', bitis: '2026-10-25' };
    expect(personelDurumu(p('a'), [izin], GUN)).toBe('İzinde');
    expect(personelDurumu(p('a'), [{ ...izin, durum: 'Beklemede' }], GUN)).toBe('Aktif');
    expect(personelDurumu(p('a', { denemeBitis: '2026-11-01' }), [], GUN)).toBe('Deneme süresinde');
    expect(personelDurumu(p('a', { iseGiris: '2026-12-01' }), [], GUN)).toBe('Başlayacak');
    expect(personelDurumu(p('a', { durum: 'Ücretsiz izinde' }), [izin], GUN)).toBe('Ücretsiz izinde');
    expect(personelDurumu(p('a', { cikisTarihi: '2025-01-01' }), [], GUN)).toBe('Ayrıldı');
  });
});

describe('liste', () => {
  const liste = [p('c', { departmanId: 'd1', sicilNo: '1002' }), p('a', { departmanId: 'd2', sicilNo: '1010', pozisyon: 'Tornacı' }), p('b', { cikisTarihi: '2024-01-01', sicilNo: '1001' })];
  it('önce aktifler, sonra ada göre sıralar', () => {
    expect(siraliPersonel(liste, GUN).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('durum, departman, arama ve motor varsa yaka süzgeci', () => {
    expect(personelSuz(liste, BOS_SUZGEC, { gun: GUN }).map((x) => x.id)).toEqual(['c', 'a']);
    expect(personelSuz(liste, { ...BOS_SUZGEC, durum: 'pasif' }, { gun: GUN }).map((x) => x.id)).toEqual(['b']);
    expect(personelSuz(liste, { ...BOS_SUZGEC, durum: 'tum', departman: 'd2' }, { gun: GUN }).map((x) => x.id)).toEqual(['a']);
    expect(personelSuz(liste, { ...BOS_SUZGEC, arama: 'TORNA' }, { gun: GUN }).map((x) => x.id)).toEqual(['a']);
    expect(personelSuz(liste, { ...BOS_SUZGEC, yaka: 'Mavi yaka' }, { gun: GUN, yaka: (x) => (x.pozisyon ? 'Mavi yaka' : 'Beyaz yaka') }).map((x) => x.id)).toEqual(['a']);
    // Motor yokken yaka süzgeci uygulanmaz (veri gizlenmez).
    expect(personelSuz(liste, { ...BOS_SUZGEC, yaka: 'Mavi yaka' }, { gun: GUN })).toHaveLength(2);
  });
  it('sicil sayıyla, ad Türkçe sırayla sıralanır', () => {
    const b = { departmanAdi: (id: string | undefined) => id ?? '' };
    expect(personelSirala(liste, 'sicil', 'artan', b).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(personelSirala(liste, 'ad', 'azalan', b).map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('organizasyon', () => {
  it('yöneticisi aktif olmayan kişi köke düşer; döngü kaybolmaz', () => {
    const a = p('a');
    const b = p('b', { yoneticiId: 'a' });
    const c = p('c', { yoneticiId: 'yok' });
    const d = p('d', { yoneticiId: 'e' });
    const e = p('e', { yoneticiId: 'd' });
    const { kokler, altlar } = orgAgaci([a, b, c, d, e]);
    expect(kokler.map((x) => x.id)).toEqual(['a', 'c', 'd']);
    expect(altlar.get('a')?.map((x) => x.id)).toEqual(['b']);
    expect(altlar.get('d')?.map((x) => x.id)).toEqual(['e']);
  });
});

describe('ücret', () => {
  const k = p('a', { brutMaas: 30000 });
  it('ilk değişiklikte işe giriş satırı eklenir; geçerli ücret bugüne göre', () => {
    const n = ucretUygula(k, '2026-11-01', 33000, 'Yıllık zam', '', GUN);
    expect(ucretGecmisi(n).map((x) => x.tarih)).toEqual(['2020-01-01', '2026-11-01']);
    expect(n.brutMaas).toBe(30000);
    expect(ucretTarihte(n, '2026-11-15')).toBe(33000);
    expect(ucretDegisimi(ucretGecmisi(n), 1)).toBe(10);
    expect(ucretSil(n, '2026-11-01', GUN).ucretGecmisi).toHaveLength(1);
  });
  it('aynı tarihli satır yenisiyle değişir', () => {
    const n = ucretUygula(ucretUygula(k, '2026-10-01', 31000, 'Terfi', '', GUN), '2026-10-01', 32000, 'Düzeltme', 'not', GUN);
    expect(ucretGecmisi(n).filter((x) => x.tarih === '2026-10-01')).toEqual([{ tarih: '2026-10-01', brut: 32000, neden: 'Düzeltme', not: 'not' }]);
    expect(n.brutMaas).toBe(32000);
  });
});

describe('kayıt öncesi düzen', () => {
  const b: KayitBaglami = {
    gun: GUN, personeller: [p('x', { sicilNo: '1005' })], denemeAy: 2, bolum: null,
    departmanAdi: (id) => `D-${id}`, personelAdi: (id) => `P-${id}`, yakaTahmini: () => 'Mavi yaka', kademeTahmini: () => 'Uzman',
  };
  it('yeni kişide sicil, deneme bitişi, ücret geçmişi, yaka ve BES varsayılanı', () => {
    const d = personelKayitOncesi(null, { id: 'n', kind: 'emp', ad: 'N', soyad: 'S', iseGiris: '2026-10-01', brutMaas: 40000, pozisyon: 'Operatör', dogumTarihi: '1990-01-01' }, b);
    expect(d.sicilNo).toBe('1006');
    expect(d.denemeBitis).toBe('2026-11-30');
    expect(d.ucretGecmisi).toEqual([{ tarih: '2026-10-01', brut: 40000, neden: 'İşe giriş' }]);
    expect([d.yakaTipi, d.kademe, d.besKatilim]).toEqual(['Mavi yaka', 'Uzman', true]);
  });
  it('çıkış tarihi geçmişse durum Ayrıldı; Ayrılış bölümünde tarih silinince Aktif', () => {
    const o = p('a', { denemeBitis: '2020-02-29' });
    expect(personelKayitOncesi(o, { ...o, cikisTarihi: '2026-10-01' }, { ...b, bolum: 'Ayrılış' }).durum).toBe('Ayrıldı');
    expect(personelKayitOncesi(o, { ...o, durum: 'Ayrıldı' }, { ...b, bolum: 'Ayrılış' }).durum).toBe('Aktif');
  });
  it('görev değişikliği zaman çizelgesine adla yazılır', () => {
    const o = p('a', { departmanId: '1', pozisyon: 'Usta' });
    const h = hareketleriIzle(o, { ...o, departmanId: '2' }, b);
    expect(h).toEqual([{ tarih: GUN, alan: 'Departman', eski: 'D-1', yeni: 'D-2' }]);
    expect(hareketleriIzle(o, { ...o }, b)).toBeUndefined();
  });
  it('ücret alanı elle değişince geçerli satır düzeltilir', () => {
    const o = ucretUygula(p('a', { brutMaas: 30000 }), '2027-01-01', 35000, 'Yıllık zam', '', GUN);
    const d = personelKayitOncesi(o, { ...o, brutMaas: 31000 }, b);
    expect(ucretGecmisi(d)).toEqual([{ tarih: '2020-01-01', brut: 31000, neden: 'İşe giriş', not: 'Düzeltme' }, { tarih: '2027-01-01', brut: 35000, neden: 'Yıllık zam' }]);
  });
  it('sonraki sicil en az 1001', () => {
    expect(sonrakiSicil([])).toBe('1001');
  });
});

describe('doğrulama', () => {
  it('T.C. kimlik ve IBAN denetim haneleri', () => {
    expect(tcknGecerli('10000000146')).toBe(true);
    expect(tcknGecerli('10000000147')).toBe(false);
    expect(tcknGecerli('01234567890')).toBe(false);
    expect(ibanGecerli('TR20 0000 0000 0000 0000 0000 01')).toBe(true);
    expect(ibanGecerli('TR21000000000000000000000001')).toBe(false);
    expect(ibanBicimi('tr2000000000000000000000 01')).toBe('TR20 0000 0000 0000 0000 0000 01');
  });
  it('zorunlu, biçim, tekrar eden sicil ve kimlik, çıkış < giriş', () => {
    const kural = [{ k: 'ad', zorunlu: true }, { k: 'tckn', tur: 'tckn' }, { k: 'eposta', tur: 'email' }] as const;
    const diger = p('b', { sicilNo: '1001', tckn: '10000000146' });
    expect(personelDogrula({ id: 'a', kind: 'emp', ad: '', tckn: '123', eposta: 'x@' }, kural, [diger])).toEqual({
      ad: 'Bu alan zorunlu.', tckn: 'Geçerli bir T.C. kimlik numarası girin (11 hane).', eposta: 'Geçerli bir e-posta adresi girin.',
    });
    expect(personelDogrula({ id: 'a', kind: 'emp', ad: 'A', sicilNo: '1001', tckn: '10000000146', iseGiris: '2026-01-01', cikisTarihi: '2025-01-01' }, kural, [diger])).toEqual({
      sicilNo: 'Bu sicil numarası başka bir personelde kayıtlı.', tckn: 'Bu kimlik numarası başka bir personelde kayıtlı.', cikisTarihi: 'Çıkış tarihi işe girişten önce olamaz.',
    });
    expect(personelDogrula({ ...diger, ad: 'B' }, kural, [diger])).toEqual({});
  });
});

describe('çıkış listesi ve notlar', () => {
  it('adım işaretlenince bugünün tarihi yazılır, kaldırılınca silinir', () => {
    const a = cikisAdimi(p('a'), 'sgk', true, GUN);
    expect(a.cikisListesi).toEqual({ sgk: GUN });
    expect(cikisIlerlemesi(a)).toBe(1);
    expect(cikisAdimi(a, 'sgk', false, GUN).cikisListesi).toEqual({});
  });
  it('çıkıştan sonraki izinler sayılır', () => {
    const izinler: Izin[] = [{ id: '1', kind: 'leave', empId: 'a', durum: 'Onaylandı', baslangic: '2026-11-02' }, { id: '2', kind: 'leave', empId: 'a', durum: 'Reddedildi', baslangic: '2026-11-02' }];
    expect(cikistanSonrakiIzinler(p('a', { cikisTarihi: '2026-11-01' }), izinler)).toBe(1);
  });
  it('not ekle ve sil', () => {
    const n = notEkle(p('a'), 'merhaba', 't1');
    expect(notSil(n, 't1').notlar).toEqual([]);
  });
});

describe('özet ve zaman çizelgesi', () => {
  it('yıllık fazla mesai yalnız mesai türlerini toplar', () => {
    expect(yillikFazlaMesai('a', [
      { id: '1', kind: 'att', empId: 'a', tarih: '2026-03-01', tur: 'Fazla mesai', saat: 3 },
      { id: '2', kind: 'att', empId: 'a', tarih: '2026-03-02', tur: 'Devamsızlık', saat: 7.5 },
      { id: '3', kind: 'att', empId: 'a', tarih: '2025-03-02', tur: 'Fazla mesai', saat: 2 },
      { id: '4', kind: 'att', empId: 'a', tarih: '2026-04-02', tur: 'Hafta tatili çalışması', saat: '1,5' as unknown as number },
    ], '2026')).toBe(4.5);
  });
  it('olaylar yeniden eskiye; işe giriş ücreti tekrar edilmez', () => {
    const k = ucretUygula(p('a', { brutMaas: 30000, cikisTarihi: '2026-12-31', cikisKodu: '04 Belirsiz süreli' }), '2026-01-01', 33000, 'Yıllık zam', '', GUN);
    const ev = zamanCizelgesi(k, {
      gun: GUN, izinler: [], performanslar: [{ id: 'p', kind: 'perf', empId: 'a', tarih: '2026-06-01', donem: '2026', skorlar: { a: 4, b: 5 } }], egitimler: [], gecmis: [],
      departmanAdi: () => '', alanAdi: (f) => f, para: (v) => String(v), kisaTarih: (v) => v,
    });
    expect(ev.map((x) => [x.tarih, x.tur])).toEqual([['2026-12-31', 'cikis'], ['2026-06-01', 'perf'], ['2026-01-01', 'ucret'], ['2020-01-01', 'giris']]);
    expect(ev[0]?.alt).toBe('Belirsiz süreli');
    expect(ev[2]?.alt).toBe('Yıllık zam (+10%)');
  });
});
