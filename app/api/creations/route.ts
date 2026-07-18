import { Contract, isAddress, JsonRpcProvider } from "ethers";
import { NextRequest, NextResponse } from "next/server";

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() ||
  "0x0a83905002EaD855881a69E16211be9fE63E8709";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  "6f9068694eb846a3346fdfdc3ed301e7";
const RPC_URL = `https://rpc.walletconnect.org/v1/?chainId=eip155:137&projectId=${PROJECT_ID}`;
const ABI = [
  "function mintPrice() view returns (uint256)",
  "function adminWallet() view returns (address)",
  "function owner() view returns (address)",
  "function getMisNfts(address) view returns (uint256[])",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
];

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address") || "";
  if (address && !isAddress(address)) {
    return NextResponse.json({ error: "Wallet no valida" }, { status: 400 });
  }

  try {
    const provider = new JsonRpcProvider(RPC_URL, 137, { staticNetwork: true });
    const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
    const [price, contractOwner, adminWallet, ids] = await Promise.all([
      contract.mintPrice(),
      contract.owner(),
      contract.adminWallet(),
      address ? contract.getMisNfts(address) : Promise.resolve([] as bigint[]),
    ]);
    const nfts = await Promise.all(
      (ids as bigint[]).map(async (id) => {
        const [uri, nftOwner] = await Promise.all([
          contract.tokenURI(id),
          contract.ownerOf(id),
        ]);
        return { id: id.toString(), uri: String(uri), owner: String(nftOwner) };
      }),
    );

    return NextResponse.json(
      {
        mintPrice: price.toString(),
        owner: String(contractOwner),
        adminWallet: String(adminWallet),
        nfts,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudieron consultar tus creaciones" },
      { status: 502 },
    );
  }
}
