import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { YazCevabi, YazGovdesi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { KaynakDegisikligi } from '#paylasilan/sozlesme/planlama.ts';
import { CalismaYazici, bekleyenler, reddedilemez } from '../../kayit.ts';
import { calismaKur } from '../../siparis/test-veri.ts';
import { DegisiklikSeridi } from './DegisiklikSeridi.tsx';
import { AYRINTI_FARK, kaynakSatiri, seritListesi, seritMetni } from './kurallar.ts';

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
    expect(s.ayrinti).toBe('tezgahlar[M2]: boş → {"id":"M2"}; ariza.M1: false → true');
    expect(reddedilemez([s], [s.id])).toMatch(/yalnız uygulanabilir/);
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
