function appPublicUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  if (configured.startsWith("https://") && !configured.includes("localhost")) {
    return configured;
  }
  return "https://zenit-jomar.vercel.app";
}

export function officialPlanoUrl(): string {
  return `${appPublicUrl()}/media/plano-zenit.png`;
}

const DEVELOPMENT_PHOTOS: { file: string; caption: string }[] = [
  { file: "03-vista-mar.jpg", caption: "Foto" },
  { file: "01-acceso.jpg", caption: "Foto" },
  { file: "02-aerea-lotes.jpg", caption: "Foto" },
  { file: "06-luz-agua-fachada.jpg", caption: "Foto" },
];

export function developmentPhotos(): { url: string; caption: string }[] {
  const base = appPublicUrl();
  return DEVELOPMENT_PHOTOS.map((photo) => ({
    url: `${base}/media/zenit/${photo.file}`,
    caption: photo.caption,
  }));
}

export function normalizeCroquisCode(code?: string | null): string | null {
  if (!code) return null;
  const match = code.toUpperCase().match(/M\s*([1-4])[\s-]*L\s*-?\s*([1-7])/);
  return match ? `M${match[1]}-L${match[2]}` : null;
}

function prettyLotLabel(code: string): string {
  const normalized = normalizeCroquisCode(code) ?? code;
  return normalized.replace("-L", " L-");
}

export function lotLocationHint(code?: string | null): string | null {
  const normalized = normalizeCroquisCode(code);
  if (!normalized) return null;
  const match = normalized.match(/^M([1-4])-L([1-7])$/);
  if (!match) return null;

  const manzana = match[1];
  const place =
    manzana === "1"
      ? "abajo a la derecha, junto al acceso de Calle Barranca Honda"
      : manzana === "2"
        ? "arriba a la derecha, junto al acceso de Calle Barranca Honda"
        : manzana === "3"
          ? "abajo a la izquierda, del lado del área de alberca"
          : "arriba a la izquierda, del lado del área de alberca";

  return `El ${prettyLotLabel(normalized)} está en la manzana ${manzana}, ${place}.`;
}
