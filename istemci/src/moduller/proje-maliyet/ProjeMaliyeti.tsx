import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { EksikVeri, KalemSatiri, ProjeMaliyetCevabi, SapanIsEmri } from '#paylasilan/sozlesme/proje-maliyet.ts';
import { DurumKutusu, IkiSeriKarti, Kart, Rozet, SayiKarti, Simge, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KALEM_ADI, MaliyetTabani, tl } from './MaliyetTabani.tsx';
import { MasrafBelgeleri } from './MasrafBelgeleri.tsx';
import { useOturum } from '../../ortak/veri/oturum.ts';
import './proje-maliyet.css';

// Sekmeyi açan uç bu işlemi ister; Projeler sekmeyi yalnız buna sahip olana gösterir.
export const MALIYET_OKUMA_ISLEMI = 'finans.maliyet-oku';


const EKSIK_METNI: Record<EksikVeri, string> = {
  siparis_yok: 'Proje bir siparişe bağlı değil; termin, vade ve gecikme cezası bilinmez.',
  kur_yok: 'Siparişin para birimi için kur girilmemiş; gelir hesaplanmaz.',
  is_emirleri_bagli_degil: 'Üretim emirlerinin süreleri henüz bağlanmadı; işleme, ayar ve işçilik maliyeti boş.',
  fason_bagli_degil: 'Fason alım tutarları henüz bağlanmadı.',
  birim_maliyet_eksik: 'Bazı istasyon, kişi ya da malzemelerin birim maliyeti girilmemiş.',
  genel_gider_orani_yok: 'Finansta genel gider oranı girilmemiş; genel gider hesaplanmaz.',
  talas_dusulmedi: 'Bazı emirlerde talaş fiyatı, kütük ya da parça ağırlığı eksik; talaş değeri düşülmedi.',
  faiz_yok: 'Finansta TL faizi girilmemiş; bekleme finansmanı hesaplanmaz.',
  vade_yok: 'Siparişte ödeme vadesi girilmemiş; bekleme finansmanı üretim bitişine kadar hesaplandı.',
  amortisman_dahil_degil: 'Finanstaki genel gider oranı amortismanı içermiyor; makine amortismanı henüz hesaba girmez.',
  satirsiz_emir: 'Bazı üretim emirleri sipariş satırına bağlı değil; bu emirlerin geliri hesaba girmez.',
};

const yuzde = (x: number | null): string => (x === null ? '—' : `%${(x * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}`);
const isaretliYuzde = (x: number | null): string => (x === null ? '—' : `${x > 0 ? '+' : ''}${yuzde(x)}`);
const gunAy = (tarih: string): string => `${tarih.slice(8, 10)}.${tarih.slice(5, 7)}`;
const bolum = (pay: number | null, payda: number | null): number | null => (pay === null || payda === null || !(payda > 0) ? null : pay / payda);

const KALEM_SUTUNLARI: Sutun<KalemSatiri>[] = [
  { anahtar: 'kalem', baslik: 'Kalem', hucre: (k) => KALEM_ADI[k.kalem] },
  { anahtar: 'plan', baslik: 'Plan', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => tl(k.plan) },
  { anahtar: 'gerceklesen', baslik: 'Gerçekleşen', hizala: 'sag', mono: true, kirilmaz: true, hucre: (k) => tl(k.gerceklesen) },
  {
    anahtar: 'sapma', baslik: 'Sapma', hizala: 'sag', mono: true,
    hucre: (k) => (k.sapmaOrani !== null && k.sapmaOrani > 0 ? <Rozet ton="uyari">{isaretliYuzde(k.sapmaOrani)}</Rozet> : isaretliYuzde(k.sapmaOrani)),
  },
];

const IS_EMRI_SUTUNLARI: Sutun<SapanIsEmri>[] = [
  { anahtar: 'emir', baslik: 'İş emri', mono: true, kirilmaz: true, hucre: (s) => `${s.emirNo} · ${s.opNo}` },
  { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (s) => s.istasyonAd ?? '—' },
  { anahtar: 'plan', baslik: 'Plan', hizala: 'sag', mono: true, kirilmaz: true, hucre: (s) => tl(s.plan) },
  { anahtar: 'gerceklesen', baslik: 'Gerçekleşen', hizala: 'sag', mono: true, kirilmaz: true, hucre: (s) => tl(s.gerceklesen) },
  { anahtar: 'sapma', baslik: 'Sapma', hizala: 'sag', mono: true, kirilmaz: true, hucre: (s) => <Rozet ton="uyari">+{tl(s.sapma)}</Rozet> },
  { anahtar: 'neden', baslik: 'Neden', hucre: (s) => KALEM_ADI[s.neden] },
];

function KarRiskiSeridi({ m }: { m: ProjeMaliyetCevabi }) {
  const { gecikmeGunu, gunlukOran, tutar, ceza } = m.karRiski;
  const oranMetni = `%${gunlukOran.toLocaleString('tr-TR')}/gün`;
  return (
    <Kart baslik="Gecikme kâr riski">
      <div className="tc-pm-risk">
        <span className="tc-pm-risk-deger">
          <span className="tc-pm-risk-etiket">Tahmini gecikme</span>
          <span className="mono">{gecikmeGunu === null ? '—' : `${gecikmeGunu} gün`}</span>
        </span>
        {m.fiyatGorunur && (
          <>
            <span className="tc-pm-risk-deger">
              <span className="tc-pm-risk-etiket">Kâr riski (katkı × {oranMetni} × gün)</span>
              <span className="mono">{tutar !== null && tutar > 0 ? <Rozet ton="hata">{tl(tutar)}</Rozet> : tl(tutar)}</span>
            </span>
            {ceza !== null && (
              <span className="tc-pm-risk-deger">
                <span className="tc-pm-risk-etiket">Sözleşme cezası</span>
                <span className="mono">{tl(ceza)}</span>
              </span>
            )}
          </>
        )}
        <Link className="tc-pm-risk-git" to="/plan"><Simge ad="gantt" /> Plana git</Link>
      </div>
    </Kart>
  );
}

// 940 c: taban alma ve masraf bağı proje yazma işlemiyle.
const YAZMA_ISLEMI = 'projeler.yaz';

export function ProjeMaliyeti({ projeId }: { projeId: number }) {
  const yazabilir = useOturum().data?.islemler.includes(YAZMA_ISLEMI) === true;
  const sorgu = useQuery({
    queryKey: anahtarlar.maliyet(projeId),
    // 236 a: ekran yalnız okur; bitmiş iş emirlerini deftere sunucu işi yazar.
    queryFn: () => api.get<ProjeMaliyetCevabi>(`/proje-maliyet/${projeId}`),
  });
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Maliyet alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  const m = sorgu.data;
  if (!m) return <DurumKutusu durum="yukleniyor" />;

  const planaOran = bolum(m.gerceklesen, m.hedef);
  const kalemNoktalari = m.kalemler.flatMap((k) => (k.plan === null || k.gerceklesen === null || (k.plan === 0 && k.gerceklesen === 0)
    ? [] : [{ etiket: KALEM_ADI[k.kalem], birinci: k.plan, ikinci: k.gerceklesen }]));
  const uyarilar = [
    ...m.eksikler.map((e) => EKSIK_METNI[e]),
    ...(m.eksikKalemler.length > 0 ? [`Toplamlara girmeyen kalemler (bilinmeyen tutar var): ${m.eksikKalemler.map((k) => KALEM_ADI[k]).join(', ')}.`] : []),
  ];

  return (
    <div className="tc-pm">
      {uyarilar.length > 0 && (
        <ul className="tc-pm-uyarilar" aria-label="Eksik veri">
          {uyarilar.map((u) => <li key={u} className="tc-pm-uyari"><Simge ad="alert" boyut="k" />{u}</li>)}
        </ul>
      )}
      <div className="tc-pm-kartlar">
        {m.fiyatGorunur && (
          <SayiKarti baslik="Sipariş tutarı" simge="lira" metin={tl(m.gelir)}
            altMetin={m.siparis === null ? 'Siparişe bağlı değil' : `${m.siparis.no} · termin ${gunAy(m.siparis.termin)}`} />
        )}
        {m.fiyatGorunur && m.siparis !== null && m.siparis.paraBirimi !== 'TRY' && (
          <SayiKarti baslik="Kur farkı" simge="rotate" metin={m.kurFarki === null ? '—' : `${m.kurFarki > 0 ? '+' : ''}${tl(m.kurFarki)}`}
            altMetin="Faturalanan kısım bugünün kuruyla; tutara ve katkıya eklenmez" />
        )}
        <SayiKarti baslik="Gerçekleşen maliyet" simge="chart" metin={tl(m.gerceklesen)}
          altMetin={planaOran === null ? `Hedef ${tl(m.hedef)}` : `Hedefin ${yuzde(planaOran)}'i · ${m.butce === null ? 'plan' : 'bütçe'} ${tl(m.hedef)}`} />
        {m.fiyatGorunur && (
          <SayiKarti baslik="Tahmini katkı payı" simge="target" metin={tl(m.katkiPayi)}
            altMetin={`${yuzde(m.katkiOrani)} · planlanan ${yuzde(m.planlananKatkiOrani)}`}
            ton={m.katkiPayi !== null && m.katkiPayi < 0 ? 'hata' : 'bilgi'} />
        )}
        {m.fiyatGorunur && (
          <SayiKarti baslik="Bugüne kadarki sapma" simge="gauge" metin={m.sapma === null ? '—' : `${m.sapma > 0 ? '+' : ''}${tl(m.sapma)}`}
            altMetin={`Bugüne kadarki plan ${tl(m.bugunePlan)}`} ton={m.sapma !== null && m.sapma > 0 ? 'uyari' : 'bilgi'} />
        )}
      </div>
      <MaliyetTabani projeId={projeId} ozet={m.ozet} kalemler={m.kalemler} yazabilir={yazabilir} />
      <KarRiskiSeridi m={m} />
      <div className="tc-pm-grafikler">
        <IkiSeriKarti baslik="Birikimli maliyet (haftalık)" simge="chart" seriAdlari={['Plan', 'Gerçekleşen']} birim="TL"
          noktalar={m.haftalar.map((h) => ({ etiket: gunAy(h.hafta), birinci: h.planBirikimli, ikinci: h.gerceklesenBirikimli }))}
          altMetin={`Bugün ${gunAy(m.bugun)}`} />
        <IkiSeriKarti baslik="Kalem kırılımı" simge="layers" seriAdlari={['Plan', 'Gerçekleşen']} birim="TL" noktalar={kalemNoktalari} />
      </div>
      <Kart baslik="Kalemler">
        <Tablo etiket="Maliyet kalemleri" sutunlar={KALEM_SUTUNLARI} satirlar={m.kalemler} satirAnahtari={(k) => k.kalem} />
      </Kart>
      <MasrafBelgeleri projeId={projeId} ozet={m.ozet} yazabilir={yazabilir} />
      {m.fiyatGorunur && (
        <Kart baslik="En çok sapan iş emirleri">
          <Tablo etiket="En çok sapan iş emirleri" sutunlar={IS_EMRI_SUTUNLARI} satirlar={m.sapanIsEmirleri} satirAnahtari={(s) => s.isEmriId}
            bosMesaj="Planın üstüne çıkan iş emri yok" />
        </Kart>
      )}
    </div>
  );
}
