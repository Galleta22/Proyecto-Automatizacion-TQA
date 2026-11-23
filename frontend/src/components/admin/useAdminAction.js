import { useRef, useState } from "react";

export default function useAdminAction() {
  const locked = useRef(false);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  const run = async (label, request) => {
    if (locked.current) return;
    locked.current = true;
    setPending(label);
    setError("");
    try {
      await request();
    } catch (failure) {
      setError(failure.message || "No se pudo completar la acción.");
    } finally {
      locked.current = false;
      setPending("");
    }
  };

  return { pending, error, run };
}

export function AdminActionStatus({ action }) {
  return <>
    {action.pending && <p role="status">{action.pending}</p>}
    {action.error && <p className="error-message" role="alert">{action.error}</p>}
  </>;
}
