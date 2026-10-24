import { describe, expect, it, vi } from 'vitest';
import { FIRMA_SECICI_BETIGI } from './acilis.ts';
import { kopruKur, type DosyaOkuyucu, type Istemci } from './kopru.ts';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });
type Alan = { k: string; options?: unknown[] };
type Adim = { t: string; keys: string[] };
type Cagri = { baslik: string; alanlar: Alan[]; ilk: Record<string, unknown> | null; kaydet: (d: Record<string, unknown>) => unknown; secenek: { steps?: Adim[] } | null };

// 236 a: uygulamanın tedarikçi formuna Müşteri-Tedarikçi firması seçicisi eklenir; seçim `firmaId` alanına sayı olarak yazılır.
describe('Kalite Merkezi tedarikçi firma seçicisi', () => {
  const SUP_ALANLARI: Alan[] = [{ k: 'kod' }, { k: 'ad' }, { k: 'kategori' }, { k: 'onay' }, { k: 'kritik' }];
  const ADIMLAR: Adim[] = [{ t: 'Firma', keys: ['kod', 'ad', 'kategori', 'kritik'] }, { t: 'Onay', keys: ['onay'] }];

  function kur(cevap: () => Promise<Response>) {
    const cagrilar: Cagri[] = [];
    const asil = vi.fn((baslik: string, alanlar: Alan[], ilk: Cagri['ilk'], kaydet: Cagri['kaydet'], _ek: string, secenek: Cagri['secenek']) => {
      cagrilar.push({ baslik, alanlar, ilk, kaydet, secenek });
      return 'pencere';
    });
    const fetch = vi.fn(async (_adres: string) => cevap());
    const g: Record<string, unknown> = { fetch };
    const kapsam: { formModal: unknown } = { formModal: asil };
    // Betik uygulamanın genel `formModal` bağını değiştirir; testte bağ kapsam nesnesindedir.
    new Function('window', 'kapsam', `with (kapsam) { ${FIRMA_SECICI_BETIGI} }`)(g, kapsam);
    const formModal = kapsam.formModal as (...a: unknown[]) => unknown;
    const bekle = () => new Promise((r) => setTimeout(r, 0));
    return { g, fetch, asil, cagrilar, formModal, bekle };
  }
  const firmalar = { firmalar: [{ id: 7, kod: 'T-7', ad: 'Deneme Tedarik' }, { id: 9, kod: null, ad: 'Deneme Alfa' }] };

  it('tedarikçi formunda adın ardına seçici eklenir; seçim sayı, "Bağlı değil" null yazılır', async () => {
    const k = kur(async () => json(200, firmalar));
    const kaydedilen: Record<string, unknown>[] = [];
    k.formModal('Tedarikçi ekle', SUP_ALANLARI, null, (d: Record<string, unknown>) => { kaydedilen.push(d); }, '', { steps: ADIMLAR });
    await k.bekle(); await k.bekle();
    expect(k.fetch).toHaveBeenCalledWith('api/tedarikci-firmalari');
    const c = k.cagrilar[0]!;
    expect(c.alanlar.map((a) => a.k)).toEqual(['kod', 'ad', 'firmaId', 'kategori', 'onay', 'kritik']);
    expect(c.alanlar[2]!.options).toEqual([['', 'Bağlı değil'], ['7', 'Deneme Tedarik (T-7)'], ['9', 'Deneme Alfa']]);
    expect(c.secenek!.steps![0]!.keys).toEqual(['kod', 'ad', 'firmaId', 'kategori', 'kritik']);
    c.kaydet({ ad: 'x', firmaId: '7' });
    c.kaydet({ ad: 'x', firmaId: '' });
    c.kaydet({ ad: 'x', firmaId: 'bozuk' });
    expect(kaydedilen.map((d) => d.firmaId)).toEqual([7, null, null]);
  });

  it('düzenlemede mevcut bağ seçili gelir; listede olmayan bağ seçenek olarak korunur; liste bir kez alınır', async () => {
    const k = kur(async () => json(200, firmalar));
    k.formModal('Deneme düzenle', SUP_ALANLARI, { ad: 'Deneme', firmaId: 42 }, () => undefined, '', { steps: ADIMLAR });
    await k.bekle(); await k.bekle();
    k.formModal('Deneme düzenle', SUP_ALANLARI, { ad: 'Deneme', firmaId: 7 }, () => undefined, '', { steps: ADIMLAR });
    await k.bekle(); await k.bekle();
    expect(k.fetch).toHaveBeenCalledTimes(1);
    expect(k.cagrilar[0]!.ilk!.firmaId).toBe('42');
    expect(k.cagrilar[0]!.alanlar[2]!.options!.at(-1)).toEqual(['42', 'Firma #42 (listede yok)']);
    expect(k.cagrilar[1]!.ilk!.firmaId).toBe('7');
    expect(k.cagrilar[1]!.alanlar[2]!.options).toHaveLength(3);
  });

  it('liste açılamazsa (onay yetkisi yok) form yalnız "Bağlı değil" ile açılır', async () => {
    const k = kur(async () => json(403, { hata: 'yetki yok' }));
    k.formModal('Tedarikçi ekle', SUP_ALANLARI, null, () => undefined, '', { steps: ADIMLAR });
    await k.bekle(); await k.bekle();
    expect(k.cagrilar[0]!.alanlar[2]!.options).toEqual([['', 'Bağlı değil']]);
  });

  it('başka formlar dokunulmadan ve eşzamanlı geçer', () => {
    const k = kur(async () => json(200, firmalar));
    expect(k.formModal('Uygunsuzluk', [{ k: 'no' }, { k: 'durum' }], null, () => undefined, '', { steps: [] })).toBe('pencere');
    expect(k.formModal('Onay', [], null, () => undefined)).toBe('pencere');
    expect(k.fetch).not.toHaveBeenCalled();
    expect(k.cagrilar).toHaveLength(2);
  });
});

describe('Kalite Merkezi köprüsü: tedarikçi firmaları', () => {
  it('api/tedarikci-firmalari seçici ucuna gider', async () => {
    const get = vi.fn(async () => ({ firmalar: [{ id: 7, kod: null, ad: 'Deneme' }] }));
    const kopru = kopruKur({ get, post: vi.fn() } as unknown as Istemci, vi.fn(async () => null) as DosyaOkuyucu, () => 0);
    expect(await kopru.isle({ adres: 'api/tedarikci-firmalari', yontem: 'GET', govde: null })).toEqual({ durum: 200, json: { firmalar: [{ id: 7, kod: null, ad: 'Deneme' }] } });
    expect(get).toHaveBeenLastCalledWith('/kalite-merkezi/tedarikci-firmalari');
  });
});
