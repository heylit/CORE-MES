import { describe, expect, it } from 'vitest';
import { MACHINES } from './cncdata.ts';
import { GOVDE_ADI, GOVDE_ALANI, govdesi, KATALOG, katalogAyrintisi, katalogBilgisi, katalogEtiketi, katalogModeli } from './tezgah-katalogu.ts';

// Sözleşmedeki model türü kalıbı (paylasilan/sozlesme/cnc-kurulum.ts MODEL_TURU); istemci paylasilan'dan değer ithal etmez.
const MODEL_TURU = /^m_[a-z0-9]{1,20}$/;

describe('tezgâh kataloğu (1893 a)', () => {
  // 1893 a 40-60 model dedi; kullanıcı sonradan marka ekletti (02.11 18:20), üst sınır 70.
  it('genişlik: en az 10 marka, 40-70 model, CMM ve kayar otomat var', () => {
    expect(new Set(KATALOG.map((m) => m.marka)).size).toBeGreaterThanOrEqual(10);
    expect(KATALOG.length).toBeGreaterThanOrEqual(40);
    expect(KATALOG.length).toBeLessThanOrEqual(70);
    expect(KATALOG.some((m) => m.govde === 'm_cmm' && m.tur === 'cmm')).toBe(true);
    expect(KATALOG.some((m) => m.govde === 'm_swiss' && m.tur === 'lathe')).toBe(true);
  });

  it('anahtar sözleşmedeki model türü kalıbına uyar, tektir ve gövde tipiyle çakışmaz', () => {
    const anahtarlar = KATALOG.map((m) => m.anahtar);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
    for (const a of anahtarlar) {
      expect(MODEL_TURU.test(a), a).toBe(true);
      expect(a in GOVDE_ADI, a).toBe(false);
    }
    for (const t of MACHINES) expect(anahtarlar.includes(t.kind), t.id).toBe(false);
  });

  it('çalışma alanı pozitif; Y kursu frezede ve CMM\'de pozitif, tornada 0 olabilir', () => {
    for (const m of KATALOG) {
      expect(m.alan.x > 0 && m.alan.z > 0, m.anahtar).toBe(true);
      if (m.tur === 'mill' || m.tur === 'cmm') expect(m.alan.y, m.anahtar).toBeGreaterThan(0);
      else expect(m.alan.y, m.anahtar).toBeGreaterThanOrEqual(0);
      expect(m.tur === 'cmm' ? m.devir === null : (m.devir ?? 0) > 0, m.anahtar).toBe(true);
    }
  });

  it('gövde çözümü: gövde tipi kendisi, katalog anahtarı modelin gövdesi, bilinmeyen null', () => {
    expect(govdesi('m_hmc')).toBe('m_hmc');
    const ilk = KATALOG[0]!;
    expect(govdesi(ilk.anahtar)).toBe(ilk.govde);
    expect(katalogModeli(ilk.anahtar)).toBe(ilk);
    expect(govdesi('m_yok')).toBeNull();
    expect(katalogModeli('m_vmc')).toBeNull();
    for (const g of Object.keys(GOVDE_ADI)) expect(GOVDE_ALANI[g as keyof typeof GOVDE_ALANI]).toBeDefined();
  });

  it('etiket marka, model ve gövde adını taşır', () => {
    const m = KATALOG[0]!;
    expect(katalogEtiketi(m)).toBe(`${m.marka} ${m.model} · ${GOVDE_ADI[m.govde]}`);
  });

  it('1900: ayrıntı yalnız katalogdaki CNC modellerinde; cep 1-120, canlı takım devri yalnız canlı takımlıda; bilinmeyen boş', () => {
    const anahtarlar = new Set(KATALOG.filter((m) => m.tur !== 'cmm').map((m) => m.anahtar));
    for (const m of KATALOG) {
      const a = katalogAyrintisi(m.anahtar);
      if (m.tur === 'cmm' || m.govde === 'm_swiss') expect(a.cep, m.anahtar).toBeNull();
      if (a.cep !== null) expect(a.cep >= 1 && a.cep <= 120, m.anahtar).toBe(true);
      if (a.canliDevir !== null) expect(a.canli, m.anahtar).toBe(true);
      if (a.frezeDevri !== null) expect(m.tur, m.anahtar).toBe('millturn');
      expect(anahtarlar.has(m.anahtar) || a.cep === null, m.anahtar).toBe(true);
    }
    expect(katalogAyrintisi('m_yok')).toEqual({ cep: null, frezeDevri: null, canli: null, canliDevir: null });
  });

  it('1900: Tezgâh bilgisi türe göre: freze kurs, torna çap ve boy (Y varsa), kayar otomat çubuk', () => {
    const bul = (f: (m: (typeof KATALOG)[number]) => boolean) => KATALOG.find(f)!;
    const fr = bul((m) => m.tur === 'mill'), to = bul((m) => m.tur === 'lathe' && m.govde === 'm_lathe' && m.alan.y === 0);
    const ty = bul((m) => m.govde === 'm_lathe' && m.alan.y > 0), sw = bul((m) => m.govde === 'm_swiss');
    expect(katalogBilgisi(fr)).toEqual({ marka: fr.marka, model: fr.model, xT: fr.alan.x, yT: fr.alan.y, zT: fr.alan.z });
    expect(katalogBilgisi(to)).toEqual({ marka: to.marka, model: to.model, maxD: to.alan.x, maxL: to.alan.z });
    expect(katalogBilgisi(ty)).toMatchObject({ yT: ty.alan.y });
    expect(katalogBilgisi(sw)).toEqual({ marka: sw.marka, model: sw.model, bar: sw.alan.x });
  });
});
