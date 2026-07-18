"use client";

import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import { polygon } from "@reown/appkit/networks";
import {
  BrowserProvider,
  Contract,
  type Eip1193Provider,
  formatEther,
  isAddress,
  parseEther,
  toBeHex,
  zeroPadValue,
  ZeroAddress,
} from "ethers";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_CONTRACT_ADDRESS =
  "0x45c0044933dc6E26E671eb99014b507BD21E9B8e";
const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS?.trim() ||
  DEFAULT_CONTRACT_ADDRESS;
const POLYGON_CHAIN_ID = "0x89";
const ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function mintPrice() view returns (uint256)",
  "function adminWallet() view returns (address)",
  "function owner() view returns (address)",
  "function getMisNfts(address) view returns (uint256[])",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "function ROYALTY_BPS() view returns (uint96)",
  "function mintCustomNFT(address,string) payable",
  "function burn(uint256)",
  "function setMintPrice(uint256) payable",
  "function setAdminWallet(address) payable",
];

type NFT = {
  id: string;
  uri: string;
  owner: string;
  name?: string;
  image?: string;
  description?: string;
  txHash?: string;
};

const PET_ATTRIBUTE_PLACEHOLDERS: Record<string, string> = {
  Especie: "Ej. Perro, gato, conejo…",
  Raza: "Ej. Mestizo, Labrador…",
  Color: "Ej. Café y blanco",
  Personalidad: "Ej. Juguetón y cariñoso",
};

function short(address: string) {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";
}
function displayUri(uri: string) {
  return uri.startsWith("ipfs://")
    ? uri.replace("ipfs://", "https://ipfs.io/ipfs/")
    : uri;
}
function friendlyError(error: unknown) {
  const e = error as { shortMessage?: string; message?: string; code?: number };
  if (e?.code === 4001) return "La solicitud fue rechazada en tu wallet.";
  const message =
    e?.shortMessage || e?.message || "Ocurrió un error inesperado.";
  if (message.includes("InvalidURI"))
    return "La URI debe ser ipfs://, comenzar con baf o ser https://";
  if (message.includes("InvalidAmount"))
    return "El monto no coincide con el precio de minteo.";
  if (message.includes("NotAuthorized"))
    return "No tienes permiso para realizar esta acción.";
  return message.length > 160
    ? "La transacción no pudo completarse. Revisa los datos y tu saldo."
    : message;
}

export default function Home() {
  const { open } = useAppKit();
  const { address: connectedAddress } = useAppKitAccount();
  const { chainId: connectedChainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider("eip155");
  const { disconnect: disconnectAppKit } = useDisconnect();
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState("");
  const [mintPrice, setMintPrice] = useState<bigint>(0n);
  const [owner, setOwner] = useState("");
  const [adminWallet, setAdminWallet] = useState("");
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [recipient, setRecipient] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [attributes, setAttributes] = useState([
    { trait_type: "Especie", value: "" },
    { trait_type: "Raza", value: "" },
    { trait_type: "Color", value: "" },
    { trait_type: "Personalidad", value: "" },
  ]);
  const [busy, setBusy] = useState("");
  const [txHash, setTxHash] = useState("");
  const [notice, setNotice] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);
  const [tab, setTab] = useState<"mint" | "collection" | "admin">("mint");
  const isPolygon = chainId.toLowerCase() === POLYGON_CHAIN_ID;
  const isOwner =
    account && owner && account.toLowerCase() === owner.toLowerCase();

  const provider = useMemo(
    () =>
      walletProvider
        ? new BrowserProvider(walletProvider as Eip1193Provider)
        : null,
    [walletProvider, connectedChainId],
  );

  const refresh = useCallback(async (address?: string) => {
    if (!provider) return;
    try {
      const p = provider;
      const network = await p.getNetwork();
      setChainId(`0x${network.chainId.toString(16)}`);
      const contract = new Contract(CONTRACT_ADDRESS, ABI, p);
      const [price, contractOwner, wallet] = await Promise.all([
        contract.mintPrice(),
        contract.owner(),
        contract.adminWallet(),
      ]);
      setMintPrice(price);
      setOwner(contractOwner);
      setAdminWallet(wallet);
      if (address) {
        const ids: bigint[] = await contract.getMisNfts(address);
        const mintHashes = new Map<string, string>();
        if (ids.length) {
          try {
            const transferEvent = contract.interface.getEvent("Transfer");
            const transferTopic = transferEvent?.topicHash;
            if (transferTopic) {
              const latestBlock = await p.getBlockNumber();
              const oldestBlock = Math.max(0, latestBlock - 1_000_000);
              const remaining = new Set(
                ids.map((tokenId) =>
                  zeroPadValue(toBeHex(tokenId), 32).toLowerCase(),
                ),
              );
              let toBlock = latestBlock;
              let blockRange = 45_000;
              while (toBlock >= oldestBlock && remaining.size) {
                const fromBlock = Math.max(oldestBlock, toBlock - blockRange + 1);
                try {
                  const logs = await p.getLogs({
                    address: CONTRACT_ADDRESS,
                    fromBlock,
                    toBlock,
                    topics: [
                      transferTopic,
                      zeroPadValue(ZeroAddress, 32),
                      null,
                      Array.from(remaining),
                    ],
                  });
                  for (const log of logs) {
                    const tokenTopic = log.topics[3]?.toLowerCase();
                    if (!tokenTopic) continue;
                    const tokenId = BigInt(tokenTopic).toString();
                    mintHashes.set(tokenId, log.transactionHash);
                    remaining.delete(tokenTopic);
                  }
                  toBlock = fromBlock - 1;
                } catch {
                  if (blockRange > 9_000) {
                    blockRange = 9_000;
                    continue;
                  }
                  break;
                }
              }
            }
          } catch {
            /* Las cards siguen disponibles aunque el RPC no entregue logs. */
          }
        }
        const items = await Promise.all(
          ids.map(async (id) => {
            try {
              const tokenUri: string = await contract.tokenURI(id);
              const nftOwner: string = await contract.ownerOf(id);
              let nftTxHash = window.localStorage.getItem(
                `ayudapet-mint-${id.toString()}`,
              ) || mintHashes.get(id.toString());
              if (nftTxHash)
                window.localStorage.setItem(
                  `ayudapet-mint-${id.toString()}`,
                  nftTxHash,
                );
              let metadata: {
                name?: string;
                image?: string;
                description?: string;
              } = {};
              try {
                const response = await fetch(
                  `/api/metadata?uri=${encodeURIComponent(tokenUri)}`,
                );
                if (response.ok) metadata = await response.json();
              } catch {
                /* La tarjeta conserva su respaldo visual. */
              }
              return {
                id: id.toString(),
                uri: tokenUri,
                owner: nftOwner,
                txHash: nftTxHash,
                ...metadata,
                image: metadata.image ? displayUri(metadata.image) : undefined,
              };
            } catch {
              return null;
            }
          }),
        );
        setNfts(items.filter(Boolean) as NFT[]);
      }
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    }
  }, [provider]);

  useEffect(() => {
    const nextAccount = connectedAddress || "";
    setAccount(nextAccount);
    if (!nextAccount || !provider) {
      setRecipient("");
      setNfts([]);
      return;
    }
    setRecipient(nextAccount);
    refresh(nextAccount);
  }, [connectedAddress, provider, refresh]);

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreviewUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [uploadFile]);

  async function connect() {
    try {
      setTab("mint");
      await open({ view: "Connect" });
    } catch (e) {
      setNotice({ type: "error", text: friendlyError(e) });
    }
  }
  async function disconnect() {
    await disconnectAppKit({ namespace: "eip155" });
    setAccount("");
    setRecipient("");
    setNfts([]);
    setTxHash("");
    setNotice({ type: "ok", text: "Wallet desconectada." });
  }
  async function switchPolygon() {
    try {
      await switchNetwork(polygon);
    } catch (e) {
      setNotice({ type: "error", text: friendlyError(e) });
    }
  }
  async function signerContract() {
    if (!provider) throw new Error("Conecta tu wallet primero.");
    return new Contract(CONTRACT_ADDRESS, ABI, await provider.getSigner());
  }
  async function mint(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    setTxHash("");
    if (!isAddress(recipient))
      return setNotice({
        type: "error",
        text: "La dirección del destinatario no es válida.",
      });
    try {
      if (!uploadFile || !uploadName.trim())
        throw new Error(
          "Selecciona una imagen o GIF y escribe el nombre de tu mascota.",
        );
      if (attributes.some((attribute) => !attribute.value.trim()))
        throw new Error("Completa los cuatro atributos de tu mascota.");
      setBusy("upload");
      const metadataUri = await uploadNftFiles();
      setBusy("mint");
      const c = await signerContract();
      const tx = await c.mintCustomNFT(recipient, metadataUri, {
        value: mintPrice,
      });
      const receipt = await tx.wait();
      setTxHash(tx.hash);
      const mintedTransfer = receipt?.logs.find((log: { address: string; topics: string[] }) =>
        log.address.toLowerCase() === CONTRACT_ADDRESS.toLowerCase() &&
        log.topics.length === 4 &&
        BigInt(log.topics[1]) === 0n,
      );
      if (mintedTransfer)
        window.localStorage.setItem(
          `ayudapet-mint-${BigInt(mintedTransfer.topics[3]).toString()}`,
          tx.hash,
        );
      setNotice({
        type: "ok",
        text: "¡NFT creado y confirmado en Polygon!",
      });
      await refresh(account);
    } catch (err) {
      setNotice({ type: "error", text: friendlyError(err) });
    } finally {
      setBusy("");
    }
  }
  async function burn(id: string) {
    if (
      !confirm(
        `¿Quemar definitivamente el NFT #${id}? Esta acción no se puede deshacer.`,
      )
    )
      return;
    try {
      setBusy(`burn-${id}`);
      const tx = await (await signerContract()).burn(id);
      await tx.wait();
      setNotice({ type: "ok", text: `NFT #${id} quemado correctamente.` });
      await refresh(account);
    } catch (e) {
      setNotice({ type: "error", text: friendlyError(e) });
    } finally {
      setBusy("");
    }
  }
  async function uploadNftFiles(): Promise<string> {
    if (!account || !provider)
      throw new Error("Conecta tu wallet para autorizar la subida.");
    if (!uploadFile || !uploadName.trim())
      throw new Error(
        "Selecciona una imagen o GIF y escribe el nombre de tu mascota.",
      );
    if (uploadFile.size > 15 * 1024 * 1024)
      throw new Error("El archivo no puede superar 15 MB.");
    const hashBuffer = await crypto.subtle.digest(
      "SHA-256",
      await uploadFile.arrayBuffer(),
    );
    const digest = Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const timestamp = Date.now();
    const message = `AyudaPet Upload\nWallet: ${account.toLowerCase()}\nFile SHA-256: ${digest}\nTimestamp: ${timestamp}`;
    const signature = await (await provider.getSigner()).signMessage(message);
    const authorizationResponse = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: account,
        message,
        signature,
        timestamp,
        digest,
      }),
    });
    const authorizationText = await authorizationResponse.text();
    let authorization: { token?: string; error?: string } = {};
    try {
      authorization = JSON.parse(authorizationText);
    } catch {
      throw new Error(authorizationText || "No se pudo autorizar la subida.");
    }
    if (!authorizationResponse.ok || !authorization.token)
      throw new Error(authorization.error || "No se pudo autorizar la subida.");
    const form = new FormData();
    form.append("image", uploadFile);
    form.append("name", uploadName.trim());
    form.append("description", uploadDescription.trim());
    form.append(
      "attributes",
      JSON.stringify(
        attributes.filter((a) => a.trait_type.trim() && a.value.trim()),
      ),
    );
    const response = await fetch(
      "https://ayudapet.com/api/ayudapet-upload/upload.php",
      {
        method: "POST",
        headers: { "X-Ayudapet-Token": authorization.token },
        body: form,
      },
    );
    const responseText = await response.text();
    let result: { metadata?: string; error?: string } = {};
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(
        response.status === 413
          ? "El servidor rechazó el archivo por tamaño. Usa uno menor a 15 MB."
          : responseText || "HostVerge no devolvió una respuesta válida.",
      );
    }
    if (!response.ok || !result.metadata)
      throw new Error(result.error || "No se pudo subir el NFT.");
    return result.metadata;
  }
  async function adminUpdate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const action = data.get("action");
    try {
      setBusy("admin");
      const c = await signerContract();
      const tx =
        action === "price"
          ? await c.setMintPrice(parseEther(String(data.get("price"))))
          : await c.setAdminWallet(String(data.get("wallet")));
      await tx.wait();
      setNotice({
        type: "ok",
        text: "Configuración actualizada correctamente.",
      });
      await refresh(account);
    } catch (err) {
      setNotice({ type: "error", text: friendlyError(err) });
    } finally {
      setBusy("");
    }
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AyudaPet inicio">
          <img className="brand-logo" src="/logo.png" alt="" />
          <span>AyudaPet</span>
        </a>
        <div className="wallet-area">
          <span className={`network ${isPolygon ? "live" : ""}`}>
            <i />
            {isPolygon ? "Polygon" : "Red incorrecta"}
          </span>
          {account ? (
            <>
              <span className="wallet connected" title={account}>
                <span className="wallet-glyph" aria-hidden="true" />
                {short(account)}
              </span>
              <button className="disconnect-wallet" onClick={disconnect}>
                Desconectar
              </button>
            </>
          ) : (
            <button className="wallet" onClick={connect}>
              <span className="wallet-glyph" aria-hidden="true" />
              Conectar wallet
            </button>
          )}
        </div>
      </header>

      {!account && <>
      <section className="hero" id="top">
        <div className="hero-copy">
          <span className="eyebrow">NFTs con propósito · Polygon</span>
          <h1>
            Convierte su historia en una <em>huella eterna.</em>
          </h1>
          <p>
            Crea un NFT único para tu mascota, conserva su historia en la
            blockchain y mantén vivo su recuerdo para siempre.
          </p>
          <div className="hero-actions">
            <button
              className="primary"
              onClick={connect}
            >
              Crear un NFT <span>→</span>
            </button>
            <a
              href={`https://polygonscan.com/address/${CONTRACT_ADDRESS}`}
              target="_blank"
            >
              Ver contrato ↗
            </a>
          </div>
          <div className="trust">
            <span>✓ Contrato verificado</span>
            <span>✓ Estándar ERC-721</span>
          </div>
        </div>
        <div className="pet-card pixel-cover">
          <img
            className="hero-pets"
            src="/ayudapet-nft-pets-pixel.png"
            alt="Mascotas NFT pixel art esperando entrar a la galería AyudaPet"
          />
          <div className="tag">
            AYUDAPET
            <br />
            <small>ON-CHAIN PETS</small>
          </div>
        </div>
      </section>

      <section className="contract-strip">
        <div>
          <small>CONTRATO</small>
          <a
            href={`https://polygonscan.com/address/${CONTRACT_ADDRESS}`}
            target="_blank"
          >
            {short(CONTRACT_ADDRESS)} ↗
          </a>
        </div>
        <div>
          <small>PRECIO ACTUAL</small>
          <strong>{formatEther(mintPrice)} POL</strong>
        </div>
        <div>
          <small>TUS CREACIONES</small>
          <strong>{nfts.length}</strong>
        </div>
        <div>
          <small>ESTADO</small>
          <strong className="status">● Activo</strong>
        </div>
      </section>
      </>}

      {account && <section className="workspace" id="app">
        <div className="section-head">
          <div>
            <span className="eyebrow">TU ESPACIO</span>
            <h2>Crea, consulta y gestiona</h2>
          </div>
          {!isPolygon && account && (
            <button className="switch" onClick={switchPolygon}>
              Cambiar a Polygon
            </button>
          )}
        </div>
        <nav className="tabs" aria-label="Acciones">
          <button
            className={tab === "mint" ? "active" : ""}
            onClick={() => setTab("mint")}
          >
            Crear NFT
          </button>
          <button
            className={tab === "collection" ? "active" : ""}
            onClick={() => setTab("collection")}
          >
            Mis creaciones <b>{nfts.length}</b>
          </button>
          {isOwner && (
            <button
              className={tab === "admin" ? "active" : ""}
              onClick={() => setTab("admin")}
            >
              Administración
            </button>
          )}
        </nav>
        {notice && (
          <div className={`notice ${notice.type}`} role="status">
            {notice.text}
            <button onClick={() => setNotice(null)}>×</button>
          </div>
        )}
        {txHash && (
          <div className="tx-confirmed" role="status">
            <div>
              <span>MINTEO CONFIRMADO</span>
              <b>La transacción quedó registrada en Polygon</b>
              <code>{txHash}</code>
            </div>
            <a href={`https://polygonscan.com/tx/${txHash}`} target="_blank">
              Ver hash en PolygonScan ↗
            </a>
          </div>
        )}
        {!isPolygon ? (
          <div className="empty">
            <div className="paw">◇</div>
            <h3>Cambia a la red Polygon</h3>
            <p>
              Este contrato vive en Polygon. El cambio de red es rápido y
              seguro.
            </p>
            <button className="primary" onClick={switchPolygon}>
              Cambiar a Polygon
            </button>
          </div>
        ) : tab === "mint" ? (
          <form className="mint-form" onSubmit={mint} noValidate>
            <div className="form-main">
              <label>
                Destinatario <span>Dirección que recibirá el NFT</span>
                <input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                  placeholder="0x…"
                />
              </label>
              <section className="upload-box">
                <div className="upload-title">
                  <div>
                    <b>Publica tu imagen y metadata</b>
                    <small>GIF, PNG, JPG o WEBP · máximo 15 MB</small>
                  </div>
                  <span>REQUERIDO</span>
                </div>
                <div className="upload-fields">
                  <label
                    className={`file-drop ${uploadPreviewUrl ? "selected" : ""}`}
                  >
                    <input
                      type="file"
                      accept="image/gif,image/png,image/jpeg,image/webp"
                      onChange={(e) =>
                        setUploadFile(e.target.files?.[0] || null)
                      }
                    />
                    {uploadPreviewUrl && (
                      <img
                        src={uploadPreviewUrl}
                        alt="Vista previa del archivo seleccionado"
                      />
                    )}
                    <div className="file-caption">
                      <b>
                        {uploadFile
                          ? uploadFile.name
                          : "Seleccionar imagen o GIF"}
                      </b>
                      <small>
                        {uploadFile
                          ? `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB · Clic para cambiar`
                          : "Haz clic para elegir el archivo"}
                      </small>
                    </div>
                  </label>
                  <div>
                    <input
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="Nombre de tu mascota"
                      aria-label="Nombre de tu mascota"
                      maxLength={120}
                    />
                    <textarea
                      value={uploadDescription}
                      onChange={(e) => setUploadDescription(e.target.value)}
                      placeholder="Descripción"
                      maxLength={1000}
                    />
                  </div>
                </div>
                <div className="attribute-head">
                  <b>Datos de tu mascota</b>
                  <small>Completa los 4 campos</small>
                </div>
                {attributes.map((attribute, index) => (
                  <label className="attribute-row" key={attribute.trait_type}>
                    <span>{attribute.trait_type}</span>
                    <input
                      value={attribute.value}
                      onChange={(e) =>
                        setAttributes(
                          attributes.map((a, i) =>
                            i === index ? { ...a, value: e.target.value } : a,
                          ),
                        )
                      }
                      placeholder={PET_ATTRIBUTE_PLACEHOLDERS[attribute.trait_type]}
                      required
                    />
                  </label>
                ))}
                <small className="single-flow-note">
                  La imagen, la metadata y el minteo se procesarán juntos al
                  pulsar el botón principal.
                </small>
              </section>
            </div>
            <aside className="summary">
              <h3>Resumen</h3>
              <p>
                <span>Precio de minteo</span>
                <b>{formatEther(mintPrice)} POL</b>
              </p>
              <p>
                <span>Regalías</span>
                <b>10%</b>
              </p>
              <p>
                <span>Red</span>
                <b>Polygon</b>
              </p>
              <button
                className="primary wide"
                disabled={
                  Boolean(busy) ||
                  !uploadFile ||
                  !uploadName.trim() ||
                  attributes.some((attribute) => !attribute.value.trim())
                }
              >
                {busy === "upload"
                  ? "1/2 Publicando archivos…"
                  : busy === "mint"
                    ? "2/2 Confirmando minteo…"
                    : `Subir y mintear · ${formatEther(mintPrice)} POL`}
              </button>
              <small>
                Un solo flujo: firma de subida y confirmación del minteo.
              </small>
            </aside>
          </form>
        ) : tab === "collection" ? (
          <div>
            {nfts.length === 0 ? (
              <div className="empty compact">
                <div className="paw">✦</div>
                <h3>Aún no has creado NFTs</h3>
                <p>Tu primera historia on-chain aparecerá aquí.</p>
                <button className="primary" onClick={() => setTab("mint")}>
                  Crear mi primer NFT
                </button>
              </div>
            ) : (
              <div className="nft-grid">
                {nfts.map((n) => (
                  <article className="nft" key={n.id}>
                    <div className="nft-art">
                      <span>#{n.id}</span>
                      {n.image ? (
                        <img
                          src={n.image}
                          alt={n.name || `AyudaPet #${n.id}`}
                          loading="lazy"
                        />
                      ) : (
                        <div className="mini-face">•ᴗ•</div>
                      )}
                    </div>
                    <div>
                      <h3>{n.name || `AyudaPet #${n.id}`}</h3>
                      <p title={n.description || n.uri}>
                        {n.description || n.uri}
                      </p>
                      <div className="nft-actions">
                        {n.txHash ? (
                          <a
                            href={`https://polygonscan.com/tx/${n.txHash}`}
                            target="_blank"
                          >
                            Ver hash en PolygonScan ↗
                          </a>
                        ) : (
                          <span>Hash no disponible</span>
                        )}
                        {n.owner.toLowerCase() === account.toLowerCase() && (
                          <button
                            onClick={() => burn(n.id)}
                            disabled={busy === `burn-${n.id}`}
                          >
                            {busy === `burn-${n.id}` ? "…" : "Quemar"}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : (
          <form className="admin" onSubmit={adminUpdate}>
            <div>
              <h3>Precio de minteo</h3>
              <p>Define el importe exacto que pagará cada creador.</p>
              <input
                name="price"
                type="number"
                min="0"
                step="0.0001"
                defaultValue={formatEther(mintPrice)}
              />
              <button
                className="primary"
                name="action"
                value="price"
                disabled={busy === "admin"}
              >
                Actualizar precio
              </button>
            </div>
            <div>
              <h3>Wallet administradora</h3>
              <p>Recibe automáticamente los fondos de cada minteo.</p>
              <input name="wallet" defaultValue={adminWallet} />
              <button
                className="primary"
                name="action"
                value="wallet"
                disabled={busy === "admin"}
              >
                Actualizar wallet
              </button>
            </div>
          </form>
        )}
      </section>}
      <footer className={!account ? "landing-footer" : undefined}>
        <div className="brand">
          <img className="brand-logo" src="/logo.png" alt="" />
          <span>AyudaPet</span>
        </div>
        <p>Historias que dejan huella, preservadas en Polygon.</p>
        <a
          href={`https://polygonscan.com/address/${CONTRACT_ADDRESS}`}
          target="_blank"
        >
          Contrato inteligente ↗
        </a>
      </footer>
    </main>
  );
}
