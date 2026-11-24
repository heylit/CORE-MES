import { describe, expect, it } from 'vitest';
import { adresiCoz, adresiYaz, cikisKoduAciklamasi, gunlukDosyasiVarMi, gunlukIstegi, kapanmaGunlukAdresi, kapanmaOzeti, plansizKapanmaSayisi } from './kapanma-yorumu.ts';

const SIMDI = Date.parse('2026-11-24T13:00:00.000Z');
const gunOnce = (g: number): string => new Date(SIMDI - g * 86_400_000).toISOString();

describe('kapanma yorumu', () => {
  it('sekme sayısı yalnız son 7 günün plansız kapanmasını sayar; güncelleme ve ekrandan yeniden başlatma sayılmaz', () => {
    const liste = [
      { kapandiAn: gunOnce(1), neden: 'bellek-tasmasi' as const },
      { kapandiAn: gunOnce(2), neden: 'guncelleme' as const },
      { kapandiAn: gunOnce(3), neden: 'ekrandan-yeniden-baslatma' as const },
      { kapandiAn: gunOnce(4), neden: 'bilinmiyor' as const },
      { kapandiAn: gunOnce(8), neden: 'donma' as const },
    ];
    expect(plansizKapanmaSayisi(liste, SIMDI)).toBe(2);
    expect(plansizKapanmaSayisi([], SIMDI)).toBe(0);
  });

  it('günlük dosyası 60 günden eski kayıtta yoktur', () => {
    expect(gunlukDosyasiVarMi(gunOnce(60), SIMDI)).toBe(true);
    expect(gunlukDosyasiVarMi(gunOnce(61), SIMDI)).toBe(false);
  });

  it('çıkış kodu yalnız kanıt varsa açıklanır; yoksa anlamı bilinmiyor denir', () => {
    expect(cikisKoduAciklamasi({ cikisKodu: 134, sinyal: null, neden: 'bellek-tasmasi', kanit: 'rapor: heap' })).toBe('Çıkış kodu 134; tanı raporu bellek taşmasını gösteriyor');
    expect(cikisKoduAciklamasi({ cikisKodu: 1, sinyal: null, neden: 'bilinmiyor', kanit: null })).toBe('Çıkış kodu 1; anlamı tanı kanıtı olmadan bilinmiyor');
    expect(cikisKoduAciklamasi({ cikisKodu: null, sinyal: 'SIGKILL', neden: 'donma', kanit: 'bekçi' })).toBe('Sinyal SIGKILL; bekçi cevap vermeyen süreci kapattı');
    expect(cikisKoduAciklamasi({ cikisKodu: null, sinyal: null, neden: 'bilinmiyor', kanit: null })).toContain('kayıtlı değil');
  });

  it('özet cümlesi nedeni, en uzun süren isteği ve kapalı kalmayı söyler; bilinmeyende ne denendiği yazılır', () => {
    const o = kapanmaOzeti({ kapandiAn: '2026-11-24T12:22:00.000Z', kapaliSn: 100, neden: 'bellek-tasmasi', surenIstekler: [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, sureSn: 38 }] });
    expect(o).toContain('Sunucu belleği doldurdu.');
    expect(o).toContain('POST /plan/hesapla, kişi 12, 38 sn');
    expect(o).toContain('1 dk 40 sn sonra yeniden açıldı');
    expect(kapanmaOzeti({ kapandiAn: '2026-11-24T12:22:00.000Z', kapaliSn: 40, neden: 'bilinmiyor', surenIstekler: [] })).toContain('neden bulunamadı');
  });

  it('adres: sekme, kayıt ve günlük süzgeci gidiş dönüş; bilinmeyen sekme Özet; sistem parametresi yoksa pencere kapalı', () => {
    expect(adresiCoz(new URLSearchParams('x=1'))).toBeNull();
    expect(adresiCoz(new URLSearchParams('sistem=kapanmalar&kayit=12'))).toEqual({ sekme: 'kapanmalar', kayit: 12, suzgec: {} });
    expect(adresiCoz(new URLSearchParams('sistem=baska'))?.sekme).toBe('ozet');
    expect(adresiCoz(new URLSearchParams('sistem=kapanmalar&kayit=-3'))?.kayit).toBeNull();
    const a = adresiCoz(new URLSearchParams('sistem=gunluk&gun=2026-11-24&hata=1a2b3c4d&duzey=olumcul&duzey2=x'));
    expect(a).toEqual({ sekme: 'gunluk', kayit: null, suzgec: { gun: '2026-11-24', hata: '1a2b3c4d', duzey: 'olumcul' } });
    const yazilan = adresiYaz(new URLSearchParams('baska=1&sistem=ozet'), a);
    expect(Object.fromEntries(yazilan)).toEqual({ baska: '1', sistem: 'gunluk', gun: '2026-11-24', hata: '1a2b3c4d', duzey: 'olumcul' });
    expect(adresiYaz(yazilan, null).toString()).toBe('baska=1');
  });

  it('günlük isteği gün ve saati yerel zamandan ISO\'ya çevirir; saat gün olmadan gitmez', () => {
    const p = gunlukIstegi({ gun: '2026-11-24', baslangic: '15:20', bitis: '15:25', duzey: 'hata', hata: 'abcdef12' }, 'sunucu-2026-11-24.log:123');
    expect(p.get('gun')).toBe('2026-11-24');
    expect(p.get('baslangic')).toBe(new Date('2026-11-24T15:20:00').toISOString());
    expect(p.get('bitis')).toBe(new Date('2026-11-24T15:25:59.999').toISOString());
    expect(p.get('hataKodu')).toBe('abcdef12');
    expect(p.get('imlec')).toBe('sunucu-2026-11-24.log:123');
    expect(p.get('adet')).toBe('500');
    expect(gunlukIstegi({ baslangic: '15:20' }, null).has('baslangic')).toBe(false);
  });

  it('"Günlükte bu saati aç" kapanıştan 5 dk önce ile 2 dk sonrasını, o günün dosyasında açar', () => {
    const a = kapanmaGunlukAdresi({ kapandiAn: new Date('2026-11-24T12:22:00.000Z').toISOString() });
    expect(a.sekme).toBe('gunluk');
    expect(a.suzgec.gun).toBe(new Date('2026-11-24T12:22:00.000Z').getDate() === 24 ? '2026-11-24' : a.suzgec.gun);
    expect(a.suzgec.duzey).toBe('hata');
    expect(a.suzgec.baslangic).toBe(new Date('2026-11-24T12:17:00.000Z').toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
  });
});
