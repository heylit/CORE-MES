import { describe, expect, it } from 'vitest';
import { KARANTINA_HEDEF_BETIGI, KILIT_BETIGI, ON_BETIK, PALET_BETIGI, SON_BETIK } from './acilis.ts';
import { kalibrasyonKuraliBetigi } from '../kalibrasyon/disari.ts';
import { kalibrasyonDurumu } from '#paylasilan/sozlesme/kalibrasyon-kurali.ts';
import { CIHAZ_DURUMU_KURALLI, CIHAZ_DURUMU_YERI, GOMULU_STIL, ICERIK_POLITIKASI, KAYDET_YERI, KITAPLIK_KIMLIKLERI, SUNUCU_KOSULU, sayfaKur, type KitaplikKimligi } from './sayfa.ts';
import { KM_PAKETI } from './uygulama/paket.ts';

const kitapliklar = Object.fromEntries(KITAPLIK_KIMLIKLERI.map((k) => [k, `/*${k}*/`])) as Record<KitaplikKimligi, string>;
const kur = (ek: Partial<Parameters<typeof sayfaKur>[0]> = {}) =>
  sayfaKur({ paket: KM_PAKETI, koken: 'http://localhost:4101', grafik: '/*grafik*/', kitapliklar, kimlik: { kisi: { id: 7, ad: 'Deneme Kişi' }, yonetici: false, kisiler: [], onaylayabilir: false }, ...ek });

describe('Kalite Merkezi çerçeve sayfası', () => {
  const sayfa = kur();

  it('içerik politikası betiklerden önce gelir; dış adrese bağlantı, form gönderimi ve taban değişimi kapalı', () => {
    expect(sayfa.indexOf('Content-Security-Policy')).toBeLessThan(sayfa.indexOf('<script'));
    expect(ICERIK_POLITIKASI).toContain("default-src 'none'");
    expect(ICERIK_POLITIKASI).toContain("form-action 'none'");
    expect(ICERIK_POLITIKASI).toContain("base-uri 'none'");
    expect(ICERIK_POLITIKASI).not.toMatch(/https?:|\*/);
    expect(ICERIK_POLITIKASI).toMatch(/connect-src blob: data:(;|$)/);
  });

  it('ön betik ve ayar uygulamadan önce, görünüm betiği uygulamadan sonra; sunucu kipi TMI ayarına bağlı', () => {
    const uygulama = sayfa.indexOf('KM_OFFLINE=true');
    expect(uygulama).toBeGreaterThan(0);
    expect(sayfa.indexOf('window.__TMI_KM={"koken":"http://localhost:4101","kisi":{"id":7,"ad":"Deneme Kişi"}')).toBeLessThan(uygulama);
    expect(sayfa.indexOf(ON_BETIK)).toBeLessThan(uygulama);
    expect(sayfa.indexOf(SON_BETIK)).toBeGreaterThan(uygulama);
    expect(sayfa.indexOf(PALET_BETIGI)).toBeGreaterThan(uygulama);
    expect(sayfa.indexOf(KILIT_BETIGI)).toBeGreaterThan(uygulama);
    expect(sayfa.indexOf(KARANTINA_HEDEF_BETIGI)).toBeGreaterThan(uygulama);
    expect(sayfa).not.toContain(SUNUCU_KOSULU);
    expect(sayfa).toContain('if(window.__TMI_KM){');
  });

  it('kitaplıklar uygulamanın okuduğu kimliklerle yerine konur; işaret kalmaz', () => {
    for (const k of KITAPLIK_KIMLIKLERI) expect(sayfa).toContain(`<script type="text/x-lib" id="${k}">/*${k}*/</script>`);
    expect(sayfa).toContain('<script>/*grafik*/</script>');
    expect(sayfa).not.toMatch(/<!--km-(kitaplik|grafik)/);
  });

  it('yazı tanıma dışarıdan dosya istemez: işçi blob, çekirdek ve dil verisi sayfadaki kitaplıktan; varsayılan CDN adresleri kullanılmaz', () => {
    expect(KM_PAKETI).toContain("Tesseract.createWorker('eng',1,{workerPath:wurl,corePath:'kmcore.js',langPath:'kmlang',workerBlobURL:false,");
    expect(KM_PAKETI).toContain("const wurl=URL.createObjectURL(new Blob([shim,el('lib-tesscore').textContent,");
    expect(KM_PAKETI).toContain("filter(x=>!/kmcore");
    expect(KM_PAKETI).toContain("if(/eng\\\\.traineddata/.test(u))return Promise.resolve(new Response(__b64(__L)");
    expect(ICERIK_POLITIKASI).toContain('worker-src blob:');
    expect(ICERIK_POLITIKASI).toMatch(/connect-src blob: data:(;|$)/);
  });

  it('köken betik içinde kaçışlıdır; betiği kapatan kitaplık ve beklenen yeri olmayan paket reddedilir', () => {
    expect(kur({ koken: 'http://x</script><b>' })).not.toContain('</script><b>');
    expect(() => kur({ kitapliklar: { ...kitapliklar, 'lib-three': 'a</script>b' } })).toThrow(/lib-three/);
    expect(() => kur({ paket: KM_PAKETI.replace(SUNUCU_KOSULU, 'if(false){') })).toThrow(/beklenen yer/);
    expect(() => kur({ paket: KM_PAKETI.replace('<!--km-kitaplik:lib-occt-->', '') })).toThrow(/lib-occt/);
  });

  it('kayıt yazması formun açıldığı hâli (guncelleme) ön betiğe bırakır; uygulamanın kaydetme akışı başka değişmez', () => {
    expect(sayfa).not.toContain(KAYDET_YERI);
    expect(sayfa).toContain('const body={...obj};delete body._id;window.__TMI_KM_TABAN={c:col,id:id,t:obj.guncelleme};body.guncelleme=new Date().toISOString();');
    expect(() => kur({ paket: KM_PAKETI.replace(KAYDET_YERI, '') })).toThrow(/beklenen yer/);
  });

  it('cihaz kalibrasyon durumu Kalibrasyon modülünün kuralıyla hesaplanır: kural uygulamadan önce gömülür, uygulamanın kendi hesabı kalmaz', () => {
    const kural = sayfa.indexOf(kalibrasyonKuraliBetigi());
    expect(kural).toBeGreaterThan(-1);
    expect(kural).toBeLessThan(sayfa.indexOf('function devStatus(d){'));
    expect(sayfa).not.toContain(CIHAZ_DURUMU_YERI);
    expect(sayfa.split('window.TMI_KALIBRASYON.durum(').length).toBe(2);
    expect(() => kur({ paket: KM_PAKETI.replace(CIHAZ_DURUMU_YERI, '') })).toThrow(/beklenen yer/);
  });

  describe('cihaz durumu (B17): sunucunun Kalibrasyondan getirdiği durum gösterilir', () => {
    // Tarayıcının günü sunucununkinden bir gün ileride: vadesi bugün olan cihazı yerel kural "Süresi doldu" sayardı.
    const devStatus = new Function('window', 'TODAY', `${CIHAZ_DURUMU_KURALLI};return devStatus;`)(
      { TMI_KALIBRASYON: { durum: kalibrasyonDurumu } }, () => '2026-11-02',
    ) as (d: Record<string, unknown> | null) => { t: string; c: string; use?: boolean; next?: string | null; k?: number | null };
    const cihaz = { kod: 'K-1', sonKal: '2025-11-01', periyotGun: 365 };

    it('sunucunun durumu tarayıcı saatinin önüne geçer: vade ve kalan gün de ondandır', () => {
      expect(devStatus({ ...cihaz, kalibrasyonDurumu: 'yaklasan', kalibrasyonVadesi: '2026-11-01', kalibrasyonKalanGun: 0 }))
        .toEqual({ t: 'Yaklaşıyor', c: 'warn', next: '2026-11-01', k: 0, use: true });
      expect(devStatus({ ...cihaz, kalibrasyonDurumu: 'gecmis', kalibrasyonVadesi: '2026-11-01', kalibrasyonKalanGun: -1 }))
        .toMatchObject({ t: 'Süresi doldu', use: false });
    });

    it('her durum uygulamanın metnine ve kullanılabilirlik bayrağına çevrilir', () => {
      const t = (durum: string) => devStatus({ ...cihaz, kalibrasyonDurumu: durum, kalibrasyonVadesi: '2026-12-01', kalibrasyonKalanGun: 30 });
      expect(t('gecerli')).toMatchObject({ t: 'Geçerli', use: true });
      expect(t('kullanim-disi')).toEqual({ t: 'Kullanım dışı', c: '', use: false });
      expect(t('kayit-yok')).toEqual({ t: 'Kayıt yok', c: 'bad', use: false });
    });

    it('sunucu durumu yoksa kural yerelde koşar (eşi olmayan eski kayıt), kalan gün sıfır uydurulmaz', () => {
      expect(devStatus({ ...cihaz })).toMatchObject({ t: 'Süresi doldu', next: '2026-11-01', k: -1, use: false });
      expect(devStatus({ kod: 'ESKI', sonKal: '' })).toEqual({ t: 'Kayıt yok', c: 'bad', use: false });
      expect(devStatus({ ...cihaz, kalibrasyonDurumu: 'kayit-yok' })).toEqual({ t: 'Kayıt yok', c: 'bad', use: false });
      expect(devStatus(null)).toEqual({ t: '—', c: '' });
    });
  });

  it('pakette örnek veri boştur: uygulamanın örnek firma, parça ve kişi adları depoya girmez', () => {
    expect(KM_PAKETI.split('const DEMO=').length).toBe(2);
    expect(KM_PAKETI).toContain('const DEMO={};');
  });

  it('pakette uygulamanın değiştirilen tek koşulu bir kez geçer (paket yeniden üretilince bozulursa yakalanır)', () => {
    expect(KM_PAKETI.split(SUNUCU_KOSULU).length).toBe(2);
    expect(KM_PAKETI.split(KAYDET_YERI).length).toBe(2);
    expect(KM_PAKETI.split(CIHAZ_DURUMU_YERI).length).toBe(2);
    for (const k of KITAPLIK_KIMLIKLERI) expect(KM_PAKETI.split(`<!--km-kitaplik:${k}-->`).length).toBe(2);
  });
  it('dar ekranda uygulamanın alt şeridi gizlenir: kural uygulamanın şerit kuralından sonra gelir, şeride ayrılan boşluk geri alınır', () => {
    expect(GOMULU_STIL).toMatch(/@media \(max-width:860px\)\{\.tabbar\{display:none\}/);
    expect(GOMULU_STIL).toContain('.wrap{padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}');
    expect(GOMULU_STIL).toContain('#toast{bottom:calc(16px + env(safe-area-inset-bottom,0px))}');
    expect(KM_PAKETI).toContain('@media (max-width:860px){');
    expect(sayfa.lastIndexOf('.tabbar{display:grid')).toBeGreaterThan(0);
    expect(sayfa.indexOf(GOMULU_STIL)).toBeGreaterThan(sayfa.lastIndexOf('.tabbar{display:grid'));
    expect(sayfa.indexOf(GOMULU_STIL)).toBeGreaterThan(sayfa.lastIndexOf('.wrap{padding:16px 12px calc(96px'));
    expect(sayfa).toContain('<nav id="tabbar" class="tabbar" aria-label="Ana menü"></nav>');
  });

  it('PDF kitaplığı satır içi modül betiği olarak koşabilir', () => {
    expect(ICERIK_POLITIKASI).toMatch(/script-src [^;]*'unsafe-inline'/);
  });
});
