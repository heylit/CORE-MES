import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { TakvimCevabi, TakvimKaydi, TakvimKaynagi } from '#paylasilan/sozlesme/takvim.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Sekmeler, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import type { Siralama } from '../../ortak/veri/liste-durumu.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KAYNAK_BILGISI, aramayaUyar, gecikti, kalanMetni, ozeteUyar, type OzetSuzgeci } from './kaynaklar.ts';
import {
  GUN_ADLARI, ayBasi, ayBasligi, ayEkle, ayIzgarasi, gunEkle, gunler, gunNo, haftaBasi, haftaBasligi, haftaGunu, tarihMetni,
} from './tarih.ts';
import './takvim.css';

// Görünümü kabuğun ikinci menüsü seçer (paylasilan/sayfalar/takvim.ts).
type Gorunum = 'takvim' | 'tablo' | 'kanban';
type Kip = 'ay' | 'hafta' | 'gundem';

// Özet, gündem, tablo ve kanban tek okumadır: son 61 gün ve gelecek 31 gün (sunucu sınırı 93 gün). Daha eskisi ay görünümünde gezilerek görülür.
const GERI_GUN = 61;
const ILERI_GUN = 31;
const AY_GUNDE_GOSTERILEN = 3;

function useTakvim(baslangic: string, bitis: string) {
  return useQuery({
    queryKey: anahtarlar.takvim(baslangic, bitis),
    queryFn: () => api.get<TakvimCevabi>(`/takvim?baslangic=${baslangic}&bitis=${bitis}`),
  });
}

const siraliTarih = (a: TakvimKaydi, b: TakvimKaydi): number => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : 0);
const kayitAnahtari = (k: TakvimKaydi): string => `${k.kaynak}:${k.kimlik}:${k.tarih}`;

function KalanRozeti({ kayit, bugun }: { kayit: TakvimKaydi; bugun: string }) {
  const k = kalanMetni(kayit, bugun);
  return <Rozet ton={k.ton}>{k.metin}</Rozet>;
}

function Ozet({ kayitlar, bugun, secili, sec }: { kayitlar: TakvimKaydi[]; bugun: string; secili: OzetSuzgeci | null; sec: (s: OzetSuzgeci | null) => void }) {
  const say = (s: OzetSuzgeci) => kayitlar.filter((k) => ozeteUyar(k, s, bugun)).length;
  const kartlar: { s: OzetSuzgeci; baslik: string; alt: string; ton?: 'hata' | 'uyari' }[] = [
    { s: 'gec', baslik: 'Geciken', alt: 'Tarihi geçmiş, kapanmamış', ton: 'hata' },
    { s: 'bugun', baslik: 'Bugün', alt: tarihMetni(bugun), ton: 'uyari' },
    { s: 'hafta', baslik: '7 gün içinde', alt: 'Bugün dahil' },
    { s: 'ay', baslik: '30 gün içinde', alt: 'Açık kayıtlar' },
  ];
  return (
    <div className="tc-takvim-ozet" role="group" aria-label="Özet">
      {kartlar.map((k) => {
        const n = say(k.s);
        return (
          <button key={k.s} type="button" className="tc-takvim-ozet-kart" data-ton={n > 0 ? k.ton : undefined} aria-pressed={secili === k.s}
            onClick={() => sec(secili === k.s ? null : k.s)}>
            <small>{k.baslik}</small><b>{n.toLocaleString('tr-TR')}</b><small>{k.alt}</small>
          </button>
        );
      })}
    </div>
  );
}

function KaynakSeridi({ veri, kapali, degistir }: { veri: TakvimCevabi; kapali: ReadonlySet<TakvimKaynagi>; degistir: (k: TakvimKaynagi) => void }) {
  const sayilar = new Map<TakvimKaynagi, number>();
  for (const k of veri.kayitlar) sayilar.set(k.kaynak, (sayilar.get(k.kaynak) ?? 0) + 1);
  return (
    <div className="tc-takvim-kaynaklar" role="group" aria-label="Kaynaklar">
      {veri.kaynaklar.map((k) => (
        <button key={k} type="button" className="tc-takvim-cip" data-kaynak={k} aria-pressed={!kapali.has(k)} onClick={() => degistir(k)}>
          <span className="tc-takvim-nokta" aria-hidden="true" />{KAYNAK_BILGISI[k].ad}<span className="mono">{sayilar.get(k) ?? 0}</span>
        </button>
      ))}
      {veri.bekleyenler.length > 0 && (
        <span title={veri.bekleyenler.map((k) => KAYNAK_BILGISI[k].ad).join(', ')}>
          <Rozet ton="pasif" gorunum="cizgi">{`${veri.bekleyenler.length} kaynak henüz bağlanmadı`}</Rozet>
        </span>
      )}
    </div>
  );
}

function OlayDugmesi({ kayit, bugun, ac }: { kayit: TakvimKaydi; bugun: string; ac: (k: TakvimKaydi) => void }) {
  const b = KAYNAK_BILGISI[kayit.kaynak];
  return (
    <button type="button" className="tc-takvim-olay" data-kaynak={kayit.kaynak} data-gec={gecikti(kayit, bugun) || undefined} data-bitti={kayit.bitti || undefined}
      title={`${b.ad}: ${kayit.baslik}${kayit.ilgili ? ` · ${kayit.ilgili}` : ''}`} onClick={() => ac(kayit)}>
      <span className="tc-takvim-nokta" aria-hidden="true" />
      <span className="tc-takvim-olay-metin">{kayit.no ?? kayit.baslik}{kayit.ilgili ? ` ${kayit.ilgili}` : ''}</span>
    </button>
  );
}

interface IzgaraOzellikleri {
  gunListesi: string[];
  ay: string | null;
  kayitlar: TakvimKaydi[];
  tatiller: Map<string, string | null>;
  bugun: string;
  ac: (k: TakvimKaydi) => void;
  haftayaGec: (gun: string) => void;
}

function Izgara({ gunListesi, ay, kayitlar, tatiller, bugun, ac, haftayaGec }: IzgaraOzellikleri) {
  const gunun = new Map<string, TakvimKaydi[]>();
  for (const k of kayitlar) gunun.set(k.tarih, [...(gunun.get(k.tarih) ?? []), k]);
  return (
    <div className="tc-takvim-izgara" data-kip={ay ? 'ay' : 'hafta'}>
      {ay && GUN_ADLARI.map((g) => <div key={g} className="tc-takvim-gb" aria-hidden="true">{g}</div>)}
      {gunListesi.map((g) => {
        const l = gunun.get(g) ?? [];
        const gosterilen = ay ? l.slice(0, AY_GUNDE_GOSTERILEN) : l;
        const tatil = tatiller.get(g);
        return (
          <div key={g} className="tc-takvim-gun" data-disi={(ay !== null && ayBasi(g) !== ay) || undefined} data-hs={haftaGunu(g) >= 5 || undefined}
            data-bugun={g === bugun || undefined} aria-label={tarihMetni(g)}>
            <div className="tc-takvim-gun-no"><span>{gunNo(g)}</span>{!ay && <span>{GUN_ADLARI[haftaGunu(g)]}</span>}</div>
            {tatil !== undefined && <div className="tc-takvim-tatil">{tatil ?? 'Resmi tatil'}</div>}
            <div className="tc-takvim-olaylar">{gosterilen.map((k) => <OlayDugmesi key={kayitAnahtari(k)} kayit={k} bugun={bugun} ac={ac} />)}</div>
            {ay && l.length > AY_GUNDE_GOSTERILEN && (
              <button type="button" className="tc-takvim-fazla" onClick={() => haftayaGec(g)}>{`+${l.length - AY_GUNDE_GOSTERILEN} daha`}</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Satir({ kayit, bugun, ac }: { kayit: TakvimKaydi; bugun: string; ac: (k: TakvimKaydi) => void }) {
  const b = KAYNAK_BILGISI[kayit.kaynak];
  const alt = [b.ad, kayit.ilgili, kayit.durum, gecikti(kayit, bugun) ? tarihMetni(kayit.tarih) : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" className="tc-takvim-satir" data-kaynak={kayit.kaynak} onClick={() => ac(kayit)}>
        <span className="tc-takvim-satir-simge"><Simge ad={b.simge} /></span>
        <span className="tc-takvim-satir-metin"><b>{kayit.baslik}</b><small>{alt}</small></span>
        <KalanRozeti kayit={kayit} bugun={bugun} />
      </button>
    </li>
  );
}

const BosDurum = () => (
  <div className="tc-takvim-bos"><Simge ad="calendar" /><b>Bu süzgeçte kayıt yok</b><span>Kaynak seçimini ya da aramayı değiştirin.</span></div>
);

function Gundem({ kayitlar, bugun, ac }: { kayitlar: TakvimKaydi[]; bugun: string; ac: (k: TakvimKaydi) => void }) {
  const acik = kayitlar.filter((k) => !k.bitti);
  if (acik.length === 0) return <BosDurum />;
  const gruplar = new Map<string, TakvimKaydi[]>();
  for (const k of acik) {
    const g = gecikti(k, bugun) ? 'gec' : k.tarih;
    gruplar.set(g, [...(gruplar.get(g) ?? []), k]);
  }
  const sira = [...gruplar.keys()].sort((a, b) => (a === 'gec' ? -1 : b === 'gec' ? 1 : a < b ? -1 : 1));
  return (
    <ul className="tc-takvim-gundem">
      {sira.map((g) => (
        <li key={g}>
          <div className="tc-takvim-gundem-bas" data-gec={g === 'gec' || undefined} data-bugun={g === bugun || undefined}>
            <span>{g === 'gec' ? 'Geciken' : `${tarihMetni(g)}${g === bugun ? ' · Bugün' : ''}`}</span>
            <span className="mono">{gruplar.get(g)!.length}</span>
          </div>
          <ul>{gruplar.get(g)!.map((k) => <Satir key={kayitAnahtari(k)} kayit={k} bugun={bugun} ac={ac} />)}</ul>
        </li>
      ))}
    </ul>
  );
}

type SiralamaAlani = 'tarih' | 'kaynak' | 'no' | 'ilgili' | 'durum';
const KAYNAK_SIRASI = Object.keys(KAYNAK_BILGISI);
const SIRALAMA_DEGERI: Record<SiralamaAlani, (k: TakvimKaydi) => string | number> = {
  tarih: (k) => k.tarih,
  kaynak: (k) => KAYNAK_SIRASI.indexOf(k.kaynak),
  no: (k) => k.no ?? k.baslik,
  ilgili: (k) => k.ilgili ?? '',
  durum: (k) => k.durum,
};

function TabloGorunumu({ kayitlar, bugun, ac, ara, araYaz }: { kayitlar: TakvimKaydi[]; bugun: string; ac: (k: TakvimKaydi) => void; ara: string; araYaz: (a: string) => void }) {
  const [bitenler, bitenlerYaz] = useState(false);
  const [siralama, siralamaYaz] = useState<Siralama | null>({ alan: 'tarih', yon: 'artan' });
  const satirlar = useMemo(() => {
    const l = kayitlar.filter((k) => bitenler || !k.bitti);
    const s = siralama ?? { alan: 'tarih', yon: 'artan' as const };
    const deger = SIRALAMA_DEGERI[s.alan as SiralamaAlani] ?? SIRALAMA_DEGERI.tarih;
    const yon = s.yon === 'artan' ? 1 : -1;
    return [...l].sort((a, b) => {
      const x = deger(a);
      const y = deger(b);
      return (x < y ? -1 : x > y ? 1 : siraliTarih(a, b)) * yon;
    });
  }, [kayitlar, bitenler, siralama]);
  const sutunlar: Sutun<TakvimKaydi>[] = [
    { anahtar: 'tarih', baslik: 'Tarih', mono: true, kirilmaz: true, sirala: true, hucre: (k) => tarihMetni(k.tarih), csv: (k) => k.tarih },
    {
      anahtar: 'kaynak', baslik: 'Kaynak', sirala: true, csv: (k) => KAYNAK_BILGISI[k.kaynak].ad,
      hucre: (k) => <span className="tc-takvim-kaynak" data-kaynak={k.kaynak}><span className="tc-takvim-nokta" aria-hidden="true" />{KAYNAK_BILGISI[k.kaynak].ad}</span>,
    },
    { anahtar: 'no', baslik: 'Kayıt', sirala: true, hucre: (k) => k.baslik, csv: (k) => k.baslik },
    { anahtar: 'ilgili', baslik: 'İlgili', sirala: true, hucre: (k) => k.ilgili ?? '—', csv: (k) => k.ilgili },
    { anahtar: 'durum', baslik: 'Durum', sirala: true, hucre: (k) => k.durum },
    { anahtar: 'kalan', baslik: 'Kalan', kirilmaz: true, hucre: (k) => <KalanRozeti kayit={k} bugun={bugun} />, csv: (k) => kalanMetni(k, bugun).metin },
  ];
  return (
    <Tablo etiket="Takvim kayıtları" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={kayitAnahtari} satirSec={ac}
      siralama={siralama} siralamaDegistir={siralamaYaz} bosMesaj="Bu süzgeçte kayıt yok"
      arac={{
        arama: { deger: ara, degistir: araYaz, etiket: 'Ara', yerTutucu: 'No, firma, kişi ara' },
        csv: { ad: 'takvim', satirlar },
        sag: <IsaretKutusu etiket="Bitenleri göster" checked={bitenler} onChange={(o) => bitenlerYaz(o.target.checked)} />,
      }} />
  );
}

type KanbanGrubu = 'zaman' | 'kaynak';

function Kanban({ kayitlar, kaynaklar, bugun, ac }: { kayitlar: TakvimKaydi[]; kaynaklar: TakvimKaynagi[]; bugun: string; ac: (k: TakvimKaydi) => void }) {
  const [grup, grupYaz] = useState<KanbanGrubu>('zaman');
  const acik = kayitlar.filter((k) => !k.bitti);
  const pzt = haftaBasi(bugun);
  const sutunlar: { anahtar: string; ad: string; kaynak?: TakvimKaynagi; gec?: boolean; uyar: (k: TakvimKaydi) => boolean }[] = grup === 'zaman'
    ? [
      { anahtar: 'gec', ad: 'Geciken', gec: true, uyar: (k) => gecikti(k, bugun) },
      { anahtar: 'bugun', ad: 'Bugün', uyar: (k) => k.tarih === bugun },
      { anahtar: 'hafta', ad: 'Bu hafta', uyar: (k) => k.tarih > bugun && k.tarih < gunEkle(pzt, 7) },
      { anahtar: 'gelecek', ad: 'Gelecek hafta', uyar: (k) => k.tarih > bugun && k.tarih >= gunEkle(pzt, 7) && k.tarih < gunEkle(pzt, 14) },
      { anahtar: 'sonra', ad: 'Sonra', uyar: (k) => k.tarih > bugun && k.tarih >= gunEkle(pzt, 14) },
    ]
    : kaynaklar.map((k) => ({ anahtar: k, ad: KAYNAK_BILGISI[k].ad, kaynak: k, uyar: (x: TakvimKaydi) => x.kaynak === k }));
  return (
    <div className="tc-takvim-kanban-kap">
      <Sekmeler etiket="Grupla" sekmeler={[{ anahtar: 'zaman', baslik: 'Zamana göre' }, { anahtar: 'kaynak', baslik: 'Kaynağa göre' }]} secili={grup} sec={grupYaz} />
      {sutunlar.length === 0 ? <BosDurum /> : (
        <div className="tc-takvim-kanban">
          {sutunlar.map((s) => {
            const l = acik.filter(s.uyar);
            return (
              <section key={s.anahtar} className="tc-takvim-sutun" data-kaynak={s.kaynak} data-gec={s.gec || undefined} aria-label={s.ad}>
                <header>
                  {s.kaynak ? <Simge ad={KAYNAK_BILGISI[s.kaynak].simge} /> : s.gec ? <Simge ad="alert" /> : null}
                  <span>{s.ad}</span><span className="mono">{l.length}</span>
                </header>
                <div className="tc-takvim-sutun-govde">
                  {l.length === 0 ? <div className="tc-takvim-sutun-bos">Kayıt yok</div> : l.map((k) => (
                    <button key={kayitAnahtari(k)} type="button" className="tc-takvim-kk" data-kaynak={k.kaynak} onClick={() => ac(k)}>
                      <span className="tc-takvim-kk-ust"><Simge ad={KAYNAK_BILGISI[k.kaynak].simge} />{KAYNAK_BILGISI[k.kaynak].ad}<span className="mono">{tarihMetni(k.tarih)}</span></span>
                      <b>{k.baslik}</b>
                      <small>{[k.ilgili, k.durum].filter(Boolean).join(' · ')}</small>
                      <span><KalanRozeti kayit={k} bugun={bugun} /></span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Ayrinti({ kayit, bugun, kapat }: { kayit: TakvimKaydi | null; bugun: string; kapat: () => void }) {
  const gezin = useNavigate();
  if (!kayit) return null;
  const b = KAYNAK_BILGISI[kayit.kaynak];
  const satirlar: [string, string][] = [['Kaynak', b.ad], ['Tarih', tarihMetni(kayit.tarih)], ['Durum', kayit.durum]];
  if (kayit.no) satirlar.push(['No', kayit.no]);
  if (kayit.ilgili) satirlar.push(['İlgili', kayit.ilgili]);
  return (
    <Pencere acik kapat={kapat} baslik={kayit.baslik} tur="yan"
      alt={(
        <>
          <Dugme tur="birincil" simge="expand" onClick={() => { kapat(); void gezin(b.yol(kayit)); }}>{`${b.modul} ekranında aç`}</Dugme>
          <Dugme onClick={kapat}>Kapat</Dugme>
        </>
      )}>
      <div className="tc-takvim-ayrinti" data-kaynak={kayit.kaynak}>
        <div><KalanRozeti kayit={kayit} bugun={bugun} /></div>
        <dl>{satirlar.map(([a, d]) => <div key={a}><dt>{a}</dt><dd>{d}</dd></div>)}</dl>
        <p className="tc-takvim-not">{`Bu tarih ${b.modul} modülünden okunur. Takvim tarihi değiştirmez; değişiklik kaydın kendi ekranında yapılır.`}</p>
      </div>
    </Pencere>
  );
}

const KIPLER = [{ anahtar: 'ay', baslik: 'Ay' }, { anahtar: 'hafta', baslik: 'Hafta' }, { anahtar: 'gundem', baslik: 'Gündem' }] as const;
const ilkKip = (): Kip => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'gundem' : 'ay');

export function Takvim({ gorunum = 'takvim' }: { gorunum?: Gorunum }) {
  const bugun = tesisGunu(Date.now());
  const [kip, kipYaz] = useState<Kip>(ilkKip);
  const [ay, ayYaz] = useState(() => ayBasi(bugun));
  const [hafta, haftaYaz] = useState(() => haftaBasi(bugun));
  const [kapali, kapaliYaz] = useState<ReadonlySet<TakvimKaynagi>>(new Set());
  const [ara, araYaz] = useState('');
  const [ozet, ozetYaz] = useState<OzetSuzgeci | null>(null);
  const [secili, seciliYaz] = useState<TakvimKaydi | null>(null);

  const pencere = useTakvim(gunEkle(bugun, -GERI_GUN), gunEkle(bugun, ILERI_GUN));
  const izgaraAraligi = kip === 'hafta' ? { baslangic: hafta, bitis: gunEkle(hafta, 6) } : ayIzgarasi(ay);
  const izgaraAcik = gorunum === 'takvim' && kip !== 'gundem';
  const izgara = useQuery({
    queryKey: anahtarlar.takvim(izgaraAraligi.baslangic, izgaraAraligi.bitis),
    queryFn: () => api.get<TakvimCevabi>(`/takvim?baslangic=${izgaraAraligi.baslangic}&bitis=${izgaraAraligi.bitis}`),
    enabled: izgaraAcik,
  });

  const suz = (l: TakvimKaydi[], ozetle: boolean) =>
    l.filter((k) => !kapali.has(k.kaynak) && aramayaUyar(k, ara) && (!ozetle || ozet === null || ozeteUyar(k, ozet, bugun)));
  const kaynakDegistir = (k: TakvimKaynagi) => kapaliYaz((o) => {
    const y = new Set(o);
    if (y.has(k)) y.delete(k); else y.add(k);
    return y;
  });
  const ozetSec = (s: OzetSuzgeci | null) => {
    ozetYaz(s);
    if (s !== null && gorunum === 'takvim') kipYaz('gundem');
  };
  const git = (n: number) => {
    if (kip === 'ay') ayYaz(n === 0 ? ayBasi(bugun) : ayEkle(ay, n));
    else haftaYaz(n === 0 ? haftaBasi(bugun) : gunEkle(hafta, 7 * n));
  };
  const haftayaGec = (g: string) => { haftaYaz(haftaBasi(g)); kipYaz('hafta'); };

  if (pencere.isPending) return <Kart baslik="Takvim"><DurumKutusu durum="yukleniyor" /></Kart>;
  if (pencere.isError) return <Kart baslik="Takvim"><DurumKutusu durum="hata" yenile={() => { void pencere.refetch(); }} /></Kart>;
  const veri = pencere.data;
  const tumu = suz(veri.kayitlar, false);
  const gosterilen = suz(veri.kayitlar, true).sort(siraliTarih);

  let icerik;
  if (gorunum === 'tablo') {
    icerik = <TabloGorunumu kayitlar={gosterilen} bugun={bugun} ac={seciliYaz} ara={ara} araYaz={araYaz} />;
  } else if (gorunum === 'kanban') {
    icerik = <Kanban kayitlar={gosterilen} kaynaklar={veri.kaynaklar.filter((k) => !kapali.has(k))} bugun={bugun} ac={seciliYaz} />;
  } else if (kip === 'gundem') {
    icerik = <Gundem kayitlar={gosterilen} bugun={bugun} ac={seciliYaz} />;
  } else if (izgara.isPending) {
    icerik = <DurumKutusu durum="yukleniyor" />;
  } else if (izgara.isError) {
    icerik = <DurumKutusu durum="hata" yenile={() => { void izgara.refetch(); }} />;
  } else {
    icerik = (
      <Izgara gunListesi={gunler(izgaraAraligi.baslangic, izgaraAraligi.bitis)} ay={kip === 'ay' ? ay : null} kayitlar={suz(izgara.data.kayitlar, true)}
        tatiller={new Map(izgara.data.tatiller.map((t) => [t.tarih, t.ad]))} bugun={bugun} ac={seciliYaz} haftayaGec={haftayaGec} />
    );
  }

  return (
    <Kart baslik="Takvim" simge="calendar">
      <div className="tc-takvim">
        <p className="tc-takvim-not">Siparişlerin, ölçü aletlerinin, denetimlerin, izinlerin, vergi beyanlarının ve planlı duruşların tarihleri tek yerde. Yalnız okuma yetkiniz olan kaynaklar görünür.</p>
        <Ozet kayitlar={tumu} bugun={bugun} secili={ozet} sec={ozetSec} />
        <KaynakSeridi veri={veri} kapali={kapali} degistir={kaynakDegistir} />
        {gorunum !== 'tablo' && (
          <div className="tc-takvim-arac">
            <Girdi etiket="Ara" type="search" placeholder="No, firma, kişi ara" value={ara} onChange={(o) => araYaz(o.target.value)} />
            {gorunum === 'takvim' && (
              <div className="tc-takvim-gezinti">
                {kip !== 'gundem' && (
                  <>
                    <Dugme simge="chev-left" aria-label="Önceki" onClick={() => git(-1)} />
                    <Dugme onClick={() => git(0)}>Bugün</Dugme>
                    <Dugme simge="chev-right" aria-label="Sonraki" onClick={() => git(1)} />
                    <b className="tc-takvim-donem">{kip === 'ay' ? ayBasligi(ay) : haftaBasligi(hafta)}</b>
                  </>
                )}
                <Sekmeler etiket="Görünüm" sekmeler={KIPLER} secili={kip} sec={kipYaz} />
              </div>
            )}
          </div>
        )}
        {ozet !== null && (
          <div><Dugme simge="x" onClick={() => ozetYaz(null)}>Özet süzgecini kaldır</Dugme></div>
        )}
        {icerik}
      </div>
      <Ayrinti kayit={secili} bugun={bugun} kapat={() => seciliYaz(null)} />
    </Kart>
  );
}

export const TakvimTablo = () => <Takvim gorunum="tablo" />;
export const TakvimKanban = () => <Takvim gorunum="kanban" />;
