"use client";

import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { polygon } from "@reown/appkit/networks";
import type { ReactNode } from "react";

const projectId =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  "6f9068694eb846a3346fdfdc3ed301e7";

createAppKit({
  adapters: [new EthersAdapter()],
  networks: [polygon],
  defaultNetwork: polygon,
  projectId,
  metadata: {
    name: "AyudaPet",
    description: "NFTs con propósito para mascotas en Polygon",
    url: "https://ayudapet-nfts.vercel.app",
    icons: ["https://ayudapet-nfts.vercel.app/logo.png"],
  },
  features: {
    analytics: true,
    email: false,
    socials: [],
  },
  themeMode: "light",
  themeVariables: {
    "--w3m-accent": "#ea784f",
    "--w3m-border-radius-master": "2px",
  },
});

export function AppKitProvider({ children }: { children: ReactNode }) {
  return children;
}
