import OpenAI from "openai";

const GATEWAY_TOKEN = import.meta.env.VITE_GATEWAY_TOKEN;

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PaymentRequest {
  amount: string;
  merchant: string;
  currency: string;
}

const client = new OpenAI({
  baseURL: `${window.location.origin}/v1`,
  apiKey: GATEWAY_TOKEN,
  dangerouslyAllowBrowser: true,
});

/**
 * Sends a message with a pre-authorized payment signature.
 * The signature must be obtained BEFORE calling this function.
 */
export async function sendMessageStream(
  userMessage: string,
  conversationHistory: ChatMessage[],
  onToken: (token: string) => void,
  model: string = "openclaw:main",
  paymentSignature?: string
): Promise<void> {
  const messages = [
    ...conversationHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userMessage },
  ];

  const extraHeaders: Record<string, string> = {};
  if (paymentSignature) {
    extraHeaders["PAYMENT-SIGNATURE"] = paymentSignature;
  }

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
  }, {
    headers: extraHeaders,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) {
      onToken(content);
    }
  }
}
