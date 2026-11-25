import { useSyncExternalStore } from 'react';
import { Rozet, Tablo, type RozetTonu, type Sutun } from '../../../ortak/arayuz/index.ts';
import { PRIO } from '../merkez/constants.ts';
import { IS_ADI, isSatirlari, kalemSatirlari, teslimatOf, termineGore, type IsSatiri, type IsTuru, type KalemSatiri } from '../merkez/is-tablosu.ts';
import { gelisGunu } from '../merkez/kimlik.ts';
import { go } from '../merkez/ui.ts';
import { dayDiff, fmtDate, nf0, nfx, todayStr } from '../merkez/util.ts';
import { CizimSayisi, KalemOzeti } from './KalemOzeti.tsx';

const TUR_TONU: Record<IsTuru, RozetTonu> = { order: 'uyari', decide: 'uyari', draft: 'bilgi', quotes: 'pasif', delivery: 'bilgi', approval: 'pasif' };
const SEKME: Record<IsTuru, string> = { order: 'order', decide: 'compare', draft: 'quotes', quotes: 'quotes', delivery: 'delivery', approval: 'approval' };
const ac = (s: IsSatiri) => { go('request', s.r.id, SEKME[s.tur]); };

function Gelis({ s, bugun }: { s: IsSatiri; bugun: string }) {
  const g = gelisGunu(s.r);
  if (!g) return <>–</>;
  const once = dayDiff(g, bugun);
  return <span className="sa-ekran-govde"><span>{fmtDate(g)}</span><small>{once === 0 ? 'bugün' : `${nf0.format(once)} gün önce`}</small></span>;
}
function Termin({ s, bugun }: { s: IsSatiri; bugun: string }) {
  if (!s.r.needDate) return <>–</>;
  const d = dayDiff(bugun, s.r.needDate);
  const acik = s.tur !== 'delivery';
  return (
    <span className="sa-ekran-govde">
      <span>{fmtDate(s.r.needDate)}</span>
      {acik && d < 0 && <Rozet ton="hata">{nf0.format(-d)} gün geçti</Rozet>}
      {acik && d >= 0 && <small>{d === 0 ? 'bugün' : `${nf0.format(d)} gün kaldı`}</small>}
    </span>
  );
}
function TeslimatHucresi({ s, bugun }: { s: IsSatiri; bugun: string }) {
  const t = teslimatOf(s.r, bugun);
  if (t.tarih === null) return <span className="sa-ekran-govde"><span>–</span><small>{s.tur === 'draft' ? 'teklif istenmedi' : 'teklif gelmedi'}</small></span>;
  const gec = termineGore(s.r, t);
  const ne = t.kaynak === 'siparis' ? 'siparişte beklenen' : t.kaynak === 'karar' ? `kararla ${nf0.format(t.gun ?? 0)} gün` : `en iyi teklif ${nf0.format(t.gun ?? 0)} gün`;
  return (
    <span className="sa-ekran-govde">
      <span title={t.kaynak === 'siparis' ? undefined : 'Tahmini: en iyi tekliften hesaplandı'}>{t.kaynak === 'siparis' ? '' : <><span aria-hidden="true">~</span><span className="sr-only">tahmini </span></>}{fmtDate(t.tarih)}</span>
      <small>{ne}</small>
      {gec !== null && <Rozet ton="hata">termine {nf0.format(gec)} gün geç</Rozet>}
    </span>
  );
}
// Sıradaki iş rozetle, tonu yalnız işin türünden (gecikme Termin ve Teslimat'ta kırmızıdır); satıra basınca talep o işin adımında açılır (ayrı düğme sütunu tabloyu 1280'de taşırıyordu).
function Is({ s }: { s: IsSatiri }) {
  return (
    <span className="sa-ekran-govde">
      <Rozet ton={TUR_TONU[s.tur]}>{IS_ADI[s.tur]}</Rozet>
      {s.adimdaGun !== null && <small>{nf0.format(s.adimdaGun)} gündür bu adımda</small>}
    </span>
  );
}
// 3442-1 b (kullanıcı 19.11): her kalem ayrı satır, miktarıyla; talebin no ve adı malzemenin altında. 3571: kalemin alt satırları
// (kart, talep notu, alternatif sınırı 3572-0) tek bileşende; talebin çizim sayısı numaranın yanında.
const Malzeme = ({ s }: { s: KalemSatiri }) => (
  <span className="sa-ekran-govde">
    <b>{s.r.priority === 'urgent' && <Rozet ton="hata">{PRIO.urgent}</Rozet>} {s.kalem.name}</b>
    <KalemOzeti kalem={s.kalem} talepId={s.r.id} />
    <small className="sa-is-malzeme" title={`${s.r.no} ${s.r.title}`}><span className="sa-ekran-kimlik-no">{s.r.no}</span>
      <CizimSayisi sayi={s.r.cizimSayisi} /> {s.r.title}</small>
  </span>
);
// 3442-1: kullanıcı ilk sayfayı tablo olarak istedi; tablet ve masaüstünde sütun sığmasa da tablo kalır (yatay kayar, talep sütunu
// sabit). Telefonda satırlar kart olur.
const GENIS = '(min-width: 768px)';
const genisMi = () => typeof window.matchMedia === 'function' && window.matchMedia(GENIS).matches;
const genisAbone = (f: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const m = window.matchMedia(GENIS);
  m.addEventListener('change', f);
  return () => { m.removeEventListener('change', f); };
};

export function IsTablosu() {
  const tabloKipi = useSyncExternalStore(genisAbone, genisMi) ? 'kaydir' : 'uyarlanir';
  const bugun = todayStr();
  const sutunlar: Sutun<KalemSatiri>[] = [
    { anahtar: 'malzeme', baslik: 'Malzeme', sabit: 'sol', kartTamSatir: true, hucre: (s) => <Malzeme s={s} />, csv: (s) => `${s.r.no} ${s.r.title}: ${s.kalem.name}` },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (s) => (s.kalem.qty === null ? '–' : `${nfx.format(s.kalem.qty)} ${s.kalem.unit}`), csv: (s) => (s.kalem.qty === null ? '' : `${String(s.kalem.qty)} ${s.kalem.unit}`) },
    { anahtar: 'is', baslik: 'Sıradaki iş', kirilmaz: true, hucre: (s) => <Is s={s} />, csv: (s) => IS_ADI[s.tur] },
    { anahtar: 'gelis', baslik: 'Talep tarihi', kirilmaz: true, hucre: (s) => <Gelis s={s} bugun={bugun} />, csv: (s) => gelisGunu(s.r) },
    { anahtar: 'termin', baslik: 'İstenen termin', kirilmaz: true, hucre: (s) => <Termin s={s} bugun={bugun} />, csv: (s) => s.r.needDate || '' },
    { anahtar: 'teslimat', baslik: 'Beklenen teslim', kirilmaz: true, hucre: (s) => <TeslimatHucresi s={s} bugun={bugun} />, csv: (s) => teslimatOf(s.r, bugun).tarih ?? '' },
  ];
  return (
    <div className="sa-is-tablosu"><Tablo kip={tabloKipi} etiket="Satın alma işleri, kalem kalem" sutunlar={sutunlar} satirlar={kalemSatirlari(isSatirlari())} satirAnahtari={(s) => `${s.r.id}-${s.kalem.id}`} satirSec={ac}
      bosMesaj="Bekleyen satın alma işi yok." arac={{ csv: { ad: 'satin-alma-isleri' } }} /></div>
  );
}
