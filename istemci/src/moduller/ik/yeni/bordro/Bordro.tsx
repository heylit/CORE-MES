import { useMemo, useState, type KeyboardEvent } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import {
  Dugme, Girdi, OnayPenceresi, Pencere, Rozet, SayfaBasligi, SayiKarti, Secim, Simge, Tablo, useBildirim, type MenuOgesi, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari, type SayfaKomutu } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { para, paraKisa } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, type IkMotoru } from '../motor.ts';
import { AySecici } from '../ortak/AySecici.tsx';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Departman, Personel } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { HesapPenceresi, MotorBekleniyor, type HesapOnAyari } from './Hesaplayicilar.tsx';
import {
  ayEtiketi, ayParcala, bordroDurumu, bordroListesi, bordroSatirlari, bordroToplami, kesinlesenSayisi, kesinlestirmeKayitlari, muhasebeFisi,
  muhsgkListesi, onayDurumu, taslakGuncelle, zamPlani, zamUygula, type BordroSatiri, type CsvTablosu, type GirdiAlani, type ZamSecimi,
  type ZamYontemi,
} from './kurallar.ts';
import { bordroMotoru, taslakliMotor, type BordroGirdisi, type BordroMotoru, type BordroSonucu } from './motor-yuzu.ts';
import { Bolum, Not, eksi, kisaTarihMetni, sayiMetni, yuzde } from './parcalar.tsx';
import './bordro.css';

const AY = /^\d{4}-\d{2}$/;
const ZAM_NEDENLERI = ['Yıllık zam', 'Enflasyon farkı', 'Asgari ücret artışı', 'Terfi', 'Performans', 'Görev değişikliği', 'Düzeltme'] as const;
const zamanBicimi = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' });
const zaman = (v: unknown): string => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? zamanBicimi.format(new Date(v)) : '');

type Satir = { tur: 'kisi'; s: BordroSatiri } | { tur: 'toplam' };

// Toplam satırının boş hücresi: tablo boş metne "yok" yazar, burada değer yok değil, hücre anlamsız.
const BOS = <></>;

// Girdi hücresi: yazarken taslak değişmez, hücreden çıkınca (ya da Enter) değişir; hesap o zaman yeniden yapılır.
function SayiHucresi({ deger, etiket, adim, pasif, ipucu, kisa, degistir }: {
  deger: number | undefined; etiket: string; adim: string; pasif: boolean; ipucu?: string; kisa?: boolean; degistir: (v: string) => void;
}) {
  const goster = deger === undefined || deger === null ? '' : String(Math.round(Number(deger) * 100) / 100);
  const [metin, metinYaz] = useState<string | null>(null);
  const bitir = () => { if (metin !== null && metin !== goster) degistir(metin); metinYaz(null); };
  return (
    <input
      className={`tc-ikb-girdi${kisa ? ' tc-ikb-girdi-kisa' : ''}`} type="number" inputMode="decimal" min="0" step={adim} aria-label={etiket}
      title={ipucu} disabled={pasif} value={metin ?? goster}
      onChange={(o) => { metinYaz(o.target.value); }} onBlur={bitir}
      onKeyDown={(o: KeyboardEvent<HTMLInputElement>) => { if (o.key === 'Enter') bitir(); }}
    />
  );
}

function Pusula({ m, s, ay, kapat }: { m: BordroMotoru; s: BordroSatiri; ay: string; kapat: () => void }) {
  const { personel: e, sonuc: r } = s;
  const S = m.S();
  const oran = (k: string): string => yuzde(Number(S[k]) || 0);
  const yan = (etiket: string, b: BordroSonucu['yemek']) => {
    if (!b) return null;
    if (b.hizmet) return <><dt>{etiket}: {b.yontem}</dt><dd>bordro dışı</dd></>;
    return (<>
      <dt>{etiket} ({b.yontem}, {b.fg} fiili gün)</dt><dd>{para(b.tutar)}</dd>
      <dt className="tc-ikb-alt">GV istisnası / SGK istisnası</dt><dd className="tc-ikb-alt">{para(b.gvIst)} / {b.sgkIst === b.tutar ? 'tamamı' : para(b.sgkIst)}</dd>
    </>);
  };
  return (
    <Pencere acik baslik="Bordro pusulası" kapat={kapat} alt={<Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>}>
      <p><b>{m.fullName(e)}</b></p>
      <p className="tc-ikb-soluk">{e.pozisyon ?? ''}{e.departmanId ? `, ${m.deptName(e.departmanId)}` : ''}. Dönem: {ayEtiketi(ay)}. Sicil {e.sicilNo || '—'}.</p>
      <dl className="tc-ikb-pusula">
        {r.gun < 30 && <><dt>Aylık brüt ücret</dt><dd>{para(r.aylik)}</dd><dt>Prim günü</dt><dd>{r.gun} gün</dd></>}
        <dt>Brüt ücret{r.gun < 30 ? ` (${r.gun}/30)` : ''}</dt><dd>{para(r.brut)}</dd>
        {r.ek > 0 && <><dt>Ek ödeme (prim, ikramiye)</dt><dd>{para(r.ek)}</dd></>}
        {r.mesaiUcret > 0 && <><dt>Fazla mesai ücreti</dt><dd>{para(r.mesaiUcret)}</dd></>}
        {(r.primDetay ?? []).map((p, i) => <span key={i} className="tc-ikb-dl-cift"><dt>{p.ad}</dt><dd className="tc-ikb-alt">{para(p.tutar)} (ek ödemeye dahil)</dd></span>)}
        {yan('Yemek yardımı', r.yemek)}{yan('Yol yardımı', r.yol)}
        <dt className="tc-ikb-top">Toplam brüt</dt><dd className="tc-ikb-top">{para(r.toplam)}</dd>
        <dt>SGK işçi payı ({oran('sgkIsciOran')})</dt><dd>{eksi(r.sgk)}</dd>
        <dt>İşsizlik işçi payı ({oran('issizlikIsciOran')})</dt><dd>{eksi(r.iss)}</dd>
        {r.ind > 0 && <><dt>Engellilik indirimi</dt><dd>{eksi(r.ind)}</dd></>}
        <dt>Gelir vergisi matrahı</dt><dd>{para(r.matrah)}</dd>
        <dt>Kümülatif matrah (önceki aylar)</dt><dd>{para(r.cumOnce)}</dd>
        <dt>Hesaplanan gelir vergisi</dt><dd>{para(r.gvHam)}</dd>
        <dt>Asgari ücret gelir vergisi istisnası</dt><dd>{eksi(r.gvIst)}</dd>
        <dt>Gelir vergisi</dt><dd>{eksi(r.gv)}</dd>
        <dt>Damga vergisi (istisna sonrası)</dt><dd>{eksi(r.dv)}</dd>
        {r.kesinti > 0 && <><dt>Diğer kesintiler (avans, icra vb.)</dt><dd>{eksi(r.kesinti)}</dd></>}
        {r.bes > 0 && <><dt>Bireysel emeklilik ({oran('besOran')})</dt><dd>{eksi(r.bes)}</dd></>}
        <dt className="tc-ikb-top">Net (yan haklar dahil)</dt><dd className="tc-ikb-top">{para(r.net)}</dd>
        {r.ayni > 0 && <><dt>Kart / ayni ödenen yan haklar</dt><dd>{eksi(r.ayni)}</dd><dt className="tc-ikb-top">Bankaya ödenecek</dt><dd className="tc-ikb-top">{para(r.banka)}</dd></>}
        <dt>SGK işveren payı ({oran('sgkIsverenOran')})</dt><dd>{para(r.isvBrut)}</dd>
        {r.tesvik && <><dt>Teşvik: {r.tesvik.ad}</dt><dd>{eksi(r.tInd)}</dd></>}
        <dt>İşsizlik işveren payı ({oran('issizlikIsverenOran')})</dt><dd>{para(r.isvIss)}</dd>
        <dt className="tc-ikb-top">Toplam işveren maliyeti</dt><dd className="tc-ikb-top">{para(r.maliyet)}</dd>
      </dl>
    </Pencere>
  );
}

function DisaAktar({ ay, aktar, kapat }: { ay: string; aktar: (tur: 'liste' | 'muhsgk' | 'fis') => void; kapat: () => void }) {
  const secenekler = [
    { tur: 'liste', baslik: 'Bordro listesi (CSV)', aciklama: 'Tüm kazanç, kesinti, yan hak ve işveren maliyeti sütunları; Excel’de açılır.' },
    { tur: 'muhsgk', baslik: 'MUHSGK hazırlık listesi (CSV)', aciklama: 'T.C. kimlik no, prim günü, eksik gün nedeni, prime esas kazanç, teşvik kanunu, GV ve DV bilgileri.' },
    { tur: 'fis', baslik: 'Muhasebe fişi (CSV)', aciklama: 'Gider, personel, vergi ve SGK hesaplarına dengeli yevmiye kaydı.' },
  ] as const;
  return (
    <Pencere acik baslik={`${ayEtiketi(ay)}: dışa aktar`} kapat={kapat}>
      <div className="tc-ikb-secenekler">
        {secenekler.map((s) => (
          <button key={s.tur} type="button" className="tc-ikb-secenek" onClick={() => { aktar(s.tur); }}>
            <Simge ad="download" /><span><b>{s.baslik}</b><small>{s.aciklama}</small></span>
          </button>
        ))}
      </div>
      <Not>Önce dönemi kaydetmeniz önerilir; aktarım ekranda görünen (kaydedilmemiş değişiklikler dahil) değerlerle yapılır.</Not>
    </Pencere>
  );
}

function TopluZam({ m, bugun, uygula, kapat, calisiyor }: {
  m: BordroMotoru; bugun: string; uygula: (kayitlar: Personel[], tarih: string) => void; kapat: () => void; calisiyor: boolean;
}) {
  const sabit = ikSabitleri();
  const ilkTarih = (() => { const [y, a] = ayParcala(bugun.slice(0, 7)); return a === 12 ? `${y + 1}-01-01` : `${y}-${String(a + 1).padStart(2, '0')}-01`; })();
  const [s, sYaz] = useState<ZamSecimi>({ tarih: ilkTarih, departman: '', yaka: '', yontem: 'yuzde', deger: 10, yuvarlama: 100 });
  const [neden, nedenYaz] = useState<string>(ZAM_NEDENLERI[0]);
  const asgari = m.withPeriod(s.tarih || ilkTarih, () => m.P('asgariBrut'));
  const isv = (m.P('sgkIsverenOran') + m.P('issizlikIsverenOran')) / 100;
  const plan = zamPlani(m.activeEmps(), s, (e, t) => m.salaryAt(e, t), (e) => sabit?.collarOf(e) ?? '');
  const fark = plan.reduce((a, x) => a + x.yeni - x.mevcut, 0);
  const yontemDegisti = (y: ZamYontemi) => { sYaz((o) => ({ ...o, yontem: y, deger: y === 'yuzde' ? 10 : y === 'sabit' ? 2000 : asgari })); };
  return (
    <Pencere
      acik tur="yan" baslik="Toplu ücret güncelleme" kapat={kapat}
      alt={(<>
        <Dugme onClick={kapat} disabled={calisiyor}>Vazgeç</Dugme>
        <Dugme
          tur="birincil" yukleniyor={calisiyor} disabled={!plan.length}
          onClick={() => { uygula(plan.map((x) => zamUygula(x.personel, s.tarih || ilkTarih, x.yeni, neden, 'Toplu güncelleme', (e) => m.salaryHist(e), (e, t) => m.salaryAt(e, t), bugun)), s.tarih || ilkTarih); }}
        >Uygula</Dugme>
      </>)}
    >
      <div className="tc-ikb-alanlar">
        <Girdi etiket="Yürürlük tarihi" type="date" value={s.tarih} onChange={(o) => { sYaz({ ...s, tarih: o.target.value }); }} />
        <Secim etiket="Departman" bosSecenek="Tüm departmanlar" value={s.departman} secenekler={m.sortedDepts().map((d) => ({ deger: d.id, baslik: d.ad ?? '' }))} onChange={(o) => { sYaz({ ...s, departman: o.target.value }); }} />
        <Secim etiket="Yaka tipi" bosSecenek="Tümü" value={s.yaka} secenekler={(sabit?.COLLARS ?? []).map((c) => ({ deger: c, baslik: c }))} onChange={(o) => { sYaz({ ...s, yaka: o.target.value }); }} />
        <Secim
          etiket="Yöntem" value={s.yontem} onChange={(o) => { yontemDegisti(o.target.value as ZamYontemi); }}
          secenekler={[{ deger: 'yuzde', baslik: 'Yüzde artış' }, { deger: 'sabit', baslik: 'Sabit tutar artışı' }, { deger: 'min', baslik: 'En az şu tutara tamamla' }]}
        />
        <Girdi
          etiket="Değer" type="number" step="any" inputMode="decimal" value={String(s.deger)} onChange={(o) => { sYaz({ ...s, deger: Number(o.target.value) || 0 }); }}
          ipucu={s.yontem === 'yuzde' ? 'Ör. 10 = %10 artış' : s.yontem === 'sabit' ? 'Her çalışana eklenecek brüt tutar' : `Bu tutarın altındakiler yükseltilir (dönem asgari ücreti: ${paraKisa(asgari)})`}
        />
        <Secim
          etiket="Yuvarlama" value={String(s.yuvarlama)} onChange={(o) => { sYaz({ ...s, yuvarlama: Number(o.target.value) }); }}
          secenekler={[{ deger: '0', baslik: 'Yok' }, { deger: '10', baslik: '10 TL' }, { deger: '100', baslik: '100 TL' }, { deger: '500', baslik: '500 TL' }]}
        />
        <Secim etiket="Neden" value={neden} secenekler={ZAM_NEDENLERI.map((n) => ({ deger: n, baslik: n }))} onChange={(o) => { nedenYaz(o.target.value); }} />
      </div>
      <h4>Önizleme</h4>
      {plan.length ? (<>
        <p><b>{plan.length} çalışan</b>, aylık brüt ücret yükü artışı <b>{para(fark)}</b>. İşveren maliyeti artışı yaklaşık {para(fark * (1 + isv))}.</p>
        <Tablo
          etiket="Ücret önizlemesi" satirlar={plan} satirAnahtari={(x) => x.personel.id}
          sutunlar={[
            { anahtar: 'ad', baslik: 'Çalışan', hucre: (x) => <KisiHucresi personel={x.personel} alt={m.deptName(x.personel.departmanId)} /> },
            { anahtar: 'mevcut', baslik: 'Mevcut', hizala: 'sag', mono: true, hucre: (x) => para(x.mevcut) },
            { anahtar: 'yeni', baslik: 'Yeni', hizala: 'sag', mono: true, hucre: (x) => <b>{para(x.yeni)}</b> },
            { anahtar: 'fark', baslik: 'Fark', hizala: 'sag', mono: true, hucre: (x) => (x.mevcut ? `+${sayiMetni(Math.round((x.yeni / x.mevcut - 1) * 1000) / 10)}%` : '—') },
          ]}
        />
      </>) : <Not>Seçilen ölçütlerle değişecek çalışan yok.</Not>}
    </Pencere>
  );
}

export function Bordro(o: IkEkranOzellikleri) {
  if (o.motor === null) return <MotorBekleniyor />;
  return <BordroEkrani {...o} motor={o.motor} />;
}

function BordroEkrani({ depo, yetki, motor, kimlik, git }: IkEkranOzellikleri & { motor: IkMotoru }) {
  const bugun = tesisGunu(Date.now());
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const [ay, ayYaz] = useState(kimlik && AY.test(kimlik) ? kimlik : bugun.slice(0, 7));
  const [taslaklar, taslakYaz] = useState<Readonly<Record<string, Readonly<Record<string, BordroGirdisi>>>>>({});
  const [kilitler, kilitYaz] = useState<Readonly<Record<string, boolean>>>({});
  const [pencere, pencereYaz] = useState<null | { tur: 'pusula'; personel: string } | { tur: 'aktar' } | { tur: 'zam' } | { tur: 'kilit' } | { tur: 'hesap'; on: HesapOnAyari }>(null);

  const taslak = taslaklar[ay] ?? {};
  const taslakVar = Object.keys(taslak).length > 0;
  const kilitAcik = Boolean(kilitler[ay]);
  const kayitlar = useMemo(() => [...depo.kayitlar.values()], [depo.kayitlar]);
  // Taslak ya da düzeltme modu yoksa ekranın ortak motoru; varsa bu ayın girdileriyle kurulan motor.
  const m = useMemo(
    () => (taslakVar || kilitAcik ? taslakliMotor(kayitlar, depo.ayarlar, ay, taslak, kilitAcik) : null) ?? bordroMotoru(motor),
    [kayitlar, depo.ayarlar, ay, taslak, taslakVar, kilitAcik, motor],
  );
  const satirlar = useMemo(() => bordroSatirlari(m, ay), [m, ay]);

  const T = bordroToplami(satirlar);
  const kesin = kesinlesenSayisi(depo.kayitlar, satirlar, ay);
  const durum = bordroDurumu(kesin, satirlar.length, taslakVar, kilitAcik);
  const donem = m.periodAt(`${ay}-01`);
  const yazabilir = yetki.bordroKesinlestir;
  const hepsiKesin = kesin === satirlar.length && satirlar.length > 0;
  const onay = onayDurumu(depo.kayitlar, satirlar, ay);
  const engelliUyarisi = m.activeEmps().some((e) => e.engelDurumu && e.engelDurumu !== 'Yok') && !m.P('engelliInd1') && !m.P('engelliInd2') && !m.P('engelliInd3');
  const parametre = m.withPeriod(`${ay}-01`, () => ({
    asgari: m.P('asgariBrut'), tavan: m.P('sgkTavan'), isveren: m.P('sgkIsverenOran'), carpan: m.P('mesaiCarpan'), saat: m.P('aylikSaat'),
  }));

  const hucreDegisti = (s: BordroSatiri, alan: GirdiAlani, v: string) => {
    taslakYaz((t) => ({ ...t, [ay]: taslakGuncelle(t[ay] ?? {}, s.personel.id, s.sonuc.inp, alan, v) }));
  };
  const taslakSil = () => { taslakYaz((t) => { const { [ay]: _, ...geri } = t; return geri; }); };
  const kesinlestir = async () => {
    try {
      await komut.bordroKesinlestir(kesinlestirmeKayitlari(satirlar, ay));
      taslakSil();
      kilitYaz((k) => { const { [ay]: _, ...geri } = k; return geri; });
      bildir('tamam', `${ayEtiketi(ay)} bordrosu kesinleşti (${satirlar.length} çalışan). Bu ay artık sonraki ücret ve parametre değişikliklerinden etkilenmez.`);
    } catch (h) { bildir('hata', hataIletisi(h, 'Bordro kesinleştirilemedi.')); }
  };
  const indir = (ad: string, t: CsvTablosu) => { csvIndir(ad, t.basliklar, t.satirlar); };
  const aktar = (tur: 'liste' | 'muhsgk' | 'fis') => {
    if (tur === 'liste') indir(`bordro-${ay}`, bordroListesi(satirlar, (e) => m.fullName(e), (id) => m.deptName(id)));
    else if (tur === 'muhsgk') indir(`muhsgk-hazirlik-${ay}`, muhsgkListesi(satirlar, ay, (k) => m.exitCodeOf(k)));
    else indir(`muhasebe-fisi-${ay}`, muhasebeFisi(satirlar, ay, m.S(), (id) => { const d = depo.al(id); return d?.kind === 'dept' ? d as Departman : null; }));
  };
  const zamUygulandi = async (rs: Personel[], tarih: string) => {
    try {
      await komut.topluKaydet(rs);
      pencereYaz(null);
      bildir('tamam', `${rs.length} çalışanın ücreti ${kisaTarihMetni(tarih)} itibarıyla güncellendi.`);
    } catch (h) { bildir('hata', hataIletisi(h, 'Ücretler güncellenemedi.')); }
  };

  const eylemler: MenuOgesi[] = [
    ...(satirlar.length ? [{ anahtar: 'aktar', baslik: 'Dışa aktar', simge: 'download' as const, sec: () => { pencereYaz({ tur: 'aktar' }); } }] : []),
    { anahtar: 'hesap', baslik: 'Brüt–net hesapla', simge: 'ruler', sec: () => { pencereYaz({ tur: 'hesap', on: { sekme: 'brutnet' } }); } },
    ...(yetki.ucretYaz && yetki.personelYaz ? [{ anahtar: 'zam', baslik: 'Toplu ücret güncelle', simge: 'lira' as const, sec: () => { pencereYaz({ tur: 'zam' }); } }] : []),
    ...(yazabilir && taslakVar ? [{ anahtar: 'geri', baslik: 'Değişiklikleri geri al', simge: 'rotate' as const, sec: taslakSil }] : []),
    ...(yetki.bordroKilitAc && kesin > 0 && !kilitAcik && !taslakVar ? [{ anahtar: 'kilit', baslik: 'Düzeltme için kilidi aç', simge: 'lock' as const, sec: () => { pencereYaz({ tur: 'kilit' }); } }] : []),
  ];
  const birincilGoster = yazabilir && !(hepsiKesin && !kilitAcik && !taslakVar);
  const komutlar: SayfaKomutu[] = [
    ...(birincilGoster && satirlar.length ? [{ anahtar: 'kesinlestir', baslik: kesin ? 'Yeniden kesinleştir' : 'Dönemi kesinleştir', simge: 'check' as const, aciklama: ayEtiketi(ay), sozcukler: ['bordro', 'kesinleştir'], calistir: () => { void kesinlestir(); } }] : []),
    ...eylemler.map((e) => ({ anahtar: e.anahtar, baslik: e.baslik, simge: e.simge ?? 'list', aciklama: ayEtiketi(ay), sozcukler: ['bordro'], calistir: e.sec })),
    ...satirlar.map((s) => ({ anahtar: `pusula-${s.personel.id}`, baslik: `${m.fullName(s.personel)}: bordro pusulası`, simge: 'file' as const, aciklama: ayEtiketi(ay), sozcukler: ['pusula', 'bordro'], calistir: () => { pencereYaz({ tur: 'pusula', personel: s.personel.id }); } })),
  ];
  useSayfaKomutlari('ik-bordro', komutlar);

  const pasif = (s: BordroSatiri): boolean => !yazabilir || Boolean(s.sonuc.locked);
  const hucre = (alan: GirdiAlani, etiket: string, adim = '0.01') => (x: Satir) => {
    if (x.tur === 'toplam') return BOS;
    const v = alan === 'gun' ? x.s.sonuc.gun : x.s.sonuc.inp[alan];
    return (
      <SayiHucresi
        deger={v} etiket={`${m.fullName(x.s.personel)} ${etiket}`} adim={adim} pasif={pasif(x.s)} kisa={alan === 'gun'}
        {...(alan === 'gun' ? { ipucu: x.s.gunBilgisi.why.join(', ') || 'Tam ay' } : {})}
        degistir={(d) => { hucreDegisti(x.s, alan, d); }}
      />
    );
  };
  const tutar = (al: (r: BordroSonucu) => number, toplam: number | null, kalin = false) => (x: Satir) => {
    const v = x.tur === 'toplam' ? toplam : al(x.s.sonuc);
    if (v === null) return BOS;
    return kalin ? <b>{para(v)}</b> : para(v);
  };
  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'calisan', baslik: 'Çalışan', hucre: (x) => (x.tur === 'toplam' ? <b>Toplam</b> : <KisiHucresi personel={x.s.personel} alt={m.deptName(x.s.personel.departmanId)} />), csv: false },
    { anahtar: 'brut', baslik: 'Aylık brüt', hizala: 'sag', hucre: (x) => (x.tur === 'toplam' ? para(T.aylik) : hucre('brut', 'aylık brüt')(x)) },
    { anahtar: 'gun', baslik: 'Gün', hizala: 'sag', hucre: hucre('gun', 'prim günü', '1') },
    { anahtar: 'ek', baslik: 'Ek ödeme', hizala: 'sag', hucre: (x) => (x.tur === 'toplam' ? para(T.ek) : hucre('ek', 'ek ödeme')(x)) },
    { anahtar: 'mesai', baslik: 'Fazla mesai (sa)', hizala: 'sag', hucre: (x) => (x.tur === 'toplam' ? para(T.mesai) : hucre('mesaiSaat', 'fazla mesai saati', '0.5')(x)) },
    { anahtar: 'tatil', baslik: 'Tatil çalışması (sa)', hizala: 'sag', hucre: hucre('tatilSaat', 'tatil çalışması saati', '0.5') },
    { anahtar: 'kesinti', baslik: 'Diğer kesinti', hizala: 'sag', hucre: hucre('kesinti', 'diğer kesinti') },
    { anahtar: 'yan', baslik: 'Yemek + yol', hizala: 'sag', mono: true, hucre: (x) => (x.tur === 'toplam' ? para(T.yan) : x.s.sonuc.yanTutar ? para(x.s.sonuc.yanTutar) : '—') },
    { anahtar: 'toplam', baslik: 'Toplam brüt', hizala: 'sag', mono: true, hucre: tutar((r) => r.toplam, T.toplam) },
    { anahtar: 'sgk', baslik: 'SGK + işsizlik', hizala: 'sag', mono: true, hucre: tutar((r) => r.sgk + r.iss, T.kesinti) },
    { anahtar: 'gv', baslik: 'Gelir vergisi', hizala: 'sag', mono: true, hucre: tutar((r) => r.gv, T.gv) },
    { anahtar: 'dv', baslik: 'Damga', hizala: 'sag', mono: true, hucre: tutar((r) => r.dv, T.dv) },
    { anahtar: 'banka', baslik: 'Bankaya', hizala: 'sag', mono: true, hucre: tutar((r) => r.banka, T.banka, true) },
    {
      anahtar: 'maliyet', baslik: 'Maliyet', hizala: 'sag', mono: true,
      hucre: (x) => (x.tur === 'toplam' ? para(T.maliyet) : (<>{para(x.s.sonuc.maliyet)}{x.s.sonuc.tInd > 0 && <small className="tc-ikb-soluk"> teşvik −{paraKisa(x.s.sonuc.tInd)}</small>}</>)),
    },
    { anahtar: 'pusula', baslik: 'Pusula', csv: false, hucre: (x) => (x.tur === 'toplam' ? BOS : <Dugme simge="file" onClick={() => { pencereYaz({ tur: 'pusula', personel: x.s.personel.id }); }}>Pusula</Dugme>) },
  ];

  const durumRozeti = durum.tur === 'taslak-degisti' ? <Rozet ton="uyari">Kaydedilmemiş değişiklik var</Rozet>
    : durum.tur === 'duzeltme' ? <Rozet ton="uyari">Düzeltme modu: kesinleşmiş değerler yeniden hesaplanıyor</Rozet>
      : durum.tur === 'kesinlesti' ? <Rozet ton="tamam">Kesinleşti</Rozet>
        : durum.tur === 'kismen' ? <Rozet ton="bilgi">{durum.kesin}/{durum.toplam} kesinleşti</Rozet>
          : <Rozet ton="pasif">Taslak</Rozet>;
  const pusulaSatiri = pencere?.tur === 'pusula' ? satirlar.find((s) => s.personel.id === pencere.personel) : undefined;

  return (
    <div className="tc-ikb">
      <SayfaBasligi
        baslik="Bordro" simge="list"
        alt="Aylık brüt–net hesap, yasal kesintiler ve işveren maliyeti. Değerleri tablo üzerinde kontrol edip dönemi kesinleştirin; kesinleşen aylar sonraki parametre veya ücret değişikliklerinden etkilenmez."
        eylemler={eylemler}
        {...(birincilGoster ? { birincil: { etiket: kesin ? 'Yeniden kesinleştir' : 'Dönemi kesinleştir', simge: 'check' as const, yap: () => { void kesinlestir(); }, pasif: !satirlar.length, yukleniyor: komut.calisiyor } } : {})}
      />
      <div className="tc-ikb-arac">
        <AySecici ay={ay} degistir={ayYaz} />
        {durumRozeti}
        <span className="tc-ikb-soluk">Parametre dönemi: <button type="button" className="tc-ikb-baglanti" onClick={() => { git('ayarlar', donem.id); }}>{donem.ad}</button></span>
      </div>
      {satirlar.length ? (<>
        <div className="tc-ikb-sayilar">
          <SayiKarti baslik="Bordrolu çalışan" simge="users" sayi={satirlar.length} />
          <SayiKarti baslik="Toplam brüt" simge="lira" metin={paraKisa(T.toplam)} />
          <SayiKarti baslik="Bankaya ödenecek" simge="lira" metin={paraKisa(T.banka)} />
          <SayiKarti baslik="Gelir ve damga vergisi" simge="lira" metin={paraKisa(T.gv + T.dv)} />
          <SayiKarti baslik="İşveren maliyeti" simge="building" metin={paraKisa(T.maliyet)} {...(T.tesvik ? { altMetin: `teşvik −${paraKisa(T.tesvik)}` } : {})} />
        </div>
        <Tablo<Satir>
          etiket={`${ayEtiketi(ay)} bordrosu`} sutunlar={sutunlar}
          satirlar={[...satirlar.map((s) => ({ tur: 'kisi' as const, s })), { tur: 'toplam' as const }]}
          satirAnahtari={(x) => (x.tur === 'toplam' ? '_toplam' : x.s.personel.id)}
        />
      </>) : <Not><b>Bu dönemde bordrolu çalışan yok.</b> Seçilen ayda çalışan aktif personel bulunmuyor.</Not>}
      <Not>
        Gün sütunu SGK prim günüdür: tam çalışılan ay 30 gün sayılır; ay içinde işe giriş veya çıkış, onaylı ücretsiz izin{m.S()['raporKesinti'] === false ? '' : ' ve rapor'} günleri
        otomatik düşülür (gerekçeyi görmek için hücrenin üzerine gelin). Ücret, SGK tavanı ve asgari ücret istisnası gün sayısına göre orantılanır.
        {engelliUyarisi && <b> Engelli çalışanınız var ancak engellilik indirimi tutarları Ayarlar’da girilmemiş.</b>}
      </Not>
      <Not>
        Parametreler ({donem.ad}): brüt asgari ücret {para(parametre.asgari)}, SGK tavanı {para(parametre.tavan)}, işveren SGK oranı {yuzde(parametre.isveren)} (teşvik öncesi),
        fazla mesai {sayiMetni(parametre.carpan)} kat, aylık {sayiMetni(parametre.saat)} saat. Kesinleşmiş satırlar, kesinleştirildikleri andaki değerleri gösterir.
        Sonuçlar tahminîdir; resmî bordro için mali müşavirinizle doğrulayın.
      </Not>
      {onay.kesin.length > 0 && (
        <Bolum baslik="Bordro onayı">
          <p>{onay.onaylayan.length}/{onay.kesin.length} çalışan bordrosunu onayladı.</p>
          {onay.onaylamayan.length
            ? <p><b>Onaylamayanlar:</b> {onay.onaylamayan.map((b) => m.fullName(depo.al(String(b.empId)) as Personel | null)).join(', ')}</p>
            : <p>Kesinleşen bordroların hepsi onaylandı.</p>}
          {onay.onaylayan.length > 0 && (
            <details className="tc-ikb-detay">
              <summary>Onaylayanlar ({onay.onaylayan.length})</summary>
              <ul className="tc-ikb-liste">
                {onay.onaylayan.map((b) => <li key={b.id}><span>{m.fullName(depo.al(String(b.empId)) as Personel | null)}</span><small>{zaman(b['gordum'])}</small></li>)}
              </ul>
            </details>
          )}
          <Not>Çalışan kesinleşen bordrosunu İK İşlemlerim, Bordrolarım ekranında “Gördüm, onaylıyorum” ile onaylar. Ay yeniden kesinleşirse önceki onay geçersiz olur ve çalışan yeniden onaylar.</Not>
        </Bolum>
      )}

      {pusulaSatiri && <Pusula m={m} s={pusulaSatiri} ay={ay} kapat={() => { pencereYaz(null); }} />}
      {pencere?.tur === 'aktar' && <DisaAktar ay={ay} aktar={aktar} kapat={() => { pencereYaz(null); }} />}
      {pencere?.tur === 'zam' && <TopluZam m={m} bugun={bugun} calisiyor={komut.calisiyor} uygula={(rs, t) => { void zamUygulandi(rs, t); }} kapat={() => { pencereYaz(null); }} />}
      {pencere?.tur === 'hesap' && <HesapPenceresi motor={motor} onAyar={pencere.on} kapat={() => { pencereYaz(null); }} sayfayaGit={() => { pencereYaz(null); git('hesap'); }} />}
      <OnayPenceresi
        acik={pencere?.tur === 'kilit'} baslik="Kesinleşmiş bordro açılsın mı?" onayMetni="Kilidi aç"
        onayla={() => { kilitYaz((k) => ({ ...k, [ay]: true })); pencereYaz(null); }} vazgec={() => { pencereYaz(null); }}
      >
        <p>Bu ay, güncel ücret ve dönem parametreleriyle yeniden hesaplanır ve tablo düzenlenebilir olur. Yeniden kesinleştirene kadar kayıtlı değerler değişmez. Sonraki kesinleşmiş ayların kümülatif vergi matrahı otomatik güncellenmez; gerekiyorsa onları da sırayla düzeltin.</p>
      </OnayPenceresi>
    </div>
  );
}
