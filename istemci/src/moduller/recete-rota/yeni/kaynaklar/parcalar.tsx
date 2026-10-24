import { useEffect, useState, type KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dugme, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { RR_ANAHTARI, RrHatasi, useRrKomutu, type KomutAdi, type KomutGovdesi } from '../veri.ts';

// R2 bölümlerinin ortak parçaları: komut çağrısı ve iletisi, satır içi girdi, sahibinin sayfasına bağlantı.

export interface KomutHatasi { ileti: string; eskiSurum: boolean }
export const ESKI_SURUM_EKI = 'Ekran güncel kayıtla yenilendi; değişikliğini yeniden yap.';

// Komut köprüden gider; başarıda (istenirse) ileti verilir, hata bildirime düşer ve çağırana döner (form kendi alanında da gösterir).
// Eski sürümde veri katmanı kaydı yeniden okur. Süre komutundan sonra süre görünümleri yeniden okunur.
export function useR2Komutu() {
  const komut = useRrKomutu();
  const { bildir } = useBildirim();
  const istemci = useQueryClient();
  const calistir = async (
    ad: KomutAdi, govde: KomutGovdesi, s: { basari?: string; sureler?: boolean; sessiz?: boolean } = {},
  ): Promise<KomutHatasi | null> => {
    try {
      await komut.mutateAsync({ ad, govde });
      if (s.sureler) await istemci.invalidateQueries({ queryKey: [...RR_ANAHTARI, 'sureler'] });
      if (s.basari) bildir('tamam', s.basari);
      return null;
    } catch (h) {
      const r = h instanceof RrHatasi ? h : new RrHatasi(h);
      const hata = { ileti: r.message || 'İşlem yapılamadı.', eskiSurum: r.eskiSurum };
      if (s.sureler && r.eskiSurum) await istemci.invalidateQueries({ queryKey: [...RR_ANAHTARI, 'sureler'] });
      if (!s.sessiz) bildir('hata', hata.eskiSurum ? `Kayıt başka yerde değişti. ${hata.ileti} ${ESKI_SURUM_EKI}` : hata.ileti);
      return hata;
    }
  };
  return { calistir, mesgul: komut.isPending };
}

// Satır içi girdi (bugünkü ekranın alan düzenlemesi): değer odaktan çıkınca ya da Enter ile kaydedilir, Esc geri alır. Kayıt
// reddedilirse kutu sunucudaki değere döner. Yetki yoksa girdi çizilmez, değer düz metindir.
export function SatirGirdisi({
  deger, etiket, kaydet, sayi = false, kapali = false, yerTutucu,
}: {
  deger: string;
  etiket: string;
  kaydet: (yeni: string) => Promise<boolean>;
  sayi?: boolean;
  kapali?: boolean;
  yerTutucu?: string;
}) {
  const [yerel, yerelYaz] = useState(deger);
  const [mesgul, mesgulYaz] = useState(false);
  useEffect(() => { yerelYaz(deger); }, [deger]);

  const bitir = async () => {
    if (yerel === deger || mesgul) return;
    mesgulYaz(true);
    const tamam = await kaydet(yerel);
    mesgulYaz(false);
    if (!tamam) yerelYaz(deger);
  };
  const tus = (o: KeyboardEvent<HTMLInputElement>) => {
    if (o.key === 'Enter') { o.preventDefault(); o.currentTarget.blur(); }
    if (o.key === 'Escape') { o.preventDefault(); yerelYaz(deger); }
  };
  return (
    <input
      className={`tc-alan-kutu tc-rr2-girdi${sayi ? ' tc-rr2-sayi' : ''}`}
      value={yerel}
      aria-label={etiket}
      placeholder={yerTutucu}
      inputMode={sayi ? 'decimal' : undefined}
      disabled={kapali || mesgul}
      aria-busy={mesgul || undefined}
      onChange={(o) => { yerelYaz(o.target.value); }}
      onBlur={() => { void bitir(); }}
      onKeyDown={tus}
    />
  );
}

// Tek düzenleme yeri sahibinin sayfasıdır: bu alanlar burada yalnız okunur, düğme o sayfayı açar.
export const SAHIP_SAYFASI = {
  istasyon: { yol: '/istasyonlar/is-merkezleri', ad: 'İstasyonlar', dugme: "İstasyonlar'da düzenle" },
  makine: { yol: '/istasyonlar/makineler', ad: 'İstasyonlar', dugme: "İstasyonlar'da düzenle" },
  vardiya: { yol: '/vardiya', ad: 'Vardiya', dugme: "Vardiya'da düzenle" },
  personel: { yol: '/vardiya/personel', ad: 'Vardiya', dugme: "Vardiya'da düzenle" },
  malzeme: { yol: '/malzemeler/yeni', ad: 'Malzemeler ve Hizmetler', dugme: "Malzemeler ve Hizmetler'de oluştur" },
} as const;

export function SahibindeDuzenle({ sahip, metin }: { sahip: keyof typeof SAHIP_SAYFASI; metin?: string }) {
  const git = useNavigate();
  const s = SAHIP_SAYFASI[sahip];
  return (
    <Dugme simge="expand" onClick={() => { void git(s.yol); }} title={`Bu bilgi ${s.ad} sayfasında düzenlenir`}>
      {metin ?? s.dugme}
    </Dugme>
  );
}
