import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IstasyonlarCevabi, OperasyonGrubu, OperasyonTipiGovdesi, OperasyonTipleriCevabi, SurumluOperasyonTipi,
} from '#paylasilan/sozlesme/istasyonlar.ts';
import type { SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Secim, Tablo } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { csvIndir } from './csv.ts';
import { durumSutunu } from './durumSutunu.tsx';
import { OPERASYON_GRUP_ADLARI, OPERASYON_GRUP_SECENEKLERI } from './etiketler.ts';
import { KayitPenceresi } from './KayitPenceresi.tsx';
import { ListeAraclari, aramayaUyar } from './ListeAraclari.tsx';
import { useKayitIslemleri } from './kayitIslemleri.ts';

// Rotada ya da iş emrinde kullanılmış tipin kodu değişmez (#544; sunucu da reddeder). Rotadaki kullanım biliniyorsa alan baştan kilitlidir;
// iş emrindeki kullanım ekranda bilinmez, sunucunun iletisi gösterilir. Silme yok, tip pasife alınır.
function OperasyonTipiFormu({ kayit, kullanim, kapat }: { kayit: SurumluOperasyonTipi | null; kullanim: number | null; kapat: () => void }) {
  const [kod, kodYaz] = useState(kayit?.kod ?? '');
  const [ad, adYaz] = useState(kayit?.ad ?? '');
  const [grup, grupYaz] = useState<OperasyonGrubu | ''>(kayit?.grup ?? '');
  const [aktif, aktifYaz] = useState(kayit?.aktif ?? true);
  const [ayarDk, ayarDkYaz] = useState(kayit?.varsayilanAyarDk ?? '');
  const [birimDk, birimDkYaz] = useState(kayit?.varsayilanBirimDk ?? '');
  const [istasyonId, istasyonIdYaz] = useState(kayit?.varsayilanIstasyonId == null ? '' : String(kayit.varsayilanIstasyonId));
  const { kaydet, hata, mesgul } = useKayitIslemleri('/operasyon-tipleri', kapat);
  const istasyonlar = useQuery({
    queryKey: anahtarlar.istasyonlar,
    queryFn: () => api.get<IstasyonlarCevabi>('/istasyonlar?pasifler=true'),
  });
  const istasyonSecenekleri = (istasyonlar.data?.istasyonlar ?? [])
    .filter((i) => i.aktif || i.id === kayit?.varsayilanIstasyonId)
    .map((i) => ({ deger: String(i.id), baslik: `${i.kod} - ${i.ad}${i.aktif ? '' : ' (pasif)'}` }));
  // Kısaltma ekranda yok (kullanıcı kararı: kod zaten kısaltmadır); gönderilmediği için girilmiş değer sunucuda değişmez.
  // Varsayılanlar rota adımına öneridir; boş bırakılan "bilinmiyor" olarak gider. Ekran hepsini gönderir; boşaltılan alan null gider, sunucu yalnız gönderilmeyeni korur.
  const ortak = {
    ad, grup: grup as OperasyonGrubu, aktif,
    varsayilanAyarDk: ayarDk.trim() === '' ? null : ayarDk.trim().replace(',', '.'),
    varsayilanBirimDk: birimDk.trim() === '' ? null : birimDk.trim().replace(',', '.'),
    varsayilanIstasyonId: istasyonId === '' ? null : Number(istasyonId),
  };
  // Kod yalnız değiştirilince gönderilir: gönderilmeyen kod sunucuda aynı kalır, kullanılmış tipte kilide takılmaz.
  const kodDegisti = kayit !== null && kod.trim().toLocaleUpperCase('tr-TR') !== kayit.kod;
  const govde: OperasyonTipiGovdesi | Omit<OperasyonTipiGovdesi, 'kod'> = kayit && !kodDegisti ? ortak : { kod, ...ortak };
  const kodKilitli = kayit !== null && kullanim !== null && kullanim > 0;

  return (
    <KayitPenceresi
      baslik={kayit ? 'Operasyon tipi düzenle' : 'Yeni operasyon tipi'}
      kapat={kapat}
      kaydet={() => kaydet.mutate({ kayit, govde })}
      mesgul={mesgul}
      hata={hata}
    >
      <Girdi
        etiket="Kod"
        value={kod}
        onChange={(o) => kodYaz(o.target.value)}
        required
        maxLength={24}
        disabled={kodKilitli}
        ipucu={kodKilitli ? 'Rotada kullanıldığı için kod değiştirilemez.' : 'Büyük harfe çevrilir; rotada ya da iş emrinde kullanılınca değiştirilemez.'}
      />
      <Girdi etiket="Ad" value={ad} onChange={(o) => adYaz(o.target.value)} required />
      <Secim
        etiket="Grup"
        bosSecenek="Grup seçin"
        secenekler={OPERASYON_GRUP_SECENEKLERI}
        value={grup}
        onChange={(o) => grupYaz(o.target.value as OperasyonGrubu | '')}
        required
      />
      <Girdi etiket="Varsayılan hazırlık (dk)" inputMode="decimal" value={ayarDk} onChange={(o) => ayarDkYaz(o.target.value)} ipucu="Boşsa bilinmiyor." />
      <Girdi etiket="Varsayılan birim süre (dk)" inputMode="decimal" value={birimDk} onChange={(o) => birimDkYaz(o.target.value)} />
      <Secim
        etiket="Varsayılan istasyon"
        bosSecenek="Yok"
        secenekler={istasyonSecenekleri}
        value={istasyonId}
        onChange={(o) => istasyonIdYaz(o.target.value)}
      />
      <IsaretKutusu etiket="Aktif" checked={aktif} onChange={(o) => aktifYaz(o.target.checked)} />
    </KayitPenceresi>
  );
}

// Satır içi aktif/pasif: yalnız aktif ve okunan sürüm gider; gönderilmeyen alanlar sunucuda aynı kalır.
function useAktiflik() {
  const istemci = useQueryClient();
  const [hata, hataYaz] = useState<string | null>(null);
  const degistir = useMutation({
    mutationFn: (t: SurumluOperasyonTipi) => api.post(`/operasyon-tipleri/${t.id}/guncelle`, { ad: t.ad, grup: t.grup, aktif: !t.aktif, surum: t.surum }),
    onMutate: () => hataYaz(null),
    onSuccess: () => { void istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
    onError: (h) => hataYaz(hataIletisi(h, 'Durum değiştirilemedi.')),
  });
  return { degistir, hata };
}

export function OperasyonTipleri({ yazabilir }: { yazabilir: boolean }) {
  const [secili, seciliYaz] = useState<SurumluOperasyonTipi | 'yeni' | null>(null);
  const [ara, araYaz] = useState('');
  const [grup, grupYaz] = useState<OperasyonGrubu | ''>('');
  const liste = useQuery({
    queryKey: anahtarlar.operasyonTipleri,
    queryFn: () => api.get<OperasyonTipleriCevabi>('/operasyon-tipleri?pasifler=true'),
  });
  // Kullanım rotanındır (yürürlükteki ve açık revizyonlardaki adım sayısı); alınamazsa ya da tip listede yoksa bilinmiyor gösterilir, sıfır yazılmaz.
  const rota = useQuery({ queryKey: anahtarlar.rotaKullanimi, queryFn: () => api.get<SeceneklerCevabi>('/rota/secenekler') });
  const kullanimlar = new Map((rota.data?.operasyonTipleri ?? []).map((t) => [t.id, t.kullanim]));
  const kullanim = (t: SurumluOperasyonTipi): number | null => kullanimlar.get(t.id) ?? null;
  const aktiflik = useAktiflik();
  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" yenile={() => { void liste.refetch(); }} />;

  const gorunen = liste.data.operasyonTipleri.filter((t) => (grup === '' || t.grup === grup) && aramayaUyar(ara, [t.kod, t.ad]));
  const csv = () => csvIndir('operasyon-tipleri',
    ['Kod', 'Ad', 'Grup', 'Hazırlık dk', 'Birim dk', 'Rotada kullanım (adım)', 'Durum'],
    gorunen.map((t) => [t.kod, t.ad, OPERASYON_GRUP_ADLARI[t.grup],
      t.varsayilanAyarDk === null ? null : Number(t.varsayilanAyarDk), t.varsayilanBirimDk === null ? null : Number(t.varsayilanBirimDk),
      kullanim(t), t.aktif ? 'Aktif' : 'Pasif']));

  return (
    <>
      <ListeAraclari
        ara={ara}
        araYaz={araYaz}
        araIpucu="Kod, ad ya da kısaltma"
        suzgec={{ etiket: 'Grup', bosSecenek: 'Tüm gruplar', secenekler: OPERASYON_GRUP_SECENEKLERI, deger: grup, degistir: (d) => grupYaz(d as OperasyonGrubu | '') }}
        csv={csv}
        csvKapali={gorunen.length === 0}
        yeni={yazabilir ? { metin: 'Yeni operasyon tipi', ac: () => seciliYaz('yeni') } : undefined}
      />
      {aktiflik.hata && <p className="tc-ist-hata" role="alert">{aktiflik.hata}</p>}
      <Tablo
        etiket="Operasyon tipleri"
        satirlar={gorunen}
        satirAnahtari={(s) => s.id}
        satirSec={yazabilir ? seciliYaz : undefined}
        bosMesaj={liste.data.operasyonTipleri.length === 0 ? undefined : 'Aramaya uyan operasyon tipi yok.'}
        sutunlar={[
          { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (s) => s.kod },
          { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad },
          { anahtar: 'grup', baslik: 'Grup', hucre: (s) => OPERASYON_GRUP_ADLARI[s.grup] },
          { anahtar: 'kullanim', baslik: 'Rotada kullanım', hizala: 'sag', hucre: (s) => { const k = kullanim(s); return k === null ? 'Bilinmiyor' : `${k} adım`; } },
          yazabilir
            ? {
              anahtar: 'durum', baslik: 'Durum',
              hucre: (s) => (
                <Dugme
                  simge={s.aktif ? 'check' : 'pause'}
                  aria-label={`${s.kod} ${s.aktif ? 'pasife al' : 'aktif yap'}`}
                  disabled={aktiflik.degistir.isPending}
                  onClick={(o) => { o.stopPropagation(); aktiflik.degistir.mutate(s); }}
                  onKeyDown={(o) => o.stopPropagation()}
                >
                  {s.aktif ? 'Aktif' : 'Pasif'}
                </Dugme>
              ),
            }
            : durumSutunu<SurumluOperasyonTipi>(),
        ]}
      />
      {secili !== null && (
        <OperasyonTipiFormu
          key={secili === 'yeni' ? 'yeni' : secili.id}
          kayit={secili === 'yeni' ? null : secili}
          kullanim={secili === 'yeni' ? null : kullanim(secili)}
          kapat={() => seciliYaz(null)}
        />
      )}
    </>
  );
}
