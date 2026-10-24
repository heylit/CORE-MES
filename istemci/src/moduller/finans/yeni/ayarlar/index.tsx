import { useRef, useState, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dugme, Girdi, Kart, OnayPenceresi, Rozet, Secim, Sekmeler, type Secenek, type Sekme } from '../../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { yeniIstekKimligi } from '../../../../ortak/veri/istek-kimligi.ts';
import { tl } from '../bicim.ts';
import { KAT_KOD, sayi, type DuzenliKayit, type FinansAyari, type KategoriKodu } from '../donustur.ts';
import { CATS, fmtK, gross, pct, SECTORS, SUBS, sum } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import type { FinansVerisi, FinansYetkisi } from '../veri.ts';
import { onerilenEsik, type AyarDegisikligi } from './ayar-govdesi.ts';
import { csvdenBelgeler, SABLON_BASLIKLARI, SABLON_SATIRLARI, type CsvSonucu } from './csv.ts';
import { useAyarGonder } from './gonder.ts';
import { ayarKomutu, duzenliEkleKomutu, duzenliGuncelleKomutu, duzenliKaldirKomutu, kurulumKomutlari, topluAktarKomutu, type DuzenliAlani } from './komutlar.ts';
import { HesaplarSekmesi, KdvSekmesi, KurFaizSekmesi, SabitKiymetSekmesi } from './tablolar.tsx';
import './ayarlar.css';

// Finans ayarları (prototip ayar + tam kip sekmeleri). Ayar alanı değişince prototipteki gibi kısa bir bekleyişten sonra
// kaydedilir; sunucu sürümü denetler. Yazma düğmeleri yetkiye göre gizlenir, asıl denetim uçtadır.

export type AyarSekmesi = 'sirket' | 'nakit' | 'danisman' | 'veri' | 'hesaplar' | 'kdv' | 'kurlar' | 'sabit' | 'kurulum';
export const AYAR_SEKMELERI: readonly Sekme<AyarSekmesi>[] = [
  { anahtar: 'sirket', baslik: 'Şirket', simge: 'building' },
  { anahtar: 'nakit', baslik: 'Nakit ve düzenli ödemeler', simge: 'lira' },
  { anahtar: 'danisman', baslik: 'Analiz ayarları', simge: 'gauge' },
  { anahtar: 'veri', baslik: 'Veri aktarımı', simge: 'upload' },
  { anahtar: 'hesaplar', baslik: 'Hesaplar', simge: 'list' },
  { anahtar: 'kdv', baslik: 'KDV oranları', simge: 'file' },
  { anahtar: 'kurlar', baslik: 'Kurlar ve faiz', simge: 'chart' },
  { anahtar: 'sabit', baslik: 'Sabit kıymetler', simge: 'cpu' },
  { anahtar: 'kurulum', baslik: 'İlk kurulum', simge: 'check' },
];
const sekmeMi = (s: string | null): s is AyarSekmesi => AYAR_SEKMELERI.some((x) => x.anahtar === s);

export function Ayarlar({ finans, yetki, kayitGir }: EkranOzellikleri) {
  const [ara, araYaz] = useSearchParams();
  if (!finans) return null;
  const istenen = ara.get('sekme');
  // Kurulum yapılmadıysa ilk açılış İlk kurulum'dadır (prototipteki gibi).
  const secili: AyarSekmesi = sekmeMi(istenen) ? istenen : finans.V.ayar.kurulumTamam ? 'sirket' : 'kurulum';
  const sec = (a: AyarSekmesi) => araYaz((o) => { const y = new URLSearchParams(o); y.set('sekme', a); return y; }, { replace: true });
  const ozellik = { finans, yetki, kayitGir };
  return (
    <div className="tc-fa-ayar">
      <Sekmeler<AyarSekmesi> etiket="Ayar bölümleri" sekmeler={AYAR_SEKMELERI} secili={secili} sec={sec} />
      {/* Sürüm değişince alanlar sunucudaki son değerle yeniden kurulur. */}
      <div className="tc-fa-ayar-govde" key={`${secili}-${finans.V.ayar.surum}`}>
        {secili === 'sirket' && <SirketSekmesi {...ozellik} sec={sec} />}
        {secili === 'nakit' && <NakitSekmesi {...ozellik} />}
        {secili === 'danisman' && <AnalizSekmesi {...ozellik} />}
        {secili === 'veri' && <VeriSekmesi {...ozellik} />}
        {secili === 'hesaplar' && <HesaplarSekmesi finans={finans} yetki={yetki} />}
        {secili === 'kdv' && <KdvSekmesi finans={finans} yetki={yetki} />}
        {secili === 'kurlar' && <KurFaizSekmesi finans={finans} yetki={yetki} />}
        {secili === 'sabit' && <SabitKiymetSekmesi finans={finans} yetki={yetki} />}
        {secili === 'kurulum' && <IlkKurulumSekmesi {...ozellik} sec={sec} />}
      </div>
    </div>
  );
}

interface SekmeOzellikleri { finans: FinansVerisi; yetki: FinansYetkisi; kayitGir: EkranOzellikleri['kayitGir'] }

// Ayar alanlarının kaydı: değişiklikler 500 ms içinde birleşir ve tek istekle gider (prototip ayarKaydetGecikmeli).
function useAyarKaydi(finans: FinansVerisi) {
  const { gonder } = useAyarGonder();
  const bekleyen = useRef<AyarDegisikligi>({});
  const zaman = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (ek: AyarDegisikligi) => {
    bekleyen.current = { ...bekleyen.current, ...ek };
    if (zaman.current) clearTimeout(zaman.current);
    zaman.current = setTimeout(() => {
      const d = bekleyen.current;
      bekleyen.current = {};
      void gonder([ayarKomutu(finans.V.ayar, finans.V.sirketAdi, d)]);
    }, 500);
  };
}

const secenekler = (l: readonly (readonly [number | string, string])[]): Secenek[] => l.map(([d, b]) => ({ deger: String(d), baslik: b }));
const bosIseNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/* ---------- Şirket ---------- */
function SirketSekmesi({ finans, yetki, sec }: SekmeOzellikleri & { sec: (a: AyarSekmesi) => void }) {
  const { V } = finans;
  const a = V.ayar, kaydet = useAyarKaydi(finans);
  const kilitli = V.sirketAdi !== null;
  const t = SECTORS[a.sektor]?.t ?? SECTORS.genel!.t;
  return (
    <Kart baslik="Şirket" baslikEki={<span className="tc-fa-soluk">Sektör seçimi, oranların hangi eşiklerle puanlanacağını belirler.</span>}>
      <div className="tc-fa-ayar-izgara">
        <Girdi etiket="Şirket adı" defaultValue={kilitli ? V.sirketAdi! : a.sirketAdi} readOnly={kilitli || !yetki.yonet} maxLength={200}
          ipucu={kilitli ? "Satın Alma > Ayarlar'dan değiştirilir." : undefined}
          onBlur={(e) => { const v = e.target.value.trim(); if (!kilitli && v && v !== a.sirketAdi) kaydet({ sirketAdi: v }); }} />
        <Secim etiket="Sektör" defaultValue={a.sektor} disabled={!yetki.yonet} secenekler={Object.entries(SECTORS).map(([k, s]) => ({ deger: k, baslik: s.ad }))}
          onChange={(e) => kaydet({ sektor: e.target.value as FinansAyari['sektor'] })} />
      </div>
      <div className="tc-fa-ayar-arac">
        <Dugme simge="check" onClick={() => sec('kurulum')}>İlk kurulum</Dugme>
      </div>
      <p className="tc-fa-not">Seçili sektörde örneğin tahsil süresi hedefi {t.dso[1]} gün, net marj hedefi {pct(t.marj[1], 0)}.</p>
    </Kart>
  );
}

/* ---------- Nakit ve düzenli ödemeler ---------- */
const DUZENLI_KATEGORILERI: Secenek[] = CATS.gider.filter((c) => KAT_KOD[c.k] !== 'kur_farki_gideri').map((c) => ({ deger: KAT_KOD[c.k]!, baslik: c.k }));
const KDV_SECENEKLERI = secenekler([[0, 'Yok'], [20, '%20'], [10, '%10']]);

function NakitSekmesi({ finans, yetki, kayitGir }: SekmeOzellikleri) {
  const { V, motor } = finans;
  const a = V.ayar, kaydet = useAyarKaydi(finans);
  const { gonder, mesgul } = useAyarGonder();
  const [kaldirilan, kaldirilanYaz] = useState<DuzenliKayit | null>(null);
  const aylikSabit = sum(motor.durum.recurring, (r) => Number(r.amount) || 0);
  const duzenliler = V.duzenliOdemeler.filter((d) => d.aktif);
  const yonet = yetki.yonet;
  const alanDegisti = (dz: DuzenliKayit, alan: DuzenliAlani) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    void gonder([duzenliGuncelleKomutu(dz, alan, e.target.value)]);
  };
  return (
    <>
      <Kart baslik="Nakit" baslikEki={<span className="tc-fa-soluk">Bugünkü nakit hesapların toplamıdır; hesaplar Hesaplar sekmesinden yönetilir.</span>}>
        <div className="tc-fa-ayar-izgara">
          <Girdi etiket="Beklenen aylık satış (KDV hariç)" type="number" min="0" step="10000" inputMode="decimal" disabled={!yonet}
            ipucu="Satış geçmişi 3 aydan azken nakit tahmini bu varsayımı kullanır. Yeterli kayıt birikince otomatik olarak gerçek veriye geçilir."
            defaultValue={sayi(a.beklenenAylikSatis) || ''} onBlur={(e) => kaydet({ beklenenAylikSatis: bosIseNull(e.target.value) })} />
          <Girdi etiket="Müşteriler kaç günde öder?" type="number" min="0" max="365" step="5" disabled={!yonet} ipucu="Geçmiş yokken yeni satışların tahsil süresi için kullanılır."
            defaultValue={a.beklenenTahsilGunu ?? 30} onBlur={(e) => kaydet({ beklenenTahsilGunu: bosIseNull(e.target.value) })} />
          <Girdi etiket="Güvenlik eşiği" type="number" min="0" step="10000" inputMode="decimal" disabled={!yonet}
            ipucu="Nakdin altına düşmesini istemediğiniz tutar. Genellikle 1 aylık sabit gider kadar tutulması önerilir."
            defaultValue={sayi(a.nakitEsigi)} onBlur={(e) => kaydet({ nakitEsigi: sayi(e.target.value) })} />
        </div>
        <div className="tc-fa-ayar-arac">
          <span className="tc-fa-soluk">Hesaplanan bugünkü nakit: <b>{tl(motor.cashToday())}</b>.</span>
          {yetki.yaz && <Dugme onClick={() => kayitGir('banka')}>Gerçek bakiyeyle eşitle</Dugme>}
          {yonet && aylikSabit > 0 && <Dugme onClick={() => kaydet({ nakitEsigi: onerilenEsik(aylikSabit) })}>Eşiği 1 aylık sabit gidere ({fmtK(aylikSabit)}) ayarla</Dugme>}
        </div>
      </Kart>

      <Kart baslik="Düzenli ödemeler" baslikEki={<span className="tc-fa-soluk">Her ay aynı gün tekrar eden ödemeler; nakit tahminlerine otomatik girer.</span>}
        sag={yonet ? <Dugme simge="plus" yukleniyor={mesgul} onClick={() => void gonder([duzenliEkleKomutu()])}>Düzenli ödeme ekle</Dugme> : undefined}>
        {duzenliler.length === 0 && <p className="tc-fa-soluk">Henüz düzenli ödeme yok.</p>}
        <ul className="tc-fa-duzenli">
          {duzenliler.map((dz) => (
            <li key={`${dz.id}-${dz.surum}`} className="tc-fa-duzenli-satir">
              <Girdi etiket="Ad" defaultValue={dz.ad} maxLength={100} disabled={!yonet} onBlur={(e) => { if (e.target.value !== dz.ad) alanDegisti(dz, 'ad')(e); }} />
              <Secim etiket="Kategori" defaultValue={dz.kategori} disabled={!yonet} secenekler={DUZENLI_KATEGORILERI} onChange={alanDegisti(dz, 'kategori')} />
              <Girdi etiket="Tutar (KDV dahil)" type="number" min="0" step="1000" inputMode="decimal" defaultValue={sayi(dz.tutar)} disabled={!yonet}
                onBlur={(e) => { if (sayi(e.target.value) !== sayi(dz.tutar)) alanDegisti(dz, 'tutar')(e); }} />
              <Secim etiket="İçindeki KDV" defaultValue={String(sayi(dz.kdvOrani))} disabled={!yonet} secenekler={KDV_SECENEKLERI} onChange={alanDegisti(dz, 'kdvOrani')} />
              <Girdi etiket="Ayın günü" type="number" min="1" max="31" defaultValue={dz.ayinGunu} disabled={!yonet}
                onBlur={(e) => { if (sayi(e.target.value) !== dz.ayinGunu) alanDegisti(dz, 'ayinGunu')(e); }} />
              {yonet && <Dugme tur="tehlike" simge="trash" onClick={() => kaldirilanYaz(dz)}>Kaldır</Dugme>}
            </li>
          ))}
        </ul>
      </Kart>
      <OnayPenceresi acik={kaldirilan !== null} baslik="Düzenli ödemeyi kaldır" onayMetni="Kaldır" tehlikeli yukleniyor={mesgul}
        onayla={() => { if (kaldirilan) void gonder([duzenliKaldirKomutu(kaldirilan)]).then(() => kaldirilanYaz(null)); }} vazgec={() => kaldirilanYaz(null)}>
        <p>{kaldirilan?.ad} nakit tahmininden çıkar. Geçmiş ödemeler silinmez.</p>
      </OnayPenceresi>
    </>
  );
}

/* ---------- Analiz ayarları ---------- */
function AnalizSekmesi({ finans, yetki }: SekmeOzellikleri) {
  const { V, motor } = finans;
  const a = V.ayar, kaydet = useAyarKaydi(finans);
  const A = motor.runAnalysis();
  const yonet = yetki.yonet;
  const agirlik: Record<string, keyof AyarDegisikligi> = {
    likidite: 'agirlikLikidite', nakit: 'agirlikNakit', karlilik: 'agirlikKarlilik', verimlilik: 'agirlikVerimlilik', borcluluk: 'agirlikBorcluluk',
  };
  const toplam = SUBS.reduce((t, [k]) => t + Number(a[agirlik[k] as keyof FinansAyari] ?? 0), 0);
  return (
    <Kart baslik="Danışman ve analiz motoru" baslikEki={<span className="tc-fa-soluk">Varsayılanlar çoğu KOBİ için uygundur. Değiştirdiğinizde skor ve bulgular yeniden hesaplanır.</span>}>
      <div className="tc-fa-ayar-izgara">
        <Secim etiket="Nakit risk toleransı" defaultValue={String(a.riskToleransi)} disabled={!yonet}
          ipucu="Nakdin eksiye düşme olasılığı bu değeri aşarsa kritik uyarı verilir. Temkinli işletmeler %1–5 seçer."
          secenekler={secenekler([[1, '%1 (çok temkinli)'], [5, '%5 (önerilen)'], [10, '%10'], [20, '%20 (risk alan)']])}
          onChange={(e) => kaydet({ riskToleransi: Number(e.target.value) })} />
        <Secim etiket="Simülasyon sayısı" defaultValue={String(a.simulasyonSayisi)} disabled={!yonet}
          ipucu="Daha fazla senaryo daha kararlı olasılıklar verir ama daha yavaş hesaplanır."
          secenekler={secenekler([[500, '500 (hızlı)'], [1000, '1.000 (önerilen)'], [3000, '3.000 (hassas)']])}
          onChange={(e) => kaydet({ simulasyonSayisi: Number(e.target.value) })} />
        <Girdi etiket="Çek karşılıksız çıkma olasılığı (%)" type="number" min="0" max="50" step="0.5" defaultValue={sayi(a.cekKarsiliksizOlasiligi)} disabled={!yonet}
          ipucu="Simülasyonda portföydeki her çekin karşılıksız çıkma olasılığı."
          onBlur={(e) => kaydet({ cekKarsiliksizOlasiligi: sayi(e.target.value) })} />
        <Secim etiket="Batık sayılma süresi" defaultValue={String(a.batikGunu)} disabled={!yonet}
          ipucu="Vadesinden bu kadar gün geçmiş alacak Markov modelinde tahsil edilemez kabul edilir."
          secenekler={secenekler([[120, '120 gün'], [180, '180 gün (önerilen)'], [365, '365 gün']])}
          onChange={(e) => kaydet({ batikGunu: Number(e.target.value) })} />
        <Secim etiket="Anomali hassasiyeti" defaultValue={String(sayi(a.anomaliEsigi))} disabled={!yonet}
          ipucu="Değiştirilmiş z-puanı eşiği. Düşük eşik daha çok uyarı üretir."
          secenekler={secenekler([[3, 'Yüksek (3,0)'], [3.5, 'Normal (3,5)'], [4.5, 'Düşük (4,5)']])}
          onChange={(e) => kaydet({ anomaliEsigi: Number(e.target.value) })} />
      </div>
      <h3 className="tc-fa-ayar-alt">Sağlık skoru ağırlıkları</h3>
      <p className="tc-fa-not">Genel skor, beş alt skorun ağırlıklı ortalamasıdır. Ağırlıkların toplamı 100 olmak zorunda değildir; oranlar kullanılır. Şu anki toplam {toplam}.</p>
      <div className="tc-fa-ayar-izgara">
        {SUBS.map(([k, l, d]) => {
          const alan = agirlik[k]!;
          const simdi = A.subs[k];
          return (
            <Girdi key={k} etiket={l} type="number" min="0" max="100" step="5" disabled={!yonet} defaultValue={Number(a[alan as keyof FinansAyari])}
              ipucu={`${d} · şu an ${simdi === null ? '—' : Math.round(simdi)}`}
              onBlur={(e) => kaydet({ [alan]: Math.min(100, Math.max(0, Math.round(sayi(e.target.value)))) })} />
          );
        })}
      </div>
    </Kart>
  );
}

/* ---------- Veri aktarımı ---------- */
// CSV'deki kategori metni (prototip etiketi) sunucu koduna; tanınmazsa o yönün ilk kategorisi.
const kategoriKodu = (yon: 'gelir' | 'gider', etiket: string): KategoriKodu => {
  const kod = KAT_KOD[etiket];
  return kod && CATS[yon].some((c) => c.k === etiket) ? kod : KAT_KOD[CATS[yon][0]!.k]!;
};
// FileReader: Blob.text() her tarayıcıda (ve test ortamında) yok.
const dosyaMetni = (f: Blob): Promise<string> => new Promise((coz, red) => {
  const r = new FileReader();
  r.onload = () => coz(String(r.result ?? ''));
  r.onerror = () => red(r.error ?? new Error('Dosya okunamadı.'));
  r.readAsText(f);
});
const DURUM_METNI = { acik: 'açık', odendi: 'ödendi', cek: 'çek' } as const;
const tarihTr = (s: string | null | undefined) => (s ? s.split('-').reverse().join('.') : '');

function VeriSekmesi({ finans, yetki }: SekmeOzellikleri) {
  const { motor } = finans;
  const { gonder, mesgul } = useAyarGonder();
  const [okunan, okunanYaz] = useState<CsvSonucu | null>(null);
  const [ileti, iletiYaz] = useState<string | null>(null);
  const dosya = useRef<HTMLInputElement>(null);
  const [istekKimligi, istekYaz] = useState(yeniIstekKimligi);
  const sec = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    okunanYaz(csvdenBelgeler(await dosyaMetni(f), kategoriKodu));
    iletiYaz(null);
  };
  const aktar = async () => {
    if (!okunan?.ok.length) return;
    if (await gonder([topluAktarKomutu(okunan.ok)], istekKimligi)) {
      iletiYaz(`${okunan.ok.length} belge aktarıldı.`);
      okunanYaz(null);
      istekYaz(yeniIstekKimligi());
      if (dosya.current) dosya.current.value = '';
    }
  };
  const kayitlariIndir = () => csvIndir('finans-kayitlar', ['Tarih', 'Tür', 'Kategori', 'Cari', 'Açıklama', 'KDV hariç', 'KDV %', 'KDV dahil', 'Vade', 'Durum', 'Ödeme tarihi'],
    motor.durum.tx.map((t) => [tarihTr(t.date), t.type, t.cat, t.party, t.desc ?? '', t.amount, t.kdv ?? 0, Math.round(gross(t) * 100) / 100, tarihTr(t.due), DURUM_METNI[t.status], tarihTr(t.paidDate)]));
  return (
    <Kart baslik="Veri: içe ve dışa aktarma" baslikEki={<span className="tc-fa-soluk">Muhasebe programınızdan aldığınız kayıtları CSV ile toplu aktarabilirsiniz.</span>}>
      <div className="tc-fa-ayar-iki">
        <section aria-label="CSV içe aktar">
          <h3 className="tc-fa-ayar-alt">CSV içe aktar</h3>
          <p className="tc-fa-not">Sütunlar: Tarih, Tür (gelir/gider), Kategori, Cari, Açıklama, KDV hariç, KDV %, Vade, Durum, Ödeme tarihi. Noktalı virgül veya virgül ayraçlı olabilir; tarihler GG.AA.YYYY veya YYYY-AA-GG. Yalnız açık belge açılır; firma adı tam eşleşmelidir.</p>
          <div className="tc-fa-ayar-arac">
            {yetki.yonet && (
              <label className="tc-fa-dosya">
                <span className="tc-dugme tc-dugme-ikincil tc-dugme-normal">CSV dosyası seç</span>
                <input ref={dosya} type="file" accept=".csv,text/csv" onChange={(e) => void sec(e)} />
              </label>
            )}
            <Dugme simge="download" onClick={() => csvIndir('finans-sablon', SABLON_BASLIKLARI, SABLON_SATIRLARI)}>Şablonu indir</Dugme>
          </div>
          {okunan && (
            <div className="tc-fa-ayar-onizleme" role="status">
              <p>{okunan.ok.length} kayıt okunmaya hazır{okunan.bad.length ? `, ${okunan.bad.length} satır atlanacak (${okunan.bad.slice(0, 3).join('; ')}${okunan.bad.length > 3 ? '…' : ''})` : ''}.</p>
              <div className="tc-fa-ayar-arac">
                {okunan.ok.length > 0 && <Dugme tur="birincil" simge="upload" yukleniyor={mesgul} onClick={() => void aktar()}>{okunan.ok.length} kaydı içe aktar</Dugme>}
                <Dugme onClick={() => { okunanYaz(null); if (dosya.current) dosya.current.value = ''; }}>Vazgeç</Dugme>
              </div>
            </div>
          )}
          {ileti && <p className="tc-fa-not" role="status">{ileti}</p>}
        </section>
        <section aria-label="Dışa aktar">
          <h3 className="tc-fa-ayar-alt">Dışa aktar</h3>
          <div className="tc-fa-ayar-arac"><Dugme simge="download" onClick={kayitlariIndir}>Kayıtları CSV indir</Dugme></div>
          <p className="tc-fa-not">CSV Excel'de açılır.</p>
        </section>
      </div>
    </Kart>
  );
}

/* ---------- İlk kurulum ---------- */
function IlkKurulumSekmesi({ finans, yetki, sec }: SekmeOzellikleri & { sec: (a: AyarSekmesi) => void }) {
  const { V, motor } = finans;
  const { gonder, mesgul } = useAyarGonder();
  const [d, dYaz] = useState({ ad: V.sirketAdi ?? V.ayar.sirketAdi, sektor: V.ayar.sektor, esik: String(sayi(V.ayar.nakitEsigi)), bankaAd: '', banka: '0', kasa: '0' });
  const dg = (y: Partial<typeof d>) => dYaz((o) => ({ ...o, ...y }));
  if (V.ayar.kurulumTamam) {
    return (
      <Kart baslik="İlk kurulum" baslikEki={<Rozet ton="tamam">Tamamlandı</Rozet>}>
        <p>Şirket bilgisi Şirket sekmesinden, kasa ve banka hesapları Hesaplar sekmesinden değiştirilir.</p>
        <div className="tc-fa-ayar-arac">
          <Dugme onClick={() => sec('sirket')}>Şirket</Dugme>
          <Dugme onClick={() => sec('hesaplar')}>Hesaplar</Dugme>
        </div>
      </Kart>
    );
  }
  const kilitli = V.sirketAdi !== null;
  return (
    <Kart baslik="İlk kurulum" baslikEki={<span className="tc-fa-soluk">Şirket bilgisi ve başlangıç hesapları. Açık alacak, borç ve çekleri sonra "Kayıt gir" ile firmaya bağlı olarak girin.</span>}>
      <form className="tc-fa-ayar-izgara" aria-label="İlk kurulum" onSubmit={(e) => { e.preventDefault(); void gonder(kurulumKomutlari(V, d, motor.bugun)); }}>
        <Girdi etiket="Şirket adı" required maxLength={200} value={d.ad} readOnly={kilitli} ipucu={kilitli ? "Satın Alma > Ayarlar'dan değiştirilir." : undefined} onChange={(e) => dg({ ad: e.target.value })} />
        <Secim etiket="Sektör" value={d.sektor} secenekler={Object.entries(SECTORS).map(([k, s]) => ({ deger: k, baslik: s.ad }))} onChange={(e) => dg({ sektor: e.target.value as FinansAyari['sektor'] })} />
        <Girdi etiket="Altına düşmek istemediğiniz nakit" type="number" step="1000" value={d.esik} onChange={(e) => dg({ esik: e.target.value })} />
        <Girdi etiket="Banka hesabının adı" maxLength={100} placeholder="Örn. Ana banka hesabı" value={d.bankaAd} onChange={(e) => dg({ bankaAd: e.target.value })} />
        <Girdi etiket="Bugünkü banka bakiyesi" type="number" step="0.01" value={d.banka} onChange={(e) => dg({ banka: e.target.value })} />
        <Girdi etiket="Bugünkü kasa" type="number" step="0.01" value={d.kasa} onChange={(e) => dg({ kasa: e.target.value })} />
        <div className="tc-fa-ayar-arac tc-fa-ayar-tam">
          <Dugme type="submit" tur="birincil" simge="check" disabled={!yetki.yonet} yukleniyor={mesgul}>Kurulumu tamamla</Dugme>
          {!yetki.yonet && <span className="tc-fa-soluk">Kurulum finans yönetimi yetkisi ister.</span>}
        </div>
      </form>
    </Kart>
  );
}
