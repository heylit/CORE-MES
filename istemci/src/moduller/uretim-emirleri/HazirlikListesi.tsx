import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { HazirlikCevabi, HazirlikMaddesi, HazirlikMuafiyetiGovdesi, UYARAN_HAZIRLIK_MADDELERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
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
// Muafiyet yalnız müdürde (uretim-emirleri.hazirlik-muaf, 264 a) ve yalnız muaf tutulabilen maddede açılır (121 a). Uyaran maddenin
// (2146-1 a) eksiği "Uyarı" görünür ve satırı durdurmaz.
type Gorunum = { ton: RozetTonu; simge: SimgeAdi; ad: string; aciklama: string };
const HAL: Record<Hal, Gorunum> = {
  tamam: { ton: 'tamam', simge: 'check', ad: 'Tamam', aciklama: 'Tamam.' },
  eksik: { ton: 'hata', simge: 'x', ad: 'Eksik', aciklama: 'Eksik: tamamlanmadan iş emri başlamaz.' },
  muaf: { ton: 'uyari', simge: 'lock', ad: 'Muaf', aciklama: 'Müdür gerekçeyle muaf tuttu; iş başlar.' },
  gerekmez: { ton: 'pasif', simge: 'minus', ad: 'Gerekmez', aciklama: 'Bu emirde gerekmiyor.' },
  bilinmiyor: { ton: 'pasif', simge: 'help', ad: 'Bilinmiyor', aciklama: 'Sistem bu maddeyi henüz denetlemiyor; başlatmayı durdurmaz.' },
};
const UYARI: Gorunum = { ton: 'uyari', simge: 'alert', ad: 'Uyarı', aciklama: 'Eksik, ama başlatmayı durdurmaz: iş uyarıyla başlar.' };
export const hazirlikUyarirMi = (m: HazirlikMaddesi): boolean => MADDE[m].uyarir;
export const halGorunumu = (madde: HazirlikMaddesi, hal: Hal): Gorunum => (hal === 'eksik' && hazirlikUyarirMi(madde) ? UYARI : HAL[hal]);
const LEJANT: readonly Gorunum[] = [HAL.tamam, HAL.eksik, UYARI, HAL.muaf, HAL.gerekmez, HAL.bilinmiyor];

// Sözleşmedeki değer zod taşıdığından istemciye yalnız tipi girer; `uyarir` bayrağı tip düzeyinde uyaran madde listesine bağlıdır.
type Uyaran = (typeof UYARAN_HAZIRLIK_MADDELERI)[number];
interface MaddeBilgisi<K extends HazirlikMaddesi = HazirlikMaddesi> {
  ad: string; kisa: string; sahip: string; git: { yol: string; islem: string; ad: string } | null; uyarir: K extends Uyaran ? true : false;
}
export const MADDE: { [K in HazirlikMaddesi]: MaddeBilgisi<K> } = {
  cnc: { ad: 'CNC kurulumu', kisa: 'CNC', sahip: 'CNC Kurulum', git: { yol: '/cnc-kurulum', islem: 'sayfa.cnc-kurulum', ad: "CNC Kurulum'da aç" }, uyarir: false },
  cizim: { ad: 'Çizim revizyonu', kisa: 'Çizim', sahip: 'Kalite Merkezi', git: { yol: '/kalite-merkezi', islem: 'sayfa.kalite-merkezi', ad: 'Çizimi aç' }, uyarir: false },
  rota: { ad: 'Rota yürürlükte', kisa: 'Rota', sahip: 'Reçete ve Rota', git: { yol: '/recete-rota', islem: 'sayfa.recete-rota', ad: "Reçete ve Rota'da aç" }, uyarir: true },
  malzeme: { ad: 'Malzeme (girdi stoğu)', kisa: 'Malzeme', sahip: 'Stok Merkezi', git: { yol: '/stok', islem: 'sayfa.stok', ad: "Stok Merkezi'nde aç" }, uyarir: true },
  'takim-omru': { ad: 'Takım ömrü', kisa: 'Takım', sahip: 'CNC Kurulum', git: { yol: '/cnc-kurulum', islem: 'sayfa.cnc-kurulum', ad: "CNC Kurulum'da aç" }, uyarir: true },
  makine: { ad: 'Makine durumu', kisa: 'Makine', sahip: 'İstasyonlar', git: { yol: '/istasyonlar', islem: 'sayfa.istasyonlar', ad: "İstasyonlar'da aç" }, uyarir: true },
  yayin: { ad: 'Paket yayını', kisa: 'Yayın', sahip: 'Üretim Hazırlık', git: { yol: '/arkon/hazirlik', islem: 'sayfa.arkon', ad: "Üretim Hazırlık'ta aç" }, uyarir: false },
  // 2227-1: ön hazırlık ve hazırlık adımları terminalde işaretlenir; matris yalnız uyarır.
  talimat: { ad: 'Hazırlık talimatı', kisa: 'Talimat', sahip: 'Terminal', git: null, uyarir: true },
  // 2227-1 b: iş emrine özel madde Üretim Hazırlık'ta eklenir ve işaretlenir.
  'ek-madde': { ad: 'Ek hazırlık maddesi', kisa: 'Ek madde', sahip: 'Üretim Hazırlık', git: { yol: '/arkon/hazirlik', islem: 'sayfa.arkon', ad: "Üretim Hazırlık'ta aç" }, uyarir: true },
  // 2893-4 a: liste rota adımında tanımlanır; aparat stokta, ölçü aleti türünde kalibrasyonu geçerli alet aranır.
  aparat: { ad: 'Aparat', kisa: 'Aparat', sahip: 'Stok Merkezi', git: { yol: '/stok', islem: 'sayfa.stok', ad: "Stok Merkezi'nde aç" }, uyarir: true },
  'olcu-aleti': { ad: 'Ölçü aleti (kalibrasyon)', kisa: 'Ölçü', sahip: 'Ölçü Aletleri', git: { yol: '/kalibrasyon', islem: 'sayfa.kalibrasyon', ad: "Ölçü Aletleri'nde aç" }, uyarir: true },
};

// Hücre kimliği: emir geneli madde yalnız madde, iş emri düzeyindeki madde madde ve iş emri.
interface Hucre { madde: HazirlikMaddesi; isEmriId: number | null }
const ayni = (a: Hucre | null, b: Hucre) => a !== null && a.madde === b.madde && a.isEmriId === b.isEmriId;

export function hucreHali(v: HazirlikCevabi, h: Hucre): Hal {
  if (h.isEmriId === null) return v.maddeler.find((m) => m.madde === h.madde)?.durum ?? 'bilinmiyor';
  return v.isEmirleri.find((i) => i.isEmriId === h.isEmriId)?.maddeler.find((m) => m.madde === h.madde)?.durum ?? 'bilinmiyor';
}

// Satır başlar mı: durduran maddenin iş emri düzeyindeki hücresi ya da emir geneli hâli eksikse durur; uyaran madde durdurmaz.
export function satirDurur(v: HazirlikCevabi, satir: IsEmriSatiri): boolean {
  return v.maddeler.some((m) => !hazirlikUyarirMi(m.madde) && (m.isEmriDuzeyi ? hucreHali(v, { madde: m.madde, isEmriId: satir.isEmriId }) : m.durum) === 'eksik');
}
// Uyaran maddelerden eksik olan hücre sayısı (açık iş emirleri ve emir geneli).
export function uyariSayisi(v: HazirlikCevabi): number {
  const acik = v.isEmirleri.filter((i) => !i.bitti);
  return v.maddeler.filter((m) => hazirlikUyarirMi(m.madde)).reduce((t, m) => t + (m.isEmriDuzeyi
    ? acik.filter((i) => hucreHali(v, { madde: m.madde, isEmriId: i.isEmriId }) === 'eksik').length
    : m.durum === 'eksik' ? 1 : 0), 0);
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
  const uyari = v ? uyariSayisi(v) : 0;
  const sec = (h: Hucre) => seciliYaz((o) => (ayni(o, h) ? null : h));

  const hucre = (h: Hucre, satir: IsEmriSatiri | null) => {
    const hal = halGorunumu(h.madde, v ? hucreHali(v, h) : 'bilinmiyor');
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
          : uyari > 0 ? <Rozet ton="uyari">{`Hazır, ${uyari} uyarı`}</Rozet>
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
            {LEJANT.map((h) => <li key={h.ad} data-ton={h.ton}><Simge ad={h.simge} /><span>{h.ad}</span></li>)}
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
      <span>{halGorunumu(h.madde, hal).aciklama} <span className="tc-emir-not">Sahibi: {md.sahip}</span></span>
      {kayitlar.map((x) => (
        <span key={`${x.madde}-${x.isEmriId ?? 'emir'}`} className="tc-emir-not">
          <Simge ad="lock" /> {x.kisiAdi ?? 'Bilinmeyen kişi'} · {zamanMetni(x.zaman) ?? ''} · {x.isEmriId === null ? 'bütün iş emirleri' : 'bu iş emri'} · Gerekçe: {x.gerekce}
        </span>
      ))}
      {hal === 'eksik' && (
        <span className="tc-hz-eylem">
          {md.git && islemler.includes(md.git.islem) && <Dugme simge="next" onClick={() => git(md.git!.yol)}>{md.git.ad}</Dugme>}
          {muafTutulur && muafVerir && <Dugme simge="lock" onClick={muafAc}>Gerekçeyle muaf tut</Dugme>}
          {!muafTutulur && !hazirlikUyarirMi(h.madde) && <span className="tc-emir-not">Bu madde muaf tutulamaz.</span>}
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
