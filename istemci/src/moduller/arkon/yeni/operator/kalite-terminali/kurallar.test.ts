import { describe, expect, it } from 'vitest';
import type { FormKaydi, GirisBekleyeni, IlkParcaBekleyeni } from '../../../../kalite-merkezi/disari.ts';
import { bosGerekce, gerekceNotu } from './KararGerekcesi.tsx';
import { acilacakTur, gkkBekliyor, gkkEksigi, kararSecenekleri, kuyrukOgeleri, kuyrukToplami, miktarMetni, taslakIcerigi, tusaBas, type KuyrukGirdisi } from './kurallar.ts';

// 2196: kalite terminalinin saf kuralları. Değerler uydurmadır.
const ilk: IlkParcaBekleyeni = { uretimEmriId: 3, isEmriId: 11, emirNo: 'E-1', parcaNo: 'P-1', parcaAd: 'Deneme', opNo: 20, adet: 5, kararBekleyenAdet: 1 };
const giris = (durum: GirisBekleyeni['durum']) => ({ malKabulSatirId: 9, malKabulNo: 'MK-1', miktar: '10.000', durum } as unknown as GirisBekleyeni);
const girdi = (g: Partial<KuyrukGirdisi> = {}): KuyrukGirdisi => ({ ilkParca: [], hatali: [], giris: [], formOnayi: [], ...g });

describe('karar kuyruğu', () => {
  it('boş tür açılmaz, sıradaki dolu tür açılır; toplam dört listenin toplamıdır', () => {
    const g = girdi({ giris: [giris('karar_bekliyor')], formOnayi: [{ _id: 'f1' } as FormKaydi] });
    expect(acilacakTur(g, 'ilk')).toBe('giris');
    expect(acilacakTur(g, 'form')).toBe('form');
    expect(kuyrukToplami(g)).toBe(2);
    expect(kuyrukOgeleri(girdi({ ilkParca: [ilk] }), 'ilk')[0]).toMatchObject({ tur: 'ilk', anahtar: '3:11' });
  });

  it('geri alınmaz kararlar basılı tutulur; hatalı ve giriş kararı gerekçe adımı açar', () => {
    const [onay, ret] = kararSecenekleri({ tur: 'ilk', anahtar: 'a', kayit: ilk });
    expect(onay).toMatchObject({ deger: 'onay', tehlikeli: false, gerekce: false });
    expect(ret).toMatchObject({ deger: 'ret', tehlikeli: true });
    const g = kararSecenekleri({ tur: 'giris', anahtar: 'g', kayit: giris('karar_bekliyor') });
    expect(g.map((s) => s.deger)).toEqual(['kabul', 'sartli_kabul', 'red']);
    expect(g.every((s) => s.gerekce)).toBe(true);
    expect(g.filter((s) => s.tehlikeli).map((s) => s.deger)).toEqual(['sartli_kabul', 'red']);
  });

  it('GKK bekleyen giriş önce miktar ister', () => {
    expect(gkkBekliyor({ tur: 'giris', anahtar: 'g', kayit: giris('gkk_bekliyor') })).toBe(true);
    expect(gkkBekliyor({ tur: 'giris', anahtar: 'g', kayit: giris('karar_bekliyor') })).toBe(false);
  });

  it('gerekçe notu kusur, hazır cümle ve yazılanı birleştirir; 500 karakteri geçmez', () => {
    expect(gerekceNotu({ ...bosGerekce(), kusur: 'Çapak', hazir: 'Müşteri sapma izniyle', serbest: '  ek  ' })).toBe('Çapak · Müşteri sapma izniyle · ek');
    expect(gerekceNotu(bosGerekce())).toBe('');
    expect(gerekceNotu({ ...bosGerekce(), serbest: 'x'.repeat(600) })).toHaveLength(500);
  });
});

describe('ondalık tuşlar ve GKK miktarı', () => {
  it('tek virgül, baştaki sıfır silinir, sil son karakteri alır', () => {
    expect(tusaBas('0', '5')).toBe('5');
    expect(tusaBas('', ',')).toBe('0,');
    expect(tusaBas('1,5', ',')).toBe('1,5');
    expect(tusaBas('12', 'sil')).toBe('1');
    expect(tusaBas('123456789012', '3')).toBe('123456789012');
    expect(miktarMetni('2,5')).toBe('2.5');
  });

  it('kabul ve hatalı toplamı gelen miktara eşit olmalı', () => {
    expect(gkkEksigi('10.000', '8', '2')).toBeNull();
    expect(gkkEksigi('10.5', '10', '0,5')).toBeNull();
    expect(gkkEksigi('10.000', '8', '1')).toMatch(/eşit/);
    expect(gkkEksigi('10', '', '0')).toMatch(/girin/);
    expect(gkkEksigi('10', '1,2345', '0')).toMatch(/üç ondalık/);
  });
});

describe('form taslağı', () => {
  it('Kalite Merkezi\'nde başlanan taslak aynı anahtarlarla açılır; bozuk alan atılır', () => {
    const k = { _id: 'f1', veri: { '0_0': '4,2' }, liste: { '0_0': 'Hayır', x: 3 }, listeNot: { '0_0': 'Çapak var' }, tablo: { 1: [{ c0: 'Ø25' }], 2: 'bozuk' } } as unknown as FormKaydi;
    expect(taslakIcerigi(k)).toEqual({ veri: { '0_0': '4,2' }, liste: { '0_0': 'Hayır' }, listeNot: { '0_0': 'Çapak var' }, tablo: { 1: [{ c0: 'Ø25' }] } });
    expect(taslakIcerigi({ _id: 'f2' })).toEqual({ veri: {}, liste: {}, listeNot: {}, tablo: {} });
  });
});
