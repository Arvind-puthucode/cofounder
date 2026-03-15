import { createWalletClient, custom, parseEther, type WalletClient, type Hash } from "viem";
import { goat } from "viem/chains";

let walletClient: WalletClient | null = null;

async function switchToGoatNetwork(): Promise<void> {
  if (!window.ethereum) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${goat.id.toString(16)}` }],
    });
  } catch (err: unknown) {
    // Chain not added yet — add it
    if ((err as { code?: number })?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: `0x${goat.id.toString(16)}`,
          chainName: goat.name,
          nativeCurrency: goat.nativeCurrency,
          rpcUrls: [goat.rpcUrls.default.http[0]],
          blockExplorerUrls: goat.blockExplorers
            ? [goat.blockExplorers.default.url]
            : [],
        }],
      });
    } else {
      throw err;
    }
  }
}

export async function getWalletClient(): Promise<WalletClient> {
  if (walletClient) return walletClient;

  if (!window.ethereum) {
    throw new Error("No wallet detected. Please install MetaMask or a compatible wallet.");
  }

  await window.ethereum.request({ method: "eth_requestAccounts" });
  await switchToGoatNetwork();

  walletClient = createWalletClient({
    chain: goat,
    transport: custom(window.ethereum),
  });

  return walletClient;
}

export function hasWalletExtension(): boolean {
  return !!window.ethereum;
}

export interface PaymentResult {
  txHash: Hash;
  from: string;
}

export async function sendPaymentWithExtension(paymentDetails: {
  amount: string;
  merchant: string;
  currency: string;
}): Promise<PaymentResult> {
  // Reset cached client to force chain switch check each time
  walletClient = null;
  const client = await getWalletClient();
  const [account] = await client.getAddresses();

  const txHash = await client.sendTransaction({
    account,
    to: paymentDetails.merchant as `0x${string}`,
    value: parseEther(paymentDetails.amount),
    chain: goat,
  });

  return { txHash, from: account };
}

export function buildManualPaymentPayload(
  walletAddress: string,
  paymentDetails: {
    amount: string;
    merchant: string;
    currency: string;
  }
): string {
  return JSON.stringify({
    wallet: walletAddress,
    amount: paymentDetails.amount,
    merchant: paymentDetails.merchant,
    currency: paymentDetails.currency,
    timestamp: Date.now(),
  });
}
