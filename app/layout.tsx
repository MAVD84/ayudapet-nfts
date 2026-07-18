import type { Metadata } from "next";
import { Manrope, Fraunces } from "next/font/google";
import { AppKitProvider } from "../context/appkit";
import "./globals.css";

const manrope = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://ayudapet-polygon.sites.openai.com"),
  title: "AyudaPet · NFTs con propósito",
  description: "Crea y gestiona recuerdos únicos de tu mascota en la red Polygon.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
  openGraph: { title: "AyudaPet · NFTs con propósito", description: "Historias que dejan huella, preservadas en Polygon.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "AyudaPet · NFTs con propósito", description: "Historias que dejan huella, preservadas en Polygon.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body className={`${manrope.variable} ${fraunces.variable}`}><AppKitProvider>{children}</AppKitProvider></body></html>;
}
