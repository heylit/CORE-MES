import { describe, expect, it } from 'vitest';
import {
  adimArkasinaTasi, adimEksikleri, MEDYA_SINIRI, adimTasi, anahtarUret, bosAdim, degerMetni, eslesir, girdiyeCevir, kontrolKur, kontrolOzeti, medyaHatasi, medyaSayilari, sablonOzeti,
  sayiOku, videoSuresiHatasi,
} from './kurallar.ts';

describe('şartname ve talimat kuralları', () => {
  it('kontrol noktası özeti; sınırı boş ölçüm talimatta doldurulur', () => {
    expect(kontrolOzeti({ tur: 'yok' })).toBeNull();
    expect(kontrolOzeti({ tur: 'olcum', ad: 'Derinlik', alt: 11.95, ust: 12.05, birim: 'mm' })).toBe('Ölçüm: Derinlik (11,95 – 12,05 mm)');
    expect(kontrolOzeti({ tur: 'olcum', ad: 'Tork', alt: null, ust: null, birim: 'Nm' })).toBe('Ölçüm: Tork (sınır talimatta)');
    expect(kontrolOzeti({ tur: 'secim', secenekler: ['uygun', 'değil'] })).toBe('Seçim: uygun / değil');
    expect(kontrolOzeti({ tur: 'foto', aciklama: null })).toBe('Fotoğraf');
  });

  it('tür değişince boş nokta kurulur, aynı tür korunur', () => {
    const olcum = { tur: 'olcum' as const, ad: 'Çap', alt: 1, ust: 2, birim: 'mm' };
    expect(kontrolKur('olcum', olcum)).toBe(olcum);
    expect(kontrolKur('secim', olcum)).toEqual({ tur: 'secim', secenekler: ['Uygun', 'Uygun değil'] });
  });

  it('girdiye çevirirken boş metin null olur, medyadan yalnız özet ve ad gider', () => {
    const a = { ...bosAdim(), baslik: ' Bağla ', metin: '  ', medya: [{ ozet: 'a'.repeat(64), ad: 'r.png', tur: 'resim' as const, boyut: 10 }] };
    expect(girdiyeCevir(a)).toEqual({ baslik: 'Bağla', metin: null, kontrol: { tur: 'yok' }, zorunlu: false, medya: [{ ozet: 'a'.repeat(64), ad: 'r.png' }] });
  });

  it('eksikler gönderilmeden gösterilir', () => {
    expect(adimEksikleri([])).toEqual(['En az bir adım gerekir.']);
    const e = adimEksikleri([{ ...bosAdim(), kontrol: { tur: 'olcum', ad: '', alt: 3, ust: 1, birim: '' } }]);
    expect(e).toEqual(['Adım 1: başlık zorunlu.', 'Adım 1: ölçümün adı zorunlu.', 'Adım 1: alt sınır üst sınırdan büyük.']);
  });

  it('sürüklenen adım hedefin ardına, başlığa bırakılan başa girer (1186 b)', () => {
    expect(adimArkasinaTasi(['a', 'b', 'c'], 0, 2)).toEqual({ liste: ['b', 'c', 'a'], yeni: 2 });
    expect(adimArkasinaTasi(['a', 'b', 'c'], 2, 0)).toEqual({ liste: ['a', 'c', 'b'], yeni: 1 });
    expect(adimArkasinaTasi(['a', 'b', 'c'], 2, null)).toEqual({ liste: ['c', 'a', 'b'], yeni: 0 });
    expect(adimArkasinaTasi(['a', 'b'], 1, 1)).toEqual({ liste: ['a', 'b'], yeni: 1 });
    expect(adimArkasinaTasi(['a', 'b'], 5, 0)).toEqual({ liste: ['a', 'b'], yeni: 5 });
  });

  it('adım taşınır; uçta yer değişmez', () => {
    expect(adimTasi(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(adimTasi(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
  });

  it('medya sınırları (995 a): tür, boy, adım başına sayı ve video süresi', () => {
    expect(medyaHatasi({ type: 'image/png', size: MEDYA_SINIRI.resimBayt }, 0)).toBeNull();
    expect(medyaHatasi({ type: 'image/png', size: MEDYA_SINIRI.resimBayt + 1 }, 0)).toBe('Resim en çok 10 MB olur.');
    expect(medyaHatasi({ type: 'video/mp4', size: MEDYA_SINIRI.videoBayt + 1 }, 0)).toBe('Video en çok 200 MB olur.');
    expect(medyaHatasi({ type: 'application/pdf', size: 1 }, 0)).toMatch(/Yalnız/);
    expect(medyaHatasi({ type: 'image/png', size: 1 }, 5)).toMatch(/en çok 5/);
    expect(videoSuresiHatasi(180)).toBeNull();
    expect(videoSuresiHatasi(181)).toBe('Video en çok 3 dakika olur.');
    expect(videoSuresiHatasi(Number.NaN)).toBe('Videonun süresi okunamadı.');
  });

  it('şablon özeti ve medya sayıları', () => {
    expect(sablonOzeti([{ kontrol: { tur: 'onay' } }, { kontrol: { tur: 'yok' } }])).toBe('2 adım · 1 kontrol noktası');
    expect(sablonOzeti([{ kontrol: { tur: 'yok' } }])).toBe('1 adım');
    expect(medyaSayilari([{ medya: [{ tur: 'resim' }, { tur: 'video' }] }, { medya: [{ tur: 'resim' }] }])).toEqual({ resim: 2, video: 1 });
  });

  it('değer metni: boş değer null kalır, aralık ve birim yazılır', () => {
    expect(degerMetni({ tur: 'sayi', birim: 'µm' }, null)).toBeNull();
    expect(degerMetni({ tur: 'sayi', birim: 'µm' }, 8)).toBe('8 µm');
    expect(degerMetni({ tur: 'aralik', birim: 'HRC' }, [58, 62])).toBe('58 – 62 HRC');
    expect(degerMetni({ tur: 'evet', birim: null }, false)).toBe('Hayır');
    expect(degerMetni({ tur: 'coklu', birim: null }, ['a', 'b'])).toBe('a, b');
  });

  it('arama Türkçe harf ve büyük küçük ayırmaz; sayı virgülle okunur', () => {
    expect(eslesir('çinko', 'KPL-ZN', 'Elektrolitik Çinko kaplama')).toBe(true);
    expect(eslesir('ISIL', 'Isıl işlem')).toBe(true);
    expect(eslesir('', null)).toBe(true);
    expect(sayiOku('11,95')).toBe(11.95);
    expect(sayiOku('')).toBeNull();
    expect(sayiOku('x')).toBeUndefined();
  });

  it('yeni alanın anahtarı adından türer ve tekildir', () => {
    expect(anahtarUret('En az kalınlık', [])).toBe('enAzKalinlik');
    expect(anahtarUret('En az kalınlık', ['enAzKalinlik'])).toBe('enAzKalinlik2');
    expect(anahtarUret('123', [])).toBe('alan');
  });
});
