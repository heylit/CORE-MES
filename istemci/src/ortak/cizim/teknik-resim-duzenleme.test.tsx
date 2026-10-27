import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { BildirimSaglayici } from '../arayuz/index.ts';
import { AKTol } from './cekirdek.ts';
import {
  balonCikar, balonCogalt, balonlariCikar, enYakinYazi, gdtdenCevir, gdtYazimi, gdtYazimiMetni, gdtyeCevir, gecmisGeri, gecmisIleri, gecmisKaydet,
  noktaAlanlari, numaraDegistir, numaralariUygula, numaraSirasi, olcuTuru, olcuTuruSec, olcuYazimi, olcuYazimiMetni, tolKipiSec,
  type Balon, type Gecmis, type Olcum, type OlcuYazimi,
} from './kurallar.ts';
import { TeknikResim, type TeknikResimKontrolu } from './TeknikResim.tsx';
import type { YaziKutusu } from './okuma.ts';

// Elle balonlama ve düzenleme (967 a) kuralları. Balonlar ve yazılar uydurmadır.
const balon = (id: number, x: number, y: number, ek: Partial<Balon> = {}): Balon => ({ id, x, y, nom: String(id * 10), min: 0, max: 1, ...ek });
const nolar = (l: readonly Balon[]) => l.map((b) => b.id + ':' + b.nom).join(' ');
const yazim = (s: string): OlcuYazimi => { const y = olcuYazimi(s); if (!y) throw new Error(s + ' ayrışmadı'); return y; };

describe('numara değiştirme', () => {
  const l = [balon(1, 0, 0), balon(2, 0, 0), balon(3, 0, 0), balon(4, 0, 0)];
  it('yer değiştir iki balonun numarasını takas eder', () => {
    expect(nolar(numaraDegistir(l, 1, 3, 'degis'))).toBe('1:30 2:20 3:10 4:40');
  });
  it('araya al: öne alınan balonun ardındakiler birer kayar, geriye alınca öndekiler birer geri gelir', () => {
    expect(nolar(numaraDegistir(l, 4, 2, 'araya'))).toBe('1:10 2:40 3:20 4:30');
    expect(nolar(numaraDegistir(l, 1, 3, 'araya'))).toBe('1:20 2:30 3:10 4:40');
  });
  it('son numaradan büyük hedef sona alınır; geçersiz hedef bir şey değiştirmez', () => {
    expect(nolar(numaraDegistir(l, 2, 99, 'araya'))).toBe('1:10 2:30 3:40 4:20');
    expect(nolar(numaraDegistir(l, 2, 0, 'araya'))).toBe(nolar(l));
    expect(nolar(numaraDegistir(l, 7, 1, 'degis'))).toBe(nolar(l));
  });
});

describe('yeniden numaralama', () => {
  const W = 1000, H = 1000;
  const l = [balon(1, 800, 100), balon(2, 100, 900), balon(3, 100, 100), balon(4, 900, 900, { crit: true }), balon(5, 500, 500, { nom: '⌖ Ø0.1' })];
  it('okuma sırası: aynı satır bandında soldan sağa, sonra aşağı', () => {
    expect(numaraSirasi(l, 'okuma', W, H)).toEqual({ 3: 1, 1: 2, 5: 3, 2: 4, 4: 5 });
  });
  it('saat yönü saat 12den başlar: sağ üst, sağ alt, sol alt, sol üst', () => {
    const s = numaraSirasi(l, 'saat', W, H);
    expect(s[1]! < s[4]! && s[4]! < s[2]! && s[2]! < s[3]!).toBe(true);
  });
  it('türe göre: GD&T, sonra kritik, sonra eski sıra', () => {
    expect(numaraSirasi(l, 'tur', W, H)).toEqual({ 5: 1, 4: 2, 1: 3, 2: 4, 3: 5 });
  });
  it('uygulanan sıra balonları numaraya göre dizer; yazı kutusu varsa yazının yeri sayılır', () => {
    const ar: YaziKutusu = [50, 50, 10, 5, 0];
    const m = [balon(1, 900, 900, { ar }), balon(2, 10, 900)];
    expect(nolar(numaralariUygula(m, numaraSirasi(m, 'okuma', W, H)))).toBe('1:10 2:20');
    expect(nolar(numaralariUygula(l, { 1: 2, 2: 1 }))).toBe('1:20 2:10 3:30 4:40 5:⌖ Ø0.1');
  });
});

describe('silme, çoğaltma, kılavuz', () => {
  it('çoklu silmede kalanlar 1den numaralanır ve ölçümler yeni numarasıyla kalır; tek silme aynı sonucu verir', () => {
    const l = [balon(1, 0, 0), balon(2, 0, 0), balon(3, 0, 0), balon(4, 0, 0)];
    const r = balonlariCikar(l, { 2: 'b', 4: 'd' }, [1, 3]);
    expect([nolar(r.bal), r.olcum]).toEqual(['1:20 2:40', { 1: 'b', 2: 'd' }]);
    expect(balonCikar(l, { 4: 'd' }, 2)).toEqual(balonlariCikar(l, { 4: 'd' }, [2]));
  });
  it('çoğaltılan balon sona eklenir, yeri sabittir, alanları korunur', () => {
    const c = balonCogalt([balon(1, 0, 0, { tool: 'Mikrometre', crit: true, yerKipi: 'serit' }), balon(2, 0, 0)], 1, [40, 20]);
    expect(c[2]).toMatchObject({ id: 3, tool: 'Mikrometre', crit: true, yer: [40, 20], yerKipi: null });
  });
  it('kılavuz ucu eşik içindeki en yakın yazıya bağlanır', () => {
    const yazilar = [{ raw: 'Ø40 H7', ar: [100, 100, 20, 6, 0] as YaziKutusu }, { raw: '18 ±0.05', ar: [300, 100, 20, 6, 0] as YaziKutusu }];
    expect(enYakinYazi(yazilar, 290, 108, 20)?.raw).toBe('18 ±0.05');
    expect(enYakinYazi(yazilar, 200, 300, 20)).toBeNull();
  });
});

describe('ölçü yazımı ve form', () => {
  it('yazım parçalanır ve aynı metne döner', () => {
    for (const s of ['Ø40 H7', '18 ±0.05', 'Ø18 +0.15/0', '4× Ø8.5 THRU', 'M10x1.5-6H', 'R6', '30°', 'C1', '64']) expect(olcuYazimiMetni(yazim(s))).toBe(s);
    expect(yazim('Ø18 +0.15 -0.05')).toMatchObject({ kip: 'sapma', ust: '+0.15', alt: '-0.05' });
    expect(yazim('4× Ø8.5 THRU')).toMatchObject({ adet: '4× ', on: 'Ø', sayi: '8.5', kip: 'genel', kalan: 'THRU' });
  });
  it('tolerans kipi değişince boş alan alışılmış değerle dolar ve sınırlar okuyucudan gelir', () => {
    const y = yazim('Ø25');
    expect(olcuYazimiMetni(tolKipiSec(y, 'uyum'))).toBe('Ø25 H7');
    expect(olcuYazimiMetni(tolKipiSec(y, 'sim'))).toBe('Ø25 ±0.1');
    expect(olcuYazimiMetni(tolKipiSec(yazim('25'), 'uyum'))).toBe('25 h7');
    const sapma = olcuYazimiMetni({ ...tolKipiSec(y, 'sapma'), ust: '0.021', alt: '0' });
    expect(sapma).toBe('Ø25 +0.021/0');
    const p = AKTol.parse(sapma, { cls: 'm' });
    expect([p?.min, p?.max]).toEqual([25, 25.021]);
    expect(olcuYazimiMetni(tolKipiSec(yazim('Ø25 ±0.05'), 'genel'))).toBe('Ø25');
  });
  it('işaretsiz alt sapma eksi sayılır', () => {
    expect(olcuYazimiMetni({ ...yazim('18'), kip: 'sapma', ust: '0.1', alt: '0.05' })).toBe('18 +0.1/-0.05');
  });
  it('tür çipi öneki ve açı işaretini değiştirir; dişte uyum kalkar', () => {
    const y = yazim('40 H7');
    expect(olcuYazimiMetni(olcuTuruSec(y, 'Ø'))).toBe('Ø40 H7');
    expect(olcuTuru(olcuTuruSec(y, '°'))).toBe('°');
    expect(olcuYazimiMetni(olcuTuruSec(y, '°'))).toBe('40°');
    expect(olcuYazimiMetni(olcuTuruSec(yazim('Ø10 H7'), 'M'))).toBe('M10');
  });
  it('GD&T yazımı sembol, çap bölgesi ve referansla kurulur ve okuyucu okur', () => {
    const g = gdtYazimi('⌖ Ø0.1 Ⓜ A B');
    expect(g).toEqual({ sembol: '⌖', cap: true, deger: '0.1', kalan: 'Ⓜ A B' });
    const t = gdtYazimiMetni({ ...g!, sembol: '⟂', cap: false, deger: '0.05', kalan: 'A' });
    expect(t).toBe('⟂ 0.05 A');
    expect(AKTol.parse(t, { cls: 'm' })).toMatchObject({ kind: 'gdt', max: 0.05, gdtName: 'Diklik' });
    expect(gdtYazimi('Ø40')).toBeNull();
    expect(gdtyeCevir('Ø40 ±0.05')).toBe('⌖ Ø0.1');
    expect(gdtdenCevir('⌖ Ø0.1 A')).toBe('Ø0.1');
  });
  it('formun yazımı noktaya ayrışır; tablo dışı uyum işaretlenir', () => {
    expect(noktaAlanlari('Ø25 H7', '', 'm')).toMatchObject({ min: 25, max: 25.021 });
    expect(AKTol.parse('Ø25 Z7', { cls: 'm' })?.unknownFit).toBe(true);
  });
});

describe('geri al ve yinele', () => {
  it('kaydedilen durum geri alınır, yinelenir; yeni düzenleme ileri yığınını siler', () => {
    let g: Gecmis<string> = { geri: [], ileri: [] };
    g = gecmisKaydet(g, 'a'); g = gecmisKaydet(g, 'b');
    const r1 = gecmisGeri(g, 'c')!;
    expect(r1.durum).toBe('b');
    const r2 = gecmisIleri(r1.gecmis, r1.durum)!;
    expect(r2.durum).toBe('c');
    expect(gecmisKaydet(r1.gecmis, 'b').ileri).toEqual([]);
    expect(gecmisGeri({ geri: [], ileri: [] }, 'x')).toBeNull();
  });
  it('geçmiş sınırı aşılınca en eski düşer', () => {
    let g: Gecmis<number> = { geri: [], ileri: [] };
    for (let i = 0; i < 5; i++) g = gecmisKaydet(g, i, 3);
    expect(g.geri).toEqual([2, 3, 4]);
  });
});

// Ekran: dosyasız görüntüleyicide balonlar ve düzenleme formu (resim yok, ana resim yok sayılır).
function Deneme({ ilk, son }: { ilk: Balon[]; son: { bal: Balon[] } }) {
  const [bal, setBal] = useState(ilk), [meas, setMeas] = useState<Record<number, Olcum>>({});
  son.bal = bal;
  const k: TeknikResimKontrolu = { anahtar: 'd', dosyalar: [], anaResim: undefined as unknown as null, balonlar: bal, balonlarYaz: setBal, olcumler: meas, olcumlerYaz: setMeas };
  return <BildirimSaglayici><TeknikResim kontrol={k} /></BildirimSaglayici>;
}
const kur = () => {
  const son = { bal: [] as Balon[] };
  const ilk = [1, 2, 3].map((i) => balon(i, i * 100, 100, { nom: 'Ø' + (20 + i), tol: '±0.2 (ISO 2768-m)', min: 19.8 + i, max: 20.2 + i, tool: 'Kumpas', l: 'Çap' }));
  render(<Deneme ilk={ilk} son={son} />);
  return son;
};
const ac = (no: number) => { fireEvent.click(screen.getByRole('button', { name: new RegExp('^Kontrol ' + no + ' ') }), { detail: 2 }); };

describe('düzenleme ekranı', () => {
  it('çift tıkla form açılır; uyum çipi toleransı yazar, sınırlar okuyucudan gelir, kayıt balona geçer', () => {
    const son = kur();
    ac(2);
    fireEvent.click(screen.getByRole('button', { name: 'Uyum' }));
    expect((screen.getByLabelText('Ölçü (resimde yazdığı gibi)') as HTMLInputElement).value).toBe('Ø22 H7');
    expect(screen.getByText('22 – 22.021')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kritik' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(son.bal[1]).toMatchObject({ id: 2, nom: 'Ø22 H7', max: 22.021, crit: true });
  });
  it('başka balondaki numara seçilince yer değiştir ya da araya al sorulur', () => {
    const son = kur();
    ac(3);
    fireEvent.change(screen.getByLabelText('Numara'), { target: { value: '1' } });
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Araya al/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(son.bal.map((b) => b.id + ':' + b.nom).join(' ')).toBe('1:Ø23 2:Ø21 3:Ø22');
  });
  it('Del seçili balonu siler, Ctrl+Z geri getirir', () => {
    const son = kur();
    fireEvent.click(screen.getByRole('button', { name: /^Kontrol 2 / }));
    const sahne = document.querySelector('.tc-ay5-sahne') as HTMLElement;
    act(() => { fireEvent.keyDown(sahne, { key: 'Delete' }); });
    expect(son.bal.map((b) => b.nom)).toEqual(['Ø21', 'Ø23']);
    act(() => { fireEvent.keyDown(sahne, { key: 'z', ctrlKey: true }); });
    expect(son.bal.map((b) => b.nom)).toEqual(['Ø21', 'Ø22', 'Ø23']);
  });
});
