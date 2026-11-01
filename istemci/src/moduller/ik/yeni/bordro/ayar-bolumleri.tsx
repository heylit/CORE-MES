import { useState, type ReactNode } from 'react';
import { Dugme, OnayPenceresi, Simge } from '../../../../ortak/arayuz/index.ts';
import { para, paraKisa } from '../bicim.ts';
import { ikSabitleri } from '../motor.ts';
import type { Personel } from '../tipler.ts';
import { yeniKimlik } from '../veri.ts';
import type { AyarAlanlari, AyarBolumu } from './Ayarlar.tsx';
import { dilimOzeti, listeKullanimi, sayi, yeniListeSatiri, type ListeAdi } from './kurallar.ts';
import { ayarSayisi, ayHesabi, donemde, ihbarHaftasi, vergiDilimleri, type Donem } from './motor-yuzu.ts';
import { Aciklama, Bolum, sayiMetni } from './parcalar.tsx';

// Ayar bölümlerinin içeriği (app.js viewSettings, settingsYanHak, settingsTesvik, settingsAktarim, settingsIlan): alanlar, açıklamalar
// ve dayanak metinleri bugünkü ekranla aynıdır.

type Icerik = (a: AyarAlanlari, donem: Donem) => ReactNode;

function Panel({ baslik, children }: { baslik: string; children: ReactNode }) {
  return <Bolum baslik={baslik}>{children}</Bolum>;
}
function Ikili({ alanlar, children }: { alanlar: ReactNode; children: ReactNode }) {
  return (
    <div className="tc-ikb-ikili">
      <div className="tc-ikb-alanlar">{alanlar}</div>
      <div>{children}</div>
    </div>
  );
}
function Turetilmis({ etiket, deger, ipucu }: { etiket: string; deger: ReactNode; ipucu?: ReactNode }) {
  return (
    <div className="tc-ikb-turetilmis">
      <span className="tc-ikb-etiket">{etiket}</span>
      <b>{deger}</b>
      {ipucu && <small className="tc-ikb-soluk">{ipucu}</small>}
    </div>
  );
}
const cift = (l: readonly string[]): (readonly [string, string])[] => l.map((x) => [x, x] as const);

/* ---------------- liste düzenleyici (primler, teşvikler, ilan kanalları) ---------------- */

interface Sutun { f: string; l: string; t?: 'sayi' | 'secim' | 'isaret'; o?: readonly (readonly [string, string])[]; ph?: string; genis?: boolean }

function ListeDuzenleyici({ a, liste, sutunlar, ekle }: { a: AyarAlanlari; liste: ListeAdi; sutunlar: readonly Sutun[]; ekle: string }) {
  const [silinecek, silinecekYaz] = useState<{ i: number; ad: string; adet: number } | null>(null);
  const satirlar = a.liste(liste);
  const kopya = (): Record<string, unknown>[] => structuredClone(satirlar);
  const alanYaz = (i: number, f: string, v: unknown) => {
    const l = kopya();
    const r = l[i];
    if (!r) return;
    r[f] = v;
    a.yaz(liste, l);
  };
  const sil = (i: number) => {
    const l = kopya();
    const [r] = l.splice(i, 1);
    a.yaz(liste, l);
    if (liste === 'tesvikler' && r && a.deger('varsayilanTesvik') === r['id']) a.yaz('varsayilanTesvik', l[0]?.['id'] ?? '');
  };
  const silIste = (i: number) => {
    const r = satirlar[i];
    if (!r) return;
    const adet = listeKullanimi(liste, String(r['id'] ?? ''), a.o.depo.tur('emp') as readonly Personel[]);
    if (adet) silinecekYaz({ i, ad: String(r['ad'] ?? ''), adet });
    else sil(i);
  };
  const hucre = (s: Sutun, r: Record<string, unknown>, i: number) => {
    const ortak = { 'aria-label': s.l, disabled: a.kapali };
    if (s.t === 'secim') {
      return (
        <select className="tc-ikb-hucre-secim" {...ortak} value={String(r[s.f] ?? '')} onChange={(e) => { alanYaz(i, s.f, e.target.value); }}>
          {(s.o ?? []).map(([d, b]) => <option key={d} value={d}>{b}</option>)}
        </select>
      );
    }
    if (s.t === 'isaret') return <input type="checkbox" {...ortak} checked={Boolean(r[s.f])} onChange={(e) => { alanYaz(i, s.f, e.target.checked); }} />;
    if (s.t === 'sayi') {
      return (
        <input type="number" step="any" inputMode="decimal" className="tc-ikb-hucre" {...ortak} value={String(r[s.f] ?? '')}
          onChange={(e) => { alanYaz(i, s.f, e.target.value === '' ? '' : sayi(e.target.value)); }} />
      );
    }
    return (
      <input className="tc-ikb-hucre-metin" data-genis={s.genis ? '' : undefined} {...ortak} value={String(r[s.f] ?? '')} placeholder={s.ph}
        onChange={(e) => { alanYaz(i, s.f, e.target.value); }} />
    );
  };
  return (
    <>
      <div className="tc-ikb-liste">
        <table className="tc-ikb-tablo" aria-label={ekle}>
          <thead><tr>{sutunlar.map((s) => <th key={s.f}>{s.l}</th>)}<th /></tr></thead>
          <tbody>
            {satirlar.map((r, i) => (
              <tr key={String(r['id'] ?? i)}>
                {sutunlar.map((s) => <td key={s.f}>{hucre(s, r, i)}</td>)}
                <td>
                  {!a.kapali && (
                    <button type="button" className="tc-ikb-sil" aria-label="Satırı sil" onClick={() => { silIste(i); }}><Simge ad="x" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!a.kapali && (
        <div className="tc-ikb-arac">
          <Dugme simge="plus" onClick={() => { a.yaz(liste, [...kopya(), yeniListeSatiri(liste, (on) => `${on}_${yeniKimlik('emp').slice(4)}`)]); }}>{ekle}</Dugme>
        </div>
      )}
      <OnayPenceresi
        acik={silinecek !== null} baslik={`“${silinecek?.ad ?? ''}” silinsin mi?`} onayMetni="Sil" tehlikeli
        vazgec={() => { silinecekYaz(null); }}
        onayla={() => { if (silinecek) sil(silinecek.i); silinecekYaz(null); }}
      >
        <p>{`${silinecek?.adet ?? 0} personel kartında bu kayda özel ayar var. Silerseniz bu kişilerde ${liste === 'tesvikler' ? 'genel teşvik' : 'prim tanımı'} uygulanmaz.`}</p>
      </OnayPenceresi>
    </>
  );
}

/* ---------------- bölümler ---------------- */

const genel: Icerik = (a) => (
  <>
    <Panel baslik="Şirket">
      <div className="tc-ikb-alanlar">
        {a.metin('sirket', 'Şirket adı')}
        {a.isaret('cumartesiIsGunu', 'Cumartesi', 'Cumartesi iş günü sayılsın', 'Yıllık izin gün sayımını etkiler.')}
      </div>
    </Panel>
    <Panel baslik="Resmî tatiller">
      <Ikili alanlar={a.uzun('tatiller', 'Tatil listesi', 'Her satıra bir tarih. Her yıl tekrar eden ulusal bayramlar için AA-GG, dinî bayramlar gibi yıla göre değişenler için YYYY-AA-GG yazın; tarihten sonra açıklama ekleyebilirsiniz.', 14)}>
        <Aciklama baslik="Tatiller neyi etkiler?" html={'<p>Yıllık ve mazeret izinleri iş günü olarak sayılırken buradaki tarihler düşülür. İzin takviminde bu günler gri gösterilir.</p><p>Ulusal bayram ve genel tatiller (29 Ekim, 23 Nisan, 1 Mayıs, 19 Mayıs, 15 Temmuz, 30 Ağustos, 1 Ocak, Ramazan ve Kurban bayramları) 2429 sayılı Kanun’la belirlenir. Bu günlerde çalışan işçiye ayrıca bir günlük ücret ödenir.</p><p>Dinî bayram tarihleri her yıl değişir; yeni yılın tarihlerini Diyanet takviminden ekleyin. Arife günleri yarım gündür, yarım günleri listeye eklemeyin.</p><p class="ref">Dayanak: 2429 sayılı Ulusal Bayram ve Genel Tatiller Hakkında Kanun; 4857 sayılı İş Kanunu md. 44, 47.</p>'} />
      </Ikili>
    </Panel>
  </>
);

const ucret: Icerik = (a, donem) => {
  const { asgari, dilimler } = donemde(a.m, donem.baslangic, () => ({
    asgari: ayHesabi(a.m, { brut: ayarSayisi(a.m, 'asgariBrut') }, 0, 1),
    dilimler: dilimOzeti(vergiDilimleri(a.m)),
  }));
  const tesvikId = String(a.deger('varsayilanTesvik') ?? '');
  const tesvik = a.liste('tesvikler').find((t) => t['id'] === tesvikId);
  return (
    <>
      <Panel baslik="Asgari ücret">
        <Ikili alanlar={(
          <>
            {a.sayi('asgariBrut', 'Brüt asgari ücret', 'Asgari Ücret Tespit Komisyonu kararıyla belirlenir.', '₺/ay')}
            <Turetilmis etiket="Hesaplanan net asgari ücret" deger={para(asgari.net)} ipucu="Kayıtlı parametrelerle Ocak ayı için." />
            <Turetilmis etiket="Asgari ücretin işverene maliyeti" deger={para(asgari.maliyet)} ipucu="SGK ve işsizlik işveren payları dahil." />
          </>
        )}>
          <Aciklama baslik="Asgari ücret istisnası" html={'<p>Asgari ücrete isabet eden gelir vergisi ve damga vergisi, ücreti ne olursa olsun tüm çalışanlar için istisnadır. Asgari ücretli çalışanın brüt ücretinden yalnızca SGK ve işsizlik sigortası işçi payları kesilir.</p><p>Asgari ücret ayrıca SGK prim tabanı, prim tavanı ve bazı yardımların hesabında esas alınır.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 39; GVK md. 23/18; Damga Vergisi Kanunu’na ekli (2) sayılı tablo.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="SGK ve işsizlik sigortası">
        <Ikili alanlar={(
          <>
            {a.sayi('sgkTavan', 'SGK prim tavanı', 'Prime esas kazancın üst sınırı; aşan kısımdan prim kesilmez.', '₺/ay')}
            {a.sayi('sgkIsciOran', 'SGK işçi payı', '%9 malullük, yaşlılık ve ölüm + %5 genel sağlık sigortası.', '%')}
            {a.sayi('issizlikIsciOran', 'İşsizlik sigortası işçi payı', undefined, '%')}
            {a.sayi('sgkIsverenOran', 'SGK işveren payı (teşviksiz)', 'Malullük, yaşlılık ve ölüm, genel sağlık ve kısa vadeli sigorta kollarının toplamı.', '%')}
            <Turetilmis etiket="Varsayılan teşvik" deger={tesvik ? String(tesvik['ad'] ?? '') : 'Teşvik yok'} ipucu="Teşvikleri Ayarlar > Teşvikler bölümünden yönetin; kişiye özel teşvik personel kartından seçilir." />
            {a.sayi('issizlikIsverenOran', 'İşsizlik sigortası işveren payı', undefined, '%')}
          </>
        )}>
          <Aciklama baslik="Primler nasıl hesaplanır?" html={'<p>Primler, brüt ücret ve prime tabi ödemelerin toplamı (prime esas kazanç) üzerinden hesaplanır. Prime esas kazanç asgari ücretten az, prim tavanından fazla olamaz.</p><p>İşçi payları ücretten kesilir; işveren payları ücrete ek maliyettir. Kısa vadeli sigorta kolu oranı işyerinin tehlike sınıfına göre değişebilir.</p><p>Borcu olmayan işverenler, 5510 sayılı Kanun md. 81/ı kapsamında işveren hissesinden puan indirimi alabilir. Hangi teşvikten yararlandığınızı ve güncel puanı mali müşavirinizle doğrulayın.</p><p>Kıdem ve ihbar tazminatından prim kesilmez; kullanılmayan izin ücreti, prim, ikramiye ve fazla mesai prime tabidir.</p><p class="ref">Dayanak: 5510 sayılı Kanun md. 80–82; 4447 sayılı Kanun md. 49.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="Diğer kesinti ve indirimler">
        <Ikili alanlar={(
          <>
            {a.sayi('besOran', 'Otomatik BES katkı oranı', 'Prime esas kazanç üzerinden; personel kartında BES işaretli olanlara uygulanır.', '%')}
            {a.isaret('raporKesinti', 'Raporlu günler', 'Rapor günleri bordroda eksik gün sayılsın', 'İşveren rapor günlerinin ücretini ödüyorsa işareti kaldırın.', true)}
            {a.sayi('engelliInd1', 'Engellilik indirimi, 1. derece', 'Aylık tutar; Gelir İdaresi’nin yıllık ilan ettiği tutarı girin.', '₺')}
            {a.sayi('engelliInd2', 'Engellilik indirimi, 2. derece', undefined, '₺')}
            {a.sayi('engelliInd3', 'Engellilik indirimi, 3. derece', undefined, '₺')}
          </>
        )}>
          <Aciklama baslik="Bu kalemler nasıl uygulanır?" html={'<p><b>Otomatik katılım BES:</b> 45 yaşını doldurmamış çalışanlar işverence bireysel emeklilik sistemine dahil edilir; prime esas kazancın %3’ü ücretten kesilip şirkete aktarılır. Çalışan iki ay içinde cayabilir. Yeni personelde doğum tarihine göre işaret otomatik konur.</p><p><b>Raporlu günler:</b> Hastalık raporunun üçüncü gününden itibaren SGK geçici iş göremezlik ödeneği öder; işveren bu günler için ücret ödemekle yükümlü değildir ve bu günler eksik gün olarak bildirilir. Bordro sayfasında prim günü bu ayara göre otomatik hesaplanır.</p><p><b>Engellilik indirimi:</b> Engellilik derecesini belgeleyen çalışanın gelir vergisi matrahından her ay sabit bir tutar indirilir. Tutarlar her yıl yeniden belirlenir; girilmemişse indirim uygulanmaz.</p><p class="ref">Dayanak: 4632 sayılı Kanun ek md. 2; 5510 sayılı Kanun md. 18; GVK md. 31.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="Gelir vergisi ve damga vergisi">
        <Ikili alanlar={(
          <>
            {a.uzun('dilimler', 'Ücret gelirleri için gelir vergisi dilimleri', 'Her satırda “üst sınır:oran”. Son dilimin üst sınırını boş bırakın (ör. “:40”).', 6)}
            {a.sayi('damgaOran', 'Damga vergisi oranı', 'Ücret ödemelerinde binde 7,59.', '%')}
            <div className="tc-ikb-tam">
              <span className="tc-ikb-etiket">Kayıtlı tarifenin özeti</span>
              <div className="tc-ikb-liste">
                <table className="tc-ikb-tablo" aria-label="Kayıtlı tarifenin özeti">
                  <thead><tr><th>Yıllık kümülatif matrah</th><th data-sag="">Oran</th><th data-sag="">Dilim sonuna kadar toplam vergi</th></tr></thead>
                  <tbody>
                    {dilimler.map((d) => (
                      <tr key={d.alt}>
                        <td>{d.ust !== null ? `${paraKisa(d.alt)} – ${paraKisa(d.ust)}` : `${paraKisa(d.alt)} üzeri`}</td>
                        <td data-sag="">{`%${sayiMetni(d.oran)}`}</td>
                        <td data-sag="">{d.birikmis !== null ? paraKisa(d.birikmis) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}>
          <Aciklama baslik="Gelir vergisi nasıl hesaplanır?" html={'<p>Gelir vergisi matrahı, brüt ücretten SGK ve işsizlik işçi paylarının düşülmesiyle bulunur. Ücretlerde vergi, yılbaşından itibaren biriken (kümülatif) matraha artan oranlı tarife uygulanarak hesaplanır: bu ayın vergisi = kümülatif matrahın vergisi − önceki ayların kümülatif matrahının vergisi.</p><p>Kümülatif matrah bir dilim sınırını geçtiğinde, sınırı aşan kısım bir üst oranla vergilendirilir. Bu nedenle net ücret genellikle yılın ikinci yarısında düşer.</p><p>Asgari ücretin vergisi kadar tutar her ay istisna olarak düşülür. Damga vergisi brüt ücretin binde 7,59’udur; asgari ücrete isabet eden kısım istisnadır.</p><p>Tarife her yıl yeniden değerleme oranına göre güncellenir; Ocak ayında Gelir İdaresi’nin yayımladığı tebliğden kontrol edin.</p><p class="ref">Dayanak: 193 sayılı Gelir Vergisi Kanunu md. 61, 63, 94, 103; 488 sayılı Damga Vergisi Kanunu.</p>'} />
        </Ikili>
      </Panel>
    </>
  );
};

const yanhak: Icerik = (a) => {
  const s = ikSabitleri();
  const hesap = cift(s?.HESAP_OPTS ?? []);
  return (
    <>
      <Panel baslik="Yemek yardımı">
        <Ikili alanlar={(
          <>
            {a.secim('yemekYontem', 'Varsayılan yöntem', cift(s?.YEMEK_YONTEM ?? []), 'Personel kartında kişiye özel yöntem seçilebilir.')}
            {a.secim('yemekHesap', 'Hesap şekli', hesap)}
            {a.sayi('yemekDeger', 'Tutar veya oran', 'Günlük veya aylık ₺, ya da brüt ücretin yüzdesi.')}
            {a.sayi('yemekGvKart', 'GV istisnası, kart / çek', 'Fiili çalışılan gün başına, KDV dahil.', '₺/gün')}
            {a.sayi('yemekGvNakit', 'GV istisnası, nakit', 'Fiili çalışılan gün başına.', '₺/gün')}
            {a.secim('yemekSgkKart', 'SGK istisnası, kart / çek', [['tamami', 'Tamamı (kart yalnız yemek hizmetinde geçerliyse)'], ['limit', 'Günlük limit kadar']])}
            {a.sayi('yemekSgkLimit', 'SGK istisna limiti, kart / çek', 'Kart market alışverişine açıksa uygulanır.', '₺/gün')}
            {a.sayi('yemekSgkNakit', 'SGK istisna limiti, nakit', undefined, '₺/gün')}
          </>
        )}>
          <Aciklama baslik="Yemek yardımı nasıl vergilendirilir?" html={'<p>İşyerinde yemek verilmesi (ayni) gelir vergisi, damga vergisi ve SGK priminden tamamen istisnadır ve bordroya girmez.</p><p>Yemek kartı, çeki veya nakit yemek bedelinde istisna, <b>fiilen çalışılan her gün</b> için günlük tutara kadar uygulanır. İzin, rapor ve hafta tatili günlerinde istisna yoktur. Limiti aşan kısım ücrete eklenir ve tüm kesintilere tabidir.</p><p>2026 için gelir vergisi istisnası günlük 300 TL’dir (KDV hariç); kart ödemelerinde KDV dahil 330 TL dikkate alınır. SGK tarafında yalnız yemek hizmetinde geçerli kartlar tutardan bağımsız istisnadır; nakit ve markete açık kartlarda günlük sınır uygulanır.</p><p>Modül, hesap şekli “günlük tutar” ise ay içindeki fiili çalışma gününü izin kayıtlarından otomatik bulur.</p><p class="ref">Dayanak: GVK md. 23/8; 5510 sayılı Kanun md. 80. Tutarları her yıl Ocak’ta ve yıl içi değişikliklerde güncelleyin.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="Yol yardımı">
        <Ikili alanlar={(
          <>
            {a.secim('yolYontem', 'Varsayılan yöntem', cift(s?.YOL_YONTEM ?? []), 'Personel kartında kişiye özel yöntem seçilebilir.')}
            {a.secim('yolHesap', 'Hesap şekli', hesap)}
            {a.sayi('yolDeger', 'Tutar veya oran', 'Günlük veya aylık ₺, ya da brüt ücretin yüzdesi.')}
            {a.sayi('yolGvKart', 'GV istisnası, toplu taşıma kartı / bilet', 'Fiili çalışılan gün başına.', '₺/gün')}
            {a.secim('yolSgkKart', 'SGK, toplu taşıma kartı / bilet', [['tabi', 'Prime tabi'], ['limit', 'Günlük GV limiti kadar istisna'], ['tamami', 'Tamamı istisna']])}
          </>
        )}>
          <Aciklama baslik="Yol yardımı nasıl vergilendirilir?" html={'<p><b>Servis:</b> İşverenin sağladığı veya satın aldığı servis hizmeti tamamen istisnadır; bordroya girmez.</p><p><b>Toplu taşıma kartı veya bilet:</b> İşveren servis sağlamıyorsa, fiilen çalışılan her gün için günlük tutara kadar gelir ve damga vergisinden istisnadır (2026 için günlük 158 TL). Aşan kısım ücret sayılır.</p><p><b>Nakit yol parası:</b> İstisna yoktur; tamamı ücret gibi vergilendirilir ve prime tabidir.</p><p>SGK açısından servis dışındaki yol yardımlarının prime tabi olduğu görüşü yaygındır; farklı yorumlar bulunduğu için varsayılan “prime tabi” seçildi. Uygulamanızı mali müşavirinizle doğrulayın.</p><p class="ref">Dayanak: GVK md. 23/8; 5510 sayılı Kanun md. 80.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="Prim ve ikramiye düzeni">
        <ListeDuzenleyici
          a={a} liste="primler" ekle="Prim ekle"
          sutunlar={[
            { f: 'ad', l: 'Prim adı', genis: true }, { f: 'tur', l: 'Tür', t: 'secim', o: s?.PRIM_TUR ?? [] }, { f: 'deger', l: 'Değer', t: 'sayi' },
            { f: 'siklik', l: 'Ödeme sıklığı', t: 'secim', o: s?.SIKLIK ?? [] }, { f: 'aylar', l: 'Aylar', ph: 'ör. 6 veya 3,9' },
            { f: 'atama', l: 'Varsayılan', t: 'secim', o: s?.ATAMA ?? [] }, { f: 'kidem', l: 'Kıdeme dahil', t: 'isaret' },
          ]}
        />
        <Aciklama baslik="Primler nasıl işler?" html={'<p>Her prim; sabit tutar, brüt ücretin yüzdesi veya brüt ücretin katı (ör. 1 maaş ikramiye) olarak tanımlanır. Ödeme ayında bordrodaki “Ek ödeme” sütununa otomatik eklenir; tutarı bordroda değiştirebilirsiniz. “Aylar” sütunu “Yılda bir” için ödeme ayını, “Belirli aylar” için virgülle ayrılmış ayları alır.</p><p>“Varsayılan” sütunu primin kime otomatik verileceğini belirler. Personel kartının Ücret bölümünden kişiye özel açıp kapatabilir, değerini değiştirebilirsiniz.</p><p>Prim ve ikramiyeler SGK primine, gelir ve damga vergisine tabidir. Düzenli ödenen prim ve ikramiyeler kıdem ve ihbar tazminatına esas giydirilmiş ücrete aylık karşılığıyla eklenir (ör. yılda 2 maaş ikramiye, aylık 2/12 maaş).</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 32; 1475 sayılı İş Kanunu md. 14/13.</p>'} />
      </Panel>
    </>
  );
};

const tesvik: Icerik = (a) => {
  const s = ikSabitleri();
  const liste = a.liste('tesvikler');
  return (
    <Panel baslik="SGK teşvikleri">
      <div className="tc-ikb-alanlar tc-ikb-sinirli">
        {a.secim('varsayilanTesvik', 'Varsayılan teşvik', liste.map((t) => [String(t['id'] ?? ''), String(t['ad'] ?? '')] as const), 'Kişiye özel teşvik seçilmemiş tüm çalışanlara uygulanır.')}
      </div>
      <ListeDuzenleyici
        a={a} liste="tesvikler" ekle="Teşvik ekle"
        sutunlar={[
          { f: 'ad', l: 'Teşvik adı', genis: true }, { f: 'tur', l: 'Hesap türü', t: 'secim', o: s?.TESVIK_TUR ?? [] },
          { f: 'deger', l: 'Puan / tutar', t: 'sayi' }, { f: 'kanunNo', l: 'Kanun no', ph: 'ör. 05510' },
        ]}
      />
      <div className="tc-ikb-ikili">
        <Aciklama baslik="Hesap türleri" html={'<p><b>İşveren payından puan indirimi:</b> İşveren SGK payı, prime esas kazancın girilen puan kadar düşürülmüş oranıyla hesaplanır (ör. 5510 md. 81/ı hazine desteği).</p><p><b>Asgari ücret üzerinden işveren payının tamamı:</b> İşveren SGK payının, prime esas kazanç alt sınırına (asgari ücret, gün orantılı) isabet eden kısmı hazinece karşılanır. 6111, ilave istihdam ve engelli istihdamı teşvikleri bu şekilde hesaplanır.</p><p><b>Aylık sabit tutar:</b> İşveren payından her ay sabit bir tutar düşülür (ör. asgari ücret desteği).</p><p class="ref">Teşvikler genellikle aynı çalışan için birlikte uygulanmaz; her çalışana en avantajlı tek teşvik seçilir.</p>'} />
        <Aciklama baslik="Sık kullanılan teşvikler" html={'<p><b>5510 md. 81/ı:</b> Prim borcu bulunmayan özel sektör işverenlerine işveren hissesinden puan indirimi. Uygulanan puan sektöre ve döneme göre değişebilir.</p><p><b>4447 geçici md. 10 (6111):</b> Kadın, 18–29 yaş arası genç ve mesleki belgesi olan işsizlerin ilave istihdamında işveren hissesinin karşılanması.</p><p><b>4857 md. 30 / 5510 md. 81/c:</b> Engelli çalışanların asgari ücret üzerinden işveren hissesinin tamamı hazineden karşılanır.</p><p>Kanun numaraları SGK’ya bildirimde (MUHSGK) kullanılır ve hazırlık listesine aktarılır.</p><p class="ref">Teşvik şartları sık değişir; her teşviki uygulamadan önce SGK teşvik sorgulama ekranından ve mali müşavirinizle doğrulayın.</p>'} />
      </div>
    </Panel>
  );
};

const IHBAR_ORNEKLERI: readonly (readonly [number, string])[] = [[3, '3 ay'], [12, '1 yıl'], [24, '2 yıl'], [60, '5 yıl']];

const calisma: Icerik = (a, donem) => {
  const ornek = donemde(a.m, donem.baslangic, () => IHBAR_ORNEKLERI.map(([ay, ad]) => ({ ad, hafta: ihbarHaftasi(a.m, ay) })));
  return (
    <>
      <Panel baslik="Çalışma süreleri ve fazla mesai">
        <Ikili alanlar={(
          <>
            {a.sayi('haftalikSaat', 'Haftalık çalışma süresi', 'Kanuni üst sınır 45 saat.', 'saat')}
            {a.sayi('aylikSaat', 'Aylık ücrete esas saat', 'Saatlik ücret = aylık brüt / bu değer. 30 gün × 7,5 saat = 225.', 'saat')}
            {a.sayi('mesaiCarpan', 'Fazla çalışma katsayısı', '45 saati aşan her saat %50 zamlı: 1,5.')}
            {a.sayi('fazlaSurelerCarpan', 'Fazla sürelerle çalışma katsayısı', 'Sözleşmede 45 saatten az belirlenen sürenin 45 saate kadar aşılması: 1,25.')}
            {a.sayi('haftaTatiliCarpan', 'Hafta tatili çalışması katsayısı', 'Uygulamada %50 zamlı: 1,5.')}
            {a.sayi('ubgtCarpan', 'Resmî tatil çalışması ek gün', 'Çalışılan her gün için ayrıca ödenen günlük ücret: 1.')}
            {a.sayi('yillikMesaiLimit', 'Yıllık fazla çalışma sınırı', 'Kanuni üst sınır 270 saat.', 'saat')}
          </>
        )}>
          <Aciklama baslik="Çalışma süresi kuralları" html={'<p>Haftalık çalışma süresi en çok 45 saattir; günlük çalışma 11 saati, gece çalışması 7,5 saati aşamaz. Haftalık 45 saati aşan çalışmalar fazla çalışmadır ve yılda 270 saati geçemez. Fazla çalışma için işçinin yazılı onayı gerekir.</p><p>Fazla çalışmanın her saati için ücret %50 artırılarak ödenir. İşçi isterse bunun yerine her saat için 1,5 saat serbest zaman kullanabilir.</p><p>Ulusal bayram ve genel tatilde çalışan işçiye o günün ücretine ek olarak bir günlük ücret daha ödenir.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 41, 46, 47, 63, 69.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="Yıllık ücretli izin">
        <Ikili alanlar={(
          <>
            {a.sayi('izin1', '1–5 yıl (5 dahil)', undefined, 'gün')}
            {a.sayi('izin2', '5 yıldan fazla, 15 yıldan az', undefined, 'gün')}
            {a.sayi('izin3', '15 yıl ve üzeri', undefined, 'gün')}
            {a.sayi('izinYasMin', '18 yaş ve altı, 50 yaş ve üstü için en az', undefined, 'gün')}
            {a.sayi('denemeAy', 'Varsayılan deneme süresi', 'Kanuni üst sınır 2 ay; toplu sözleşmeyle 4 aya kadar.', 'ay')}
          </>
        )}>
          <Aciklama baslik="Yıllık izin kuralları" html={'<p>İşçi, deneme süresi dahil en az 1 yıl çalıştıktan sonra yıllık ücretli izne hak kazanır. Kanundaki süreler en azdır; sözleşmeyle artırılabilir, azaltılamaz. Yıllık izin, işçinin isteği olmadan bölünemez; bölünürse bir parçası 10 günden az olamaz.</p><p>İzin süresine rastlayan ulusal bayram, hafta tatili ve genel tatil günleri izin süresinden sayılmaz. İş sözleşmesi sona erdiğinde kullanılmayan izinlerin ücreti son ücret üzerinden ödenir.</p><p>Deneme süresi içinde taraflar sözleşmeyi bildirim süresi olmadan ve tazminatsız feshedebilir.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 15, 53–59.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="İhbar (bildirim) süreleri ve kıdem">
        <Ikili alanlar={(
          <>
            {a.sayi('ihbar1', 'Hizmeti 6 aydan az', undefined, 'hafta')}
            {a.sayi('ihbar2', '6 ay – 1,5 yıl', undefined, 'hafta')}
            {a.sayi('ihbar3', '1,5 yıl – 3 yıl', undefined, 'hafta')}
            {a.sayi('ihbar4', '3 yıldan fazla', undefined, 'hafta')}
            {a.sayi('kidemTavan', 'Kıdem tazminatı tavanı', 'Ocak ve Temmuz aylarında güncellenir.', '₺')}
            <div className="tc-ikb-tam">
              <span className="tc-ikb-etiket">Örnek ihbar süreleri</span>
              <div className="tc-ikb-liste">
                <table className="tc-ikb-tablo" aria-label="Örnek ihbar süreleri">
                  <thead><tr><th>Hizmet süresi</th><th data-sag="">Bildirim süresi</th><th data-sag="">50.000 ₺ brüt ücrette ihbar tazminatı</th></tr></thead>
                  <tbody>
                    {ornek.map((x) => (
                      <tr key={x.ad}><td>{x.ad}</td><td data-sag="">{`${x.hafta} hafta`}</td><td data-sag="">{paraKisa(50000 / 30 * x.hafta * 7)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}>
          <Aciklama baslik="İhbar ve kıdem kuralları" html={'<p><b>İhbar:</b> Belirsiz süreli iş sözleşmesini feshetmek isteyen taraf, karşı tarafa hizmet süresine göre 2, 4, 6 veya 8 hafta önceden yazılı bildirimde bulunur. Bu süreler en azdır, sözleşmeyle artırılabilir. Bildirim süresine uymayan taraf, bu sürenin ücreti tutarında ihbar tazminatı öder. İşveren, bildirim süresinin ücretini peşin ödeyerek sözleşmeyi hemen feshedebilir. Bildirim süresi içinde işçiye günde en az 2 saat iş arama izni verilir.</p><p><b>Kıdem:</b> En az 1 yıl çalışmış işçiye her tam yıl için 30 günlük giydirilmiş brüt ücret ödenir. Bir hizmet yılı için ödenecek tutar kıdem tavanını aşamaz. Kıdem tazminatından yalnızca damga vergisi kesilir.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 17, 27; 1475 sayılı İş Kanunu md. 14.</p>'} />
        </Ikili>
      </Panel>
      <Panel baslik="Engelli çalışan istihdamı">
        <Ikili alanlar={(
          <>
            {a.sayi('engelliEsik', 'Yükümlülüğün başladığı çalışan sayısı', undefined, 'kişi')}
            {a.sayi('engelliOran', 'İstihdam oranı', undefined, '%')}
          </>
        )}>
          <Aciklama baslik="Engelli istihdam yükümlülüğü" html={'<p>Elli veya daha fazla işçi çalıştırılan özel sektör işyerlerinde işçi sayısının %3’ü oranında engelli işçi çalıştırılması zorunludur. Aynı il sınırları içindeki işyerlerinin işçi sayısı birlikte değerlendirilir. Yükümlülüğe uyulmazsa her eksik kişi ve ay için idari para cezası uygulanır.</p><p class="ref">Dayanak: 4857 sayılı İş Kanunu md. 30, 101.</p>'} />
        </Ikili>
      </Panel>
    </>
  );
};

const aktarim: Icerik = (a) => (
  <>
    <Panel baslik="Muhasebe hesap kodları">
      <Ikili alanlar={(
        <>
          {a.metin('hesapGider', 'Ücret gider hesabı (varsayılan)', 'Departman kartında departmana özel gider hesabı girilebilir: 720 direkt işçilik, 730 genel üretim, 760 pazarlama, 770 genel yönetim.')}
          {a.metin('hesapPersonel', 'Personele borçlar', 'Net ücretler, Tek Düzen Hesap Planı’nda 335.')}
          {a.metin('hesapVergi', 'Ödenecek vergi ve fonlar', 'Gelir ve damga vergisi kesintileri, 360.')}
          {a.metin('hesapSgk', 'Ödenecek sosyal güvenlik kesintileri', 'SGK ve işsizlik işçi ve işveren payları, 361.')}
          {a.metin('hesapDiger', 'Ödenecek diğer yükümlülükler', 'BES, icra, avans ve diğer kesintiler, 369.')}
        </>
      )}>
        <Aciklama baslik="Muhasebe aktarımı nedir?" html={'<p>Her ay bordro kesinleştiğinde, ücret giderinin ve oluşan borçların muhasebe kayıtlarına işlenmesi gerekir. Muhasebe fişi; brüt ücret ve işveren primlerini gider hesabına borç, net ücreti personele, vergileri vergi dairesine, primleri SGK’ya borç olarak alacak tarafına yazar. Fiş her zaman borç = alacak olacak şekilde dengelidir.</p><p>Bordro sayfasındaki “Dışa aktar” menüsünden alınan fiş CSV dosyası; Logo, Mikro, Luca, Zirve gibi programların Excel/CSV içe aktarma ekranlarında sütun eşleştirilerek kullanılabilir.</p>'} />
      </Ikili>
    </Panel>
    <Panel baslik="SGK ve vergi bildirimleri">
      <Aciklama baslik="e-Bildirge ve MUHSGK nedir?" html={'<p><b>e-Bildirge / e-Sigorta:</b> SGK’nın işverenler için çevrim içi bildirim sistemidir. İşe giriş bildirgesi (işe başlamadan önce), işten ayrılış bildirgesi (10 gün içinde), eksik gün belgeleri ve iş kazası bildirimleri buradan yapılır.</p><p><b>MUHSGK (Muhtasar ve Prim Hizmet Beyannamesi):</b> Aylık prim ve hizmet bilgileri ile gelir ve damga vergisi kesintileri, Gelir İdaresi’nin e-Beyanname sistemi üzerinden tek beyannameyle bildirilir. Her çalışan için prim günü, prime esas kazanç, eksik gün ve nedeni, teşvik kanun numarası, vergi matrahı ve kesintiler yer alır. Beyanname ertesi ayın 26’sına kadar verilir.</p><p>Bu bildirimler işveren veya mali müşavirin e-imza / şifresiyle resmî sistemlerden yapılır; bu modül doğrudan gönderim yapmaz. Bordro sayfasındaki <b>MUHSGK hazırlık listesi</b>, beyannamede girilecek bilgileri çalışan bazında hazırlar; mali müşavirinize iletebilir veya kontrol için kullanabilirsiniz.</p><p class="ref">Eksik gün kodları: 01 istirahat (rapor), 13 diğer (ücretsiz izin), 12 birden fazla neden. Kodları beyanname öncesi kontrol edin.</p>'} />
    </Panel>
  </>
);

const ilan: Icerik = (a) => (
  <>
    <Panel baslik="İlan bilgileri">
      <Ikili alanlar={(
        <>
          {a.uzun('sirketTanitim', 'Şirket tanıtım metni', 'Her ilanın başına eklenir. 2–4 cümlede ne yaptığınızı ve çalışma kültürünüzü anlatın.', 5)}
          {a.metin('kariyerEposta', 'Başvuru e-postası', 'Pozisyonda ayrıca girilmezse kullanılır.')}
          {a.metin('kariyerSayfasi', 'Kariyer sayfası / başvuru bağlantısı', 'Kanal bazlı izleme eki otomatik eklenir.')}
          {a.metin('ilanLokasyon', 'Varsayılan lokasyon', 'Ör. Nilüfer, Bursa')}
          {a.metin('kvkkLink', 'Aday aydınlatma metni bağlantısı', 'İlan sonuna KVKK bilgilendirmesi olarak eklenir.')}
          {a.uzun('ilanYanHaklar', 'Sunduklarımız (varsayılan)', 'Her satıra bir yan hak. Boşsa yemek, yol ve prim ayarlarından otomatik oluşturulur.', 5)}
        </>
      )}>
        <Aciklama baslik="Bu bilgiler nerede kullanılır?" html={'<p>Pozisyon açarken yalnızca pozisyona özgü alanları (sorumluluklar, nitelikler) doldurursunuz; şirket tanıtımı, başvuru yolu, lokasyon ve yan haklar buradan otomatik gelir. Pozisyonda girilen değer her zaman önceliklidir.</p><p class="ref">Adaylardan özgeçmiş alırken kişisel veri işlediğiniz için ilanlarda aydınlatma metnine bağlantı vermeniz önerilir (6698 sayılı KVKK md. 10).</p>'} />
      </Ikili>
    </Panel>
    <Panel baslik="İlan kanalları">
      <ListeDuzenleyici
        a={a} liste="ilanKanallari" ekle="Kanal ekle"
        sutunlar={[{ f: 'ad', l: 'Kanal' }, { f: 'url', l: 'İşveren paneli adresi', genis: true }, { f: 'kod', l: 'Kod eki', ph: 'KN' }, { f: 'aktif', l: 'Kullan', t: 'isaret' }]}
      />
      <p className="tc-ikb-not">Adresleri kendi işveren hesaplarınızın giriş sayfalarıyla değiştirebilirsiniz. Kod eki ilan koduna eklenir (IK-2026-001-KN) ve adaylar başvururken bu kodu yazdığında kaynak kolayca anlaşılır.</p>
    </Panel>
  </>
);

const listeler: Icerik = (a) => (
  <Panel baslik="Listeler">
    <div className="tc-ikb-alanlar">
      {a.uzun('belgeler', 'Özlük dosyası belge listesi', 'Her satıra bir belge.', 10)}
      {a.uzun('perfKriterler', 'Performans değerlendirme kriterleri', 'Her satıra bir kriter.', 8)}
      {a.uzun('mulakatKriterler', 'Mülakat değerlendirme kriterleri', 'Her satıra bir kriter. Aday karşılaştırma tablosunun sütunlarını oluşturur.', 8)}
    </div>
  </Panel>
);

// Yedek indirme, geri yükleme, örnek veri ve toplu silme yeni arayüzde yoktur (karar 208 a); personel aktarımı Personel sayfasındadır.
const veri: Icerik = (a) => (
  <Panel baslik="Veri yönetimi">
    <p className="tc-ikb-soluk">{`Kayıtlar bağlı veri kaynağında tutulur. Şu an ${a.o.depo.kayitlar.size} kayıt var.`}</p>
    {a.o.yetki.personelYaz && (
      <div className="tc-ikb-arac">
        <Dugme simge="users" onClick={() => { a.o.git('personel'); }}>Personel aktar (Excel / CSV)</Dugme>
      </div>
    )}
    <Aciklama baslik="KVKK hatırlatması" html={'<p>Bu modülde tutulan kimlik, sağlık raporu, engellilik ve aday bilgileri kişisel veridir; bir kısmı özel nitelikli kişisel veridir. Çalışanlara ve adaylara aydınlatma metni verin, verileri yalnızca gerekli kişilerle paylaşın ve saklama süresi dolan kayıtları silin.</p><p class="ref">Dayanak: 6698 sayılı Kişisel Verilerin Korunması Kanunu md. 4–10.</p>'} />
  </Panel>
);

export const AYAR_BOLUMU_ICERIGI: Record<AyarBolumu, Icerik> = { genel, ucret, yanhak, tesvik, calisma, aktarim, ilan, listeler, veri };
