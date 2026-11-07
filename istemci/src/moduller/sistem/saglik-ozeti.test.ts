import { describe, expect, it } from 'vitest';
import type { Ayrinti, MetrikDakikasi } from '#paylasilan/sozlesme/saglik.ts';
import { saglikGeneli, saglikKararlari, saglikKutulari } from './saglik-ozeti.ts';
import { isSirasi } from './SistemDurumu.tsx';

const GB = 1024 ** 3;
const ayrinti = (y: Partial<Ayrinti> = {}): Ayrinti => ({
  veritabaniGecikmeMs: 5, sonGoc: null, commit: null, calismaSuresiSn: 7500, ortam: 'test', isler: [], uyarilar: [], ...y,
});
const dakika = (p95Ms: number | null) => ({ istek: { p95Ms } }) as MetrikDakikasi;
const kutu = (k: ReturnType<typeof saglikKutulari>, anahtar: string) => k.find((x) => x.anahtar === anahtar);

describe('sağlık kutuları (2231)', () => {
  it('ölçü yerine hüküm: sorunsuz sistemde altı kutu da iyi; rakam alt satırda', () => {
    const k = saglikKutulari(true, ayrinti({ veritabaniDiski: { bosBayt: 50 * GB, toplamBayt: 100 * GB, az: false } }), dakika(120));
    expect(k.map((x) => [x.anahtar, x.ton, x.hukum])).toEqual([
      ['sunucu', 'tamam', 'Çalışıyor'], ['veritabani', 'tamam', 'Yanıt veriyor'], ['yedek', 'tamam', 'Alınıyor'],
      ['hiz', 'tamam', 'Hızlı'], ['disk', 'tamam', 'Yer var'], ['isler', 'tamam', 'Sorunsuz'],
    ]);
    expect(kutu(k, 'sunucu')?.yorum).toBe('2 sa 5 dk önce açıldı');
    expect(kutu(k, 'yedek')?.alt).toBe('Geri dönme hiç denenmedi');
  });

  it('sağlık bilinmiyorsa iyi denmez; ölçü yoksa "Ölçü yok", okunamadıysa nedeni yazar', () => {
    const k = saglikKutulari(null, ayrinti(), null);
    expect(kutu(k, 'sunucu')?.ton).toBe('pasif');
    expect(kutu(k, 'hiz')).toMatchObject({ ton: 'pasif', hukum: 'Ölçü yok' });
    expect(kutu(saglikKutulari(true, ayrinti(), undefined), 'hiz')?.yorum).toBe('Ölçüler okunamadı');
    expect(kutu(k, 'disk')?.hukum).toBe('Bilinmiyor');
  });

  it('yedek kapalıysa "Alınmıyor", sunucu eşiğini aşan yanıt "Yavaş", hatalı iş sayılır', () => {
    const a = ayrinti({
      uyarilar: [{ tur: 'yedek', ileti: 'Yedek kapalı: yedek klasörü seçilmemiş ya da erişilemiyor.' }],
      isler: [{ ad: 'x', sonBaslama: null, sonBitis: null, sonSonuc: 'hata', sonHata: 'y', sonNeden: null },
        { ad: 'z', sonBaslama: null, sonBitis: null, sonSonuc: 'bekliyor', sonHata: null, sonNeden: 'kapalı' }],
    });
    const k = saglikKutulari(true, a, dakika(1500));
    expect(kutu(k, 'yedek')).toMatchObject({ ton: 'hata', hukum: 'Alınmıyor', yorum: 'Yedek klasörü ya da anahtarı yok' });
    expect(kutu(k, 'hiz')).toMatchObject({ ton: 'uyari', hukum: 'Yavaş' });
    expect(kutu(k, 'isler')).toMatchObject({ ton: 'hata', hukum: '1 iş hata verdi', yorum: '1 iş, bağlantısı kapalı olduğu için bekliyor' });
  });

  it('genel hüküm: yedek sorunu kırmızıdır; uyarı yoksa sorunsuz', () => {
    expect(saglikGeneli(false, null).ton).toBe('hata');
    expect(saglikGeneli(true, ayrinti()).baslik).toBe('Sorunsuz');
    expect(saglikGeneli(true, ayrinti({ uyarilar: [{ tur: 'disk', ileti: 'd' }] })).baslik).toBe('Çalışıyor, 1 uyarı');
    expect(saglikGeneli(true, ayrinti({ uyarilar: [{ tur: 'yedek', ileti: 'Hiç yedek alınmamış.' }] })).ton).toBe('hata');
  });

  it('karar: sunucunun iletisi "ne oldu" olarak kalır, iş kod adı okunur ada döner; geri yükleme ayrı karardır', () => {
    const a = ayrinti({
      isler: [{ ad: 'saglik-metrik', sonBaslama: null, sonBitis: null, sonSonuc: 'hata', sonHata: 'x', sonNeden: null }],
      uyarilar: [
        { tur: 'is', ileti: 'saglik-metrik işi son turda hata verdi (x).' },
        { tur: 'yedek', ileti: 'Yedek hiç geri yüklenerek denenmemiş (npm run geri-yukle-deneme).' },
      ],
    });
    const [is, deneme] = saglikKararlari(a);
    expect(is?.ne).toBe('"Sistem ölçümleri" işi son turda hata verdi (x).');
    expect(deneme).toMatchObject({ baslik: 'Yedekten geri dönme denenmeli', ton: 'uyari' });
  });

  it('iş listesi: bakılması gereken üstte', () => {
    const is = (ad: string, sonSonuc: Ayrinti['isler'][number]['sonSonuc']) => ({ ad, sonBaslama: null, sonBitis: null, sonSonuc, sonHata: null, sonNeden: null });
    expect(isSirasi([is('a', 'tamam'), is('b', null), is('c', 'hata'), is('d', 'bekliyor')]).map((i) => i.ad)).toEqual(['c', 'd', 'b', 'a']);
  });
});
