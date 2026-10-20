import { useState } from 'react';
import type { BakiyeSatiri, SepetCevabi, SepetEkleGovdesi } from '#paylasilan/sozlesme/stok.ts';
import { Dugme, Girdi, Pencere } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { miktarGirdisi, miktarMetni } from './gorunum.ts';
import { korumaliPost, useStokKomutu } from './ortak.tsx';

// Önizlemedeki "Sepete ekle" penceresi: kaynak (en eski giriş ya da belirli göz), miktar ve hızlı adetler.
// `otomatikYok`: okutulan lot gibi kaynak belli olduğunda en eski giriş seçeneği sunulmaz; düşüm seçilen gözden ve lottan olur.
export function SepeteEklePenceresi({ malzemeId, ad, bakiyeler, kaynakKonumId, otomatikYok = false, kapat, eklendi }: { malzemeId: number; ad: string; bakiyeler: BakiyeSatiri[]; kaynakKonumId?: number; otomatikYok?: boolean; kapat: () => void; eklendi?: (c: SepetCevabi, g: SepetEkleGovdesi) => void }) {
  const uygun = bakiyeler.filter((b) => !b.miktar.startsWith('-'));
  const ilk = kaynakKonumId ? uygun.find((b) => b.konumId === kaynakKonumId) : undefined;
  const [kaynak, setKaynak] = useState<string>(String(ilk?.id ?? (otomatikYok ? uygun[0]?.id ?? '' : 'oto')));
  const [miktar, setMiktar] = useState('1');
  const secili = uygun.find((b) => String(b.id) === kaynak);
  const toplam = uygun.reduce((t, b) => t + Number(b.miktar), 0);
  const { komut, onayPenceresi } = useStokKomutu((g: SepetEkleGovdesi) => korumaliPost<SepetCevabi>('/stok/sepet/satir-ekle', g).then((c) => { eklendi?.(c, g); return c; }), `Sepete eklendi: ${ad}`, kapat);
  const gonder = () => komut.mutate({ malzemeId, miktar: miktarGirdisi(miktar), ...(secili ? { kaynakKonumId: secili.konumId, partiId: secili.partiId } : {}) });
  return (
    <Pencere acik kapat={kapat} baslik={`Sepete ekle: ${ad}`} tur="yan" alt={<Dugme tur="birincil" yukleniyor={komut.isPending} disabled={otomatikYok && !secili} onClick={gonder}>Sepete ekle</Dugme>}>
      <div className="tc-stok-form">
        <fieldset className="tc-stok-kaynaklar">
          <legend>Nereden alınıyor?</legend>
          {!otomatikYok && <label className="tc-stok-kaynak"><input type="radio" name="kaynak" checked={kaynak === 'oto'} onChange={() => setKaynak('oto')} /><strong>Otomatik</strong><span>En eski girişten · depoda {miktarMetni(String(toplam))}</span></label>}
          {otomatikYok && uygun.length === 0 && <p className="tc-stok-bilgi tc-stok-bilgi-uyari">Bu lotun kullanılabilir bakiyesi yok.</p>}
          {uygun.map((b) => (
            <label key={b.id} className="tc-stok-kaynak"><input type="radio" name="kaynak" checked={kaynak === String(b.id)} onChange={() => setKaynak(String(b.id))} />
              <strong className="tc-stok-mono">{b.konumKod}</strong><span>{miktarMetni(b.miktar)}{b.partiEtiketi ? ` · ${b.partiEtiketi}` : ''}</span></label>
          ))}
        </fieldset>
        <Girdi etiket="Miktar" inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} autoFocus />
        <div className="tc-stok-eylem">
          {['1', '5', '10', '25'].map((n) => <Dugme key={n} tur="ikincil" onClick={() => setMiktar(n)}>{n}</Dugme>)}
          <Dugme tur="ikincil" onClick={() => setMiktar(miktarMetni(secili ? secili.miktar : String(toplam)).replace(/\./g, ''))}>Tümü</Dugme>
        </div>
      </div>
      {onayPenceresi}
    </Pencere>
  );
}
