import { describe, expect, it } from 'vitest';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { engelOzeti, engeller } from './engeller.ts';
import { modelKur } from './kurallar.ts';

// Örnek çalışma uydurmadır: ORN-2'nin dört adımı var (10, 20, 30 fason, 40); planın tek uyarısı "Vardiyası olan ayarcı yok".
type Ops = Record<string, Record<string, unknown>>;
function kur(degistir: (plan: { ops: Ops; fail: string[]; failNeden: Record<string, unknown>; warn: unknown[] }, D: { siparisler: Record<string, unknown>[] }) => void) {
  const c0 = ornekCalisma();
  const c = structuredClone(c0);
  const plan = c.plan as unknown as { ops: Ops; fail: string[]; failNeden: Record<string, unknown>; warn: unknown[] };
  plan.failNeden = {};
  degistir(plan, c.D as unknown as { siparisler: Record<string, unknown>[] });
  const p = planOku(c), cx = derle(girdiKur(c, plandanBitenler(c, p)));
  const m = modelKur(c, p, cx, (id) => `ORN-${id}`);
  return { p, m, cx };
}
const zaman = (t: number) => `t${String(t)}`;

describe('Engeller (3457-1 A)', () => {
  it('zincirleme düşen adımlar kök adımın satırında sayılır; satır ne oldu, neden, ne yapmalı ve düzeltme yerini yazar', () => {
    const { p, m, cx } = kur((plan) => {
      for (const id of ['2.20', '2.30', '2.40']) delete plan.ops[id];
      plan.fail = ['2.20', '2.30', '2.40'];
      plan.failNeden = {
        '2.20': { kod: 'zaman', tani: { alt: 'sure', m: '3', ad: 'ORN-Freze', gerek: 1170, mevcut: 640, ufukGun: 120 } },
        '2.30': { kod: 'oncul', oncul: '2.20' }, '2.40': { kod: 'oncul', oncul: '2.30' },
      };
    });
    const g = engeller(p, m, cx, 1e9, zaman);
    const sure = g.find((x) => x.tur === 'sure');
    expect(sure?.engeller).toHaveLength(1);
    expect(sure?.engeller[0]).toMatchObject({
      emir: '2', baslik: 'ORN-2 · ORNEK Flanş · 50 adet · 1. Freze (CNC)',
      neOldu: 'Adım plana girmedi; sonraki 2 adım bunu bekliyor.',
      neden: 'İş 1.170 sa sürüyor, ORN-Freze tezgâhı 120 günlük planlama süresi içinde yalnız 640 sa çalışıyor.',
      neYapmali: 'Çevrim süresini kontrol edin, başka tezgâh ekleyin ya da vardiyayı artırın.',
    });
    expect(sure?.engeller[0]?.duzelt.map((d) => d.baslik)).toEqual(['Süreleri aç', 'Vardiya takvimini aç']);
    expect(g.map((x) => x.tur)).toEqual(['sure', 'uyari']);
    expect(engelOzeti(p, g)).toEqual({ toplam: 2, metin: '1 engel, toplam 3 adım plana girmedi, 1 uyarı' });
  });

  it('uyarının başındaki iç kimlik atılır; "planlanamadı" uyarısı yerleşmeyen satırının kopyası olduğu için yazılmaz', () => {
    const { p, m, cx } = kur((plan) => {
      plan.warn = [{ t: 'malzeme', j: '2', txt: '2: malzeme eksik (stok ve sipariş yetmiyor)' }, { t: 'plan', j: '2', txt: '2.20 planlanamadı: x' },
        { t: 'kilit', j: '2', txt: '2.40: kilitli iş 21.10 08:00 başlıyor, öncülü 2.30 o saatte bitmiyor' },
        { t: 'cakisma', j: '2', id: '2.40', txt: '2.40: 21.10 08:00 başlıyor; ORN-T1 tezgâhındaki 2.30 21.10 10:00 bitiyor, iki iş üst üste geliyor' }];
    });
    const u = engeller(p, m, cx, 1e9, zaman).find((x) => x.tur === 'uyari')?.engeller ?? [];
    expect(u.map((e) => [e.baslik, e.neOldu, e.neYapmali, e.duzelt.map((d) => d.baslik)])).toEqual([
      ['ORN-2 · ORNEK Flanş · 50 adet', 'Malzeme eksik (stok ve sipariş yetmiyor).', 'Stok ve satın alma durumunu kontrol edin.', ['Stoku aç']],
      ['ORN-2 · ORNEK Flanş · 50 adet', 'Kilitli iş 21.10 08:00 başlıyor, öncülü ORN-2 OP 30 o saatte bitmiyor.', 'Kilidi kaldırın ya da kilitli işi taşıyın.', []],
      ['ORN-2 · ORNEK Flanş · 50 adet', '21.10 08:00 başlıyor; ORN-T1 tezgâhındaki ORN-2 OP 30 21.10 10:00 bitiyor, iki iş üst üste geliyor.',
        'Kilitli işi taşıyın ya da kilidi kaldırın; iş başladıysa gerçekleşen kaydın saatlerini kontrol edin.', []],
    ]);
  });

  it('ufka taşan adım, plana hiç girmeyen sipariş, termini ufuk dışındaki emir ve adayı olmayan adım kendi grubundadır', () => {
    const { p, m, cx } = kur((plan, D) => {
      (plan.ops['3.10'] as Record<string, unknown>)['ufukDisi'] = 6;
      plan.warn = [];
      D.siparisler.push({ ad: 'ORN-Dolgu', id: '9', adet: 5, urun: '10', gelir: null, termin: null, cezaGun: null, malzeme: [], oncelik: 2, serbest: null });
      delete plan.ops['2.40']; plan.fail = ['2.40']; plan.failNeden = { '2.40': { kod: 'aday' } };
    });
    const g = engeller(p, m, cx, 1, zaman);
    expect(g.map((x) => x.tur)).toEqual(['aday', 'ufuk', 'siparis', 'termin']);
    const bul = (t: string) => g.find((x) => x.tur === t)?.engeller ?? [];
    expect(bul('ufuk')[0]?.neOldu).toBe('Adım planlama ufkundan sonra bitiyor; ufuk bu emir için uzadı, 6 sa ufuk sonrasında.');
    expect(bul('siparis')[0]).toMatchObject({ emir: null, baslik: 'ORN-Dolgu · 5 adet', neOldu: 'Sipariş plana girmedi.' });
    expect(bul('termin').map((e) => e.neden)).toContain('Termin planlama süresinin dışında; plan t1 tarihine kadar.');
    expect(bul('aday')[0]?.duzelt.map((d) => d.baslik)).toEqual(['Kaynakları aç']);
    expect(engelOzeti(p, g).metin).toMatch(/^1 engel, toplam 1 adım plana girmedi, 1 sipariş plana hiç girmedi, 1 adım planlama süresini aşıyor, \d+ emrin termini planlama süresinin dışında$/);
  });

  it('neden kaydı olmayan adım "nedeni ölçülemedi" grubundadır; plan yoksa engel yoktur', () => {
    const { p, m, cx } = kur((plan) => { delete plan.ops['2.40']; plan.fail = ['2.40']; plan.warn = []; });
    expect(engeller(p, m, cx, 1e9, zaman).map((x) => [x.tur, x.engeller[0]?.neden])).toEqual([['bilinmiyor', 'Nedeni ölçülemedi.']]);
    expect(engeller(null, m, cx, 1e9, zaman)).toEqual([]);
  });

  // Test T1: her alt neden kendi grubuna, kendi düzeltme yerleriyle düşer.
  it.each([
    ['sure', ['Süreleri aç', 'Vardiya takvimini aç']], ['dolu', ['Ek mesai aç']], ['vardiya', ['Vardiya takvimini aç']], ['kisi', ['Vardiya personelini aç']],
    ['ayarci', ['Vardiya personelini aç']], ['hazirlik', ['Süreleri aç']], ['malzeme', ['Stoku aç']], ['bilinmiyor', ['Planlanabilirliği aç']],
  ] as const)('%s tanısı kendi grubundadır', (alt, dugmeler) => {
    const { p, m, cx } = kur((plan) => {
      delete plan.ops['2.40']; plan.fail = ['2.40']; plan.warn = [];
      plan.failNeden = { '2.40': { kod: 'zaman', tani: { alt, m: '5', ad: 'ORN-Muayene', gerek: 10, mevcut: 2, ufukGun: 120 } } };
    });
    const g = engeller(p, m, cx, 1e9, zaman);
    expect(g.map((x) => x.tur)).toEqual([alt]);
    expect(g[0]?.engeller[0]?.duzelt.map((d) => d.baslik)).toEqual(dugmeler);
  });

  it('ufka taşan adımın ardılları onun satırında sayılır; plansız emir termin satırına girmez; ufuk uyarısı ayrı satır olmaz', () => {
    const { p, m, cx } = kur((plan) => {
      (plan.ops['2.20'] as Record<string, unknown>)['ufukDisi'] = 4;
      delete plan.ops['2.30']; delete plan.ops['2.40'];
      plan.fail = ['2.30', '2.40'];
      plan.failNeden = { '2.30': { kod: 'oncul', oncul: '2.20', ufukDisi: 1 }, '2.40': { kod: 'oncul', oncul: '2.30' } };
      plan.warn = [{ t: 'ufuk', j: '2', txt: '2: 2.20 planlama süresinin sonuna kadar yerleşti' }];
    });
    const g = engeller(p, m, cx, 1, zaman);
    expect(g.map((x) => x.tur)).toEqual(['ufuk', 'termin']);
    expect(g[0]?.engeller[0]?.neOldu).toBe('Adım planlama ufkundan sonra bitiyor; ufuk bu emir için uzadı, 4 sa ufuk sonrasında; sonraki 2 adım bunu bekliyor.');
    expect(g[1]?.engeller.map((e) => e.emir)).not.toContain('2');
  });
});
