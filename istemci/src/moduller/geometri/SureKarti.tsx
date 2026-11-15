import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import type { GeometriHamCevabi, GeometriIsoGrubu, GeometriSureCevabi, HamStokOnerisi } from '#paylasilan/sozlesme/geometri.ts';
import { DurumKutusu, Dugme, Kart, Rozet, Simge } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { anahtarlar } from './anahtarlar.ts';
import { calismaYolu } from './calismalar.ts';
import { aralikMetni, cubukYeri, dakika, FORM_ADI, hacimCm3, ISO_ADI, ISO_GRUPLARI, kutuMetni, olcekUstu, stokOlcuMetni, uzunluk } from './gorunum.ts';

type GeometriSureKalemi = GeometriSureCevabi['kalemler'][number];

const NEDEN: Readonly<Record<NonNullable<GeometriSureCevabi['neden']>, string>> = {
  'analiz-yok': 'Analiz yok; süre modelin analizi bitince hesaplanır.',
  'hacim-yok': 'Model kapalı değil, parça hacmi okunamadı; talaş ve süre hesaplanamaz.',
  'talas-yok': 'Parça hamdan küçük değil; talaş yok, süre hesaplanmaz.',
};
const KALEM_SIMGESI: Readonly<Record<GeometriSureKalemi['kalem'], SimgeAdi>> = { kaba: 'tool', finis: 'ruler', delik: 'target' };

function Cubuk({ alt, ust, olcek, orta }: { alt: number; ust: number; olcek: number; orta?: number | null }) {
  const y = cubukYeri(alt, ust, olcek);
  const o = orta == null ? null : cubukYeri(orta, orta, olcek).x;
  return (
    <svg className="tc-g3b-su-cubuk" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
      <rect width="100" height="6" className="tc-g3b-su-zemin" />
      <rect x={y.x} width={y.en} height="6" className="tc-g3b-su-aralik" />
      {o !== null && <rect x={Math.max(0, o - 0.5)} width="1" height="6" className="tc-g3b-su-orta" />}
    </svg>
  );
}

function kalemAdi(k: GeometriSureKalemi, v: GeometriSureCevabi, alanMm2: number | null): string {
  if (k.kalem === 'kaba') return v.talasMm3 === null ? 'Kaba' : `Kaba (talaş ${hacimCm3(v.talasMm3)})`;
  if (k.kalem === 'finis') return alanMm2 === null ? 'Finiş' : `Finiş (yüzey ${uzunluk(alanMm2 / 100)} cm²)`;
  return `Delik (${String(k.adet ?? 0)} adet)`;
}

function RotaBolumu({ rota }: { rota: GeometriSureCevabi['rota'] }) {
  if (rota.durum === 'rota-bagli-degil') return null;
  const olculu = rota.adimlar.filter((a) => a.olcumOrtancaDk !== null).length;
  return (
    <section className="tc-g3b-su-rota" aria-label="Rotadaki talaşlı adımlar">
      <p className="tc-g3b-su-etiket"><Simge ad="route" /> Rotadaki talaşlı adımlar (yalnız okuma)</p>
      {rota.durum === 'rota-yok' ? <p className="tc-g3b-soluk">Yürürlükte rota yok.</p>
        : rota.adimlar.length === 0 ? <p className="tc-g3b-soluk">Yürürlükteki rotada talaşlı istasyona bağlı adım yok.</p>
          : (
            <table className="tc-g3b-su-tablo">
              <thead><tr><th scope="col">Adım</th><th scope="col">Rota (birim)</th><th scope="col">Son 5 ölçüm (ortanca)</th></tr></thead>
              <tbody>
                {rota.adimlar.map((a) => (
                  <tr key={a.opNo}>
                    <td>OP{String(a.opNo)} {a.ad}</td>
                    <td>{a.islemDk === null ? 'süre yok' : dakika(a.islemDk)}</td>
                    <td>{a.olcumOrtancaDk === null ? 'ölçüm yok' : `${dakika(a.olcumOrtancaDk)} (${String(a.olcumAdedi)})`}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Toplam</th>
                  <td>{rota.islemToplamDk === null ? '-' : dakika(rota.islemToplamDk)}</td>
                  <td>{rota.olcumToplamDk === null ? 'ölçüm yok'
                    : olculu < rota.adimlar.length ? `${dakika(rota.olcumToplamDk)} · eksik (${String(olculu)} / ${String(rota.adimlar.length)})` : dakika(rota.olcumToplamDk)}</td>
                </tr>
              </tfoot>
            </table>
          )}
      {rota.eksik && <p className="tc-g3b-soluk">İşlem süresi girilmemiş adım toplama katılmadı.</p>}
      {olculu > 0 && olculu < rota.adimlar.length && (
        <p className="tc-g3b-soluk">Ölçüm toplamı yalnız ölçülen adımlarındır; rota toplamıyla karşılaştırılmaz.</p>
      )}
      <p className="tc-g3b-soluk">Tahmin rotaya yazılmaz. Fark, kalibrasyonun ilk verisidir.</p>
    </section>
  );
}

// Talaştan kaba süre (3278 D): sunucunun kalibresiz aralığı, kalemleri ve rotadaki talaşlı adımlar. ISO grubu kaydedilmez; ham, Ham önerisi
// kartının varsayılan payıyla aynı ilk stok önerisidir ve önizlemede çizilir.
export function SureKarti({ revizyonId, alanMm2, onizlemeYaz }: {
  revizyonId: number; alanMm2: number | null; onizlemeYaz: (o: HamStokOnerisi | null) => void;
}) {
  const { search } = useLocation();
  const [iso, isoYaz] = useState<GeometriIsoGrubu>('P');
  const sorgu = useQuery({
    queryKey: anahtarlar.sure(revizyonId, iso),
    queryFn: () => api.get<GeometriSureCevabi>(`/geometri/sure-tahmini/${String(revizyonId)}?iso=${iso}`),
    placeholderData: keepPreviousData,
  });
  // Ham önerisi kartıyla aynı sorgu (pay ve kalite boş): önizlenen ham ve ölçüsü buradandır.
  const ham = useQuery({
    queryKey: anahtarlar.ham(revizyonId, -1, ''),
    queryFn: () => api.get<GeometriHamCevabi>(`/geometri/ham-onerisi/${String(revizyonId)}`),
    enabled: sorgu.data?.hamKaynagi != null,
  });
  const ilk = ham.data?.neden === null ? (ham.data.oneriler[0] ?? null) : null;
  const stok = sorgu.data?.hamKaynagi === 'stok' && ilk !== null && ilk.kod === sorgu.data.hamKodu ? ilk : null;
  useEffect(() => { onizlemeYaz(stok); }, [stok, onizlemeYaz]);
  useEffect(() => () => onizlemeYaz(null), [onizlemeYaz]);
  const v = sorgu.data;
  const olcek = v?.ustDk == null ? 50 : olcekUstu(v.ustDk);
  const olcekMetni = (x: number): string => uzunluk(x);
  return (
    <Kart baslik="Kaba süre (öneri)" simge="clock" sag={<Rozet ton="uyari">Kalibresiz</Rozet>}>
      <p className="tc-g3b-su-etiket">Malzeme grubu (ISO) · seçim kaydedilmez, sayfa açılınca Çelik</p>
      <div className="tc-g3b-su-iso" role="group" aria-label="Malzeme grubu (ISO)">
        {ISO_GRUPLARI.map((g) => (
          <Dugme key={g} aria-pressed={iso === g} onClick={() => isoYaz(g)}>{g} · {ISO_ADI[g]}</Dugme>
        ))}
      </div>
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Süre tahmini okunamadı.')} />
          : v === undefined ? null : (
            <>
              {v.neden !== null || v.altDk === null || v.ustDk === null ? <p className="tc-g3b-soluk">{NEDEN[v.neden ?? 'analiz-yok']}</p> : (
                <>
                  <p className="tc-g3b-su-toplam">
                    <strong>{aralikMetni(v.altDk, v.ustDk, true)}</strong>
                    {v.ortaDk !== null && <span className="tc-g3b-soluk">olası ≈ {dakika(v.ortaDk)} / parça</span>}
                  </p>
                  <Cubuk alt={v.altDk} ust={v.ustDk} olcek={olcek} orta={v.ortaDk} />
                  <p className="tc-g3b-su-olcek" aria-hidden="true"><span>0</span><span>{olcekMetni(olcek / 2)} dk</span><span>{olcekMetni(olcek)} dk</span></p>
                  <p className="tc-g3b-soluk">Olası değer alt ve üst sınırın geometrik ortasıdır (süre hataları oransaldır). Kalem çubukları aynı 0-{olcekMetni(olcek)} dk ölçeğindedir.</p>
                  <ul className="tc-g3b-su-kalemler" aria-label="Süre kalemleri">
                    {v.kalemler.map((k) => (
                      <li key={k.kalem}>
                        <Simge ad={KALEM_SIMGESI[k.kalem]} />
                        <span>{kalemAdi(k, v, alanMm2)}</span>
                        <span className="tc-g3b-su-deger">{aralikMetni(k.altDk, k.ustDk, false)}</span>
                        <Cubuk alt={k.altDk} ust={k.ustDk} olcek={olcek} />
                      </li>
                    ))}
                  </ul>
                  {!v.ozellikOkundu && <p className="tc-g3b-soluk">Özellikler henüz okunmadı; delik süresi yok.</p>}
                </>
              )}
              {v.hamHacimMm3 !== null && (
                <dl className="tc-g3b-degerler">
                  <div>
                    <dt>Ham</dt>
                    <dd>
                      <Link className="tc-g3b-bag" to={`${calismaYolu('ham')}${search}`}>
                        {stok !== null
                          ? `${stok.kod} · ${FORM_ADI[stok.form]} ${stokOlcuMetni(stok)}${stok.kesimBoyuMm === null ? '' : `, kesim ${uzunluk(stok.kesimBoyuMm)} mm`}`
                          : v.hamKaynagi === 'stok' ? (v.hamKodu ?? 'Stok önerisi')
                            : `En az ham (kutu + pay)${ham.data?.enAz ? `: ${kutuMetni(ham.data.enAz.a, ham.data.enAz.b, ham.data.enAz.c)}` : ''}`}
                      </Link>
                    </dd>
                  </div>
                  <div><dt>Ham hacmi</dt><dd>{hacimCm3(v.hamHacimMm3)}</dd></div>
                  {v.parcaHacimMm3 !== null && <div><dt>Parça hacmi</dt><dd>{hacimCm3(v.parcaHacimMm3)} (yaklaşık)</dd></div>}
                  {v.talasMm3 !== null && (
                    <div><dt>Talaş</dt><dd><strong>{hacimCm3(v.talasMm3)}</strong> · %{String(Math.round((v.talasMm3 / v.hamHacimMm3) * 100))}</dd></div>
                  )}
                </dl>
              )}
              <RotaBolumu rota={v.rota} />
            </>
          )}
      <p className="tc-g3b-su-uyari"><Simge ad="alert" /><span>Kalibresiz kaba tahmin: tezgâh gücü 7,5 kW varsayıldı; bağlama, hazırlık ve el süresi yok. Rotaya ve plana yazılmaz.</span></p>
    </Kart>
  );
}
