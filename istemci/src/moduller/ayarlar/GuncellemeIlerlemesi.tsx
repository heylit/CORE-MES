import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  GuncellemeAdimi, GuncellemeIlerlemesiCevabi, GuncellemePaketleriCevabi, GuncellemeUygulamaSonucu,
} from '#paylasilan/sozlesme/ayarlar.ts';
import { Dugme, Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { AgHatasi, IstekKesildi, api } from '../../ortak/veri/api.ts';
import { derlemeTarihi } from '../../ortak/veri/surum.ts';
import { anahtarlar } from './anahtarlar.ts';

const YOKLAMA_MS = 3000;
const ILERLEME_ANAHTARI = ['ayarlar', 'guncelleme-ilerlemesi'] as const;

// Sözleşmedeki GUNCELLEME_ADIMLARI sırası; istemci paylasilan'dan değer ithal etmez (zod), AD kaydı eksik adımı tipte yakalar.
const GUNCELLEME_ADIMLARI = ['dogrula', 'hazirla', 'durdur', 'yedek', 'goc', 'acilis'] as const satisfies readonly GuncellemeAdimi[];

const AD: Readonly<Record<GuncellemeAdimi, { bekliyor: string; suruyor: string; tamam: string }>> = {
  dogrula: { bekliyor: 'Paket doğrulama', suruyor: 'Paket doğrulanıyor', tamam: 'Paket doğrulandı' },
  hazirla: { bekliyor: 'Hazırlık', suruyor: 'Hazırlanıyor', tamam: 'Hazırlandı' },
  durdur: { bekliyor: 'Sunucuyu durdurma', suruyor: 'Sunucu durduruluyor', tamam: 'Sunucu durduruldu' },
  yedek: { bekliyor: 'Veritabanı yedeği', suruyor: 'Veritabanı yedekleniyor', tamam: 'Veritabanı yedeklendi' },
  goc: { bekliyor: 'Göçler', suruyor: 'Göçler uygulanıyor', tamam: 'Göçler uygulandı' },
  acilis: { bekliyor: 'Yeni sürüm açılışı', suruyor: 'Yeni sürüm açılıyor', tamam: 'Yeni sürüm açıldı' },
};
const ACIKLAMA: Readonly<Partial<Record<GuncellemeAdimi, string>>> = {
  dogrula: 'İmza ve içerik denetimi',
  hazirla: 'Paket açılıyor, sürüm klasörü kuruluyor',
};

// Sunucu "durdur" adımından sonra kapalıdır: yedek, göç ve açılış ekrandan izlenemez.
const KAPALI_ADIMLAR: readonly GuncellemeAdimi[] = ['yedek', 'goc', 'acilis'];

export type Gorunum =
  | { tur: 'sirada' }
  | { tur: 'suruyor'; adim: GuncellemeAdimi }
  | { tur: 'kapali' }
  | { tur: 'bitti'; sonuc: GuncellemeUygulamaSonucu };

export type AdimDurumu = 'bekliyor' | 'suruyor' | 'tamam' | 'hata';
export interface AdimSatiri { adim: GuncellemeAdimi; durum: AdimDurumu; metin: string; not: string | null }

// Bozulan adımdan sonrası yapılmamıştır; geri alma ya da eski sürümün açılması sonuç satırında söylenir.
export function adimSatirlari(g: Gorunum): AdimSatiri[] {
  const sira = (a: GuncellemeAdimi): number => GUNCELLEME_ADIMLARI.indexOf(a);
  const durumu = (a: GuncellemeAdimi): AdimDurumu => {
    switch (g.tur) {
      case 'sirada': return 'bekliyor';
      case 'suruyor': return sira(a) < sira(g.adim) ? 'tamam' : sira(a) === sira(g.adim) ? 'suruyor' : 'bekliyor';
      case 'kapali': return KAPALI_ADIMLAR.includes(a) ? 'suruyor' : 'tamam';
      case 'bitti': {
        if (g.sonuc.sonuc === 'kuruldu' || g.sonuc.adim === null) return 'tamam';
        const bozulan = sira(g.sonuc.adim as GuncellemeAdimi);
        return sira(a) < bozulan ? 'tamam' : sira(a) === bozulan ? 'hata' : 'bekliyor';
      }
    }
  };
  return GUNCELLEME_ADIMLARI.map((adim) => {
    const durum = durumu(adim);
    const ad = AD[adim];
    const metin = durum === 'tamam' ? ad.tamam : durum === 'suruyor' ? ad.suruyor : durum === 'hata' ? `${ad.bekliyor}: hata` : ad.bekliyor;
    const not = durum === 'hata' && g.tur === 'bitti' ? g.sonuc.hata : durum === 'suruyor' ? ACIKLAMA[adim] ?? null : null;
    return { adim, durum, metin, not };
  });
}

const SONUC: Readonly<Record<GuncellemeUygulamaSonucu['sonuc'], { ton: RozetTonu; metin: string; aciklama: string }>> = {
  kuruldu: { ton: 'tamam', metin: 'Kuruldu', aciklama: 'Yeni sürüm çalışıyor.' },
  'geri-alindi': { ton: 'uyari', metin: 'Geri alındı', aciklama: 'Yedek geri yüklendi, önceki sürüm açıldı; sürüm ve veriler önceki halinde.' },
  basarisiz: { ton: 'hata', metin: 'Başarısız', aciklama: 'Kurulum tamamlanmadı; ayrıntı bozulan adımda.' },
};

function sure(baslangic: string, bitis: string): string {
  const sn = Math.max(0, Math.round((new Date(bitis).getTime() - new Date(baslangic).getTime()) / 1000));
  return sn < 60 ? `${sn} sn` : `${Math.floor(sn / 60)} dk ${sn % 60} sn`;
}

const SIMGE: Readonly<Record<AdimDurumu, 'check' | 'x' | null>> = { tamam: 'check', hata: 'x', bekliyor: null, suruyor: null };

function Satir({ s, no }: { s: AdimSatiri; no: number }) {
  const simge = SIMGE[s.durum];
  return (
    <li className={`tc-guncelleme-adim tc-guncelleme-adim-${s.durum}`} aria-current={s.durum === 'suruyor' ? 'step' : undefined}>
      <span className="tc-guncelleme-adim-isaret" aria-hidden="true">{simge === null ? (s.durum === 'bekliyor' ? no : null) : <Simge ad={simge} boyut="k" />}</span>
      <span className="tc-guncelleme-adim-metin">
        <b>{s.metin}</b>
        {s.not !== null && <small>{s.not}</small>}
      </span>
    </li>
  );
}

interface Takip { commit: string; an: string }

interface Ozellikler {
  veri: GuncellemePaketleriCevabi | undefined;
  // Bu ekrandan istenen uygulama: istek kabul edilince verilir, izleme sunucu listeyi göstermeden başlar.
  istenen: Takip | null;
  yoklamaMs?: number;
}

// Kurulumu bu ekrandan izleyen kişi içindir: sayfa başka zaman açılırsa son sonuç "Son uygulama" satırında kalır.
export function GuncellemeIlerlemesi({ veri, istenen, yoklamaMs = YOKLAMA_MS }: Ozellikler) {
  const istemci = useQueryClient();
  const [takip, setTakip] = useState<Takip | null>(null);
  const kapandi = useRef(false);

  const suren = veri?.uygulaniyor ?? veri?.bekleyen ?? null;
  useEffect(() => { if (istenen !== null) setTakip(istenen); }, [istenen]);
  useEffect(() => {
    if (suren !== null) setTakip((t) => (t?.commit === suren.commit ? t : { commit: suren.commit, an: suren.istenme }));
  }, [suren]);

  const sonuc = veri?.sonUygulama ?? null;
  const bitti = takip !== null && sonuc !== null && sonuc.commit === takip.commit
    && new Date(sonuc.bitis).getTime() >= new Date(takip.an).getTime() && suren === null;

  const ilerleme = useQuery({
    queryKey: ILERLEME_ANAHTARI,
    queryFn: () => api.get<GuncellemeIlerlemesiCevabi>('/guncelleme/ilerleme'),
    enabled: takip !== null && !bitti,
    refetchInterval: yoklamaMs,
    retry: false,
  });

  // Sunucu kapanıp geri gelince ya da uygulama bitince liste yeniden okunur: sonuç oradan gelir.
  // Yalnız ulaşılamayan sunucu "yeniden başlıyor" sayılır; yetki ya da eski sunucu (uç yok) hatasında canlı adım gösterilmez.
  const ulasilamadi = ilerleme.error instanceof AgHatasi || ilerleme.error instanceof IstekKesildi;
  const kapali = takip !== null && !bitti && ulasilamadi;
  const bosaldi = ilerleme.data !== undefined && ilerleme.data.suren === null;
  useEffect(() => {
    if (kapali) { kapandi.current = true; return; }
    if (takip !== null && !bitti && (bosaldi || kapandi.current)) {
      kapandi.current = false;
      void istemci.invalidateQueries({ queryKey: anahtarlar.guncellemePaketleri });
    }
  }, [kapali, bosaldi, bitti, takip, istemci, ilerleme.dataUpdatedAt]);

  if (takip === null || (!bitti && ilerleme.isError && !ulasilamadi)) return null;
  const canli = ilerleme.data?.suren ?? null;
  const gorunum: Gorunum = bitti && sonuc !== null ? { tur: 'bitti', sonuc }
    : kapali ? { tur: 'kapali' }
      : canli !== null && canli.commit === takip.commit ? { tur: 'suruyor', adim: canli.adim }
        : { tur: 'sirada' };
  const satirlar = adimSatirlari(gorunum);
  const surum = gorunum.tur === 'bitti' ? gorunum.sonuc.surum : canli?.surum ?? takip.commit.slice(0, 7);
  const rozet = gorunum.tur === 'bitti' ? <Rozet ton={SONUC[gorunum.sonuc.sonuc].ton}>{SONUC[gorunum.sonuc.sonuc].metin}</Rozet>
    : gorunum.tur === 'kapali' ? <Rozet ton="uyari">Sunucu yeniden başlıyor</Rozet>
      : gorunum.tur === 'sirada' ? <Rozet ton="pasif">Sırada</Rozet>
        : <Rozet ton="uyari">Kuruluyor</Rozet>;
  const gorunen = gorunum.tur === 'kapali' ? satirlar.filter((s) => !KAPALI_ADIMLAR.includes(s.adim)) : satirlar;
  const biten = satirlar.filter((s) => s.durum === 'tamam').length;

  return (
    <section className="tc-guncelleme-adimlar" aria-label={`${surum} kurulum adımları`}>
      <p className="tc-ayar-baslik">{surum} {rozet}</p>
      <ol className="tc-guncelleme-adim-liste" role="status" aria-live="polite">
        {gorunen.map((s) => <Satir key={s.adim} s={s} no={GUNCELLEME_ADIMLARI.indexOf(s.adim) + 1} />)}
        {gorunum.tur === 'kapali' && (
          <Satir
            no={4}
            s={{ adim: 'yedek', durum: 'suruyor', metin: 'Yedek, göç ve açılış sürüyor', not: 'Sunucu kapalı; bu adımlar sunucu açılınca işaretlenir.' }}
          />
        )}
      </ol>
      <p className="tc-ayar-aciklama">
        {gorunum.tur === 'bitti'
          ? `${derlemeTarihi(gorunum.sonuc.baslangic, true)} başladı, ${sure(gorunum.sonuc.baslangic, gorunum.sonuc.bitis)} sürdü. ${SONUC[gorunum.sonuc.sonuc].aciklama}`
          : gorunum.tur === 'kapali'
            ? 'Bağlantı yoklanıyor. Sayfayı kapatsanız da kurulum sürer.'
            : gorunum.tur === 'sirada'
              ? 'Güncelleyici isteği birazdan alır.'
              : `${String(biten)} / ${String(GUNCELLEME_ADIMLARI.length)} adım tamam.`}
      </p>
      {gorunum.tur === 'bitti' && <Dugme simge="x" onClick={() => { setTakip(null); }}>Kapat</Dugme>}
    </section>
  );
}
