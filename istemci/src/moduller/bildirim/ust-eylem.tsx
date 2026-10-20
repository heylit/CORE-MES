import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { BildirimListeCevabi, BildirimSayacCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { DurumKutusu, Dugme, Pencere, Sekmeler, Simge, type Sekme } from '../../ortak/arayuz/index.ts';
import type { UstEylem, UstEylemOzellikleri } from '../../ortak/rota/ust-eylemler.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CIHAZ_LISTE_BOYU, cihazBildirimi, tarayiciCihazOrtami, yeniBildirimler, type CihazIzni, type CihazOrtami } from './cihaz.ts';
import { SAYAC_YOKLAMA_MS, sayacMetni } from './gorunum.ts';
import { BildirimSatiri, BosListe, useBildirimKomutlari } from './ortak.tsx';
import './bildirim.css';

type CekmeceSekmesi = 'okunmamis' | 'gelen';
const SEKMELER: readonly Sekme<CekmeceSekmesi>[] = [
  { anahtar: 'okunmamis', baslik: 'Okunmamış' },
  { anahtar: 'gelen', baslik: 'Hepsi' },
];
const CEKMECE_BOYU = 20;

interface CihazIzinDugmesi { izin: CihazIzni | null; iste: () => void }

function Cekmece({ kapat, cihaz }: { kapat: () => void; cihaz: CihazIzinDugmesi }) {
  const [sekme, sekmeYaz] = useState<CekmeceSekmesi>('okunmamis');
  const git = useNavigate();
  const { tumu } = useBildirimKomutlari();
  const liste = useQuery({
    queryKey: anahtarlar.liste(sekme, 1),
    queryFn: () => api.get<BildirimListeCevabi>(`/bildirimler?durum=${sekme}&sayfaBoyu=${CEKMECE_BOYU}`),
  });
  const sayfayaGit = (yol: string) => { kapat(); void git(yol); };
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Bildirimler"
      tur="yan"
      alt={(
        <div className="tc-bildirim-cekmece-alt">
          <Dugme simge="check" onClick={() => tumu.mutate()} yukleniyor={tumu.isPending}>Tümünü okundu yap</Dugme>
          <Dugme simge="list" onClick={() => sayfayaGit('/profil/bildirimler')}>Hepsini gör</Dugme>
          <Dugme simge="gear" onClick={() => sayfayaGit('/profil/bildirimler/tercihler')}>Bildirim ayarları</Dugme>
          {cihaz.izin === 'default' && <Dugme simge="bell" onClick={cihaz.iste}>Cihaz bildirimini aç</Dugme>}
        </div>
      )}
    >
      <Sekmeler etiket="Bildirim süzgeci" sekmeler={SEKMELER} secili={sekme} sec={sekmeYaz} />
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />
        : liste.data.satirlar.length === 0 ? <BosListe metin={sekme === 'okunmamis' ? 'Okunmamış bildirim yok.' : 'Bildirim yok.'} />
        : (
          <ul className="tc-bildirim-liste">
            {liste.data.satirlar.map((b) => <BildirimSatiri key={b.id} b={b} kisa acildi={b.yol === null ? undefined : kapat} />)}
          </ul>
        )}
    </Pencere>
  );
}

// Okunmamış sayısı değişince okunmamış listesi istenir ve son görülen kimlikten yenileri cihaza düşer. İlk okuma yalnız çizgiyi
// çeker: açılışta eski okunmamışlar cihaza yağmaz. İzin yoksa liste hiç istenmez.
export function useCihazBildirimi(okunmamis: number | undefined, ortam: CihazOrtami, izin: CihazIzni | null): void {
  const sonKimlik = useRef<number | null>(null);
  useEffect(() => {
    if (okunmamis === undefined || izin !== 'granted') return;
    if (okunmamis === 0) {
      sonKimlik.current ??= 0;
      return;
    }
    let iptal = false;
    api.get<BildirimListeCevabi>(`/bildirimler?durum=okunmamis&sayfaBoyu=${String(CIHAZ_LISTE_BOYU)}`).then((l) => {
      if (iptal) return;
      const onceki = sonKimlik.current;
      if (onceki !== null) {
        for (const b of yeniBildirimler(l.satirlar, onceki)) {
          const { baslik, secenek } = cihazBildirimi(b);
          ortam.goster(baslik, secenek).catch(() => undefined);
        }
      }
      sonKimlik.current = Math.max(onceki ?? 0, ...l.satirlar.map((b) => b.id));
    }, () => undefined);
    return () => { iptal = true; };
  }, [okunmamis, ortam, izin]);
}

export function ZilDugmesi({ cihaz }: UstEylemOzellikleri & { cihaz?: CihazOrtami }) {
  const [acik, acikYaz] = useState(false);
  const ortam = useMemo(() => cihaz ?? tarayiciCihazOrtami(), [cihaz]);
  const [izin, izinYaz] = useState(() => ortam.izin());
  const sayac = useQuery({
    queryKey: anahtarlar.sayac,
    queryFn: () => api.get<BildirimSayacCevabi>('/bildirimler/sayac'),
    refetchInterval: SAYAC_YOKLAMA_MS,
    // Cihaz bildirimi açıkken arka sekmede de yoklanır (tarayıcı arka sekmede zamanlayıcıyı seyreltebilir).
    refetchIntervalInBackground: izin === 'granted',
    refetchOnWindowFocus: true,
    retry: false,
  });
  useCihazBildirimi(sayac.data?.okunmamis, ortam, izin);
  const izinIste = () => { ortam.izinIste().then(izinYaz, () => undefined); };
  const okunmamis = sayac.data?.okunmamis ?? 0;
  const etiket = okunmamis > 0 ? `Bildirimler, ${okunmamis} okunmamış` : 'Bildirimler';
  return (
    <>
      <button type="button" className="tc-kabuk-tema tc-bildirim-zil" onClick={() => acikYaz(true)} aria-haspopup="dialog" aria-label={etiket} title={etiket}>
        <Simge ad="bell" />
        {okunmamis > 0 && (
          <span className={`tc-bildirim-sayac${sayac.data?.acilVar ? ' tc-bildirim-sayac-acil' : ''}`} aria-hidden="true">{sayacMetni(okunmamis)}</span>
        )}
      </button>
      {acik && <Cekmece kapat={() => acikYaz(false)} cihaz={{ izin, iste: izinIste }} />}
    </>
  );
}

// Herkesin üst çubuğunda (222 a): okuma ve işaretleme yalnız oturum ister, sunucu yalnız kişinin kendi satırlarını verir.
export const ustEylemler: readonly UstEylem[] = [{ anahtar: 'bildirimler', sira: 80, islem: 'oturum', dugme: ZilDugmesi }];
