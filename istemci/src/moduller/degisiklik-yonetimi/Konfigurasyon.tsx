import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EMIR_DURUM_ADLARI, SINIF_ADLARI, TALEP_DURUM_ADLARI } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type {
  AcikDegisiklik, BaselineSatiri, KonfigurasyonCevabi, SonUrunlerCevabi,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { DurumKutusu, Dugme, Kart, Rozet, SayfaBasligi, Tablo, type Sutun } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { analizAnahtarlari } from './analiz-anahtarlari.ts';
import { malzemeEtiketi, type AileDugumu } from './analiz.ts';
import { AileIpligiGrafigi } from './DijitalIplik.tsx';
import { SeriSeridi } from './SeriSeridi.tsx';
import './analiz.css';

export const KOK = '/degisiklik-yonetimi';
export const konfigurasyonYolu = (malzemeId: number): string => `${KOK}/konfigurasyon/${malzemeId}`;
export const izlenebilirlikYolu = (malzemeId: number, seriNo?: string): string =>
  `${KOK}/izlenebilirlik?urun=${malzemeId}${seriNo ? `&seri=${encodeURIComponent(seriNo)}` : ''}`;
// Malzeme kartının kimlikle açılan sayfası yok; o düğümde "Kaydı aç" çizilmez.
function hedefYolu(urunId: number, h: NonNullable<AileDugumu['hedef']>): string | null {
  if (h.tur === 'uretim-emri') return `/uretim-emirleri/${h.id}`;
  if (h.tur === 'seri') return izlenebilirlikYolu(urunId, h.seriNo);
  return null;
}
const degisiklikYolu = (d: AcikDegisiklik): string => `${KOK}/${d.tur === 'talep' ? 'talepler' : 'emirler'}/${d.id}`;

// Adresteki kimlik tam sayı değilse sorgu atılmaz; sunucu da aynı biçimi ister.
export function kimlikOku(deger: string | null | undefined): number | null {
  if (!deger || !/^[1-9]\d{0,9}$/.test(deger)) return null;
  const n = Number(deger);
  return n <= 2147483647 ? n : null;
}

export type SonUrun = SonUrunlerCevabi['sonUrunler'][number];

export function useSonUrunler() {
  return useQuery({ queryKey: analizAnahtarlari.sonUrunler(), queryFn: () => api.get<SonUrunlerCevabi>(`${KOK}/son-urunler`) });
}

export function useKonfigurasyon(malzemeId: number | null) {
  return useQuery({
    queryKey: analizAnahtarlari.konfigurasyon(malzemeId ?? 0),
    queryFn: () => api.get<KonfigurasyonCevabi>(`${KOK}/konfigurasyon/${malzemeId}`),
    enabled: malzemeId !== null,
  });
}

// Adreste ürün yoksa listenin ilki açılır (prototipteki gibi bir ürün her zaman seçili).
export function seciliUrun(adresteki: number | null, liste: readonly SonUrun[] | undefined): number | null {
  return adresteki ?? liste?.[0]?.malzemeId ?? null;
}

export function SonUrunSecici({ liste, secili, sec }: { liste: readonly SonUrun[]; secili: number | null; sec: (malzemeId: number) => void }) {
  return (
    <div className="tc-dy-urunler" role="group" aria-label="Son ürün">
      {liste.map((u) => (
        <Dugme key={u.malzemeId} tur={u.malzemeId === secili ? 'birincil' : 'ikincil'} aria-pressed={u.malzemeId === secili} onClick={() => sec(u.malzemeId)}>
          {u.kod ?? malzemeEtiketi(u)}
        </Dugme>
      ))}
    </div>
  );
}

export function SonUrunDurumu({ sorgu }: { sorgu: ReturnType<typeof useSonUrunler> }) {
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Son ürünler alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  return <DurumKutusu durum="bos" mesaj="Henüz değişiklik kaydı olan son ürün yok." />;
}

const tire = (m: string | null): string => m ?? '—';

const BASELINE_SUTUNLARI: readonly Sutun<BaselineSatiri>[] = [
  { anahtar: 'oge', baslik: 'Konfigürasyon öğesi', hucre: (b) => malzemeEtiketi(b.malzeme) },
  { anahtar: 'rev', baslik: 'Rev', mono: true, kirilmaz: true, hucre: (b) => tire(b.cizimRevizyonu) },
  { anahtar: 'rota', baslik: 'Rota', mono: true, kirilmaz: true, hucre: (b) => tire(b.rotaRevizyonu) },
  {
    anahtar: 'nc', baslik: 'NC programları',
    hucre: (b) => (b.ncProgramlari === null || b.ncProgramlari.length === 0 ? '—'
      : <span className="tc-dy-satir">{b.ncProgramlari.map((n) => <Rozet key={n} ton="pasif" gorunum="cizgi">{n}</Rozet>)}</span>),
    csv: (b) => (b.ncProgramlari ?? []).join(', '),
  },
  {
    anahtar: 'otorite', baslik: 'Tasarım otoritesi',
    hucre: (b) => (b.tasarimOtoritesi === null ? '—' : b.tasarimOtoritesi === 'musteri' ? <Rozet>Müşteri</Rozet> : 'TMI'),
    csv: (b) => (b.tasarimOtoritesi === null ? null : b.tasarimOtoritesi === 'musteri' ? 'Müşteri' : 'TMI'),
  },
  {
    anahtar: 'durum', baslik: 'Durum',
    hucre: (b) => (b.durum === null ? '—' : b.durum === 'aktif' ? <Rozet ton="tamam">Aktif</Rozet> : <Rozet ton="pasif">Yalnız yedek</Rozet>),
    csv: (b) => (b.durum === null ? null : b.durum === 'aktif' ? 'Aktif' : 'Yalnız yedek'),
  },
];

function AcikDegisiklikler({ liste }: { liste: readonly AcikDegisiklik[] }) {
  if (liste.length === 0) return <p className="tc-dy-bos">Bu ürün ailesinde açık değişiklik yok.</p>;
  return (
    <ul className="tc-dy-degisiklikler">
      {liste.map((d) => (
        <li key={`${d.tur}-${d.id}`}>
          <Link to={degisiklikYolu(d)} className="tc-dy-degisiklik">
            <span className="tc-dy-degisiklik-no">
              <span className="mono">{d.no}</span>
              {d.sinif !== null && <span className="tc-dy-soluk">{SINIF_ADLARI[d.sinif]}</span>}
            </span>
            <span>{d.baslik}</span>
            <Rozet>{d.tur === 'talep' ? TALEP_DURUM_ADLARI[d.durum] : EMIR_DURUM_ADLARI[d.durum]}</Rozet>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Class I değişikliği yayınlanana kadar şeritte sınır çizilmez; açık olduğu şeridin üstünde söylenir.
function YayinBekleyen({ liste }: { liste: readonly AcikDegisiklik[] }) {
  const d1 = liste.filter((d) => d.sinif === 'D1' && (d.tur === 'talep' || ['acik', 'revizyon_hazirlaniyor', 'yayina_hazir'].includes(d.durum)));
  if (d1.length === 0) return null;
  return (
    <p className="tc-dy-not" data-ton="uyari">
      <strong>Açık değişiklik:</strong>{' '}
      {d1.map((d, i) => <span key={`${d.tur}-${d.id}`}>{i > 0 && '; '}<Link to={degisiklikYolu(d)} className="mono">{d.no}</Link> {d.baslik}</span>)}.
      {' '}Yayınlandığında geçerlilik sınırı şeritte görünür.
    </p>
  );
}

export function Konfigurasyon() {
  const adresteki = kimlikOku(useParams().malzemeId);
  const git = useNavigate();
  const urunler = useSonUrunler();
  const malzemeId = seciliUrun(adresteki, urunler.data?.sonUrunler);
  const sorgu = useKonfigurasyon(malzemeId);
  const veri = sorgu.data;
  const alt = veri
    ? `${malzemeEtiketi(veri.sonUrun)}: tasarlanan, planlanan ve üretilen konfigürasyon tek ekranda.`
    : 'Tasarlanan, planlanan ve üretilen konfigürasyon tek ekranda.';
  return (
    <div className="tc-dy">
      <SayfaBasligi baslik="Konfigürasyon" simge="layers" alt={alt} />
      {urunler.data && urunler.data.sonUrunler.length > 0 && (
        <SonUrunSecici liste={urunler.data.sonUrunler} secili={malzemeId} sec={(id) => { void git(konfigurasyonYolu(id)); }} />
      )}
      {malzemeId === null ? <SonUrunDurumu sorgu={urunler} />
        : sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
          : sorgu.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Konfigürasyon alınamadı')} yenile={() => { void sorgu.refetch(); }} />
            : (
              <>
                {sorgu.data.seriler === null
                  ? <p className="tc-dy-not">{malzemeEtiketi(sorgu.data.sonUrun)} seri numarasıyla izlenmiyor; konfigürasyon emir ve lot bazında izlenir.</p>
                  : (
                    <Kart baslik="Seri konfigürasyon şeridi" simge="grid" baslikEki={<span className="tc-dy-soluk">Hangi seri hangi revizyonla yapıldı, hangisi sahada, hangisi yolda.</span>}>
                      <YayinBekleyen liste={sorgu.data.acikDegisiklikler} />
                      <SeriSeridi
                        seriler={sorgu.data.seriler} gecerlilikler={sorgu.data.gecerlilikler}
                        sec={(s) => { void git(izlenebilirlikYolu(sorgu.data.sonUrun.malzemeId, s.seriNo)); }}
                      />
                    </Kart>
                  )}
                <Kart baslik="Dijital iplik" simge="route" baslikEki={<span className="tc-dy-soluk">As-designed, as-planned, emir ve as-built zinciri</span>}>
                  {sorgu.data.aileIpligi === null
                    ? <p className="tc-dy-bos">Ürün ailesinin ipliği bağlı değil (rota, üretim emri ya da seri kaydı).</p>
                    : <AileIpligiGrafigi iplik={sorgu.data.aileIpligi} baglanti={(h) => hedefYolu(sorgu.data.sonUrun.malzemeId, h)} />}
                </Kart>
                <div className="tc-dy-iki-bir">
                  <Kart baslik="Yürürlükteki baseline" simge="list">
                    {sorgu.data.baseline === null
                      ? <p className="tc-dy-bos">Konfigürasyon öğeleri (revizyon, rota, NC programları) bağlı değil.</p>
                      : (
                        <Tablo
                          etiket="Yürürlükteki baseline" sutunlar={BASELINE_SUTUNLARI} satirlar={sorgu.data.baseline}
                          satirAnahtari={(b) => b.malzeme.malzemeId} bosMesaj="Yayımlı konfigürasyon öğesi yok."
                        />
                      )}
                  </Kart>
                  <Kart baslik="Açık değişiklikler" simge="edit">
                    <AcikDegisiklikler liste={sorgu.data.acikDegisiklikler} />
                  </Kart>
                </div>
              </>
            )}
    </div>
  );
}
