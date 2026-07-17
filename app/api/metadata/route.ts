import { NextRequest, NextResponse } from "next/server";

function gatewayUrl(uri: string) {
  if (uri.startsWith("ipfs://")) return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
  if (uri.startsWith("baf")) return `https://ipfs.io/ipfs/${uri}`;
  return uri;
}

export async function GET(request: NextRequest) {
  const uri = request.nextUrl.searchParams.get("uri") || "";
  const target = gatewayUrl(uri);
  if (!target.startsWith("https://")) return NextResponse.json({ error: "URI no permitida" }, { status: 400 });

  try {
    const response = await fetch(target, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return NextResponse.json({ error: "Metadata no disponible" }, { status: 502 });
    const metadata = await response.json() as { name?: unknown; description?: unknown; image?: unknown };
    return NextResponse.json({
      name: typeof metadata.name === "string" ? metadata.name : undefined,
      description: typeof metadata.description === "string" ? metadata.description : undefined,
      image: typeof metadata.image === "string" ? metadata.image : undefined,
    }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } });
  } catch {
    return NextResponse.json({ error: "No se pudo leer la metadata" }, { status: 502 });
  }
}
