import { useState } from 'react';
import type { Pkg } from '../../../../../../arkon/shared/model.ts';
import { Dugme, DurumKutusu, Simge } from '../../../../ortak/arayuz/index.ts';
import { dakikaMetni, gunAySaat } from '../cekirdek/bicim.ts';
import { useArkon } from '../veri/baglam.ts';
import { Cip, gunlugeYaz, onayBekliyor, type Soyle } from '../pano/index.tsx';

// Kalite › Onaylar (bakim-raporlar.ts ApprovalView): hazırlıkta "Kaliteye onaya gönder" denilen paketler. Onaylanan paket yayınlanabilir;
// onaydan sonra değişirse yeniden onay ister. Karar 'pkg.approve' ister; geri gönderme gerekçesizdir olamaz.
export function Onaylar({ paketler, soyle }: { paketler: Record<string, Pkg>; soyle: Soyle }) {
  const { depo, kisi, ayarlar, yetkiVar, saltOkunur, git } = useArkon();
  const [not, notYaz] = useState<Record<string, string>>({});
  const karar = yetkiVar('pkg.approve') && !saltOkunur;
  const simdi = Date.now();
  const liste = Object.values(paketler).filter(onayBekliyor).sort((a, b) => (a.apReq?.at ?? 0) - (b.apReq?.at ?? 0));
  const son = Object.values(paketler).filter((p) => p.approval && simdi - p.approval.at < 7 * 864e5).sort((a, b) => (b.approval?.at ?? 0) - (a.approval?.at ?? 0)).slice(0, 12);

  const karariVer = async (p: Pkg, ok: boolean) => {
    const n0 = (not[p.id] || '').trim();
    if (!ok && !n0) { soyle('Geri gönderme nedeni yaz', 'hata'); return; }
    const cur = ((await depo.DB.get('pkgs', p.id)) as Pkg | undefined) || p;
    const yeni: Pkg = { ...cur, approval: { ok, by: kisi?.name ?? '', at: Math.max(Date.now(), (cur.updatedAt || 0) + 1), note: not[p.id] || '', version: (cur.version || 0) + 1 } };
    await depo.DB.put('pkgs', yeni);
    depo.Bus.send({ type: 'pkg-approved', id: p.id, ok, note: not[p.id] || '' });
    gunlugeYaz(depo, 'paket', ok ? 'kalitece onaylandı' : 'geri gönderildi', p.no, `Rev ${p.rev}${not[p.id] ? ` · ${not[p.id]}` : ''}`);
    soyle(ok ? `${p.no} onaylandı` : `${p.no} geri gönderildi`, ok ? 'tamam' : 'hata');
  };

  return (
    <div className="tc-ay3-sayfa">
      <span className="tc-ay3-ust">Hazırlıkta “Kaliteye onaya gönder” denilen paketler. Onaylanan paket hazırlıkta yayınlanabilir; onaydan sonra değişirse yeniden onay ister.</span>
      {liste.length ? liste.map((p) => (
        <div key={p.id} className="tc-ay3-kutu" aria-label={`${p.no} onay bekliyor`}>
          <div className="tc-ay3-arac">
            <Simge ad="box" />
            <div><b>{p.no} · {p.part}</b><div className="tc-ay3-not">Rev {p.rev} · v{(p.version || 0) + 1} · {p.machine} · {p.op}</div></div>
            <span className="tc-ay3-bosluk" />
            <Cip renk="hold">{dakikaMetni(simdi - (p.apReq?.at ?? simdi))} bekliyor</Cip>
          </div>
          <small className="tc-ay3-not">
            Gönderen {p.apReq?.by} · {gunAySaat(p.apReq?.at)} · {(p.plan || []).length} kontrol noktası · {(p.files || []).length} dosya · {(p.steps || []).length} adım
            {(p.samp || []).length ? ` · ${(p.samp ?? []).length} numune kuralı` : ''}{p.approval && p.approval.ok === false ? ` · önceki geri gönderme: ${p.approval.note ?? ''}` : ''}
          </small>
          <div className="tc-ay3-dugmeler">
            <input className="tc-ay3-girdi" value={not[p.id] || ''} onChange={(o) => notYaz({ ...not, [p.id]: o.target.value })} placeholder="Not (geri gönderirken zorunlu)" aria-label={`${p.no} not`} />
            <Dugme simge="eye" onClick={() => git('onizle', p.id)}>Operatör gözüyle</Dugme>
            {karar && <Dugme tur="tehlike" simge="x" onClick={() => { void karariVer(p, false); }}>Geri gönder</Dugme>}
            {karar && <Dugme tur="birincil" simge="check" onClick={() => { void karariVer(p, true); }}>Onayla</Dugme>}
          </div>
        </div>
      )) : (
        <DurumKutusu durum="bos" mesaj={`Onay bekleyen paket yok. Yayın onayı Ayarlar › Üretim › Çalışma kurallarından açılır${ayarlar.kurallar.approval ? ' (şu an açık)' : ' (şu an kapalı)'}.`} />
      )}
      {son.length > 0 && (
        <details className="tc-ay3-kutu">
          <summary>Son 7 gün kararları · {son.length}</summary>
          {son.map((p) => (
            <div key={p.id} className="tc-ay3-satir" data-renk={p.approval?.ok ? 'run' : 'stop'}>
              <b>{p.approval?.ok ? 'Onay' : 'Geri'} · {p.no}</b>
              <small>{gunAySaat(p.approval?.at)} · {p.approval?.by}{p.approval?.note ? ` · ${p.approval.note}` : ''}</small>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
