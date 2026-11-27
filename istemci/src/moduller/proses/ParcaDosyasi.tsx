import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  NcProgramYazmaCevabi, ProsesHalkaAnahtari, ProsesHalkaDurumu, ProsesHalkasi, ProsesNcProgrami, ProsesOperasyonu, ProsesParcaCevabi, ProsesRevizyonu,
} from '#paylasilan/sozlesme/proses.ts';
import {
  DurumKutusu, Kart, MalzemeSecici, Rozet, Secim, Sekmeler, Simge, Tablo, useBildirim, type RozetTonu, type SeciliKayit, type Sutun,
} from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { eskiGovdesi } from './NcFormu.tsx';
import { NcSekmesi } from './NcSekmesi.tsx';
import { dk } from './nc.ts';
import './proses.css';

const HALKA: Record<ProsesHalkaAnahtari, { ad: string; simge: SimgeAdi }> = {
  cizim: { ad: 'Çizim', simge: 'file' },
  rota: { ad: 'Rota', simge: 'route' },
  nc: { ad: 'NC program', simge: 'list' },
  takim: { ad: 'Takım listesi', simge: 'tool' },
  baglama: { ad: 'Bağlama, aparat', simge: 'cube' },
  kurulum: { ad: 'Kurulum sayfası', simge: 'wrench' },
  kontrol: { ad: 'Kontrol planı', simge: 'ruler' },
  'ilk-parca': { ad: 'İlk parça', simge: 'check' },
};

const DURUM: Record<ProsesHalkaDurumu, { ton: RozetTonu; metin: string }> = {
  tamam: { ton: 'tamam', metin: 'Tamam' },
  eksik: { ton: 'uyari', metin: 'Eksik' },
  yok: { ton: 'hata', metin: 'Yok' },
  gerekmez: { ton: 'pasif', metin: 'Henüz gerekmez' },
  'kaynak-yok': { ton: 'pasif', metin: 'Kaynak yok' },
};

function Halka({ h }: { h: ProsesHalkasi }) {
  const d = DURUM[h.durum];
  return (
    <li className="tc-proses-halka">
      <span className="tc-proses-halka-ad"><Simge ad={HALKA[h.anahtar].simge} />{HALKA[h.anahtar].ad}</span>
      <Rozet ton={d.ton} gorunum="cizgi">{d.metin}</Rozet>
      {h.ozet !== null && <span className="tc-proses-halka-ozet">{h.ozet}</span>}
      <span className="tc-proses-halka-sahip">{h.yol === null ? h.sahip : <Link to={h.yol}>{h.sahip}</Link>}</span>
    </li>
  );
}

const var_ = (x: boolean) => <Rozet ton={x ? 'tamam' : 'uyari'} gorunum="cizgi">{x ? 'Var' : 'Yok'}</Rozet>;

// Gerçek süre: rotanın kabul bekleyen işlem ölçümlerinin ortancası ve ölçüm sayısı (rota Süreler ekranındaki pencere).
const sure = (o: ProsesOperasyonu): string =>
  o.fason ? '—' : `${dk(o.birimSureDk)} / ${o.gercek === null ? '—' : `${dk(o.gercek.ortancaDk)} (${String(o.gercek.n)})`}`;

const SUTUNLAR: Sutun<ProsesOperasyonu>[] = [
  { anahtar: 'op', baslik: 'Op', mono: true, kirilmaz: true, hucre: (o) => o.opNo },
  { anahtar: 'ad', baslik: 'İşlem', hucre: (o) => (o.fason ? <>{o.ad} <Rozet ton="bilgi" gorunum="cizgi">Fason</Rozet></> : o.ad) },
  { anahtar: 'tezgah', baslik: 'Tezgah', mono: true, hucre: (o) => o.tezgah ?? '—' },
  { anahtar: 'sure', baslik: 'Süre (teorik / gerçek)', hizala: 'sag', mono: true, kirilmaz: true, hucre: sure },
  { anahtar: 'karakteristik', baslik: 'Karakt.', hizala: 'sag', mono: true, hucre: (o) => (o.karakteristik ?? '—') },
  { anahtar: 'talimat', baslik: 'Talimat', hucre: (o) => var_(o.talimat) },
  { anahtar: 'numune', baslik: 'Numune planı', hucre: (o) => (o.fason ? '—' : var_(o.numunePlani)) },
];

type SekmeAnahtari = 'ozet' | 'operasyonlar' | 'nc';

const REV_DURUM: Record<ProsesRevizyonu['durum'], string> = { yururlukte: 'yürürlükte', yayinda: 'yayında', eski: 'eski' };

// Revizyon seçici: az revizyonda düğme dizisi (tek dokunuş), çokta açılır liste. Revizyonsuz parçada çizilmez.
function RevizyonSecici({ veri, sec }: { veri: ProsesParcaCevabi; sec: (kod: string) => void }) {
  if (veri.revizyonlar.length === 0 || veri.seciliRevizyon === null) return null;
  if (veri.revizyonlar.length > 5) {
    return (
      <div className="tc-proses-rev-liste">
        <Secim etiket="Teknik resim revizyonu" value={veri.seciliRevizyon} onChange={(o) => { sec(o.target.value); }}
          secenekler={veri.revizyonlar.map((r) => ({ deger: r.kod, baslik: `Rev ${r.kod} · ${REV_DURUM[r.durum]}` }))} />
      </div>
    );
  }
  return (
    <div className="tc-proses-rev" role="group" aria-label="Teknik resim revizyonu">
      <span className="tc-proses-rev-etiket"><Simge ad="layers" />Teknik resim</span>
      {veri.revizyonlar.map((r) => (
        <button key={r.kod} type="button" className="tc-proses-rev-dugme" aria-pressed={r.kod === veri.seciliRevizyon}
          data-durum={r.durum} onClick={() => { sec(r.kod); }}>
          Rev {r.kod}<small>{REV_DURUM[r.durum]}</small>
        </button>
      ))}
    </div>
  );
}

function Ozet({ veri }: { veri: ProsesParcaCevabi }) {
  return (
    <>
      <ol className="tc-proses-zincir" aria-label="Proses zinciri">
        {veri.halkalar.map((h) => <Halka key={h.anahtar} h={h} />)}
      </ol>
      <p className="tc-proses-not">
        Durumu her halkanın sahibi modül verir; düzenleme sahibinin sayfasında yapılır. NC program, takım listesi ve bağlama halkaları
        seçili teknik resim revizyonunun NC/CAM kayıtlarından gelir. "Kaynak yok" halkanın parça düzeyinde okunacağı yer henüz yoktur.
      </p>
    </>
  );
}

interface DosyaOzellikleri {
  veri: ProsesParcaCevabi; sekme: SekmeAnahtari; sekmeYaz: (s: SekmeAnahtari) => void;
  revSec: (kod: string) => void; eskiYap: (p: ProsesNcProgrami) => void;
}

function Dosya({ veri, sekme, sekmeYaz, revSec, eskiYap }: DosyaOzellikleri) {
  const eksik = veri.halkalar.filter((h) => h.durum === 'eksik' || h.durum === 'yok').length;
  return (
    <>
      <div className="tc-proses-kunye">
        <span>Parça rev {veri.parcaRevizyonu ?? '—'}</span>
        <span>Rota {veri.rota === null ? '—' : `rev ${veri.rota.revizyon}`}</span>
        {eksik > 0 ? <Rozet ton="uyari">{eksik} halka eksik</Rozet> : <Rozet ton="tamam">Eksik halka yok</Rozet>}
      </div>
      <RevizyonSecici veri={veri} sec={revSec} />
      <Sekmeler etiket="Parça dosyası bölümleri" secili={sekme} sec={sekmeYaz} sekmeler={[
        { anahtar: 'ozet', baslik: 'Özet', simge: 'list' },
        { anahtar: 'operasyonlar', baslik: 'Operasyonlar', simge: 'route' },
        { anahtar: 'nc', baslik: 'NC/CAM', simge: 'file' },
      ]} />
      {sekme === 'ozet' && <Ozet veri={veri} />}
      {sekme === 'operasyonlar' && (
        <Tablo etiket="Operasyonlar" sutunlar={SUTUNLAR} satirlar={veri.operasyonlar} satirAnahtari={(o) => o.opNo}
          bosMesaj="Yürürlükte rota yok." />
      )}
      {sekme === 'nc' && <NcSekmesi veri={veri} eskiYap={eskiYap} />}
    </>
  );
}

// Seçili parça adreste durur (?malzemeNo=): yenileme ve başka modülden gelen bağlantı aynı parçayı açar.
const adrestekiParca = (deger: string | null): number | null => {
  const n = Number(deger);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function ParcaDosyasi() {
  const [arama, aramaYaz] = useSearchParams();
  const no = adrestekiParca(arama.get('malzemeNo'));
  const rev = arama.get('rev');
  const [secilen, secilenYaz] = useState<SeciliKayit | null>(null);
  // Sekme revizyon değişince (yeni sorgu, yükleniyor) kaybolmasın diye dosyanın dışında tutulur.
  const [sekme, sekmeYaz] = useState<SekmeAnahtari>('ozet');
  const istemci = useQueryClient();
  const bildirim = useBildirim();
  const sorgu = useQuery({
    queryKey: anahtarlar.parca(no ?? 0, rev),
    queryFn: () => api.get<ProsesParcaCevabi>(`/proses/parca?${new URLSearchParams({ malzemeNo: String(no ?? 0), ...(rev === null ? {} : { rev }) }).toString()}`),
    enabled: no !== null,
  });
  const revSec = (kod: string) => { if (no !== null) aramaYaz({ malzemeNo: String(no), rev: kod }); };
  const eskiYap = (p: ProsesNcProgrami) => {
    if (no === null) return;
    void tekrarKorumaliGonder((deneme) => api.post<NcProgramYazmaCevabi>(`/proses/nc-programlari/${String(p.id)}/kaydet`, eskiGovdesi(p), {
      istekKimligi: deneme.istekKimligi, zamanAsimiMs: deneme.zamanAsimiMs, ...(deneme.sinyal ? { sinyal: deneme.sinyal } : {}),
    }))
      .then(async () => { await istemci.invalidateQueries({ queryKey: anahtarlar.parca(no) }); bildirim.bildir('tamam', `${p.ad} eski olarak işaretlendi.`); })
      .catch((e: unknown) => { bildirim.bildir('hata', e instanceof Error ? e.message : 'Program güncellenemedi.'); });
  };
  const m = sorgu.data?.malzeme;
  const parca: SeciliKayit | null = no === null ? null
    : secilen?.id === no ? secilen : m !== undefined ? { id: m.no, kod: m.kod, ad: m.ad ?? '' } : null;
  const sec = (k: SeciliKayit | null) => {
    secilenYaz(k);
    aramaYaz(k === null ? {} : { malzemeNo: String(k.id) });
  };
  const baslik = m === undefined || m.no !== no ? 'Parça dosyası' : m.ad === null ? m.kod : `${m.kod} · ${m.ad}`;
  return (
    <Kart baslik={baslik} simge="file">
      <div className="tc-proses">
        <div className="tc-proses-secim">
          <MalzemeSecici etiket="Parça" deger={parca} sec={(k) => sec(k === null ? null : { id: k.id, kod: k.kod, ad: k.ad })} yerTutucu="Parça seçin" />
        </div>
        {no === null ? <DurumKutusu durum="bos" mesaj="Proses zincirini görmek için parça seçin." />
          : sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
          : sorgu.isError ? <DurumKutusu durum="hata" hata={sorgu.error} yenile={() => { void sorgu.refetch(); }} />
          : <Dosya veri={sorgu.data} sekme={sekme} sekmeYaz={sekmeYaz} revSec={revSec} eskiYap={eskiYap} />}
      </div>
    </Kart>
  );
}
