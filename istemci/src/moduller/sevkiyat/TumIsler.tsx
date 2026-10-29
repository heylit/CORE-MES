// Sevkiyat · Tüm işler (960, prototip 7.1): sevke ya da almaya aday bütün kalemler. Tablo kalemi yalnız serbest bırakır; sevkiyat
// "Sevk et" ya da "Al" ile tetikler; depo son çıkışı ya da kabulü yapar ve stok orada oynar. Yetki ve aşama sunucudadır; düğme
// yalnız işlemi olana görünür.
import { Fragment, useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { KalemKaynagi, SonYazanYeri, Tasima, TumIsAsamasi, TumIsSatiri } from '#paylasilan/sozlesme/sevkiyat.ts';
import { CokSatir, Dugme, DurumKutusu, Pencere, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import '../../ortak/arayuz/sayfa-basligi.css';
import '../../ortak/arayuz/tablo.css';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { bugun as bugunGetir, sayiMetni, tarihMetni } from './bicim.ts';
import {
  ASAMALAR, ASAMA_SIRASI, DONEMLER, GIDIS_CIKMADI, KALEM_SAHIBI, KAYNAK, KAYNAKLAR, OZETLER, adayMi, depoDurumu, donemAraligi, fark, farkYaz,
  geciktiMi, gecKalacakMi, gidisCiktiMi, gorunumde, gunu, kapali, kisaTarih, rozetOf, suz, tetiklenebilir, uzunTarih,
  type Donem, type Gorunum, type Gruplama, type Hazirlik, type Ozet, type Suzgec, type Yon,
} from './tum-isler.ts';
import { ElleIsFormu } from './ElleIsFormu.tsx';
import { kabulYolu, useDepoCikisi, useKalemKomutu, useTumIsler, useYetki } from './veri.ts';
import './sevkiyat.css';
import './tum-isler.css';

const YON_ADI: Record<Yon, { etiket: string; tetik: string; simge: 'upload' | 'download'; aciklama: string }> = {
  gidis: { etiket: 'Giden', tetik: 'Sevk et', simge: 'upload', aciklama: 'Biz götürürüz: sevkiyat "Sevk et" der, depo son çıkışı yapar' },
  gelis: { etiket: 'Gelen', tetik: 'Al', simge: 'download', aciklama: 'Biz gidip alırız: sevkiyat "Al" der, depo kabulü yapar' },
};
const YER_ADI: Record<SonYazanYeri, string> = { 'tum-isler': 'Tüm işler', 'satin-alma': 'Satın alma siparişi teslim yöntemi', sevkiyat: 'Sevkiyat', otomatik: 'Otomatik (eski kayıt)' };
const ilkHali = { hazirlik: new Set<Hazirlik>(['hazir', 'gelecek']), asamalar: new Set<TumIsAsamasi>(ASAMALAR.filter((a) => a.kod !== 'tamamlandi').map((a) => a.kod)) };
// Genel aramadan gelen (932 a, `?ara=<emir no>&gorunum=`): o emrin bütün kalemleri görünsün diye dönem ve durum süzgeçleri açılır.
const aramadanGelen = (p: URLSearchParams): { ara: string; gorunum: Gorunum } | null => {
  const ara = p.get('ara')?.trim() ?? '';
  return ara === '' ? null : { ara, gorunum: p.get('gorunum') === 'sevkiyat' ? 'sevkiyat' : 'karar' };
};
const butunAsamalar = (): Set<TumIsAsamasi> => new Set(ASAMALAR.map((a) => a.kod));
const kartKipi = (): boolean => { try { return window.matchMedia('(max-width: 899px)').matches; } catch { return false; } };
const durdur = (f: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); f(); };
const parcaAdi = (r: TumIsSatiri): string => r.malzemeAd ?? (r.malzemeNo === null ? (r.aciklama ?? '—') : `Malzeme ${r.malzemeNo}`);
const baslikOf = (r: TumIsSatiri): string => r.emirNo ?? r.siparisNo ?? parcaAdi(r);

function useKartKipi(): boolean {
  const [kart, setKart] = useState(kartKipi);
  useEffect(() => {
    let m: MediaQueryList;
    try { m = window.matchMedia('(max-width: 899px)'); } catch { return undefined; }
    const degisti = () => setKart(m.matches);
    m.addEventListener('change', degisti);
    return () => m.removeEventListener('change', degisti);
  }, []);
  return kart;
}

function acKapa<T>({ kume, deger, sec }: { kume: ReadonlySet<T>; deger: T; sec: (k: Set<T>) => void }) {
  return { basili: kume.has(deger), degistir: () => { const k = new Set(kume); if (k.has(deger)) k.delete(deger); else k.add(deger); sec(k); } };
}

export function TumIsler() {
  const bugun = bugunGetir();
  const yetki = useYetki();
  const komut = useKalemKomutu();
  const cikis = useDepoCikisi();
  const { bildir } = useBildirim();
  const yonlendir = useNavigate();
  const kart = useKartKipi();
  const [parametreler] = useSearchParams();
  const gelen = aramadanGelen(parametreler);
  const [gorunum, setGorunum] = useState<Gorunum>(gelen?.gorunum ?? 'karar');
  const [ara, setAra] = useState(gelen?.ara ?? '');
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [donem, setDonem] = useState<Donem>(gelen === null ? 'yakin' : 'tumu');
  const [gruplama, setGruplama] = useState<Gruplama>('gun');
  const [siralama, setSiralama] = useState<{ alan: 'gun' | 'durum' | 'firma' | 'adet'; yon: 1 | -1 }>({ alan: 'gun', yon: 1 });
  const [hazirlik, setHazirlik] = useState<ReadonlySet<Hazirlik>>(ilkHali.hazirlik);
  const [asamalar, setAsamalar] = useState<ReadonlySet<TumIsAsamasi>>(() => (gelen === null ? ilkHali.asamalar : butunAsamalar()));
  const [kaynaklar, setKaynaklar] = useState<ReadonlySet<KalemKaynagi>>(new Set(KAYNAKLAR.map((k) => k.kod)));
  const [yonler, setYonler] = useState<ReadonlySet<Yon>>(new Set<Yon>(['gidis', 'gelis']));
  const [secili, setSecili] = useState<ReadonlySet<string>>(new Set());
  const [ayrintiAnahtari, setAyrinti] = useState<string | null>(null);
  const [diger, setDiger] = useState<string | null>(null);
  const [elleAcik, setElleAcik] = useState(false);
  // Sayfa açıkken genel aramadan yeni emir seçilirse süzgeç ona geçer.
  const gelenAra = gelen?.ara ?? null;
  const gelenGorunum = gelen?.gorunum ?? null;
  useEffect(() => {
    if (gelenAra === null || gelenGorunum === null) return;
    setAra(gelenAra); setGorunum(gelenGorunum); setDonem('tumu'); setOzet(null); setAsamalar(butunAsamalar()); setHazirlik(ilkHali.hazirlik);
  }, [gelenAra, gelenGorunum]);
  const aralik = donemAraligi(donem, bugun);
  const sorgu = useTumIsler(aralik[0], aralik[1]);
  const hepsi = useMemo(() => sorgu.data ?? [], [sorgu.data]);
  const anahtarla = useMemo(() => new Map(hepsi.map((r) => [r.anahtar, r])), [hepsi]);

  // 941 c: kalemi sahibi modül ve sevkiyat serbest bırakır; 956 b, 963 a: erkeni yalnız sevkiyat.onayla zorlar; 965 a: depo stok.cikis / stok.giris.
  const birakir = (r: TumIsSatiri) => yetki.isYaz || yetki.sahip(KALEM_SAHIBI[r.kaynak]);
  const herhangiBirakir = yetki.isYaz || KAYNAKLAR.some((k) => yetki.sahip(KALEM_SAHIBI[k.kod]));
  const cikisYapar = yetki.sahip('stok.cikis');
  const kabulYapar = yetki.sahip('stok.giris');

  const suzgec: Suzgec = { gorunum, ara, ozet, aralik, hazirlik, asamalar, kaynaklar, yonler };
  const liste = suz(hepsi, suzgec, bugun);
  const gorunumSec = (g: Gorunum) => { setGorunum(g); setOzet(null); setSecili(new Set()); };

  const hata = (h: unknown, yedek: string) => bildir('hata', hataIletisi(h, yedek));
  const serbestBirak = (anahtarlar: string[], tasima: Tasima, erkenGerekce: string | null = null, sonra?: () => void) => {
    komut.mutate({ tur: 'serbest-birak', govde: { anahtarlar, tasima, erkenGerekce } }, {
      onSuccess: () => {
        const n = anahtarlar.length;
        bildir('tamam', tasima === 'firma' ? `${n} kalem: sevk yok; depo hareketi bekliyor.` : `${n} kalem serbest bırakıldı.`);
        setSecili(new Set()); sonra?.();
      },
      onError: (h) => hata(h, 'Serbest bırakılamadı'),
    });
  };
  const tetikle = (r: TumIsSatiri) => {
    if (!r.is) return;
    const isId = r.is.id;
    komut.mutate({ tur: 'tetikle', isId }, {
      onSuccess: () => bildir('tamam', `${YON_ADI[r.yon].tetik} · depoya ${r.yon === 'gelis' ? 'kabul' : 'son çıkış'} işi düştü.`, {
        eylem: { etiket: 'Geri al', yap: () => komut.mutate({ tur: 'tetigi-geri-al', isId }, { onError: (h) => hata(h, 'Tetik geri alınamadı') }) },
      }),
      onError: (h) => hata(h, 'Tetiklenemedi'),
    });
  };
  const tetigiGeriAl = (r: TumIsSatiri) => {
    if (!r.is) return;
    komut.mutate({ tur: 'tetigi-geri-al', isId: r.is.id }, { onSuccess: () => bildir('tamam', 'Tetik geri alındı.'), onError: (h) => hata(h, 'Tetik geri alınamadı') });
  };
  const tasimaDegistir = (r: TumIsSatiri, tasima: Tasima) => {
    if (r.kalemId === null) return;
    komut.mutate({ tur: 'tasima', kalemId: r.kalemId, tasima }, {
      onSuccess: () => { bildir('tamam', tasima === 'firma' ? 'Sevk yok: firma alır ya da getirir.' : `${YON_ADI[r.yon].tetik} seçildi.`); setDiger(null); },
      onError: (h) => hata(h, 'Taşıma değiştirilemedi'),
    });
  };
  const cikisYap = (r: TumIsSatiri) => {
    if (r.kalemId === null) return;
    cikis.mutate(r.kalemId, {
      onSuccess: (c) => {
        bildir('tamam', `Son çıkış${r.adet === null ? '' : ` · ${sayiMetni(r.adet)} adet`} ${r.kaynak === 'fason' ? `${r.firmaAd ?? 'firma'} konumuna geçti` : r.kaynak === 'urun' ? 'stoktan düştü' : 'depodan çıktı'}.`);
        for (const u of c.uyarilar ?? []) bildir('bilgi', u);
      },
      onError: (h) => hata(h, 'Çıkış yapılamadı'),
    });
  };
  const kabulEt = (r: TumIsSatiri) => { if (r.kalemId !== null) void yonlendir(kabulYolu(r.kalemId)); };

  // ---------- hücreler ----------
  function depoHucresi(r: TumIsSatiri, dugmeli: boolean) {
    const d = depoDurumu(r);
    return (
      <span className="tc-ti-hucre">
        <span className="tc-ti-depo" data-ton={d.ton}><Simge ad={YON_ADI[r.yon].simge} boyut="k" /><span>{d.metin}</span></span>
        {d.alt && <span className="tc-ti-alt">{d.alt}</span>}
        {dugmeli && r.asama === 'depoda' && r.yon === 'gidis' && cikisYapar && (
          <Dugme tur="birincil" simge="upload" className="tc-ti-depo-dugme" yukleniyor={cikis.isPending && cikis.variables === r.kalemId}
            title={`Stok ${r.kaynak === 'fason' ? 'fason firmasının konumuna' : 'depodan'} geçer`} onClick={durdur(() => cikisYap(r))}>Çıkışı yap</Dugme>
        )}
        {dugmeli && r.asama === 'depoda' && r.yon === 'gelis' && kabulYapar && (
          <Dugme tur="birincil" simge="download" className="tc-ti-depo-dugme" title={r.kaynak === 'fason-donus' ? 'Sarf, fire ve üretimden giriş' : 'Giriş fişi'}
            onClick={durdur(() => kabulEt(r))}>Kabul et</Dugme>
        )}
      </span>
    );
  }

  function durumRozeti(r: TumIsSatiri) {
    const z = rozetOf(r, bugun);
    return <Rozet ton={z.ton} {...(z.cizgi ? { gorunum: 'cizgi' as const } : {})}>{z.ad}</Rozet>;
  }

  function durumHucresi(r: TumIsSatiri) {
    const g = gunu(r);
    const tahmin = r.asama === 'hazir-degil';
    const alt: ReactNode[] = [];
    if (gruplama === 'duz' && g) alt.push(<span key="g" className="mono">{tahmin ? '~' : ''}{tarihMetni(g)}</span>);
    if (geciktiMi(r, bugun)) {
      const ref = adayMi(r) ? r.istenenTarih : g;
      if (ref) alt.push(<span key="c" data-gecikti>{-fark(ref, bugun)} gün gecikti</span>);
    } else if (tahmin && r.ilerleme) alt.push(<span key="t" className="tc-ti-tahmin">{r.ilerleme}</span>);
    if (r.istenenTarih && r.istenenTarih !== g && !geciktiMi(r, bugun)) {
      alt.push(<span key="i">istenen {kisaTarih(r.istenenTarih)}{gecKalacakMi(r) && r.hazirTarihi && <b> (+{fark(r.hazirTarihi, r.istenenTarih)} gün)</b>}</span>);
    }
    return <span className="tc-ti-hucre">{durumRozeti(r)}{alt.map((x, i) => <span key={i} className="tc-ti-alt">{x}</span>)}</span>;
  }

  function kalemHucresi(r: TumIsSatiri) {
    const k = KAYNAK[r.kaynak];
    const ilerleme = r.asama === 'hazir-degil' ? null : r.ilerleme;
    return (
      <span className="tc-ti-hucre">
        <span className="tc-ti-yon-etiket" data-yon={r.yon === 'gelis' ? 'al' : 'birak'}><Simge ad={YON_ADI[r.yon].simge} boyut="k" />{YON_ADI[r.yon].etiket}</span>
        <span className="tc-ti-kaynak" data-kaynak={r.kaynak}><Simge ad={k.simge} boyut="k" />{k.ad}</span>
        {ilerleme && <span className="tc-ti-alt">{ilerleme}</span>}
        {r.erken && <span className="tc-ti-etiket" title={r.erken.gerekce}><Simge ad="lock" boyut="k" />Erken</span>}
      </span>
    );
  }

  const ciftDurumu = (c: TumIsSatiri): string => (c.asama === 'tamamlandi' ? (c.yon === 'gidis' ? 'çıktı' : 'kabul edildi')
    : c.asama === 'hazir' ? 'hazır' : c.asama === 'hazir-degil' ? (gunu(c) ? `~${kisaTarih(gunu(c)!)}` : 'hazır değil') : rozetOf(c, bugun).ad.toLocaleLowerCase('tr-TR'));

  function isHucresi(r: TumIsSatiri) {
    const adim = r.opNo === null ? null : `OP ${r.opNo}${r.adim ? ` ${r.adim}` : ''}`;
    const alt = r.kaynak === 'elle' ? [r.elleTuru && ELLE_ADI[r.elleTuru], r.malzemeAd ? r.aciklama : null].filter(Boolean).join(' · ') : null;
    const nolar = r.kaynak === 'alim' ? [r.siparisNo] : [r.emirNo, r.kaynak === 'urun' ? null : adim];
    const siparis = r.kaynak !== 'alim' && r.siparisNo ? `Sipariş ${r.siparisNo}` : null;
    const cift = r.bagliAnahtar ? anahtarla.get(r.bagliAnahtar) ?? null : null;
    const donus = r.yon === 'gelis';
    return (
      <span className="tc-ti-hucre">
        <span className="tc-ti-ana">{parcaAdi(r)}</span>
        {alt && <span className="tc-ti-alt">{alt}</span>}
        {nolar.some(Boolean) && (
          <span className="tc-ti-alt tc-ti-nolar">
            {nolar.filter(Boolean).map((n, i) => <Fragment key={i}>{i > 0 && <span aria-hidden="true">·</span>}<span className="mono">{n}</span></Fragment>)}
          </span>
        )}
        {(siparis || cift) && (
          <span className="tc-ti-bag-satir">
            {siparis && <span className="tc-ti-alt">{siparis}</span>}
            {cift && (
              <button type="button" className="tc-ti-cift" title={`Bağlı ${donus ? 'gidişi' : 'dönüşü'} aç`} onClick={durdur(() => setAyrinti(cift.anahtar))}>
                <Simge ad="rotate" boyut="k" />{donus ? 'Gidiş' : 'Dönüş'} {ciftDurumu(cift)}
              </button>
            )}
          </span>
        )}
      </span>
    );
  }

  function firmaHucresi(r: TumIsSatiri) {
    const noktasiz = !kapali(r) && r.firmaId !== null && r.noktaId === null && r.tasima !== 'firma';
    return (
      <span className="tc-ti-hucre">
        <span className="tc-ti-ana-ince">{r.firmaAd ?? '—'}</span>
        {noktasiz && <span className="tc-ti-alt" data-eksik>sevk noktası yok</span>}
      </span>
    );
  }

  // Son sütun tek satırdır: bir ana düğme ve "⋯".
  function kararHucresi(r: TumIsSatiri) {
    if (!birakir(r)) return <span className="tc-ti-alt">{KAYNAK[r.kaynak].sahip} ya da sevkiyat</span>;
    return (
      <span className="tc-ti-karar">
        <Dugme simge="route" className="tc-ti-serbest" data-karar={r.yon === 'gelis' ? 'al' : 'birak'} yukleniyor={komut.isPending && komut.variables?.tur === 'serbest-birak' && komut.variables.govde.anahtarlar.includes(r.anahtar)}
          title={`${r.yon === 'gelis' ? 'Almaya' : 'Sevke'} serbest bırak; sevk mi alım mı olacağını sevkiyat seçer${r.asama === 'hazir' ? '' : ' (kalem bitince düşer)'}`}
          onClick={durdur(() => serbestBirak([r.anahtar], 'biz'))}>Serbest bırak</Dugme>
        <Dugme simge="more" className="tc-ti-diger" aria-label="Diğer seçenekler" title={`Sevk yok${r.asama === 'hazir' ? '' : ', hazır olmadan sevke çıkar'}`}
          onClick={durdur(() => setDiger(r.anahtar))} />
      </span>
    );
  }

  // Sevkiyat sevk mi alım mı olacağını seçer (⋯) ve "Sevk et" / "Al" ile depoyu tetikler (960).
  function sevkiyatHucresi(r: TumIsSatiri) {
    const y = YON_ADI[r.yon];
    if (r.tasima === 'firma' || kapali(r) || r.asama === 'depoda' || !yetki.isYaz) {
      const alt = r.is?.tetiklendi ? `${y.tetik} · ${kisaTarih(r.is.tetiklendi.slice(0, 10))}` : r.asama === 'bekliyor' ? 'kalem bitince düşer' : null;
      const ad = r.tasima === 'firma' ? 'Sevk yok' : r.yon === 'gelis' ? 'Alınacak' : 'Sevk edilecek';
      return (
        <span className="tc-ti-hucre tc-ti-hucre-sag">
          <span className="tc-ti-yon" data-yon={r.tasima === 'firma' ? 'yok' : r.yon === 'gelis' ? 'al' : 'birak'}><Simge ad={r.tasima === 'firma' ? 'minus' : y.simge} boyut="k" />{ad}</span>
          {alt && <span className="tc-ti-alt">{alt}</span>}
          {yetki.isYaz && r.asama === 'bekliyor' && <Dugme simge="more" className="tc-ti-diger" aria-label="Sevk ya da alım seç" title="Sevk ya da alım seç" onClick={durdur(() => setDiger(r.anahtar))} />}
        </span>
      );
    }
    const kapaliTetik = !gidisCiktiMi(r);
    return (
      <span className="tc-ti-karar">
        {r.is === null ? (
          <Dugme tur="birincil" simge="list" className="tc-ti-tetik" title="Havuzdaki kalem Günlük sevkiyattaki bekleme listesinden işe çevrilir; tetik işe verilir"
            onClick={durdur(() => { void yonlendir('/sevkiyat'); })}>İşe çevir</Dugme>
        ) : (
          <Dugme tur="birincil" simge={y.simge} className="tc-ti-tetik" disabled={kapaliTetik || !tetiklenebilir(r)} yukleniyor={komut.isPending && komut.variables?.tur === 'tetikle' && komut.variables.isId === r.is.id}
            title={kapaliTetik ? 'Gidiş henüz depodan çıkmadı; çıkınca açılır' : y.aciklama} onClick={durdur(() => tetikle(r))}>{y.tetik}</Dugme>
        )}
        <Dugme simge="more" className="tc-ti-diger" aria-label="Sevk ya da alım seç" title="Sevk ya da alım seç" onClick={durdur(() => setDiger(r.anahtar))} />
      </span>
    );
  }

  // ---------- tablo ----------
  const aday = gorunum === 'karar';
  const secimli = aday && herhangiBirakir;
  const anahtar = {
    gun: (r: TumIsSatiri) => gunu(r) ?? '9999-12-31', durum: (r: TumIsSatiri) => ASAMA_SIRASI[r.asama],
    firma: (r: TumIsSatiri) => r.firmaAd ?? '', adet: (r: TumIsSatiri) => (r.adet === null ? -1 : Number(r.adet)),
  };
  const sirali = [...liste].sort((a, b) => {
    const ga = gunu(a) ?? '9999-12-31', gb = gunu(b) ?? '9999-12-31';
    if (gruplama === 'gun' && ga !== gb) return ga < gb ? -1 : 1;
    const x = anahtar[siralama.alan](a), y = anahtar[siralama.alan](b);
    return (x < y ? -1 : x > y ? 1 : a.anahtar < b.anahtar ? -1 : 1) * siralama.yon;
  });
  const secilebilir = liste.filter(birakir);
  const hepsiSecili = secilebilir.length > 0 && secilebilir.every((r) => secili.has(r.anahtar));
  const sutun = (secimli ? 1 : 0) + 7;
  const sirala = (alan: typeof siralama.alan) => setSiralama((s) => ({ alan, yon: s.alan === alan ? (s.yon === 1 ? -1 : 1) : 1 }));
  const th = (kod: typeof siralama.alan, ad: string, sinif = '') => (
    <th scope="col" className={sinif} aria-sort={siralama.alan === kod ? (siralama.yon > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="tc-tablo-sirala" onClick={() => sirala(kod)}>{ad}<span className="tc-tablo-sirasiz"><Simge ad="sort" boyut="k" /></span></button>
    </th>
  );
  const satirAc = (r: TumIsSatiri) => setAyrinti(r.anahtar);
  const satirTusu = (r: TumIsSatiri) => (e: KeyboardEvent) => { if (e.key === 'Enter' && e.target === e.currentTarget) satirAc(r); };
  const secimDegistir = (r: TumIsSatiri, acik: boolean) => setSecili((s) => { const k = new Set(s); if (acik) k.add(r.anahtar); else k.delete(r.anahtar); return k; });
  const satirCiz = (r: TumIsSatiri) => (
    <tr key={r.anahtar} className="tc-tablo-secilir" tabIndex={0} data-is={r.anahtar}
      data-asama={adayMi(r) ? (r.asama === 'hazir' ? 'hazir' : 'gelecek') : r.asama} data-gecikti={geciktiMi(r, bugun) || undefined}
      onClick={() => satirAc(r)} onKeyDown={satirTusu(r)}>
      {secimli && (
        <td className="tc-ti-sec" data-baslik="Seç" onClick={(e) => e.stopPropagation()}>
          {birakir(r) && <input type="checkbox" aria-label={`${baslikOf(r)} seç`} checked={secili.has(r.anahtar)} onChange={(e) => secimDegistir(r, e.target.checked)} />}
        </td>
      )}
      <td data-baslik="Durum">{durumHucresi(r)}</td>
      <td data-baslik="Kalem">{kalemHucresi(r)}</td>
      <td data-baslik="Parça ve iş">{isHucresi(r)}</td>
      <td data-baslik="Adet" className="tc-tablo-sag mono">{r.adet === null ? <span className="tc-tablo-yok">—</span> : sayiMetni(r.adet)}</td>
      <td data-baslik="Firma">{firmaHucresi(r)}</td>
      <td data-baslik="Depo">{depoHucresi(r, true)}</td>
      <td data-baslik={aday ? 'Eylem' : 'Sevkiyat'} className="tc-ti-son">{aday ? kararHucresi(r) : sevkiyatHucresi(r)}</td>
    </tr>
  );
  let govde: ReactNode[] = [];
  if (gruplama === 'gun') {
    let onceki: string | null | undefined;
    for (const r of sirali) {
      const g = gunu(r);
      if (g !== onceki) {
        const ayni = sirali.filter((x) => gunu(x) === g);
        govde.push(
          <tr key={`g:${g ?? 'yok'}`} className="tc-ti-grup" data-gecikti={ayni.some((x) => geciktiMi(x, bugun)) || undefined}>
            <th colSpan={sutun} scope="rowgroup">
              <span>{g ? uzunTarih(g) : 'Tarihsiz'}</span>
              <span className="tc-ti-grup-alt">{g ? `${farkYaz(g, bugun)} · ` : ''}{ayni.length} {aday ? 'kalem' : 'iş'}</span>
            </th>
          </tr>,
        );
        onceki = g;
      }
      govde.push(satirCiz(r));
    }
  } else govde = sirali.map(satirCiz);

  // ---------- sayaçlar ----------
  const temel = hepsi.filter((r) => kaynaklar.has(r.kaynak));
  const durumTemeli = suz(hepsi, suzgec, bugun, { filtresiz: true, ozetsiz: true });
  const kaynakTemeli = suz(hepsi, suzgec, bugun, { kaynaksiz: true, ozetsiz: true });
  const ozetli = ozet !== null;
  const gorunumSayisi = (g: Gorunum) => hepsi.filter((r) => gorunumde(r, g) && (g === 'karar' || !kapali(r))).length;
  const cip = (anahtar: string, { basili, degistir, ad, sayi, baslik, ek, on }: { basili: boolean; degistir: () => void; ad: string; sayi: number; baslik: string; ek?: string; on?: ReactNode }) => (
    <Dugme key={anahtar} className={`tc-ti-cip${ek ? ` ${ek}` : ''}`} aria-pressed={ozetli || basili} disabled={ozetli} title={baslik} onClick={degistir}>
      {on}{ad}<span className="tc-ti-cip-sayi">{sayi}</span>
    </Dugme>
  );

  const digerSatir = diger ? anahtarla.get(diger) ?? null : null;
  const ayrintiSatir = ayrintiAnahtari ? anahtarla.get(ayrintiAnahtari) ?? null : null;

  return (
    <div className="tc-sevkiyat tc-ti">
      <div className="tc-ti-sayfa">
        <header className="tc-sbaslik tc-ti-baslik">
          <div className="tc-sbaslik-bas">
            <h2 className="tc-sbaslik-ad" title="Tüm işler"><Simge ad="layers" /><span className="tc-sbaslik-metin">Tüm işler</span></h2>
            <div className="tc-sbaslik-alt">{aday
              ? 'Sevke ya da almaya aday bütün kalemler. Serbest bırakılan kalem sevkiyata iş olarak düşer.'
              : 'Sevkiyat sevk mi alım mı olacağını seçer ve tetikler; depo son çıkışı ya da kabulü yapar.'}</div>
          </div>
          {yetki.isYaz && <Dugme simge="plus" title="Numune, tamir, kalibrasyon, iade gibi kaynağı olmayan iş" onClick={() => setElleAcik(true)}>Elle iş</Dugme>}
          <div className="tc-ti-kip tc-ti-kip-ana" role="tablist" aria-label="Görünüm">
            {([['karar', 'Serbest bırakılacak', 'clock'], ['sevkiyat', 'Sevkiyattaki', 'route']] as const).map(([kod, ad, simge]) => (
              <Dugme key={kod} role="tab" aria-selected={gorunum === kod} aria-pressed={gorunum === kod} onClick={() => gorunumSec(kod)}>
                <Simge ad={simge} boyut="k" />{ad}<span className="tc-ti-cip-sayi">{gorunumSayisi(kod)}</span>
              </Dugme>
            ))}
          </div>
        </header>

        <div className="tc-ti-ozet" role="group" aria-label="Özet süzgeci">
          {OZETLER.map((o) => (
            <button key={o.kod} type="button" className="tc-ti-sayac" data-ton={o.ton ?? undefined} aria-pressed={ozet === o.kod}
              onClick={() => { const yeni = ozet === o.kod ? null : o.kod; setOzet(yeni); if (yeni) setGorunum(o.gorunum); setSecili(new Set()); }}>
              <span className="tc-ti-sayac-deger mono">{temel.filter((r) => o.suz(r, bugun)).length}</span><span className="tc-ti-sayac-ad">{o.ad}</span>
            </button>
          ))}
        </div>

        <div className="tc-ti-arac">
          <div className="tc-ti-arac-ust">
            <div className="tc-alan tc-ti-arama">
              <label className="tc-alan-etiket tc-ti-gizli" htmlFor="tc-ti-ara">Ara</label>
              <input id="tc-ti-ara" className="tc-alan-kutu" type="search" placeholder="Sipariş, emir, OP, malzeme, firma" value={ara} onChange={(e) => setAra(e.target.value)} />
            </div>
            <div className="tc-alan tc-ti-donem">
              <select className="tc-alan-kutu" aria-label="Dönem" value={donem} onChange={(e) => setDonem(e.target.value as Donem)}>
                {DONEMLER.map((d) => <option key={d.kod} value={d.kod}>{d.ad}</option>)}
              </select>
            </div>
            <div className="tc-ti-kip" role="group" aria-label="Gruplama">
              <Dugme aria-pressed={gruplama === 'gun'} title="Güne göre grupla" onClick={() => setGruplama('gun')}><Simge ad="gantt" boyut="k" /><span className="tc-ti-dar-gizle">Güne göre</span></Dugme>
              <Dugme aria-pressed={gruplama === 'duz'} title="Düz liste" onClick={() => setGruplama('duz')}><Simge ad="list" boyut="k" /><span className="tc-ti-dar-gizle">Düz</span></Dugme>
            </div>
          </div>
          <div className="tc-ti-arac-cipler">
            <div className="tc-ti-cip-grup" role="group" aria-label="Durum">
              {aday ? (['hazir', 'gelecek'] as const).map((h) => {
                const { basili, degistir } = acKapa({ kume: hazirlik, deger: h, sec: setHazirlik });
                return cip(h, { basili, degistir, ad: h === 'hazir' ? 'Hazır' : 'Hazır değil', baslik: h === 'hazir' ? 'Bitti; sevke çıkabilir' : 'Henüz bitmedi; gün tahmindir',
                  sayi: durumTemeli.filter((r) => (r.asama === 'hazir') === (h === 'hazir')).length });
              }) : ASAMALAR.map((a) => {
                const { basili, degistir } = acKapa({ kume: asamalar, deger: a.kod, sec: setAsamalar });
                return cip(a.kod, { basili, degistir, ad: a.ad, baslik: a.aciklama, sayi: durumTemeli.filter((r) => r.asama === a.kod).length });
              })}
            </div>
            <span className="tc-ti-ayrac" aria-hidden="true" />
            <div className="tc-ti-cip-grup" role="group" aria-label="Giden ya da gelen">
              {(['gidis', 'gelis'] as const).map((y) => {
                const { basili, degistir } = acKapa({ kume: yonler, deger: y, sec: setYonler });
                return cip(y, {
                  basili, degistir, ad: YON_ADI[y].etiket, ek: 'tc-ti-cip-yon', baslik: y === 'gelis' ? 'Bize girecek: dönüş, alım' : 'Bizden çıkacak: ürün, fason gidişi',
                  sayi: kaynakTemeli.filter((r) => kaynaklar.has(r.kaynak) && r.yon === y).length, on: <Simge ad={YON_ADI[y].simge} boyut="k" />,
                });
              })}
            </div>
            <span className="tc-ti-ayrac" aria-hidden="true" />
            <div className="tc-ti-cip-grup" role="group" aria-label="Kaynak">
              {KAYNAKLAR.filter((k) => !aday || k.kod !== 'elle').map((k) => {
                const { basili, degistir } = acKapa({ kume: kaynaklar, deger: k.kod, sec: setKaynaklar });
                return cip(k.kod, {
                  basili, degistir, ad: k.ad, baslik: k.aciklama, sayi: kaynakTemeli.filter((r) => r.kaynak === k.kod).length,
                  on: <span className="tc-ti-nokta" data-kaynak={k.kod} aria-hidden="true" />,
                });
              })}
            </div>
          </div>
        </div>

        {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
          : sorgu.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Tüm işler alınamadı')} yenile={() => void sorgu.refetch()} />
            : liste.length === 0 ? (
              <div className="tc-ti-bos-durum">
                <Simge ad={aday ? 'check' : 'search'} boyut="b" />
                <b>{aday ? 'Karar bekleyen kalem yok' : 'Bu süzgeçle iş yok'}</b>
                <span>{aday ? 'Hazır ve gelecek kalemlerin hepsi serbest bırakıldı.' : 'Durum, kaynak ya da dönemi değiştirin.'}</span>
              </div>
            ) : (
              <>
                {secimli && secili.size > 0 && (
                  <div className="tc-ti-toplu" role="region" aria-label="Toplu karar">
                    <b>{secili.size} kalem seçili</b>
                    <Dugme tur="birincil" simge="route" yukleniyor={komut.isPending} onClick={() => serbestBirak([...secili], 'biz')}>Serbest bırak</Dugme>
                    <Dugme simge="minus" disabled={komut.isPending} onClick={() => serbestBirak([...secili], 'firma')}>Sevk yok</Dugme>
                    <Dugme className="tc-ti-toplu-birak" onClick={() => setSecili(new Set())}>Seçimi bırak</Dugme>
                  </div>
                )}
                <div className="tc-tablo-kap tc-ti-tablo-kap" data-kip={kart ? 'kart' : undefined}>
                  <table className="tc-tablo tc-ti-tablo" aria-label={aday ? 'Karar bekleyen kalemler' : 'Sevkiyattaki işler'}>
                    <colgroup>
                      {secimli && <col className="tc-ti-k-sec" />}
                      <col className="tc-ti-k-durum" /><col className="tc-ti-k-kalem" /><col className="tc-ti-k-is" /><col className="tc-ti-k-adet" />
                      <col className="tc-ti-k-firma" /><col className="tc-ti-k-depo" /><col className="tc-ti-k-son" />
                    </colgroup>
                    <thead>
                      <tr>
                        {secimli && (
                          <th scope="col" className="tc-ti-sec">
                            <input type="checkbox" aria-label="Hepsini seç" checked={hepsiSecili}
                              onChange={(e) => setSecili((s) => { const k = new Set(s); for (const r of secilebilir) { if (e.target.checked) k.add(r.anahtar); else k.delete(r.anahtar); } return k; })} />
                          </th>
                        )}
                        {th('durum', 'Durum')}<th scope="col">Kalem</th><th scope="col">Parça ve iş</th>{th('adet', 'Adet', 'tc-tablo-sag')}{th('firma', 'Firma')}
                        <th scope="col">Depo</th><th scope="col" className="tc-ti-son">{aday ? '' : 'Sevkiyat'}</th>
                      </tr>
                    </thead>
                    <tbody>{govde}</tbody>
                  </table>
                </div>
                <p className="tc-ti-alt-bilgi">
                  <span>{liste.length} {aday ? 'kalem' : 'iş'}</span>
                  {aday ? <>
                    <span className="tc-ti-lejant"><i />hazır değil: gün tahmindir</span>
                    <span>Serbest bırakılan iş sevkiyata düşer; sevk mi alım mı olacağını sevkiyat seçer. Hazır olmayan kalem bitince düşer; beklemeden çıkarmak için ⋯.</span>
                  </> : <>
                    <span className="tc-ti-lejant"><i data-gecikti />geciken</span>
                    <span>Sevkiyat "Sevk et" / "Al" der; depo son çıkışı ya da kabulü yapar.</span>
                  </>}
                </p>
              </>
            )}
      </div>

      {elleAcik && <ElleIsFormu bugun={bugun} kapat={() => setElleAcik(false)} acildi={() => { setElleAcik(false); gorunumSec('sevkiyat'); }} />}
      {digerSatir && (
        <DigerPenceresi r={digerSatir} erkenZorlar={yetki.onayla} calisiyor={komut.isPending} kapat={() => setDiger(null)}
          serbestBirak={(tasima, gerekce) => serbestBirak([digerSatir.anahtar], tasima, gerekce, () => setDiger(null))}
          tasimaDegistir={(t) => tasimaDegistir(digerSatir, t)} />
      )}
      {ayrintiSatir && (
        <Pencere acik tur="yan" kapat={() => setAyrinti(null)} baslik={`${KAYNAK[ayrintiSatir.kaynak].ad} · ${baslikOf(ayrintiSatir)}`}
          alt={<>
            <Dugme onClick={() => setAyrinti(null)}>Kapat</Dugme>
            {ayrintiEylemi(ayrintiSatir)}
          </>}>
          {ayrinti(ayrintiSatir)}
        </Pencere>
      )}
    </div>
  );

  function ayrintiEylemi(r: TumIsSatiri) {
    if (r.asama === 'depoda' && r.yon === 'gidis' && cikisYapar) return <Dugme tur="birincil" simge="upload" yukleniyor={cikis.isPending} onClick={() => cikisYap(r)}>Çıkışı yap</Dugme>;
    if (r.asama === 'depoda' && r.yon === 'gelis' && kabulYapar) return <Dugme tur="birincil" simge="download" onClick={() => kabulEt(r)}>Kabul et</Dugme>;
    if (yetki.isYaz && tetiklenebilir(r) && gidisCiktiMi(r)) return <Dugme tur="birincil" simge={YON_ADI[r.yon].simge} yukleniyor={komut.isPending} onClick={() => tetikle(r)}>{YON_ADI[r.yon].tetik}</Dugme>;
    if (yetki.isYaz && r.asama === 'depoda' && r.is?.tetiklendi && r.depo === null) return <Dugme simge="rotate" yukleniyor={komut.isPending} onClick={() => tetigiGeriAl(r)}>Tetiği geri al</Dugme>;
    if (adayMi(r) && birakir(r)) return <>
      <Dugme simge="more" onClick={() => { setAyrinti(null); setDiger(r.anahtar); }}>Diğer</Dugme>
      <Dugme tur="birincil" simge="route" yukleniyor={komut.isPending} onClick={() => serbestBirak([r.anahtar], 'biz', null, () => setAyrinti(null))}>Serbest bırak</Dugme>
    </>;
    if (!adayMi(r) && r.is) return <Dugme tur="birincil" simge="expand" onClick={() => { void yonlendir(`/sevkiyat?tarih=${r.is!.tarih}`); }}>Gününde aç</Dugme>;
    return null;
  }

  function ayrinti(r: TumIsSatiri) {
    const g = gunu(r);
    const cift = r.bagliAnahtar ? anahtarla.get(r.bagliAnahtar) ?? null : null;
    const satirlar = (l: readonly (readonly [string, ReactNode] | false | null)[]) => (
      <dl className="tc-ti-alanlar">{l.filter((x): x is readonly [string, ReactNode] => Boolean(x)).map(([a, d]) => <Fragment key={a}><dt>{a}</dt><dd>{d}</dd></Fragment>)}</dl>
    );
    const bagAdaylari: (readonly [string, ReactNode] | false)[] = [
      r.siparisNo !== null && [r.kaynak === 'alim' ? 'Satın alma siparişi' : 'Sipariş satırı', <span className="mono">{r.siparisNo}</span>],
      r.uretimEmriId !== null && ['Üretim emri', <a className="tc-ti-bag" href={`/uretim-emirleri/${r.uretimEmriId}`}
        onClick={(e) => { e.preventDefault(); void yonlendir(`/uretim-emirleri/${r.uretimEmriId}`); }}>{r.emirNo ?? `#${r.uretimEmriId}`}</a>],
      r.opNo !== null && ['Rota adımı', `OP ${r.opNo}${r.adim ? ` ${r.adim}` : ''}`],
      r.kaynak === 'elle' && r.aciklama !== null && ['Açıklama', r.aciklama],
      cift !== null && [r.yon === 'gidis' ? 'Dönüşü' : 'Gidişi', (
        <button type="button" className="tc-ti-cift" onClick={() => setAyrinti(cift.anahtar)}>
          <Simge ad="rotate" boyut="k" />{gunu(cift) ? `${tarihMetni(gunu(cift)!)} · ` : ''}{ciftDurumu(cift)}
        </button>
      )],
    ];
    const baglar = bagAdaylari.filter((x): x is readonly [string, ReactNode] => Boolean(x));
    const noktasiz = !kapali(r) && r.firmaId !== null && r.noktaId === null && r.tasima !== 'firma';
    return <>
      {satirlar([
        [adayMi(r) ? 'Hazır olma' : 'Gün', g ? <><span className="mono">{r.asama === 'hazir-degil' ? '~' : ''}{tarihMetni(g)}</span> · {farkYaz(g, bugun)}</> : '—'],
        ['Durum', durumRozeti(r)],
        r.istenenTarih !== null && ['İstenen gün', <span className="mono">{tarihMetni(r.istenenTarih)}</span>],
        ['Malzeme', parcaAdi(r)],
        ['Adet', r.adet === null ? '—' : sayiMetni(r.adet)],
        ['Firma', r.firmaAd ?? '—'],
        ['Depo', depoHucresi(r, false)],
        !adayMi(r) && ['Sevkiyat', r.tasima === 'firma' ? 'Sevk yok: firma alır ya da getirir' : `${YON_ADI[r.yon].tetik}${r.is?.tetiklendi ? ` · ${tarihMetni(r.is.tetiklendi.slice(0, 10))}` : ''}`],
      ])}
      {gecKalacakMi(r) && r.hazirTarihi && r.istenenTarih && (
        <p className="tc-ti-uyari"><Simge ad="alert" boyut="k" /><span>Canlı plan bu kalemi istenen günden {fark(r.hazirTarihi, r.istenenTarih)} gün sonra bitiriyor. Düzeltme Planlama'da yapılır.</span></p>
      )}
      {noktasiz && <p className="tc-ti-uyari"><Simge ad="alert" boyut="k" /><span>Firmanın sevk noktası yok; iş noktasız düşer, sevkiyatçı noktayı seçer.</span></p>}
      {baglar.length > 0 && <>
        <h3 className="tc-ti-alt-baslik">Bağlar</h3>
        {satirlar(baglar)}
      </>}
      {(r.sonYazan || r.erken || r.depo) && <>
        <h3 className="tc-ti-alt-baslik">İz</h3>
        {satirlar([
          r.sonYazan !== null && ['Taşımayı son yazan', <>{r.sonYazan.kisiAd ?? '—'} · {tarihMetni(r.sonYazan.zaman.slice(0, 10))}<span className="tc-ti-yol-alt">{YER_ADI[r.sonYazan.yer]}</span></>],
          r.erken !== null && ['Erken çıkış', <>{r.erken.kisiAd ?? '—'} · {tarihMetni(r.erken.zaman.slice(0, 10))}<span className="tc-ti-yol-alt">{r.erken.gerekce}</span></>],
          r.depo !== null && [r.yon === 'gidis' ? 'Son çıkış' : 'Kabul', <>{r.depo.kisiAd ?? '—'}{r.depo.zaman ? ` · ${tarihMetni(r.depo.zaman.slice(0, 10))}` : ''}{r.depo.kabulAdet !== null ? <span className="tc-ti-yol-alt">gelen {sayiMetni(r.depo.kabulAdet)}</span> : null}</>],
        ])}
      </>}
      <h3 className="tc-ti-alt-baslik">Yol</h3>
      {yolAdimlari(r)}
    </>;
  }

  function yolAdimlari(r: TumIsSatiri) {
    const ilk = { urun: 'Üretim emri biter', fason: 'Önceki adım biter', 'fason-donus': 'Fason firması adımı bitirir', alim: 'Satın alma siparişi verilir', elle: 'İş elle girilir' }[r.kaynak];
    const sevkte = !adayMi(r) && r.tasima !== 'firma';
    const sira = ASAMA_SIRASI[r.asama];
    const adimlar: { ad: string; alt?: string | null; bitti: boolean }[] = [
      { ad: ilk, alt: r.asama === 'hazir-degil' && gunu(r) ? `Tahmini ${tarihMetni(gunu(r)!)}` : null, bitti: r.asama !== 'hazir-degil' && r.asama !== 'bekliyor' },
      { ad: 'Serbest bırakılır', alt: adayMi(r) ? `${KAYNAK[r.kaynak].sahip} ya da sevkiyat` : null, bitti: !adayMi(r) },
    ];
    if (r.yon === 'gelis' && r.ilerleme === GIDIS_CIKMADI) adimlar.push({ ad: 'Gidişin son çıkışı', alt: '"Al" açılır', bitti: false });
    if (r.tasima !== 'firma') {
      adimlar.push({ ad: 'Sevkiyatta iş (havuz)', bitti: sevkte && r.asama !== 'bekliyor' });
      adimlar.push({ ad: 'Araca verilir, plan onaylanır', alt: 'Sevk et bunu beklemez', bitti: sevkte && sira >= ASAMA_SIRASI.yolda });
    }
    adimlar.push({
      ad: `Sevkiyat "${YON_ADI[r.yon].tetik}" der`, bitti: r.is?.tetiklendi != null || (r.tasima === 'firma' && !adayMi(r)),
      alt: r.tasima === 'firma' ? 'sevk yok: firma alır ya da getirir' : r.is?.tetiklendi ? tarihMetni(r.is.tetiklendi.slice(0, 10)) : 'sevk mi alım mı burada seçilir',
    });
    adimlar.push(r.yon === 'gidis'
      ? { ad: 'Depoda son çıkış', alt: r.kaynak === 'fason' ? 'stok fason firmasının konumuna geçer' : r.kaynak === 'urun' ? 'stoktan düşer; iş kapanır' : 'depodan çıkar; iş kapanır', bitti: kapali(r) }
      : { ad: 'Depoda kabul', alt: r.kaynak === 'fason-donus' ? 'sarf, fire, üretimden giriş; adım biter (istasyon gibi)' : 'giriş fişi; iş kapanır', bitti: kapali(r) });
    const ilkAcik = adimlar.findIndex((a) => !a.bitti);
    return (
      <ol className="tc-ti-yol" aria-label="Kalemin yolu">
        {adimlar.map((a, i) => {
          const d = a.bitti ? 'tamam' : i === ilkAcik ? 'simdi' : 'sonra';
          return (
            <li key={a.ad} data-durum={d}>
              <span className="tc-ti-yol-isaret">{d === 'tamam' && <Simge ad="check" boyut="k" />}</span>
              <span>{a.ad}{a.alt && <span className="tc-ti-yol-alt">{a.alt}</span>}</span>
            </li>
          );
        })}
      </ol>
    );
  }
}

const ELLE_ADI = { numune: 'Numune', tamir: 'Tamir', kalibrasyon: 'Kalibrasyon', iade: 'İade', diger: 'Diğer' } as const;

// "Diğer": adayda sevk yok ve hazır olmadan sevke çıkar (945); sevkiyattakinde sevk/al ile sevk yok arası (taşıma). Erken çıkış gerekçe
// ister; kim, ne zaman, neden kaleme yazılır.
function DigerPenceresi({ r, erkenZorlar, calisiyor, kapat, serbestBirak, tasimaDegistir }: {
  r: TumIsSatiri; erkenZorlar: boolean; calisiyor: boolean; kapat: () => void;
  serbestBirak: (tasima: Tasima, gerekce: string | null) => void; tasimaDegistir: (t: Tasima) => void;
}) {
  const [gerekce, setGerekce] = useState('');
  const [hata, setHata] = useState(false);
  const aday = adayMi(r);
  const hazirDegil = r.asama === 'hazir-degil' || r.asama === 'bekliyor';
  const y = YON_ADI[r.yon];
  const erken = () => {
    if (gerekce.trim().length < 10) { setHata(true); return; }
    serbestBirak(r.tasima ?? 'biz', gerekce.trim());
  };
  return (
    <Pencere acik kapat={kapat} baslik={aday ? `${KAYNAK[r.kaynak].ad} · ${baslikOf(r)}` : `Sevk ya da alım · ${baslikOf(r)}`}
      alt={<Dugme onClick={kapat}>Vazgeç</Dugme>}>
      <div className="tc-ti-diger-govde">
        {aday ? (
          <button type="button" className="tc-ti-secenek" disabled={calisiyor} onClick={() => serbestBirak('firma', null)}>
            <Simge ad="minus" /><span><b>Sevk yok</b><span className="tc-ti-ince">Firma kendisi alır ya da getirir. İş açılmaz; depo hareketi yine yapılır.</span></span>
          </button>
        ) : (
          (['biz', 'firma'] as const).map((t) => (
            <button key={t} type="button" className="tc-ti-secenek" aria-pressed={(r.tasima ?? 'biz') === t} disabled={calisiyor} onClick={() => tasimaDegistir(t)}>
              <Simge ad={t === 'firma' ? 'minus' : y.simge} />
              <span><b>{t === 'firma' ? 'Sevk yok' : r.yon === 'gelis' ? 'Alınacak' : 'Sevk edilecek'}</b>
                <span className="tc-ti-ince">{t === 'firma' ? 'Firma kendisi alır ya da getirir: sevkiyat işi açılmaz, depo hareketi yine yapılır' : y.aciklama}</span></span>
            </button>
          ))
        )}
        {hazirDegil && (aday || r.asama === 'bekliyor') && (!erkenZorlar ? (
          <p className="tc-ti-ince tc-ti-erken-yok"><Simge ad="lock" boyut="k" />Hazır olmadan sevke çıkarmayı yalnız sevkiyat sorumlusu ya da yönetici yapar.</p>
        ) : (
          <fieldset className="tc-ti-erken">
            <legend><Simge ad="lock" boyut="k" />Hazır olmadan sevke çıkar</legend>
            <p className="tc-ti-ince">Kalem sistemde bitmiş görünmüyor{r.ilerleme ? ` (${r.ilerleme})` : ''}. Gerçekte hazırsa ya da kayıt eksikse iş şimdi havuza düşer.
              Kim, ne zaman ve neden kaleme yazılır; depo çıkışında stok yoksa uyarı çıkar.</p>
            <CokSatir etiket="Gerekçe (zorunlu)" rows={2} maxLength={400} placeholder="Ör. son kontrol bitti, emir kapatılmadı" value={gerekce}
              onChange={(e) => { setGerekce(e.target.value); setHata(false); }} {...(hata ? { hata: 'Gerekçe en az 10 karakter olmalı.' } : {})} />
            <Dugme tur="birincil" simge="route" yukleniyor={calisiyor} onClick={erken}>Şimdi sevke çıkar</Dugme>
          </fieldset>
        ))}
      </div>
    </Pencere>
  );
}
