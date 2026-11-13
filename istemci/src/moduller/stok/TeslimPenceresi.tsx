import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { kodTuru } from '#paylasilan/kod-sozlugu.ts';
import type {
  IstegeLotlarlaGonderGovdesi, LotSirasi, SepetEkleGovdesi, MalzemeIstegi, MalzemeOzetiCevabi, OkutCozCevabi, RefakatPartileriCevabi, TeslimCevabi, TeslimLotlariCevabi,
} from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, KodOkuyucu, Pencere, Rozet, Sekmeler, Simge } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useCihazTercihi } from '../../ortak/veri/cihaz-tercihi.ts';
import { yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { birimliMiktar, miktarGirdisi, miktarMetni, zamanMetni } from './gorunum.ts';
import { hataMetni, korumaliPost, useIslem } from './ortak.tsx';
import { adim, binde, bindenMetin, miktarAyarla, okutulanSatir, oneriPlani, planaEkle, planToplami, type Onay, type PlanSatiri, type TeslimLotu } from './teslim-plani.ts';
import './teslim-penceresi.css';

// Teslim penceresi (3187 a, 3191 a): öneri hazır gelir, lot okutularak ya da dokunarak onaylanır, istek birden çok lottan gönderilir.
// İki düzen aynı planı gösterir: Öneri kartları (az okuma) ve Hızlı liste (bütün lotlar); seçilen düzen cihazda hatırlanır.
// Yalnız serbest stok listelenir; statülü parça ve konumu elle seçme bugünkü pencerededir (`elle`).
const SIRA_ADI: Readonly<Record<LotSirasi, string>> = { fefo: 'FEFO', fifo: 'FIFO', lifo: 'LIFO' };
const SIRA_ACIKLAMA: Readonly<Record<LotSirasi, string>> = { fefo: 'önce bozulan önce', fifo: 'ilk giren önce', lifo: 'son giren önce' };
const SIRALAR = ['fefo', 'fifo', 'lifo'] as const;
const GUN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const girisMetni = (iso: string): string => GUN.format(new Date(iso));
const sktMetni = (gun: string): string => gun.split('-').reverse().join('.');
// Seçili sık satırda sayaç yer aldığı için tarih gün ve ay olarak kısalır; yıl ayrıntıda ve seçili olmayan satırda görünür.
const KISA_GUN = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit' });
// Etiket "lot no · tedarikçi partisi · döküm" biçimindedir; iletide ve sık satırda yalnız etiketteki lot no (okutulan kod) yazılır.
const lotEtiketi = (l: TeslimLotu): string => l.partiEtiketi ?? 'Lotsuz';
const lotAdi = (l: TeslimLotu): string => lotEtiketi(l).split(' · ')[0]!;
// Uzun etiket parça sınırından kırılır, parçanın ortasından kırılmaz (ORN-…-D2 tek parçadır).
function Parcali({ parcalar, mono = false }: { parcalar: string[]; mono?: boolean }) {
  return <>{parcalar.map((x, i) => <Fragment key={i}>{i > 0 && ' · '}<span className={mono ? 'tc-stok-tp-tut tc-stok-tp-mono' : 'tc-stok-tp-tut'}>{x}</span></Fragment>)}</>;
}
const yaz = (b: number): string => miktarMetni(bindenMetin(b));

type Ileti = { ton: 'tamam' | 'uyari' | 'hata'; metin: string } | null;
type Kart = { id: number; etiket: string };
interface Sonuc { tur: 'teslim' | 'sepet'; teslimler: TeslimCevabi['teslim'][]; satirlar: { lot: TeslimLotu; miktar: number; onay: Onay }[]; kartlar: Kart[] }

function useTeslim(istek: MalzemeIstegi) {
  const istemci = useQueryClient();
  const istenen = binde(istek.miktar);
  const [secilenSira, setSira] = useState<LotSirasi | null>(null);
  const l = useQuery({
    queryKey: anahtarlar.liste('teslim-lotlari', { malzemeId: istek.malzemeId, miktar: istek.miktar, sira: secilenSira }),
    queryFn: () => api.get<TeslimLotlariCevabi>(`/stok/malzemeler/${String(istek.malzemeId)}/teslim-lotlari?miktar=${encodeURIComponent(istek.miktar)}${secilenSira === null ? '' : `&sira=${secilenSira}`}`),
    retry: false,
    placeholderData: (onceki) => onceki,
  });
  const ozet = useQuery({ queryKey: anahtarlar.ayrinti('malzeme-ozeti', istek.malzemeId), queryFn: () => api.get<MalzemeOzetiCevabi>(`/stok/malzemeler/${String(istek.malzemeId)}/ozet`), retry: false });
  const lotlar = l.data?.lotlar ?? [];
  const sktVar = lotlar.some((x) => x.sonKullanma !== null);
  // Sıra seçilmeden önce sunucu bugünkü kuralla sıralar: son kullanma tarihi olan malzemede bu FEFO, olmayanda FIFO'dur.
  const sira: LotSirasi = secilenSira ?? (sktVar ? 'fefo' : 'fifo');
  const [plan, setPlan] = useState<PlanSatiri[] | null>(null);
  const [ileti, setIleti] = useState<Ileti>(null);
  const [kamera, setKamera] = useState(false);
  const [sonuc, setSonuc] = useState<Sonuc | null>(null);
  const [kimlik] = useState(yeniIstekKimligi);
  // Plan lot listesi ilk geldiğinde ve sıra değişip henüz hiçbir lot onaylanmamışken öneriden kurulur; onaydan sonra sıra yalnız listeyi sıralar.
  const kurulan = useRef<TeslimLotlariCevabi | null>(null);
  useEffect(() => {
    if (l.data === undefined || l.isPlaceholderData || kurulan.current === l.data) return;
    kurulan.current = l.data;
    setPlan((p) => (p === null || p.every((s) => s.onay === null) ? oneriPlani(l.data.lotlar) : p));
  }, [l.data, l.isPlaceholderData]);
  const satirlar = plan ?? [];
  const lot = (bakiyeId: number): TeslimLotu | undefined => lotlar.find((x) => x.bakiyeId === bakiyeId);
  const toplam = planToplami(satirlar);
  const kalan = Math.max(0, istenen - toplam);
  const bekleyen = satirlar.filter((s) => s.onay === null);
  const neden = (x: TeslimLotu): string => (sira === 'fefo' && x.sonKullanma !== null ? `son kullanma ${sktMetni(x.sonKullanma)}` : `giriş ${girisMetni(x.ilkGiris)}`);
  const yer = (x: TeslimLotu): string => `${x.konumKod} · ${lotAdi(x)}`;

  const ekle = (x: TeslimLotu, onay: Exclude<Onay, null>): Ileti => {
    const yeni = planaEkle(satirlar, x, istenen, onay);
    if (yeni === null) return { ton: 'uyari', metin: `İstenen zaten tamam; ${lotAdi(x)} eklenmedi. Fazla vermek için miktarı artırın.` };
    setPlan(yeni);
    const ilk = lotlar.find((o) => o.onerilen !== null && o.bakiyeId !== x.bakiyeId && satirlar.find((s) => s.bakiyeId === o.bakiyeId)?.onay == null);
    return x.onerilen === null && ilk
      ? { ton: 'uyari', metin: `${lotAdi(x)} alındı ama öneride değil: ${SIRA_ADI[sira]} sırasında önce ${lotAdi(ilk)} (${ilk.konumKod}, ${neden(ilk)}) verilmeli.` }
      : { ton: 'tamam', metin: `${lotAdi(x)} alındı: ${yaz(yeni.at(-1)!.miktar)}.` };
  };
  const onayDegistir = (bakiyeId: number) => setPlan((p) => (p ?? []).map((s) => (s.bakiyeId === bakiyeId ? { ...s, onay: s.onay === null ? 'el' : null } : s)));
  const miktarYaz = (x: TeslimLotu, miktar: number) => setPlan((p) => miktarAyarla(p ?? [], x, miktar));
  const dokun = (x: TeslimLotu) => {
    if (satirlar.some((s) => s.bakiyeId === x.bakiyeId)) { setPlan(satirlar.filter((s) => s.bakiyeId !== x.bakiyeId)); setIleti(null); } else setIleti(ekle(x, 'el'));
  };
  const lotOkundu = (x: TeslimLotu) => {
    const s = satirlar.find((y) => y.bakiyeId === x.bakiyeId);
    if (s === undefined) { setIleti(ekle(x, 'okut')); return; }
    if (s.onay === 'okut') { setIleti({ ton: 'uyari', metin: `${lotAdi(x)} zaten okutuldu.` }); return; }
    setPlan(satirlar.map((y) => (y.bakiyeId === x.bakiyeId ? { ...y, onay: 'okut' } : y)));
    const sonraki = satirlar.find((y) => y.onay === null && y.bakiyeId !== x.bakiyeId);
    const sonrakiLot = sonraki ? lot(sonraki.bakiyeId) : undefined;
    if (!sonraki) setKamera(false);
    setIleti({ ton: 'tamam', metin: sonrakiLot ? `${lotAdi(x)} doğru. Sıradaki: ${yer(sonrakiLot)}.` : `${lotAdi(x)} doğru. Hepsi okutuldu; teslim edin.` });
  };
  const coz = useMutation({
    mutationFn: (kod: string) => api.get<OkutCozCevabi>(`/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent(kod)}`),
    onSuccess: (c, kod) => {
      if (c.tur === 'yer' || c.tur === 'raf') { setIleti({ ton: 'hata', metin: 'Bu bir konum etiketi. Malzemenin üstündeki lot etiketini okutun.' }); return; }
      if (c.tur !== 'malzeme') { setIleti({ ton: 'hata', metin: `${kod} kayıtlı bir lot etiketi değil.` }); return; }
      if (c.refakat) { setIleti({ ton: 'hata', metin: 'Bu bir refakat kartı. Verilecek malzemenin lot etiketini okutun.' }); return; }
      if (c.malzeme.id !== istek.malzemeId) { setIleti({ ton: 'hata', metin: `${c.parti?.etiket ?? kod} başka malzemenin: ${c.malzeme.ad ?? c.malzeme.kod ?? ''}. İstenen: ${istek.malzemeAd ?? ''}.` }); return; }
      const lotsuzVar = lotlar.some((x) => x.partiId === null);
      if (c.parti === null && !lotsuzVar) { setIleti({ ton: 'hata', metin: 'Malzeme etiketi okundu; hangi lot olduğu belli değil. Lot etiketini okutun.' }); return; }
      const x = okutulanSatir(lotlar, satirlar, c.parti?.id ?? null);
      if (x === null) { setIleti({ ton: 'hata', metin: `${c.parti?.etiket ?? kod} verilemez: serbest stokta değil ya da son kullanma tarihi geçmiş. Başka lot okutun.` }); return; }
      lotOkundu(x);
    },
    onError: (hata) => setIleti({ ton: 'hata', metin: hataMetni(hata) }),
  });
  const okundu = (ham: string) => {
    const k = kodTuru(ham);
    if (k.tur === 'konum' || k.tur === 'raf') { setIleti({ ton: 'hata', metin: 'Bu bir konum etiketi. Malzemenin üstündeki lot etiketini okutun.' }); return; }
    if (k.tur === 'refakat-partisi' || k.tur === 'uretim-emri') { setIleti({ ton: 'hata', metin: 'Bu bir refakat kartı. Verilecek malzemenin lot etiketini okutun.' }); return; }
    if (k.tur === 'komut') return;
    coz.mutate(ham.trim());
  };
  const gonder = useMutation({
    mutationFn: async (): Promise<Sonuc> => {
      const dolu = satirlar.flatMap((s) => { const x = lot(s.bakiyeId); return x ? [{ lot: x, miktar: s.miktar, onay: s.onay }] : []; });
      if (dolu.length === 0) throw new Error('Verilecek lot seçilmedi.');
      const govde: IstegeLotlarlaGonderGovdesi = {
        kaynakKimligi: kimlik,
        parcalar: dolu.map((s) => ({ konumId: s.lot.konumId, partiId: s.lot.partiId, miktar: bindenMetin(s.miktar), okutuldu: s.onay === 'okut' })),
      };
      const c = await korumaliPost<TeslimCevabi>(`/stok/malzeme-istekleri/${String(istek.id)}/lotlarla-gonder`, govde);
      // Malzemeyle giden kartlar: emrin o lotlardaki açık kartları (bu teslimle açılanlar dahil). Okunamazsa teslim yine geçerlidir.
      const acik = istek.uretimEmriId === null ? [] : await api.get<RefakatPartileriCevabi>(`/stok/uretim-emirleri/${String(istek.uretimEmriId)}/refakat-partileri`)
        .then((r) => r.partiler.filter((p) => p.durum === 'acik' && p.birlestigi === null && dolu.some((s) => s.lot.partiId === p.partiId))).catch(() => []);
      const kartlar = new Map<number, Kart>([...(c.acilanKartlar ?? []), ...acik.map((p) => ({ id: p.id, etiket: p.etiket }))].map((k) => [k.id, k]));
      return { tur: 'teslim', teslimler: [c.teslim, ...(c.ekTeslimler ?? [])], satirlar: dolu, kartlar: [...kartlar.values()] };
    },
    onSuccess: async (s) => { setSonuc(s); setKamera(false); await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
    onError: (hata) => setIleti({ ton: 'hata', metin: hataMetni(hata) }),
  });
  // Sepete at: lotlar kişinin sepetine istasyon hedefiyle girer; istek açık kalır, sepet istasyonda bırakılınca teslim olur.
  const sepet = useMutation({
    mutationFn: async (): Promise<Sonuc> => {
      const dolu = satirlar.flatMap((s) => { const x = lot(s.bakiyeId); return x ? [{ lot: x, miktar: s.miktar, onay: s.onay }] : []; });
      if (dolu.length === 0) throw new Error('Verilecek lot seçilmedi.');
      for (const s of dolu) {
        const g: SepetEkleGovdesi = { malzemeId: istek.malzemeId, miktar: bindenMetin(s.miktar), kaynakKonumId: s.lot.konumId, partiId: s.lot.partiId, ...(istek.istasyonId === null ? {} : { hedef: { istasyonId: istek.istasyonId } }) };
        await korumaliPost('/stok/sepet/satir-ekle', g);
      }
      return { tur: 'sepet', teslimler: [], satirlar: dolu, kartlar: [] };
    },
    onSuccess: async (s) => { setSonuc(s); setKamera(false); await istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }); },
    onError: (hata) => setIleti({ ton: 'hata', metin: hataMetni(hata) }),
  });
  return {
    istek, l, birim: ozet.data?.ozet.birim ?? null, kod: ozet.data?.ozet.kod ?? null, lotlar, sktVar, sira, setSira, satirlar, lot, istenen, toplam, kalan, bekleyen, neden,
    onayDegistir, miktarYaz, dokun, okundu, cozuluyor: coz.isPending, ileti, setIleti, kamera, setKamera, gonder, sepet, sonuc,
  };
}
type T = ReturnType<typeof useTeslim>;

function Ozet({ t }: { t: T }) {
  const { istek } = t;
  const durum = t.kalan > 0 ? 'eksik' : t.satirlar.length > 0 && t.bekleyen.length === 0 ? 'tamam' : undefined;
  return (
    <div className="tc-stok-tp-bas">
      <div className="tc-stok-tp-bas-ana">
        <strong>{istek.malzemeAd ?? `Kart ${String(istek.malzemeId)}`}</strong>
        <span className="tc-stok-not">{t.kod !== null && <><span className="tc-stok-tp-mono">{t.kod}</span> · </>}{istek.no} · {istek.kisiAd ?? '—'}</span>
      </div>
      <div className="tc-stok-tp-sayac" data-durum={durum} aria-label={`Hazırlanan ${yaz(t.toplam)}, istenen ${birimliMiktar(istek.miktar, t.birim)}`}>
        <strong>{yaz(t.toplam)} / {miktarMetni(istek.miktar)}</strong>{t.birim !== null && <span>{t.birim}</span>}
      </div>
      <details className="tc-stok-tp-ayrinti">
        <summary><Simge ad="chev-right" boyut="k" /> Ayrıntı · istek, isteyen, açıklama</summary>
        <dl>
          <div><dt>İstek</dt><dd>{istek.no} · {zamanMetni(istek.acilis)}</dd></div>
          <div><dt>İsteyen</dt><dd>{istek.kisiAd ?? '—'} · {istek.istasyonAd ?? '—'}</dd></div>
          {istek.aciklama !== null && <div><dt>Açıklama</dt><dd>{istek.aciklama}</dd></div>}
          <div><dt>Refakat kartı</dt><dd>{istek.uretimEmriId === null ? 'Emre bağlı değil; kart açılmaz.' : 'Emrin kartı malzemeyle gider; lot teslimde karta işlenir.'}</dd></div>
        </dl>
      </details>
    </div>
  );
}

function Sayici({ t, s, l }: { t: T; s: PlanSatiri; l: TeslimLotu }) {
  const [elle, setElle] = useState<string | null>(null);
  const kaydet = (o: FormEvent) => {
    o.preventDefault();
    const m = binde(miktarGirdisi(elle ?? ''));
    if (Number.isFinite(m) && m > 0) t.miktarYaz(l, m);
    setElle(null);
  };
  if (elle !== null) {
    return (
      <form className="tc-stok-tp-elle" onSubmit={kaydet}>
        <Girdi etiket={`${lotAdi(l)}: verilecek miktar`} inputMode="decimal" autoFocus value={elle} onChange={(o) => setElle(o.target.value)} ipucu={`Rafta ${miktarMetni(l.miktar)}`} />
        <Dugme type="submit" simge="check" aria-label="Miktarı kaydet" />
      </form>
    );
  }
  return (
    <div className="tc-stok-tp-sayici">
      <Dugme simge="minus" aria-label={`${lotAdi(l)}: azalt`} onClick={() => t.miktarYaz(l, adim(s.miktar, -1))} />
      <button type="button" className="tc-stok-tp-miktar" aria-label={`${lotAdi(l)}: ${yaz(s.miktar)}, miktarı yaz`} onClick={() => setElle(yaz(s.miktar).replace(/\./g, ''))}>
        <strong aria-live="polite">{yaz(s.miktar)}</strong>{t.birim !== null && <small>{t.birim}</small>}
      </button>
      <Dugme simge="plus" aria-label={`${lotAdi(l)}: artır`} disabled={s.miktar >= binde(l.miktar)} onClick={() => t.miktarYaz(l, adim(s.miktar, 1))} />
    </div>
  );
}

function IletiSatiri({ t }: { t: T }) {
  if (t.ileti === null) return null;
  return <p className="tc-stok-tp-ileti" data-ton={t.ileti.ton} role={t.ileti.ton === 'hata' ? 'alert' : 'status'}><Simge ad={t.ileti.ton === 'tamam' ? 'check' : 'alert'} /> <span>{t.ileti.metin}</span></p>;
}

function SiraSecimi({ t }: { t: T }) {
  return (
    <div className="tc-stok-tp-sira">
      <Sekmeler etiket="Lot sırası" secili={t.sira} sec={(k) => { t.setSira(k); t.setIleti(null); }} sekmeler={SIRALAR.map((k) => ({ anahtar: k, baslik: SIRA_ADI[k] }))} />
      <span className="tc-stok-not">{SIRA_ACIKLAMA[t.sira]}{t.sktVar && t.sira !== 'fefo' ? ' · dikkat: bu malzemede son kullanma tarihi var, erken biten rafta kalabilir' : ''}</span>
    </div>
  );
}

// Sık lot satırı: konum önde (kişi rafa gider), sonra lot, tarih ve raftaki miktar.
function LotSatiri({ t, l }: { t: T; l: TeslimLotu }) {
  const s = t.satirlar.find((x) => x.bakiyeId === l.bakiyeId);
  return (
    <li className="tc-stok-tp-sat" data-secili={s ? '' : undefined}>
      <button type="button" className="tc-stok-tp-sat-dugme" aria-pressed={s !== undefined} onClick={() => t.dokun(l)}>
        <span className="tc-stok-tp-kutu" aria-hidden="true">{s && <Simge ad="check" boyut="k" />}</span>
        <span className="tc-stok-tp-sat-orta">
          <strong>{l.konumKod}</strong>
          <span className="tc-stok-not" title={lotEtiketi(l)}><span className="tc-stok-tp-mono">{lotAdi(l)}</span> · {l.sonKullanma !== null ? `SKT ${s ? sktMetni(l.sonKullanma).slice(0, 5) : sktMetni(l.sonKullanma)}` : `giriş ${s ? KISA_GUN.format(new Date(l.ilkGiris)) : girisMetni(l.ilkGiris)}`}</span>
        </span>
        <span className="tc-stok-tp-sat-sag">
          {l.onerilen !== null && !s && <Rozet ton="bilgi" gorunum="cizgi">Öneri</Rozet>}
          {s?.onay === 'okut' && <Simge ad="scan" boyut="k" />}
          <span className="tc-stok-not">rafta {miktarMetni(l.miktar)}</span>
        </span>
      </button>
      {s && <Sayici t={t} s={s} l={l} />}
    </li>
  );
}

function OneriKarti({ t, s, l }: { t: T; s: PlanSatiri; l: TeslimLotu }) {
  return (
    <li className="tc-stok-tp-al" data-onay={s.onay ?? undefined}>
      <button type="button" className="tc-stok-tp-al-ana" aria-pressed={s.onay !== null} onClick={() => t.onayDegistir(s.bakiyeId)}>
        <span className="tc-stok-tp-al-isaret" aria-hidden="true"><Simge ad={s.onay ? 'check' : 'scan'} boyut="b" /></span>
        <span className="tc-stok-tp-al-orta">
          <strong className="tc-stok-tp-al-konum">{l.konumKod}</strong>
          <span><Parcali mono parcalar={lotEtiketi(l).split(' · ')} /> · <Parcali parcalar={[t.neden(l), ...(l.onerilen === null ? ['öneri dışı'] : [])]} /></span>
        </span>
      </button>
      <div className="tc-stok-tp-al-alt">
        <span className="tc-stok-not">{s.onay === 'okut' ? 'Okutuldu' : s.onay === 'el' ? 'Elle onaylandı' : 'Okutun ya da dokunun'} · rafta {miktarMetni(l.miktar)}</span>
        <Sayici t={t} s={s} l={l} />
      </div>
    </li>
  );
}

function Sonucu({ t, s }: { t: T; s: Sonuc }) {
  return (
    <div className="tc-stok-tp-sonuc" role="status">
      <Simge ad="check" boyut="b" />
      <div>
        <strong>{s.tur === 'teslim' ? `${t.istek.no} yola çıktı` : 'Sepetinize eklendi'}</strong>
        <ul className="tc-stok-tp-sonuc-liste">
          {s.satirlar.map((x, n) => (
            <li key={x.lot.bakiyeId}>
              <span><strong>{birimliMiktar(bindenMetin(x.miktar), t.birim)}</strong> · <span className="tc-stok-tp-mono">{lotAdi(x.lot)}</span> · {x.lot.konumKod}{x.onay === 'okut' ? '' : ' · okutulmadı'}</span>
              {s.tur === 'teslim' && <span className="tc-stok-not">Teslim {s.teslimler[n]?.no ?? '—'}</span>}
            </li>
          ))}
        </ul>
        <p className="tc-stok-not">{s.tur === 'teslim'
          ? `${t.istek.istasyonAd ?? 'İstasyon'} "Teslim al" deyince stok taşınır ve istek kapanır.${s.kartlar.length > 0 ? ` Malzemeyle giden refakat kartı: ${s.kartlar.map((k) => k.etiket).join(', ')}.` : ''}`
          : 'Sepeti istasyonda bırakınca malzeme teslim olur. İstek bu teslimle kapanmaz; açık kalır.'}</p>
      </div>
    </div>
  );
}

export function TeslimPenceresi({ istek, kapat, elle }: { istek: MalzemeIstegi; kapat: () => void; elle: () => void }) {
  const t = useTeslim(istek);
  const [liste, setListe] = useCihazTercihi('stok-teslim-hizli-liste');
  const [ara, setAra] = useState('');
  const git = useNavigate();
  const etiketMerkezi = useIslem('sayfa.etiket-merkezi');
  const baslik = `${birimliMiktar(istek.miktar, t.birim)} · ${istek.istasyonAd ?? 'istasyona'}`;
  const pencere = { acik: true, kapat, baslik, ...(liste ? { tur: 'yan' as const, genis: true } : {}) };

  if (t.sonuc !== null) {
    const { kartlar } = t.sonuc;
    return (
      <Pencere {...pencere} alt={(
        <>
          <Dugme tur="ikincil" onClick={kapat}>Kapat</Dugme>
          {kartlar.length > 0 && etiketMerkezi && (
            <Dugme tur="birincil" boyut="ana" simge="printer" onClick={() => { void git(`/etiket-merkezi?tur=refakat-partisi&id=${kartlar.map((k) => String(k.id)).join(',')}`); }}>
              Refakat kartını bas · {kartlar.length} kart
            </Dugme>
          )}
        </>
      )}>
        <div className="tc-stok-form tc-stok-tp"><Sonucu t={t} s={t.sonuc} /></div>
      </Pencere>
    );
  }

  const elleBagi = <Dugme simge="pin" onClick={elle}>Konumu elle seç</Dugme>;
  if (t.l.isPending || t.l.isError || t.l.data.veriYetersiz) {
    return (
      <Pencere {...pencere} alt={elleBagi}>
        <div className="tc-stok-form tc-stok-tp">
          <Ozet t={t} />
          {t.l.isPending ? <DurumKutusu durum="yukleniyor" />
            : t.l.isError ? <DurumKutusu durum="hata" mesaj={hataMetni(t.l.error)} yenile={() => void t.l.refetch()} />
            : <DurumKutusu durum="bos" mesaj="Bu malzemenin verilebilir serbest stoğu yok. Statülü ya da başka yerdeki parça için konumu elle seçin." />}
        </div>
      </Pencere>
    );
  }

  const hazir = t.satirlar.length > 0;
  const hepsiOnayli = hazir && t.bekleyen.length === 0;
  const teslimYazisi = t.kalan > 0 && hazir ? `Eksikle teslim et · ${yaz(t.toplam)} / ${miktarMetni(istek.miktar)}` : `Teslim et · ${birimliMiktar(bindenMetin(t.toplam), t.birim)}`;
  const q = ara.trim().toLocaleUpperCase('tr');
  const eslesir = (l: TeslimLotu) => q === '' || l.konumKod.toLocaleUpperCase('tr').includes(q) || lotAdi(l).toLocaleUpperCase('tr').includes(q);
  const diger = t.lotlar.filter((l) => !t.satirlar.some((s) => s.bakiyeId === l.bakiyeId));
  return (
    <Pencere {...pencere} alt={(
      <>
        <Dugme simge="cart" aria-label="Sepete at" title="Sepete at" disabled={!hazir} yukleniyor={t.sepet.isPending} onClick={() => t.sepet.mutate()}><span className="tc-stok-tp-yalniz-telefon">Sepete at</span></Dugme>
        {!hepsiOnayli && <Dugme simge={t.kamera ? 'x' : 'camera'} onClick={() => { t.setKamera(!t.kamera); t.setIleti(null); }}>{t.kamera ? 'Kamerayı kapat' : 'Okut'}</Dugme>}
        <Dugme tur="birincil" boyut="ana" simge="truck" disabled={!hazir} yukleniyor={t.gonder.isPending} onClick={() => t.gonder.mutate()}>{teslimYazisi}</Dugme>
      </>
    )}>
      <div className="tc-stok-form tc-stok-tp">
        <Ozet t={t} />
        <div className="tc-stok-tp-duzen" role="group" aria-label="Pencere düzeni">
          <Dugme simge="target" aria-pressed={!liste} onClick={() => setListe(false)}>Öneri kartları</Dugme>
          <Dugme simge="list" aria-pressed={liste} onClick={() => setListe(true)}>Hızlı liste</Dugme>
        </div>
        {liste ? (
          <>
            <div className="tc-stok-tp-liste-ust">
              <SiraSecimi t={t} />
              <Girdi etiket="Lot ya da konum ara" value={ara} onChange={(o) => setAra(o.target.value)} />
            </div>
            <KodOkuyucu okundu={t.okundu} alansiz kameraAcik={t.kamera} bekliyor={t.cozuluyor} />
            <IletiSatiri t={t} />
            <ul className="tc-stok-tp-satlar" aria-label="Verilebilir lotlar">{t.lotlar.filter(eslesir).map((l) => <LotSatiri key={l.bakiyeId} t={t} l={l} />)}</ul>
          </>
        ) : (
          <>
            <div className="tc-stok-tp-oneri-bas">
              <strong><Simge ad="target" /> Teslim önerisi · {SIRA_ADI[t.sira]}</strong>
              <span className="tc-stok-not">{t.satirlar.length - t.bekleyen.length} / {t.satirlar.length} lot onaylı</span>
            </div>
            <ul className="tc-stok-tp-allar" aria-label="Teslim önerisi">
              {t.satirlar.map((s) => { const l = t.lot(s.bakiyeId); return l ? <OneriKarti key={s.bakiyeId} t={t} s={s} l={l} /> : null; })}
            </ul>
            <KodOkuyucu okundu={t.okundu} alansiz kameraAcik={t.kamera} bekliyor={t.cozuluyor} />
            <IletiSatiri t={t} />
            <details className="tc-stok-tp-baska">
              <summary><Simge ad="list" /> Başka lot seç · {diger.length} lot daha</summary>
              <SiraSecimi t={t} />
              <ul className="tc-stok-tp-satlar" aria-label="Öbür lotlar">{diger.map((l) => <LotSatiri key={l.bakiyeId} t={t} l={l} />)}</ul>
            </details>
          </>
        )}
        {hazir && t.kalan > 0 && <p className="tc-stok-not">Seçilen lotlar isteneni karşılamıyor: {birimliMiktar(bindenMetin(t.kalan), t.birim)} eksik. Böyle teslim ederseniz kalan için yeni istek açılır.</p>}
        {!t.l.data.yeterli && <p className="tc-stok-not">Serbest stok isteneni karşılamıyor (mevcut {birimliMiktar(t.l.data.mevcut, t.birim)}).</p>}
        <div className="tc-stok-sag">{elleBagi}</div>
      </div>
    </Pencere>
  );
}
