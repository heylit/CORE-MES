import { useState } from 'react';
import { MENU_SIK_SINIRI } from '#paylasilan/rol-gorunumleri.ts';
import type { Sayfa } from '#paylasilan/sayfalar.ts';
import { useMenuSec } from '../veri/menu-tercihi.ts';
import { Dugme } from './Dugme.tsx';
import { DurumKutusu } from './DurumKutusu.tsx';
import { Pencere } from './Pencere.tsx';
import { Simge } from './Simge.tsx';
import './menu-duzenle.css';

interface Ozellikler {
  kapat: () => void;
  // Kişinin menüde görebildiği sayfalar, ana menünün gruplarıyla; seçilebilen yalnız bunlardır.
  gruplar: readonly { grup: string; sayfalar: readonly Sayfa[] }[];
  secili: readonly string[];
  surum: number;
  // Rolün önerdiği kısa liste (1390 a); boşsa "Rolümün önerisi" düğmesi çizilmez.
  oneri: readonly string[];
}

// Sık kullanılanları seçme ve sıralama (2951). Seçim kaydedilince menünün üstünde, bu sırayla durur; telefonun alt çubuğu
// ilk ikisini alır (Kayıt gir olmayan kişide ilk üçünü). Yetki değişmez: listede kişinin zaten açabildiği sayfalar vardır.
export function MenuDuzenle({ kapat, gruplar, secili, surum, oneri }: Ozellikler) {
  const tumu = gruplar.flatMap((g) => g.sayfalar);
  const gorunur = (yol: string) => tumu.some((s) => s.yol === yol);
  const [liste, listeYaz] = useState<readonly string[]>(() => secili.filter(gorunur));
  const sec = useMenuSec();
  const dolu = liste.length >= MENU_SIK_SINIRI;
  const baslik = (yol: string) => tumu.find((s) => s.yol === yol)?.baslik ?? yol;
  const degistir = (yol: string) => {
    listeYaz((l) => (l.includes(yol) ? l.filter((y) => y !== yol) : l.length >= MENU_SIK_SINIRI ? l : [...l, yol]));
  };
  const tasi = (sira: number, yon: -1 | 1) => {
    listeYaz((l) => {
      const hedef = sira + yon;
      if (hedef < 0 || hedef >= l.length) return l;
      const yeni = [...l];
      [yeni[sira], yeni[hedef]] = [yeni[hedef] as string, yeni[sira] as string];
      return yeni;
    });
  };
  const rolOnerisi = oneri.filter(gorunur).slice(0, MENU_SIK_SINIRI);
  const kaydet = () => { sec.mutate({ sayfalar: [...liste], surum }, { onSuccess: kapat }); };

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Menüyü düzenle"
      tur="yan"
      alt={(
        <>
          <Dugme onClick={kapat} disabled={sec.isPending}>Vazgeç</Dugme>
          <Dugme tur="birincil" onClick={kaydet} yukleniyor={sec.isPending}>Kaydet</Dugme>
        </>
      )}
    >
      <div className="tc-md">
        <section className="tc-md-bolum" aria-labelledby="tc-md-sik">
          <div className="tc-md-baslik">
            <h3 id="tc-md-sik">Sık kullanılanlar</h3>
            <span className="tc-md-sayi">{liste.length} / {MENU_SIK_SINIRI}</span>
          </div>
          {/* Hata seçimin hemen altında çizilir: uzun listede Kaydet'e basan kişi pencerenin neden kapanmadığını görür. */}
          {sec.isError && <DurumKutusu durum="hata" hata={sec.error} mesaj="Menü kaydedilemedi." />}
          {dolu && <p className="tc-md-bos" role="status">En çok {MENU_SIK_SINIRI} sayfa seçilir; yenisini eklemek için birini çıkarın.</p>}
          {liste.length === 0
            ? <p className="tc-md-bos">Henüz seçim yok. Aşağıdan en çok açtığınız sayfaları işaretleyin; menünün en üstünde dururlar.</p>
            : (
              <ol className="tc-md-sira">
                {liste.map((yol, i) => (
                  <li key={yol}>
                    <span className="tc-md-ad">{baslik(yol)}</span>
                    <button type="button" className="tc-md-ok" aria-label={`${baslik(yol)} yukarı`} disabled={i === 0} onClick={() => tasi(i, -1)}><Simge ad="up" boyut="k" /></button>
                    <button type="button" className="tc-md-ok" aria-label={`${baslik(yol)} aşağı`} disabled={i === liste.length - 1} onClick={() => tasi(i, 1)}><Simge ad="down" boyut="k" /></button>
                    <button type="button" className="tc-md-ok" aria-label={`${baslik(yol)} çıkar`} onClick={() => degistir(yol)}><Simge ad="x" boyut="k" /></button>
                  </li>
                ))}
              </ol>
            )}
          <div className="tc-md-eylem">
            {rolOnerisi.length > 0 && <Dugme simge="users" onClick={() => listeYaz(rolOnerisi)}>Rolümün önerisi</Dugme>}
            {liste.length > 0 && <Dugme simge="trash" onClick={() => listeYaz([])}>Temizle</Dugme>}
          </div>
        </section>
        {gruplar.map((g) => (
          <fieldset key={g.grup} className="tc-md-grup">
            <legend>{g.grup}</legend>
            {g.sayfalar.map((s) => {
              const isaretli = liste.includes(s.yol);
              return (
                <label key={s.yol} className="tc-md-satir">
                  <input type="checkbox" checked={isaretli} disabled={!isaretli && dolu} onChange={() => degistir(s.yol)} />
                  <Simge ad={s.simge} boyut="k" />
                  <span>{s.baslik}</span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
    </Pencere>
  );
}
