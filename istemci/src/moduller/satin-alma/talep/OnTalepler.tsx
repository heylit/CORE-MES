import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FasonOnTalep, OnTalep, PlanOnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, DurumKutusu, Girdi, IsaretKutusu, Kart, Pencere, Rozet, Secim, Simge, useBildirim } from '../../../ortak/arayuz/index.ts';
import { ApiHatasi } from '../../../ortak/veri/api.ts';
import { SURE, anahtarlar, cagri, gunYaz } from './ortak.ts';
import './talep.css';

const NEDENLER: Record<OnTalep['kaynak'], readonly string[]> = {
  fason: ['Atölyede yapılacak, fasona gitmeyecek', 'Başka talepte var', 'Stoktan ya da hazır parçadan karşılanacak', 'Diğer'],
  plan: ['Stokta var, sayım güncel değil', 'Başka talepte ya da siparişte var', 'Plan değişecek', 'Diğer'],
};
const DIGER = 'Diğer';
const GUN_MS = 86_400_000;

// Aciliyet: gereken gün eksi firmanın fason günü bugünü geçtiyse geç kalıyor, iki gün içindeyse bugün açılmalı. Tarihi ya da günü
// bilinmeyende rozet yoktur. Plan ihtiyacında tedarik süresi bilinmez; yalnız gereken gün sayılır.
function aciliyet(gerekenTarih: string | null, gun: number | null, bugun: Date): 'gec' | 'bugun' | null {
  if (gerekenTarih === null || gun === null) return null;
  const kalan = Math.round((new Date(`${gerekenTarih}T00:00:00`).getTime() - bugun.getTime()) / GUN_MS) - gun;
  return kalan < 0 ? 'gec' : kalan <= 2 ? 'bugun' : null;
}
const adimAdi = (o: { opNo: number; adim: string | null }) => `Op ${o.opNo}${o.adim ? ` ${o.adim}` : ''}`;
const anahtar = (o: OnTalep) => (o.kaynak === 'fason' ? `f${o.isEmriId}` : `p${o.malzeme.no}`);
const baslik = (o: OnTalep) => (o.kaynak === 'fason' ? `${o.emirNo} ${adimAdi(o)}` : `${o.malzeme.kod} ${o.malzeme.ad}`);
const sayi = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 4 });

function AciliyetRozeti({ a }: { a: 'gec' | 'bugun' | null }) {
  return a === 'gec' ? <Rozet ton="hata">Geç kalıyor</Rozet> : a === 'bugun' ? <Rozet ton="uyari">Bugün açılmalı</Rozet> : null;
}
function Eylemler({ cevir, yoksay }: { cevir: () => void; yoksay: () => void }) {
  return (
    <div className="sa-ot-eylem">
      <Dugme simge="x" onClick={yoksay}>Yoksay</Dugme>
      <Dugme tur="birincil" simge="check" onClick={cevir}>Talebe çevir</Dugme>
    </div>
  );
}

function PlanSatiri({ o, secili, sec, cevir, yoksay, bugun }: {
  o: PlanOnTalep; secili: boolean; sec: (v: boolean) => void; cevir: () => void; yoksay: () => void; bugun: Date;
}) {
  const h = o.hesap;
  return (
    <li className={`sa-ot${secili ? ' sa-ot-secili' : ''}`}>
      <IsaretKutusu etiket={`${o.malzeme.kod} seç`} checked={secili} onChange={(e) => sec(e.target.checked)} className="sa-ot-sec" />
      <div className="sa-ot-govde">
        <div className="sa-talep-satir-ust">
          <Rozet ton="bilgi" gorunum="cizgi">Plan ihtiyacı</Rozet>
          <b>{o.malzeme.ad || o.malzeme.kod}</b>
          <span className="sa-talep-no">{sayi(o.miktar)} {o.birim}</span>
          <span className="sa-talep-not">gereken {gunYaz(o.gerekenTarih)}</span>
          <AciliyetRozeti a={aciliyet(o.gerekenTarih, 0, bugun)} />
          {o.stokBilinmiyor && <Rozet ton="uyari">Stok kaydı yok</Rozet>}
        </div>
        <div className="sa-ot-bilgi">
          <span><Simge ad="box" boyut="k" /> <span className="sa-talep-no">{o.malzeme.kod}</span></span>
          <span>Kullanan: {o.emirler.slice(0, 3).join(', ')}{o.emirler.length > 3 ? ` +${o.emirler.length - 3}` : ''}</span>
        </div>
        <div className="sa-talep-not">
          Eksik {sayi(h.eksik)}{h.siparis > 0 ? ` − açık sipariş ${sayi(h.siparis)}` : ''}{h.talep > 0 ? ` − açık talep ${sayi(h.talep)}` : ''}
          {h.yoksayilan > 0 ? ` − yoksayılan ${sayi(h.yoksayilan)}` : ''} = {sayi(o.miktar)} {o.birim}
        </div>
      </div>
      <Eylemler cevir={cevir} yoksay={yoksay} />
    </li>
  );
}

function Satir({ o, secili, sec, cevir, yoksay, bugun }: {
  o: FasonOnTalep; secili: boolean; sec: (v: boolean) => void; cevir: () => void; yoksay: () => void; bugun: Date;
}) {
  const a = aciliyet(o.gerekenTarih, o.terminGun, bugun);
  return (
    <li className={`sa-ot${secili ? ' sa-ot-secili' : ''}`}>
      <IsaretKutusu etiket={`${o.emirNo} ${adimAdi(o)} seç`} checked={secili} onChange={(e) => sec(e.target.checked)} className="sa-ot-sec" />
      <div className="sa-ot-govde">
        <div className="sa-talep-satir-ust">
          <Rozet ton="uyari" gorunum="cizgi">Fason adım</Rozet>
          <b>{o.adim ?? `Op ${o.opNo}`}</b>
          <span className="sa-talep-no">{o.miktar.toLocaleString('tr-TR')} {o.birim}</span>
          {o.gerekenTarih && <span className="sa-talep-not">gereken {gunYaz(o.gerekenTarih)}</span>}
          <AciliyetRozeti a={a} />
        </div>
        <div className="sa-ot-bilgi">
          <span><Simge ad="building" boyut="k" /> <span className="sa-talep-no">{o.emirNo}</span> · Op {o.opNo}</span>
          <span>Parça: {o.parca ? `${o.parca.kod} ${o.parca.ad}` : (o.urun ?? '—')}</span>
          <span>Firma: {o.firmaAdi ?? 'rotada yok'}</span>
          {o.terminGun !== null && <span>Firma süresi ~{o.terminGun} gün</span>}
        </div>
      </div>
      <Eylemler cevir={cevir} yoksay={yoksay} />
    </li>
  );
}

// 898 a: sistemin önerdiği ön talepler: rotadaki fason adımlar ve canlı planın malzeme eksiği. Ön talep satın almaya gitmez; "Talebe çevir"
// formu dolu açar, gerekmeyen nedeniyle yoksayılır. Birleştirme yalnız aynı türdendir (fason hizmet, plan malzeme talebi açar).
export function OnTalepler({ cevir }: { cevir: (l: readonly OnTalep[]) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const liste = useQuery({ queryKey: anahtarlar.onTalepler, queryFn: () => cagri.get('/satin-alma-on-talepleri', SURE) });
  const [secili, seciliYaz] = useState<ReadonlySet<string>>(new Set());
  const [yoksayilan, yoksayilanYaz] = useState<OnTalep | null>(null);
  const [neden, nedenYaz] = useState<string>(NEDENLER.fason[0]!);
  const [not, notYaz] = useState('');
  const [hata, hataYaz] = useState<string | null>(null);
  const [bugun] = useState(() => new Date(new Date().toDateString()));
  const yenile = () => void istemci.invalidateQueries({ queryKey: anahtarlar.onTalepler });
  const iletisi = (h: unknown) => (h instanceof ApiHatasi && h.sunucuIletisi ? h.sunucuIletisi : 'Kaydedilemedi; yeniden deneyin.');
  const yoksay = useMutation({
    mutationFn: (g: { o: OnTalep; neden: string }) => cagri.post('/satin-alma-on-talepleri/yoksay', {
      govde: g.o.kaynak === 'fason' ? { kaynak: 'fason', isEmriId: g.o.isEmriId, neden: g.neden } : { kaynak: 'plan', malzemeNo: g.o.malzeme.no, neden: g.neden },
      ...SURE,
    }),
    onSuccess: () => { bildir('tamam', 'Ön talep yoksayıldı.'); yoksayilanYaz(null); yenile(); },
    onError: (h) => hataYaz(iletisi(h)),
  });
  const geriAl = useMutation({
    mutationFn: (id: number) => cagri.post('/satin-alma-on-talepleri/geri-al', { govde: { id }, ...SURE }),
    onSuccess: yenile,
    onError: (h) => bildir('hata', iletisi(h)),
  });
  const ac = (o: OnTalep) => { yoksayilanYaz(o); nedenYaz(NEDENLER[o.kaynak][0]!); notYaz(''); hataYaz(null); };
  const kaydet = () => {
    if (yoksayilan === null) return;
    const metin = (neden === DIGER ? not.trim() : [neden, not.trim()].filter(Boolean).join(': ')).slice(0, 200);
    if (metin === '') { hataYaz('Nedeni yazın.'); return; }
    yoksay.mutate({ o: yoksayilan, neden: metin });
  };

  const ontalepler = liste.data?.onTalepler ?? [];
  const fasonlar = ontalepler.filter((o): o is FasonOnTalep => o.kaynak === 'fason');
  const planlar = ontalepler.filter((o): o is PlanOnTalep => o.kaynak === 'plan');
  const secilenler = ontalepler.filter((o) => secili.has(anahtar(o)));
  const isaretle = (k: string, v: boolean) => seciliYaz((s) => { const y = new Set(s); if (v) y.add(k); else y.delete(k); return y; });
  const karisik = new Set(secilenler.map((o) => o.kaynak)).size > 1;
  const emirler = new Set(secilenler.flatMap((o) => (o.kaynak === 'fason' ? [o.uretimEmriId] : [])));
  const satirOzellikleri = (o: OnTalep) => ({
    bugun, secili: secili.has(anahtar(o)), sec: (v: boolean) => isaretle(anahtar(o), v), cevir: () => cevir([o]), yoksay: () => ac(o),
  });

  return (
    <Kart baslik="Ön talepler">
      <p className="sa-talep-not">
        Ön talep satın almaya gitmez. "Talebe çevir" deyince form dolu açılır; miktarı ve tarihi değiştirip gönderirsiniz. Gerekmeyeni nedeniyle yoksayın.
      </p>
      {liste.isPending ? <DurumKutusu durum="yukleniyor" />
        : liste.isError ? <DurumKutusu durum="hata" mesaj="Ön talepler okunamadı." yenile={() => void liste.refetch()} />
          : (
            <>
              <h3 className="sa-ot-grup"><Simge ad="wrench" boyut="k" /> Rotadaki fason adımlar <span className="sa-talep-not">siparişi ve talebi olmayan, firmaya gönderilmemiş</span></h3>
              {fasonlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Bekleyen fason ön talep yok." />
                : <ul className="sa-talep-liste">{fasonlar.map((o) => <Satir key={anahtar(o)} o={o} {...satirOzellikleri(o)} />)}</ul>}
              <h3 className="sa-ot-grup"><Simge ad="box" boyut="k" /> Plan ihtiyacı <span className="sa-talep-not">canlı planın stokla, açık sipariş ve taleple karşılanmayan malzemesi</span></h3>
              {planlar.length === 0 ? <DurumKutusu durum="bos" mesaj="Canlı planda karşılanmayan malzeme yok." />
                : <ul className="sa-talep-liste">{planlar.map((o) => <PlanSatiri key={anahtar(o)} o={o} {...satirOzellikleri(o)} />)}</ul>}
              {secilenler.length > 1 && (
                <div className="sa-ot-serit" role="region" aria-label="Seçili ön talepler">
                  <span>
                    {secilenler.length} ön talep seçildi
                    {karisik ? ' · fason adım ve plan ihtiyacı ayrı talep olur' : emirler.size > 1 ? ' · farklı emirler, talep emre bağlanmaz' : ''}
                  </span>
                  <span className="sa-ot-eylem">
                    <Dugme onClick={() => seciliYaz(new Set())}>Seçimi kaldır</Dugme>
                    <Dugme tur="birincil" simge="layers" disabled={karisik} onClick={() => cevir(secilenler)}>Tek talepte birleştir</Dugme>
                  </span>
                </div>
              )}
              {liste.data.yoksayilanlar.length > 0 && (
                <details className="sa-ot-yoksay">
                  <summary>Yoksayılanlar ({liste.data.yoksayilanlar.length})</summary>
                  <ul className="sa-talep-liste">
                    {liste.data.yoksayilanlar.map((y) => (
                      <li key={y.id} className="sa-ot">
                        <div className="sa-ot-govde">
                          <b>{y.baslik}</b>
                          <span className="sa-talep-not">{y.neden}{y.kisiAdi ? ` · ${y.kisiAdi}` : ''}</span>
                        </div>
                        <div className="sa-ot-eylem">
                          <Dugme simge="rotate" yukleniyor={geriAl.isPending && geriAl.variables === y.id} onClick={() => geriAl.mutate(y.id)}>Geri al</Dugme>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
      <Pencere acik={yoksayilan !== null} kapat={() => yoksayilanYaz(null)} baslik={yoksayilan ? `Yoksay: ${baslik(yoksayilan)}` : 'Yoksay'}
        alt={<>
          <Dugme onClick={() => yoksayilanYaz(null)}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="x" yukleniyor={yoksay.isPending} onClick={kaydet}>Yoksay</Dugme>
        </>}>
        <div className="sa-talep">
          <p className="sa-talep-not">
            Ön talep listeden kalkar, "Yoksayılanlar"da kalır; geri alınabilir.{yoksayilan?.kaynak === 'plan' ? ' İhtiyaç bu miktarı aşarsa artan kısım yeniden düşer.' : ''}
          </p>
          <Secim etiket="Neden" value={neden} onChange={(e) => nedenYaz(e.target.value)}
            secenekler={NEDENLER[yoksayilan?.kaynak ?? 'fason'].map((n) => ({ deger: n, baslik: n }))} />
          <Girdi etiket={neden === DIGER ? 'Neden (zorunlu)' : 'Not'} value={not} maxLength={150} onChange={(e) => notYaz(e.target.value)} />
          {hata && <p className="sa-talep-hata" role="alert">{hata}</p>}
        </div>
      </Pencere>
    </Kart>
  );
}
