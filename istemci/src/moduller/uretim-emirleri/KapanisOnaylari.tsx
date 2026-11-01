import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import type {
  KapanisAsamasi, KapanisCevabi, KapanisListeCevabi, KapanisListeSatiri, KapanisMaddesi, KapanisOnayi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, Kart, Rozet, Secim, Simge, Tablo, useBildirim, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import {
  KAPANIS_YETKISI, MADDE_ADI, MADDE_HALI, SERITLER, beklemeGunu, defterMetni, eksikMaddeler, kisaZaman, kuyrukAsamasi,
  seritSirasi, sonucMetni, ustRozet,
} from './kapanis.ts';
import './uretim-emirleri.css';

// Uç yolları tek yerde (K1): liste, emrin kapanışı ve komutları.
const LISTE_UCU = '/kapanislar';
const kapanisUcu = (id: number) => `/adimli-emirler/${String(id)}/kapanis`;

// Süzgeç: onay veren kişi açılışta kendi onayını bekleyenleri görür; planlama bütün açık kapanışları.
type Gorunum = 'bekleyen' | 'acik' | 'tamam';

// Onay emrin evinde (Reçete ve Rota) verilir (1416 a); orası `duzenlenir` verir. Üretim Emirleri'ndeki aynı liste salt okumadır ve
// onay verecek kişiyi seçili emirle oraya yönlendirir.
export const KAPANIS_EVI = '/recete-rota/kapanis';

export function KapanisOnaylari({ duzenlenir = false }: { duzenlenir?: boolean }) {
  const oturum = useOturum();
  const yonlendir = useNavigate();
  const islemler = (oturum.data?.islemler ?? []) as readonly string[];
  const onayVerir = (t: KapanisOnayi) => islemler.includes(KAPANIS_YETKISI[t]);
  const yetkili = (t: KapanisOnayi) => duzenlenir && onayVerir(t);
  const onayci = onayVerir('kalite') || onayVerir('mudur');
  const [adres, adresYaz] = useSearchParams();
  const secili = Number(adres.get('emir')) || null;
  // Seçilmemişse rolden gelir; oturum gelmeden karar verilmez (yoksa onay veren kişi açılışta bütün listeyi görürdü).
  const [secim, gorunumYaz] = useState<Gorunum | null>(null);
  const gorunum: Gorunum = secim ?? (onayci ? 'bekleyen' : 'acik');
  const [ara, araYaz] = useState('');
  const [sayfa, sayfaYaz] = useState(1);
  const asama: KapanisAsamasi | '' = gorunum === 'tamam' ? 'tamam' : gorunum === 'bekleyen' ? 'onay' : '';
  const liste = useQuery({
    queryKey: anahtarlar.kapanislar(asama, ara.trim(), sayfa),
    queryFn: () => {
      const q = new URLSearchParams({ sayfa: String(sayfa) });
      if (asama !== '') q.set('asama', asama);
      if (ara.trim() !== '') q.set('ara', ara.trim());
      return api.get<KapanisListeCevabi>(`${LISTE_UCU}?${q.toString()}`);
    },
    enabled: oturum.data !== undefined,
    placeholderData: (onceki) => onceki,
  });
  const sec = (id: number) => { adresYaz((a) => { const y = new URLSearchParams(a); y.set('emir', String(id)); return y; }, { replace: true }); };
  const satirlar = (liste.data?.satirlar ?? []).filter((r) => gorunum !== 'bekleyen' || r.bekleyenOnaylar.some(onayVerir));
  const evdeAc = () => { void yonlendir(secili === null ? KAPANIS_EVI : `${KAPANIS_EVI}?emir=${String(secili)}`); };
  const simdi = new Date();
  const sutunlar: Sutun<KapanisListeSatiri>[] = [
    { anahtar: 'emir', baslik: 'Emir', mono: true, kirilmaz: true, hucre: (r) => (
      <span className={r.uretimEmriId === secili ? 'tc-kapanis-secili' : undefined} aria-current={r.uretimEmriId === secili ? 'true' : undefined}>{r.emirNo}</span>
    ) },
    { anahtar: 'parca', baslik: 'Parça', hucre: (r) => <>{r.urun.ad}{r.saglamAdet === 0 && <> <Rozet ton="uyari">Sağlamı yok</Rozet></>}</> },
    { anahtar: 'adet', baslik: 'Sağlam / adet', hizala: 'sag', hucre: (r) => `${String(r.saglamAdet)} / ${String(r.adet)}` },
    { anahtar: 'asama', baslik: 'Aşama', hucre: (r) => <Rozet ton={r.asama === 'tamam' ? 'tamam' : r.asama === 'belge' ? 'uyari' : 'bilgi'}>{kuyrukAsamasi(r)}</Rozet> },
    { anahtar: 'bekleme', baslik: 'Bekleme', hizala: 'sag', hucre: (r) => (r.asama === 'tamam' ? null : `${String(beklemeGunu(r.bitis, simdi))} gün`) },
  ];
  const suzgecler = [
    ...(onayci ? [{ deger: 'bekleyen', baslik: 'Onayımı bekleyen' }] : []),
    { deger: 'acik', baslik: 'Açık kapanışlar' }, { deger: 'tamam', baslik: 'Tamamlananlar' },
  ];

  return (
    <div className="tc-kapanis">
      <Kart baslik="Kapanış onayları" simge="clipboard-check"
        sag={onayci && !duzenlenir
          ? <Dugme simge="tool" onClick={evdeAc}>Reçete ve Rota'da onayla</Dugme>
          : <span className="tc-emir-not">{onayci ? 'Onayınızı bekleyenler' : 'Bütün kapanışları görürsünüz, onay vermezsiniz.'}</span>}>
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Kapanışlar alınamadı.')} yenile={() => { void liste.refetch(); }} />}
        {liste.data && (
          <Tablo etiket="Onay kuyruğu" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(r) => r.uretimEmriId}
            satirSec={(r) => sec(r.uretimEmriId)} mesgul={liste.isPlaceholderData}
            bosMesaj={gorunum === 'bekleyen' ? 'Onayınızı bekleyen kapanış yok.' : 'Kapanış yok.'}
            arac={{
              arama: { deger: ara, degistir: (d) => { araYaz(d); sayfaYaz(1); }, etiket: 'Emir ara', yerTutucu: 'Emir no ya da parça' },
              suzgec: { etiket: 'Kapanışlar', secenekler: suzgecler, secili: gorunum, sec: (d) => { gorunumYaz(d as Gorunum); sayfaYaz(1); } },
            }}
            // "Onayımı bekleyen" sunucunun onay aşamasından kişinin rolüne göre süzülür; sayfa toplamı ona uymadığı için sayfalama yalnız öbür görünümlerdedir.
            sayfalama={gorunum === 'bekleyen' ? undefined : { sayfa: liste.data.sayfa, sayfaBoyu: liste.data.sayfaBoyu, toplam: liste.data.toplam, degistir: sayfaYaz, etiket: 'Kapanış sayfaları' }} />
        )}
        <p className="tc-emir-not">
          {onayci && !duzenlenir ? "Satıra tıklayınca emrin kapanışı aşağıda açılır; onay Reçete ve Rota'da verilir." : 'Satıra tıklayınca emrin kapanışı aşağıda açılır.'}
        </p>
      </Kart>
      {secili !== null && <SeciliKapanis id={secili} yetkili={yetkili} />}
    </div>
  );
}

function SeciliKapanis({ id, yetkili }: { id: number; yetkili: (t: KapanisOnayi) => boolean }) {
  const k = useQuery({ queryKey: anahtarlar.kapanis(id), queryFn: () => api.get<KapanisCevabi>(kapanisUcu(id)) });
  if (k.isPending) return <Kart baslik="Seçili emrin kapanışı"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (k.isError) {
    return (
      <Kart baslik="Seçili emrin kapanışı">
        <DurumKutusu durum="hata" mesaj={hataIletisi(k.error, 'Kapanış alınamadı.')} yenile={() => { void k.refetch(); }} />
      </Kart>
    );
  }
  return <KapanisAyrintisi k={k.data} yetkili={yetkili} />;
}

function KapanisAyrintisi({ k, yetkili }: { k: KapanisCevabi; yetkili: (t: KapanisOnayi) => boolean }) {
  const ust = ustRozet(k);
  const sira = seritSirasi(k.asama);
  const eksik = eksikMaddeler(k);
  const muafNotu = new Map(k.muafiyetler.map((m) => [m.madde, m.gerekce]));
  return (
    <Kart baslik={`${k.emirNo} · ${k.urun.ad}`} baslikEki={<Rozet ton={ust.ton}>{ust.metin}</Rozet>}>
      <p className="tc-emir-kod">{EMIR_TURU_ADLARI[k.emirTuru]} · {k.adet} adet · sağlam {k.saglamAdet}</p>
      <h3 className="tc-kapanis-alt">Seçili emrin kapanışı</h3>
      <ol className="tc-kapanis-seritler" aria-label="Kapanış adımları">
        {SERITLER.map((s, j) => {
          const hal = j < sira ? 'bitti' : j === sira ? 'simdi' : 'sonra';
          return (
            <li key={s.anahtar} className={`tc-kapanis-serit tc-kapanis-serit-${hal}`} aria-current={hal === 'simdi' ? 'step' : undefined}>
              <b>{hal === 'bitti' && <Simge ad="check" boyut="k" />}{s.anahtar === 'tamam' && k.sonuc !== null ? sonucMetni(k.sonuc) : s.ad}</b>
              <small>{s.anahtar === 'uretim' ? kisaZaman(k.bitis) : s.alt}</small>
            </li>
          );
        })}
      </ol>
      {k.eski ? (
        <p className="tc-emir-not" role="status">Bu emir kapanış onayından önce bitti; onaysız tamamlandı sayıldı, maddeleri ve onayları yok.</p>
      ) : (
        <>
          <Tablo etiket="Kapanış maddeleri" satirlar={k.maddeler} satirAnahtari={(m) => m.madde} bosMesaj="Madde yok" sutunlar={[
            { anahtar: 'madde', baslik: 'Madde', hucre: (m) => MADDE_ADI[m.madde].ad },
            { anahtar: 'durum', baslik: 'Durum', hucre: (m) => <Rozet ton={MADDE_HALI[m.durum].ton}>{MADDE_HALI[m.durum].metin}</Rozet> },
            { anahtar: 'ayrinti', baslik: 'Ayrıntı', hucre: (m) => {
                const muaf = muafNotu.get(m.madde);
                const metin = [m.ayrinti, muaf === undefined ? null : `muaf: ${muaf}`].filter(Boolean).join(' · ');
                return metin === '' ? null : metin;
              } },
            { anahtar: 'sahip', baslik: 'Veren modül', hucre: (m) => <span className="tc-emir-not">{MADDE_ADI[m.madde].sahip}</span> },
          ]} />
          <p className="tc-emir-not">
            {eksik.length > 0
              ? `${String(eksik.length)} madde eksik: kapanış onaya açılmaz. Madde sahibi modülde tamamlanınca kendiliğinden güncellenir; yalnız müdür gerekçe yazarak muaf tutabilir.`
              : '"Bilinmiyor" madde kapanışı durdurmaz, uyarı olarak görünür.'}
          </p>
        </>
      )}
      <div className="tc-kapanis-iki">
        <OnayKutusu k={k} tur="kalite" yetkili={yetkili('kalite')} />
        <OnayKutusu k={k} tur="mudur" yetkili={yetkili('mudur')} />
      </div>
      <h3 className="tc-kapanis-alt">Kapanış defteri</h3>
      <ol className="tc-kapanis-defter">
        <li><time dateTime={k.bitis}>{kisaZaman(k.bitis)}</time>Son adım bitti: emir "Üretimi bitti", kapanış kaydı açıldı.</li>
        {k.defter.map((s, i) => <li key={`${s.zaman}-${String(i)}`}><time dateTime={s.zaman}>{kisaZaman(s.zaman)}</time>{defterMetni(s)}</li>)}
      </ol>
    </Kart>
  );
}

type Komut = 'onay' | 'ret' | 'muaf' | 'geri-ac';
const KOMUT_YOLU: Readonly<Record<KapanisOnayi, Record<Komut, string | null>>> = {
  kalite: { onay: 'kalite-onay', ret: 'kalite-ret', muaf: null, 'geri-ac': null },
  mudur: { onay: 'mudur-onay', ret: 'mudur-ret', muaf: 'muaf', 'geri-ac': 'geri-ac' },
};
const BASARI: Readonly<Record<Komut, string>> = { onay: 'Onay verildi.', ret: 'Geri gönderildi; verilmiş onaylar düştü.', muaf: 'Madde muaf tutuldu.', 'geri-ac': 'Emir geri açıldı; iki onay yeniden gerekir.' };

function OnayKutusu({ k, tur, yetkili }: { k: KapanisCevabi; tur: KapanisOnayi; yetkili: boolean }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const [not, notYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const eksik = eksikMaddeler(k);
  const [madde, maddeYaz] = useState<KapanisMaddesi | ''>('');
  const komut = useMutation({
    mutationFn: ({ ad, govde }: { ad: Komut; govde: Record<string, unknown> }) =>
      api.post<KapanisCevabi>(`${kapanisUcu(k.uretimEmriId)}/${KOMUT_YOLU[tur][ad] ?? ''}`, { ...govde, surum: k.surum }),
    onSuccess: async (_c, { ad }) => {
      bildir('tamam', BASARI[ad]);
      notYaz(''); hataYaz(null); maddeYaz('');
      await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi });
    },
    // Sürüm çakışmasında güncel kayıt yeniden okunur: başkası araya girdiyse kişi yeni hali görür.
    onError: async (x) => { bildir('hata', hataIletisi(x, 'Komut işlenemedi.')); await istemci.invalidateQueries({ queryKey: anahtarlar.kapanis(k.uretimEmriId) }); },
  });
  const gerekceyle = (ad: Komut, ek: Record<string, unknown> = {}) => {
    if (not.trim() === '') { hataYaz('Gerekçe yaz.'); return; }
    komut.mutate({ ad, govde: { gerekce: not.trim(), ...ek } });
  };
  const o = k.onaylar[tur];
  const baslik = tur === 'kalite' ? 'Kalite onayı' : 'Müdür onayı';
  const notAlani = (etiket: string, yerTutucu: string) => (
    <CokSatir etiket={etiket} placeholder={yerTutucu} rows={2} value={not} hata={hata ?? undefined}
      onChange={(e) => { notYaz(e.target.value); hataYaz(null); }} />
  );
  let ic;
  if (o !== null) {
    ic = <p className="tc-kapanis-onaylandi"><Simge ad="check" boyut="k" />{o.kisiAdi ?? `Kişi ${String(o.kisiId)}`} onayladı. <time dateTime={o.zaman}>{kisaZaman(o.zaman)}</time></p>;
  } else if (k.asama === 'onay' && yetkili) {
    ic = (
      <>
        {notAlani(`${baslik} notu`, 'Not (ret için zorunlu)')}
        <div className="tc-emir-ust">
          <Dugme tur="birincil" simge="check" yukleniyor={komut.isPending && komut.variables?.ad === 'onay'} disabled={komut.isPending}
            onClick={() => komut.mutate({ ad: 'onay', govde: { not: not.trim() === '' ? null : not.trim() } })}>
            {tur === 'kalite' ? 'Kaliteyi onayla' : 'Müdür olarak onayla'}
          </Dugme>
          <Dugme tur="tehlike" simge="x" disabled={komut.isPending} onClick={() => gerekceyle('ret')}>Geri gönder</Dugme>
        </div>
      </>
    );
  } else if (k.asama === 'belge') {
    ic = <p className="tc-emir-not">Maddeler tamamlanınca onaya açılır.</p>;
  } else if (k.asama === 'onay') {
    ic = <p className="tc-emir-not">{tur === 'kalite' ? 'Kalite' : 'Müdür'} rolündeki kişi onaylar.</p>;
  }
  const muafAcik = tur === 'mudur' && yetkili && k.asama === 'belge' && eksik.length > 0;
  const geriAcAcik = tur === 'mudur' && yetkili && k.asama === 'tamam';
  const muafMaddesi = eksik.length === 1 ? eksik[0] : madde;
  return (
    <section className="tc-kapanis-onay" aria-label={baslik}>
      <h3 className="tc-kapanis-alt"><Simge ad={tur === 'kalite' ? 'clipboard-check' : 'user'} boyut="k" />{baslik}</h3>
      {ic}
      {muafAcik && (
        <>
          {eksik.length > 1 && (
            <Secim etiket="Muaf tutulacak madde" bosSecenek="Seçiniz" value={madde} onChange={(e) => maddeYaz(e.target.value as KapanisMaddesi | '')}
              secenekler={eksik.map((m) => ({ deger: m, baslik: MADDE_ADI[m].ad }))} />
          )}
          {notAlani('Muafiyet gerekçesi', 'Muafiyet gerekçesi (zorunlu)')}
          <div className="tc-emir-ust">
            <Dugme simge="lock" disabled={komut.isPending || muafMaddesi === '' || muafMaddesi === undefined}
              onClick={() => { if (muafMaddesi) gerekceyle('muaf', { madde: muafMaddesi }); }}>Eksik maddeyi gerekçeyle muaf tut</Dugme>
          </div>
        </>
      )}
      {geriAcAcik && (
        <>
          {notAlani('Geri açma gerekçesi', 'Geri açma gerekçesi (zorunlu)')}
          <div className="tc-emir-ust">
            <Dugme simge="rotate" disabled={komut.isPending} onClick={() => gerekceyle('geri-ac')}>Gerekçeyle geri aç</Dugme>
          </div>
        </>
      )}
    </section>
  );
}
