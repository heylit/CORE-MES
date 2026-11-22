import { useState } from 'react';
import type { PlanSistemAyariSatiri } from '#paylasilan/sozlesme/plan.ts';
import { Dugme, IsaretKutusu, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { ApiHatasi, api, hataIletisi } from '../../../../ortak/veri/api.ts';
import { SISTEM_KAPILARI, SISTEM_UYARILARI, sistemDegeri, sistemYazabilir, zamanYazisi } from './bolumler.ts';

// Sistem bölümü (3561; 3557 c, 3560): yalnız bu beş plan. ayarı. Her ayar kendi Kaydet düğmesiyle, okunan değer `beklenen` olarak yazılır; arada
// başkası değiştirdiyse sunucu 409 der ve güncel değer yeniden okunur. Kapıyı sunucu anahtar başına denetler; burada yalnız pasif yapılır.
type Deger = boolean | number | string;

export function SistemBolumu({ satirlar, islemVar, degisti, yenile }: {
  satirlar: readonly PlanSistemAyariSatiri[]; islemVar: (i: string) => boolean; degisti: (s: PlanSistemAyariSatiri) => void; yenile: () => void;
}) {
  return (
    <div className="tc-pya-alanlar">
      {satirlar.map((s) => <SistemAlani key={`${s.ayar.anahtar}-${String(s.ayar.deger)}`} s={s} yazabilir={sistemYazabilir(s.ayar.anahtar, islemVar)} degisti={degisti} yenile={yenile} />)}
    </div>
  );
}

function SistemAlani({ s, yazabilir, degisti, yenile }: { s: PlanSistemAyariSatiri; yazabilir: boolean; degisti: (s: PlanSistemAyariSatiri) => void; yenile: () => void }) {
  const { bildir } = useBildirim();
  const a = s.ayar;
  const [v, setV] = useState<string>(a.deger === null ? '' : String(a.deger));
  const [yaziyor, setYaziyor] = useState(false);
  const id = `tc-pya-sistem-${a.anahtar}`;
  const sayi = a.tur === 'sayi' ? Number(v.replace(',', '.')) : null;
  const sinirDisi = a.tur === 'sayi' && (v.trim() === '' || !Number.isFinite(sayi) || sayi! < a.enAz || sayi! > a.enCok);
  const yeni: Deger | null = a.tur === 'boolean' ? v === 'true' : a.tur === 'sayi' ? (sinirDisi ? null : sayi) : v;
  const degisen = yeni !== null && yeni !== a.deger;
  const kaydet = async (): Promise<void> => {
    if (yeni === null || a.deger === null) return;
    setYaziyor(true);
    try {
      const c = await api.post<PlanSistemAyariSatiri>(`/plan/sistem-ayarlari/${a.anahtar}/degistir`, { deger: yeni, beklenen: a.deger });
      bildir('tamam', `${a.baslik}: kaydedildi.`);
      degisti(c);
    } catch (h) {
      bildir('hata', hataIletisi(h, `${a.baslik} kaydedilemedi.`));
      if (h instanceof ApiHatasi && h.durum === 409) yenile();
    } finally { setYaziyor(false); }
  };
  const kapi = SISTEM_KAPILARI[a.anahtar];
  const ipucu = `${a.aciklama}${SISTEM_UYARILARI[a.anahtar] ? ` ${SISTEM_UYARILARI[a.anahtar]}` : ''}`;
  const son = s.guncelleyen === null ? 'Henüz değiştirilmedi (varsayılan).' : `Son değiştiren: ${s.guncelleyen}, ${zamanYazisi(s.zaman)}.`;
  if (!yazabilir) {
    return (
      <div className="tc-pya-alan tc-pya-salt-alan">
        <b id={id}>{a.baslik}</b>
        <span>{sistemDegeri(a)}</span>
        <small>{ipucu}</small>
        <small>{son}</small>
        <small className="tc-pya-kilit">Bu ayarı {kapi?.kim ?? 'yetkili kişi'} değiştirir.</small>
      </div>
    );
  }
  return (
    <div className="tc-pya-alan">
      {a.tur === 'boolean' ? (
        <IsaretKutusu etiket={a.baslik} checked={v === 'true'} disabled={yaziyor} onChange={(ev) => { setV(String(ev.target.checked)); }} />
      ) : (
        <>
          <label htmlFor={id}>{a.baslik}</label>
          {a.tur === 'secim' ? (
            <select id={id} className="tc-alan-kutu" aria-describedby={`${id}-ipucu`} value={v} disabled={yaziyor} onChange={(ev) => { setV(ev.target.value); }}>
              {a.secenekler.map((x) => <option key={x.deger} value={x.deger}>{x.etiket}</option>)}
            </select>
          ) : (
            <input id={id} className="tc-alan-kutu" type="number" inputMode="numeric" min={a.tur === 'sayi' ? a.enAz : undefined} max={a.tur === 'sayi' ? a.enCok : undefined} value={v} disabled={yaziyor}
              aria-invalid={sinirDisi ? true : undefined} aria-describedby={`${id}-ipucu`} onChange={(ev) => { setV(ev.target.value); }} />
          )}
        </>
      )}
      <small id={`${id}-ipucu`} className={sinirDisi ? 'tc-pya-hata' : undefined} role={sinirDisi ? 'alert' : undefined}>
        {sinirDisi && a.tur === 'sayi' ? `${String(a.enAz)} ile ${String(a.enCok)} arasında olmalı.` : ipucu}
      </small>
      <small>{son}</small>
      <div className="tc-pya-dugmeler">
        <Dugme tur="ikincil" simge="check" disabled={!degisen || yaziyor || a.deger === null} yukleniyor={yaziyor} onClick={() => { void kaydet(); }}>{yaziyor ? 'Kaydediliyor' : 'Kaydet'}</Dugme>
      </div>
    </div>
  );
}
