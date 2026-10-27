import { describe, expect, it } from 'vitest';
import type { AnomaliCevabi, AnomaliOlaylariCevabi } from '#paylasilan/sozlesme/arkon.ts';
import {
  anomaliAdedi, anomaliOrani, isaretliSayisi, istasyonIsareti, istasyonlariSirala, kapaliKurallar, kapaliZamanKurallari, sureMetni,
} from '../../../../arkon/web/src/data/anomali.ts';
import type { AnomaliIstasyonu, AnomaliOlaylari, Anomaliler } from '../../../../arkon/web/src/data/anomali.ts';
import { cevapla } from './baglanti.ts';
import type { Istemci } from './baglanti.ts';

const ist = (kod: string, ek: Partial<AnomaliIstasyonu> = {}): AnomaliIstasyonu => ({
  istasyonId: 1, kod, ad: `${kod} istasyonu`, kapasiteKaynagi: 'makine', beklenen: 60, uretilen: 60, oran: 1, girisYokDk: null, girisYok: null, adetEksik: false, hurda: 0, planDisi: 0, ...ek,
});

describe('Üretim anomalisi panosu (kart #1149)', () => {
  it('sayılar: tam sayı kesirsiz, kesirli bir ondalık, bilinmeyen tire; oran yüzde, plan yoksa tire', () => {
    expect(anomaliAdedi(60)).toBe('60');
    expect(anomaliAdedi(12.5)).toBe('12,5');
    expect(anomaliAdedi(0)).toBe('0');
    expect(anomaliAdedi(null)).toBe('–');
    expect(anomaliOrani(0.754)).toBe('%75');
    expect(anomaliOrani(0)).toBe('%0');
    expect(anomaliOrani(null)).toBe('–');
  });

  it('istasyon işareti: giriş yok ya da eksik adetten biri true ise işaretli; ikisi de false ise normal; hüküm yoksa null', () => {
    expect(istasyonIsareti({ girisYok: true, adetEksik: false })).toBe(true);
    expect(istasyonIsareti({ girisYok: null, adetEksik: true })).toBe(true);
    expect(istasyonIsareti({ girisYok: false, adetEksik: false })).toBe(false);
    expect(istasyonIsareti({ girisYok: null, adetEksik: false })).toBe(false);
    expect(istasyonIsareti({ girisYok: null, adetEksik: null })).toBeNull();
  });

  it('işaretli istasyon önce gelir; eşitte kod sırası; işaretli sayısı hüküm yoksa null (hepsi normal denmez)', () => {
    const liste = [ist('B'), ist('A', { adetEksik: true }), ist('C', { adetEksik: true })];
    expect(istasyonlariSirala(liste).map((i) => i.kod)).toEqual(['A', 'C', 'B']);
    expect(isaretliSayisi(liste)).toBe(2);
    expect(isaretliSayisi([ist('A', { adetEksik: null })])).toBeNull();
    expect(isaretliSayisi([])).toBeNull();
    expect(isaretliSayisi([ist('A')])).toBe(0);
  });

  it('kapalı kural: boş eşik panoda adıyla söylenir', () => {
    expect(kapaliKurallar({ girisYokDk: 60, adetToleransYuzde: 0 })).toEqual([]);
    expect(kapaliKurallar({ girisYokDk: null, adetToleransYuzde: null })).toEqual(['Giriş yok süresi', 'Eksik adet']);
  });

  it('köprü: Arkon /anomaliler isteği TMI /arkon/anomaliler ucuna gider ve cevap olduğu gibi döner; sözleşme tipiyle uyumlu', async () => {
    const cevap = {
      tarih: '2026-10-13', hesaplama: '2026-10-13T07:00:00.000Z', esikler: { girisYokDk: 60, adetToleransYuzde: 0 },
      toplam: { beklenen: 60, uretilen: 45, oran: 0.75, hurda: 2, performans: 0.9, planDisi: 0 }, istasyonlar: [ist('A', { uretilen: 45, oran: 0.75, adetEksik: true })],
      makineler: [{ makineId: 2, kod: 'M1', ad: 'Tezgah', istasyonId: 1, beklenen: 60, uretilen: 45, hurda: 2, fark: -15, durum: 'isaret' }],
      kisiler: [{ kisiId: 3, ad: 'Deneme Kişi', beklenen: 0, uretilen: null, hurda: null, fark: null, durum: 'izinli', performans: null, emekVerimi: null }], atlanan: 0,
    } satisfies AnomaliCevabi;
    const yollar: string[] = [];
    const istemci = { get: async <T,>(yol: string) => { yollar.push(yol); return cevap as T; }, post: async () => { throw new Error('yazma yok'); } } as unknown as Istemci;
    const c = await cevapla(istemci, { yontem: 'GET', yol: '/anomaliler', sorgu: new URLSearchParams('c=c1'), govde: undefined });
    expect(c.durum).toBe(200);
    expect(c.govde).toEqual(cevap);
    expect(yollar).toEqual(['/arkon/anomaliler']);
    // Ekranın tipi sunucu sözleşmesiyle aynı biçimdir.
    const ekran: Anomaliler = c.govde as Anomaliler;
    expect(ekran.kisiler?.[0]?.durum).toBe('izinli');
    // Yazma yöntemi bu yola eşlenmez.
    const post = await cevapla(istemci, { yontem: 'POST', yol: '/anomaliler', sorgu: new URLSearchParams(''), govde: '{}' });
    expect(post.durum).toBe(404);
  });

  it('zaman olayları (kart 764): süre okunur yazılır; boş zaman eşiği kapalı kural olarak söylenir', () => {
    expect(sureMetni(45)).toBe('45 dk');
    expect(sureMetni(130)).toBe('2 sa 10 dk');
    expect(sureMetni(120)).toBe('2 sa');
    expect(sureMetni(1620)).toBe('1 g 3 sa');
    expect(kapaliZamanKurallari({ gecGirisDk: 30, gecTeslimDk: 0, bitisKaymaDk: 60, sureAsimYuzde: 20 })).toEqual([]);
    expect(kapaliZamanKurallari({ gecGirisDk: null, gecTeslimDk: null, bitisKaymaDk: null, sureAsimYuzde: null })).toEqual(['Geç giriş', 'Girdi gecikmesi', 'Bitiş kayması', 'Süre aşımı']);
  });

  it('köprü: Arkon /anomali-olaylari isteği TMI /arkon/anomali-olaylari ucuna gider; sözleşme tipiyle uyumlu; yazma eşlenmez', async () => {
    const cevap = {
      hesaplama: '2026-10-27T09:00:00.000Z', esikler: { gecGirisDk: 30, gecTeslimDk: null, bitisKaymaDk: null, sureAsimYuzde: null },
      ozet: { acik: 1, aksatilanIs: 0, toplamEtkiDk: 0, riskliEmir: 0 },
      olaylar: [{
        id: 1, tur: 'gec-giris', isEmriId: 5, uretimEmriId: 4, emirNo: 'E-1', opNo: 10, istasyon: { id: 2, ad: 'Torna' }, kaynak: { tur: 'makine', id: 3, ad: 'Tezgah' },
        planAni: '2026-10-27T06:00:00.000Z', tabanAni: null, tabanDakika: null, gercekAni: null, dakika: 180, kokOlayId: null, acilis: '2026-10-27T09:00:00.000Z', kapanis: null,
      }],
    } satisfies AnomaliOlaylariCevabi;
    const yollar: string[] = [];
    const istemci = { get: async <T,>(yol: string) => { yollar.push(yol); return cevap as T; }, post: async () => { throw new Error('yazma yok'); } } as unknown as Istemci;
    const c = await cevapla(istemci, { yontem: 'GET', yol: '/anomali-olaylari', sorgu: new URLSearchParams(''), govde: undefined });
    expect(c.durum).toBe(200);
    expect(yollar).toEqual(['/arkon/anomali-olaylari']);
    expect((c.govde as AnomaliOlaylari).olaylar[0]?.tur).toBe('gec-giris');
    expect((await cevapla(istemci, { yontem: 'POST', yol: '/anomali-olaylari', sorgu: new URLSearchParams(''), govde: '{}' })).durum).toBe(404);
  });
});
