import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { ProsesHalkaAnahtari, ProsesHalkaDurumu, ProsesHalkasi, ProsesOperasyonu, ProsesParcaCevabi } from '#paylasilan/sozlesme/proses.ts';
import { DurumKutusu, Kart, MalzemeSecici, Rozet, Simge, Tablo, type RozetTonu, type SeciliKayit, type Sutun } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
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
const dk = (x: string | null): string => (x === null ? '—' : `${Number(x).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} dk`);

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

function Dosya({ veri }: { veri: ProsesParcaCevabi }) {
  const eksik = veri.halkalar.filter((h) => h.durum === 'eksik' || h.durum === 'yok').length;
  return (
    <>
      <div className="tc-proses-kunye">
        <span>Parça rev {veri.parcaRevizyonu ?? '—'}</span>
        <span>Rota {veri.rota === null ? '—' : `rev ${veri.rota.revizyon}`}</span>
        {eksik > 0 ? <Rozet ton="uyari">{eksik} halka eksik</Rozet> : <Rozet ton="tamam">Eksik halka yok</Rozet>}
      </div>
      <ol className="tc-proses-zincir" aria-label="Proses zinciri">
        {veri.halkalar.map((h) => <Halka key={h.anahtar} h={h} />)}
      </ol>
      <p className="tc-proses-not">
        Durumu her halkanın sahibi modül verir; düzenleme sahibinin sayfasında yapılır. "Kaynak yok" halkanın parça düzeyinde okunacağı
        yer henüz yoktur.
      </p>
      <Tablo etiket="Operasyonlar" sutunlar={SUTUNLAR} satirlar={veri.operasyonlar} satirAnahtari={(o) => o.opNo}
        bosMesaj="Yürürlükte rota yok." />
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
  const [secilen, secilenYaz] = useState<SeciliKayit | null>(null);
  const sorgu = useQuery({
    queryKey: anahtarlar.parca(no ?? 0),
    queryFn: () => api.get<ProsesParcaCevabi>(`/proses/parca?malzemeNo=${String(no ?? 0)}`),
    enabled: no !== null,
  });
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
          : <Dosya veri={sorgu.data} />}
      </div>
    </Kart>
  );
}
