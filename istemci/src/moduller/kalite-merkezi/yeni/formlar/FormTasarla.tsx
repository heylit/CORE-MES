import { useState } from 'react';
import { CokSatir, Girdi, IsaretKutusu, Secim } from '../../../../ortak/arayuz/Alan.tsx';
import { useBildirim } from '../../../../ortak/arayuz/Bildirim.tsx';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { OnayPenceresi } from '../../../../ortak/arayuz/OnayPenceresi.tsx';
import { Pencere } from '../../../../ortak/arayuz/Pencere.tsx';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { Belge } from '../Belge.tsx';
import { bugun } from '../kurallar.ts';
import type { Sablon } from '../tipler.ts';
import { useKmKomutu, type KmVerisi } from '../veri.ts';
import type { KmYetkisi } from '../yetki.ts';
import { dslCoz } from './dsl.ts';
import { BolumBaskisi } from './FormBelgesi.tsx';
import { FORM_KATEGORILERI, tasarimBaslangici, tasarimHatasi, type ListedekiForm, type SablonTaslagi } from './sablonlar.ts';

const ZORUNLU: readonly (keyof SablonTaslagi)[] = ['kod', 'ad', 'rev', 'yurur'];
const ADLAR: Partial<Record<keyof SablonTaslagi, string>> = { kod: 'Doküman no', ad: 'Form adı', rev: 'Revizyon', yurur: 'Yürürlük' };

// Form tasarımı (uygulamadaki openBuilder): başlık bilgileri, tasarım dili metni, canlı önizleme ve yazım kuralları.
// Var olan formda içerik değişince revizyon artmalıdır; standart form düzenlenince aynı kodla kayıt olur ("özelleştirildi").
export function FormTasarla({ veri, yetki, form, kapat }: { veri: KmVerisi; yetki: KmYetkisi; form: ListedekiForm | undefined; kapat: () => void }) {
  const komut = useKmKomutu(yetki.rol);
  const { bildir } = useBildirim();
  const [t, tYaz] = useState<SablonTaslagi>(() => tasarimBaslangici(form, veri.tpl, bugun()));
  const [acilis] = useState(() => JSON.stringify(t));
  const [hatali, hataliYaz] = useState<ReadonlySet<string>>(new Set());
  const [soruyor, soruyorYaz] = useState(false);
  const [kaydediliyor, kaydediliyorYaz] = useState(false);
  const yaz = <K extends keyof SablonTaslagi>(k: K, v: SablonTaslagi[K]) => tYaz((o) => ({ ...o, [k]: v }));
  const kirli = JSON.stringify(t) !== acilis;
  const kapatmayiDene = () => (kirli && !kaydediliyor ? soruyorYaz(true) : kapat());

  const kaydet = async () => {
    const eksik = ZORUNLU.filter((k) => String(t[k] ?? '').trim() === '');
    if (eksik.length) {
      hataliYaz(new Set(eksik));
      bildir('hata', eksik.length === 1 ? `"${ADLAR[eksik[0]!] ?? ''}" alanını doldurun.` : `${eksik.length} zorunlu alan boş.`);
      return;
    }
    const hata = tasarimHatasi(t, form, veri.tpl);
    if (hata) { bildir('hata', hata); return; }
    kaydediliyorYaz(true);
    try {
      await komut.kaydet('tpl', { ...((form?.kayit ?? {}) as Partial<Sablon>), ...t });
      bildir('tamam', `${t.kod} rev ${t.rev} kaydedildi`);
      kapat();
    } catch (e) {
      bildir('hata', hataIletisi(e, 'Form kaydedilemedi.'));
    } finally {
      kaydediliyorYaz(false);
    }
  };

  const hataOf = (k: string) => (hatali.has(k) ? 'Bu alan zorunlu.' : undefined);
  const bolumler = dslCoz(t.dsl);

  return (
    <>
      <Pencere acik kapat={kapatmayiDene} baslik={form ? `${form.kod} formunu düzenle` : 'Yeni form tasarla'} tur="tam"
        alt={<><Dugme onClick={kapatmayiDene}>Vazgeç</Dugme><span className="tc-km-bosluk" /><Dugme tur="birincil" yukleniyor={kaydediliyor} onClick={() => void kaydet()}>Kaydet</Dugme></>}>
        <div className="tc-km-form">
          <div className="tc-km-alanlar">
            <div className="tc-km-alan"><Girdi etiket="Doküman no" required hata={hataOf('kod')} value={t.kod} onChange={(o) => yaz('kod', o.target.value)} /></div>
            <div className="tc-km-alan"><Girdi etiket="Form adı" required hata={hataOf('ad')} value={t.ad} onChange={(o) => yaz('ad', o.target.value)} /></div>
            <div className="tc-km-alan"><Girdi etiket="Revizyon" required hata={hataOf('rev')} value={t.rev} onChange={(o) => yaz('rev', o.target.value)} /></div>
            <div className="tc-km-alan"><Girdi etiket="Yürürlük" type="date" required hata={hataOf('yurur')} value={t.yurur} onChange={(o) => yaz('yurur', o.target.value)} /></div>
            <div className="tc-km-alan"><Girdi etiket="Dayanak (standart / madde)" value={t.std} onChange={(o) => yaz('std', o.target.value)} /></div>
            <div className="tc-km-alan">
              <Secim etiket="Kategori" value={t.kat} onChange={(o) => yaz('kat', o.target.value)} bosSecenek="—"
                secenekler={FORM_KATEGORILERI.map((k) => ({ deger: k, baslik: k }))} />
            </div>
            <div className="tc-km-alan tc-km-alan-tam"><Girdi etiket="Ne zaman kullanılır" value={t.ne} onChange={(o) => yaz('ne', o.target.value)} /></div>
            <div className="tc-km-alan"><IsaretKutusu etiket="Etiket olarak yazdır" checked={t.etiket} onChange={(o) => yaz('etiket', o.target.checked)} /></div>
          </div>
          <div className="tc-km3-tasarim">
            <div className="tc-km3-dsl"><CokSatir etiket="Form içeriği" rows={18} spellCheck={false} value={t.dsl} onChange={(o) => yaz('dsl', o.target.value)} /></div>
            <div className="tc-km3-tasarim-yan">
              <p className="tc-km3-etiket">Önizleme</p>
              <div className="tc-km-onizleme">
                <Belge>{bolumler.length ? bolumler.map((b, si) => <BolumBaskisi key={si} b={b} si={si} kayit={null} />) : <p className="tc-km-soluk">Boş</p>}</Belge>
              </div>
              <div className="tc-km3-yardim">
                <b>Yazım kuralları</b>
                <ul>
                  <li><code># Başlık</code> yeni bölüm</li>
                  <li><code>Alan adı</code> kısa metin, <code>*</code> zorunlu</li>
                  <li><code>Alan | tarih</code>, <code>| sayı</code>, <code>| metin</code></li>
                  <li><code>Alan | seçim: A, B, C</code></li>
                  <li><code>Alan | çoklu: A, B, C</code></li>
                  <li><code>? Madde</code> Evet / Hayır / UD</li>
                  <li><code>[Tablo: Sütun 1, Sütun 2]</code></li>
                </ul>
                <p>"Karar", "Durum" veya "Sonuç" ile başlayan seçim alanı kaydın sonucunu belirler.</p>
              </div>
            </div>
          </div>
        </div>
      </Pencere>
      <OnayPenceresi acik={soruyor} baslik="Kaydedilmemiş değişiklikler" tehlikeli onayMetni="Kaydetmeden kapat"
        onayla={() => { soruyorYaz(false); kapat(); }} vazgec={() => soruyorYaz(false)}>
        Girdiğiniz bilgiler kaydedilmedi. Pencere kapatılırsa kaybolur.
      </OnayPenceresi>
    </>
  );
}
