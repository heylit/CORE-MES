import { useState, type ReactNode } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { Dugme, DurumKutusu, Girdi, Pencere, Secim, Sekmeler, type Sekme } from '../../../../ortak/arayuz/index.ts';
import { para } from '../bicim.ts';
import { MOTOR_HAZIRLANIYOR, ikSabitleri, type IkMotoru } from '../motor.ts';
import { AY_ADLARI, hesapOnDoldur, hesapSayisi, hesapVarsayilanlari, mesaiUcreti, type HesapDegerleri } from './kurallar.ts';
import { bordroMotoru, type BordroMotoru, type BordroSonucu, type Tazminat } from './motor-yuzu.ts';
import { Adimlar, AyTablosu, Not, eksi, kisaTarihMetni, sayiMetni, uzunTarih, yuzde, type Adim } from './parcalar.tsx';
import './bordro.css';

// Beş hesaplayıcı (Hesaplamalar sayfası ve bordro, personel, devam ekranlarındaki "hesapla" penceresi). Her sonuç seçilen
// parametre dönemiyle motorda hesaplanır ve kayıtlara dokunmaz.

export type HesapSekmesi = 'brutnet' | 'netbrut' | 'tazminat' | 'izin' | 'mesai';
export const HESAP_SEKMELERI: readonly Sekme<HesapSekmesi>[] = [
  { anahtar: 'brutnet', baslik: 'Brüt → net' },
  { anahtar: 'netbrut', baslik: 'Net → brüt' },
  { anahtar: 'tazminat', baslik: 'Kıdem, ihbar ve izin ücreti' },
  { anahtar: 'izin', baslik: 'Yıllık izin hak edişi' },
  { anahtar: 'mesai', baslik: 'Fazla mesai ücreti' },
];
export const hesapBasligi = (s: HesapSekmesi): string => HESAP_SEKMELERI.find((x) => x.anahtar === s)?.baslik ?? '';

// Bordronun adım adım dökümü (brüt -> net -> işveren maliyeti); oranlar o ayın dönem parametresidir.
export function bordroAdimlari(m: BordroMotoru, r: BordroSonucu | Omit<BordroSonucu, 'inp'>, ay: number): Adim[] {
  return [
    { etiket: 'Brüt ücret', deger: para(r.toplam) },
    { etiket: `SGK işçi payı (${yuzde(m.P('sgkIsciOran'))})`, deger: eksi(r.sgk), not: `Prime esas kazanç üzerinden: ${para(r.sgkMatrah)}${r.toplam > r.sgkMatrah ? ' (SGK tavanı uygulandı)' : ''}. %9 malullük, yaşlılık ve ölüm + %5 genel sağlık sigortası.` },
    { etiket: `İşsizlik sigortası işçi payı (${yuzde(m.P('issizlikIsciOran'))})`, deger: eksi(r.iss) },
    { etiket: 'Gelir vergisi matrahı', deger: para(r.matrah), not: 'Brüt ücret − SGK işçi payı − işsizlik işçi payı.' },
    { etiket: 'Yıl içi kümülatif matrah', deger: para(r.cumOnce + r.matrah), not: `Önceki ayların matrahı (${para(r.cumOnce)}) + bu ay. Kümülatif matrah büyüdükçe çalışan üst dilimlere geçer, bu yüzden net ücret yıl içinde düşebilir.` },
    { etiket: 'Hesaplanan gelir vergisi', deger: para(r.gvHam), not: 'Kümülatif matrahın vergisi − önceki aylar kümülatif matrahının vergisi (GVK md. 103 tarifesi).' },
    { etiket: 'Asgari ücret gelir vergisi istisnası', deger: eksi(r.gvIst), not: 'Asgari ücretin aynı ay için hesaplanan gelir vergisi kadar tutar vergiden düşülür (GVK md. 23/18).' },
    { etiket: 'Gelir vergisi', deger: eksi(r.gv) },
    { etiket: `Damga vergisi (binde ${sayiMetni(m.P('damgaOran') * 10)})`, deger: eksi(r.dv), not: `Brüt ücretin binde ${sayiMetni(m.P('damgaOran') * 10)}'u; asgari ücrete isabet eden kısım (${para(r.dvIst)}) istisnadır.` },
    { etiket: `${AY_ADLARI[ay - 1] ?? ''} net ücret`, deger: para(r.net), toplam: true },
    { etiket: `SGK işveren payı (${yuzde(m.P('sgkIsverenOran'))})`, deger: para(r.isvBrut) },
    { etiket: r.tesvik ? `Teşvik: ${r.tesvik.ad}` : 'Teşvik indirimi', deger: eksi(r.tInd), not: r.tesvik ? 'Genel ayardaki teşvik uygulandı. Kişiye özel teşvik personel kartından seçilir.' : 'Teşvik uygulanmadı. Ayarlar > Teşvikler bölümünden varsayılan teşviki seçebilirsiniz.' },
    { etiket: `İşsizlik sigortası işveren payı (${yuzde(m.P('issizlikIsverenOran'))})`, deger: para(r.isvIss) },
    { etiket: 'Toplam işveren maliyeti', deger: para(r.maliyet), toplam: true },
  ];
}

export function tazminatAdimlari(m: BordroMotoru, r: Tazminat): Adim[] {
  const dv = `Damga vergisi (binde ${sayiMetni(m.P('damgaOran') * 10)})`;
  const kidem: Adim[] = !r.yearOk
    ? [{ etiket: 'Kıdem tazminatı', deger: para(0), not: 'Aynı işverende en az 1 yıl çalışma şartı sağlanmadığı için kıdem tazminatı doğmaz (1475 sayılı Kanun md. 14).' }]
    : !r.codeOk
      ? [{ etiket: 'Kıdem tazminatı', deger: para(0), not: 'Seçilen çıkış nedeninde (istifa, deneme süresinde fesih veya işçinin ahlak ve iyi niyet kurallarına aykırı davranışı) kıdem tazminatı hakkı doğmaz. Askerlik, emeklilik, evlilik, haklı nedenle istifa gibi istisnalar için çıkış nedenini doğru seçin.' }]
      : [
        { etiket: `Tam yıllar: ${r.p.y} yıl × ${para(r.esas)}`, deger: para(r.kYil), not: 'Her tam hizmet yılı için 30 günlük ücret.' },
        { etiket: `Artan aylar: ${r.p.m} ay × ${para(r.esas)} / 12`, deger: para(r.kAy), not: 'Bir yıldan artan süreler orantılı olarak eklenir.' },
        { etiket: `Artan günler: ${r.p.d} gün × ${para(r.esas)} / 365`, deger: para(r.kGun) },
        { etiket: 'Brüt kıdem tazminatı', deger: para(r.kBrut), toplam: true },
        { etiket: dv, deger: eksi(r.kDv), not: 'Kıdem tazminatı tavanı aşmadığı sürece gelir vergisinden (GVK md. 25/7) ve SGK priminden istisnadır; yalnızca damga vergisi kesilir.' },
        { etiket: 'Net kıdem tazminatı', deger: para(r.kNet), toplam: true },
      ];
  const izin: Adim[] = r.izinGun ? [
    { baslik: 'Kullanılmayan yıllık izin ücreti' },
    { etiket: `${sayiMetni(r.izinGun)} gün × ${para(r.brut / 30)}`, deger: para(r.izBrut), not: 'Sözleşme sona erdiğinde kullanılmamış yıllık izin günleri, son ücret üzerinden ödenir (İş Kanunu md. 59). Günlük ücret = brüt ücret / 30.' },
    { etiket: 'SGK ve işsizlik işçi payı', deger: eksi(r.izSgk), not: 'Kıdem ve ihbardan farklı olarak izin ücreti prime tabidir.' },
    { etiket: 'Gelir vergisi', deger: eksi(r.izGv) },
    { etiket: 'Damga vergisi', deger: eksi(r.izDv) },
    { etiket: 'Net izin ücreti', deger: para(r.izNet), toplam: true },
  ] : [];
  const ihbarIsciye = r.rule.due === 'isci' || !r.code;
  return [
    { baslik: 'Hizmet süresi ve esas ücret' },
    { etiket: 'Toplam hizmet süresi', deger: `${r.p.y} yıl ${r.p.m} ay ${r.p.d} gün`, not: `${uzunTarih(r.g)} – ${uzunTarih(r.c)}, toplam ${sayiMetni(r.days)} gün. Çıkış günü dahil sayılır.` },
    { etiket: 'Giydirilmiş brüt ücret', deger: para(r.giy), not: `Son brüt ücret (${para(r.brut)}) ile düzenli ve sürekli ödenen yan hakların (${para(r.yan)}) toplamı. Kıdem ve ihbar bu ücret üzerinden hesaplanır.` },
    { etiket: 'Kıdem tazminatı tavanı', deger: para(m.P('kidemTavan')), not: 'Bir hizmet yılı için ödenebilecek en yüksek tutar. Fesih tarihinde geçerli tavan uygulanır.' },
    { etiket: 'Kıdem için esas ücret', deger: para(r.esas), not: r.giy > r.esas ? 'Giydirilmiş ücret tavanı aştığı için tavan esas alındı.' : 'Giydirilmiş ücret tavanın altında olduğu için kendisi esas alındı.' },
    { baslik: 'Kıdem tazminatı' },
    ...kidem,
    { baslik: 'İhbar (bildirim) süresi ve tazminatı' },
    { etiket: 'İhbar süresi', deger: `${r.weeks} hafta (${r.nDays} gün)`, not: `Hizmet süresi ${r.months} ay. İş Kanunu md. 17'ye göre 6 aydan az: ${m.P('ihbar1')} hafta, 6 ay–1,5 yıl: ${m.P('ihbar2')} hafta, 1,5–3 yıl: ${m.P('ihbar3')} hafta, 3 yıldan fazla: ${m.P('ihbar4')} hafta.` },
    { etiket: `Brüt ihbar tazminatı: ${r.nDays} gün × ${para(r.daily)}`, deger: para(r.nBrut), not: 'Günlük giydirilmiş ücret = giydirilmiş brüt ücret / 30. İhbar tazminatında tavan uygulanmaz.' },
    { etiket: 'Gelir vergisi', deger: eksi(r.nGv), not: `İhbar tazminatı ücret gibi vergilendirilir; yıl içi kümülatif matrah (${para(r.cum)}) üzerine eklenerek dilim oranı bulunur. SGK primi kesilmez.` },
    { etiket: dv, deger: eksi(r.nDv) },
    { etiket: 'Net ihbar tazminatı', deger: para(r.nNet), toplam: true, not: r.rule.text },
    ...izin,
    { baslik: 'Toplam' },
    {
      etiket: 'Ödenecek toplam (net)', deger: para(r.kNet + (ihbarIsciye ? r.nNet : 0) + r.izNet), toplam: true,
      not: ihbarIsciye ? 'Kıdem, ihbar ve izin ücreti netlerinin toplamı.' : 'İhbar tazminatı bu çıkış nedeninde işçiye ödenmediği için toplama katılmadı.',
    },
  ];
}

interface Tanim { form: (a: AlanYapici) => ReactNode; sonuc: (m: BordroMotoru, d: HesapDegerleri) => ReactNode; yardim: ReactNode; dayanak: string }
interface AlanYapici { sayi: (k: string, etiket: string, yerTutucu?: string) => ReactNode; tarih: (k: string, etiket: string) => ReactNode; secim: (k: string, etiket: string, secenekler: readonly { deger: string; baslik: string }[], bos?: string) => ReactNode }

const TANIMLAR: Readonly<Record<HesapSekmesi, Tanim>> = {
  brutnet: {
    form: (a) => (<>{a.sayi('brut', 'Aylık brüt ücret (₺)')}{a.secim('ay', 'Ayrıntısı gösterilecek ay', AY_ADLARI.map((ad, i) => ({ deger: String(i + 1), baslik: ad })))}</>),
    sonuc: (m, d) => {
      const b = hesapSayisi(d['brut']);
      if (!b) return null;
      const aylar = m.brutNetMonths(b); const ay = Number(d['ay']) || 1; const sec = aylar[ay - 1];
      return (<>
        <h4>{AY_ADLARI[ay - 1]} ayı adım adım</h4>
        {sec && <Adimlar etiket="Adım adım hesap" adimlar={bordroAdimlari(m, { ...sec }, ay)} />}
        <h4>12 aylık tablo</h4>
        <AyTablosu aylar={aylar} vurgu={ay} />
        <Not>Tüm yıl aynı brüt ücretin ödendiği varsayılır. Ek ödeme, fazla mesai ve yan haklar dahil değildir.</Not>
      </>);
    },
    yardim: <p>Brüt ücretten önce SGK ve işsizlik sigortası işçi payları düşülerek gelir vergisi matrahı bulunur. Gelir vergisi, yılbaşından itibaren biriken (kümülatif) matraha göre artan oranlı tarifeyle hesaplanır; bu nedenle aynı brüt ücretle yılın son aylarında net ücret düşebilir. 2022’den bu yana asgari ücrete isabet eden gelir ve damga vergisi tüm çalışanlar için istisnadır.</p>,
    dayanak: 'Dayanak: 193 sayılı Gelir Vergisi Kanunu md. 23/18, 61, 63, 103; 488 sayılı Damga Vergisi Kanunu; 5510 sayılı Kanun md. 81–82; 4447 sayılı İşsizlik Sigortası Kanunu.',
  },
  netbrut: {
    form: (a) => a.sayi('net', 'Ele geçmesi istenen aylık net ücret (₺)'),
    sonuc: (m, d) => {
      const n = hesapSayisi(d['net']);
      if (!n) return null;
      return (<>
        <h4>Neti sabit tutmak için gereken brüt ücret</h4>
        <AyTablosu aylar={m.netToBrut(n)} />
        <Not>Net ücret her ay aynı kalacak şekilde her ayın brütü ayrı hesaplanır. Kümülatif matrah arttıkça aynı net için gereken brüt de artar. İş sözleşmelerinde ücretin brüt olarak yazılması önerilir.</Not>
      </>);
    },
    yardim: <p>Net ücret üzerinden anlaşma yapıldığında işverenin ödeyeceği brüt ücret, kesintiler tersine çözülerek bulunur. Uygulama her ay için brüt ücreti, o ayın netini hedef nete eşitleyecek şekilde ardışık yaklaşımla hesaplar.</p>,
    dayanak: 'Hesap, Ayarlar’daki asgari ücret, SGK oranları, tavan ve gelir vergisi dilimleriyle yapılır.',
  },
  tazminat: {
    form: (a) => (<>
      {a.tarih('giris', 'İşe giriş tarihi')}{a.tarih('cikis', 'İşten çıkış tarihi')}{a.sayi('kbrut', 'Son aylık brüt ücret (₺)')}
      {a.sayi('yanHak', 'Düzenli yan haklar, aylık (₺)')}
      {a.secim('kod', 'Çıkış nedeni', (ikSabitleri()?.EXIT_CODES ?? []).map((c) => ({ deger: c, baslik: c })), 'Seçilmedi')}
      {a.sayi('izinGun', 'Kullanılmayan yıllık izin (gün)')}{a.sayi('cum', 'Yıl içi kümülatif vergi matrahı (₺)', 'Boşsa tahmin edilir')}
    </>),
    sonuc: (m, d) => {
      const r = m.severance({ giris: d['giris'] ?? '', cikis: d['cikis'] ?? '', brut: hesapSayisi(d['kbrut']), yanHak: hesapSayisi(d['yanHak']), kod: d['kod'] ?? '', izinGun: hesapSayisi(d['izinGun']), cum: d['cum'] === '' ? '' : hesapSayisi(d['cum']) });
      return r ? <Adimlar etiket="Tazminat hesabı" adimlar={tazminatAdimlari(m, r)} /> : <Not>Hesaplama için geçerli bir işe giriş ve çıkış tarihi girin.</Not>;
    },
    yardim: (<>
      <p><b>Kıdem tazminatı:</b> Aynı işverende en az 1 yıl çalışan işçiye; işverenin haklı neden olmadan feshi, işçinin haklı nedenle feshi, askerlik, emeklilik, kadın işçinin evlendikten sonraki 1 yıl içinde ayrılması veya ölüm hâlinde ödenir. Her tam yıl için 30 günlük giydirilmiş brüt ücret, artan süreler orantılı eklenir; tavanı aşamaz.</p>
      <p><b>İhbar tazminatı:</b> Belirsiz süreli sözleşmeyi bildirim süresine uymadan fesheden taraf, bildirim süresine ait ücret tutarında tazminat öder. Bildirim süresi hizmet süresine göre 2 ile 8 hafta arasındadır ve sözleşmeyle artırılabilir.</p>
      <p><b>Kullanılmayan izin ücreti:</b> Sözleşme hangi nedenle sona ererse ersin, kullanılmamış yıllık izin günlerinin ücreti son ücret üzerinden ödenir.</p>
    </>),
    dayanak: 'Dayanak: 1475 sayılı İş Kanunu md. 14; 4857 sayılı İş Kanunu md. 17, 32, 59; GVK md. 25/7.',
  },
  izin: {
    form: (a) => (<>{a.tarih('iGiris', 'İşe giriş tarihi')}{a.tarih('iDogum', 'Doğum tarihi')}{a.tarih('iTarih', 'Hesaplama tarihi')}</>),
    sonuc: (m, d) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d['iGiris'] ?? '')) return null;
      const an = /^\d{4}-\d{2}-\d{2}$/.test(d['iTarih'] ?? '') ? new Date(`${d['iTarih'] ?? ''}T00:00:00`) : new Date();
      const b = m.leaveBalance({ id: '_hesap', kind: 'emp', iseGiris: d['iGiris'] ?? '', dogumTarihi: d['iDogum'] ?? '' }, an);
      return (<>
        <Adimlar etiket="İzin hak edişi" adimlar={[
          { etiket: 'Tamamlanan hizmet yılı', deger: `${b.years} yıl` },
          { etiket: 'Toplam hak edilen yıllık izin', deger: `${b.hak} gün`, toplam: true, not: 'Kullanılan izinler düşülmeden önceki toplam hak.' },
          { etiket: 'Sonraki hak ediş', deger: b.next ? `${uzunTarih(b.next)}, ${b.nextDays} gün` : '—' },
        ]} />
        {b.rows.length ? (<>
          <h4>Hizmet yılına göre</h4>
          <div className="tc-ikb-kaydir">
            <table className="tc-ikb-tablo">
              <thead><tr><th scope="col">Hizmet yılı</th><th scope="col">Hak ediş tarihi</th><th scope="col">Gün</th><th scope="col">Not</th></tr></thead>
              <tbody>{b.rows.map((r) => <tr key={r.k}><th scope="row">{r.k}. yıl</th><td>{uzunTarih(r.ann)}</td><td>{r.d}</td><td>{r.note}</td></tr>)}</tbody>
            </table>
          </div>
        </>) : <Not>Henüz 1 yıllık hizmet tamamlanmadığı için yıllık izin hakkı doğmamıştır.</Not>}
      </>);
    },
    yardim: <p>Deneme süresi dahil en az 1 yıl çalışan işçi yıllık ücretli izne hak kazanır. Süreler: 1–5 yıl (5 dahil) için en az 14 gün, 5 yıldan fazla 15 yıldan az için 20 gün, 15 yıl ve üzeri için 26 gün. 18 yaş ve altındaki ile 50 yaş ve üzerindeki işçilere verilecek izin 20 günden az olamaz. Süreler iş günü olarak hesaplanır; ulusal bayram, hafta tatili ve genel tatil günleri izin süresine sayılmaz.</p>,
    dayanak: 'Dayanak: 4857 sayılı İş Kanunu md. 53–56. Süreleri Ayarlar > Çalışma, izin ve ihbar bölümünden değiştirebilirsiniz (sözleşmeyle artırılabilir, azaltılamaz).',
  },
  mesai: {
    form: (a) => (<>
      {a.sayi('mBrut', 'Aylık brüt ücret (₺)')}{a.sayi('mSaat', 'Fazla çalışma (saat)')}{a.sayi('fsSaat', 'Fazla sürelerle çalışma (saat)')}
      {a.sayi('htSaat', 'Hafta tatili çalışması (saat)')}{a.sayi('ubgtGun', 'Resmî tatil çalışması (gün)')}
    </>),
    sonuc: (m, d) => {
      const b = hesapSayisi(d['mBrut']);
      if (!b) return null;
      const s = (k: string): number => hesapSayisi(d[k]);
      const u = mesaiUcreti((k) => m.P(k), b, { mSaat: s('mSaat'), fsSaat: s('fsSaat'), htSaat: s('htSaat'), ubgtGun: s('ubgtGun') });
      return <Adimlar etiket="Fazla mesai ücreti" adimlar={[
        { etiket: 'Saatlik brüt ücret', deger: para(u.saatlik), not: `Aylık brüt / ${sayiMetni(m.P('aylikSaat'))} saat (30 gün × 7,5 saat).` },
        { etiket: 'Günlük brüt ücret', deger: para(u.gunluk), not: 'Aylık brüt / 30.' },
        { etiket: `Fazla çalışma: ${sayiMetni(s('mSaat'))} sa × ${sayiMetni(m.P('mesaiCarpan'))}`, deger: para(u.fazla), not: 'Haftalık 45 saati aşan çalışmalar; her saat %50 zamlı ödenir.' },
        { etiket: `Fazla sürelerle çalışma: ${sayiMetni(s('fsSaat'))} sa × ${sayiMetni(m.P('fazlaSurelerCarpan'))}`, deger: para(u.fazlaSure), not: 'Haftalık süre sözleşmeyle 45 saatin altında belirlenmişse, 45 saate kadar yapılan çalışmalar %25 zamlı ödenir.' },
        { etiket: `Hafta tatili çalışması: ${sayiMetni(s('htSaat'))} sa × ${sayiMetni(m.P('haftaTatiliCarpan'))}`, deger: para(u.haftaTatili), not: 'Kanunda açık oran yoktur; uygulamada ve Yargıtay kararlarında %50 zamlı ödenir.' },
        { etiket: `Resmî tatil çalışması: ${sayiMetni(s('ubgtGun'))} gün × ${sayiMetni(m.P('ubgtCarpan'))}`, deger: para(u.resmiTatil), not: 'Ulusal bayram ve genel tatilde çalışılan her gün için ayrıca bir günlük ücret ödenir (md. 47).' },
        { etiket: 'Toplam ek brüt ödeme', deger: para(u.toplam), toplam: true, not: 'Bu tutarlar brüttür; SGK, işsizlik, gelir ve damga vergisi kesintisine tabidir.' },
      ]} />;
    },
    yardim: <p>Fazla çalışma, haftalık 45 saati aşan çalışmadır ve yılda 270 saati geçemez. Fazla çalışma için işçinin yazılı onayı alınmalıdır. İşçi isterse fazla çalışma ücreti yerine her saat için 1,5 saat serbest zaman kullanabilir. Günlük çalışma süresi 11 saati aşamaz.</p>,
    dayanak: 'Dayanak: 4857 sayılı İş Kanunu md. 41, 46, 47, 63; Fazla Çalışma Yönetmeliği.',
  },
};

export interface HesapOnAyari { sekme?: HesapSekmesi; donem?: string; personel?: string }

export function donemEtiketi(m: BordroMotoru, d: { id: string; ad: string; baslangic: string }): string {
  const bitis = m.periodEnd(d as never);
  return `${d.ad} (${kisaTarihMetni(d.baslangic)} – ${bitis ? kisaTarihMetni(bitis) : 'devam ediyor'})`;
}

// tekli: pencerede tek hesaplayıcı (sekme seçimi yok, açıklama kapalı).
export function HesapPaneli({ motor, onAyar = {}, tekli = false }: { motor: IkMotoru; onAyar?: HesapOnAyari; tekli?: boolean }) {
  const m = bordroMotoru(motor);
  const bugun = tesisGunu(Date.now());
  const [sekme, sekmeYaz] = useState<HesapSekmesi>(onAyar.sekme ?? 'brutnet');
  const [degerler, degerYaz] = useState<Record<string, string>>(() => {
    const ilk = hesapVarsayilanlari(bugun, ikSabitleri()?.EXIT_CODES[3] ?? '');
    const e = onAyar.personel ? m.sortedEmps().find((x) => x.id === onAyar.personel) : undefined;
    return e ? { ...ilk, ...hesapOnDoldur(m, e, bugun) } : ilk;
  });
  const donemler = m.periods();
  const [donemId, donemYaz] = useState(onAyar.donem ?? m.periodAt(bugun).id);
  const donem = donemler.find((d) => d.id === donemId) ?? m.periodAt(bugun);
  const tanim = TANIMLAR[sekme];
  const yaz = (k: string, v: string) => { degerYaz((d) => ({ ...d, [k]: v })); };

  const alan: AlanYapici = {
    sayi: (k, etiket, yerTutucu) => <Girdi key={k} etiket={etiket} type="number" step="any" inputMode="decimal" value={degerler[k] ?? ''} placeholder={yerTutucu} onChange={(o) => { yaz(k, o.target.value); }} />,
    tarih: (k, etiket) => <Girdi key={k} etiket={etiket} type="date" value={degerler[k] ?? ''} onChange={(o) => { yaz(k, o.target.value); }} />,
    secim: (k, etiket, secenekler, bos) => <Secim key={k} etiket={etiket} secenekler={secenekler} {...(bos === undefined ? {} : { bosSecenek: bos })} value={degerler[k] ?? ''} onChange={(o) => { yaz(k, o.target.value); }} />,
  };
  const personeller = m.sortedEmps();

  return (
    <div className="tc-ikb-hesap">
      {!tekli && <Sekmeler etiket="Hesaplama türü" sekmeler={HESAP_SEKMELERI} secili={sekme} sec={sekmeYaz} />}
      <div className="tc-ikb-hesap-izgara">
        <section className="tc-ikb-bolum" aria-label={hesapBasligi(sekme)}>
          {!tekli && <header><h3>{hesapBasligi(sekme)}</h3></header>}
          <div className="tc-ikb-alanlar">
            <Secim
              etiket="Parametre dönemi" value={donem.id} onChange={(o) => { donemYaz(o.target.value); }}
              secenekler={donemler.map((d) => ({ deger: d.id, baslik: donemEtiketi(m, d) }))}
              ipucu={sekme === 'tazminat' ? 'Kıdem tavanı ve ihbar süreleri çıkış tarihindeki dönemden alınır.' : 'Hesap bu dönemin asgari ücret, oran ve limitleriyle yapılır.'}
            />
            {sekme === 'tazminat' && (
              <Secim
                etiket="Personelden doldur (isteğe bağlı)" bosSecenek="Personel seçin" value={degerler['emp'] ?? ''}
                secenekler={personeller.map((e) => ({ deger: e.id, baslik: m.fullName(e) + (e.pozisyon ? ` – ${e.pozisyon}` : '') }))}
                onChange={(o) => {
                  const e = personeller.find((x) => x.id === o.target.value);
                  degerYaz((d) => (e ? { ...d, ...hesapOnDoldur(m, e, bugun) } : { ...d, emp: '' }));
                }}
              />
            )}
            {tanim.form(alan)}
          </div>
          <details className="tc-ikb-detay" open={!tekli}>
            <summary><b>Nasıl hesaplanır?</b></summary>
            {tanim.yardim}
            <p className="tc-ikb-dayanak">{tanim.dayanak}</p>
          </details>
        </section>
        <section className="tc-ikb-bolum" aria-live="polite">
          <header><h3>Sonuç</h3></header>
          {m.withPeriod(donem.baslangic, () => tanim.sonuc(m, degerler))}
          <Not>Hesaplamalar seçilen parametre dönemiyle yapılan tahminlerdir ve kayıtlara dokunmaz; resmî bordro ve fesih işlemleri için mali müşavir veya hukuk danışmanınıza danışın.</Not>
        </section>
      </div>
    </div>
  );
}

export function MotorBekleniyor() {
  return <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />;
}

// Başka ekrandan açılan tek hesaplayıcı ("Brüt–net hesapla", "Mesai ücreti hesapla"); bütün hesaplayıcılar Hesaplamalar sayfasında.
export function HesapPenceresi({ motor, onAyar, kapat, sayfayaGit }: { motor: IkMotoru; onAyar: HesapOnAyari; kapat: () => void; sayfayaGit: () => void }) {
  return (
    <Pencere
      acik tur="tam" baslik={hesapBasligi(onAyar.sekme ?? 'brutnet')} kapat={kapat}
      alt={(<>
        <span className="tc-ikb-alt-not">Tüm hesaplayıcılar için Hesaplamalar sayfasını kullanabilirsiniz.</span>
        <Dugme simge="ruler" onClick={sayfayaGit}>Hesaplamalar sayfası</Dugme>
        <Dugme tur="birincil" onClick={kapat}>Kapat</Dugme>
      </>)}
    >
      <HesapPaneli motor={motor} onAyar={onAyar} tekli />
    </Pencere>
  );
}
