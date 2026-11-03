import { Component, type ErrorInfo, type ReactNode } from 'react';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Dugme } from './Dugme.tsx';

interface Ozellikler {
  children: ReactNode;
  // Değişince sınır kendini sıfırlar: hatalı ekrandan başka sayfaya geçen kullanıcı yeni sayfayı görür.
  sifirla?: unknown;
  mesaj?: string;
}

interface Durum { hata: unknown; anahtar: unknown }

// Güncellemeden sonra eski sürümün parçası sunucuda kalmaz; React.lazy reddi aklında tutar, o ekran ancak sayfa yenilenince açılır.
// Sayfa kendiliğinden yenilenmez (2051 b): öteki açık ekranlardaki kaydedilmemiş giriş ve yolda olan kayıt kaybolmasın diye
// yenilemeyi kullanıcı, işini kaydettikten sonra yapar.
export const parcaYuklenemedi = (hata: unknown): boolean =>
  hata instanceof Error
  && /dynamically imported module|Importing a module script failed|error loading dynamically|Unable to preload CSS/i.test(hata.message);

export const GUNCELLEME_ILETISI = 'Uygulama güncellendi. Açık ekranlarda kaydedilmemiş iş varsa önce kaydedin, sonra sayfayı yenileyin.';

// Bir ekranın çizim hatası yalnız o ekranı düşürür; kabuk, menü ve öteki kalıcı ekranlar çalışmaya devam eder.
export class HataSiniri extends Component<Ozellikler, Durum> {
  override state: Durum = { hata: null, anahtar: this.props.sifirla };

  static getDerivedStateFromError(hata: unknown): Partial<Durum> {
    return { hata: hata ?? new Error('Bilinmeyen hata') };
  }

  static getDerivedStateFromProps(ozellik: Ozellikler, durum: Durum): Partial<Durum> | null {
    return Object.is(ozellik.sifirla, durum.anahtar) ? null : { hata: null, anahtar: ozellik.sifirla };
  }

  override componentDidCatch(hata: unknown, bilgi: ErrorInfo): void {
    console.error('Ekran hatası', hata, bilgi.componentStack);
  }

  private readonly yenile = (): void => {
    this.setState({ hata: null });
  };

  override render(): ReactNode {
    if (this.state.hata === null) return this.props.children;
    if (parcaYuklenemedi(this.state.hata)) {
      return (
        <DurumKutusu durum="hata" mesaj={GUNCELLEME_ILETISI}>
          <Dugme simge="rotate" onClick={() => { window.location.reload(); }}>Sayfayı yenile</Dugme>
        </DurumKutusu>
      );
    }
    return <DurumKutusu durum="hata" mesaj={this.props.mesaj ?? 'Bu ekran açılırken bir hata oluştu'} yenile={this.yenile} />;
  }
}
