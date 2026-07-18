import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import { AppKitProvider } from "../context/appkit";
import "./globals.css";

const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://ayudapet-nfts.vercel.app"),
  title: "AyudaPet · NFTs con propósito",
  description: "Mascotas que dejan huella, preservadas en Polygon.",
  alternates: { canonical: "/" },
  icons: { icon: "/logo.png", apple: "/logo.png" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: "/",
    siteName: "AyudaPet",
    title: "AyudaPet · NFTs con propósito",
    description: "Mascotas que dejan huella, preservadas en Polygon.",
    images: [
      {
        url: "/ayudapet-nft-pets-pixel.png",
        width: 1448,
        height: 1086,
        alt: "Mascotas NFT de AyudaPet frente a una galería digital",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AyudaPet · NFTs con propósito",
    description: "Mascotas que dejan huella, preservadas en Polygon.",
    images: ["/ayudapet-nft-pets-pixel.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${manrope.variable} ${fraunces.variable}`}><AppKitProvider>{children}</AppKitProvider></body></html>;
}
