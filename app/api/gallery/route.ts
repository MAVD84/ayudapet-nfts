import { Interface, JsonRpcProvider, type Log } from "ethers";
import { NextResponse } from "next/server";

const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() ||
  "0x0a83905002EaD855881a69E16211be9fE63E8709";
const PROJECT_ID =
  process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ||
  "6f9068694eb846a3346fdfdc3ed301e7";
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY?.trim();
const RPC_URL = `https://rpc.walletconnect.org/v1/?chainId=eip155:137&projectId=${PROJECT_ID}`;
const DEPLOYMENT_BLOCK = Number(
  process.env.CONTRACT_DEPLOYMENT_BLOCK || "90434547",
);
const NFT_INTERFACE = new Interface([
  "event NFTMinted(address indexed creador,address indexed destinatario,uint256 indexed tokenId,string uri)",
]);

export async function GET() {
  try {
    if (ALCHEMY_API_KEY) {
      try {
      const url = new URL(
        `https://polygon-mainnet.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForContract`,
      );
      url.searchParams.set("contractAddress", CONTRACT_ADDRESS);
      url.searchParams.set("withMetadata", "true");
      url.searchParams.set("limit", "100");
      url.searchParams.set("tokenUriTimeoutInMs", "2500");
      const [response, transfersResponse] = await Promise.all([
        fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        }),
        fetch(`https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "alchemy_getAssetTransfers",
            params: [
              {
                fromBlock: `0x${DEPLOYMENT_BLOCK.toString(16)}`,
                toBlock: "latest",
                contractAddresses: [CONTRACT_ADDRESS],
                category: ["erc721"],
                withMetadata: false,
                excludeZeroValue: false,
                order: "desc",
                maxCount: "0x64",
              },
            ],
          }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null),
      ]);
      if (!response.ok) throw new Error("Alchemy NFT API no disponible");
      const data = (await response.json()) as {
        nfts?: Array<{
          tokenId?: string;
          name?: string;
          description?: string;
          tokenUri?: string;
          image?: {
            thumbnailUrl?: string;
            cachedUrl?: string;
            originalUrl?: string;
          };
          raw?: { tokenUri?: string };
          mint?: { mintAddress?: string; transactionHash?: string };
          owners?: string[];
        }>;
      };
      const transfersData = transfersResponse?.ok
        ? ((await transfersResponse.json()) as {
            result?: {
              transfers?: Array<{
                hash?: string;
                from?: string;
                to?: string;
                erc721TokenId?: string;
              }>;
            };
          })
        : undefined;
      const mintTransfers = (transfersData?.result?.transfers || []).filter(
        (transfer) => /^0x0{40}$/i.test(transfer.from || ""),
      );
      const transfersByToken = new Map(
        mintTransfers.map((transfer) => [
          transfer.erc721TokenId
            ? BigInt(transfer.erc721TokenId).toString()
            : "",
          transfer,
        ]),
      );
      const items = (data.nfts || [])
        .map((nft) => {
          const transfer = transfersByToken.get(nft.tokenId || "");
          return {
            id: nft.tokenId || "",
            uri: nft.tokenUri || nft.raw?.tokenUri || "",
            creator: nft.mint?.mintAddress || "",
            recipient: nft.owners?.[0] || transfer?.to || "",
            txHash: nft.mint?.transactionHash || transfer?.hash || "",
            name: nft.name,
            description: nft.description,
            image:
              nft.image?.thumbnailUrl ||
              nft.image?.cachedUrl ||
              nft.image?.originalUrl,
          };
        })
        .filter((nft) => nft.id)
        .sort((a, b) => Number(b.id) - Number(a.id))
        .slice(0, 24);

        return NextResponse.json(items, {
          headers: {
            "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800",
            "X-Ayudapet-Total": String(
              mintTransfers.length || data.nfts?.length || 0,
            ),
            "X-Ayudapet-Source": "alchemy",
          },
        });
      } catch {
        /* Si Alchemy no responde, conserva el lector RPC como respaldo. */
      }
    }

    const provider = new JsonRpcProvider(RPC_URL, 137, { staticNetwork: true });
    const latestBlock = await provider.getBlockNumber();
    const oldestBlock = Math.min(latestBlock, DEPLOYMENT_BLOCK);
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
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        "X-Ayudapet-Total": String(logs.length),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar la galería de Polygon" },
      { status: 502 },
    );
  }
}
