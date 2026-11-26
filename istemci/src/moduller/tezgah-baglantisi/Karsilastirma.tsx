import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { TezgahBaglantisiDurumCevabi, TezgahKarsilastirmaAlani } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { Dugme, DurumKutusu, Kart, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { CanliGosterge } from './CanliGosterge.tsx';
import { DolulukGostergesi } from './DolulukGostergesi.tsx';
import { ALAN_ADI, DURUM, KAYIT_YOK, degerAdi, YOK, saatMetni, sayiMetni, smartesDurumMetni, sorunaGoreSirala, sorunDerecesi, yukMetni } from './gosterim.ts';
import './tezgah-baglantisi.css';

type Tezgah = TezgahBaglantisiDurumCevabi['tezgahlar'][number];

const BAGLANTI_METNI = {
  kapali: 'Okuma kapalı. Sistem Ayarları’nda “Tezgâh bağlantısı okuması (deneme)” açılınca tezgâhlar sık aralıkla (varsayılan 5 saniye) okunur.',
  'adres-yok': 'Okuma açık ama servis adresi sunucuda tanımlı değil (TMIV2_TEZGAH_MTCONNECT_ADRESI); istek atılmıyor.',
} as const;
const LSV2_LISTE_YOK = 'Heidenhain okuması açık ama makine listesi boş; bağlantı açılmıyor. Sistem Ayarları\'ndan makine ekleyin.';

// Karşılaştırılan beş alan iki genişlikte aynıdır: [tezgâhın değeri, SmartES'in değeri].
// Boş değer (YOK, KAYIT_YOK) her yerde aynı yazı tipiyle; eş aralıklı yazı tipi yalnız gerçek program adında.
const mono = (alan: string, deger: string | null) => (alan === 'program' && deger !== null && deger !== YOK && deger !== KAYIT_YOK ? 'tc-tzb-mono' : undefined);

function alanlar(t: Tezgah): { alan: TezgahKarsilastirmaAlani; tezgah: string; smartes: string | null }[] {
  const s = t.smartes;
  return [
    { alan: 'durum', tezgah: DURUM[t.durum].metin, smartes: s === null ? null : smartesDurumMetni(s.durum) },
    { alan: 'program', tezgah: t.program ?? YOK, smartes: s === null ? null : s.program ?? YOK },
    { alan: 'sayac', tezgah: sayiMetni(t.sayac), smartes: s === null ? null : sayiMetni(s.sayac) },
    { alan: 'isMiliHizi', tezgah: sayiMetni(t.isMiliHizi, ' dev/dk'), smartes: s === null ? null : sayiMetni(s.isMiliHizi, ' dev/dk') },
    { alan: 'isMiliYuku', tezgah: yukMetni(t.isMiliYuku), smartes: s === null ? null : yukMetni(s.isMiliYuku) },
  ];
}

// Saat, tezgâhın son okunma anıdır (başlıktaki son okuma tüm tezgâhların en yenisi); "eski okuma" aynı saate bağlı iki tur ölçütüdür.
const SonOkuma = ({ t }: { t: Tezgah }) => (
  <>
    <span title="Bu tezgâhın son okunma anı">Okuma {saatMetni(t.okundu)}</span>
    {t.eski && <span className="tc-tzb-alt tc-tzb-eski">eski okuma</span>}
  </>
);

const Fark = () => <span className="tc-tzb-fark-isaret"><Simge ad="flag" boyut="k" />≠ fark</span>;
const Ad = ({ t }: { t: Tezgah }) => (
  <Link className="tc-tzb-kod tc-tzb-baglanti" to={`/tezgah-baglantisi/ayrinti?tezgah=${encodeURIComponent(t.cihazAdi)}`} aria-label={`${t.cihazAdi} ayrıntısı`}>{t.cihazAdi}</Link>
);
// Heidenhain makinesi doğrudan okunur (LSV2); okunamayan alanın nedeni uyarı olarak altında yazar.
const Kaynak = ({ t }: { t: Tezgah }) => (t.kaynak === 'lsv2' ? <span className="tc-tzb-alt">Heidenhain LSV2</span> : null);
const Uyari = ({ t }: { t: Tezgah }) => (t.uyari === null ? null : <span className="tc-tzb-alt tc-tzb-eski" role="note">{t.uyari}</span>);

export function Karsilastirma() {
  const sorgu = useQuery({
    queryKey: anahtarlar.durum,
    queryFn: () => api.get<TezgahBaglantisiDurumCevabi>('/tezgah-baglantisi/durum'),
    refetchInterval: (q) => (q.state.data?.aralikSaniye ?? 5) * 1000,
    // Sekme görünmüyorken yenileme durur.
    refetchIntervalInBackground: false,
  });
  const v = sorgu.data;
  const tezgahlar = sorunaGoreSirala(v?.tezgahlar ?? []);
  const alarmli = tezgahlar.filter((t) => sorunDerecesi(t) === 0).length;
  const eskiSayisi = tezgahlar.filter((t) => t.eski || t.durum === 'baglanti-yok').length;
  const farkli = tezgahlar.filter((t) => t.farklar.length > 0).map((t) => t.cihazAdi);
  const karsiliksiz = tezgahlar.filter((t) => t.smartes === null).map((t) => t.cihazAdi);
  const bagli = tezgahlar.filter((t) => t.durum !== 'baglanti-yok' && !t.eski).length;

  return (
    <Kart
      baslik="Tezgâh bağlantısı (deneme)"
      sag={<Dugme simge="rotate" aria-label="Yenile" yukleniyor={sorgu.isFetching} onClick={() => { void sorgu.refetch(); }} />}
    >
      <div className="tc-tzb">
        <p className="tc-tzb-not">Yalnız okur. Tezgâhlar ortak MTConnect servisinden ya da Heidenhain kumandasından (LSV2) {v?.aralikSaniye ?? 5} saniyede bir okunur; üretim kaydına hiçbir şey işlenmez.</p>
        {v && <DolulukGostergesi doluluk={v.doluluk} simdi={sorgu.dataUpdatedAt} />}
        {sorgu.isPending && <DurumKutusu durum="yukleniyor" />}
        {sorgu.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Tezgâh değerleri alınamadı')} yenile={() => { void sorgu.refetch(); }} />}
        {v && (
          <p role="status" className="tc-tzb-ozet">
            <Rozet ton={v.baglanti === 'acik' ? 'tamam' : 'pasif'}>{v.lsv2Baglanti === 'kapali' ? '' : 'MTConnect '}{v.baglanti === 'acik' ? 'Okuma açık' : 'Okuma kapalı'}</Rozet>
            {v.lsv2Baglanti !== 'kapali' && <Rozet ton={v.lsv2Baglanti === 'acik' ? 'tamam' : 'pasif'}>{v.lsv2Baglanti === 'acik' ? 'Heidenhain okuması açık' : 'Heidenhain listesi yok'}</Rozet>}
            {tezgahlar.length > 0 && <span>{tezgahlar.length} tezgâh · {bagli} bağlı · {alarmli} alarm · {tezgahlar.filter((t) => t.farklar.length > 0).length} fark · {eskiSayisi} eski ya da bağlantısız</span>}
          </p>
        )}
        {v && <p className="tc-tzb-not"><CanliGosterge okundu={v.sonOkuma} aralikSaniye={v.aralikSaniye} /></p>}
        {/* Yalnız Heidenhain okunan kurulumda MTConnect'in kapalı olması olağandır: not yalnız hiçbir kaynak okunmuyorken çıkar. */}
        {v && v.baglanti !== 'acik' && v.lsv2Baglanti !== 'acik' && <p className="tc-tzb-not">{BAGLANTI_METNI[v.baglanti]}</p>}
        {v && v.lsv2Baglanti === 'adres-yok' && <p className="tc-tzb-not">{LSV2_LISTE_YOK}</p>}
        {v?.sonHata != null && <p role="alert" className="tc-tzb-hata">Son okuma başarısız ({saatMetni(v.sonDeneme)}): {v.sonHata}</p>}
        {v && (v.baglanti === 'acik' || v.lsv2Baglanti === 'acik') && tezgahlar.length === 0 && v.sonHata === null && (
          <p role="status" className="tc-tzb-not">Henüz tezgâh okunmadı; ilk okuma birkaç saniye içinde gelir.</p>
        )}
        {tezgahlar.length > 0 && (
          <>
            <p className="tc-tzb-not">
              SmartES’ten farklı: {farkli.length === 0 ? 'yok' : farkli.join(', ')} · SmartES’te karşılığı yok: {karsiliksiz.length === 0 ? 'yok' : karsiliksiz.join(', ')}
            </p>
            <div className="tc-tzb-tablo-kap">
              <table className="tc-tzb-tablo">
                <thead>
                  <tr><th scope="col">Tezgâh</th><th scope="col">Durum</th><th scope="col">Program</th><th scope="col">Sayaç</th><th scope="col">İş mili</th><th scope="col">Yük</th><th scope="col">Takım</th><th scope="col">Alarm</th><th scope="col">Son okuma</th></tr>
                </thead>
                <tbody>
                  {tezgahlar.map((t) => (
                    <tr key={t.cihazAdi}>
                      <th scope="row"><Ad t={t} /><Kaynak t={t} /><Uyari t={t} />{t.mod !== null && <span className="tc-tzb-alt" title={t.mod}>{degerAdi('ControllerMode', t.mod)}</span>}</th>
                      {alanlar(t).map((a) => (
                        <td key={a.alan} className={t.farklar.includes(a.alan) ? 'tc-tzb-fark' : undefined}>
                          {a.alan === 'durum' ? <Rozet ton={DURUM[t.durum].ton}>{a.tezgah}</Rozet> : <span className={mono(a.alan, a.tezgah)}>{a.tezgah}</span>}
                          <span className="tc-tzb-alt">
                            {a.smartes === null ? (a.alan === 'durum' ? 'SmartES’te kayıt yok' : '') : (a.alan === 'program' ? <>SmartES: <span className={mono(a.alan, a.smartes)}>{a.smartes}</span></> : `SmartES: ${a.smartes}`)}
                            {t.farklar.includes(a.alan) && <Fark />}
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
                  <span className="tc-tzb-kart-ust"><Ad t={t} /><Rozet ton={DURUM[t.durum].ton}>{DURUM[t.durum].metin}</Rozet></span>
                  <Kaynak t={t} /><Uyari t={t} />
                  {t.alarm !== null && <span className="tc-tzb-alarm">{t.alarm}</span>}
                  <span className="tc-tzb-not"><SonOkuma t={t} /> · Takım {t.takim ?? YOK}{t.mod !== null && ` · ${degerAdi('ControllerMode', t.mod)}`}</span>
                  <dl className="tc-tzb-satirlar">
                    <span className="tc-tzb-bas" aria-hidden="true" /><span className="tc-tzb-bas">Tezgâh</span><span className="tc-tzb-bas">SmartES</span>
                    {alanlar(t).flatMap((a) => [
                      <dt key={`${a.alan}-ad`}>{ALAN_ADI[a.alan]}</dt>,
                      <dd key={`${a.alan}-t`} className={mono(a.alan, a.tezgah)}>{a.tezgah}</dd>,
                      <dd key={`${a.alan}-s`} className={[t.farklar.includes(a.alan) ? 'tc-tzb-fark' : '', mono(a.alan, a.smartes)].join(' ').trim() || undefined}>
                        {a.smartes ?? KAYIT_YOK}{t.farklar.includes(a.alan) && <Fark />}
                      </dd>,
                    ])}
                  </dl>
                </li>
              ))}
            </ul>
            <p className="tc-tzb-not">
              “≠ fark” ve renk: tezgâhtan okunan değer SmartES’inkinden farklı. Boş değer: “—” tezgâhtan değer gelmiyor, “kayıt yok” SmartES’te o tezgâh yok. Durum, program ve sayaç birebir; iş mili hızı yüzde 2’den, yük 5 puandan fazla
              ayrışırsa fark sayılır. Son okuma iki turdan eskiyse “eski okuma” yazar; kartlardaki saat o tezgâhın son okunma anıdır.
            </p>
          </>
        )}
      </div>
    </Kart>
  );
}
