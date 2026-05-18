import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { sendsApi } from "../../api/sends";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

interface Props {
  slug: string;
  privacy: string;
}

export function SendPanel({ slug, privacy }: Props) {
  const { toast } = useToast();
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");

  const send = useMutation({
    mutationFn: () =>
      sendsApi.send({ doc_slug: slug, handle_or_email: recipient, message: message || undefined }),
    onSuccess: (data) => {
      toast(`Sent to @${data.sent_to.handle}`, "success");
      setRecipient("");
      setMessage("");
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  if (privacy === "private") {
    return (
      <p style={{ fontSize: 13, color: "#555568", textAlign: "center", padding: "12px 0" }}>
        Private documents cannot be sent to other users.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input
        label="Recipient"
        placeholder="Handle or email address"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && recipient && send.mutate()}
      />
      <div>
        <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#8A8AA2", marginBottom: 6 }}>
          Message <span style={{ color: "#555568", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Add a note..."
          className="pp-input"
          style={{ height: "auto", padding: "10px 12px", resize: "vertical" }}
        />
      </div>
      <Button
        onClick={() => send.mutate()}
        loading={send.isPending}
        disabled={!recipient.trim()}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M11.5 1.5L1.5 5.5l4 2 2 4 4-10z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          <path d="M5.5 7.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Send
      </Button>
    </div>
  );
}
