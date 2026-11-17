import { useQuery } from '@tanstack/react-query';
import type { TezgahBaglantisiDurumCevabi, TezgahKarsilastirmaAlani } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { Dugme, DurumKutusu, Kart, Rozet } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ALAN_ADI, DURUM, YOK, saatMetni, sayiMetni, smartesDurumMetni, yukMetni } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Tezgah = TezgahBaglantisiDurumCevabi['tezgahlar'][number];

const BAGLANTI_METNI = {
  kapali: 'Okuma kapalı. Sistem Ayarları’nda “Tezgah bağlantısı okuması (deneme)” açılınca tezgahlar dakikada bir okunur.',
  'adres-yok': 'Okuma açık ama servis adresi sunucuda tanımlı değil (TMIV2_TEZGAH_MTCONNECT_ADRESI); istek atılmıyor.',
} as const;

// Karşılaştırılan beş alan iki genişlikte aynıdır: [tezgahın değeri, SmartES'in değeri].
function alanlar(t: Tezgah): { alan: TezgahKarsilastirmaAlani; tezgah: string; smartes: string | null }[] {
  const s = t.smartes;
  return [
    { alan: 'durum', tezgah: DURUM[t.durum].metin, smartes: s === null ? null : smartesDurumMetni(s.durum) },
    { alan: 'program', tezgah: t.program ?? YOK, smartes: s === null ? null : s.program ?? YOK },
    { alan: 'sayac', tezgah: sayiMetni(t.sayac), smartes: s === null ? null : sayiMetni(s.sayac) },
    { alan: 'isMiliHizi', tezgah: sayiMetni(t.isMiliHizi, ' dev/dk'), smartes: s === null ? null : sayiMetni(s.isMiliHizi) },
    { alan: 'isMiliYuku', tezgah: yukMetni(t.isMiliYuku), smartes: s === null ? null : yukMetni(s.isMiliYuku) },
  ];
}

const SonOkuma = ({ t }: { t: Tezgah }) => (
  <>{saatMetni(t.okundu)}{t.eski && <span className="tc-tzb-alt tc-tzb-eski">eski okuma</span>}</>
);

export function Karsilastirma() {
  const sorgu = useQuery({
    queryKey: anahtarlar.durum,
    queryFn: () => api.get<TezgahBaglantisiDurumCevabi>('/tezgah-baglantisi/durum'),
    refetchInterval: (q) => (q.state.data?.aralikSaniye ?? 60) * 1000,
  });
  const v = sorgu.data;
  const tezgahlar = v?.tezgahlar ?? [];
  const farkli = tezgahlar.filter((t) => t.farklar.length > 0).map((t) => t.cihazAdi);
  const karsiliksiz = tezgahlar.filter((t) => t.smartes === null).map((t) => t.cihazAdi);
  const bagli = tezgahlar.filter((t) => t.durum !== 'baglanti-yok' && !t.eski).length;

  return (
    <Kart
      baslik="Tezgah bağlantısı (deneme)"
      sag={<Dugme simge="rotate" aria-label="Yenile" yukleniyor={sorgu.isFetching} onClick={() => { void sorgu.refetch(); }} />}
    >
      <div className="tc-tzb">
        <p className="tc-tzb-not">Yalnız okur. Tezgahlar ortak MTConnect servisinden dakikada bir okunur; üretim kaydına hiçbir şey işlenmez.</p>
        {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
        {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Tezgah değerleri alınamadı')} yenile={() => { void sorgu.refetch(); }} />}
        {v && (
          <p role="status" className="tc-tzb-ozet">
            <Rozet ton={v.baglanti === 'acik' ? 'tamam' : 'pasif'}>{v.baglanti === 'acik' ? 'Okuma açık' : 'Okuma kapalı'}</Rozet>
            {tezgahlar.length > 0 && <span>{tezgahlar.length} tezgah · {bagli} bağlı · son okuma {saatMetni(v.sonOkuma)}</span>}
          </p>
        )}
        {v && v.baglanti !== 'acik' && <p className="tc-tzb-not">{BAGLANTI_METNI[v.baglanti]}</p>}
        {v?.sonHata != null && <p role="alert" className="tc-tzb-hata">Son okuma başarısız ({saatMetni(v.sonDeneme)}): {v.sonHata}</p>}
        {v && v.baglanti === 'acik' && tezgahlar.length === 0 && v.sonHata === null && (
          <p role="status" className="tc-tzb-not">Henüz tezgah okunmadı; ilk okuma bir dakika içinde gelir.</p>
        )}
        {tezgahlar.length > 0 && (
          <>
            <p className="tc-tzb-not">
              SmartES’ten farklı: {farkli.length === 0 ? 'yok' : farkli.join(', ')} · SmartES’te karşılığı yok: {karsiliksiz.length === 0 ? 'yok' : karsiliksiz.join(', ')}
            </p>
            <div className="tc-tzb-tablo-kap">
              <table className="tc-tzb-tablo">
                <thead>
                  <tr><th scope="col">Tezgah</th><th scope="col">Durum</th><th scope="col">Program</th><th scope="col">Sayaç</th><th scope="col">İş mili</th><th scope="col">Yük</th><th scope="col">Takım</th><th scope="col">Alarm</th><th scope="col">Son okuma</th></tr>
                </thead>
                <tbody>
                  {tezgahlar.map((t) => (
                    <tr key={t.cihazAdi}>
                      <th scope="row"><span className="tc-tzb-kod">{t.cihazAdi}</span>{t.mod !== null && <span className="tc-tzb-alt">{t.mod}</span>}</th>
                      {alanlar(t).map((a) => (
                        <td key={a.alan} className={t.farklar.includes(a.alan) ? 'tc-tzb-fark' : undefined}>
                          {a.alan === 'durum' ? <Rozet ton={DURUM[t.durum].ton}>{a.tezgah}</Rozet> : <span className={a.alan === 'program' ? 'tc-tzb-mono' : undefined}>{a.tezgah}</span>}
                          <span className="tc-tzb-alt">
                            {a.smartes === null ? (a.alan === 'durum' ? 'SmartES’te yok' : '') : (a.alan === 'program' ? <>SmartES: <span className="tc-tzb-mono">{a.smartes}</span></> : `SmartES: ${a.smartes}`)}
                            {t.farklar.includes(a.alan) && <span className="tc-gizli-etiket"> (farklı)</span>}
                          </span>
                        </td>
                      ))}
                      <td>{t.takim ?? YOK}</td>
                      <td className={t.alarm === null ? undefined : 'tc-tzb-alarm'}>{t.alarm ?? YOK}</td>
                      <td><SonOkuma t={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="tc-tzb-kartlar">
              {tezgahlar.map((t) => (
                <li key={t.cihazAdi} className="tc-tzb-kart">
                  <span className="tc-tzb-kart-ust"><span className="tc-tzb-kod">{t.cihazAdi}</span><Rozet ton={DURUM[t.durum].ton}>{DURUM[t.durum].metin}</Rozet></span>
                  {t.alarm !== null && <span className="tc-tzb-alarm">{t.alarm}</span>}
                  <span className="tc-tzb-not"><SonOkuma t={t} /> · Takım {t.takim ?? YOK}{t.mod !== null && ` · ${t.mod}`}</span>
                  <dl className="tc-tzb-satirlar">
                    <span className="tc-tzb-bas" aria-hidden="true" /><span className="tc-tzb-bas">Tezgah</span><span className="tc-tzb-bas">SmartES</span>
                    {alanlar(t).flatMap((a) => [
                      <dt key={`${a.alan}-ad`}>{ALAN_ADI[a.alan]}</dt>,
                      <dd key={`${a.alan}-t`} className={a.alan === 'program' ? 'tc-tzb-mono' : undefined}>{a.tezgah}</dd>,
                      <dd key={`${a.alan}-s`} className={[t.farklar.includes(a.alan) ? 'tc-tzb-fark' : '', a.alan === 'program' ? 'tc-tzb-mono' : ''].join(' ').trim() || undefined}>
                        {a.smartes ?? 'yok'}{t.farklar.includes(a.alan) && <span className="tc-gizli-etiket"> (farklı)</span>}
                      </dd>,
                    ])}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="tc-tzb-not">
              İşaretli değer: tezgahtan okunan, SmartES’in değerinden farklı. Durum, program ve sayaç birebir; iş mili hızı yüzde 2’den, yük 5 puandan fazla
              ayrışırsa fark sayılır. Son okuma iki dakikadan eskiyse “eski okuma” yazar.
            </p>
          </>
        )}
      </div>
    </Kart>
  );
}
