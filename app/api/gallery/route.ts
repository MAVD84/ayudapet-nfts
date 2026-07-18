import { Interface, JsonRpcProvider, type Log } from "ethers";
import { NextResponse } from "next/server";

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() ||
  "0x0a83905002EaD855881a69E16211be9fE63E8709";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  "6f9068694eb846a3346fdfdc3ed301e7";
const RPC_URL = `https://rpc.walletconnect.org/v1/?chainId=eip155:137&projectId=${PROJECT_ID}`;
const NFT_INTERFACE = new Interface([
  "event NFTMinted(address indexed creador,address indexed destinatario,uint256 indexed tokenId,string uri)",
]);

export async function GET() {
  try {
    const provider = new JsonRpcProvider(RPC_URL, 137, { staticNetwork: true });
    const latestBlock = await provider.getBlockNumber();
    const oldestBlock = Math.max(0, latestBlock - 1_000_000);
    const topic = NFT_INTERFACE.getEvent("NFTMinted")?.topicHash;
    if (!topic) throw new Error("Evento NFTMinted no disponible");

    const logs: Log[] = [];
    let toBlock = latestBlock;
    let blockRange = 45_000;
    while (toBlock >= oldestBlock) {
      const fromBlock = Math.max(oldestBlock, toBlock - blockRange + 1);
      try {
        logs.push(
          ...(await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock,
            toBlock,
            topics: [topic],
          })),
        );
        toBlock = fromBlock - 1;
      } catch {
        if (blockRange > 9_000) {
          blockRange = 9_000;
          continue;
        }
        throw new Error("Polygon no permitió consultar los eventos");
      }
    }

    const items = logs
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .slice(0, 24)
      .flatMap((log) => {
        const parsed = NFT_INTERFACE.parseLog(log);
        if (!parsed) return [];
        return [
          {
            id: parsed.args.tokenId.toString(),
            uri: String(parsed.args.uri),
            creator: String(parsed.args.creador),
            recipient: String(parsed.args.destinatario),
            txHash: log.transactionHash,
          },
        ];
      });

    return NextResponse.json(items, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar la galería de Polygon" },
      { status: 502 },
    );
  }
}
