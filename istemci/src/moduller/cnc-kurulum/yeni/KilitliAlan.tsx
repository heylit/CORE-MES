import { KilitliDeger, YETKI_ADI } from '../../../ortak/arayuz/index.ts';

// 3401-1 a: maliyet görmeyen kişide para girdisinin yerinde etiket ve ortak kilit durur; alan değeri ekrana hiç gelmez.
export function KilitliAlan({ etiket }: { etiket: string }) {
  return (
    <div className="tc-alan">
      <span className="tc-alan-etiket">{etiket}</span>
      <KilitliDeger yetki={YETKI_ADI.maliyet} />
    </div>
  );
}
