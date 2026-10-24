import { useState, type FormEvent } from 'react';
import {
  DurumKutusu, Dugme, Girdi, OnayPenceresi, Pencere, Rozet, Sekmeler, Tablo, useBildirim, type RozetTonu, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { sayi, tarih, YOK } from '../bicim.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { useEskiKayit, type RrDurumu, type RrVerisi } from '../veri.ts';
import type { RrYetkisi } from '../yetki.ts';
import {
  aralikDakika, basHarfler, etkinMakine, GUN_ADI, GUNLER, gunListesi, gunSaati, haftaSaati, kapasiteKaynagi, planEkleri, sayiGirdisi, sonrakiKod,
  geceyiGecer, vardiyaHaftaSaati, yetkinler, yetkinlikDegistir, type Hafta,
} from './kurallar.ts';
import { SahibindeDuzenle, SatirGirdisi, useR2Komutu } from './parcalar.tsx';

// Kaynaklar (envanter 2.7): iş merkezi, istasyon, makine ve personel sahiplerinin kayıtlarıdır (İstasyonlar, Kişiler, Vardiya). Burada
// yazılanlar sahibin komutlarıdır (kod, ad, kapasite kaynağı, ekleme ve silme, kişi ve yetkinlik, birim maliyet). Vardiya, mola, tatil,
// iş merkezi haftası, kişi vardiyası, verim, operatör ihtiyacı ve makine durumu yalnız okunur; düğme sahibinin sayfasını açar.
type IsMerkezi = NonNullable<RrDurumu['wcs']>[number];
type Istasyon = NonNullable<RrDurumu['stations']>[number];
type Makine = NonNullable<RrDurumu['machines']>[number];
type Kisi = NonNullable<RrDurumu['people']>[number];
type Vardiya = RrDurumu['cal']['shifts'][number];

type AltSekme = 'overview' | 'shifts' | 'wcs' | 'machines' | 'people' | 'plan';
const ALT_SEKME_ANAHTARI = 'tmi.recete-rota.yeni.kaynak-sekmesi';
const ALT_SEKMELER: readonly AltSekme[] = ['overview', 'shifts', 'wcs', 'machines', 'people', 'plan'];
const MAKINE_DURUMU: Record<Makine['status'], { ad: string; ton: RozetTonu }> = {
  aktif: { ad: 'Aktif', ton: 'tamam' }, bakim: { ad: 'Bakımda', ton: 'uyari' }, ariza: { ad: 'Arızalı', ton: 'hata' },
};
export const ISTASYON_MALIYET_NOTU = 'Doğrudan gider: enerji, bakım, sarf (amortisman ve kira genel giderde)';
export const ORTAK_KAYNAK_NOTU = 'İş merkezi, istasyon, makine, personel, vardiya ve tatiller İstasyonlar, Kişiler ve Vardiya sayfalarıyla ortaktır: '
  + 'burada yapılan değişiklik orada da görünür.';

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
  kapasite: (x: Istasyon) => 'makine' | 'insan';
  altSekme: (s: AltSekme) => void;
  ekle: (e: Ekleme) => void;
  sil: (s: Silme) => void;
}
type Ekleme = { tur: 'wc' } | { tur: 'station'; wcId: string } | { tur: 'machine'; istasyon: Istasyon } | { tur: 'person' };
interface Silme { tur: 'wc' | 'station' | 'machine'; id: string; ad: string }

export function Kaynaklar({ veri, yetki }: EkranOzellikleri) {
  const { durum, ek } = veri;
  const [alt, altYaz] = useState<AltSekme>(altSekmeOku);
  const [ekleme, eklemeYaz] = useState<Ekleme | null>(null);
  const [silme, silmeYaz] = useState<Silme | null>(null);
  const { calistir, mesgul } = useR2Komutu();

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
    kapasite: (x) => kapasiteKaynagi(ek.istasyonTipi?.[x.id] ?? null, ek.kapasiteKaynagi?.[x.id] ?? null),
    altSekme: sec, ekle: eklemeYaz, sil: silmeYaz,
  };

  const sekmeler: { anahtar: AltSekme; baslik: string }[] = [
    { anahtar: 'overview', baslik: 'Genel bakış' }, { anahtar: 'shifts', baslik: 'Vardiyalar' },
    { anahtar: 'wcs', baslik: 'İş merkezleri ve istasyonlar' }, { anahtar: 'machines', baslik: `Makineler ${String(bag.machines.length)}` },
    { anahtar: 'people', baslik: `Personel ${String(bag.people.length)}` }, { anahtar: 'plan', baslik: 'Fason ve aparat' },
  ];

  let govde;
  if (istasyonYok && ['overview', 'wcs', 'machines'].includes(alt)) govde = <ErisimYok ad="İstasyonlar" />;
  else if (kisiYok && alt === 'people') govde = <ErisimYok ad="Kişiler" />;
  else if (alt === 'overview') govde = <GenelBakis b={bag} />;
  else if (alt === 'shifts') govde = <Vardiyalar b={bag} />;
  else if (alt === 'wcs') govde = <IsMerkezleri b={bag} />;
  else if (alt === 'machines') govde = <Makineler b={bag} />;
  else if (alt === 'people') govde = <Personel b={bag} />;
  else govde = <FasonVeAparat />;

  const silmeKomutu = { wc: ['is-merkezi-sil', 'İş merkezi silindi.'], station: ['istasyon-sil', 'İstasyon silindi.'], machine: ['makine-sil', 'Makine silindi.'] } as const;
  return (
    <div className="tc-rr2" data-parca="R2">
      <Sekmeler<AltSekme> etiket="Kaynak türü" sekmeler={sekmeler} secili={alt} sec={sec} />
      <p className="tc-rr2-not">{ORTAK_KAYNAK_NOTU}</p>
      <div className="tc-rr2-govde" data-alt={alt}>{govde}</div>
      {ekleme && <EklemeFormu e={ekleme} b={bag} kapat={() => eklemeYaz(null)} />}
      <OnayPenceresi
        acik={silme !== null} baslik="Kayıt silinsin mi?" onayMetni="Sil" tehlikeli yukleniyor={mesgul} vazgec={() => silmeYaz(null)}
        onayla={() => {
          const s = silme;
          silmeYaz(null);
          if (s) void calistir(silmeKomutu[s.tur][0], { id: s.id }, { basari: silmeKomutu[s.tur][1] });
        }}
      >
        <p>{silme?.ad} silinir. Kayıt sahibinin sayfasında da silinmiş olur.</p>
      </OnayPenceresi>
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
        <div className="tc-rr2-seviye"><b>1. İş merkezi</b><p>Bölüm ya da hat: kesimhane, boyahane gibi. Ne zaman çalışılacağını belirler: haftalık vardiya düzeni, tatiller ve o bölümde çalışan personel burada.</p></div>
        <div className="tc-rr2-seviye"><b>2. İstasyon</b><p>Operasyonun yapıldığı yer: fiber lazer, abkant pres gibi. Rota adımında seçilen budur. Saatlik maliyet, verim ve bir makinenin başında kaç operatör gerektiği istasyonda tutulur. Operasyon kataloğundaki her operasyonun varsayılan istasyonu vardır.</p></div>
        <div className="tc-rr2-seviye"><b>3. Makine</b><p>İstasyondaki tek tek ekipman. Plan makine makine yapılır: her makine aynı anda tek iş yapar, farklı makinelerde aynı anda farklı işler çalışabilir. Bakımdaki ya da arızalı makine iş almaz. Makine tanımlanmamışsa istasyonun "paralel adet" kadar makinesi varsayılır.</p></div>
      </div>
      <section className="tc-rr2-grup" aria-label="Planlayıcı bir operasyonu nasıl yerleştirir">
        <h3 className="tc-rr2-grup-baslik"><span>Planlayıcı bir operasyonu nasıl yerleştirir</span></h3>
        <ol className="tc-rr2-liste">
          <li>Rota adımında seçilen istasyonun (ve varsa alternatif istasyonların) aktif makinelerine bakar.</li>
          <li>Her makine için, önceki işi bittikten sonra ilk boş anı bulur. Bu an, makinenin bağlı olduğu iş merkezinin vardiya saatleri içinde olmalıdır; molalar ve tatiller düşülür.</li>
          <li>Personel kısıtı açıksa o gün iş merkezinde vardiyada olan personelin kişi-saati de yetmelidir.</li>
          <li>İşi en erken bitirecek makineyi seçer. Partiyi kendiliğinden makinelere bölmez; bölme yalnız elle yapılır.</li>
          <li>Süre = hazırlık + (işlem + değişim) × miktar ÷ istasyonun verimi. Maliyet = makine saati × istasyonun saatlik maliyeti.</li>
        </ol>
      </section>
      <h3 className="tc-rr2-grup-baslik"><span>Şu anki kaynakların</span></h3>
      {b.wcs.length === 0 && <DurumKutusu durum="bos" mesaj="İş merkezi yok." />}
      {b.wcs.map((w) => {
        const sts = b.stations.filter((x) => x.wcId === w.id);
        const kisi = b.people.filter((p) => p.wcId === w.id && p.active).length;
        const hafta = b.hafta(w.id);
        return (
          <section key={w.id} className="tc-rr2-grup" aria-label={`${w.code} ${w.name}`}>
            <h4 className="tc-rr2-grup-baslik">
              <span>{w.code} {w.name}</span>
              <Rozet ton="pasif">{b.takvimVar ? `${sayi(Math.round(haftaSaati(hafta, b.shifts)))} sa/hafta vardiya` : 'vardiya bağlı değil'}</Rozet>
              <Rozet ton="pasif">{`${String(kisi)} personel`}</Rozet>
              <Dugme simge="clock" onClick={() => b.altSekme('shifts')}>Vardiyalar</Dugme>
            </h4>
            {sts.length === 0 && <p className="tc-rr2-not">İstasyon yok.</p>}
            {sts.map((x) => {
              const ms = b.machines.filter((m) => m.stationId === x.id);
              const ops = operasyonlar(x.id);
              return (
                <div key={x.id} className="tc-rr2-agac-satir">
                  <div>
                    <b>{x.code} {x.name}</b>
                    <small>{` verim %${sayi(x.eff)}, ${sayi(x.opPer ?? 1)} operatör/makine`}</small>
                    <small className="tc-rr2-soluk">{ops.length > 0 ? ops.join(', ') : 'operasyon yok'}</small>
                  </div>
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
          <tr><th scope="col">İş merkezi / vardiya</th>{GUNLER.map(([g, ad]) => <th key={g} scope="col" abbr={GUN_ADI[g]}>{ad}</th>)}<th scope="col">Hafta</th></tr>
        </thead>
        <tbody>
          {b.wcs.map((w) => {
            const hafta = b.hafta(w.id);
            return [
              <tr key={`${w.id}-b`} className="tc-rr2-matris-ust"><th colSpan={9} scope="rowgroup">{w.code} {w.name}</th></tr>,
              ...b.shifts.map((v) => (
                <tr key={`${w.id}-${v.id}`}>
                  <th scope="row">{v.name} <small>{v.start}–{v.end}, net {saat(v.netDakika / 60)} sa</small></th>
                  {GUNLER.map(([g]) => {
                    const acik = (hafta?.[g] ?? []).includes(v.id);
                    return (
                      <td key={g} data-acik={acik || undefined} aria-label={`${w.code} ${GUN_ADI[g]} ${v.name}: ${acik ? 'açık' : 'kapalı'}`}>
                        {acik ? saat(v.netDakika / 60) : ''}
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

function Vardiyalar({ b }: { b: Bag }) {
  const tatiller = [...b.durum.cal.holidays].sort();
  return (
    <>
      <section className="tc-rr2-grup" aria-label="Haftalık vardiya matrisi">
        <h3 className="tc-rr2-grup-baslik"><span>Haftalık vardiya matrisi</span><SahibindeDuzenle sahip="vardiya" /></h3>
        <VardiyaMatrisi b={b} />
        <p className="tc-rr2-not">
          Hücredeki sayı molalar düşülmüş net çalışma saatidir. Resmî tatil ve kapalı günler tüm iş merkezlerinde vardiyayı sıfırlar. Vardiya düzeni
          Vardiya sayfasında değişir.
        </p>
      </section>
      <section className="tc-rr2-grup" aria-label="Vardiya saatleri ve molalar">
        <h3 className="tc-rr2-grup-baslik"><span>Vardiya saatleri ve molalar</span></h3>
        <p className="tc-rr2-not">Kapasite molalar düşülmüş net süreyle hesaplanır. Bitiş başlangıçtan önceyse vardiya gece yarısını geçer ve başladığı güne sayılır.</p>
        {b.shifts.length === 0 && <DurumKutusu durum="bos" mesaj="Vardiya yok." />}
        <div className="tc-rr2-kartlar">
          {b.shifts.map((v) => {
            const brut = aralikDakika(v.start, v.end);
            const mola = v.breaks.reduce((t, m) => t + (aralikDakika(m.start, m.end) ?? 0), 0);
            return (
              <article key={v.id} className="tc-rr2-kart-kutu" aria-label={v.name}>
                <h4>{v.name} <small>{v.start}–{v.end}</small></h4>
                <p><b>{sayi(Math.round((v.netDakika / 60) * 100) / 100)} sa net</b>{' '}
                  <small>{brut === null ? '' : `${sayi(Math.round((brut / 60) * 100) / 100)} sa brüt, `}{sayi(mola)} dk mola{geceyiGecer(v.start, v.end) ? ', gece yarısını geçer' : ''}</small>
                </p>
                {v.breaks.length === 0
                  ? <p className="tc-rr2-soluk">Bu vardiyada mola yok.</p>
                  : <ul className="tc-rr2-liste">{v.breaks.map((m) => <li key={`${m.start}-${m.end}`}>Mola {m.start}–{m.end} <small>{sayi(aralikDakika(m.start, m.end))} dk</small></li>)}</ul>}
              </article>
            );
          })}
        </div>
      </section>
      <section className="tc-rr2-grup" aria-label="Tatiller ve kapalı günler">
        <h3 className="tc-rr2-grup-baslik"><span>Tatiller ve kapalı günler ({tatiller.length})</span></h3>
        {tatiller.length === 0
          ? <p className="tc-rr2-soluk">Tatil eklenmedi.</p>
          : <div className="tc-rr2-satir">{tatiller.map((t) => <Rozet key={t} ton="pasif">{tarih(t)}</Rozet>)}</div>}
        <p className="tc-rr2-not">Ramazan ve Kurban Bayramı tarihleri her yıl değiştiği için onlar Vardiya sayfasında tarih seçilerek eklenir.</p>
      </section>
    </>
  );
}

/* ---------------- İş merkezleri ve istasyonlar ---------------- */

// Kod ve ad boş bırakılamaz (sahibinin kuralı); boş girdi istek atmadan geri alınır.
function useMetinKaydi() {
  const { calistir } = useR2Komutu();
  const { bildir } = useBildirim();
  return async (komut: string, govde: Record<string, unknown>, alan: string, v: string, etiket: string): Promise<boolean> => {
    if (!v.trim()) { bildir('hata', `${etiket} boş olamaz.`); return false; }
    return (await calistir(komut, { ...govde, [alan]: v.trim() })) === null;
  };
}

function IsMerkezleri({ b }: { b: Bag }) {
  const kaydet = useMetinKaydi();
  const yaz = b.yetki.istasyonYaz;
  return (
    <>
      <p className="tc-rr2-not">
        İş merkezi bir bölüm ya da hattır; vardiya düzeni iş merkezinde tutulur. İstasyon, operasyonun yapıldığı makine grubu ya da tezgâhtır. Operatör
        ihtiyacı, istasyonun bir makinesi çalışırken kaç kişinin başında durması gerektiğidir. İstasyonun ₺ / saat değeri: {ISTASYON_MALIYET_NOTU}.
      </p>
      <div className="tc-rr2-arac"><SahibindeDuzenle sahip="istasyon" metin="Verim ve operatörü İstasyonlar'da düzenle" /></div>
      {b.wcs.length === 0 && <DurumKutusu durum="bos" mesaj="İş merkezi yok. Kesimhane, kaynakhane, montaj gibi bölümlerini ekle." />}
      {b.wcs.map((w) => (
        <section key={w.id} className="tc-rr2-grup" aria-label={`${w.code} ${w.name}`}>
          <div className="tc-rr2-baslik-satiri">
            <span className="tc-rr2-alan"><span>Kod</span>
              {yaz ? <SatirGirdisi deger={w.code} etiket="İş merkezi kodu" kaydet={(v) => kaydet('is-merkezi-guncelle', { id: w.id }, 'kod', v, 'Kod')} /> : <b>{w.code}</b>}
            </span>
            <span className="tc-rr2-alan tc-rr2-genis"><span>İş merkezi adı</span>
              {yaz ? <SatirGirdisi deger={w.name} etiket="İş merkezi adı" kaydet={(v) => kaydet('is-merkezi-guncelle', { id: w.id }, 'ad', v, 'Ad')} /> : <b>{w.name}</b>}
            </span>
            <span className="tc-rr2-alan"><span>Haftalık vardiya saati</span>
              {b.takvimVar ? <b>{sayi(Math.round(haftaSaati(b.hafta(w.id), b.shifts) * 10) / 10)} sa</b> : <Rozet ton="pasif">bağlı değil</Rozet>}
            </span>
            {yaz && <Dugme simge="trash" aria-label={`${w.code} iş merkezini sil`} onClick={() => b.sil({ tur: 'wc', id: w.id, ad: `${w.code} ${w.name}` })} />}
          </div>
          <IstasyonTablosu b={b} wc={w} />
          {yaz && <div className="tc-rr2-arac"><Dugme simge="plus" onClick={() => b.ekle({ tur: 'station', wcId: w.id })}>İstasyon</Dugme></div>}
        </section>
      ))}
      {yaz && <div className="tc-rr2-arac"><Dugme simge="plus" tur="birincil" onClick={() => b.ekle({ tur: 'wc' })}>İş merkezi</Dugme></div>}
    </>
  );
}

function IstasyonTablosu({ b, wc }: { b: Bag; wc: IsMerkezi }) {
  const { calistir, mesgul } = useR2Komutu();
  const kaydet = useMetinKaydi();
  const liste = b.stations.filter((x) => x.wcId === wc.id);
  const yaz = b.yetki.istasyonYaz;
  const sutunlar: Sutun<Istasyon>[] = [
    {
      anahtar: 'kod', baslik: 'İstasyon kodu', kirilmaz: true,
      hucre: (x) => (yaz ? <SatirGirdisi deger={x.code} etiket={`${x.code} istasyon kodu`} kaydet={(v) => kaydet('istasyon-guncelle', { id: x.id }, 'kod', v, 'Kod')} /> : x.code),
    },
    {
      anahtar: 'ad', baslik: 'İstasyon adı',
      hucre: (x) => (yaz ? <SatirGirdisi deger={x.name} etiket={`${x.code} istasyon adı`} kaydet={(v) => kaydet('istasyon-guncelle', { id: x.id }, 'ad', v, 'Ad')} /> : x.name),
    },
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
    { anahtar: 'operator', baslik: 'Operatör / makine', hizala: 'sag', hucre: (x) => sayi(x.opPer ?? 1) },
    {
      anahtar: 'kapasite', baslik: 'Kapasite',
      hucre: (x) => {
        const k = b.kapasite(x);
        const secili = b.ek.kapasiteKaynagi?.[x.id] ?? null;
        const alt = k === 'insan' ? `${String(yetkinler(x.id, b.people).length)} yetkin kişi` : `${String(etkinMakine(x.id, x.count, b.machines))} makine`;
        const ad = (v: 'makine' | 'insan') => `${v === 'makine' ? 'Makine saati' : 'Personel saati'}${secili === null && v === k ? ' (türden)' : ''}`;
        return (
          <span className="tc-rr2-satir">
            {yaz
              ? (
                <select
                  className="tc-alan-kutu tc-rr2-girdi" value={k} disabled={mesgul} aria-label={`${x.code} kapasite kaynağı`}
                  onChange={(o) => { void calistir('istasyon-guncelle', { id: x.id, kapasiteKaynagi: o.target.value }); }}
                >
                  <option value="makine">{ad('makine')}</option>
                  <option value="insan">{ad('insan')}</option>
                </select>
              )
              : ad(k)}
            <small className="tc-rr2-soluk">{alt}</small>
          </span>
        );
      },
    },
    {
      anahtar: 'eylem', baslik: 'Eylem', csv: false,
      hucre: (x) => (yaz ? <Dugme simge="trash" aria-label={`${x.code} istasyonunu sil`} onClick={() => b.sil({ tur: 'station', id: x.id, ad: `${x.code} ${x.name}` })} /> : null),
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
  const kaydet = useMetinKaydi();
  const yaz = b.yetki.istasyonYaz;
  // Makinede şu an çalışan adım sunucunun başlamış adımlarındandır (emir no ve OP no).
  const calisan = (makineId: string) => {
    const a = (b.durum.calisanAdimlar ?? []).find((x) => x.makineId === makineId);
    return a ? a.anahtar.replace('|', ' OP ') : 'Boşta';
  };
  const sutunlar: Sutun<Makine>[] = [
    { anahtar: 'durum', baslik: 'Durum', hucre: (m) => <Rozet ton={MAKINE_DURUMU[m.status].ton}>{MAKINE_DURUMU[m.status].ad}</Rozet>, csv: (m) => MAKINE_DURUMU[m.status].ad },
    {
      anahtar: 'kod', baslik: 'Makine kodu', kirilmaz: true,
      hucre: (m) => (yaz ? <SatirGirdisi deger={m.code} etiket={`${m.code} makine kodu`} kaydet={(v) => kaydet('makine-guncelle', { id: m.id }, 'kod', v, 'Kod')} /> : m.code),
    },
    {
      anahtar: 'ad', baslik: 'Makine adı',
      hucre: (m) => (yaz ? <SatirGirdisi deger={m.name} etiket={`${m.code} makine adı`} kaydet={(v) => kaydet('makine-guncelle', { id: m.id }, 'ad', v, 'Ad')} /> : m.name),
    },
    { anahtar: 'not', baslik: 'Not', hucre: (m) => b.ek.makineNotu?.[m.id] ?? YOK },
    { anahtar: 'simdi', baslik: 'Şu an', hucre: (m) => calisan(m.id) },
    {
      anahtar: 'eylem', baslik: 'Eylem', csv: false,
      hucre: (m) => (yaz ? <Dugme simge="trash" aria-label={`${m.code} makinesini sil`} onClick={() => b.sil({ tur: 'machine', id: m.id, ad: `${m.code} ${m.name}` })} /> : null),
    },
  ];
  return (
    <>
      <p className="tc-rr2-not">
        Makine, istasyondaki tek tek ekipmandır. Bir istasyonda makine tanımlıysa istasyonun paralel kapasitesi aktif makine sayısı kadar olur; bakımdaki ya da
        arızalı makine kapasiteden düşer ve plan buna göre kayar. Makine durumu ve notu İstasyonlar sayfasında değişir.
      </p>
      <div className="tc-rr2-arac"><SahibindeDuzenle sahip="makine" metin="Durum ve notu İstasyonlar'da düzenle" /></div>
      {b.wcs.map((w) => {
        const sts = b.stations.filter((x) => x.wcId === w.id);
        if (sts.length === 0) return null;
        return (
          <section key={w.id} className="tc-rr2-grup" aria-label={`${w.code} ${w.name} makineleri`}>
            <h3 className="tc-rr2-grup-baslik"><span>{w.code} {w.name}</span></h3>
            {sts.map((x) => {
              const ms = b.machines.filter((m) => m.stationId === x.id);
              return (
                <div key={x.id} className="tc-rr2-alt-grup">
                  <h4 className="tc-rr2-grup-baslik">
                    <span>{x.code} {x.name}</span>
                    <small className="tc-rr2-soluk">
                      {ms.length > 0 ? `${String(ms.length)} makine, ${String(etkinMakine(x.id, x.count, b.machines))} aktif` : `Makine yok, paralel adet ${String(x.count)} kullanılıyor`}
                    </small>
                    {yaz && <Dugme simge="plus" onClick={() => b.ekle({ tur: 'machine', istasyon: x })}>Makine</Dugme>}
                  </h4>
                  {ms.length > 0 && <Tablo<Makine> etiket={`${x.code} makineleri`} sutunlar={sutunlar} satirlar={ms} satirAnahtari={(m) => m.id} />}
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
        Personel bir iş merkezine ve vardiyaya bağlıdır; yetkin olduğu istasyonları işaretle. Plan, istasyonların çalıştığı saatleri operatör ihtiyacıyla çarpar ve o gün
        vardiyada olan personelin net saatiyle karşılaştırır. Saatlik ücret girersen işçilik maliyeti emir maliyetine eklenir.
      </p>
      <section className="tc-rr2-grup" aria-label="Vardiya başına personel">
        <h3 className="tc-rr2-grup-baslik"><span>Vardiya başına personel</span><SahibindeDuzenle sahip="personel" /></h3>
        {b.takvimVar
          ? (
            <div className="tc-rr2-kaydir">
              <table className="tc-rr2-matris" aria-label="Vardiya başına personel">
                <thead><tr><th scope="col">İş merkezi</th>{b.shifts.map((v) => <th key={v.id} scope="col">{v.name} <small>{v.start}–{v.end}</small></th>)}<th scope="col">Toplam</th></tr></thead>
                <tbody>
                  {b.wcs.map((w) => {
                    const kisiler = b.people.filter((p) => p.wcId === w.id && p.active);
                    return (
                      <tr key={w.id}>
                        <th scope="row">{w.code} {w.name}</th>
                        {b.shifts.map((v) => {
                          const n = kisiler.filter((p) => vardiyasi(p) === v.id);
                          return <td key={v.id} title={n.map((p) => p.name).join(', ')}>{n.length > 0 ? String(n.length) : YOK}</td>;
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
              Kişilerin vardiyası Vardiya sayfasında atanır; atanmamış kişi istasyonunun iş merkezinin vardiyasında çalışır. Kişinin istasyonu Vardiya'daki istasyon
              atamasından, yoksa yetkin olduğu istasyondan gelir.
            </p>
          )}
      </section>
      {b.yetki.kisiYaz && <div className="tc-rr2-arac"><Dugme simge="user-plus" tur="birincil" onClick={() => b.ekle({ tur: 'person' })}>Personel</Dugme></div>}
      {gruplar.map(({ w, liste }) => (
        <section key={w?.id ?? 'yok'} className="tc-rr2-grup" aria-label={w ? `${w.code} ${w.name} personeli` : 'İş merkezi atanmamış personel'}>
          <h3 className="tc-rr2-grup-baslik"><span>{w ? `${w.code} ${w.name}` : 'İş merkezi atanmamış'}</span><Rozet ton="pasif">{`${String(liste.length)} kişi`}</Rozet></h3>
          {liste.length === 0 && <p className="tc-rr2-soluk">Bu iş merkezinde personel yok.</p>}
          <div className="tc-rr2-kartlar">{liste.map((k) => <KisiKarti key={k.id} k={k} w={w} b={b} />)}</div>
        </section>
      ))}
    </>
  );
}

function KisiKarti({ k, w, b }: { k: Kisi; w: IsMerkezi | null; b: Bag }) {
  const { calistir, mesgul } = useR2Komutu();
  const kaydet = useMetinKaydi();
  const yaz = b.yetki.kisiYaz;
  const yetkinlikYaz = b.yetki.istasyonYaz;
  const kendi = w ? b.stations.filter((x) => x.wcId === w.id) : [];
  const disari = k.skills.filter((id) => !kendi.some((x) => x.id === id)).map((id) => b.stations.find((x) => x.id === id)).filter((x): x is Istasyon => x !== undefined);
  const eklenebilir = b.stations.filter((x) => !kendi.includes(x) && !k.skills.includes(x.id));
  const istasyon = k.stationId ? b.stations.find((x) => x.id === k.stationId) : undefined;
  const vardiyaId = b.ek.takvim?.kisiVardiyasi[k.id] ?? null;
  const vardiya = vardiyaId ? b.shifts.find((v) => v.id === vardiyaId) : undefined;
  const yetkinlik = (istasyonIdleri: number[]) => { void calistir('yetkinlik-belirle', { kisiId: k.id, istasyonIdleri }); };
  return (
    <article className="tc-rr2-kart-kutu" data-pasif={!k.active || undefined} aria-label={k.name}>
      <div className="tc-rr2-kisi">
        <span className="tc-rr2-avatar" aria-hidden="true">{basHarfler(k.name)}</span>
        <div className="tc-rr2-kisi-alanlar">
          <span className="tc-rr2-alan"><span>Sicil</span>
            {yaz ? <SatirGirdisi deger={k.code ?? ''} etiket={`${k.name} sicil`} kaydet={async (v) => (await calistir('kisi-duzenle', { id: k.id, sicilNo: v.trim() || null })) === null} /> : <b>{k.code ?? YOK}</b>}
          </span>
          <span className="tc-rr2-alan tc-rr2-genis"><span>Ad soyad</span>
            {yaz ? <SatirGirdisi deger={k.name} etiket={`${k.name} ad soyad`} kaydet={(v) => kaydet('kisi-duzenle', { id: k.id }, 'ad', v, 'Ad')} /> : <b>{k.name}</b>}
          </span>
          <span className="tc-rr2-alan"><span>Görev</span><b>{b.ek.kisiGorevi?.[k.id] ?? YOK}</b></span>
          <span className="tc-rr2-alan"><span>İstasyon</span>
            <b title={k.stationAtama ? 'Vardiya sayfasındaki istasyon ataması' : 'Atama yok; yetkin olduğu ilk istasyon'}>
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
        {[...kendi, ...disari].map((x) => {
          const acik = k.skills.includes(x.id);
          return yetkinlikYaz
            ? <Dugme key={x.id} aria-pressed={acik} disabled={mesgul} onClick={() => yetkinlik(yetkinlikDegistir(k.skills, x.id))}>{x.code} {x.name}</Dugme>
            : acik ? <Rozet key={x.id} ton="bilgi">{x.code} {x.name}</Rozet> : null;
        })}
        {yetkinlikYaz && eklenebilir.length > 0 && (
          <select
            className="tc-alan-kutu tc-rr2-girdi" value="" disabled={mesgul} aria-label={`${k.name} için başka istasyon yetkinliği ekle`}
            onChange={(o) => { if (o.target.value) yetkinlik([...k.skills, o.target.value].map(Number)); }}
          >
            <option value="">+ Başka istasyon</option>
            {eklenebilir.map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
          </select>
        )}
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

/* ---------------- Ekleme formu ---------------- */

const FORM = {
  wc: { baslik: 'Yeni iş merkezi', eklendi: 'İş merkezi eklendi.', ad: 'İş merkezi adı' },
  station: { baslik: 'Yeni istasyon', eklendi: 'İstasyon eklendi.', ad: 'İstasyon adı' },
  machine: { baslik: 'Yeni makine', eklendi: 'Makine eklendi.', ad: 'Makine adı' },
  person: { baslik: 'Yeni personel', eklendi: 'Personel eklendi.', ad: 'Ad soyad' },
} as const;

function EklemeFormu({ e, b, kapat }: { e: Ekleme; b: Bag; kapat: () => void }) {
  const { calistir, mesgul } = useR2Komutu();
  const { bildir } = useBildirim();
  const oneri = e.tur === 'wc' ? sonrakiKod(b.wcs.map((w) => w.code), 'IM')
    : e.tur === 'station' ? sonrakiKod(b.stations.map((x) => x.code), 'IS', 1)
    : e.tur === 'machine' ? `${e.istasyon.code}-${String(b.machines.filter((m) => m.stationId === e.istasyon.id).length + 1).padStart(2, '0')}`
    : '';
  const [kod, kodYaz] = useState(oneri);
  const [ad, adYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const f = FORM[e.tur];

  const gonder = async (o: FormEvent) => {
    o.preventDefault();
    if (mesgul) return;
    let komut: string;
    let govde: Record<string, unknown>;
    if (e.tur === 'person') {
      if (!ad.trim()) { hataYaz('Ad soyad boş olamaz.'); return; }
      komut = 'kisi-ekle';
      govde = { ad: ad.trim(), sicilNo: kod.trim() || null };
    } else {
      if (!kod.trim() || !ad.trim()) { hataYaz('Kod ve ad boş olamaz.'); return; }
      const ortak = { kod: kod.trim(), ad: ad.trim() };
      if (e.tur === 'wc') { komut = 'is-merkezi-ekle'; govde = ortak; }
      else if (e.tur === 'station') { komut = 'istasyon-ekle'; govde = { ...ortak, isMerkeziId: Number(e.wcId) }; }
      else { komut = 'makine-ekle'; govde = { ...ortak, istasyonId: Number(e.istasyon.id) }; }
    }
    const h = await calistir(komut, govde, { sessiz: true });
    if (h === null) { bildir('tamam', f.eklendi); kapat(); }
    else hataYaz(h.ileti);
  };

  return (
    <Pencere
      acik kapat={kapat} baslik={f.baslik}
      alt={(
        <>
          <Dugme onClick={kapat} disabled={mesgul}>Vazgeç</Dugme>
          <Dugme tur="birincil" type="submit" form="tc-rr2-ekleme" yukleniyor={mesgul}>Kaydet</Dugme>
        </>
      )}
    >
      <form id="tc-rr2-ekleme" className="tc-rr2-form" aria-label={f.baslik} noValidate onSubmit={(o) => { void gonder(o); }}>
        {e.tur === 'person'
          ? (
            <>
              <Girdi etiket="Ad soyad" value={ad} onChange={(o) => adYaz(o.target.value)} autoComplete="off" required />
              <Girdi etiket="Sicil no (isteğe bağlı)" value={kod} onChange={(o) => kodYaz(o.target.value)} autoComplete="off" />
            </>
          )
          : (
            <>
              <Girdi etiket="Kod" value={kod} onChange={(o) => kodYaz(o.target.value)} autoComplete="off" required />
              <Girdi etiket={f.ad} value={ad} onChange={(o) => adYaz(o.target.value)} autoComplete="off" required />
            </>
          )}
        {hata !== null && <p className="tc-rr2-uyari" role="alert">{hata}</p>}
      </form>
    </Pencere>
  );
}
