import { describe, expect, it } from 'vitest';
import type { KokpitEmri, KokpitIsi } from './kurallar.ts';
import {
  AYAR_ANAHTARI, DAR_SUTUNLAR, EN_ENAZ, adimDurumu, ayarCoz, bolmeEni, bolmeSinirla, farkEnAz, farkKisaParcalari, farkOlustur, ilerleme, ilerlemeYazisi, olcumBirlestir, olcuSablonu, sablon, siralaGecikme, siralaPlan, sutunlariDuzenle, suAn, tarihSaat,
  varsayilanSutunlar,
} from './tablo.ts';
import { olcuAdaylari } from './Tablo.tsx';

// Uydurma örnek (ORN-): emir kimliği adım kimliklerinin önekidir.
const is = (id: string, ek: Partial<KokpitIsi> = {}): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: `Adım ${id}`, m: 'T1', S: 0, C: 4, basladi: false, fason: false, kilitli: false, sira: 0, ...ek });
const emir = (id: string, ek: Partial<KokpitEmri> = {}, adim = 2): KokpitEmri => ({
  id, no: `ORN-UE-${id}`, urun: 'ORN-Mil', adet: 10, termin: 100, bitis: 90, durum: 'iyi', gecikme: -10,
  adimlar: Array.from({ length: adim }, (_, i) => ({ id: `${id}.${String(i + 1)}`, ad: `Adım ${String(i + 1)}`, adaylar: ['T1'] })), ...ek,
});

describe('tablo: sütunlar ve bölme (3533)', () => {
  it('geniş ekranda hepsi, dar ekranda Emir, Termin, Fark ve Tamamlanma dairesi (Arayüz Z1)', () => {
    expect(varsayilanSutunlar(false)).toEqual(['emir', 'urun', 'adet', 'termin', 'bitis', 'fark', 'ilerleme']);
    expect(varsayilanSutunlar(true)).toEqual(['emir', 'termin', 'fark', 'ilerleme']);
    expect(DAR_SUTUNLAR).toContain('ilerleme');
  });
  it('Emir sütunu hep açıktır ve sıra tanım sırasıdır', () => {
    expect(sutunlariDuzenle(['fark', 'urun'])).toEqual(['emir', 'urun', 'fark']);
    expect(sutunlariDuzenle([])).toEqual(['emir']);
  });
  it('şablon fr ağırlığıdır, bölme eni görünen alanın oranıyla sınırlıdır, sürüklenen en alt ve üst sınırda kalır', () => {
    expect(sablon([{ en: 100 }, { en: 50 }])).toBe('minmax(0, 100fr) minmax(0, 50fr)');
    expect(bolmeEni(400, null)).toBe('min(400px, 65cqw)');
    expect(bolmeEni(400, 512.4)).toBe('min(512px, 70cqw)');
    expect(bolmeSinirla(50, 1000)).toBe(EN_ENAZ);
    expect(bolmeSinirla(5000, 1000)).toBe(840);
    expect(bolmeSinirla(500, 1000)).toBe(500);
    // Kap dar olsa da en az enine inmez.
    expect(bolmeSinirla(500, 300)).toBe(EN_ENAZ);
  });
  it('saklanan ayar: bilinmeyen sütun atılır, Emir eklenir, geçersiz en yok sayılır, bozuk metin varsayılandır', () => {
    expect(AYAR_ANAHTARI).toBe('coremes.kokpit-tablo');
    expect(ayarCoz(JSON.stringify({ sutunlar: ['fark', 'xyz', 'termin'], en: 480.4 }))).toEqual({ sutunlar: ['emir', 'termin', 'fark'], en: 480 });
    expect(ayarCoz(JSON.stringify({ sutunlar: [], en: 10 }))).toEqual({ sutunlar: null, en: null });
    expect(ayarCoz(JSON.stringify({ sutunlar: ['xyz'], en: 'çok' }))).toEqual({ sutunlar: null, en: null });
    expect(ayarCoz('{bozuk')).toEqual({ sutunlar: null, en: null });
    expect(ayarCoz(null)).toEqual({ sutunlar: null, en: null });
  });
});

describe('tablo: tamamlanma dairesi (V5, V8)', () => {
  const isler = { '1.1': is('1.1', { bitti: true }), '1.2': is('1.2', { basladi: true }), '2.1': is('2.1', { bitti: true }), '2.2': is('2.2', { bitti: true }), '3.1': is('3.1', { basladi: true }) };
  it('biten adım / toplam adım; süren adım yarım sayılmaz', () => {
    const i = ilerleme(emir('1'), isler);
    expect(i).toEqual({ biten: 1, toplam: 2, oran: 0.5, tam: false });
    expect(ilerlemeYazisi(i!)).toBe('1/2 adım bitti');
    expect(ilerleme(emir('3', {}, 3), isler)).toEqual({ biten: 0, toplam: 3, oran: 0, tam: false });
  });
  it('bütün adımı biten emirde dolu halka', () => {
    const i = ilerleme(emir('2'), isler);
    expect(i?.tam).toBe(true);
    expect(ilerlemeYazisi(i!)).toBe('Emir bitti · 2/2 adım bitti');
  });
  it('plansız ya da adımsız emirde daire yok (null), sıfır uydurulmaz', () => {
    expect(ilerleme(emir('4', { durum: 'plansiz', bitis: null, gecikme: null }), isler)).toBeNull();
    expect(ilerleme(emir('5', {}, 0), isler)).toBeNull();
  });
});

describe('tablo: fark (V4, V9)', () => {
  it('geç ve zamanında iki tondur; sıfır "tam zamanında"', () => {
    expect(farkOlustur({ gecikme: 5 })).toEqual({ ton: 'gec', yazi: '5 sa geç' });
    expect(farkOlustur({ gecikme: 29.5 })).toEqual({ ton: 'gec', yazi: '1 gün 5 sa 30 dk geç' });
    expect(farkOlustur({ gecikme: -17 })).toEqual({ ton: 'zaman', yazi: '17 sa erken' });
    expect(farkOlustur({ gecikme: 0 })).toEqual({ ton: 'zaman', yazi: 'tam zamanında' });
  });
  it('terminsiz ya da plansız emirde null', () => { expect(farkOlustur({ gecikme: null })).toBeNull(); });
});

describe('tablo: termine göre gecikme sıralaması (V3, Risk B1-B2, Arayüz K7)', () => {
  const isler = { '9.1': is('9.1', { bitti: true }), '9.2': is('9.2', { bitti: true }) };
  const l = [
    emir('1', { gecikme: -14, termin: 50 }), emir('2', { gecikme: 5, termin: 40 }), emir('3', { gecikme: null, termin: null }), emir('4', { gecikme: 5, termin: 30 }),
    emir('5', { gecikme: 28, termin: 60 }), emir('6', { gecikme: null, durum: 'plansiz', bitis: null }), emir('7', { gecikme: -2, termin: 70 }), emir('8', { gecikme: 50 }),
  ];
  const kimlikler = (x: readonly KokpitEmri[]): string[] => x.map((e) => e.id);
  it('en çok gecikecek üstte, eşitlikte termini yakın olan; terminsiz ve plansız plan sırasıyla en altta', () => {
    expect(kimlikler(siralaGecikme(l, isler))).toEqual(['8', '5', '4', '2', '7', '1', '3', '6']);
  });
  it('girdiyi değiştirmez (plan sırası kalır); eşit gecikmede plan sırası bozulmaz', () => {
    const once = kimlikler(l);
    siralaGecikme(l, isler);
    expect(kimlikler(l)).toEqual(once);
    const es = [emir('a', { gecikme: 3, termin: 10 }), emir('b', { gecikme: 3, termin: 10 }), emir('c', { gecikme: 3, termin: 10 })];
    expect(kimlikler(siralaGecikme(es, isler))).toEqual(['a', 'b', 'c']);
  });
  it('bitmiş emir geç bitmiş olsa da en altta, plan sırasıyla', () => {
    const k = [emir('9', { gecikme: 30, termin: 5 }), emir('1', { gecikme: 1, termin: 50 }), emir('3', { gecikme: null, termin: null })];
    expect(kimlikler(siralaGecikme(k, isler))).toEqual(['1', '3', '9']);
  });
});

describe('tablo: adım durumu ve tezgâh şu an', () => {
  it('bitti > süren > kilitli > bekliyor; planda yeri olmayan adımın durumu bilinmez', () => {
    expect(adimDurumu(is('1.1', { bitti: true, basladi: true }))).toBe('bitti');
    expect(adimDurumu(is('1.1', { basladi: true, kilitli: true }))).toBe('suruyor');
    expect(adimDurumu(is('1.1', { kilitli: true }))).toBe('kilitli');
    expect(adimDurumu(is('1.1'))).toBe('bekliyor');
    expect(adimDurumu(undefined)).toBeNull();
  });
  it('duruşta duruş; süren iş varsa çalışıyor; yoksa boşta; başka tezgâhın ya da biten işi sayılmaz', () => {
    const l = [is('1.1', { m: 'T2', basladi: true }), is('2.1', { m: 'T1', basladi: true, bitti: true }), is('3.1', { m: 'T1' })];
    expect(suAn(l, 'T1', true)).toBe('durus');
    expect(suAn(l, 'T1', false)).toBe('bosta');
    expect(suAn(l, 'T2', false)).toBe('calisiyor');
  });
  it('tarih ve saat tek parça', () => { expect(tarihSaat(() => '23.11 Pzt 08:30', 0)).toBe('23.11 08:30'); });
});

describe('tablo: plan sırası (gantt dilim 1, T2)', () => {
  it('ilk planlı adımın başlangıcına göre; eşitlikte girdi sırası; planda adımı olmayan en altta', () => {
    const l = [emir('a'), emir('b'), emir('c'), emir('d'), emir('e')];
    const isler: Record<string, KokpitIsi> = {
      'a.1': is('a.1', { S: 30 }), 'a.2': is('a.2', { S: 40 }),
      'b.2': is('b.2', { S: 10 }),
      'c.1': is('c.1', { S: 30 }),
      'e.1': is('e.1', { S: 5 }),
    };
    expect(siralaPlan(l, isler).map((e) => e.id)).toEqual(['e', 'b', 'a', 'c', 'd']);
    expect(l.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('tablo: Sıkı satırda kısa fark', () => {
  it('yalnız en büyük birim kalır; tek birim ve tam zamanında aynı kalır', () => {
    expect(farkKisaParcalari('4 gün 17 sa 30 dk geç')).toEqual(['4 gün', 'geç']);
    expect(farkKisaParcalari('2 sa 15 dk erken')).toEqual(['2 sa', 'erken']);
    expect(farkKisaParcalari('45 dk geç')).toEqual(['45 dk', 'geç']);
    expect(farkKisaParcalari('tam zamanında')).toEqual(['tam zamanında']);
  });
});

describe('tablo: ölçülen sütun enleri (3570)', () => {
  const l = [{ id: 'emir' }, { id: 'urun' }, { id: 'termin' }, { id: 'fark' }];
  const olcum = { en: { emir: 130.2, urun: 400, termin: 96, fark: 200 }, baslik: { emir: 40, urun: 38, termin: 60, fark: 36 }, fark: 120 };
  it('sütun içerik enindedir; Emir ve Ürün tavanda kalır, tarih sabit, Ürün iki satıra (enin yüzde altmışı, en az başlığın iki katı), Fark iki satıra kadar kısalır', () => {
    expect(olcuSablonu(l, olcum)).toEqual({ sablon: 'minmax(130px, 131px) minmax(144px, 240fr) 96px minmax(120px, 200px)', dogal: 131 + 240 + 96 + 200 });
  });
  it('Emir tam numarayı taşıyacak kadar açılır (tavan 360), ötesinde kısalır', () => {
    expect(olcuSablonu([{ id: 'emir' }], { en: { emir: 330 }, baslik: { emir: 40 }, fark: null })?.sablon).toBe('minmax(130px, 330px)');
    expect(olcuSablonu([{ id: 'emir' }], { en: { emir: 500 }, baslik: { emir: 40 }, fark: null })?.sablon).toBe('minmax(130px, 360px)');
  });
  it('kısa adda Ürün en az başlığın iki katıdır', () => {
    expect(olcuSablonu([{ id: 'urun' }], { en: { urun: 100 }, baslik: { urun: 60 }, fark: null })?.sablon).toBe('minmax(100px, 100fr)');
    expect(olcuSablonu([{ id: 'urun' }], { en: { urun: 300 }, baslik: { urun: 60 }, fark: null })?.sablon).toBe('minmax(144px, 240fr)');
  });
  it('ölçüm yoksa ya da bir sütun ölçülmediyse (test ortamı, ilk kare) sabit ağırlıklara düşülür', () => {
    expect(olcuSablonu(l, null)).toBeNull();
    expect(olcuSablonu(l, { ...olcum, en: { ...olcum.en, termin: 0 } })).toBeNull();
  });
  it('yeni satırların ölçüsü öncekiyle birleşir: sütun yalnız genişler', () => {
    expect(olcumBirlestir({ en: { emir: 100, urun: 200 }, baslik: { emir: 40 }, fark: null }, { en: { emir: 120, urun: 150 }, baslik: { emir: 40 }, fark: 90 }))
      .toEqual({ en: { emir: 120, urun: 200 }, baslik: { emir: 40 }, fark: 90 });
  });
  it('fark rozetinin en dar hali: yan yana en geniş iki parça ve kenar payı; tek parçada parçanın kendisi', () => {
    expect(farkEnAz([40, 36, 36, 40], 6, 34)).toBe(40 + 6 + 36 + 34);
    expect(farkEnAz([90], 6, 34)).toBe(124);
    expect(farkEnAz([], 6, 34)).toBe(34);
  });
});

describe('ölçülecek satırların seçimi (3570)', () => {
  // Her sütunda yazısı en uzun görünen satırlar seçilir; ölçüm yalnız onları dizer.
  const satir = (h: Record<string, string>): HTMLElement => {
    const s = document.createElement('div'), b = document.createElement('div'), z = document.createElement('div');
    s.className = 'tc-pyq-satir'; b.className = 'tc-pyq-bas'; z.className = 'tc-pyq-tablo-satir';
    for (const [id, t] of Object.entries(h)) { const c = document.createElement('div'); c.className = 'tc-pyq-h'; c.dataset['sutun'] = id; c.innerHTML = `<span>${t}</span>`; z.appendChild(c); }
    b.appendChild(z); s.appendChild(b);
    return s;
  };
  it('sütun başına en uzun yazılı satırları seçer, sırayı korur', () => {
    const l = Array.from({ length: 10 }, (_, i) => satir({ emir: `ORN-${'9'.repeat(i === 7 ? 9 : 2)}`, urun: i === 2 ? 'ORN uzun ürün adı' : 'ORN Mil' }));
    const a = olcuAdaylari(l, 1);
    expect(a).toEqual([l[2], l[7]]);
  });
  it('az satırda hepsini döndürür', () => {
    const l = [satir({ emir: 'ORN-1' }), satir({ emir: 'ORN-22' })];
    expect(olcuAdaylari(l, 3)).toEqual(l);
  });
});
