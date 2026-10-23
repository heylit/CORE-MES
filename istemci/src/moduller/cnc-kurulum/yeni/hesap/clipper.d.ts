// clipper.js (Angus Johnson, 6.4.2, Boost lisansı; 218 a) yan etkiyle yüklenir ve ClipperLib'i genel nesneye koyar.
// Yalnız prototipin kullandığı yüzey tiplidir.
export interface IntPoint { X: number; Y: number }
export type Path = IntPoint[];
export type Paths = Path[];

export interface ClipperNesnesi {
  AddPaths(yollar: Paths, tur: number, kapali: boolean): boolean;
  Execute(tur: number, sonuc: Paths | PolyTree, konuDolgusu?: number, kesiciDolgusu?: number): boolean;
}
export interface PolyTree { Childs(): unknown[] }
export interface ClipperOffsetNesnesi {
  AddPaths(yollar: Paths, birlesme: number, uc: number): void;
  Execute(sonuc: Paths, fark: number): void;
}

export interface ClipperKutuphanesi {
  version: string;
  Clipper: {
    new (): ClipperNesnesi;
    Area(yol: Path): number;
    Orientation(yol: Path): boolean;
    PointInPolygon(nokta: IntPoint, yol: Path): number;
    GetBounds(yollar: Paths): { left: number; top: number; right: number; bottom: number };
    CleanPolygons(yollar: Paths, uzaklik: number): Paths;
    OpenPathsFromPolyTree(agac: PolyTree): Paths;
  };
  ClipperOffset: new (sivriSinir?: number, yayToleransi?: number) => ClipperOffsetNesnesi;
  Paths: new () => Paths;
  PolyTree: new () => PolyTree;
  PolyType: { ptSubject: number; ptClip: number };
  ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
  PolyFillType: { pftEvenOdd: number; pftNonZero: number; pftPositive: number; pftNegative: number };
  JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
  EndType: { etOpenSquare: number; etOpenRound: number; etOpenButt: number; etClosedLine: number; etClosedPolygon: number };
}
