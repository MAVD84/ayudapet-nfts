import { NextRequest, NextResponse } from "next/server";
import { getAddress, verifyMessage } from "ethers";

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.AYUDAPET_UPLOAD_SECRET;
    if (!secret)
      return NextResponse.json(
        { error: "Servicio de subida no configurado" },
        { status: 503 },
      );
    const {
      wallet: rawWallet,
      message,
      signature,
      timestamp,
      digest,
    } = (await request.json()) as Record<string, unknown>;
    const wallet = String(rawWallet || "").toLowerCase();
    const signedMessage = String(message || "");
    const signedAt = Number(timestamp);
    const fileDigest = String(digest || "").toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet) || !/^[a-f0-9]{64}$/.test(fileDigest))
      return NextResponse.json(
        { error: "Solicitud inválida" },
        { status: 422 },
      );
    if (!Number.isFinite(signedAt))
      return NextResponse.json(
        { error: "La autorización no es válida" },
        { status: 401 },
      );
    const expected = `AyudaPet Upload\nWallet: ${wallet}\nFile SHA-256: ${fileDigest}\nTimestamp: ${signedAt}`;
    const recovered = getAddress(
      verifyMessage(signedMessage, String(signature || "")),
    ).toLowerCase();
    if (
      signedMessage !== expected ||
      recovered !== getAddress(wallet).toLowerCase()
    )
      return NextResponse.json(
        { error: "Firma de wallet inválida" },
        { status: 401 },
      );
    const encoder = new TextEncoder();
    const payload = base64url(
      encoder.encode(
        JSON.stringify({
          wallet,
          digest: fileDigest,
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ),
    );
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signatureBytes = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(payload)),
    );
    return NextResponse.json(
      { token: `${payload}.${base64url(signatureBytes)}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo autorizar la subida" },
      { status: 500 },
    );
  }
}
