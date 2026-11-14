import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { KaynakDegisikligi } from '#paylasilan/sozlesme/planlama.ts';
import { CalismaYazici, bekleyenler, reddedilemez } from '../../kayit.ts';
import { calismaKur } from '../../siparis/test-veri.ts';
import { DegisiklikSeridi } from './DegisiklikSeridi.tsx';
import { AYRINTI_FARK, canliBayatMetni, canliBayatSatiri, farkMetni, kaynakSatiri, seritListesi, seritMetni, type CanliBayatlik } from './kurallar.ts';

afterEach(() => { cleanup(); });

const KD: KaynakDegisikligi = {
  alanlar: ['tezgahlar', 'ariza'],
  farklar: [{ yol: 'tezgahlar[M2]', eski: null, yeni: { id: 'M2' } }, { yol: 'ariza.M1', eski: false, yeni: true }],
  kesik: false,
};
// Sunucu birleşmesi veri sürümünü artırmıştır: plan 3, çalışma 4.
const bayat = () => calismaKur((c) => { c.dataVer = 4; });

describe('değişiklik şeridi kuralları', () => {
  it('başka sayfa satırı alan adları ve farklarla kurulur; kişi uydurulmaz, reddedilemez', () => {
    const s = kaynakSatiri(KD, 5, 4);
    expect(s).toMatchObject({ id: 'dis-4', ne: 'Başka sayfada değişti: Tezgâhlar, Makine arızası', kim: '', isler: ['*'], geri: null, dis: true });
    expect(s.ayrinti).toBe('Tezgâhlar, M2: eklendi; Makine arızası, M1: hayır → evet');
    expect(reddedilemez([s], [s.id])).toMatch(/yalnız uygulanabilir/);
  });

  it('3233 a: sunucu yalnız eklenen emirleri bildirdiyse yalnız onlar dizilir; alan yoksa, null ya da boşsa bütün işler; yol metnindeki sayıdan kimlik okunmaz', () => {
    const farklar = [{ yol: 'siparisler.length', eski: 315, yeni: 316 }, { yol: 'siparisler[316]', eski: null, yeni: { id: '316' } }];
    const kd = { alanlar: ['siparisler'], farklar, kesik: false } satisfies KaynakDegisikligi;
    expect(kaynakSatiri({ ...kd, eklenenSiparisler: ['316', '316/A'] }, 0, 1).isler).toEqual(['316', '316/A']);
    expect(kaynakSatiri({ ...kd, kesik: true, eklenenSiparisler: ['316'] }, 0, 1).isler).toEqual(['316']);
    expect(kaynakSatiri(kd, 0, 1).isler).toEqual(['*']);
    expect(kaynakSatiri({ ...kd, eklenenSiparisler: null }, 0, 1).isler).toEqual(['*']);
    expect(kaynakSatiri({ ...kd, eklenenSiparisler: [] }, 0, 1).isler).toEqual(['*']);
  });

  it('fark alan yolu değil kullanıcı metniyle yazılır; adı bilinmeyen iç alanın değeri yazılmaz (B-2499-8)', () => {
    expect(farkMetni({ yol: 'ariza.length', eski: 0, yeni: 1 })).toBe('Makine arızası: kayıt sayısı 0 → 1');
    expect(farkMetni({ yol: 'saSurum', eski: 3, yeni: 4 })).toBe('Planlama verisi: değişti');
    expect(farkMetni({ yol: 'siparisler[2].adet', eski: 10, yeni: 12 })).toBe('Siparişler, 3. kayıt adet: 10 → 12');
    expect(farkMetni({ yol: 'tezgahlar[0].xyz', eski: 1, yeni: 2 })).toBe('Tezgâhlar, 1. kayıt: değişti');
    expect(farkMetni({ yol: 'tezgahlar[M3]', eski: { id: 'M3' }, yeni: null })).toBe('Tezgâhlar, M3: çıkarıldı');
  });

  it('ayrıntı en çok AYRINTI_FARK fark yazar, kalanı ve kesiği söyler', () => {
    const farklar = Array.from({ length: AYRINTI_FARK + 3 }, (_, i) => ({ yol: `tezgahlar[M${String(i)}]`, eski: 1, yeni: 2 }));
    expect(kaynakSatiri({ alanlar: ['tezgahlar'], farklar, kesik: false }, 0, 1).ayrinti).toMatch(/ve 3 fark$/);
    expect(kaynakSatiri({ alanlar: ['tezgahlar'], farklar, kesik: true }, 0, 1).ayrinti).toMatch(/ve daha çok fark$/);
    expect(kaynakSatiri({ alanlar: ['receteRotaKaydi'], farklar: [], kesik: false }, 0, 1).ayrinti).toBe('Ayrıntısı birleşmede bulunamadı.');
  });

  it('liste: kayıtlı bekleyen yokken yalnız başka sayfa satırı; kayıtlıysa yinelenmez; satır yoksa eski davranış', () => {
    const c = bayat();
    const s = kaynakSatiri(KD, 5, 4);
    expect(seritListesi(c, s).map((b) => b.id)).toEqual(['dis-4']);
    expect(seritListesi(c, null).map((b) => b.id)).toEqual(['eski']);
    c.bekleyen = [s];
    expect(seritListesi(c, s).map((b) => b.id)).toEqual(['dis-4']);
    expect(seritListesi(calismaKur(), null)).toEqual([]);
  });

  it('metin plan güncelken ve bayatken', () => {
    expect(seritMetni({ toplam: 0, dis: 0 })).toBe('Plan çözüldüğünden bu yana değişiklik yok');
    expect(seritMetni({ toplam: 2, dis: 1 })).toBe('Plan çözüldüğünden bu yana 2 değişiklik, 1 tanesi başka sayfadan; plan güncel değil');
  });
});

describe('yazıcı başka sayfa satırını bekleyene yazar', () => {
  const kur = (calisma = bayat()) => {
    const yazmalar: YazGovdesi[] = [];
    const y = new CalismaYazici({
      calisma, surum: 7, kim: 'Deneme Planlamaci', sayfa: () => 'Planlama', simdi: () => 1000, beklemeMs: 0,
      yaz: (g) => { yazmalar.push(g); return Promise.resolve({ kayit: { surum: 8 } } as unknown as YazCevabi); }, uyar: () => {},
    });
    return { y, yazmalar };
  };

  it('veri sürümü artmaz, geri alma yığınına ve ize girmez, aynı satır ikinci kez yazılmaz', () => {
    const { y } = kur();
    const s = kaynakSatiri(KD, 5, 4);
    expect(y.kaynakDegisikliginiYaz(s)).toBe(true);
    expect(y.calisma.dataVer).toBe(4);
    expect(bekleyenler(y.calisma).map((b) => b.id)).toEqual(['dis-4']);
    expect(y.geriAlinabilir()).toBe(false);
    expect(y.calisma.iz).toHaveLength(0);
    expect(y.kaynakDegisikliginiYaz(s)).toBe(false);
  });

  it('plan güncelse ya da plan yoksa yazmaz', () => {
    expect(kur(calismaKur()).y.kaynakDegisikliginiYaz(kaynakSatiri(KD, 5, 3))).toBe(false);
    expect(kur(calismaKur((c) => { (c as { plan: unknown }).plan = null; c.dataVer = 4; })).y.kaynakDegisikliginiYaz(kaynakSatiri(KD, 5, 4))).toBe(false);
  });
});

describe('DegisiklikSeridi', () => {
  it('plan güncelken tek satır, düğme yok', () => {
    render(<DegisiklikSeridi calisma={calismaKur()} dis={null} />);
    expect(screen.getByRole('status').textContent).toContain('değişiklik yok');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it("Motor ve Stüdyo'da plan güncelken satır çizilmez (güncel rozeti plan çubuğundadır)", () => {
    const { container } = render(<DegisiklikSeridi calisma={calismaKur()} dis={null} bosGizle />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('başka sayfa satırını düğmeyle açar; kişi bilinmiyor yazar', () => {
    render(<DegisiklikSeridi calisma={bayat()} dis={kaynakSatiri(KD, 0, 4)} />);
    expect(screen.getByRole('status').textContent).toContain('1 değişiklik, 1 tanesi başka sayfadan');
    fireEvent.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByText('Başka sayfa')).toBeTruthy();
    expect(screen.getByText('Kim: bilinmiyor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gizle' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('plan yoksa çizilmez', () => {
    const { container } = render(<DegisiklikSeridi calisma={calismaKur((c) => { (c as { plan: unknown }).plan = null; })} dis={null} />);
    expect(container.innerHTML).toBe('');
  });
});

// 2319 (S7): canlı plan bayat işareti. Veriler uydurmadır.
const CANLI: CanliBayatlik = {
  bayat: true,
  sayilar: { 'emir-bitti': 2, 'adim-bitti': 0, 'fason-donusu': 0, durus: 1, 'rota-degisti': 0 },
  olaylar: [
    { neden: 'durus', zaman: '2026-11-08T08:00:00.000Z', emirNo: null, makineKod: 'T1' },
    { neden: 'emir-bitti', zaman: '2026-11-08T07:00:00.000Z', emirNo: 'E-1', makineKod: null },
  ],
};

describe('canlı plan bayat işareti (2319)', () => {
  it('metin yalnız sıfırdan büyük nedenleri sayar; bayat değilse yok', () => {
    expect(canliBayatMetni(CANLI)).toBe('Canlı plan son canlıya almadan sonra eskidi: 2 emir erken bitti, 1 makine duruşu; planı gözden geçirin');
    expect(canliBayatMetni({ ...CANLI, sayilar: { ...CANLI.sayilar, 'adim-bitti': 3 } })).toContain('2 emir erken bitti, 3 adım erken bitti');
    expect(canliBayatSatiri({ neden: 'adim-bitti', zaman: '', emirNo: 'E-2', makineKod: null })).toBe('adım erken bitti: E-2');
    expect(canliBayatMetni({ bayat: false, sayilar: { 'emir-bitti': 0, 'adim-bitti': 0, 'fason-donusu': 0, durus: 0, 'rota-degisti': 0 }, olaylar: [] })).toBeNull();
  });

  it('bayatsa ikinci satır çizilir, olaylar düğmeyle açılır; şerit eski görünür', () => {
    const { container } = render(<DegisiklikSeridi calisma={calismaKur()} dis={null} canli={CANLI} />);
    expect(container.querySelector('[data-canli="eski"]')?.textContent).toContain('2 emir erken bitti');
    expect(container.querySelector('section')?.getAttribute('data-durum')).toBe('eski');
    fireEvent.click(screen.getByRole('button', { name: 'Olaylar' }));
    expect(screen.getByText('makine duruşu: T1')).toBeTruthy();
    expect(screen.getByText('emir erken bitti: E-1')).toBeTruthy();
  });

  it('canlı verilmezse ya da bayat değilse eski davranış', () => {
    const { container } = render(<DegisiklikSeridi calisma={calismaKur()} dis={null} canli={{ ...CANLI, bayat: false }} />);
    expect(container.querySelector('[data-canli]')).toBeNull();
    expect(container.querySelector('section')?.getAttribute('data-durum')).toBe('guncel');
  });
});
