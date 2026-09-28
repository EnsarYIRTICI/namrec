/** Türk plakası görünümünde plaka (solda mavi TR şeridi). */
export default function Plaka({ metin }: { metin: string }) {
  return (
    <span className="plaka" aria-label={"Plaka " + metin}>
      <span>{metin}</span>
    </span>
  );
}
