import { DurumKutusu, Dugme, Rozet, SayfaBasligi, Sekmeler, Simge, type MenuOgesi } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { durumEtiketi } from '../merkez/calc.ts';
import { PRIO } from '../merkez/constants.ts';
import { S, V } from '../merkez/store.ts';
import type { PurchaseRequest } from '../merkez/tipler.ts';
import { AYRINTI, eylemCalistir, go } from '../merkez/ui.ts';
import { dayDiff, fmtDate, todayStr } from '../merkez/util.ts';
import {
  ADIMLAR, KARAR_SONRASI, adimBilgisi, adimSirasi, gecikmisMi, headerFacts, kimde, nextStep, render, talepBolumu, talepIslemleri, type NextBtn,
} from '../merkez/views.ts';

// Talep ayrıntısı (2412-2): altı adım tek sekme şeridinde (biten adım onay işaretli), altında "Şimdi yapılacak" ve tek ana düğme
// başlıkta. Seçili adımın içeriği merkezin gövdesindedir (#main); düğmeler merkezin işlemlerini adıyla çağırır.
const ADIM_SIMGESI: Record<string, SimgeAdi> = {
  items: 'list', quotes: 'tag', compare: 'chart', approval: 'clipboard-check', order: 'cart', delivery: 'truck', log: 'clock',
};
const ISLEM_SIMGESI: Record<string, SimgeAdi> = {
  'req-edit': 'edit', rfq: 'tag', 'approval-form': 'file', 'req-uncancel': 'rotate', 'req-cancel': 'x', 'req-delete': 'trash',
};
const DONUS: Record<string, string> = { dash: "Bugün'e dön", requests: 'Taleplere dön', orders: 'Siparişlere dön' };

// Merkezin metinleri kaçırılmış HTML'dir (b, span); başlık satırında düz metin gerekir.
function duzMetin(html: string): string {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content.textContent ?? '';
}
const dugmeVerisi = (b: NextBtn): Record<string, string> => (b[3] ? { tab: b[3] } : {});
function calistir(b: NextBtn) {
  if (b[0] === 'tab') { V.tab = b[3] ?? null; render(); return; }
  eylemCalistir(b[0], dugmeVerisi(b));
}

function Meta({ r }: { r: PurchaseRequest }) {
  const bugun = todayStr();
  const d = r.needDate ? dayDiff(bugun, r.needDate) : null;
  const acik = ['draft', 'rfq', 'eval', 'approval'].includes(r.status);
  return (
    <span className="sa-ekran-meta">
      <Rozet ton={r.status === 'cancelled' ? 'pasif' : gecikmisMi(r, bugun) ? 'hata' : r.status === 'received' ? 'tamam' : 'uyari'}>{durumEtiketi(r)}</Rozet>
      {r.priority === 'urgent' && <Rozet ton="hata">{PRIO.urgent}</Rozet>}
      {r.department && <span><Simge ad="building" boyut="k" />{r.department}</span>}
      {r.requester && <span><Simge ad="user" boyut="k" />Talep eden {r.requester}</span>}
      {r.needDate && <span><Simge ad="calendar" boyut="k" />İhtiyaç {fmtDate(r.needDate)}{acik && d !== null ? (d < 0 ? `, ${-d} gün geçti` : ` (${d} gün)`) : ''}</span>}
      {r.uretimEmriNo && <span><Simge ad="route" boyut="k" />Üretim emri {r.uretimEmriNo}</span>}
      {headerFacts(r).map((f) => <span key={f} className="sa-ekran-soluk">{duzMetin(f)}</span>)}
    </span>
  );
}

export function TalepAyrinti() {
  const r = V.id ? S.requests[V.id] : undefined;
  const donus = DONUS[AYRINTI.donus] ?? 'Taleplere dön';
  const geri = (
    <div className="sa-ekran-geri">
      <Dugme tur="ikincil" simge="chev-left" onClick={() => { if (AYRINTI.geri) AYRINTI.geri(); else go(AYRINTI.donus); }} data-sa-geri="">{donus}</Dugme>
      {r && <span className="sa-ekran-soluk">{r.no}</span>}
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
      {geri}
      <SayfaBasligi
        baslik={r.title}
        simge="tag"
        alt={<Meta r={r} />}
        {...(ana ? { birincil: { etiket: ana[1], yap: () => { calistir(ana); } } } : {})}
        eylemler={eylemler}
      />
      {r.status !== 'cancelled' && (
        <div className={`sa-ekran-simdi${n.cls ? ` sa-ekran-simdi-${n.cls}` : ''}`} role="status">
          <Simge ad={n.cls === 'bad' ? 'alert' : n.cls === 'done' ? 'check' : 'flag'} />
          <span className="sa-ekran-govde">
            <b>{n.cls === 'done' ? n.t : `Şimdi yapılacak: ${n.t}`}</b>
            <small>{[n.s, kim ? `Bekleyen: ${kim}.` : ''].filter(Boolean).join(' ')}</small>
          </span>
        </div>
      )}
      <Sekmeler etiket="Talebin adımları" secili={sec} sec={(k) => { V.tab = k; render(); }} sekmeler={sekmeler} />
      {bilgi[sec] && <p className="sa-ekran-not sa-ekran-adim-ozet">{sekmeler.find((s) => s.anahtar === sec)?.baslik}: {bilgi[sec]}</p>}
    </div>
  );
}
