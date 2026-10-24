import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ANOMALI_DONEM_ETIKETI, ANOMALI_DURUM_ETIKETI, ANOMALI_DURUM_RENGI, anomaliAdedi, anomaliOrani, gunCubugu, isaretliSayisi, istasyonIsareti,
  istasyonlariSirala, kapaliKurallar, kisaTarih, oranRengi, type AnomaliDonemi, type AnomaliDurumu, type AnomaliIstasyonu, type AnomaliIstatistigi, type Anomaliler,
} from '../../../../../../arkon/web/src/data/anomali.ts';
import { Dugme, Girdi, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { iki } from '../cekirdek/bicim.ts';
import { useArkon } from '../veri/baglam.ts';
import type { Renk } from './kurallar.ts';
import { Cip, SayfaCercevesi, Secmeli } from './ortak.tsx';

// Üretim anomalisi (anomali.ts AnomaliApp): hesap TMI sunucusundadır (GET /arkon/anomaliler, /arkon/anomali-istatistik), sayfa yalnız
// gösterir. Bilinmeyen değer "–" yazılır, sıfır uydurulmaz.
const YENILEME_MS = 60000;

// Veri modülünün renk değeri ('var(--run)') tasarım değişkeninin adına çevrilir.
const renk = (v: string): Renk => v.replace(/^var\(--|\)$/g, '') as Renk;
const durumCipi = (d: AnomaliDurumu) => <Cip renk={renk(ANOMALI_DURUM_RENGI[d])}>{ANOMALI_DURUM_ETIKETI[d]}</Cip>;
const istasyonCipi = (i: AnomaliIstasyonu) => {
  const h = istasyonIsareti(i);
  return h === true ? <Cip renk="stop">{i.girisYok ? 'Giriş yok' : 'Eksik adet'}</Cip> : durumCipi(h === false ? 'normal' : 'bilinmiyor');
};
const yerelGun = (): string => { const d = new Date(); return `${d.getFullYear()}-${iki(d.getMonth() + 1)}-${iki(d.getDate())}`; };
const yasakMi = (e: unknown): boolean => !!e && typeof e === 'object' && (e as { status?: unknown }).status === 403;

function Satir({ ad, alt, beklenen, uretilen, children }: { ad: string; alt?: string; beklenen: number | null; uretilen: number | null; children: ReactNode }) {
  return (
    <div className="tc-ay3-anom-satir">
      <div><b>{ad}</b>{alt ? <small className="tc-ay3-not"> {alt}</small> : null}</div>
      <div className="mono" title="Beklenen / üretilen">{anomaliAdedi(beklenen)} / {anomaliAdedi(uretilen)}</div>
      <div className="tc-ay3-anom-sag">{children}</div>
    </div>
  );
}
function Bolum({ baslik, simge, adet, bos, children }: { baslik: string; simge: SimgeAdi; adet: number; bos: string; children: ReactNode[] }) {
  return (
    <section className="tc-ay3-kutu" aria-label={baslik}>
      <div className="tc-ay3-arac"><Simge ad={simge} /><b>{baslik}</b><span className="tc-ay3-bosluk" /><span className="tc-ay3-ust">{adet}</span></div>
      {children.length ? children : <small className="tc-ay3-not">{bos}</small>}
    </section>
  );
}
// Emek verimi (kart #1324): standart süre / vardiya mesaisi; birden çok makineye bakan kişide 1'i aşabilir.
const emek = (e: number | null | undefined) => (e != null ? <small title="Standart süre / vardiya mesaisi (izinli gün hariç)">emek verimi {anomaliOrani(e)}</small> : null);
const hurda = (h: number | null) => (h ? <small>{anomaliAdedi(h)} hurda</small> : null);
const planDisi = (p: number | null | undefined) => (p ? <small title="Plana girmemiş işin sağlamı; orana girmez">{anomaliAdedi(p)} plan dışı</small> : null);

type Sekme = 'bugun' | AnomaliDonemi;

export function AnomaliSayfasi() {
  const [s, sYaz] = useState<Sekme>('bugun');
  const [tarih, tarihYaz] = useState(yerelGun());
  const sekme = (
    <Secmeli etiket="Dönem" deger={s} degistir={sYaz}
      secenekler={(['bugun', 'gun', 'hafta', 'ay'] as Sekme[]).map((k) => ({ k, etiket: k === 'bugun' ? 'Bugün' : ANOMALI_DONEM_ETIKETI[k] }))} />
  );
  return s === 'bugun' ? <Bugun sekme={sekme} />
    : <SayfaCercevesi simge="alert" baslik="Üretim Anomalisi"><Donem sekme={sekme} donem={s} tarih={tarih} tarihYaz={tarihYaz} /></SayfaCercevesi>;
}

function Bugun({ sekme }: { sekme: ReactNode }) {
  const { depo, git } = useArkon();
  const bagli = depo.status().mode === 'server';
  const [a, aYaz] = useState<Anomaliler | null>(null);
  const [hata, hataYaz] = useState(false);
  const [yasak, yasakYaz] = useState(false);
  const [mesgul, mesgulYaz] = useState(false);
  const sor = useCallback((canli: () => boolean = () => true) => {
    mesgulYaz(true);
    return depo.Server.anomaliler()
      .then((d) => { if (canli()) { aYaz(d); hataYaz(false); } })
      .catch((e: unknown) => { if (!canli()) return; if (yasakMi(e)) yasakYaz(true); else hataYaz(true); })
      .finally(() => { if (canli()) mesgulYaz(false); });
  }, [depo]);
  useEffect(() => {
    if (!bagli) return undefined;
    let canli = true;
    void sor(() => canli);
    const t = setInterval(() => { void sor(() => canli); }, YENILEME_MS);
    return () => { canli = false; clearInterval(t); };
  }, [bagli, sor]);

  const sayi = a ? isaretliSayisi(a.istasyonlar) : null;
  const ek = sayi !== null ? <Cip renk={sayi ? 'stop' : 'run'}>{sayi ? `${sayi} istasyon eksik` : 'Eksik yok'}</Cip> : null;
  const kapali = a ? kapaliKurallar(a.esikler) : [];
  return (
    <SayfaCercevesi simge="alert" baslik="Üretim Anomalisi" ek={ek}>
      <div className="tc-ay3-arac">
        {sekme}
        {a && (
          <small className="tc-ay3-not">
            Beklenen: plandaki sıraya göre şu ana kadar üretilebilecek adet. Toplam {anomaliAdedi(a.toplam.beklenen)} beklenen, {anomaliAdedi(a.toplam.uretilen)} üretilen
            ({anomaliOrani(a.toplam.oran)}), {anomaliAdedi(a.toplam.hurda)} hurda{a.toplam.planDisi ? `, ${anomaliAdedi(a.toplam.planDisi)} plan dışı (orana girmez)` : ''}
            {a.toplam.performans !== null ? ` · performans ${anomaliOrani(a.toplam.performans)}` : ''}{a.atlanan ? ` · ${a.atlanan} yerleşim istasyonsuz, hesaba girmedi` : ''}
          </small>
        )}
        <span className="tc-ay3-bosluk" />
        <Dugme simge="layers" onClick={() => git('hazirlik')}>Üretim Terminali Hazırlık</Dugme>
        {bagli && !yasak && <Dugme simge="rotate" onClick={() => { void sor(); }} disabled={mesgul}>Yenile</Dugme>}
      </div>
      {!bagli ? <p className="tc-ay3-not">Üretim anomalisi yalnız TMI&apos;ye bağlıyken hesaplanır.</p>
        : yasak ? <p className="tc-ay3-not">Üretim anomalisini görme yetkiniz yok.</p>
        : !a ? <p className="tc-ay3-not">{hata ? 'Anomali verisi şu an alınamadı' : 'Hesaplanıyor…'}</p>
        : (
          <>
            <div className="tc-ay3-anom">
              <Bolum baslik="İstasyon" simge="layers" adet={a.istasyonlar.length} bos="Canlı planda yerleşmiş iş yok">
                {istasyonlariSirala(a.istasyonlar).map((i) => (
                  <Satir key={`i${i.istasyonId}`} ad={i.kod} alt={i.ad + (i.kapasiteKaynagi === 'insan' ? ' · insanlı' : '')} beklenen={i.beklenen} uretilen={i.uretilen}>
                    {istasyonCipi(i)}<span className="tc-ay3-ust">{anomaliOrani(i.oran)}</span>{hurda(i.hurda)}{planDisi(i.planDisi)}
                  </Satir>
                ))}
              </Bolum>
              <Bolum baslik="Makine" simge="gauge" adet={a.makineler.length} bos="Makine kaydı yok">
                {a.makineler.map((m) => (
                  <Satir key={`m${m.makineId}`} ad={m.kod} alt={m.ad} beklenen={m.beklenen} uretilen={m.uretilen}>{durumCipi(m.durum)}{hurda(m.hurda)}</Satir>
                ))}
              </Bolum>
              {a.kisiler && (
                <Bolum baslik="Kişi" simge="user" adet={a.kisiler.length} bos="Kişi kaydı yok">
                  {a.kisiler.map((k) => (
                    <Satir key={`k${k.kisiId}`} ad={k.ad} beklenen={k.beklenen} uretilen={k.uretilen}>
                      {durumCipi(k.durum)}{hurda(k.hurda)}{k.performans !== null ? <small>performans {anomaliOrani(k.performans)}</small> : null}{emek(k.emekVerimi)}
                    </Satir>
                  ))}
                </Bolum>
              )}
            </div>
            {hata && <small className="tc-ay3-not">Son yenileme alınamadı; gösterilen veri önceki okumadır.</small>}
            {kapali.length > 0 && <small className="tc-ay3-not">Kapalı kural: {kapali.join(', ')} (Ayarlar)</small>}
          </>
        )}
    </SayfaCercevesi>
  );
}

// Gün, hafta, ay (kart #1306): TMI'nin kaydettiği günlerden. Oran Σ üretilen / Σ beklenen, performans standart süre / çalışılan süre.
function Donem({ sekme, donem, tarih, tarihYaz }: { sekme: ReactNode; donem: AnomaliDonemi; tarih: string; tarihYaz: (t: string) => void }) {
  const { depo } = useArkon();
  const [v, vYaz] = useState<AnomaliIstatistigi | null>(null);
  const [hata, hataYaz] = useState(false);
  const [yasak, yasakYaz] = useState(false);
  useEffect(() => {
    let canli = true;
    vYaz(null);
    hataYaz(false);
    depo.Server.anomaliIstatistigi(donem, tarih)
      .then((d) => { if (canli) vYaz(d); })
      .catch((e: unknown) => { if (!canli) return; if (yasakMi(e)) yasakYaz(true); else hataYaz(true); });
    return () => { canli = false; };
  }, [depo, donem, tarih]);
  const ust = (
    <div className="tc-ay3-arac">
      {sekme}
      <Girdi etiket="Tarih" type="date" value={tarih} max={yerelGun()} onChange={(o) => { if (o.target.value) tarihYaz(o.target.value); }} />
    </div>
  );
  if (yasak) return <>{ust}<p className="tc-ay3-not">Üretim anomalisini görme yetkiniz yok.</p></>;
  if (!v) return <>{ust}<p className="tc-ay3-not">{hata ? 'İstatistik şu an alınamadı' : 'Yükleniyor…'}</p></>;
  const enBuyuk = Math.max(0, ...v.gunler.map((g) => Math.max(g.beklenen ?? 0, g.uretilen ?? 0)));
  const kirilim = (r: AnomaliIstatistigi['istasyonlar'][number] | AnomaliIstatistigi['makineler'][number] | NonNullable<AnomaliIstatistigi['kisiler']>[number], key: string, ad: string, alt?: string) => (
    <Satir key={key} ad={ad} alt={alt} beklenen={r.beklenen} uretilen={r.uretilen}>
      <Cip renk={renk(oranRengi(r.oran))}>{anomaliOrani(r.oran)}</Cip>{hurda(r.hurda)}{'planDisi' in r ? planDisi(r.planDisi) : null}
      {r.performans !== null ? <small>performans {anomaliOrani(r.performans)}</small> : null}{'emekVerimi' in r ? emek(r.emekVerimi) : null}
      <small>{r.isaretliGun ? `${r.isaretliGun} / ${r.gun} gün eksik` : `${r.gun} gün`}</small>
    </Satir>
  );
  return (
    <>
      {ust}
      <div className="tc-ay3-ozet">
        <div className="tc-ay3-ozet-kutu" data-renk={renk(oranRengi(v.toplam.oran))}><span className="tc-ay3-ust">Plan uyumu</span><b>{anomaliOrani(v.toplam.oran)}</b><small>{anomaliAdedi(v.toplam.uretilen)} / {anomaliAdedi(v.toplam.beklenen)}</small></div>
        <div className="tc-ay3-ozet-kutu"><span className="tc-ay3-ust">Performans</span><b>{anomaliOrani(v.toplam.performans)}</b><small>standart süre / çalışılan</small></div>
        <div className="tc-ay3-ozet-kutu"><span className="tc-ay3-ust">Hurda</span><b>{anomaliAdedi(v.toplam.hurda)}</b><small>adet</small></div>
        <div className="tc-ay3-ozet-kutu"><span className="tc-ay3-ust">Plan dışı</span><b>{anomaliAdedi(v.toplam.planDisi)}</b><small>adet, orana girmez</small></div>
        <div className="tc-ay3-ozet-kutu"><span className="tc-ay3-ust">Kayıtlı gün</span><b>{v.toplam.kayitliGun} / {v.gunler.length}</b><small>{kisaTarih(v.bas)} - {kisaTarih(v.bit)}</small></div>
      </div>
      {v.gunler.length > 1 && (
        <section className="tc-ay3-kutu" aria-label="Günler">
          <div className="tc-ay3-arac"><Simge ad="chart" /><b>Günler</b><span className="tc-ay3-bosluk" /><small className="tc-ay3-not">beklenen / üretilen</small></div>
          <div className="tc-ay3-gunler-cubuk">
            {v.gunler.map((g) => {
              const c = gunCubugu(g, enBuyuk);
              return (
                <button key={g.tarih} type="button" className="tc-ay3-gun" data-renk={renk(oranRengi(g.oran))} disabled={!g.durum} onClick={() => tarihYaz(g.tarih)}
                  title={g.durum ? `${anomaliAdedi(g.uretilen)} / ${anomaliAdedi(g.beklenen)} · ${anomaliOrani(g.oran)}` : 'Kayıt yok'}>
                  <svg viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <rect className="tc-ay3-beklenen" x={0} width={9} y={100 - c.beklenen} height={c.beklenen} />
                    <rect className="tc-ay3-uretilen" x={11} width={9} y={100 - c.uretilen} height={c.uretilen} />
                  </svg>
                  <small>{kisaTarih(g.tarih)}</small><small className="tc-ay3-not">{g.durum ? anomaliOrani(g.oran) : '–'}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="tc-ay3-anom">
        <Bolum baslik="İstasyon" simge="layers" adet={v.istasyonlar.length} bos="Bu dönemde kayıt yok">{v.istasyonlar.map((i) => kirilim(i, `i${i.istasyonId}`, i.kod, i.ad))}</Bolum>
        <Bolum baslik="Makine" simge="gauge" adet={v.makineler.length} bos="Bu dönemde kayıt yok">{v.makineler.map((m) => kirilim(m, `m${m.makineId}`, m.kod, m.ad))}</Bolum>
        {v.kisiler && <Bolum baslik="Kişi" simge="user" adet={v.kisiler.length} bos="Bu dönemde kayıt yok">{v.kisiler.map((k) => kirilim(k, `k${k.kisiId}`, k.ad))}</Bolum>}
      </div>
      {v.toplam.kayitliGun < v.gunler.length && <small className="tc-ay3-not">Kaydı olmayan gün boş gösterilir; kayıt gün içinde 15 dakikada bir yenilenir, gün bitiminden iki saat sonra kesinleşir.</small>}
    </>
  );
}
