import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { HaritaOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { ac, json, sunucuKur } from './test-ortak.tsx';

// 3165 a: stok tanım yazımı dört eyleme bölündü. Hepsini birden taşıyan kişide eylemler yer değiştirse fark edilmez; burada her
// kişi tek eylem taşır ve her düğme yalnız kendi eyleminde görünür. Haritadan eşleme konum, raf ya da depo haritası eylemiyle açılır.
const tek = (islem: Islem): Kullanici => ({ id: 9, ad: 'Deneme Tek Eylem', islemler: ['sayfa.stok', islem] });
const EYLEMLER = ['stok.konum-yaz', 'stok.raf-yaz', 'stok.harita-yaz', 'stok.malzeme-ayari'] as const;
const bosListe = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
const ozet: HaritaOzetiCevabi = {
  bolum: 1, goz: 6, alan: 1, eslenmemis: 0, deposuzYer: 4, bagsizKonumlar: [],
  bolumler: [{ salonId: 1, kod: 'ANA', gozSayisi: 6, depoKod: 'ANA' }, { salonId: 2, kod: 'DENEME-AT1', gozSayisi: 4, depoKod: null }],
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('stok tanım eylemleri ekranda (3165 a)', () => {
  it.each(EYLEMLER)('Konumlar: %s taşıyan yalnız kendi düğmesini görür', async (eylem) => {
    sunucuKur(tek(eylem), { 'GET /stok/konumlar': () => json(200, bosListe) });
    ac('/stok/konumlar');
    await screen.findByRole('heading', { name: 'Konumlar' });
    const gorunur = (ad: string): boolean => screen.queryByRole('button', { name: ad }) !== null;
    if (eylem !== 'stok.malzeme-ayari') expect(await screen.findByRole('button', { name: 'Haritadan eşle' })).toBeTruthy();
    else {
      await new Promise((r) => setTimeout(r, 50));
      expect(gorunur('Haritadan eşle')).toBe(false);
    }
    expect(gorunur('Konum aç')).toBe(eylem === 'stok.konum-yaz');
  });

  it.each(EYLEMLER)('Raflar: %s taşıyanda raf açma bağı yalnız raf eylemiyle görünür', async (eylem) => {
    sunucuKur(tek(eylem), { 'GET /stok/raflar': () => json(200, { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 200 }) });
    ac('/stok/raflar');
    await screen.findByRole('heading', { name: 'Raflar' });
    if (eylem === 'stok.raf-yaz') expect(await screen.findByText('Raf aç (Fabrika Haritası)')).toBeTruthy();
    else {
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByText('Raf aç (Fabrika Haritası)')).toBeNull();
    }
  });

  it.each(EYLEMLER)('Ayarlar: %s taşıyanda "Bütün bölümleri depo yap" yalnız depo haritası eylemiyle görünür', async (eylem) => {
    sunucuKur(tek(eylem), { 'GET /stok/harita-ozeti': () => json(200, ozet), 'GET /stok/depolar': () => json(200, { depolar: [] }) });
    ac('/stok/ayarlar');
    expect(await screen.findByText(/Depo olmayan bölümlerde 4 yer/)).toBeTruthy();
    if (eylem === 'stok.harita-yaz') expect(await screen.findByRole('button', { name: /Bütün bölümleri depo yap/ })).toBeTruthy();
    else {
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByRole('button', { name: /Bütün bölümleri depo yap/ })).toBeNull();
    }
  });
});

// Aşağıdaki her satır tek bir düğmeyi (ya da tek bir çağrıyı) tek eylemli dört kişiyle ölçer: baktığı eylem başka eylemle değişirse kırılır.
const bekle = () => new Promise((r) => setTimeout(r, 50));
const esleyen = (e: Islem): boolean => e !== 'stok.malzeme-ayari';
const konumCevabi = {
  konum: { id: 41, kod: 'FSN-02', tur: 'fason', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 5 },
  raf: null, bakiyeler: [], haritaYeri: null, zemin: null,
};
const malzemeCevabi = {
  satir: { malzemeId: 901, ad: 'Deneme sac', stokKodu: 'HM-001', tur: 'hammadde', birim: 'kg', toplam: '3', serbest: '3', statude: '0', rezerve: '0', kritikSeviye: null, durum: 'tanimsiz', konumSayisi: 0, konumlar: [], kategoriAdi: null, kartDurumu: null, varsayilanKonum: null, sonHareket: null },
  bakiyeler: [], ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [], statuKirilimi: [], tanimliStatuler: [], rezerveler: [], bekleyenler: [],
};
const raf = { id: 1, depoId: 1, kod: 'A', tur: 'palet', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 2, katSayisi: 2, bolmeGenislikM: '2.70', derinlikM: '1.10', katAraligiM: '1.50', aktif: true, doluGoz: 0, toplamGoz: 4, surum: 1 };
const goz = (konumId: number, bolmeNo: number, katNo: number) => ({ konumId, kod: `A-0${bolmeNo}-0${katNo}`, bolmeNo, katNo, aktif: true, satirSayisi: 0, ilkMalzemeAd: null, ilkMiktar: null, sonSayim: null, ambalajlar: [] });
const yerlesim = {
  depo: { id: 1, kod: 'ANA', ad: 'Ana depo' },
  yerlesim: { bina: { x0: -10, x1: 30, z0: -30, z1: 10 }, kabul: { x: 10, z: 5, genislik: 12, derinlik: 5 }, kareBoyu: 5, sayimSuresiGun: 30, fason: { x: -8, z: 0, aci: 0 }, surum: 3 },
  raflar: [{ id: 1, surum: 2, kod: 'A', tur: 'palet', numaralama: 'sirali', ilkBolme: 1, bolmeSayisi: 4, katSayisi: 3, bolmeGenislikM: 2.7, derinlikM: 1.1, katAraligiM: 1.5, xM: 2, zM: 0, aci: 0, onYuzTers: false, doluBolmeler: [1, 0, 0, 0], stokluGoz: 1 }],
};
const harRaf = (id: number, kod: string) => ({ id, kod, ad: `${kod} rafı`, tur: 'palet', bolmeSayisi: 2, katSayisi: 2, gozSayisi: 1, bolmeGenisligi: '2.70', derinlik: '1.10', yukseklik: '4.00', x: '5.00', z: '5.00', donus: '0.0', aktif: true, genislik: '5.40', hucre: 'A1', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null });
const harBolum = (id: number, kod: string) => ({
  salon: { id, kod, ad: `${kod} bölümü`, genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 1, fabrika: { x: '0.00', z: '0.00', donus: '0.0' }, giris: null, kaydeden: null, kaydedildi: null, sutunlar: ['A'], satirlar: ['1'] },
  istasyonYerleri: [], makineYerleri: [], raflar: [harRaf(id * 10, `R${id}`)], alanlar: [], duvarlar: [], gecisler: [],
});
const depoYollari = (depo: boolean) => ({
  'GET /stok/harita-ozeti': () => json(200, { bolum: depo ? 1 : 0, goz: 0, alan: 0, eslenmemis: 0, bagsizKonumlar: [], bolumler: [{ salonId: 2, kod: 'DEP', gozSayisi: 4, depoKod: depo ? 'DEP' : null }] }),
  'GET /atolye/fabrika': () => json(200, { bolumler: [harBolum(2, 'DEP')] }),
  'GET /atolye/goz-kalemleri': () => json(200, { kalemler: [] }),
  'GET /atolye/kalem-gorunumleri': () => json(200, { kalemler: [] }),
  'GET /stok/raf-kodlama': () => json(200, { kodlama: 'bolme-kat-goz', gecis: { degisenSayisi: 2, stokluSayisi: 0, eskiKodluRaflar: [], atlanan: [], pasifStoklu: [], basildi: false } }),
});
const zemin = {
  bolumler: [{ salonId: 4, kod: 'ZM-1', ad: 'Zemin', surum: 6, depoKod: null, sutunlar: ['A', 'B', 'C'], satirlar: ['1', '2'], nesneler: [], konumlar: [] }],
  istasyonlar: [{ id: 5, kod: 'CNC-2', ad: 'Deneme freze', tip: 'talasli', salonId: null }],
};

describe('stok tanım eylemleri: her düğme kendi eylemine bakar (3165 a, Test 2 bulguları)', () => {
  it.each(EYLEMLER)('Konum ayrıntısı: %s taşıyanda Pasife al ve Türü değiştir yalnız konum eylemiyle', async (eylem) => {
    sunucuKur(tek(eylem), { 'GET /stok/konumlar/41': () => json(200, konumCevabi) });
    ac('/stok/konumlar/41');
    await screen.findByRole('heading', { name: 'FSN-02' });
    await bekle();
    expect(screen.queryByRole('button', { name: /Pasife al/ }) !== null).toBe(eylem === 'stok.konum-yaz');
    expect(screen.queryByRole('button', { name: /Türü değiştir/ }) !== null).toBe(eylem === 'stok.konum-yaz');
  });

  it.each(EYLEMLER)('Malzeme ayrıntısı: %s taşıyanda Stok ayarı yalnız malzeme ayarı eylemiyle', async (eylem) => {
    sunucuKur(tek(eylem), { 'GET /stok/malzemeler/901': () => json(200, malzemeCevabi) });
    ac('/stok/malzemeler/901');
    await screen.findByRole('heading', { name: /Deneme sac/ });
    await bekle();
    expect(screen.queryByRole('button', { name: 'Stok ayarı' }) !== null).toBe(eylem === 'stok.malzeme-ayari');
  });

  it.each(EYLEMLER)('Raf matrisi: %s taşıyanda "Haritada düzenle" yalnız raf eylemiyle', async (eylem) => {
    sunucuKur(tek(eylem), {
      'GET /stok/raflar': () => json(200, { satirlar: [raf], toplam: 1, sayfa: 1, sayfaBoyu: 200 }),
      'GET /stok/raflar/1': () => json(200, { raf, gozler: [goz(1, 1, 2), goz(2, 2, 2), goz(3, 1, 1), goz(4, 2, 1)] }),
    });
    ac('/stok/raflar/1');
    await screen.findByText('Kat 2');
    await bekle();
    expect(screen.queryByText('Haritada düzenle') !== null).toBe(eylem === 'stok.raf-yaz');
  });

  it.each(EYLEMLER)('Ayarlar: %s taşıyanda raf gözü kodu yalnız raf eylemiyle, bölümü depo yapma yalnız depo haritası eylemiyle açık', async (eylem) => {
    sunucuKur(tek(eylem), {
      'GET /stok/harita-ozeti': () => json(200, ozet), 'GET /stok/depolar': () => json(200, { depolar: [] }),
      'GET /stok/raf-kodlama': () => json(200, { kodlama: 'bolme-kat-goz', gecis: null }),
    });
    ac('/stok/ayarlar');
    const kutu = (await screen.findByRole('combobox', { name: 'Raf gözü kodu' })) as HTMLSelectElement;
    await screen.findByText('DENEME-AT1');
    await bekle();
    expect(kutu.disabled).toBe(eylem !== 'stok.raf-yaz');
    expect(screen.queryByRole('button', { name: 'Depo yap: DENEME-AT1' }) !== null).toBe(eylem === 'stok.harita-yaz');
  });

  it.each(EYLEMLER)('Depo yerleşimi: %s taşıyana yalnız depo haritası eylemiyle açılır', async (eylem) => {
    sunucuKur(tek(eylem), { 'GET /stok/yerlesim': () => json(200, yerlesim) });
    ac('/stok/yerlesim');
    if (eylem === 'stok.harita-yaz') expect(await screen.findByRole('button', { name: /A Palet · 4×3/ })).toBeTruthy();
    else expect(await screen.findByText(/raf tanımı yetkisi gerekiyor/)).toBeTruthy();
  });

  it.each(EYLEMLER)('Depo: %s taşıyanda kod geçişi uyarısı yalnız raf eylemiyle; tek eylemle gömülü panel yazmaz', async (eylem) => {
    sunucuKur({ ...tek(eylem), islemler: ['sayfa.stok', 'sayfa.atolye', eylem] }, depoYollari(true));
    ac('/stok/depo');
    await screen.findByRole('button', { name: /R2 R2 rafı/ });
    await bekle();
    expect(screen.queryByRole('button', { name: 'Basıldı' }) !== null).toBe(eylem === 'stok.raf-yaz');
    expect(screen.queryByRole('button', { name: 'Raf ekle ve düzenle' })).toBeNull();
  });

  it('Depo: gömülü panel raf VE depo haritası eylemi birlikteyse yazar', async () => {
    sunucuKur({ id: 9, ad: 'Deneme Tek Eylem', islemler: ['sayfa.stok', 'sayfa.atolye', 'stok.raf-yaz', 'stok.harita-yaz'] }, depoYollari(true));
    ac('/stok/depo');
    expect(await screen.findByRole('button', { name: 'Raf ekle ve düzenle' })).toBeTruthy();
  });

  it.each(EYLEMLER)('Depo: depo bölümü yokken %s taşıyanda "Ayarlar\'da bölümü depo yap" yalnız depo haritası eylemiyle', async (eylem) => {
    sunucuKur(tek(eylem), depoYollari(false));
    ac('/stok/depo');
    await screen.findByText(/stok deposu yapılmış bölüm yok/);
    await bekle();
    expect(screen.queryByRole('button', { name: "Ayarlar'da bölümü depo yap" }) !== null).toBe(eylem === 'stok.harita-yaz');
  });

  it.each(EYLEMLER)('Stok Merkezi: %s taşıyanda eşlenmemiş harita yeri yalnız eşleyebilene sorulur ve söylenir', async (eylem) => {
    const istekler = sunucuKur(tek(eylem), {
      'GET /stok/is-kutusu': () => json(200, { kabuldeBekleyen: 0, eksiBakiye: 0, kritik: 0, sayimBekleyen: null, logoFarki: 0, logoHatasi: 0, fasondaEksik: 0, fasonEksikGonderimi: 0 }),
      'GET /stok/panel': () => json(200, { malzemeCesidi: 8, gozDolu: 6, gozToplam: 28, kritik: 0, eksi: 0, kabulde: 0, toplamaBekleyen: 0, gunluk: [], kritikListe: [], raflar: [], sonHareketler: [] }),
      'GET /stok/harita-ozeti': () => json(200, { bolum: 1, goz: 6, alan: 1, eslenmemis: 4, bagsizKonumlar: [], bolumler: [] }),
    });
    ac('/stok');
    await screen.findByText('Malzeme çeşidi');
    if (esleyen(eylem)) expect(await screen.findByText('4 harita yeri stok konumu değil')).toBeTruthy();
    else {
      await bekle();
      expect(screen.queryByText(/harita yeri stok konumu değil/)).toBeNull();
      expect(istekler.some((i) => i.yol === '/stok/harita-ozeti')).toBe(false);
    }
  });

  it.each(EYLEMLER)('Zemin ızgarası: %s taşıyanda kare atamasından sonra eşleme yalnız eşleyebilende koşar', async (eylem) => {
    const istekler = sunucuKur({ ...tek(eylem), islemler: ['sayfa.stok', 'atolye.salon-yaz', eylem] }, {
      'GET /stok/zemin': () => json(200, zemin), 'GET /stok/konumlar': () => json(200, bosListe), 'GET /stok/sepet': () => json(200, { satirlar: [] }),
      'POST /atolye/salonlar/4/hucre-ata': () => json(200, {}),
      'POST /stok/konumlar/haritadan-esle': () => json(200, { eklenen: 0, guncellenen: 0, kapatilan: 0, atlanan: [], koduDegisenler: [] }),
    });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('button', { name: /Kare C1/ }));
    fireEvent.change(await screen.findByLabelText('Kareye ata'), { target: { value: 'istasyon' } });
    fireEvent.change(screen.getByLabelText(/^İstasyon/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ata' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/atolye/salonlar/4/hucre-ata')).toBe(true));
    await bekle();
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/konumlar/haritadan-esle')).toBe(esleyen(eylem));
  });
});
