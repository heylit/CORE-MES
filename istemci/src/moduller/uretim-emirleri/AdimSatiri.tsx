import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AdimDurumuCevabi, AdimStatusu, AdimliEmirCevabi, IsEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Menu, Rozet, Simge, type MenuOgesi, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { STATU, adimDurumuUcu } from './adim-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ADIMLI_OKUMA_ISLEMLERI, zamanMetni } from './gorunum.ts';
import { YerPenceresi, degisimEngeli, fasonMu, yerMetni } from './UretimYerleri.tsx';

// Emir sayfasının adım listesinde her satırın sağı (3039): Adım Durumu'ndaki statü (terminalle aynı ad), elle yazıldıysa kim ve ne
// zaman, değilse ilk neden; "…" menüsünde iç/fason seçimi ve Adım Durumu'na geçiş. Adımlar tek listede kalsın diye üretim yeri ayrı
// tabloda değil satırın menüsündedir. Statü okunamazsa (yetki ya da iş emri yok) satır kendi durum rozetini (`yedek`) gösterir.
const BEKLEMEYEN: ReadonlySet<AdimStatusu> = new Set<AdimStatusu>(['bitti', 'uretimde', 'baslayabilir']);

export interface AdimSatirEki {
  ek: (opNo: number, yedek: ReactNode) => ReactNode;
  // Özet kutusundaki "Şu an" için: adımın statüsü ve elle yazdıysa kişi; okunamazsa null.
  statu: (opNo: number) => { ad: string; ton: RozetTonu; kisi: string | null } | null;
  pencere: ReactNode;
}

export function useAdimSatirEki(emirId: number, malzemeNo: number | null): AdimSatirEki {
  const yonlendir = useNavigate();
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  const adimliOkur = ADIMLI_OKUMA_ISLEMLERI.some((i) => islemler.includes(i));
  const durumOkur = adimliOkur || islemler.includes('sayfa.adim-durumu');
  const matrisGorur = islemler.includes('sayfa.adim-durumu');
  const yerYazar = islemler.includes('uretim-emirleri.duzenle');
  const [secili, seciliYaz] = useState<IsEmri | null>(null);
  const durum = useQuery({
    queryKey: anahtarlar.adimDurumu(emirId),
    queryFn: () => api.get<AdimDurumuCevabi>(adimDurumuUcu(emirId)),
    enabled: durumOkur && emirId > 0,
  });
  const adimli = useQuery({
    queryKey: anahtarlar.adimli(emirId),
    queryFn: () => api.get<AdimliEmirCevabi>(`/adimli-emirler/${String(emirId)}`),
    enabled: adimliOkur && malzemeNo !== null && emirId > 0,
  });
  const ek = (opNo: number, yedek: ReactNode): ReactNode => {
    const a = durum.data?.adimlar.find((x) => x.opNo === opNo) ?? null;
    const is = adimli.data?.emir.isEmirleri.find((x) => x.opNo === opNo) ?? null;
    const engel = is ? degisimEngeli(is) : null;
    const ogeler: MenuOgesi[] = [
      ...(is && yerYazar ? [{
        anahtar: 'yer', simge: 'truck' as const, sec: () => { seciliYaz(is); },
        baslik: is.fasonFirmasiz === true ? 'Fason firma seç' : fasonMu(is) ? 'Nerede yapılır: değiştir' : 'Fasona al',
        pasif: engel !== null, pasifNedeni: engel ?? undefined,
      }] : []),
      ...(matrisGorur ? [{ anahtar: 'matris', baslik: "Adım Durumu'nda aç", simge: 'grid' as const, sec: () => { void yonlendir(`/adim-durumu?emir=${String(emirId)}`); } }] : []),
    ];
    // Adım Durumu sayfasıyla aynı kural: elle yazılan statü sistemin türettiğinin önüne geçer.
    const g = a ? STATU[a.elle?.statu ?? a.sistemStatusu] : null;
    // Neden yalnız bekleyen adımda anlamlıdır; biten ve çalışan adımda gürültüdür.
    const bekliyor = a !== null && !BEKLEMEYEN.has(a.elle?.statu ?? a.sistemStatusu);
    const alt = a?.elle ? `Elle: ${a.elle.kisiAdi ?? 'kişi yok'} · ${zamanMetni(a.elle.zaman) ?? ''}` : bekliyor && a ? a.nedenler[0] ?? null : null;
    return (
      <span className="tc-emir-adim-statu">
        {g ? <Rozet ton={g.ton}><Simge ad={g.simge} boyut="k" /> {g.ad}</Rozet> : yedek}
        {is && fasonMu(is) && <small>{yerMetni(is)}</small>}
        {/* 1787c ve K21 a: ilk parça kararı bekleyen sayım ve eksik alt parça bugünkü izlemedeki gibi adımın yanında görünür. */}
        {is?.kararBekliyor ? <small>Karar bekleyen {is.kararBekliyor}</small> : null}
        {(is?.eksikAltParcalar ?? []).map((p) => (
          <Rozet key={p.ad} ton="uyari">{`Alt parça bekleniyor: ${p.ad} ${p.malzeme.kod ?? p.malzeme.ad}`}</Rozet>
        ))}
        {alt && <small title={a?.elle?.not ?? undefined}>{alt}</small>}
        {ogeler.length > 0 && <Menu etiket={`OP ${String(opNo)} için`} ogeler={ogeler} />}
      </span>
    );
  };
  const statu: AdimSatirEki['statu'] = (opNo) => {
    const a = durum.data?.adimlar.find((x) => x.opNo === opNo) ?? null;
    if (!a) return null;
    const g = STATU[a.elle?.statu ?? a.sistemStatusu];
    return { ad: g.ad, ton: g.ton, kisi: a.elle?.kisiAdi ?? null };
  };
  const pencere = secili && adimli.data
    ? <YerPenceresi emirId={emirId} surum={adimli.data.emir.surum} adim={secili} kapat={() => { seciliYaz(null); }} />
    : null;
  return { ek, statu, pencere };
}
