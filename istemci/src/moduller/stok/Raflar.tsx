import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { Raf, RafAcGovdesi, RaflarCevabi, RafTuru } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, DurumKutusu, Girdi, Kart, Pencere, Secim } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { NUMARA, NUMARALAMALAR, RAF_TURLERI, RAF_TURU, miktarGirdisi } from './gorunum.ts';
import { SayfaBasi, hataMetni, useIslem, useStokKomutu } from './ortak.tsx';
import { HaritaLinki } from './HaritaBagi.tsx';
import { RafMatrisiGovdesi } from './RafMatrisi.tsx';
import './stok.css';

const VARSAYILAN: Record<RafTuru, [string, string, string]> = { palet: ['2,7', '1,1', '1,5'], celik: ['1', '0,5', '0,45'], konsol: ['1,5', '1', '0,6'], zemin: ['1,3', '1,3', '1,6'] };

// Raf açma ve düzenleme aynı formdur; düzenlemede sürüm gider, daralan rafın stoklu gözü kapatılamaz (DEP-13).
export function RafFormu({ raf, kapat }: { raf?: Raf; kapat: () => void }) {
  const [tur, setTur] = useState<(typeof RAF_TURLERI)[number]>(raf?.tur ?? 'palet');
  const [kod, setKod] = useState(raf?.kod ?? '');
  const [numaralama, setNumaralama] = useState<(typeof NUMARALAMALAR)[number]>(raf?.numaralama ?? 'sirali');
  const [bolme, setBolme] = useState(String(raf?.bolmeSayisi ?? 7));
  const [kat, setKat] = useState(String(raf?.katSayisi ?? 4));
  const v = VARSAYILAN[tur];
  const [olcu, setOlcu] = useState<[string, string, string]>(raf ? [raf.bolmeGenislikM, raf.derinlikM, raf.katAraligiM] : v);
  const govde = (): RafAcGovdesi => ({ kod, tur, numaralama, ilkBolme: raf?.ilkBolme ?? 1, bolmeSayisi: Number(bolme), katSayisi: tur === 'zemin' ? 1 : Number(kat), bolmeGenislikM: miktarGirdisi(olcu[0]), derinlikM: miktarGirdisi(olcu[1]), katAraligiM: miktarGirdisi(olcu[2]) });
  const { komut } = useStokKomutu((g: RafAcGovdesi) => (raf ? api.post(`/stok/raflar/${raf.id}/duzenle`, { ...g, surum: raf.surum }) : api.post('/stok/raflar', g)), raf ? 'Raf güncellendi.' : 'Raf açıldı.', kapat);
  return (
    <Pencere acik kapat={kapat} baslik={raf ? `Raf ${raf.kod}` : 'Raf aç'} tur="yan" alt={<Dugme tur="birincil" yukleniyor={komut.isPending} onClick={() => komut.mutate(govde())}>{raf ? 'Kaydet' : 'Aç'}</Dugme>}>
      <div className="tc-stok-form">
        <Secim etiket="Raf tipi" value={tur} onChange={(e) => { const t = e.target.value as typeof tur; setTur(t); if (!raf) setOlcu(VARSAYILAN[t]); }} secenekler={RAF_TURLERI.map((t) => ({ deger: t, baslik: RAF_TURU[t] }))} />
        <div className="tc-stok-iki">
          <Girdi etiket="Kod" value={kod} onChange={(e) => setKod(e.target.value.toUpperCase())} maxLength={3} required />
          <Secim etiket="Numaralama" value={numaralama} onChange={(e) => setNumaralama(e.target.value as typeof numaralama)} secenekler={NUMARALAMALAR.map((n) => ({ deger: n, baslik: NUMARA[n] }))} />
          <Girdi etiket="Bölme sayısı" inputMode="numeric" value={bolme} onChange={(e) => setBolme(e.target.value)} />
          {tur !== 'zemin' && <Girdi etiket="Kat sayısı" inputMode="numeric" value={kat} onChange={(e) => setKat(e.target.value)} />}
          <Girdi etiket="Bölme genişliği (m)" inputMode="decimal" value={olcu[0]} onChange={(e) => setOlcu([e.target.value, olcu[1], olcu[2]])} />
          <Girdi etiket="Derinlik (m)" inputMode="decimal" value={olcu[1]} onChange={(e) => setOlcu([olcu[0], e.target.value, olcu[2]])} />
          <Girdi etiket={tur === 'zemin' ? 'İstif yüksekliği (m)' : 'Kat aralığı (m)'} inputMode="decimal" value={olcu[2]} onChange={(e) => setOlcu([olcu[0], olcu[1], e.target.value])} />
        </div>
        <p className="tc-stok-not">Adresler Kod-Bölme-Kat biçimindedir (ör. {kod || 'A'}-01-01). Raf kodu değişirse gözlerin kimliği ve stoğu aynı kalır.</p>
      </div>
    </Pencere>
  );
}

// Önizlemedeki Raflar sayfası: solda raf listesi (doluluk çubuğuyla), sağda seçili rafın matrisi.
export function Raflar() {
  const { id } = useParams();
  const yonlendir = useNavigate();
  const tanimlar = useIslem('stok.tanim');
  const l = useQuery({ queryKey: anahtarlar.liste('raflar', { sayfaBoyu: 200 }), queryFn: () => api.get<RaflarCevabi>('/stok/raflar?sayfaBoyu=200') });
  const secili = id ? Number(id) : l.data?.satirlar[0]?.id;
  return (
    <section className="tc-stok">
      <SayfaBasi baslik="Raflar" alt="Her rafın gözlerini kat × bölme matrisi olarak gör." sag={tanimlar && <HaritaLinki metin="Raf aç (Fabrika Haritası)" />} />
      {l.isError && <DurumKutusu durum="hata" mesaj={hataMetni(l.error)} yenile={() => void l.refetch()} />}
      {l.isPending && <DurumKutusu durum="yukleniyor" />}
      {l.data && l.data.satirlar.length === 0 && <DurumKutusu durum="bos" mesaj="Henüz raf yok." />}
      {l.data && l.data.satirlar.length > 0 && (
        <div className="tc-stok-raf-duzen">
          <ul className="tc-stok-raf-liste" aria-label="Raflar">
            {l.data.satirlar.map((r) => {
              const oran = r.toplamGoz ? r.doluGoz / r.toplamGoz : 0;
              return (
                <li key={r.id}>
                  <button type="button" className="tc-stok-raf-oge" aria-current={r.id === secili ? 'true' : undefined} onClick={() => { void yonlendir(`/stok/raflar/${r.id}`); }}>
                    <span className={`tc-stok-raf-kod tc-stok-raf-${r.tur}`}>{r.kod}</span>
                    <span className="tc-stok-raf-bilgi">
                      <strong>{RAF_TURU[r.tur]} · {r.bolmeSayisi}×{r.katSayisi}</strong>
                      <span className="tc-stok-not">{NUMARA[r.numaralama]} · %{Math.round(oran * 100)} dolu</span>
                      <svg className="tc-stok-cubuk" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="6" rx="3" className="tc-stok-cubuk-zemin" /><rect width={oran * 100} height="6" rx="3" className="tc-stok-cubuk-dolu" /></svg>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Kart>{secili !== undefined && <RafMatrisiGovdesi id={secili} />}</Kart>
        </div>
      )}
    </section>
  );
}
