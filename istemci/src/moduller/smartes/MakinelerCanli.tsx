import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CanliMakineAyrintisiCevabi, CanliMakinelerCevabi, SmartesMakineDurumu } from '#paylasilan/sozlesme/smartes.ts';
import { Dugme, DurumKutusu, Kart, Pencere, Rozet, Simge, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { BAGLANTI, YOK, sayiMetni, zamanMetni } from './gosterim.ts';
import './smartes.css';

type Makine = CanliMakinelerCevabi['makineler'][number];
type Suzgec = SmartesMakineDurumu | 'eski' | null;

// Renk tek başına anlam taşımaz: durum her kartta simge ve kelimeyle yazılır.
const DURUM: Record<SmartesMakineDurumu, { metin: string; ton: RozetTonu; simge: SimgeAdi }> = {
  calisiyor: { metin: 'Çalışıyor', ton: 'tamam', simge: 'play' },
  bekliyor: { metin: 'Bekliyor', ton: 'uyari', simge: 'pause' },
  alarm: { metin: 'Alarm', ton: 'hata', simge: 'alert' },
  kapali: { metin: 'Kapalı', ton: 'pasif', simge: 'stop' },
  'baglanti-yok': { metin: 'Bağlantı yok', ton: 'pasif', simge: 'x' },
  bilinmiyor: { metin: 'Bilinmiyor', ton: 'pasif', simge: 'help' },
};
const OZET_SIRASI: readonly SmartesMakineDurumu[] = ['calisiyor', 'bekliyor', 'alarm', 'kapali', 'baglanti-yok', 'bilinmiyor'];
// Son okuma bu kadar aralıktan eskiyse makinenin verisi eski sayılır (bir iki okuma kaçabilir).
const ESKI_ARALIK = 3;

const sureMetni = (ms: number): string => {
  const sn = Math.max(0, Math.round(ms / 1000));
  if (sn < 60) return `${sn} sn`;
  const dk = Math.floor(sn / 60);
  if (dk < 60) return `${dk} dk`;
  return `${Math.floor(dk / 60)} sa ${dk % 60} dk`;
};
const SAAT = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' });

function useSimdi(araMs: number): number {
  const [simdi, simdiYaz] = useState(() => Date.now());
  useEffect(() => {
    const z = setInterval(() => simdiYaz(Date.now()), araMs);
    return () => clearInterval(z);
  }, [araMs]);
  return simdi;
}

// Bugünkü durum şeridi: dilimler gün başından şimdiye orantılı; altında toplam süreler yazıyla.
function GunSeridi({ dilimler, simdi }: { dilimler: Makine['bugun']; simdi: number }) {
  if (dilimler.length === 0) return <p className="tc-sm-not">Bugün durum değişimi yok.</p>;
  const bas = new Date(dilimler[0]!.baslangic).getTime();
  const genislik = Math.max(1, simdi - bas);
  const toplam = new Map<SmartesMakineDurumu, number>();
  const parcalar = dilimler.map((d) => {
    const b = new Date(d.baslangic).getTime();
    const s = d.bitis === null ? simdi : new Date(d.bitis).getTime();
    toplam.set(d.durum, (toplam.get(d.durum) ?? 0) + (s - b));
    return { durum: d.durum, x: ((b - bas) / genislik) * 1000, w: Math.max(2, ((s - b) / genislik) * 1000), b, s };
  });
  const ozet = (['calisiyor', 'bekliyor', 'alarm'] as const).filter((k) => toplam.has(k))
    .map((k) => `${DURUM[k].metin} ${sureMetni(toplam.get(k) ?? 0)}`).join(' · ');
  return (
    <div className="tc-sm-serit">
      <svg viewBox="0 0 1000 10" preserveAspectRatio="none" role="img" aria-label={`Bugün: ${ozet}`}>
        {parcalar.map((p) => (
          <rect key={p.b} x={p.x} width={p.w} y={0} height={10} className="tc-sm-dilim" data-durum={p.durum}>
            <title>{`${DURUM[p.durum].metin} ${SAAT.format(p.b)}–${SAAT.format(p.s)}`}</title>
          </rect>
        ))}
      </svg>
      <span className="tc-sm-not">Bugün {SAAT.format(bas)} – şimdi: {ozet}</span>
    </div>
  );
}

const CalisanIs = ({ m }: { m: Makine }) => (m.calisanIs === null ? <span className="tc-sm-not">İş yok</span> : (
  <span className="tc-sm-mono">{m.calisanIs.emirNo} · Op {m.calisanIs.opNo} {m.calisanIs.opAdi}</span>
));

function MakineKarti({ m, simdi, aralik, ac }: { m: Makine; simdi: number; aralik: number; ac: () => void }) {
  const yas = simdi - new Date(m.okundu).getTime();
  const eski = yas > ESKI_ARALIK * aralik * 1000;
  const d = DURUM[m.durum];
  const durumSuresi = m.durumBaslangic === null ? null : sureMetni(simdi - new Date(m.durumBaslangic).getTime());
  return (
    <li>
      <button type="button" className="tc-sm-kart" data-durum={eski ? 'eski' : m.durum} onClick={ac}
        aria-label={`${m.makineKodu} ${m.makineAdi ?? ''}: ${eski ? 'veri eski' : d.metin}. Ayrıntı`}>
        <span className="tc-sm-kart-ust">
          <span className="tc-sm-kod">{m.makineKodu}</span>
          <span className="tc-sm-ad">{m.makineAdi ?? YOK}</span>
        </span>
        <span className="tc-sm-durum">
          {eski
            ? <Rozet ton="pasif">Veri eski ({sureMetni(yas)})</Rozet>
            : <span className="tc-sm-durum-ad" data-durum={m.durum}><Simge ad={d.simge} />{d.metin}</span>}
          {!eski && durumSuresi !== null && <span className="tc-sm-not">{durumSuresi}</span>}
          {m.durum === 'bilinmiyor' && m.durumKodu !== null && <span className="tc-sm-not">kod {m.durumKodu}</span>}
        </span>
        {m.alarm !== null && <span className="tc-sm-alarm"><Simge ad="alert" />{m.alarm}</span>}
        <dl className="tc-sm-bilgi">
          <dt>Program</dt>
          <dd className="tc-sm-mono">{m.programNo ?? YOK}{m.programAdi !== null && <span className="tc-sm-not"> {m.programAdi}</span>}</dd>
          <dt>Sayaç</dt>
          <dd className="tc-sm-mono">{sayiMetni(m.sayac)}</dd>
          <dt className="tc-sm-genis">İş mili yükü</dt>
          <dd className="tc-sm-genis">
            {m.spindleYuku === null ? YOK : (
              <span className="tc-sm-yuk">
                <progress max={100} value={Math.min(100, m.spindleYuku)} aria-label={`İş mili yükü yüzde ${Math.round(m.spindleYuku)}`} />
                <span className="tc-sm-mono">%{Math.round(m.spindleYuku)}</span>
              </span>
            )}
          </dd>
          <dt className="tc-sm-genis">CORE’da çalışan</dt>
          <dd className="tc-sm-genis"><CalisanIs m={m} /></dd>
          {m.calisanIs?.tamamlananYuzde != null && (
            <>
              <dt>Tamamlanan</dt>
              <dd>
                <span className="tc-sm-yuk">
                  <progress max={100} value={Math.min(100, m.calisanIs.tamamlananYuzde)} aria-label={`Tamamlanan yüzde ${Math.round(m.calisanIs.tamamlananYuzde)}`} />
                  <span className="tc-sm-mono">%{Math.round(m.calisanIs.tamamlananYuzde)}</span>
                </span>
              </dd>
            </>
          )}
          {m.calisanIs?.tahminiBitis != null && (<><dt>Tahmini bitiş</dt><dd className="tc-sm-mono">{zamanMetni(m.calisanIs.tahminiBitis)}</dd></>)}
        </dl>
        <span className="tc-sm-genis"><GunSeridi dilimler={m.bugun} simdi={simdi} /></span>
        <span className="tc-sm-zaman"><Simge ad="clock" />{sureMetni(yas)} önce okundu</span>
      </button>
    </li>
  );
}

function Ayrinti({ m, simdi, kapat }: { m: Makine; simdi: number; kapat: () => void }) {
  const a = useQuery({
    queryKey: anahtarlar.makine(m.makineKodu),
    queryFn: () => api.get<CanliMakineAyrintisiCevabi>(`/smartes/makineler/${encodeURIComponent(m.makineKodu)}`),
  });
  const v = a.data;
  return (
    <Pencere acik tur="yan" kapat={kapat} baslik={`${m.makineKodu} · ${m.makineAdi ?? ''}`}>
      <div className="tc-smartes">
        <p className="tc-smartes-ozet">
          <Rozet ton={DURUM[m.durum].ton}>{DURUM[m.durum].metin}</Rozet>
          {m.istasyonKodu !== null && <span className="tc-sm-not">İstasyon {m.istasyonKodu}</span>}
        </p>
        {m.alarm !== null && <p className="tc-sm-alarm"><Simge ad="alert" />{m.alarm}</p>}
        <dl className="tc-smartes-liste">
          <dt>CORE’da çalışan</dt><dd><CalisanIs m={m} /></dd>
          {m.calisanIs?.tamamlananYuzde != null && (<><dt>Tamamlanan</dt><dd className="tc-sm-mono">%{Math.round(m.calisanIs.tamamlananYuzde)}</dd></>)}
          {m.calisanIs?.tahminiBitis != null && (<><dt>Tahmini bitiş</dt><dd className="tc-sm-mono">{zamanMetni(m.calisanIs.tahminiBitis)}</dd></>)}
        </dl>
        <GunSeridi dilimler={m.bugun} simdi={simdi} />
        {a.isPending && <DurumKutusu durum="yukleniyor" />}
        {a.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(a.error, 'Ayrıntı alınamadı')} yenile={() => { void a.refetch(); }} />}
        {v && (
          <>
            <dl className="tc-smartes-liste">
              <dt>Mod</dt><dd>{v.mod ?? YOK}</dd>
              <dt>Uyarı</dt><dd>{v.uyari ?? YOK}</dd>
              <dt>Program</dt><dd className="tc-sm-mono">{m.programNo ?? YOK} {m.programAdi ?? ''}</dd>
              <dt>Sayaç (sıfırlanabilen)</dt><dd className="tc-sm-mono">{sayiMetni(m.sayac)}</dd>
              <dt>Sayaç (toplam)</dt><dd className="tc-sm-mono">{sayiMetni(v.sayacToplam)}</dd>
              <dt>İş mili</dt>
              <dd className="tc-sm-mono">{sayiMetni(v.spindle.hiz)} dev/dk · yük %{sayiMetni(v.spindle.yuk)} · oran %{sayiMetni(v.spindle.oran)}</dd>
              <dt>Eksen hızı</dt><dd className="tc-sm-mono">{sayiMetni(v.eksenHizi)}</dd>
              <dt>Besleme oranı</dt><dd className="tc-sm-mono">{v.eksenOrani === null ? YOK : `%${sayiMetni(v.eksenOrani)}`}</dd>
              <dt>Takım cebi</dt><dd className="tc-sm-mono">{sayiMetni(v.takimCebi)}</dd>
            </dl>
            <h3 className="tc-smartes-baslik">Bugünkü durum değişimleri</h3>
            <ol className="tc-sm-degisim">
              {v.degisimler.map((g) => (
                <li key={g.zaman}>
                  <span className="tc-sm-mono">{SAAT.format(new Date(g.zaman))}</span>
                  <span className="tc-sm-durum-ad" data-durum={g.yeni}><Simge ad={DURUM[g.yeni].simge} />{DURUM[g.yeni].metin}</span>
                  {g.aciklama !== null && <span className="tc-sm-not">{g.aciklama}</span>}
                </li>
              ))}
            </ol>
            <p className="tc-sm-not">Değerler SmartES’in son okumasıdır; CORE okuma zamanı {SAAT.format(new Date(v.okundu))}.</p>
          </>
        )}
      </div>
    </Pencere>
  );
}

export function MakinelerCanli() {
  const [suzgec, suzgecYaz] = useState<Suzgec>(null);
  const [secili, seciliYaz] = useState<string | null>(null);
  const simdi = useSimdi(5000);
  const liste = useQuery({
    queryKey: anahtarlar.makineler,
    queryFn: () => api.get<CanliMakinelerCevabi>('/smartes/makineler'),
    refetchInterval: (q) => (q.state.data?.aralikSaniye ?? 60) * 1000,
  });
  const v = liste.data;
  const aralik = v?.aralikSaniye ?? 60;
  const eskiMi = (m: Makine) => simdi - new Date(m.okundu).getTime() > ESKI_ARALIK * aralik * 1000;
  const makineler = v?.makineler ?? [];
  const sayi = (k: SmartesMakineDurumu) => makineler.filter((m) => !eskiMi(m) && m.durum === k).length;
  const eskiSayisi = makineler.filter(eskiMi).length;
  const gorunen = makineler.filter((m) => suzgec === null || (suzgec === 'eski' ? eskiMi(m) : !eskiMi(m) && m.durum === suzgec));
  const gruplar = new Map<string, { baslik: string; makineler: Makine[] }>();
  for (const m of gorunen) {
    const k = m.istasyonKodu ?? '';
    const g = gruplar.get(k) ?? { baslik: m.istasyonKodu === null ? 'İstasyona bağlı olmayan' : `${m.istasyonKodu} · ${m.istasyonAdi ?? ''}`, makineler: [] };
    g.makineler.push(m);
    gruplar.set(k, g);
  }
  const acik = makineler.find((m) => m.makineKodu === secili);

  return (
    <Kart
      baslik="Makineler canlı"
      sag={(
        <span className="tc-sm-sag">
          {v?.sonOkuma != null && <span className="tc-sm-not">Son okuma {sureMetni(simdi - new Date(v.sonOkuma).getTime())} önce</span>}
          <Dugme simge="rotate" aria-label="Yenile" yukleniyor={liste.isFetching} onClick={() => { void liste.refetch(); }} />
        </span>
      )}
    >
      <div className="tc-smartes">
        {liste.isPending && <DurumKutusu durum="yukleniyor" />}
        {liste.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Makine durumları alınamadı')} yenile={() => { void liste.refetch(); }} />}
        {v && v.baglanti !== 'acik' && (
          <p role="status" className="tc-smartes-ozet">
            <Rozet ton={BAGLANTI[v.baglanti].ton}>{BAGLANTI[v.baglanti].metin}</Rozet>
            <span className="tc-smartes-aciklama">SmartES bağlantısı kapalı; canlı durum okunmuyor.</span>
          </p>
        )}
        {v && v.baglanti === 'acik' && !v.okumaAcik && (
          <p role="status" className="tc-smartes-aciklama">Canlı makine okuması kapalı. Sistem Ayarları’nda “SmartES canlı makine okuması” açılınca makineler dakikada bir okunur.</p>
        )}
        {v && v.baglanti === 'acik' && v.okumaAcik && !v.destekleniyor && (
          <p role="status" className="tc-smartes-aciklama">SmartES bu bilgiyi vermiyor (makine bilgisi okuması bu sürümde yok). Bağlantının öbür işleri etkilenmez.</p>
        )}
        {v && v.baglanti === 'acik' && v.okumaAcik && v.destekleniyor && makineler.length === 0 && (
          <p role="status" className="tc-smartes-aciklama">Henüz makine okunmadı; ilk okuma bir dakika içinde gelir.</p>
        )}
        {v && v.baglanti === 'acik' && v.okumaAcik && v.destekleniyor && makineler.length > 0 && (
          <>
            <div className="tc-sm-ozet" role="group" aria-label="Duruma göre süz">
              <button type="button" className="tc-sm-cip" aria-pressed={suzgec === null} onClick={() => suzgecYaz(null)}>
                Tümü <b>{makineler.length}</b>
              </button>
              {OZET_SIRASI.filter((k) => sayi(k) > 0).map((k) => (
                <button key={k} type="button" className="tc-sm-cip" data-durum={k} aria-pressed={suzgec === k} onClick={() => suzgecYaz(suzgec === k ? null : k)}>
                  <Simge ad={DURUM[k].simge} />{DURUM[k].metin} <b>{sayi(k)}</b>
                </button>
              ))}
              {eskiSayisi > 0 && (
                <button type="button" className="tc-sm-cip" data-durum="eski" aria-pressed={suzgec === 'eski'} onClick={() => suzgecYaz(suzgec === 'eski' ? null : 'eski')}>
                  <Simge ad="clock" />Veri eski <b>{eskiSayisi}</b>
                </button>
              )}
            </div>
            {[...gruplar.values()].map((g) => (
              <section key={g.baslik} className="tc-sm-grup" aria-label={g.baslik}>
                <h3 className="tc-smartes-baslik">{g.baslik}</h3>
                <ul className="tc-sm-izgara">
                  {g.makineler.map((m) => <MakineKarti key={m.makineKodu} m={m} simdi={simdi} aralik={aralik} ac={() => seciliYaz(m.makineKodu)} />)}
                </ul>
              </section>
            ))}
            <p className="tc-sm-not">Bilgi SmartES’ten {aralik} saniyede bir okunur; süre CORE’un okuma zamanıdır.</p>
          </>
        )}
      </div>
      {acik && <Ayrinti m={acik} simdi={simdi} kapat={() => seciliYaz(null)} />}
    </Kart>
  );
}
