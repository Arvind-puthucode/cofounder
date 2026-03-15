import { useState, useRef, useEffect, useCallback } from "react";
import { sendMessageStream, type ChatMessage, type PaymentRequest } from "./api";
import {
  hasWalletExtension,
  sendPaymentWithExtension,
  buildManualPaymentPayload,
} from "./wallet";
import "./App.css";

interface SubAgent {
  id: string;
  name: string;
  description: string;
  model: string;
  payment: PaymentRequest;
}

const SUBAGENTS: SubAgent[] = [
  {
    id: "prospect_scout",
    name: "Prospect Scout",
    description: "Discovers relevant startup founders and companies for your outreach pipeline.",
    model: "openclaw:cofounder_prospect_scout",
    payment: { amount: "0", merchant: "0xdce0c3790e59b00ae22a7c62baa931e4b7508462", currency: "BTC" },
  },
  {
    id: "lead_strategist",
    name: "Lead Strategist",
    description: "Evaluates and ranks startup prospects based on product relevance and fit.",
    model: "openclaw:cofounder_lead_strategist",
    payment: { amount: "0", merchant: "0xdce0c3790e59b00ae22a7c62baa931e4b7508462", currency: "BTC" },
  },
  {
    id: "outreach_writer",
    name: "Outreach Writer",
    description: "Generates personalized outreach messages tailored to each prospect.",
    model: "openclaw:cofounder_outreach_writer",
    payment: { amount: "0", merchant: "0xdce0c3790e59b00ae22a7c62baa931e4b7508462", currency: "BTC" },
  },
];

// Payment modal component
function PaymentModal({
  details,
  agentName,
  onApprove,
  onCancel,
}: {
  details: PaymentRequest;
  agentName: string;
  onApprove: (signature: string) => void;
  onCancel: () => void;
}) {
  const [walletInput, setWalletInput] = useState("");
  const [mode, setMode] = useState<"choose" | "manual">("choose");
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasExtension = hasWalletExtension();

  const handleExtension = async () => {
    setSigning(true);
    setError(null);
    try {
      const result = await sendPaymentWithExtension(details);
      onApprove(result.txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setSigning(false);
    }
  };

  const handleManualSubmit = () => {
    const addr = walletInput.trim();
    if (!addr) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      setError("Invalid wallet address. Must be a 0x... address (42 characters).");
      return;
    }
    const payload = buildManualPaymentPayload(addr, details);
    onApprove(payload);
  };

  return (
    <div className="payment-overlay">
      <div className="payment-modal">
        <div className="payment-header">x402 Payment Required</div>
        <div className="payment-details">
          <div className="payment-row">
            <span>Agent</span>
            <span>{agentName}</span>
          </div>
          <div className="payment-row">
            <span>Amount</span>
            <span>{details.amount} {details.currency}</span>
          </div>
          <div className="payment-row">
            <span>Merchant</span>
            <span className="payment-merchant">{details.merchant}</span>
          </div>
        </div>

        {mode === "choose" ? (
          <div className="payment-options">
            <button
              className="payment-option-btn extension"
              onClick={handleExtension}
              disabled={!hasExtension || signing}
            >
              {signing ? "Confirm in wallet..." : `Pay ${details.amount} ${details.currency} via Wallet`}
              {!hasExtension && <span className="payment-hint">No extension detected</span>}
            </button>
            <button
              className="payment-option-btn manual"
              onClick={() => setMode("manual")}
              disabled={signing}
            >
              Enter Wallet Address
            </button>
            <button className="payment-cancel-btn" onClick={onCancel} disabled={signing}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="payment-manual">
            <label htmlFor="wallet-input">Your GOAT Network wallet address</label>
            <input
              id="wallet-input"
              type="text"
              value={walletInput}
              onChange={(e) => { setWalletInput(e.target.value); setError(null); }}
              placeholder="0x..."
              autoFocus
            />
            <div className="payment-manual-actions">
              <button className="payment-cancel-btn" onClick={() => setMode("choose")}>
                Back
              </button>
              <button
                className="payment-option-btn extension"
                onClick={handleManualSubmit}
                disabled={!walletInput.trim()}
              >
                Authorize Payment
              </button>
            </div>
          </div>
        )}

        {error && <div className="payment-error">{error}</div>}
      </div>
    </div>
  );
}

function App() {
  const [selectedAgent, setSelectedAgent] = useState<SubAgent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Payment modal state — stores the pending message while waiting for approval
  const [pendingPayment, setPendingPayment] = useState<{
    message: string;
    resolve: (sig: string | null) => void;
  } | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, paymentStatus]);

  const handlePaymentApprove = (signature: string) => {
    pendingPayment?.resolve(signature);
    setPendingPayment(null);
  };

  const handlePaymentCancel = () => {
    pendingPayment?.resolve(null);
    setPendingPayment(null);
  };

  const handleSend = useCallback(async (text?: string) => {
    if (!selectedAgent) return;
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMsg: ChatMessage = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setPaymentStatus(null);

    // Step 1: Show payment modal and wait for user approval
    setPaymentStatus("Awaiting payment authorization...");

    const signature = await new Promise<string | null>((resolve) => {
      setPendingPayment({ message: msg, resolve });
    });

    if (!signature) {
      // User cancelled payment
      setMessages((prev) => [
        ...prev,
        { role: "system", content: "Payment cancelled. Message not sent." },
      ]);
      setLoading(false);
      setPaymentStatus(null);
      return;
    }

    // Step 2: Payment authorized — send message with tx hash
    const txDisplay = signature.startsWith("0x") && signature.length === 66
      ? `Tx: ${signature.slice(0, 10)}...${signature.slice(-8)}`
      : "Payment authorized.";
    setPaymentStatus(`${txDisplay} — Sending to agent...`);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await sendMessageStream(
        msg,
        messages,
        (token) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = { ...last, content: last.content + token };
            return updated;
          });
        },
        selectedAgent.model,
        signature
      );
      setPaymentStatus("Payment verified on GOAT Network.");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "system", content: `Error: ${errorMessage}` };
        return updated;
      });
    } finally {
      setLoading(false);
      setTimeout(() => setPaymentStatus(null), 3000);
    }
  }, [input, loading, messages, selectedAgent]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = () => {
    setSelectedAgent(null);
    setMessages([]);
    setPaymentStatus(null);
  };

  // Agent picker screen
  if (!selectedAgent) {
    return (
      <div className="app">
        <header className="header">
          <h1>Cofounder Buddy</h1>
        </header>

        <div className="picker-container">
          <div className="picker-welcome">
            <h2>Choose your agent</h2>
            <p>Each agent specializes in a different part of the cofounder workflow. Pick one to get started — payment via x402 goes directly to the agent.</p>
          </div>
          <div className="agent-cards">
            {SUBAGENTS.map((agent) => (
              <button
                key={agent.id}
                className="agent-card"
                onClick={() => setSelectedAgent(agent)}
              >
                <div className="agent-card-name">{agent.name}</div>
                <div className="agent-card-desc">{agent.description}</div>
                <div className="agent-card-model">{agent.model}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Chat screen
  return (
    <div className="app">
      <header className="header">
        <button className="back-btn" onClick={handleBack}>&larr;</button>
        <h1>{selectedAgent.name}</h1>
        <span className="subtitle">{selectedAgent.model}</span>
      </header>

      <div className="chat-container">
        {messages.length === 0 && (
          <div className="empty-state">
            <div className="welcome">
              <h2>{selectedAgent.name}</h2>
              <p>{selectedAgent.description}</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-label">
              {msg.role === "user" ? "You" : msg.role === "assistant" ? selectedAgent.name : "System"}
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {paymentStatus && (
          <div className="message system">
            <div className="message-label">x402 Payment</div>
            <div className="message-content payment-status">{paymentStatus}</div>
          </div>
        )}

        {loading && !pendingPayment && messages[messages.length - 1]?.content === "" && (
          <div className="message system">
            <div className="message-label">Status</div>
            <div className="message-content">Thinking...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${selectedAgent.name}...`}
          rows={3}
          disabled={loading}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>

      {pendingPayment && (
        <PaymentModal
          details={selectedAgent.payment}
          agentName={selectedAgent.name}
          onApprove={handlePaymentApprove}
          onCancel={handlePaymentCancel}
        />
      )}
    </div>
  );
}

export default App;
