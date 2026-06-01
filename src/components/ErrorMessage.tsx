import { useEffect, useRef } from "react";
import { toUserErrorMessage } from "../api/client";
import { useToast } from "./ToastProvider";

export function ErrorMessage({ message }: { message?: string }) {
  const { notify } = useToast();
  const lastMessageRef = useRef("");

  useEffect(() => {
    if (!message) {
      lastMessageRef.current = "";
      return;
    }
    const safeMessage = toUserErrorMessage(message);
    if (safeMessage === lastMessageRef.current) return;
    lastMessageRef.current = safeMessage;
    notify(safeMessage);
  }, [message, notify]);

  return null;
}
