import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SatinAlmaAnaliziCevabi, SatinAlmaSiparisDokumu } from '#paylasilan/sozlesme/satin-alma-analiz.ts';
import { DurumKutusu, Dugme, Kart, SayfaBasligi, Secim, useBildirim } from '../../../ortak/arayuz/index.ts';
import { api } from '../../../ortak/veri/api.ts';
import { SATIN_ALMA_ANALIZI_YOLU } from '../analiz/SatinAlmaAnalizi.tsx';
import { indir, raporExceli } from './excel.ts';
import {
  RAPORLAR, aylikRapor, ayAdi, donemMetni, fiyatRaporu, hucreMetni, raporAylari, raporMu, siparisRaporu, tedarikciRaporu, varsayilanAy,
  type Rapor, type RaporAnahtari,
} from './sablonlar.ts';
import './raporlar.css';

// 2477 (2467 a): Satın Alma > Raporlar, Analiz'in dışa aktarımı. Hazır dört şablon; Excel depodaki exceljs ile, PDF tarayıcının yazdır
// penceresinden. Ayrı hesap yoktur: veri Analiz ucundan ve sipariş satırı dökümünden okunur. Açık rapor ve ay adreste durur.
export const SIPARIS_DOKUMU_YOLU = '/satin-alma-analiz/siparis-satirlari';

export function Raporlar() {
  const q = useQuery({ queryKey: ['satin-alma', 'analiz'], queryFn: () => api.get<SatinAlmaAnaliziCevabi>(SATIN_ALMA_ANALIZI_YOLU) });
  const [adres, adresYaz] = useSearchParams();
  const ham = adres.get('rapor');
  const acik = raporMu(ham) ? ham : null;
  const dokumGerek = acik === 'siparis';
  const dokum = useQuery({
    queryKey: ['satin-alma', 'analiz', 'siparis-satirlari'], queryFn: () => api.get<SatinAlmaSiparisDokumu>(SIPARIS_DOKUMU_YOLU), enabled: dokumGerek,
  });
  const yenile = () => { void q.refetch(); if (dokumGerek) void dokum.refetch(); };
  const ayar = (p: Record<string, string | null>) => {
    adresYaz((o) => {
      const y = new URLSearchParams(o);
      for (const [k, v] of Object.entries(p)) { if (v === null) y.delete(k); else y.set(k, v); }
      return y;
    });
  };
  return (
    <div>
      <SayfaBasligi baslik="Raporlar" simge="file"
        alt={q.data ? `Analiz verisinden hazır raporlar; ayrı hesap yapılmaz. Dönem: son 12 ay (${donemMetni(q.data)}), kıyas önceki 12 ay.` : 'Analiz verisinden hazır raporlar; ayrı hesap yapılmaz.'}
        birincil={{ etiket: 'Yenile', simge: 'rotate', yap: yenile, yukleniyor: q.isFetching }} />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" yenile={yenile} />
          : acik === null ? <Liste c={q.data} ac={(r, yazdir) => { ayar({ rapor: r, yazdir: yazdir ? '1' : null }); }} ay={adres.get('ay')} ayYaz={(a) => { ayar({ ay: a }); }} />
            : <Onizleme c={q.data} anahtar={acik} ay={adres.get('ay')} dokum={dokum} yazdir={adres.get('yazdir') === '1'}
              kapat={() => { ayar({ rapor: null, yazdir: null }); }} yazdirildi={() => { ayar({ yazdir: null }); }} />}
    </div>
  );
}

function raporKur(c: SatinAlmaAnaliziCevabi, a: RaporAnahtari, ay: string | null, dokum: SatinAlmaSiparisDokumu | undefined): Rapor | null {
  if (a === 'aylik') { const secili = ay ?? varsayilanAy(c); return secili === null ? null : aylikRapor(c, secili); }
  if (a === 'tedarikci') return tedarikciRaporu(c);
  if (a === 'fiyat') return fiyatRaporu(c);
  return dokum === undefined ? null : siparisRaporu(dokum);
}

function useExcel() {
  const { bildir } = useBildirim();
  const [bekliyor, bekliyorYaz] = useState(false);
  const yap = async (r: () => Promise<Rapor | null>) => {
    bekliyorYaz(true);
    try {
      const rapor = await r();
      if (rapor === null) { bildir('bilgi', 'Raporun verisi yok.'); return; }
      indir(rapor.dosyaAdi, await raporExceli(rapor));
    } catch {
      bildir('hata', 'Excel dosyası hazırlanamadı.');
    } finally {
      bekliyorYaz(false);
    }
  };
  return { bekliyor, yap: (r: () => Promise<Rapor | null>) => { void yap(r); } };
}

function Liste({ c, ac, ay, ayYaz }: { c: SatinAlmaAnaliziCevabi; ac: (r: RaporAnahtari, yazdir: boolean) => void; ay: string | null; ayYaz: (a: string) => void }) {
  const excel = useExcel();
  const aylar = raporAylari(c);
  const secili = ay !== null && aylar.includes(ay) ? ay : varsayilanAy(c);
  const kur = (a: RaporAnahtari) => async (): Promise<Rapor | null> => (a === 'siparis'
    ? siparisRaporu(await api.get<SatinAlmaSiparisDokumu>(SIPARIS_DOKUMU_YOLU))
    : raporKur(c, a, secili, undefined));
  return (
    <div className="sa-rapor-izgara">
      {RAPORLAR.map((r) => (
        <Kart key={r.anahtar} baslik={r.baslik} simge={r.anahtar === 'siparis' ? 'list' : r.anahtar === 'fiyat' ? 'lira' : r.anahtar === 'tedarikci' ? 'truck' : 'calendar'}>
          <p className="sa-rapor-aciklama">{r.aciklama}</p>
          {r.anahtar === 'aylik' && (aylar.length === 0
            ? <p className="sa-rapor-dipnot">Son 12 ayda sipariş yok.</p>
            : <Secim etiket="Rapor ayı" value={secili ?? ''} onChange={(e) => { ayYaz(e.target.value); }}
              secenekler={aylar.map((a) => ({ deger: a, baslik: a === c.donem.bit.slice(0, 7) ? `${ayAdi(a)} (sürüyor)` : ayAdi(a) }))} />)}
          <p className="sa-rapor-dipnot">{r.dipnot}</p>
          <div className="sa-rapor-dugmeler">
            <Dugme simge="eye" onClick={() => { ac(r.anahtar, false); }} disabled={r.anahtar === 'aylik' && secili === null}>Önizle</Dugme>
            <Dugme simge="download" yukleniyor={excel.bekliyor} onClick={() => { excel.yap(kur(r.anahtar)); }}
              disabled={r.anahtar === 'aylik' && secili === null}>Excel indir</Dugme>
            <Dugme simge="printer" onClick={() => { ac(r.anahtar, true); }} disabled={r.anahtar === 'aylik' && secili === null}>PDF (yazdır)</Dugme>
          </div>
        </Kart>
      ))}
    </div>
  );
}

function Onizleme({ c, anahtar, ay, dokum, yazdir, kapat, yazdirildi }: {
  c: SatinAlmaAnaliziCevabi; anahtar: RaporAnahtari; ay: string | null; dokum: { data?: SatinAlmaSiparisDokumu; isError: boolean; isPending: boolean; refetch: () => unknown };
  yazdir: boolean; kapat: () => void; yazdirildi: () => void;
}) {
  const excel = useExcel();
  const rapor = raporKur(c, anahtar, ay !== null && raporAylari(c).includes(ay) ? ay : null, dokum.data);
  const hazir = rapor !== null;
  // Listeden "PDF (yazdır)" ile gelindiyse sayfa çizildikten sonra yazdır penceresi bir kez açılır.
  useEffect(() => {
    if (!yazdir || !hazir) return;
    yazdirildi();
    window.print();
  }, [yazdir, hazir, yazdirildi]);
  const bekliyor = anahtar === 'siparis' && dokum.isPending;
  return (
    <>
      <div className="sa-rapor-araclar">
        <Dugme simge="chev-left" onClick={kapat}>Raporlar</Dugme>
        <span className="sa-rapor-bosluk" />
        <Dugme simge="download" yukleniyor={excel.bekliyor} disabled={!hazir} onClick={() => { excel.yap(() => Promise.resolve(rapor)); }}>Excel indir</Dugme>
        <Dugme tur="birincil" simge="printer" disabled={!hazir} onClick={() => { window.print(); }}>PDF (yazdır)</Dugme>
      </div>
      {bekliyor ? <DurumKutusu durum="yukleniyor" />
        : anahtar === 'siparis' && dokum.isError ? <DurumKutusu durum="hata" yenile={() => { void dokum.refetch(); }} />
          : rapor === null ? <DurumKutusu durum="bos" />
            : <RaporSayfasi rapor={rapor} />}
    </>
  );
}

export function RaporSayfasi({ rapor }: { rapor: Rapor }) {
  return (
    <article className="sa-rapor-sayfa" aria-label={rapor.baslik}>
      <h2 className="sa-rapor-baslik">{rapor.baslik}</h2>
      <p className="sa-rapor-alt">{`${rapor.altBaslik} · CORE MES`}</p>
      {rapor.bolumler.map((b) => (
        <section key={b.baslik} className="sa-rapor-bolum">
          {rapor.bolumler.length > 1 && <h3>{b.baslik}</h3>}
          <div className="sa-rapor-kaydir">
            <table className="sa-rapor-tablo">
              <thead><tr>{b.sutunlar.map((s) => <th key={s.ad} data-sayi={s.tur !== 'metin' && s.tur !== 'tarih' ? '' : undefined}>{s.ad}</th>)}</tr></thead>
              <tbody>
                {b.satirlar.length === 0
                  ? <tr><td colSpan={b.sutunlar.length}>Kayıt yok.</td></tr>
                  : b.satirlar.map((satir, i) => (
                    <tr key={i}>{b.sutunlar.map((s, j) => <td key={s.ad} data-sayi={s.tur !== 'metin' && s.tur !== 'tarih' ? '' : undefined}>{hucreMetni(satir[j] ?? null, s.tur)}</td>)}</tr>
                  ))}
              </tbody>
            </table>
          </div>
          {b.not && <p className="sa-rapor-not">{b.not}</p>}
        </section>
      ))}
    </article>
  );
}
