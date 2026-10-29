import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { bosIs } from './kurallar.ts';
import { DurumDugmeleri, GorevKarti, IsKuyrugu, IsAlanlari, IsOzeti, Konfeti, NumuneSeridi, SayacKadrani, type CevrimOlcer } from './Parcalar.tsx';

// Eski kadranın dönen çevrim ışığı ve iş bitince konfeti (283.19 geri getirme).

afterEach(() => { cleanup(); });

const olcer = (gecen: number): CevrimOlcer => ({ gecen: () => gecen, son: () => 0, sayac: () => 0 });
const is = (ek: Partial<ReturnType<typeof bosIs>>) => ({ ...bosIs({ l: 'Deneme' }), target: 10, good: 2, cycle: 30, ...ek });

describe('Sayaç kadranı çevrim ışığı', () => {
  it('çalışan işte döner, çevrim süresi değişkenle verilir', () => {
    const { container } = render(<SayacKadrani is={is({ state: 'running' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(5000)} />);
    expect(container.querySelector('.tc-ay1-kadran')?.hasAttribute('data-calisiyor')).toBe(true);
    const yay = container.querySelector<SVGElement>('.tc-ay1-cevrim-yay');
    expect(yay?.style.getPropertyValue('--tc-ay1-cevrim-sure')).toBe('30s');
    expect(yay?.style.getPropertyValue('--tc-ay1-cevrim-baslangic')).toBe('-5s');
    expect(yay?.hasAttribute('data-gec')).toBe(false);
  });
  it('süre aşılınca gecikme işareti alır; duraklayınca dönmez', () => {
    const gec = render(<SayacKadrani is={is({ state: 'running' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(40000)} />);
    expect(gec.container.querySelector('.tc-ay1-cevrim-yay')?.hasAttribute('data-gec')).toBe(true);
    cleanup();
    const dur = render(<SayacKadrani is={is({ state: 'paused' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(5000)} />);
    expect(dur.container.querySelector('.tc-ay1-kadran')?.hasAttribute('data-calisiyor')).toBe(false);
  });
  it('çevrim süresi yoksa ışık çizilmez', () => {
    const { container } = render(<SayacKadrani is={is({ state: 'running', cycle: 0 })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} />);
    expect(container.querySelector('.tc-ay1-cevrim')).toBeNull();
  });
});

describe('Konfeti', () => {
  it('70 parça, her biri kendi yeri ve süresiyle sayfanın üstüne düşer', () => {
    render(<Konfeti />);
    const parcalar = document.body.querySelectorAll<HTMLElement>('.tc-ay1-konfeti > i');
    expect(parcalar.length).toBe(70);
    expect(parcalar[0]?.style.getPropertyValue('--x')).toMatch(/%$/);
    expect(parcalar[0]?.style.getPropertyValue('--sure')).toMatch(/s$/);
  });
});

// T2 ve T5 (526): kalan yalnız sağlamla düşer; işi olmayan istasyonda hedef ve kalan yoktur, durum düğmeleri kapalıdır.
describe('Sayaç kadranı kalan ve boş istasyon', () => {
  it('kalan hedef eksi sağlamdır; hurda kalanı düşürmez', () => {
    const { container } = render(<SayacKadrani is={is({ empty: false, target: 40, good: 38, scrap: 2, cycle: 0 })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} />);
    expect(container.querySelector('.tc-ay1-kadran-yuzde')?.textContent).toBe('%95 · 2 kaldı');
  });
  it('TMI işinde (1188) yan sayı Hatalı: sunucu toplamı, iyi ve kalanı değiştirmez; bilinmiyorsa tire', () => {
    const { container } = render(<SayacKadrani is={is({ empty: false, target: 40, good: 38, scrap: 0, cycle: 0 })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} hatali={4} />);
    expect(container.querySelector('.tc-ay1-kadran-etiket')?.textContent).toBe('Hatalı4');
    expect(container.querySelector('.tc-ay1-kadran-yuzde')?.textContent).toBe('%95 · 2 kaldı');
    cleanup();
    const bos = render(<SayacKadrani is={is({ empty: false, target: 40, good: 38, scrap: 0, cycle: 0 })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} hatali={null} />);
    expect(bos.container.querySelector('.tc-ay1-kadran-etiket')?.textContent).toBe('Hatalı—');
  });
  it('işi olmayan istasyonda hedef ve kalan "—" görünür', () => {
    const { container } = render(<SayacKadrani is={bosIs({ l: 'Boş' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(0)} />);
    expect(container.querySelector('.tc-ay1-kadran-hedef')?.textContent).toBe('/ — adet');
    expect(container.querySelector('.tc-ay1-kadran-yuzde')?.textContent).toBe('—');
    expect(container.textContent).not.toContain('kaldı');
  });
  it('pasifken durum düğmeleri kapalıdır ve eylem çağrılmaz', () => {
    const eylemler: string[] = [];
    const { container } = render(<DurumDugmeleri durum="idle" pasif eylem={(d) => eylemler.push(d.key)} erken={() => {}} />);
    const dugmeler = [...container.querySelectorAll('button')];
    expect(dugmeler.length).toBeGreaterThan(0);
    dugmeler.forEach((b) => { expect(b.disabled).toBe(true); fireEvent.click(b); });
    expect(eylemler).toEqual([]);
  });
  it('iş atanmışken durum düğmeleri açıktır ve eylemi çağırır', () => {
    const eylemler: string[] = [];
    const { container } = render(<DurumDugmeleri durum="idle" eylem={(d) => eylemler.push(d.key)} erken={() => {}} />);
    const b = container.querySelector('button');
    expect(b?.disabled).toBe(false);
    fireEvent.click(b!);
    expect(eylemler.length).toBe(1);
  });
});

describe('Numune planı şeridi (566)', () => {
  const kurallar = [
    { id: 'ilk', etiket: 'İlk parça', olcen: 'Kalite', ilk: true, olculer: [1] },
    { id: 'her', etiket: 'Her 50 parça', olcen: 'Operatör', ilk: false, olculer: [2, 3] },
  ];
  it('kural başına bir satır; durum metinle ve renk adıyla yazılır', () => {
    const { container, getByRole } = render(<NumuneSeridi girdi={{ kurallar, meas: { 2: { ok: true } }, bekleyen: [1], zamani: [], siradaki: { olcu: 2, v: 30, u: 'parça' }, ilkKarar: null }} />);
    expect(getByRole('list', { name: 'Numune planı' })).toBeTruthy();
    const satirlar = Array.from(container.querySelectorAll('.tc-ay1-numune-serit-parca'));
    expect(satirlar.map((x) => x.getAttribute('data-durum'))).toEqual(['bitti', 'sirada']);
    expect(satirlar[0]?.textContent).toContain('Numune kalitede');
    expect(satirlar[1]?.textContent).toContain('Operatör · 1/2 ölçü');
    expect(satirlar[1]?.textContent).toContain('30 parça sonra');
  });
  it('numune planı yoksa çizilmez', () => {
    const { container } = render(<NumuneSeridi girdi={{ kurallar: [], meas: {}, bekleyen: [], zamani: [], siradaki: null, ilkKarar: null }} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('664: sayaç kadranı, numune çizgisi ve iş başlığı', () => {
  it('kadranda "Kalan süre", "Son çevrim", planlı "Çevrim" ve gecikme sayacı yok; süre aşılınca yalnız halka renk alır', () => {
    const { container } = render(<SayacKadrani is={is({ state: 'running' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={{ ...olcer(5000), son: () => 28000 }} />);
    expect(container.textContent).not.toContain('Kalan süre');
    expect(container.textContent).not.toContain('Son çevrim');
    expect(container.textContent).not.toMatch(/Çevrim\d|Çevrim$|\/ 30 sn/);
    cleanup();
    const gec = render(<SayacKadrani is={is({ state: 'running' })} etiket="İyi parça" birim="adet" duzelt={null} cevrim={olcer(40000)} />);
    expect(gec.container.textContent).not.toMatch(/Gecikme|\+10 sn/);
    expect(gec.container.querySelector('.tc-ay1-cevrim-yay')?.hasAttribute('data-gec')).toBe(true);
  });
  it('aralıklı kuralda çizgi sıradaki numuneye yaklaşmayı gösterir; son onda birde yakın, zamanı gelince dolu', () => {
    const kural = (gecen: number) => ({ id: 'her', etiket: 'Her 50 parça', olcen: 'Kalite', ilk: false, olculer: [3], aralik: { n: 50, birim: 'parça' as const, gecen, hedef: 50 } });
    const ciz = (gecen: number, zamani: number[] = []) => render(<NumuneSeridi girdi={{ kurallar: [kural(gecen)], meas: {}, bekleyen: [], zamani, siradaki: { olcu: 3, v: 50 - gecen, u: 'parça' }, ilkKarar: null }} />);
    const ilk = ciz(38);
    expect(ilk.getByRole('img', { name: 'Sıradaki numune 50. parça · 12 parça kaldı' })).toBeTruthy();
    expect(ilk.container.querySelector('.tc-ay1-numune-cizgi-dolu')?.getAttribute('x2')).toBe('76');
    expect(ilk.container.querySelector('.tc-ay1-numune-cizgi')?.hasAttribute('data-yakin')).toBe(false);
    cleanup();
    expect(ciz(46).container.querySelector('.tc-ay1-numune-cizgi')?.hasAttribute('data-yakin')).toBe(true);
    cleanup();
    const zamani = ciz(0, [3]);
    expect(zamani.getByRole('img', { name: 'Numune zamanı' })).toBeTruthy();
    expect(zamani.container.querySelector('.tc-ay1-numune-cizgi')?.hasAttribute('data-dolu')).toBe(true);
  });
  it('iş başlığı etiketli alanlar sırasıyla; boş alan "—"; geniş düzende emir no başlıktır', () => {
    const o = is({ empty: false, no: 'UE-DENEME-7', part: 'Deneme parça', op: 'Op 10 · Tornalama', pkg: { partNo: 'P-DENEME', rev: 'B', proje: 'Deneme proje' } as never });
    const { container, getByRole } = render(<IsAlanlari is={o} baslik />);
    const alanlar = Array.from(container.querySelectorAll('.tc-ay1-is-alan')).map((a) => a.textContent);
    expect(alanlar).toEqual(['ProjeDeneme proje', 'Üretim emriUE-DENEME-7', 'OpOp 10 · Tornalama', 'Parça noP-DENEME', 'Parça adıDeneme parça', 'RevB']);
    expect(getByRole('heading', { name: 'UE-DENEME-7' })).toBeTruthy();
    cleanup();
    const bos = render(<IsAlanlari is={is({ empty: false, no: 'UE-8', part: 'X', op: '', pkg: { partNo: '', rev: '' } as never })} />);
    expect(Array.from(bos.container.querySelectorAll('.tc-ay1-is-alan b')).map((b) => b.textContent)).toEqual(['—', 'UE-8', '—', '—', 'X', '—']);
    expect(bos.queryByRole('heading')).toBeNull();
    cleanup();
    const issiz = render(<IsAlanlari is={is({})} baslik />);
    expect(issiz.container.querySelector('.tc-ay1-is-alan')).toBeNull();
    expect(issiz.container.textContent).toContain('Deneme');
  });
});

describe('685: telefonda iş özeti', () => {
  it('kapalıyken emir · op · parça no tek satır; dokununca bütün alanlar açılır', () => {
    let acik = false;
    const o = is({ empty: false, no: 'UE-DENEME-9', part: 'Deneme parça', op: 'Op 20', pkg: { partNo: 'P-DENEME', rev: 'C', proje: 'Deneme proje' } as never });
    const { container, rerender, getByRole } = render(<IsOzeti is={o} acik={acik} degistir={() => { acik = !acik; }} />);
    expect(container.querySelector('.tc-ay1-is-ozet-satir')?.textContent).toBe('UE-DENEME-9 · Op 20 · P-DENEME');
    expect(container.querySelector('.tc-ay1-is-alan')).toBeNull();
    fireEvent.click(getByRole('button', { expanded: false }));
    rerender(<IsOzeti is={o} acik={acik} degistir={() => { acik = !acik; }} />);
    expect(getByRole('button', { expanded: true })).toBeTruthy();
    expect(container.querySelectorAll('.tc-ay1-is-alan').length).toBe(6);
  });
  it('işsiz istasyonda açılıp kapanmaz', () => {
    const { container } = render(<IsOzeti is={bosIs({ l: 'Boş' })} acik={false} degistir={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('Aynı emrin iki adımı kuyrukta (639f)', () => {
  const adim = (id: string, op: string, state: string) => ({ ...is({ no: 'IE-1', op, state: state as never }), pkg: { id, rev: 'A' } as never });
  it('iki ayrı kart; sıradaki işareti yalnız kendi adımında', () => {
    const { container } = render(<IsKuyrugu isler={[adim('tmi-ie-10', 'Op 10', 'running'), adim('tmi-ie-20', 'Op 20', 'queued')]} aktif={0} sec={() => {}}
      siradaki="tmi-ie-20" onde={null} kartlar={[]} kartla={null} />);
    const kartlar = container.querySelectorAll('.tc-ay1-is');
    expect(kartlar).toHaveLength(2);
    expect(kartlar[0]!.textContent).not.toContain('Sıradaki');
    expect(kartlar[1]!.textContent).toContain('Sıradaki');
  });

  it('639h: fazla sayan adımın kartında eksi bakiye; öteki adımda ve biten işte yok', () => {
    const eksili = (id: string, op: string, state: string, eksi: number) => ({ ...adim(id, op, state), pkg: { id, rev: 'A', tmi: { eksi } } as never });
    const { container } = render(<IsKuyrugu isler={[adim('tmi-ie-10', 'Op 10', 'running'), eksili('tmi-ie-20', 'Op 20', 'running', 2), eksili('tmi-ie-30', 'Op 30', 'done', 1)]}
      aktif={0} sec={() => {}} siradaki={undefined} onde={null} kartlar={[]} kartla={null} />);
    const kartlar = [...container.querySelectorAll('.tc-ay1-is')];
    expect(kartlar.map((k) => k.textContent?.includes('Eksi bakiye'))).toEqual([false, true, false]);
    expect(kartlar[1]!.textContent).toContain('Eksi bakiye · 2 fazla sayıldı');
  });
});

describe('702: Şimdi şeridi', () => {
  it('numune şeridi görev kartının içinde, başlığın altında çizilir', () => {
    const gorev = { tone: 'run' as const, icon: 'layers' as const, t: 'Sıradaki işe hazırlan', d: 'UE-2' };
    const { getByRole, getByText } = render(
      <GorevKarti gorev={gorev} eylem={() => {}} ertele={() => {}} izinli={() => true} ek={<ul aria-label="Numune planı" />} />,
    );
    const kart = getByRole('status');
    expect(kart.contains(getByRole('list', { name: 'Numune planı' }))).toBe(true);
    expect(kart.contains(getByText('Sıradaki işe hazırlan'))).toBe(true);
  });
});
