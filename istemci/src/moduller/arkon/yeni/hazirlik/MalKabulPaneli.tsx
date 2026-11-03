import { TerminalMalKabul } from '../../../stok/disari.ts';

// 2013 a, 2027: depo istasyonunda mal kabulün kaydı Stok'undur; terminal yalnız Stok'un bileşenini yerleştirir, iş kaydına (sr) yazmaz.
// Çarktaki "Bekleyen kabuller" bağlantısı Operator.tsx ile 2026'da gelir.
export function MalKabulPaneli() {
  return (
    <div className="tc-ay2-panel tc-ay2-depo">
      <TerminalMalKabul />
    </div>
  );
}
