import { NextResponse } from "next/server";

const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=polygon-ecosystem-token&vs_currencies=mxn&include_last_updated_at=true";

export async function GET() {
  try {
    const response = await fetch(PRICE_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Cotización no disponible");
    const data = (await response.json()) as {
      "polygon-ecosystem-token"?: {
        mxn?: number;
        last_updated_at?: number;
      };
    };
    const price = data["polygon-ecosystem-token"]?.mxn;
    if (typeof price !== "number") throw new Error("Cotización inválida");

    return NextResponse.json(
      {
        mxn: price,
        updatedAt:
          data["polygon-ecosystem-token"]?.last_updated_at || null,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo obtener el precio de POL" },
      { status: 502 },
    );
  }
}
