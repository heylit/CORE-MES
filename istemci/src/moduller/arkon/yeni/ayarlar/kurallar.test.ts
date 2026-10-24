import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { CagriEkiplerim } from '../../../../../../arkon/web/src/data/cagri-ekiplerim.ts';
import type { Perm, Role } from '../cekirdek/tipler.ts';
import {
  ayarGorunurlugu, cagriBanaGelir, cagriCikar, cagriEkle, gunlukSuz, ilkAyarSekmesi, kisiSirasi, tazeCagrilar, CAGRI_OMRU_MS,
} from './kurallar.ts';

// Eski çağrı alıcısı (giris-ayarlar-spc.ts callForMe) gerçek haliyle yüklenir; yetki, oturum ve cihaz istasyonu sahtedir.
let yetkiler = new Set<string>();
let oturum: { role: Role } | null = null;
let istasyon: string | null = null;
vi.mock('../../../../../../arkon/web/src/data/store.ts', () => ({ AKStore: { status: () => ({ mode: 'server' }) } }));
vi.mock('../../../../../../arkon/web/src/app/ortak-ayarlar.ts', () => ({ can: (k: string) => yetkiler.has(k), MEU: () => oturum }));
vi.mock('../../../../../../arkon/web/src/app/yukleyici.ts', () => ({ LS: { get: (k: string) => (k === 'station' ? istasyon : null), set: () => {} } }));
vi.mock('../../../../../../arkon/web/src/app/temel.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/teknik-resim.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/operator-parcalar.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/kurallar.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/istasyonlar.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/hazirlik.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/ayarlar-uretim.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/baslat.ts', () => ({}));
vi.mock('../../../../../../arkon/web/src/app/gomulu.ts', () => ({}));

type EskiAlici = (m: { k: string; machine?: string }, e: CagriEkiplerim) => boolean;
let eskiAlici: EskiAlici;
beforeAll(async () => {
  const YOL = '../../../../../../arkon/web/src/app/giris-ayarlar-spc.ts';
  eskiAlici = ((await import(/* @vite-ignore */ YOL)) as { callForMe: EskiAlici }).callForMe;
});

describe('Çağrı alıcısı (eskisiyle aynı)', () => {
  const roller: Role[] = ['admin', 'lead', 'maint', 'quality', 'operator'];
  const ekipler: CagriEkiplerim[] = [null, [], ['bakim'], ['kalite', 'malzeme']];
  const cagrilar = [{ k: 'bakim', machine: 'IST-1' }, { k: 'kalite', machine: 'IST-2' }, { k: 'malzeme' }];
  it('bütün rol, yetki, istasyon, sayfa ve yönlendirme bileşimlerinde aynı karar', () => {
    let n = 0;
    for (const rol of roller) for (const ack of [true, false]) for (const st of [null, 'IST-1']) for (const sayfa of ['operator', 'pano'])
      for (const e of ekipler) for (const m of cagrilar) {
        yetkiler = new Set(ack ? ['prod.ack'] : []);
        oturum = { role: rol };
        istasyon = st;
        window.location.hash = sayfa === 'operator' ? '' : `#${sayfa}`;
        const yeni = cagriBanaGelir(m, { ustlenebilir: ack, rol, istasyon: st, sayfa, ekiplerim: e });
        expect(yeni, JSON.stringify({ rol, ack, st, sayfa, e, m })).toBe(eskiAlici(m, e));
        n += 1;
      }
    expect(n).toBe(roller.length * 2 * 2 * 2 * ekipler.length * cagrilar.length);
  });
});

describe('Çağrı listesi', () => {
  it('en çok dört çağrı; aynı çağrı sona alınır; yarım saati geçen düşer', () => {
    let l = [1, 2, 3, 4, 5].reduce<{ t0: number }[]>((a, t0) => cagriEkle(a, { t0 }), []);
    expect(l.map((x) => x.t0)).toEqual([2, 3, 4, 5]);
    l = cagriEkle(l, { t0: 3 });
    expect(l.map((x) => x.t0)).toEqual([2, 4, 5, 3]);
    expect(cagriCikar(l, 4).map((x) => x.t0)).toEqual([2, 5, 3]);
    expect(tazeCagrilar([{ t0: 0 }, { t0: 10 }], CAGRI_OMRU_MS + 5).map((x) => x.t0)).toEqual([10]);
  });
});

describe('Ayar sekmeleri (sunucuya bağlı)', () => {
  const can = (l: Perm[]) => (k: Perm) => l.includes(k);
  it('yönetici bütün sekmeleri görür', () => {
    expect(ayarGorunurlugu(() => true, true).sekmeler).toEqual(['genel', 'tesis', 'kisi', 'uretim', 'sistem']);
  });
  it('operatör yalnız Genel\'i görür', () => {
    expect(ayarGorunurlugu(can(['page.op', 'prod.run', 'logi.req']), false)).toEqual({ sekmeler: ['genel'], tesisOkur: false, nedenOkur: false });
  });
  it('hazırlık tesis ve nedenleri salt okunur görür; vardiya amiri Üretim\'i vardiyayla görür', () => {
    expect(ayarGorunurlugu(can(['page.prep']), false)).toEqual({ sekmeler: ['genel', 'tesis', 'uretim'], tesisOkur: true, nedenOkur: true });
    expect(ayarGorunurlugu(can(['adm.shifts']), false).sekmeler).toEqual(['genel', 'uretim']);
    expect(ayarGorunurlugu(can(['adm.plant']), false).sekmeler).toEqual(['genel', 'tesis', 'sistem']);
  });
  it('kayıtlı sekme görünmüyorsa Genel açılır', () => {
    expect(ilkAyarSekmesi('sistem', ['genel', 'sistem'])).toBe('sistem');
    expect(ilkAyarSekmesi('sistem', ['genel'])).toBe('genel');
    expect(ilkAyarSekmesi(null, ['genel'])).toBe('genel');
  });
});

describe('Kişi sırası ve günlük süzgeci', () => {
  it('kişiler rol sırasında, sonra ada göre', () => {
    const l = kisiSirasi([{ role: 'operator', name: 'Ceren' }, { role: 'admin', name: 'Zeki' }, { role: 'operator', name: 'Ali' }, { role: 'prep', name: 'Banu' }] as { role: Role; name: string }[]);
    expect(l.map((x) => x.name)).toEqual(['Zeki', 'Banu', 'Ali', 'Ceren']);
  });
  it('alan ve arama birlikte süzer; arama küçük-büyük harf (Türkçe) ayırmaz', () => {
    const r = [
      { at: 1, area: 'kural', action: 'çalışma kuralları değişti', target: '', userName: 'Deneme İşçi' },
      { at: 2, area: 'tesis', action: 'tesis yapısı değişti', target: 'IST-1', userName: null },
    ];
    expect(gunlukSuz(r, '', '').length).toBe(2);
    expect(gunlukSuz(r, 'tesis', '').map((x) => x.at)).toEqual([2]);
    expect(gunlukSuz(r, '', 'İŞÇİ').map((x) => x.at)).toEqual([1]);
    expect(gunlukSuz(r, 'kural', 'ist-1')).toEqual([]);
  });
});
