import { DurumKutusu, Dugme, Rozet, SayfaBasligi, Sekmeler, Simge, type MenuOgesi } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { budgetUse, durumEtiketi } from '../merkez/calc.ts';
import { PRIO } from '../merkez/constants.ts';
import { S, V } from '../merkez/store.ts';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { AYRINTI, eylemCalistir, go } from '../merkez/ui.ts';
import { dayDiff, fmtDate, money, pct, todayStr } from '../merkez/util.ts';
import { grupMetni } from '../merkez/guncelleme-grubu.ts';
import {
  ADIMLAR, KARAR_SONRASI, TUTAR_ETIKETI, adimBilgisi, adimSirasi, basliktakiTutar, gecikmisMi, kimde, nextStep, render, talepBolumu, talepIslemleri, type NextBtn,
} from '../merkez/views.ts';
import { gelisGunu, kalemOzeti } from '../merkez/kimlik.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { TalepCizimleri } from '../talep/Cizimler.tsx';
import { KimlikSeridi, durumTonu } from './KimlikSeridi.tsx';

// Talep ayrıntısı (2412-2): yedi adım tek sekme şeridinde (biten adım onay işaretli), altında "Şimdi yapılacak" ve tek ana düğme
// başlıkta. Seçili adımın içeriği merkezin gövdesindedir (#main); düğmeler merkezin işlemlerini adıyla çağırır.
const ADIM_SIMGESI: Record<string, SimgeAdi> = {
  items: 'list', rfq: 'mail', quotes: 'tag', compare: 'chart', approval: 'clipboard-check', order: 'cart', delivery: 'truck', log: 'clock',
};
const ISLEM_SIMGESI: Record<string, SimgeAdi> = {
  'req-edit': 'edit', rfq: 'tag', 'approval-form': 'file', 'req-uncancel': 'rotate', 'req-cancel': 'x', 'req-delete': 'trash',
};
const DONUS: Record<string, string> = { dash: "Bugün'e dön", requests: 'Taleplere dön', orders: 'Siparişlere dön' };

const dugmeVerisi = (b: NextBtn): Record<string, string> => (b[3] ? { tab: b[3] } : {});
function calistir(b: NextBtn) {
  if (b[0] === 'tab') { V.tab = b[3] ?? null; render(); return; }
  eylemCalistir(b[0], dugmeVerisi(b));
}

// 3466-3 (H1): başlığın altında yalnız durum rozetleri; talebin bilgileri eşit kutulu bir ızgarada, her kutuda ad, değer ve kısa açıklama.
function Meta({ r }: { r: PurchaseRequest }) {
  const bugun = todayStr();
  return (
    <span className="sa-ekran-meta">
      <Rozet ton={durumTonu(r, bugun)}>{durumEtiketi(r)}</Rozet>
      {r.priority === 'urgent' && <Rozet ton="hata">{PRIO.urgent}</Rozet>}
    </span>
  );
}
const gunMetni = (d: number, ileri: string, geri: string): string => (d === 0 ? 'bugün' : d > 0 ? `${String(d)} ${ileri}` : `${String(-d)} ${geri}`);
function Bilgiler({ r }: { r: PurchaseRequest }) {
  const bugun = todayStr();
  const gelis = gelisGunu(r);
  const acik = ['draft', 'rfq', 'eval', 'approval'].includes(r.status);
  const tutar = basliktakiTutar(r);
  const nq = (r.quotes ?? []).length, nr = (r.rfqs ?? []).length;
  const bu = r.department ? budgetUse(r.department, bugun.slice(0, 4)) : null;
  const grup = grupMetni(r);
  const kutular: { ad: string; simge: SimgeAdi; deger: string; alt?: string }[] = [];
  if (gelis) kutular.push({ ad: 'Geliş', simge: 'clock', deger: fmtDate(gelis), alt: gunMetni(dayDiff(gelis, bugun), 'gün önce', 'gün sonra') });
  if (r.needDate) kutular.push({ ad: 'İhtiyaç', simge: 'calendar', deger: fmtDate(r.needDate), ...(acik ? { alt: gunMetni(dayDiff(bugun, r.needDate), 'gün var', 'gün geçti') } : {}) });
  kutular.push({ ad: 'Malzeme', simge: 'box', deger: kalemOzeti(r) });
  if (r.requester || r.department) kutular.push({ ad: 'Talep eden', simge: 'user', deger: r.requester || r.department, ...(r.requester && r.department ? { alt: r.department } : {}) });
  if (r.uretimEmriNo) kutular.push({ ad: 'Üretim emri', simge: 'route', deger: r.uretimEmriNo });
  kutular.push({ ad: 'Teklif ve tutar', simge: 'lira', deger: `${String(nq)} teklif${nr ? ` / ${String(nr)} istendi` : ''}`, ...(tutar ? { alt: `${TUTAR_ETIKETI[tutar.tur]} ${money(tutar.tl, 'TRY', 0)}` } : {}) });
  if (bu?.budget) kutular.push({ ad: `${r.department} bütçesi`, simge: 'chart', deger: pct((bu.used / bu.budget) * 100) });
  if (grup) kutular.push({ ad: 'Grup', simge: 'layers', deger: grup });
  return (
    <dl className="sa-ekran-bilgi" aria-label="Talebin bilgileri">
      {kutular.map((k) => (
        <div key={k.ad} className={k.ad === 'İhtiyaç' && gecikmisMi(r, bugun) ? 'sa-ekran-bilgi-gec' : undefined}>
          <dt><Simge ad={k.simge} boyut="k" />{k.ad}</dt>
          <dd className="sa-ekran-bilgi-deger">{k.deger}</dd>
          {k.alt && <dd className="sa-ekran-bilgi-alt">{k.alt}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function TalepAyrinti() {
  // 3442-2: talebin çizimi her adımda görünür; yazan ekler. Kanca erken dönüşten önce.
  const yazar = (useOturum().data?.islemler ?? []).includes('satin-alma.yaz');
  const r = V.id ? S.requests[V.id] : undefined;
  const donus = DONUS[AYRINTI.donus] ?? 'Taleplere dön';
  const geri = (
    <div className="sa-ekran-geri">
      <Dugme tur="ikincil" simge="chev-left" onClick={() => { if (AYRINTI.geri) AYRINTI.geri(); else go(AYRINTI.donus); }} data-sa-geri="">{donus}</Dugme>
      {r && <span className="sa-ekran-kimlik-no">{r.no}</span>}
    </div>
  );
  if (!r) return <div className="sa-ekran">{geri}<DurumKutusu durum="bos" mesaj="Talep bulunamadı; silinmiş olabilir." /></div>;

  const sec = talepBolumu(r);
  const curI = adimSirasi(r);
  const n = nextStep(r);
  // Açık adıma götüren düğme tekrar çizilmez (eski "Şimdi yapılacak" bandının kuralı).
  const dugmeler = n.b.filter(([act, , , t]) => !(act === 'tab' && (t === sec || (t === 'decision' && KARAR_SONRASI.includes(sec)))));
  const ana = dugmeler.find((b) => b[2]) ?? null;
  const diger = dugmeler.filter((b) => b !== ana);
  const kim = kimde(r);
  const bilgi = adimBilgisi(r);
  const eylemler: MenuOgesi[] = [
    ...diger.map((b): MenuOgesi => ({ anahtar: `n-${b[0]}-${b[3] ?? ''}`, baslik: b[1], simge: 'next', sec: () => { calistir(b); } })),
    ...talepIslemleri(r).map(([act, baslik, tehlike]): MenuOgesi => ({
      anahtar: act, baslik, simge: ISLEM_SIMGESI[act] ?? 'more', sec: () => { eylemCalistir(act); }, ...(tehlike ? { ton: 'tehlike' as const } : {}),
    })),
  ];
  const sekmeler = [...ADIMLAR.map(([k, l], j) => ({
    anahtar: k as string,
    baslik: k === 'compare' ? 'Karar' : k === 'items' ? 'Kalemler' : k === 'quotes' ? 'Teklifler' : l,
    simge: curI >= 0 && j < curI ? 'check' as SimgeAdi : ADIM_SIMGESI[k]!,
  })), { anahtar: 'log', baslik: 'Geçmiş', simge: ADIM_SIMGESI.log! }];
  return (
    <div className="sa-ekran sa-ekran-ayrinti">
      <KimlikSeridi r={r} adim={sekmeler.find((x) => x.anahtar === sec)?.baslik ?? ''} baslik=".sa-ekran-ayrinti .tc-sbaslik" />
      {geri}
      <SayfaBasligi
        baslik={r.title}
        simge="tag"
        alt={<Meta r={r} />}
        {...(ana ? { birincil: { etiket: ana[1], yap: () => { calistir(ana); } } } : {})}
        eylemler={eylemler}
      />
      <Bilgiler r={r} />
      {r.status !== 'cancelled' && (
        <div className={`sa-ekran-simdi${n.cls ? ` sa-ekran-simdi-${n.cls}` : ''}`} role="status">
          <Simge ad={n.cls === 'bad' ? 'alert' : n.cls === 'done' ? 'check' : 'flag'} />
          <span className="sa-ekran-govde">
            <b>{n.cls === 'done' ? n.t : `Şimdi yapılacak: ${n.t}`}</b>
            <small>{[n.s, kim ? `Bekleyen: ${kim}.` : ''].filter(Boolean).join(' ')}</small>
          </span>
        </div>
      )}
      <div className="sa-ekran-cizim"><TalepCizimleri talepId={r.id} yazabilir={yazar && r.status !== 'cancelled'} bosGizle /></div>
      <Sekmeler etiket="Talebin adımları" secili={sec} sec={(k) => { V.tab = k; render(); }} sekmeler={sekmeler} />
      {bilgi[sec] && <p className="sa-ekran-adim-ozet">{sekmeler.find((s) => s.anahtar === sec)?.baslik}: {bilgi[sec]}</p>}
    </div>
  );
}
