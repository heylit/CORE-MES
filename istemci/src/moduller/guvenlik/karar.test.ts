import { describe, expect, it } from 'vitest';
import type { Alarm, OzetCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { alarmKarari, kararSirasi, korumaKararlari, korumaListesi, olayAkisi } from './karar.ts';

const T = '2099-10-14T10:00:00.000Z';
const alarm = (o: Partial<Alarm> = {}): Alarm => ({
  id: 5, sinyal: 'hatali-giris-serisi', onem: 'orta', kullaniciAdi: 'deneme', ip: '10.0.0.9', kisiId: null, kisiAdi: null,
  gozlenenSayi: 12, tekrarSayisi: 1, ilkGoruldu: T, sonGoruldu: T, durum: 'acik',
  onaylayanAdi: null, onaylandi: null, kapatanAdi: null, kapandi: null, kapanisNotu: null, surum: 1, ...o,
});

describe('güvenlik kararları (2231)', () => {
  it('sunucunun kendi adresinden gelen alarm saldırı denmez; onaylanmış alarm kapatılmayı bekler', () => {
    expect(alarmKarari(alarm({ sinyal: 'adres-taramasi', ip: '127.0.0.1' })).anlam).toContain('sunucunun kendisinden');
    expect(alarmKarari(alarm({ sinyal: 'adres-taramasi', ip: '10.0.0.9' })).anlam).not.toContain('sunucunun kendisinden');
    expect(alarmKarari(alarm({ durum: 'onaylandi' })).ne).toContain('kapatılmayı bekliyor');
    expect(alarmKarari(alarm({ sinyal: 'cok-oturum', kisiAdi: 'Deneme Kişi', gozlenenSayi: 6 })).baslik).toBe('Deneme Kişi aynı anda 6 yerde açık');
  });

  it('koruma kararı: HTTPS kapalıysa sertifika ayrıca sorulmaz; duran tarama kritik', () => {
    const m = (anahtar: string, durum: 'acik' | 'uyari' | 'kapali' | 'bilinmiyor') => ({ anahtar, baslik: anahtar, aciklama: 'a', durum, deger: null });
    expect(korumaKararlari({ maddeler: [m('https', 'kapali'), m('sertifika', 'kapali')] }).map((k) => k.anahtar)).toEqual(['koruma:https']);
    expect(korumaKararlari({ maddeler: [m('https', 'acik'), m('sertifika', 'uyari'), m('tarama', 'uyari')] }).map((k) => k.anahtar))
      .toEqual(['koruma:sertifika', 'koruma:tarama']);
    expect(kararSirasi(korumaKararlari({ maddeler: [m('https', 'acik'), m('sertifika', 'uyari'), m('tarama', 'uyari')] }))[0]?.onem).toBe('Kritik');
  });

  it('korumalar kapalısı üstte; bilinmeyen madde sunucunun adıyla görünür', () => {
    const l = korumaListesi(
      { maddeler: [{ anahtar: 'denetim', baslik: 'D', aciklama: 'a', durum: 'acik', deger: null }, { anahtar: 'yeni', baslik: 'Yeni koruma', aciklama: 'b', durum: 'kapali', deger: null }] },
      { zaman: T, maddeler: [{ anahtar: 'geri-yukleme', baslik: 'G', aciklama: 'c', durum: 'uygun' }] },
    );
    expect(l.map((s) => [s.ad, s.durum])).toEqual([['Yeni koruma', 'kapali'], ['Değişiklik kaydı', 'acik'], ['Yedekten geri dönme denemesi', 'acik']]);
  });

  it('son 24 saat: eski alarm girmez, açılış ve giriş özeti eklenir', () => {
    const simdi = new Date('2099-10-14T12:00:00.000Z');
    const o = {
      sonAlarmlar: [alarm({ id: 1, sonGoruldu: '2099-10-14T11:00:00.000Z' }), alarm({ id: 2, sonGoruldu: '2099-10-12T11:00:00.000Z' })],
      girisler: { basarili: 4, hatali: 0, kullaniciAdi: 2, cihaz: 1 },
    } as OzetCevabi;
    expect(olayAkisi(o, 3600, simdi).map((x) => x.anahtar)).toEqual(['alarm:1', 'acilis', 'girisler']);
    expect(olayAkisi(o, 3 * 86_400, simdi).map((x) => x.anahtar)).toEqual(['alarm:1', 'girisler']);
  });
});
