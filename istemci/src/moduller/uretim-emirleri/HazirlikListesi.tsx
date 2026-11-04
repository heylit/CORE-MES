import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { HazirlikCevabi, HazirlikMaddesi, HazirlikMuafiyetiGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, Pencere, Rozet, Secim, Simge, useBildirim, type RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { ADIMLI_OKUMA_ISLEMLERI, zamanMetni } from './gorunum.ts';
import './uretim-emirleri.css';

type Hal = HazirlikCevabi['maddeler'][number]['durum'];
type IsEmriSatiri = HazirlikCevabi['isEmirleri'][number];

// Hazırlık matrisi (2060 a): satırlar iş emirleri, sütunlar maddeler. İş emri düzeyindeki madde (CNC) hücre hücre, emir geneli madde
// bütün satırlara yayılan tek hücredir. Maddenin hâlini sahibi modül verir (sunucuda çözücü); bu bileşen yalnız gösterir.
// Muafiyet yalnız müdürde (uretim-emirleri.hazirlik-muaf, 264 a) ve yalnız muaf tutulabilen maddede açılır (121 a).
const HAL: Record<Hal, { ton: RozetTonu; simge: SimgeAdi; ad: string; aciklama: string }> = {
  tamam: { ton: 'tamam', simge: 'check', ad: 'Tamam', aciklama: 'Tamam.' },
  eksik: { ton: 'hata', simge: 'x', ad: 'Eksik', aciklama: 'Eksik: tamamlanmadan iş emri başlamaz.' },
  muaf: { ton: 'uyari', simge: 'lock', ad: 'Muaf', aciklama: 'Müdür gerekçeyle muaf tuttu; iş başlar.' },
  gerekmez: { ton: 'pasif', simge: 'minus', ad: 'Gerekmez', aciklama: 'Bu emirde gerekmiyor.' },
  bilinmiyor: { ton: 'pasif', simge: 'help', ad: 'Bilinmiyor', aciklama: 'Sistem bu maddeyi henüz denetlemiyor; başlatmayı durdurmaz.' },
};
const HAL_SIRASI: readonly Hal[] = ['tamam', 'eksik', 'muaf', 'gerekmez', 'bilinmiyor'];

interface MaddeBilgisi { ad: string; kisa: string; sahip: string; git: { yol: string; islem: string; ad: string } | null }
export const MADDE: Record<HazirlikMaddesi, MaddeBilgisi> = {
  cnc: { ad: 'CNC kurulumu', kisa: 'CNC', sahip: 'CNC Kurulum', git: { yol: '/cnc-kurulum', islem: 'sayfa.cnc-kurulum', ad: "CNC Kurulum'da aç" } },
  cizim: { ad: 'Çizim revizyonu', kisa: 'Çizim', sahip: 'Kalite Merkezi', git: { yol: '/kalite-merkezi', islem: 'sayfa.kalite-merkezi', ad: 'Çizimi aç' } },
  kalibrasyon: { ad: 'Ölçü aleti kalibrasyonu', kisa: 'Kalibr.', sahip: 'Kalibrasyon', git: { yol: '/kalibrasyon', islem: 'sayfa.kalibrasyon', ad: "Kalibrasyon'da aç" } },
  'ozel-proses': { ad: 'Özel proses', kisa: 'Özel pr.', sahip: 'sahibi belli değil', git: null },
};

// Hücre kimliği: emir geneli madde yalnız madde, iş emri düzeyindeki madde madde ve iş emri.
interface Hucre { madde: HazirlikMaddesi; isEmriId: number | null }
const ayni = (a: Hucre | null, b: Hucre) => a !== null && a.madde === b.madde && a.isEmriId === b.isEmriId;

export function hucreHali(v: HazirlikCevabi, h: Hucre): Hal {
  if (h.isEmriId === null) return v.maddeler.find((m) => m.madde === h.madde)?.durum ?? 'bilinmiyor';
  return v.isEmirleri.find((i) => i.isEmriId === h.isEmriId)?.maddeler.find((m) => m.madde === h.madde)?.durum ?? 'bilinmiyor';
}

// Satır başlar mı: iş emri düzeyindeki hücresi ya da emir geneli bir maddesi eksikse durur.
export function satirDurur(v: HazirlikCevabi, satir: IsEmriSatiri): boolean {
  return v.maddeler.some((m) => (m.isEmriDuzeyi ? hucreHali(v, { madde: m.madde, isEmriId: satir.isEmriId }) : m.durum) === 'eksik');
}

export function HazirlikListesi({ emir }: { emir: { id: number; malzemeNo?: number | null; durum: string } }) {
  const islemler = (useOturum().data?.islemler ?? []) as readonly string[];
  const gorur = emir.malzemeNo != null && ADIMLI_OKUMA_ISLEMLERI.some((i) => islemler.includes(i));
  if (!gorur) return null;
  return <Matris emirId={emir.id} muafVerir={islemler.includes('uretim-emirleri.hazirlik-muaf') && emir.durum !== 'bitti' && emir.durum !== 'iptal'} islemler={islemler} />;
}

function Matris({ emirId, muafVerir, islemler }: { emirId: number; muafVerir: boolean; islemler: readonly string[] }) {
  const yonlendir = useNavigate();
  const [secili, seciliYaz] = useState<Hucre | null>(null);
  const [muaf, muafYaz] = useState<Hucre | null>(null);
  const d = useQuery({
    queryKey: anahtarlar.hazirlik(emirId),
    queryFn: () => api.get<HazirlikCevabi>(`/adimli-emirler/${emirId}/hazirlik`),
  });
  const v = d.data;
  const acik = v?.isEmirleri.filter((i) => !i.bitti) ?? [];
  const duran = v ? acik.filter((i) => satirDurur(v, i)).length : 0;
  const muafli = v?.maddeler.some((m) => m.durum === 'muaf') ?? false;
  const sec = (h: Hucre) => seciliYaz((o) => (ayni(o, h) ? null : h));

  const hucre = (h: Hucre, satir: IsEmriSatiri | null) => {
    const hal = HAL[v ? hucreHali(v, h) : 'bilinmiyor'];
    const ad = `${MADDE[h.madde].ad}${satir ? `, OP ${satir.opNo}` : ''}: ${hal.ad}`;
    return (
      <button type="button" className="tc-hz-hucre" data-ton={hal.ton} aria-pressed={ayni(secili, h)} aria-label={ad} title={ad} onClick={() => sec(h)}>
        <Simge ad={hal.simge} /><small>{hal.ad}</small>
      </button>
    );
  };

  return (
    <section className="tc-emir-bolum-hazirlik" aria-label="Hazırlık">
      <div className="tc-hz-bas">
        <h3 className="tc-emir-bolum"><Simge ad="flag" />Hazırlık</h3>
        {v && (duran > 0 ? <Rozet ton="hata">{`${duran}/${acik.length} iş emri durur`}</Rozet>
          : muafli ? <Rozet ton="uyari">Hazır, muafiyetle</Rozet> : <Rozet ton="tamam">Üretime hazır</Rozet>)}
      </div>
      {d.isPending && <p className="tc-emir-not">Hazırlık okunuyor…</p>}
      {d.isError && <p className="tc-emir-not">{hataIletisi(d.error, 'Hazırlık okunamadı.')}</p>}
      {v && v.isEmirleri.length === 0 && <p className="tc-emir-not">Emrin iş emri yok.</p>}
      {v && v.isEmirleri.length > 0 && (
        <>
          <div className="tc-hz-sarmal">
            <table className="tc-hz-matris">
              <caption className="tc-gizli-etiket">Hazırlık matrisi</caption>
              <thead>
                <tr>
                  <th scope="col">İş emri</th>
                  {v.maddeler.map((m) => (
                    <th key={m.madde} scope="col" title={`${MADDE[m.madde].ad} · ${MADDE[m.madde].sahip}`}>
                      {MADDE[m.madde].kisa}<small>{m.isEmriDuzeyi ? 'iş emri başına' : 'emir geneli'}</small>
                    </th>
                  ))}
                  <th scope="col">Başlar mı</th>
                </tr>
              </thead>
              <tbody>
                {v.isEmirleri.map((s, i) => (
                  <tr key={s.isEmriId} data-bitti={s.bitti || undefined}>
                    <th scope="row">{`OP ${s.opNo}`}<small>{s.ad}</small></th>
                    {v.maddeler.map((m) => (m.isEmriDuzeyi
                      ? <td key={m.madde}>{hucre({ madde: m.madde, isEmriId: s.isEmriId }, s)}</td>
                      : i === 0 ? <td key={m.madde} className="tc-hz-ortak" rowSpan={v.isEmirleri.length}>{hucre({ madde: m.madde, isEmriId: null }, null)}</td>
                        : <Fragment key={m.madde} />))}
                    <td>
                      {s.bitti ? <span className="tc-hz-baslar" data-ton="pasif"><Simge ad="check" /><small>Bitti</small></span>
                        : satirDurur(v, s) ? <span className="tc-hz-baslar" data-ton="hata"><Simge ad="pause" /><b>Durur</b></span>
                          : <span className="tc-hz-baslar" data-ton="tamam"><Simge ad="play" /><b>Başlar</b></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="tc-hz-lejant" aria-label="Simgeler">
            {HAL_SIRASI.map((h) => <li key={h} data-ton={HAL[h].ton}><Simge ad={HAL[h].simge} /><span>{HAL[h].ad}</span></li>)}
          </ul>
          {secili === null ? <p className="tc-emir-not">Ayrıntı için bir hücreye dokunun.</p> : (
            <Ayrinti v={v} h={secili} islemler={islemler} muafVerir={muafVerir} git={(yol) => { void yonlendir(yol); }} muafAc={() => muafYaz(secili)} />
          )}
          {muaf && <MuafPenceresi emirId={emirId} v={v} h={muaf} kapat={() => muafYaz(null)} />}
        </>
      )}
    </section>
  );
}

function Ayrinti({ v, h, islemler, muafVerir, git, muafAc }: {
  v: HazirlikCevabi; h: Hucre; islemler: readonly string[]; muafVerir: boolean; git: (yol: string) => void; muafAc: () => void;
}) {
  const md = MADDE[h.madde];
  const hal = hucreHali(v, h);
  const satir = h.isEmriId === null ? null : v.isEmirleri.find((i) => i.isEmriId === h.isEmriId) ?? null;
  const muafTutulur = v.maddeler.find((m) => m.madde === h.madde)?.muafTutulur ?? false;
  const kayitlar = v.muafiyetler.filter((x) => x.madde === h.madde && (x.isEmriId === null || x.isEmriId === h.isEmriId));
  return (
    <div className="tc-hz-ayrinti">
      <b>{md.ad}{satir ? ` · OP ${satir.opNo} ${satir.ad}` : ' · emir geneli'}</b>
      <span>{HAL[hal].aciklama} <span className="tc-emir-not">Sahibi: {md.sahip}</span></span>
      {kayitlar.map((x) => (
        <span key={`${x.madde}-${x.isEmriId ?? 'emir'}`} className="tc-emir-not">
          <Simge ad="lock" /> {x.kisiAdi ?? 'Bilinmeyen kişi'} · {zamanMetni(x.zaman) ?? ''} · {x.isEmriId === null ? 'bütün iş emirleri' : 'bu iş emri'} · Gerekçe: {x.gerekce}
        </span>
      ))}
      {hal === 'eksik' && (
        <span className="tc-hz-eylem">
          {md.git && islemler.includes(md.git.islem) && <Dugme simge="next" onClick={() => git(md.git!.yol)}>{md.git.ad}</Dugme>}
          {muafTutulur && muafVerir && <Dugme simge="lock" onClick={muafAc}>Gerekçeyle muaf tut</Dugme>}
          {!muafTutulur && <span className="tc-emir-not">Bu madde muaf tutulamaz.</span>}
        </span>
      )}
    </div>
  );
}

function MuafPenceresi({ emirId, v, h, kapat }: { emirId: number; v: HazirlikCevabi; h: Hucre; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const satir = h.isEmriId === null ? null : v.isEmirleri.find((i) => i.isEmriId === h.isEmriId) ?? null;
  const [kapsam, kapsamYaz] = useState(satir ? String(satir.isEmriId) : '');
  const [gerekce, gerekceYaz] = useState('');
  const gecerli = gerekce.trim() !== '' && gerekce.length <= 500;
  const yaz = useMutation({
    mutationFn: () => {
      const govde: HazirlikMuafiyetiGovdesi = { madde: h.madde as HazirlikMuafiyetiGovdesi['madde'], isEmriId: kapsam === '' ? null : Number(kapsam), gerekce: gerekce.trim() };
      return api.post<HazirlikCevabi>(`/adimli-emirler/${emirId}/hazirlik-muafiyeti`, govde);
    },
    onSuccess: async (cevap) => {
      istemci.setQueryData(anahtarlar.hazirlik(emirId), cevap);
      bildir('tamam', `${MADDE[h.madde].ad} muaf tutuldu.`);
      kapat();
      await istemci.invalidateQueries({ queryKey: anahtarlar.hazirlik(emirId) });
    },
    onError: (x) => { bildir('hata', hataIletisi(x, 'Muafiyet verilmedi.')); },
  });
  return (
    <Pencere acik kapat={kapat} baslik={`${MADDE[h.madde].ad}: gerekçeyle muaf tut`} alt={(
      <>
        <Dugme onClick={kapat}>Vazgeç</Dugme>
        <Dugme tur="birincil" simge="lock" disabled={!gecerli} yukleniyor={yaz.isPending} onClick={() => yaz.mutate()}>Muaf tut</Dugme>
      </>
    )}>
      <div className="tc-emir-form">
        <Secim etiket="İş emri" value={kapsam} onChange={(o) => kapsamYaz(o.target.value)}
          secenekler={[...(satir ? [{ deger: String(satir.isEmriId), baslik: `OP ${satir.opNo} · ${satir.ad}` }] : []), { deger: '', baslik: 'Bütün iş emirleri' }]} />
        <CokSatir etiket="Gerekçe" required rows={2} maxLength={500} value={gerekce} onChange={(o) => gerekceYaz(o.target.value)}
          ipucu="Neden muaf tutuluyor? En çok 500 karakter." />
        <p className="tc-emir-not">Muafiyet silinmez; kişi, zaman ve gerekçe kaydedilir.</p>
      </div>
    </Pencere>
  );
}
