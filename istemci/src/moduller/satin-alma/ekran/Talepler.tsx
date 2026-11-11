import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Rozet, SayfaBasligi, Secim, Sekmeler, Simge, Tablo, type RozetTonu, type Sutun } from '../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { durumEtiketi } from '../merkez/calc.ts';
import { PRIO } from '../merkez/constants.ts';
import { grupMetni } from '../merkez/guncelleme-grubu.ts';
import { S, V, settings } from '../merkez/store.ts';
import type { PurchaseRequest, RequestStatus } from '../merkez/tipler.ts';
import { go } from '../merkez/ui.ts';
import { dayDiff, fmtDate, money, norm, todayStr } from '../merkez/util.ts';
import { STATUS_FILTERS, filteredRequests, gecikmisMi, kimde, render, reqValue } from '../merkez/views.ts';

// Talepler (2412-2): durum sekmeleri, ortak tablo, "Kimde bekliyor" sütunu ve tek tutar. Süzgeç ve sıra merkezin durumundadır (V);
// varsayılan sıra 2423 a: önce geciken, sonra öncelik, sonra ihtiyaç tarihi; sütun başlığı değiştirir. Pano görünümü merkezin gövdesindedir.
const DURUM_TONU: Record<RequestStatus, RozetTonu> = {
  draft: 'pasif', rfq: 'bilgi', eval: 'uyari', approval: 'uyari', ordered: 'bilgi', received: 'tamam', cancelled: 'pasif',
};
const SEKME_SIMGESI: Record<string, SimgeAdi> = {
  open: 'clock', approval: 'clipboard-check', ordered: 'truck', late: 'alert', received: 'check', cancelled: 'x', all: 'layers',
};
const kimdeSimgesi = (k: string): SimgeAdi => (k.startsWith('Tedarikçi') ? 'truck' : k === 'Satın alma' ? 'cart' : 'user');
const degistir = (f: () => void) => { f(); render(); };

function ihtiyac(r: PurchaseRequest, bugun: string) {
  if (!r.needDate) return '–';
  const d = dayDiff(bugun, r.needDate);
  const acik = ['draft', 'rfq', 'eval', 'approval'].includes(r.status);
  return (
    <span className="sa-ekran-ihtiyac">
      {fmtDate(r.needDate)}
      {acik && d < 0 && <Rozet ton="hata">{-d} gün geçti</Rozet>}
      {acik && d >= 0 && d <= 7 && <Rozet ton="uyari">{d} gün</Rozet>}
    </span>
  );
}

export function Talepler() {
  const [adres, adresYaz] = useSearchParams();
  // İş kutusunun sayı kartı süzgeci adresle getirir; süzgeç merkeze geçince adres temizlenir.
  useEffect(() => {
    const durum = adres.get('durum');
    if (durum === null) return;
    if (STATUS_FILTERS.some(([k]) => k === durum)) degistir(() => { V.status = durum; V.view = 'list'; });
    const y = new URLSearchParams(adres); y.delete('durum'); adresYaz(y, { replace: true });
  }, [adres, adresYaz]);

  const hepsi = Object.values(S.requests);
  const liste = filteredRequests();
  const bugun = todayStr();
  const pano = V.view === 'board';
  const birimler = [...new Set([...(settings().departments || []).map((d) => d.name), ...hepsi.map((r) => r.department).filter(Boolean)])] as string[];
  const sutunlar: Sutun<PurchaseRequest>[] = [
    { anahtar: 'no', baslik: 'No', hucre: (r) => r.no, mono: true, kirilmaz: true, sirala: true },
    {
      anahtar: 'title', baslik: 'Talep', sirala: true,
      hucre: (r) => (
        <span className="sa-ekran-govde">
          <b>{r.priority === 'urgent' && <Rozet ton="hata">Acil</Rozet>} {r.title}</b>
          <small>{[r.department, `${(r.items || []).length} kalem`, r.uretimEmriNo ? `emir ${r.uretimEmriNo}` : ''].filter(Boolean).join(', ')}</small>
          {grupMetni(r) && <small><Simge ad="layers" boyut="k" /> {grupMetni(r)}</small>}
        </span>
      ),
      csv: (r) => r.title,
    },
    { anahtar: 'status', baslik: 'Durum', sirala: true, kirilmaz: true, hucre: (r) => <Rozet ton={gecikmisMi(r, bugun) ? 'hata' : DURUM_TONU[r.status]}>{durumEtiketi(r)}</Rozet>, csv: (r) => durumEtiketi(r) },
    {
      anahtar: 'kimde', baslik: 'Kimde bekliyor',
      hucre: (r) => { const k = kimde(r); return k === null ? '–' : <span className="sa-ekran-kimde"><Simge ad={kimdeSimgesi(k)} boyut="k" />{k}</span>; },
      csv: (r) => kimde(r) ?? '',
    },
    { anahtar: 'quotes', baslik: 'Teklif', hizala: 'sag', sirala: true, hucre: (r) => `${(r.quotes || []).length}${(r.rfqs || []).length > (r.quotes || []).length ? ` / ${(r.rfqs || []).length}` : ''}` },
    {
      anahtar: 'value', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, sirala: true,
      hucre: (r) => { const v = reqValue(r); return v.v === null ? '–' : <span className="sa-ekran-govde sa-ekran-sag"><b>{money(v.v, 'TRY', 0)}</b><small>{v.who}</small></span>; },
      csv: (r) => reqValue(r).v ?? '',
    },
    { anahtar: 'need', baslik: 'İhtiyaç', kirilmaz: true, sirala: true, hucre: (r) => ihtiyac(r, bugun), csv: (r) => r.needDate || '' },
  ];
  return (
    <div className="sa-ekran sa-ekran-talepler">
      <SayfaBasligi
        baslik="Talepler" simge="list"
        alt="Talepler Taleplerim'den açılır; burada teklif, karar ve sipariş yürür."
        eylemler={[pano
          ? { anahtar: 'liste', baslik: 'Liste görünümü', simge: 'list', sec: () => degistir(() => { V.view = 'list'; }) }
          : { anahtar: 'pano', baslik: 'Akış panosu', simge: 'kanban', sec: () => degistir(() => { V.view = 'board'; }) }]}
      />
      {!pano && (
        <Sekmeler
          etiket="Talep durumu" secili={V.status}
          sec={(k) => degistir(() => { V.status = k; })}
          sekmeler={STATUS_FILTERS.map(([k, l, f]) => ({ anahtar: k, baslik: l, simge: SEKME_SIMGESI[k] ?? 'list', sayi: hepsi.filter(f).length }))}
        />
      )}
      {pano
        ? <p className="sa-ekran-not">Akış panosu: her durumun talepleri sütununda. Liste için sağ üstteki menü.</p>
        : (
          <Tablo
            etiket="Talepler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(r) => r.id}
            satirSec={(r) => { go('request', r.id); }}
            bosMesaj={hepsi.length ? 'Bu süzgece uyan talep yok.' : 'Henüz talep yok. Talepler Taleplerim sayfasından açılır.'}
            siralama={V.sort ? { alan: V.sort, yon: V.dir > 0 ? 'artan' : 'azalan' } : null}
            siralamaDegistir={(s) => degistir(() => { V.sort = s?.alan ?? ''; V.dir = s?.yon === 'azalan' ? -1 : 1; })}
            arac={{
              arama: { deger: V.q, degistir: (q) => degistir(() => { V.q = q; }), etiket: 'Taleplerde ara', yerTutucu: 'No, talep, kalem, tedarikçi ya da emir no' },
              csv: { ad: 'talepler' },
              sag: (
                <span className="sa-ekran-suzgecler">
                  <Secim etiket="Öncelik" value={V.prio} onChange={(e) => degistir(() => { V.prio = e.target.value; })}
                    bosSecenek="Her öncelik" secenekler={Object.entries(PRIO).map(([k, l]) => ({ deger: k, baslik: l }))} />
                  <Secim etiket="Birim" value={birimler.find((b) => norm(b) === norm(V.dept)) ?? ''} onChange={(e) => degistir(() => { V.dept = e.target.value; })}
                    bosSecenek="Tüm birimler" secenekler={birimler.map((b) => ({ deger: b, baslik: b }))} />
                </span>
              ),
            }}
          />
        )}
    </div>
  );
}
