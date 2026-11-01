import { describe, expect, it } from 'vitest';
import type { Aday, Departman, Personel, Pozisyon } from '../tipler.ts';
import { ikAra, type AramaGirdisi } from './kurallar.ts';

// Kişi adları uydurmadır.
const p = (id: string, g: Partial<Personel>): Personel => ({ id, kind: 'emp', ...g });
const GIRDI: AramaGirdisi = {
  rol: 'ik',
  sayfalar: [{ gorunum: 'pano', baslik: 'Pano' }, { gorunum: 'izin', baslik: 'İzinler' }, { gorunum: 'bordro', baslik: 'Bordro' }],
  personeller: [
    p('emp_a', { ad: 'Ayşe', soyad: 'Örnek', pozisyon: 'Operatör', departmanId: 'dept_u', sicilNo: '17' }),
    p('emp_b', { ad: 'Mehmet', soyad: 'Deneme', yoneticiId: 'emp_a' }),
    p('emp_c', { ad: 'Can', soyad: 'Sınama', cikisTarihi: '2026-01-31' }),
  ],
  adaylar: [{ id: 'cand_1', kind: 'cand', ad: 'Deniz', soyad: 'Aday', jobId: 'job_1' } as Aday],
  departmanlar: [{ id: 'dept_u', kind: 'dept', ad: 'Üretim' } as Departman],
  pozisyonlar: [{ id: 'job_1', kind: 'job', baslik: 'CNC operatörü', durum: 'Açık' } as Pozisyon],
  ekip: new Set(),
  yazabilir: { personel: true, izin: true, izinTalep: false },
  gun: '2026-11-01',
  kilavuz: (q) => (q.includes('kıdem') ? [{ konu: 'kidem-ihbar', baslik: 'Kıdem ve ihbar', ozet: 'Hesap' }] : []),
};

describe('İK\'da ara', () => {
  it('boş sorguda ilk aktif kişiler, ilk dört işlem ve ilk üç sayfa', () => {
    const s = ikAra(GIRDI, '');
    expect(s.filter((x) => x.tur === 'Personel').map((x) => x.baslik)).toEqual(['Ayşe Örnek', 'Mehmet Deneme']);
    expect(s.filter((x) => x.tur !== 'Personel').map((x) => x.baslik)).toEqual(['Personel ekle', 'İzin talebi gir', 'Görüşme planla', 'Aday ekle', 'Pano', 'İzinler', 'Bordro']);
  });

  it('kişi sicil ve departmanla bulunur; ayrılan ayrı türdedir; Türkçe büyük harf eşleşir', () => {
    expect(ikAra(GIRDI, 'ÜRETİM').map((x) => [x.tur, x.baslik])).toEqual([['Personel', 'Ayşe Örnek'], ['Departman', 'Üretim']]);
    expect(ikAra(GIRDI, '17')[0]).toMatchObject({ tur: 'Personel', hedef: { tur: 'gorunum', gorunum: 'calisan', kimlik: 'emp_a' } });
    expect(ikAra(GIRDI, 'sınama')[0]?.tur).toBe('Ayrılan');
  });

  it('aday ilanıyla, pozisyon başlığıyla, hesaplama sekmesiyle ve kılavuz konusuyla gelir', () => {
    const s = ikAra(GIRDI, 'cnc');
    expect(s.map((x) => x.tur)).toEqual(['Aday', 'Pozisyon']);
    expect(ikAra(GIRDI, 'kıdem')).toEqual(expect.arrayContaining([
      expect.objectContaining({ baslik: 'Kıdem ve ihbar tazminatı hesapla', hedef: { tur: 'gorunum', gorunum: 'hesap', kimlik: 'tazminat' } }),
      expect.objectContaining({ tur: 'Kılavuz', hedef: { tur: 'kilavuz', konu: 'kidem-ihbar' } }),
    ]));
  });

  it('reddedilen: yazamayan kişiye form açan işlem çıkmaz', () => {
    const s = ikAra({ ...GIRDI, yazabilir: { personel: false, izin: false, izinTalep: false } }, 'ekle');
    expect(s.map((x) => x.baslik)).toEqual(['Aday ekle']);
  });

  it('çalışan yalnız sayfalarını ve izin talebini görür; kayıt aranmaz', () => {
    const g: AramaGirdisi = { ...GIRDI, rol: 'calisan', sayfalar: [{ gorunum: 'izinlerim', baslik: 'İzinlerim' }], yazabilir: { personel: false, izin: false, izinTalep: true } };
    expect(ikAra(g, 'izin').map((x) => x.baslik)).toEqual(['İzin talep et', 'İzinlerim']);
    expect(ikAra(g, 'mehmet')).toEqual([]);
  });

  it('yönetici ekibini bulur, ekip dışını bulmaz', () => {
    const g: AramaGirdisi = { ...GIRDI, rol: 'yonetici', sayfalar: [], ekip: new Set(['emp_b']) };
    expect(ikAra(g, 'e').filter((x) => x.tur === 'Ekip').map((x) => x.hedef)).toEqual([{ tur: 'gorunum', gorunum: 'uye', kimlik: 'emp_b' }]);
  });
});
