import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GeometriKalibrasyonCevabi } from '#paylasilan/sozlesme/geometri.ts';
import { DurumKutusu, Dugme, Kart, Rozet, SayfaBasligi, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { useKorumaliKomut } from '../../ortak/veri/korumali-komut.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KOK } from './calismalar.ts';
import { dakika } from './gorunum.ts';
import {
  ASAMA_ADI, asamaSatirlari, egriNoktalari, GRUP_TURU_ADI, grupAdi, logEksen, logYer, type EgriKipi, type EgriNoktasi, type EgriSecimi, type KalibrasyonParcasi,
} from './kalibrasyon.ts';

export const KALIBRASYON_YOLU = `${KOK}/kalibrasyon`;
const KALIBRASYON_ISLEMI = 'geometri.kalibrasyon';

export function useKalibrasyon() {
  return useQuery({ queryKey: anahtarlar.kalibrasyon(), queryFn: () => api.get<GeometriKalibrasyonCevabi>('/geometri/kalibrasyon') });
}

const yuzde = (x: number | null): string => (x === null ? '-' : `%${String(Math.round(x))}`);
const carpanMetni = (x: number): string => `×${x.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Süre kartının altındaki aşama tablosu (ön izleme 3): parça sayısı ve sonraki aşamaya kalan parça.
export function KalibrasyonDurumu() {
  const sorgu = useKalibrasyon();
  const islemler = useOturum().data?.islemler ?? [];
  const k = sorgu.data;
  return (
    <Kart baslik="Kalibrasyon durumu" simge="help">
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError || k === undefined ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Kalibrasyon durumu okunamadı.')} />
          : (
            <>
              <table className="tc-g3b-su-tablo">
                <thead><tr><th scope="col">Aşama</th><th scope="col">Koşul</th><th scope="col">Durum</th></tr></thead>
                <tbody>
                  {asamaSatirlari(k.asama, k.n, k.esikler).map((s) => (
                    <tr key={s.asama}>
                      <td>{ASAMA_ADI[s.asama]}</td>
                      <td>{s.kosul}</td>
                      <td>{s.durum === 'gecti' ? <Rozet ton="pasif">geçti</Rozet> : s.durum === 'simdi' ? <Rozet ton="tamam">şimdi</Rozet> : `${String(s.eksik)} parça daha`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="tc-g3b-soluk">
                Parça sayılır: modeli analiz edilmiş ve rotasındaki bütün talaşlı adımları ölçülmüş parça. Şimdi {String(k.n)} parça
                {k.olcumuEksik > 0 ? `; ölçümü eksik ${String(k.olcumuEksik)} parça` : ''}{k.disarida > 0 ? `; dışarıda bırakılan ${String(k.disarida)}` : ''}.
                {islemler.includes(KALIBRASYON_ISLEMI) && <> <Link className="tc-g3b-bag" to={KALIBRASYON_YOLU}>Süre kalibrasyonu</Link></>}
              </p>
            </>
          )}
    </Kart>
  );
}

const SVG_EN = 320, SVG_BOY = 260, SOL = 40, ALT = 32, UST = 12, SAG = 12;

function Egri({ noktalar, kip, aralik, secili, sec }: {
  noktalar: EgriNoktasi[]; kip: EgriKipi; aralik: GeometriKalibrasyonCevabi['aralik']; secili: number | null; sec: (malzemeNo: number) => void;
}) {
  const e = logEksen(noktalar.flatMap((n) => [n.x, n.y]));
  const gx = (v: number): number => SOL + logYer(v, e.alt, e.ust) * (SVG_EN - SOL - SAG);
  const gy = (v: number): number => SVG_BOY - ALT - logYer(v, e.alt, e.ust) * (SVG_BOY - ALT - UST);
  const bant = kip === 'sonra' && aralik !== null
    ? `${String(gx(e.alt))},${String(gy(e.alt * Math.exp(aralik.ustLn)))} ${String(gx(e.ust))},${String(gy(e.ust * Math.exp(aralik.ustLn)))} `
      + `${String(gx(e.ust))},${String(gy(e.ust * Math.exp(aralik.altLn)))} ${String(gx(e.alt))},${String(gy(e.alt * Math.exp(aralik.altLn)))}`
    : null;
  return (
    <svg className="tc-g3b-ka-egri" viewBox={`0 0 ${String(SVG_EN)} ${String(SVG_BOY)}`} role="group" aria-label="Tahmin ve gerçekleşen süre (log ölçek)">
      <defs><clipPath id="tc-g3b-ka-alan"><rect x={SOL} y={UST} width={SVG_EN - SOL - SAG} height={SVG_BOY - ALT - UST} /></clipPath></defs>
      {e.isaretler.map((t) => (
        <g key={t} className="tc-g3b-ka-izgara" aria-hidden="true">
          <line x1={gx(t)} x2={gx(t)} y1={UST} y2={SVG_BOY - ALT} />
          <line x1={SOL} x2={SVG_EN - SAG} y1={gy(t)} y2={gy(t)} />
          <text x={gx(t)} y={SVG_BOY - ALT + 14} textAnchor="middle">{String(t).replace('.', ',')}</text>
          <text x={SOL - 6} y={gy(t) + 4} textAnchor="end">{String(t).replace('.', ',')}</text>
        </g>
      ))}
      <text className="tc-g3b-ka-eksen" x={SVG_EN - SAG} y={SVG_BOY - 2} textAnchor="end">{kip === 'sonra' ? 'düzeltilmiş tahmin' : 'tahmin'} (dk, log)</text>
      <text className="tc-g3b-ka-eksen" x={SOL} y={UST - 2}>gerçekleşen (dk, log)</text>
      <g clipPath="url(#tc-g3b-ka-alan)">
        {bant !== null && <polygon className="tc-g3b-ka-bant" points={bant} />}
        <line className="tc-g3b-ka-esit" x1={gx(e.alt)} y1={gy(e.alt)} x2={gx(e.ust)} y2={gy(e.ust)} />
      </g>
      {noktalar.map((n) => {
        const x = gx(n.x), y = gy(n.y), p = n.parca;
        const etiket = `${p.kod}: tahmin ${dakika(n.x)}, gerçekleşen ${dakika(n.y)}${p.disarida ? ', dışarıda' : ''}`;
        return (
          <g key={p.malzemeNo} role="button" tabIndex={0} aria-label={etiket} aria-pressed={secili === p.malzemeNo}
            className={`tc-g3b-ka-nokta${p.disarida ? ' tc-g3b-ka-disarida' : ''}`}
            onClick={() => sec(p.malzemeNo)} onKeyDown={(o) => { if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec(p.malzemeNo); } }}>
            <title>{etiket}</title>
            {p.disarida ? <path d={`M${String(x - 4)} ${String(y - 4)}l8 8m0-8l-8 8`} /> : <circle cx={x} cy={y} r={4.5} />}
          </g>
        );
      })}
    </svg>
  );
}

function ParcaAyrintisi({ p, kip, yazar, bekliyor, cikar, geriAl }: {
  p: KalibrasyonParcasi; kip: EgriKipi; yazar: boolean; bekliyor: boolean; cikar: () => void; geriAl: () => void;
}) {
  const tahmin = kip === 'sonra' ? (p.kalibreDk ?? p.tahminDk) : p.tahminDk;
  return (
    <div className="tc-g3b-ka-ayrinti" aria-live="polite">
      <p><strong>{p.kod}</strong>{p.gruplar.tezgah !== null && ` · ${p.gruplar.tezgah}`}{p.disarida && <> <Rozet ton="pasif">dışarıda</Rozet></>}</p>
      <p className="tc-g3b-soluk">tahmin {dakika(tahmin)} · gerçekleşen {dakika(p.olcumDk)}{p.disaridaNedeni !== null ? ` · ${p.disaridaNedeni}` : ''}</p>
      {yazar && (p.disarida
        ? <Dugme tur="ikincil" simge="rotate" disabled={bekliyor} onClick={geriAl}>Geri al</Dugme>
        : <Dugme tur="ikincil" simge="x" disabled={bekliyor} onClick={cikar}>Dışarıda bırak</Dugme>)}
    </div>
  );
}

// Süre kalibrasyonu sayfası (3321-3, ön izleme 4B; S3 b): malzeme grubu, tezgâh ve işlem seçilerek tahmin-gerçekleşen eğrisi, düzeltme
// öncesi ve sonrası; çarpanlar tablosu. "Dışarıda bırak" geometri.kalibrasyon ister; sayfa da ikinci menüde yalnız o işlemle görünür.
export function KalibrasyonSayfasi() {
  const sorgu = useKalibrasyon();
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const yazar = (useOturum().data?.islemler ?? []).includes(KALIBRASYON_ISLEMI);
  const [secim, secimYaz] = useState<EgriSecimi>({ malzeme: null, tezgah: null, islem: null });
  const [kip, kipYaz] = useState<EgriKipi>('sonra');
  const [secili, seciliYaz] = useState<number | null>(null);
  const [tablo, tabloYaz] = useState(false);
  const komut = useKorumaliKomut<{ malzemeNo: number; geri: boolean }, GeometriKalibrasyonCevabi>({
    gonder: (g, d) => api.post<GeometriKalibrasyonCevabi>(
      `/geometri/kalibrasyon/${String(g.malzemeNo)}/${g.geri ? 'geri-al' : 'disarida-birak'}`, g.geri ? undefined : { neden: null }, d),
    onSuccess: (c, g) => {
      istemci.setQueryData(anahtarlar.kalibrasyon(), c);
      void istemci.invalidateQueries({ queryKey: ['geometri', 'sure'] });
      bildir('tamam', g.geri ? 'Parça kalibrasyona geri katıldı.' : 'Parça kalibrasyonun dışında bırakıldı.');
    },
    onError: (h) => bildir('hata', hataIletisi(h, 'Kalibrasyon işareti yazılamadı.')),
  });
  const k = sorgu.data;
  const noktalar = useMemo(() => (k === undefined ? [] : egriNoktalari(k.parcalar, secim, kip)), [k, secim, kip]);
  const p = noktalar.find((n) => n.parca.malzemeNo === secili)?.parca ?? null;
  const malzemeGruplari = k?.gruplar.filter((g) => g.tur === 'malzeme') ?? [];
  const secenekler = (tur: 'tezgah' | 'islem') => (k?.gruplar ?? []).filter((g) => g.tur === tur).map((g) => ({ deger: g.anahtar, baslik: `${g.anahtar} · ${String(g.n)}` }));
  return (
    <div className="tc-g3b">
      <SayfaBasligi baslik="3D Atölyesi" simge="expand" alt="Süre kalibrasyonu: tahmin ile gerçekleşen süre; malzeme grubu, tezgâh ve işlem çarpanları" />
      {sorgu.isPending ? <DurumKutusu durum="yukleniyor" />
        : sorgu.isError || k === undefined ? <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Kalibrasyon okunamadı.')} yenile={() => { void sorgu.refetch(); }} />
          : (
            <div className="tc-g3b-ka">
              <Kart baslik="Kalibrasyon eğrisi" simge="chart" sag={<Rozet ton={k.asama === 'kalibresiz' ? 'uyari' : 'tamam'}>{String(k.n)} parça</Rozet>}>
                <p className="tc-g3b-su-etiket">Aşama: {ASAMA_ADI[k.asama]}</p>
                <div className="tc-g3b-su-iso" role="group" aria-label="Malzeme grubu">
                  <Dugme aria-pressed={secim.malzeme === null} onClick={() => { secimYaz({ ...secim, malzeme: null }); }}>Genel · {String(k.n)}</Dugme>
                  {malzemeGruplari.map((g) => (
                    <Dugme key={g.anahtar} aria-pressed={secim.malzeme === g.anahtar} onClick={() => { secimYaz({ ...secim, malzeme: g.anahtar }); }}>
                      {grupAdi('malzeme', g.anahtar)} · {String(g.n)}
                    </Dugme>
                  ))}
                </div>
                <div className="tc-g3b-ka-secimler">
                  <Secim etiket="Tezgâh" value={secim.tezgah ?? ''} bosSecenek="Tüm tezgâhlar" secenekler={secenekler('tezgah')}
                    onChange={(o) => { secimYaz({ ...secim, tezgah: o.target.value === '' ? null : o.target.value }); }} />
                  <Secim etiket="İşlem" value={secim.islem ?? ''} bosSecenek="Tüm işlemler" secenekler={secenekler('islem')}
                    onChange={(o) => { secimYaz({ ...secim, islem: o.target.value === '' ? null : o.target.value }); }} />
                  <div className="tc-g3b-su-iso" role="group" aria-label="Düzeltme">
                    <Dugme aria-pressed={kip === 'once'} onClick={() => { kipYaz('once'); }}>Düzeltme öncesi</Dugme>
                    <Dugme aria-pressed={kip === 'sonra'} onClick={() => { kipYaz('sonra'); }}>Düzeltme sonrası</Dugme>
                  </div>
                </div>
                {k.n < k.esikler.tek && (
                  <p className="tc-g3b-soluk">
                    Kalibrasyon {String(k.esikler.tek)} ölçülmüş parçadan sonra başlar; şimdi {String(k.n)} parça
                    {k.olcumuEksik > 0 ? `, ölçümü eksik ${String(k.olcumuEksik)} parça` : ''}. Tahmin kalibresiz gösterilir.
                  </p>
                )}
                {noktalar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bu seçimde ölçülmüş parça yok." /> : tablo ? (
                  <ParcaTablosu noktalar={noktalar} kip={kip} yazar={yazar} bekliyor={komut.isPending}
                    isaretle={(malzemeNo, geri) => { komut.mutate({ malzemeNo, geri }); }} />
                ) : (
                  <>
                    <Egri noktalar={noktalar} kip={kip} aralik={k.aralik} secili={secili} sec={seciliYaz} />
                    {p !== null && (
                      <ParcaAyrintisi p={p} kip={kip} yazar={yazar} bekliyor={komut.isPending}
                        cikar={() => { komut.mutate({ malzemeNo: p.malzemeNo, geri: false }); }} geriAl={() => { komut.mutate({ malzemeNo: p.malzemeNo, geri: true }); }} />
                    )}
                  </>
                )}
                <p className="tc-g3b-soluk">
                  Her malzeme grubunun kendi eğrisi ve çarpanı vardır. {kip === 'sonra' && k.aralik !== null ? `Yeşil bant: ${k.aralik.genis ? 'bütün parçalar (parça az)' : '%80 aralık'}. ` : ''}
                  Çarpı: dışarıda bırakılmış parça. Noktaya dokununca (ya da Tab ile) parça, tahmin ve gerçekleşen süre çıkar
                  {yazar ? '; oradan "Dışarıda bırak / Geri al"' : ''}.{' '}
                  <button type="button" className="tc-g3b-ka-bag" onClick={() => { tabloYaz(!tablo); }}>{tablo ? 'Eğri olarak göster' : 'Tablo olarak göster'}</button>
                </p>
              </Kart>
              <Carpanlar k={k} />
            </div>
          )}
    </div>
  );
}

function ParcaTablosu({ noktalar, kip, yazar, bekliyor, isaretle }: {
  noktalar: EgriNoktasi[]; kip: EgriKipi; yazar: boolean; bekliyor: boolean; isaretle: (malzemeNo: number, geri: boolean) => void;
}) {
  return (
    <table className="tc-g3b-su-tablo tc-g3b-ka-parcalar">
      <thead>
        <tr><th scope="col">Parça</th><th scope="col">{kip === 'sonra' ? 'Düzeltilmiş' : 'Tahmin'}</th><th scope="col">Gerçekleşen</th><th scope="col">Oran</th>{yazar && <th scope="col"><span className="tc-gizli-etiket">İşlem</span></th>}</tr>
      </thead>
      <tbody>
        {noktalar.map(({ parca: p, x, y }) => (
          <tr key={p.malzemeNo}>
            <td>{p.kod}{p.disarida && <> <Rozet ton="pasif">dışarıda</Rozet></>}</td>
            <td>{dakika(x)}</td>
            <td>{dakika(y)}</td>
            <td>{carpanMetni(y / x)}</td>
            {yazar && <td><Dugme tur="ikincil" disabled={bekliyor} onClick={() => { isaretle(p.malzemeNo, p.disarida); }}>{p.disarida ? 'Geri al' : 'Dışarıda bırak'}</Dugme></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Carpanlar({ k }: { k: GeometriKalibrasyonCevabi }) {
  return (
    <Kart baslik="Çarpanlar" simge="gauge">
      <p className="tc-g3b-soluk">
        Tahmin üç çarpanla düzeltilir: malzeme grubu × tezgâh × işlem türü. Her biri ayrı hesaplanır; {String(k.esikler.grup)} parçanın altındaki
        çarpan ("az veri") genel çarpana yakın tutulur.
      </p>
      {k.carpan === null ? <p className="tc-g3b-soluk">Henüz çarpan yok; tahmin kalibresiz.</p> : (
        <table className="tc-g3b-su-tablo tc-g3b-ka-carpanlar">
          <thead><tr><th scope="col">Tür</th><th scope="col">Grup</th><th scope="col">Parça</th><th scope="col">Çarpan</th><th scope="col">Hata</th><th scope="col">Durum</th></tr></thead>
          <tbody>
            <tr><td>Genel</td><td><span className="tc-g3b-ka-tur-tel">Genel · </span>Tüm parçalar</td><td>{String(k.n)}</td><td>{carpanMetni(k.carpan)}</td><td>{yuzde(k.hataYuzde)}</td><td>taban</td></tr>
            {k.gruplar.map((g) => (
              <tr key={`${g.tur}:${g.anahtar}`}>
                <td>{GRUP_TURU_ADI[g.tur]}</td>
                <td><span className="tc-g3b-ka-tur-tel">{GRUP_TURU_ADI[g.tur]} · </span>{grupAdi(g.tur, g.anahtar)}</td>
                <td>{String(g.n)}</td>
                <td>{carpanMetni(g.carpan)}</td>
                <td>{yuzde(g.hataYuzde)}</td>
                <td>{g.azVeri ? <Rozet ton="uyari">az veri</Rozet> : 'kendi eğrisi'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {k.kalibresizHataYuzde !== null && (
        <p className="tc-g3b-soluk">Ortanca hata: kalibresiz {yuzde(k.kalibresizHataYuzde)}{k.hataYuzde !== null ? `, düzeltilmiş ${yuzde(k.hataYuzde)}` : ''}.</p>
      )}
      {k.regresyon !== null && (
        <p className="tc-g3b-soluk">
          Kalem kalem uyum: kaba {carpanMetni(k.regresyon.kaba)}, finiş {carpanMetni(k.regresyon.finis)}, delik {carpanMetni(k.regresyon.delik)},
          özellik başına {dakika(k.regresyon.ozellik)}.
        </p>
      )}
    </Kart>
  );
}
