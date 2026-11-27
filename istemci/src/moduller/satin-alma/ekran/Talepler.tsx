import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dugme, LogoBelgeAramasi, KilitliSutunNotu, Rozet, SayfaBasligi, Secim, Sekmeler, Simge, Tablo, YETKI_ADI, tabloCsvSatirlari, useTelefon, type RozetTonu, type Sutun, type TabloGrupSecenegi } from '../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../ortak/veri/csv.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { durumEtiketi } from '../merkez/calc.ts';
import { PRIO } from '../merkez/constants.ts';
import { grupMetni } from '../merkez/guncelleme-grubu.ts';
import { S, V, settings } from '../merkez/store.ts';
import type { PurchaseRequest, RequestStatus } from '../merkez/tipler.ts';
import { go } from '../merkez/ui.ts';
import { dayDiff, fiyatKilitli, fmtDate, money, norm, todayStr } from '../merkez/util.ts';
import { isSatirlari } from '../merkez/is-tablosu.ts';
import { TalepKalemleri } from './SatirAyrintisi.tsx';
import { TalepTarihi } from './TalepTarihi.tsx';
import { gelisGunu } from '../merkez/kimlik.ts';
import { STATUS_FILTERS, filteredRequests, gecikmisMi, kimde, render, reqValue } from '../merkez/views.ts';

// Talepler (2412-2): durum sekmeleri, ortak tablo, "Kimde bekliyor" sütunu ve tek tutar. Süzgeç ve sıra merkezin durumundadır (V);
// varsayılan sıra 2423 a: önce geciken, sonra öncelik, sonra ihtiyaç tarihi; sütun başlığı değiştirir. Pano görünümü merkezin gövdesindedir.
const DURUM_TONU: Record<RequestStatus, RozetTonu> = {
  draft: 'pasif', rfq: 'bilgi', eval: 'uyari', approval: 'uyari', ordered: 'bilgi', received: 'tamam', cancelled: 'pasif',
};
const SEKME_SIMGESI: Record<string, SimgeAdi> = {
  open: 'clock', approval: 'clipboard-check', ordered: 'truck', late: 'alert', received: 'check', cancelled: 'x', all: 'layers',
};
// Sade üst (3710 D): dört sekme her zaman görünür; öteki durumlar Süz menüsünden seçilir, seçiliyken beşinci sekme olarak durur.
const ANA_SEKMELER = ['open', 'approval', 'ordered', 'all'];
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

// 3798: Görünüm menüsünden gruplama; varsayılan Yok (bugünkü düz liste).
function terminGrubu(r: PurchaseRequest, bugun: string): string {
  if (!r.needDate) return 'Termin yok';
  const d = dayDiff(bugun, r.needDate);
  return d < 0 ? 'Gecikmiş' : d <= 7 ? 'Bu hafta' : 'Sonra';
}
const gruplar = (bugun: string): TabloGrupSecenegi<PurchaseRequest>[] => [
  { anahtar: 'durum', baslik: 'Durum', yol: (r) => [durumEtiketi(r)] },
  { anahtar: 'kimde', baslik: 'Kimde bekliyor', yol: (r) => [kimde(r) ?? 'Bekleyen yok'] },
  { anahtar: 'emir', baslik: 'Üretim emri', yol: (r) => [r.uretimEmriNo ? `Emir ${r.uretimEmriNo}` : 'Emirsiz'] },
  { anahtar: 'termin', baslik: 'İstenen termin', yol: (r) => [terminGrubu(r, bugun)] },
];

function SuzMenusu({ birimler, satirlar, sutunlar }: { birimler: string[]; satirlar: PurchaseRequest[]; sutunlar: Sutun<PurchaseRequest>[] }) {
  const kutu = useRef<HTMLDetailsElement>(null);
  // details dışarı basınca ve Esc ile kapanmaz; menü gibi davransın.
  useEffect(() => {
    const kapat = (o: Event) => {
      const d = kutu.current;
      if (!d?.open) return;
      if (o instanceof KeyboardEvent ? o.key === 'Escape' : !d.contains(o.target as Node)) {
        d.open = false;
        if (o instanceof KeyboardEvent) d.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', kapat);
    document.addEventListener('keydown', kapat);
    return () => { document.removeEventListener('pointerdown', kapat); document.removeEventListener('keydown', kapat); };
  }, []);
  const etkin = [V.prio, V.dept, ANA_SEKMELER.includes(V.status) ? '' : V.status].filter(Boolean).length;
  return (
    <details ref={kutu} className="sa-ekran-suz">
      <summary className="tc-dugme">Süz ve CSV{etkin > 0 && <span className="sa-ekran-suz-sayi" aria-label={`${etkin} süzgeç etkin`}>{etkin}</span>}</summary>
      <div className="sa-ekran-suz-panel">
        <Secim etiket="Durum" value={V.status} onChange={(e) => degistir(() => { V.status = e.target.value; })}
          secenekler={STATUS_FILTERS.map(([k, l]) => ({ deger: k, baslik: l }))} />
        <Secim etiket="Öncelik" value={V.prio} onChange={(e) => degistir(() => { V.prio = e.target.value; })}
          bosSecenek="Her öncelik" secenekler={Object.entries(PRIO).map(([k, l]) => ({ deger: k, baslik: l }))} />
        <Secim etiket="Birim" value={birimler.find((b) => norm(b) === norm(V.dept)) ?? ''} onChange={(e) => degistir(() => { V.dept = e.target.value; })}
          bosSecenek="Tüm birimler" secenekler={birimler.map((b) => ({ deger: b, baslik: b }))} />
        <Dugme simge="download" disabled={satirlar.length === 0}
          onClick={() => { const { basliklar, satirlar: veri } = tabloCsvSatirlari(sutunlar, satirlar); csvIndir('talepler', basliklar, veri); }}>
          CSV indir ({satirlar.length} satır)
        </Dugme>
      </div>
    </details>
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
  const kilit = fiyatKilitli();
  const telefon = useTelefon();
  const isler = new Map(isSatirlari().map((s) => [s.r.id, s]));
  const tumSutunlar: Sutun<PurchaseRequest>[] = [
    { anahtar: 'no', baslik: 'No', hucre: (r) => r.no, mono: true, kirilmaz: true, sirala: true, sabit: 'sol' },
    {
      anahtar: 'title', baslik: 'Talep', sirala: true, kes: true, kartta: true,
      hucre: (r) => (
        <span className="sa-ekran-govde">
          <b>{r.priority === 'urgent' && <Rozet ton="hata">Acil</Rozet>} {r.title}</b>
          <small>{[telefon ? r.no : '', r.department, `${(r.items || []).length} kalem`, r.uretimEmriNo ? `emir ${r.uretimEmriNo}` : ''].filter(Boolean).join(', ')}</small>
          {grupMetni(r) && <small><Simge ad="layers" boyut="k" /> {grupMetni(r)}</small>}
        </span>
      ),
      csv: (r) => r.title,
    },
    { anahtar: 'status', baslik: 'Durum', sirala: true, kirilmaz: true, kartRozet: true, hucre: (r) => <Rozet ton={gecikmisMi(r, bugun) ? 'hata' : DURUM_TONU[r.status]}>{durumEtiketi(r)}</Rozet>, csv: (r) => durumEtiketi(r) },
    {
      anahtar: 'kimde', baslik: 'Kimde bekliyor', kirilmaz: true,
      hucre: (r) => { const k = kimde(r); return k === null ? '–' : <span className="sa-ekran-kimde"><Simge ad={kimdeSimgesi(k)} boyut="k" />{k}</span>; },
      csv: (r) => kimde(r) ?? '',
    },
    { anahtar: 'quotes', baslik: 'Teklif', hizala: 'sag', sirala: true, hucre: (r) => `${(r.quotes || []).length}${(r.rfqs || []).length > (r.quotes || []).length ? ` / ${(r.rfqs || []).length}` : ''}` },
    {
      anahtar: 'value', baslik: 'Tutar', hizala: 'sag', kirilmaz: true, sirala: true,
      hucre: (r) => { const v = reqValue(r); return v.v === null ? '–' : <span className="sa-ekran-govde sa-ekran-sag"><b>{money(v.v, 'TRY', 0)}</b><small>{v.who}</small></span>; },
      csv: (r) => reqValue(r).v ?? '',
    },
    { anahtar: 'created', baslik: 'Talep tarihi', kirilmaz: true, sirala: true, hucre: (r) => <TalepTarihi r={r} bugun={bugun} />, csv: (r) => gelisGunu(r) },
    { anahtar: 'need', baslik: 'İstenen termin', kirilmaz: true, sirala: true, kartta: true, hucre: (r) => ihtiyac(r, bugun), csv: (r) => r.needDate || '' },
  ];
  // 3401-1 a: fiyat görmeyen okuyucuda tutar sütunu çizilmez; üstte tek kilit notu durur.
  // 3748-1: telefonda kayıt kartının başlığı talebin adıdır (ilk sütun); no adın altındaki satırda yazılır, sütunu kartta görünmez ama CSV'de kalır.
  const fiyatli = tumSutunlar.filter((x) => !(kilit && x.anahtar === 'value'));
  const sutunlar = telefon ? [...fiyatli.filter((x) => x.anahtar !== 'no'), ...fiyatli.filter((x) => x.anahtar === 'no').map((x) => ({ ...x, kartta: false }))] : fiyatli;
  return (
    <div className="sa-ekran sa-ekran-talepler">
      <SayfaBasligi
        baslik="Talepler" simge="list"
        ek={<LogoBelgeAramasi tur="talep" />}
        eylemler={[pano
          ? { anahtar: 'liste', baslik: 'Liste görünümü', simge: 'list', sec: () => degistir(() => { V.view = 'list'; }) }
          : { anahtar: 'pano', baslik: 'Akış panosu', simge: 'kanban', sec: () => degistir(() => { V.view = 'board'; }) }]}
      />
      {kilit && <KilitliSutunNotu ne="Fiyat sütunları" yetki={YETKI_ADI.satinAlmaFiyati} />}
      {!pano && (
        <Sekmeler
          etiket="Talep durumu" secili={V.status}
          sec={(k) => degistir(() => { V.status = k; })}
          sekmeler={STATUS_FILTERS.filter(([k]) => ANA_SEKMELER.includes(k) || k === V.status).map(([k, l, f]) => ({ anahtar: k, baslik: l, simge: SEKME_SIMGESI[k] ?? 'list', sayi: hepsi.filter(f).length }))}
        />
      )}
      {pano
        ? <p className="sa-ekran-not">Akış panosu: her durumun talepleri sütununda. Liste için sağ üstteki menü.</p>
        : (
          <Tablo
            kip="kayit" etiket="Talepler" sutunlar={sutunlar} satirlar={liste} satirAnahtari={(r) => r.id}
            satirSec={(r) => { go('request', r.id, 'items'); }}
            ayrinti={(r) => <TalepKalemleri r={r} is={isler.get(r.id)} />}
            bosMesaj={hepsi.length ? 'Bu süzgece uyan talep yok.' : 'Henüz talep yok. Talepler Taleplerim sayfasından açılır.'}
            siralama={V.sort ? { alan: V.sort, yon: V.dir > 0 ? 'artan' : 'azalan' } : null}
            siralamaDegistir={(s) => degistir(() => { V.sort = s?.alan ?? ''; V.dir = s?.yon === 'azalan' ? -1 : 1; })}
            arac={{
              arama: { deger: V.q, degistir: (q) => degistir(() => { V.q = q; }), etiket: 'Taleplerde ara', yerTutucu: 'No, talep, kalem, tedarikçi ya da emir no' },
              gorunum: { anahtar: 'satin-alma-talepler', gruplar: gruplar(bugun), varsayilanGrup: 'yok' },
              sag: <SuzMenusu birimler={birimler} satirlar={liste} sutunlar={sutunlar} />,
            }}
          />
        )}
    </div>
  );
}
