import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DurumKutusu, Dugme, Rozet, Sekmeler, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { sayi, tarih, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useEskiKayit, type RrDurumu, type RrVerisi } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import {
  aralikDakika, basHarfler, etkinMakine, GUN_ADI, GUNLER, gunListesi, gunParcalari, gunSaati, haftaSaati, kapasiteKaynagi, planEkleri, sayiGirdisi,
  geceyiGecer, vardiyaHaftaSaati, yetkinler, type Hafta,
} from './kurallar.ts';
import { IkincilKaynaklar } from './IkincilKaynaklar.tsx';
import { SAHIP_SAYFASI, SahibindeDuzenle, SatirGirdisi, useR2Komutu } from './parcalar.tsx';

// Kaynaklar (envanter 2.7): iş merkezi, istasyon, makine ve personel sahiplerinin kayıtlarıdır (İstasyonlar, Kişiler, Vardiya). Tek giriş
// yeri İstasyonlar'dır (1927 a): burada yalnız okunur, düğme sahibinin sayfasını açar. Yazılan tek alan birim maliyettir (sahibi Finans).
type IsMerkezi = NonNullable<RrDurumu['wcs']>[number];
type Istasyon = NonNullable<RrDurumu['stations']>[number];
type Makine = NonNullable<RrDurumu['machines']>[number];
type Kisi = NonNullable<RrDurumu['people']>[number];
type Vardiya = RrDurumu['cal']['shifts'][number];

type AltSekme = 'overview' | 'shifts' | 'wcs' | 'machines' | 'people' | 'ikincil' | 'plan';
const ALT_SEKME_ANAHTARI = 'tmi.recete-rota.yeni.kaynak-sekmesi';
const ALT_SEKMELER: readonly AltSekme[] = ['overview', 'shifts', 'wcs', 'machines', 'people', 'ikincil', 'plan'];
const MAKINE_DURUMU: Record<Makine['status'], { ad: string; ton: RozetTonu }> = {
  aktif: { ad: 'Aktif', ton: 'tamam' }, bakim: { ad: 'Bakımda', ton: 'uyari' }, ariza: { ad: 'Arızalı', ton: 'hata' },
};
const RENK_SAYISI = 6;
// 561 1 b: istasyonun operatör ihtiyacı 1/N (aşağı yuvarlanmış) ise "1 operatör N tezgâha bakar" okunur (567 ortak anlaşma).
const operatorMetni = (oran: number): string => {
  const n = oran > 0 && oran < 1 ? Math.round(1 / oran) : 0;
  return n >= 2 && n <= 10 && Math.floor(100 / n) / 100 === oran ? `1 operatör ${String(n)} tezgâha bakar` : `${sayi(oran)} operatör/makine`;
};
export const ISTASYON_MALIYET_NOTU = 'Doğrudan gider: enerji, bakım, sarf (amortisman ve kira genel giderde)';
export const ORTAK_KAYNAK_NOTU = 'İş merkezi, istasyon, makine ve personel İstasyonlar sayfasında, vardiya ve tatiller İnsan Kaynakları menüsünde yazılır; '
  + 'burada yalnız okunur.';

// Seçili alt sekme cihaz tercihidir (yalnız bu tarayıcı); depo kapalıysa Genel bakış açılır.
function altSekmeOku(): AltSekme {
  try {
    const v = window.localStorage.getItem(ALT_SEKME_ANAHTARI);
    return ALT_SEKMELER.find((s) => s === v) ?? 'overview';
  } catch { return 'overview'; }
}
function altSekmeYaz(s: AltSekme) {
  try { window.localStorage.setItem(ALT_SEKME_ANAHTARI, s); } catch { /* depo kapalı: tercih bu açılışta kalır */ }
}

interface Bag {
  durum: RrDurumu;
  ek: RrVerisi['ek'];
  yetki: RrYetkisi;
  wcs: readonly IsMerkezi[];
  stations: readonly Istasyon[];
  machines: readonly Makine[];
  people: readonly Kisi[];
  shifts: readonly Vardiya[];
  hafta: (wcId: string) => Hafta | undefined;
  takvimVar: boolean;
  // İş merkezinin renk sırası (eski ekranda iş merkezi rengi sıradan gelir); bilinmeyen iş merkezi çizgi rengidir.
  renk: (wcId: string | null) => string | undefined;
  kapasite: (x: Istasyon) => 'makine' | 'insan';
  altSekme: (s: AltSekme) => void;
}

export function Kaynaklar({ veri, yetki }: EkranOzellikleri) {
  const { durum, ek } = veri;
  const [alt, altYaz] = useState<AltSekme>(altSekmeOku);

  const sec = (s: AltSekme) => { altYaz(s); altSekmeYaz(s); };
  const istasyonYok = durum.wcs === null || durum.stations === null || durum.machines === null;
  const kisiYok = durum.people === null;
  const bag: Bag = {
    durum, ek, yetki,
    wcs: durum.wcs ?? [], stations: durum.stations ?? [], machines: durum.machines ?? [], people: durum.people ?? [], shifts: durum.cal.shifts,
    // Takvimdeki vardiya, durumdaki vardiya sırasıyla.
    hafta: (wcId) => {
      const h = ek.takvim?.hafta[wcId];
      if (!h) return undefined;
      const sira = (id: string) => durum.cal.shifts.findIndex((v) => v.id === id);
      const sonuc: Record<number, string[]> = {};
      for (const [g] of GUNLER) sonuc[g] = (h[g] ?? []).filter((v) => sira(v) >= 0).sort((a, b) => sira(a) - sira(b));
      return sonuc;
    },
    takvimVar: ek.takvim !== null,
    renk: (wcId) => {
      const i = (durum.wcs ?? []).findIndex((w) => w.id === wcId);
      return i < 0 ? undefined : String(i % RENK_SAYISI);
    },
    kapasite: (x) => kapasiteKaynagi(ek.istasyonTipi?.[x.id] ?? null, ek.kapasiteKaynagi?.[x.id] ?? null),
    altSekme: sec,
  };

  const sekmeler: { anahtar: AltSekme; baslik: string }[] = [
    { anahtar: 'overview', baslik: 'Genel bakış' }, { anahtar: 'shifts', baslik: 'Vardiyalar' },
    { anahtar: 'wcs', baslik: 'İş merkezleri ve istasyonlar' }, { anahtar: 'machines', baslik: `Makineler ${String(bag.machines.length)}` },
    { anahtar: 'people', baslik: `Personel ${String(bag.people.length)}` }, { anahtar: 'ikincil', baslik: 'İkincil kaynaklar' },
    { anahtar: 'plan', baslik: 'Fason ve aparat' },
  ];

  let govde;
  if (istasyonYok && ['overview', 'wcs', 'machines'].includes(alt)) govde = <ErisimYok ad="İstasyonlar" />;
  else if (kisiYok && alt === 'people') govde = <ErisimYok ad="Kişiler" />;
  else if (alt === 'overview') govde = <GenelBakis b={bag} />;
  else if (alt === 'shifts') govde = <Vardiyalar b={bag} />;
  else if (alt === 'wcs') govde = <IsMerkezleri b={bag} />;
  else if (alt === 'machines') govde = <Makineler b={bag} />;
  else if (alt === 'people') govde = <Personel b={bag} />;
  else if (alt === 'ikincil') govde = <IkincilKaynaklar stations={bag.stations} items={durum.items} />;
  else govde = <FasonVeAparat />;

  return (
    <div className="tc-rr2" data-parca="R2">
      <div className="tc-rr2-bolmeli"><Sekmeler<AltSekme> etiket="Kaynak türü" sekmeler={sekmeler} secili={alt} sec={sec} /></div>
      <p className="tc-rr2-not">{ORTAK_KAYNAK_NOTU}</p>
      <div className="tc-rr2-govde" data-alt={alt}>{govde}</div>
    </div>
  );
}

function ErisimYok({ ad }: { ad: string }) {
  return (
    <DurumKutusu
      durum="bos"
      mesaj={`${ad} verisine erişimin yok. Bu bölüm ${ad} sayfasının verisini kullanır ve oradaki okuma yetkisi sende yok; bu yüzden liste boş görünüyor. Yetki için yöneticiye başvur.`}
    />
  );
}

/* ---------------- Genel bakış ---------------- */

function GenelBakis({ b }: { b: Bag }) {
  const operasyonlar = (stId: string) => (b.durum.opdefs ?? []).filter((d) => d.stationId === stId).map((d) => d.abbr ?? d.code);
  return (
    <>
      <div className="tc-rr2-seviyeler">
        <div className="tc-rr2-seviye"><span className="tc-rr2-seviye-bas"><span className="tc-rr2-no" aria-hidden="true">1</span><b>İş merkezi</b></span><p>Bölüm ya da hat: kesimhane, boyahane gibi. <b>Ne zaman çalışılacağını</b> belirler: haftalık vardiya düzeni, tatiller ve o bölümde çalışan personel burada.</p></div>
        <div className="tc-rr2-seviye"><span className="tc-rr2-seviye-bas"><span className="tc-rr2-no" aria-hidden="true">2</span><b>İstasyon</b></span><p>Operasyonun yapıldığı yer: fiber lazer, abkant pres gibi. <b>Rota adımında seçilen budur.</b> Saatlik maliyet, verim ve bir makinenin başında kaç operatör gerektiği istasyonda tutulur. Operasyon kataloğundaki her operasyonun varsayılan istasyonu vardır.</p></div>
        <div className="tc-rr2-seviye"><span className="tc-rr2-seviye-bas"><span className="tc-rr2-no" aria-hidden="true">3</span><b>Makine</b></span><p>İstasyondaki tek tek ekipman. <b>Plan makine makine yapılır:</b> her makine aynı anda tek iş yapar, farklı makinelerde aynı anda farklı işler çalışabilir. Bakımdaki ya da arızalı makine iş almaz. Makine tanımlanmamışsa istasyonun "paralel adet" kadar makinesi varsayılır.</p></div>
      </div>
      <section className="tc-rr2-grup tc-rr2-panel" aria-label="Planlayıcı bir operasyonu nasıl yerleştirir">
        <h3 className="tc-rr2-grup-baslik"><span>Planlayıcı bir operasyonu nasıl yerleştirir</span></h3>
        <ol className="tc-rr2-liste">
          <li>Rota adımında seçilen istasyonun (ve varsa alternatif istasyonların) <b>aktif makinelerine</b> bakar.</li>
          <li>Her makine için, önceki işi bittikten sonra ilk boş anı bulur. Bu an, makinenin bağlı olduğu <b>iş merkezinin vardiya saatleri</b> içinde olmalıdır; molalar ve tatiller düşülür.</li>
          <li>Personel kısıtı açıksa o gün iş merkezinde vardiyada olan personelin kişi-saati de yetmelidir.</li>
          <li>İşi en erken bitirecek makineyi seçer. Partiyi kendiliğinden makinelere bölmez; bölme yalnız elle yapılır.</li>
          <li>Süre = hazırlık + (işlem + değişim) × miktar ÷ istasyonun verimi; Süreler bölümünde kabul edilen ölçüm teorik süreye yazılır, plan teorik süreyi kullanır. Maliyet = makine saati × istasyonun saatlik maliyeti.</li>
        </ol>
      </section>
      <h3 className="tc-rr2-grup-baslik"><span>Şu anki kaynakların</span></h3>
      {b.wcs.length === 0 && <DurumKutusu durum="bos" mesaj="İş merkezi yok." />}
      <div className="tc-rr2-agac">
        {b.wcs.map((w) => {
          const sts = b.stations.filter((x) => x.wcId === w.id);
          const kisi = b.people.filter((p) => p.wcId === w.id && p.active).length;
          const hafta = b.hafta(w.id);
          return (
            <section key={w.id} className="tc-rr2-agac-im" data-renk={b.renk(w.id)} aria-label={`${w.code} ${w.name}`}>
              <div className="tc-rr2-agac-bas">
                <b>{w.code} {w.name}</b>
                <span>{b.takvimVar ? `${sayi(Math.round(haftaSaati(hafta, b.shifts)))} sa/hafta vardiya` : 'vardiya bağlı değil'}</span>
                <span>{`${String(kisi)} personel`}</span>
                <button type="button" className="tc-rr2-bag" onClick={() => b.altSekme('shifts')}>vardiyalar</button>
              </div>
              {sts.length === 0 && <p className="tc-rr2-not">İstasyon yok.</p>}
              {sts.map((x) => {
                const ms = b.machines.filter((m) => m.stationId === x.id);
                const ops = operasyonlar(x.id);
                return (
                  <div key={x.id} className="tc-rr2-agac-ist">
                    <b>{x.code} {x.name}</b>
                    <small>{`verim %${sayi(x.eff)}, ${operatorMetni(x.opPer ?? 1)}`}</small>
                    <small className="tc-rr2-soluk">{ops.length > 0 ? ops.join(', ') : 'operasyon yok'}</small>
                    <div className="tc-rr2-satir">
                      {ms.length > 0
                        ? ms.map((m) => (
                          <span key={m.id} title={`${MAKINE_DURUMU[m.status].ad}${b.ek.makineNotu?.[m.id] ? `: ${b.ek.makineNotu[m.id] ?? ''}` : ''}`}>
                            <Rozet ton={MAKINE_DURUMU[m.status].ton}>{m.code}</Rozet>
                          </span>
                        ))
                        : <span title="Makine tanımlı değil; paralel adetten varsayıldı"><Rozet ton="pasif">{`${String(Math.max(1, x.count))} sanal makine`}</Rozet></span>}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Vardiyalar ---------------- */

function HaftaYok() {
  return (
    <p className="tc-rr2-uyari" role="status">
      Vardiya takvimi okunamadı; iş merkezi haftası ve kişi vardiyası şimdilik gösterilemiyor. Sayfayı yenile ya da Vardiya sayfasından düzenle.
      Plan iş merkezi kapasitesini bu bilgiden hesapladığı için kapasite sıfır görünebilir.
    </p>
  );
}

function VardiyaMatrisi({ b }: { b: Bag }) {
  if (!b.takvimVar) return <HaftaYok />;
  if (b.wcs.length === 0) return <p className="tc-rr2-not">İş merkezi yok.</p>;
  const saat = (v: number) => (v > 0 ? sayi(Math.round(v * 100) / 100) : YOK);
  return (
    <div className="tc-rr2-kaydir">
      <table className="tc-rr2-matris" aria-label="Haftalık vardiya matrisi">
        <thead>
          <tr>
            <th scope="col">İş merkezi / vardiya</th>
            {GUNLER.map(([g, ad]) => <th key={g} scope="col" abbr={GUN_ADI[g]} data-tatil={g === 0 || g === 6 || undefined}>{ad}</th>)}
            <th scope="col">Hafta</th>
          </tr>
        </thead>
        <tbody>
          {b.wcs.map((w) => {
            const hafta = b.hafta(w.id);
            return [
              <tr key={`${w.id}-b`} className="tc-rr2-matris-ust" data-renk={b.renk(w.id)}>
                <th colSpan={9} scope="rowgroup">
                  <span className="tc-rr2-satir">
                    <span><span className="tc-rr2-nokta" aria-hidden="true" /><b>{w.code}</b> {w.name}</span>
                    <HazirDuzen kod={w.code} />
                  </span>
                </th>
              </tr>,
              ...b.shifts.map((v) => (
                <tr key={`${w.id}-${v.id}`} data-renk={b.renk(w.id)}>
                  <th scope="row">{v.name} <small>{v.start}–{v.end}, net {saat(v.netDakika / 60)} sa</small></th>
                  {GUNLER.map(([g]) => {
                    const acik = (hafta?.[g] ?? []).includes(v.id);
                    return (
                      <td key={g} aria-label={`${w.code} ${GUN_ADI[g]} ${v.name}: ${acik ? 'açık' : 'kapalı'}`}>
                        <span className="tc-rr2-hucre" data-acik={acik || undefined}>{acik ? saat(v.netDakika / 60) : ''}</span>
                      </td>
                    );
                  })}
                  <td>{saat(vardiyaHaftaSaati(hafta, v))}</td>
                </tr>
              )),
              <tr key={`${w.id}-t`} className="tc-rr2-matris-toplam">
                <th scope="row">Günlük saat</th>
                {GUNLER.map(([g]) => <td key={g}>{saat(gunSaati(hafta, g, b.shifts))}</td>)}
                <td><b>{saat(haftaSaati(hafta, b.shifts))}</b></td>
              </tr>,
            ];
          })}
        </tbody>
        {b.wcs.length > 1 && (
          <tfoot>
            <tr>
              <th scope="row">Tüm iş merkezleri</th>
              {GUNLER.map(([g]) => <td key={g}>{saat(b.wcs.reduce((t, w) => t + gunSaati(b.hafta(w.id), g, b.shifts), 0))}</td>)}
              <td><b>{saat(b.wcs.reduce((t, w) => t + haftaSaati(b.hafta(w.id), b.shifts), 0))}</b></td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Eski ekranın iş merkezi başlığındaki "Hazır düzen" seçicisi ve "Bu düzeni diğerlerine kopyala" bağlantısı. Hafta düzeni Vardiya'da
// yazılır (tek düzenleme yeri); ikisi de eski ekranın bağlı hâlindeki gibi Vardiya sayfasını açar, burada yazma yoktur.
const HAZIR_DUZENLER = [
  ['5x1', 'Hafta içi, 1 vardiya'], ['5x2', 'Hafta içi, 2 vardiya'], ['5x3', 'Hafta içi, 3 vardiya'], ['6x1', 'Pzt–Cmt, 1 vardiya'],
  ['6x2', 'Pzt–Cmt, 2 vardiya'], ['7x3', '7/24, 3 vardiya'], ['off', 'Kapalı'],
] as const;
function HazirDuzen({ kod }: { kod: string }) {
  const git = useNavigate();
  const { bildir } = useBildirim();
  const vardiyaya = () => { bildir('bilgi', `Bu bilgi ${SAHIP_SAYFASI.vardiya.ad} sayfasında düzenlenir.`); void git(SAHIP_SAYFASI.vardiya.yol); };
  return (
    <>
      <select className="tc-alan-kutu tc-rr2-girdi" value="" aria-label={`${kod} hazır vardiya düzeni`} onChange={(o) => { if (o.target.value) vardiyaya(); }}>
        <option value="">Hazır düzen…</option>
        {HAZIR_DUZENLER.map(([k, ad]) => <option key={k} value={k}>{ad}</option>)}
      </select>
      <button type="button" className="tc-rr2-bag" onClick={vardiyaya}>Bu düzeni diğerlerine kopyala</button>
    </>
  );
}

function Vardiyalar({ b }: { b: Bag }) {
  const tatiller = [...b.durum.cal.holidays].sort();
  return (
    <>
      <section className="tc-rr2-grup tc-rr2-panel" aria-label="Haftalık vardiya matrisi">
        <h3 className="tc-rr2-grup-baslik"><span>Haftalık vardiya matrisi</span></h3>
        <VardiyaMatrisi b={b} />
        <p className="tc-rr2-not">
          Hücredeki sayı molalar düşülmüş net çalışma saatidir. Resmî tatil ve kapalı günler tüm iş merkezlerinde vardiyayı sıfırlar. Vardiya düzeni
          Vardiya sayfasında değişir.
        </p>
      </section>
      <section className="tc-rr2-grup tc-rr2-panel" aria-label="Vardiya saatleri ve molalar">
        <h3 className="tc-rr2-grup-baslik"><span>Vardiya saatleri ve molalar</span></h3>
        <p className="tc-rr2-not">Kapasite molalar düşülmüş net süreyle hesaplanır. Bitiş başlangıçtan önceyse vardiya gece yarısını geçer ve başladığı güne sayılır.</p>
        {b.shifts.length === 0 && <DurumKutusu durum="bos" mesaj="Vardiya yok." />}
        <div className="tc-rr2-vardiyalar">
          {b.shifts.map((v, sira) => {
            const brut = aralikDakika(v.start, v.end);
            const mola = v.breaks.reduce((t, m) => t + (aralikDakika(m.start, m.end) ?? 0), 0);
            return (
              <article key={v.id} className="tc-rr2-kart-kutu tc-rr2-vardiya" data-renk={String((sira + 5) % RENK_SAYISI)} aria-label={v.name}>
                <h4>{v.name} <small>{v.start}–{v.end}</small></h4>
                <p><b>{sayi(Math.round((v.netDakika / 60) * 100) / 100)} sa net</b>{' '}
                  <small>{brut === null ? '' : `${sayi(Math.round((brut / 60) * 100) / 100)} sa brüt, `}{sayi(mola)} dk mola{geceyiGecer(v.start, v.end) ? ', gece yarısını geçer' : ''}</small>
                </p>
                <VardiyaCubugu v={v} mola={mola} />
                {v.breaks.length === 0
                  ? <p className="tc-rr2-soluk">Bu vardiyada mola yok.</p>
                  : <ul className="tc-rr2-liste">{v.breaks.map((m) => <li key={`${m.start}-${m.end}`}>Mola {m.start}–{m.end} <small>{sayi(aralikDakika(m.start, m.end))} dk</small></li>)}</ul>}
              </article>
            );
          })}
        </div>
      </section>
      <section className="tc-rr2-grup tc-rr2-panel" aria-label="Tatiller ve kapalı günler">
        <h3 className="tc-rr2-grup-baslik"><span>Tatiller ve kapalı günler ({tatiller.length})</span></h3>
        {tatiller.length === 0
          ? <p className="tc-rr2-soluk">Tatil eklenmedi.</p>
          : <div className="tc-rr2-satir">{tatiller.map((t) => <Rozet key={t} ton="pasif">{tarih(t)}</Rozet>)}</div>}
        <p className="tc-rr2-not">Ramazan ve Kurban Bayramı tarihleri her yıl değiştiği için onlar Vardiya sayfasında tarih seçilerek eklenir.</p>
      </section>
    </>
  );
}

// 24 saatlik şerit: vardiya renkli, molalar taralı; yalnız gösterir (vardiya Vardiya sayfasında değişir).
const SAAT_IZLERI = [0, 3, 6, 9, 12, 15, 18, 21, 24];
function VardiyaCubugu({ v, mola }: { v: Vardiya; mola: number }) {
  return (
    <div className="tc-rr2-cubuk">
      <svg viewBox="0 0 1440 24" preserveAspectRatio="none" role="img" aria-label={`${v.name}: ${v.start}–${v.end}, ${String(mola)} dakika mola`}>
        <rect className="tc-rr2-cubuk-zemin" x={0} y={0} width={1440} height={24} />
        {SAAT_IZLERI.map((h) => <line key={h} className="tc-rr2-cubuk-iz" x1={h * 60} x2={h * 60} y1={0} y2={24} />)}
        {gunParcalari(v.start, v.end).map(([a, z]) => <rect key={`v${String(a)}`} className="tc-rr2-cubuk-vardiya" x={a} y={4} width={z - a} height={16} />)}
        {v.breaks.flatMap((m) => gunParcalari(m.start, m.end)).map(([a, z]) => (
          <rect key={`m${String(a)}`} className="tc-rr2-cubuk-mola" x={a} y={2} width={Math.max(4, z - a)} height={20} />
        ))}
      </svg>
      <div className="tc-rr2-cubuk-cetvel" aria-hidden="true">{SAAT_IZLERI.map((h) => <span key={h}>{String(h % 24).padStart(2, '0')}</span>)}</div>
    </div>
  );
}

/* ---------------- İş merkezleri ve istasyonlar ---------------- */

function IsMerkezleri({ b }: { b: Bag }) {
  return (
    <>
      <p className="tc-rr2-not">
        İş merkezi bir bölüm ya da hattır; vardiya düzeni iş merkezinde tutulur. İstasyon, operasyonun yapıldığı makine grubu ya da tezgâhtır. Operatör
        ihtiyacı, istasyonun bir makinesi çalışırken kaç kişinin başında durması gerektiğidir. İstasyonun ₺ / saat değeri: {ISTASYON_MALIYET_NOTU}.
      </p>
      <div className="tc-rr2-arac"><SahibindeDuzenle sahip="istasyon" /></div>
      {b.wcs.length === 0 && <DurumKutusu durum="bos" mesaj="İş merkezi yok. Kesimhane, kaynakhane, montaj gibi bölümleri İstasyonlar sayfasında ekle." />}
      {b.wcs.map((w) => (
        <section key={w.id} className="tc-rr2-grup tc-rr2-panel tc-rr2-im" data-renk={b.renk(w.id)} aria-label={`${w.code} ${w.name}`}>
          <div className="tc-rr2-baslik-satiri">
            <span className="tc-rr2-alan"><span>Kod</span>
              <b>{w.code}</b>
            </span>
            <span className="tc-rr2-alan tc-rr2-genis"><span>İş merkezi adı</span>
              <b>{w.name}</b>
            </span>
            <span className="tc-rr2-alan"><span>Haftalık vardiya saati</span>
              {b.takvimVar ? <b>{sayi(Math.round(haftaSaati(b.hafta(w.id), b.shifts) * 10) / 10)} sa</b> : <Rozet ton="pasif">bağlı değil</Rozet>}
            </span>
          </div>
          <div className="tc-rr2-kutu"><IstasyonTablosu b={b} wc={w} /></div>
        </section>
      ))}
    </>
  );
}

function IstasyonTablosu({ b, wc }: { b: Bag; wc: IsMerkezi }) {
  const liste = b.stations.filter((x) => x.wcId === wc.id);
  const sutunlar: Sutun<Istasyon>[] = [
    { anahtar: 'kod', baslik: 'İstasyon kodu', kirilmaz: true, hucre: (x) => x.code },
    { anahtar: 'ad', baslik: 'İstasyon adı', hucre: (x) => x.name },
    { anahtar: 'maliyet', baslik: '₺ / saat', hizala: 'sag', hucre: (x) => <MaliyetHucresi tur="istasyon" id={x.id} etiket={`${x.code} saatlik maliyet`} b={b} /> },
    { anahtar: 'verim', baslik: 'Verim %', hizala: 'sag', hucre: (x) => sayi(x.eff) },
    {
      anahtar: 'adet', baslik: 'Paralel adet', hizala: 'sag',
      hucre: (x) => {
        const ms = b.machines.filter((m) => m.stationId === x.id);
        return ms.length > 0
          ? <Dugme onClick={() => b.altSekme('machines')}>{`${String(etkinMakine(x.id, x.count, b.machines))} / ${String(ms.length)} makine`}</Dugme>
          : `${String(x.count)} aktif makine`;
      },
    },
    { anahtar: 'operator', baslik: 'Operatör / makine', hizala: 'sag', hucre: (x) => operatorMetni(x.opPer ?? 1) },
    {
      anahtar: 'kapasite', baslik: 'Kapasite',
      hucre: (x) => {
        const k = b.kapasite(x);
        const secili = b.ek.kapasiteKaynagi?.[x.id] ?? null;
        const alt = k === 'insan' ? `${String(yetkinler(x.id, b.people).length)} yetkin kişi` : `${String(etkinMakine(x.id, x.count, b.machines))} makine`;
        const ad = (v: 'makine' | 'insan') => `${v === 'makine' ? 'Makine saati' : 'Personel saati'}${secili === null && v === k ? ' (türden)' : ''}`;
        return (
          <span className="tc-rr2-satir">
            {ad(k)}
            <small className="tc-rr2-soluk">{alt}</small>
          </span>
        );
      },
    },
  ];
  return <Tablo<Istasyon> etiket={`${wc.code} istasyonları`} sutunlar={sutunlar} satirlar={liste} satirAnahtari={(x) => x.id} bosMesaj="Bu iş merkezinde istasyon yok." />;
}

// Birim maliyet Finans'tadır (finans.yonet ile yazılır, finans.maliyet-oku ile görünür). Boş bırakılamaz; kaldırmak için 0 girilir.
function MaliyetHucresi({ tur, id, etiket, b }: { tur: 'istasyon' | 'kisi'; id: string; etiket: string; b: Bag }) {
  const { calistir } = useR2Komutu();
  const { bildir } = useBildirim();
  const maliyet = b.durum.maliyet;
  if (maliyet === null) return <span title="Birim maliyetleri görme yetkin yok">{YOK}</span>;
  const k = maliyet[tur][id];
  const deger = k ? String(Number(k.birimMaliyet)) : '';
  if (!(maliyet.yazabilir && b.yetki.maliyetYaz)) return <span title="Maliyeti değiştirme yetkin yok">{k ? sayi(Number(k.birimMaliyet)) : YOK}</span>;
  const kaydet = async (ham: string): Promise<boolean> => {
    const g = sayiGirdisi(ham, 1_000_000_000);
    if (!g.tamam) { bildir('hata', g.ileti); return false; }
    if (g.deger === null) { if (k) bildir('hata', 'Maliyet boş bırakılamaz; kaldırmak için 0 gir.'); return false; }
    return (await calistir('maliyet-yaz', { tur, anahtar: id, birimMaliyet: g.deger })) === null;
  };
  return <SatirGirdisi sayi deger={deger} etiket={etiket} kaydet={kaydet} />;
}

/* ---------------- Makineler ---------------- */

function Makineler({ b }: { b: Bag }) {
  // Makinede şu an çalışan adım sunucunun başlamış adımlarındandır (emir no ve OP no).
  const calisan = (makineId: string) => {
    const a = (b.durum.calisanAdimlar ?? []).find((x) => x.makineId === makineId);
    return a ? a.anahtar.replace('|', ' OP ') : 'Boşta';
  };
  const sutunlar: Sutun<Makine>[] = [
    { anahtar: 'durum', baslik: 'Durum', hucre: (m) => <Rozet ton={MAKINE_DURUMU[m.status].ton}>{MAKINE_DURUMU[m.status].ad}</Rozet>, csv: (m) => MAKINE_DURUMU[m.status].ad },
    { anahtar: 'kod', baslik: 'Makine kodu', kirilmaz: true, hucre: (m) => m.code },
    { anahtar: 'ad', baslik: 'Makine adı', hucre: (m) => m.name },
    { anahtar: 'not', baslik: 'Not', hucre: (m) => b.ek.makineNotu?.[m.id] ?? YOK },
    { anahtar: 'simdi', baslik: 'Şu an', hucre: (m) => calisan(m.id) },
  ];
  return (
    <>
      <p className="tc-rr2-not">
        Makine, istasyondaki tek tek ekipmandır. Bir istasyonda makine tanımlıysa istasyonun paralel kapasitesi aktif makine sayısı kadar olur; bakımdaki ya da
        arızalı makine kapasiteden düşer ve plan buna göre kayar. Makine, durumu ve notu İstasyonlar sayfasında yazılır.
      </p>
      <div className="tc-rr2-arac"><SahibindeDuzenle sahip="makine" /></div>
      {b.wcs.map((w) => {
        const sts = b.stations.filter((x) => x.wcId === w.id);
        if (sts.length === 0) return null;
        return (
          <section key={w.id} className="tc-rr2-grup tc-rr2-panel tc-rr2-im" data-renk={b.renk(w.id)} aria-label={`${w.code} ${w.name} makineleri`}>
            <h3 className="tc-rr2-grup-baslik"><span>{w.code} {w.name}</span></h3>
            {sts.map((x) => {
              const ms = b.machines.filter((m) => m.stationId === x.id);
              return (
                <div key={x.id} className="tc-rr2-mgrup">
                  <h4 className="tc-rr2-grup-baslik">
                    <span>{x.code} {x.name}</span>
                    <small className="tc-rr2-soluk">
                      {ms.length > 0 ? `${String(ms.length)} makine, ${String(etkinMakine(x.id, x.count, b.machines))} aktif` : `Makine yok, paralel adet ${String(x.count)} kullanılıyor`}
                    </small>
                  </h4>
                  {ms.length > 0 && <div className="tc-rr2-kutu"><Tablo<Makine> etiket={`${x.code} makineleri`} sutunlar={sutunlar} satirlar={ms} satirAnahtari={(m) => m.id} /></div>}
                </div>
              );
            })}
          </section>
        );
      })}
    </>
  );
}

/* ---------------- Personel ---------------- */

function Personel({ b }: { b: Bag }) {
  const vardiyasi = (k: Kisi) => b.ek.takvim?.kisiVardiyasi[k.id] ?? null;
  const gruplar = [
    ...b.wcs.map((w) => ({ w, liste: b.people.filter((p) => p.wcId === w.id) })),
    { w: null, liste: b.people.filter((p) => p.wcId === null || !b.wcs.some((w) => w.id === p.wcId)) },
  ].filter((g) => g.w !== null || g.liste.length > 0);
  return (
    <>
      <p className="tc-rr2-not">
        Personel bir iş merkezine ve vardiyaya bağlıdır; atama, vardiya ve yetkinlik İstasyonlar sayfasında yazılır. Plan, istasyonların çalıştığı saatleri operatör ihtiyacıyla çarpar ve o gün
        vardiyada olan personelin net saatiyle karşılaştırır. Saatlik ücret girersen işçilik maliyeti emir maliyetine eklenir.
      </p>
      <section className="tc-rr2-grup tc-rr2-panel" aria-label="Vardiya başına personel">
        <h3 className="tc-rr2-grup-baslik"><span>Vardiya başına personel</span><SahibindeDuzenle sahip="personel" /></h3>
        {b.takvimVar
          ? (
            <div className="tc-rr2-kaydir">
              <table className="tc-rr2-matris" aria-label="Vardiya başına personel">
                <thead><tr><th scope="col">İş merkezi</th>{b.shifts.map((v) => <th key={v.id} scope="col">{v.name} <small>{v.start}–{v.end}</small></th>)}<th scope="col">Toplam</th></tr></thead>
                <tbody>
                  {b.wcs.map((w) => {
                    const kisiler = b.people.filter((p) => p.wcId === w.id && p.active);
                    const hafta = b.hafta(w.id);
                    return (
                      <tr key={w.id} data-renk={b.renk(w.id)}>
                        <th scope="row"><span className="tc-rr2-nokta" aria-hidden="true" /> {w.code} {w.name}</th>
                        {b.shifts.map((v) => {
                          const n = kisiler.filter((p) => vardiyasi(p) === v.id);
                          // Vardiya bu iş merkezinde çalışıyor ama kimse atanmamışsa sıfır gerçek bir sayıdır ve eksik olarak işaretlenir.
                          const kullanilir = GUNLER.some(([g]) => (hafta?.[g] ?? []).includes(v.id));
                          return (
                            <td key={v.id} title={n.map((p) => p.name).join(', ')} data-eksik={(kullanilir && n.length === 0) || undefined}>
                              {n.length > 0 ? <span className="tc-rr2-sayac">{n.length}</span> : kullanilir ? '0' : YOK}
                            </td>
                          );
                        })}
                        <td><b>{kisiler.length}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
          : (
            <p className="tc-rr2-not">
              Kişilerin vardiyası İstasyonlar sayfasında atanır; atanmamış kişi istasyonunun iş merkezinin vardiyasında çalışır. Kişinin istasyonu İstasyonlar'daki
              istasyon atamasından, yoksa yetkin olduğu istasyondan gelir.
            </p>
          )}
      </section>
      {gruplar.map(({ w, liste }) => (
        <section key={w?.id ?? 'yok'} className="tc-rr2-grup tc-rr2-panel tc-rr2-im" data-renk={b.renk(w?.id ?? null)} aria-label={w ? `${w.code} ${w.name} personeli` : 'İş merkezi atanmamış personel'}>
          <h3 className="tc-rr2-grup-baslik"><span>{w ? `${w.code} ${w.name}` : 'İş merkezi atanmamış'}</span><Rozet ton="pasif">{`${String(liste.length)} kişi`}</Rozet></h3>
          {liste.length === 0 && <p className="tc-rr2-soluk">Bu iş merkezinde personel yok.</p>}
          <div className="tc-rr2-kisiler">{liste.map((k) => <KisiKarti key={k.id} k={k} w={w} b={b} />)}</div>
        </section>
      ))}
    </>
  );
}

function KisiKarti({ k, w, b }: { k: Kisi; w: IsMerkezi | null; b: Bag }) {
  const yetkin = k.skills.map((id) => b.stations.find((x) => x.id === id)).filter((x): x is Istasyon => x !== undefined);
  const istasyon = k.stationId ? b.stations.find((x) => x.id === k.stationId) : undefined;
  const vardiyaId = b.ek.takvim?.kisiVardiyasi[k.id] ?? null;
  const vardiya = vardiyaId ? b.shifts.find((v) => v.id === vardiyaId) : undefined;
  return (
    <article className="tc-rr2-kisi-satir" data-pasif={!k.active || undefined} aria-label={k.name}>
      <div className="tc-rr2-kisi">
        <span className="tc-rr2-avatar" data-renk={b.renk(w?.id ?? null)} aria-hidden="true">{basHarfler(k.name)}</span>
        <div className="tc-rr2-kisi-alanlar">
          <span className="tc-rr2-alan"><span>Sicil</span>
            <b>{k.code ?? YOK}</b>
          </span>
          <span className="tc-rr2-alan tc-rr2-genis"><span>Ad soyad</span>
            <b>{k.name}</b>
          </span>
          <span className="tc-rr2-alan"><span>Görev</span><b>{b.ek.kisiGorevi?.[k.id] ?? YOK}</b></span>
          <span className="tc-rr2-alan"><span>İstasyon</span>
            <b title={k.stationAtama ? 'İstasyonlar sayfasındaki istasyon ataması' : 'Atama yok; yetkin olduğu ilk istasyon'}>
              {istasyon ? `${istasyon.code} ${istasyon.name}${k.stationAtama ? '' : ' (yetkinlik)'}` : YOK}
            </b>
          </span>
          <span className="tc-rr2-alan"><span>İş merkezi</span><b>{w ? `${w.code} ${w.name}` : YOK}</b></span>
          <span className="tc-rr2-alan"><span>Vardiya</span>
            <b>{!b.takvimVar ? 'bağlı değil' : vardiya ? `${vardiya.name} ${vardiya.start}–${vardiya.end}` : w ? 'İstasyonun vardiyası' : YOK}</b>
          </span>
          <span className="tc-rr2-alan"><span>₺ / saat</span><MaliyetHucresi tur="kisi" id={k.id} etiket={`${k.name} saatlik ücret`} b={b} /></span>
        </div>
      </div>
      <div className="tc-rr2-satir" role="group" aria-label={`${k.name} yetkinlikleri`}>
        <span className="tc-rr2-soluk">Yetkinlik</span>
        {yetkin.length === 0 ? <span>{YOK}</span> : yetkin.map((x) => <Rozet key={x.id} ton="bilgi">{x.code} {x.name}</Rozet>)}
      </div>
    </article>
  );
}

/* ---------------- Fason ve aparat ---------------- */

// Planlamanın okuduğu dış kaynaklar kayıt belgesindedir (st.plan); yeni ekranda yalnız okunur (204 a).
function FasonVeAparat() {
  const kayit = useEskiKayit();
  if (kayit.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (kayit.isError) return <DurumKutusu durum="hata" mesaj={kayit.error.message || 'Kayıt okunamadı.'} yenile={() => { void kayit.refetch(); }} />;
  const { fasoncular, aparatlar } = planEkleri(kayit.data?.deger ?? null);
  return (
    <>
      <p className="tc-rr2-not">
        Planlamanın okuduğu dış kaynaklar: fason firmanın aynı anda alabildiği iş sayısı ve sevk günleri, aparatların adedi. Bu değerler eski kayıttadır ve bu ekranda
        yalnız okunur.
      </p>
      <section className="tc-rr2-grup" aria-label="Fason firmalar">
        <h3 className="tc-rr2-grup-baslik"><span>Fason firmalar ({fasoncular.length})</span></h3>
        <Tablo
          etiket="Fason firmalar" satirlar={fasoncular} satirAnahtari={(f) => f.id} bosMesaj="Fason firma yok."
          sutunlar={[
            { anahtar: 'ad', baslik: 'Firma', hucre: (f) => f.ad || YOK },
            { anahtar: 'kapasite', baslik: 'Kapasite (iş)', hizala: 'sag', hucre: (f) => sayi(f.kapasite) },
            { anahtar: 'sure', baslik: 'Süre (gün)', hizala: 'sag', hucre: (f) => sayi(f.sureGun) },
            { anahtar: 'saat', baslik: 'Çıkış saati', hucre: (f) => f.cikisSaat ?? YOK },
            { anahtar: 'gunler', baslik: 'Çıkış günleri', hucre: (f) => gunListesi(f.cikisGunleri) || YOK },
          ]}
        />
      </section>
      <section className="tc-rr2-grup" aria-label="Aparatlar">
        <h3 className="tc-rr2-grup-baslik"><span>Aparatlar ({aparatlar.length})</span></h3>
        <Tablo
          etiket="Aparatlar" satirlar={aparatlar} satirAnahtari={(a) => a.id} bosMesaj="Aparat yok."
          sutunlar={[{ anahtar: 'ad', baslik: 'Aparat', hucre: (a) => a.ad || YOK }, { anahtar: 'adet', baslik: 'Adet', hizala: 'sag', hucre: (a) => sayi(a.adet) }]}
        />
      </section>
    </>
  );
}
