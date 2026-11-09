import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { TALEP_DURUMLARI, TerminDurumu, TerminKarsilayani, TerminTakipSatiri } from '#paylasilan/sozlesme/satin-alma.ts';
import {
  DurumKutusu, Dugme, Girdi, Menu, Pencere, Rozet, SayfaBasligi, SayiKarti, Secim, Sekmeler, Tablo, useBildirim, type MenuOgesi, type RozetTonu, type Sutun,
} from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { SURE, cagri } from '../talep/ortak.ts';
import './termin-takibi.css';

type Satir = TerminTakipSatiri;
type Tur = Satir['tur'];
const ANAHTAR = ['satin-alma', 'tedarik-terminleri'] as const;
// 534 1 a: termini satın almayı yazan ve planı yazan girer (sunucu da aynısını denetler).
const YAZAR_ISLEMLERI = ['satin-alma.yaz', 'plan.yaz'];
const gun = (t: string | null) => (t === null ? '—' : `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`);
const kisaGun = (t: string) => `${t.slice(8, 10)}.${t.slice(5, 7)}`;
const miktar = (m: string | null, birim: string | null) => (m === null ? '—' : `${Number(m).toLocaleString('tr-TR', { maximumFractionDigits: 3 })}${birim ? ` ${birim}` : ''}`);

// Durumu sunucu verir (kurallar.ts terminDurumu); ekran yalnız rozete eşler. Adlar 2433-7 kararından.
const DURUM: Record<TerminDurumu, { ton: RozetTonu | undefined; ad: string }> = {
  gecikti: { ton: 'hata', ad: 'Gecikti' },
  gec_kaliyor: { ton: 'uyari', ad: 'Geç kalıyor' },
  teslim_tarihi_yok: { ton: 'uyari', ad: 'Siparişte tarih yok' },
  eksik: { ton: 'uyari', ad: 'Eksik' },
  termin_bekleniyor: { ton: 'uyari', ad: 'Talep yok' },
  talep_yolda: { ton: undefined, ad: 'Talepte' },
  zamaninda: { ton: 'tamam', ad: 'Zamanında' },
  plan_istemiyor: { ton: 'pasif', ad: 'Plan istemiyor' },
};
const SORUNLU: readonly TerminDurumu[] = ['gecikti', 'gec_kaliyor', 'eksik', 'termin_bekleniyor', 'teslim_tarihi_yok'];
type Bolum = 'sorunlu' | 'gecikti' | 'gec' | 'eksik' | 'talep-yok' | 'tarih-yok' | 'talepte' | 'hepsi';
// Sorunlu bölümlerin sayıları toplamı Sorunlu'ya eşittir. Sekme rozeti iş bekler gibi okunur; Talepte sorun değildir, sayısı başlıkta düz yazılır.
const BOLUMLER: readonly { anahtar: Bolum; baslik: string; uyar: (d: TerminDurumu) => boolean; rozetsiz?: true }[] = [
  { anahtar: 'sorunlu', baslik: 'Sorunlu', uyar: (d) => SORUNLU.includes(d) },
  { anahtar: 'gecikti', baslik: 'Gecikti', uyar: (d) => d === 'gecikti' },
  { anahtar: 'gec', baslik: 'Geç kalıyor', uyar: (d) => d === 'gec_kaliyor' },
  { anahtar: 'eksik', baslik: 'Eksik', uyar: (d) => d === 'eksik' },
  { anahtar: 'talep-yok', baslik: 'Talep yok', uyar: (d) => d === 'termin_bekleniyor' },
  { anahtar: 'tarih-yok', baslik: 'Siparişte tarih yok', uyar: (d) => d === 'teslim_tarihi_yok' },
  { anahtar: 'talepte', baslik: 'Talepte', uyar: (d) => d === 'talep_yolda', rozetsiz: true },
  { anahtar: 'hepsi', baslik: 'Tümü', uyar: () => true },
];
const TUR_ADI: Record<Tur, string> = { malzeme: 'Malzeme', hizmet: 'Hizmet', fason: 'Fason' };
const TALEP_DURUMU: Record<(typeof TALEP_DURUMLARI)[number], string> = {
  taslak: 'taslak', teklif_isteniyor: 'teklif isteniyor', degerlendirme: 'değerlendirmede', onayda: 'onayda',
  siparis_verildi: 'sipariş verildi', teslim_alindi: 'teslim alındı', iptal: 'iptal',
};

const ikili = (ana: ReactNode, alt: ReactNode) => <span className="sa-tt-iki"><span>{ana}</span>{alt && <small>{alt}</small>}</span>;
// Karşılayanlardan en geç gelecek olan satırı belirler (sunucunun karsilayanTarih'iyle aynı); tarihsiz sipariş en geç sayılır.
const enGec = (x: Satir): TerminKarsilayani | undefined =>
  [...x.karsilayanlar].sort((a, b) => (b.tarih ?? '9999').localeCompare(a.tarih ?? '9999'))[0];
const talepAdresi = (k: TerminKarsilayani) => `/satin-alma/talepler?talep=${k.talepId}${k.tur === 'siparis' ? '&bolum=order' : ''}`;

function durumRozeti(x: Satir) {
  const d = DURUM[x.durum];
  // Arayüz (2433): eksik rozeti miktarı da söyler; dar ekranda ayrı sütun yoktur.
  const ad = x.durum === 'eksik' && x.eksik !== null ? `Eksik ${miktar(x.eksik, x.birim)}` : d.ad;
  return <Rozet ton={d.ton}>{ad}</Rozet>;
}

function karsilayanHucresi(x: Satir) {
  const k = enGec(x);
  if (!k) return x.elleTermin?.termin ? ikili(`Elle termin ${gun(x.elleTermin.termin)}`, 'sipariş yok') : '—';
  const no = k.tur === 'siparis' ? (k.siparisNo ?? k.talepNo) : k.talepNo;
  const ne = k.tur === 'siparis' ? (k.tarih ? gun(k.tarih) : 'teslim tarihi yok') : `talep, ${TALEP_DURUMU[k.talepDurumu]}`;
  const fazla = x.karsilayanlar.length - 1;
  return ikili(<><span className="mono">{no}</span> · {ne}</>, `${miktar(k.miktar, k.birim)}${fazla > 0 ? ` · +${fazla} daha` : ''}`);
}

const hataMetni = (h: unknown) => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.');

// 2433-3 a: elle termin yalnız siparişsiz malzeme satırında girilir.
function TerminPenceresi({ x, kapat }: { x: Satir & { malzemeNo: number }; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const e = x.elleTermin;
  const [termin, terminYaz] = useState(e?.termin ?? '');
  const [aciklama, aciklamaYaz] = useState(e?.aciklama ?? '');
  const kaydet = useMutation({
    mutationFn: () => cagri.post('/satin-alma-tedarik-terminleri/kaydet', {
      govde: { malzemeNo: x.malzemeNo, termin: termin === '' ? null : termin, aciklama: aciklama.trim(), surum: e?.surum ?? null }, ...SURE,
    }),
    onSuccess: () => {
      bildir('tamam', termin === '' ? 'Termin kaldırıldı.' : 'Termin kaydedildi.');
      void istemci.invalidateQueries({ queryKey: ANAHTAR });
      kapat();
    },
    // Başkası (satın alma ya da planlama) araya girdiyse liste yenilenir; pencere eski sürümle yeniden göndermez.
    onError: (h) => { if (h instanceof ApiHatasi && h.durum === 409) void istemci.invalidateQueries({ queryKey: ANAHTAR }); },
  });
  return (
    <Pencere acik kapat={kapat} baslik={`Termin: ${x.kod ?? x.ad}`}
      alt={<><Dugme tur="birincil" simge="check" yukleniyor={kaydet.isPending} onClick={() => kaydet.mutate()}>Kaydet</Dugme><Dugme onClick={kapat}>Vazgeç</Dugme></>}>
      <form onSubmit={(ev) => { ev.preventDefault(); kaydet.mutate(); }} noValidate>
        <p>{x.ad}. Gereken: {gun(x.gerekenTarih)}.</p>
        <Girdi etiket="Termin" type="date" ipucu="Sipariş verilince siparişin teslim tarihi geçerlidir. Boş bırakılırsa termin kaldırılır." value={termin}
          onChange={(ev) => terminYaz(ev.target.value)} autoFocus />
        <Girdi etiket="Açıklama" value={aciklama} onChange={(ev) => aciklamaYaz(ev.target.value)} maxLength={200} />
        {kaydet.isError && <p role="alert">{hataMetni(kaydet.error)}</p>}
      </form>
    </Pencere>
  );
}

function EmirPenceresi({ x, kapat }: { x: Satir; kapat: () => void }) {
  return (
    <Pencere acik kapat={kapat} baslik={`Emirler: ${x.kod ?? x.ad}`} alt={<Dugme onClick={kapat}>Kapat</Dugme>}>
      <ul className="sa-tt-emirler">{x.emirler.map((e) => <li key={e} className="mono">{e}</li>)}</ul>
    </Pencere>
  );
}

// Talep Taleplerim'de açılır; malzeme satırında eksik miktar ve gereken tarihle dolu gelir (ön talep gibi).
export function talepTaslagi(x: Satir) {
  if (x.tur !== 'malzeme' || x.malzemeNo === null || x.gerekenTarih === null) return null;
  const adet = Number(x.eksik ?? x.ihtiyacMiktari ?? 0);
  if (!(adet > 0)) return null;
  return [{
    kaynak: 'plan' as const, malzeme: { no: x.malzemeNo, kod: x.kod ?? '', ad: x.ad }, miktar: adet, birim: x.birim ?? '', gerekenTarih: x.gerekenTarih,
    emirler: x.emirler, stokBilinmiyor: false, hesap: { eksik: adet, siparis: 0, talep: 0, yoksayilan: 0 },
  }];
}

// Termin takibi (2433): plandaki her ihtiyaç, açık talep ya da sipariş kalemi bir satır. Ne zaman gerekli, kim karşılıyor, ne eksik.
export function TedarikTerminleri() {
  const { data: kullanici } = useOturum();
  const islemler = kullanici?.islemler ?? [];
  const yazar = islemler.some((i) => YAZAR_ISLEMLERI.includes(i));
  const talepAcar = islemler.includes('satin-alma.talep-ac');
  const git = useNavigate();
  const [bolum, bolumYaz] = useState<Bolum>('sorunlu');
  const [tur, turYaz] = useState<Tur | ''>('');
  const [ara, araYaz] = useState('');
  const [termin, terminYaz] = useState<(Satir & { malzemeNo: number }) | null>(null);
  const [emir, emirYaz] = useState<Satir | null>(null);
  const l = useQuery({ queryKey: ANAHTAR, queryFn: () => cagri.get('/satin-alma-tedarik-terminleri', SURE) });
  const takip = useMemo(() => l.data?.takip ?? [], [l.data]);
  const turlu = takip.filter((x) => tur === '' || x.tur === tur);
  const say = (d: readonly TerminDurumu[]) => turlu.filter((x) => d.includes(x.durum)).length;
  const aranan = ara.trim().toLocaleUpperCase('tr-TR');
  const secili = BOLUMLER.find((b) => b.anahtar === bolum) ?? BOLUMLER[0]!;
  // Sıra sunucudadır: gecikti önce, sonra gereken tarih, ad.
  const satirlar = turlu.filter((x) => secili.uyar(x.durum) && (aranan === ''
    || [x.kod, x.ad, ...x.karsilayanlar.flatMap((k) => [k.talepNo, k.siparisNo]), ...x.emirler].join(' ').toLocaleUpperCase('tr-TR').includes(aranan)));

  const islem = (x: Satir) => {
    const siparis = x.karsilayanlar.find((k) => k.tur === 'siparis');
    const talep = x.karsilayanlar.find((k) => k.tur === 'talep');
    const malzemeNo = x.malzemeNo;
    const terminGirer = yazar && x.tur === 'malzeme' && malzemeNo !== null && !siparis;
    const talepAc = () => { void git('/taleplerim?bolum=yeni', { state: { taslak: talepTaslagi(x) } }); };
    const ogeler: MenuOgesi[] = [];
    let ana: MenuOgesi | null = null;
    if (talepAcar && (x.durum === 'eksik' || x.durum === 'termin_bekleniyor')) ana = { anahtar: 'talep-ac', baslik: 'Talep aç', simge: 'plus', sec: talepAc };
    else if (x.tur === 'fason') ana = { anahtar: 'dis', baslik: 'Dış işlem emrine git', simge: 'rotate', sec: () => { void git('/satin-alma/dis-operasyonlar'); } };
    else if (siparis) ana = { anahtar: 'siparis', baslik: 'Siparişe git', simge: 'truck', sec: () => { void git(talepAdresi(siparis)); } };
    else if (talep) ana = { anahtar: 'talep', baslik: 'Talebe git', simge: 'file', sec: () => { void git(talepAdresi(talep)); } };
    else if (terminGirer) ana = { anahtar: 'termin', baslik: 'Termin gir', simge: 'edit', sec: () => terminYaz({ ...x, malzemeNo }) };
    if (x.tur === 'fason' && siparis) ogeler.push({ anahtar: 'siparis', baslik: 'Siparişe git', simge: 'truck', sec: () => { void git(talepAdresi(siparis)); } });
    if (ana?.anahtar !== 'talep' && talep) ogeler.push({ anahtar: 'talep', baslik: 'Talebe git', simge: 'file', sec: () => { void git(talepAdresi(talep)); } });
    if (ana?.anahtar !== 'termin' && terminGirer) ogeler.push({ anahtar: 'termin', baslik: 'Termin gir', simge: 'edit', sec: () => terminYaz({ ...x, malzemeNo }) });
    if (x.emirler.length > 0) ogeler.push({ anahtar: 'emir', baslik: `Emirleri göster (${x.emirler.length})`, simge: 'list', sec: () => emirYaz(x) });
    return (
      <span className="sa-tt-islem">
        {ana && <Dugme simge={ana.simge} tur={ana.anahtar === 'talep-ac' ? 'birincil' : 'ikincil'} aria-label={`${x.kod ?? x.ad}: ${ana.baslik}`} onClick={ana.sec}>{ana.baslik}</Dugme>}
        {ogeler.length > 0 && <Menu etiket={`${x.kod ?? x.ad} için diğer işlemler`} ogeler={ogeler} />}
      </span>
    );
  };

  const sutunlar: Sutun<Satir>[] = [
    { anahtar: 'kalem', baslik: 'Kalem', hucre: (x) => ikili(x.kod ? <span className="mono">{x.kod}</span> : x.ad, `${x.kod ? `${x.ad} · ` : ''}${TUR_ADI[x.tur]}`), csv: (x) => `${x.kod ?? ''} ${x.ad}`.trim() },
    { anahtar: 'ihtiyac', baslik: 'İhtiyaç', kirilmaz: true, hucre: (x) => ikili(
      `${miktar(x.ihtiyacMiktari, x.birim)}${x.gerekenTarih ? `, ${kisaGun(x.gerekenTarih)}` : ''}`,
      x.emirler.length === 0 ? null : x.emirler.length === 1 ? x.emirler[0] : `${x.emirler[0]} +${x.emirler.length - 1}`,
    ), csv: (x) => `${x.ihtiyacMiktari ?? ''} ${x.birim ?? ''} ${x.gerekenTarih ?? ''}`.trim() },
    { anahtar: 'karsilayan', baslik: 'Karşılayan', hucre: karsilayanHucresi, csv: (x) => x.karsilayanTarih ?? '' },
    { anahtar: 'durum', baslik: 'Durum', kirilmaz: true, hucre: durumRozeti, csv: (x) => DURUM[x.durum].ad },
    ...(yazar || talepAcar ? [{ anahtar: 'islem', baslik: 'İşlem', kirilmaz: true, hucre: islem, csv: false as const }] : []),
  ];
  const sekmeler = BOLUMLER.map((b) => {
    if (b.anahtar === 'hepsi') return { anahtar: b.anahtar, baslik: b.baslik };
    const n = turlu.filter((x) => b.uyar(x.durum)).length;
    return b.rozetsiz ? { anahtar: b.anahtar, baslik: n > 0 ? `${b.baslik} · ${n.toLocaleString('tr-TR')}` : b.baslik } : { anahtar: b.anahtar, baslik: b.baslik, sayi: n };
  });
  const yuklendi = l.data !== undefined;
  return (
    <div className="sa-tt">
      <SayfaBasligi baslik="Termin takibi" simge="calendar" alt="Plandaki her ihtiyaç bir satır: ne zaman gerekli, hangi sipariş ya da talep karşılıyor, ne eksik." />
      <div className="sa-tt-sayilar">
        <SayiKarti baslik="Gecikti" simge="alert" ton="hata" {...(yuklendi ? { sayi: say(['gecikti']) } : {})} altMetin="gereken tarih ya da teslim geçti" />
        <SayiKarti baslik="Geç kalıyor" simge="clock" ton="uyari" {...(yuklendi ? { sayi: say(['gec_kaliyor']) } : {})} altMetin="sipariş gereken tarihten sonra" />
        <SayiKarti baslik="Eksik ya da tarihsiz" simge="box" ton="uyari" {...(yuklendi ? { sayi: say(['eksik', 'termin_bekleniyor', 'teslim_tarihi_yok']) } : {})} altMetin="talep açılmalı ya da tarih girilmeli" />
      </div>
      <Sekmeler<Bolum> etiket="Termin durumu" sekmeler={sekmeler} secili={bolum} sec={bolumYaz} />
      {l.isError ? <DurumKutusu durum="hata" yenile={() => void l.refetch()} />
        : <Tablo etiket="Termin takibi" sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.anahtar} mesgul={l.isPending}
          bosMesaj={ara ? 'Aramaya uyan kalem yok.' : bolum === 'sorunlu' ? 'Sorunlu termin yok.' : 'Bu bölümde kalem yok.'}
          arac={{
            arama: { deger: ara, degistir: araYaz, etiket: 'Terminlerde ara', yerTutucu: 'Kod, ad, sipariş, talep ya da emir no' },
            csv: { ad: 'termin-takibi' },
            sag: <Secim etiket="Tür" value={tur} onChange={(e) => turYaz(e.target.value as Tur | '')} bosSecenek="Malzeme, hizmet, fason"
              secenekler={(Object.keys(TUR_ADI) as Tur[]).map((t) => ({ deger: t, baslik: TUR_ADI[t] }))} />,
          }} />}
      {termin && <TerminPenceresi key={termin.anahtar} x={termin} kapat={() => terminYaz(null)} />}
      {emir && <EmirPenceresi x={emir} kapat={() => emirYaz(null)} />}
    </div>
  );
}
