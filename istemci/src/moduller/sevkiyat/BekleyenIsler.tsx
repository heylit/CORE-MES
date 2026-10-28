// Sevkiyat havuzu: araca verilmemiş işler (istenen günü geçen ve yapılamayıp dönen dahil). Satırdaki "Araç" seçimi işi o araca verir;
// "Hepsini yerleştir" havuzu elle dizilenlere dokunmadan en uygun yere koyar. Araçtan buraya sürüklenen iş havuza döner.
// Altta o gün elle kapatılan işler durur; yeniden açılan iş havuza düşer.
import type { DragEvent, ReactNode } from 'react';
import type { Arac, GunPlaniCevabi, Is, IsTuru, Nokta } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Rozet } from '../../ortak/arayuz/index.ts';
import { IS_TURU_ADI, gunAdi, sayiMetni, tarihMetni } from './bicim.ts';
import { AracSecimi, SURUKLEME_TURU, suruklemeBaslat, suruklemeOku } from './AracRotasi.tsx';

const OK: Record<IsTuru, string> = { teslimat: '↓', alim: '↑', aktarma: '⇄' };

export function isBasligi(is: Is, noktalar: ReadonlyMap<number, Nokta>): string {
  const ad = (id: number | null) => (id === null ? '?' : noktalar.get(id)?.ad ?? '?');
  return is.tur === 'teslimat' ? ad(is.birakisNoktasiId) : is.tur === 'alim' ? ad(is.alisNoktasiId) : `${ad(is.alisNoktasiId)} → ${ad(is.birakisNoktasiId)}`;
}

const buyukHarfle = (metin: string) => metin.charAt(0).toLocaleUpperCase('tr') + metin.slice(1);

export function BekleyenIsler({ plan, isler, noktalar, araclar, duzenlenebilir, isYazabilir, vurgulu, yerlestir, aracaEkle, bekleyeneAl, duzenle, iptalEt, durumDegistir, tetik }: {
  plan: GunPlaniCevabi; isler: ReadonlyMap<number, Is>; noktalar: ReadonlyMap<number, Nokta>; araclar: readonly Arac[];
  duzenlenebilir: boolean; isYazabilir: boolean; vurgulu: number | null;
  // Bekleyenleri, elle dizilenlere dokunmadan en uygun yere koyar; yetki yoksa null.
  yerlestir: { kapali: boolean; calisiyor: boolean; yap: () => void } | null;
  aracaEkle: (isId: number, aracId: number) => void; bekleyeneAl: (isId: number) => void; duzenle: (is: Is) => void; iptalEt: (is: Is) => void;
  durumDegistir: (is: Is, durum: 'tamamlandi' | 'havuzda') => void;
  // Tüm işler kalemi taşıyan işin tetik düğmesi (960).
  tetik?: (is: Is) => ReactNode;
}) {
  const neden = new Map([...plan.yerlesemeyen, ...plan.atanamayan].map((x) => [x.isId, x.neden]));
  const bekleyen = plan.bekleyen.map((id) => isler.get(id)).filter((x): x is Is => Boolean(x));
  const rotada = new Set(plan.rotalar.flatMap((r) => r.ogeler.flatMap((o) => ('isId' in o ? [o.isId] : []))));
  const kapali = plan.isler.filter((i) => i.durum === 'tamamlandi' && !rotada.has(i.id));
  const geciken = bekleyen.filter((i) => i.istenenTarih < plan.tarih).length;
  const birak = (e: DragEvent) => {
    const veri = suruklemeOku(e); if (!veri || !duzenlenebilir) return;
    e.preventDefault(); if (veri.tur === 'is' && veri.aracId !== null) bekleyeneAl(veri.isId);
  };
  return (
    <section className="tc-sevkiyat-bekleyen" data-dolu={bekleyen.length > 0 || undefined} aria-label="Sevkiyat havuzu"
      onDragOver={(e) => { if (duzenlenebilir && e.dataTransfer.types.includes(SURUKLEME_TURU)) e.preventDefault(); }} onDrop={birak}>
      <header>
        <h3>Sevkiyat havuzu <em>{bekleyen.length} iş</em></h3>
        {geciken > 0 && <Rozet ton="uyari">{geciken} gecikmiş</Rozet>}
        {yerlestir && bekleyen.length > 0 && (
          <Dugme simge="bolt" disabled={yerlestir.kapali} yukleniyor={yerlestir.calisiyor} onClick={yerlestir.yap}
            title="Araçlara verilmiş işlere dokunmadan havuzdaki işleri en uygun araca ve sıraya koyar">Hepsini yerleştir</Dugme>
        )}
      </header>
      {!bekleyen.length && <p className="tc-sevkiyat-ince">Havuz boş: bütün işler bir araçta.{duzenlenebilir ? ' Bir işi araçtan çıkarmak için satırındaki “Araç” seçiminden “Havuza al”ı seçin.' : ''}</p>}
      {bekleyen.length > 0 && (
        <ul className="tc-sevkiyat-duraklar">
          {bekleyen.map((is) => {
            const pencere = is.tur === 'teslimat' ? [is.birakisEnErken, is.birakisEnGec] : [is.alisEnErken, is.alisEnGec];
            const baslik = isBasligi(is, noktalar);
            const ayrinti = [
              `${IS_TURU_ADI[is.tur].toLocaleLowerCase('tr')} ${sayiMetni(is.agirlikKilogram)} kg · ${is.paletSayisi} palet`,
              pencere[0] && pencere[1] ? `pencere ${pencere[0]}–${pencere[1]}` : '',
              is.belgeNo ?? '',
              is.sabitAracId !== null ? `sabit: ${araclar.find((a) => a.id === is.sabitAracId)?.ad ?? '?'}` : '',
            ].filter(Boolean).join(' · ');
            return (
              <li key={is.id} className="tc-sevkiyat-durak" data-tur={is.tur} data-uyari={neden.has(is.id) || undefined} data-vurgu={vurgulu === is.id || undefined}
                draggable={duzenlenebilir} onDragStart={(e) => suruklemeBaslat(e, { tur: 'is', isId: is.id, aracId: null, sira: -1 })}>
                <span className="tc-sevkiyat-durak-no">{OK[is.tur]}</span>
                <span className="tc-sevkiyat-durak-adi">
                  {baslik}
                  <em>{ayrinti}</em>
                  {(is.istenenTarih < plan.tarih || is.yapilamadiSayisi > 0) && (
                    <span className="tc-sevkiyat-rozetler">
                      {is.istenenTarih < plan.tarih && <Rozet ton="uyari">Gecikmiş · istenen {tarihMetni(is.istenenTarih)}</Rozet>}
                      {is.yapilamadiSayisi > 0 && <Rozet ton="hata">Yapılamadı{is.yapilamadiSayisi > 1 ? ` ×${is.yapilamadiSayisi}` : ''}{is.sonNot ? `: ${is.sonNot}` : ''}</Rozet>}
                    </span>
                  )}
                  {neden.has(is.id) && <strong className="tc-sevkiyat-uyari">{neden.get(is.id)}</strong>}
                </span>
                {tetik?.(is)}
                {duzenlenebilir && <AracSecimi isAdi={baslik} aracId={null} araclar={araclar} sec={(aracId) => { if (aracId !== null) aracaEkle(is.id, aracId); }} />}
                {isYazabilir && (
                  <select className="tc-sevkiyat-menu tc-sevkiyat-menu-kucuk" value="" aria-label={`${baslik} işi işlemleri`} title="Düzenle, elle kapat ya da iptal et"
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === 'duzenle') duzenle(is); else if (v === 'kapat') durumDegistir(is, 'tamamlandi'); else if (v === 'iptal') iptalEt(is);
                    }}>
                    <option value="">⋯</option>
                    <option value="duzenle">Düzenle</option>
                    <option value="kapat">Tamamlandı olarak kapat</option>
                    <option value="iptal">İptal et</option>
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {kapali.length > 0 && (
        <details className="tc-sevkiyat-kapali">
          <summary>{buyukHarfle(gunAdi(plan.tarih))} elle kapatılan {kapali.length} iş</summary>
          <ul className="tc-sevkiyat-duraklar">
            {kapali.map((is) => (
              <li key={is.id} className="tc-sevkiyat-durak" data-tur={is.tur}>
                <span className="tc-sevkiyat-durak-no">✓</span>
                <span className="tc-sevkiyat-durak-adi">{isBasligi(is, noktalar)}<em>{IS_TURU_ADI[is.tur].toLocaleLowerCase('tr')} {sayiMetni(is.agirlikKilogram)} kg{is.belgeNo ? ` · ${is.belgeNo}` : ''}</em></span>
                {isYazabilir && <Dugme onClick={() => durumDegistir(is, 'havuzda')} title="Tamamlanmadıysa işi yeniden sevkiyat havuzuna alır">Yeniden aç</Dugme>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
