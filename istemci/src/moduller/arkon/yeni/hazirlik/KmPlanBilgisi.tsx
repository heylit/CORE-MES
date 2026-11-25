import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { KM_BOS_NEDENI, kmBagi, otoKaynakOku, type KmKarari } from './km-cizim.ts';
import type { Pkg } from './tipler.ts';

// 3701: paket başında kontrol planının nereden geldiği ya da neden boş olduğu. Yayın geçmişine yazılmaz; kaynak satırı paketin otoKaynak alanındandır.
// Resim listesi (Pakete al) Dokümanlar sekmesindedir; seçim gerektiğinde buradan oraya gidilir ve plan alınınca uyarı kapanır.
interface Ozellikler {
  p: Pkg; karar: KmKarari | null; okunamadi: boolean; yetkisiz: boolean; resimler: () => void; al?: (r: KmResim) => void;
}

const saat = (ms: number | undefined) => (typeof ms === 'number' ? new Date(ms).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export function KmPlanBilgisi({ p, karar, okunamadi, yetkisiz, resimler, al }: Ozellikler) {
  const kaynak = otoKaynakOku(p, 'plan');
  if (kaynak?.kaynak === 'km' && kmBagi(p) !== null) {
    return (
      <p className="tc-ay2-bilgi tc-ay2-km-bilgi" data-ton="run" role="status">
        <Simge ad="check" />
        <span>
          <b>Kontrol planı Kalite Merkezi’nden alındı</b>
          <small>{kaynak.etiket ?? ''}{kaynak.by ? ` · ${kaynak.by}` : ''}{kaynak.at ? ` · ${saat(kaynak.at)}` : ''}. Taslak değişiklik olarak bekler; yayın elle yapılır.</small>
        </span>
      </p>
    );
  }
  if (p.plan.length > 0 || kmBagi(p) !== null || typeof p.malzemeNo !== 'number' || kaynak?.kaynak === 'el') return null;
  if (yetkisiz) {
    return <p className="tc-ay2-bilgi tc-ay2-km-bilgi" data-ton="hold" role="status"><Simge ad="lock" /><span><b>Kontrol planı boş</b><small>Kalite Merkezi’ni okuma yetkin yok; plan elle ya da yetkili biri paketi açınca dolar.</small></span></p>;
  }
  if (okunamadi) {
    return <p className="tc-ay2-bilgi tc-ay2-km-bilgi" data-ton="hold" role="status"><Simge ad="alert" /><span><b>Kontrol planı boş</b><small>Kalite Merkezi okunamadı. Sayfayı yenileyin; paket yeniden açılınca tekrar denenir.</small></span></p>;
  }
  if (karar?.tur === 'oner') {
    const r = karar.adaylar[0]!;
    return (
      <div className="tc-ay2-bilgi tc-ay2-km-bilgi" data-ton="done" role="status">
        <Simge ad="target" />
        <span>
          <b>Kalite Merkezi’nde bu parçanın resmi hazır</b>
          <small>{p.status === 'draft' ? 'Pakette elle eklenmiş resim dosyası var; değiştirilmez, alırsanız Kalite Merkezi resmi yanına eklenir.' : 'Yayındaki paket kendiliğinden değişmez.'} Kontrol planı boş; isterseniz alın, değişiklik yeni sürümle gider.</small>
        </span>
        {al ? <Dugme tur="ikincil" simge="plus" onClick={() => al(r)}>Kalite Merkezi’nden al</Dugme> : null}
      </div>
    );
  }
  if (karar?.tur === 'sec') {
    return (
      <div className="tc-ay2-bilgi tc-ay2-km-bilgi" data-ton="hold" role="alert">
        <Simge ad="alert" />
        <span>
          <b>Kontrol planı için resim seçin</b>
          <small>Bu parçanın balonlu {karar.adaylar.length} etkin resmi var; hangisinin alınacağı kendiliğinden seçilemez.</small>
        </span>
        <Dugme tur="ikincil" simge="target" onClick={resimler}>Resimleri göster</Dugme>
      </div>
    );
  }
  if (karar?.tur === 'bos') {
    return <p className="tc-ay2-bilgi tc-ay2-km-bilgi" data-ton="hold" role="status"><Simge ad="alert" /><span><b>Kontrol planı boş</b><small>{KM_BOS_NEDENI[karar.neden]}</small></span></p>;
  }
  return null;
}
