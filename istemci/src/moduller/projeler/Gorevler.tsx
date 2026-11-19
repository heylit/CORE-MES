import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { GorevlerimCevabi, Proje, ProjeListesiCevabi, ProjeListesiSorgusu, ProjeYonetimiCevabi } from '#paylasilan/sozlesme/projeler.ts';
import { Dugme, DurumKutusu, Secim, type Secenek } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { sorguMetni } from '../../ortak/veri/liste-durumu.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { EMIR_OKUMA_ISLEMLERI } from './ProjeEmirleri.tsx';
import { ProjeGorevleri } from './ProjeGorevleri.tsx';
import { ProjeGorevlerim } from './ProjeGorevlerim.tsx';
import './projeler.css';

const BENIM = 'benim';
const PROJE_OKUMA = ['sayfa.projeler', 'projeler.oku'] as const;
// Seçicide yalnız aktif projeler; sunucunun sayfa boyu üst sınırı kadar.
const AKTIF_PROJELER: ProjeListesiSorgusu = { durum: 'aktif', sirala: 'kod', sayfaBoyu: 200 };

// 3444 a: sistemdeki tek görev sayfası. "Benim görevlerim" kişinin açık proje ve hazırlık görevleridir; proje seçilince o projenin
// bütün görevleri (Liste, Emir × madde, Pano) gelir. Düzen 3: geniş ekranda solda kapsam listesi, dar ekranda aynı liste seçicidir.
// Projeyi okuyamayan kişi listeyi görmez, yalnız kendi görevini görür.
export function Gorevler() {
  const [adres, adresYaz] = useSearchParams();
  const yonlendir = useNavigate();
  const islemler = useOturum().data?.islemler ?? [];
  const projeOkur = PROJE_OKUMA.some((i) => islemler.includes(i));
  const emirleriGorur = EMIR_OKUMA_ISLEMLERI.some((i) => islemler.includes(i));
  const ham = adres.get('proje');
  const istenen = ham !== null && /^[1-9]\d{0,9}$/.test(ham) ? Number(ham) : null;
  const projeId = projeOkur ? istenen : null;

  const liste = useQuery({
    queryKey: anahtarlar.liste(AKTIF_PROJELER),
    queryFn: () => api.get<ProjeListesiCevabi>(`/projeler${sorguMetni(AKTIF_PROJELER)}`),
    enabled: projeOkur,
  });
  const proje = useQuery({ queryKey: anahtarlar.ayrinti(projeId ?? 0), queryFn: () => api.get<Proje>(`/projeler/${String(projeId)}`), enabled: projeId !== null });
  const yonetim = useQuery({
    queryKey: anahtarlar.yonetim(projeId ?? 0),
    queryFn: () => api.get<ProjeYonetimiCevabi>(`/projeler/${String(projeId)}/yonetim`),
    enabled: projeId !== null,
  });
  // Sol listedeki sayı; ProjeGorevlerim ile aynı sorgu, ikinci istek gitmez.
  const benim = useQuery({ queryKey: anahtarlar.gorevlerim, queryFn: () => api.get<GorevlerimCevabi>('/projeler/gorevlerim/liste'), enabled: projeOkur });
  const p = proje.data;

  const projeSecenekleri: Secenek[] = (liste.data?.satirlar ?? []).map((s) => ({ deger: String(s.id), baslik: `${s.kod} · ${s.ad}` }));
  // Projeden açılan kapalı ya da listeye sığmayan proje de seçili görünsün.
  if (p !== undefined && !projeSecenekleri.some((s) => s.deger === String(p.id))) projeSecenekleri.unshift({ deger: String(p.id), baslik: `${p.kod} · ${p.ad}` });
  const secenekler: Secenek[] = [{ deger: BENIM, baslik: 'Benim görevlerim' }, ...projeSecenekleri];
  const sec = (deger: string) => { adresYaz(deger === BENIM ? {} : { proje: deger }); };

  const icerik = projeId === null
    ? <ProjeGorevlerim />
    : proje.isError || yonetim.isError
      ? (
        <DurumKutusu
          durum="hata" mesaj={hataIletisi(proje.error ?? yonetim.error, 'Projenin görevleri alınamadı')}
          yenile={() => { void proje.refetch(); void yonetim.refetch(); }}
        />
      )
      : p === undefined || yonetim.data === undefined
        ? <DurumKutusu durum="yukleniyor" />
        : <ProjeGorevleri projeId={p.id} yonetim={yonetim.data} acik={p.durum === 'aktif'} emirleriGorur={emirleriGorur} />;

  return (
    <div className="tc-prj-icerik">
      {/* Sayfa adı kabuğun başlığındadır; burada yalnız projeden gelene geri dönüş. */}
      {p !== undefined && (
        <div className="tc-prj-bas">
          <Dugme simge="back" onClick={() => { void yonlendir(`/projeler/${String(p.id)}`); }}>{p.kod}</Dugme>
        </div>
      )}
      {projeOkur
        ? (
          <div className="tc-prj-gorev-duzen">
            <nav className="tc-prj-kapsam" aria-label="Gösterilen görevler">
              {secenekler.map((s, i) => {
                const secili = s.deger === (projeId === null ? BENIM : String(projeId));
                return (
                  <Fragment key={s.deger}>
                    {i === 1 && <span className="tc-prj-kapsam-baslik">Projeler</span>}
                    <button type="button" className="tc-prj-kapsam-madde" aria-current={secili ? 'true' : undefined} onClick={() => { sec(s.deger); }}>
                      <span>{s.baslik}</span>
                      {s.deger === BENIM && benim.data !== undefined && <span className="tc-prj-soluk">{benim.data.gorevler.length}</span>}
                    </button>
                  </Fragment>
                );
              })}
            </nav>
            <div className="tc-prj-icerik">
              <div className="tc-prj-gosterilen">
                <Secim etiket="Gösterilen" secenekler={secenekler} value={projeId === null ? BENIM : String(projeId)} onChange={(e) => { sec(e.target.value); }} />
              </div>
              {icerik}
            </div>
          </div>
        )
        : icerik}
    </div>
  );
}
