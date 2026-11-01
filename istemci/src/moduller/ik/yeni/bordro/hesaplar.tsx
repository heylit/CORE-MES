import { para, tarih } from '../bicim.ts';
import { AYLAR } from './kurallar.ts';
import { iso, type AySonucu, type TazminatSonucu } from './motor-yuzu.ts';
import { Adimlar, eksi, sayiMetni, yuzde, type Adim } from './parcalar.tsx';

// Hesaplayıcıların sonuç tabloları (app.js calc*): metinler bugünkü ekranla aynıdır. `p` hesabın yapıldığı dönemin ayarıdır.
export type Ayar = (anahtar: string) => number;
const gun = (d: Date): string => tarih(iso(d));

export function TazminatAdimlari({ a, p }: { a: TazminatSonucu | null; p: Ayar }) {
  if (!a) return <p className="tc-ikb-soluk">Hesaplama için geçerli bir işe giriş ve çıkış tarihi girin.</p>;
  const binde = sayiMetni(p('damgaOran') * 10);
  const isciyeIhbar = a.rule.due === 'isci' || !a.code;
  const kidem: Adim[] = !a.yearOk
    ? [{ l: 'Kıdem tazminatı', v: para(0), n: 'Aynı işverende en az 1 yıl çalışma şartı sağlanmadığı için kıdem tazminatı doğmaz (1475 sayılı Kanun md. 14).' }]
    : !a.codeOk
      ? [{ l: 'Kıdem tazminatı', v: para(0), n: 'Seçilen çıkış nedeninde (istifa, deneme süresinde fesih veya işçinin ahlak ve iyi niyet kurallarına aykırı davranışı) kıdem tazminatı hakkı doğmaz. Askerlik, emeklilik, evlilik, haklı nedenle istifa gibi istisnalar için çıkış nedenini doğru seçin.' }]
      : [
        { l: `Tam yıllar: ${a.p.y} yıl × ${para(a.esas)}`, v: para(a.kYil), n: 'Her tam hizmet yılı için 30 günlük ücret.' },
        { l: `Artan aylar: ${a.p.m} ay × ${para(a.esas)} / 12`, v: para(a.kAy), n: 'Bir yıldan artan süreler orantılı olarak eklenir.' },
        { l: `Artan günler: ${a.p.d} gün × ${para(a.esas)} / 365`, v: para(a.kGun) },
        { l: 'Brüt kıdem tazminatı', v: para(a.kBrut), tot: true },
        { l: `Damga vergisi (binde ${binde})`, v: eksi(a.kDv), n: 'Kıdem tazminatı tavanı aşmadığı sürece gelir vergisinden (GVK md. 25/7) ve SGK priminden istisnadır; yalnızca damga vergisi kesilir.' },
        { l: 'Net kıdem tazminatı', v: para(a.kNet), tot: true },
      ];
  const izin: Adim[] = a.izinGun ? [
    { h: 'Kullanılmayan yıllık izin ücreti' },
    { l: `${sayiMetni(a.izinGun)} gün × ${para(a.brut / 30)}`, v: para(a.izBrut), n: 'Sözleşme sona erdiğinde kullanılmamış yıllık izin günleri, son ücret üzerinden ödenir (İş Kanunu md. 59). Günlük ücret = brüt ücret / 30.' },
    { l: 'SGK ve işsizlik işçi payı', v: eksi(a.izSgk), n: 'Kıdem ve ihbardan farklı olarak izin ücreti prime tabidir.' },
    { l: 'Gelir vergisi', v: eksi(a.izGv) },
    { l: 'Damga vergisi', v: eksi(a.izDv) },
    { l: 'Net izin ücreti', v: para(a.izNet), tot: true },
  ] : [];
  return (
    <Adimlar adimlar={[
      { h: 'Hizmet süresi ve esas ücret' },
      { l: 'Toplam hizmet süresi', v: `${a.p.y} yıl ${a.p.m} ay ${a.p.d} gün`, n: `${gun(a.g)} – ${gun(a.c)}, toplam ${sayiMetni(a.days)} gün. Çıkış günü dahil sayılır.` },
      { l: 'Giydirilmiş brüt ücret', v: para(a.giy), n: `Son brüt ücret (${para(a.brut)}) ile düzenli ve sürekli ödenen yan hakların (${para(a.yan)}) toplamı. Kıdem ve ihbar bu ücret üzerinden hesaplanır.` },
      { l: 'Kıdem tazminatı tavanı', v: para(p('kidemTavan')), n: 'Bir hizmet yılı için ödenebilecek en yüksek tutar. Fesih tarihinde geçerli tavan uygulanır.' },
      { l: 'Kıdem için esas ücret', v: para(a.esas), n: a.giy > a.esas ? 'Giydirilmiş ücret tavanı aştığı için tavan esas alındı.' : 'Giydirilmiş ücret tavanın altında olduğu için kendisi esas alındı.' },
      { h: 'Kıdem tazminatı' },
      ...kidem,
      { h: 'İhbar (bildirim) süresi ve tazminatı' },
      { l: 'İhbar süresi', v: `${a.weeks} hafta (${a.nDays} gün)`, n: `Hizmet süresi ${a.months} ay. İş Kanunu md. 17'ye göre 6 aydan az: ${p('ihbar1')} hafta, 6 ay–1,5 yıl: ${p('ihbar2')} hafta, 1,5–3 yıl: ${p('ihbar3')} hafta, 3 yıldan fazla: ${p('ihbar4')} hafta.` },
      { l: `Brüt ihbar tazminatı: ${a.nDays} gün × ${para(a.daily)}`, v: para(a.nBrut), n: 'Günlük giydirilmiş ücret = giydirilmiş brüt ücret / 30. İhbar tazminatında tavan uygulanmaz.' },
      { l: 'Gelir vergisi', v: eksi(a.nGv), n: `İhbar tazminatı ücret gibi vergilendirilir; yıl içi kümülatif matrah (${para(a.cum)}) üzerine eklenerek dilim oranı bulunur. SGK primi kesilmez.` },
      { l: `Damga vergisi (binde ${binde})`, v: eksi(a.nDv) },
      { l: 'Net ihbar tazminatı', v: para(a.nNet), tot: true, n: a.rule.text },
      ...izin,
      { h: 'Toplam' },
      {
        l: 'Ödenecek toplam (net)', v: para(a.kNet + (isciyeIhbar ? a.nNet : 0) + a.izNet), tot: true,
        n: isciyeIhbar ? 'Kıdem, ihbar ve izin ücreti netlerinin toplamı.' : 'İhbar tazminatı bu çıkış nedeninde işçiye ödenmediği için toplama katılmadı.',
      },
    ]}
    />
  );
}

export function BrutNetAdimlari({ a, ay, p }: { a: AySonucu; ay: number; p: Ayar }) {
  const binde = sayiMetni(p('damgaOran') * 10);
  return (
    <Adimlar adimlar={[
      { l: 'Brüt ücret', v: para(a.toplam) },
      { l: `SGK işçi payı (${yuzde(p('sgkIsciOran'))})`, v: eksi(a.sgk), n: `Prime esas kazanç üzerinden: ${para(a.sgkMatrah)}${a.toplam > a.sgkMatrah ? ' (SGK tavanı uygulandı)' : ''}. %9 malullük, yaşlılık ve ölüm + %5 genel sağlık sigortası.` },
      { l: `İşsizlik sigortası işçi payı (${yuzde(p('issizlikIsciOran'))})`, v: eksi(a.iss) },
      { l: 'Gelir vergisi matrahı', v: para(a.matrah), n: 'Brüt ücret − SGK işçi payı − işsizlik işçi payı.' },
      { l: 'Yıl içi kümülatif matrah', v: para(a.cumOnce + a.matrah), n: `Önceki ayların matrahı (${para(a.cumOnce)}) + bu ay. Kümülatif matrah büyüdükçe çalışan üst dilimlere geçer, bu yüzden net ücret yıl içinde düşebilir.` },
      { l: 'Hesaplanan gelir vergisi', v: para(a.gvHam), n: 'Kümülatif matrahın vergisi − önceki aylar kümülatif matrahının vergisi (GVK md. 103 tarifesi).' },
      { l: 'Asgari ücret gelir vergisi istisnası', v: eksi(a.gvIst), n: 'Asgari ücretin aynı ay için hesaplanan gelir vergisi kadar tutar vergiden düşülür (GVK md. 23/18).' },
      { l: 'Gelir vergisi', v: eksi(a.gv) },
      { l: `Damga vergisi (binde ${binde})`, v: eksi(a.dv), n: `Brüt ücretin binde ${binde}'u; asgari ücrete isabet eden kısım (${para(a.dvIst)}) istisnadır.` },
      { l: `${AYLAR[ay - 1] ?? ''} net ücret`, v: para(a.net), tot: true },
      { l: `SGK işveren payı (${yuzde(p('sgkIsverenOran'))})`, v: para(a.isvBrut) },
      {
        l: a.tesvik ? `Teşvik: ${a.tesvik.ad}` : 'Teşvik indirimi', v: eksi(a.tInd),
        n: a.tesvik ? 'Genel ayardaki teşvik uygulandı. Kişiye özel teşvik personel kartından seçilir.' : 'Teşvik uygulanmadı. Ayarlar > Teşvikler bölümünden varsayılan teşviki seçebilirsiniz.',
      },
      { l: `İşsizlik sigortası işveren payı (${yuzde(p('issizlikIsverenOran'))})`, v: para(a.isvIss) },
      { l: 'Toplam işveren maliyeti', v: para(a.maliyet), tot: true },
    ]}
    />
  );
}

// 12 aylık tablo; seçili ay vurgulanır.
export function AylikTablo({ aylar, secili }: { aylar: readonly AySonucu[]; secili?: number }) {
  const top = (f: (a: AySonucu) => number) => aylar.reduce((s, a) => s + f(a), 0);
  return (
    <div className="tc-ikb-liste">
      <table className="tc-ikb-tablo" aria-label="12 aylık tablo">
        <thead>
          <tr><th>Ay</th><th data-sag="">Brüt</th><th data-sag="">SGK + işsizlik</th><th data-sag="">Kümülatif matrah</th><th data-sag="">Gelir vergisi</th><th data-sag="">Damga</th><th data-sag="">Net</th><th data-sag="">İşveren maliyeti</th></tr>
        </thead>
        <tbody>
          {aylar.map((a, i) => (
            <tr key={i} data-secili={i + 1 === secili ? '' : undefined}>
              <td>{AYLAR[i]}</td><td data-sag="">{para(a.brut)}</td><td data-sag="">{para(a.sgk + a.iss)}</td><td data-sag="">{para(a.cumOnce + a.matrah)}</td>
              <td data-sag="">{para(a.gv)}</td><td data-sag="">{para(a.dv)}</td><td data-sag=""><b>{para(a.net)}</b></td><td data-sag="">{para(a.maliyet)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Yıllık</td><td data-sag="">{para(top((a) => a.brut))}</td><td data-sag="">{para(top((a) => a.sgk + a.iss))}</td><td />
            <td data-sag="">{para(top((a) => a.gv))}</td><td data-sag="">{para(top((a) => a.dv))}</td><td data-sag="">{para(top((a) => a.net))}</td><td data-sag="">{para(top((a) => a.maliyet))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

