import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { secilebilirIstasyonlar } from '../../../../../../arkon/web/src/data/istasyon-sec.ts';
import { isMerkeziBul, istasyonListesi, type IstasyonSatiri } from '../cekirdek/tesis.ts';
import { isMerkezinde } from '../cekirdek/yetki.ts';
import { useArkon, useArkonDurumu } from '../veri/baglam.ts';
import { IS_TURLERI } from './kurallar.ts';

// İş merkezine göre gruplu istasyon seçimi (istasyonlar.ts StationSelect). Listede olmayan kayıt kodla görünür.
export function IstasyonSecimi({ deger, degistir, hepsi, etiket = 'İstasyon', kilitli }: {
  deger: string; degistir: (v: string) => void; hepsi?: boolean; etiket?: string; kilitli?: boolean;
}) {
  const { ayarlar } = useArkon();
  const tesis = ayarlar.tesis;
  const L = istasyonListesi(tesis, hepsi);
  const merkezler = tesis.wcs.filter((w) => L.some((m) => m.wc === w.id));
  const bagimsiz = L.filter((m) => !isMerkeziBul(tesis, m.wc));
  return (
    <select value={deger || ''} aria-label={etiket} disabled={kilitli} onChange={(e) => degistir(e.target.value)}>
      {!L.some((m) => m.id === deger) ? <option value={deger || ''}>{deger ? deger + ' · tanımsız istasyon' : 'İstasyon seç'}</option> : null}
      {merkezler.map((w) => (
        <optgroup key={w.id} label={w.name}>
          {L.filter((m) => m.wc === w.id).map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
        </optgroup>
      ))}
      {bagimsiz.map((m) => <option key={m.id} value={m.id}>{m.id} · {m.name}</option>)}
    </select>
  );
}

interface Grup { wc: string; name: string; list: IstasyonSatiri[] }

// "Hangi istasyonda?" (StationPicker): tabletin istasyonu. İstasyon değiştirme yetkisi olmayan kişi yalnız kendi istasyonlarını görür.
export function IstasyonSecici({ simdiki, sec, kapat }: { simdiki: string; sec: (id: string) => void; kapat: () => void }) {
  const { ayarlar, kisi, yetkiVar, tmiyeGit, git } = useArkon();
  const durum = useArkonDurumu();
  const tamYetki = yetkiVar('prod.station');
  const L = secilebilirIstasyonlar(istasyonListesi(ayarlar.tesis).filter((m) => isMerkezinde(kisi, m.wc)), tamYetki, kisi && kisi.sts);
  const gruplar: Grup[] = [];
  L.forEach((m) => {
    let g = gruplar.find((x) => x.wc === m.wc);
    if (!g) gruplar.push(g = { wc: m.wc, name: m.wcName || 'İş merkezi atanmamış', list: [] });
    g.list.push(m);
  });
  return (
    <Pencere acik kapat={kapat} baslik="Hangi istasyonda?" tur="yan">
      <div className="tc-ay2-istasyon-secici">
        <span className="tc-ay2-ust-yazi">Bu cihaz</span>
        <p className="tc-ay2-soluk">
          İş paketleri istasyona göre gelir; ekran açılan işin türüne göre şekillenir.
          {kisi && kisi.wcs && kisi.wcs.length && kisi.role !== 'admin' ? ' Yalnız yetkili olduğun iş merkezleri gösteriliyor.' : ''}
          {!tamYetki ? ' Yalnız çalışabildiğin istasyonlar gösteriliyor.' : ''}
        </p>
        {!L.length && !tamYetki ? (
          <div className="tc-ay2-bos"><Simge ad="layers" boyut="b" /><b>Size atanmış istasyon yok</b><small className="tc-ay2-soluk">Amirinize bildirin.</small></div>
        ) : null}
        {!L.length && tamYetki ? (
          <div className="tc-ay2-bos">
            <Simge ad="layers" boyut="b" /><b>Tanımlı istasyon yok</b>
            {durum.mode === 'server' ? (
              <>
                <small className="tc-ay2-soluk">İş merkezi, istasyon ve makine TMI'de İstasyonlar sayfasından tanımlanır.</small>
                {yetkiVar('adm.plant') ? <Dugme tur="ikincil" simge="layers" onClick={() => { tmiyeGit('istasyonlar'); kapat(); }}>İstasyonlar sayfasını aç</Dugme> : null}
              </>
            ) : (
              <>
                <small className="tc-ay2-soluk">Yönetici Ayarlar › Tesis yapısı bölümünden iş merkezi ve istasyon eklemeli.</small>
                {yetkiVar('adm.plant') ? <Dugme tur="ikincil" simge="gear" onClick={() => { git('ayarlar'); kapat(); }}>Tesis yapısını aç</Dugme> : null}
              </>
            )}
          </div>
        ) : null}
        {gruplar.map((g) => (
          <div key={g.wc} className="tc-ay2-istasyon-grubu">
            <span className="tc-ay2-ust-yazi">{g.name}{g.wc ? ' · ' + g.wc : ''}</span>
            <div className="tc-ay2-tur-secici">
              {g.list.map((m) => {
                const t = IS_TURLERI[m.t || 'cnc'] || IS_TURLERI.cnc;
                return (
                  <button key={m.id} type="button" aria-pressed={m.id === simdiki} onClick={() => sec(m.id)}>
                    <Simge ad={t.simge} /><b>{m.id}</b>
                    <small>{m.name}{m.mcs.length ? ' · ' + (m.mcs.length === 1 ? m.mcs[0]!.name : m.mcs.length + ' makine') : ''}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Pencere>
  );
}
