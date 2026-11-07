import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { AyarDenetimiCevabi, AyarDenetimiDurumu, KorumaCevabi, KurallarCevabi, SunucuDurumuCevabi } from '#paylasilan/sozlesme/guvenlik.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Tablo, type RozetTonu, type Sutun } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BOS, KORUMA_ADI, degerMetni, KORUMA_TONU, ONEM_ADI, ONEM_TONU, zamanMetni } from './gorunum.ts';

// Panoya bakan elle yenilemek zorunda kalmasın; tarama dakikada bir koşar.
const YENILEME_MS = 30_000;

// Günlük, olay günlüğü, yedek, disk ve sertifika; altında günlük dosyasındaki son sunucu hataları. Okunamazsa yalnız bu kart hata gösterir.
// Ana sayfa (Sistem ve Güvenlik) yalnız özet ve karar gösterir; sunucu durumunun ayrıntısı burada kalır (2231).
function SunucuDurumuKarti() {
  const sorgu = useQuery({
    queryKey: anahtarlar.sunucuDurumu,
    queryFn: () => api.get<SunucuDurumuCevabi>('/guvenlik/sunucu-durumu'),
    refetchInterval: YENILEME_MS,
  });
  return (
    <Kart baslik="Sunucu durumu">
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <div className="tc-guvenlik-ayrinti">
              <ul className="tc-guvenlik-olaylar">
                {sorgu.data.maddeler.map((m) => (
                  <li key={m.anahtar}>
                    <Rozet ton={KORUMA_TONU[m.durum]}>{KORUMA_ADI[m.durum]}</Rozet>
                    <span className="tc-guvenlik-olay-metin">
                      <b>{m.baslik}</b> · {m.aciklama}
                      {m.deger !== null && <> · <span className="mono">{degerMetni(m.deger)}</span></>}
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <h3>Son sunucu hataları</h3>
                {sorgu.data.sonHatalar.length === 0 ? <DurumKutusu durum="bos" mesaj="Son iki günün günlüğünde sunucu hatası yok" /> : (
                  <ul className="tc-guvenlik-olaylar">
                    {sorgu.data.sonHatalar.map((h, sira) => (
                      <li key={`${h.zaman}-${String(sira)}`}>
                        <time className="mono" dateTime={h.zaman}>{zamanMetni(h.zaman)}</time>
                        <span className="tc-guvenlik-olay-metin"><b>{h.ileti}</b>{h.hata !== null && <> · {h.hata}</>}</span>
                        {h.kod !== null && <span className="mono">Hata kodu: {h.kod}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
    </Kart>
  );
}

const AYAR_ADI = { uygun: 'Uygun', uyari: 'Uyarı', hata: 'Hata', bilgi: 'Bilgi', bilinmiyor: 'Bilinmiyor' } as const satisfies Record<AyarDenetimiDurumu, string>;
const AYAR_TONU = { uygun: 'tamam', uyari: 'uyari', hata: 'hata', bilgi: 'bilgi', bilinmiyor: 'pasif' } as const satisfies Record<AyarDenetimiDurumu, RozetTonu>;

// Başlık rozeti bakılması gereken madde sayısıdır; bilgi ve bilinmiyor sayılmaz.
export function ayarOzeti(maddeler: AyarDenetimiCevabi['maddeler']): { ton: RozetTonu; metin: string } {
  const hata = maddeler.filter((m) => m.durum === 'hata').length;
  const uyari = maddeler.filter((m) => m.durum === 'uyari').length;
  if (hata > 0) return { ton: 'hata', metin: uyari > 0 ? `${String(hata)} hata, ${String(uyari)} uyarı` : `${String(hata)} hata` };
  if (uyari > 0) return { ton: 'uyari', metin: `${String(uyari)} uyarı` };
  return { ton: 'tamam', metin: 'Uygun' };
}

// Yedek, bağlantı, ortam ve sürüm ayarlarının uygunluğu (2164); yalnız okur, ayrıntı Ayarlar ve Sağlık ekranlarındadır.
function AyarDenetimiKarti() {
  const sorgu = useQuery({
    queryKey: anahtarlar.ayarDenetimi,
    queryFn: () => api.get<AyarDenetimiCevabi>('/guvenlik/ayar-denetimi'),
    refetchInterval: YENILEME_MS,
  });
  const ozet = sorgu.data === undefined ? null : ayarOzeti(sorgu.data.maddeler);
  return (
    <Kart baslik="Ayar denetimi" baslikEki={ozet === null ? undefined : <Rozet ton={ozet.ton}>{ozet.metin}</Rozet>}>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <div className="tc-guvenlik-ayrinti">
              <p className="tc-guvenlik-not">Son denetim <time dateTime={sorgu.data.zaman}>{zamanMetni(sorgu.data.zaman)}</time></p>
              <ul className="tc-guvenlik-olaylar">
                {sorgu.data.maddeler.map((m) => (
                  <li key={m.anahtar}>
                    <span className="tc-guvenlik-olay-metin"><b>{m.baslik}</b> · {m.aciklama}</span>
                    <Rozet ton={AYAR_TONU[m.durum]}>{AYAR_ADI[m.durum]}</Rozet>
                  </li>
                ))}
              </ul>
            </div>
          )}
    </Kart>
  );
}
import './guvenlik.css';

export function GuvenlikKoruma() {
  const sorgu = useQuery({ queryKey: anahtarlar.koruma, queryFn: () => api.get<KorumaCevabi>('/guvenlik/koruma') });
  return (
    <div className="tc-guvenlik">
      <p className="tc-guvenlik-not">Bu sistemin okuyamadığı madde "Bilinmiyor" görünür; açık ya da kapalı sayılmaz.</p>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />
          : (
            <div className="tc-guvenlik-koruma">
              {sorgu.data.maddeler.map((m) => (
                <Kart key={m.anahtar} baslik={m.baslik} sag={<Rozet ton={KORUMA_TONU[m.durum]}>{KORUMA_ADI[m.durum]}</Rozet>}>
                  <p>{m.aciklama}</p>
                  {m.deger !== null && <div className="tc-guvenlik-deger">{degerMetni(m.deger)}</div>}
                </Kart>
              ))}
            </div>
          )}
      <SunucuDurumuKarti />
      <AyarDenetimiKarti />
    </div>
  );
}

type Kural = KurallarCevabi['kurallar'][number];
const KURAL_SUTUNLARI: readonly Sutun<Kural>[] = [
  { anahtar: 'baslik', baslik: 'Alarm', hucre: (k) => k.baslik },
  { anahtar: 'kosul', baslik: 'Ne zaman açılır', hucre: (k) => k.kosul },
  { anahtar: 'onem', baslik: 'Önem', hucre: (k) => <Rozet ton={ONEM_TONU[k.onem]}>{ONEM_ADI[k.onem]}</Rozet> },
];

export function GuvenlikKurallar() {
  const sorgu = useQuery({ queryKey: anahtarlar.kurallar, queryFn: () => api.get<KurallarCevabi>('/guvenlik/kurallar'), staleTime: Infinity });
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" yenile={() => { void sorgu.refetch(); }} />;
  const k = sorgu.data;
  return (
    <div className="tc-guvenlik">
      <p className="tc-guvenlik-not">
        Tarama her {k.taramaAraligiSn} saniyede bir koşar; {k.durmaEsigiDk} dakikadan uzun koşmazsa durum sayfası uyarır.
        Kapanan alarm {k.saklamaGun} gün, reddedilen istek {k.redSaklamaGun} gün saklanır. Kritik alarm yöneticilere bildirim olarak düşer ve Windows olay günlüğüne yazılır; dışarı ileti gitmez.
      </p>
      {k.vpnAraliklari.length > 0 && (
        <Kart baslik="VPN muafiyeti" sag={<Rozet ton="bilgi">Etkin</Rozet>}>
          <p className="tc-guvenlik-not">
            {k.vpnAraliklari.join(', ')} aralığından gelen denemeler şu kurallarda sayılmaz:
            {' '}{k.muafSinyaller.map((m) => k.kurallar.find((x) => x.sinyal === m)?.baslik ?? m).join(', ')}.
          </p>
        </Kart>
      )}
      <Tablo etiket="Alarm kuralları" sutunlar={KURAL_SUTUNLARI} satirlar={k.kurallar} satirAnahtari={(x) => x.sinyal} bosMesaj={BOS} />
    </div>
  );
}

// Denetim modülü dışarıya okuma vermiyor; yönetici işlemleri denetim kaydı sayfasında okunur.
export function GuvenlikYoneticiIslemleri() {
  const git = useNavigate();
  const oturum = useOturum();
  const denetimGorur = oturum.data?.islemler.includes('sayfa.denetim') ?? false;
  return (
    <div className="tc-guvenlik">
      <Kart baslik="Yönetici işlemleri">
        <p className="tc-guvenlik-not">
          Alarm onaylama ve kapatma, oturum kapatma, yetki ve kişi değişiklikleri denetim kaydına yazılır: kim, ne zaman, hangi işlemi yaptı.
        </p>
        {denetimGorur
          ? <Dugme simge="eye" onClick={() => { void git('/denetim'); }}>Denetim kaydını aç</Dugme>
          : <DurumKutusu durum="bos" mesaj="Denetim kaydını görme yetkiniz yok." />}
      </Kart>
    </div>
  );
}
