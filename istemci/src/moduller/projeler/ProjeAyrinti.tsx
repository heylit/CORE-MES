import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Proje, ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Sekmeler, type Sekme } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { ProjePlani } from '../plan/disari.ts';
import { ProjeMaliyeti } from '../proje-maliyet/disari.ts';
import { anahtarlar } from './anahtarlar.ts';
import { DURUM_METNI, DURUM_TONU, MALIYET_ISLEMI, STATU_ISLEMI, butceMetni, tarihMetni } from './gosterim.ts';
import { KilometreTaslari } from './KilometreTaslari.tsx';
import { useIslemVar } from './komut.ts';
import { ProjeGorevleri } from './ProjeGorevleri.tsx';
import { ProjeOzeti } from './ProjeOzeti.tsx';
import { StatuGecmisi } from './StatuGecmisi.tsx';
import { StatuCipi, StatuPenceresi } from './StatuPenceresi.tsx';
import { EMIR_OKUMA_ISLEMLERI, ProjeEmirleri } from './ProjeEmirleri.tsx';
import { ProjeFormu } from './ProjeFormu.tsx';
import './projeler.css';

type SekmeAdi = 'ozet' | 'gorevler' | 'taslar' | 'plan' | 'emirler' | 'maliyet' | 'gecmis' | 'genel';

const YONETIM_SEKMELERI: ReadonlySet<SekmeAdi> = new Set(['ozet', 'gorevler', 'taslar', 'gecmis']);

export function ProjeAyrinti() {
  const { id: ham } = useParams();
  const id = Number(ham);
  const gecerli = Number.isSafeInteger(id) && id > 0;
  const yonlendir = useNavigate();
  const oturum = useOturum();
  const yazabilir = oturum.data?.islemler.includes('projeler.yaz') === true;
  const maliyetGorur = oturum.data?.islemler.includes(MALIYET_ISLEMI) === true;
  const emirleriGorur = EMIR_OKUMA_ISLEMLERI.some((i) => oturum.data?.islemler.includes(i) === true);
  const statuYazabilir = useIslemVar(STATU_ISLEMI);
  const sekmeler: Sekme<SekmeAdi>[] = [
    { anahtar: 'ozet', baslik: 'Özet', simge: 'chart' },
    { anahtar: 'gorevler', baslik: 'Görevler', simge: 'check' },
    { anahtar: 'taslar', baslik: 'Kilometre taşları', simge: 'flag' },
    { anahtar: 'plan', baslik: 'Plan', simge: 'clock' },
    ...(emirleriGorur ? [{ anahtar: 'emirler', baslik: 'Üretim emirleri', simge: 'list' } as const] : []),
    ...(maliyetGorur ? [{ anahtar: 'maliyet', baslik: 'Maliyet', simge: 'lira' } as const] : []),
    { anahtar: 'gecmis', baslik: 'Statü geçmişi', simge: 'clock' },
    { anahtar: 'genel', baslik: 'Genel', simge: 'book' },
  ];
  const [secili, sec] = useState<SekmeAdi>('ozet');
  const sekme = sekmeler.some((s) => s.anahtar === secili) ? secili : 'ozet';
  const [duzenle, duzenleYaz] = useState(false);
  const [statuAcik, statuAcikYaz] = useState(false);
  const sorgu = useQuery({ queryKey: anahtarlar.ayrinti(id), queryFn: () => api.get<Proje>(`/projeler/${id}`), enabled: gecerli });
  const yonetim = useQuery({
    queryKey: anahtarlar.yonetim(id),
    queryFn: () => api.get<ProjeYonetimiCevabi>(`/projeler/${id}/yonetim`),
    enabled: gecerli,
  });
  const p = sorgu.data;
  const y = yonetim.data;

  if (!gecerli) return <DurumKutusu durum="hata" mesaj="Proje bulunamadı" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Proje alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  if (!p) return <DurumKutusu durum="yukleniyor" />;

  return (
    <div className="tc-prj-icerik">
      <header className="tc-prj-bas">
        <Dugme simge="back" onClick={() => { void yonlendir('/projeler'); }}>Projeler</Dugme>
        <h1 className="tc-prj-baslik">{p.kod} · {p.ad}</h1>
        <Rozet ton={DURUM_TONU[p.durum]}>{DURUM_METNI[p.durum]}</Rozet>
        <StatuCipi statu={y?.statu ?? p.statu} {...(statuYazabilir && y ? { tikla: () => { statuAcikYaz(true); } } : {})} />
        {yazabilir && <div className="tc-prj-bas-sag"><Dugme simge="edit" onClick={() => { duzenleYaz(true); }}>Düzenle</Dugme></div>}
      </header>
      <Sekmeler etiket="Proje bölümleri" sekmeler={sekmeler} secili={sekme} sec={sec} />
      {YONETIM_SEKMELERI.has(sekme) && (yonetim.isError
        ? <DurumKutusu durum="hata" mesaj={hataIletisi(yonetim.error, 'Proje yönetimi alınamadı')} yenile={() => { void yonetim.refetch(); }} />
        : !y && <DurumKutusu durum="yukleniyor" />)}
      {y && sekme === 'ozet' && <ProjeOzeti yonetim={y} />}
      {y && sekme === 'gorevler' && <ProjeGorevleri projeId={p.id} yonetim={y} acik={p.durum === 'aktif'} />}
      {y && sekme === 'taslar' && <KilometreTaslari projeId={p.id} yonetim={y} acik={p.durum === 'aktif'} />}
      {y && sekme === 'gecmis' && <StatuGecmisi gecmis={y.statuGecmisi} />}
      {sekme === 'genel' && <Kart baslik="Proje bilgisi">
        <dl className="tc-prj-bilgi">
          <dt>Proje no</dt><dd>{p.kod}</dd>
          <dt>Müşteri</dt><dd>{p.firmaAd ?? '—'}</dd>
          <dt>Başlangıç</dt><dd>{tarihMetni(p.baslangic)}</dd>
          <dt>Bitiş</dt><dd>{tarihMetni(p.bitis)}</dd>
          {maliyetGorur && <><dt>Bütçe</dt><dd>{butceMetni(p.butceTutari, p.butceParaBirimi)}</dd></>}
          <dt>Açıklama</dt><dd>{p.aciklama ?? '—'}</dd>
        </dl>
      </Kart>}
      {sekme === 'plan' && <ProjePlani projeId={p.id} />}
      {sekme === 'emirler' && <ProjeEmirleri projeId={p.id} />}
      {sekme === 'maliyet' && <ProjeMaliyeti projeId={p.id} />}
      {duzenle && <ProjeFormu proje={p} kapat={() => { duzenleYaz(false); }} />}
      {statuAcik && y && <StatuPenceresi projeId={p.id} yonetim={y} kapat={() => { statuAcikYaz(false); }} />}
    </div>
  );
}
