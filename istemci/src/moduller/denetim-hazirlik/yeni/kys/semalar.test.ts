import { describe, expect, it } from 'vitest';
import { akisSemasi, etkilesimSemasi, FLOWS, kaplumbagaSemasi, organizasyonSemasi, wrapT, type SemaSureci } from './semalar.ts';

// Şema geometrisi; veri sentetiktir.

const rol = (k: string) => ({ n: k, p: '' });
const sp = (id: string, type: string, owner: string): SemaSureci => ({ id, name: `Süreç ${id}`, type, owner, inputs: 'a, b', outputs: 'c', res: '', who: '', kpi: '', risk: '' });

describe('şemalar', () => {
  it('satır kırma sınırı aşmaz, boş metinde tek boş satır verir', () => {
    expect(wrapT('bir iki üç dört beş', 8)).toEqual(['bir iki', 'üç dört', 'beş']);
    expect(wrapT('', 10)).toEqual(['']);
  });

  it('her akış şeması çizilir; bilinmeyen akış yoktur', () => {
    for (const k of Object.keys(FLOWS)) {
      const s = akisSemasi(k, rol);
      expect(s?.ogeler.length).toBeGreaterThan(5);
      expect(s?.baslik).toBe(FLOWS[k]?.t);
    }
    expect(akisSemasi('yok', rol)).toBeNull();
  });

  it('etkileşim şeması süreçleri adıyla yazar; durum rengi verilir', () => {
    const s = etkilesimSemasi([sp('1', 'y', 'Üst yönetim'), sp('2', 'a', 'Üretim'), sp('3', 'd', 'Kalite')], 'Deneme', (p) => (p.id === '2' ? 'kotu' : null));
    const metin = JSON.stringify(s.ogeler);
    expect(metin).toContain('Süreç 1');
    expect(metin).toContain('Süreç 3');
    expect(metin).toContain('"kotu"');
  });

  it('kaplumbağada boş kutuya yer tutucu, sahibi yoksa uyarı yazılır', () => {
    const s = kaplumbagaSemasi({ surec: sp('1', 'a', ''), turAdi: 'Ana', nasil: [], olcutler: [] });
    const metin = JSON.stringify(s.ogeler);
    expect(metin).toContain('Prosedür ve talimat kodları…');
    expect(metin).toContain('Sahibi tanımlı değil');
    expect(s.w).toBe(960);
  });

  it('organizasyon şeması süreç yoksa tipik birimleri, varsa süreç sahiplerini gösterir', () => {
    expect(JSON.stringify(organizasyonSemasi([], rol).ogeler)).toContain('Satınalma');
    const s = JSON.stringify(organizasyonSemasi([sp('1', 'a', 'Üretim'), sp('2', 'a', 'Genel Müdür')], rol).ogeler);
    expect(s).toContain('Üretim');
    expect(s).not.toContain('Satınalma');
  });
});
