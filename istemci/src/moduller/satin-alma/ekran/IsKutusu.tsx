import type { Aciliyet } from '#paylasilan/sozlesme/pano.ts';
import { DurumKutusu, Kart, SayfaBasligi, SayiKarti, Simge } from '../../../ortak/arayuz/index.ts';
import { IsListesi } from '../../../ortak/arayuz/IsListesi.tsx';
import type { IsSatiri } from '../../../ortak/rota/ana-sayfa.ts';
import type { SimgeAdi } from '../../../ortak/tasarim/simgeler.ts';
import { panoSayilari, teslimBasarimi } from '../merkez/calc.ts';
import { adimdaGun, jobs, type Job } from '../merkez/roles.ts';
import { S } from '../merkez/store.ts';
import { eylemCalistir } from '../merkez/ui.ts';
import { addDays, money, nf0, pct, todayStr } from '../merkez/util.ts';

// İş kutusu (2412-2): önce iş listesi (ana sayfadaki İşlerim ile aynı parça, aciliyete göre), üstte yalnız sıfırdan büyük sayılar.
// Onaydaki karar başkasının adımıdır: listeye girmez, sayı kartında kalır.
const TURLER: Record<string, { baslik: string; simge: SimgeAdi; aciliyet: (j: Job) => Aciliyet }> = {
  order: { baslik: 'Sipariş', simge: 'cart', aciliyet: () => 'bugun' },
  decide: { baslik: 'Karar', simge: 'chart', aciliyet: (j) => (j.ret ? 'bekliyor' : 'bugun') },
  draft: { baslik: 'Teklif iste', simge: 'tag', aciliyet: () => 'bugun' },
  quotes: { baslik: 'Teklif', simge: 'tag', aciliyet: () => 'hafta' },
  delivery: { baslik: 'Teslimat', simge: 'truck', aciliyet: () => 'hafta' },
};
const DERECE: Record<Aciliyet, number> = { gecikmis: 0, bekliyor: 1, bugun: 2, hafta: 3 };
const SIRA = ['order', 'decide', 'draft', 'quotes', 'delivery'];

function satirlar(): IsSatiri[] {
  const g = jobs();
  const out: { s: IsSatiri; tur: number; tarih: string }[] = [];
  SIRA.forEach((k, tur) => {
    const t = TURLER[k]!;
    const kaynak = { anahtar: `satin-alma-${k}`, tur: 'is', baslik: t.baslik, simge: t.simge, sira: tur, kaynak: () => null } as unknown as IsSatiri['kaynak'];
    for (const j of g[k] ?? []) {
      // Gecikme (ihtiyacı geçmiş ya da teslimatı gecikmiş) her türde en öne çıkar: iş kutusunun "flag bad" kuralı.
      const aciliyet: Aciliyet = (j.flag ?? '').includes('flag bad') && !j.ret ? 'gecikmis' : t.aciliyet(j);
      const gun = adimdaGun(j.r);
      const ayrinti = gun === null ? j.info : `${j.info} · ${nf0.format(gun)} gündür bu adımda`;
      const tarih = j.due ?? j.r.needDate ?? '';
      out.push({
        tur, tarih,
        s: {
          kaynak,
          kalem: {
            anahtar: j.r.id, baslik: `${j.r.no} ${j.r.title}`, ayrinti, aciliyet, sonTarih: null,
            yol: `/satin-alma?talep=${encodeURIComponent(j.r.id)}&bolum=${j.tab === 'decision' ? (k === 'delivery' ? 'delivery' : k === 'order' ? 'order' : 'approval') : j.tab}`,
            eylem: j.act, neden: null,
          },
        },
      });
    }
  });
  return out
    .sort((a, b) => DERECE[a.s.kalem.aciliyet] - DERECE[b.s.kalem.aciliyet] || a.tur - b.tur || (a.tarih || '9999').localeCompare(b.tarih || '9999'))
    .map((x) => x.s);
}

export function IsKutusu() {
  const p = panoSayilari();
  const liste = satirlar();
  const bugun = todayStr(), hafta = addDays(bugun, 7);
  const buHafta = (jobs().delivery ?? []).filter((j) => j.due && j.due >= bugun && j.due <= hafta).length;
  const gun = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });
  const alt = `${gun}. ${liste.length ? `${nf0.format(liste.length)} talep işi` : 'Bekleyen talep işi yok'}${buHafta ? `, bu hafta ${nf0.format(buHafta)} teslimat` : ''}.`;
  const kartlar = [
    p.gecikenTeslim > 0 && <SayiKarti key="late" baslik="Geciken teslim" simge="alert" sayi={p.gecikenTeslim} ton="hata" altMetin={`${nf0.format(p.gecikenTalep)} talepte`} yol="/satin-alma/talepler?durum=late" />,
    p.onayBekleyen > 0 && <SayiKarti key="approval" baslik="Onay bekleyen" simge="clipboard-check" sayi={p.onayBekleyen} ton="uyari" altMetin="onaylayanın kararında" yol="/satin-alma/talepler?durum=approval" />,
    p.acikTalep > 0 && <SayiKarti key="open" baslik="Açık talep" simge="list" sayi={p.acikTalep} altMetin="siparişe dönmemiş" yol="/satin-alma/talepler?durum=open" />,
    p.acikSiparis > 0 && <SayiKarti key="ordered" baslik="Açık sipariş" simge="truck" metin={money(p.acikSiparisTutari, 'TRY', 0)} altMetin={`${nf0.format(p.acikSiparis)} sipariş, ${nf0.format(p.acikSiparisTalep)} talepte`} yol="/satin-alma/talepler?durum=ordered" />,
    p.buAyHarcama > 0 && <SayiKarti key="spend" baslik="Bu ay harcama" simge="lira" metin={money(p.buAyHarcama, 'TRY', 0)} altMetin="iskonto ve masraf dahil" yol="/satin-alma/raporlar" />,
  ].filter(Boolean);
  const teslim = teslimBasarimi().slice(0, 6);
  const onayda = (jobs().approval ?? []).length;
  return (
    <div className="sa-ekran">
      <SayfaBasligi baslik="Bugün" simge="cart" alt={alt} />
      {kartlar.length > 0 && <div className="sa-ekran-sayilar" aria-label="Özet">{kartlar}</div>}
      {Object.keys(S.requests).length === 0
        ? <DurumKutusu durum="bos" mesaj="Henüz talep yok. Talepler Taleplerim sayfasından açılır; satın alma burada teklif toplar, karar verir ve sipariş geçer." />
        : <IsListesi satirlar={liste} yolunda={onayda ? [`Onayda ${nf0.format(onayda)} karar`] : []} alinamayan={[]} yukleniyor={false} />}
      <Kart baslik="Tedarikçi teslim başarımı" simge="truck" baslikEki={<span className="sa-ekran-soluk">Teslim alınan siparişlerde termine uyum</span>}>
        {teslim.length === 0
          ? <p className="sa-ekran-not">Henüz teslim alınmış sipariş yok.</p>
          : (
            <ul className="sa-ekran-teslim">
              {teslim.map((t) => (
                <li key={t.supplierId}>
                  <button type="button" className="sa-ekran-satir" onClick={() => { eylemCalistir('open-sup', { id: t.supplierId }); }}>
                    <span className="sa-ekran-govde"><b>{t.ad}</b><small>{nf0.format(t.zamaninda)} / {nf0.format(t.teslim)} teslim zamanında{t.ortGecikme === null ? '' : `, geç gelenler ortalama ${nf0.format(t.ortGecikme)} gün`}</small></span>
                    <span className="sa-ekran-sayi">{pct(t.oran)}</span>
                    <Simge ad="chev-right" boyut="k" />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Kart>
    </div>
  );
}
