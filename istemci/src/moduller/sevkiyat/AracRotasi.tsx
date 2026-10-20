// Sevkiyat listesinde bir aracın grubu: başlıkta özet ve yük, altında sırasıyla durakları.
// Her satırdaki "Araç" seçimi işi başka araca verir ya da atanmamışlara alır (elle dağıtma); sıra ve iş işlemleri ⋯ menüsündedir.
import { Fragment, type DragEvent, type KeyboardEvent } from 'react';
import type { Amac, Arac, Is, Nokta, PlanRotasi, RotaOgesi } from '#paylasilan/sozlesme/sevkiyat.ts';
import { Dugme, Rozet } from '../../ortak/arayuz/index.ts';
import { ARAC_TURU_ADI, kilometreMetni, paraMetni, saatMetni, sayiMetni, tarihMetni } from './bicim.ts';
import { araDonusMu, yukTepesi } from './rota-duzeni.ts';
import { SurucuBaglantisi } from './SurucuBaglantisi.tsx';

export type Surukleme = { tur: 'is'; isId: number; aracId: number | null; sira: number } | { tur: 'ara-donus'; aracId: number; sira: number };
export const SURUKLEME_TURU = 'application/x-tmi-sevkiyat';
export const suruklemeOku = (e: DragEvent): Surukleme | null => {
  try { return JSON.parse(e.dataTransfer.getData(SURUKLEME_TURU)) as Surukleme; } catch { return null; }
};
export const suruklemeBaslat = (e: DragEvent, veri: Surukleme) => { e.dataTransfer.setData(SURUKLEME_TURU, JSON.stringify(veri)); e.dataTransfer.effectAllowed = 'move'; };

// İşin aracı: elle dağıtmanın tek denetimi. "yok" atanmamışlar demektir.
export function AracSecimi({ isAdi, aracId, araclar, sec }: { isAdi: string; aracId: number | null; araclar: readonly Arac[]; sec: (aracId: number | null) => void }) {
  return (
    <select className="tc-sevkiyat-menu tc-sevkiyat-arac-secimi" aria-label={`${isAdi} işinin aracı`} value={aracId === null ? 'yok' : String(aracId)}
      onChange={(e) => sec(e.target.value === 'yok' ? null : Number(e.target.value))}>
      <option value="yok">{aracId === null ? 'Araç seç…' : 'Havuza al'}</option>
      {araclar.map((a) => <option key={a.id} value={a.id}>{a.ad}</option>)}
    </select>
  );
}

export interface AracRotasiIslemleri {
  sec: () => void; kilit: () => void;
  isiTasi: (isId: number, hedefAracId: number | null, sira?: number) => void;
  siraDegistir: (eskiSira: number, yeniSira: number) => void;
  araDonusEkle: (sira: number) => void; araDonusSil: (sira: number) => void;
  sabitle: (is: Is, aracId: number | null) => void;
  duzenle: (is: Is) => void; iptalEt: (is: Is) => void;
  // Onaylı planda: teslim sonucu, yapılamadı (not sorulur), sonucu geri al, yeniden aç.
  durumDegistir: (is: Is, durum: 'tamamlandi' | 'yapilamadi' | 'havuzda' | 'yolda') => void;
}

export interface AracRotasiOzellikleri {
  arac: Arac; renk: number; rota: PlanRotasi | undefined; secili: boolean; vurgulu: string | null;
  isler: ReadonlyMap<number, Is>; noktalar: ReadonlyMap<number, Nokta>; araclar: readonly Arac[];
  duzenlenebilir: boolean; isYazabilir: boolean; tarih: string; amac: Amac;
  // Onaylı planda durakların sonucu (iş başına) ve sonucu işaretleme yetkisi; taslakta null.
  sonuclar: ReadonlyMap<number, { sonuc: 'tamamlandi' | 'yapilamadi'; not: string | null }> | null; sonucYazabilir: boolean;
  islem: AracRotasiIslemleri;
}

const TESLIM_ADI: Record<Is['tur'], string> = { teslimat: 'Teslim edildi', alim: 'Alındı', aktarma: 'Tamamlandı' };

// Onaylı plandaki durağın durumu: sonuç yoksa yoldadır (işaretlenir); yapılamayan iş havuza döner ya da başka plana girer.
function DurakSonucu({ is, sonuc, yazabilir, degistir }: {
  is: Is; sonuc: { sonuc: 'tamamlandi' | 'yapilamadi'; not: string | null } | undefined; yazabilir: boolean;
  degistir: (durum: 'tamamlandi' | 'yapilamadi' | 'havuzda' | 'yolda') => void;
}) {
  if (!sonuc && is.durum === 'yolda') {
    return yazabilir ? (
      <span className="tc-sevkiyat-sonuc-dugmeleri">
        <Dugme tur="birincil" simge="check" onClick={() => degistir('tamamlandi')}>{TESLIM_ADI[is.tur]}</Dugme>
        <Dugme simge="x" onClick={() => degistir('yapilamadi')}>Yapılamadı</Dugme>
      </span>
    ) : <Rozet ton="bilgi">Yolda</Rozet>;
  }
  const geriAlinir = yazabilir && sonuc !== undefined && (is.durum === 'havuzda' || is.durum === 'tamamlandi');
  const rozet = !sonuc ? <Rozet ton="pasif">Havuza döndü</Rozet>
    : sonuc.sonuc === 'tamamlandi' ? <Rozet ton="tamam">{TESLIM_ADI[is.tur]}</Rozet>
      : <Rozet ton="hata">Yapılamadı{sonuc.not ? `: ${sonuc.not}` : ''}{is.durum === 'havuzda' ? ' · havuzda' : is.durum === 'tamamlandi' ? '' : ' · yeniden planlandı'}</Rozet>;
  return (
    <span className="tc-sevkiyat-sonuc-dugmeleri">
      {rozet}
      {(geriAlinir || (yazabilir && is.durum === 'tamamlandi')) && (
        <select className="tc-sevkiyat-menu tc-sevkiyat-menu-kucuk" value="" aria-label="Sonuç işlemleri" title="Sonucu geri al ya da yeniden aç"
          onChange={(e) => { const v = e.target.value; if (v === 'yolda' || v === 'havuzda') degistir(v); }}>
          <option value="">⋯</option>
          {geriAlinir && <option value="yolda">Sonucu geri al (yolda)</option>}
          {is.durum === 'tamamlandi' && <option value="havuzda">Yeniden aç (havuza al)</option>}
        </select>
      )}
    </span>
  );
}

const pencereMetni = (bas: string | null, son: string | null) => (bas && son ? `${bas}–${son}` : '');

export function AracRotasi({ arac, renk, rota, secili, vurgulu, isler, noktalar, araclar, duzenlenebilir, isYazabilir, tarih, amac, sonuclar, sonucYazabilir, islem }: AracRotasiOzellikleri) {
  const ogeler = rota?.ogeler ?? [], hesap = rota?.hesap ?? null;
  // Hesap satırları işin ucuyla eşlenir; ara dönüşler sırasıyla.
  const durakBul = new Map((hesap?.duraklar ?? []).filter((d) => d.isId !== null).map((d) => [`${d.isId}:${d.alis}`, d]));
  const donusler = (hesap?.duraklar ?? []).filter((d) => d.isId === null);
  const uyariSayisi = (hesap?.uyarilar.length ?? 0) + (hesap?.duraklar.filter((d) => d.uyarilar.length).length ?? 0);
  let durakNo = 0, donusNo = 0;
  const kapasite = Number(arac.kapasiteKilogram);
  const durakSayisi = ogeler.filter((o) => !araDonusMu(o)).length;
  // Harita paketi yokken hesap gelmez; yük çubuğu atanmış işlerden sayılır.
  const yuk = hesap ? { kilogram: hesap.enCokKilogram, palet: hesap.enCokPalet } : yukTepesi(ogeler, (id) => isler.get(id));

  const menu = (sira: number, is: Is, ad: string) => (
    <select className="tc-sevkiyat-menu tc-sevkiyat-menu-kucuk" value="" title="Sırayı değiştir, sabitle, düzenle" aria-label={`${ad} durağı işlemleri`}
      onChange={(e) => {
        const v = e.target.value;
        if (v === 'yukari') islem.siraDegistir(sira, sira - 1);
        else if (v === 'asagi') islem.siraDegistir(sira, sira + 2);
        else if (v === 'ara-donus') islem.araDonusEkle(sira);
        else if (v === 'sabitle') islem.sabitle(is, is.sabitAracId === arac.id ? null : arac.id);
        else if (v === 'duzenle') islem.duzenle(is);
        else if (v === 'iptal') islem.iptalEt(is);
      }}>
      <option value="">⋯</option>
      <optgroup label="Sıra">
        {sira > 0 && <option value="yukari">Yukarı al</option>}
        {sira < ogeler.length - 1 && <option value="asagi">Aşağı al</option>}
        {sira > 0 && <option value="ara-donus">Önce fabrikaya dön (yeni sefer)</option>}
      </optgroup>
      {isYazabilir && (
        <optgroup label="İş">
          <option value="sabitle">{is.sabitAracId === arac.id ? 'Sabitlemeyi kaldır' : 'Bu araca sabitle'}</option>
          <option value="duzenle">Düzenle</option>
          <option value="iptal">İptal et</option>
        </optgroup>
      )}
    </select>
  );
  const tusla = (e: KeyboardEvent, sira: number, oge: RotaOgesi) => {
    if (!duzenlenebilir || e.target !== e.currentTarget) return;
    if (e.altKey && e.key === 'ArrowUp' && sira > 0) { e.preventDefault(); islem.siraDegistir(sira, sira - 1); }
    else if (e.altKey && e.key === 'ArrowDown' && sira < ogeler.length - 1) { e.preventDefault(); islem.siraDegistir(sira, sira + 2); }
    else if (e.key === 'Delete' && !araDonusMu(oge)) { e.preventDefault(); islem.isiTasi(oge.isId, null); }
  };
  const birak = (e: DragEvent, sira?: number) => {
    const veri = suruklemeOku(e); if (!veri || !duzenlenebilir) return;
    e.preventDefault(); e.stopPropagation();
    if (veri.tur === 'ara-donus') { if (veri.aracId === arac.id) islem.siraDegistir(veri.sira, sira ?? ogeler.length); return; }
    if (veri.aracId === arac.id && sira !== undefined) islem.siraDegistir(veri.sira, sira);
    else islem.isiTasi(veri.isId, arac.id, sira);
  };
  const uzerinde = (e: DragEvent) => { if (duzenlenebilir && e.dataTransfer.types.includes(SURUKLEME_TURU)) e.preventDefault(); };

  return (
    <section className="tc-sevkiyat-arac" data-renk={renk} data-secili={secili || undefined} data-bos={!ogeler.length || undefined} aria-label={arac.ad}
      onDragOver={uzerinde} onDrop={(e) => birak(e)}>
      <header className="tc-sevkiyat-arac-baslik">
        <button type="button" className="tc-sevkiyat-arac-adi" aria-pressed={secili} onClick={islem.sec} title={secili ? 'Haritada bütün araçları göster' : 'Haritada bu aracı öne çıkar'}>
          <i className="tc-sevkiyat-renk" aria-hidden="true" />
          <span className="tc-sevkiyat-arac-adi-metni">
            <b>{arac.ad}</b> <em>{ARAC_TURU_ADI[arac.tur]}{rota?.kilitli ? ' · kilitli' : ''}</em>
            <small>
              {hesap ? `${saatMetni(hesap.cikis)}–${saatMetni(hesap.donus)} · ${durakSayisi} durak · ${kilometreMetni(hesap.kilometre)}` : ogeler.length ? `${durakSayisi} durak` : `Boş · müsait ${arac.musaitBaslangic}–${arac.musaitBitis}`}
              {hesap && amac === 'maliyet' && hesap.maliyet !== null ? ` · ${paraMetni(hesap.maliyet)}` : ''}
              {hesap && hesap.seferler.length > 1 ? ` · ${hesap.seferler.length} sefer` : ''}
            </small>
          </span>
        </button>
        {uyariSayisi > 0 && <Rozet ton="uyari">{uyariSayisi} uyarı</Rozet>}
        {hesap && hesap.seferler.length > 0 && <SurucuBaglantisi arac={arac} seferler={hesap.seferler} noktalar={noktalar} tarih={tarih} amac={amac} />}
        {duzenlenebilir && ogeler.length > 0 && (
          <Dugme simge="lock" aria-pressed={rota?.kilitli ?? false} aria-label={rota?.kilitli ? `${arac.ad} kilidini aç` : `${arac.ad} rotasını kilitle`}
            title={rota?.kilitli ? 'Kilitli: otomatik dağıtma bu rotaya dokunmaz. Açmak için tıklayın.' : 'Kilitle: otomatik dağıtma bu rotaya dokunmasın'} onClick={islem.kilit} />
        )}
      </header>
      {ogeler.length > 0 && (
        <div className="tc-sevkiyat-arac-yuk">
          <label className="tc-sevkiyat-olcer">
            <span>{sayiMetni(yuk.kilogram)}/{sayiMetni(kapasite)} kg</span>
            <meter min={0} max={kapasite} high={kapasite * 0.95} optimum={0} value={Math.min(yuk.kilogram, kapasite)} />
          </label>
          <label className="tc-sevkiyat-olcer">
            <span>{yuk.palet}/{arac.kapasitePalet} palet</span>
            <meter min={0} max={Math.max(1, arac.kapasitePalet)} high={arac.kapasitePalet * 0.95} optimum={0} value={Math.min(yuk.palet, arac.kapasitePalet)} />
          </label>
        </div>
      )}
      {hesap?.uyarilar.map((u) => <p key={u} className="tc-sevkiyat-uyari">{u}</p>)}
      {ogeler.length > 0 ? (
        <ol className="tc-sevkiyat-duraklar">
          <li className="tc-sevkiyat-fabrika-satiri"><time>{hesap ? saatMetni(hesap.cikis) : '--:--'}</time> Fabrikadan çıkış</li>
          {ogeler.map((oge, sira) => {
            if (araDonusMu(oge)) {
              const donus = donusler[donusNo++];
              return (
                <li key={`d${sira}`} className="tc-sevkiyat-durak" data-tur="ara-donus" draggable={duzenlenebilir} tabIndex={0}
                  onKeyDown={(e) => tusla(e, sira, oge)} onDragStart={(e) => suruklemeBaslat(e, { tur: 'ara-donus', aracId: arac.id, sira })}
                  onDragOver={uzerinde} onDrop={(e) => birak(e, sira)}>
                  <span className="tc-sevkiyat-durak-no">↩</span>
                  <span className="tc-sevkiyat-durak-adi">Fabrikaya dönüş, yeni sefer<em>{donus ? `${saatMetni(donus.varis)} varış · ${saatMetni(donus.ayrilis)} çıkış` : ''}</em></span>
                  {duzenlenebilir && <Dugme simge="x" aria-label="Ara dönüşü kaldır" onClick={() => islem.araDonusSil(sira)} />}
                </li>
              );
            }
            const is = isler.get(oge.isId); if (!is) return <Fragment key={`y${sira}`} />;
            durakNo++;
            const hesapDuragi = durakBul.get(`${oge.isId}:${oge.alis}`), onaySaati = rota?.onaySaatleri?.[sira] ?? null;
            const nokta = noktalar.get((oge.alis ? is.alisNoktasiId : is.birakisNoktasiId) ?? -1);
            const ad = nokta?.ad ?? '?';
            const pencere = oge.alis ? pencereMetni(is.alisEnErken, is.alisEnGec) : pencereMetni(is.birakisEnErken, is.birakisEnGec);
            const karsi = is.tur === 'aktarma' ? noktalar.get((oge.alis ? is.birakisNoktasiId : is.alisNoktasiId) ?? -1)?.ad : null;
            const ayrinti = [
              `${oge.alis ? 'al' : 'bırak'} ${sayiMetni(is.agirlikKilogram)} kg · ${is.paletSayisi} palet`,
              pencere ? `pencere ${pencere}` : '',
              karsi ? (oge.alis ? `→ ${karsi}` : `← ${karsi}`) : '',
              is.belgeNo ?? '',
              is.sabitAracId === arac.id ? 'sabit' : '',
              is.istenenTarih < tarih ? `gecikmiş · istenen ${tarihMetni(is.istenenTarih)}` : '',
              is.yapilamadiSayisi > 0 && !sonuclar ? `${is.yapilamadiSayisi + 1}. deneme` : '',
              hesapDuragi && hesapDuragi.bekleme > 0.5 ? `${Math.round(hesapDuragi.bekleme)} dk bekler` : '',
            ].filter(Boolean).join(' · ');
            return (
              <li key={`${is.id}:${oge.alis}`} className="tc-sevkiyat-durak" data-tur={oge.alis ? 'al' : 'birak'} data-uyari={hesapDuragi?.uyarilar.length ? true : undefined}
                data-vurgu={vurgulu === `${arac.id}|${is.id}` || undefined} draggable={duzenlenebilir} tabIndex={0} onKeyDown={(e) => tusla(e, sira, oge)}
                onDragStart={(e) => suruklemeBaslat(e, { tur: 'is', isId: is.id, aracId: arac.id, sira })} onDragOver={uzerinde} onDrop={(e) => birak(e, sira)}
                title={hesapDuragi ? `Bu duraktan sonra araçta ${sayiMetni(Math.max(0, hesapDuragi.yukKilogram))} kg / ${Math.max(0, hesapDuragi.yukPalet)} palet` : undefined}
                aria-label={`${durakNo}. ${oge.alis ? 'al' : 'bırak'} ${ad}${hesapDuragi ? ` ${saatMetni(hesapDuragi.baslama)}` : ''}`}>
                <span className="tc-sevkiyat-durak-no">{durakNo}<i>{oge.alis ? '↑' : '↓'}</i></span>
                <span className="tc-sevkiyat-durak-adi">
                  {ad}
                  <em>{ayrinti}</em>
                  {onaySaati && hesapDuragi && Math.abs(onaySaati.varis - hesapDuragi.varis) >= 1 && <em>güncel hesapla varış {saatMetni(hesapDuragi.varis)} (tanımlar onaydan sonra değişti)</em>}
                  {hesapDuragi?.uyarilar.map((u) => <strong key={u} className="tc-sevkiyat-uyari">{u}</strong>)}
                </span>
                <time title={onaySaati ? 'Onayda kaydedilen varış' : 'Tahmini varış'}>{onaySaati ? saatMetni(onaySaati.varis) : hesapDuragi ? saatMetni(hesapDuragi.baslama) : '--:--'}</time>
                {duzenlenebilir && <AracSecimi isAdi={ad} aracId={arac.id} araclar={araclar} sec={(hedef) => { if (hedef !== arac.id) islem.isiTasi(is.id, hedef); }} />}
                {duzenlenebilir && menu(sira, is, ad)}
                {/* İki uçlu işin sonucu bırakış satırında girilir; alımın tek ucu alıştır. */}
                {sonuclar && (!oge.alis || is.tur === 'alim') && (
                  <DurakSonucu is={is} sonuc={sonuclar.get(is.id)} yazabilir={sonucYazabilir} degistir={(durum) => islem.durumDegistir(is, durum)} />
                )}
              </li>
            );
          })}
          <li className="tc-sevkiyat-fabrika-satiri"><time>{hesap ? saatMetni(hesap.donus) : '--:--'}</time> Fabrikaya dönüş</li>
        </ol>
      ) : duzenlenebilir ? (
        <p className="tc-sevkiyat-ince">Bu araca iş vermek için işin satırındaki “Araç” seçiminden {arac.ad} seçin ya da işi buraya sürükleyin.</p>
      ) : null}
    </section>
  );
}
