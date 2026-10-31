import { useState, type ReactNode } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu, Girdi, Secim } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, para, tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR, type IkMotoru } from '../motor.ts';
import { AylikTablo, BrutNetAdimlari, TazminatAdimlari, type Ayar } from './hesaplar.tsx';
import { AYLAR, sayi } from './kurallar.ts';
import {
  ayarSayisi, brutNetAylari, donemBitis, donemde, donemler, donemTarihte, guncelBrut, iso, izinHakki, kalanIzin, netBrutAylari, tazminat,
  type Donem,
} from './motor-yuzu.ts';
import { Adimlar, Baslik, DugmeGrubu, Metin, Not, sayiMetni } from './parcalar.tsx';

export type HesapSekmesi = 'brutnet' | 'netbrut' | 'tazminat' | 'izin' | 'mesai';
export const HESAP_SEKMELERI: readonly (readonly [HesapSekmesi, string])[] = [
  ['brutnet', 'Brüt → net'], ['netbrut', 'Net → brüt'], ['tazminat', 'Kıdem, ihbar ve izin ücreti'], ['izin', 'Yıllık izin hak edişi'], ['mesai', 'Fazla mesai ücreti'],
];
const sekmeMi = (k: string | null): k is HesapSekmesi => HESAP_SEKMELERI.some(([s]) => s === k);

type Alanlar = Record<string, string>;
const varsayilanlar = (bugun: string, kod: string): Alanlar => ({
  brut: '50000', ay: '1', net: '40000', emp: '', giris: '2019-03-01', cikis: bugun, kbrut: '60000', yanHak: '4500', kod, izinGun: '6', cum: '',
  iGiris: '2015-06-15', iDogum: '1975-04-10', iTarih: bugun, mBrut: '50000', mSaat: '12', fsSaat: '0', htSaat: '0', ubgtGun: '0',
});

export const donemEtiketi = (m: IkMotoru, d: Donem): string => {
  const b = donemBitis(m, d);
  return `${d.ad} (${tarih(d.baslangic)} – ${b ? tarih(b) : 'devam ediyor'})`;
};

// Hesaplamalar (app.js viewCalc): beş hesaplayıcı, seçilen parametre dönemiyle; kayıtlara dokunmaz. Sekme adresin kimlik parçasından da gelir.
export function Hesaplamalar(o: IkEkranOzellikleri) {
  return (
    <section className="tc-ikb">
      <Baslik baslik="Hesaplamalar" simge="ruler" alt="Bordro, tazminat, izin ve mesai hesaplarını kontrol etmek için şablonlar. Her sonuç adım adım ve dayanak maddeleriyle gösterilir; kayıtlara dokunmaz." />
      {o.motor ? <Hesaplayici o={o} m={o.motor} ilkSekme={sekmeMi(o.kimlik) ? o.kimlik : 'brutnet'} /> : <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />}
    </section>
  );
}

export function Hesaplayici({ o, m, ilkSekme, ilkDonem, ilkAlanlar, gomulu = false }: {
  o: IkEkranOzellikleri; m: IkMotoru; ilkSekme: HesapSekmesi; ilkDonem?: string; ilkAlanlar?: Alanlar; gomulu?: boolean;
}) {
  const bugun = tesisGunu(Date.now());
  const cikisKodlari = ikSabitleri()?.EXIT_CODES ?? [];
  const [sekme, sekmeYaz] = useState<HesapSekmesi>(ilkSekme);
  const [alan, alanYaz] = useState<Alanlar>(() => ({ ...varsayilanlar(bugun, cikisKodlari[3] ?? ''), ...ilkAlanlar }));
  const liste = donemler(m);
  const [donemId, donemIdYaz] = useState(ilkDonem ?? donemTarihte(m, bugun).id);
  const donem = liste.find((d) => d.id === donemId) ?? donemTarihte(m, bugun);
  const yaz = (k: string) => (v: string) => { alanYaz((a) => ({ ...a, [k]: v })); };
  const sayiAlani = (k: string, etiket: string, ek: Record<string, string> = {}) => (
    <Girdi key={k} etiket={etiket} type="number" step="any" inputMode="decimal" value={alan[k] ?? ''} onChange={(e) => { yaz(k)(e.target.value); }} {...ek} />
  );
  const tarihAlani = (k: string, etiket: string) => <Girdi key={k} etiket={etiket} type="date" value={alan[k] ?? ''} onChange={(e) => { yaz(k)(e.target.value); }} />;

  useSayfaKomutlari(gomulu ? 'ik-hesap-pencere' : 'ik-hesap', gomulu ? null : HESAP_SEKMELERI.map(([k, ad]) => ({
    anahtar: k, baslik: `${ad} hesapla`, simge: 'ruler' as const, aciklama: null, sozcukler: [ad, 'hesap'], calistir: () => { sekmeYaz(k); },
  })));

  const personeldenDoldur = (id: string) => {
    const p = o.depo.tur('emp').find((x) => x.id === id);
    if (!p) { alanYaz((a) => ({ ...a, emp: id })); return; }
    const cikis = p.cikisTarihi || bugun;
    alanYaz((a) => ({
      ...a, emp: id, giris: p.iseGiris ?? '', cikis, kbrut: String(guncelBrut(m, p)), yanHak: String(sayi(p.yanHakTutar)), kod: p.cikisKodu ?? '',
      izinGun: String(Math.max(0, kalanIzin(m, p, cikis))), cum: '',
    }));
  };

  const hesap = HESAPLAYICILAR[sekme];
  const p: Ayar = (k) => ayarSayisi(m, k);
  const form: ReactNode = sekme === 'brutnet' ? (
    <>
      {sayiAlani('brut', 'Aylık brüt ücret (₺)')}
      <Secim etiket="Ayrıntısı gösterilecek ay" value={alan['ay']} onChange={(e) => { yaz('ay')(e.target.value); }} secenekler={AYLAR.map((a, i) => ({ deger: String(i + 1), baslik: a }))} />
    </>
  ) : sekme === 'netbrut' ? sayiAlani('net', 'Ele geçmesi istenen aylık net ücret (₺)')
    : sekme === 'tazminat' ? (
      <>
        <div className="tc-ikb-tam">
          <Secim etiket="Personelden doldur (isteğe bağlı)" value={alan['emp']} onChange={(e) => { personeldenDoldur(e.target.value); }}
            secenekler={[{ deger: '', baslik: 'Personel seçin' }, ...m.sortedEmps().map((x) => ({ deger: x.id, baslik: adSoyad(x) + (x.pozisyon ? ` – ${x.pozisyon}` : '') }))]} />
        </div>
        {tarihAlani('giris', 'İşe giriş tarihi')}{tarihAlani('cikis', 'İşten çıkış tarihi')}
        {sayiAlani('kbrut', 'Son aylık brüt ücret (₺)')}{sayiAlani('yanHak', 'Düzenli yan haklar, aylık (₺)')}
        <div className="tc-ikb-tam">
          <Secim etiket="Çıkış nedeni" value={alan['kod']} onChange={(e) => { yaz('kod')(e.target.value); }}
            secenekler={[{ deger: '', baslik: 'Seçilmedi' }, ...cikisKodlari.map((k) => ({ deger: k, baslik: k }))]} />
        </div>
        {sayiAlani('izinGun', 'Kullanılmayan yıllık izin (gün)')}{sayiAlani('cum', 'Yıl içi kümülatif vergi matrahı (₺)', { placeholder: 'Boşsa tahmin edilir' })}
      </>
    ) : sekme === 'izin' ? <>{tarihAlani('iGiris', 'İşe giriş tarihi')}{tarihAlani('iDogum', 'Doğum tarihi')}{tarihAlani('iTarih', 'Hesaplama tarihi')}</>
      : <>{sayiAlani('mBrut', 'Aylık brüt ücret (₺)')}{sayiAlani('mSaat', 'Fazla çalışma (saat)')}{sayiAlani('fsSaat', 'Fazla sürelerle çalışma (saat)')}{sayiAlani('htSaat', 'Hafta tatili çalışması (saat)')}{sayiAlani('ubgtGun', 'Resmî tatil çalışması (gün)')}</>;

  return (
    <>
      {!gomulu && <DugmeGrubu etiket="Hesaplama türü" secenekler={HESAP_SEKMELERI} secili={sekme} sec={sekmeYaz} />}
      <div className="tc-ikb-hesap">
        <section className="tc-ikb-kutu" aria-label={hesap.ad}>
          {!gomulu && <h3>{hesap.ad}</h3>}
          <Secim etiket="Parametre dönemi" value={donem.id} onChange={(e) => { donemIdYaz(e.target.value); }}
            ipucu={sekme === 'tazminat' ? 'Kıdem tavanı ve ihbar süreleri çıkış tarihindeki dönemden alınır.' : 'Hesap bu dönemin asgari ücret, oran ve limitleriyle yapılır.'}
            secenekler={liste.map((d) => ({ deger: d.id, baslik: donemEtiketi(m, d) }))} />
          <div className="tc-ikb-alanlar">{form}</div>
          <details className="tc-ikb-aciklama" open={!gomulu}>
            <summary><b>Nasıl hesaplanır?</b></summary>
            <Metin html={hesap.yardim} />
          </details>
        </section>
        <section className="tc-ikb-kutu" aria-label="Sonuç">
          <h3>Sonuç</h3>
          <div aria-live="polite">{donemde(m, donem.baslangic, () => hesap.sonuc(m, alan, p))}</div>
          <Not>Hesaplamalar seçilen parametre dönemiyle yapılan tahminlerdir ve kayıtlara dokunmaz; resmî bordro ve fesih işlemleri için mali müşavir veya hukuk danışmanınıza danışın.</Not>
        </section>
      </div>
    </>
  );
}

interface HesapTanimi { ad: string; yardim: string; sonuc: (m: IkMotoru, a: Alanlar, p: Ayar) => ReactNode }

const HESAPLAYICILAR: Record<HesapSekmesi, HesapTanimi> = {
  brutnet: {
    ad: 'Brüt → net',
    sonuc: (m, a, p) => {
      const brut = sayi(a['brut']);
      if (!brut) return null;
      const aylar = brutNetAylari(m, brut);
      const ay = Number(a['ay']) || 1;
      const secili = aylar[ay - 1];
      return (
        <>
          <h4 className="tc-ikb-ara-baslik">{`${AYLAR[ay - 1] ?? ''} ayı adım adım`}</h4>
          {secili && <BrutNetAdimlari a={secili} ay={ay} p={p} />}
          <h4 className="tc-ikb-ara-baslik">12 aylık tablo</h4>
          <AylikTablo aylar={aylar} secili={ay} />
          <Not>Tüm yıl aynı brüt ücretin ödendiği varsayılır. Ek ödeme, fazla mesai ve yan haklar dahil değildir.</Not>
        </>
      );
    },
    yardim: '<p>Brüt ücretten önce SGK ve işsizlik sigortası işçi payları düşülerek gelir vergisi matrahı bulunur. Gelir vergisi, yılbaşından itibaren biriken (kümülatif) matraha göre artan oranlı tarifeyle hesaplanır; bu nedenle aynı brüt ücretle yılın son aylarında net ücret düşebilir. 2022’den bu yana asgari ücrete isabet eden gelir ve damga vergisi tüm çalışanlar için istisnadır.</p><p class="ref">Dayanak: 193 sayılı Gelir Vergisi Kanunu md. 23/18, 61, 63, 103; 488 sayılı Damga Vergisi Kanunu; 5510 sayılı Kanun md. 81–82; 4447 sayılı İşsizlik Sigortası Kanunu.</p>',
  },
  netbrut: {
    ad: 'Net → brüt',
    sonuc: (m, a) => {
      const net = sayi(a['net']);
      if (!net) return null;
      return (
        <>
          <h4 className="tc-ikb-ara-baslik">Neti sabit tutmak için gereken brüt ücret</h4>
          <AylikTablo aylar={netBrutAylari(m, net)} />
          <Not>Net ücret her ay aynı kalacak şekilde her ayın brütü ayrı hesaplanır. Kümülatif matrah arttıkça aynı net için gereken brüt de artar. İş sözleşmelerinde ücretin brüt olarak yazılması önerilir.</Not>
        </>
      );
    },
    yardim: '<p>Net ücret üzerinden anlaşma yapıldığında işverenin ödeyeceği brüt ücret, kesintiler tersine çözülerek bulunur. Uygulama her ay için brüt ücreti, o ayın netini hedef nete eşitleyecek şekilde ardışık yaklaşımla hesaplar.</p><p class="ref">Hesap, Ayarlar’daki asgari ücret, SGK oranları, tavan ve gelir vergisi dilimleriyle yapılır.</p>',
  },
  tazminat: {
    ad: 'Kıdem, ihbar ve izin ücreti',
    sonuc: (m, a, p) => (
      <TazminatAdimlari p={p} a={tazminat(m, { giris: a['giris'] ?? '', cikis: a['cikis'] ?? '', brut: a['kbrut'] ?? '', yanHak: a['yanHak'] ?? '', kod: a['kod'] ?? '', izinGun: a['izinGun'] ?? '', cum: a['cum'] ?? '' })} />
    ),
    yardim: '<p><b>Kıdem tazminatı:</b> Aynı işverende en az 1 yıl çalışan işçiye; işverenin haklı neden olmadan feshi, işçinin haklı nedenle feshi, askerlik, emeklilik, kadın işçinin evlendikten sonraki 1 yıl içinde ayrılması veya ölüm hâlinde ödenir. Her tam yıl için 30 günlük giydirilmiş brüt ücret, artan süreler orantılı eklenir; tavanı aşamaz.</p><p><b>İhbar tazminatı:</b> Belirsiz süreli sözleşmeyi bildirim süresine uymadan fesheden taraf, bildirim süresine ait ücret tutarında tazminat öder. Bildirim süresi hizmet süresine göre 2 ile 8 hafta arasındadır ve sözleşmeyle artırılabilir.</p><p><b>Kullanılmayan izin ücreti:</b> Sözleşme hangi nedenle sona ererse ersin, kullanılmamış yıllık izin günlerinin ücreti son ücret üzerinden ödenir.</p><p class="ref">Dayanak: 1475 sayılı İş Kanunu md. 14; 4857 sayılı İş Kanunu md. 17, 32, 59; GVK md. 25/7.</p>',
  },
  izin: {
    ad: 'Yıllık izin hak edişi',
    sonuc: (m, a) => {
      const giris = a['iGiris'] ?? '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(giris)) return null;
      const hTarih = /^\d{4}-\d{2}-\d{2}$/.test(a['iTarih'] ?? '') ? (a['iTarih'] as string) : iso(new Date());
      const b = izinHakki(m, { id: '_calc', kind: 'emp', iseGiris: giris, dogumTarihi: a['iDogum'] ?? '' }, hTarih);
      return (
        <>
          <Adimlar adimlar={[
            { l: 'Tamamlanan hizmet yılı', v: `${b.years} yıl` },
            { l: 'Toplam hak edilen yıllık izin', v: `${b.hak} gün`, tot: true, n: 'Kullanılan izinler düşülmeden önceki toplam hak.' },
            { l: 'Sonraki hak ediş', v: b.next ? `${tarih(iso(b.next))}, ${b.nextDays} gün` : YOK },
          ]}
          />
          {b.rows.length ? (
            <>
              <h4 className="tc-ikb-ara-baslik">Hizmet yılına göre</h4>
              <div className="tc-ikb-liste">
                <table className="tc-ikb-tablo" aria-label="Hizmet yılına göre">
                  <thead><tr><th>Hizmet yılı</th><th>Hak ediş tarihi</th><th data-sag="">Gün</th><th>Not</th></tr></thead>
                  <tbody>{b.rows.map((r) => <tr key={r.k}><td>{`${r.k}. yıl`}</td><td>{tarih(iso(r.ann))}</td><td data-sag="">{r.d}</td><td className="tc-ikb-soluk">{r.note}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : <Not>Henüz 1 yıllık hizmet tamamlanmadığı için yıllık izin hakkı doğmamıştır.</Not>}
        </>
      );
    },
    yardim: '<p>Deneme süresi dahil en az 1 yıl çalışan işçi yıllık ücretli izne hak kazanır. Süreler: 1–5 yıl (5 dahil) için en az 14 gün, 5 yıldan fazla 15 yıldan az için 20 gün, 15 yıl ve üzeri için 26 gün. 18 yaş ve altındaki ile 50 yaş ve üzerindeki işçilere verilecek izin 20 günden az olamaz. Süreler iş günü olarak hesaplanır; ulusal bayram, hafta tatili ve genel tatil günleri izin süresine sayılmaz.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 53–56. Süreleri Ayarlar > Çalışma, izin ve ihbar bölümünden değiştirebilirsiniz (sözleşmeyle artırılabilir, azaltılamaz).</p>',
  },
  mesai: {
    ad: 'Fazla mesai ücreti',
    sonuc: (_m, a, p) => {
      const brut = sayi(a['mBrut']);
      if (!brut) return null;
      const saatlik = brut / (p('aylikSaat') || 225); const gunluk = brut / 30;
      const fm = sayi(a['mSaat']) * saatlik * (p('mesaiCarpan') || 1.5);
      const fs = sayi(a['fsSaat']) * saatlik * (p('fazlaSurelerCarpan') || 1.25);
      const ht = sayi(a['htSaat']) * saatlik * (p('haftaTatiliCarpan') || 1.5);
      const ub = sayi(a['ubgtGun']) * gunluk * (p('ubgtCarpan') || 1);
      return (
        <Adimlar adimlar={[
          { l: 'Saatlik brüt ücret', v: para(saatlik), n: `Aylık brüt / ${sayiMetni(p('aylikSaat'))} saat (30 gün × 7,5 saat).` },
          { l: 'Günlük brüt ücret', v: para(gunluk), n: 'Aylık brüt / 30.' },
          { l: `Fazla çalışma: ${sayiMetni(sayi(a['mSaat']))} sa × ${sayiMetni(p('mesaiCarpan'))}`, v: para(fm), n: 'Haftalık 45 saati aşan çalışmalar; her saat %50 zamlı ödenir.' },
          { l: `Fazla sürelerle çalışma: ${sayiMetni(sayi(a['fsSaat']))} sa × ${sayiMetni(p('fazlaSurelerCarpan'))}`, v: para(fs), n: 'Haftalık süre sözleşmeyle 45 saatin altında belirlenmişse, 45 saate kadar yapılan çalışmalar %25 zamlı ödenir.' },
          { l: `Hafta tatili çalışması: ${sayiMetni(sayi(a['htSaat']))} sa × ${sayiMetni(p('haftaTatiliCarpan'))}`, v: para(ht), n: 'Kanunda açık oran yoktur; uygulamada ve Yargıtay kararlarında %50 zamlı ödenir.' },
          { l: `Resmî tatil çalışması: ${sayiMetni(sayi(a['ubgtGun']))} gün × ${sayiMetni(p('ubgtCarpan'))}`, v: para(ub), n: 'Ulusal bayram ve genel tatilde çalışılan her gün için ayrıca bir günlük ücret ödenir (md. 47).' },
          { l: 'Toplam ek brüt ödeme', v: para(fm + fs + ht + ub), tot: true, n: 'Bu tutarlar brüttür; SGK, işsizlik, gelir ve damga vergisi kesintisine tabidir.' },
        ]}
        />
      );
    },
    yardim: '<p>Fazla çalışma, haftalık 45 saati aşan çalışmadır ve yılda 270 saati geçemez. Fazla çalışma için işçinin yazılı onayı alınmalıdır. İşçi isterse fazla çalışma ücreti yerine her saat için 1,5 saat serbest zaman kullanabilir. Günlük çalışma süresi 11 saati aşamaz.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 41, 46, 47, 63; Fazla Çalışma Yönetmeliği.</p>',
  },
};

