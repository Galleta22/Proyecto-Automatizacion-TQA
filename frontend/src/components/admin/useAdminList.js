import { useEffect, useState } from "react";
import { adminRequest } from "./adminApi";

export default function useAdminList(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    adminRequest(path, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(result); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, attempt]);

  return { data, loading, error, retry: () => setAttempt((current) => current + 1) };
}
